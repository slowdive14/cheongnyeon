---
name: tdd-cycle
description: 청년정책 진단 MVP를 RED→GREEN→REFACTOR로 구현하는 방법을 정의. vitest + RTL 스택, 계층별(도메인 순수함수/데이터/LLM/UI) 패턴, fixture·mock·clock 주입, 보수적 자격 판정 규칙을 담는다. tdd-implementer가 코드를 쓸 때, 또는 테스트 작성·구현 방법이 필요할 때 사용.
---

# TDD Cycle — 청년정책 진단 구현 방법론

테스트 먼저. 이 프로젝트의 신뢰는 정확성에서 나오고, 정확성은 실패하는 테스트를 먼저 보는 데서 시작된다.

## 사이클
1. **RED** — 명세의 테스트를 작성하고 `npm test`로 **실패를 눈으로 확인**. 함수 미존재 FAIL이 정상. 실패 메시지가 의도와 맞는지 본다.
2. **GREEN** — 통과시키는 **최소** 구현. 미래 대비 추상화 금지.
3. **REFACTOR** — 그린 유지하며 명명·헬퍼 추출·타입 좁히기. 매 변경 후 재실행.

## 스택
- vitest(`npm test`, `--coverage`는 `@vitest/coverage-v8`), `@testing-library/react` + `jest-dom` + `jsdom`(UI).
- 테스트 위치: `test/unit/{domain,data,llm}`, `test/integration/{funnel,ingest}`, `test/e2e`, `test/fixtures`.

## 계층별 패턴

### 도메인 (`src/domain`) — 순수 함수
- 부수효과·I/O 금지. 시간은 **clock 주입**(`Date.now()` 직접 호출 금지) → 모집상태 테스트가 결정적.
- `normalizePolicy`: 연령 `19~34` 파싱, 소득·지역코드, 모집기간, **누락/이상치 방어**(빈 문자열·null·깨진 fixture → throw 없이 안전 처리).
- `eligibility.evaluate(profile, policies) → {now, soon, blocked}`: 경계값(나이 34 통과/35 탈락), **애매하면 "확인 필요"**(탈락 아님), 필수조건 누락 시 보수 처리. `blocked`는 사유 코드 포함.
- 모집상태: 날짜 기준 now/soon(임박)/closed, 고정 clock 주입.
- 규칙은 선언적 조건 테이블로 추출(새 규칙 추가 용이).

### 데이터 (`src/data`)
- 받기→정규화→중복제거→캐시 write. 키 미설정 시 fixture 모드(`test/fixtures/*.sample.json`).
- 캐시는 로컬 JSON ↔ Firestore 교체 가능한 인터페이스 뒤. 신선도 타임스탬프 부여.
- 커버리지 갭: 온통청년 vs 몽땅을 정책명·주관기관 정규화 매칭 → 갭률 리포트.

### LLM (`src/llm`)
- Gemini는 **해석·질문·설명만**. 후보·자격은 엔진. 테스트는 Gemini **mock**.
- `classify`: 키워드 우선("힘들어요/우울/번아웃"→마음건강) → AI fallback → 디바운싱. 실패 시 영역 선택 버튼으로 degradation.
- `explain`: 정책 record 주입(그라운딩). 없는 정책·필드 날조 못 하게 입력·후처리 검증.
- `crisisGuard`: 위기 표현 감지 시 분류·설명보다 안전 라우팅 우선, 치료 조언 텍스트 생성 금지.

### UI
- RTL로 깔때기 클릭 흐름 통합 테스트(입구→갈래→구체화→결과). 결과에 2상태·원문 링크·'추정' 고지·최종 업데이트 노출, **막힘 카드 미노출** 검증. 위기 시 안전자원 배너 최상단.
- 접근성: 키보드·aria·대비.

## 완료 정의
- 대상 테스트 100% 그린(스킵 없음), 커버리지 목표 충족, 3회 연속 flaky 없음.
- `npx tsc --noEmit`·`npm run lint`·`npm run build` 통과.
