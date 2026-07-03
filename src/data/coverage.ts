import type { Policy } from '../domain/types';
import { SIMILARITY_THRESHOLD, normalizeName, similarity, pairSimilarity } from './similarity';

/**
 * 커버리지 갭 분석 — 온통청년 vs 청년몽땅. 순수(generatedAt:null).
 *
 * 정규화·유사도·임계는 공용 모듈(`./similarity`)을 사용한다 — ingest와 동일 산식(드리프트 제거).
 *  - pairSimilarity == 1 (정규화명+기관 키 완전 동일) → 자동 동일(matched).
 *  - 0.85 ≤ pairSimilarity < 1 → manualReviewCandidates (false merge 금지).
 *  - < 0.85 → 다름(mongttangOnly).
 * 안전: 깨진 항목 throw 금지(C7). gapRate 분모/분자 고정.
 */

// 공용 정규화/유사도 재노출(기존 import 경로 호환 — 테스트·소비자 안정성).
export { normalizeName, similarity };

export interface ManualReviewCandidate {
  ontong: string;
  mongttang: string;
  score: number;
}

export interface CoverageReport {
  totalOntong: number;
  totalMongttang: number;
  matched: number;
  mongttangOnly: string[];
  manualReviewCandidates: ManualReviewCandidate[];
  /** 몽땅 중 온통에 자동 동일이 없는 비율. 분모=totalMongttang. 빈 ontong→1, 빈 mongttang→0. */
  gapRate: number;
  /** 순수 함수이므로 항상 null. 실제 타임스탬프는 scripts(인제스트)가 주입. */
  generatedAt: null;
}

function safeTitle(p: Policy): string {
  return typeof p?.title === 'string' ? p.title : '';
}

/** 기관명: raw.orgName 우선, 없으면 regionText 폴백. */
function orgNameOf(p: Policy): string {
  const raw = p?.raw;
  if (raw && typeof raw === 'object') {
    const o = (raw as Record<string, unknown>).orgName;
    if (typeof o === 'string') return o;
  }
  return typeof p?.regionText === 'string' ? p.regionText : '';
}

/** 정규화 키 = 정규화명 | 정규화기관(빈 키 판별용). */
function keyOf(p: Policy): string {
  return `${normalizeName(safeTitle(p))}|${normalizeName(orgNameOf(p))}`;
}

/**
 * 커버리지 계산. 각 몽땅 정책을 온통 정책들과 대조(공용 pairSimilarity 단일 산식):
 *  - 최고 pairSimilarity == 1 → matched(자동 동일).
 *  - 0.85 ≤ 최고 < 1 → manualReviewCandidate.
 *  - 그 외 → mongttangOnly.
 */
export function computeCoverage(
  ontong: readonly Policy[],
  mongttang: readonly Policy[],
): CoverageReport {
  const safeOntong = (ontong ?? []).filter(isPolicyLike);
  const safeMongttang = (mongttang ?? []).filter(isPolicyLike);

  let matched = 0;
  const mongttangOnly: string[] = [];
  const manualReviewCandidates: ManualReviewCandidate[] = [];

  for (const m of safeMongttang) {
    const mKey = keyOf(m);
    const mTitle = safeTitle(m);
    const mOrg = orgNameOf(m);

    // 최고 쌍 유사도 후보 탐색(빈 키끼리의 == '|' 오매칭은 pairSimilarity가 1로 보지 않음).
    let best: { p: Policy; score: number } | null = null;
    for (const o of safeOntong) {
      const score = pairSimilarity(safeTitle(o), orgNameOf(o), mTitle, mOrg);
      if (best === null || score > best.score) {
        best = { p: o, score };
      }
    }

    if (best !== null && best.score === 1 && mKey !== '|') {
      matched += 1;
    } else if (best !== null && best.score >= SIMILARITY_THRESHOLD && best.score < 1) {
      manualReviewCandidates.push({
        ontong: idOf(best.p),
        mongttang: idOf(m),
        score: best.score,
      });
    } else {
      mongttangOnly.push(idOf(m));
    }
  }

  const totalMongttang = safeMongttang.length;
  const gapRate = totalMongttang === 0 ? 0 : mongttangOnly.length / totalMongttang;

  return {
    totalOntong: safeOntong.length,
    totalMongttang,
    matched,
    mongttangOnly,
    manualReviewCandidates,
    gapRate,
    generatedAt: null,
  };
}

function isPolicyLike(p: unknown): p is Policy {
  return p !== null && typeof p === 'object';
}

function idOf(p: Policy): string {
  return typeof p?.id === 'string' ? p.id : 'unknown';
}
