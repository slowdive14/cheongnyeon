# Phase 4 구현 보고 — 매칭 두뇌(임베딩·하이브리드 검색 + 욕구 그래프 + 위기 라우팅) (tdd-implementer 산출)

## 결과 요약
- `npx vitest run`: **15 파일 / 282 테스트 전부 통과** (Phase 1~3 회귀 0).
- `npx tsc -b`: exit 0.
- 커버리지: domain 분기 **93.39 ≥90**, retrieval 분기 **85.09 ≥80** (게이트 exit 0).
- **키 없이(GEMINI/ONTONG 미설정) 빌드·전체 테스트 통과** 확인. 테스트 실 API 호출 0(고정벡터 fixture·disabled 폴백).

## RED→GREEN 증거
1. 위기 RED: import 미해결 → no tests. GREEN: crisisDetect+safetyResources+crisis/config → 48 passed.
2. 검색 3종 RED: 3 failed no tests. GREEN: retrieval/{types,config,rrf,embed,hybridSearch} → 27 passed.
3. traverse RED: 미해결. GREEN: graph/traverse(+graph/types·domains/mentalHealth) → 12 passed.

## 통과 케이스 (전 표 녹색)
- 위기 CR-1~26: 1층 직접어(embed 없이/throw에도 위기 보존·2층 미호출), Q-1 경계(CR-11~13 비위기/CR-14·15 throw-free), 2층 임계(=0.82 위기·0.819 비위기), shape(resources 2건+suppress).
- 검색 H-1~12, 비대칭 CM-1~7(application 색인 제외), 스코핑 SC-1~7(SC-4 category=null 하드제외 안됨).
- 그래프 TR-1~6 + TR-C1~4(위기 시 spy로 hybridSearch·evaluate 호출 안됨 검증, vacuous 아님 sanity 포함), 막힌경로 BP-1·4.

## 신규 파일
소스 11: `src/domain/{crisisDetect,safetyResources}.ts`, `src/domain/crisis/config.ts`, `src/domain/graph/{types,traverse}.ts`, `src/domain/graph/domains/mentalHealth.ts`, `src/retrieval/{types,config,rrf,embed,hybridSearch}.ts`.
테스트 5: `test/unit/domain/crisisDetect.test.ts`, `test/unit/retrieval/{hybrid,conceptMatch,scoping}.test.ts`, `test/integration/funnel/mentalHealth.graph.test.ts`.
수정: `src/domain/types.ts`(GraphNode +boostCategories/boostKeywords), `vitest.config.ts`(retrieval 커버리지 ≥80).

## 판단 지점
### category 실측 (Q-5) ★
`normalizePolicy`는 `r.category` 보존. 실 fixture 값은 거친 도메인 라벨뿐: **"마음건강","일자리","주거"**. 명세 예시의 세부 라벨('심리','정신건강','상담','심리치료')은 실데이터 부재.
→ 결정(재현율 우선): **하드필터는 거친 "마음건강"에만** 적용, 세부 갈래는 **소프트 부스트로만**. category=null은 하드 제외 안 함(SC-4, isHardExcluded가 null/빈 명시 통과). 세부 부스트는 매핑 확정 전 soft only라 미매칭 시 무해(가산 0).

### 위기 정규식 패턴 (`src/domain/crisis/config.ts`)
글자 사이 `\s*`로 공백·어미 변형 흡수. 위기: `죽고싶`,`죽어버리고싶`,`사라지(고/져)`,`살고싶지않`,`자살`,`자해`,`목숨을끊`,`극단적선택`,`유서`,`끝내(고/버리)`. Q-1: "X 죽겠다" 관용구는 어느 위기 패턴에도 매칭 안 됨 → 자연 비위기. "죽인다/죽여"(감탄)·"죽은 X"도 비매칭. IDIOM_HINTS는 방어 문서이며 명확 위기 매칭을 억제하지 않음. SEMANTIC_THRESHOLD=0.82, `≥`가 위기(거짓음성0 편향).

### 안전 불변식 충족
S-1 1층 deps무관(CR-9/10,TR-C2) / S-2 위기 우선·검색·evaluate 미호출(TR-C1 spy) / S-3 거짓음성0(CR-22) / S-4 degrade 안전유지(TR-C2/4,H-5) / S-5 2층 보강(CR-20/21) / S-6 blocked 비노출(BP-1/4) / S-7 불명 category 하드제외 금지(SC-4) / S-8 throw-free.
traverse 순서: detectCrisis→(위기 즉시반환 result=null)→hybridSearch(hard/soft)→resolvePolicies→evaluate→blocked만이면 alternatives. hybridSearch/evaluate를 namespace 호출(`retrieval.hybridSearch`/`engine.evaluate`)해 spy 유효.

## REFACTOR(4.11)
위기 앵커·임계·정규식→crisis/config.ts. RRF k·boostWeight·키워드임계→retrieval/config.ts. SAFETY_RESOURCES 1곳. 그래프 스키마→graph/types.ts. retrieval은 도메인 모름(import는 data/similarity·data/cache/types뿐). 신규 의존성 0.

## 남은 TODO/인계
- 실 Gemini 임베딩·임계 튜닝·crisisAnchors 실벡터 → Phase 6 defer.
- 세부 부스트 카테고리 실데이터 매핑·기대 정책명 실캐시 존재(D-3) → QA/데이터 확정(현재 soft only·전용 fixture라 무해).
- safety-auditor 집중 검증 권고: Q-1 경계(config 패턴 vs IDIOM), TR-C1 위기 우선 통합.
