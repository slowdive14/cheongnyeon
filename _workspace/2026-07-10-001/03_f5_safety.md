# F-⑤ 카드 펼침(신청 동행) — 안전·신뢰 감사

- 대상: `src/ui/funnel/PolicyResultCard.tsx`, `DESIGN.md`, `test/unit/ui/PolicyResultCard.test.tsx`, `test/integration/funnel/funnel.crisis.test.tsx`
- 데이터 소스: `src/data/static/documents.ts`
- 테스트: `npx vitest run PolicyResultCard.test.tsx funnel.crisis.test.tsx` → **2 files / 48 tests PASS**

## 판정: PASS — 머지 가능 (High 위반 0)

안전 불변 5항목 모두 통과. 등급 정책상 수정 요구 없음. Low 관찰 1건은 defer.

## 불변식별 검증

### 1. 자격 단정 금지 — PASS
- 3단계 hint, "오늘은 이것만", 서류 목록 전체에서 "신청하면 됩니다/자격이 됩니다"류 단정 부재.
- 3단계 ③ "접수하면 결과 안내를 기다리면 돼요"는 자격 판정이 아닌 절차 안내 — 위반 아님.
- 펼침이 "이 정책에 이 서류가 필요"로 특정하지 않음. 등본은 정책 무관 공통 서류로 프레이밍하고, 3단계·오늘은 이것만 양쪽에 "필요 서류는 원문에서 확인해요" 확인 프레임 명시. 단위 테스트(`box.toHaveTextContent(/원문에서 확인/)`)로 잠김.

### 2. 날조 0 — PASS
- 모든 서류 값이 `documents.ts` 확정 레코드에서만 유입. `COMMON_DOCS`는 존재하는 id만 `getDocument().filter()`로 통과(미지 id→undefined 제거).
- 수수료: `feeText` — null→"확인 필요", 0→"무료", 그 외 원 표기. 소요: `minutesText` — null→미표기(렌더 생략). 지어내기 경로 없음.
- 회귀 잠금: 재직증명서(fee:null·estMinutes:null)가 "확인 필요"로 뜨고 소요 미표기됨을 테스트가 단언.
- 정책별 절차·기간·기관 표기 생성 없음(3단계는 정책 무관 고정 일반 단계).

### 3. 위기 불변식 — PASS (구조적 + 테스트 이중 잠금)
- `FunnelContainer` L86–92: `if (inCrisis) return <SafetyBanner/>` early-return이 결과 JSX보다 앞. `ResultList`(→`PolicyResultCard`→F-⑤ 토글)는 비위기 분기(L179)에만 존재. 우회 경로 없음.
- `funnel.crisis.test.tsx` B2 회귀에 T-F5 단언 추가: 위기 시 `button[name=/신청 준비 같이 보기/]`·`apply-roadmap` 미렌더 확인. crisis+result 공존 시나리오에서도 safety region 단독.

### 4. 고지·링크 유지 — PASS
- 펼침 섹션은 CTA·저장·브리지·DisclaimerNote **위**에 삽입(DESIGN §4 중복 배치 금지 준수). 펼침 자체는 링크·고지를 생성하지 않음.
- 테스트: 펼침 후 `getAllByRole('link')` 길이 1, `getAllByText(/추정/)` 길이 1 — 중복/누락 없음 회귀 잠금.

### 5. 응원 카피 절제 — PASS
- F-⑤ 카피 전체에 느낌표 0, "간단히/쉽게" 0, 시스템 주어 0. `queryByText(/간단히|쉽게/)` null 단언으로 잠금.
- 톤 절제(라인 톤 토글, hint는 "~해요/~하면 돼요" 1줄).

## Low (defer) — 수정 불요
- "오늘은 이것만"의 "주민등록등본 1통" 수량 표기는 정책별 요구가 아닌 공통 첫 걸음 프레이밍(DESIGN에서 명시 승인)이고 직후 "필요 서류는 원문에서 확인해요"가 붙어 오해 위험 낮음. 향후 원문에 등본 불요 정책이 다수면 카피 재검토 여지 — 안전 위험 아님, defer.
