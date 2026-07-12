import { describe, it, expect } from 'vitest';
import { toRow, fromRow, parseVector } from '@/data/cache/supabaseMapping';
import type { CachedPolicy } from '@/data/cache/types';

function cp(over: Partial<CachedPolicy> = {}): CachedPolicy {
  return {
    id: 'p1',
    title: '청년 월세 지원',
    summary: '월세 지원',
    category: '주거',
    source: 'ontong',
    ageMin: 19,
    ageMax: 39,
    income: { kind: 'none', raw: null },
    regionCodes: ['11'],
    regionText: '서울특별시',
    isNationwide: false,
    recruit: { kind: 'always', start: null, end: null },
    documentsText: '주민등록등본 1부',
    sourceUrl: 'https://x/p1',
    keywords: ['월세', '주거'],
    parsed: null,
    explanation: '설명입니다.',
    vector: [0.1, 0.2, 0.3],
    fetchedAt: '2026-06-28T00:00:00Z',
    updatedAt: '2026-06-28T00:00:00Z',
    contentHash: 'h',
    ...over,
  };
}

describe('supabaseMapping', () => {
  it('round-trip 보존 (camelCase ↔ snake_case)', () => {
    const p = cp();
    expect(fromRow(toRow(p))).toEqual(p);
  });

  it('toRow: snake_case 컬럼 + vector→embedding', () => {
    const r = toRow(cp());
    expect(r.age_min).toBe(19);
    expect(r.region_codes).toEqual(['11']);
    expect(r.is_nationwide).toBe(false);
    expect(r.source_url).toBe('https://x/p1');
    expect(r.embedding).toBe('[0.1,0.2,0.3]'); // pgvector 텍스트 리터럴
    expect(r.documents_text).toBe('주민등록등본 1부');
    expect(r.content_hash).toBe('h');
  });

  it('parseVector: 배열·문자열·널 수용', () => {
    expect(parseVector([1, 2, 3])).toEqual([1, 2, 3]);
    expect(parseVector('[1,2,3]')).toEqual([1, 2, 3]);
    expect(parseVector(null)).toBeNull();
    expect(parseVector('nope')).toBeNull();
  });

  it('fromRow: 누락 필드 안전(null/빈배열)', () => {
    const back = fromRow({
      id: 'x',
      title: 't',
      income: { kind: 'unknown', raw: null },
      recruit: { kind: 'unknown', start: null, end: null },
    });
    expect(back.summary).toBeNull();
    expect(back.regionCodes).toEqual([]);
    expect(back.keywords).toEqual([]);
    expect(back.vector).toBeNull();
    expect(back.explanation).toBeNull();
    expect(back.documentsText).toBeNull(); // 컬럼 없음 → null(보수)
  });
});
