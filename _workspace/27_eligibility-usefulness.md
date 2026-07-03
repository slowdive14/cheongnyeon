# 자격 신뢰도 개선 — 전국민 연령무관 통과(A) + review 등급화(B) (안전 직결)

날짜: 2026-06-25 · 사용자 승인(A+B) · TDD + 브라우저 실측 + 게이트

## 배경(실데이터 진단으로 확정)
- 마음건강 funnel이 결과 0("맞는 정책 못 찾음")이던 원인: 캐시(=실 온통 데이터 474건)의 마음건강
  7건이 대부분 **전국민·소득무관이지만 나이 null** → ageAxis가 보수적으로 `review(AGE_UNKNOWN)` →
  ResultList가 (당시) review 미노출 → 빈 화면.
- 실 API(getPlcy) 명세 확인: `sprtTrgtMinAge/MaxAge/AgeLmtYn` 존재하나, 전국민 정책은 0/0·null이
  많고 AgeLmtYn 신호가 불안정. 좋은(나이 있는) 마음건강 정책은 다수 지자체 사업이라 서울 필터에
  걸러짐. → 재인제스트만으론 해결 안 됨(재인제스트는 동일 474건 재생산 확인).

## 수정 (RED→GREEN, 사용자 승인)
**A. ageAxis — 전국민 연령무관 통과** (`src/domain/eligibility.ts`)
- 나이 양쪽 null일 때: `isNationwide===true`면 `PASS`(연령 무관 간주), 비전국이면 기존대로
  `review(AGE_UNKNOWN)`(보수 유지). 추정 고지·원문 확인은 카드가 담당.
- 테스트: A-9(전국민 null→now), A-10(비전국 null→review 유지), A-11(전국민 null+프로필나이없음→now),
  P-1(비전국으로 정정), 불변식 #293(비전국으로 정정).

**B. review 등급화** (`PolicyResultCard`/`ResultList`)
- 확인 항목 1개 → 배지 '거의 충족' + "○○만 확인하면 돼요"(sky). 여러 개 → '자격 확인 필요' +
  "확인 항목: ○○ · ○○"(slate). ResultList는 미확인 적은 순(=적격에 가까운 순) 정렬.

## 효과 (실 캐시 데이터, 데모 프로필 25/서울)
- 마음건강 7건: `now=0/review=6(전부 AGE_UNKNOWN)` → **`now=2`**(심리상담 바우처·전국민 마음투자
  "지금 신청 가능") + blocked 1 + **review 4(전부 단일 RECRUIT_UNKNOWN → '거의 충족')**.
- 브라우저 실측: '지치고 무기력해요' → '지금 신청 가능' 카드 2 + '거의 충족' 카드. 콘솔 에러 0.

## 안전 불변식
- blocked(명확 부적격) 여전히 미노출. ✅
- 비전국 연령불명은 보수 유지(review). 전국민만 완화. ✅
- 모든 결과 카드에 '추정' 고지 + 원문 확인 링크. ✅ (오자격 방지 — 단정 아님)
- 위기 라우팅·throw-free 미접촉. ✅

## 게이트
- 테스트 **565 passed (33 files)** · tsc 0 · eslint 0.
- coverage: domain branches 93.9%, eligibility 91.9%, ui/funnel branches 81.9% — threshold 충족.

## 한계·후속
- 전국민 null-age 완화는 휴리스틱(isNationwide). 더 정확히 하려면 인제스트가 `sprtTrgtAgeLmtYn`을
  Policy 모델에 흡수(어댑터 확장) — 후속.
- 지자체 마음건강 정책(나이 있음)이 서울 필터에 걸러짐 → 스코프 확장은 별도 결정(길 C, 미착수).
- 소득 금액(earnMinAmt/MaxAmt) 미구조화 → 일부 INCOME_UNKNOWN 잔존(후속 레버).
