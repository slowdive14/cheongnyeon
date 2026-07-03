# 스코프 확장 C1 — SupabaseCache + 임베딩 precompute (1536d)

날짜: 2026-06-28 · TDD + 라이브 Supabase 검증

## 변경
- 의존성 `@supabase/supabase-js`.
- **`CachedPolicy`**: `keywords?: string[]`, `vector?: number[]|null` 추가.
- **`l2normalize`**(순수, 테스트) — Matryoshka 축소 후 코사인 일관성.
- **`geminiEmbed`**: `outputDimensionality` 옵션 + 축소 차원 시 L2 정규화.
- **`retrieval/embed`**: `buildText`/`buildKeywords` export(인제스트 재사용, 타입 loosen).
- **`ingest`**: `IngestEmbedder` + 변경분 vector·keywords precompute(`safeEmbed` throw-safe).
- **`SupabaseCache`**(SDK, 커버리지 제외) + **`supabaseMapping`**(순수 toRow/fromRow/parseVector/toVectorLiteral, 테스트).
  pgvector insert는 `[..]` 텍스트 리터럴.
- **`scripts/ingest.ts`**: 임베딩 provider(1536) + `SupabaseCache`(SUPABASE_URL+SERVICE_KEY 있으면) 배선.
- `supabase/setup.sql`(운영자 실행: 테이블·hnsw 인덱스·search_policies 함수·RLS).

## 라이브 검증 (운영자 Supabase)
- 소량(15건) 쓰기→읽기: **벡터 1536d 15 · 설명 15**, 비서울(광주29) 적재. 매핑·인증·pgvector 왕복 OK.

## 게이트
- 테스트 **600 passed (37 files)** · tsc 0 · eslint 0. (supabaseCache/geminiEmbed/geminiClient/localJsonCache는 SDK 경계 커버리지 제외)

## 운영자 단계 (전량 — 미실행, 비용/시간)
- `npm run ingest` (env: ONTONG+GEMINI+SUPABASE_URL+SERVICE_KEY) → **전국 적재 + 벡터·설명 precompute → Supabase**.
  수천 정책 × (임베딩+설명) LLM 콜 → 토큰·시간 큼. 첫 1회 후 증분.
- 주의: 현재 검증용 15행이 테이블에 있음(전량 인제스트가 upsert로 갱신/추가).

## 다음
- **C2**: 검색 Edge Function(`/functions/v1/search`) — 질의 임베딩(서버키) + `search_policies` RPC.
- **C3**: 앱 재배선(원격 검색 + 클라 자격/위기). **C4**: 보안(레이트리밋·RLS)·안전 재감사.
