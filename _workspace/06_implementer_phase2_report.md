# Phase 2 구현 보고서 — 데이터 인제스트 · 파싱 · 구조화 (tdd-implementer)

> SSOT: `_workspace/05_planner_phase2_tasks.md` · 계획: `docs/plans/PLAN_youth-policy-diagnosis-mvp.md` Phase 2
> 방법론: RED → GREEN → REFACTOR. 순수함수 I/O·Date.now 금지, parseChunk UNKNOWN 보수 폴백, 키 0개로 전 게이트 통과.
> 선행: Phase 1 도메인 계약(`src/domain/*`) 보존·소비.

## 1. 구현 요약 (명세 §0 순서 준수)

| 순서 | 작업 | 단계 | 상태 |
|---|---|---|---|
| A | 캐시 인터페이스 타입 골격 `src/data/cache/types.ts` (PolicyCache·CachedPolicy) | 사전 | ✅ |
| 1 | RED Test 2.4 parseChunk (UNKNOWN 보수성) | 🔴 | ✅ 모듈 미존재 FAIL |
| 2 | RED Test 2.2 증분 해시 | 🔴 | ✅ FAIL |
| 3 | RED Test 2.3 커버리지 갭 | 🔴 | ✅ FAIL |
| 4 | RED Test 2.1 인제스트 파이프라인(통합) | 🔴 | ✅ FAIL |
| 5 | GREEN 2.5 ontongClient(fixture 모드) | 🟢 | ✅ |
| 6 | GREEN 2.6 parseChunk | 🟢 | ✅ |
| 7 | GREEN 2.8 coverage(자체 similarity) | 🟢 | ✅ |
| 8 | GREEN 2.7 ingest + scripts/ingest.ts | 🟢 | ✅ |
| 9 | REFACTOR 2.9 캐시 추상화 정리(`cache/index.ts` 배럴, Firestore 자리) | 🔵 | ✅ |

산출 모듈: `src/data/{ontongClient,parseChunk,ingest,incremental,coverage}.ts`,
`src/data/cache/{types,localJsonCache,index}.ts`, `src/data/llm/geminiClient.ts`, `scripts/ingest.ts`.

## 2. 🔴 RED 실패 출력 (인용)

4개 신규 스위트가 그린필드 모듈 미존재로 의도대로 FAIL (정상 RED):

```
 ❯ test/integration/ingest/pipeline.test.ts (0 test)
 ❯ test/unit/data/incremental.test.ts (0 test)
 ❯ test/unit/data/coverage.test.ts (0 test)
 ❯ test/unit/data/parseChunk.test.ts (0 test)

 FAIL  test/integration/ingest/pipeline.test.ts
Error: Failed to resolve import "@/data/ingest" from "...pipeline.test.ts". Does the file exist?
  2  |  import { ingest } from "@/data/ingest";
     |                          ^
 FAIL  test/unit/data/incremental.test.ts
Error: Failed to resolve import "@/data/incremental" ...
 FAIL  test/unit/data/coverage.test.ts
Error: Failed to resolve import "@/data/coverage" ...
 FAIL  test/unit/data/parseChunk.test.ts
Error: Failed to resolve import "@/data/parseChunk" ...
⎯⎯⎯ Failed Suites 4 ⎯⎯⎯
```

GREEN 전환 중 1차 통과 후 coverage 스위트가 의도와 다르게 3건 FAIL → 추정 없이 원인 분석:
```
× normalizeName 공백/기호 제거: expected '청년월세' to be '청년월세지원'
   → 괄호 내용까지 제거하는 과잉 규칙. (재)/(사)/(주)/(법인) 법인표기만 제거하도록 일반화 수정.
× similarity 경계: expected 0.75 to be >= 0.85
   → "청년월세한시지원" vs "청년월세지원"은 2자 삽입 → 정규화 Levenshtein 0.75가 정답.
     테스트 픽스처를 명세의 0.84/0.86 경계 검증 의도에 맞게 1자 차(0.857≥0.85)로 교정하고
     2자 차(0.75<0.85) 음성 케이스를 별도 추가(경계 양방향 고정).
```
(구현이 아니라 픽스처가 임계 의미를 잘못 표현 → 일반화하여 경계 테스트 이중화. 임계 0.85 자체는 불변.)

## 3. 통과 테스트 · 커버리지 (domain/data 분리)

- **통과 테스트: 107 / 107 (스킵 0)** — Phase 1 회귀 47 + Phase 2 신규 60.
  - parseChunk 11, incremental 13, coverage 17, ingest(통합) 12, ontongClient 7.
- **flaky 없음**: `npm test` 3회 연속 모두 107 passed.
- **커버리지(계층별 게이트, vitest per-glob thresholds)**:

```
File             | % Stmts | % Branch | % Funcs | % Lines
-----------------|---------|----------|---------|--------
 data            |  96.53  |  84.10   |  100    |  98.40   ← src/data ≥80 게이트 충족
  coverage.ts    |  97.91  |  79.45   |  100    |  100
  incremental.ts |  100    |  92.30   |  100    |  100
  ingest.ts      |  95.19  |  81.42   |  100    |  97.80
  ontongClient.ts|  96.87  |  84.61   |  100    |  100
  parseChunk.ts  |  93.93  |  90.90   |  100    |  93.93
 domain/parse    |  97.70  |  95.83   |  100    |  98.75   ← src/domain ≥90 유지
```
- domain 전 항목 ≥90 유지(회귀 없음). data 디렉터리 집계 stmts 96.53 / branch 84.10 / lines 98.40 → ≥80 충족.
- 게이트 충돌 해소: Phase 1의 단일 global 90 임계가 data 포함 시 branch를 끌어내림 →
  **per-glob thresholds**(`src/domain/**`≥90, `src/data/**`≥80)로 분리(명세 §9 "domain≥90 + src/data≥80" 정확 반영).
- 미커버 잔여 라인은 전부 방어적 분기(`?? ''`/`?? 'unknown'`/노드 I/O 경계). I/O 부수효과 구현체
  (`cache/localJsonCache.ts`, `llm/geminiClient.ts`)는 coverage.exclude(키 0개 결정성 게이트에서 미도달).

## 4. 설정 보정 3건 (GREEN 중)

1. **`vitest.config.ts`**: `coverage.include`에 `'src/data/**'` 추가. + per-glob thresholds(domain 90/data 80).
   + I/O 경계(`localJsonCache.ts`, `geminiClient.ts`) coverage.exclude.
2. **`tsconfig.node.json`**: `include`에 `"scripts"` 추가 + `resolveJsonModule:true`(스크립트 JSON fixture import).
   `scripts/ingest.ts`가 `tsc -b`에서 타입체크됨(확인: `npx tsc -b --force` EXIT 0).
3. **`package.json`**: `"ingest":"tsx scripts/ingest.ts"` 스크립트 + `tsx`(^4) devDep.
   추가 부수: `tsconfig.app.json`에 `resolveJsonModule:true` + `types`에 `"node"`(test의 JSON import·node API 타입).
4. **`npm audit` 신규 취약점 0건**: tsx 도입 후에도 사전 존재 `esbuild`(GHSA-g7r4-m6w7-qqqr, low,
   dev-server·Windows 한정, vite 전이) 1건만. tsx가 추가한 신규 advisory 없음.

## 5. 종료 게이트 결과

| 게이트 | 명령 | 결과 |
|---|---|---|
| 테스트 | `npm test` | ✅ 107 passed (0 skip), 3회 flaky 없음 |
| 커버리지 | `npm test -- --coverage` | ✅ domain ≥90 유지 · data stmts 96.53/branch 84.10 (≥80) — threshold error 없음 |
| 타입 | `npx tsc -b --force` | ✅ EXIT 0 (scripts/ 포함) |
| 린트 | `npm run lint` | ✅ 0 errors / 0 warnings |
| 빌드 | `npm run build` | ✅ built in ~1.7s |
| audit | `npm audit` | ⚠️ low 1건(사전 존재, 신규 0) |
| 인제스트 | `npm run ingest` (키 0개) | ✅ fixture 모드 적재 |

### 인제스트 실측 (키 없이 fixture 모드)
```
[ingest:fixture] policies=4 droppedNoId=0 droppedUnknownRegion=0 droppedNonSeoul=1 merged=1 reparsed=4 manualCandidates=1
[coverage] matched=1 mongttangOnly=2 manualReview=0 gapRate=0.667
[out] data/cache/policies.json, coverage-report.json, data/parsed-sample.json
```
- 6건 → 서울필터(P3 부산 droppedNonSeoul=1) + 1차키 병합(P1=P4 merged=1) → **4건 적재**.
- 동일 id 갱신 규칙 검증: ON-0001 병합본이 **최신 lastModified(P4) 채택** → recruit.end `2026-09-30`, summary "확대".
- 2차키(P1≡P6 정규화명+기관 동일) **자동병합 금지** → manualCandidates=1.
- **2회차 실행 reparsed=0** (증분 skip 동작 — 변경 없는 정책 parser 미호출).
- `data/parsed-sample.json`: 키 없음→LLM off→3청크/자격 전 UNKNOWN(보수 폴백 가시 확인).
- 생성물은 `.gitignore`에 추가(런타임 산출, 커밋 금지).

## 6. 안전 불변식 반영 (safety-domain-auditor 사전 공유 대응)

1. **parseChunk UNKNOWN 폴백(최우선)**: 누락·null·스키마외값·LLM reject(L5)·빈/null 입력(L8)·빈 객체(L6)
   → 전부 UNKNOWN, throw 0. `incomeCriterion` null/누락 → `{kind:'UNKNOWN'}` (none 아님, L3),
   `kind:'none'` 명시일 때만 none(L9). medianRatio/amountMax는 value 유한수일 때만 채택(없으면 UNKNOWN).
2. **LLM throw 흡수**: `generateStructured` reject를 try/catch로 흡수 → safeResult(흐름 단절 0).
3. **증분 해시 오염 방지**: 해시 입력에서 `fetchedAt/updatedAt/sourceUrl` 제외(H5), 자격영향 원문 포함(H4),
   키 정렬+공백 정규화로 결정성(H1/H8). lastModified 우선·없으면 내용 서명(H2). 깨진/null raw throw 0(H7). 자체 FNV-1a.
4. **중복제거 false merge 금지**: 1차 source+id만 자동병합. 2차(≥0.85)는 `dedupeManualCandidates`로만(자동병합 0).
5. **서울 필터(리더 결정 a)**: `regionCodes∋'11' OR isNationwide OR 25개 자치구명 포함`. 비서울(식별됨)=droppedNonSeoul,
   불명(원문 없음)=droppedUnknownRegion 분리 카운트(재현율 감시 가시화).
6. **id 안정성**: 무id(placeholder 'unknown') 제외 + droppedNoId 카운트. 적재본에 'unknown' id 0건.
7. **신선도='추정' 근거**: fetchedAt=주입 now, 변경분 updatedAt=now, 무변경 updatedAt 보존.
8. **coverage gapRate 분모/분자 고정**: 분모=totalMongttang. 빈 ontong→1.0(C5), 빈 mongttang→0(C6). 깨진 항목 throw 0(C7).

## 7. 리더 확정 결정 반영

- (a) 서울 필터 = 11 OR 전국 OR 자치구명. 불명 지역 제외 + `droppedUnknownRegion`. (`ingest.ts` seoulVerdict)
- (b) 동일 id 갱신 = lastModified 최신 우선(양쪽 있을 때), 한쪽만 있으면 정보 있는 쪽,
  둘 다 없으면 page2(후행). (`ingest.ts` pickNewer)

## 8. 남은 TODO / 확인 필요 (보수 처리 + 주석)

1. **U1~U3 온통 실 raw/구조/페이지네이션**: fixture가 SSOT. `ontongClient.parseResponse`(JSON 우선,
   XML은 빈 배열) + 페이지 루프(빈 페이지 종료, 안전상한 50)는 어댑터 경계만. 실 필드명/XML은 키 확보 시 1곳 후보정.
2. **U7 Gemini 실 모델·responseSchema·임베딩**: `geminiClient`는 인터페이스+disabled 폴백 자리만.
   키 있어도 Phase 2는 disabled(보수). 실 호출은 Phase 6.
3. **amountMax 텍스트 패턴**: parseChunk는 LLM이 amountMax+value 산출 시 보존(테스트 통과). 도메인 정규식
   amountMax는 Phase 1 미구현 잔존(income.ts) — 인제스트는 LLM 경로로 보강.
4. **fixture가 번들에 포함**: `ontongClient`가 `test/fixtures/*.json`을 정적 import → vite build가 클라이언트
   번들에 fixture 포함. fixture 모드 설계상 수용했으나, Phase 6에서 fixture를 비-test 경로로 이동하거나
   동적 import로 분리 권장(`// TODO(Phase6)` 후보). 프로덕션 데이터는 캐시(`data/cache`) 경유.
5. **FirestoreCache 미구현**: `PolicyCache` 계약 뒤 자리만(`cache/index.ts` 주석). Phase 5+ 운영 단계.

## 9. 산출 파일 경로

- 테스트: `test/integration/ingest/pipeline.test.ts`,
  `test/unit/data/{parseChunk,incremental,coverage,similarity,ontongClient}.test.ts`
- fixture: `src/data/__fixtures__/{ontong-policies.page1,ontong-policies.page2}.sample.json`(2차 루프 이동),
  `test/fixtures/mongttang.sample.json`
- 구현: `src/data/{ontongClient,parseChunk,ingest,incremental,coverage,similarity}.ts`,
  `src/data/cache/{types,localJsonCache,index}.ts`, `src/data/llm/geminiClient.ts`, `scripts/ingest.ts`
  (`similarity.ts`는 2차 루프 신규 — coverage·ingest 공용 유사도 단일 진실원)
- 설정: `vitest.config.ts`, `tsconfig.node.json`, `tsconfig.app.json`, `package.json`, `.gitignore`
- 산출데이터(gitignore): `data/cache/policies.json`, `coverage-report.json`, `data/parsed-sample.json`

## 10. 다음 Phase 경계면 메모

- **Phase 3 (자격 엔진)**: `CachedPolicy.parsed.qualification`(UNKNOWN=확인필요·탈락금지) + `Policy.recruit/income`
  소비. 고정 clock 주입으로 RecruitStatus 분류. `incomeCriterion.kind==='UNKNOWN'`/`'none'` 구분 그대로 신뢰.
  `fetchedAt`로 '최종 업데이트 시각'·'추정' 고지.
- **Phase 4 (그래프/검색)**: parseChunk 청크 중 **purpose(목적·대상)만 임베딩 색인**, application 제외(표시전용).
  `CachedPolicy`에 벡터 필드 확장. coverage manualReviewCandidates/dedupeManualCandidates는 검수 큐 입력.
- **Phase 6 (실 Gemini)**: `geminiClient.createGeminiClient`에 SDK·responseSchema·정책 record 그라운딩 연결.
  parseChunk의 `LlmClient.generateStructured` mock 계약을 그대로 만족하면 됨(인터페이스 불변).
- **운영(Phase 5+)**: `PolicyCache` 뒤 FirestoreCache 추가(LocalJsonCache 교체). ingest/scripts 무변경.

→ **code-reviewer · safety-domain-auditor 리뷰 요청.** (특히 §6 안전 불변식, §8-4 fixture 번들 포함, parseChunk L3/L9 구분)

---

## 수정 루프 2차 (검수 수렴 결함 — Phase 3 차단 전 필수)

code-reviewer(S2)·safety-auditor(V2-1)가 **증분 해시 결함에 독립 수렴**. blocker/High 없음(머지 가능)이었으나
Phase 3 자격 엔진을 켜기 전 반드시 막아야 하는 항목(낡은 자격 캐시 → 부적격/적격 오판). RED 먼저 후 GREEN, 기존 107건 회귀 없음.

### 🔴 RED 추가 (6건, 먼저 실패 확인)
```
 ❯ test/unit/data/incremental.test.ts (17 tests | 4 failed)
   × H9: lastModified 동일 + income.raw 변경 → 다른 해시 (수정일 미갱신 본문변경 감지)
   × H10: lastModified 동일 + ageText 원문 변경 → 다른 해시 (파싱값 동일해도 원문 변경 감지)
   × H11: ageText 원문 변경 → 다른 해시 (lastModified 없는 서명 경로)
   × H12: lastModified 동일하나 자격 본문 변경 → needsReparse=true (낡은 자격 캐시 방지)
 ❯ test/integration/ingest/pipeline.test.ts (14 tests | 2 failed)
   × 증분 2회차: 1건만 본문 변경(수정일 동일) → 그 1건만 reparsed, 나머지 skip
   × 동명 자치구 오탐 차단: "부산광역시 중구" → 서울 탈락(droppedNonSeoul)
 Tests  6 failed | 25 passed (31)
```
(기존 H5 sourceUrl만→동일, H8 키순서→동일, 서울 자치구 인정 케이스는 RED 단계부터 통과 — 회귀 고정.)
GREEN 전환 중 자체 추가 테스트가 **빈 키 오매칭 결함**까지 노출(`pairSimilarity('','','','')→1`) → 일반화 수정으로 함께 차단.

### 🟢 GREEN 수정 (일반화 — 특정 케이스 땜질 아님)

**수정 1 (수렴·최우선) — 증분 해시 `src/data/incremental.ts`**
- `contentHash` 입력을 **`id + lastModified + eligibilitySignature` 이중 결합**으로 변경(기존: lastModified 있으면 `id+lm`만).
  수정일은 저비용 1차 신호로 결합하되 자격영향 서명을 **항상 포함** → 발행처가 수정일 미갱신 채 본문(income.raw, ageText)만
  바꿔도 감지. fetchedAt/updatedAt/sourceUrl은 계속 제외.
- `eligibilitySignature`에 **`rawText`**(raw의 ageText/incomeText/regionText/recruit\* 원문, 키정렬+공백정규화) 추가 →
  파싱값(ageMin/ageMax 등)이 동일해도 원문 변경을 감지. `ELIGIBILITY_RAW_KEYS` 상수로 고정.
- 부수: 기존 파일에 혼입돼 있던 **널바이트(\x00) 4개**(템플릿 리터럴 공백 자리)를 정상 공백으로 교정.

**수정 2 (정밀도) — 동명 자치구 오탐 `src/data/ingest.ts seoulVerdict`**
- 자치구명 `includes()` 매칭에 **시/도 교차검증** 추가. `NON_SEOUL_SIDO` 상수(부산·대구·…·제주)가 regionText에
  함께 있으면 자치구명만으로 pass 금지. '부산광역시 중구'/'대구광역시 중구' → 탈락(droppedNonSeoul),
  '서울특별시 중구'·'중구'(시도 토큰 없음) → 통과. (regionCodes '11'은 도메인이 '서울' 식별 → 그대로 pass.)

**수정 3 (드리프트 제거) — 유사도 산식·임계 통일 `src/data/similarity.ts`(신규)**
- `SIMILARITY_THRESHOLD`·`normalizeName`·`similarity`·`pairSimilarity`를 **공용 모듈 1곳**으로 추출.
  coverage(기존 title만)·ingest(기존 (title+org)/2)·중복 임계 상수 2개 → **단일 `pairSimilarity` 산식**으로 통일.
- `pairSimilarity`: 정규화 키(명|기관) 완전 동일→1, 그 외 정규화 후 명·기관 유사도 평균. **빈 키(`'|'`)는 0**
  (빈 깨진 레코드 오매칭/오병합 방지 — 자체 테스트가 노출한 추가 결함). coverage는 `similarity` 모듈을 재노출해 import 경로 호환.
- 양 모듈이 동일 함수 사용 → coverage 경계(C2/C8 0.85 후보)·pipeline 후보(P1≡P6)·C3/C4 음성 모두 동일 결과로 회귀 유지.

**수정 4 (S3) — 역방향 import 제거**
- `ontongClient`가 참조하던 fixture를 `test/fixtures/` → **`src/data/__fixtures__/`** 로 이동(src→test 역방향 제거).
  ontongClient·pipeline.test 모두 새 경로 참조. test/fixtures의 중복 ontong page 파일 삭제(mongttang은 잔존).

**수정 5 (S4) — tsconfig 일관성**
- `tsconfig.node.json`에 `noUncheckedIndexedAccess: true` 추가(app과 일관). `scripts/ingest.ts` 인덱스 안전 확인(tsc -b EXIT 0).

### 게이트 재실행 (수정 후)
| 게이트 | 결과 |
|---|---|
| `npm test` | ✅ **120 passed (0 skip)** — 기존 107 + 신규 13(증분 4·ingest 2·동명자치구 통과 1·similarity 6), **3회 flaky 없음** |
| `npm test -- --coverage` | ✅ threshold error 없음. data stmts 96.68 / **branch 85.60** (≥80) · domain ≥90 유지 |
| `npx tsc -b --force` | ✅ EXIT 0 (node noUncheckedIndexedAccess 포함) |
| `npm run lint` | ✅ 0 errors / 0 warnings |
| `npm run build` | ✅ 29 modules, built ~1.6s |
| `npm audit` | ⚠️ 사전 존재 low 1건(esbuild dev-server), **신규 0** |

### 증분 재검증 (`npm run ingest` ×2, 키 0개)
```
run1(clean) : reparsed=4 (전 신규)   droppedNonSeoul=1 merged=1 manualCandidates=1  matched=1 gapRate=0.667
run2(증분)  : reparsed=0 (전 무변경)  ← 이중결합 해시 결정성·skip 정상
```

### deferred (이번 루프 명시적 비범위)
- **V2-3 (parseInput 그라운딩 입력 누락)**: 현재 LLM disabled → 전 UNKNOWN(보수)이라 자격 오판 없음.
  **Phase 6 실 Gemini 연결 시 High로 재평가**(parseInput에 자격 원문 충분 주입 + 정책 record 그라운딩 검증).
- **N4 (collectManualCandidates / computeCoverage O(n²))**: 스케일 시점(정책 수 급증) 위임. 현재 수백 건 규모 무영향.

### 안전 효과
세 수렴 수정 모두 Phase 3 신뢰 기반을 굳힘: ① 증분 해시 이중결합+원문 서명으로 **낡은 자격 캐시 차단**(수정일 미갱신
본문변경·원문변경 모두 재파싱), ② 동명 자치구 교차검증으로 **비서울 오노출(false positive) 차단**(정밀도 결정 a 정합),
③ 유사도 단일 산식 + 빈 키 0으로 **오병합(정책 소실) 차단**. 모두 일반화 수정으로 동류 케이스 일괄 방어.
