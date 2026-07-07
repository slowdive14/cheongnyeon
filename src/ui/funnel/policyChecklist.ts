import type { AxisResult, AxisKind } from '@/domain/eligibility';
import type { Policy, UserProfile } from '@/domain/types';
import { sidoNameByPrefix } from '@/domain/parse/sido';

/**
 * T-D1b — "나와 맞는 점" 체크리스트 문구 매핑(순수).
 *
 * 안전(DESIGN §7-4):
 *  - pass 축은 "충족/제한 없음" 사실 서술로만. "자격이 됩니다/안 됩니다" 류 단정 금지.
 *    ※ '추정' 성격은 카드 하단 DisclaimerNote가 1회 고지(단일 출처) — 항목마다 "(추정)" 중복 표기하지 않는다.
 *  - review 축은 "원문에서 확인" 보수 문구. 부적격/탈락 단정 금지.
 *  - blocked 축은 애초에 카드가 미노출(blocked 버킷 필터)이므로 여기서 항목화하지 않는다(pass/review만).
 *
 * 문구 소스(Q-2 리더 확정):
 *  - 지역명: sidoNameByPrefix(policy.regionCodes[0]) 매핑(regionText 자유서식 불균질 회피).
 *  - 나이: policy.ageMin/ageMax.
 */
export type ChecklistMark = 'pass' | 'review';

export interface ChecklistItem {
  axis: AxisKind;
  mark: ChecklistMark;
  text: string;
}

function ageText(policy: Policy, profile: UserProfile | undefined): string {
  const { ageMin, ageMax } = policy;
  // 양쪽 무제한(전국민형): "나이 나이 무관" 라벨 중복·"내 나이 충족" 동어반복 회피(라이브 발견).
  if (typeof ageMin !== 'number' && typeof ageMax !== 'number') return '나이 제한 없음';
  let range: string;
  if (typeof ageMin === 'number' && typeof ageMax === 'number') range = `${ageMin}~${ageMax}세`;
  else if (typeof ageMin === 'number') range = `${ageMin}세 이상`;
  else range = `${ageMax}세 이하`;
  const myAge = typeof profile?.age === 'number' && Number.isFinite(profile.age) ? profile.age : null;
  return myAge !== null ? `나이 ${range} — 내 나이 ${myAge}세 충족` : `나이 ${range} 충족`;
}

function regionText(policy: Policy): string {
  if (policy.isNationwide === true) return '전국 대상 — 지역 충족';
  const first = Array.isArray(policy.regionCodes) ? policy.regionCodes[0] : undefined;
  const name = typeof first === 'string' ? sidoNameByPrefix(first) : undefined;
  return name ? `${name} 거주 — 내 지역 충족` : '거주 지역 충족';
}

/** pass 축 → 사람 문구. */
function passText(axis: AxisKind, policy: Policy, profile: UserProfile | undefined): string | null {
  switch (axis) {
    case 'age':
      return ageText(policy, profile);
    case 'region':
      return regionText(policy);
    case 'income':
      // 소득 pass는 소득 무관(none) 정책에서만 발생(소득 미입력 시 상한 정책은 review). → "제한 없음"이 정확.
      return '소득 제한 없음';
    case 'recruit':
      // 모집 시점은 상태 배지(지금/곧)가 담당 — 체크리스트 중복 노출 회피.
      return null;
    default:
      return null;
  }
}

/** review 축 → 확인 안내 문구(보수). */
const REVIEW_TEXT: Record<AxisKind, string> = {
  age: '나이 조건 — 원문에서 확인',
  income: '소득 조건 — 원문에서 확인',
  region: '거주 지역 — 원문에서 확인',
  recruit: '모집 시기 — 원문에서 확인',
};

/**
 * axes → 체크리스트 항목. pass는 ✓, review는 ?로. blocked·recruit-pass는 제외.
 * axes 미보유(구 데이터)·비배열 → 빈 배열(throw 0).
 */
export function buildChecklist(
  axes: AxisResult[] | undefined,
  policy: Policy | undefined,
  profile: UserProfile | undefined,
): ChecklistItem[] {
  if (!Array.isArray(axes) || !policy) return [];
  const items: ChecklistItem[] = [];
  for (const a of axes) {
    if (a.verdict === 'pass') {
      const text = passText(a.axis, policy, profile);
      if (text) items.push({ axis: a.axis, mark: 'pass', text });
    } else if (a.verdict === 'review') {
      items.push({ axis: a.axis, mark: 'review', text: REVIEW_TEXT[a.axis] });
    }
    // blocked → 제외(카드 미노출 불변).
  }
  return items;
}
