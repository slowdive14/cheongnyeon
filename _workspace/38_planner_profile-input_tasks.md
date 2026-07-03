# 38 · Phase Planner — 지역(시·도)·나이 입력 UI (TDD 작업 분해)

날짜: 2026-07-02 · 대상: 프로필 입력(시·도 17개 + 나이) 기능 · 스택: React 19 + Vite + TS, vitest + RTL

---

## 0. 요약 (오케스트레이터/구현자 인수인계)

- **작업 10개**(RED→GREEN→REFACTOR). 도메인 3, UI 컴포넌트 3, 배선(App/useFunnel) 3, 회귀·리팩터 1.
- **핵심 설계 권고**: (1) `UserProfile.age`를 `number` → `age?: number`로 넓힌다(파급 안전 확인 완료). (2) **App이 profile 상태를 소유**하고 FunnelContainer에 내려준다(기존 흐름 유지·테스트 용이). (3) profile 변경 재검색은 **이미 배선됨**(useFunnel effect deps에 profile 포함) — 단 deps memo 안정성 리스크를 규율로 막는다.
- **최대 리스크**: profile 상태를 App의 `useMemo<TraverseDeps>` deps에 부주의하게 넣으면 매 키 입력마다 원격 검색이 재실행된다(네트워크 남발). profile은 **검색이 아니라 자격 판정 입력**이므로, traverse는 재실행되되 **원격 search 호출은 query가 바뀌지 않으면 억제**되는 현 구조를 훼손하지 말 것 — 아래 T8에서 회귀 테스트로 고정.

---

## 1. 설계 결정 5항목 — 조사 결과 및 권고

### 결정 1: `UserProfile.age`를 optional로 넓힐지
**권고: `age?: number`로 넓힌다 (도메인 타입 변경).**
근거(전수 grep 결과):
- `profile.age` 실제 소비처는 `src/domain/eligibility.ts` **단 한 곳**(78~79행). 78행 `if (!isUsableAge(profile?.age)) return review('AGE_UNKNOWN')` 가 이미 `undefined`/`NaN`/음수/비유한을 review로 안전 처리하고, 79행 `const age = profile.age`는 그 가드 **이후**라 타입 좁힘(narrowing)으로 안전. → optional화해도 로직 변경 0, 컴파일 안전.
- `applyRules.ts`는 age 미사용(activePrograms/completedPrograms만). traverse.ts는 profile을 통째로 전달만.
- **fixture 파급**: `age: number`를 요구하던 테스트 fixture(`eligibility.test.ts` baseProfile, UI 테스트 PROFILE 등 7개 파일)는 optional화 후에도 `age: 30`을 명시하므로 깨지지 않음. 오히려 "age 생략" 케이스를 새로 테스트 가능해짐.
- **대안(기각)**: App 상태에서만 `number | null`로 두고 조립 시 처리 → 타입 계약이 UI 계층에만 존재해 도메인 테스트가 미입력 경로를 직접 검증 못 함. 도메인 불변식(미입력=review)을 타입 수준에서 보장하려면 도메인 타입을 넓히는 편이 안전.
- 주석 갱신: types.ts 79행 부근에 "미입력(undefined) → ageAxis가 review(AGE_UNKNOWN)로 보수 판정" 명시.

### 결정 2: 프로필 입력 UI 배치 — App 소유 vs FunnelContainer 내부
**권고: App이 `profile` 상태(`useState<UserProfile>`)를 소유, FunnelContainer의 기존 `profile` prop으로 하향 전달. 입력 UI 컴포넌트(`ProfileInput`)는 FunnelContainer가 렌더하고 `onProfileChange` 콜백으로 App에 역전파.**
근거:
- 기존 props 흐름이 이미 App→FunnelContainer `profile` prop. 흐름 방향 유지 = 최소 변경·기존 테스트 보존.
- FunnelContainer 내부 상태로 두면 `useFunnel`이 받는 profile을 컨테이너가 소유하게 되어, App의 DEMO_PROFILE 제거 및 미래 localStorage 연동(App 계층) 배선이 꼬인다.
- **deps memo 안정성**: profile은 App의 `useMemo<TraverseDeps>` deps 배열(119행 `[now, index, env.embedProvider, env.crisisAnchors, search]`)에 **들어있지 않다**. profile을 여기 넣지 말 것 — traverse는 profile을 별도 인자로 받으므로 deps에 불필요. profile 변경이 원격 search 함수 재생성을 유발하면 안 됨. (T8 회귀로 고정.)
- 테스트 용이성: ProfileInput을 독립 컴포넌트로 분리하면 단위 테스트(경계값)와 통합 테스트(위기 불변식)를 분리 가능.

### 결정 3: 프로필 변경 시 기존 검색 결과 재평가 흐름
**권고: 추가 배선 불필요 — 이미 반응함. 단 회귀 테스트로 고정.**
근거:
- `useFunnel.ts` 102행 effect deps에 `profile`이 포함 → profile 객체가 바뀌면 `traverseFn(graph, {..., profile}, deps)` 재실행 → evaluate 재수행 → 결과 재평가. 이미 동작.
- 주의: profile을 매 렌더 **새 객체로** 만들면(예: App에서 인라인 조립) query 미변경에도 traverse가 재실행된다. traverse 내부에서 원격 `search`는 query 기준이므로 결과는 같지만 **네트워크 재호출** 가능. → profile은 `useState`로 안정 참조 유지, 변경 시에만 새 객체(setState). (T8에서 "동일 profile 참조 → 재검색 없음" 검증.)

### 결정 4: localStorage 영속화
**권고: 이번 스코프 제외(Should, defer). 계획서에 잔여로 기록.**
근거: 진단 도구 특성상 세션당 1회 입력이 흔하고, apiKeyStore 패턴(localStorage) 재사용이 쉬워 후속 비용 낮음. 그러나 영속화는 안전 불변식(미입력=review)과 무관하고, 이번 핵심(정밀 판정 배선)과 독립. MVP 가치 대비 우선순위 낮음. **T10(리팩터)에서 훅 경계만 열어두고(예: `useProfileState` 추상화) 실제 저장은 후속.**

### 결정 5: income(medianRatio: 100) 하드코딩
**스코프 밖 — 알려진 잔여로 기록.** App의 DEMO_PROFILE에서 income 하드코딩은 이번 기능이 건드리지 않는다. 프로필 조립 시 income은 현재 값(또는 미입력 시 `{}`)을 유지. **소득 입력 UI는 별도 후속 스코프.** 단 T7(App 배선)에서 income 하드코딩을 프로필 상태로 옮길 때 값은 보존(회귀 방지).

---

## 2. 작업 목록 (RED → GREEN → REFACTOR)

> 순서 근거: 도메인 타입/판정을 먼저 굳혀야(T1~T2) UI·배선이 안전 계약 위에 선다. UI 컴포넌트(T3~T5)는 판정과 독립해 병렬 가능. 배선(T6~T8)은 컴포넌트 완성 후. 회귀·리팩터(T9~T10) 마지막.

---

### T1 — 도메인: `UserProfile.age` optional화 + 미입력 review 계약 고정
**왜 먼저**: 나이 미입력 허용이 이 기능의 절대 요건. 타입을 넓히고 도메인 계약을 테스트로 못 박아야 UI가 안심하고 `undefined`를 넘길 수 있다.

- 대상 파일: `src/domain/types.ts`(78~95행 UserProfile), `src/domain/eligibility.ts`(주석만, 로직 무변경 확인)
- 테스트 파일: `test/unit/domain/eligibility.test.ts`(기존 축 A 블록에 추가)
- **RED 시나리오(경계값)**:
  - `age` 생략(undefined) + ageMin/ageMax 있는 **비전국** 정책 → `review`, reasons에 `AGE_UNKNOWN` 포함.
  - `age: NaN` → `review AGE_UNKNOWN`.
  - `age: -1`(음수) → `review AGE_UNKNOWN`.
  - `age: 33.5`(비정수) → **확인 필요**: 현 `isUsableAge`는 정수 강제가 아님(Finite·비음이면 통과). 비정수 나이는 `age < ageMin`/`> ageMax` 비교로 흐른다. 34.0 경계 근처 float 처리 정책은 도메인 팀 판단 — 현 동작(비정수 허용, 비교만) 유지를 명시하되, **UI는 정수만 입력 허용**(T4에서 파싱 단계 차단)으로 이중 방어. → 이 테스트는 "비정수도 throw 없이 비교된다"만 고정.
  - `age: 0` → `isUsableAge` 통과(0은 유효). ageMin=19 정책이면 `blocked AGE_BELOW_MIN`(0<19).
- **GREEN**: types.ts에서 `age: number` → `age?: number`. eligibility 로직 무변경(가드가 이미 처리). 주석 갱신.
- **DoD**: 위 5 케이스 green, 기존 축 A 테스트(A-1~) 전부 유지 green, `tsc` 0 에러(7개 fixture 파일 미파손 확인).

---

### T2 — 도메인: 나이 경계값 정밀 판정 재확인(ageMin/ageMax 정확 일치)
**왜**: "입력=정밀 판정" 요건. 경계 나이가 통과/탈락 어느 쪽인지 명세로 못 박아 off-by-one 리스크 제거. (기존 A-1/A-2가 34/35를 덮지만, 하한 경계와 min==max 케이스 보강.)

- 대상 파일: `src/domain/eligibility.ts`(67~83 ageAxis, 무변경 예상 — RED가 이미 green이면 회귀 잠금 테스트로 승격)
- 테스트 파일: `test/unit/domain/eligibility.test.ts`
- **RED 시나리오(경계값)**:
  - ageMin=19, ageMax=34: age **34** → PASS(now), age **35** → blocked(AGE_ABOVE_MAX), age **19** → PASS, age **18** → blocked(AGE_BELOW_MIN). (34 통과/35 탈락 명시.)
  - ageMin=null, ageMax=34: age 34 → PASS, age 35 → blocked. (하한 없음.)
  - ageMin=19, ageMax=null: age 19 → PASS, age 18 → blocked. (상한 없음.)
  - ageMin==ageMax==30: age 30 → PASS, age 29/31 → blocked. (단일 나이 정책.)
  - ageMin/ageMax 양쪽 null + **전국** 정책 → PASS(Lever A, isNationwide 예외). + **비전국** → review(AGE_UNKNOWN).
- **GREEN**: 대개 무변경(회귀 잠금). 실패 시 최소 수정.
- **DoD**: 모든 경계 케이스 green. blocked/review 사유 코드 정확 일치.

---

### T3 — UI 유틸: 시·도 옵션 소스 + 나이 문자열 파싱기(순수 함수)
**왜**: UI 컴포넌트가 렌더·이벤트에 집중하도록, 옵션 목록과 입력 파싱을 순수 함수로 분리해 경계값을 컴포넌트 밖에서 촘촘히 테스트한다. **`SIDO_LIST` 재사용(신규 테이블 생성 금지)**.

- 대상 파일: `src/ui/funnel/profileInput.ts`(신규 — 순수 헬퍼). `SIDO_LIST`는 `@/domain/parse/sido`에서 import.
- 테스트 파일: `test/unit/ui/profileInput.test.ts`(신규)
- **RED 시나리오(경계값)**:
  - `sidoOptions()`: `SIDO_LIST` 17개 전부 `{code,name}` 매핑 + 선두에 "선택 안 함"(value=''). 길이 **18**. 각 code가 유일. (17 시·도 전부 존재 스냅샷 없이 코드 집합 비교: 11/26/27/28/29/30/31/36/41/43/44/46/47/48/50/51/52.)
  - `parseAgeInput('')` → `undefined`(미입력).
  - `parseAgeInput('25')` → `25`.
  - `parseAgeInput('0')` → `0`(유효).
  - `parseAgeInput('-1')` → `undefined`(음수 거부) **또는** 도메인에 넘겨 review 유도 — **권고: 파싱 단계에서 undefined**(UI 이중 방어, 도메인은 review 폴백). 결정 명시.
  - `parseAgeInput('34.5')` → `undefined`(비정수 거부 — UI는 정수만).
  - `parseAgeInput('abc')` → `undefined`(비수치).
  - `parseAgeInput('   ')`(공백) → `undefined`.
  - `parseAgeInput('999')` → 상한 클램프 여부 결정 필요: **권고 = 상한 없이 그대로 통과**(비현실 나이는 도메인이 blocked 처리, UI는 물리적 max=120 정도 `<input max>`만 힌트). → 파싱은 999 반환.
  - `parseSidoCode('11')` → '11'(유효 코드). `parseSidoCode('')` → undefined(선택 안 함). `parseSidoCode('99')`(테이블 없음) → undefined(방어).
- **GREEN**: 순수 함수 구현. 정규식/Number 파싱, `Number.isInteger` + `>=0` 가드.
- **DoD**: 모든 경계 green. throw 없음(어떤 문자열 입력도).

---

### T4 — UI 컴포넌트: `ProfileInput` 렌더 + 접근성 + onChange 계약
**왜**: 사용자 대면 입력 표면. 접근성(label 연결)·기존 UI 관용구(SettingsModal/FreeTextInput 스타일) 준수. 순수 헬퍼(T3) 위에 얹어 상태 없는(controlled) 컴포넌트로.

- 대상 파일: `src/ui/funnel/ProfileInput.tsx`(신규). props: `{ regionCode?: string; age?: number; onChange: (patch: {regionCode?: string; age?: number}) => void }`. `data-funnel-region="profile-input"` 부여(기존 관용구).
- 테스트 파일: `test/unit/ui/ProfileInput.test.tsx`(신규)
- **RED 시나리오**:
  - 렌더 시 시·도 `<select>`(role=combobox, aria-label 예: "거주 지역 (시·도)")와 나이 `<input>`(role=spinbutton/number, aria-label "나이") 존재.
  - `<select>` 옵션 **18개**("선택 안 함" + 17). 각 시·도 name 표시.
  - 시·도 선택(예: 부산 '26') → `onChange({ regionCode: '26' })` 1회.
  - "선택 안 함" 선택 → `onChange({ regionCode: undefined })`(빈 문자열이 아니라 undefined로 정규화 — regionAxis의 REGION_PROFILE_MISSING 유도).
  - 나이 '30' 입력 → `onChange({ age: 30 })`.
  - 나이 빈칸 → `onChange({ age: undefined })`.
  - 나이 '-5'/'12.3'/'abc' 입력 → `onChange({ age: undefined })`(T3 파서 경유).
  - 초기값 prop(regionCode='11', age=25) 반영: select value='11', input value='25'.
  - label↔control 연결(getByLabelText로 접근 가능) — 접근성 DoD.
- **GREEN**: controlled 컴포넌트. select onChange→parseSidoCode, input onChange→parseAgeInput. 스타일은 SettingsModal의 border/rounded/focus 관용구 복제.
- **DoD**: 모든 시나리오 green. getByLabelText 성공. throw 없음.

---

### T5 — UI 통합(안전): 위기 시 ProfileInput 미렌더 (★위기 불변식)
**왜 — 최우선 안전**: FunnelContainer 렌더 불변식 1(위기 시 배너만, 입력·결과·예시·설정 일절 미렌더)을 새 입력 UI로 확장. safety-auditor 핵심 감사 축.

- 대상 파일: `src/ui/funnel/FunnelContainer.tsx`(74~80 위기 early-return 분기 — ProfileInput은 이 분기 **아래**(비위기)에만 배치).
- 테스트 파일: `test/integration/funnel/profileInput.ui.test.tsx`(신규) + `test/integration/funnel/freeInput.ui.test.tsx`의 UI-2/UI-10 패턴 재사용.
- **RED 시나리오(위기 불변식)**:
  - 비위기 초기 화면 → `data-funnel-region="profile-input"`(또는 시·도 select) **존재**.
  - 위기어 입력('죽고 싶어요') → `role="alert"`(SafetyBanner) 존재 **&&** profile-input **부재**(`queryByTestId`/`queryByLabelText` null). (freeInput UI-2와 동형.)
  - 완곡 위기('버틸 힘이 없어') → 동일하게 profile-input 부재.
  - 위기 해제(칩/입력 정정) 후 → profile-input 재노출(선택: 회복 경로).
- **GREEN**: FunnelContainer 위기 early-return은 이미 배너만 렌더 → ProfileInput을 return 문 하단(비위기 JSX)에만 삽입하면 자동 충족. 배치 위치: header 아래, FreeTextInput 위(또는 접이식). 위기 분기에 절대 넣지 말 것.
- **DoD**: 위기 3종(직접/자해/완곡) 모두 profile-input 부재 green. 비위기 존재 green.

---

### T6 — 배선(도메인 통합): profile 미입력 → review 유지 (end-to-end 안전)
**왜 — 절대 요건**: "미입력=review 유지". 시·도 선택 안 함 + 나이 빈칸 프로필이 FunnelContainer→useFunnel→traverse→evaluate를 거쳐 현재 동작(REGION_PROFILE_MISSING/AGE_UNKNOWN → 확인 필요 카드)과 동일함을 통합 수준에서 고정.

- 대상 파일: (검증 위주) `src/ui/funnel/FunnelContainer.tsx`, `src/ui/funnel/useFunnel.ts`
- 테스트 파일: `test/integration/funnel/profileInput.ui.test.tsx`
- **RED 시나리오**:
  - **미입력 profile**(`{ age: undefined, region:'전국', regionCode: undefined, income:{} }`) + 비전국·나이있는 정책 → 결과에 "자격 확인 필요/거의 충족" 카드 노출(review), "막힘/부적격/탈락" 문구 부재. (funnel.ui.test E5 패턴.)
  - **미입력 profile** + 지역 정책(비전국, regionCodes=['26']) → REGION_PROFILE_MISSING로 review(blocked 아님, 숨김 아님).
  - 나이 미입력 + 비전국 ageMin/ageMax 정책 → AGE_UNKNOWN review.
- **GREEN**: 배선 무변경 예상(useFunnel이 이미 profile 반응). traverse가 실제 evaluate 수행하도록 실 traverse 사용(모킹 X) 또는 evaluate 결과를 반환하는 traverse fixture.
- **DoD**: 미입력=review 3종 green. blocked/숨김 0.

---

### T7 — 배선(App): DEMO_PROFILE 제거 → profile 상태 소유 + ProfileInput 역전파
**왜**: App이 profile을 `useState`로 소유하고 ProfileInput의 onChange를 받아 FunnelContainer에 내려준다(결정 2). income 하드코딩 보존(결정 5), 나이 하드코딩(25) 제거 → 초기 미입력.

- 대상 파일: `src/App.tsx`(30~39 DEMO_PROFILE, 130~138 FunnelContainer 렌더). FunnelContainer에 `profile` + `onProfileChange` prop 배선.
- 테스트 파일: `test/integration/app.profile.test.tsx`(신규, 경량) 또는 FunnelContainer 통합에 흡수.
- **RED 시나리오**:
  - 초기 App profile: `age: undefined`, `regionCode: undefined`(미입력), `region: '전국'`, `income: { medianRatio: 100 }`(보존). → 초기엔 지역·나이 정책이 review로 노출(회귀: "결과 없음" 재발 없음).
  - ProfileInput에서 시·도 '26'(부산) 선택 → App profile.regionCode='26' 갱신 → 부산 정책 PASS, 타 지역 blocked(숨김). (정밀 판정 전환.)
  - 나이 30 입력 → App profile.age=30 → 나이 범위 정책 정밀 판정.
- **GREEN**: App에 `const [profile, setProfile] = useState<UserProfile>(초기 미입력)`. `onProfileChange(patch)` → `setProfile(p => ({...p, ...patch}))`. FunnelContainer가 ProfileInput에 값·콜백 전달.
- **DoD**: 초기 미입력=review green. 선택 후 정밀 판정 green. income 값 보존 확인.

---

### T8 — 배선(회귀·성능): profile 변경이 원격 검색 재호출을 유발하지 않음 (deps memo 안정성)
**왜 — 최대 리스크**: profile은 자격 입력이지 검색 입력이 아니다. profile 변경 시 traverse는 재실행(재평가)되어야 하지만, App의 `useMemo<TraverseDeps>`(109~120)와 원격 `search` 함수(100~106)는 profile에 의존하면 안 된다. 부주의 배선 시 매 키/선택마다 Edge Function 네트워크 남발.

- 대상 파일: `src/App.tsx`(deps memo·search memo deps 배열), `src/ui/funnel/useFunnel.ts`(profile effect dep).
- 테스트 파일: `test/unit/ui/useFunnel.test.tsx`(신규 케이스) 또는 `test/integration/app.profile.test.tsx`
- **RED 시나리오**:
  - `traverseFn` spy 주입. 동일 query 유지 + profile 변경(regionCode '' → '26') → traverseFn 재호출됨(재평가 필요 — 정상). **단** 주입한 원격 `search` spy는 profile 변경만으로 호출되지 않음 검증(query 미변경 시 search 인자 동일). → traverse가 재호출돼도 하위 search 남발이 없음을 profile-only 변경으로 고정.
  - App 레벨: profile setState가 `deps`(TraverseDeps) memo 객체 참조를 바꾸지 않음 확인(deps 배열에 profile 부재).
  - profile 동일 참조 재렌더(부모 리렌더) → traverseFn 재호출 없음(profile useState 안정 참조).
- **GREEN**: profile을 App deps/search memo 배열에 **넣지 않는다**. FunnelContainer가 profile을 useFunnel에 별도 인자로 전달(현 구조 유지).
- **DoD**: profile 변경 시 재평가 O, 원격 search 남발 X green. deps memo 참조 안정 green.

---

### T9 — 회귀: 기존 안전 표면 무손상 + 기존 테스트 전량 green
**왜**: profile 입력 추가가 위기 감지·'추정' 고지·원문 링크·설정 모달 등 기존 표면을 훼손하지 않음을 전수 확인.

- 대상 파일: (검증) 기존 통합 테스트 전체.
- 테스트 파일: `test/integration/funnel/funnel.ui.test.tsx`, `freeInput.ui.test.tsx`, `funnel.crisis.test.tsx`, `test/unit/ui/useFunnel.test.tsx` 등 — PROFILE fixture에 `age`가 optional이 된 후에도 명시값 유지되므로 무변경 예상.
- **RED/회귀 시나리오**:
  - 기존 funnel.ui.test 전체 green(추정 고지·원문 링크·업데이트·now/soon 배지·blocked 미노출·review 카드).
  - freeInput.ui.test 전체 green(위기 배너 우선·설정 모달·초기 화면).
  - crisis.test green.
- **GREEN**: 무변경 목표. 실패 시 최소 수정(예: 초기 화면 스냅샷에 profile-input 추가 반영).
- **DoD**: 전체 스위트 green, tsc 0, eslint 0.

---

### T10 — REFACTOR: profile 상태 훅 경계 정리 + 주석/잔여 기록
**왜**: localStorage 후속(결정 4)을 위한 경계만 열고, DEMO_PROFILE 삭제 흔적·잔여(income·비정수 나이)를 코드/문서에 명시.

- 대상 파일: `src/App.tsx`(선택: `useProfileState` 추출), `src/domain/types.ts` 주석, 본 문서 잔여 섹션.
- **REFACTOR 시나리오(테스트 무변경, green 유지)**:
  - profile 초기값·onChange 로직을 (선택) 훅으로 추출 — 인터페이스만, localStorage 미구현.
  - 주석: "income medianRatio:100 하드코딩 = 알려진 잔여(소득 입력 UI 후속)", "비정수 나이는 UI 파서가 차단, 도메인은 비교 폴백".
- **DoD**: 리팩터 후 전체 green 유지. 잔여 3건 문서화.

---

## 3. 안전 포인트 요약 (safety-domain-auditor 인수인계)

| # | 안전 불변식 | 고정 테스트 | 경계/데이터 |
|---|------------|-------------|-------------|
| S1 | **미입력=review 유지** | T1, T6, T7 | 시·도 '선택 안 함'(regionCode=undefined) + 나이 빈칸(age=undefined) → 비전국 지역정책=REGION_PROFILE_MISSING·나이정책=AGE_UNKNOWN → "확인 필요" 카드. blocked/숨김 0. |
| S2 | **입력=정밀 판정** | T2, T7 | 시·도 선택 시 불일치 정책 blocked(숨김·대안 유도), 일치 PASS. 나이 34 PASS / 35 blocked / 18 blocked(min19) / 0(min19) blocked. |
| S3 | **★위기 불변식** | T5 | 위기(직접 '죽고 싶어요' / 자해 '자해하고 싶어' / 완곡 '버틸 힘이 없어') 중 profile-input 미렌더. SafetyBanner 단독. |
| S4 | **안전 표면 무손상** | T9 | 위기 감지·'추정' 고지·원문 링크(null 안전)·설정 모달 위기 시 미노출 — profile 추가 후에도 전량 green. |
| S5 | **보수 파서 이중 방어** | T3, T4 | UI 파서가 음수/비정수/비수치 나이를 undefined로 정규화(→도메인 review 폴백). 도메인 isUsableAge가 최종 안전망. false-accept 경로 없음. |

**감사 유의**: S2의 blocked(숨김)은 사용자에게 "부적격 단정"을 노출하지 않고 대안 칩으로 유도하는 기존 traverse 규약(빨강 직출력 금지)을 따라야 함. profile 정밀화가 이 규약을 우회해 blocked 카드를 직노출하면 안 됨.

---

## 4. 알려진 잔여 (이번 스코프 밖 — 기록만)

- **R1 income 하드코딩**: `medianRatio: 100` — 소득 입력 UI 없음. 프로필 조립 시 값 보존. 소득 입력은 별도 후속 스코프.
- **R2 localStorage 영속화**: 미구현(결정 4, Should defer). T10에서 훅 경계만.
- **R3 비정수 나이 도메인 처리**: `isUsableAge`는 정수 강제 아님(Finite·비음). UI 파서(T3)가 정수만 통과시켜 이중 방어하나, 도메인 단독 호출 시 34.5 등은 비교로 흐름. 정수 강제를 도메인에 넣을지는 후속 판단.
- **R4 시군구(5자리)**: 시·도(2자리) 단위만. sido.ts 주석의 "시군구는 후속" 그대로.

## 5. plan/코드 불일치 (없음)

전수 조사 결과 plan 브리핑과 실제 코드 일치. 특기:
- `isUsableAge`가 undefined/NaN/음수를 review로 처리함을 78행에서 확인(브리핑대로).
- DEMO_PROFILE은 이미 regionCode 미포함(버그 수정 반영됨). age:25·income medianRatio:100은 하드코딩 유지 상태 확인.
- `SIDO_LIST` 17개 코드 확인(11~52, 42/45 없음, 강원51·전북52). 재사용 대상, 신규 테이블 금지.
