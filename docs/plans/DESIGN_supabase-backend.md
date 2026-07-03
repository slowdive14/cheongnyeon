# 설계서: Supabase 백엔드 (스코프 확장 2B-2)

상위: `PLAN_scope-expansion.md`. 결정(2026-06-28): 질의 임베딩 경로 **A(백엔드)** · 호스팅 **Supabase Edge Functions** · 본 문서는 **설계서**(코드 전 단계, 운영자 Supabase 프로젝트 준비 후 구현).

## 1. 목표 / 원칙
- **사용자 키 0** — Gemini 키는 서버(Edge Function secret)에만. 전국 규모 의미검색.
- **검색은 서버(pgvector)**, **자격 판정·위기 layer-1은 클라이언트**(신뢰 핵심 순수 엔진은 도메인 계층 유지).
- 대용량 벡터를 클라 번들에 안 박음 → 현재 `policies.json` 정적 import 졸업.
- `PolicyCache` 인터페이스로 `LocalJsonCache`(dev/test) ↔ `SupabaseCache`(운영) 교체.

## 2. ★핵심 제약: 임베딩 차원
- `gemini-embedding-001` 기본 **3072**차원. 그러나 **pgvector 인덱스(hnsw/ivfflat)는 `vector` 타입 2000차원 한계**.
  → 3072 직접 인덱싱 불가.
- **결정안(추천): `outputDimensionality=1536`**(Matryoshka 축소, 잘림 후 **재정규화** 필수) → `vector(1536)` + hnsw 인덱스.
  품질 거의 보존, 저장·검색 비용 절반. (대안: `halfvec(3072)` hnsw — pgvector 0.7+, 4000차원까지. 더 무겁고 신규기능.)
- 정책 벡터·질의 벡터 **동일 모델·동일 차원·동일 정규화** 필수(코사인 일관성).

## 3. 데이터 모델 (DDL)
```sql
create extension if not exists vector;

create table policies (
  id              text primary key,            -- plcyNo
  title           text not null,
  summary         text,
  category        text,
  source          text not null default 'ontong',
  age_min         int,
  age_max         int,
  income          jsonb not null,              -- IncomeCriteria
  region_codes    text[] not null default '{}',
  region_text     text,
  is_nationwide   boolean not null default false,
  recruit         jsonb not null,              -- RecruitWindow
  source_url      text,
  keywords        text[] not null default '{}',
  parsed          jsonb,                       -- ParseResult|null
  explanation     text,                        -- precompute(질의 무관)
  embedding       vector(1536),                -- precompute(Gemini 1536d, 정규화)
  fetched_at      timestamptz not null,
  updated_at      timestamptz not null,
  content_hash    text not null
);

create index policies_embedding_idx on policies using hnsw (embedding vector_cosine_ops);
create index policies_category_idx  on policies (category);
create index policies_kw_idx        on policies using gin (keywords);
-- 키워드 텍스트 매칭(하이브리드 키워드 arm): pg_trgm
create extension if not exists pg_trgm;
create index policies_title_trgm    on policies using gin (title gin_trgm_ops);
```

## 4. 검색 RPC (SQL 함수) — 하이브리드(벡터+키워드)
```sql
create or replace function search_policies(
  q_embedding vector(1536),
  q_text      text,
  top_k       int default 10,
  hard_categories text[] default null   -- allow-list(restrict). null/빈=전 영역
) returns setof policies
language sql stable as $$
  with v as (  -- 벡터 arm
    select p.*, 1 - (p.embedding <=> q_embedding) as vscore
    from policies p
    where (hard_categories is null or array_length(hard_categories,1) is null
           or p.category is null or p.category = any(hard_categories))
    order by p.embedding <=> q_embedding
    limit top_k * 4
  ), k as (  -- 키워드 arm(제목 trigram + 키워드 배열)
    select p.id, greatest(similarity(p.title, q_text),
             case when p.keywords && string_to_array(q_text,' ') then 0.6 else 0 end) as kscore
    from policies p
  )
  select v.* from v
  left join k on k.id = v.id
  order by (coalesce(v.vscore,0)*0.7 + coalesce(k.kscore,0)*0.3) desc
  limit top_k;
$$;
```
- 융합은 가중합(0.7 벡터 / 0.3 키워드)로 시작 — 기존 클라 RRF와 동등 목표. 추후 튜닝.
- `category=null` 절대 하드제외 금지(기존 불변식 보존).

## 5. 인제스트 → Supabase
- **`SupabaseCache implements PolicyCache`**(supabase-js, **service key**): `readAll`/`getById`/`getByHash`(content_hash)/`writeAll`(upsert).
- 인제스트 파이프라인에 **`embedder` 추가**(2B-1의 `explainer`와 동형): 변경분에 한해 Gemini 임베딩(`outputDimensionality:1536`+정규화) → `embedding`. 설명 precompute는 2B-1 그대로.
- 운영자 실행: `SUPABASE_URL`·`SUPABASE_SERVICE_KEY`·`GEMINI_API_KEY` env → `npm run ingest` → upsert(정책+벡터+설명).
- **벡터는 DB로**(JSON 번들 X) → 번들 비대 문제 해소.

## 6. 검색 Edge Function (`/functions/v1/search`)
```
POST { query: string, topK?: number, hardCategories?: string[] }
1) (서버) Gemini로 query 임베딩(1536d, 정규화). [GEMINI key = Edge secret]
2) supabase.rpc('search_policies', { q_embedding, q_text: query, top_k, hard_categories })
3) return { hits: [{ ...정책필드, explanation }] }   ← top-K만(작음)
```
- 자격 판정·위기 layer-1은 **응답 안 함** — 클라이언트가 처리. (위기 layer-2는 선택: 서버가 query 임베딩 보유하므로 위기앵커 비교 가능 → 추후.)
- 인증: anon key로 호출(verify_jwt off 또는 anon). **레이트리밋**(IP·세션) 필수(공개 엔드포인트 남용방지).

## 7. 클라이언트 재배선
- `App.tsx`: 정적 `import policiesJson` + 런타임 `embed()`/`hybridSearch` 제거.
- 검색 주입을 **원격 SearchClient**로: `traverse`/`useFunnel`이 로컬 `hybridSearch` 대신 `/functions/v1/search` 호출 →
  후보 top-K 수신 → **자격 엔진(클라, 순수) 적용** → 렌더. (`deps`에 search 주입점 이미 존재 → 교체 지점 명확.)
- **위기 layer-1(정규식)은 클라 즉시**(키·네트워크 무관) — 안전 바닥선.
- 폴백: 검색 서버 불가 → "검색 일시 불가" 안내(또는 최소 키워드 폴백용 소형 인덱스). 위기 감지는 불변.

## 8. 보안 / 운영
- `GEMINI_API_KEY` → Edge Function secret(클라 절대 노출 X). `SERVICE_KEY` → 인제스트(운영자/CI)만.
- 클라는 **Edge Function만** 호출(테이블 직접접근 X) → RLS 엄격 가능(테이블은 service role 함수로만).
- 레이트리밋·일일 캡(비용·남용). 질의 임베딩만 런타임 비용(쌈), precompute는 1회.

## 9. 단계별 설치 가이드 (운영자)
1. Supabase 프로젝트 생성 → URL·anon·service key 확보.
2. SQL 에디터: §3 DDL 실행(extension+table+index), §4 `search_policies` 함수 생성.
3. Edge Function `search` 배포(§6), secret `GEMINI_API_KEY` 설정.
4. 로컬 env(`.env`)에 `SUPABASE_URL`/`SUPABASE_SERVICE_KEY`/`GEMINI_API_KEY` → `npm run ingest`(전국·precompute) → 데이터 적재.
5. SPA env에 `SUPABASE_URL`·anon key·function URL → 검색 배선 → 정적 호스팅 배포.

## 10. 구현 단계 (코드, 프로젝트 준비 후)
- C1 `SupabaseCache` + 인제스트 `embedder`(mock 테스트 선작업 가능).
- C2 `search_policies` RPC + Edge Function(로컬 supabase CLI로 검증).
- C3 클라 SearchClient 재배선(원격 검색 + 클라 자격/위기) + 폴백.
- C4 보안(레이트리밋·RLS)·비용 가드·안전 재감사.

## 11. 결정/미결정
- **차원 = 1536 (확정)**: `outputDimensionality:1536` + 재정규화 → `vector(1536)` hnsw.
- **SPA 호스팅 = Vercel (확정)**. API = Supabase Edge Functions(확정). DB = Supabase Postgres+pgvector.
- 미결정: 키워드 arm pg_trgm vs tsvector(추천 pg_trgm); 서버 다운 시 폴백 범위.

## 12. 키 발급 · 배치 가이드 (운영자)

### 12.1 Supabase 프로젝트 생성 → URL·키
1. https://supabase.com → 로그인(GitHub/이메일) → **New project**.
   - Organization 선택/생성, **Project name**, **Database Password**(Postgres 비번 — 강하게, 따로 보관),
     **Region = Northeast Asia (Seoul)** 권장(지연↓), Plan=Free로 시작 → Create(~2분 프로비저닝).
2. **URL·키 위치**: 프로젝트 → **Settings(톱니) → API** (또는 **API Keys**):
   - **Project URL** `https://<ref>.supabase.co` → `SUPABASE_URL`.
   - **anon / public** (신규 UI는 *Publishable key*) → **클라이언트용**(공개 안전, RLS로 보호) → `SUPABASE_ANON_KEY`.
   - **service_role / secret** (신규 UI는 *Secret key*) → **서버/인제스트 전용**(RLS 우회·전권, **절대 클라·Git 노출 금지**) → `SUPABASE_SERVICE_KEY`.
3. **Gemini 키**(별도, Google AI Studio): https://aistudio.google.com/apikey → **Create API key** → `GEMINI_API_KEY`.

### 12.2 키 배치 (어디에 무엇을)
| 키 | 어디에 | 노출 |
|---|---|---|
| `SUPABASE_URL` | 인제스트 `.env` + Vercel(VITE_) | 공개 OK |
| `SUPABASE_SERVICE_KEY` | **인제스트 `.env`(운영자 PC/CI)만** | ❌ 절대 클라/Vercel-client/Git |
| `SUPABASE_ANON_KEY` | Vercel `VITE_SUPABASE_ANON_KEY` | 공개 OK(RLS 전제) |
| `GEMINI_API_KEY` | 인제스트 `.env` + **Edge Function secret** | ❌ 클라 금지 |
| `ONTONG_API_KEY` | 인제스트 `.env`만 | ❌ |

- **Edge Function**은 `SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY`를 **자동 주입**받음 → 수동 추가는 `GEMINI_API_KEY`만:
  `supabase secrets set GEMINI_API_KEY=...` (또는 대시보드 Edge Functions→Secrets).
- **Vercel**: Project → Settings → Environment Variables. Vite는 클라 노출 변수에 **`VITE_` 접두** 필수:
  `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SEARCH_FN_URL`(=`<SUPABASE_URL>/functions/v1/search`).
- **`.env`는 .gitignore**(현재 그러함). service_role·Gemini 키는 절대 커밋 금지.

### 12.3 Edge Function 배포(요약)
`npm i -g supabase` → `supabase login` → `supabase link --project-ref <ref>` →
`supabase functions deploy search` → `supabase secrets set GEMINI_API_KEY=...`.
