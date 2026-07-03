# 자유입력 1차화 — 글→질의→정책 직접 노출, 칩=예시 quick-start (UX 재설계)

날짜: 2026-06-28 · 사용자 방향 확정("스코프는 나중에, 자유입력 1차화 먼저") · TDD + 브라우저 실측

## 배경
- 기존: 첫 화면이 칩 3개("마음이 어떤가요?") 1차 메뉴 + 자유입력은 부가(단일 도메인이라 전송=no-op).
- 문제: "넌 뭐가 필요한지 모른다" 전제와 칩 자가분류가 충돌, 3개라 한정적, 자유입력이 결과를 못 냄.
- plan 의도([PLAN:29](docs/plans/PLAN_youth-policy-diagnosis-mvp.md:29)): 자유입력→해석→정책+설명.

## 변경 (소스 3 + 테스트)
- **useFunnel**: `queryOverride?` 추가 — 있으면 노드 concept 대신 그 질의로 traverse. (`src/ui/funnel/useFunnel.ts`)
- **FreeTextInput**: `onDomain`/`llm`/classifyDomain 제거 → **`onSubmit(글 원문)`**. 위기 재확인 후 비위기면
  글을 그대로 질의로 전달(분류 불필요 — 의미검색이 의도 포착). 버튼 '정책 찾기'. (`FreeTextInput.tsx`)
- **FunnelContainer**: `query` 상태. 자유입력 1차(주인공). query 있으면 결과(ResultList) + '← 다시 찾기' +
  M1 푸터, 없으면 예시 칩. **칩=엔트리 갈래를 '이렇게 적어도 돼요'로** — 클릭 시 라벨을 질의로 채워 같은
  검색 실행(별도 funnel 네비 제거). FunnelStep·findNodeByDomain 제거. (`FunnelContainer.tsx`)
- 테스트: freeInput.ui 전면 재작성(onSubmit·예시칩·위기), 통합 journey는 칩→질의→검색으로 동작 보존.

## 안전 불변식 (유지·실측)
- 위기 최우선: 자유입력 위기어 → 실시간 layer-1 → **SafetyBanner 단독, 입력/결과/설정 억제**. ✅ (브라우저: "죽고 싶어" → 배너만)
- 비위기 결과: '추정' 고지 + 원문 링크 + 위기 안내 푸터. ✅
- blocked 미노출·throw-free 유지. ✅

## 브라우저 실측
- 초기: 자유입력 hero + 예시 칩("이렇게 적어도 돼요").
- "요즘 너무 무기력하고 심리상담이 받고 싶어요" → '정책 찾기' → **심리상담 바우처 등 '지금 신청 가능' 카드**.
- "다 끝내고 싶어 죽고 싶어" → **SafetyBanner 단독**. 콘솔 에러 0.

## 게이트
- 테스트 **564 passed (33 files)** · tsc 0 · eslint 0 · coverage: ui/funnel branches 89.4%(≥80) 충족.

## 잔여 (다음)
- **'왜 맞는지' 설명 배선**: explain.ts(그라운딩 가드)는 있으나 결과 카드에 아직 미배선 → 자유입력 흐름의
  "쉬운 정책 설명" 부분 미완. 키 있을 때 카드별 explain 호출 + 로딩/폴백 필요.
- 스코프 확장(서울→지자체)·소득 금액 구조화는 보류(별도).
