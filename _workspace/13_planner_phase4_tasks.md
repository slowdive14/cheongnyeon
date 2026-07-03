# Phase 4 — 매칭 두뇌: 임베딩·하이브리드 검색 + 욕구 그래프 (+ 위기 라우팅) · TDD 작업 명세 (phase-planner 산출)

> SSOT: `docs/plans/PLAN_youth-policy-diagnosis-mvp.md` L209–239. Phase 1·2·3 완료 전제.
> **이 프로젝트 최대 안전 리스크 Phase.** 위기 청년 라우팅이 모든 검색·매칭·생성보다 우선. 거짓음성(위기 놓침) 절대 불가, 거짓양성 허용. Phase 3 인수인계(`11_safety_phase3.md §7`): blocked 비노출(대안 갈래), 전 카드 고지+원문링크+신선도 → Test 4.6 책임.

---

## ★ 리더 결정 (2026-06-24, 착수 전 확정)
- **Q-1 (관용구 위기 처리) — planner 권고 미세 수정:** "X-아/어/해 죽겠다"식 **강조 관용구**(배고파 죽겠어/과제 때문에 죽겠다/더워 죽겠다)는 **비위기**. "죽고 싶다/죽어버리고 싶다/사라지고 싶다/살고 싶지 않다" 등 **자기소멸 의지·자해 표현은 위기**. **진짜 애매하면 위기 편향.** 사유: 배너 피로(흔한 일상어마다 위기 배너→사용자 둔감화→진짜 위기 무시)도 안전 문제. 정밀도가 곧 안전. → CR-11/CR-12 테스트를 이 결정으로 고정. **safety-auditor가 이 경계 집중 검증.**
- **Q-2 승인:** `GraphNode`에 `boostCategories?: string[]`, `boostKeywords?: string[]` 추가(세부 갈래 소프트 부스트).
- **Q-3 승인:** `src/retrieval/**`를 vitest coverage.include에 추가, **임계 ≥80**(data 티어 수준; degrade 분기 多로 90 과함).
- **Q-4 승인:** Phase 4는 고정벡터 fixture·disabled 폴백만. 실 Gemini 임베딩·임계값 튜닝은 Phase 6 defer.
- **Q-5 승인:** 구현자가 `normalizePolicy` 출력으로 `Policy.category` 실제 값 실측. 불확실하면 **하드필터 보류·소프트 부스트만**(재현율 우선, 불명≠무관).
- **Q-6 승인:** `TraverseResult.crisis`를 최상위 필드로(정책보다 먼저). UI(Phase 5)가 위기 우선 소비.

---

## 0. 기존 계약 (근거)
- `GraphNode`(types.ts): `{id,label,concept,allowedCategories?,keywords?,children?,kind?}` 이미 선언, `kind='safety'` 존재 → 안전노드 자리 마련됨. + Q-2로 `boostCategories?`,`boostKeywords?` 추가.
- `evaluate(profile,policies,{now})→{now,soon,blocked,review}` 순수·throw-free. traverse가 검색 후보를 그대로 넘겨 자격 위임(검색은 자격 모름, 관련성만).
- `ParseResult.chunks{purpose,eligibility,application}`: 색인=purpose+eligibility, **application 제외**.
- `CachedPolicy = Policy & {fetchedAt,updatedAt,contentHash,parsed}`. parsed=null이면 키워드 폴백.
- `geminiClient.ts` disabled 폴백 패턴 → `EmbeddingProvider`도 동일(키 없으면 미주입/disabled).
- `similarity.ts`(Jaccard+Levenshtein, 무의존) 재사용 — 신규 의존성 금지.

확인 필요: D-1 category 값 도메인(Q-5로 처리), D-3 기대 정책명 실캐시 존재(전용 fixture로 검증, 실데이터는 QA). 추정 금지.

## 1. 작업 순서 (위기 먼저 — 안전 최우선)
1. 🔴 `test/unit/domain/crisisDetect.test.ts` → 2. 🟢 `src/domain/crisisDetect.ts` + `src/domain/safetyResources.ts`
3. 🔴 `test/unit/retrieval/hybrid.test.ts` → 4. 🔴 `conceptMatch.test.ts` → 5. 🔴 `scoping.test.ts`
6. 🟢 `src/retrieval/{embed,hybridSearch,rrf,types}.ts`
7. 🟢 `src/domain/graph/domains/mentalHealth.ts` + `src/domain/graph/types.ts`
8. 🔴 `test/integration/funnel/mentalHealth.graph.test.ts` → 9. 🔴 막힌경로 → 10. 🟢 `src/domain/graph/traverse.ts`
11. 🔵 REFACTOR(영역 무관 분리, 위기 앵커·임계값 분리)

위기 먼저 이유: traverse 안에서 위기를 "검색 후"에 두면 검색·자격 버그가 위기 라우팅을 막을 수 있음. 위기는 모든 파이프라인 최앞단 guard, 독립 테스트 가능해야. 1층은 무의존이라 1번으로 고정.

---

## 🔴 안전 — Test 4.5 위기 2층 감지

### 시그니처
```ts
// src/domain/crisisDetect.ts
export interface CrisisResult {
  crisis: boolean;
  layer: 'regex' | 'semantic' | 'none';
  matched?: string;
  resources: SafetyResource[];       // crisis=true면 항상 채움
  suppressGeneration: boolean;       // 위기 시 AI 생성 차단
}
export interface CrisisDetectDeps {
  embed?: EmbeddingProvider;         // 없으면 1층만(키 없이 안전)
  semanticThreshold?: number;        // 기본 0.82, REFACTOR서 분리
  crisisAnchors?: number[][];        // 맥락 위기 앵커(테스트=고정벡터)
}
export async function detectCrisis(text: unknown, deps?: CrisisDetectDeps): Promise<CrisisResult>;
export function detectCrisisRegex(text: unknown): CrisisResult;  // 1층 단독·동기·완전 무의존
// 불변식: 1)1층 정규식 deps무관 항상작동 2)1층 hit이면 2층 호출 없이 즉시반환 3)crisis=true면 resources비어선안됨+suppress=true 4)embed throw→2층만 무력, 1층 보존
```
```ts
// src/domain/safetyResources.ts
export interface SafetyResource { label:string; phone:string; available:string; note?:string; }
export const SAFETY_RESOURCES: SafetyResource[] = [
  { label:'자살예방상담전화', phone:'109', available:'24시간 365일' },
  { label:'정신건강위기상담전화', phone:'1577-0199', available:'24시간 365일' },
];
```

### 3-A. 1층 직접 위기어 — 즉시 하드필터 (API/키/네트워크 무관). detectCrisisRegex와 detectCrisis(deps없이) 양쪽 검증.
| # | 입력 | 기대 |
|---|---|---|
| CR-1 | "죽고 싶다" | crisis=true, regex, suppress=true, resources 2건 |
| CR-2 | "죽고싶어요"(공백·어미 변형) | crisis=true |
| CR-3 | "자살하고 싶어"/"자살할까" | crisis=true |
| CR-4 | "죽어버리고 싶다"/"사라지고 싶어" | crisis=true |
| CR-5 | "목숨을 끊고 싶다"/"극단적 선택" | crisis=true |
| CR-6 | "자해했어요"/"자해하고 싶다" | crisis=true |
| CR-7 | "더 이상 살고 싶지 않아" | crisis=true |
| CR-8 | "유서를 썼어"/"다 끝내고 싶다" | crisis=true |
| CR-9 | `detectCrisis("죽고 싶다")` deps 전혀 없이 | crisis=true, regex ★embed 없이 1층 작동 |
| CR-10 | CR-1을 embed가 throw하는 deps로 | crisis=true, regex, 2층 호출 안됨 ★2층 장애가 1층 못막음 |

### 3-B. 1층 false positive 경계 (Q-1 결정 반영)
| # | 입력 | 기대 |
|---|---|---|
| CR-11 | "과제 때문에 죽겠다"/"배고파 죽겠어" | **crisis=false** (X-아/어/해 죽겠다 강조 관용구) — Q-1 결정 |
| CR-12 | "이 게임 죽인다"/"맛이 죽여줘요" | crisis=false (감탄 관용구) |
| CR-13 | "죽은 세포"/"죽은 식물" | crisis=false (대상 자기 아님; 정규식 단순화로 보류 가능) |
| CR-14 | "" 빈문자열 | crisis=false, none, throw 없음 |
| CR-15 | null/undefined/숫자 | crisis=false, throw 없음 |
> Q-1: "죽겠다" 강조 관용구 제외, "죽고 싶/죽어버리/사라지고 싶/살고 싶지 않/자살/자해/유서" 등 의지·자해 표현 유지. 애매하면 위기 편향.

### 3-C. 2층 의미 임계값 (제공자 있을 때만 보강)
| # | 입력 | deps | 기대 |
|---|---|---|---|
| CR-16 | "더는 못 버티겠어" | embed 유사도 0.90, th 0.82 | crisis=true, semantic, suppress=true |
| CR-17 | "이제 다 포기하고 싶어" | 0.85 | crisis=true, semantic |
| CR-18 | "짐만 되는 것 같아" | 0.84 | crisis=true, semantic |
| CR-19 | "오늘 좀 우울해" | 0.40 | crisis=false (일반 우울은 검색 라우팅) |
| CR-20 | "더는 못 버티겠어" | embed=undefined(키없음) | crisis=false, none ★2층 꺼지면 맥락어 못잡음=의도된 degrade(직접어는 1층 잡음) |
| CR-21 | "더는 못 버티겠어" | embed throw | crisis=false, none, throw없음(2층 실패 흡수) |
| CR-22 | 유사도 정확히 0.82(=th) | crisis=true (≥임계 위기, 보수) |
| CR-23 | 유사도 0.819(<th) | crisis=false |

### 3-D. 위기 결과 shape — 안전자원 우선 보장
| # | 시나리오 | 기대 |
|---|---|---|
| CR-24 | crisis=true 모든 결과 | resources.length===2, suppress===true |
| CR-25 | phone 검증 | '109'와 '1577-0199' 둘다 존재 |
| CR-26 | traverse 위기 입력(통합) | crisis가 candidates보다 상위 필드, 위기 시 candidates 비움 → §traverse TR-C |

---

## 검색·그래프 시그니처
```ts
// src/retrieval/types.ts
export interface EmbeddingProvider { embed(texts: string[]): Promise<number[][]>; }  // throw 가능→흡수
export interface IndexedDoc { policyId:string; text:string; vector:number[]|null; category:string|null; keywords?:string[]; }
export interface SearchHit { policyId:string; score:number; arms?:{embedRank?:number;keywordRank?:number}; }
export interface HybridSearchOptions { topK:number; hardCategories?:string[]; boostCategories?:string[]; boostKeywords?:string[]; boostWeight?:number; rrfK?:number; }
export async function hybridSearch(query:string, index:IndexedDoc[], deps:{embed?:EmbeddingProvider}, options:HybridSearchOptions): Promise<SearchHit[]>;
export async function embed(policies:CachedPolicy[], deps:{embed?:EmbeddingProvider}): Promise<IndexedDoc[]>;
// embed: purpose+eligibility 결합(application 제외), parsed=null→title/summary 폴백(vector=null), provider throw/없음→vector=null(키워드 색인은 계속)
// rrf.ts: rrfFuse(rankedLists:string[][], k=60) score=Σ 1/(k+rank), 한 arm에만 등장한 문서도 합집합(키워드 단독 보존)
```
임베딩 fixture: EmbeddingProvider mock 주입(텍스트→고정벡터 맵). 패러프레이즈는 상호 코사인 ≥0.8, 고유명사("청년수당")는 임베딩 낮고 키워드 정확매칭으로. 저차원(4~8) 충분. 코사인은 similarity 인접 소형 유틸(무의존).

### Test 4.1 하이브리드 검색 + degrade
H-1 "힘들어요"→심리상담 top-k / H-2 "의욕이 안 나요/멍해요/번아웃" 셋다 동일정책 top-k(Recall@k) / H-3 "청년수당"→키워드 top상위 / H-4 RRF 양arm 등장 B 최상위+합집합 / **H-5 embed=undefined→키워드 단독 결과(빈 X) ★degrade** / H-6 embed throw→graceful / H-7 topK=3→정확3건 / H-8 topK=0→빈배열 / H-9 빈query→빈/무매칭 throw없음 / H-10 index=[]→빈 / H-11 vector=null 섞임→키워드로 후보가능 / H-12 깨진doc→throw없이 스킵.

### Test 4.2 비대칭 + 개념매칭
CM-1 application 어휘로 검색→**매칭 안됨**(신청방법 색인 제외) / CM-2 purpose 어휘→매칭 / CM-3 eligibility 어휘→매칭 / CM-4 embed가 text 만들때 application 문자열 미포함 단언 / CM-5 노드 concept로 검색→관련정책 set(exact태그 아님) / CM-6 parsed=null→폴백 throw없음 / CM-7 부분결손 방어.

### Test 4.3 노드 스코핑 (하드=제외, 소프트=가산만)
SC-1 "고립·은둔" hardCategories→타도메인 제외 / **SC-2 boostCategories→특화정책 가산하되 일반상담도 결과 포함(제외X) ★재현율보호** / SC-3 일반상담 상위 독식 안함 / **SC-4 category=null→하드 제외 안됨 ★불명≠무관 Phase3 일관** / SC-5 소프트 단독→제외없음 / SC-6 hardCategories=[]→필터없음 / SC-7 하드매칭 0건→빈배열(traverse는 대안갈래로).

---

## traverse + Test 4.4/4.6
```ts
// src/domain/graph/traverse.ts
export interface TraverseState { nodeId:string; query?:string; profile:UserProfile; }
export interface TraverseResult {
  crisis: CrisisResult;          // ★최상위·정책보다 먼저
  nextChoices: GraphNode[];
  result: EvaluateResult | null; // 위기 시 비움
  alternatives: GraphNode[];     // blocked만일 때 대안 갈래(빨강 직출력 금지)
}
export interface TraverseDeps { embed?:EmbeddingProvider; crisisDeps?:CrisisDetectDeps; now:Date; index:IndexedDoc[]; soonWithinDays?:number; }
export async function traverse(graph:GraphNode, state:TraverseState, deps:TraverseDeps): Promise<TraverseResult>;
// 순서(★안전): 1)detectCrisis(query)—위기면 즉시반환(검색·evaluate·AI 안함, candidates비움) 2)노드스코프 hybridSearch(거친=hard,세부=soft) 3)후보→정책조회→evaluate 4)now/soon→result, blocked만이고 now/soon/review없으면 alternatives
```

### Test 4.4 순회(integration, 전용 fixture, 고정 clock)
TR-1 경로A "지치고 무기력"→전문심리상담→(서울 청년 마음건강 지원사업, 전국민 마음투자 바우처) 포함 / TR-2 경로B "고립·은둔"→(이음센터,관계망), 일반상담 독식X / TR-3 경로C "검사"→자가검진·정신건강복지센터, always→now / TR-4 embed=undefined→키워드로 후보(빈X) ★ / TR-5 nextChoices=children / TR-6 깨진그래프→throw없이 빈.

### ★ TR-크라이시스 (위기 우선 통합 — 최중요)
| # | 입력 | 기대 |
|---|---|---|
| TR-C1 | query="죽고 싶다"(임의 노드) | crisis.crisis=true, result=null, **hybridSearch·evaluate 호출 안됨**, resources 2건, suppress=true ★★★ |
| TR-C2 | TR-C1 + embed=undefined | 동일(1층 정규식) ★임베딩 꺼져도 위기 정상 |
| TR-C3 | query="더는 못 버티겠어" + 의미 embed 제공 | crisis=true(semantic), result 비움 |
| TR-C4 | query="더는 못 버티겠어" + 의미 embed 미제공 | crisis=false→일반검색(우울 정책), degrade 한계 명시(의도) |

### Test 4.6 막힌 경로→대안 (Phase3 인수인계)
BP-1 후보 전부 blocked→result에 blocked 직노출 금지, alternatives 채움 ★ / BP-2 now/soon+일부blocked→정상결과 우선 / BP-3 전부review→노출OK(빨강아님) / BP-4 후보0건→alternatives, 빈빨강 금지.

---

## 그래프 데이터(4.8) mentalHealth.ts
노드 예: `{id:'mh.burnout', label:'지치고 무기력', concept:'번아웃·의욕저하·만성피로·무기력', allowedCategories:['심리','정신건강'], boostCategories:['상담','심리치료'], keywords:['번아웃','무기력','의욕','소진'], kind:'branch', children:[...]}`. 필요 노드: 입구(entry), 지치고무기력→전문심리상담(A), 고립은둔→이음센터·관계망(B), 검사→자가검진·정신건강복지센터(C, always), **안전자원 노드(kind='safety', SAFETY_RESOURCES 참조)**.

## REFACTOR(4.11)
그래프 스키마 `graph/types.ts` 분리, retrieval은 도메인 모름(옵션 주입), 위기 앵커·임계값·정규식 패턴 별도 설정파일(`crisis/config.ts`), SAFETY_RESOURCES/RRF k/boostWeight/임계값 각 1곳.

---

## 안전 불변식 (safety-auditor 사전 공유 — 코드·테스트·런타임 3중)
| # | 불변식 | 검증 |
|---|---|---|
| S-1 | 1층 정규식 deps무관 항상작동 | CR-9/10/TR-C2 |
| S-2 | 위기 시 정책·AI보다 안전 우선 | TR-C1(검색·evaluate 호출안됨, result비움, suppress) |
| S-3 | 거짓음성0, 거짓양성 허용 | CR-22(경계=위기), CR-11(Q-1 경계). 임계 보수 |
| S-4 | degrade가 안전 안 떨어뜨림 | TR-C2/TR-4/H-5 |
| S-5 | 2층은 1층 보강일 뿐 | CR-20/21 |
| S-6 | blocked 비노출(대안) | BP-1/4 |
| S-7 | 불명 category 하드 제외 금지 | SC-4 |
| S-8 | throw-free 전구간 | CR-14/15, H-8~12, TR-6, BP-4 |
> ★Q-1 경계(관용구 비위기 vs 의지표현 위기)는 배너 피로 안전 trade-off — safety-auditor 집중 검증 항목.

## DoD
위기(CR-1~26)/검색(H)/비대칭(CM)/스코핑(SC)/그래프(TR)/막힌경로(BP) 전 표 녹색. throw-free. tsc 0. **키 없이(GEMINI_API_KEY 미설정) 빌드·전체 테스트 통과**(고정벡터·disabled 폴백). 회귀 0(Phase1~3 유지). retrieval 커버리지 ≥80, domain ≥90 유지.

## 인계 메모
순서 엄수(위기 먼저 GREEN). DI(embed/앵커/clock 주입, 실 Gemini 호출 금지=Phase6). 신규 의존성 금지(similarity 재사용, RRF·정규식 자체구현). 하드필터는 거친 도메인만·category=null 제외금지. blocked 비노출. EvaluatedPolicy.policy가 sourceUrl/regionText/income.raw 보존(고지 근거 준비됨).
