# 38 · QA — 지역(시·도)·나이 입력 UI: 통합 정합성 & 품질 게이트

날짜: 2026-07-02 · 대상: 프로필 입력(ProfileInput/useProfileState/profileInputParse + App/FunnelContainer/types 배선) · QA: integration-qa

---

## 0. 최종 판정

**Phase 판정: 통과 (조건부 — Med 1건, Low 2건 잔여 기록).**

- 품질 게이트 6종 전부 통과(test 661 passed·build·lint·coverage 임계 충족·tsc·audit 신규 취약점 0).
- 경계면 4개 전부 **정합**. blocker/High 결함 0.
- 유일한 실질 결함: `useProfileState.ts` 테스트 커버리지 0%(Med). 게이트는 통과하나(ui 글로브 집계 임계 충족) 신규 파일이 실제 테스트로 실행되지 않음 — 통합 테스트가 훅을 import하지 않고 동형 Harness로 대체.

---

## 1. 품질 게이트 (전부 실행 · 출력 인용)

### G1. `npm run test` — 통과
```
Test Files  42 passed (42)
      Tests  661 passed (661)
   Duration  33.01s
```
- 직전 기대치(661 passed) 정확 일치. 스킵 0, 실패 0.

### G2. `npm run build` (tsc -b && vite build) — 통과
```
tsc -b  → 에러 0 (타입 통과)
vite v7.3.5 building client environment for production...
✓ 1925 modules transformed.
✓ built in 13.16s
```
- 참고(신규 아님): `(!) Some chunks are larger than 500 kB` — 기존 번들 크기 경고(index-DpYkRnBM.js 968kB). 이번 변경과 무관, 에러 아님.

### G3. `npm run lint` (eslint .) — 통과
```
> eslint .
(출력 없음 = 오류 0)
```

### G4. `npx tsc --noEmit` 상당 — 통과
- `npm run build`의 `tsc -b`가 프로젝트 전체 타입 체크를 수행하며 에러 0으로 통과. 별도 tsc 재실행 불요(동일 tsconfig 체인).

### G5. 커버리지 (`npx vitest run --coverage`) — 통과 (EXIT_CODE=0, 임계 충족)
```
All files          |   94.89 |    88.49 |   97.17 |   97.23
 domain            |   93.06 |    93.92 |     100 |   96.38   (임계 ≥90 ✔)
 domain/graph      |   90.76 |    83.63 |     100 |   91.37   (임계 ≥90 ✔)
 data              |   96.94 |    84.69 |     100 |   98.37   (임계 ≥80 ✔)
 ui/funnel         |   92.69 |    88.99 |    89.06 |   95.18   (임계 lines/func/stmt≥85, br≥80 ✔)
```
- 계층별 임계(vitest.config: domain≥90, data≥80, ui lines/func/stmt≥85·br≥80) 전부 충족 → EXIT_CODE=0.
- 신규 파일 커버리지:
  - `profileInputParse.ts` 95.23 / 93.75 / 100 / 100 ✔
  - `ProfileInput.tsx`(…Container 리포트에 병합) — RTL 전 시나리오 커버.
  - **`useProfileState.ts` 0 / 100 / 0 / 0 (28-32 미도달)** ← Med 결함(§3-D1).
- App.tsx는 coverage `include` 글로브(domain/data/retrieval/ui/llm)에 없어 측정 대상 아님 — 배선 검증은 동형 Harness(app.profile.test)로 대체.

### G6. `npm audit` — 신규 취약점 0 (기존 Low 1건)
```
esbuild 0.27.3 - 0.28.0  (low) — dev server arbitrary file read (Windows)
1 low severity vulnerability
```
- 이번 변경은 신규 의존성 추가 없음 → **신규 취약점 0**. esbuild는 기존 transitive dev 의존성, dev 서버 한정(프로덕션 빌드/런타임 무관). Low·기존, 게이트 차단 아님.

### 플레이키 검증 — 없음
- 테스트 스위트 3회 연속 실행(초기 + 추가 2회) 전부 `661 passed`, EXIT=0. 커버리지 실행도 661 passed. flaky 없음.

---

## 2. 경계면 교차 비교 (핵심 — 4개)

### 경계 1 · UI(ProfileInput onChange) ↔ App(useProfileState 병합) ↔ 도메인(UserProfile) — **정합**
- ProfileInput `onChange`가 넘기는 patch shape = `{ regionCode?: string; age?: number }`
  (`ProfileInput.tsx` L23, L33/L41). useProfileState `ProfilePatch`(L16-19)와 **필드명·옵셔널·타입 정확 일치**.
- 병합: `setProfile((p) => ({ ...p, ...patch }))`(useProfileState L30) → patch에 없는 필드(`income`, `region`, `completedPrograms`, `activePrograms`)는 **보존**. income medianRatio:100 유실 없음(결정 5·R1 회귀 방지 충족). ProfilePatch가 regionCode/age만 담으므로 income 덮어쓰기 경로 자체가 없음.
- 정규화 계약: '선택 안 함' → `regionCode: undefined`(빈 문자열 아님, ProfileInput.test L44-49), 음수/비정수/비수치 나이 → `age: undefined`(L65-84). undefined 명시 병합이 선택 해제·나이 지움을 반영(useProfileState L23 주석대로).
- 도메인 정합: patch의 `regionCode`/`age`는 `UserProfile.regionCode?: string`(types L91)·`age?: number`(types L84)와 일치. types.ts age optional화가 이 undefined 흐름의 타입 근거 — eligibility L79 `isUsableAge` 가드 이후 narrowing으로 로직 무변경.

### 경계 2 · App(profile) ↔ useFunnel(재평가) — **정합**
- App → FunnelContainer `profile` prop(App.tsx L142) → useFunnel `profile` 인자(FunnelContainer L58).
- useFunnel effect deps에 `profile` 포함(useFunnel.ts L102) → profile 참조 변경 시 `traverseFn(graph, {nodeId, query, profile}, deps)` 재실행(L85) → evaluate 재수행. **재평가 배선 확인**.
- traverse 소비 정합: `TraverseState { nodeId, query?, profile }`(traverse.ts L24-28)가 useFunnel이 넘기는 객체와 일치. profile을 evaluate로 전달(엔진 소비).
- 역방향: profile은 useProfileState의 useState 안정 참조 → 변경(setState) 시에만 새 객체. 부모 리렌더로 동일 참조 유지 시 effect deps 불변 → **재실행 0**(app.profile.test T8 "seenSearchRefs.size === 1"로 고정).

### 경계 3 · App memo 경계 (profile 미포함 — 의도된 설계) — **정합**
- `search` useMemo deps = `[]`(App.tsx L115) — profile 미포함. 원격 Edge Function 함수는 마운트 1회 생성.
- `deps`(TraverseDeps) useMemo deps = `[now, index, env.embedProvider, env.crisisAnchors, search]`(App.tsx L128) — **profile 미포함**. 계획 T8 규율 준수.
- 정합: profile 변경 → deps memo 객체 참조 불변 → traverse effect의 `deps` 항목은 안정. 재평가는 오직 effect의 `profile` 항목 변경으로만 트리거(경계 2) → **원격 search 남발 없음**. useFunnel effect deps(profile)와 App memo(profile 부재)의 관계가 상충 없이 맞물림.
- app.profile.test T8 2케이스가 이 불변식 고정: profile 변경 후 search 인자 query에 '26'/'30' 미포함, search 함수 참조 단일.

### 경계 4 · 파서(profileInputParse) ↔ SIDO_LIST(sido.ts) — **정합**
- `SIDO_CODE_SET = new Set(SIDO_LIST.map(s => s.code))`(profileInputParse L26) — 단일 진실 원천 파생, 신규 테이블 없음.
- SIDO_LIST 17개 코드 = `11,26,27,28,29,30,31,36,41,43,44,46,47,48,50,51,52`(sido.ts L13-31) — **강원 51·전북 52 포함, 42/45 없음**. 계획·테스트(profileInput.test L23) 기대집합과 정확 일치.
- sidoOptions() 길이 18('선택 안 함' + 17), 코드 유일성 검증됨(profileInput.test L14-38).
- 방어: `parseSidoCode('99')`(테이블 없는 코드) → undefined, `''` → undefined(profileInput.test L84/L81). **SIDO_LIST에 없는 코드는 통과 못 함** → REGION_MISMATCH(blocked)로 새지 않고 REGION_PROFILE_MISSING(review)로 보수 폴백.

---

## 3. 결함 목록 (등급화)

### D1 · Med — `useProfileState.ts` 테스트 커버리지 0%
- 증거: coverage 리포트 `...ofileState.ts | 0 | 100 | 0 | 0 | 28-32`.
- 원인: 신규 훅을 import하는 테스트 없음(`grep useProfileState test/` = 0건). App.profile.test는 App의 실제 훅 대신 `AppHarness`(inline useState/useMemo)로 배선을 **복제**하고, App.tsx 자체도 렌더 테스트 부재.
- 영향: 게이트는 통과(ui 글로브 집계 임계 ≥85 충족 — 훅이 작아 집계 희석). 그러나 실제 병합 로직(patch 병합·안정 참조)이 단위/통합 어디에서도 실행되지 않아, 훅 내부 회귀(예: 향후 localStorage 배선 시 병합 버그)를 잡지 못함. 현재 로직은 App.tsx 경유로 프로덕션에서 동작하나 테스트 보증 공백.
- 권고(담당 tdd-implementer): useProfileState 단위 테스트 1개 추가(초기값 반환 + onProfileChange patch 병합 시 income 등 기존 필드 보존 + undefined 명시 병합) 또는 app.profile.test Harness가 실제 훅을 사용하도록 전환.

### D2 · Low — audit esbuild(dev-only) 기존 Low 잔존
- 이번 변경 신규 아님. dev 서버 한정. `npm audit fix`로 후속 정리 권고(스코프 밖).

### D3 · Low — 번들 청크 500kB 초과 경고(기존)
- vite build 경고, 에러 아님. 이번 변경 무관(기존 번들). 코드 스플릿 후속 권고.

---

## 4. 안전 불변식 회귀 확인 (계획 S1~S5)

- S1 미입력=review: app.profile.test "초기 미입력 → review", profileInput.ui.test T6 2케이스 green. blocked/숨김 0.
- S2 입력=정밀 판정: 부산(26) 선택 → 지금/곧, 서울(11)+타지역정책 → blocked 숨김·대안 칩(직노출 0) green.
- S3 위기 불변식: 위기어 3종(직접/완곡) → SafetyBanner 단독, profile-input 부재 green(profileInput.ui.test T5). FunnelContainer 위기 early-return이 ProfileInput을 비위기 JSX에만 배치(L81-87 vs L118).
- S4 안전 표면 무손상: 기존 스위트 661 전량 green(회귀 0).
- S5 보수 파서 이중 방어: parseAgeInput 음수/비정수/비수치/공백 → undefined, parseSidoCode 미지 코드 → undefined. 도메인 isUsableAge 최종 안전망. false-accept 경로 없음.

---

## 5. 발신 (팀 통신)

- **tdd-implementer**: D1(useProfileState 0% 커버리지) — Med. 훅 단위 테스트 추가 또는 Harness 실훅 전환 권고. 게이트 차단은 아니나 신규 파일 테스트 공백.
- **리더(오케스트레이터)**: Phase 통과(조건부). 게이트 6/6 통과, 경계 4/4 정합, blocker/High 0, Med 1·Low 2 잔여.
