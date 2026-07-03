import type { RecruitWindow } from '../types';
import { asNonEmptyString } from './primitives';

/**
 * 모집기간 파싱·보존만 한다. 상태 분류(now/soon/closed)는 Phase 3로 위임.
 * Date.now()를 쓰지 않는다(순수). Invalid Date는 null로 방어.
 */
/** 한쪽 날짜 입력의 파싱 결과. raw=원문 토큰(없으면 null), iso=파싱 성공 시 ISO(실패 시 null). */
interface DatePart {
  raw: string | null;
  iso: string | null;
}

function part(raw: string | null): DatePart {
  return { raw, iso: toIsoOrNull(raw) };
}

export function parseRecruit(r: Record<string, unknown>): RecruitWindow {
  const startDirect = asNonEmptyString(r.recruitStartText);
  const endDirect = asNonEmptyString(r.recruitEndText);

  if (startDirect !== null || endDirect !== null) {
    return reconcile(part(startDirect), part(endDirect));
  }

  const text = asNonEmptyString(r.recruitText);
  if (text === null) {
    return { kind: 'unknown', start: null, end: null };
  }

  if (/상시|연중|수시/.test(text)) {
    return { kind: 'always', start: null, end: null };
  }

  const dates = text.match(/\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}/g);
  if (dates && dates.length >= 1) {
    return reconcile(part(dates[0] ?? null), part(dates[1] ?? null));
  }

  return { kind: 'unknown', start: null, end: null };
}

/** 날짜 문자열을 ISO(YYYY-MM-DD)로. 달력상 무효(2026-13-99, 2026-02-30 등)는 null. */
export function toIsoOrNull(s: string | null): string | null {
  if (s === null) return null;
  const norm = s.trim().replace(/[./]/g, '-');
  const m = norm.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() !== month - 1 ||
    dt.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * 모집기간 일관성. 보수 규칙:
 *  - 입력이 있었으나 파싱 실패한 쪽이 하나라도 있으면 unknown(침묵의 dated 금지) — 무효 사유를 dated에 가리지 않는다.
 *  - 둘 다 입력 없음(null) → unknown.
 *  - 둘 다 유효하고 end<start면 역전 → unknown.
 *  - 그 외(유효 1개 이상, 파싱 실패 없음) → dated.
 * "입력 없음(raw=null)"과 "입력은 있었으나 깨짐(raw!=null && iso=null)"을 구분한다.
 */
function reconcile(start: DatePart, end: DatePart): RecruitWindow {
  const startFailed = start.raw !== null && start.iso === null;
  const endFailed = end.raw !== null && end.iso === null;
  if (startFailed || endFailed) {
    return { kind: 'unknown', start: null, end: null };
  }
  if (start.iso === null && end.iso === null) {
    return { kind: 'unknown', start: null, end: null };
  }
  if (start.iso !== null && end.iso !== null && end.iso < start.iso) {
    return { kind: 'unknown', start: null, end: null };
  }
  return { kind: 'dated', start: start.iso, end: end.iso };
}
