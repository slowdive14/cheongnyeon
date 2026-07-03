import { asNonEmptyString } from './primitives';
import { SIDO_LIST } from './sido';

export interface RegionInfo {
  regionCodes: string[];
  regionText: string | null;
  isNationwide: boolean;
}

/**
 * 지역 파싱. 안전: 불명 ≠ 전국. 누락 시 빈 배열 + 전국 false(보수).
 * P2A: 17개 시·도 전면 식별(법정동 2자리 코드). 시군구는 후속.
 */
export function parseRegion(r: Record<string, unknown>): RegionInfo {
  const text = asNonEmptyString(r.regionText);

  if (text === null) {
    return { regionCodes: [], regionText: null, isNationwide: false };
  }

  // 시·도 식별은 전국 여부와 독립적으로 수행한다("서울 거주, 전국체전 입상자 우대"처럼 공존 가능).
  // 다수 시·도 동시 명시(예: "서울특별시 부산광역시")는 모두 수집한다.
  const regionCodes: string[] = [];
  for (const s of SIDO_LIST) {
    if (s.re.test(text) && !regionCodes.includes(s.code)) regionCodes.push(s.code);
  }

  return { regionCodes, regionText: text, isNationwide: isNationwideText(text) };
}

/**
 * 전국 대상 여부. 부분일치("전국체전")로 인한 오탐을 막기 위해
 * "전국"이 지역 지정 단위로 쓰인 경우(문자열 끝, 공백/구두점 뒤, 또는 거주·대상 맥락 토큰 앞)만 인정한다.
 * "전국체전 입상자"는 "전국" 뒤에 다른 단어(체전)가 이어지므로 전국 대상이 아니다.
 */
function isNationwideText(text: string): boolean {
  return /전국(?=$|[\s,./]|청년|민|단위|거주|대상|일원)/.test(text);
}
