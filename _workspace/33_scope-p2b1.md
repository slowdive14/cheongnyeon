# 스코프 확장 Phase 2B-1 — 서울필터 제거 + 설명 precompute (키 제거)

날짜: 2026-06-28 · 단계적(2B-1 먼저) · TDD + 소량 e2e 검증

## 목표
사용자 Gemini 키 요구를 없애는 1단계: (1) 인제스트 서울필터 제거(전국 적재), (2) **설명 precompute**
(운영자 키로 인제스트 시 1회 생성·캐시 저장 → 런타임 LLM·사용자 키 0), (3) 키워드 검색은 기존 바닥선.

## 변경
- **`CachedPolicy.explanation?: string|null`** 스키마 추가.
- **`ingest`**: `regionScope?:'seoul'|'all'`(기본 seoul; 'all'이면 서울필터 미적용·전국 적재) +
  `explainer?: IngestExplainer`(변경분에 한해 explanation 생성, `safeExplain`로 throw 흡수—설명 누락이 적재 비차단).
- **`scripts/ingest.ts`**: 운영자 키 있을 때 explainer 배선(`explainMatch`, 질의 무관→정책별 고정),
  `regionScope='all'`(env `ONTONG_REGION=seoul`로 서울만 가능).
- **`PolicyResultCard`**: `usePolicyExplanation(record, llm, stored)` — **stored(precompute) 우선**(키 0·즉시),
  없을 때만 런타임 explainMatch(개발/파워유저 폴백). `CachedPolicy.explanation` 읽기.

## 안전
- 위기 layer-1·추정 고지·보수 판정·blocked 미노출 불변. 설명은 그라운딩 가드(explainMatch) 통과분만.
- 비서울은 전국 적재되나 데모 프로필(서울11)에선 regionAxis로 blocked→미노출 → **시각 노출은 2C(프로필 지역) 이후**.

## 검증
- 테스트 **591 passed (35 files)** · tsc 0. ingest(regionScope=all 비서울 적재·explainer 저장·throw 흡수),
  card(stored 설명 키 없이 표시).
- 소량 e2e(실 Gemini, 후보파일 maxPages1): 20건 전부 설명 생성, 그라운딩 텍스트(예: "사회연대경제 청년일경험
  → 19~39세 5개월 실무경험…"), 대구(비서울) 포함. 후보·임시 정리, 현 캐시(470) 무손상.

## 운영자 단계(미실행 — 비용/시간)
- 전량 적용: `npm run ingest`(env ONTONG_API_KEY+GEMINI_API_KEY) → 전국 적재 + 정책별 설명 precompute(수천 건
  = LLM 수천 콜, 토큰·시간). 실행 후 캐시에 explanation 채워짐 → **키 없는 사용자도 설명 표시**.

## 다음
- **2C**: 프로필 시·도 선택 UI → 비서울 정책 시각 노출(전국 데이터 활용).
- **2B-2**: 의미검색 = 질의 임베딩(A 백엔드 / B 온디바이스) + 정책 벡터 precompute(A/B 결정 후).
