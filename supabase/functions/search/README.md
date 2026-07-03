# search — 청년정책 검색 Edge Function

질의 임베딩(서버 Gemini 키, 1536d 정규화) → `search_policies` RPC(pgvector+키워드) → top-K 정책 반환.
위기 감지·자격 판정은 **클라이언트**가 한다(키 무관 안전 바닥선). 이 함수는 검색만.

## 계약
`POST /functions/v1/search`
```json
요청: { "query": "월세가 부담돼요", "topK": 10, "hardCategories": null }
응답: { "hits": [ { ...policy row(snake_case)... } ] }
실패: { "hits": [], "degraded": true }   // 임베딩 실패 → 클라가 키워드 폴백
```

## 배포 (운영자, 1회)
```bash
npm i -g supabase                          # Supabase CLI
supabase login                             # 브라우저 인증
supabase link --project-ref <프로젝트ref>   # ref = Project URL의 <ref>.supabase.co
supabase secrets set GEMINI_API_KEY=<여러분_Gemini_키>   # 함수 비밀(SUPABASE_URL/SERVICE_ROLE는 자동)
supabase functions deploy search
```

## 동작 확인 (배포 후)
```bash
curl -i -X POST "https://<ref>.supabase.co/functions/v1/search" \
  -H "Authorization: Bearer <ANON_KEY>" \
  -H "content-type: application/json" \
  -d '{"query":"자격증 응시료 지원","topK":5}'
```
→ `{ "hits": [ { "title": "...자격증 취득지원...", ... } ] }` 나오면 정상.

## 주의
- `Access-Control-Allow-Origin: *` → 운영 시 Vercel 도메인으로 좁히기 권장(C4).
- 데이터가 비어 있으면(인제스트 전) hits 0. 먼저 `npm run ingest`로 Supabase 적재 필요.
- JWT 검증 기본 ON → 클라는 anon 키를 Authorization에 실어 호출.
