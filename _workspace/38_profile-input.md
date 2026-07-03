# 프로필 입력(시·도·나이) + 검색 지역 인지 — 리더 종합

날짜: 2026-07-01 · 팀: planner → tdd-implementer → reviewer ∥ safety-auditor ∥ qa (youth-policy-build)

## 배경
- 검색 신뢰성 수정(동일 세션 선행): `search_policies`에 (1) `ef_search=120`(콜드 recall 붕괴 해소), (2) 키워드 독립 후보 팔 UNION + 코사인 지배 재랭크(+0.05 타이브레이커). 운영자 SQL 재적용, 12질의 배터리 검증.
- DEMO_PROFILE 서울(11) 하드코딩이 전국 스코프에서 타 지자체 정책 전량 숨김 → 미입력(review) 수정. 이어서 본 기능: 사용자가 시·도·나이를 직접 입력.

## 구현 (T1~T10, 테스트 607→669)
- `src/ui/funnel/profileInputParse.ts` — 순수 파서. `sidoOptions()`(선택 안 함+17), `parseAgeInput`(정수·비음만, `/^\d+$/`), `parseSidoCode`(SIDO_LIST 존재 코드만). 신규 테이블 금지 — `parse/sido.ts` 재사용.
- `src/ui/funnel/ProfileInput.tsx` — controlled. 나이는 `type=text`+`inputMode=numeric`(native number가 'abc'를 삼켜 파서 검증 불가 → 파서 단일 관문화, S5 실질화).
- `src/ui/funnel/useProfileState.ts` — App 소유 프로필 상태(병합 patch, income 보존). localStorage(R2) 삽입 경계.
- `src/domain/types.ts` — `UserProfile.age?: number`(소비처는 eligibility `isUsableAge` 가드 1곳, 로직 무변경).
- App: INITIAL_PROFILE = 미입력 시작(age·regionCode undefined, income medianRatio 100 보존=R1 잔여).
- ★T8: profile은 App `search`/`deps` memo 배열 미포함(자격 입력 ≠ 검색 입력). 재평가는 useFunnel effect deps(profile)가 담당.

## 검수 (blocker/High 0 — 3팀 승인)
- code-reviewer: Med 2 defer(M1 controlled 스냅백, M2 no-op fallback), Low 3. 계획 이탈 2건(파일명·type=text) 타당.
- safety-auditor: S1~S5 전축 통과. Low 2(초대형 나이 문자열→blocked 보수 방향, 프로필→위기 순서 테스트 권고).
- integration-qa: 경계면 4/4 정합, 게이트 6/6(커버리지 임계 충족·audit 신규 0·플레이키 0). Med D1: `useProfileState` 단위 테스트 0%(하네스가 실훅 대신 복제) — defer.

## 수정 루프: 라이브 검증 blocker → 검색 지역 인지
- **재현**: 부산(26)·25 → "월세 지원 궁금해" → 결과 0. 원격 top-10이 전부 타 지역(검색이 지역 무지) → 클라 regionAxis 전량 blocked. DB엔 "부산 청년 월세 지원" 존재.
- **수정**: `traverse`(state.profile.regionCode→opts) → `remoteSearch`(body regionCode) → Edge Function(q_region 전달) → `search_policies(q_region text default null)` filtered CTE에 `전국 ∥ 코드일치 ∥ 지역미상(빈배열) 보존` 술어. 인메모리 degrade는 topK 절단 前 색인 pre-filter(`filterIndexByRegion`). 자격 권위는 클라 eligibility(서버 필터는 후보 품질용). q_region null=현 동작 동일. +8 테스트.
- **운영자 재배포**: setup.sql 재실행 + `supabase functions deploy search` (완료).

## 라이브 재검증 (전부 통과)
- 함수 직접: regionCode=26 → #1·2 "부산 청년 월세 지원", 부산+전국만(타지역 유입 0). 미전달 → 기존 동작 동일.
- 브라우저: 부산·25 "월세" → 카드 5(전세보증금반환보증 '지금 신청 가능'·부산 주거 4). 숨김분은 모집종료(2026-05-29 등) RECRUIT_CLOSED 정직 차단. 콘솔 에러 0.
- 게이트: 669 tests(43 files)·tsc 0·eslint 0·build OK.

## 잔여 (defer 기록)
- **R1** 소득 입력 UI 부재 — income medianRatio 100 하드코딩. 저소득 한정 정책(예: 부산 월세, maxRatio 60)이 실제 저소득 사용자에게도 INCOME_OVER_LIMIT로 숨겨질 수 있음(현재는 해당 정책들 모집종료라 무해). 다음 프로필 확장 1순위.
- **R2** 프로필 localStorage 영속화(useProfileState 경계 준비됨).
- **D1** useProfileState 단위 테스트(초기값·병합·income 보존).
- M1/M2/L* — 38_review·38_safety-audit·38_qa 참조.
- C4(CORS 제한·레이트리밋·near-dup·마운트 검색 가드) 별도 대기.
