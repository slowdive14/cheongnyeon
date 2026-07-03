/**
 * 프로필 입력 순수 헬퍼(T3) — 시·도 옵션 소스 + 나이/시·도 문자열 파서.
 *
 * 설계:
 *  - SIDO_LIST 재사용(신규 테이블 금지). 옵션은 sido.ts 단일 진실 원천에서 파생.
 *  - 순수·throw-free: 어떤 문자열 입력에도 예외 없이 정규화값 또는 undefined 반환.
 *
 * 안전(S5 · 보수 파서 이중 방어):
 *  - 나이는 정수·비음만 통과. 음수/비정수/비수치/공백/미입력은 undefined로 정규화한다.
 *    → 도메인 eligibility.isUsableAge가 review 폴백(false-accept 없음)하고, UI 파서가
 *      애초에 오염값을 profile.age로 흘리지 않아 이중 방어.
 *  - 시·도는 SIDO_LIST에 존재하는 코드만 통과. '선택 안 함'(빈 문자열)·미지 코드는 undefined
 *    → regionAxis가 REGION_PROFILE_MISSING로 보수 판정(REGION_MISMATCH blocked로 새지 않음).
 */

import { SIDO_LIST } from '@/domain/parse/sido';

export interface SidoOption {
  /** 시·도 2자리 코드. '선택 안 함'은 빈 문자열. */
  code: string;
  /** 화면 표시 명칭. */
  name: string;
}

/** SIDO_LIST에 존재하는 코드 집합(파서 방어용). */
const SIDO_CODE_SET: ReadonlySet<string> = new Set(SIDO_LIST.map((s) => s.code));

/**
 * <select> 옵션 소스. 선두에 '선택 안 함'(value='') + SIDO_LIST 17개.
 * 길이 18. 매 호출 새 배열(불변 데이터라 참조 공유 불필요, 호출부에서 memo 권장).
 */
export function sidoOptions(): SidoOption[] {
  return [
    { code: '', name: '선택 안 함' },
    ...SIDO_LIST.map((s) => ({ code: s.code, name: s.name })),
  ];
}

/**
 * 나이 문자열 → number | undefined. 정수·비음만 통과(UI 이중 방어).
 * 빈칸/공백/비수치/비정수/음수 → undefined.
 */
export function parseAgeInput(raw: string): number | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;
  // 부분 숫자('12abc') 거부: 순수 정수 형식만 허용(선행 0·부호 없는 자연수/0).
  if (!/^\d+$/.test(trimmed)) return undefined;
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < 0) return undefined;
  return n;
}

/**
 * 시·도 문자열 → 코드 | undefined. SIDO_LIST에 존재하는 코드만 통과.
 * 빈 문자열('선택 안 함')·미지 코드 → undefined(REGION_PROFILE_MISSING 유도).
 */
export function parseSidoCode(raw: string): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;
  return SIDO_CODE_SET.has(trimmed) ? trimmed : undefined;
}
