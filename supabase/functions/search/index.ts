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
const MAX_QUERY_LEN = 500; // 과대 질의 임베딩 비용·남용 방지.

// ★C-C4(b) CORS 화이트리스트: ALLOWED_ORIGINS(콤마구분) 설정 시 그 도메인만 허용.
//  미설정 → '*'(개발). 운영 배포 시 ALLOWED_ORIGINS=https://<vercel-도메인> 설정 필수.
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

// 로컬 개발(localhost/127.0.0.1 임의 포트)도 허용 — 소스 제출 시 심사위원이 `npm run dev`로
// 라이브와 동일한 의미검색을 로컬에서 확인할 수 있게. 운영은 여전히 ALLOWED_ORIGINS 도메인만 허용.
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;

function allowOrigin(origin: string | null): string {
  if (ALLOWED_ORIGINS.length === 0) return '*'; // 개발 기본.
  if (origin && (ALLOWED_ORIGINS.includes(origin) || LOCAL_ORIGIN.test(origin))) return origin;
  return ALLOWED_ORIGINS[0]; // 비허용 origin엔 대표 도메인 반환(요청 origin 미반영 = 차단 효과).
}

function corsHeaders(origin: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': allowOrigin(origin),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

// ★C-C4(c) 레이트리밋: IP 단위 고정창(분당). Gemini 비용 폭탄 방지 1차선.
//  주의: 서버리스 인스턴스별 인메모리 → 다중 인스턴스 완벽 차단은 아님(버스트 억제용).
//  강한 보장이 필요하면 Deno KV·테이블로 하드닝(후속). 0 이하면 비활성.
const RATE_LIMIT_PER_MIN = Number(Deno.env.get('RATE_LIMIT_PER_MIN') ?? '40');
const rlBucket = new Map<string, { count: number; reset: number }>();

function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}

/** true면 한도 초과(429). 창 만료 시 리셋. */
function isRateLimited(ip: string): boolean {
  if (RATE_LIMIT_PER_MIN <= 0) return false;
  const now = Date.now();
  const w = rlBucket.get(ip);
  if (!w || now > w.reset) {
    rlBucket.set(ip, { count: 1, reset: now + 60_000 });
    return false;
  }
  w.count += 1;
  return w.count > RATE_LIMIT_PER_MIN;
}

function json(body: unknown, status = 200, origin: string | null = null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'content-type': 'application/json' },
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

/** RPC 행에서 embedding 제거 — vector(1536)는 건당 ~19KB JSON인데 클라(fromRow)는 미사용.
 *  topK=10 기준 응답 204KB→~11KB(egress 5GB/월 최대 낭비 요인·모바일 지연 제거). */
function stripEmbedding(rows: unknown[]): unknown[] {
  return rows.map((r) => {
    if (r !== null && typeof r === 'object' && !Array.isArray(r)) {
      const { embedding: _omit, ...rest } = r as Record<string, unknown>;
      return rest;
    }
    return r;
  });
}

/** search_policies RPC 호출(PostgREST, service_role → RLS 우회). 응답에서 embedding 제거. */
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
  return Array.isArray(data) ? stripEmbedding(data) : [];
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405, origin);

  // ★C-C4(c) 레이트리밋 — 임베딩(비용) 이전 최우선 게이트.
  if (isRateLimited(clientIp(req))) {
    return json({ error: 'rate limited', hits: [], degraded: true }, 429, origin);
  }

  let payload: { query?: unknown; topK?: unknown; hardCategories?: unknown; regionCode?: unknown };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'invalid json' }, 400, origin);
  }

  const rawQuery = typeof payload.query === 'string' ? payload.query.trim() : '';
  // 과대 질의 절단(임베딩 비용·남용 방지).
  const query = rawQuery.slice(0, MAX_QUERY_LEN);
  if (query.length === 0) return json({ hits: [] }, 200, origin);

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
  if (!embedding) return json({ hits: [], degraded: true }, 200, origin);

  try {
    const hits = await rpcSearch(embedding, query, topK, hardCategories, regionCode);
    return json({ hits }, 200, origin);
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500, origin);
  }
});
