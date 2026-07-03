# Phase 5 TDD 작업 분해 — 깔때기 UI & 결과 화면 (결정형, LLM off)

> phase-planner 산출물. SSOT: PLAN Phase 5(244–263), Architecture Decisions(41–59), 공통 게이트(101–117).

## 리더 결정 (planner 11장 "확인 필요" 5건 해소, 2026-06-25)
1. **review 정책 → 미노출** (plan "2상태만"). ResultList가 now/soon만 렌더. review 누수 차단 RED 필수(T5.1-E5).
2. **위기 트리거 → Phase 5 버튼 전용**. 위기 배너는 traverse crisis=true 결과 주입으로 단위/통합 검증(T5.2). 실시간 자유입력 위기 라우팅은 **Phase 6 인계**(자유입력 UI 도착 시 layer-1 정규식 즉시 라이브).
3. **profile → 기본 프로필 주입**. 자격 입력 UI는 Phase 5 범위 밖. 컨테이너가 데모용 기본 profile(age 범위 내, income none, region 전국) 주입해 now/soon 산출. fixture 정책은 ageMin/ageMax를 profile.age 포함 범위로.
4. **위기 시 갈래 칩 억제**. crisis=true면 SafetyBanner만, nextChoices 칩 미렌더(suppressGeneration 정신).
5. **coverage.include에 `src/ui/**` 추가**. thresholds: lines/functions/statements ≥85, branches ≥80.

## 0.2 코드 실측 불일치 (추정 금지)
- `traverse(graph, state, deps)` async → `{ crisis, nextChoices, result(EvaluateResult|null), alternatives }`.
- `result.review`는 비어있지 않을 수 있음(traverse.ts:204) → **UI에서 필터**(blocked는 traverse가 이미 빈 배열).
- 신선도(updatedAt/fetchedAt)는 `CachedPolicy`에만, `Policy` 타입엔 없음 → `(policy as CachedPolicy).updatedAt` 옵셔널 접근 + null-safe. synthesizePolicy 폴백(traverse.ts:106)엔 진짜 없음 → 미표시 분기.
- 원문 링크 = `policy.sourceUrl`(string|null). null이면 링크 미생성.
- mh.safety = kind 'safety' 노드, crisisDetect로만 라우팅(검색 X). 일반 칩에서 제외.

## 1. 모듈 (src/ui/funnel/)
SafetyBanner(resources만, 순수) · ChoiceChips(choices, onSelect) · FunnelStep(node, onSelect, onBack, stepIndex) · DisclaimerNote(정적 '추정' 고지) · PolicyResultCard(item: EvaluatedPolicy, status: 'now'|'soon') · ResultList(result, alternatives, onSelectAlternative — now/soon만) · useFunnel(상태 훅: nodeId 스택, 갈래전환, 뒤로, 재질문방지, traverse 연동) · FunnelContainer(위기우선 렌더 보장: crisis면 SafetyBanner 최상단). App.tsx 개정.

**렌더 불변식**: crisis.crisis===true → `<SafetyBanner/>` DOM 최상단, 정책/스텝보다 먼저. false → 배너 null.

## 2. TDD 순서 (안전 표면 → 안쪽)
1 통합 5.1(RED) → 2 위기 5.2(RED) → 3 SafetyBanner → 4 DisclaimerNote → 5 PolicyResultCard → 6 ResultList(blocked/review 필터 핵심) → 7 ChoiceChips/FunnelStep → 8 useFunnel → 9 FunnelContainer 조립(통합 GREEN) → 10 a11y/모바일 REFACTOR.

## 3. RED 시나리오 핵심
**Test 5.1** `test/integration/funnel/funnel.ui.test.tsx` (NOW=2026-06-24T12:00:00Z):
- A entry→burnout→결과 카드≥1. B '추정' 고지(getByText /추정/). C 원문링크 href=sourceUrl(null이면 부재). D 신선도 표시. E1 blocked title 부재. E2 배지 2종(지금/곧)만, 막힘/부적격 문구 부재. E3 경계: end=NOW+5d→soon, +30d→now. E4 후보0/전부blocked→대안 칩+안내, blocked직노출0. E5 review 미노출. E6 sourceUrl/title null 폴백 안 깨짐.
- 경계값: end 2026-06-29(soon)/2026-07-24(now)/2026-06-23(closed→blocked→미노출), always→now.

**Test 5.2** `funnel.crisis.test.tsx`:
- A crisis=true·resources=[109,1577-0199]→배너. B **배너 DOM상 정책/스텝보다 먼저**(compareDocumentPosition 엄격검증). C 위기 시 result=null→카드0. D crisis=false→배너 미렌더. E resources=[]→throw없음.

**단위 RED**: SafetyBanner(resources 렌더/빈배열 throw없음/tel:) · DisclaimerNote(/추정/+원문권고) · PolicyResultCard(status→배지, title, sourceUrl null안전, updatedAt 폴백, 고지 포함, 막힘문구 0) · ResultList(now1+soon1+blocked1+review1→카드 정확히 2 / null→0 / now·soon 0+alt2→대안칩2) · ChoiceChips/FunnelStep(N칩→N버튼, 클릭→onSelect(id), 빈→0, safety kind 제외) · useFunnel(초기 entry.id, select→전환·traverse재호출, back→pop, 재질문방지 중복push금지, reject 시 안전상태, deps.now 결정성).

## 7. safety-auditor 집중 표면
1 위기 배너 우선순위(compareDocumentPosition, crisis시 정책0). 2 blocked 비노출(2상태만). 3 **review 누수 차단**(코드 실측 추가 경로, plan 미명시). 4 고지·링크(null안전)·신선도. 5 safety-kind 칩 노출 여부.

## 9. 커버리지: src/ui/** lines/fn/stmt ≥85, branches ≥80 (vitest.config include 추가).

## 경계면 위험
신선도 타입 불가시(as CachedPolicy 옵셔널) · review 누수(UI 필터 책임) · alternatives vs nextChoices(result showable 유무로 분기) · crisis시 nextChoices 억제(결정4) · traverse async(findBy/await act) · safety-kind 노드 필터.

## DoD
5.1·5.2 RED→GREEN(RED 먼저 실패확인), 단위 7종 RED→GREEN, 안전4표면 커버, 경계값/null/빈 엣지 전부, 공통게이트(vitest 100%·eslint0·tsc0·build·flaky0 3회), 브라우저 dev 마음건강 깔때기 처음→끝(LLM off), a11y(키보드·aria·대비·모바일).
