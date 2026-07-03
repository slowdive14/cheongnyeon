import type { ReasonCode } from '../eligibility';

/**
 * 프로그램(사업) 식별 키. 배타·순서 규칙의 대상 식별자.
 * Policy.programKey가 null이면 어떤 규칙의 대상도 아니다(자격 4축만 적용).
 */
export type ProgramKey =
  | 'youth_allowance'
  | 'youth_challenge'
  | 'kuk_chwi'
  | 'monthly_rent';

/** 배타(상호 중복 불가) 규칙. group 내 한 사업에 참여 중이면 다른 사업은 부적격. */
export interface ExclusionRule {
  kind: 'mutual_exclusive';
  group: ProgramKey[];
  reason: ReasonCode;
}

/** 순서(선행 수료 필요) 규칙. target 신청에는 requires 사업 수료가 선행되어야 한다. */
export interface SequenceRule {
  kind: 'sequence';
  target: ProgramKey;
  requires: ProgramKey;
  reason: ReasonCode;
}

export type ProgramRule = ExclusionRule | SequenceRule;

/**
 * 선언적 규칙 테이블.
 * ⚠ 배타 그룹 범위(4개 전부 vs 일부 쌍)는 정책 원문 미확정 — 잠정값.
 *   원문 확정 시 group을 좁혀야 한다(현재는 4개 전부 상호배타 가정).
 */
export const PROGRAM_RULES: ProgramRule[] = [
  {
    kind: 'mutual_exclusive',
    group: ['youth_allowance', 'youth_challenge', 'kuk_chwi', 'monthly_rent'],
    reason: 'DUPLICATE_EXCLUSIVE',
  },
  {
    kind: 'sequence',
    target: 'kuk_chwi',
    requires: 'youth_challenge',
    reason: 'PREREQ_NOT_MET',
  },
];
