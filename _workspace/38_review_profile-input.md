# 38 · Code Reviewer — 지역(시·도)·나이 입력 UI 기술 품질 검수

날짜: 2026-07-02 · 대상: `profileInputParse.ts` / `ProfileInput.tsx` / `useProfileState.ts` + 배선(App/FunnelContainer) + 도메인 타입 optional화
검수 범위: 기술 품질(정확성·React/TS 관용성·테스트 충실도·단순화). 안전 축은 safety-domain-auditor 담당 — 중복 안 함.

## 게이트 실행 결과 (근거)
- `npx tsc --noEmit` → **0 에러** (clean).
- `npx vitest run` (대상 7개 스위트) → **120 passed / 0 failed**.
- `npx eslint` (변경 소스 7개) → **0 경고 / 0 에러**. `eslint-disable` 주석 없음.

## 최종 판정: **승인 (수정 필요 없음)**
blocker/High **0건**. Med 2건·Low 3건은 기록만(수정 요구 아님). 두 계획 이탈(`profileInputParse.ts` 파일명, 나이 `type=text`+`inputMode=numeric`) 모두 근거 타당 — 오히려 계획안보다 안전.

---

## blocker — 없음

## High — 없음

## Med (기록만, 수정 요구 아님)

### M1 · 나이 입력 중간 상태 스냅백 (controlled 값 되돌림) — `ProfileInput.tsx:76-77`
`value={age === undefined ? '' : String(age)}` + onChange가 `parseAgeInput` 즉시 정규화 구조라, 유효 파싱 안 되는 중간 입력이 화면에서 사라진다.
- 예: 나이 필드가 정수 전용이므로 소수점 중간(`2.`)은 애초 무의미 → 실질 영향은 **선행 0**(`'007'` → 파서가 `7` 반환 → 입력창이 `'7'`로 스냅백)과 붙여넣기 정정 정도.
- 정수 나이 필드에서 스냅백 자체는 오히려 "정수만" 계약을 시각적으로 강제하는 면이 있어 치명적이지 않다. UX 매끄러움을 높이려면 원문 문자열을 로컬 state로 보관하고 blur 시 정규화하는 패턴이 있으나, 이번 스코프에선 과설계. → **defer**.

### M2 · `onChange={onProfileChange ?? (() => {})}` 렌더당 새 no-op 생성 — `FunnelContainer.tsx:121`
`onProfileChange` 미전달 경로(기존 소비자 테스트 호환)에서 매 렌더 새 익명 함수가 ProfileInput의 `onChange` prop으로 들어간다.
- 실사용(App)에서는 `useProfileState`의 `useCallback` 안정 참조가 항상 전달되므로 이 no-op 경로를 타지 않는다 → **프로덕션 영향 0**. ProfileInput은 memo 컴포넌트가 아니라 리렌더 파급도 없음.
- 순수 관용성 관점의 미세 흠일 뿐. 고정 no-op 상수(`const NOOP = () => {}`)로 승격 가능하나 이득 미미. → **defer**.

## Low (기록만)

### L1 · `sidoOptions()`가 매 호출 새 배열 — `profileInputParse.ts:32-37`
불변 데이터인데 호출부(`ProfileInput`)가 `useMemo(() => sidoOptions(), [])`로 이미 안정화 → 실효 문제 없음. 헬퍼가 모듈 상수를 반환하도록 바꿀 수도 있으나 순수함수 계약(호출마다 새 배열)이 테스트 기대와도 맞아 현행 유지 무해.

### L2 · `parseSidoCode`가 `.trim()` 적용 — `profileInputParse.ts:60`
select value는 공백이 낄 일이 없으므로 trim은 실질 무의미(방어적). 나쁘지 않음. parseAge와 대칭성 유지 목적으로 이해 가능.

### L3 · 테스트의 `as HTMLSelectElement`/`as unknown as string` 캐스트 — 테스트 파일 다수
RTL 반환 타입 좁히기·의도적 오염 입력 주입용으로 관용적. 프로덕션 소스에는 부적절한 `as` 캐스트 없음(타입 안전 양호).

---

## 검수 축별 소견

### 1. 정확성 버그
- **파서 경계 전수 확인(node 실행)**: 빈칸/공백 `undefined`, `'0'`→0, `'-1'`/`'34.5'`/`'abc'`/`'12abc'` `undefined`, `'999'`→999, ` 34 `→34(trim), `undefined` 입력 throw 없음. `/^\d+$/`는 ASCII만 매칭 → **전각 숫자 `２５` 거부(undefined)** = 보수적·안전. `'+5'` 거부. `'007'`→7(선행 0 허용, 무해). **결함 없음.**
- **profile 병합 필드 보존**: `setProfile((p) => ({ ...p, ...patch }))` + patch는 `{regionCode?, age?}`만 → `income.medianRatio:100`·`region` 보존 확인. INITIAL_PROFILE에 income 보존, T7 테스트가 income 하드코딩 유지 검증.
- **안정 참조**: `useProfileState`의 `onProfileChange`는 `useCallback([])` → 안정. `profile`은 변경 시에만 새 객체(setState). App의 search/deps memo 배열에 profile 부재 → 프로필 변경이 원격 search 함수 재생성을 유발하지 않음(T8로 고정). **비동기 경합**은 useFunnel의 `reqRef` 시퀀스 가드로 이미 처리(이번 변경 무관, 무손상).

### 2. React/TS 관용성
- 훅 규칙 준수(조건부 훅 없음, deps 정확). `useMemo`/`useCallback` deps 정합.
- **핵심 리스크(App deps memo에 profile 미포함)를 eslint-disable 없이 달성** 확인: profile은 `deps`(TraverseDeps) memo 배열(`App.tsx:128`)에도 `search` memo 배열(`:115`)에도 없다. profile이 TraverseDeps에 실리지 않으므로(traverse가 state 인자로 별도 수령) exhaustive-deps 규칙이 애초에 profile을 요구하지 않는다 → disable 불필요. lint 0. **설계적으로 깔끔.**
- 타입 안전: 프로덕션 소스에 `any`·부적절한 `as` 없음. `age?: number` optional화가 도메인 가드(`isUsableAge` 이후 narrowing)와 정합 — tsc 0.

### 3. 테스트 충실도
- **나이 경계 커버 충실**: A-1~A-16 + AB-1~AB-5로 34 PASS/35 blocked/19 PASS/18 blocked/min==max(30 only)/null 조합/NaN·음수·0·비정수(33.5) 전부 명세. off-by-one·min==max 회귀 잠금 완비.
- **계약 검증(구현 세부 아님)**: 통합 테스트의 긍정 단언(`거의 충족|자격 확인 필요`)은 `PolicyResultCard.tsx:77,142`의 실 렌더 라벨과 일치, 부정 단언(`막힘|부적격|탈락`)은 UI가 의도적으로 절대 안 쓰는 문구(`PolicyResultCard.tsx:16`) → 우연 문자열이 아닌 실 계약 검증.
- **T9 셀렉터 조정 정당**: 나이 input이 `type=text`라 `getByRole('textbox')`가 2개가 되어, UI-3은 `name: /마음/`으로 자유입력 특정(의도 보존), UI-2는 `queryByRole('textbox')` null로 **위기 불변식을 나이 input까지 확장**(강화). 훼손 아님.
- 스킵·flaky·`only` 없음. `.skip` 0.

### 4. 단순화 기회 / 과설계 평가
- **`useProfileState`가 useState+useCallback 래핑에 불과한가?** — 표면적으로 얇지만 정당: (a) T8 안정 참조 규율(search/deps memo에서 profile 격리)을 훅 경계로 명문화, (b) localStorage 영속화(잔여 R2) 삽입 지점을 App 변경 0으로 열어둠. 다만 **현재는 localStorage 코드가 실제로 없음** → "경계 명분"은 주석·인터페이스로만 존재. 후속 미착수 시 얇은 래퍼로 남을 리스크 있으나, 계획 T10이 명시적으로 "인터페이스만" 승인 → **과설계 아님(계획 부합)**. 기록만.
- 중복 로직 없음. `SIDO_LIST` 재사용(신규 테이블 생성 금지) 준수 — `profileInputParse.ts:16,26`.

### 계획 이탈 2건 근거 타당성
- **파일명 `profileInputParse.ts`(계획 T3=`profileInput.ts`)**: 컴포넌트 `ProfileInput.tsx`와 대소문자만 다른 파일명 충돌(일부 OS/툴체인 케이스-인센시티브)을 피하고 "파서"임을 명시. 테스트·import 전부 일관(`@/ui/funnel/profileInputParse`), stale 참조 0. **타당.**
- **나이 `type=text`+`inputMode=numeric`(계획 T4=number/spinbutton 암시)**: 주석(`ProfileInput.tsx:70-71`)대로 native `type=number`는 로케일·IME·소수점·`e`/`+`/`-` 허용 등으로 필터가 새므로, 모든 문자열을 `parseAgeInput`이 단일 관문에서 검증(S5 이중 방어와 정합). 모바일 숫자 키패드는 `inputMode=numeric`로 확보. **타당 — 오히려 안전.** (부수효과: textbox role 2개화 → T9 셀렉터 조정 필요했고 적절히 처리됨.)

---

## 통신
- blocker 0 → tdd-implementer 수정 요청 없음.
- integration-qa 공유: **기술 품질 검수 통과(승인)**. tsc/test/lint 3게이트 green. Med·Low 5건은 defer(기록만).
