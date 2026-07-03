# 38 · Safety & Domain Audit — 지역(시·도)·나이 입력 UI

날짜: 2026-07-02 · 감사자: safety-domain-auditor · 대상: 프로필 입력 기능(ProfileInput + 파서 + App 배선)
최종 판정: **승인(APPROVE)** — High 위반 0. Med 0. Low 2(문서화 권고, 머지 비차단).

---

## 검증 방법
- 실제 동작 경로 추적: 위기 입력→early-return, 미입력→review, 파서→도메인 폴백을 코드+테스트 교차 확인.
- `parseAgeInput` 우회 시도(유니코드/전각/지수/16진수/부호/구분자/개행) 독립 실행 검증.
- 관련 스위트 실행: profile 7파일 120건 green + 기존 안전 표면(funnel.ui/crisis/Disclaimer/CrisisFooter/PolicyResultCard) 41건 green. `tsc --noEmit` 0 에러.

---

## 축별 판정 (S1~S5)

### S1 미입력=보수 유지 — **통과**
- 경로: `INITIAL_PROFILE`(App.tsx 37~42)이 `age: undefined`, `regionCode: undefined`로 시작.
  → `ageAxis`(eligibility.ts 79) `isUsableAge(undefined)=false` → `review('AGE_UNKNOWN')`.
  → `regionAxis`(124~127) `userCode` undefined → `review('REGION_PROFILE_MISSING')`. blocked 아님.
- false-accept 경로 없음: 전국(isNationwide) 정책만 PASS(설계상 '연령/지역 무관', 2026-06-25 승인). 비전국은 미입력 시 절대 PASS 불가 — 나이/지역 축 어느 하나라도 review면 blocked/review로 합성.
- 테스트 고정: profileInput.ui.test T6(REGION_PROFILE_MISSING·AGE_UNKNOWN review, "막힘/부적격/탈락" 부재), app.profile.test T7("결과 없음" 재발 없음).

### S2 입력=정밀 판정 — **통과**
- 나이 경계: eligibility.test AB-1~ (34 PASS / 35 AGE_ABOVE_MAX / 19 PASS / 18 AGE_BELOW_MIN / min==max=30 단일). off-by-one 잠김.
- 시·도 불일치 blocked가 사용자에게 빨강 직노출 안 됨: `evaluate`가 blocked 버킷 분리 → `ResultList`(26~48)가 now/soon/review만 카드화, blocked 미노출 → 노출 0이면 `alternatives` 대안 칩 유도(51~59). app.profile.test T7-c가 "서울 선택+정책 부산 → 카드 0 + alternatives, 막힘/부적격/탈락 문구 0" 고정.
- 헛희망(now/soon 오분류) 새는 경로 없음: blocked > review > soon > now 우선순위 합성(evaluateOne 182~190). blocked면 절대 now/soon 버킷 진입 불가.

### S3 위기 불변식 — **통과**
- FunnelContainer `inCrisis = funnel.crisis || freeCrisis`(60). 위기 early-return(81~87)이 SafetyBanner **단독** 렌더 후 즉시 종료 — ProfileInput(118)은 그 아래 비위기 JSX에만 존재. 구조적으로 위기 시 미렌더 보장.
- 테스트: profileInput.ui.test T5(직접 '죽고 싶어요'·완곡 '버틸 힘이 없어' → profile-input 부재 + alert 존재), freeInput.ui.test UI-2/UI-2b('자해하고 싶어'·완곡 → `queryByRole('textbox')` null = 나이 input 포함 전 입력 억제).
- graceful degradation: freeCrisis는 FreeTextInput의 layer-1(키 무관 regex)로 설정 → crisisAnchors=[](키 없음)에서도 직접·완곡 위기어가 layer-1로 배너 최우선. 위기 라우팅이 LLM 키에 의존하지 않음.
- "프로필 먼저 입력 후 위기어" 순서: early-return이 profile 상태와 무관하게 배너 단독을 렌더하므로 안전(코드상 확실). 단 이 특정 순서의 명시 테스트는 없음(아래 권고 참조).

### S4 안전 표면 무손상 — **통과**
- profile.age 소비처 전수 grep = eligibility.ts 단 1곳(가드 후 narrowing). traverse는 profile 통째 전달만(`.age` 미참조), applyRules는 activePrograms/completedPrograms만 사용 — optional화가 age 외 축 보수성 훼손 없음.
- '추정' 고지·원문 링크(null 안전)·신선도·위기 푸터는 PolicyResultCard/CrisisFooter 담당 — profile 배선과 독립. 회귀 스위트 41건(funnel.ui/crisis/Disclaimer/CrisisFooter/PolicyResultCard) 전량 green.
- CrisisFooter는 비위기 결과 섹션 하단 상시 렌더(FunnelContainer 143) — 프로필 추가로 위치 불변.

### S5 입력 방어 이중화 — **통과**
- 1차 UI 파서(`parseAgeInput`): `/^\d+$/` ASCII 정수 게이트 + `Number.isInteger` + `>=0`. 우회 시도 전량 방어 확인:
  전각 '３４'→undefined, 아라비아-인도 '٣٤'→undefined, '0x1F'/'1e2'/'+34'/'3_4'/'34 35'/'12abc'/'Infinity'/'NaN'→전부 undefined. '0034'→34, '34\n'→34(정상).
- 2차 도메인 `isUsableAge`(eligibility.ts 61~63): UI 우회(직접 setState·붙여넣기·IME 조합으로 오염값 유입)해도 NaN/음수/비유한 → review('AGE_UNKNOWN') 폴백. eligibility.test A-13(NaN)/A-14(음수)/A-15(비정수 33.5 비교)/A-16(0 하한 blocked)으로 고정. false-accept 경로 없음.
- 붙여넣기/IME: onChange가 최종 문자열 전체를 parseAgeInput에 통과시키므로(native number 필터 미사용, type=text) 조합/붙여넣기 경로도 동일 파서 경유 — 우회 불가.

---

## 발견 (Low, 머지 비차단 — 문서화/후속 권고)

### L1 — 초대형 나이 문자열의 blocked 분류 (Low)
- 재현: `parseAgeInput('9999999999999999999999')` → `1e+22`(부동소수 정수, `Number.isInteger` true, 정규식 통과). 도메인에서 `age > ageMax` → `blocked('AGE_ABOVE_MAX')`.
- 위험도 Low: 헛희망(false-accept)이 아니라 보수 방향(blocked). 안전 침해 아님. 다만 "비현실 나이는 도메인이 blocked 처리"라는 잔여 R3 서술과 일치하며 사용자 경험상 극단값이 review 아닌 blocked로 감. UI `<input>`에 물리적 상한 힌트(max) 부재 — 후속 UX 개선 여지. 안전 관점 조치 불필요.

### L2 — S3 "프로필 입력 후 위기어" 순서 명시 테스트 부재 (Low)
- 현 테스트는 초기 화면에서 위기어 입력만 커버. "나이/지역을 먼저 입력해 profile 상태가 채워진 뒤 자유입력에 위기어" 순서는 명시 케이스 없음.
- 위험도 Low: early-return이 profile 상태와 완전 무관(코드상 확실 — inCrisis 분기가 ProfileInput 렌더보다 위, 상태 의존 없음). 실동작 위반 가능성 없으나 회귀 방어망으로 1케이스 추가 권고:
  `renderFunnel()` → 나이 '30' 입력 → 시·도 '26' 선택 → 자유입력 '죽고 싶어요' → alert 존재 && profile-input 부재.
- 후속 처리 가능(머지 비차단).

---

## 최종 판정
**승인.** 안전 5축(S1~S5) 전부 통과, 위기 라우팅·자격 보수성·이중 파서 방어·안전 표면 무손상 모두 코드+테스트로 확인. High/Med 위반 없음. L1·L2는 안전 침해 아닌 문서화/후속 권고이며 머지를 막지 않는다. tdd-implementer에게 차단 메시지 불필요. integration-qa에 안전 게이트 통과 공유.
