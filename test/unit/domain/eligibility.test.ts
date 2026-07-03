import { describe, it, expect } from 'vitest';
import { evaluate } from '@/domain/eligibility';
import type { EvaluateResult } from '@/domain/eligibility';
import type { Policy, UserProfile, IncomeCriteria, RecruitWindow } from '@/domain/types';

/**
 * 계약: evaluate(profile, policies, { now, soonWithinDays=7 }): { now, soon, blocked, review }
 * - 순수·throw-free. clock 주입(deps.now). 어떤 입력에도 예외 금지.
 * - 우선순위: blocked > review > soon > now.
 * - now/soon → reasons=[]. blocked/review → reasons.length≥1.
 * - 미확인은 탈락(blocked)이 아니라 확인 필요(review).
 */

const NOW = new Date('2026-06-24T12:00:00Z');

// 각 축을 격리하기 위한 "전부 통과" 기본값.
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
    isNationwide: true, // 지역축 통과 기본값
    recruit: alwaysRecruit,
    category: null,
    sourceUrl: null,
    source: 'test',
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

/** 단일 정책 평가 헬퍼 — 어떤 버킷에 들어갔는지 + reasons 반환. */
function evalOne(p: Policy, pr: UserProfile = baseProfile): {
  bucket: keyof EvaluateResult;
  reasons: string[];
  status: string;
} {
  const r = evaluate(pr, [p], { now: NOW });
  const buckets: (keyof EvaluateResult)[] = ['now', 'soon', 'blocked', 'review'];
  for (const b of buckets) {
    if (r[b].length === 1) {
      return { bucket: b, reasons: r[b][0]!.reasons, status: r[b][0]!.recruitStatus };
    }
  }
  throw new Error('정책이 정확히 한 버킷에 배치되지 않음');
}

describe('축 A — 나이', () => {
  it('A-1 19/34, age 34 → 통과(now)', () => {
    const r = evalOne(policy({ ageMin: 19, ageMax: 34 }), profile({ age: 34 }));
    expect(r.bucket).toBe('now');
    expect(r.reasons).toEqual([]);
  });
  it('A-2 age 35 → blocked AGE_ABOVE_MAX', () => {
    const r = evalOne(policy({ ageMin: 19, ageMax: 34 }), profile({ age: 35 }));
    expect(r.bucket).toBe('blocked');
    expect(r.reasons).toContain('AGE_ABOVE_MAX');
  });
  it('A-3 age 19 → 통과', () => {
    expect(evalOne(policy({ ageMin: 19, ageMax: 34 }), profile({ age: 19 })).bucket).toBe('now');
  });
  it('A-4 age 18 → blocked AGE_BELOW_MIN', () => {
    const r = evalOne(policy({ ageMin: 19, ageMax: 34 }), profile({ age: 18 }));
    expect(r.bucket).toBe('blocked');
    expect(r.reasons).toContain('AGE_BELOW_MIN');
  });
  it('A-5 null/34, age 30 → 통과', () => {
    expect(evalOne(policy({ ageMin: null, ageMax: 34 }), profile({ age: 30 })).bucket).toBe('now');
  });
  it('A-6 null/34, age 35 → blocked', () => {
    expect(evalOne(policy({ ageMin: null, ageMax: 34 }), profile({ age: 35 })).bucket).toBe('blocked');
  });
  it('A-7 19/null, age 80 → 통과', () => {
    expect(evalOne(policy({ ageMin: 19, ageMax: null }), profile({ age: 80 })).bucket).toBe('now');
  });
  it('A-8 19/null, age 18 → blocked', () => {
    expect(evalOne(policy({ ageMin: 19, ageMax: null }), profile({ age: 18 })).bucket).toBe('blocked');
  });
  it('A-9 null/null + 전국민 → 연령무관 통과(now), AGE_UNKNOWN 아님', () => {
    // 전국 대상 정책의 연령 불명은 '제한 없음'으로 간주(사용자 승인 2026-06-25). 추정 고지는 카드가 담당.
    const r = evalOne(policy({ ageMin: null, ageMax: null, isNationwide: true }), profile({ age: 30 }));
    expect(r.bucket).toBe('now');
    expect(r.reasons).toEqual([]);
  });
  it('A-10 null/null + 비전국(지역) → 보수 유지(review AGE_UNKNOWN)', () => {
    // 지역 정책의 연령 불명은 기준 누락 가능성 → 기존대로 확인필요. (지역축 격리 위해 11코드 일치)
    const r = evalOne(
      policy({ ageMin: null, ageMax: null, isNationwide: false, regionCodes: ['11'] }),
      profile({ age: 30, regionCode: '11' }),
    );
    expect(r.bucket).toBe('review');
    expect(r.reasons).toContain('AGE_UNKNOWN');
  });
  it('A-11 null/null + 전국민 + 프로필 나이 없음 → 그래도 통과(연령 무관)', () => {
    const r = evalOne(policy({ ageMin: null, ageMax: null, isNationwide: true }), profile({ age: undefined }));
    expect(r.bucket).toBe('now');
    expect(r.reasons).toEqual([]);
  });

  // ── T1: age optional화 + 미입력 review 계약 고정 (프로필 입력 UI 착수 요건) ──
  it('A-12 age 생략(undefined) + 비전국 연령정책 → review AGE_UNKNOWN', () => {
    // 나이 미입력은 탈락(blocked)이 아니라 확인 필요(review). UI가 undefined를 안심하고 넘길 수 있어야 함.
    const r = evalOne(
      policy({ ageMin: 19, ageMax: 34, isNationwide: false, regionCodes: ['11'] }),
      profile({ age: undefined, regionCode: '11' }),
    );
    expect(r.bucket).toBe('review');
    expect(r.reasons).toContain('AGE_UNKNOWN');
  });
  it('A-13 age NaN → review AGE_UNKNOWN (blocked 아님)', () => {
    const r = evalOne(policy({ ageMin: 19, ageMax: 34 }), profile({ age: NaN }));
    expect(r.bucket).toBe('review');
    expect(r.reasons).toContain('AGE_UNKNOWN');
  });
  it('A-14 age -1(음수) → review AGE_UNKNOWN (blocked 아님)', () => {
    const r = evalOne(policy({ ageMin: 19, ageMax: 34 }), profile({ age: -1 }));
    expect(r.bucket).toBe('review');
    expect(r.reasons).toContain('AGE_UNKNOWN');
  });
  it('A-15 age 33.5(비정수) → throw 없이 비교로 흐름 (현 동작 유지, UI가 정수만 통과)', () => {
    // R3: isUsableAge는 정수 강제 아님(Finite·비음). 33.5는 19~34 사이라 통과. UI 파서가 이중 방어.
    const r = evalOne(policy({ ageMin: 19, ageMax: 34 }), profile({ age: 33.5 }));
    expect(r.bucket).toBe('now');
    expect(r.reasons).toEqual([]);
  });
  it('A-16 age 0(유효) + ageMin 19 → blocked AGE_BELOW_MIN (0은 유효 나이)', () => {
    // 0은 isUsableAge 통과(유효). 0 < 19 → 하한 미달 blocked.
    const r = evalOne(policy({ ageMin: 19, ageMax: 34 }), profile({ age: 0 }));
    expect(r.bucket).toBe('blocked');
    expect(r.reasons).toContain('AGE_BELOW_MIN');
  });
});

// ── T2: 나이 경계값 정밀 판정 회귀 잠금 (off-by-one·min==max 보강) ──
describe('축 A(경계) — 나이 정밀 판정 회귀 잠금', () => {
  it('AB-1 19/34: 34 → PASS, 35 → blocked ABOVE, 19 → PASS, 18 → blocked BELOW', () => {
    expect(evalOne(policy({ ageMin: 19, ageMax: 34 }), profile({ age: 34 })).bucket).toBe('now');
    const r35 = evalOne(policy({ ageMin: 19, ageMax: 34 }), profile({ age: 35 }));
    expect(r35.bucket).toBe('blocked');
    expect(r35.reasons).toContain('AGE_ABOVE_MAX');
    expect(evalOne(policy({ ageMin: 19, ageMax: 34 }), profile({ age: 19 })).bucket).toBe('now');
    const r18 = evalOne(policy({ ageMin: 19, ageMax: 34 }), profile({ age: 18 }));
    expect(r18.bucket).toBe('blocked');
    expect(r18.reasons).toContain('AGE_BELOW_MIN');
  });
  it('AB-2 null/34(하한 없음): 34 → PASS, 35 → blocked', () => {
    expect(evalOne(policy({ ageMin: null, ageMax: 34 }), profile({ age: 34 })).bucket).toBe('now');
    expect(evalOne(policy({ ageMin: null, ageMax: 34 }), profile({ age: 35 })).bucket).toBe('blocked');
  });
  it('AB-3 19/null(상한 없음): 19 → PASS, 18 → blocked', () => {
    expect(evalOne(policy({ ageMin: 19, ageMax: null }), profile({ age: 19 })).bucket).toBe('now');
    expect(evalOne(policy({ ageMin: 19, ageMax: null }), profile({ age: 18 })).bucket).toBe('blocked');
  });
  it('AB-4 30/30(단일 나이): 30 → PASS, 29·31 → blocked', () => {
    expect(evalOne(policy({ ageMin: 30, ageMax: 30 }), profile({ age: 30 })).bucket).toBe('now');
    const r29 = evalOne(policy({ ageMin: 30, ageMax: 30 }), profile({ age: 29 }));
    expect(r29.bucket).toBe('blocked');
    expect(r29.reasons).toContain('AGE_BELOW_MIN');
    const r31 = evalOne(policy({ ageMin: 30, ageMax: 30 }), profile({ age: 31 }));
    expect(r31.bucket).toBe('blocked');
    expect(r31.reasons).toContain('AGE_ABOVE_MAX');
  });
  it('AB-5 null/null: 전국 → PASS(Lever A), 비전국 → review AGE_UNKNOWN', () => {
    expect(
      evalOne(policy({ ageMin: null, ageMax: null, isNationwide: true }), profile({ age: 30 })).bucket,
    ).toBe('now');
    const r = evalOne(
      policy({ ageMin: null, ageMax: null, isNationwide: false, regionCodes: ['11'] }),
      profile({ age: 30, regionCode: '11' }),
    );
    expect(r.bucket).toBe('review');
    expect(r.reasons).toContain('AGE_UNKNOWN');
  });
});

describe('축 B — 소득 (unknown ≠ none)', () => {
  it('B-1 none → 통과(프로필 없어도)', () => {
    const r = evalOne(policy({ income: { kind: 'none', raw: null } }), profile({ income: undefined }));
    expect(r.bucket).toBe('now');
  });
  it('B-2 ratio150 / 120 → 통과', () => {
    const r = evalOne(policy({ income: { kind: 'medianRatio', maxRatio: 150, raw: null } }), profile({ income: { medianRatio: 120 } }));
    expect(r.bucket).toBe('now');
  });
  it('B-3 150/150 → 통과(경계)', () => {
    const r = evalOne(policy({ income: { kind: 'medianRatio', maxRatio: 150, raw: null } }), profile({ income: { medianRatio: 150 } }));
    expect(r.bucket).toBe('now');
  });
  it('B-4 150/151 → blocked INCOME_OVER_LIMIT', () => {
    const r = evalOne(policy({ income: { kind: 'medianRatio', maxRatio: 150, raw: null } }), profile({ income: { medianRatio: 151 } }));
    expect(r.bucket).toBe('blocked');
    expect(r.reasons).toContain('INCOME_OVER_LIMIT');
  });
  it('B-5 amount 300만/300만 → 통과', () => {
    const r = evalOne(policy({ income: { kind: 'amountMax', maxAmount: 3000000, raw: null } }), profile({ income: { amount: 3000000 } }));
    expect(r.bucket).toBe('now');
  });
  it('B-6 300만/300만1 → blocked', () => {
    const r = evalOne(policy({ income: { kind: 'amountMax', maxAmount: 3000000, raw: null } }), profile({ income: { amount: 3000001 } }));
    expect(r.bucket).toBe('blocked');
  });
  it('B-7 unknown / 120 → review INCOME_UNKNOWN', () => {
    const r = evalOne(policy({ income: { kind: 'unknown', raw: '소득 조건 불명' } }), profile({ income: { medianRatio: 120 } }));
    expect(r.bucket).toBe('review');
    expect(r.reasons).toContain('INCOME_UNKNOWN');
  });
  it('B-8 ratio150 / 미입력 → review INCOME_PROFILE_MISSING', () => {
    const r = evalOne(policy({ income: { kind: 'medianRatio', maxRatio: 150, raw: null } }), profile({ income: undefined }));
    expect(r.bucket).toBe('review');
    expect(r.reasons).toContain('INCOME_PROFILE_MISSING');
  });
  it('B-9 ratio150 / amount만 → review(단위 불일치)', () => {
    const r = evalOne(policy({ income: { kind: 'medianRatio', maxRatio: 150, raw: null } }), profile({ income: { amount: 3000000 } }));
    expect(r.bucket).toBe('review');
    expect(r.reasons).toContain('INCOME_PROFILE_MISSING');
  });
  it('B-10 amountMax / ratio만 → review', () => {
    const r = evalOne(policy({ income: { kind: 'amountMax', maxAmount: 3000000, raw: null } }), profile({ income: { medianRatio: 120 } }));
    expect(r.bucket).toBe('review');
    expect(r.reasons).toContain('INCOME_PROFILE_MISSING');
  });
  it('B-11 정책 maxRatio=NaN + 유효 프로필 → review INCOME_UNKNOWN (비유한 상한 false-accept 가드)', () => {
    const r = evalOne(policy({ income: { kind: 'medianRatio', maxRatio: NaN, raw: null } }), profile({ income: { medianRatio: 120 } }));
    expect(r.bucket).toBe('review');
    expect(r.reasons).toContain('INCOME_UNKNOWN');
  });
  it('B-12 정책 maxAmount=Infinity → review INCOME_UNKNOWN (비유한 상한 false-accept 가드)', () => {
    const r = evalOne(policy({ income: { kind: 'amountMax', maxAmount: Infinity, raw: null } }), profile({ income: { amount: 3000000 } }));
    expect(r.bucket).toBe('review');
    expect(r.reasons).toContain('INCOME_UNKNOWN');
  });
});

describe('축 C — 지역 (불명 ≠ 전국, regionCode 비교)', () => {
  it("C-1 ['11']/false, '11' → 통과", () => {
    const r = evalOne(policy({ regionCodes: ['11'], isNationwide: false }), profile({ regionCode: '11' }));
    expect(r.bucket).toBe('now');
  });
  it("C-2 ['11']/false, '26' → blocked REGION_MISMATCH", () => {
    const r = evalOne(policy({ regionCodes: ['11'], isNationwide: false }), profile({ regionCode: '26' }));
    expect(r.bucket).toBe('blocked');
    expect(r.reasons).toContain('REGION_MISMATCH');
  });
  it("C-3 []/true, '26' → 통과(전국)", () => {
    const r = evalOne(policy({ regionCodes: [], isNationwide: true }), profile({ regionCode: '26' }));
    expect(r.bucket).toBe('now');
  });
  it("C-4 []/false, '11' → review REGION_UNKNOWN", () => {
    const r = evalOne(policy({ regionCodes: [], isNationwide: false }), profile({ regionCode: '11' }));
    expect(r.bucket).toBe('review');
    expect(r.reasons).toContain('REGION_UNKNOWN');
  });
  it("C-5 ['11']/false, 빈코드 → review REGION_PROFILE_MISSING", () => {
    const r = evalOne(policy({ regionCodes: ['11'], isNationwide: false }), profile({ regionCode: '' }));
    expect(r.bucket).toBe('review');
    expect(r.reasons).toContain('REGION_PROFILE_MISSING');
  });
  it("C-6 ['11','26']/false, '11' → 통과", () => {
    const r = evalOne(policy({ regionCodes: ['11', '26'], isNationwide: false }), profile({ regionCode: '11' }));
    expect(r.bucket).toBe('now');
  });
});

describe('축 D — 모집상태 조합', () => {
  it('D-1 always → now', () => {
    expect(evalOne(policy({ recruit: { kind: 'always', start: null, end: null } })).bucket).toBe('now');
  });
  it('D-2 마감 37일 → now', () => {
    expect(evalOne(policy({ recruit: { kind: 'dated', start: '2026-06-01', end: '2026-07-31' } })).bucket).toBe('now');
  });
  it('D-3 마감 6일 → soon', () => {
    const r = evalOne(policy({ recruit: { kind: 'dated', start: '2026-06-01', end: '2026-06-30' } }));
    expect(r.bucket).toBe('soon');
    expect(r.reasons).toEqual([]);
  });
  it('D-4 마감 어제 → blocked RECRUIT_CLOSED', () => {
    const r = evalOne(policy({ recruit: { kind: 'dated', start: '2026-06-01', end: '2026-06-23' } }));
    expect(r.bucket).toBe('blocked');
    expect(r.reasons).toContain('RECRUIT_CLOSED');
  });
  it('D-5 unknown → review RECRUIT_UNKNOWN', () => {
    const r = evalOne(policy({ recruit: { kind: 'unknown', start: null, end: null } }));
    expect(r.bucket).toBe('review');
    expect(r.reasons).toContain('RECRUIT_UNKNOWN');
  });
});

describe('우선순위 (blocked > review > soon > now)', () => {
  it('P-1 나이 unknown(비전국) + 모집 now → review(AGE_UNKNOWN), now 아님', () => {
    // 비전국 연령불명은 보수 유지. (지역축 격리: 11코드 일치)
    const r = evalOne(
      policy({ ageMin: null, ageMax: null, isNationwide: false, regionCodes: ['11'], recruit: alwaysRecruit }),
      profile({ age: 30, regionCode: '11' }),
    );
    expect(r.bucket).toBe('review');
    expect(r.reasons).toContain('AGE_UNKNOWN');
  });
  it('P-2 나이 35 + 소득 unknown → blocked(AGE_ABOVE_MAX + INCOME_UNKNOWN)', () => {
    const r = evalOne(
      policy({ ageMin: 19, ageMax: 34, income: { kind: 'unknown', raw: null } }),
      profile({ age: 35, income: { medianRatio: 100 } }),
    );
    expect(r.bucket).toBe('blocked');
    expect(r.reasons).toContain('AGE_ABOVE_MAX');
    expect(r.reasons).toContain('INCOME_UNKNOWN');
  });
  it('P-3 소득 over + 모집 closed → blocked [INCOME_OVER_LIMIT, RECRUIT_CLOSED]', () => {
    const r = evalOne(
      policy({
        income: { kind: 'medianRatio', maxRatio: 150, raw: null },
        recruit: { kind: 'dated', start: '2026-06-01', end: '2026-06-23' },
      }),
      profile({ income: { medianRatio: 200 } }),
    );
    expect(r.bucket).toBe('blocked');
    expect(r.reasons).toContain('INCOME_OVER_LIMIT');
    expect(r.reasons).toContain('RECRUIT_CLOSED');
  });
  it('P-4 전축 통과 + 모집 unknown → review RECRUIT_UNKNOWN', () => {
    const r = evalOne(policy({ recruit: { kind: 'unknown', start: null, end: null } }));
    expect(r.bucket).toBe('review');
    expect(r.reasons).toContain('RECRUIT_UNKNOWN');
  });
});

describe('이상치 방어 (throw-free)', () => {
  it('EX-1 [] → 빈 4버킷', () => {
    const r = evaluate(baseProfile, [], { now: NOW });
    expect(r).toEqual({ now: [], soon: [], blocked: [], review: [] });
  });
  it('EX-2 null policies → 빈 결과(throw 금지)', () => {
    const r = evaluate(baseProfile, null as unknown as Policy[], { now: NOW });
    expect(r).toEqual({ now: [], soon: [], blocked: [], review: [] });
  });
  it('EX-3 깨진 Policy 섞임 → 해당건 review(누락 금지)', () => {
    const good = policy({});
    const broken = { id: 'x' } as unknown as Policy;
    const r = evaluate(baseProfile, [good, broken], { now: NOW });
    const total = r.now.length + r.soon.length + r.blocked.length + r.review.length;
    expect(total).toBe(2);
    expect(r.review.some((e) => e.policy.id === 'x')).toBe(true);
  });
  it('EX-4 profile={} → 전건 review', () => {
    const r = evaluate({} as unknown as UserProfile, [policy({})], { now: NOW });
    expect(r.review.length).toBe(1);
  });
  it('EX-5 age NaN/음수 → review(blocked 아님)', () => {
    const rNaN = evalOne(policy({ ageMin: 19, ageMax: 34 }), profile({ age: NaN }));
    expect(rNaN.bucket).toBe('review');
    const rNeg = evalOne(policy({ ageMin: 19, ageMax: 34 }), profile({ age: -5 }));
    expect(rNeg.bucket).toBe('review');
  });
  it('EX-6 중복 정책 → 중복 그대로', () => {
    const p = policy({});
    const r = evaluate(baseProfile, [p, p], { now: NOW });
    const total = r.now.length + r.soon.length + r.blocked.length + r.review.length;
    expect(total).toBe(2);
  });
});

describe('불변식 — reasons 형태', () => {
  it('now/soon은 reasons=[], blocked/review는 reasons≥1', () => {
    const r = evaluate(
      baseProfile,
      [
        policy({}), // now
        policy({ recruit: { kind: 'dated', start: '2026-06-01', end: '2026-06-30' } }), // soon
        policy({ ageMin: 19, ageMax: 34, regionCodes: ['99'], isNationwide: false }), // blocked region
        policy({ ageMin: null, ageMax: null, isNationwide: false, regionCodes: ['11'] }), // review(비전국 연령불명)
      ],
      { now: NOW },
    );
    for (const e of [...r.now, ...r.soon]) expect(e.reasons).toEqual([]);
    for (const e of [...r.blocked, ...r.review]) expect(e.reasons.length).toBeGreaterThanOrEqual(1);
  });
});
