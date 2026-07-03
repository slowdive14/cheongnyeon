import type { IncomeCriteria } from '../types';
import { asNonEmptyString } from './primitives';

/**
 * 소득 조건 파싱. 안전: 불명(unknown)과 무관(none)을 절대 동일시하지 않는다.
 * 텍스트 누락 → unknown. 숫자 없는 텍스트 → unknown + raw 보존.
 */
export function parseIncome(r: Record<string, unknown>): IncomeCriteria {
  const text = asNonEmptyString(r.incomeText);

  if (text === null) {
    return { kind: 'unknown', raw: null };
  }

  // 1) 구체 제약 신호를 먼저 시도한다. 혼합문("중위소득 150% 또는 소득 무관")에서
  //    '무관' 부분일치가 상한을 가려 소실시키지 않도록 medianRatio가 우선한다.
  const median = text.match(/중위소득\s*(\d+)\s*%/);
  if (median && median[1] !== undefined) {
    return { kind: 'medianRatio', maxRatio: Number(median[1]), raw: text };
  }

  // TODO(확인필요): amountMax(금액 상한) 표기 패턴은 Phase 2 실측 후 추가. 현재는 unknown 보수 처리.

  // 2) 무관/제한없음은 fallback. 부분일치("무관하게 지원" 류 안내문)는 오탐이므로 앵커 매칭으로 한정한다.
  //    소득 자격을 직접 해제하는 정형(문자열 끝에 종결)만 none.
  if (isIncomeUnrestricted(text)) {
    return { kind: 'none', raw: text };
  }

  // 숫자 없는 텍스트(예: "별도 심사 후 결정") · 미커버 → unknown(보수) + raw 보존
  return { kind: 'unknown', raw: text };
}

/**
 * 소득 자격을 직접 해제하는 정형만 true.
 * "무관/제한 없음/상관 없음"이 문자열 끝에 앵커될 때만 인정해
 * "소득과 무관하게 지원" 같은 안내문의 부분일치 오탐을 차단한다.
 */
function isIncomeUnrestricted(text: string): boolean {
  return /(무관|제한\s*없음|상관\s*없음)\s*$/.test(text);
}
