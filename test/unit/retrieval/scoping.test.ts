import { describe, it, expect, vi } from 'vitest';
import { hybridSearch } from '@/retrieval/hybridSearch';
import type { EmbeddingProvider, IndexedDoc } from '@/retrieval/types';

/**
 * Test 4.3 — 노드 스코핑. 하드=제외, 소프트=가산만.
 * ★재현율 보호: boost는 가산만(제외 X). category=null 하드 제외 금지(불명≠무관).
 */

const VEC: Record<string, number[]> = {
  고립은둔: [1, 0, 0, 0],
  관계회복: [0.95, 0.31, 0, 0],
  일반상담: [0.9, 0.43, 0, 0],
  주거: [0, 0, 1, 0],
};
function fixtureEmbed(): EmbeddingProvider {
  return {
    embed: vi.fn(async (texts: string[]) =>
      texts.map((t) => {
        for (const k of Object.keys(VEC)) if (t.includes(k)) return VEC[k]!;
        return [0, 0, 0, 0];
      }),
    ),
  };
}

function doc(
  policyId: string,
  vecKey: string,
  category: string | null,
  keywords: string[] = [],
): IndexedDoc {
  return { policyId, text: vecKey, vector: VEC[vecKey] ?? null, category, keywords };
}

describe('hybridSearch 스코핑 — Test 4.3', () => {
  it('SC-1 hardCategories → 타 도메인 제외', async () => {
    const index = [
      doc('mh', '고립은둔', '마음건강', ['고립']),
      doc('house', '주거', '주거', ['월세']),
    ];
    const hits = await hybridSearch('고립은둔', index, { embed: fixtureEmbed() }, {
      topK: 5,
      hardCategories: ['마음건강'],
    });
    const ids = hits.map((h) => h.policyId);
    expect(ids).toContain('mh');
    expect(ids).not.toContain('house');
  });

  it('SC-2 boostCategories → 특화정책 가산하되 일반상담도 결과 포함(제외 X) ★재현율', async () => {
    const index = [
      doc('special', '관계회복', '관계회복특화', ['이음센터']),
      doc('general', '일반상담', '마음건강', ['상담']),
    ];
    const hits = await hybridSearch('고립은둔', index, { embed: fixtureEmbed() }, {
      topK: 5,
      boostCategories: ['관계회복특화'],
    });
    const ids = hits.map((h) => h.policyId);
    expect(ids).toContain('special');
    expect(ids).toContain('general'); // 소프트 부스트는 제외하지 않음
  });

  it('SC-3 일반상담이 상위 독식 안함 (특화가 부스트로 경쟁)', async () => {
    const index = [
      doc('special', '관계회복', '관계회복특화', ['이음센터', '고립은둔']),
      doc('general1', '일반상담', '마음건강', ['상담']),
      doc('general2', '일반상담', '마음건강', ['상담']),
    ];
    const hits = await hybridSearch('고립은둔', index, { embed: fixtureEmbed() }, {
      topK: 5,
      boostCategories: ['관계회복특화'],
      boostKeywords: ['이음센터'],
    });
    expect(hits[0]?.policyId).toBe('special');
  });

  it('SC-4 category=null → 하드 제외 안됨 ★불명≠무관', async () => {
    const index = [
      doc('mh', '고립은둔', '마음건강', ['고립']),
      doc('nullcat', '관계회복', null, ['고립은둔']),
    ];
    const hits = await hybridSearch('고립은둔', index, { embed: fixtureEmbed() }, {
      topK: 5,
      hardCategories: ['마음건강'],
    });
    const ids = hits.map((h) => h.policyId);
    expect(ids).toContain('nullcat'); // null은 하드 제외 금지
  });

  it('SC-5 소프트 단독 → 제외 없음', async () => {
    const index = [
      doc('a', '일반상담', '마음건강', []),
      doc('b', '주거', '주거', []),
    ];
    const hits = await hybridSearch('일반상담', index, { embed: fixtureEmbed() }, {
      topK: 5,
      boostCategories: ['마음건강'],
    });
    // 부스트만 있으면 b도 제외되지 않음(매칭되면 후보)
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits.map((h) => h.policyId)).toContain('a');
  });

  it('SC-6 hardCategories=[] → 필터 없음', async () => {
    const index = [
      doc('mh', '고립은둔', '마음건강', []),
      doc('house', '주거', '주거', ['고립은둔']),
    ];
    const hits = await hybridSearch('고립은둔', index, { embed: fixtureEmbed() }, {
      topK: 5,
      hardCategories: [],
    });
    const ids = hits.map((h) => h.policyId);
    expect(ids).toContain('mh');
    expect(ids).toContain('house');
  });

  it('SC-7 하드 매칭 0건 → 빈 배열 (traverse는 대안 갈래로)', async () => {
    const index = [doc('house', '주거', '주거', ['월세'])];
    const hits = await hybridSearch('고립은둔', index, { embed: fixtureEmbed() }, {
      topK: 5,
      hardCategories: ['존재하지않는카테고리'],
    });
    expect(hits).toEqual([]);
  });
});
