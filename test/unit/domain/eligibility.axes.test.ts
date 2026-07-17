import { describe, it, expect } from 'vitest';
import { evaluate } from '@/domain/eligibility';
import type { AxisResult, AxisKind, EvaluateResult } from '@/domain/eligibility';
import type { Policy, UserProfile, IncomeCriteria, RecruitWindow } from '@/domain/types';

/**
 * T-D1a — 자격 엔진 축 verdict 노출(D-① 확장).
 * EvaluatedPolicy.axes?: AxisResult[] 가 축별 pass/review/blocked를 노출한다.
 * 기존 evaluate 버킷 계약(now/soon/blocked/review)·reasons·recruitStatus는 무변경(회귀 0).
 * 고정 clock now=2026-06-24T12:00:00Z.
 */

const NOW = new Date('2026-06-24T12:00:00Z');
const passIncome: IncomeCriteria = { kind: 'none', raw: null };
const alwaysRecruit: RecruitWindow = { kind: 'always', start: null, end: null };

function policy(over: Partial<Policy>): Policy {
  return {
    id: 'p1',
    title: '테스트 정책',
    summary: null,
    ageMin: 19,
    ageMax: 34,
    income: passIncome,
    regionCodes: [],
    regionText: null,
    isNationwide: true,
    recruit: alwaysRecruit,
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

/** 단일 정책 평가 → 그 정책의 axes(어느 버킷이든). */
function axesOf(p: Policy, pr: UserProfile = baseProfile): AxisResult[] {
  const r = evaluate(pr, [p], { now: NOW });
  const buckets: (keyof EvaluateResult)[] = ['now', 'soon', 'blocked', 'review'];
  for (const b of buckets) {
    if (r[b].length === 1) return r[b][0]!.axes ?? [];
  }
  throw new Error('정책이 정확히 한 버킷에 배치되지 않음');
}

function axis(axes: AxisResult[], kind: AxisKind): AxisResult {
  const a = axes.find((x) => x.axis === kind);
  if (!a) throw new Error(`축 ${kind} 없음`);
  return a;
}

describe('T-D1a 축 verdict — 나이', () => {
  it('19/34, age 34 → age축 pass', () => {
    expect(axis(axesOf(policy({ ageMin: 19, ageMax: 34 }), profile({ age: 34 })), 'age').verdict).toBe('pass');
  });
  it('age 35 → age축 blocked AGE_ABOVE_MAX', () => {
    const a = axis(axesOf(policy({ ageMin: 19, ageMax: 34 }), profile({ age: 35 })), 'age');
    expect(a.verdict).toBe('blocked');
    expect(a.reason).toBe('AGE_ABOVE_MAX');
  });
  it('age 18 + ageMin 19 → age축 blocked AGE_BELOW_MIN', () => {
    const a = axis(axesOf(policy({ ageMin: 19, ageMax: 34 }), profile({ age: 18 })), 'age');
    expect(a.verdict).toBe('blocked');
    expect(a.reason).toBe('AGE_BELOW_MIN');
  });
  it('isNationwide + ageMin/Max 둘 다 null → age축 pass(연령 무관)', () => {
    expect(
      axis(axesOf(policy({ ageMin: null, ageMax: null, isNationwide: true })), 'age').verdict,
    ).toBe('pass');
  });
  it('비전국 + ageMin/Max 둘 다 null → age축 review AGE_UNKNOWN', () => {
    const a = axis(
      axesOf(policy({ ageMin: null, ageMax: null, isNationwide: false, regionCodes: ['11'] })),
      'age',
    );
    expect(a.verdict).toBe('review');
    expect(a.reason).toBe('AGE_UNKNOWN');
  });
  it('age undefined → age축 review AGE_UNKNOWN', () => {
    const a = axis(axesOf(policy({ ageMin: 19, ageMax: 34 }), profile({ age: undefined })), 'age');
    expect(a.verdict).toBe('review');
    expect(a.reason).toBe('AGE_UNKNOWN');
  });
  it('age NaN/음수/Infinity → age축 review(isUsableAge false)', () => {
    for (const bad of [NaN, -1, Infinity]) {
      expect(axis(axesOf(policy({ ageMin: 19, ageMax: 34 }), profile({ age: bad })), 'age').verdict).toBe('review');
    }
  });
});

describe('T-D1a 축 verdict — 지역', () => {
  it('isNationwide → region축 pass', () => {
    expect(axis(axesOf(policy({ isNationwide: true })), 'region').verdict).toBe('pass');
  });
  it("regionCodes ['26'] + userCode '26' → region축 pass", () => {
    expect(
      axis(axesOf(policy({ isNationwide: false, regionCodes: ['26'] }), profile({ regionCode: '26' })), 'region').verdict,
    ).toBe('pass');
  });
  it("userCode '11' 불일치 → region축 blocked REGION_MISMATCH", () => {
    const a = axis(
      axesOf(policy({ isNationwide: false, regionCodes: ['26'] }), profile({ regionCode: '11' })),
      'region',
    );
    expect(a.verdict).toBe('blocked');
    expect(a.reason).toBe('REGION_MISMATCH');
  });
  it('regionCodes [] 비전국 → region축 review REGION_UNKNOWN', () => {
    const a = axis(axesOf(policy({ isNationwide: false, regionCodes: [] })), 'region');
    expect(a.verdict).toBe('review');
    expect(a.reason).toBe('REGION_UNKNOWN');
  });
  it('userCode undefined → region축 review REGION_PROFILE_MISSING', () => {
    const a = axis(
      axesOf(policy({ isNationwide: false, regionCodes: ['26'] }), profile({ regionCode: undefined })),
      'region',
    );
    expect(a.verdict).toBe('review');
    expect(a.reason).toBe('REGION_PROFILE_MISSING');
  });
});

describe('T-D1a 축 verdict — 소득', () => {
  it("kind none → income축 pass", () => {
    expect(axis(axesOf(policy({ income: { kind: 'none', raw: null } })), 'income').verdict).toBe('pass');
  });
  it('medianRatio max 150 + user 100 → income축 pass', () => {
    expect(
      axis(
        axesOf(policy({ income: { kind: 'medianRatio', maxRatio: 150, raw: null } }), profile({ income: { medianRatio: 100 } })),
        'income',
      ).verdict,
    ).toBe('pass');
  });
  it('medianRatio max 150 + user 151 → income축 blocked', () => {
    const a = axis(
      axesOf(policy({ income: { kind: 'medianRatio', maxRatio: 150, raw: null } }), profile({ income: { medianRatio: 151 } })),
      'income',
    );
    expect(a.verdict).toBe('blocked');
    expect(a.reason).toBe('INCOME_OVER_LIMIT');
  });
  it('maxRatio NaN/Infinity → income축 review', () => {
    for (const bad of [NaN, Infinity]) {
      expect(
        axis(axesOf(policy({ income: { kind: 'medianRatio', maxRatio: bad, raw: null } })), 'income').verdict,
      ).toBe('review');
    }
  });
  it('user ratio 미입력 → income축 review INCOME_PROFILE_MISSING', () => {
    const a = axis(
      axesOf(policy({ income: { kind: 'medianRatio', maxRatio: 150, raw: null } }), profile({ income: {} })),
      'income',
    );
    expect(a.verdict).toBe('review');
    expect(a.reason).toBe('INCOME_PROFILE_MISSING');
  });
});

describe('T-D1a 축 verdict — 모집', () => {
  it('always(now) → recruit축 pass', () => {
    expect(axis(axesOf(policy({ recruit: alwaysRecruit })), 'recruit').verdict).toBe('pass');
  });
  it('closed → recruit축 blocked RECRUIT_CLOSED', () => {
    const closed: RecruitWindow = { kind: 'dated', start: '2026-01-01', end: '2026-02-01' };
    const a = axis(axesOf(policy({ recruit: closed })), 'recruit');
    expect(a.verdict).toBe('blocked');
    expect(a.reason).toBe('RECRUIT_CLOSED');
  });
  it('unknown → recruit축 review RECRUIT_UNKNOWN', () => {
    const unknown: RecruitWindow = { kind: 'unknown', start: null, end: null };
    const a = axis(axesOf(policy({ recruit: unknown })), 'recruit');
    expect(a.verdict).toBe('review');
    expect(a.reason).toBe('RECRUIT_UNKNOWN');
  });
});

describe('T-D1a 계약 무변경 검증', () => {
  it('축 추가 후에도 now 정책은 reasons=[]·now 버킷 유지', () => {
    const r = evaluate(baseProfile, [policy({ ageMin: 19, ageMax: 34 })], { now: NOW });
    expect(r.now).toHaveLength(1);
    expect(r.now[0]!.reasons).toEqual([]);
    expect(r.now[0]!.axes).toBeDefined();
    expect(r.now[0]!.axes!.every((a) => a.verdict === 'pass')).toBe(true);
  });
  it('모든 축이 4개(age/income/region/recruit) 노출', () => {
    const axes = axesOf(policy({ ageMin: 19, ageMax: 34 }));
    expect(axes.map((a) => a.axis).sort()).toEqual(['age', 'income', 'recruit', 'region']);
  });
});

describe('T-D1a 방어', () => {
  it('evaluate(null policies) → 빈 결과, throw 0', () => {
    expect(() => evaluate(baseProfile, null as never, { now: NOW })).not.toThrow();
    expect(evaluate(baseProfile, null as never, { now: NOW })).toEqual({ now: [], soon: [], blocked: [], review: [] });
  });
  it('구조 결손 정책 → throw 0(axes 없거나 안전 폴백)', () => {
    const broken = { id: 'b' } as unknown as Policy;
    expect(() => evaluate(baseProfile, [broken], { now: NOW })).not.toThrow();
  });
});
