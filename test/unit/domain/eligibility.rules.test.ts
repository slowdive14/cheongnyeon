import { describe, it, expect } from 'vitest';
import { evaluate } from '@/domain/eligibility';
import type { EvaluateResult } from '@/domain/eligibility';
import { applyRules } from '@/domain/rules/applyRules';
import { PROGRAM_RULES } from '@/domain/rules/programRules';
import type { ProgramKey, ProgramRule } from '@/domain/rules/programRules';
import type { Policy, UserProfile } from '@/domain/types';

/**
 * 계약: 배타·순서 규칙(Test 3.3).
 * - programKey=null → 규칙 비적용(자격 4축만).
 * - 이력 미입력(undefined) → review(PREREQ_UNKNOWN), 탈락 아님.
 * - 빈 배열([])은 확인된 "이력 없음"으로 통과/탈락 판정.
 */

const NOW = new Date('2026-06-24T12:00:00Z');

function policy(over: Partial<Policy>): Policy {
  return {
    id: 'p1',
    title: '테스트 정책',
    summary: null,
    ageMin: 19,
    ageMax: 34,
    income: { kind: 'none', raw: null },
    regionCodes: [],
    regionText: null,
    isNationwide: true,
    recruit: { kind: 'always', start: null, end: null },
    category: null,
    sourceUrl: null,
    source: 'test',
    documentsText: null,
    ...over,
  };
}

const baseProfile: UserProfile = {
  age: 30,
  region: '서울',
  regionCode: '11',
  income: { medianRatio: 100 },
};

function profile(over: Partial<UserProfile>): UserProfile {
  return { ...baseProfile, ...over };
}

function evalOne(p: Policy, pr: UserProfile): {
  bucket: keyof EvaluateResult;
  reasons: string[];
} {
  const r = evaluate(pr, [p], { now: NOW });
  const buckets: (keyof EvaluateResult)[] = ['now', 'soon', 'blocked', 'review'];
  for (const b of buckets) {
    if (r[b].length === 1) return { bucket: b, reasons: r[b][0]!.reasons };
  }
  throw new Error('정책이 정확히 한 버킷에 배치되지 않음');
}

describe('배타 규칙 (mutual_exclusive)', () => {
  it("RULE-1 kuk_chwi + active ['youth_allowance'] → blocked DUPLICATE_EXCLUSIVE", () => {
    const r = evalOne(
      policy({ programKey: 'kuk_chwi' }),
      profile({ activePrograms: ['youth_allowance'], completedPrograms: ['youth_challenge'] }),
    );
    expect(r.bucket).toBe('blocked');
    expect(r.reasons).toContain('DUPLICATE_EXCLUSIVE');
  });
  it('RULE-2 active [] → 통과', () => {
    const r = evalOne(
      policy({ programKey: 'youth_allowance' }),
      profile({ activePrograms: [], completedPrograms: [] }),
    );
    expect(r.bucket).toBe('now');
  });
  it('RULE-3 active undefined → review PREREQ_UNKNOWN', () => {
    const r = evalOne(
      policy({ programKey: 'youth_allowance' }),
      profile({ activePrograms: undefined, completedPrograms: [] }),
    );
    expect(r.bucket).toBe('review');
    expect(r.reasons).toContain('PREREQ_UNKNOWN');
  });
  it('RULE-4 동일사업 재참여 → review(확인 필요)', () => {
    const r = evalOne(
      policy({ programKey: 'youth_allowance' }),
      profile({ activePrograms: ['youth_allowance'], completedPrograms: [] }),
    );
    expect(r.bucket).toBe('review');
    expect(r.reasons).toContain('PREREQ_UNKNOWN');
  });
  it('RULE-5 programKey=null → 규칙 비적용(자격축만 통과)', () => {
    const r = evalOne(
      policy({ programKey: null }),
      profile({ activePrograms: ['youth_allowance', 'kuk_chwi'] }),
    );
    expect(r.bucket).toBe('now');
    expect(r.reasons).toEqual([]);
  });
});

describe('순서 규칙 (sequence: 청년도전 수료 → 국취)', () => {
  it("SEQ-1 completed ['youth_challenge'] → 통과", () => {
    const r = evalOne(
      policy({ programKey: 'kuk_chwi' }),
      profile({ completedPrograms: ['youth_challenge'], activePrograms: [] }),
    );
    expect(r.bucket).toBe('now');
  });
  it('SEQ-2 completed [] → blocked PREREQ_NOT_MET', () => {
    const r = evalOne(
      policy({ programKey: 'kuk_chwi' }),
      profile({ completedPrograms: [], activePrograms: [] }),
    );
    expect(r.bucket).toBe('blocked');
    expect(r.reasons).toContain('PREREQ_NOT_MET');
  });
  it('SEQ-3 completed undefined → review PREREQ_UNKNOWN', () => {
    const r = evalOne(
      policy({ programKey: 'kuk_chwi' }),
      profile({ completedPrograms: undefined, activePrograms: [] }),
    );
    expect(r.bucket).toBe('review');
    expect(r.reasons).toContain('PREREQ_UNKNOWN');
  });
  it('SEQ-4 순서 비대상(youth_allowance) → 통과', () => {
    const r = evalOne(
      policy({ programKey: 'youth_allowance' }),
      profile({ completedPrograms: [], activePrograms: [] }),
    );
    expect(r.bucket).toBe('now');
  });
});

describe('규칙 vs 자격 우선순위', () => {
  it('자격 blocked + 배타 blocked → blocked (reasons 복수)', () => {
    const r = evalOne(
      policy({ programKey: 'kuk_chwi', ageMin: 19, ageMax: 34 }),
      profile({ age: 50, activePrograms: ['youth_allowance'], completedPrograms: ['youth_challenge'] }),
    );
    expect(r.bucket).toBe('blocked');
    expect(r.reasons).toContain('AGE_ABOVE_MAX');
    expect(r.reasons).toContain('DUPLICATE_EXCLUSIVE');
  });
  it('자격 통과 + 순서 PREREQ_UNKNOWN → review', () => {
    const r = evalOne(
      policy({ programKey: 'kuk_chwi' }),
      profile({ completedPrograms: undefined, activePrograms: [] }),
    );
    expect(r.bucket).toBe('review');
    expect(r.reasons).toContain('PREREQ_UNKNOWN');
  });
});

describe('applyRules — 단위(throw-free)', () => {
  it('programKey 없음 → [] (규칙 비적용)', () => {
    expect(applyRules(baseProfile, policy({}), PROGRAM_RULES)).toEqual([]);
  });
  it('깨진 입력 → throw 금지', () => {
    expect(() => applyRules({} as UserProfile, {} as Policy, PROGRAM_RULES)).not.toThrow();
  });
  it('회귀 가드: PROGRAM_RULES 데이터 행 수 = 2', () => {
    expect(PROGRAM_RULES.length).toBe(2);
  });
  it('회귀 가드: 새 순서 규칙 1행 추가 시 applyRules가 순회', () => {
    const extra: ProgramRule[] = [
      ...PROGRAM_RULES,
      { kind: 'sequence', target: 'monthly_rent' as ProgramKey, requires: 'youth_allowance' as ProgramKey, reason: 'PREREQ_NOT_MET' },
    ];
    const reasons = applyRules(
      profile({ completedPrograms: [], activePrograms: [] }),
      policy({ programKey: 'monthly_rent' }),
      extra,
    );
    expect(reasons).toContain('PREREQ_NOT_MET');
  });
});
