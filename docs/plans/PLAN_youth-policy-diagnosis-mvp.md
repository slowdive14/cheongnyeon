# 구현 계획서: 청년정책 진단 — 욕구 발견 깔때기 MVP (마음건강 영역)

**Status**: 🔄 In Progress
**Started**: 2026-06-23
**Last Updated**: 2026-06-23
**Estimated Completion**: 2026-07-11

---

**⚠️ CRITICAL INSTRUCTIONS**: 각 Phase 완료 후:
1. ✅ 완료한 task 체크박스 체크
2. 🧪 품질 게이트 검증 명령 모두 실행
3. ⚠️ 품질 게이트 항목 전부 통과 확인
4. 📅 위 "Last Updated" 갱신
5. 📝 Notes 섹션에 배운 점 기록
6. ➡️ 그 다음에만 다음 Phase 진행

⛔ **품질 게이트를 건너뛰거나 실패 상태로 진행하지 말 것**

---

## 📋 Overview

### Feature Description
한국 청년이 "자기에게 필요한 정책이 무엇인지 모르는" 상태에서 출발해, **막연한 상황·감정 → 갈래 선택 → 구체화 → 지금/곧 신청 가능한 정책**으로 좁혀지는 *욕구 발견 깔때기*를 제공한다. MVP는 **서울 거주 청년 · 마음건강 영역 한 줄기**를 데이터→엔진→그래프→UI→설명까지 end-to-end로 완성해 파이프라인 전체가 도는지 증명한다. (검색·구독형 포털·뉴스레터가 아닌 *진단형* 도구.)

### Success Criteria
- [ ] 브라우저에서 "마음이 지쳐요"로 진입 → 갈래·구체화를 거쳐 **지금/곧 신청 가능한 마음건강 지원 1~3개**가 원문 링크와 함께 표시된다 (LLM 없이도 동작).
- [ ] 자유입력("요즘 너무 힘들어요")이 마음건강 영역으로 해석되고, 결과에 "왜 너한테 맞는지" 쉬운 말 설명이 붙는다 (Gemini, 실패 시 버튼 흐름으로 graceful degradation).
- [ ] **위기 신호 감지 시** 정책 깔때기보다 *즉시 안전자원(자살예방상담 109, 정신건강위기상담 1577-0199 등)* 이 최우선 노출된다.
- [ ] 모든 결과 카드에 **"추정 · 최종 자격은 시행기관 공고 기준"** 고지 + 원문 링크 + 데이터 최종 업데이트 시각이 표시된다.
- [ ] 온통청년 API 적재분과 청년몽땅정보통 보강분의 **갭률 리포트**가 산출된다.
- [ ] 자격 매칭 엔진 단위 커버리지 ≥90%, 핵심 사용자 경로 통합 테스트 통과.
- [ ] 패러프레이즈 질의("힘들어요/의욕없음/멍해요")가 동일 정책을 놓치지 않는다(Recall@k) — 태그 동일성 매칭 대비 개선 확인.

### User Impact
청년이 정책 이름을 몰라도, "검색을 안 해도" 자기 상황을 말하는 것만으로 지금 행동할 수 있는 마음건강 지원을 받는다. 위기 청년은 정책 이전에 즉시 도움을 안내받는다.

---

## 🏗️ Architecture Decisions

| Decision | Rationale | Trade-offs |
|----------|-----------|------------|
| 자격 매칭 엔진을 **순수 함수**로 분리 (`src/domain`) | 테스트 용이, 청년/상담사 두 화면 공유, UI·데이터와 디커플 | 초기 구조 잡는 비용 |
| 데이터는 **하루 1회 동기화 → 캐시**(앱이 캐시만 읽음) | 속도·API 장애 격리·정규화 필요 | 실시간성 약간 손해(신선도 타임스탬프로 보완) |
| MVP 캐시는 **로컬 JSON 우선**, Firestore는 적재 안정화 후 | 키 발급·인프라 없이 로직부터 검증 | 다중 사용자/실시간은 후속 |
| **온통청년 = 척추, 청년몽땅정보통 = 보강** + 갭 측정 | 누락(false negative) 방지 — 서울 자체·자치구 사업은 온통청년에 없을 수 있음 | 보강 소스 정규화·중복제거 비용 |
| **위기 신호 우선(safety-first) 라우팅** | 마음건강은 위기 가능성 상존; 정책보다 안전이 먼저 | 보수적 감지로 거짓양성 발생(허용) |
| **관련성 = 하이브리드 검색(임베딩+키워드)+경량 온톨로지 / 자격 = 규칙 엔진** (엄격 분리) | 태그 동일성 매칭은 재현율 붕괴(같은 욕구를 백 가지로 말함); 임베딩이 패러프레이즈를 잡음. 자격은 결정형 유지 | 임베딩 생성·인덱스 비용; 풀 GraphRAG는 V1+로 이연 |
| **GraphRAG(LLM 자동 노드/엣지 추출)는 기각, 결정적 규칙 테이블(`programRules.ts` 배타·선행 + `eligibility.ts` 4축) 채택** (ADR-2026-06-25) | GraphRAG가 주는 "명시적 관계 추론" 가치는 선언적 규칙 엔진이 이미 달성하되 **결정적·감사가능·날조 0**. LLM 추출을 자격 경로에 끌어들이면 최상위 안전 불변식("자격 날조 금지·거짓양성 절대 불가")과 정면 충돌. 큐레이션된 정책 수(수십~수백)에선 자동추출 이득<할루시네이션 리스크 | 정책이 수만 건으로 늘면 규칙 테이블 수기 관리 비용↑ → 그때 재평가. 정책↔정책 **다중홉 추론**(자료가 언급)은 현재 `traverse`가 단방향이라 약함 → **Phase 6 인계**(GraphRAG 없이 traverse 보강으로 해결) |
| 정책 free-text를 **LLM 파싱 + 의미 청킹**으로 구조화(인제스트 시 1회·캐시) | 진짜 자격(세대분리·중복불가)이 자유서술에 숨음 | 파싱 정확도 검증·재처리 필요 |
| **청크별 역할 분리**: 검색=목적·대상 청크 / 자격=자격 청크(규칙) / 표시=신청 청크 | ‘신청방법’ 임베딩은 검색 노이즈; 관련성·자격·표시를 청크 수준에서 분리(비대칭 검색) | 청킹 때 역할 라벨 필요 |
| **위기 감지 2층**: 정규식 하드필터(상시·API 무관) 바닥 + 의미 임베딩(가능 시 보강) | 안전은 API 가용성에 의존하면 안 됨; 맥락 표현("더는 못 버티겠어")은 의미층이 보강 | 기준 벡터·임계값 튜닝 |
| **증분 인제스트**: 콘텐츠 해시로 변경분만 LLM 파싱 | 매 실행 전체 재파싱은 비용·지연 낭비 | 해시 키 설계(정책ID+최종수정일/내용) |
| **검색은 키워드 arm으로 graceful degrade**(임베딩 불가 시) | 임베딩=Gemini 의존; 키 없거나 장애 시에도 검색 단절 없어야 | 키워드 모드 품질은 임베딩보다 낮음 |
| LLM(Gemini)은 **해석·질문·설명·리랭킹·파싱만**, 후보 선택·자격 판정은 검색·규칙이 담당 | 환각·오자격 방지(신뢰 핵심), 비용·지연 통제 | 자연스러움 일부 양보(버튼 우선) |
| **`blocked`(막힘)는 계산하되 청년 화면엔 숨김** | 막힘은 동기 저하 → 대안 갈래 유도에만 사용; 상담사 모드 대비 | 청년 화면에서 "왜 안 되는지" 직접 노출은 안 함 |
| 첫 영역 = **마음건강** (단일 수직 슬라이스) | 한 영역 end-to-end로 전체 기계 검증; 안전 아키텍처를 초기에 강제 | 영역 다양성은 후속 콘텐츠 작업 |

---

## 📦 Dependencies

### Required Before Starting
- [ ] Node 20+ / npm 환경
- [ ] (Phase 2 후반·6) **온통청년 Open API 인증키** — 사용자가 youthcenter.go.kr 로그인 후 마이페이지에서 발급 (Phase 1·3·4·5는 fixture/mock으로 키 없이 진행 가능)
- [ ] (Phase 6) Gemini API 키 — 사용자 입력(localStorage), Serein `SettingsModal` 패턴 재사용

### External Dependencies (Serein 스택 복제)
- react ^19, react-dom ^19, vite ^7, typescript ~5.9
- tailwindcss ^3.4, lucide-react
- firebase ^12 (Phase 2 후반부터), @google/generative-ai ^0.24 (Phase 6)
- date-fns ^4 (모집시기 계산)
- **신규 추가**: vitest ^4(이미 있음) + `@vitest/coverage-v8`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`
- **검색/임베딩**: Gemini Embeddings(`gemini-embedding-001`, 3072차원)로 정책 청크 벡터화. ※구형 `text-embedding-004`는 2026-01-14 셧다운(404). `batchEmbedContents`는 요청당 ≤100건이라 정책은 배치 분할(`src/data/llm/batch.ts`)해 임베딩. MVP는 정책 수가 적어 **인메모리 코사인 검색**(별도 벡터DB 불필요) + 경량 키워드(`flexsearch`/BM25/부분문자열) → RRF 융합. **임베딩 불가 시 키워드 arm 단독 degrade.** 규모 커지면 벡터 인덱스로 교체.

---

## 🧪 Test Strategy

### Testing Approach
**TDD 원칙**: 테스트 먼저(RED) → 통과시키는 최소 구현(GREEN) → 리팩터(REFACTOR).

### Test Pyramid
| Test Type | Coverage Target | Purpose |
|-----------|-----------------|---------|
| **Unit** | ≥90% (domain), ≥80% (data) | normalize·자격 엔진·그래프 순회·분류기 |
| **Integration** | 핵심 경로 ≥70% | 깔때기 클릭 흐름, 인제스트 파이프라인 |
| **E2E(수동)** | 1+ critical path | 마음건강 진입→결과 / 위기 라우팅 |
| **검색 평가** | Recall@k 회귀 | 패러프레이즈 질의셋 → 정답 정책을 top-k에 포함하는지 |

### Test File Organization
```
test/
├── unit/        domain/ (normalize, eligibility, graph), data/, llm/
├── integration/ funnel/ (깔때기), ingest/
├── e2e/         user_flows/
└── fixtures/    ontong-policies.sample.json, mongttang.sample.json
```

### 공통 품질 게이트 (모든 Phase 적용)
```bash
npm test                 # vitest run — 100% 통과(스킵 없음)
npm test -- --coverage   # 커버리지 목표 충족
npm run lint             # eslint . — 오류 0
npx tsc --noEmit         # 타입 체크 통과
npm run build            # 빌드 성공
npm audit                # 신규 취약점 없음
```
- [ ] RED→GREEN→REFACTOR 순서 준수 (테스트 먼저 실패 확인)
- [ ] 3회 연속 실행해도 flaky 없음
- [ ] 복잡 로직 주석/문서화

각 Phase는 위 공통 게이트 + 아래 **Phase별 수동 체크리스트**를 통과해야 다음으로 진행.

---

## 🚀 Implementation Phases

### Phase 1: 토대 & 도메인 타입 (Foundation)
**Goal**: 신규 Vite+React19+TS+Tailwind 앱이 뜨고, 핵심 타입과 `normalizePolicy`가 검증된다.
**Estimated Time**: 2.5h
**Status**: ✅ Complete (2026-06-23, 하네스 빌드)

#### Tasks
**🔴 RED**
- [x] **Test 1.1**: `normalizePolicy` 단위 테스트 — `test/unit/domain/normalizePolicy.test.ts`
  - 시나리오: 연령 min/max 파싱(예 `19~34`), 소득 조건, 지역 코드, **누락/이상치 방어**(빈 문자열·null), 모집기간 파싱
  - Expected: 함수 미존재로 FAIL ✅ 확인(`Failed to resolve import`)
**🟢 GREEN**
- [x] **Task 1.2**: 도메인 타입 정의 — `src/domain/types.ts` (`Policy`, `UserProfile`, `RecruitStatus`, `GraphNode`)
- [x] **Task 1.3**: `normalizePolicy(raw)→Policy` 최소 구현 — `src/domain/normalizePolicy.ts`
- [x] **Task 1.4**: 앱 셸 스캐폴드(Vite+Tailwind), 빈 라우트 1개
**🔵 REFACTOR**
- [x] **Task 1.5**: 파싱 헬퍼 추출 — `src/domain/parse/{primitives,age,income,region,recruit}.ts`

#### Phase별 수동 체크리스트
- [x] `npm run dev`로 빈 셸이 뜬다 (build ✅)
- [x] `npm test` 그린(47/47), normalize 커버리지 ≥90% (97.87% stmts)
- [x] 깨진 fixture를 넣어도 throw 없이 안전 처리 (전건 `.not.toThrow()`)

> **하네스 검수 결과(2026-06-23):** code-reviewer·safety-domain-auditor가 income/region/recruit 파서의 **부분일치 결함 3건**에 독립 수렴 → 수정 루프 1차로 RED 추가 후 GREEN(35→47건). `unknown≠none`·`불명≠전국`·무효 모집기간=`unknown` 보수성 확보. 산출물: `_workspace/0{1..4}_*phase1*.md`. **잔여:** 온통청년 실제 raw 필드명 미확정 → Phase 2 실측 보정(파서 입력측만, Policy 출력 계약 불변).

---

### Phase 2: 데이터 인제스트 · 파싱 · 구조화
**Goal**: 서울 정책을 받아 정규화·중복제거하고, **LLM 파싱(Structured Outputs로 스키마 강제)으로 자유서술 자격을 구조화 + 의미 청킹(목적/자격/신청 분리)** 해 캐시에 저장. **콘텐츠 해시로 변경분만 재파싱(증분)**. 청년몽땅정보통 대비 **유사도 기반 갭률 리포트** 산출. (임베딩 생성은 Phase 4 검색과 함께.)
**Estimated Time**: 4.5h
**Status**: ✅ Complete (2026-06-24, 하네스 빌드)

#### Tasks
**🔴 RED**
- [x] **Test 2.1**: 인제스트 파이프라인 — `test/integration/ingest/pipeline.test.ts`
  - fixture 기반: 페이지네이션 병합, **중복제거**(1차 source+id 자동 / 2차 유사도≥0.85 수동후보), 서울 필터(11 OR 전국 OR 자치구명 + 동명자치구 가드), 신선도 타임스탬프 부여
- [x] **Test 2.2**: **증분 파싱(콘텐츠 해시)** — `test/unit/data/incremental.test.ts`
  - 해시 = `id + lastModified + eligibilitySignature(원문)` 이중결합 → 수정일 미갱신 본문변경도 감지, 같으면 `parseChunk` skip
- [x] **Test 2.3**: 커버리지 갭 매칭 — `test/unit/data/coverage.test.ts`
  - 정규화 후 유사도(Jaccard·Levenshtein max, 공용 `similarity.ts`) ≥0.85 **수동검증 후보** 분리, 몽땅 전용·갭률
- [x] **Test 2.4**: **LLM 파싱 + 의미 청킹 (스키마 강제)** — `test/unit/data/parseChunk.test.ts`
  - LLM **mock**, responseSchema로 `ParsedQualification` 강제, 누락·null·reject·스키마외 → throw 없이 **`UNKNOWN`**(none 아님 — L3 vs L9 고정)
**🟢 GREEN**
- [x] **Task 2.5**: `ontongClient`(키 env, 미설정 시 fixture 모드) — `src/data/ontongClient.ts` (fixture는 `src/data/__fixtures__/`)
- [x] **Task 2.6**: `parseChunk` — Gemini Structured Outputs + `UNKNOWN` 폴백 — `src/data/parseChunk.ts`
- [x] **Task 2.7**: `ingest`(받기→정규화→해시 증분→변경분만 파싱→중복제거→서울필터→캐시) + `scripts/ingest.ts`(`npm run ingest`)
- [x] **Task 2.8**: `coverage`(정규화+공용 유사도·리포트·수동검증 후보) — `src/data/coverage.ts`
**🔵 REFACTOR**
- [x] **Task 2.9**: 캐시 추상화(`PolicyCache` 인터페이스, LocalJsonCache 구현 / Firestore 자리만), 파싱 검수 샘플(`data/parsed-sample.json`)

#### Phase별 수동 체크리스트
- [x] `npm run ingest` fixture 모드로 적재(6→4건), 키 있으면 실데이터 (키 발급 안내는 `.env.example`)
- [x] 두 번째 `ingest` 실행 시 변경 없는 정책 LLM 파싱 **건너뜀** (run1 reparsed=4 → run2 reparsed=0)
- [x] 파싱 결과: 구조화 자격 필드 + 목적/자격/신청 청크(LLM off 시 보수적 `UNKNOWN`)
- [x] `coverage-report.json`에 갭률(0.667)·몽땅 전용·수동검증 후보 출력
- [x] 캐시에 신선도(fetchedAt/updatedAt) 타임스탬프 존재

> **하네스 검수 결과(2026-06-24):** 2개 검수 축이 **증분 해시 결함**(수정일 미갱신 본문변경 누락)에 독립 수렴 → 수정 루프 2차로 `id+lastModified+원문서명` 이중결합. safety가 **동명 자치구 오탐**(부산 '중구'→서울 오노출) 신규 발견 → 시/도 교차검증 가드. 유사도 산식 ingest/coverage 통일(`similarity.ts`). 107→120 테스트. 산출물 `_workspace/05~08_*phase2*.md`. **Deferred:** V2-3(parseInput 그라운딩 입력 누락)은 Phase 6 실 Gemini 연결 시 High 재평가. **확인 필요:** 온통 실 raw 필드·XML·페이지네이션(U1~U3), 청년몽땅 소스 형태(U4) — Phase 6/운영에서 어댑터 입력측 보정.

---

### Phase 3: 자격 매칭(추정) 엔진 — 핵심 IP
**Goal**: `evaluate(profile, policies, {now}) → { now[], soon[], blocked[], review[] }` 순수 함수. 자격(나이·소득·지역·상태) + 모집상태 + 중복배타·순서 규칙.
**Estimated Time**: 4h
**Status**: ✅ Complete (2026-06-24 하네스 실행, 195 tests)

> **안전 보강 (2026-06-24 리더 결정):** 원안 `{now, soon, blocked}` 3버킷에 **`review[]`(확인 필요) 추가**. "필수조건 미확인 → 탈락이 아니라 확인 필요" 불변식을 코드 레벨에서 보장(blocked에 섞으면 시각적으로 탈락처럼 보여 신뢰 훼손). 부수 타입 확장: `UserProfile.regionCode`(지역 코드 비교), `UserProfile.{completedPrograms?,activePrograms?}`(순서 규칙), `Policy.programKey?`(배타·순서 식별).

#### Tasks
**🔴 RED**
- [x] **Test 3.1**: 자격 경계값 — `test/unit/domain/eligibility.test.ts` (4축×3분기 + 우선순위 P-1~4 + 이상치 EX-1~6 + 비유한 상한 B-11/12)
  - 나이 34 통과 / 35 탈락, 소득 경계, 지역 매칭·불매칭, 필수조건 누락 시 보수적 처리("확인 필요")
- [x] **Test 3.2**: 모집상태 — 날짜 기준 `now`/`soon`(임박)/`closed`/`unknown` 분류 (date-fns, 고정 clock 주입, invalid clock 가드 RX-5)
- [x] **Test 3.3**: 규칙 — 4대 사업(청년수당·청년도전·국취·월세) **중복배타**, 순서(청년도전 수료→국취 가능). (마음건강 영역엔 적게 적용되나 엔진 공용이라 함께 검증)
**🟢 GREEN**
- [x] **Task 3.4**: `eligibility.ts` — `evaluate→{now,soon,blocked,review}`, blocked/review는 사유 코드(ReasonCode 14종) 포함
- [x] **Task 3.5**: 모집상태 계산기 분리 (`recruitStatus.ts`)
**🔵 REFACTOR**
- [x] **Task 3.6**: 규칙을 선언적 데이터(`PROGRAM_RULES` + 범용 `applyRules`)로 추출, 자격 4축도 Verdict 배열로 → 새 규칙 1행 추가 용이

#### Phase별 수동 체크리스트
- [x] eligibility 커버리지 ≥90% (domain 95.78% stmt / 90.72% branch)
- [x] 경계값/모집상태/배타 규칙 케이스 모두 통과 (195 tests, 회귀 0)
- [x] 애매한 자격은 탈락이 아니라 "확인 필요"(review 버킷)로 보수 처리됨

> **하네스 검수 결과 (2026-06-24):** planner→implementer→(code-reviewer∥safety-auditor∥qa)→수정 1회. blocker/High 0. 두 검수축 수렴 지적한 false-accept 가드 2건만 수정(비유한 소득상한 NaN/Infinity→review, invalid clock→unknown), RED B-11/12·RX-5 추가. 검수 강도 calibration 적용 — 전용 사유코드(`DATA_INCOMPLETE`/`REENTRY_UNKNOWN`)·배타그룹 범위 확정은 Phase 6 UI 연결 전 처리로 defer. 산출물 `_workspace/09~12_*phase3*.md`.
> **다음 Phase 안전 인수인계:** blocked 버킷을 빨간 결과로 직출력 금지(대안 갈래 유도), 전 결과 카드에 '추정' 고지+원문링크(`policy.sourceUrl`)+업데이트시각 노출. EvaluatedPolicy.policy가 근거 데이터(sourceUrl/regionText/income.raw) 보존.

---

### Phase 4: 매칭 두뇌 — 임베딩·하이브리드 검색 + 욕구 그래프 (+ 위기 라우팅)
**Goal**: 캐시된 **목적·대상 청크**를 임베딩해 색인하고, 깔때기 노드를 **개념 임베딩 + 하이브리드 검색(임베딩+키워드, RRF)** 으로 관련 정책을 끌어온다 — **태그 동일성 매칭 폐기**. **임베딩 불가 시 키워드 arm으로 graceful degrade**. 노드 카테고리로 검색 범위 스코핑(거친 도메인=하드, 세부 갈래=소프트 부스트로 재현율 보호). 욕구 그래프 `traverse` + **위기 2층 감지(정규식 바닥+의미 보강)로 안전자원 우선**. 자격은 Phase 3 규칙 엔진이 거르고, 검색은 관련성만 책임진다.
**Estimated Time**: 5h
**Status**: ✅ Complete (2026-06-24 하네스 실행 — 안전 최우선 Phase, 351 tests)

> **안전 결정 (2026-06-24 리더):** ① 위기 2층 감지의 **1층 정규식은 API·키·네트워크 무관 항상 작동**(임베딩 꺼져도 직접 위기어 감지) ② 위기 시 검색·evaluate·AI생성 **건너뛰고 안전자원(109·1577-0199) 우선** ③ 관용구("배고파 죽겠어")는 **배너 피로 방지 위해 비위기**, 자기소멸 의지("죽고 싶다")는 위기, 애매하면 위기 편향 ④ `GraphNode`에 `boostCategories/boostKeywords` 추가(소프트 부스트=재현율 보호) ⑤ `Policy.category` 불명은 하드 제외 금지(불명≠무관). 키 없이 빌드 가능(고정벡터 fixture·disabled 폴백).

> **하네스 검수 결과 (2026-06-24):** planner→implementer→(code-reviewer∥safety-auditor∥qa)→**안전 수정 3라운드**. 모든 게이트 초록인데도 safety-auditor가 **위기 거짓음성 High**를 런타임 프로브로 적발: ①위기 정규식이 완곡·은어·축약 표현 누락 →②1차 수정이 **과적합**(예시만 땜질)임을 재검증서 적발 + **자해 행위 진술**("손목을 그었어" — '자해' 글자 없이) 누락 발견 →③의미 클래스 9종 일반화 + 자해 행위 클래스 신설 + 제3변형 RED(과적합 방지). 2층(의미 임베딩)은 **anchors 미주입으로 Phase 6까지 잠금** → 고빈도 맥락 위기어를 1층으로 흡수 + "완곡 tail은 정규식 한계, 2층이 진짜 안전망(Phase 6)" 배포 리스크 명문화. 검수 강도 완화 **미적용**(안전 핵심). 산출물 `_workspace/13~18_*phase4*.md`.
> **다음 Phase(5 UI) 안전 인수인계:** `TraverseResult.crisis.crisis===true` 시 **안전 배너를 정책 카드보다 먼저** 렌더(Test 5.2), `suppressGeneration` 플래그 소비(AI 생성 차단), blocked 비노출(대안 갈래), 전 카드 '추정' 고지+원문링크+신선도.

#### Tasks
**🔴 RED**
- [x] **Test 4.1**: **하이브리드 검색 재현율 + degrade** — `test/unit/retrieval/hybrid.test.ts` (H-1~12: Recall@k·RRF 합집합·임베딩 off degrade)
- [x] **Test 4.2**: **비대칭 검색 + 개념 노드 매칭** — `test/unit/retrieval/conceptMatch.test.ts` (CM-1~7: 신청방법 청크 색인 제외)
- [x] **Test 4.3**: **노드 스코핑** — `test/unit/retrieval/scoping.test.ts` (SC-1~7: 하드필터+소프트부스트, category=null 하드 제외 금지)
- [x] **Test 4.4**: 그래프 순회 시나리오 — `test/integration/funnel/mentalHealth.graph.test.ts` (TR-1~6 경로 A/B/C + TR-C1~4 위기 우선)
- [x] **Test 4.5**: **위기 2층 감지** — `test/unit/domain/crisisDetect.test.ts` (CR-1~33: 의미 클래스 9종 + 자해 행위 클래스, 거짓양성 회귀 가드)
- [x] **Test 4.6**: 막힌 경로 → 빨간 결과가 아니라 **대안 갈래** 반환 (BP-1~4)
**🟢 GREEN**
- [x] **Task 4.7**: `embed` + `hybridSearch`(임베딩+키워드+RRF, 임베딩 불가 시 키워드 arm degrade) — `src/retrieval/{embed,hybridSearch,rrf,types,config}.ts`
- [x] **Task 4.8**: 그래프 데이터 — `src/domain/graph/domains/mentalHealth.ts` + `src/domain/safetyResources.ts`(109·1577-0199) + 안전자원 노드
- [x] **Task 4.9**: `crisisDetect`(정규식 바닥 + 의미 임계값) — `src/domain/crisisDetect.ts` + `src/domain/crisis/config.ts`(패턴 SSOT)
- [x] **Task 4.10**: `traverse` — 위기 우선 → 노드 스코프 hybridSearch → `evaluate` 연동 → blocked 시 대안 갈래 — `src/domain/graph/traverse.ts`
**🔵 REFACTOR**
- [x] **Task 4.11**: 그래프 스키마(`graph/types.ts`)·검색 모듈(도메인 무관) 분리, 위기 앵커·임계값·정규식 `crisis/config.ts`로 분리

#### Phase별 수동 체크리스트
- [x] 패러프레이즈 질의가 정답 정책을 놓치지 않음(Recall@k), 개념 매칭이 exact tag보다 넓게 잡음
- [x] **임베딩 끄고도** 키워드 검색으로 깔때기가 동작(단절 없음)
- [x] "고립·은둔" 진입 시 일반 심리상담이 결과를 독식하지 않음(스코핑)
- [x] 직접 위기어는 정규식으로 즉시, 맥락 위기어는 의미층(Phase 6)으로 안전자원 라우팅 (거짓양성 허용) — ※2층은 anchors 미주입으로 Phase 6까지 잠금, 고빈도 맥락어는 1층으로 흡수

---

### Phase 5: 깔때기 UI & 결과 화면 (결정형, LLM off)
**Goal**: STEP0~3 클릭 흐름 + 결과 카드(지금/곧 2상태, 원문 링크, '추정' 고지, 최종 업데이트). 위기 배너. **LLM 없이** 버튼만으로 end-to-end.
**Estimated Time**: 4h
**Status**: ✅ Complete (2026-06-25 하네스 실행 — UI 계층, 414 tests, 브라우저 시연 가능)

#### Tasks
**🔴 RED**
- [x] **Test 5.1**: 깔때기 통합(RTL) — `test/integration/funnel/funnel.ui.test.tsx`
  - 입구 클릭→갈래→구체화→결과 렌더(경로 A journey), 결과에 **2상태·원문 링크·'추정' 고지·최종 업데이트** 노출, **막힘 카드 미노출** 검증 (E1~E6 엣지 포함)
- [x] **Test 5.2**: 위기 화면 — 위기 진입 시 안전자원 배너가 정책보다 위에/먼저 렌더 (compareDocumentPosition + 적대적 공존 회귀 B2)
**🟢 GREEN**
- [x] **Task 5.3**: 컴포넌트(`FunnelStep`, `ChoiceChips`, `PolicyResultCard`, `SafetyBanner`, `DisclaimerNote`, `ResultList`)
- [x] **Task 5.4**: 깔때기 상태 관리(`useFunnel`: 뒤로/갈래 전환, 재질문 방지, 비동기 경합 가드) + 그래프 연동(`FunnelContainer`, `App`)
**🔵 REFACTOR**
- [x] **Task 5.5**: 접근성(키보드·대비·aria-label·role=alert), 모바일 레이아웃 정리

#### Phase별 수동 체크리스트
- [x] 브라우저에서 마음건강 깔때기가 처음부터 끝까지 동작(LLM off) — `npm run dev`, 기본 데모 프로필 주입
- [x] 결과 카드: 지금/곧 2상태만, 막힘 없음(blocked·review 비노출), 원문 링크 클릭 가능, 고지문·최종 업데이트 표시
- [x] 위기 경로에서 안전자원이 최상단 (crisis=true 시 배너 단독 렌더, 정책·칩 억제)

> **하네스 검수 결과**: code-reviewer PASS(blocker/High 0) ∥ safety-domain-auditor 조건부 통과(High 0, 적대적 프로브 3종으로 위기배너순서·blocked/review 누수차단·고지·throw-free 런타임 실증). 수렴 발견 2건(공허 통과 위기 테스트 → 정규 회귀 B2로 코드화, ResultList random key → 안정 key) 수정 반영(412→414 tests). 산출물: `_workspace/19~20_*phase5*`.
> **안전 결정**: ① review 정책 미노출(2상태만) ② 위기 트리거는 Phase 5 버튼 전용(자유입력 위기 라우팅 Phase 6) ③ 기본 데모 프로필 주입(자격 입력 UI는 후속) ④ 위기 시 갈래 칩 억제 ⑤ coverage.include에 `src/ui/**` 추가(branch 90.9%).
> **결정 변경(2026-06-25)**: ①의 'review 미노출'을 **'자격 확인 필요' 카드 노출로 변경**(사용자 승인). 실데이터는 다수 정책이 나이·모집시기 미파싱→대부분 review로 분류돼 결과가 통째로 비어 앱이 빈 화면처럼 보임. review는 자격을 단정하지 않고 '확인 필요'(원문 확인 유도)로만 제시하므로 보수성·헛희망 차단(blocked 미노출)은 유지. 산출물 `_workspace/26_bugfix_review-rendering.md`.
> **자격 신뢰도 개선(2026-06-25, 안전 결정·사용자 승인)**: ⓐ ageAxis — 나이 양쪽 null인 **전국민(isNationwide) 정책은 '연령 무관'으로 PASS**(비전국은 보수 review 유지). 온통 전국 대상 정책(전국민 마음투자 등)이 나이 null이라 통째 review로 숨던 문제 해소 → '지금 신청 가능' 노출. 추정 고지·원문 확인은 카드가 담당해 오자격 방지. ⓑ review **등급화**: 미확인 1개=‘거의 충족(○○만 확인)’, 다수=‘자격 확인 필요’, 적격 가까운 순 정렬. 한계: isNationwide 휴리스틱(후속: 인제스트가 `sprtTrgtAgeLmtYn` 흡수), 지자체 마음건강 정책 서울필터 누락(스코프 확장 별도). 산출물 `_workspace/27_eligibility-usefulness.md`.
> **자유입력 1차화(2026-06-28, UX 재설계·사용자 방향)**: 첫 화면 1차 관문을 **칩 메뉴 → 자유입력**으로 전환. 글 원문을 그대로 검색 질의로 써서 정책을 직접 노출(분류 제거, 의미검색이 의도 포착). **칩은 '이렇게 적어도 돼요' 예시 quick-start로 강등**(클릭 시 라벨을 질의로 채워 동일 검색). 위기 최우선 불변(자유입력 위기어→SafetyBanner 단독)은 유지. `useFunnel.queryOverride`/`FreeTextInput.onSubmit`/`FunnelContainer` 재구성, FunnelStep·classifyDomain(UI 경로) 제거. 산출물 `_workspace/28_freetext-first.md`.
> **'왜 맞는지' 설명 카드 배선(2026-06-28)**: `explainMatch`(그라운딩·환각거부·fallback)를 결과 카드에 연결. **키 있을 때만** 호출(`PolicyResultCard.usePolicyExplanation` — llm 주입 시 explain, 없으면 미표시→결정적 게이트 비동기 0). 카드에 '왜 맞을까요' 설명 블록(로딩 스켈레톤 포함). 위기 시 카드 미렌더라 suppress 불필요. 검증: 유닛(그라운딩 표시 + 입력외 지역 환각→fallback) + 브라우저 키없음 degrade. 이로써 "글 입력→정책 노출→쉬운 설명" 흐름 완성. 산출물 `_workspace/29_explain-wiring.md`.
> **원문 링크 정확도(2026-06-28)**: 1차 — 어댑터가 도메인 홈보다 구체 딥링크 우선(`pickSourceUrl`). 2차(완전 해결) — **온통청년 정책 상세 정본 URL을 plcyNo로 구성**(`ontongDetailUrl`: `/youthPolicy/ythPlcyTotalSearch/ythPlcyDetail/{plcyNo}`, 200 검증). 모든 정책(470/470)에 정확한 원문, URL 없음 0. plcyNo 없을 때만 원본 URL 폴백. 재인제스트(Gemini off, 백업 `_workspace/policies.backup-20260628.json`). 브라우저 실측: 카드 href 모두 ythPlcyDetail. 산출물 `_workspace/30_sourceurl-accuracy.md`.
> **다음 Phase 인수인계**: (a) 자유입력 박스 도입 시 layer-1 정규식 위기감지 즉시 라이브(키 불필요) + layer-2 의미층 실벡터 주입. (b) **M1(scope 보류)**: 비위기 결과 화면 상시 위기 안내 푸터 — 취약 청년 대상이라 검토 권고. (c) 실사용자 자격 입력 UI(현재 데모 프로필 하드코딩).

---

### Phase 6: Gemini 레이어 — 자유입력 해석 + 설명 + graceful fallback
**Goal**: 자유입력→영역 분류(키워드 우선, Gemini fallback, 디바운싱), 결과 "왜 맞는지" 쉬운 말 설명(정책 record 주입=그라운딩), 위기어 감지 가드. **LLM 실패/미설정 시 버튼 흐름 유지.**
**Estimated Time**: 3.5h
**Status**: ✅ Complete (2026-06-25 하네스 실행 — 마지막·안전 직결 Phase, 545 tests, 안전 수정 3R)

#### Tasks
**🔴 RED**
- [x] **Test 6.1**: 분류기 — 키워드 매칭 우선("힘들어요/우울/번아웃"→마음건강), Gemini **mock** fallback, 실패/키없음 → 영역 선택 버튼 degrade (CL-1~8)
- [x] **Test 6.2**: **그라운딩 가드** — `explain`에 화이트리스트 record 주입, 입력외 URL/숫자/지역명/정책명/자격단정 후처리 거부 (EX-1~11 + 자격 양방향 단정 의미클래스)
- [x] **Test 6.3**: **위기어 가드** — `crisisGuard`가 위기 시 분류·설명보다 안전 라우팅 우선, 조언 생성 0 (CG-1~8)
**🟢 GREEN**
- [x] **Task 6.4**: `classify`/`explain`/`crisisGuard` + `crisisAnchors`(layer-2 활성화) + `geminiClient` 실 SDK(@google/genai 동적 import)
- [x] **Task 6.5**: Gemini 키 설정 UI(localStorage, `SettingsModal`, type=password 키 비노출) + 키 없으면 LLM off 모드. `FreeTextInput` 자유입력 박스 + 실시간 layer-1 위기감지
**🔵 REFACTOR**
- [x] **Task 6.6**: 프롬프트·가드 정리, 위기/자격단정/행정구역 의미클래스 일반화(과적합 회피)
- [x] **Task 6.7 (Phase 5 인계 M1)**: 비위기 결과 화면 **상시 위기 안내 푸터**(109·1577-0199) — `CrisisFooter`, 위기 화면과 충돌 없음

#### Phase별 수동 체크리스트
- [x] 자유입력으로 마음건강 진입 + 결과 설명 표시 (키 설정 시 LLM, 없으면 키워드/버튼 degrade)
- [x] Gemini 키 제거 시에도 버튼 흐름으로 완전 동작 (키 없는 test/build/tsc 그린)
- [x] 비위기 결과 화면에도 상시 위기 안내 푸터 노출 (M1)
- [x] 위기 표현 입력 시 LLM이 조언 대신 안전자원으로 라우팅 (실시간 layer-1, suppressGeneration 소비)

> **하네스 검수 결과(안전 최우선)**: code-reviewer 조건부 통과(동적 import 격리·degrade 견고) ∥ safety-domain-auditor 풀 투입. **안전 수정 3라운드** — (R1) 적대적 프로브로 "버틸 힘이 없어"(위기 거짓음성)·"자격이 안 됩니다"(부정 단정)·"강남구 거주"(타지역 환각)·숫자 부분문자열 false-pass + SettingsModal 미배선 발견. (R2) 자격단정 과적합(인접 변형 5종 누수) 재발견 → 판정 의미클래스 일반화. (R3) 리더 직접 재감사(safety-auditor 세션한도 대체)로 잔여 3종(탈락/못받/수령불가) 발견·폐쇄. 산출물 `_workspace/21~24_*phase6*`.
> **안전 결정**: ① SDK=@google/genai(동적 import 격리) ② M1 결과화면 한정 ③ layer-2 임계 0.82 ④ 전 LLM 테스트 mock(실 네트워크 0). **위기 거짓음성 0·자격 LLM 전복 0·날조 0을 런타임 적대 프로브로 실증.**
> **잔여(차단 아님)**: 접미사 없는 지명 보수적 누락(백로그). 실키 라이브 스모크 미실시(키 없는 환경) — 실배포 전 1회 권고.

---

## ⚠️ Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **위기 청년 오안내**(정책만 보여주고 안전자원 누락) | Med | **High** | 보수적 위기 감지(거짓양성 허용), 안전자원 상시 접근, LLM 치료조언 금지, 전 결과에 위기 안내 푸터 |
| 자격 오판정 → 신뢰·법적 리스크 | Med | High | '추정' 고지 + 원문 링크, 애매하면 "확인 필요"로 보수 처리 |
| 온통청년 자격필드가 비구조화(free-text 의존) | Med | Med | Phase 2에서 필드 실측, free-text 정교화는 V1 LLM 파싱으로 이연 |
| 데이터 완전성(몽땅 갭) | Med | Med | 갭률 측정 후 보강 소스 정식 편입, 누락 제보 기능(후속) |
| 모집시기 데이터 변동 → '곧' 오류 | Med | Low | 신선도 타임스탬프 + 원문 링크 항상 노출 |
| LLM 비용/지연/환각 | Med | Med | 결정형 버튼 우선, 그라운딩, fallback, 호출 캐싱 |
| API 키 발급 지연 | High | Low | Phase 1·3·4·5를 fixture/mock으로 병렬 진행 |
| 검색 재현율·정밀도 부족(관련 정책 누락/오정렬) | Med | High | 하이브리드+리랭킹, 패러프레이즈 평가셋 Recall@k 회귀; **노드 스코핑은 거친 도메인만 하드·세부 갈래는 소프트 부스트** |
| 임베딩/LLM 파싱 비용·지연 | Med | Med | 오프라인 1회 생성·캐시, **콘텐츠 해시 증분 파싱(변경분만)**, MVP 인메모리 검색, 호출 캐싱 |
| 과설계(조기 GraphRAG) | Med | Med | MVP는 하이브리드+경량 온톨로지; 풀 그래프는 중복·순서·우회가 본격화되는 V1+에서 |
| 임베딩 API 의존(키 없음·장애)로 검색 중단 | Med | Med | 하이브리드가 **키워드 arm으로 degrade**; 위기 감지는 **정규식 바닥(API 무관)** 으로 항상 작동 |

---

## 🔄 Rollback Strategy
- **공통**: 각 Phase는 독립 커밋. 실패 시 직전 Phase 완료 커밋으로 `git revert`/`reset`.
- **Phase 1**: 스캐폴드 제거(폴더 통째). DB·외부 변경 없음.
- **Phase 2**: 인제스트 스크립트·캐시 파일 삭제. 외부 쓰기 없음(읽기 전용 API).
- **Phase 3**: 엔진 모듈 되돌림 — UI 미연동이라 영향 격리.
- **Phase 4**: 임베딩 인덱스·검색(hybridSearch)·그래프 데이터/traverse 되돌림, 캐시 벡터 삭제.
- **Phase 5**: UI 컴포넌트 되돌림(엔진·그래프는 유지).
- **Phase 6**: LLM 레이어 비활성(키 off면 자동 버튼 모드) — 코드 제거 없이도 안전.

---

## 📊 Progress Tracking
- **Phase 1**: ✅ 100%
- **Phase 2**: ✅ 100%
- **Phase 3**: ✅ 100%
- **Phase 4**: ✅ 100%
- **Phase 5**: ✅ 100%
- **Phase 6**: ✅ 100%

**Overall**: ✅ 100% (6/6 Phase) — MVP 완성

| Phase | Estimated | Actual | Variance |
|-------|-----------|--------|----------|
| 1 | 2.5h | ~0.5h (하네스 자동) | -2.0h |
| 2 | 4.5h | ~0.9h (하네스 자동) | -3.6h |
| 3 | 4h | ~0.7h (하네스 자동) | -3.3h |
| 4 | 5h | ~1.6h (하네스 자동, 안전 수정 3R) | -3.4h |
| 5 | 4h | ~1.0h (하네스 자동, 안전/정합 수정 1R) | -3.0h |
| 6 | 3.5h | ~2.5h (하네스 자동, 안전 수정 3R) | -1.0h |
| **Total** | **~23.5h** | **~7.2h** | **-16.3h** |

---

## 📝 Notes & Learnings
### Implementation Notes
- 설계 리뷰 반영(2026-06-23): **Phase 2** — 콘텐츠 해시 증분 파싱, Gemini Structured Outputs(스키마 강제)+`UNKNOWN` 폴백, 정규화+유사도 기반 갭 매칭. **Phase 4** — 임베딩 불가 시 키워드 arm degrade, 비대칭 검색(목적·대상 청크만 색인), 위기 2층 감지(정규식 바닥+의미 보강), 노드 스코핑(거친=하드 / 세부=소프트 부스트로 재현율 보호).
- 리뷰 원안 대비 조정: 노드 스코핑을 세부 갈래까지 하드필터하면 재현율 붕괴 → 소프트 부스트로 변경. 위기 의미감지는 API 의존이라 정규식을 항상-동작 바닥으로 명시.
- **실 온통청년 API 연동(2026-06-25, U1~U3 해소)**: Phase 2 스캐폴드(`youthPlcyList.do?openApiVlak=`)는 폐기 API였음 → 현행 `getPlcy?apiKeyNm=`(JSON)로 교체. `adaptOntongItem`이 실 33필드 → 도메인 raw 스키마 변환. 핵심 발견: **지역은 `zipCd`(행정구역코드)로 판정** — 서울='11' 접두, 다수 시·도(≥10)=전국(서울 거주자 포함). 기관명만으론 중앙부처 전국사업을 놓침. 모집상태는 `aplyPrdSeCd`(0057001 특정기간/0057002 상시). 카테고리는 범용 키워드("맞춤형상담서비스") 과탐을 피해 강한 복합어+공식 중분류'건강'으로 한정. 페이지네이션은 totCount 고정·중간 빈 페이지 비절단으로 견고화. 실적: 전국 2,635 → 서울+전국 474건 적재(마음건강 7건). `scripts/ingest.ts`에 `process.loadEnvFile()` 추가(키는 `.env`, gitignore). 인제스트는 Gemini off로도 동작(자격 파싱은 정규화 텍스트 기반).
### Blockers Encountered
- (기록 예정)
### Improvements for Future Plans
- (기록 예정)

---

## 📚 References
- 온통청년 청년정책 API: https://www.data.go.kr/data/15143273/openapi.do · 제공목록 https://www.youthcenter.go.kr/cmnFooter/openapiIntro/oaiDoc
- 청년몽땅정보통(서울, 보강 소스): https://youth.seoul.go.kr/
- 서울 열린데이터광장(보강 API 확인): https://data.seoul.go.kr/
- 안전자원: 자살예방상담전화 109 · 정신건강 위기상담 1577-0199
- 근거 자료: 상담사 간담회 PDF(미참여 이유·진입장벽·상담 모델·사례) — 프로젝트 메모리 `project-cheongnyeon-policy-site` 참조
- 설계 시각자료: 마스터 설계도 / 욕구 발견 깔때기 / 하이브리드 검색 파이프라인 (대화 내 위젯)
- 검색 아키텍처 근거: GraphRAG vs Vector RAG(Atlan, Meilisearch) · 하이브리드 검색 BM25+벡터+리랭킹(2026) · 온톨로지 매치메이킹(arXiv 1010.2148) · LLM 메타데이터·파싱 RAG(arXiv 2512.05411 / 2412.15262)

---

## ✅ Final Checklist
- [ ] 6개 Phase 전부 품질 게이트 통과
- [ ] 마음건강 진입→결과 통합 테스트 통과
- [ ] 위기 라우팅 검증 완료
- [ ] '추정' 고지·원문 링크·신선도 전 결과 노출
- [ ] 접근성(키보드·대비) 확인
- [ ] 갭률 리포트 산출·검토
- [ ] 계획 문서 아카이브

---

**Plan Status**: 🔄 In Progress
**Next Action**: Phase 1 — `npm create vite@latest` 스캐폴드 후 Test 1.1(normalizePolicy) RED 작성
**Blocked By**: None (API 키는 Phase 2 후반/6에서만 필요, 병렬 진행)
