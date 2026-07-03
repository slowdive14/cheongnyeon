import type { Policy, UserProfile, RecruitStatus, IncomeCriteria } from './types';
import { recruitStatus } from './recruitStatus';
import { applyRules } from './rules/applyRules';
import { PROGRAM_RULES } from './rules/programRules';

/**
 * 자격 매칭(추정) 평가기 (Task 3.4).
 * 순수·throw-free. clock은 deps.now로만 주입.
 *
 * 안전 핵심: 미확인은 탈락(blocked)이 아니라 확인 필요(review)로 보수 판정.
 * 우선순위 합성: blocked > review > soon > now.
 */
export interface EvaluateDeps {
  now: Date;
  /** soon 임계 일수, 기본 7 */
  soonWithinDays?: number;
}

export type ReasonCode =
  // blocked (명확한 부적격)
  | 'AGE_BELOW_MIN'
  | 'AGE_ABOVE_MAX'
  | 'INCOME_OVER_LIMIT'
  | 'REGION_MISMATCH'
  | 'RECRUIT_CLOSED'
  | 'DUPLICATE_EXCLUSIVE'
  | 'PREREQ_NOT_MET'
  // review (확인 필요 — 보수, 탈락 아님)
  | 'AGE_UNKNOWN'
  | 'INCOME_UNKNOWN'
  | 'INCOME_PROFILE_MISSING'
  | 'REGION_UNKNOWN'
  | 'REGION_PROFILE_MISSING'
  | 'RECRUIT_UNKNOWN'
  | 'PREREQ_UNKNOWN';

/** 자격 축 종류. */
export type AxisKind = 'age' | 'income' | 'region' | 'recruit';

/**
 * 축별 판정 결과(D-① 카드 체크리스트 소스).
 *  - pass: 해당 축을 (추정) 충족. reason 없음.
 *  - review: 확인 필요(보수). reason 동반.
 *  - blocked: 명확한 부적격. reason 동반(카드는 pass/review만 렌더).
 * 안전: pass는 "충족(추정)" 의미로만 소비되어야 함(자격 단정 금지, DESIGN §7-4).
 */
export interface AxisResult {
  axis: AxisKind;
  verdict: 'pass' | 'review' | 'blocked';
  reason?: ReasonCode;
}

export interface EvaluatedPolicy {
  policy: Policy;
  reasons: ReasonCode[];
  recruitStatus: RecruitStatus;
  /**
   * 축별 판정(D-① 확장, 옵셔널). 기존 계약(reasons/recruitStatus/버킷 분류) 무변경 —
   * 이 필드는 순수 추가이며 evaluate 버킷 결정에는 관여하지 않는다(회귀 0).
   * 구 데이터(axes 미보유)와의 호환을 위해 옵셔널.
   */
  axes?: AxisResult[];
}

export interface EvaluateResult {
  now: EvaluatedPolicy[];
  soon: EvaluatedPolicy[];
  blocked: EvaluatedPolicy[];
  review: EvaluatedPolicy[];
}

/** 축 판정 결과. pass=통과(사유 없음), blocked/review=사유 동반. */
export type Verdict =
  | { verdict: 'pass' }
  | { verdict: 'blocked'; reason: ReasonCode }
  | { verdict: 'review'; reason: ReasonCode };

const PASS: Verdict = { verdict: 'pass' };
const blocked = (reason: ReasonCode): Verdict => ({ verdict: 'blocked', reason });
const review = (reason: ReasonCode): Verdict => ({ verdict: 'review', reason });

/** 유한·비음 정수 나이인가. NaN·음수·비유한은 false. */
function isUsableAge(age: unknown): age is number {
  return typeof age === 'number' && Number.isFinite(age) && age >= 0;
}

// ── 축 판정기 (선언적 배열) ───────────────────────────────────────────

function ageAxis(profile: UserProfile, policy: Policy): Verdict {
  const { ageMin, ageMax } = policy;
  // 정책 연령 양쪽 불명:
  //  - 전국민(isNationwide) 정책 → '연령 무관'으로 간주 → PASS. 온통청년 DB의 전국 대상 정책은
  //    연령 상·하한이 없는 경우가 많아(예: 전국민 마음투자), 불명을 일률 review로 묶으면 받을 수
  //    있는 정책이 통째로 숨는다. '추정' 고지·원문 확인은 결과 카드가 담당(사용자 승인 2026-06-25).
  //  - 비전국(지역) 정책의 연령 불명 → 기준 누락 가능성이 높아 기존대로 보수적 review.
  if (ageMin === null && ageMax === null) {
    return policy?.isNationwide === true ? PASS : review('AGE_UNKNOWN');
  }
  // 프로필 나이 사용 불가(미입력 undefined/NaN/음수/비유한) → review(보수, 탈락 아님).
  // UserProfile.age는 optional(age?: number) — UI가 미입력을 undefined로 넘겨도 여기서 안전 흡수.
  if (!isUsableAge(profile?.age)) return review('AGE_UNKNOWN');
  const age = profile.age;
  if (ageMin !== null && age < ageMin) return blocked('AGE_BELOW_MIN');
  if (ageMax !== null && age > ageMax) return blocked('AGE_ABOVE_MAX');
  return PASS;
}

function incomeAxis(profile: UserProfile, policy: Policy): Verdict {
  const inc: IncomeCriteria | undefined = policy?.income;
  if (!inc || typeof inc !== 'object') return review('INCOME_UNKNOWN');
  if (inc.kind === 'none') return PASS;
  if (inc.kind === 'unknown') return review('INCOME_UNKNOWN');

  const userIncome = profile?.income;
  if (inc.kind === 'medianRatio') {
    // 비유한 상한(NaN/Infinity)은 비교 시 false→PASS로 새므로(false-accept) 추정 불가 → review.
    if (typeof inc.maxRatio !== 'number' || !Number.isFinite(inc.maxRatio)) {
      return review('INCOME_UNKNOWN');
    }
    const ratio = userIncome?.medianRatio;
    if (typeof ratio !== 'number' || !Number.isFinite(ratio)) {
      return review('INCOME_PROFILE_MISSING');
    }
    return ratio > inc.maxRatio ? blocked('INCOME_OVER_LIMIT') : PASS;
  }
  if (inc.kind === 'amountMax') {
    // 비유한 상한(NaN/Infinity)은 비교 시 false→PASS로 새므로(false-accept) 추정 불가 → review.
    if (typeof inc.maxAmount !== 'number' || !Number.isFinite(inc.maxAmount)) {
      return review('INCOME_UNKNOWN');
    }
    const amount = userIncome?.amount;
    if (typeof amount !== 'number' || !Number.isFinite(amount)) {
      return review('INCOME_PROFILE_MISSING');
    }
    return amount > inc.maxAmount ? blocked('INCOME_OVER_LIMIT') : PASS;
  }
  // 알 수 없는 kind → review(보수)
  return review('INCOME_UNKNOWN');
}

function regionAxis(profile: UserProfile, policy: Policy): Verdict {
  if (policy?.isNationwide === true) return PASS;
  const codes = Array.isArray(policy?.regionCodes) ? policy.regionCodes : [];
  // 전국 아님 + 지역 코드 불명 → review (불명 ≠ 전국)
  if (codes.length === 0) return review('REGION_UNKNOWN');
  const userCode = profile?.regionCode;
  if (typeof userCode !== 'string' || userCode.length === 0) {
    return review('REGION_PROFILE_MISSING');
  }
  return codes.includes(userCode) ? PASS : blocked('REGION_MISMATCH');
}

function recruitAxis(status: RecruitStatus): Verdict {
  if (status === 'closed') return blocked('RECRUIT_CLOSED');
  if (status === 'unknown') return review('RECRUIT_UNKNOWN');
  // now / soon → 통과(시점 분류는 버킷 결정에 별도 사용)
  return PASS;
}

// ── 평가 본체 ────────────────────────────────────────────────────────

function safeRecruitStatus(policy: Policy, deps: EvaluateDeps): RecruitStatus {
  try {
    return recruitStatus(policy?.recruit, { now: deps.now, soonWithinDays: deps.soonWithinDays });
  } catch {
    return 'unknown';
  }
}

function evaluateOne(
  profile: UserProfile,
  policy: Policy,
  deps: EvaluateDeps,
): EvaluatedPolicy {
  const status = safeRecruitStatus(policy, deps);

  const ageV = ageAxis(profile, policy);
  const incomeV = incomeAxis(profile, policy);
  const regionV = regionAxis(profile, policy);
  const recruitV = recruitAxis(status);
  const verdicts: Verdict[] = [ageV, incomeV, regionV, recruitV];

  // 축별 verdict 노출(D-① 카드 체크리스트). 버킷 분류에는 관여하지 않음(순수 추가).
  const axes: AxisResult[] = [
    toAxisResult('age', ageV),
    toAxisResult('income', incomeV),
    toAxisResult('region', regionV),
    toAxisResult('recruit', recruitV),
  ];

  // 배타·순서 규칙(programKey 있을 때만). throw-free.
  let ruleReasons: ReasonCode[] = [];
  try {
    ruleReasons = applyRules(profile, policy, PROGRAM_RULES);
  } catch {
    ruleReasons = [];
  }

  // 사유 수집(우선순위 합성)
  const blockedReasons: ReasonCode[] = [];
  const reviewReasons: ReasonCode[] = [];
  for (const v of verdicts) {
    if (v.verdict === 'blocked') blockedReasons.push(v.reason);
    else if (v.verdict === 'review') reviewReasons.push(v.reason);
  }
  for (const r of ruleReasons) {
    if (isBlockedReason(r)) blockedReasons.push(r);
    else reviewReasons.push(r);
  }

  if (blockedReasons.length > 0) {
    // blocked > review (헛희망 차단): 누적된 review 사유도 함께 노출
    return { policy, reasons: [...blockedReasons, ...reviewReasons], recruitStatus: status, axes };
  }
  if (reviewReasons.length > 0) {
    return { policy, reasons: reviewReasons, recruitStatus: status, axes };
  }
  // 전축 통과 → 모집 시점으로 now/soon
  return { policy, reasons: [], recruitStatus: status, axes };
}

/** Verdict(축 내부 표현) → AxisResult(계약 노출용). reason은 pass면 생략. */
function toAxisResult(axis: AxisKind, v: Verdict): AxisResult {
  return v.verdict === 'pass' ? { axis, verdict: 'pass' } : { axis, verdict: v.verdict, reason: v.reason };
}

const BLOCKED_REASONS = new Set<ReasonCode>([
  'AGE_BELOW_MIN',
  'AGE_ABOVE_MAX',
  'INCOME_OVER_LIMIT',
  'REGION_MISMATCH',
  'RECRUIT_CLOSED',
  'DUPLICATE_EXCLUSIVE',
  'PREREQ_NOT_MET',
]);

function isBlockedReason(r: ReasonCode): boolean {
  return BLOCKED_REASONS.has(r);
}

/** 깨진 정책(필수 형태 결손)인지 — 보수적으로 review 처리하기 위한 판별. */
function isStructurallyBroken(policy: unknown): boolean {
  if (!policy || typeof policy !== 'object') return true;
  const p = policy as Partial<Policy>;
  if (typeof p.id !== 'string') return true;
  if (!p.income || typeof p.income !== 'object') return true;
  if (!p.recruit || typeof p.recruit !== 'object') return true;
  if (!('ageMin' in p) || !('ageMax' in p)) return true;
  return false;
}

export function evaluate(
  profile: UserProfile,
  policies: Policy[],
  deps: EvaluateDeps,
): EvaluateResult {
  const result: EvaluateResult = { now: [], soon: [], blocked: [], review: [] };
  if (!Array.isArray(policies)) return result;

  for (const policy of policies) {
    let evaluated: EvaluatedPolicy;
    if (isStructurallyBroken(policy)) {
      // 누락 금지: 깨진 정책도 review로 보존(throw 금지)
      evaluated = {
        policy: policy as Policy,
        reasons: ['RECRUIT_UNKNOWN'],
        recruitStatus: 'unknown',
      };
    } else {
      try {
        evaluated = evaluateOne(profile, policy, deps);
      } catch {
        evaluated = { policy, reasons: ['RECRUIT_UNKNOWN'], recruitStatus: 'unknown' };
      }
    }

    if (evaluated.reasons.length > 0) {
      const hasBlocked = evaluated.reasons.some(isBlockedReason);
      if (hasBlocked) result.blocked.push(evaluated);
      else result.review.push(evaluated);
    } else if (evaluated.recruitStatus === 'soon') {
      result.soon.push(evaluated);
    } else {
      result.now.push(evaluated);
    }
  }

  return result;
}
