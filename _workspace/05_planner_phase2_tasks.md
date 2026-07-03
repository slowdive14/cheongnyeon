# Phase 2 — 데이터 인제스트 · 파싱 · 구조화 · TDD 작업 명세 (phase-planner 산출)

> SSOT: `docs/plans/PLAN_youth-policy-diagnosis-mvp.md` Phase 2 (확장판: LLM 파싱·증분·유사도 갭)
> 선행: Phase 1 산출물, `src/domain/*`(Policy 계약 확정). 원칙: RED→GREEN→REFACTOR, 키 없이 전 게이트 통과.

## 그라운딩 (implementer 필독)
- `src/data/`, `scripts/`, `test/integration/`, `test/unit/data/` 미존재(Phase 2 그린필드).
- `vitest.config.ts` coverage.include = `['src/domain/**']` → **`'src/data/**'` 추가 필요**(데이터 ≥80% 게이트).
- `tsconfig.app.json`은 src,test 포함하나 **scripts/ 미포함** → `scripts/ingest.ts` 타입체크 위해 tsconfig.node include에 scripts 추가.
- `verbatimModuleSyntax: true` → 타입 import는 `import type`.
- env: `ONTONG_API_KEY`, `GEMINI_API_KEY`(.env.example 존재). fixture/mock 모드.
- `fast-levenshtein`은 transitive devDep일 뿐 → 유사도 **자체 구현**(신규 직접 의존성 금지).
- Phase 1 `fallbackId()`='unknown' → ingest는 안정 id 부여 또는 무id 제외+카운트.
- Phase 1 불변식 보존: `unknown≠none`(소득), `불명≠전국`(지역), 무효 모집기간=unknown, throw 금지. normalize는 타임스탬프 미생성 → ingest가 fetchedAt/updatedAt 주입.

## 0. 작업 순서 (왜 이 순서인가)
| 순서 | 작업 | 단계 | 근거 |
|---|---|---|---|
| A | 캐시 인터페이스 타입 골격 | 사전 | ingest/incremental/coverage가 캐시 계약에 의존 → 먼저 못박아야 mock 가능 |
| 1 | Test 2.4 parseChunk(mock+UNKNOWN) | RED | 파싱 shape이 ingest/coverage 입력 계약. UNKNOWN=보수성 직결, 최우선 |
| 2 | Test 2.2 증분 해시 | RED | 해시 입력·skip 판정은 ingest 핵심 분기 |
| 3 | Test 2.3 커버리지 갭 | RED | 정규화·유사도 순수함수, 독립 |
| 4 | Test 2.1 인제스트 파이프라인(통합) | RED | 단위 계약 조립 최상위 |
| 5 | Task 2.5 ontongClient(fixture) | GREEN | 2.1 입력 소스, fetch 격리 |
| 6 | Task 2.6 parseChunk 구현 | GREEN | 2.4 통과 |
| 7 | Task 2.8 coverage 구현 | GREEN | 2.3 통과 |
| 8 | Task 2.7 ingest + scripts/ingest.ts | GREEN | 2.1 통과, 4모듈 조립 |
| 9 | Task 2.9 캐시 추상화 + 검수 샘플 | REFACTOR | 로컬 JSON 정리, Firestore 자리만 |

## 1. 확인 필요 (추정 금지 — fixture로 계약 고정)
- U1 온통 실제 raw 필드명: Phase1 잠정 유지, sample.json shape이 계약, ontongClient 어댑터 1곳만 후보정.
- U2 XML/JSON 구조: ontongClient 내부 parseResponse 경계, fixture 모드 우회.
- U3 페이지네이션 파라미터: fixture 2페이지로 병합만 검증.
- U4 청년몽땅 소스 형태: mongttang.sample.json로 계약 고정.
- U5 온통 최종수정일 유무: 해시 입력 이중화(있으면 우선, 없으면 내용).
- U6 서울 법정 시군구: 필터 = regionCodes에 '11' OR regionText에 서울 25개 자치구명. 자치구명 상수 고정.
- U7 Gemini 모델·responseSchema·임베딩: Phase2는 mock 계약만, 실체는 Phase 4/6.

## 2. RED Test 2.1 — 인제스트 파이프라인 (test/integration/ingest/pipeline.test.ts)
대상 `src/data/ingest.ts`: `ingest(deps)` — deps `{client, parser, cache, now}` 주입(직접 fetch·Date.now·I/O 금지).
fixture 6건(2페이지): P1 ON-0001 서울 신규 / P2 ON-0002 강남구 / P3 ON-0003 부산(탈락) / P4 ON-0001 중복(=P1) / P5 ON-0004 전국 / P6 ON-0005(다른 id, 같은 정규화명+기관, 서울).
기대:
1. 페이지 병합(page1+page2 6건).
2. 서울 필터: P3 제외. 통과 = regionCodes∋'11' OR isNationwide OR 자치구명 포함.
3. 중복제거 **1차 키=source+id**(P1=P4 병합). **2차 키=정규화(정책명+기관)** 동일성(P6)은 **자동 병합 금지** → 수동검증 후보(`dedupeManualCandidates`)로만.
4. 신선도: 적재분 fetchedAt=now 주입. 변경 없으면 updatedAt 보존, 변경분 updatedAt=now.
5. 증분 연동: cache에 이전 스냅샷 시 변경 없는 정책 parser 미호출(spy 0).
6. id 안정화: 무id raw 제외+`droppedNoId` 카운트.

## 3. RED Test 2.2 — 증분 해시 (test/unit/data/incremental.test.ts)
대상 `src/data/incremental.ts`: `contentHash()`, `needsReparse(policy, cached)`. 순수·결정적.
해시 입력: 최종수정일 있으면 `id+최종수정일`, 없으면 `id+자격영향 원문 정규화 직렬화`(title,summary,ageText,incomeText,regionText,recruit*,category,자격원문). **제외: fetchedAt/updatedAt/sourceUrl**. 키 정렬+공백 정규화 후 해시.
시나리오 H1 결정성 / H2 수정일만 다름→true / H3 동일→skip / H4 incomeText 변경→true / H5 sourceUrl만→false / H6 신규→true / H7 깨진 raw→throw 금지 / H8 키순서만 다름→동일 해시.

## 4. RED Test 2.3 — 커버리지 갭 (test/unit/data/coverage.test.ts)
대상 `src/data/coverage.ts`: `normalizeName()`, `similarity()`, `computeCoverage(ontong[], mongttang[])`. 순수.
정규화: 공백/기호 제거, 기관명 동의어(서울시↔서울특별시↔서울, (재)/(사) 제거). 키=정규화명|정규화기관.
유사도: Jaccard(토큰) + 정규화 Levenshtein의 **max**, **자체 구현**. 임계 ≥0.85→manualReviewCandidates(자동 동일 금지), <0.85 다름, ==1&키동일→자동 동일.
시나리오 C1 동의어 매칭 / C2 0.85 후보 / C3 몽땅전용 / C4 다름 / C5 빈 ontong→gapRate 1.0 / C6 빈 mongttang→0 / C7 깨진 포함 throw 금지 / C8 정규화 후 후보. 경계 0.84/0.86 검증.
CoverageReport: {totalOntong, totalMongttang, matched, mongttangOnly[], manualReviewCandidates[{ontong,mongttang,score}], gapRate, generatedAt:null}.

## 5. RED Test 2.4 — parseChunk (test/unit/data/parseChunk.test.ts)
대상 `src/data/parseChunk.ts`: `parseChunk(policyText, deps:{llm})`. LLM mock 주입, throw 금지, 누락/불명=UNKNOWN.
LlmClient mock: `llm.generateStructured(prompt, schema)→Promise<object>`.
ParseResult: `{ qualification: ParsedQualification, chunks:{purpose,eligibility,application: string|null} }`
ParsedQualification = { householdSeparation:'required'|'not_required'|'UNKNOWN', incomeCriterion:{kind:'medianRatio'|'amountMax'|'none'|'UNKNOWN', value?, raw:string|null}, duplicateParticipation:'allowed'|'disallowed'|'UNKNOWN' }
청크: purpose(목적·대상=Phase4 색인), eligibility(자격), application(신청=색인 제외 표시전용). 미제공=null.
시나리오 L1 완전 / L2 householdSeparation 누락→UNKNOWN / L3 incomeCriterion null→{kind:'UNKNOWN'}(none 아님) / L4 스키마외값→UNKNOWN / L5 LLM reject→전 UNKNOWN+청크 null / L6 빈객체→전 UNKNOWN / L7 application만 / L8 빈/null 입력→안전 UNKNOWN / L9 kind='none' 명시→none 보존.
**핵심: none(명시) vs UNKNOWN(불명) 구분(L3 vs L9).**

## 6. fixture/mock 경계 (키 0개로 전 게이트 통과)
- `test/fixtures/ontong-policies.page1.sample.json`·`page2.sample.json`(§2 6건).
- `test/fixtures/mongttang.sample.json`(다른 raw 스키마: bizId/policyName/orgName/regionName/ageInfo/incomeInfo/applyPeriod/detailUrl). 어댑터 mongttangToRaw로 보정. 3건: C1 동일정책(기관변형)·C3 몽땅전용·C7 깨진 항목.
- LlmClient mock = 테스트 인라인 vi.fn(). 실 Gemini는 인터페이스 뒤(`src/data/llm/geminiClient.ts`).
- ontongClient: ONTONG_API_KEY 미설정→fixture. parseChunk: GEMINI_API_KEY 미설정→LLM off. 테스트는 항상 fixture/mock 강제.

## 7. GREEN·REFACTOR
- 2.5 ontongClient: `createOntongClient({apiKey?,fixture?})→{fetchAll()}`. 키 없으면 fixture, 있으면 fetch→parseResponse→페이지 루프→병합.
- 2.6 parseChunk: §5. responseSchema는 주입 LlmClient 뒤. 검증·UNKNOWN 폴백·청크 매핑·throw 흡수.
- 2.8 coverage: §4. 자체 similarity.
- 2.7 ingest + scripts/ingest.ts: §2. ingest(deps)=받기→normalizePolicy→id안정화·신선도주입→needsReparse→변경분만 parseChunk→중복제거→서울필터→cache.write. scripts는 실조립(env·로컬캐시·clock)+coverage 실행→coverage-report.json.
- 2.9 캐시 추상화 `src/data/cache/`: `PolicyCache{readAll();getByHash();getById();writeAll()}`. Phase2=LocalJsonCache(`data/cache/policies.json`)만, Firestore 자리만.

## 8. safety-domain-auditor 사전 공유
1. **parseChunk UNKNOWN 폴백=자격 보수성 직결(최우선)**: 누락·null·스키마위반·오류→UNKNOWN. none/not_required/allowed 흡수 시 Phase3 부적격 통과. incomeCriterion null→UNKNOWN(≠none, L3 vs L9).
2. LLM throw 흡수=흐름 단절 금지(L5/L8).
3. 증분 해시 오염 방지: fetchedAt/sourceUrl 포함 금지(전체 재파싱), 자격영향 원문 누락 금지(변경 누락).
4. 중복제거 false merge 금지: ≥0.85 자동 병합 금지(수동검증 후보). 오병합=정책 소실.
5. 서울 필터 누락 금지: 11 OR 전국 OR 자치구명.
6. 신선도=‘추정’ 고지 근거.
7. id 안정성: 무id 제외+카운트.
8. coverage gapRate 분모/분자 고정.
**auditor 결정 요청 2건: (a) 서울 필터에서 불명 지역 포함(재현율)/제외(정밀도). (b) 동일 id 갱신본/구본 우선순위.**

## 9. Phase 2 종료 게이트
공통: npm test(스킵0,키0) / coverage(domain≥90 유지 + **src/data≥80 — vitest.config include에 src/data 추가**) / lint 0 / tsc --noEmit(**scripts/ tsconfig 보정 후**) / build / audit 신규0(tsx 도입 시 확인) / RED→GREEN→REFACTOR·3회 flaky 없음.
수동: (키 있으면) npm run ingest 실적재 / 2회차 변경없음 skip / 파싱 구조화+3청크(누락 UNKNOWN) / coverage-report.json 갭률·몽땅전용·수동검증후보 / 캐시 신선도.
**설정 보정 3건(GREEN 중): (1) vitest.config coverage.include에 src/data 추가 (2) tsconfig.node include에 scripts 추가 (3) package.json ingest 스크립트+TS 러너(tsx) devDep+audit.**

## 10. 산출 파일
테스트: test/integration/ingest/pipeline.test.ts, test/unit/data/{incremental,coverage,parseChunk}.test.ts
fixture: test/fixtures/ontong-policies.page1/page2.sample.json, mongttang.sample.json
구현: src/data/{ontongClient,parseChunk,ingest,incremental,coverage}.ts, src/data/cache/{types,localJsonCache}.ts, src/data/llm/geminiClient.ts, scripts/ingest.ts
설정: vitest.config.ts, tsconfig.node.json, package.json, .gitignore
산출데이터: data/cache/policies.json, coverage-report.json, data/parsed-sample.json

## 11. 다음 Phase 경계면
- Phase 3: ParsedQualification(UNKNOWN=확인필요·탈락금지) + Policy.recruit/income 소비, 캐시 fetchedAt 활용.
- Phase 4: 목적·대상 청크만 임베딩 색인(신청 제외), 캐시 벡터 확장, 실 Gemini 모델/임베딩.
- Phase 6: parseChunk 실 GeminiClient(responseSchema·모델명) — Phase2 mock 계약 그대로 만족.

---
## 리더 결정 (auditor 결정 요청 2건 — Phase 1 보수 철학 기반)
- (a) **서울 필터: 11 OR 전국 OR 자치구명 매칭. 불명 지역(코드 없음·전국 아님·자치구명 없음)은 제외 + `droppedUnknownRegion` 카운트.** 근거: MVP 대상=서울 거주 청년, 불명지역 포함 시 비서울 오노출로 신뢰 훼손. 누락분은 coverage 리포트로 가시화(재현율 감시). → safety-auditor 재검토 대상.
- (b) **동일 id 갱신: 최종수정일 있으면 최신 우선, 없으면 page2(후행) 우선.** planner 제안 채택.
