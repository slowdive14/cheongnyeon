# Phase 2 통합 QA — 정합성 & 품질 게이트 (integration-qa)

> 검증자: integration-qa · 대상: `_workspace/06_implementer_phase2_report.md`
> 방법론: 품질 게이트 직접 실행(출력 인용) + 경계면 양쪽 파일 동시 교차 비교.
> 결론: **Phase 2 = 완료(PASS).** 전 게이트 통과, 경계 불일치 없음. 메모성 관찰 2건만(차단 아님).

## 1. 품질 게이트 결과 (전부 직접 실행)

| 게이트 | 명령 | 결과 | 수치(인용) |
|---|---|---|---|
| 테스트 | `npm test` | ✅ PASS | `Test Files 6 passed (6)` / `Tests 107 passed (107)` (스킵 0) |
| flaky | `npm test` ×3 | ✅ 없음 | 3회 모두 `107 passed`, 6 files |
| 커버리지 | `npm test -- --coverage` | ✅ PASS | threshold 에러 0, exit 0 |
| 타입(app) | `npx tsc --noEmit` | ✅ PASS | EXIT 0 |
| 타입(전체+scripts) | `npx tsc -b --force` | ✅ PASS | EXIT 0 (scripts/ingest.ts 포함) |
| 린트 | `npm run lint` | ✅ PASS | 출력 0줄(0 error / 0 warning) |
| 빌드 | `npm run build` | ✅ PASS | `✓ built in 1.55s`, 29 modules |
| audit | `npm audit` | ⚠️ low 1건(사전 존재, 신규 0) | esbuild GHSA-g7r4-m6w7-qqqr (dev-server, vite 전이) |
| 인제스트 | `npm run ingest` ×2 | ✅ PASS | 증분 skip 실증(아래) |

### 1.1 커버리지 수치 (인용)
```
File               | % Stmts | % Branch | % Funcs | % Lines
-------------------|---------|----------|---------|--------
All files          |   96.86 |    88.06 |     100 |   98.52
 data              |   96.53 |     84.1 |     100 |    98.4   ← src/data ≥80 게이트 충족
  coverage.ts      |   97.91 |    79.45 |     100 |     100
  incremental.ts   |     100 |     92.3 |     100 |     100
  ingest.ts        |   95.19 |    81.42 |     100 |    97.8
  ontongClient.ts  |   96.87 |    84.61 |     100 |     100
  parseChunk.ts    |   93.93 |     90.9 |     100 |   93.93
 domain/parse      |    97.7 |    95.83 |     100 |   98.75  ← src/domain ≥90 유지
  recruit.ts       |      95 |       92 |     100 |   97.22
```
- `vitest.config.ts` per-glob thresholds 확인: `src/domain/**`{lines/funcs/branches/stmts 90}, `src/data/**`{80}. exclude=`localJsonCache.ts`,`geminiClient.ts`(I/O 경계). **threshold error 0 → 양 글로브 모두 충족.**
- 표에 normalizePolicy/age/income/region/primitives가 안 보이는 것은 v8 텍스트 리포터가 미커버 라인 있는 파일(recruit.ts)+디렉터리 집계만 출력하기 때문(100% 파일 접힘). 디렉터리 집계 domain/parse 97.7/95.83이 ≥90 게이트를 대표.

### 1.2 인제스트 실측 (키 0개, 2회 연속 — 증분 실증)
```
RUN 1: [ingest:fixture] policies=4 droppedNoId=0 droppedUnknownRegion=0 droppedNonSeoul=1 merged=1 reparsed=4 manualCandidates=1
RUN 1: [coverage] matched=1 mongttangOnly=2 manualReview=0 gapRate=0.667
RUN 2: ... reparsed=0 ...   ← 증분 skip 동작(변경 없는 정책 parser 미호출) 실증
```

## 2. 경계면 교차 비교 (양쪽 파일 동시 확인)

### 2.1 normalize → ingest  ✅ 일치
- `normalizePolicy`(src/domain/normalizePolicy.ts) 출력 = `Policy`(src/domain/types.ts:43). ingest는 `output.push({ ...p, fetchedAt, updatedAt, contentHash, parsed })`로 `Policy`를 스프레드 + 메타 4필드 주입.
- `CachedPolicy extends Policy`(src/data/cache/types.ts:10) = `fetchedAt:string · updatedAt:string · contentHash:string · parsed:ParseResult|null`. ingest 주입 4필드와 **필드명·타입 정확 일치**. fetchedAt=now, 변경분 updatedAt=now / 무변경 보존 — 캐시 타입과 정합.
- safeDefault의 `income.kind:'unknown'`·`recruit.kind:'unknown'`·`isNationwide:false`·`regionCodes:[]` 전부 도메인 타입 유니온/안전기본 준수.

### 2.2 ingest → parseChunk  ✅ 일치 (어댑터 경유)
- 시그니처 차이 존재하나 **올바르게 어댑팅됨**: 실제 `parseChunk(policyText, deps)` = 2-arg. `IngestParser.parseChunk(policyText:string)` = 1-arg. scripts/ingest.ts:63 클로저 `(text) => parseChunk(text, { llm })`로 deps 바인딩 → 인터페이스 충족. **불일치 아님.**
- spy 검증 정합: pipeline.test.ts:124-140이 1차 적재본을 cache2에 주입 후 spy parser로 2차 실행 → `expect(parser.parseChunk).not.toHaveBeenCalled()`. 실제 `needsReparse`(incremental.ts:68) 해시 일치 시 parseChunk 미호출 경로와 일치. **RUN 2 reparsed=0 실측이 spy 의미를 확증.**

### 2.3 parseChunk → cache → (Phase3 소비)  ✅ 일치, UNKNOWN 보존 확인
- `ParseResult`{qualification:`ParsedQualification`, chunks:`ParseChunks`}(parseChunk.ts:38) = `CachedPolicy.parsed` 타입(cache/types.ts:18)과 동일 import 참조. 저장 형태 = 파싱 형태(변형 없음).
- **UNKNOWN 보존 실증**: data/parsed-sample.json 키 0개 실행 결과 `householdSeparation:"UNKNOWN"`, `incomeCriterion:{kind:"UNKNOWN",raw:null}`, `duplicateParticipation:"UNKNOWN"`, chunks 전 null. Phase 3 eligibility가 소비할 UNKNOWN이 캐시까지 그대로 전달 → 탈락금지 불변식 유지 가능.
- Phase3 명백 누락 점검: 없음. `ParsedIncomeCriterion`이 `kind:'none'|'UNKNOWN'`을 구분 보존(narrowIncome L3/L9). Phase3는 이 구분을 신뢰하면 됨.

### 2.4 cache 인터페이스 (LocalJsonCache 교체 가능성)  ✅ 인터페이스 의존
- `PolicyCache{readAll,getByHash,getById,writeAll}`(cache/types.ts:25). ingest는 `cache:PolicyCache` 타입으로만 받고 `cache.readAll()`(L111)·`cache.writeAll()`(L143)만 사용. 구체 클래스 미참조 → **FirestoreCache 교체 시 ingest/scripts 무변경 보장.**
- 관찰: ingest는 `getByHash/getById` 미사용(자체 prevById Map 구성). 인터페이스에 선언만 됨(Phase3+ 소비자용). 결함 아님.

### 2.5 coverage 입출력  ✅ 일치
- `computeCoverage(ontong:Policy[], mongttang:Policy[])`(coverage.ts:145). scripts는 `result.policies`(CachedPolicy⊂Policy) + 몽땅 fixture를 `normalizePolicy(mongttangToRaw())`로 정규화해 전달 → 입력 타입 정합.
- `CoverageReport` 7필드(totalOntong/totalMongttang/matched/mongttangOnly/manualReviewCandidates/gapRate/generatedAt) = coverage-report.json 실제 출력 7키와 정확 일치. gapRate 분모=totalMongttang(0.667=2/3) 확인.

## 3. 메모성 관찰 (차단 아님 — Phase 후속 후보)

1. **fixture 번들 포함(§8-4) — 현재는 비실현.** ontongClient.ts:1-2가 `test/fixtures/*.json`을 정적 import하나, App.tsx/main.tsx(앱 엔트리)는 data 계층을 import하지 않음. dist 번들에서 fixture 정책 텍스트(`청년월세`/`ON-0001`/`regionCodes` 등) grep 0건 — 트리셰이킹으로 미포함. dist의 유일한 `청년`은 App.tsx placeholder "청년정책 진단". 즉 보고서가 우려한 번들 오염은 **현 빌드에선 발생 안 함**. Phase 5에서 data 계층을 UI에 배선하면 그때 fixture를 비-test 경로/동적 import로 분리 필요(보고서 TODO 유효).
2. **coverage `generatedAt` 타입 설계.** `CoverageReport.generatedAt:null`(순수함수 계약). scripts는 `{...computeCoverage(), generatedAt: now}` 객체 리터럴로 string 주입 — 새 객체 추론이라 tsc 통과(EXIT 0). 런타임 산출은 ISO string. 타입-런타임 형태가 다르나 결함 아님(의도된 분리: 순수함수는 null, 타임스탬프는 scripts 책임). Phase3가 CoverageReport 타입을 직접 소비할 일은 없음(검수 큐 입력은 JSON).

## 4. 게이트 판정
- **전 게이트 PASS + flaky 없음(3회) + 경계 불일치 0건 → Phase 2 = 완료.**
- audit low 1건은 사전 존재(esbuild/vite dev-server, Windows dev 한정)로 신규 취약점 아님 → 차단 불가.
