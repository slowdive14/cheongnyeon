# 01 반응형 결과 화면(2열 그리드) + 카드 푸터 줄바꿈 — 구현 보고

날짜: 2026-07-10 · 작업: UI 레이아웃(TDD, RED→GREEN) · 카피/안전 표면 불변

## 요구 대응
1. **데스크톱 결과 = 2열 카드 그리드.** 결과 카드가 실제로 뜰 때만 셸을 넓히고 카드 목록을 lg 2열 그리드로.
2. **카드 하단 줄 깨짐 수정.** 메타 줄 flex-wrap + whitespace-nowrap으로 '저장' 글자 세로 꺾임 제거, 좁은 폭 CTA 전폭 한 줄.

## SSOT 선반영
- `DESIGN.md` §3.1 반응형 레이아웃, §3.2 카드 푸터 줄바꿈 신규 추가(코드 변경 전 결정 기록).

## 변경 파일·클래스 전략
- `src/ui/funnel/FunnelContainer.tsx`
  - `wideShell = showResultHeader`(노출 카드 ≥1일 때만) → 셸 `max-w-[420px] lg:max-w-5xl`. 홈·로딩·빈결과·위기 화면은 `max-w-[420px]` 현행 유지.
  - 상단부(브랜드 바·헤드라인·프로필·자유입력)와 하단부(동행·위기 푸터·신청함)를 중앙 레일 `lg:mx-auto lg:w-full lg:max-w-xl`로 묶어 과폭 방지. 결과 카드 그리드만 전폭.
- `src/ui/funnel/ResultList.tsx`
  - 결과 컨테이너 `space-y-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-3 lg:space-y-0`. 모바일 1열 유지, lg 2열. `lg:items-start`로 행 높이 늘어남 방지(masonry 불필요, 자연 흐름). `data-testid="results-list"` 추가(회귀 앵커).
- `src/ui/funnel/PolicyResultCard.tsx`
  - 메타 줄 `flex flex-wrap items-center justify-between gap-x-3 gap-y-2.5` + `data-testid="policy-card-actions"`.
  - 날짜 span·저장 버튼에 `whitespace-nowrap`(글자 세로 꺾임 차단), 아이콘 `shrink-0`.
  - CTA `w-full ... sm:w-auto sm:justify-start`: 좁은 폭 전폭 한 줄, sm 이상 한 줄 복귀. 기존 pill·색·카피·터치 크기 불변.

## 안전 표면 불변 확인
- 위기 배너 단독 렌더 분기(max-w-xl)·추정 고지·원문 링크·상태 라벨 문구 전부 미변경. 이번 작업은 레이아웃 클래스만.
- funnel.crisis 테스트 무파손.

## 테스트(추가 RED→GREEN)
- `test/unit/ui/ResultList.test.tsx`: 결과 컨테이너 lg:grid-cols-2 + space-y-3 클래스 단언.
- `test/unit/ui/PolicyResultCard.test.tsx`: 푸터 flex-wrap 클래스 단언.
- `test/integration/funnel/funnel.ui.test.tsx`: 결과 화면 main 셸 lg:max-w-5xl 단언(A2). 기존 T-E4 등 무파손.

## 게이트 결과
- `npx vitest run test/ --exclude '**/.claude/**'`: **839 passed / 53 files**(836 baseline + 신규 3).
- `npx tsc --noEmit`: **0 errors**.
- `npx eslint .`: **0 errors**(경고 3건은 병렬 세션 worktree `.claude/worktrees/.../coverage/*` 생성물 — 본 작업 무관).

## 유의(리더 인계)
- 전체 `npx vitest run`(worktree 포함) 시 `.claude/worktrees/bold-mcclintock-871ee0/`의 seoulKnownKeys/seoulClient 12건 실패는 병렬 세션 미완 산출물(`@/data/seoulKnownKeys` 미존재)로 본 작업과 무관. 제약상 미접촉.
- 브라우저 실측(포트 5190)은 리더 담당. 확인 포인트: lg에서 2열·상단 레일 중앙 정렬, 좁은 폭 카드 푸터 CTA 전폭 줄바꿈·저장 글자 안 꺾임.

## 남은 TODO
- 없음(요구 2건 완료).
