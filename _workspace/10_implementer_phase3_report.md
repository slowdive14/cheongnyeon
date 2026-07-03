# Phase 3 구현 보고서 — 자격 매칭(추정) 엔진 (tdd-implementer 산출)

## RED → GREEN 전환 증거
1. **recruitStatus (3.2)** — RED: 모듈 미존재 transform 실패 → GREEN: 16/16 통과.
2. **eligibility 4축 (3.1)** — RED: stub(빈 4버킷) `38 failed | 3 passed (41)` → GREEN: 41/41 통과.
3. **배타·순서 규칙 (3.3)** — `applyRules`가 step 4 GREEN에서 evaluate 의존성으로 선구현됨(자연 RED 불가). teeth 증명: 규칙 적용 라인 일시 비활성화 → `8 failed | 7 passed` 확인 후 원복 → 15/15 통과.

## 최종 결과 (회귀 포함)
- `npx vitest run` → **Test Files 10 passed / Tests 192 passed** (기존 120 + recruitStatus 16 + eligibility 41 + rules 15, 회귀 0).
- `npx tsc -b` → 0 에러.
- 커버리지(`src/domain/**` ≥90): All 95.42% stmt / 90.24% branch / 100% func / 97.91% line. eligibility.ts 90.09/90.9/100/95.34, recruitStatus.ts 96.87/97.77/100/100, applyRules.ts 92.85/92.3/100/95.
- `Date.now()`/`new Date()` 내부 호출 없음. clock 전부 `deps.now` 주입.

## 신규/수정 파일
- 신규 src: `src/domain/recruitStatus.ts`, `src/domain/eligibility.ts`, `src/domain/rules/programRules.ts`, `src/domain/rules/applyRules.ts`
- 신규 test: `test/unit/domain/{recruitStatus,eligibility,eligibility.rules}.test.ts`
- 수정: `src/domain/types.ts`

## 타입 확장 (types.ts)
- import `ProgramKey` from `./rules/programRules`.
- `Policy.programKey?: ProgramKey | null` (null=배타·순서 규칙 비대상).
- `UserProfile`: `regionCode?: string`(엔진 비교용, 기존 `region` 텍스트 보존), `completedPrograms?: string[]`, `activePrograms?: string[]`.
- 기존 멤버 무변경.

## REFACTOR(§7) 충족
GREEN부터 선언적: `PROGRAM_RULES` 데이터 + 범용 `applyRules(profile,policy,rules)→ReasonCode[]`. 자격 4축을 `Verdict[]`(age/income/region/recruit) 배열로 모아 `evaluateOne`이 순회 + 우선순위(blocked>review>soon>now) 중앙 합성. 새 규칙 1행 회귀 가드 포함.

## 판단 지점 (리뷰 검토 요망)
1. rules 테스트 RED 순서 이탈 — teeth 증명으로 보강(위).
2. B-9/B-10 단위 불일치(ratio↔amount) → 추정 변환 없이 `INCOME_PROFILE_MISSING` review.
3. **RULE-4 동일사업 재참여 → `PREREQ_UNKNOWN` 재사용**(전용 코드 미정의) — 별도 코드 필요 여부 검토.
4. **EX-3/EX-4 깨진 정책·빈 프로필 → review**(`RECRUIT_UNKNOWN` 임시 사유) — 누락 금지 원칙상 review 보존이 목적, 사유 코드 적절성 검토.
5. **PROGRAM_RULES 배타 그룹** — 4개 전부 상호배타 잠정(원문 미확정), 주석에 명시.

## 남은 TODO
- 배타 그룹 범위(전부 vs 일부 쌍) 정책 원문 확정.
- 동일사업 재참여 전용 ReasonCode 필요 여부.
- 깨진 정책 review 사유 코드 의미 명확화(현재 `RECRUIT_UNKNOWN` 임시).
