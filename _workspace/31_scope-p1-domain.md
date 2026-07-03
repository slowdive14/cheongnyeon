# 스코프 확장 Phase 1 — 도메인 개방 (마음건강 → 전 영역)

날짜: 2026-06-28 · 사용자 승인 시퀀스 P1 · TDD + 브라우저 실측

## 목표
자유입력 검색을 마음건강 단일 도메인 → 전 영역(일자리·주거·교육·복지 등)으로. 재인제스트 불필요(현재 데이터에 이미 다영역 존재, 서울필터 상태 유지).

## 근거
- `hybridSearch.isHardExcluded`는 allow-list(restrict-to): `hardCategories` 미지정/빈 값 → 하드필터 없음 → 전 영역 검색.
- 기존 entry(mentalHealthGraph)는 `allowedCategories:['마음건강']`로 마음건강만 제한.

## 변경
- **신규 `domain/graph/domains/youthPolicy.ts`**: 멀티도메인 entry(allowedCategories 미지정) + 예시 칩 5
  (마음건강/일자리/주거/교육/복지, 라벨=질의·영역 키워드 포함) + safety 노드.
- **App.tsx**: `mentalHealthGraph` → `youthPolicyGraph`.
- **PolicyResultCard**: 영역(category) 배지 추가 — 교차영역 결과 식별.
- 테스트: youthPolicy 구조(전 영역 entry·예시≥4·safety·id고유), 카드 영역 배지.

## 안전 불변
- 위기 라우팅 도메인 무관(detectCrisis가 질의에서 직접) — 변경 없음.
- 추정 고지·원문 링크·보수 자격 판정·그라운딩 설명 — 도메인 무관, 그대로.
- 기존 mentalHealthGraph·관련 테스트는 불변(App만 새 그래프 사용) → 회귀 0.

## 검증
- 테스트 **577 passed (34 files)** · tsc 0 · build OK.
- 브라우저: 초기 화면 멀티도메인 칩 5개. 자유입력 "월세 보증금 주거비" → 주거(청년주택드림청약통장)·
  금융복지·일자리 등 **교차영역 결과 + 영역 배지**. 콘솔 에러 0.
- 주의: 키 없는 키워드 검색은 순위 거침("지원" 등 범용어). 키 있으면 의미검색이 영역 적중 상위.

## 다음 (P2 — 지리 확장)
서울→전국: 지역코드 17 시·도 매핑, 인제스트 서울필터 제거+재인제스트, 자격 지역축 계층, 프로필 지역 UI,
임베딩 precompute(수천 건 비용·지연 선결). 규모가 커 별도 진행.
