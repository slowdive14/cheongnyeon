import { describe, it, expect, vi } from 'vitest';
import { hybridSearch } from '@/retrieval/hybridSearch';
import type { IndexedDoc, EmbeddingProvider } from '@/retrieval/types';

/**
 * Test 4.1 — 하이브리드 검색 + degrade.
 * 임베딩 fixture: 텍스트→고정벡터 맵. 패러프레이즈 상호 코사인 ≥0.8.
 * 고유명사("청년수당")는 임베딩 낮고 키워드 정확매칭. 저차원 충분. 코사인은 무의존.
 */

// 4차원 의미 공간(테스트용). 같은 정책군은 같은 축으로 정렬.
const VEC: Record<string, number[]> = {
  // 심리상담 의미군(상호 ≥0.8) — query/doc 공통 축
  '힘들어요': [1, 0, 0, 0],
  '의욕이 안 나요': [0.95, 0.31, 0, 0],
  '멍해요': [0.93, 0.36, 0, 0],
  '번아웃': [0.9, 0.43, 0, 0],
  '심리상담 정책': [0.97, 0.24, 0, 0],
  // 무관 도메인(주거)
  '주거 정책': [0, 0, 1, 0],
  // 고유명사 query는 의미축 약함
  '청년수당': [0, 0, 0, 1],
  '청년수당 정책': [0, 0, 0, 0.9],
};

function fixtureEmbed(): EmbeddingProvider {
  return {
    embed: vi.fn(async (texts: string[]) =>
      texts.map((t) => VEC[t] ?? [0, 0, 0, 0]),
    ),
  };
}

function doc(
  policyId: string,
  text: string,
  vecKey: string | null,
  keywords: string[] = [],
  category: string | null = '마음건강',
): IndexedDoc {
  return {
    policyId,
    text,
    vector: vecKey ? (VEC[vecKey] ?? null) : null,
    category,
    keywords,
  };
}

const PSY_INDEX: IndexedDoc[] = [
  doc('p-psy', '심리상담 정책', '심리상담 정책', ['심리', '상담', '번아웃', '무기력']),
  doc('p-house', '주거 정책', '주거 정책', ['주거', '월세'], '주거'),
  doc('p-cash', '청년수당 정책', '청년수당 정책', ['청년수당', '수당'], '일자리'),
];

describe('hybridSearch — Test 4.1', () => {
  it('H-1 "힘들어요" → 심리상담 정책 top-k', async () => {
    const hits = await hybridSearch('힘들어요', PSY_INDEX, { embed: fixtureEmbed() }, { topK: 3 });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.policyId).toBe('p-psy');
  });

  it('H-2 "의욕이 안 나요"/"멍해요"/"번아웃" 셋다 동일정책 top (Recall@k)', async () => {
    for (const q of ['의욕이 안 나요', '멍해요', '번아웃']) {
      const hits = await hybridSearch(q, PSY_INDEX, { embed: fixtureEmbed() }, { topK: 3 });
      const ids = hits.map((h) => h.policyId);
      expect(ids).toContain('p-psy');
      expect(ids[0]).toBe('p-psy');
    }
  });

  it('H-3 "청년수당" → 키워드 top 상위(고유명사)', async () => {
    const hits = await hybridSearch('청년수당', PSY_INDEX, { embed: fixtureEmbed() }, { topK: 3 });
    expect(hits[0]?.policyId).toBe('p-cash');
  });

  it('H-4 RRF 양 arm 등장 문서 최상위 + 합집합 보존', async () => {
    // B는 embed·keyword 양 arm, A는 embed만, C는 keyword만 → B 최상위, A·C 모두 포함.
    const index: IndexedDoc[] = [
      doc('A', '심리상담 정책', '심리상담 정책', []), // embed arm만
      doc('B', '번아웃', '번아웃', ['힘들어요']), // 양 arm (query 키워드 매칭)
      doc('C', '주거 정책', '주거 정책', ['힘들어요']), // keyword arm만
    ];
    const hits = await hybridSearch('힘들어요', index, { embed: fixtureEmbed() }, { topK: 5 });
    const ids = hits.map((h) => h.policyId);
    expect(ids[0]).toBe('B');
    expect(ids).toContain('A');
    expect(ids).toContain('C');
  });

  it('H-5 embed=undefined → 키워드 단독 결과(빈 X) ★degrade', async () => {
    const hits = await hybridSearch('번아웃', PSY_INDEX, {}, { topK: 3 });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.map((h) => h.policyId)).toContain('p-psy');
  });

  it('H-6 embed throw → graceful (키워드로 결과)', async () => {
    const embed: EmbeddingProvider = {
      embed: vi.fn(async (_texts: string[]): Promise<number[][]> => {
        throw new Error('boom');
      }),
    };
    const hits = await hybridSearch('번아웃', PSY_INDEX, { embed }, { topK: 3 });
    expect(hits.map((h) => h.policyId)).toContain('p-psy');
  });

  it('H-7 topK=3 → 정확히 최대 3건', async () => {
    const hits = await hybridSearch('힘들어요', PSY_INDEX, { embed: fixtureEmbed() }, { topK: 3 });
    expect(hits.length).toBeLessThanOrEqual(3);
  });

  it('H-8 topK=0 → 빈 배열', async () => {
    const hits = await hybridSearch('힘들어요', PSY_INDEX, { embed: fixtureEmbed() }, { topK: 0 });
    expect(hits).toEqual([]);
  });

  it('H-9 빈 query → 빈/무매칭, throw 없음', async () => {
    const hits = await hybridSearch('', PSY_INDEX, { embed: fixtureEmbed() }, { topK: 3 });
    expect(Array.isArray(hits)).toBe(true);
  });

  it('H-10 index=[] → 빈 배열', async () => {
    const hits = await hybridSearch('힘들어요', [], { embed: fixtureEmbed() }, { topK: 3 });
    expect(hits).toEqual([]);
  });

  it('H-11 vector=null 섞임 → 키워드로 후보 가능', async () => {
    const index: IndexedDoc[] = [
      doc('nv', '심리상담 정책', null, ['번아웃']), // vector 없음, 키워드만
    ];
    const hits = await hybridSearch('번아웃', index, { embed: fixtureEmbed() }, { topK: 3 });
    expect(hits.map((h) => h.policyId)).toContain('nv');
  });

  it('H-12 깨진 doc → throw 없이 스킵', async () => {
    const broken = [
      null,
      undefined,
      42,
      { policyId: 'ok', text: '심리상담 정책', vector: VEC['심리상담 정책'], category: null, keywords: ['번아웃'] },
      { foo: 'bar' },
    ] as unknown as IndexedDoc[];
    const hits = await hybridSearch('번아웃', broken, { embed: fixtureEmbed() }, { topK: 3 });
    expect(hits.map((h) => h.policyId)).toContain('ok');
  });
});
