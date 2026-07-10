# F-⑤ 카드 펼침 — Code Review (기술 품질)

대상: `src/ui/funnel/PolicyResultCard.tsx`, `test/unit/ui/PolicyResultCard.test.tsx`, `test/integration/funnel/funnel.crisis.test.tsx`, `DESIGN.md`

## 게이트
- `npx tsc --noEmit` → 통과(무출력).
- `npx vitest run --exclude "**/.claude/**"` → **846 passed / 53 files**. 회귀 없음, skip·flaky 없음.

## 등급별 건수
- blocker: 0
- High: 0
- Should(defer): 2
- Low/Nit: 3

**결론: blocker/High 없음 → 커밋 진행 가능.** 아래는 개선 제안(defer).

## Should (defer)
1. **`aria-controls` 미연결.** 토글 버튼에 `aria-expanded`는 있으나 펼침 영역을 가리키는 `aria-controls`가 없다. 스크린리더에서 토글-패널 관계가 약해진다. 펼침 `div`에 `id` 부여 후 연결 권장. (지원 편차가 있어 blocker 아님.)
2. **등본 중복 노출.** 펼침 시 `주민등록등본`이 "오늘은 이것만"(FIRST_STEP_DOC)과 "자주 쓰는 서류"(COMMON_DOCS 첫 항목) 양쪽에 등장한다. "오늘의 초점 vs 참고 목록"이라는 의도된 프레임이지만 시각적 중복으로 읽힐 수 있음. COMMON_DOCS에서 resident_copy 제외 검토 가능.

## Low / Nit
- **이중 구분선(nit):** 펼침 섹션 컨테이너(`border-t pt-3`)와 바로 아래 액션 바(`border-t pt-3.5`)가 접힘 상태에서 인접해 얇은 가로줄 2개가 붙어 보일 수 있음. 어제 반응형 푸터 수정과 직접 간섭은 없음(footer flex-wrap 무변경 확인).
- **`firstDocMinutes` 위치(nit):** 모듈 상수 `FIRST_STEP_DOC`에서 파생되는 불변값인데 컴포넌트 본문에서 매 렌더 계산. 모듈 레벨 상수로 승격 가능(비용은 무시할 수준).
- **접힘 복귀 테스트 부재(nit):** 토글 두 번 클릭 시 다시 접히는 경로는 미검증. 단방향 상태라 위험 낮음.

## 잘한 점(확인)
- `APPLY_STEPS`/`COMMON_DOCS`/`FIRST_STEP_DOC` 모두 모듈 상수 — 렌더 시 재계산 없음(React 관용성 양호).
- `COMMON_DOCS` 구성 시 `getDocument` + `.filter((d): d is DocumentInfo => d !== undefined)` 타입가드로 존재 id만 통과 → 날조 0, `any` 없음.
- `feeText`(null→"확인 필요", 0→"무료")·`minutesText`(null→미표기) 순수 함수, null 분기 정확.
- 위기 경로 회귀 테스트 추가(토글·로드맵 미렌더 확인) — 안전 라우팅 우회 없음.
- 배치 순서 테스트(compareDocumentPosition)로 펼침 섹션이 CTA·고지 위에 오고 link·"추정" 1회 유지 검증 → 중복 배치 금지 실증.
