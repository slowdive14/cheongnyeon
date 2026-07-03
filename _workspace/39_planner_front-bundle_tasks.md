# 39 — 프론트 묶음 TDD 작업 분해 (D-① · E · F-①②③)

작성: 2026-07-02 · Planner → tdd-implementer / safety-domain-auditor
근거 SSOT: 루트 `DESIGN.md` (§2 토큰·§3 모양·§4 인벤토리·§5 카피·§6 접근성·§7 안전 불변) + `docs/plans/PLAN_ops-and-seoul-expansion.md` Phase D-①·E·F-①②③.
전제: git 저장소 아님(변경 이력 관리 없음), 기존 테스트 669 기준 회귀 0 게이트, `npm run test / build / lint`.

---

## 0. 설계 결정 권고 (구현 착수 전 확정 사항)

### R-1. D-① 자격 엔진 확장 방식 — **(a) `EvaluatedPolicy`에 축별 verdict 노출 권고**
- 근거: `src/domain/eligibility.ts`는 이미 축 판정을 `Verdict[]` (ageAxis/incomeAxis/regionAxis/recruitAxis)로 계산한 뒤 **pass는 버리고 blocked/review reason만 수집**한다(154~176행). "통과 축" 정보는 엔진 내부에 이미 존재하나 계약에서 소실된다.
- (b)안(카드에서 policy+profile로 재구성)은 ageAxis/regionAxis 로직을 UI에 복제 → SSOT 이중화·드리프트 위험(예: `isNationwide` 나이 무관 규칙, 강원=51/전북=52 코드 등 미묘한 분기). DESIGN.md §7-4 "자격 단정 금지"를 두 곳에서 지켜야 함 = 리스크 2배.
- **권고**: `EvaluatedPolicy`에 옵셔널 `axes?: AxisResult[]` 추가. `AxisResult = { axis: 'age'|'income'|'region'|'recruit'; verdict: 'pass'|'review'|'blocked'; reason?: ReasonCode }`. 기존 `reasons`/`recruitStatus` 필드·`evaluate` 버킷 분류 계약은 **무변경**(옵셔널 추가만 → 669 회귀 0). 카드는 `axes`의 pass 축만 ✓로, review 축만 ?로 렌더.
- 안전 게이트: pass 축 문구는 "충족(추정)" 의미로만, "자격이 됩니다" 금지(§7-4). blocked 축은 카드가 애초에 미노출(blocked 버킷은 ResultList가 필터)이므로 카드에 blocked verdict 라인은 렌더하지 않음 — 단 엔진이 축 배열에 담아도 무해(카드가 pass/review만 필터).

### R-2. F-② 서류 사전 노출 — **(a) 데이터 모듈+테스트만, 노출은 F-⑤로 defer 권고**
- 근거: F-⑤(로드맵/카드 펼침)가 아직 없어 "카드 하단 접이식"을 지금 넣으면 펼침 UI 골격을 F-⑤와 별도로 임시 제작 → F-⑤에서 재작업. 비용>가치.
- **권고**: `src/data/static/documents.ts` (순수 데이터 + 조회 헬퍼) + 단위 테스트만 이번 스코프. 노출 배선은 F-⑤ 태스크에 인계 메모. 데이터 정확성 보수 규칙(R-4)만 이번에 확정.

### R-3. F-③ 청년센터 연결 데이터 전략 — **v1: 온통청년 공식 경로 통일 링크 + 시·도명 반영 문구 권고 (개별 연락처 미노출)**
- 근거: DESIGN.md §7·플랜 F-③ "★★검증되지 않은 전화번호·기관명 날조 절대 금지"(안전 바닥선). 17개 시·도 실 연락처를 지금 검증 불가.
- **권고 데이터 구조**: `src/data/static/youthCenters.ts` — 시·도별 레코드에 `phone: string | null`, `centerName: string | null` 필드를 **비워둔 채(null)** 두고(운영자 검증 후 채울 자리), v1 노출은:
  - 통일 링크: 온통청년 공식 센터찾기/상담 경로 1개(implementer가 **curl로 실존 확인한 URL만** 사용 — 미확인 시 온통청년 메인으로 폴백하고 인계 메모에 "URL 실존 확인 필요"로 남긴다).
  - 문구: DESIGN.md §5 "혼자 하기 버거우면 OO청년센터가 같이 해줘요"에서 OO=사용자 시·도명(`sidoNameByPrefix(regionCode)`), 미입력 시 지역명 없는 일반 문구.
  - `phone`이 null이면 전화 UI 미렌더(날조 0). 운영자가 값을 채우면 자동 노출되는 구조.
- **층위 분리(안전)**: 위기 푸터(CrisisFooter, 전문기관 109/1577-0199)와 동행 블록(청년센터, 신청 도움)은 시각·문구·의미가 겹치지 않게. 동행 블록은 위기 문구 톤을 쓰지 않는다.

### R-4. F-② 데이터 정확성 보수 규칙
- 상식 수준만 확정 기재(등본=정부24 무료/주민센터 소액 유료 등). **불확실 항목은 값을 지어내지 않고 `"정부24에서 확인"` 류 폴백 문자열**. 수수료 미상은 `fee: null` → 렌더 시 "확인 필요"로. 지어내기 금지(테스트로 강제: 모든 레코드는 `issuer` 필수, 불명 필드는 명시적 null).

### R-5. 신선도 라인("어제 업데이트된 전국 N개") 처리 — **이번 스코프 제외(실데이터 없음) 권고**
- 근거: DESIGN.md 원칙 3 "거짓 숫자 금지" + 플랜 E-③ "Phase A 배치 후 실데이터". 배치(Phase A) 미실행 → N값 없음.
- **권고**: "어제 업데이트된 전국 N개" 신선도 라인은 넣지 않는다. **단** 카드 개별 `updatedAt`(CachedPolicy) 기반 "최종 업데이트 YYYY-MM-DD"는 실데이터이므로 **유지**(DESIGN.md §7-2 신선도 유지 = 이 카드 라인이 담당). 헤드라인 "N개를 찾았어요"의 N은 신선도가 아니라 **실제 노출 카드 수**라 실데이터 → 사용(R-E2).

---

## 1. 라벨 단언 전수 목록 (grep 근거 — 갱신 대상)

`test/` 전수 grep 결과. 라벨 변경 시 **아래 파일의 단언을 동일 커밋에서 갱신**(DESIGN.md §7-3). "왜 맞을까요"/"왜 맞는지" 관련은 표시 제거 태스크(T-D1c)와 연동.

| 변경 문구 | 기존 → 확정(DESIGN §5) | 단언 위치(파일:행) | 조치 |
|---|---|---|---|
| 검색 버튼 | `정책 찾기` → `내 정책 찾기` | `test/integration/funnel/freeInput.ui.test.tsx:44,52,59,95` (`getByRole('button',{name:'정책 찾기'})`) | 4곳 `내 정책 찾기`로. 소스: `src/ui/funnel/FreeTextInput.tsx:86` |
| review 배지 | `자격 확인 필요` → `몇 가지만 확인하면 돼요` / `거의 충족` → `거의 다 왔어요 — N만 확인` | `PolicyResultCard.test.tsx:48,56,75,82,85`; `ResultList.test.tsx:42,43`; `funnel.ui.test.tsx:185,194,195`; `app.profile.test.tsx:123,124`; `profileInput.ui.test.tsx:131,149` | 정규식 단언(`/거의 충족\|자격 확인 필요/`)은 확정 문구로 교체. 소스: `PolicyResultCard.tsx:73~78,136~145` |
| now 배지 | `지금 신청 가능` → `지금 바로 신청돼요` | `PolicyResultCard.test.tsx:40`(`/지금/`은 통과 유지), `app.profile.test.tsx:136`(주석) | `/지금/` 부분매치는 유지 가능하나 확정 문구로 명시 권장. 소스: `PolicyResultCard.tsx:74` |
| soon 배지 | `곧 시작/마감` → (DESIGN §5 미정의) | `PolicyResultCard.test.tsx:45`(`/곧/`) | **확인 필요**: DESIGN §5 표에 soon 라벨 확정 문구 없음. `/곧/` 부분매치 유지하고 카피는 기존 유지 or 감사자 확인. 아래 Q-1. |
| review 힌트 | `○○만 확인하면 돼요` / `확인 항목: …` | `PolicyResultCard.test.tsx:83`(`/모집 시기만 확인/`) | 배지 문구 "거의 다 왔어요 — N만 확인"과 정합되게 힌트 문구 조정 시 갱신. |
| 원문 버튼 | `원문 보기` → `신청 페이지 열기 (온통청년)` | **테스트 단언 없음**(grep 0 — `getByRole('link')`로만 검증: `PolicyResultCard.test.tsx:60,95`, `funnel.ui.test.tsx` href) | 문구 자유 변경 가능. link href 단언은 무영향. |
| "왜 맞을까요" prose | 표시 제거 | `PolicyResultCard.test.tsx:149,164,173`(`policy-explanation` testid) | T-D1c에서 재정의(아래). |

**저위험(테스트 단언 0)** — 소스만 변경, 회귀 없음: 헤더 `청년정책 진단`/보조문(`FunnelContainer.tsx:95-96`), placeholder(`FreeTextInput.tsx:27,68`), 빈 결과 문구(`ResultList.tsx:56`), 예시 라벨(`FunnelContainer.tsx:147`), 헤드라인 `'…' 추정 결과`(`FunnelContainer.tsx:135`). grep으로 재확인 완료(2026-07-02).

---

## 2. 작업 목록 (RED → GREEN → REFACTOR)

> 순서 원칙: **도메인 순수 확장(D-① 엔진) 먼저** → 그 계약 위에서 카드 UI → 전역 토큰/폰트(E 비주얼) → 카피 전환(라벨 갱신 동반) → F 카피/데이터. 도메인을 먼저 굳혀야 UI가 흔들리지 않고, 토큰을 먼저 등록해야 이후 컴포넌트가 hex 없이 작성된다. 안전 불변식(위기 단독 렌더)은 UI 변경마다 회귀 테스트로 재확인.

### T-D1a — 자격 엔진 축 verdict 노출 (도메인, 순수) 【RED→GREEN→REFACTOR】
- **왜 먼저**: 카드 체크리스트의 데이터 소스. 계약 확정 전 UI 착수 금지.
- 대상: `src/domain/eligibility.ts` (`EvaluatedPolicy` 확장, `evaluateOne`에서 축 결과 수집)
- 테스트: `test/unit/domain/eligibility.test.ts` (기존 파일에 describe 추가) + 필요시 `eligibility.axes.test.ts`
- RED 시나리오·경계값(고정 clock `now=2026-06-24T12:00:00Z`, soonWithinDays 기본):
  - 나이 34 + ageMin 19/ageMax 34 → age축 `pass`; 나이 35 → `blocked`(AGE_ABOVE_MAX); 나이 18 + ageMin 19 → `blocked`(AGE_BELOW_MIN).
  - `isNationwide:true` + ageMin/Max 둘 다 null → age축 `pass`(연령 무관). 비전국 + 둘 다 null → `review`(AGE_UNKNOWN).
  - 나이 undefined → `review`(AGE_UNKNOWN); NaN·음수·Infinity → `review`(isUsableAge false).
  - region: `isNationwide:true` → `pass`; regionCodes `['26']` + userCode `'26'` → `pass`; userCode `'11'` → `blocked`(REGION_MISMATCH); regionCodes `[]` 비전국 → `review`(REGION_UNKNOWN); userCode undefined → `review`(REGION_PROFILE_MISSING).
  - income: `{kind:'none'}` → `pass`; medianRatio maxRatio 150 + user 100 → `pass`, user 151 → `blocked`; maxRatio NaN/Infinity → `review`; user ratio 미입력 → `review`(INCOME_PROFILE_MISSING).
  - recruit: now/soon → `pass`; closed → `blocked`; unknown → `review`.
  - **계약 무변경 검증**: 기존 `reasons`/`recruitStatus`/버킷(now/soon/blocked/review) 분류가 축 추가 후에도 동일(스냅샷/기존 테스트 그대로 통과).
  - 방어: `evaluate(null as any)` → 빈 결과; structurally broken policy → axes 없거나 안전 폴백, throw 0; policies 비배열 → throw 0.
- DoD: 새 축 필드로 pass/review/blocked가 축별로 조회 가능, 기존 eligibility 테스트 전량 그린, tsc 통과.

### T-D1b — 카드 "나와 맞는 점" 체크리스트 렌더 【RED→GREEN→REFACTOR】
- **왜 이 순서**: T-D1a 계약 소비. 카드가 도메인 축 verdict를 사람 문구로.
- 대상: `src/ui/funnel/PolicyResultCard.tsx` (체크리스트 섹션 추가). 문구 매핑 헬퍼(pass 축 → "나이 19~34세 — 내 나이 25세 충족" 류) export.
- 테스트: `test/unit/ui/PolicyResultCard.test.tsx`
- RED 시나리오·경계값:
  - pass age축(profile.age=25, ageMin19/Max34) → `✓` 마크 + "나이 …충족" 류 문구(자격 단정 아님).
  - pass region축(userCode '26', policy regionCodes ['26'], regionText '부산') → "부산 … 일치/충족" 류. **regionText/sido명 소스 확인 필요**(Q-2).
  - review 축(INCOME_UNKNOWN) → `?` 마크 + "소득 조건 — 원문에서 확인" 류. **"자격이 됩니다/안 됩니다" 문구 부재 단언**(`queryByText(/자격이 (됩|안 됩)/)` null) — DESIGN §7-4.
  - blocked 버킷은 카드 미노출 불변: 카드에 blocked 축 verdict가 섞여 와도 blocked 라인 미렌더(pass/review만 필터). ResultList가 blocked 버킷 필터하는 기존 동작 회귀 0.
  - 방어: `axes` undefined(구 데이터) → 체크리스트 미렌더, throw 0; profile 미입력 → review 축만 노출(pass 없음), throw 0; 빈 배열 → 미렌더.
  - '추정' 고지(DisclaimerNote)·원문 링크 **유지 단언**(§7-2) — 체크리스트 추가로 사라지지 않음.
- DoD: pass ✓/review ? 구분 렌더, 자격 단정 문구 0, 고지·링크 유지, 방어 테스트 그린.

### T-D1c — "왜 맞을까요" prose 표시 제거 (데이터·훅 보존) 【RED→GREEN→REFACTOR】
- **왜 이 순서**: D-② 재활성 예정이므로 `usePolicyExplanation`·`explanation` 데이터는 **삭제 금지**, 표시(JSX)만 제거.
- 대상: `src/ui/funnel/PolicyResultCard.tsx` (179~193행 explanation 렌더 블록 제거, 훅 호출·record memo·storedExplanation은 보존)
- 테스트: `test/unit/ui/PolicyResultCard.test.tsx`
- RED 시나리오:
  - stored explanation 있어도 `policy-explanation` testid **미렌더**(기존 154행 테스트를 "표시 안 됨"으로 반전).
  - llm 있어도 "왜 맞을까요"/"왜 맞는지" 텍스트 미표시(기존 164,173행 테스트 반전 또는 제거 — 감사자와 조율: 그라운딩 로직 자체는 D-②용으로 보존).
  - **회귀 방지**: 훅/`explainMatch` import는 유지(빌드 깨짐·향후 D-② 재배선 대비). lint unused 경고 나면 명시적 보존 주석 + eslint-disable 최소 범위.
  - **확인 필요(Q-3)**: 훅 호출을 남기면 llm 있을 때 비동기 fetch가 여전히 돎(결정성). 표시 안 하니 무해하나, "표시 제거 + 호출도 정지" vs "호출 보존"을 감사자와 확정. 권고: **호출은 정지(불필요 네트워크·비동기 0), 함수·타입 정의만 보존**(export 유지 → D-②가 재배선). → 결정형 게이트 유지.
- DoD: "왜 맞을까요" prose 화면 미표시, explain 관련 정의 보존(빌드 그린), 관련 테스트 갱신.

### T-E1 — Tailwind 토큰 + Pretendard 폰트 등록 (전역) 【RED→GREEN→REFACTOR】
- **왜 이 순서**: 이후 모든 컴포넌트가 토큰명만 쓰도록(hex 금지) 기반 먼저.
- 대상: `tailwind.config.js`(theme.extend.colors·borderRadius·fontFamily), `index.html` 또는 `src/index.css`(Pretendard 웹폰트 링크/`@font-face` + `font-sans` 폴백 스택)
- 테스트: 순수 유틸 아님(설정) → **테스트 어려움**. 최소 검증안:
  - `test/unit/ui/tailwindTokens.test.ts` (신규): tailwind.config를 import해 `theme.extend.colors`에 `cream`,`sand`,`ink`,`clay` 및 상태색(teal/amber/warmgray) 키 존재 단언. 값이 DESIGN §2 hex와 일치(예: `cream[50]==='#FAF6EF'`, `clay[500]==='#D85A30'`).
  - 폰트: config `fontFamily.sans[0]`에 `Pretendard` 포함 단언.
- 경계: hex 직접 사용 금지 회귀 방지용 grep 태스크는 T-E2/E3 이후 REFACTOR에서(신규 컴포넌트가 토큰만 쓰는지).
- DoD: 토큰 config 테스트 그린, `npm run build`에서 폰트/토큰 로드, 시각 회귀 없음(기존 slate-* 는 점진 이전 — 아래 주의).
- **주의(회귀)**: 기존 컴포넌트는 `bg-slate-50`,`text-sky-700` 등 사용. 토큰 추가만으로 회귀 0. 실제 색 교체는 T-E2에서 컴포넌트별로. 상태 배지 색(§2 3종)은 T-E4 카피 전환과 함께.

### T-E2 — 프로필 알약 (ProfileInput 리디자인) 【RED→GREEN→REFACTOR】
- **왜 이 순서**: DESIGN §4 "서식 2칸 노출 금지" — 알약 1개+탭 펼침. 기존 테스트 파급 큼(ProfileInput.test.tsx 전체가 select/input 상시 렌더 가정).
- 대상: `src/ui/funnel/ProfileInput.tsx`
- 테스트: `test/unit/ui/ProfileInput.test.tsx` (대폭 갱신), `test/integration/funnel/profileInput.ui.test.tsx`, `test/integration/app.profile.test.tsx`
- RED 시나리오·경계값:
  - 초기 접힘: "부산 · 25세 ✏️" 요약 알약 노출(regionCode 26·age 25). 미입력 → "지역·나이 입력 ✏️" 초대 문구.
  - 알약 탭 → select/input 펼침(펼친 뒤 getByLabelText 접근 가능). **기존 "상시 select+input" 단언(ProfileInput.test.tsx:14~33,88~98)은 "탭 후 접근"으로 갱신**.
  - onChange 계약 무변경(부산 26 → `{regionCode:'26'}`, 빈칸 → `{age:undefined}`, '-5'/'12.3'/'abc' → undefined) — **S5 보수 파서 방어 테스트 전량 유지**(펼침 후 입력).
  - 접근성: 알약 터치타깃 44×44(§6), label↔control 연결 유지, 키보드 펼침(Enter/Space).
  - 방어: regionCode만 있고 age 없음 → "부산 · 나이 입력" 부분 요약; 알 수 없는 regionCode → 지역명 폴백(throw 0).
- DoD: 알약 요약↔펼침 동작, onChange 계약·S5 방어 유지, 세 통합 테스트 그린.

### T-E3 — 예시 칩 말풍선 + 카테고리 아이콘 + 섹션 라벨 【RED→GREEN→REFACTOR】
- **왜 이 순서**: ChoiceChips 시각 강화. lucide-react 재사용(신규 의존성 금지).
- 대상: `src/ui/funnel/ChoiceChips.tsx`(말풍선 radius·아이콘), `src/ui/funnel/FunnelContainer.tsx`(섹션 라벨 "이렇게 적는 분들이 많아요")
- 테스트: `test/unit/ui/ChoiceChips.test.tsx`, `funnel.ui.test.tsx`
- RED 시나리오:
  - safety 노드 제외 불변 유지(기존), 빈 choices → 0 버튼 throw 0(기존).
  - 카테고리별 lucide 아이콘 렌더(하트·집·서류가방·책·지갑 매핑) — 아이콘은 `aria-hidden`, 접근명은 라벨 텍스트 유지.
  - 섹션 라벨 텍스트 "이렇게 적는 분들이 많아요"(FunnelContainer, 기존 "이렇게 적어도 돼요 — 눌러서…" 교체 — 테스트 단언 0이라 저위험).
  - 접근성: 칩 터치타깃 44×44, 포커스 링 유지.
- DoD: 아이콘·말풍선·라벨 렌더, safety 제외·빈 배열 방어 유지, 기존 ChoiceChips 테스트 그린.

### T-E4 — 카피/상태 라벨 전환 (배지·헤더·헤드라인·빈결과) 【RED→GREEN→REFACTOR】
- **왜 이 순서**: §1 라벨 단언 목록을 동일 커밋에서 갱신(§7-3). 도메인·카드 구조 확정 후 문구만.
- 대상: `PolicyResultCard.tsx`(STATUS_META·review 등급 라벨), `FunnelContainer.tsx`(헤더·보조문·헤드라인·예시 라벨), `FreeTextInput.tsx`(버튼·placeholder·label), `ResultList.tsx`(빈 결과)
- 테스트: §1 표의 모든 파일 갱신 + 신규 단언
- RED 시나리오·경계값:
  - now 배지 "지금 바로 신청돼요", soon 배지(Q-1 확인 후), review 다수 "몇 가지만 확인하면 돼요", review 단일 "거의 다 왔어요 — N만 확인"(N=확인 항목명).
  - 헤더 "요즘 어때요?" + 보조문, 버튼 "내 정책 찾기", placeholder "자취하는데 월세가 벅차요…", 헤드라인 "상황에 맞을 만한 N개를 찾았어요"(N=실제 노출 카드 수 = now+soon+review 길이; 0이면 헤드라인 대신 빈결과 문구), 빈결과 "이 방향으론 못 찾았어요. 이런 쪽은 어때요?".
  - **N 경계값**: 카드 3개 → "3개", 0개 → 빈결과 분기(헤드라인 미표시). N 소스가 `funnel.result`의 노출 3버킷 합인지 검증(blocked 제외 — 헛개수 금지).
  - 금지 패턴 회귀(§5): 시스템 주어·"자격이 됩니다" 부재 단언.
  - **freeInput.ui.test.tsx 4곳** `정책 찾기`→`내 정책 찾기` 갱신 필수(안 하면 4개 실패).
- DoD: §1 표 전 파일 갱신·그린, 금지 패턴 0, N 경계(0/3) 정확.

### T-E5 — 안전 표면 톤 불변 회귀 (감사 직결) 【RED】
- **왜 이 순서**: E 전체 후 위기 단독 렌더·안전 문구 불변 재확인. 신규 UI(알약·체크리스트·아이콘·동행) 전부 위기 시 미렌더.
- 대상: 소스 변경 없음(검증). SafetyBanner/CrisisFooter/DisclaimerNote 문구 무변경 확인.
- 테스트: `test/integration/funnel/funnel.crisis.test.tsx` 확장
- RED 시나리오:
  - 위기 시 `[data-funnel-region]`이 정확히 `['safety']`만(기존 B2 테스트) — **신규 profile-input 알약·results·동행 블록 미렌더 재확인**.
  - SafetyBanner/CrisisFooter 문구 스냅샷 불변(109·1577-0199 유지), DisclaimerNote "추정" 문구 불변.
  - 비위기 결과 화면에 CrisisFooter 상시 노출 유지(F-③ 동행 블록과 층위 구분 — 둘 다 렌더되어도 의미 혼동 없음).
- DoD: 위기 단독 렌더 불변, 안전 3표면 문구 불변, 감사자 확인 포인트 충족.

### T-F1 — 절벽 완화 카피(신청 페이지 열기 + 브리지) 【RED→GREEN→REFACTOR】
- **왜 이 순서**: 원문 버튼 문구·브리지 한 줄. 테스트 단언 0이라 독립·저위험.
- 대상: `src/ui/funnel/PolicyResultCard.tsx`
- 테스트: `test/unit/ui/PolicyResultCard.test.tsx`
- RED 시나리오:
  - sourceUrl 있으면 링크 텍스트 "신청 페이지 열기 (온통청년)" + 브리지 "열리는 페이지에서 '신청하기' 버튼을 찾으면 돼요" 노출. `target=_blank rel=noreferrer noopener` 유지.
  - sourceUrl null → 링크·브리지 미렌더(브리지가 링크 없이 떠서 오도하지 않게), throw 0.
- DoD: 문구·브리지 렌더, null 방어, 링크 속성 유지.

### T-F2 — 서류 사전 정적 데이터 모듈 (노출 defer) 【RED→GREEN→REFACTOR】
- **왜 이 순서**: R-2 권고 — 데이터+테스트만. 순수 데이터라 독립.
- 대상: `src/data/static/documents.ts` (레코드 배열 + `getDocument(id)` 조회 헬퍼)
- 테스트: `test/unit/data/documents.test.ts` (신규)
- RED 시나리오·데이터 정확성:
  - ~10개 레코드(주민등록등본·초본·소득금액증명·가족관계증명서·건강보험자격득실확인서 등). 각 `{ id, name, issuer, fee, estMinutes }`.
  - **정확성 강제(R-4)**: 모든 레코드 `issuer` 비어있지 않음; 불확실 항목은 `fee: null`(지어내기 금지) → 렌더 시 "확인 필요". 등본 issuer에 "정부24" 포함 류 상식 검증 1~2건.
  - `getDocument('없는id')` → undefined(throw 0). 중복 id 없음.
  - 순수·throw-free: 빈 문자열/null 조회 → undefined.
- DoD: 10±레코드·필수필드·null 폴백 규칙 테스트 그린. **인계 메모**: 노출은 F-⑤(카드 펼침).

### T-F3 — 청년센터 연결 데이터 + 동행 블록 【RED→GREEN→REFACTOR】
- **왜 이 순서**: R-3 권고 — 안전 바닥선(날조 금지). SIDO 인프라 재사용.
- 대상: `src/data/static/youthCenters.ts`(시·도별 레코드, phone/centerName null 허용 구조 + 통일 링크), `src/ui/funnel/` 동행 블록 컴포넌트(신규, 예: `YouthCenterLink.tsx`) — **노출 위치**: 카드 하단 or 결과 섹션(감사자 확인 Q-4). 최소 노출 권고.
- 테스트: `test/unit/data/youthCenters.test.ts`, `test/unit/ui/YouthCenterLink.test.tsx`(신규)
- RED 시나리오·안전 경계값:
  - regionCode '26' → "혼자 하기 버거우면 부산광역시 청년센터가 같이 해줘요" 류(시·도명 `sidoNameByPrefix('26')='부산광역시'` 반영).
  - regionCode 미입력 → 지역명 없는 일반 문구(throw 0), 통일 링크만.
  - **phone/centerName null → 전화·기관명 UI 미렌더(날조 0 단언)**: `queryByText(/\d{2,4}-\d{3,4}-\d{4}/)` null(검증 안 된 번호 부재). 운영자가 값 채우면 노출되는 구조를 테스트로 문서화(값 있는 fixture로 노출 케이스 1건).
  - 통일 링크 href가 온통청년 공식 경로(implementer가 curl 실존 확인한 URL). **미확인 시 폴백 URL + 인계 메모**.
  - **위기 층위 구분(안전)**: 동행 블록 문구에 위기 전문기관(109·1577-0199·자살예방) 문구 부재 단언. 위기 시(FunnelContainer 위기 분기) 동행 블록 미렌더(T-E5에 편입).
  - 알 수 없는 regionCode → 일반 문구 폴백(throw 0).
- DoD: 시·도명 반영·null 필드 미렌더(날조 0)·링크 실존·위기 층위 구분 테스트 그린.

### T-Z — 전역 회귀 게이트 【RED(전체)】
- `npm run test`(669 + 신규 그린), `npm run build`, `npm run lint`. hex 직접 사용 잔존 grep(신규/수정 컴포넌트). T8 불변(App search/deps memo에 profile 미포함) 회귀 확인(`app.profile.test.tsx`).

---

## 3. 안전 포인트 (safety-domain-auditor 인수인계)

1. **위기 단독 렌더 불변(§7-1)** — T-E5. 신규 UI 전부(프로필 알약·체크리스트·예시 아이콘·동행 블록·서류) 위기 시 미렌더. `funnel.crisis.test.tsx` B2의 `regions===['safety']` 유지가 방어선.
2. **자격 단정 금지(§7-4)** — T-D1b·T-D1c. 체크리스트 ✓는 "충족(추정)"만, "자격이 됩니다/안 됩니다" 부재 단언. review ? 는 "원문에서 확인". D-② 재활성 대비 explain 정의 보존하되 표시·호출 정지.
3. **안전 3표면 문구 불변(§7-2)** — T-E4·T-E5. SafetyBanner·CrisisFooter·DisclaimerNote 문구 변경 0(시각 토큰만 §2 적용 가능). "추정" 고지·원문 링크·카드 updatedAt 신선도 유지.
4. **F-③ 데이터 날조 금지(안전 바닥선)** — T-F3. 검증 안 된 전화번호·기관명 노출 0. phone/centerName null이면 미렌더. 통일 링크 URL 실존(curl) 확인. 위기(전문기관) vs 동행(청년센터) 층위 혼동 금지.
5. **F-② 데이터 정확성** — T-F2. 수수료·발급처 상식 수준, 불확실은 null→"확인 필요". 지어내기 0.
6. **신선도 거짓 숫자 금지(원칙 3)** — R-5. "어제 업데이트 N개" 라인 이번 스코프 제외. 헤드라인 N은 실제 노출 카드 수만.

---

## 4. 확인 필요 (불명확 — 추정 금지)

- **Q-1 (soon 배지 확정 문구)**: DESIGN §5 카피 표에 soon 라벨 확정 문구 없음. 현재 "곧 시작/마감". 유지할지, 새 문구 필요한지 사용자/감사자 확인. → 확정 전 `/곧/` 부분매치 유지.
- **Q-2 (D-① pass 축 지역/나이 문구 소스)**: "부산 거주자 대상 — 내 지역 일치" 문구의 지역명 소스 = policy.regionText vs `sidoNameByPrefix(policy.regionCodes[0])`. regionText는 자유서식이라 불균질 → sido명 매핑 권고. 나이 문구 "19~34세" = policy.ageMin/Max. 확인 후 확정.
- **Q-3 (T-D1c explain 호출 정지 여부)**: 표시 제거 시 훅 비동기 호출도 정지(권고) vs 호출 보존. 결정형 게이트·불필요 네트워크 관점 정지 권고 — 감사자 확정.
- **Q-4 (F-③ 동행 블록 노출 위치)**: 카드 하단 vs 결과 섹션 하단(CrisisFooter 근처). F-⑤(카드 펼침) 미존재 → 최소 노출로 결과 섹션 하단 권고. 확인 필요.

---

## 5. plan↔코드 불일치 기록

- **버튼 라벨 이미 어긋남**: `FreeTextInput.tsx:86`은 "정책 찾기"(DESIGN §5 기존값)인데 DESIGN §5 확정은 "내 정책 찾기". 소스가 아직 확정 전 상태 → T-E4에서 소스+테스트 4곳 동시 갱신(추정 아님, grep 근거).
- `PolicyResultCard.tsx`는 slate/sky/emerald/amber Tailwind 기본색 사용 중(DESIGN §2 토큰 미적용) — T-E1 토큰 등록 후 T-E4/카드 태스크에서 점진 교체. 이번 묶음에서 전 컴포넌트 색 100% 이전은 스코프 과다 → 신규/수정 표면 우선, 잔여는 인계.
