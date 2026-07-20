# 44 — 코드 리뷰: cc9b188 위기 라우팅 2단계 (code-reviewer, 2026-07-20)

게이트 독립 재확인: tsc --noEmit 0 · eslint(변경 3파일) 0 · 영향 테스트 53 그린. **판정: 승인(blocker/High 0)**.

## Med-1 (안전 에스컬레이션 → 리더 판정: 안전 우선으로 즉시 수정) — ✅ 후속 커밋에서 해소
- **결함**: 작성 중 위기(1a)에서 상단 브랜드 클릭 → returnToSearch가 freeCrisis만 해제, FreeTextInput 내부 value는 리셋 불가(언마운트 없음) → **위기 문구가 배너 없이 입력에 잔존**(다음 키 입력까지). "위기·정책 병렬 금지" 창.
- 완화 요인: 의도적 행위 필요·다음 키에 자가 복구·CrisisFooter는 복귀·정책 결과 카드는 없음 — 그래서 blocker 아님.
- **수정**: inputEpoch state + `key={inputEpoch}` — returnToSearch 시 리마운트로 빈 입력 보장(감지 중 불변이라 1a 글 보존과 무충돌). 회귀 잠금 **T-IC5**. DESIGN §7.1(a)에 "초기화 동작은 입력도 함께 비운다" 명문화. 실브라우저 검증(브랜드 클릭 → value '').

## Low (defer — 기록)
- L1 resources가 비위기 렌더마다 safetyResources() 클론(죽은 할당) — 분기 내부/useMemo 권장.
- L2 인라인 배너 safetyResources() 중복 호출(미세).
- L3 인라인 배너의 번호·tel 링크 미단언 → ✅ 후속 커밋에서 해소(SafetyInlineNotice.test 7종 + T-IC2 tel href 단언 — 안전감사 Low-2와 공통 지적).
- L4 타이핑 위기 시 ProfileInput 언마운트로 펼침 상태만 초기화(값은 보존) — 경미.
- L5 onExample의 setFreeCrisis(false)는 죽은 방어(도달 불가 확인) — 무해.
- L6 중첩 삼항 가독성 — 명명 변수 추출 여지.
- L7 주석 정밀도: 래퍼 div 유지가 리마운트 방지의 필요조건은 아님(falsy도 슬롯 점유) — belt-and-suspenders로 무해.
- L8 유지보수: FreeTextInput 보존은 "조건식=1슬롯" 불변에 의존 — 슬롯 앞에 가변 길이 형제 삽입 금지(보존 테스트가 가드 중).

## 축별 확인(요청 항목)
1. 고정 슬롯 견고성: 건전, key 불필요(hero T-IC1·compact A4 실증). 2. crisisCommitted 해제 경로 완전(stuck 없음). 3. onCrisisSubmit 계약 무결(소비처 1곳·옵셔널·회귀 0). 4. T-IC1~4가 스펙 4점을 강하게 잠금(동기 getBy 선택 타당).
