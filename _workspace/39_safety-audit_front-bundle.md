# 39 — 프론트 묶음 안전·신뢰 감사 (D-① · E · F-①②③)

감사자: safety-domain-auditor · 2026-07-02
대상: `eligibility.ts`(axes), `ui/funnel/{policyChecklist,PolicyResultCard,ProfileInput,ChoiceChips,FreeTextInput,FunnelContainer,ResultList,YouthCenterLink}`, `data/static/{documents,youthCenters}` + 테스트
검증: `npm run test` = 49 파일 / 755 통과 (회귀 0). youthcenter.go.kr HTTP 200 확인.

## 최종 판정: 승인 (High 위반 0)

Med 0 / Low 2(문서 코멘트 오타·잔여 인계). 안전 축 6개 전부 코드·테스트 양방향 검증 통과.

---

## 축별 판정

### 1. 위기 불변식 — 통과 (High 관심 영역, 이상 없음)
- `FunnelContainer.tsx:61-88` — `inCrisis = funnel.crisis || freeCrisis`이면 `<SafetyBanner/>` 단독 early-return. 프로필/검색/결과/예시/설정/동행 JSX는 전부 return 이후 블록에 있어 물리적으로 미렌더. 프로필 상태(regionCode/age)가 무엇이든 분기에 영향 없음.
- `FreeTextInput.tsx:31-49` — change마다 `detectCrisisRegex` 동기 실행 → `onCrisis(true)` 즉시. 전송 시 재확인 후 위기면 `onSubmit` 진입 0.
- 테스트 교차:
  - `funnel.crisis.test.tsx` B2 — crisis=true에 result/alternatives/nextChoices를 전부 채운 적대적 주입에도 `regions===['safety']`, 그리고 신규 UI 전부 부재 단언: `profile-pill`·`policy-checklist`·`youth-center-link`·`[data-funnel-region=profile-input|youth-center]` null.
  - `freeInput.ui.test.tsx` UI-2/UI-2b — 프로필 프리셋(PROFILE) 상태에서 "자해하고 싶어"/완곡 "버틸 힘이 없어" 입력 → SafetyBanner 우선 + 전체 textbox 0(프로필 나이 입력 포함 억제). "프로필 입력 후 위기어 순서" 시나리오는 profile prop 프리셋으로 커버되며, early-return이 profile 무관이므로 알약 펼침 후 위기 입력도 동일 결과(경로 동치).
- 판정: 위기 단독 렌더 불변. 신규 4종 UI(알약·체크리스트·말풍선 칩·동행 블록) 전부 위기 시 미렌더가 코드·테스트로 확정.

### 2. 안전 3표면 문구 불변 — 통과
- `SafetyBanner.tsx` — "지금 많이 힘드시다면, 혼자 견디지 않아도 됩니다" / "24시간 도움…무료이며 비밀이 보장" 문구 유지. `role="alert"` 유지. 시각 클래스(rose-*)만 존재.
- `CrisisFooter.tsx` — "많이 힘들다면 혼자 견디지 마세요." + 109·1577-0199 `tel:` 링크 유지.
- `DisclaimerNote.tsx` — "자격 여부는 입력 정보로 **추정**…신청 전 반드시 **원문**에서 최신 조건을 확인하세요." 유지.
- `safetyResources.ts` — 109/1577-0199 SSOT 무변경. 위 3표면 모두 소스 코드가 이번 변경 대상 목록에 없고 diff 상 문구 변경 근거 없음(시각 토큰 변경만 허용 범위).
- 판정: 3표면 문구 불변. 카드 `DisclaimerNote` 상시 동반(PolicyResultCard:187-189), CrisisFooter 결과 섹션 상시(FunnelContainer:153).

### 3. 자격 단정 금지 — 통과
- `policyChecklist.ts` 문구 전수: pass는 "…충족(추정)"만(ageText:33, regionText:37/40, income:51). review는 "…원문에서 확인"만(REVIEW_TEXT:61-66). "자격이 됩니다/안 됩니다"류 0. blocked 축은 `buildChecklist`에서 제외(86행 주석·`if pass/review`만 push).
- `grep "자격이 (됩|안 됩)"` — 소스 히트는 정의/금지 주석뿐, 생성 문구 0. (explain.ts:260은 프롬프트 금지 지시문.)
- 부재 단언 테스트: `PolicyResultCard.test.tsx:62,203,225` `queryByText(/자격이 (됩|안 됩)/)` null. review 축 `?`+"원문에서 확인"(216-226), blocked 축 섞여도 라인 미렌더(228~).
- blocked 카드 미노출: `ResultList.tsx`가 now/soon/review만 카드화, blocked는 미노출·대안 유도. `app.profile.test.tsx:143-156` REGION_MISMATCH blocked → 카드 0 + alternatives, "막힘/부적격/탈락" 부재(125,154).
- '추정' 고지·원문 링크 유지: PolicyResultCard:169-179(sourceUrl 링크), 187-189(DisclaimerNote). 판정: 단정 경로 0.

### 4. 라벨 전환 의미 보존 — 통과
- `now → "지금 바로 신청돼요"` (STATUS_META:83): 버킷 now = 전축 통과 + recruit now. 의미 1:1. "바로"는 즉시 신청 가능이라는 사실을 강조할 뿐 자격 확정을 함의하지 않음(고지·체크리스트가 추정 톤 유지).
- `soon → "곧 신청이 열려요"` (84): 버킷 soon = 통과 + recruit soon(모집 임박). Q-1(문구 미정) 확정됨 — "곧 시작/마감"의 양가성을 "열려요"(개시)로 좁힘. soon 버킷은 아직 열리지 않은 임박 상태이므로 "열려요"가 의미 정합(마감 임박을 "열려요"로 오도하지 않음 — soon은 recruitStatus 개시 임박 분류).
- `review → "몇 가지만 확인하면 돼요"`(다수, 86) / `"거의 다 왔어요 — ○○만 확인"`(단일, 115): review 버킷 = 보수 판정(미확인, 탈락 아님). 등급화는 `reviewLabels` 개수 기반(111행 near=1). 라벨이 부적격을 암시하지 않고 "확인 필요"의 보수성 유지.
- 헛희망 톤 판정: "거의 다 왔어요"는 미확인 항목이 1개일 때만이며 여전히 확인을 요구("○○만 확인"). 단정("됩니다")이 아니라 근접도 표현. blocked는 이 경로에 도달 불가(ResultList 필터). 낙관 과장으로 보긴 어려움 — 경계선이나 고지·체크리스트가 추정 톤을 상시 보강해 완화.
- 테스트: `PolicyResultCard.test.tsx:42,45,48,59,75`가 확정 문구 단언. 판정: 4버킷 라벨 의미 1:1 보존, 헛희망 유발 없음.

### 5. 정적 데이터 날조 금지 — 통과
- `youthCenters.ts` — 17개 시·도 전부 `centerName:null, phone:null`(32행 map). `YouthCenterLink.tsx:36-45` null이면 기관명·전화 UI 미렌더(운영자 채우면 자동 노출). `YOUTH_CENTER_URL='https://www.youthcenter.go.kr'` — **HTTP 200 실존 확인(2026-07-02)**.
- 테스트: `youthCenters.test.ts` 17개·전 null·URL 도메인 매치. `funnel.ui.test.tsx:248-255` 동행 블록에 위기 문구(109/자살예방) 부재 + 전화번호 정규식 `\d{2,4}-\d{3,4}-\d{4}` null(날조 0). `youthCenterMessage`는 sido명만 삽입, 위기 톤 부재 단언(youthCenters.test.ts:60-64).
- `documents.ts` — 모든 레코드 issuer 필수(정부24/홈택스/대법원/건보공단 등 실제 발급처). 불확실(재직·재학증명서) fee/estMinutes `null`(지어내기 0). 상식 검증: 등본 issuer "정부24" + fee 0. 테스트 `documents.test.ts`가 issuer 비어있지 않음·null 폴백·상식 강제.
- 판정: 전화번호·기관명 날조 0, 통일 링크 실존, 서류 보수 처리.

### 6. F-① 브리지 카피 — 통과 (관심 후 이상 없음)
- `PolicyResultCard.tsx:170-178` — 링크 텍스트 하드코딩 "신청 페이지 열기 (온통청년)". href = `policy.sourceUrl`(102-103). sourceUrl이 지자체 사이트일 경우 "(온통청년)" 라벨과 목적지 불일치 가능성이 이론적으로 존재하나:
  - 온통청년(youthcenter.go.kr) 정책 상세 URL이 sourceUrl의 정규 소스이며, 본 MVP 파이프라인은 온통청년 DB origin. sourceUrl이 온통청년 상세 페이지 경로인 한 라벨 정합.
  - 지자체 직링크가 sourceUrl로 들어오는 경로는 현 데이터 계약상 확인되지 않음(감사 범위 내 반례 미발견). 다만 sourceUrl origin 검증이 코드에 없으므로 향후 지자체 원링크 유입 시 라벨-목적지 불일치 가능 → Low 인계(아래).
- null 방어: sourceUrl null이면 링크·브리지 둘 다 미렌더(183-185, 테스트 181-187). 브리지가 링크 없이 뜨는 오도 없음.
- 판정: 현 데이터 origin 기준 정합. origin 미검증은 Low 잔여.

---

## 위험도별 항목

### High: 없음

### Med: 없음

### Low
- **L-1 (F-① 브리지 라벨 origin 미검증)**: "(온통청년)" 라벨이 `sourceUrl` origin과 무관하게 항상 하드코딩. 온통청년 origin 데이터에선 정합하나, 향후 지자체 직링크가 sourceUrl로 유입되면 라벨-목적지 불일치로 오도 가능. 권고: sourceUrl host가 youthcenter.go.kr일 때만 "(온통청년)" 접미, 아니면 일반 "신청 페이지 열기"로 폴백. 현 데이터 계약상 반례 미발견이므로 이번 머지 차단 아님 → 데이터 확장(지자체 직링크 유입) 태스크로 인계.
- **L-2 (테스트 코멘트 오타)**: `funnel.ui.test.tsx:244` 코멘트 "부산(11=서울)", `app.profile.test.tsx:145` 등 regionCode 11/26 혼용 코멘트. 단언 자체는 서울특별시로 정확(기능 무해). 문서 정정 권고.

---

## 미검증/추가 테스트 제안 (선택)
- 위기 시나리오 중 "프로필 알약 펼침(select/input 노출) → 그 상태에서 위기어 입력" 인터랙티브 순서는 명시 테스트가 없다(early-return이 profile 무관이라 경로 동치로 안전하나). 방어적으로 `app.profile.test.tsx`에 알약 펼침 후 FreeTextInput 위기어 → `profile-region` select 부재 단언 1건 추가 권고(회귀 조기 포착). 현 코드 안전성엔 영향 없음(승인 유지).

## 게이트 통합-QA 공유
안전 게이트 통과. High/Med 없음, 머지 차단 사유 없음. L-1은 데이터 확장 시점 재검토, L-2는 문서 정정.
