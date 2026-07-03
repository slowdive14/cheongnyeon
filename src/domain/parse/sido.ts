/**
 * 법정동 시·도 2자리 코드 ↔ 명칭·검출 (스코프 확장 P2A).
 *  - 실 온통 zipCd 샘플(2026-06-28)로 확정: 17개 prefix, 강원=51·전북=52(신규 특별자치도 코드, 42/45 없음).
 *  - 시·도 단위(2자리)로 운영. 시군구(5자리)는 후속.
 */
export interface Sido {
  code: string;
  name: string;
  /** regionText에서 해당 시·도를 검출하는 패턴(정규 명칭·약칭). */
  re: RegExp;
}

export const SIDO_LIST: ReadonlyArray<Sido> = [
  { code: '11', name: '서울특별시', re: /서울/ },
  { code: '26', name: '부산광역시', re: /부산/ },
  { code: '27', name: '대구광역시', re: /대구/ },
  { code: '28', name: '인천광역시', re: /인천/ },
  { code: '29', name: '광주광역시', re: /광주/ },
  { code: '30', name: '대전광역시', re: /대전/ },
  { code: '31', name: '울산광역시', re: /울산/ },
  { code: '36', name: '세종특별자치시', re: /세종/ },
  { code: '41', name: '경기도', re: /경기/ },
  { code: '43', name: '충청북도', re: /충청북도|충북/ },
  { code: '44', name: '충청남도', re: /충청남도|충남/ },
  { code: '46', name: '전라남도', re: /전라남도|전남/ },
  { code: '47', name: '경상북도', re: /경상북도|경북/ },
  { code: '48', name: '경상남도', re: /경상남도|경남/ },
  { code: '50', name: '제주특별자치도', re: /제주/ },
  { code: '51', name: '강원특별자치도', re: /강원/ },
  { code: '52', name: '전북특별자치도', re: /전북|전라북도/ },
];

const SIDO_BY_CODE: ReadonlyMap<string, Sido> = new Map(SIDO_LIST.map((s) => [s.code, s]));

/** zipCd 2자리 prefix → 시·도 정식 명칭. 미지정 prefix는 undefined. */
export function sidoNameByPrefix(prefix: string): string | undefined {
  return SIDO_BY_CODE.get(typeof prefix === 'string' ? prefix.trim() : '')?.name;
}
