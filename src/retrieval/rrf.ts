import { RRF_K } from './config';

/**
 * Reciprocal Rank Fusion — 여러 ranked list를 순위 기반으로 융합.
 *
 * score(doc) = Σ_arm 1/(k + rank_arm(doc))  (rank 0-based)
 * 한 arm에만 등장한 문서도 합집합으로 보존(키워드 단독 결과 유실 금지 = degrade 보호).
 *
 * throw-free: 깨진 리스트/항목은 스킵.
 */
export function rrfFuse(rankedLists: string[][], k: number = RRF_K): Map<string, number> {
  const scores = new Map<string, number>();
  const kk = typeof k === 'number' && Number.isFinite(k) && k > 0 ? k : RRF_K;
  if (!Array.isArray(rankedLists)) return scores;

  for (const list of rankedLists) {
    if (!Array.isArray(list)) continue;
    let rank = 0;
    const seen = new Set<string>();
    for (const id of list) {
      if (typeof id !== 'string' || id.length === 0) continue;
      // 같은 리스트 내 중복은 첫 등장 순위만 반영.
      if (seen.has(id)) continue;
      seen.add(id);
      const prev = scores.get(id) ?? 0;
      scores.set(id, prev + 1 / (kk + rank));
      rank += 1;
    }
  }
  return scores;
}
