# Phase 4 통합 QA 보고 — 매칭 두뇌 + 위기 라우팅 (integration-qa 산출)

> 대상: 위기 라우팅 / 임베딩·하이브리드 검색 / 욕구 그래프 traverse.
> 맥락: `_workspace/13_planner_phase4_tasks.md`, `_workspace/14_implementer_phase4_report.md`.
> 판정 원칙: 게이트 1개라도 실패 → Phase "미완". 통과 가정 금지.

## 판정: ❌ 미완 (BLOCKER 1건 — lint 게이트 실패)

- 경계면 교차 비교: **전부 일치(불일치 0)**.
- 위기 통합 정합성(TR-C1, S-1~S-8): **충족**.
- 품질 게이트: **lint만 실패**, 나머지(test/coverage/tsc/build/flaky/키없이/grep) 전부 통과.
- lint 실패 위치는 **테스트 파일의 미사용 파라미터 3건**으로, 런타임/안전 로직과 무관. 단순 수정이나 "lint 오류 0" 게이트는 명시적 blocker이므로 미완으로 판정한다.

---

## 1. 품질 게이트 결과표 (명령별 핵심 라인 인용)

| 게이트 | 명령 | 결과 | 핵심 인용 |
|--------|------|------|-----------|
| 전체 테스트 | `npx vitest run` | ✅ 통과 | `Test Files 15 passed (15)` / `Tests 282 passed (282)` |
| 커버리지 | `npx vitest run --coverage` | ✅ 통과 (exit 0) | `domain | 92.57 | 93.39` (branch 93.39 ≥90), `retrieval | 94.88 | 85.09` (branch 85.09 ≥80) |
| 타입 | `npx tsc -b` | ✅ 통과 | `TSC_EXIT=0` |
| 빌드 | `npm run build` | ✅ 통과 | `✓ built in 2.38s` / `BUILD_EXIT=0` |
| **린트** | `npx eslint .` | ❌ **실패** | `✖ 3 problems (3 errors, 0 warnings)` / `ESLINT_EXIT=1` |
| flaky | `npx vitest run` ×3 | ✅ 동일 | RUN1/2/3 모두 `Tests 282 passed (282)` (변동 0) |
| null바이트/BOM | 신규 11파일 스캔 | ✅ 오염 없음 | `scan done` (NULLBYTE/BOM 출력 없음) |

### 커버리지 상세 (게이트 대상 티어)
```
 domain          |   92.57 |    93.39 |     100 |   95.75   ← branch 93.39 ≥90 OK
  crisisDetect.ts|   89.36 |    86.66 |     100 |   93.18
 domain/graph    |   86.66 |    77.35 |   85.71 |   86.79   ← traverse 개별 77.35(파일별 게이트 아님, 티어 합산 통과)
 retrieval       |   94.88 |    85.09 |     100 |    99.3   ← branch 85.09 ≥80 OK
  rrf.ts         |   78.94 |    72.22 |     100 |     100
```
- 티어 합산 임계(domain≥90, retrieval≥80 stmt/branch) 충족 → coverage 명령 exit 0.
- `domain/graph/traverse.ts` 개별 branch 77.35, `rrf.ts` 72.22는 **파일별 게이트가 아니라 티어 합산 게이트**라 통과. 회귀 위험 아님(Med 이하, defer 가능). 단, traverse는 안전 경로이므로 차기 phase에서 분기 보강 권고(Low).

### 회귀 확인
- 구현 보고는 "Phase 1~3 회귀 0"을 명시. 현재 총 282 테스트가 3회 연속 동일 통과 → 회귀 0 확인.
  (플래너의 "192" 기준은 Phase 3 시점 수치이며, Phase 4 신규 테스트 합산 후 282로 증가. 기존 케이스 실패 0.)

---

## 2. 게이트 실패 상세 (BLOCKER)

`npx eslint .` exit 1 — `@typescript-eslint/no-unused-vars` 3건, **전부 테스트 파일의 mock 파라미터**:

```
test/unit/domain/crisisDetect.test.ts
   70:34  error  '_texts' is defined but never used  @typescript-eslint/no-unused-vars
  150:34  error  '_texts' is defined but never used  @typescript-eslint/no-unused-vars

test/unit/retrieval/hybrid.test.ts
   99:27  error  '_texts' is defined but never used  @typescript-eslint/no-unused-vars
```

해당 코드(예):
```ts
const embedFn = vi.fn(async (_texts: string[]): Promise<number[][]> => { throw new Error('boom'); });
```

### 근본 원인
`eslint.config.js`가 `tseslint.configs.recommended` 기본값만 사용 — `no-unused-vars`에 `argsIgnorePattern: '^_'`가 **설정돼 있지 않다**. 따라서 언더스코어 접두 컨벤션(`_texts`)이 보호받지 못하고 오류로 잡힌다.

### 권고 수정(둘 중 하나, tdd-implementer 담당)
- (A) eslint.config.js에 규칙 추가(권장 — 컨벤션 정합):
  ```js
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
  }
  ```
- (B) 3곳의 `_texts` 파라미터 제거(`async (): Promise<number[][]> => { throw ... }`) — throw 목이라 인자 불필요.
- 어느 쪽이든 안전 로직 변경 없음. 수정 후 `npx eslint .` exit 0 재확인 필요.

---

## 3. 경계면 교차 비교 (shape 동시 대조 — 불일치 0)

### 3-1. traverse ↔ 소비 계약 ✅
- `TraverseResult { crisis, nextChoices, result, alternatives }` — `crisis: CrisisResult`가 **최상위 첫 필드**(traverse.ts:30-38, 정책보다 먼저). Q-6 충족.
- `result: EvaluateResult | null` — `eligibility.ts:43-48`의 `EvaluateResult { now, soon, blocked, review }`와 정확 일치. 위기/후보0 시 `null` 또는 빈 버킷.
- `alternatives: GraphNode[]`, `nextChoices: GraphNode[]` — `childrenOf()`가 `node.children.slice()` 반환, GraphNode[] 일치.

### 3-2. embed ↔ hybridSearch (IndexedDoc 생산/소비 필드) ✅
- 생산(embed.ts:61-67): `{ policyId, text, vector, category, keywords }` 5필드.
- 소비(hybridSearch.ts: isUsableDoc=policyId, cosine=vector, keywordScore=keywords+text, isHardExcluded=category, boostScore=category+keywords).
- 타입(types.ts:18-24) `IndexedDoc`와 양쪽 정확 일치. 누락/잉여 필드 0.
- **비대칭 색인 확인**: embed.buildText(embed.ts:17-31)가 `parsed.chunks.{purpose, eligibility}`만 읽고 **application 미포함**. parsed=null → title/summary 폴백(vector=null). 계약 일치(CM-1~4, H-5).

### 3-3. traverse ↔ hybridSearch ↔ evaluate (연결 무결성) ✅
- traverse가 `hybridSearch` 결과 `SearchHit.policyId`를 `resolvePolicies()`(traverse.ts:77-104)로 `deps.policies`/`deps.index`에서 Policy로 resolve → `engine.evaluate(profile, policies, {now, soonWithinDays})`로 전달. 끊김 없음.
- `evaluate` deps 인자 `{ now, soonWithinDays }`가 `EvaluateDeps`(eligibility.ts:13-17)와 정확 일치.
- **namespace import 실재**: `import * as retrieval from '../../retrieval/hybridSearch'` (traverse.ts:5), `import * as engine from '../eligibility'` (traverse.ts:6). 호출도 `retrieval.hybridSearch`/`engine.evaluate`. → spy 가능(TR-C1 유효).
- resolve 실패(색인에 없는 id) 시 `synthesizePolicy()`로 최소 Policy 합성(income=unknown/recruit=unknown) → evaluate가 보수적으로 review 처리. 끊김 대신 안전 폴백.

### 3-4. crisisDetect ↔ safetyResources ✅
- `crisisHit()`(crisisDetect.ts:42-50)가 `resources: safetyResources()` 채움 + `suppressGeneration: true`.
- `safetyResources()`(safetyResources.ts:21-23)가 SAFETY_RESOURCES 방어복제 → `[{109}, {1577-0199}]` 2건.
- crisis=true 경로(regex/semantic) 모두 crisisHit 경유 → **resources 비어있지 않음 보장**. `safe()`(비위기)만 빈 배열.
- phone 값 `'109'`, `'1577-0199'` 정확(CR-25 충족).

### 3-5. GraphNode 확장 ↔ mentalHealth 데이터 / 순환 import ✅
- `GraphNode`(types.ts:100-114)에 `boostCategories?: string[]`, `boostKeywords?: string[]`, `kind: 'entry'|'branch'|'leaf'|'safety'` 선언.
- `mentalHealth.ts` 노드들이 동일 필드 사용(burnout/isolation/screening: boostCategories+boostKeywords, safety: kind='safety'). 타입-데이터 일치.
- **순환 import 없음**:
  - `graph/types.ts` → `export type { GraphNode } from '../types'` (단방향 재노출).
  - `domain/types.ts`는 graph를 import하지 않음(rules/programRules 타입만 import).
  - `retrieval/**`는 domain을 import하지 않음(data/* 만). crisisDetect는 retrieval/types에서 **타입만** import.
  - 의존 방향: domain → retrieval(타입+함수), graph/types → domain/types. 일방향. 사이클 0.

---

## 4. 위기 통합 정합성 점검 (안전 — 최중요)

### TR-C1 위기 우선 통합 (spy 유효성) ✅
- `mentalHealth.graph.test.ts:156-168`: `vi.spyOn(hybridMod,'hybridSearch')` + `vi.spyOn(eligibilityMod,'evaluate')` 설치 후 query="죽고 싶다" traverse.
- 단언: `crisis.crisis===true`, `suppressGeneration===true`, `resources` 2건, `result===null`, **`hybridSpy/evalSpy` not.toHaveBeenCalled**.
- traverse.ts:145-147이 `if (crisis.crisis) return crisisResult(...)`로 검색/평가 이전에 즉시 반환 → 데이터로 성립.
- **vacuous(공허) 아님 확인**: TR-C4(test:195-203)가 동일 query "더는 못 버티겠어"를 semantic embed 미제공으로 돌리면 crisis=false→`result not.toBeNull()`. 즉 비위기 경로에서 hybridSearch/evaluate가 **실제로 도달 가능**함을 입증 → spy 단언이 의미 있음(TR-C1).

### degrade 안전 (H-5/TR-4, S-4) ✅
- embed=undefined여도 hybridSearch가 키워드 arm 항상 실행(hybridSearch.ts:144-156) → 결과 반환(빈 X).
- TR-C2(test:170-181): embed=undefined로도 "죽고 싶다" 1층 정규식이 crisis=true, hybridSearch 미호출. 임베딩 꺼져도 위기 정상.
- detectCrisisRegex는 deps 무관 동기 동작(crisisDetect.ts:56-67) → S-1 충족.

### S-1~S-8 매핑 충족
S-1(1층 deps무관), S-2(위기 우선 검색·evaluate 미호출), S-3(거짓음성0 경계=위기), S-4(degrade), S-5(2층 보강), S-6(blocked 비노출=alternatives, traverse.ts:199-207), S-7(category=null 하드제외 금지, hybridSearch.ts:75), S-8(throw-free 전구간 try/catch) 전부 코드·테스트로 확인.

---

## 5. 키 없이 통과 / 실 호출 부재 (grep) ✅

- **키 없이 통과**: GEMINI_API_KEY/ONTONG_API_KEY 미설정 상태로 `npx vitest run` 282/282 통과(현 환경이 이미 미설정). 고정벡터 fixture·disabled 폴백.
- **domain 실 clock 미사용**: `new Date()`/`Date.now()` grep — 매칭 4건 전부 **주석**(normalizePolicy/recruitStatus/parse/recruit의 "쓰지 않는다" 설명문). 실제 호출 0. clock은 `deps.now` 주입.
- **retrieval 실 fetch/Gemini 부재**: `fetch|generativelanguage|GoogleGenerative|gemini|axios|http` grep — 매칭 2건 전부 **주석**("Phase 6에서 작성"). 실 네트워크/SDK 코드 0. EmbeddingProvider 주입만.

---

## 6. 미해결/인계 (Med 이하 — defer 가능, blocker 아님)

| # | 항목 | 등급 | 비고 |
|---|------|------|------|
| D-3 | 기대 정책명 실캐시 존재(서울 청년 마음건강 등) | Med | 현재 전용 fixture로만 검증. 실데이터 매칭은 데이터 티어 확정 필요. soft only라 무해. |
| 세부 부스트 카테고리 실매핑 | 세부 라벨('상담'/'심리치료' 등) 실 category 부재 | Med | soft only 운영으로 미매칭 시 가산 0(무해). Phase 6 매핑. |
| traverse/rrf 분기 커버 | traverse 77.35/rrf 72.22 (파일별) | Low | 티어 합산 게이트 통과. 안전경로라 차기 분기 보강 권고. |

---

## 7. tdd-implementer 액션 (수신 대상)

1. **[BLOCKER] lint 게이트 복구**: `eslint.config.js`에 `no-unused-vars` `argsIgnorePattern: '^_'` 추가(권장) 또는 3곳 `_texts` 파라미터 제거. 수정 후 `npx eslint .` exit 0 재확인.
2. (Low) traverse/rrf 분기 테스트 보강은 차기 phase로 defer 가능.

수정 1건 완료 시 전 게이트 통과 예상(다른 게이트는 이미 그린, lint만 빨강).

---

## 8. 리더(오케스트레이터) 보고 요약

- Phase 4 **미완** — 유일 blocker는 **lint 3건(테스트 파일 미사용 파라미터)**. 안전·경계면·런타임 결함 아님.
- 경계면 교차 비교 5축 전부 일치, 위기 우선 통합(TR-C1, spy 비공허) 정합, degrade·throw-free·키없이 통과·실 I/O 부재 모두 확인.
- test/coverage/tsc/build/flaky 전부 그린(282×3 동일, domain 93.39/retrieval 85.09 branch).
- lint 수정(eslint config 1줄 또는 파라미터 3곳) 반영 후 재게이트 시 통과 전망.
