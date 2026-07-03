# Code Review — Phase 3 (기술 품질, code-reviewer)

## 판정: PASS (blocker 0)

게이트 재현: `tsc -b` 0에러 · vitest 3파일 72통과 · `any` 0 · `Date.now()/new Date` 0(주석만) · eslint 0. 우선순위 합성·throw-free 방어·타입 안전·date 경계 모두 명세 정합.

## 중점 확인
1. **우선순위 합성** — 정합. `evaluateOne`(eligibility.ts:157-177) 중앙 합성, blocked>review>soon>now. P-2 직접 확인(`['AGE_ABOVE_MAX','INCOME_UNKNOWN']`), P-3 복수누적 정상, soon+규칙review→review 승격 확인. 누수 경로 없음.
2. **throw-free** — 견고. 3중 방어(isStructurallyBroken→evaluateOne try/catch→applyRules/safeRecruitStatus 내부). EX/RX 전 녹색.
3. **타입 안전** — 합격. any 0, import type 일관, ReasonCode 14개 1:1, 확장 타입 전부 옵셔널(계약 무파괴), Verdict 판별유니온 적절.
4. **date 경계** — off-by-one 없음. differenceInCalendarDays+startOfDay, 잔여 0→soon/-1→closed/7→soon/8→now 정확. 역전·미래시작·null 정합.
5. **테스트 충실도** — tautology 아님. evalOne 헬퍼가 "정확히 한 버킷" 강제. rules teeth(회귀가드) 적절.

## Med / Should (defer 가능)
**M-1 (Should, defer): invalid `deps.now`가 dated 정책을 `now`로 오분류.** `recruitStatus`에 Invalid Date 주입 시 `differenceInCalendarDays(end, invalid)=NaN`, 비교 전부 false→fall-through로 closed 정책이 `now`로 샘(probe 확인). false-accept 경로. `now`는 주입 clock(precondition)이라 등급 Med. 1줄 가드(`if(!isValid(deps.now)) return 'unknown'`)로 차단. 다음 Phase가 실 `new Date()` 주입 시작하면 의미 ↑.
> ※ safety-auditor L3-3과 **수렴**(동일 이슈).

## Nit (기록만)
- N-1: eligibility.ts:151-155 applyRules try/catch는 applyRules가 이미 throw-free라 dead 방어. 무해.
- N-2: EX-3/4 깨진 정책 review 사유 `RECRUIT_UNKNOWN` 재사용 — 의미상 부정확(safety 영역, defer).
- N-3: RULE-4 동일사업 재참여 `PREREQ_UNKNOWN` 재사용 — 도메인 결정 사안.

## 위임
unknown≠none(B-7)·불명지역≠전국(C-4)·사유코드 의미·배타그룹 범위는 safety-domain-auditor 축. 기술 구현(분기·타입)은 정확.
