import { describe, it, expect, vi } from 'vitest';
import { traverse } from '@/domain/graph/traverse';
import type { TraverseDeps, TraverseState } from '@/domain/graph/traverse';
import { mentalHealthGraph } from '@/domain/graph/domains/mentalHealth';
import type { EmbeddingProvider, IndexedDoc } from '@/retrieval/types';
import type { UserProfile, Policy } from '@/domain/types';
import type { CachedPolicy } from '@/data/cache/types';

/**
 * ★blocker 수정: 검색을 지역 인지(region-aware)로 (traverse 배선).
 *
 * 결함: 원격/인메모리 검색 top-K가 지역을 모르면 타 지자체 정책이 quota를 잠식 → 클라 regionAxis가
 *  전부 REGION_MISMATCH→blocked→숨김 → 지역 입력 시 결과가 사라진다.
 *
 * 수정 계약:
 *  - profile.regionCode가 유효 문자열이면 검색 opts.regionCode로 전달(원격/인메모리 공통).
 *  - 미선택이면 미전달(undefined) → 현재 동작 완전 동일(회귀 0).
 *  - ★보수: 지역 미상(regionCodes 빈 배열) 정책은 후보에서 배제하지 않는다(클라 REGION_UNKNOWN
 *    → '확인 필요' 노출 보존). 자격 권위는 여전히 클라 eligibility(서버/인메모리 필터는 후보 품질용).
 */

const NOW = new Date('2026-06-24T12:00:00Z');

const VEC: Record<string, number[]> = { 주거: [0, 0, 0, 1], 월세: [0.1, 0, 0, 0.95] };
function vecFor(text: string): number[] {
  for (const k of Object.keys(VEC)) if (text.includes(k)) return VEC[k]!;
  return [0, 0, 0, 0];
}
function fixtureEmbed(): EmbeddingProvider {
  return { embed: vi.fn(async (texts: string[]) => texts.map(vecFor)) };
}

// category는 마음건강(mh.entry allowedCategories와 일치) — 이 테스트는 지역 필터만 검증하므로
// 카테고리 하드필터에 걸리지 않게 스코프 정렬. 지역 코드는 policyFor로 주입.
function doc(policyId: string, keywords: string[]): IndexedDoc {
  return { policyId, text: '월세', vector: VEC['월세'] ?? null, category: '마음건강', keywords };
}

// 색인: 부산(26)·울산(31)·전국·미상(빈 코드) 월세 정책.
const INDEX: IndexedDoc[] = [
  doc('부산 청년 월세 지원', ['월세', '주거']),
  doc('울산 청년 월세 지원', ['월세', '주거']),
  doc('대구 청년 월세 지원', ['월세', '주거']),
  doc('전국 청년 월세 지원', ['월세', '주거']),
  doc('지역미상 월세 지원', ['월세', '주거']),
];

function policyFor(id: string, over: Partial<Policy> = {}): CachedPolicy {
  return {
    id,
    title: id,
    summary: null,
    ageMin: 19,
    ageMax: 39,
    income: { kind: 'none', raw: null },
    regionCodes: [],
    regionText: null,
    isNationwide: false,
    recruit: { kind: 'always', start: null, end: null },
    category: '마음건강',
    sourceUrl: 'https://example.com/' + id,
    source: 'ontong',
    fetchedAt: '2026-06-24T00:00:00Z',
    updatedAt: '2026-06-24T00:00:00Z',
    contentHash: 'h-' + id,
    parsed: null,
    ...over,
  };
}

const ALL_POLICIES: CachedPolicy[] = [
  policyFor('부산 청년 월세 지원', { regionCodes: ['26'] }),
  policyFor('울산 청년 월세 지원', { regionCodes: ['31'] }),
  policyFor('대구 청년 월세 지원', { regionCodes: ['27'] }),
  policyFor('전국 청년 월세 지원', { regionCodes: [], isNationwide: true }),
  policyFor('지역미상 월세 지원', { regionCodes: [] }),
];

function deps(extra: Partial<TraverseDeps> = {}): TraverseDeps {
  return {
    embed: fixtureEmbed(),
    crisisDeps: { embed: fixtureEmbed(), crisisAnchors: [], semanticThreshold: 0.82 },
    now: NOW,
    index: INDEX,
    policies: ALL_POLICIES,
    ...extra,
  };
}

function state(regionCode: string | undefined, query = '월세'): TraverseState {
  const profile: UserProfile = { age: 25, region: '부산', regionCode, income: {} };
  return { nodeId: 'mh.entry', query, profile };
}

describe('traverse — 원격 search에 regionCode 전달', () => {
  it('profile.regionCode 있으면 search opts.regionCode 수신', async () => {
    const searchSpy = vi.fn(
      async (_q: string, _opts: { topK: number; hardCategories?: string[]; regionCode?: string }) =>
        [] as Policy[],
    );
    await traverse(mentalHealthGraph, state('26'), deps({ search: searchSpy }));
    expect(searchSpy).toHaveBeenCalled();
    const opts = searchSpy.mock.calls[0]![1];
    expect(opts.regionCode).toBe('26');
  });

  it('profile.regionCode 미선택(undefined)이면 opts.regionCode 미전달(undefined)', async () => {
    const searchSpy = vi.fn(
      async (_q: string, _opts: { topK: number; hardCategories?: string[]; regionCode?: string }) =>
        [] as Policy[],
    );
    await traverse(mentalHealthGraph, state(undefined), deps({ search: searchSpy }));
    expect(searchSpy).toHaveBeenCalled();
    const opts = searchSpy.mock.calls[0]![1];
    expect(opts.regionCode).toBeUndefined();
  });

  it('빈 문자열 regionCode → 미전달(undefined) (방어)', async () => {
    const searchSpy = vi.fn(
      async (_q: string, _opts: { topK: number; hardCategories?: string[]; regionCode?: string }) =>
        [] as Policy[],
    );
    await traverse(mentalHealthGraph, state(''), deps({ search: searchSpy }));
    const opts = searchSpy.mock.calls[0]![1];
    expect(opts.regionCode).toBeUndefined();
  });
});

describe('traverse — 인메모리 degrade 경로 지역 pre-filter (후보 품질)', () => {
  /** 결과에 나온 정책 id 집합(now/soon/blocked/review 전체). */
  function idsOf(result: import('@/domain/eligibility').EvaluateResult | null): Set<string> {
    const ids = new Set<string>();
    if (!result) return ids;
    for (const b of [result.now, result.soon, result.blocked, result.review]) {
      for (const e of b) ids.add(e.policy.id);
    }
    return ids;
  }

  it('regionCode=26 → 타 지역(울산31·대구27) 후보 제외, 부산·전국·미상 보존', async () => {
    // 원격 search 미주입 → 인메모리 hybridSearch 경로. regionCode로 후보 pre-filter.
    const r = await traverse(mentalHealthGraph, state('26'), deps());
    const ids = idsOf(r.result);
    // 부산(일치)·전국·미상은 후보 진입(평가 대상). 타 지역은 제외돼 blocked quota 잠식 없음.
    expect(ids.has('울산 청년 월세 지원')).toBe(false);
    expect(ids.has('대구 청년 월세 지원')).toBe(false);
    // 부산 일치 → PASS(now)로 노출.
    expect(r.result!.now.some((e) => e.policy.id === '부산 청년 월세 지원')).toBe(true);
    // 전국·미상은 보수 보존(전국=now, 미상=review REGION_UNKNOWN — 배제 금지).
    expect(r.result!.now.some((e) => e.policy.id === '전국 청년 월세 지원')).toBe(true);
    expect(r.result!.review.some((e) => e.policy.id === '지역미상 월세 지원')).toBe(true);
  });

  it('regionCode 미선택 → 무필터(현 동작): 전 지역 후보 진입', async () => {
    const r = await traverse(mentalHealthGraph, state(undefined), deps());
    const ids = idsOf(r.result);
    // 미선택이면 지역 pre-filter 없음 — 타 지역도 후보로 들어온다(회귀 0). 클라가 REGION_PROFILE_MISSING로 review.
    expect(ids.has('울산 청년 월세 지원')).toBe(true);
    expect(ids.has('부산 청년 월세 지원')).toBe(true);
  });

  it('regionCode=26이면서 부산 정책이 top-10 밖으로 밀려도 후보 진입(quota 잠식 방지)', async () => {
    // 타 지역 다수(quota 잠식 시나리오): 부산 1건 vs 타 지역 다수. pre-filter로 부산이 살아남아야 함.
    const manyOther: IndexedDoc[] = [];
    const manyPolicies: CachedPolicy[] = [];
    for (let i = 0; i < 12; i += 1) {
      const id = `울산 월세 ${i}`;
      manyOther.push(doc(id, ['월세', '주거']));
      manyPolicies.push(policyFor(id, { regionCodes: ['31'] }));
    }
    const busan = doc('부산 청년 월세 지원', ['월세', '주거']);
    const busanPolicy = policyFor('부산 청년 월세 지원', { regionCodes: ['26'] });
    const r = await traverse(
      mentalHealthGraph,
      state('26'),
      deps({ index: [...manyOther, busan], policies: [...manyPolicies, busanPolicy] }),
    );
    expect(r.result!.now.some((e) => e.policy.id === '부산 청년 월세 지원')).toBe(true);
  });
});
