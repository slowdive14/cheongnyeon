import { describe, it, expect } from 'vitest';
import { contentHash, needsReparse } from '@/data/incremental';
import type { Policy } from '@/domain/types';
import type { CachedPolicy } from '@/data/cache/types';

/**
 * Test 2.2 — 증분 해시 (순수·결정적)
 *
 * 해시 입력:
 *  - 최종수정일(lastModified) 있으면 id + 최종수정일.
 *  - 없으면 id + 자격영향 원문 정규화 직렬화.
 *  - 제외: fetchedAt / updatedAt / sourceUrl.
 *  - 키 정렬 + 공백 정규화로 결정성.
 */

function basePolicy(over: Partial<Policy> = {}): Policy {
  return {
    id: 'ON-0001',
    title: '서울 청년 정책',
    summary: '요약',
    ageMin: 19,
    ageMax: 34,
    income: { kind: 'medianRatio', maxRatio: 150, raw: '중위소득 150% 이하' },
    regionCodes: ['11'],
    regionText: '서울특별시',
    isNationwide: false,
    recruit: { kind: 'dated', start: '2026-06-01', end: '2026-08-31' },
    category: '주거',
    sourceUrl: 'https://example.com/ON-0001',
    source: 'ontong',
    raw: {},
    ...over,
  };
}

function cachedFrom(p: Policy, hash: string): CachedPolicy {
  return {
    ...p,
    fetchedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    contentHash: hash,
    parsed: null,
  };
}

describe('contentHash', () => {
  it('H1: 결정성 — 동일 입력은 동일 해시', () => {
    const p = basePolicy();
    expect(contentHash(p)).toBe(contentHash(basePolicy()));
  });

  it('H4: incomeText(자격영향 원문) 변경 → 다른 해시', () => {
    const a = contentHash(basePolicy());
    const b = contentHash(
      basePolicy({ income: { kind: 'medianRatio', maxRatio: 120, raw: '중위소득 120% 이하' } }),
    );
    expect(a).not.toBe(b);
  });

  it('H5: sourceUrl만 변경 → 동일 해시 (해시 입력 제외)', () => {
    const a = contentHash(basePolicy());
    const b = contentHash(basePolicy({ sourceUrl: 'https://example.com/CHANGED' }));
    expect(a).toBe(b);
  });

  it('H2: 최종수정일만 다름 → 다른 해시 (lastModified 우선)', () => {
    const a = contentHash(basePolicy({ raw: { lastModified: '2026-01-01' } }));
    const b = contentHash(basePolicy({ raw: { lastModified: '2026-02-01' } }));
    expect(a).not.toBe(b);
  });

  it('H9(수렴): lastModified 동일 + income.raw 변경 → 다른 해시 (수정일 미갱신 본문변경 감지)', () => {
    const a = contentHash(
      basePolicy({
        raw: { lastModified: '2026-01-01' },
        income: { kind: 'medianRatio', maxRatio: 150, raw: '중위소득 150% 이하' },
      }),
    );
    const b = contentHash(
      basePolicy({
        raw: { lastModified: '2026-01-01' },
        income: { kind: 'medianRatio', maxRatio: 120, raw: '중위소득 120% 이하' },
      }),
    );
    expect(a).not.toBe(b);
  });

  it('H10(수렴): lastModified 동일 + ageText 원문 변경 → 다른 해시 (파싱값 동일해도 원문 변경 감지)', () => {
    // 파싱값(ageMin/ageMax)은 동일하나 ageText 원문만 다른 경우.
    const a = contentHash(
      basePolicy({ raw: { lastModified: '2026-01-01', ageText: '19~34' }, ageMin: 19, ageMax: 34 }),
    );
    const b = contentHash(
      basePolicy({ raw: { lastModified: '2026-01-01', ageText: '만 19세~만 34세' }, ageMin: 19, ageMax: 34 }),
    );
    expect(a).not.toBe(b);
  });

  it('H11(수렴): ageText 원문 변경 → 다른 해시 (lastModified 없는 서명 경로)', () => {
    const a = contentHash(basePolicy({ raw: { ageText: '19~34' }, ageMin: 19, ageMax: 34 }));
    const b = contentHash(basePolicy({ raw: { ageText: '만19세 이상' }, ageMin: 19, ageMax: 34 }));
    expect(a).not.toBe(b);
  });

  it('H8: 키 순서만 다른 raw → 동일 해시 (키 정렬)', () => {
    const a = contentHash(basePolicy({ raw: { a: 1, b: 2 } }));
    const b = contentHash(basePolicy({ raw: { b: 2, a: 1 } }));
    expect(a).toBe(b);
  });

  it('H7: 깨진/null raw → throw 금지, 결정적 해시 산출', () => {
    expect(() => contentHash(basePolicy({ raw: null }))).not.toThrow();
    expect(() => contentHash(basePolicy({ raw: undefined }))).not.toThrow();
    expect(contentHash(basePolicy({ raw: null }))).toBe(
      contentHash(basePolicy({ raw: null })),
    );
  });

  it('공백 정규화 — 자격 원문 내 공백 차이는 동일 해시', () => {
    const a = contentHash(basePolicy({ title: '서울  청년   정책' }));
    const b = contentHash(basePolicy({ title: '서울 청년 정책' }));
    expect(a).toBe(b);
  });

  it('lastModified 없는 raw → 자격 서명 경로 사용(원문 변경 감지)', () => {
    // lastModified 없음 → eligibilitySignature 경로. 모든 자격 필드 채워 직렬화 분기 커버.
    const full = basePolicy({
      raw: { other: 'x' },
      summary: null,
      income: { kind: 'amountMax', maxAmount: 30000000, raw: '연 3천만원 이하' },
      regionText: null,
      category: null,
      recruit: { kind: 'always', start: null, end: null },
    });
    const a = contentHash(full);
    // incomeText(원문) 변경 → 다른 해시
    const b = contentHash({
      ...full,
      income: { kind: 'amountMax', maxAmount: 20000000, raw: '연 2천만원 이하' },
    });
    expect(a).not.toBe(b);
  });

  it('빈 문자열 lastModified는 없는 것으로 취급(서명 경로)', () => {
    const a = contentHash(basePolicy({ raw: { lastModified: '   ' } }));
    const b = contentHash(basePolicy({ raw: { lastModified: '' } }));
    expect(a).toBe(b);
  });
});

describe('needsReparse', () => {
  it('H6: 캐시에 없는 신규 정책 → true', () => {
    expect(needsReparse(basePolicy(), null)).toBe(true);
  });

  it('H3: 해시 동일 → false (skip)', () => {
    const p = basePolicy();
    const cached = cachedFrom(p, contentHash(p));
    expect(needsReparse(p, cached)).toBe(false);
  });

  it('H4: 자격 원문 변경 → true', () => {
    const old = basePolicy();
    const cached = cachedFrom(old, contentHash(old));
    const changed = basePolicy({
      income: { kind: 'medianRatio', maxRatio: 120, raw: '중위소득 120% 이하' },
    });
    expect(needsReparse(changed, cached)).toBe(true);
  });

  it('H5: sourceUrl만 변경 → false (재파싱 불필요)', () => {
    const old = basePolicy();
    const cached = cachedFrom(old, contentHash(old));
    const changed = basePolicy({ sourceUrl: 'https://example.com/CHANGED' });
    expect(needsReparse(changed, cached)).toBe(false);
  });

  it('H12(수렴): lastModified 동일하나 자격 본문 변경 → true (낡은 자격 캐시 방지)', () => {
    const old = basePolicy({
      raw: { lastModified: '2026-01-01' },
      income: { kind: 'medianRatio', maxRatio: 150, raw: '중위소득 150% 이하' },
    });
    const cached = cachedFrom(old, contentHash(old));
    const changed = basePolicy({
      raw: { lastModified: '2026-01-01' }, // 발행처가 수정일 미갱신
      income: { kind: 'medianRatio', maxRatio: 120, raw: '중위소득 120% 이하' },
    });
    expect(needsReparse(changed, cached)).toBe(true);
  });
});
