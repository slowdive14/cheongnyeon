import { describe, it, expect, vi } from 'vitest';
import { embed as buildIndex } from '@/retrieval/embed';
import { hybridSearch } from '@/retrieval/hybridSearch';
import type { EmbeddingProvider, IndexedDoc } from '@/retrieval/types';
import type { CachedPolicy } from '@/data/cache/types';
import type { ParseResult } from '@/data/parseChunk';

/**
 * Test 4.2 — 비대칭 색인 + 개념 매칭.
 * 색인 = purpose + eligibility (application 제외). 노드 concept로 검색→관련정책 set.
 */

function parsed(
  purpose: string | null,
  eligibility: string | null,
  application: string | null,
): ParseResult {
  return {
    qualification: {
      householdSeparation: 'UNKNOWN',
      incomeCriterion: { kind: 'UNKNOWN', raw: null },
      duplicateParticipation: 'UNKNOWN',
    },
    chunks: { purpose, eligibility, application },
  };
}

function cached(id: string, parsedResult: ParseResult | null, extra: Partial<CachedPolicy> = {}): CachedPolicy {
  return {
    id,
    title: extra.title ?? `정책 ${id}`,
    summary: extra.summary ?? null,
    ageMin: null,
    ageMax: null,
    income: { kind: 'unknown', raw: null },
    regionCodes: [],
    regionText: null,
    isNationwide: false,
    recruit: { kind: 'unknown', start: null, end: null },
    category: extra.category ?? '마음건강',
    sourceUrl: null,
    source: 'ontong',
    documentsText: null,
    fetchedAt: '2026-06-24T00:00:00Z',
    updatedAt: '2026-06-24T00:00:00Z',
    contentHash: `h-${id}`,
    parsed: parsedResult,
    ...extra,
  };
}

// 의미 벡터 fixture
const VEC: Record<string, number[]> = {
  마음돌봄: [1, 0, 0, 0],
  심리지원: [0.95, 0.31, 0, 0],
  신청서류: [0, 0, 1, 0],
};
function fixtureEmbed(): EmbeddingProvider {
  return { embed: vi.fn(async (texts: string[]) => texts.map((t) => firstKeyVec(t))) };
}
function firstKeyVec(text: string): number[] {
  for (const k of Object.keys(VEC)) {
    if (text.includes(k)) return VEC[k]!;
  }
  return [0, 0, 0, 0];
}

describe('embed (색인 빌드) — 비대칭', () => {
  it('CM-4 색인 text에 application 문자열 미포함', async () => {
    const policies = [
      cached('p1', parsed('마음돌봄 목적', '청년 대상 자격', '신청서류 제출 방법')),
    ];
    const index = await buildIndex(policies, { embed: fixtureEmbed() });
    expect(index).toHaveLength(1);
    expect(index[0]!.text).toContain('마음돌봄');
    expect(index[0]!.text).toContain('자격');
    expect(index[0]!.text).not.toContain('신청서류');
  });

  it('CM-6 parsed=null → title/summary 폴백, throw 없음, vector=null', async () => {
    const policies = [cached('p2', null, { title: '청년 마음 지원', summary: '심리지원 요약' })];
    const index = await buildIndex(policies, { embed: fixtureEmbed() });
    expect(index).toHaveLength(1);
    expect(index[0]!.text.length).toBeGreaterThan(0);
  });

  it('CM-7 부분 결손(깨진 policy 섞임) 방어 — throw 없이 진행', async () => {
    const policies = [
      null,
      cached('ok', parsed('마음돌봄', '자격', null)),
      { id: 'broken' },
    ] as unknown as CachedPolicy[];
    const index = await buildIndex(policies, { embed: fixtureEmbed() });
    expect(index.some((d) => d.policyId === 'ok')).toBe(true);
  });

  it('embed 없음 → vector=null (키워드 색인 계속)', async () => {
    const policies = [cached('p3', parsed('마음돌봄', '자격', null))];
    const index = await buildIndex(policies, {});
    expect(index[0]!.vector).toBeNull();
  });
});

describe('개념 매칭 — application 제외 검색', () => {
  async function makeIndex(): Promise<IndexedDoc[]> {
    const policies = [
      cached('purpose-doc', parsed('마음돌봄 프로그램', '청년 자격', '신청서류 안내')),
    ];
    return buildIndex(policies, { embed: fixtureEmbed() });
  }

  it('CM-1 application 어휘로 검색 → 매칭 안됨(신청방법 색인 제외)', async () => {
    const index = await makeIndex();
    const hits = await hybridSearch('신청서류', index, { embed: fixtureEmbed() }, { topK: 3 });
    // application 어휘는 색인에 없으므로 의미·키워드 매칭 모두 약함 → 후보 없음
    expect(hits.map((h) => h.policyId)).not.toContain('purpose-doc');
  });

  it('CM-2 purpose 어휘로 검색 → 매칭', async () => {
    const index = await makeIndex();
    const hits = await hybridSearch('마음돌봄', index, { embed: fixtureEmbed() }, { topK: 3 });
    expect(hits.map((h) => h.policyId)).toContain('purpose-doc');
  });

  it('CM-3 eligibility 어휘로 검색 → 매칭', async () => {
    const index = await makeIndex();
    const hits = await hybridSearch('자격', index, { embed: fixtureEmbed() }, { topK: 3 });
    expect(hits.map((h) => h.policyId)).toContain('purpose-doc');
  });

  it('CM-5 노드 concept로 검색 → 관련 정책 set (exact 태그 아님)', async () => {
    const policies = [
      cached('a', parsed('마음돌봄 지원', '자격', null)),
      cached('b', parsed('심리지원 상담', '자격', null)),
      cached('c', parsed('주거 임대', '자격', null), { category: '주거' }),
    ];
    const index = await buildIndex(policies, { embed: fixtureEmbed() });
    const hits = await hybridSearch('마음돌봄 심리지원', index, { embed: fixtureEmbed() }, { topK: 3 });
    const ids = hits.map((h) => h.policyId);
    expect(ids).toContain('a');
  });
});
