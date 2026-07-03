# 스코프 확장 C3 — 앱 재배선(원격 검색) + 데이터 적재 완료

날짜: 2026-06-28

## 데이터 적재 완료 (Supabase)
- **2,633건 · 벡터 1536d 2,633 · 설명 2,633** (전국·전영역). 백필 재실행 reparsed=0(페이지네이션 수정 → 파싱·설명 캐시 skip, 임베딩만).
- 의미검색 RPC 실검증(전체 데이터): "우울…상담"→우울증치료비/고민상담소, "월세 보증금"→월세지원(부산 포함), "자격증…취업"→응시료지원. 교차영역·비서울 정확.

## C3 코드
- **`traverse.search` 주입**: 있으면 원격(Edge Function) 후보 Policy[], 없으면 인메모리 hybridSearch(dev/degrade). 위기·자격은 그대로 클라(키 무관 바닥선).
- **`remoteSearch`**(C2 연계): Edge Function 호출 → 행 매핑(fromRow). throw-free(실패 degraded). 테스트 5.
- **App 배선**: `VITE_SEARCH_FN_URL`+`VITE_SUPABASE_ANON_KEY` 있으면 원격 검색 주입, 없으면 인메모리. **deps memo 안정화**(매 렌더 새 객체 → 원격 검색 네트워크 남발 방지). `vite-env.d.ts`에 env 타입.
- 인제스트 견고화: `SupabaseCache.readAll` 페이지네이션(1000행 상한), 임베딩 배치별 회복력+1회 재시도.

## 게이트
- 테스트 **607 passed (38 files)** · tsc 0 · eslint 0 · build 성공.

## 운영자 남은 단계 (라이브 e2e)
1. **Edge Function 배포**(C2): `supabase login` → `supabase link --project-ref <ref>` → `supabase secrets set GEMINI_API_KEY=...` → `supabase functions deploy search`.
2. **SPA env**: 로컬 테스트는 `.env.local`에 `VITE_SEARCH_FN_URL=<...>/functions/v1/search`·`VITE_SUPABASE_ANON_KEY=<anon>` → `npm run dev`. 배포는 Vercel 환경변수 + 배포.
3. 그 뒤 자유입력 → 원격 의미검색(2,633 전국·전영역) → 클라 자격·위기 → 결과+설명(키 없이).

## 다음
- **C4**: CORS 도메인 제한·레이트리밋·RLS 재확인·안전 재감사. 결과 중복(near-dup, manualCandidates 400) 표시 정리(선택).
- (선택) 원격 모드 시 번들 policies.json 제거로 번들 축소.
