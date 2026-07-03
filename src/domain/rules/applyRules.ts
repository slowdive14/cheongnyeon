import type { Policy, UserProfile } from '../types';
import type { ReasonCode } from '../eligibility';
import type { ProgramRule, ProgramKey } from './programRules';

/**
 * 배타·순서 규칙 적용기 (Task 3.4b / 3.6).
 * 순수·throw-free. 선언적 PROGRAM_RULES를 순회해 ReasonCode[]를 반환한다.
 *
 * 안전 핵심: 이력 미입력(undefined)은 추정 통과/탈락 없이 review(PREREQ_UNKNOWN).
 *  - 빈 배열([])은 "이력 없음(확인됨)"으로 취급(통과/탈락 판정 가능).
 *  - undefined는 "미확인"으로 취급 → review.
 */
export function applyRules(
  profile: UserProfile,
  policy: Policy,
  rules: ProgramRule[],
): ReasonCode[] {
  const key = policy?.programKey;
  // programKey 없음/null → 규칙 비대상(자격 4축만)
  if (key === null || key === undefined) return [];

  const reasons: ReasonCode[] = [];
  for (const rule of rules) {
    const r = applyOne(profile, key, rule);
    if (r !== null) reasons.push(r);
  }
  return reasons;
}

function applyOne(
  profile: UserProfile,
  key: ProgramKey,
  rule: ProgramRule,
): ReasonCode | null {
  if (rule.kind === 'mutual_exclusive') {
    if (!rule.group.includes(key)) return null;
    const active = profile?.activePrograms;
    // 미확인 → review(PREREQ_UNKNOWN)
    if (!Array.isArray(active)) return 'PREREQ_UNKNOWN';
    // 자신을 제외한 그룹 내 사업에 참여 중이면 배타 → blocked.
    // 동일 사업 재참여(자신과 동일 키)는 잠정 review(확인 필요).
    if (active.includes(key)) return 'PREREQ_UNKNOWN';
    const conflict = active.some((a) => rule.group.includes(a as ProgramKey) && a !== key);
    return conflict ? rule.reason : null;
  }

  if (rule.kind === 'sequence') {
    if (rule.target !== key) return null;
    const completed = profile?.completedPrograms;
    // 미확인 → review
    if (!Array.isArray(completed)) return 'PREREQ_UNKNOWN';
    return completed.includes(rule.requires) ? null : rule.reason;
  }

  return null;
}
