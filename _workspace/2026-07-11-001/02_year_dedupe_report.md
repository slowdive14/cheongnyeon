# 02 · 연도 변형 결과 dedupe + 카테고리 중복 표기 수정 — 구현 보고

작성: implementer · 2026-07-11 · 방식: TDD(RED→GREEN→REFACTOR)

## 문제
같은 사업의 연도 변형이 결과에 나란히 노출돼 혼란(올해판 "지금 신청돼요" + 작년판 "모집 시기 확인").
M-1 억제는 "연도 변형 유지"가 의도이므로 인제스트에선 안 걸림 → **클라 결과 후처리**로 그룹당 최신·유효판 1개만 노출.
부수로 성북구 카드의 카테고리가 "일자리,일자리"로 중복 표기되던 버그 동반 수정.

## 구현

### 1) 순수 유틸 신설 — `src/ui/funnel/dedupeYearVariants.ts`
- **그룹 키**: 제목에서 연도 토큰 `(19|20)\d{2}년?` 제거 후 기존 `normalizeName`(src/data/similarity.ts) 재사용.
  - 괄호 지역명 등 나머지 토큰은 그대로 남음 → "(성북구)" vs "(중랑구)"는 절대 같은 그룹이 안 됨.
  - 정규화 결과가 빈 문자열(깨진 제목)이면 그룹핑 제외(서로 다른 정책 오은폐 방지).
- **대표 선정 우선순위**: 상태 버킷 now(3) > soon(2) > review(1) → 제목 연도 큰 것 → updatedAt 최신 → id 안정 tie-break.
- **버킷 횡단 그룹핑**: now/soon/review를 하나로 모아 그룹 선정 후, 대표만 원래 버킷에 남기고 나머지 숨김. blocked는 대상 제외(애초 미노출, 안전 표면 무접촉).
- **순수·throw-free·결정적**: 시계 미사용(updatedAt은 `Date.parse` 원문 파싱만, 현재 시각 안 읽음). 비배열 입력도 방어.

### 2) `ResultList.tsx` 배선
- 렌더 직전 `dedupeYearVariants({ now, soon, review })` 1회 후처리. blocked는 전달 안 함(무접촉).
- 빈 결과·단일 결과 무영향(그룹 단독이면 그대로 유지). 기존 review 정렬(미확인 항목 적은 순)은 dedupe 결과 위에 그대로 적용.

### 3) 카테고리 중복 표기 수정 — `PolicyResultCard.tsx`
- `displayCategory(category)` 헬퍼: 콤마 분리 → trim → 중복 토큰 제거 → `, ` 재조합.
- 배지 텍스트만 `displayCategory(policy.category)`로 교체. 색 매칭 `categoryTag`는 원문 category를 그대로 써서 색 로직 무영향.

## 보수 가드(안전) 확인
- **전멸 금지**: 그룹에 항상 대표 1개는 남음(테스트로 잠금). 같은 이름의 더 신선한 판이 남으므로 오은폐 아님.
- **지역 분리**: 연도 없는 완전 동일 제목이라도 지역 토큰이 키에 남아 분리됨(테스트 확인).
- 위기·고지·상태 라벨 등 안전 표면 무접촉(버킷 재배치 없이 숨김만, blocked 미전달).

## 테스트(통과)
`test/unit/ui/dedupeYearVariants.test.ts` (신설, 10):
- now 올해판 + review 작년판 → now판만
- 둘 다 review → 연도 큰 것만
- (성북구) vs (중랑구) → 둘 다 유지
- 연도 없는 단독 → 무영향 / 빈 결과 → 무영향
- 버킷 횡단(soon vs review), 상태 동률→updatedAt, 전멸 금지, id 안정 tie-break(입력 순서 무관), 지역 토큰 분리

`test/unit/ui/ResultList.test.tsx` (+2): 후처리 배선(now판만 노출), 단일 결과 무영향.
`test/unit/ui/PolicyResultCard.test.tsx` (+2): "일자리,일자리"→"일자리" 1회, 서로 다른 다중 태그 보존("일자리, 주거, 일자리"→"일자리, 주거").

## 게이트 결과
- `npx vitest run --exclude "**/.claude/**"` → 54 files / **866 passed**
- `npx tsc --noEmit` → 통과(무출력)
- `npx eslint src test scripts` → 통과(무출력)

## 남은 TODO / 인계
- 제약 준수: seoulClient/ingest/scripts/supabase/FunnelContainer 무접촉. FunnelContainer 후속 ③은 예정대로 별도.
- 유틸이 커버하는 건 **정규화 키 완전 동일** 그룹만. 사용자 예시의 "청년 국가기술자격 응시료 지원 사업" vs "…자격시험… 지원사업"처럼 토큰 자체가 다른(연도 무관) 변형은 의도적으로 그룹핑 안 함(과잉 병합·오은폐 방지). 향후 유사도 임계 기반 확장이 필요하면 별도 판단 요청.
- 리뷰 요청: `code-reviewer` + `safety-domain-auditor`(결과 노출 억제 = 안전 표면 인접).
