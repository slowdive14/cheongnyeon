import type { CachedPolicy } from '../data/cache/types';
import type { EmbeddingProvider, IndexedDoc } from './types';

/**
 * 색인 빌드 — CachedPolicy[] → IndexedDoc[].
 *
 * 비대칭 색인(엄수):
 *  - 색인 text = purpose + eligibility (application 제외 — 신청방법은 관련성 신호 아님).
 *  - parsed=null → title/summary 폴백.
 *  - provider 없음/throw → vector=null (키워드 색인은 계속 = degrade 보호).
 *
 * throw-free: 깨진 policy는 스킵.
 * 실 Gemini 임베딩 호출 코드는 작성하지 않는다(provider 주입, Phase 6).
 */

/** 색인 본문 구성. application은 절대 포함하지 않는다. (인제스트 임베딩 precompute에서도 재사용.) */
export function buildText(policy: Pick<CachedPolicy, 'parsed' | 'title' | 'summary'>): string {
  const parts: string[] = [];
  const parsed = policy?.parsed;
  if (parsed && typeof parsed === 'object' && parsed.chunks) {
    const { purpose, eligibility } = parsed.chunks;
    if (typeof purpose === 'string' && purpose.trim()) parts.push(purpose.trim());
    if (typeof eligibility === 'string' && eligibility.trim()) parts.push(eligibility.trim());
  }
  // parsed 없음/청크 비어있음 → title/summary 폴백.
  if (parts.length === 0) {
    if (typeof policy?.title === 'string' && policy.title.trim()) parts.push(policy.title.trim());
    if (typeof policy?.summary === 'string' && policy.summary.trim()) parts.push(policy.summary.trim());
  }
  return parts.join(' ');
}

/** 정책 키워드 추출(폴백 검색용). title 토큰 + category. (인제스트 keywords 저장에서도 재사용.) */
export function buildKeywords(policy: Pick<CachedPolicy, 'title' | 'category'>): string[] {
  const kw = new Set<string>();
  if (typeof policy?.title === 'string') {
    for (const t of policy.title.split(/\s+/)) {
      const tok = t.trim();
      if (tok.length >= 2) kw.add(tok);
    }
  }
  if (typeof policy?.category === 'string' && policy.category.trim()) {
    kw.add(policy.category.trim());
  }
  return [...kw];
}

function isUsablePolicy(p: unknown): p is CachedPolicy {
  if (!p || typeof p !== 'object') return false;
  const o = p as Partial<CachedPolicy>;
  return typeof o.id === 'string' && o.id.length > 0;
}

export async function embed(
  policies: CachedPolicy[],
  deps: { embed?: EmbeddingProvider },
): Promise<IndexedDoc[]> {
  if (!Array.isArray(policies)) return [];

  const usable = policies.filter(isUsablePolicy);
  const docs: IndexedDoc[] = usable.map((p) => ({
    policyId: p.id,
    text: buildText(p),
    vector: null,
    category: typeof p.category === 'string' ? p.category : null,
    keywords: buildKeywords(p),
  }));

  // 벡터 채우기(provider 있을 때만). throw/실패 → vector=null 유지(degrade).
  const provider = deps?.embed;
  if (provider) {
    try {
      const texts = docs.map((d) => d.text);
      const vectors = await provider.embed(texts);
      if (Array.isArray(vectors)) {
        for (let i = 0; i < docs.length; i += 1) {
          const v = vectors[i];
          docs[i]!.vector = Array.isArray(v) ? v : null;
        }
      }
    } catch {
      // 임베딩 실패 흡수 — 키워드 색인은 그대로 사용.
    }
  }

  return docs;
}
