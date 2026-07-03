# Safety-Domain Audit — Phase 6 (Gemini 레이어)

## 판정: 조건부 차단 (High 3 — 머지 차단). 런타임 적대적 프로브로 실누수 실증.

## 안전 표면별
| 표면 | 결과 |
|---|---|
| 위기 선행 불변식 | 부분통과 — "죽고싶지만 정책 알려줘"/"우울+자해"/"자살+지원금" crisis=true·spy 호출0. **"버틸 힘이 없어" 누수(H-1)** |
| 거짓음성0 | 부분통과 — CR-1~33 회귀0, layer-1 우선 유지(CA-7/8). **UI 실시간은 layer-1 단독→완곡 누수(H-1)** |
| explain 그라운딩 | 부분통과 — 위조 URL/숫자/광역시명/긍정단정/"확실히"/"무조건" 거부. **부정단정(H-2)·시군구(H-3) 누수** |
| '추정' 고지 | 통과 |
| degrade | 통과 (키없음 EMPTY_ENV, 동적 import 격리, layer-1 키무관) |
| 키 비노출 | 통과 (type=password, draft만 상태, 평문 미표시, 콘솔0) |
| M1 푸터 | 통과 (비위기 결과화면 한정, 위기화면 충돌0) |
| throw-free | 통과 |

## High (머지 차단)
### H-1 위기 거짓음성 — "버틸 힘이 없어" 완곡 누수 (최대 리스크)
- 위치: `src/domain/crisis/config.ts:69` 클래스 F `/(못|안)\s*버\s*[티틸]/` + `src/ui/funnel/FreeTextInput.tsx:58`
- 실증: `detectCrisisRegex('버틸 힘이 없어 정책 추천해줘').crisis===false`. F는 부정어 선행만, 긍정형+부재 미스.
- 왜 High: FreeTextInput 실시간 위기 라우팅은 detectCrisisRegex(layer-1 동기) **단독**. layer-2 앵커 있어도 UI 타이핑 경로 안 탐 → 위기 청년이 이 문장 입력 시 정책 추천으로 흐름.
- RED: crisisDetect.test.ts `['버틸 힘이 없어'],['버틸 힘이 없다'],['견딜 힘이 없어']`→crisis=true(regex) + freeInput.ui.test.tsx 위기 라우팅.

### H-2 explain 자격 전복 — 부정 단정 누수 (엔진 SSOT 침범)
- 위치: `src/llm/explain.ts:55-61` ASSERTION_PATTERNS
- 실증: LLM "당신은 자격이 안 됩니다." → grounded=true·source=llm 통과. 긍정 단정만 잡고 부정 미스.
- 왜 High: 자격은 엔진 SSOT. 부정 단정도 취약 청년 오도(더 해로움). EX-5는 양방향이어야.
- RED: EX-5b "자격이 안 됩니다", EX-5c "자격이 없습니다", EX-5d "신청 대상이 아닙니다", EX-5e "해당되지 않습니다", EX-5f "받을 수 없어요" → 전부 grounded=false·fallback.

### H-3 explain 환각 — 시·군·구 타지역명 누수 (구현자 플래그 확증)
- 위치: `src/llm/explain.ts:70-71` REGION_TOKEN_RE
- 실증: record regionText='서울'에 LLM "강남구 거주 청년 대상" → grounded=true 통과. 시·군·구가 17 광역시·도 화이트리스트 밖.
- RED: EX-4b "강남구 거주 청년 대상", EX-4c "수원시 청년만", EX-4d "해운대구에서 신청" → grounded=false.

## 일반화 수정 방향 (과적합 금지 — Phase 4 교훈, 의미 클래스로)
1. H-1: 클래스 F를 "버팀 한계" 의미클래스로 — `못/안 버티`에 더해 "버틸/견딜+힘/기력/여력+없/부족/바닥/안남" 부재 서술 흡수. 예 `/(버\s*[틸티]|견\s*[딜디])[^.]{0,6}(힘|기력|여력)[^.]{0,4}(없|부족|바닥|안\s*남|남\s*아?\s*있\s*지?\s*않)/`. ("버티고 있어" 긍정은 미스 유지)
2. H-2: ASSERTION_PATTERNS를 판정단정(긍정∪부정) 양방향 클래스로. 됩/돼/된/있 + 없/안\s*[됩돼] + "대상이 아니/해당 안·없/받을 수 없·있".
3. H-3: 광역시·도 화이트리스트 대신 "행정구역 토큰" 일반 클래스 `[가-힣]{1,4}(시|군|구)(?![가-힣])` 추출→corpus(regionText)에 없으면 거부. grounded 지역(서울) 통과 회귀 필수확인.
세 수정 모두 기존 RED(CR-1~33, EX-1~11) 회귀0 게이트.

## Med/Low
- Med: App.tsx가 layer-2 앵커를 traverse crisisDeps에 배선(L104)하나 **FreeTextInput 실시간 경로엔 미전달**(layer-1 only) — 완곡 위기 안전망이 결과 traverse 시점에만 작동. 문서/테스트 명시 권고.
- Low: NUMBER_RE 단위 없는 숫자 미검사(의도 완화). 실 SDK 경로 c8 ignore(키 없는 게이트 미도달, 별도 스모크 권고).

## code-reviewer 수렴
H-1/H-2/H-3 안전 정규식 정확성 — reviewer 과적합 게이트와 공동 RED. 기존 비위기/grounded fixture 회귀0 검증. + code-reviewer 별도: explain 숫자 부분문자열 false-pass(H-2 number), SettingsModal 미배선.
