/**
 * 마음건강 하드필터 식별 — 온통청년·서울 청년몽땅 공용 SSOT.
 *
 * 정밀도 우선(과탐 차단): 범용 키워드('맞춤형상담서비스')가 무관 정책(창업·축제 등)에
 * 광범위 부착돼 있어 단순 '상담' 매칭은 과탐. 두 갈래로 한정한다.
 *  - (A) 강한 복합어: 마음건강/정신건강/심리상담·자살예방/은둔청년/고립청년 → 분류 무관 단독 인정.
 *  - (B) 공식 중분류 '건강' + 마음건강 용어(심리/정신/마음/정서/우울/불안/자살/고립/은둔).
 */
const MH_STRONG =
  /마음\s*건강|정신\s*건강|심리\s*(상담|지원|치료|검사|정서)|자살\s*예방|은둔\s*형?\s*청년|고립\s*청년/;
const MH_TERM = /심리|정신|마음|정서|우울|불안|스트레스|자살|고립|은둔/;

/**
 * 제목(+선택 중분류)으로 마음건강 하드필터 대상 여부를 판정한다.
 * @param title 정책 제목
 * @param midCategory 공식 중분류명(온통 mclsfNm 등). 없으면 강한 복합어만으로 판정.
 */
export function isMentalHealthTitle(title: string, midCategory = ''): boolean {
  const t = typeof title === 'string' ? title : '';
  const m = typeof midCategory === 'string' ? midCategory : '';
  return MH_STRONG.test(t) || (m.includes('건강') && MH_TERM.test(t));
}
