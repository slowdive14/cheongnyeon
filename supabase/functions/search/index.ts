// 청년정책 검색 Edge Function (Supabase, Deno).
//  POST { query, topK?, hardCategories?, regionCode? } → { hits: PolicyRow[] }
//
// 역할: 질의 임베딩(서버 Gemini 키, 1536d 정규화) → search_policies RPC(pgvector+키워드) → 후보 반환.
// 안전 경계: 위기 감지(layer-1)·자격 판정은 클라이언트가 수행한다(키 무관 바닥선). 이 함수는 검색만.
// ★지역 인지(blocker 수정): regionCode 있으면 RPC q_region으로 전달 → 양립 불가 정책이 topK quota를
//  잠식하지 않게 후보 선정 단계에서 배제(자격 권위는 여전히 클라 eligibility). 미선택이면 현 동작 동일.
// 키: GEMINI_API_KEY(secret 수동), SUPABASE_URL·SUPABASE_SERVICE_ROLE_KEY(자동 주입).

const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
const SB_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const EMBED_MODEL = 'gemini-embedding-001';
const DIM = 1536;

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*', // 운영 시 Vercel 도메인으로 좁히기 권장
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  });
}

/** L2 정규화(축소 차원 코사인 일관성). 0벡터·비유한 방어. */
function l2(v: number[]): number[] {
  let s = 0;
  for (const x of v) s += Number.isFinite(x) ? x * x : 0;
  const n = Math.sqrt(s);
  if (!n || !Number.isFinite(n)) return v.map(() => 0);
  return v.map((x) => (Number.isFinite(x) ? x / n : 0));
}

/** 질의 임베딩(Gemini REST, 1536d, 정규화). 실패 → null. taskType 미설정(정책 precompute와 동일 공간). */
async function embedQuery(text: string): Promise<number[] | null> {
  if (!GEMINI_KEY) return null;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          content: { parts: [{ text }] },
          outputDimensionality: DIM,
        }),
      },
    );
    if (!res.ok) return null;
    const j = await res.json();
    const values = j?.embedding?.values;
    return Array.isArray(values) ? l2(values) : null;
  } catch {
    return null;
  }
}

/** search_policies RPC 호출(PostgREST, service_role → RLS 우회). */
async function rpcSearch(
  embedding: number[],
  qText: string,
  topK: number,
  hardCategories: string[] | null,
  regionCode: string | null,
): Promise<unknown[]> {
  const res = await fetch(`${SB_URL}/rest/v1/rpc/search_policies`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: SERVICE_KEY,
      authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({
      q_embedding: `[${embedding.join(',')}]`,
      q_text: qText,
      top_k: topK,
      hard_categories: hardCategories,
      // ★지역 인지: null이면 SQL이 지역 무필터(현 동작). 있으면 양립 정책만 후보.
      q_region: regionCode,
    }),
  });
  if (!res.ok) throw new Error(`rpc ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  let payload: { query?: unknown; topK?: unknown; hardCategories?: unknown; regionCode?: unknown };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'invalid json' }, 400);
  }

  const query = typeof payload.query === 'string' ? payload.query.trim() : '';
  if (query.length === 0) return json({ hits: [] });

  const topK = Math.min(Math.max(1, Number(payload.topK) || 10), 30);
  const hardCategories =
    Array.isArray(payload.hardCategories) && payload.hardCategories.length > 0
      ? (payload.hardCategories as string[])
      : null;
  // ★지역 코드: string trim, 비면 null(지역 무필터=현 동작). 배열·객체 등 비문자열도 null 방어.
  const regionCode =
    typeof payload.regionCode === 'string' && payload.regionCode.trim().length > 0
      ? payload.regionCode.trim()
      : null;

  const embedding = await embedQuery(query);
  // 임베딩 실패 → 키워드 폴백은 클라이언트 책임(서버는 빈 결과+degraded 신호).
  if (!embedding) return json({ hits: [], degraded: true });

  try {
    const hits = await rpcSearch(embedding, query, topK, hardCategories, regionCode);
    return json({ hits });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
