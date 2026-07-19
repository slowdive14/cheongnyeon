# 44 — 위기 라우팅 2단계(작성 중 인라인 배너) 구현 기록

2026-07-20 · 승인안 ①(사용자 결정) · 리더 직접 구현

## 배경
위기 문구를 **타이핑하는 중간에**("놓아버리"까지만 쳐도) 전체 위기 화면으로 전환 → 말이 끊기고 쓰던 글 소실. 상담자 관점 지적(사용자): "말을 끊지 말 것". 단 감지·노출 시점 지연은 금지(안전 불변).

## 실행 방식 메모 (하네스 이탈 기록)
- tdd-implementer 에이전트가 **세션 한도(3:30am 리셋)로 판정 전 중단**(22 tool call, 코드 무변경 — 탐색만).
  에이전트의 발견(기존 테스트 3곳이 옛 동작 단언: freeInput UI-2/2b/10)은 인계받아 반영.
- 선례(2ae530b)대로 **리더가 직접 구현·검증**. code-reviewer/safety-auditor 정식 투입은 한도 리셋 후 재가동 가능
  (안전 축 자체 점검은 아래 §안전 검증).
- 부수 정리: 중단 에이전트가 남긴 stale worktree 2개 제거(`bold-mcclintock`, `optimistic-khorana` — 옛 테스트 사본이 게이트를 오염).

## 변경 파일
- **신규** `src/ui/funnel/SafetyInlineNotice.tsx` — 작성 중 위기 컴팩트 배너(role=alert, `data-funnel-region="safety-inline"`,
  헤드라인 SafetyBanner와 동일 문구, tel 링크는 resources 기반·throw-free).
- `src/ui/funnel/FreeTextInput.tsx` — `onCrisisSubmit?: () => void` 추가(위기 상태 전송 시도 신호). 감지·억제 로직 무변경.
- `src/ui/funnel/FunnelContainer.tsx` — `crisisCommitted` state. 전체 화면 = `funnel.crisis || crisisCommitted`.
  작성 중 위기(freeCrisis)는 입력을 **고정 슬롯에 유지**(리마운트 방지 = 글 보존: 조건부는 모두 고정 표현 슬롯,
  ProfileInput은 래퍼 div 유지·내용만 접음)하고 정책 콘텐츠(헤드라인·프로필·결과·예시·동행·신청함·CrisisFooter) 미렌더.
  returnToSearch가 crisisCommitted도 해제.
- `DESIGN.md` — §7.1을 2단계((a) 작성 중 = 인라인·글 보존 / (b) 제출 = SafetyBanner 단독+복귀 링크)로 개정, §4 인벤토리 행 추가.

## 테스트
갱신 6: freeInput UI-2(통합)·UI-2b(글 보존 단언으로), UI-10(제출 경유 전체 전환으로), funnel.crisis F(Enter 경유),
funnel.ui A4(타이핑=인라인+카드 숨김 → Enter=전체), app.profile T-권고1(2단계 반영).
신규 4: T-IC1(감지 즉시·동기 + 글 보존) · T-IC2(정책 표면 전부 미렌더 + safety-inline region) ·
T-IC3(위기 문구 삭제 → 자동 복귀) · T-IC4(위기 Enter → traverse 추가 호출 0 + 전체 전환).
불변 유지 확인: B2(제출 위기 화면 safety 단독), profileInput T5 2건(무수정 통과).

## 게이트
**927 tests(56파일) 전부 그린** · `tsc -b` 0 · eslint 0.

## 안전 검증(리더 자체 점검 — 안전 축별)
- 노출 시점: T-IC1이 **동기 조회**(findBy 아님)로 같은 렌더 사이클 노출을 잠금. 지연 0.
- 거짓음성: 감지 로직(crisisDetect·CRISIS_PATTERNS) 무접촉.
- 검색·생성 억제: FreeTextInput 위기 시 onSubmit 미호출 경로 무변경 + T-IC4가 traverse 호출 불변 잠금.
- 위기·정책 병렬 금지: T-IC2가 표면 7종 미렌더 잠금. CrisisFooter 숨김은 인라인 배너가 동일 번호 2건을 대체(중복 제거).
- 제출 위기 화면(B2 단독 불변)·SafetyBanner 컴포넌트: 무변경.
- 라이브 검증(실브라우저, dev): 타이핑 위기 → 인라인 배너(tel:109·tel:1577-0199)+글 보존+정책 숨김 → 문구 삭제 → 자동 복귀 →
  재입력+Enter → 전체 화면(입력 0·복귀 링크) → 복귀 → 홈 원복. 전 단계 DOM 실측 확인.

## 잔여
- code-reviewer·safety-domain-auditor 정식 검수는 세션 한도 리셋(3:30am) 후 재가동 가능(선택 — 게이트·안전 축 자체 점검 완료 상태).
