import { differenceInCalendarDays, parseISO, isValid, startOfDay } from 'date-fns';
import type { RecruitWindow, RecruitStatus } from './types';

/**
 * 모집 상태 계산기 (Task 3.5).
 * 순수·throw-free. clock은 deps.now로만 주입(Date.now()/new Date() 내부 호출 금지).
 * 비교는 날짜(calendar day) 단위.
 */
export interface RecruitStatusDeps {
  now: Date;
  /** soon 임계 일수, 기본 7 */
  soonWithinDays?: number;
}

/** ISO(YYYY-MM-DD) 문자열을 Date로. 유효하지 않으면 null. */
function parseDateOrNull(s: string | null | undefined): Date | null {
  if (typeof s !== 'string' || s.length === 0) return null;
  const d = parseISO(s);
  return isValid(d) ? startOfDay(d) : null;
}

export function recruitStatus(
  window: RecruitWindow,
  deps: RecruitStatusDeps,
): RecruitStatus {
  if (window === null || typeof window !== 'object') return 'unknown';
  // Invalid clock은 differenceInCalendarDays를 NaN으로 만들어 마감 정책이 now로 새므로 방어.
  if (!isValid(deps?.now)) return 'unknown';

  const soonWithin = deps.soonWithinDays ?? 7;
  const now = startOfDay(deps.now);

  if (window.kind === 'always') return 'now';
  if (window.kind !== 'dated') return 'unknown';

  const start = parseDateOrNull(window.start);
  const end = parseDateOrNull(window.end);

  // 입력이 있었으나 파싱 실패한 쪽이 있으면 unknown(방어)
  const startBroken = typeof window.start === 'string' && window.start.length > 0 && start === null;
  const endBroken = typeof window.end === 'string' && window.end.length > 0 && end === null;
  if (startBroken || endBroken) return 'unknown';

  // 둘 다 없음 → unknown
  if (start === null && end === null) return 'unknown';

  // 역전(start > end) → unknown
  if (start !== null && end !== null && differenceInCalendarDays(end, start) < 0) {
    return 'unknown';
  }

  // 시작 미래 → soon (R4: 예정·임박 신호)
  if (start !== null && differenceInCalendarDays(start, now) > 0) {
    return 'soon';
  }

  // end 없음 + start 과거/오늘 → now
  if (end === null) return 'now';

  // end 기준 분류
  const remaining = differenceInCalendarDays(end, now);
  if (remaining < 0) return 'closed';
  if (remaining <= soonWithin) return 'soon';
  return 'now';
}
