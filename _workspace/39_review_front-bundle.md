# 39 — 프론트 묶음 기술 품질 검수 (D-① · E · F-①②③)

검수자: code-reviewer · 2026-07-02
대상: 신규 4소스+6테스트, 수정 7소스+9테스트. 안전 축은 safety-domain-auditor 담당(중복 배제).

## 게이트 실행 결과 (근거)
- `npx tsc --noEmit`: 통과(무출력).
- `npm test`: **49파일 / 755 테스트 전량 그린**(669 기준 +86 신규, 회귀 0).
- `npm run lint`: 통과(무출력).
- hex 직접 사용 grep(`src/ui/funnel/**/*.tsx`): 0건. 토큰만 사용(T-Z 게이트 충족).
- `curl https://www.youthcenter.go.kr`: **200**(리디렉트 유무 모두). 구현자 이탈 #2 URL 실존 확인.

판정: **통과(blocker/High 없음)**. High 1건(키보드 Enter 접근성) — 구현 차단은 아니나 접근성 바닥선(DESIGN §6) 직결이라 수정 권고. Med 이하는 기록만.

---

## High

### H-1. ProfileInput 알약 — Enter 키로 펼쳐지지 않음(접근성 결함, 테스트가 오탐 통과)
- 위치: `src/ui/funnel/ProfileInput.tsx:57-63`(handlePillKeyDown), `:67-78`(button)
- 문제: `<button>`은 브라우저가 **Enter keydown 후 네이티브 `click`을 자동 디스패치**한다. 그런데 `onKeyDown`이 Enter에서 이미 `setExpanded((v)=>!v)`로 토글하고 `preventDefault()`는 Space에만 안 걸리는 게 아니라 Enter/Space **둘 다** `preventDefault()`한다. Enter의 경우: keydown 핸들러가 토글(open) → 이어 브라우저 네이티브 click이 `onClick`을 호출해 다시 토글(close) → **상쇄되어 닫힌 채 유지**. 즉 실브라우저에서 Enter로 알약이 열리지 않는다.
  - Space는 keydown에서 `preventDefault()`가 네이티브 click을 억제하므로 단일 토글 → 정상 동작.
- 오탐 근거: `test/unit/ui/ProfileInput.test.tsx:59-63`이 `fireEvent.keyDown(pill,{key:'Enter'})`만 발화한다. jsdom은 keydown에 이어 native click을 자동 발화하지 않으므로 테스트는 통과하지만 **실브라우저 동작을 재현하지 못한다**(계약이 아니라 구현 우연에 기댐). 재현: keyDown('Enter') 직후 native `click`을 이어 발화하면 알약이 닫힌 채로 남음을 확인함(임시 테스트로 검증 후 제거).
- 왜 문제: DESIGN §6 "키보드만으로 전 흐름 조작 가능" 바닥선 위반. 키보드 사용자가 프로필 알약을 열 수 없다(Space는 되나 Enter는 안 됨 — 관례상 버튼은 둘 다 동작해야).
- 권장 수정: `onKeyDown` 핸들러를 **제거**한다. `<button>`은 Enter/Space 활성화를 `onClick`으로 이미 네이티브 처리하므로 커스텀 keydown이 불필요하며, 중복이 곧 결함의 원인이다. 제거하면 Enter·Space 모두 단일 `onClick` 경로로 정상 토글되고 코드도 단순해진다. (제거 후 기존 keyDown 테스트는 그대로 통과 — jsdom keyDown이 button의 click을 트리거하지 않으므로 오탐이 계속되나, 최소한 실동작이 옳아진다. 가능하면 테스트를 `fireEvent.click` 또는 userEvent 기반 활성화로 바꿔 계약을 정직하게.)

---

## Med (기록만 — 이번 스코프 defer 가능)

### M-1. "OO청년센터" 카피 — DESIGN 문구에 공백 삽입
- 위치: `src/data/static/youthCenters.ts:50`, 테스트 `youthCenters.test.ts:51`
- DESIGN §5는 `OO청년센터`(붙임). 구현은 `${name} 청년센터`(공백) → "부산광역시 청년센터". 시·도명이 시/도로 끝나 붙이면 "부산광역시청년센터"로 가독성이 떨어져 공백이 실용적으로 낫다고 판단되나, SSOT 문구와 리터럴 불일치. 테스트가 공백형을 단언해 내부 일관성은 있음. DESIGN 표기를 공백 허용으로 보정하거나 카피 확정 필요(감사자/리더 판단). 안전(날조)과 무관 → defer 가능.

### M-2. review 배지 등급화 라벨과 체크리스트 문구가 이원 소스
- 위치: `src/ui/funnel/PolicyResultCard.tsx:59-79`(REVIEW_REASON_LABELS/reviewLabels) vs `src/ui/funnel/policyChecklist.ts:61-66`(REVIEW_TEXT)
- 배지 등급화("거의 다 왔어요 — 소득 조건만 확인")는 `reviewLabels(item.reasons)`에서, 체크리스트 ? 라인("소득 조건 — 원문에서 확인")은 `buildChecklist(item.axes)`에서 각각 문구를 생성한다. 두 소스가 같은 review 축을 서로 다른 코드 경로로 사람 문구화 → 향후 라벨 변경 시 드리프트 위험(한쪽만 고칠 수 있음). 현재 값은 정합. 안전 불변(자격 단정 부재)은 양쪽 다 지킴. 규모가 작아 과설계 회피 관점에선 현행 유지 무방하나, 축→라벨 매핑을 단일 헬퍼로 모으면 드리프트 0. defer.

### M-3. reason 라벨과 axes 소스가 중복 정보(경미)
- 위치: `PolicyResultCard.tsx:110`은 `item.reasons`(합성된 사유)로 등급화, 체크리스트는 `item.axes`(축별)로. review 카드에서 동일 축이 배지+체크리스트 양쪽에 등장할 수 있으나 문구 톤이 달라("N만 확인" vs "원문에서 확인") 중복감은 낮음. 노출 UX 관점 관찰 사항, 결함 아님.

---

## Low (관찰)

- **L-1. 정확성 확인 완료 — eligibility axes 무변경 계약**: `evaluateOne`(eligibility.ts:170-220)에서 `axes`는 `verdicts`와 독립 배열로 push되고 버킷 분류(`evaluate` 277-285행)는 `reasons`/`recruitStatus`만 사용. `axes`는 순수 추가로 버킷 결정에 미관여. `isStructurallyBroken` 폴백 경로(264-268, 273행)는 `axes`를 생성하지 않아 `axes?` 옵셔널과 정합(구 데이터 호환). 계약 무변경 검증 테스트(eligibility.axes.test.ts:189-201) + 기존 669 그린으로 회귀 0 확인.
- **L-2. 경계 조건 커버 충실**: policyChecklist ageText(ageMin만/ageMax만/양쪽 null/무관), regionText(전국/sido매핑/미매핑 폴백), review/blocked/undefined/비배열 방어 모두 테스트됨(policyChecklist.test.ts). 헤드라인 N=now+soon+review(FunnelContainer.tsx:94)로 blocked 제외 — ResultList showable(ResultList.tsx:35)과 동일 계산식이라 정합.
- **L-3. 날조 0 방어 견고**: YouthCenterLink는 `center?.centerName`/`center?.phone` null-가드로 미렌더(YouthCenterLink.tsx:36-45), 테스트가 전화번호 정규식·tel: 링크 부재 단언(YouthCenterLink.test.tsx:20-27). v1 전 레코드 null 강제 테스트(youthCenters.test.ts:18-23). documents도 issuer 필수·불확실 null 강제(documents.test.ts:14-32).
- **L-4. 안전 층위 분리 확인**: 위기 시 `funnel.crisis.test.tsx:116-131`이 `regions===['safety']` + youth-center/profile-input 미렌더 단언. YouthCenterLink에 109/1577-0199/자살예방 문구 부재 단언(YouthCenterLink.test.tsx:37-40). 동행 블록은 결과 섹션 하단 1회 노출(FunnelContainer.tsx:151), 카드 반복 없음(Q-4 최소 노출 준수).
- **L-5. React 재렌더/T8 무변경**: FunnelContainer의 ProfileInput 추가가 검색 재호출을 유발하지 않음 — profile은 traverse deps에만 있고 search memo/deps 배열에 없음(app.profile.test.tsx T8, 189-192행 그린). PolicyResultCard checklist는 `useMemo([item.axes,policy,profile])`로 메모(PolicyResultCard.tsx:107) — 과렌더 없음.
- **L-6. 구현자 이탈 2건 근거 타당**:
  - (1) `usePolicyExplanation` export 보존(PolicyResultCard.tsx:46-57): noUnusedLocals/lint unused 대응 + D-② 재배선 대비. 표시·런타임 호출 정지(Q-3 리더 확정)와 정합. `void _keep/record/llm`로 참조 유지 — 트리셰이크 방지 관용. 타당.
  - (2) F-③ 통일 링크 youthcenter.go.kr 루트: curl 200 실존 확인. 개별 센터찾기 딥링크 대신 200 확정 루트만 사용은 R-3 "curl 실존 확인 URL만" 규칙 준수. 타당.
- **L-7. ChoiceChips 말풍선 꼬리 인라인 style**: `borderRadius:'999px 999px 999px 4px'`(ChoiceChips.tsx:43)는 Tailwind 표현 불가로 인라인 사용 — DESIGN §3이 명시 허용(hex 아님 → 토큰 규칙 위반 아님). 관용.
- **L-8. index.css `@import` CDN 폰트**(index.css:2): `@import`가 `@tailwind` 앞에 위치 — CSS 규격상 올바른 순서. 오프라인 폴백은 font-sans 스택으로 강등. 관용.

---

## 최종 판정

**기술 품질 통과** — blocker 0, High 1(H-1 키보드 Enter 접근성; 구현 차단 아님, 수정 권고). tsc·755테스트·lint 전량 그린, hex 0, URL 실존 확인, 계약 무변경·날조 0·안전 층위 방어 견고. Med/Low는 기록만(defer 가능).

**tdd-implementer에게 요청(H-1)**: `ProfileInput.tsx`의 `handlePillKeyDown` 제거 권고(`<button>` 네이티브 활성화가 Enter/Space를 처리하며, 커스텀 keydown 중복이 Enter 이중 토글 상쇄를 유발). 가능하면 keyDown 테스트를 활성화(click/userEvent) 기반으로 정정.

**integration-qa 공유**: 게이트 전량 그린·회귀 0. H-1은 실브라우저 키보드 흐름에서만 발현(jsdom keyDown 오탐)이라 E2E/수동 키보드 확인 시 재현 가능.
