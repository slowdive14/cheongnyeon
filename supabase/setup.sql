-- 청년정책 진단 — Supabase 초기 셋업 (스코프 확장 2B-2)
-- Supabase 대시보드 → SQL Editor → New query → 아래 전체 붙여넣고 Run.
-- 차원 1536(gemini-embedding-001 outputDimensionality=1536, 정규화). pgvector 인덱스 2000d 한계 대응.

-- 1) 확장
create extension if not exists vector;
create extension if not exists pg_trgm;

-- 2) policies 테이블 (도메인 Policy + 인제스트 메타 + precompute)
create table if not exists policies (
  id            text primary key,           -- plcyNo
  title         text not null,
  summary       text,
  category      text,
  source        text not null default 'ontong',
  age_min       int,
  age_max       int,
  income        jsonb not null,             -- IncomeCriteria
  region_codes  text[] not null default '{}',
  region_text   text,
  is_nationwide boolean not null default false,
  recruit       jsonb not null,             -- RecruitWindow
  documents_text text,                       -- 제출서류 원문 발췌(F-⑤, null=원문 미표기). 기존 DB엔 alter로 선추가됨.
  source_url    text,
  keywords      text[] not null default '{}',
  parsed        jsonb,                       -- ParseResult | null
  explanation   text,                        -- precompute(질의 무관)
  embedding     vector(1536),                -- precompute(Gemini 1536d, 정규화)
  fetched_at    timestamptz not null,
  updated_at    timestamptz not null,
  content_hash  text not null
);

-- 3) 인덱스
create index if not exists policies_embedding_idx on policies using hnsw (embedding vector_cosine_ops);
create index if not exists policies_category_idx  on policies (category);
create index if not exists policies_kw_idx        on policies using gin (keywords);
create index if not exists policies_title_trgm    on policies using gin (title gin_trgm_ops);

-- 4) 하이브리드 검색 함수 (벡터 hnsw ∪ 키워드 → 재랭크). category=null 하드제외 금지.
--
-- ★신뢰성 설계(엄수 — 아래 두 결함 수정본):
--  (1) hnsw.ef_search 상향(함수 스코프): 기본값 40은 근사 recall이 낮아 콜드/유휴 상태에서
--      진짜 최근접을 놓치고 그래프 진입점 근처 "허브" 문서만 반환 → 어떤 질의든 동일 클러스터로
--      쏠리는 비결정 버그가 났다. 120으로 올려 recall을 안정화(콜드에서도 최근접 도달).
--  (2) 키워드 독립 후보 팔(UNION): 예전엔 벡터 후보 안에서만 키워드 재정렬 → 벡터가 관련 문서를
--      후보에서 놓치면 키워드가 구제 불가(정확 키워드 질의만 되는 것처럼 보임). 이제 키워드/트라이그램
--      매칭 문서를 별도 팔로 뽑아 UNION하므로, 벡터 recall이 나빠도 관련 문서가 풀에 진입한다.
create or replace function search_policies(
  q_embedding     vector(1536),
  q_text          text,
  top_k           int default 10,
  hard_categories text[] default null,        -- allow-list(restrict). null/빈 = 전 영역
  q_region        text default null            -- ★사용자 시·도 코드. null = 지역 무필터(현 동작).
) returns setof policies
language sql stable
set hnsw.ef_search = 120                       -- (1) 근사 recall 상향(콜드/허브 편향 방지)
as $$
  with toks as (                               -- 질의 토큰(≥2자). 키워드 팔·재랭크 공용.
    select coalesce(array_agg(t), '{}') as arr
    from unnest(string_to_array(lower(q_text), ' ')) t
    where length(t) >= 2
  ),
  filtered as (                                -- 임베딩 有 + 영역 allow-list + 지역 양립성.
    select p.*
    from policies p
    where p.embedding is not null
      and (hard_categories is null
           or array_length(hard_categories, 1) is null
           or p.category is null
           or p.category = any(hard_categories))
      -- ★지역 인지 후보 선정(벡터·키워드 양팔 공용): q_region 있으면 양립 불가 정책을 후보에서 제외.
      --   ★보수: 지역 미상(region_codes 빈 배열)·전국은 배제하지 않는다 — 클라 regionAxis가
      --   REGION_UNKNOWN/PASS로 최종 판정(자격 권위는 클라 eligibility, 서버는 후보 품질용).
      --   q_region null(미선택)이면 술어 전체 통과 → 현 동작 완전 동일.
      and (q_region is null
           or p.is_nationwide
           or q_region = any(p.region_codes)
           or coalesce(array_length(p.region_codes, 1), 0) = 0)
  ),
  vec_ids as (                                 -- 벡터 팔(hnsw). 후보 풀 넉넉히(top_k*8, ≥120).
    select f.id
    from filtered f
    order by f.embedding <=> q_embedding
    limit greatest(top_k * 8, 120)
  ),
  kw_ids as (                                  -- (2) 키워드/트라이그램 팔 — 벡터 무관 독립 진입.
    select f.id
    from filtered f
    where (select arr from toks) <> '{}'
      and (f.keywords && (select arr from toks)
           or similarity(f.title, q_text) > 0.2)
    limit 80
  ),
  cand_ids as (                                -- id 기준 합집합(vector 컬럼 UNION 중복제거 회피).
    select id from vec_ids
    union
    select id from kw_ids
  )
  select c.*
  from filtered c
  where c.id in (select id from cand_ids)
  order by
    -- ★재랭크: 의미 유사도(코사인) 지배 + 키워드는 미세 타이브레이커.
    --   키워드 가중을 크게 주면 흔한 토큰 하나("상담")가 진짜 최근접(고민상담소 0.69)을
    --   약한 문서(전세사기교육 0.56)로 뒤엎는다. 키워드는 풀 진입(kw_ids)으로만 보장하고,
    --   순위는 코사인이 정하되 키워드/제목 일치는 최대 +0.05만 얹는다(동점 구제, 역전 금지).
    (1 - (c.embedding <=> q_embedding))
    + greatest(
        similarity(c.title, q_text),
        case when c.keywords && (select arr from toks) then 0.5 else 0 end
      ) * 0.1
    desc
  limit top_k;
$$;

-- 5) RLS: 클라이언트는 테이블 직접접근 금지(Edge Function의 service_role로만). anon 읽기 차단.
alter table policies enable row level security;
-- (정책 미생성 = anon 접근 0. service_role는 RLS 우회하므로 인제스트·Edge Function은 정상 동작.)
