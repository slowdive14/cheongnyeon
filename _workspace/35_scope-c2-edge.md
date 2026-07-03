# 스코프 확장 C2 — 검색 Edge Function

날짜: 2026-06-28 · 라이브 검색 경로 검증

## 산출물
- **`supabase/functions/search/index.ts`** (Deno, 외부 import 0 — 순수 fetch):
  `POST {query, topK?, hardCategories?}` → 질의 임베딩(Gemini REST, 1536d, L2 정규화, taskType 미설정=정책과 동일 공간)
  → `search_policies` RPC(PostgREST, service_role) → `{hits: PolicyRow[]}`. 임베딩 실패 → `{hits:[], degraded:true}`.
  CORS·OPTIONS·입력검증 포함.
- **`supabase/functions/search/README.md`**: 계약·배포(supabase CLI)·curl 확인·주의.

## 안전 경계
- 위기 감지(layer-1)·자격 판정·추정 고지는 **클라이언트**(키·네트워크 무관 바닥선). Edge Function은 검색만.
- service_role는 함수 내부에서만(자동 주입). 클라는 anon 키로 함수 호출.

## 검증 (라이브, Edge Function 동일 로직을 Node로)
- 질의 1536 임베딩 → `search_policies` RPC(15행 대상):
  "자격증 시험 응시료 지원" → **#1 '구직청년 자격증 취득지원'**(정확 의미매칭). "심리상담 받고 싶어요" → 진로상담 등.
- pgvector+키워드 하이브리드 랭킹 동작 확인.

## 게이트
- 테스트 600 passed · tsc 0 · eslint 0(Deno 파일 무사).

## 운영자 단계
- 배포: `supabase functions deploy search` + `supabase secrets set GEMINI_API_KEY=...` (README).
- 전량 데이터: `npm run ingest`(아직 — 비어있으면 hits 0).

## 다음
- **C3**: 앱 재배선 — 검색을 Edge Function 호출로(질의→hits→Policy 매핑→클라 자격/위기/렌더). 키워드 폴백 유지.
- **C4**: CORS 도메인 제한·레이트리밋·RLS·안전 재감사.
