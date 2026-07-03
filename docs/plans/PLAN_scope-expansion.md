# 구현 계획서: 스코프 확장 (서울→전국 지자체 · 마음건강→전 영역)

상위 SSOT: `PLAN_youth-policy-diagnosis-mvp.md`. 본 문서는 그 위에 얹는 확장 계획.

## 목표
자유입력 1차 관문을 유지하며, (1) **영역**을 마음건강 → 일자리·주거·교육·복지 등 전 영역으로, (2) **지역**을
서울 → 전국 지자체로 넓힌다. 안전(위기 우선·보수 자격·그라운딩·추정 고지)·신뢰는 불변.

## 현재 스코프를 가두는 지점 (코드 근거)
| 지점 | 위치 | 동작 |
|---|---|---|
| 서울 필터 | `data/ingest` `droppedNonSeoul` + `ontongClient.deriveRegionText` | 비서울 지자체 정책 폐기 |
| 단일 도메인 | `App.tsx` `graph=mentalHealthGraph`, traverse `allowedCategories:['마음건강']` | 검색이 마음건강만 |
| 하드코딩 프로필 | `App.tsx` DEMO_PROFILE(25/서울/11) | 지역축 고정 |
| 지역 파싱 | `deriveRegionText`/`parseRegion` | 서울(11)·전국만 코드화 |
- 검증: `hybridSearch.isHardExcluded`는 allow-list(restrict-to). `allowedCategories` 미지정 → 전 영역 검색.
- 데이터·자격 엔진은 이미 다영역 수용 가능(캐시에 일자리/주거/교육 존재, 단 서울필터됨).

## Phase 1 — 도메인 개방 (현재 데이터, 재인제스트 불필요)
- **1-1 검색 스코프 개방**: 멀티도메인 entry(allowedCategories 없음) → 자유입력이 전 영역 검색.
- **1-2 멀티도메인 예시 칩**: 마음건강·일자리·주거·교육·복지 예시(라벨=질의, 영역 키워드 포함).
  새 graph `domains/youthPolicy.ts`. 위기 라우팅 도메인 무관 유지.
- **1-3 결과 카드 영역 배지**: 교차 결과라 정책 영역(category) 표시.
- 테스트: 그래프 구조, 영역 배지, 교차검색(자유입력 "월세"→주거).

## Phase 2 — 지리 확장 (재인제스트 + 지역매칭 + 프로필)
- **2-1 지역 코드 매핑 전면화**: 17 시·도(+시군구). zipCd 앞2자리=시·도. (`deriveRegionText`/`parse/region`)
- **2-2 인제스트 서울필터 제거/파라미터화**: 전 지역 적재 → 재인제스트(캐시 대폭 증가).
- **2-3 자격 지역축 계층 매칭**: 사용자 시·도 ↔ 정책 시·도/시군구/전국. 불명 보수 review.
- **2-4 프로필 지역 선택 UI**: 하드코딩 11 제거, 사용자 시·도(선택 시군구) 선택.
- **2-5 인제스트 precompute (벡터 + 설명 + 위기앵커)** — 규모·비용·**사용자 키 제거**를 한 번에:
  - 운영자 키(env)로 인제스트 시 **1회** 계산해 캐시에 저장: ① 정책 임베딩 `vector`, ② 정책 설명
    `explanation`(★`explainMatch`는 이미 **질의 무관**이라 정책별 고정 → precompute 가능), ③ 위기앵커 벡터.
  - `CachedPolicy` 스키마 확장: `vector: number[]|null`, `explanation: string|null`.
  - 런타임: `retrieval/embed`는 저장 벡터 로드(매 로드 재임베딩 0), `PolicyResultCard`는 저장 설명 표시(런타임 LLM 0).
- **2-6 질의 임베딩 경로 (사용자 키 불필요 핵심)**: 런타임에 키가 필요한 건 **사용자 글(질의) 임베딩 1건**뿐.
  - 두 갈래(★결정 필요 — 모델 일치 제약): **(A) 작은 백엔드 프록시 `/api/embed`**(운영자 키 1개 서버측, Gemini로
    정책·질의 동일 임베딩, 품질 최고·호스팅 필요) vs **(B) 온디바이스 임베더**(transformers.js, 정책 벡터도 같은
    모델로 precompute, 백엔드 0·무료·품질 중).
- **2-7 항상-on 바닥선(안전)**: 질의 임베딩 불가(백엔드 다운·오프라인·프라이버시) → 키워드 검색으로 degrade.
  **위기 감지는 layer-1(정규식, 키·네트워크 무관) 절대 유지** — 안전 경로는 백엔드/키에 의존시키지 않는다.
- 테스트: 지역 파싱 경계, 인제스트 비서울 보존, 저장 벡터·설명 로드, 질의임베딩 불가 시 키워드 degrade, 위기 layer-1 불변.

> **AI 운영 모델 — 사용자 키 제거(2026-06-28 결정)**: "일반 청년·상담자에게 Gemini 키 입력은 비현실적"이라
> 사용자 키 요구를 폐기. 공용 키를 클라이언트에 두는 것은 추출 위험으로 금지. 대신 **precompute(2-5)로 정책
> 벡터·설명을 운영자가 1회 생성**하고, 런타임은 **질의 임베딩만**(2-6 A/B) 필요 → 사용자 키 0, 비용 최소.
> 기존 SettingsModal '사용자 키 입력'은 (개발/파워유저용) 보조로 남기되 1차 경험에서 제외.

## Phase 3 — 다영역 자격 정밀도 (선택/후속)
- API `jobCd`/`schoolCd`/`mrgSttsCd`/`plcyMajorCd`(현재 무시)를 자격축으로. 프로필 학력·취업상태(선택 질문).
  없으면 보수 review. 미적용 시 일자리·교육 결과가 "확인 필요" 쏠림.

## Phase 4 — 규모·비용·안전 패스
- 검색 성능(수천 건): 결과 cap/페이지네이션. 저장 벡터(2-5)로 매 로드 임베딩 0.
- 비용: precompute는 인제스트 1회. 질의 임베딩만 런타임 — A(백엔드) 택 시 **공개 엔드포인트 레이트리밋/남용방지·일일 캡** 필수.
- 안전 재감사: 위기 라우팅(layer-1 키 무관 불변)·추정 고지·보수 판정·그라운딩이 전 영역에서 유지되는지.

## 결정 (확정/미정)
- 순서: **P1(도메인) → P2(지리+프로필+precompute+키제거) → P3 → P4.** (사용자 승인 2026-06-28)
- 지역 단위: 시·도(17) 우선, 시군구 후속.
- 깔때기 개념: 다영역은 자유입력 검색 + 영역 예시 칩으로 일원화(서브브랜치 깔때기 접음).
- **사용자 키 제거(확정)**: precompute(정책 벡터·설명·위기앵커) + 런타임 질의 임베딩만. 사용자 키 요구 폐기.
- **질의 임베딩 경로 = A 백엔드(확정, 2026-06-28)**: **Supabase 백엔드** 채택. 정책 벡터는 Gemini로 precompute해
  **Supabase pgvector**에 저장, 런타임 검색은 서버(질의 임베딩 + pgvector 유사도)에서 → 클라이언트는 top-K만 수신
  (대용량 벡터 클라 번들 문제 해소). 자격 판정·위기 layer-1은 **클라이언트 유지**(신뢰 핵심 순수 엔진).

## 2B-2 목표 아키텍처 (Supabase 백엔드)
| 레이어 | 위치 | 내용 |
|---|---|---|
| 저장 | **Supabase Postgres + pgvector** | `policies`(필드+parsed jsonb+explanation text+embedding vector) + 벡터 인덱스(hnsw/ivfflat) |
| 인제스트 | 스크립트(운영자) | Gemini로 임베딩+설명 precompute → Supabase upsert (`SupabaseCache implements PolicyCache`) |
| 검색 | **서버 함수**(`/api/search`) | 질의 임베딩(Gemini, 서버키) → pgvector 유사도 → 키워드 융합 → top-K 반환 |
| 자격·위기 | **클라이언트** | 반환된 후보에 자격 엔진(순수) 적용, 위기 layer-1(정규식) 즉시 |
| 클라이언트 | SPA | 질의 전송 → top-K 수신·렌더(정책 번들 import 제거). 키워드 폴백은 서버 다운 시 |
- `PolicyCache` 인터페이스가 이미 추상화 → `LocalJsonCache`(dev/fixture)와 `SupabaseCache`(운영) 공존.
- **미정(2B-2 착수 전)**: 서버 함수 호스팅 — (가) **Supabase Edge Functions**(통합) vs (나) Vercel/CF API 라우트.
  벡터 차원(3072 그대로 vs Matryoshka 축소). RLS·익명키 노출 범위.
- **운영자 선결**: Supabase 프로젝트(URL·anon key·service key) + 호스팅 환경. 없이는 실연동 불가(코드는 인터페이스·계약까지 선작업 가능).

## 진행 로그
- 2026-06-28 계획 수립.
- 2026-06-28 **Phase 1 완료**: `youthPolicy.ts` 멀티도메인 entry(전 영역 검색) + 예시 칩 5 + 카드 영역 배지. App 전환. 577 tests·tsc 0·build OK. 브라우저: 교차영역 결과 실측. 산출물 `_workspace/31_scope-p1-domain.md`.
- 2026-06-28 **결정**: 지역 범위='전국+단계적'(전 지역 적재, 사용자 시·도+전국만 노출), 임베딩='인제스트 시 precompute'.
- 2026-06-28 **Phase 2A 완료**(지역 코드 매핑): 실 zipCd 샘플로 17 시·도 prefix 확정(강원51·전북52). `parse/sido.ts` 신규, `parseRegion`·`deriveRegionText` 전면 매핑. regionAxis는 기존 시·도 정확매칭으로 충분(무변경). 순수 로직(캐시 무변경). 587 tests·tsc 0. 산출물 `_workspace/32_scope-p2a-region.md`.
- 2026-06-28 **계획 갱신**: 사용자 키 입력 비현실 → **키 제거 설계** 반영. 2B를 "precompute(벡터+설명+위기앵커) + 질의 임베딩(2-6 A/B) + 항상-on 바닥선"으로 확장. 핵심 근거: `explainMatch`가 질의 무관 → 설명 precompute 가능.
- 2026-06-28 **결정**: 단계적 — 2B-1(설명 precompute+서울필터 제거, 키0·백엔드0) 먼저, 2B-2(의미검색 A/B) 나중.
- 2026-06-28 **Phase 2B-1 완료(코드)**: `CachedPolicy.explanation` + ingest `regionScope`/`explainer`(throw-safe) + 스크립트 explainer 배선 + 카드 stored 설명 우선. 591 tests·tsc 0. 소량 e2e(실 Gemini): 설명 그라운딩 생성·비서울 적재 확인. **운영자 전량 재인제스트(`npm run ingest`)는 미실행(수천 LLM콜 비용/시간)** — 실행 시 키 없는 설명 표시. 산출물 `_workspace/33_scope-p2b1.md`.
- 2026-06-28 **결정**: 2B-2 백엔드 = **Supabase + Edge Functions**. 진행 = **설계서 먼저**(운영자 프로젝트 준비 후 구현).
- 2026-06-28 **설계서 작성**: `docs/plans/DESIGN_supabase-backend.md` — 스키마(DDL)·검색 RPC·Edge Function·인제스트(SupabaseCache+embedder)·클라 재배선·보안·단계별 설치. **핵심 발견: gemini-embedding-001 3072d > pgvector 인덱스 2000d 한계 → outputDimensionality=1536 축소+재정규화 권장.**
- 2026-06-28 **결정**: 차원=1536, SPA 호스팅=Vercel. 운영자가 setup.sql 실행 + .env에 SUPABASE_URL/SERVICE_KEY 추가 완료.
- 2026-06-28 **C1 완료 + 라이브 검증**: `@supabase/supabase-js`, `SupabaseCache`+`supabaseMapping`, `l2normalize`, geminiEmbed 1536옵션, ingest `embedder`(vector·keywords precompute), 스크립트 배선. 600 tests·tsc 0·eslint 0. **실 Supabase에 15건 쓰기→읽기(벡터 1536d·설명·비서울) 검증.** 산출물 `_workspace/34_scope-c1-supabase.md`. → 운영자 `npm run ingest`(전량, 비용/시간) + **C2(검색 Edge Function)** 대기.
- 2026-06-28 **C2 완료 + 검색경로 검증**: `supabase/functions/search/index.ts`(Deno, 질의 임베딩→search_policies RPC) + README(배포). 라이브: "자격증 응시료"→#1 자격증 취득지원 정책(의미매칭). 600 tests·tsc 0·eslint 0. 산출물 `_workspace/35_scope-c2-edge.md`. → 운영자 `supabase functions deploy search`+secret + **C3(앱 재배선)** 대기.
- 2026-06-28 **인제스트 최적화**: 동시성 풀(parseChunk·설명) + 배치 임베딩 + INGEST_CONCURRENCY/INGEST_PARSE 플래그. 라이브 측정 1.0초/건(conc12) → **전량 2,633건 ≈ 44분**(순차 ~3~4h 대비 4~5×), 비용 ~$1. 602 tests. 산출물 `_workspace/36_scope-ingest-optimize.md`. → 운영자 `npm run ingest`(~44분) + C3 대기.
- 2026-06-28 **전량 적재 완료**: Supabase 2,633건 · 벡터 1536d 2,633 · 설명 2,633(전국·전영역). 도중 (a) 임베딩 all-or-nothing 버그→배치별 회복력+재시도, (b) `readAll` 1000행 상한→페이지네이션, (c) **Gemini 지출한도 초과 429**(운영자 한도 상향 후 백필 reparsed=0로 임베딩만) 해결. 의미검색 RPC 실검증(교차영역·비서울 정확).
- 2026-06-28 **C3 완료(코드)**: `traverse.search` 주입 + `remoteSearch`(테스트) + App 원격배선(deps memo 안정화)+vite-env. 607 tests·tsc 0·build OK. 산출물 `_workspace/37_scope-c3.md`. → **운영자 Edge Function 배포 + SPA env** 후 라이브 e2e. 이어서 C4(보안·안전 재감사).
- 2026-06-28 **라이브 e2e 검증 완료**: 운영자 `functions deploy search`(project jefbylakkuajqrgnzobb) + `.env`에 VITE_ 2개. 브라우저: 자유입력→`POST /functions/v1/search 200`(원격 실호출)→결과 카드(주거 '지금 신청 가능')+precompute 설명, **사용자 키 0·콘솔 에러 0**. 함수 직접 curl도 200(주거·부산 포함). **스코프 확장 end-to-end 가동.**
- **C4 대기(폴백·폴리시)**: (a) 마운트 시 entry.concept로 원격검색 1회 발생(browse에선 결과 미표시인데 네트워크 낭비) → 실질의 있을 때만 검색하도록 가드, (b) CORS를 Vercel 도메인으로 제한, (c) 레이트리밋, (d) near-dup 결과 표시 정리, (e) 안전 재감사(위기 layer-1·추정 고지 전영역).
- 2026-07-01 **검색 신뢰성 2결함 수정(SQL·운영자 재적용 완료)**: "월세 지원 궁금해" 같은 기본 질의가 결과 0 — (1) hnsw `ef_search=40` 기본값의 콜드 recall 붕괴(허브 쏠림·비결정) → 함수 스코프 `ef_search=120`+후보풀 ≥120, (2) 키워드가 벡터 후보 내부 재랭크뿐(벡터가 놓치면 구제 불가) → 키워드/트라이그램 **독립 후보 팔 UNION** + 재랭크는 코사인 지배(키워드 최대 +0.05 타이브레이커 — "상담" 1토큰이 진짜 최근접을 뒤엎던 부작용 차단). 12질의 배터리·반복 결정성 라이브 검증. 부수 발견: DEMO_PROFILE 서울 하드코딩이 전국 정책을 REGION_MISMATCH로 전량 숨김 → regionCode 미입력(review 노출)으로 수정.
- 2026-07-01 **프로필 입력(시·도·나이) 완료**: `youth-policy-build` 팀(planner→implementer→reviewer∥safety-auditor∥qa). `ProfileInput`+`profileInputParse`(SIDO_LIST 재사용)+`useProfileState`(App 소유), `UserProfile.age?` 확장(소비처 eligibility 가드 1곳). 미입력=보수 review 유지·입력=정밀 판정·위기 미렌더·T8(profile≠검색 memo deps) 테스트 고정. 검수 3팀 승인(blocker/High 0, Med 3 defer: 커버리지 D1·스냅백 M1·no-op M2). **라이브 검증에서 blocker 발견→수정**: 검색이 지역 무지 → 부산 선택 시 top-10을 타 지역이 잠식해 결과 0. 검색 지역 인지 배선(traverse→remoteSearch→Edge Function→`search_policies q_region`, 전국·지역미상 보존, 인메모리 pre-filter 동일) + 운영자 SQL·EF 재배포. 라이브 재검증: 부산·25 "월세" → 부산+전국 카드 5(전세보증금반환보증 '지금 신청 가능', 숨김분은 모집종료 정직 차단), 서버 필터 타지역 유입 0, 미선택 동작 불변. 669 tests·tsc 0·eslint 0. 산출물 `_workspace/38_*.md`. 잔여: R1 소득 입력 UI(income 100 하드코딩), R2 프로필 localStorage, D1 useProfileState 단위 테스트.
