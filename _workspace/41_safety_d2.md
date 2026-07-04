# 41 Safety/Domain Audit — D-② (혜택 한 줄 재생성 + 카드 표시)

- 대상 커밋: `047e634` feat(explain): D-② 혜택 한 줄 재생성 + 카드 표시
- 감사 축: 그라운딩 · 날조 방지 · 자격단정 금지 · '추정' 고지 · 위기 억제 불변
- 판정: **안전 게이트 PASS** — 신규 High/Med 위반 0. Low 관찰 2건(모두 defer 가능, 차단 아님).
- 검증 방식: 존재 확인이 아니라 실제 동작 경로 추적 + diff 레벨 무변경 증명 + 실행 테스트.

## 실행 검증 근거 (통과로 가정하지 않음)
- `explain.test.ts` + `PolicyResultCard.test.tsx` + `grounding.regression.test.ts` 실행: **86 passed / 86**.
- diff 레벨 확인: `git show 047e634 -- src/llm/explain.ts` → 변경은 **모듈 헤더 주석 + buildExplainPrompt 프롬프트 텍스트뿐**. 가드 로직(`isGrounded`/`ASSERTION_PATTERNS`/`VERDICT_TERMS`/`VERDICT_VERDICTS`/`REGION_TOKEN_RE`/`URL_RE`/`NUMBER_RE`/`WHITELIST_FIELDS`/화이트리스트 주입)은 **바이트 단위 무변경**.

---

## 감사 포인트별 판정

### 1. 자격 단정 금지 — PASS (High 리스크 표면, 위반 0)
- 가드가 최종 방어선임을 확인. 프롬프트는 서술형("~지원해요")으로 유도하지만, 그와 무관하게 `isGrounded`의 `ASSERTION_PATTERNS`가 후처리에서 자격단정 텍스트를 거부한다(`explain.ts:79-93`, 검증 진입 `145-151`).
- 양방향 차단 실행 확인: 합격 단정(EX-5 "자격이 됩니다"·EX-5j "수혜 대상에 포함됩니다"·EX-5l "당첨 대상입니다"), 탈락 단정(EX-5b~5f·EX-5g "부적격입니다"·EX-5h "제외됩니다"), 확률 단정(EX-5k·EX-5p), 확신어(EX-6 "확실히") 전부 `source==='fallback'`으로 거부됨.
- 과차단 회귀 가드도 실행 통과: "도움이 될 수 있어요"·"관련이 있어 보여요"·"신청해 보시면 좋아요"는 grounded 유지(EX-5ok1~3). D-② 신규 서술형 "~을 지원해요"도 grounded 유지(explain.test.ts:59-64) — 프롬프트 목적 전환이 정당 문장을 죽이지 않음.
- **핵심**: 프롬프트가 새 예시("월세 일부를 지원해요")를 유도해도, 만약 모델이 "받을 수 있어요"류로 새면 `ASSERTION_PATTERNS[1]` (`받[으을지]?...(없|있|못)`)과 프롬프트 금지문구가 이중으로 막는다. 가드 무변경이므로 방어선 유지.

### 2. 날조 방지 (화이트리스트·숫자·URL·타지역) — PASS (High 리스크 표면, 위반 0)
- 주입 필드: `WHITELIST_FIELDS` = title/summary/category/ageMin/ageMax/regionText/recruit/sourceUrl만. 내부 id/raw 미주입 실행 확인(EX-11: `SECRET-INTERNAL-ID`·`DO-NOT-LEAK` 프롬프트 부재).
- 입력외 URL 거부(EX-2), 입력외 숫자 정확토큰 일치(EX-3 "300만원" 거부 / EX-3b "19·34" 허용 / EX-3c~e 부분문자열 false-pass 차단), 타지역 시·군·구 거부(EX-4b~d), grounded 지역 허용(EX-4e), 합성어 과도거부 방지(EX-4f "경기 침체"·EX-4g "세종대왕") 전부 실행 통과.
- diff상 가드 로직 무변경이므로 이 방어는 D-②로 약화되지 않음.

### 3. '추정' 고지·원문 링크 유지 — PASS
- `PolicyResultCard.tsx`: `DisclaimerNote`(212-214)와 원문 링크(194-204)는 혜택 한 줄(164-170)과 **독립 블록**. 혜택 한 줄은 category 아래·checklist 위에 삽입될 뿐 고지/링크를 대체·가리지 않음.
- 실행 확인: `'추정' 고지 포함`·`체크리스트 추가해도 고지·링크 유지`·`status=review ... 원문·고지 유지` 통과. D-② 혜택 표시가 있는 케이스(`explanation` 세팅 테스트)에서도 카드 구조상 고지/링크는 항상 렌더(조건이 `explanation`과 무관).

### 4. 위기 억제 불변 — PASS
- `explainMatch`의 crisis 경로 무변경: `suppressGeneration===true → {text:null, source:'fallback'}` (explain.ts:210-213). EX-7 실행 확인(LLM 호출 0, text=null).
- 상위 불변식 무영향: `FunnelContainer.tsx:82-88` 위기 early-return이 SafetyBanner 단독 렌더 — `ResultList`/`PolicyResultCard`는 위기 시 **마운트조차 안 됨**. D-② 카드 변경은 이 게이트 아래에만 존재하므로 위기 화면에 혜택 한 줄이 새어나올 경로 없음.
- 추가 안전판: precompute explanation은 인제스트 시점 crisis=none으로 생성(scripts/ingest.ts explainer에 crisis 미주입 → suppress 없음)되지만, 이는 정책 record 대상 질의무관 생성이지 사용자 위기 입력과 무관. 사용자 위기 신호는 런타임 게이트가 카드 자체를 차단.

### 5. 필러 미노출 (fallback→null) — PASS
- `scripts/ingest.ts:116` `return r.source === 'llm' ? r.text : null`. 그라운딩 실패 fallback("관련이 있어 보여요"류 필러)은 **null 저장** → 카드 `benefit=null` → 혜택 문단 자체 미렌더.
- `ingest.ts` `safeExplain`(398-405)은 빈/throw도 null. `forceExplain` 재생성 경로(199-200)도 동일 `safeExplain` 통과 → fallback이 저장될 수 없음.
- 실행 확인: `D-②: explanation 없으면 raw 요약으로 폴백`에서 `explanation:null` → `policy-benefit` 부재.

### 6. 요약 폴백의 안전성 — PASS
- 혜택 한 줄 없을 때 노출하는 `policy.summary`는 `normalizePolicy`가 `asNonEmptyString(raw.summary)`로 채운 **원천 API 필드**(normalizePolicy.ts:31, types.ts:48). LLM 산출·가공물이 아님 → 날조/자격단정 표면 없음(원문 그대로라 무해).
- 이는 D-② 이전에도 카드가 표시하던 필드로, D-②는 "혜택 한 줄 우선, 없으면 기존 summary"로 우선순위만 부여. 신규 안전 표면 도입 아님.

---

## 위반/관찰 등급표

| ID | 등급 | 항목 | 판정 |
|----|------|------|------|
| — | — | 자격단정/날조/고지/위기억제/필러/요약 폴백 | 신규 High·Med 위반 **없음** |
| L-1 | Low | precompute explanation 재검증 부재(런타임) | 관찰 — 아래 |
| L-2 | Low | 혜택 한 줄 저장문장에 대한 카드측 방어 없음 | 관찰 — 아래 |

### L-1 (Low, defer 가능) — 저장된 explanation은 런타임 재검증 없이 표시
- `explanation`은 인제스트 시점 `isGrounded` 통과분만 저장되고, 카드는 문자열 존재/trim만 확인(PolicyResultCard.tsx:121-122) 후 그대로 표시.
- 위험 낮음 근거: (a) 생성 경로가 유일하게 `explainMatch`(가드 내장)이고 fallback은 null이라 오염 문장이 캐시에 들어갈 경로가 없음. (b) 캐시 오염은 별도 위협모델(운영 인프라)로 D-② 범위 밖.
- 권고(비차단): 캐시 손상/수기편집 대비 카드 렌더 직전 경량 방어(길이 상한 + 핵심 자격단정 substring 몇 개)를 넣으면 심층방어가 되나, 현재 파이프라인 신뢰경계상 필수 아님. **defer 허용.**

### L-2 (Low, 정보) — 프롬프트 신규 예시가 그라운딩 텍스트가 아님
- 프롬프트 예시 "월세 일부를 지원해요"·"심리상담 비용을 도와줘요"는 few-shot 가이드일 뿐 record corpus에 미포함. 모델이 예시를 그대로 반향(echo)해 "월세"가 실제로 주거정책이 아닌데 출력해도, 이는 자격단정·숫자·URL·타지역이 아니라 `isGrounded`가 잡지 못하는 "카테고리 오서술" 가능성.
- 위험 낮음 근거: (a) 예시는 카테고리 중립적 두 개뿐이고 프롬프트가 "아래 정보만 사용"을 명시. (b) 실 Gemini 스모크 4/4 grounded·자격단정 0으로 반향 미관측. (c) 최악의 오서술도 원문 링크·'추정' 고지가 동반돼 사용자가 원문 확인 유도됨.
- 권고(비차단): 회귀 감시로 충분. **defer 허용.**

---

## 누락된 안전 테스트 지목 (신규 강제 아님 — 향후 회귀 강화 후보)
1. **카드 통합 레벨 위기 불변**: "crisis 상태에서 explanation 세팅된 정책이 있어도 카드/혜택 한 줄이 렌더되지 않는다"는 FunnelContainer 레벨 명시 테스트는 없음(현재는 컴포넌트 구조상 자명하나 회귀 방어 부재). — 감사자는 코드 경로(early-return)로 불변 확인했으므로 **차단 아님**, 회귀 테스트 추가 권고.
2. **forceExplain가 이전 fallback을 실제로 null로 덮어쓰는지**(백필 버그 해소 목적)에 대한 ingest 통합 테스트 부재. `regenExplain` 분기(ingest.ts:199-200)는 로직상 옳으나 "prevExpl=필러문장 → forceExplain → null" 케이스 명시 테스트 없음. — 안전 직결(굳은 필러 잔존 시 오도) 아니고 데이터 위생 문제. Med 이하, 권고.

## 결론
- D-②는 그라운딩·자격단정·날조·고지·위기억제·필러의 6개 안전 불변식을 **모두 유지**한다. 변경은 프롬프트 목적어와 표시 우선순위·저장 필터(fallback→null)에 국한되며, 방어 가드 로직은 diff 레벨에서 무변경임을 증명.
- **안전 High 위반 0 → 즉시 차단 사유 없음. 안전 게이트 통과.**
- Low 관찰 2건·회귀 테스트 권고 2건은 전부 defer 가능(머지 비차단).
