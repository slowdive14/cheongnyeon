# Phase 6 작업 명세 — Gemini 레이어 (자유입력 해석 + 설명 + degrade + 위기 가드)

> 마지막·안전 직결 Phase. calibration 완화 미적용(안전 바닥선 최대). SSOT: PLAN L271-291, Arch L41-60, 게이트 L101-117.

## 리더 결정 (planner 확인필요 3건 해소, 2026-06-25)
1. **SDK = `@google/genai`(신형)** 채택. 구형 `@google/generative-ai`(plan L73) 폐기. 실 호출은 geminiClient.ts 내부 **동적 import**로 격리 → 키 없는 test/build/tsc 무조건 그린. 키 미설정 시 `createDisabledLlmClient()` 계약 불변.
2. **M1 푸터 = 결과 화면 한정**(plan 명시).
3. **layer-2 임계 0.82 기본 유지**, 실 앵커 거짓음성 시 **하향만**(거짓양성 허용), CA-9 경계 케이스 갱신.

## 인프라 실측 (연결만, 새로 만들지 말 것)
- `geminiClient.ts`: `createGeminiClient({apiKey?,model?}):LlmClient` / `createDisabledLlmClient()`. 둘 다 현재 disabled. Phase 6에 실 SDK 동적 import 연결.
- `parseChunk.ts`: `LlmClient{ generateStructured(prompt,schema?):Promise<unknown> }` — classify/explain이 이 계약 소비.
- `crisisDetect.ts`: `detectCrisis(text,deps?)` async + `detectCrisisRegex(text)` 동기. `CrisisDetectDeps{embed?,semanticThreshold?,crisisAnchors?}`. layer-2는 crisisAnchors 미주입이라 잠듦 → **Phase 6가 실주입+활성화**. `CrisisResult.suppressGeneration` 소비 필수.
- `crisis/config.ts`: SEMANTIC_THRESHOLD=0.82, CRISIS_PATTERNS(A~I).
- `retrieval/types.ts`: `EmbeddingProvider{embed(texts):Promise<number[][]>}`. `retrieval/embed.ts`: provider 없으면 vector=null degrade.
- `traverse.ts`: 위기 시 result=null+suppress(L145). explain은 이 crisis 소비.
- `ui/funnel/`: 자유입력 박스 없음(버튼 전용) → Phase 6가 추가+classify+실시간 layer-1 배선. `useFunnel` query=currentNode.concept.
- package.json: `@google/genai` 미설치(추가 필요, 동적 import 격리). `test/unit/llm/` 미존재(신규).
- **App.tsx는 crisisDeps 미주입** — layer-2 production 활성화하려면 App→traverse deps 체인에 crisisAnchors 배선 필요.

## 모듈 (신규 7 + geminiClient 보강)
- **M-A `src/llm/classify.ts`**: `classifyDomain(text, {llm?,keywords?}):Promise<{domain:string|null, source:'keyword'|'llm'|'none', confidence?}>`. 키워드 우선→LLM fallback→degrade(null). 화이트리스트 외 영역 거부. throw-free.
- **M-B `src/llm/explain.ts`**: `explainMatch(policy:GroundingRecord, {llm?,crisis?}):Promise<{text:string|null, grounded:boolean, source:'llm'|'fallback'}>`. 정책 record 화이트리스트 필드만 주입(title/summary/category/ageMin/ageMax/regionText/recruit/sourceUrl). suppressGeneration=true→호출0·text=null. 후처리 환각검증(입력 외 URL/숫자/정책명/자격단정 거부→fallback). 단정 회피.
- **M-C `src/llm/crisisGuard.ts`**: classify/explain **선행** 위기검사. 위기면 둘 다 미실행. `runFreeInput(text,deps):{crisis, classify?}`로 순서 코드강제 권고. detectCrisis 위임.
- **M-D geminiClient 보강**: 실 SDK 동적 import, responseSchema, 그라운딩. 키 없으면 disabled 불변. 테스트는 실 네트워크 0.
- **M-E `src/llm/crisisAnchors.ts`**: `buildCrisisAnchors({embed?}):Promise<number[][]>`. provider 없음/throw→`[]`(layer-2 잠금, layer-1 불변).
- **M-F `src/ui/funnel/FreeTextInput.tsx`**: 자유입력+디바운스(~300ms)+실시간 동기 layer-1(키무관)+classify 배선.
- **M-G `src/ui/funnel/SettingsModal.tsx` + `src/llm/apiKeyStore.ts`**: localStorage 키 저장/삭제, type=password, 키 비노출. 키 없으면 LLM off.
- **M-H `src/ui/funnel/CrisisFooter.tsx`**: 비위기 **결과 화면** 하단 상시 109·1577-0199 상담 링크.

## TDD 순서 (안전 가드 먼저)
RED-1 crisisGuard → RED-2 explain 그라운딩 → RED-3 classify → RED-4 layer-2 활성 → RED-5 M1 푸터 → RED-6 자유입력 UI 통합 → GREEN(G-1~5) → REFACTOR(프롬프트 SSOT·캐싱·앵커 통합).

### RED-1 / Test 6.3 `test/unit/llm/crisisGuard.test.ts`
CG-1 "죽고싶어요"→crisis=true, classify·explain spy 호출0. CG-2 "손목을 그었어"→crisis,suppress. CG-3 위기어 explain.text=null(LLM 미호출). CG-4 "요즘 너무 힘들어요"→crisis=false, classify 실행. CG-5 deps없이 "자살"→crisis(키무관). CG-6 "배고파 죽겠어"→비위기(관용구 회귀). CG-7 null/""/숫자/객체→throw없음. CG-8 llm reject해도 위기 불변.

### RED-2 / Test 6.2 `test/unit/llm/explain.test.ts`
EX-1 prompt에 title/summary/sourceUrl 주입, grounded=true. EX-2 입력외 URL 반환→거부·fallback. EX-3 입력외 숫자"300만원"→거부. EX-4 다른 정책명→거부. EX-5 자격단정("자격됩니다")→제거/거부(LLM 판정0). EX-6 "확실히 받을수있어요"→단정완화. EX-7 suppress=true→호출0·null. EX-8 llm없음→fallback. EX-9 reject/타임아웃→fallback. EX-10 policy=null/필드누락→throw없음. EX-11 화이트리스트 외 필드 프롬프트 미포함.

### RED-3 / Test 6.1 `test/unit/llm/classify.test.ts`
CL-1 "우울해요"/"번아웃"/"힘들어요"→mentalHealth,keyword,LLM미호출. CL-2 모호+mock→source=llm. CL-3 모호+llm없음→null/degrade. CL-4 llm throw→null. CL-5 화이트리스트 외 영역→null. CL-6 깨진입력→null. CL-7 디바운스 취소 안전. CL-8 위기입력은 classify 진입 전 차단.

### RED-4 `test/unit/llm/crisisAnchors.test.ts` + crisisDetect.test.ts 보강
CA-1 provider있음→앵커>0. CA-2 없음→[]. CA-3 throw→[]. CA-4 완곡 "더는 아무 의미가 없는 것 같아"(정규식 미스)+앵커≥임계→crisis,layer=semantic. CA-5 맥락 위기→crisis. CA-6 임계근처 위기편향. CA-7 직접위기어+embed→layer=regex(2층 호출0). CA-8 layer-1 전체 회귀 여전히 regex(1층우선). CA-9 sim 0.81비위기/0.82·0.83위기 경계.

### RED-5 / Task 6.7=M1 `test/unit/ui/CrisisFooter.test.tsx` + 통합1
M1-1 비위기 결과화면 109·1577-0199 노출. M1-2 위기화면 충돌없음(SafetyBanner 단독). M1-3 결과화면 한정(리더 결정).

### RED-6 `test/integration/funnel/freeInput.ui.test.tsx` + `test/unit/ui/SettingsModal.test.tsx`
UI-1 자유입력 "요즘 너무 힘들어요"→마음건강 결과. UI-2 위기어→SafetyBanner 우선(실시간 layer-1, 정책·classify 억제). UI-3 키없음→버튼흐름 완전동작. UI-4 디바운싱 최종1회. UI-5 키 저장/삭제. UI-6 키 비노출(type=password, 평문 미표시). UI-7 llm throw→흐름유지. UI-8 비위기 결과+M1 푸터 공존.

## 안전 검증 포인트 (safety-auditor 풀 투입)
1 위기 선행 불변식(classify/explain보다 먼저, 위기시 호출0; 적대적 "죽고싶지만 정책 알려줘"). 2 거짓음성0(CR-1~33 회귀+완곡 CA-4/5, layer-2가 layer-1 약화 안함 CA-7/8). 3 explain 그라운딩(입력외 날조 차단, 자격 LLM이 못뒤집음 EX-5). 4 '추정' 단정회피 유지. 5 degrade 안전(키없음/실패/타임아웃; layer-1 키무관 상시). 6 M1 푸터. 7 키 비노출. 8 throw-free 전면.

## 경계면 주의
LlmClient mock↔실SDK(동적 import 격리, classify/explain은 SDK 직접 import 안 함·주입 LlmClient만). crisisAnchors 주입경로(buildCrisisAnchors→CrisisDetectDeps→detectCrisis; App/traverse deps 체인 배선). suppressGeneration 소비(explain 호출 전 확인). 자유입력 query는 사용자 텍스트→위기검사 입구에. explain/classify는 evaluate 읽기만(버킷 재분류 금지).

## 의존성
`@google/genai` 추가(동적 import 격리). 전 LLM/embedding 테스트 mock 기반·실 네트워크 0. npm audit 점검. 키 없는 test/build/tsc 그린이 합격선(SDK 설치 실패해도 동적 import라 게이트 불변).

## 커버리지
`src/llm/**` ≥90 stmt/≥85 branch(안전직결). geminiClient 실 SDK 경로 istanbul ignore/mock경유만. UI 신규 branch ≥90. 위기 거짓음성 0건 회귀(절대불변). vitest.config include에 `src/llm/**` 추가.
