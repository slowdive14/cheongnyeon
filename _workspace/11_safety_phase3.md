# Safety & Domain Audit — Phase 3 (자격 매칭 추정 엔진)

판정: **조건부 통과** — High 0. 핵심 불변식(미확인→review, unknown≠none, 불명지역≠전국, blocked>review, throw-free) 코드·테스트·런타임 프로브 3중 교차로 성립. Med 1건(비유한 소득상한 false-accept) 머지 전 권고.

게이트: `vitest run test/unit/domain` 4파일 119통과, `tsc -b` exit 0.

## 1. 불변식 데이터 흐름 추적 (7개)
| # | 불변식 | 판정 | 근거 |
|---|---|---|---|
| 1 | 미확인→review ★ | 통과 | A-9/B-8~10/C-4/5/D-5/RULE-3/SEQ-3/P-1/EX-3/4 녹색. 프로브: 빈프로필+지역정책→review[AGE_UNKNOWN,REGION_PROFILE_MISSING], false reject 0 |
| 2 | unknown≠none(소득) | 통과 | incomeAxis L82(none→PASS)/L83(unknown→review) 물리 분리. 프로브: `{}`·`weird`·maxRatio누락 전부 INCOME_UNKNOWN. none 흡수 0 |
| 3 | 불명지역≠전국 | 통과 | regionAxis L107 `isNationwide===true`만 PASS(엄격). 프로브: 문자열 "true"→review, []+false→REGION_UNKNOWN, null→review |
| 4 | 모집창 invalid→unknown | 통과 | RX-1~4·R1-b·D-5. recruitStatus L38-48 파싱실패/역전/양쪽null→unknown |
| 5 | blocked>review(헛희망차단) | 통과 | P-2 + 프로브: 마감+나이불명→blocked[RECRUIT_CLOSED,AGE_UNKNOWN](review 안 끌려감) |
| 6 | 사유 설명가능 | 통과 | 불변식 테스트 reasons≥1 강제, now/soon=[] |
| 7 | throw-free | 통과 | EX/RX + 3중 try/catch + isStructurallyBroken. null정책/null now/Invalid Date 무크래시 |

## 2. High: 없음
판단지점 3·4·5 전부 안전 방향 보수적(review 보존)→false reject/accept 미발생.

## 3. Med (머지 전 권고)
**M3-1 — 비유한 소득상한 false-accept (방어 공백).** eligibility.ts incomeAxis L87/L95. 프로브: 정책 `maxRatio:NaN`→`now`(false accept), `maxAmount:Infinity`→전원 now. 가드가 `typeof!=='number'`만 검사하나 NaN/Infinity는 number 타입→통과. **현 파이프라인 미발현**(상류 parseIncome `\d+`, narrowIncome `Number.isFinite` 차단)이나 엔진=최후방어선이라 캐시오염/타 caller/LLM 직주입 시 부적격 통과→Med. 수정: 가드를 `!Number.isFinite()`로 강화, 비유한→review('INCOME_UNKNOWN'). RED: B-11(maxRatio=NaN→review), B-12(maxAmount=Infinity→review).

## 4. Low / 의미 정합성
- **L3-1**: EX-3/4 깨진정책에 `RECRUIT_UNKNOWN` 사유 — review보존은 옳으나 결손원인이 모집무관이라 거짓사유. 전용 `DATA_INCOMPLETE`(review군) 권고. Phase 6 UI 연결 전 처리.
- **L3-2**: RULE-4 재참여 `PREREQ_UNKNOWN` 재사용 — "선행불명"아닌 "재참여불명". 전용 `REENTRY_UNKNOWN` 권고. 우선순위 낮음.
- **L3-3**: 비유한 `deps.now`→recruitStatus가 `now`(false accept). caller 주입이라 Low. `isValid(deps.now)` 실패→unknown 권고. ※code-reviewer M-1과 **수렴**.
- **L3-4**: PROGRAM_RULES 배타 4개 전부 잠정(주석에 미확정 명시 OK). 위험방향 false reject지만 발동조건이 activePrograms 실재시만+미입력은 review라 범위 제한적. 머지 차단 아님, 원문 확정 TODO.

## 5. 양호(회귀가드 가치)
amountMax:0/user 0→now(0 falsy 오취급 없음). regionCodes:null→Array.isArray 가드 review. 비키 active문자열→충돌 아님 정확통과.

## 6. 누락 안전 테스트 (RED)
1. (M3-1 필수) B-11/B-12 비유한 상한→review INCOME_UNKNOWN.
2. (L3-1) EX-3 DATA_INCOMPLETE 사유 단언(전용코드 도입 시).
3. (L3-3) recruitStatus deps.now=Invalid→unknown.
4. 규칙×review 누적: 배타 blocked+소득 unknown→blocked 유지+INCOME_UNKNOWN 누적(현 P시리즈 미커버).

## 7. 인수인계 경고 (다음 Phase)
Phase 3는 순수 엔진, evaluate 호출자 없음. 위기 라우팅·'추정' 고지푸터·109/1577-0199·blocked 비노출(대안갈래)은 UI 통합 phase 책임(이 코드 부재 정당). **단 다음 플래너에 안전포인트 전달:** blocked 버킷이 빨간결과로 직출력 금지, 전 카드에 고지+원문링크(sourceUrl)+업데이트시각. EvaluatedPolicy.policy가 sourceUrl/regionText/income.raw 보존→고지 근거 데이터 준비됨(양호).
