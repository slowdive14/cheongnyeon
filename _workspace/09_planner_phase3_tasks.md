# Phase 3 — 자격 매칭(추정) 엔진 · TDD 작업 명세 (phase-planner 산출)

> SSOT: `docs/plans/PLAN_youth-policy-diagnosis-mvp.md` L180–201. Phase 1·2 완료 전제.
> 이 Phase의 **최대 안전 포인트**: 필수조건 미확인은 탈락(blocked)이 아니라 **확인 필요(review)** 로 보수 판정. 이 한 줄이 어긋나면 부적격 통과(false accept) 또는 적격 누락(false reject) 양쪽 신뢰가 무너진다.

> **리더 결정 (2026-06-24, 착수 전 확정):**
> - **review[] 버킷 승인** — evaluate 반환을 `{now, soon, blocked, review}` 4버킷으로. plan Goal 3버킷의 안전 보강.
> - **U1 승인** — `UserProfile.regionCode: string` 추가(엔진은 코드 동일성만 비교).
> - **U3 승인** — `Policy.programKey?: ProgramKey | null` 추가(null=규칙 비대상).
> - **U4 승인** — `UserProfile.{completedPrograms?, activePrograms?}: string[]` 추가(미입력→review).
> - **R4 결정** — `start > now`(시작 미래)는 enum 확장 없이 `soon`로 합침(예정·임박 신호).

---

## 0. 기존 계약 요약 (근거 — 추정 금지)

| 소비 타입 | 형태 | Phase 3 함의 |
|---|---|---|
| `Policy.ageMin/ageMax` | `number \| null` (이상/이하, null=미지정) | null 한쪽 = 그 방향 무제한. **양쪽 null = 연령 불명 → review** |
| `Policy.income` | `IncomeCriteria{kind: none\|medianRatio\|amountMax\|unknown, maxRatio?, maxAmount?, raw}` | `unknown` → review (none 절대 흡수 금지). `none` → 소득축 통과 |
| `Policy.regionCodes` | `string[]` (서울='11', 불명=`[]`) | 빈 배열 + `isNationwide=false` = 지역 불명 → review |
| `Policy.isNationwide` | `boolean` (불명=false 보수) | true = 지역축 통과 |
| `Policy.recruit` | `RecruitWindow{kind: dated\|always\|unknown, start, end}` (ISO `YYYY-MM-DD` \| null) | dated → 날짜 분류. always → now. unknown → unknown 상태 |
| `RecruitStatus` | `'now'\|'soon'\|'closed'\|'unknown'` (이미 선언됨, 재사용) | recruitStatus 계산기 출력 타입 |
| `UserProfile` | `{age, region, income?, +regionCode, +completedPrograms?, +activePrograms?}` | U1·U3·U4 필드 추가 확정 |

---

## 1. 작업 순서

| 순서 | Task | 단계 | 파일 |
|---|---|---|---|
| 1 | Test 3.2 모집상태 분류 | 🔴 RED | `test/unit/domain/recruitStatus.test.ts` |
| 2 | Task 3.5 recruitStatus 계산기 | 🟢 | `src/domain/recruitStatus.ts` |
| 3 | Test 3.1 자격 4축 경계값 | 🔴 RED | `test/unit/domain/eligibility.test.ts` |
| 4 | Task 3.4 eligibility 평가기 (evaluate) | 🟢 | `src/domain/eligibility.ts` |
| 5 | Test 3.3 배타·순서 규칙 | 🔴 RED | `test/unit/domain/eligibility.rules.test.ts` |
| 6 | Task 3.4b 규칙 계층 | 🟢 | `src/domain/eligibility.ts` (+ `src/domain/rules/`) |
| 7 | Task 3.6 선언적 규칙 테이블 | 🔵 REFACTOR | `src/domain/rules/programRules.ts` |

**모집상태 먼저:** 순수·결정적(clock 외 의존 없음). evaluate가 소비하므로 계약을 먼저 고정.
**배치 주의:** 모든 신규 파일은 `src/domain/` 아래(vitest `coverage.include=['src/domain/**']` → ≥90% 게이트 집계).

---

## 2. evaluate 시그니처·타입 (확정)

```ts
// src/domain/eligibility.ts
export interface EvaluateDeps {
  now: Date;                 // 고정 clock(테스트 항상 명시 주입)
  soonWithinDays?: number;   // soon 임계 일수, 기본 7
}

export type ReasonCode =
  // blocked (명확한 부적격)
  | 'AGE_BELOW_MIN' | 'AGE_ABOVE_MAX' | 'INCOME_OVER_LIMIT' | 'REGION_MISMATCH'
  | 'RECRUIT_CLOSED' | 'DUPLICATE_EXCLUSIVE' | 'PREREQ_NOT_MET'
  // review (확인 필요 — 보수, 탈락 아님)
  | 'AGE_UNKNOWN' | 'INCOME_UNKNOWN' | 'INCOME_PROFILE_MISSING'
  | 'REGION_UNKNOWN' | 'REGION_PROFILE_MISSING' | 'RECRUIT_UNKNOWN' | 'PREREQ_UNKNOWN';

export interface EvaluatedPolicy {
  policy: Policy;
  reasons: ReasonCode[];        // now/soon=[](통과), blocked/review=1개 이상
  recruitStatus: RecruitStatus;
}
export interface EvaluateResult {
  now: EvaluatedPolicy[];       // 전축 통과 + 모집중
  soon: EvaluatedPolicy[];      // 전축 통과 + 임박
  blocked: EvaluatedPolicy[];   // 명확한 부적격(사유 코드 포함)
  review: EvaluatedPolicy[];    // 확인 필요(보수)
}
export function evaluate(profile: UserProfile, policies: Policy[], deps: EvaluateDeps): EvaluateResult;
// 순수·throw-free. 어떤 입력에도 예외 금지.
```

---

## 3. recruitStatus 계산기 (Task 3.5)

```ts
// src/domain/recruitStatus.ts
export interface RecruitStatusDeps { now: Date; soonWithinDays?: number; } // 기본 7
export function recruitStatus(window: RecruitWindow, deps: RecruitStatusDeps): RecruitStatus;
```
- 비교는 **날짜 단위**(date-fns `differenceInCalendarDays`/`startOfDay`).
- `always`→now, `unknown`→unknown, dated+start·end 모두 null→unknown(방어).
- 잔여 = `differenceInCalendarDays(end, now)`: `0 ≤ 잔여 ≤ 7`→soon, `>7`→now, `<0`→closed.
- `start > now`(미래)→soon. start null·end 유효→end만으로. end null·start≤now→now.

---

## 4. 🔴 RED — Test 3.2 모집상태 (`recruitStatus.test.ts`)

고정 clock `NOW=2026-06-24`, soonWithinDays=7.

| # | window | 기대 | 근거 |
|---|---|---|---|
| R1-a | always | now | 상시 |
| R1-b | unknown | unknown | 불명(none/closed 아님) |
| R2-a | dated 06-01~07-31 | now | 마감 37일 후 |
| R2-b | dated ~07-02 | now | 잔여 8일(>7) |
| R2-c | dated ~06-30 | soon | 잔여 6일 |
| R2-e | dated ~07-01 | soon | 잔여 7일(경계 포함) |
| R3-a | dated ~06-24 | soon | 마감==오늘(잔여 0, 마지막날 포함) |
| R3-b | dated ~06-23 | closed | 잔여 -1 |
| R4-a | dated 07-01~08-31 | soon | 시작 미래(예정) |
| R4-b | dated 09-01~09-30 | soon | 시작 먼 미래도 soon(R4 결정) |
| R5-a | dated null~07-31 | now | end만 유효, 마감 전 |
| R5-b | dated 06-01~null | now | start 과거·end 미상 |

이상치 방어: RX-1 null→unknown / RX-2 `{}`→unknown / RX-3 invalid 날짜→unknown / RX-4 start>end 역전→unknown.

**DoD:** 전표 녹색. 순수·throw-free. `Date.now()` 미사용(grep). date-fns 사용. `RecruitStatus` 재사용.

---

## 5. 🔴 RED — Test 3.1 자격 4축 (`eligibility.test.ts`)

축별 3분기(통과/탈락/불명=review), 다른 축은 통과 고정으로 격리.

### 축 A — 나이
A-1 (19/34, age 34)→통과 · A-2 (35)→blocked `AGE_ABOVE_MAX` · A-3 (19)→통과 · A-4 (18)→blocked `AGE_BELOW_MIN` · A-5 (null/34, 30)→통과 · A-6 (null/34, 35)→blocked · A-7 (19/null, 80)→통과 · A-8 (19/null, 18)→blocked · **A-9 (null/null, 30)→review `AGE_UNKNOWN`**.

### 축 B — 소득 (unknown ≠ none)
B-1 none→통과(프로필 없어도) · B-2 ratio150/120→통과 · B-3 150/150→통과(경계) · B-4 150/151→blocked `INCOME_OVER_LIMIT` · B-5 amount 300만/300만→통과 · B-6 300만/300만1→blocked · **B-7 unknown/120→review `INCOME_UNKNOWN`** · B-8 ratio150/미입력→review `INCOME_PROFILE_MISSING` · B-9 ratio150/amount만→review(단위 불일치) · B-10 amountMax/ratio만→review.

### 축 C — 지역 (불명 ≠ 전국, regionCode 비교)
C-1 ['11']/false, '11'→통과 · C-2 ['11']/false, '26'→blocked `REGION_MISMATCH` · C-3 []/true, '26'→통과(전국) · **C-4 []/false, '11'→review `REGION_UNKNOWN`** · C-5 ['11']/false, 빈코드→review `REGION_PROFILE_MISSING` · C-6 ['11','26']/false, '11'→통과.

### 축 D — 모집상태 조합
D-1 always→now · D-2 마감 37일→now · D-3 마감 6일→soon · D-4 마감 어제→blocked `RECRUIT_CLOSED` · **D-5 unknown→review `RECRUIT_UNKNOWN`**.

### 우선순위 (blocked > review > soon > now)
- P-1 나이 unknown + 모집 now → review(`AGE_UNKNOWN`), now 아님.
- P-2 나이 35 + 소득 unknown → blocked(`AGE_ABOVE_MAX` 포함, `INCOME_UNKNOWN` 누적). 명백 부적격이 불명 압도(헛희망 차단).
- P-3 소득 over + 모집 closed → blocked, reasons=`[INCOME_OVER_LIMIT, RECRUIT_CLOSED]`(복수).
- P-4 전축 통과 + 모집 unknown → review(`RECRUIT_UNKNOWN`).

### 이상치 방어 (throw-free)
EX-1 `[]`→빈 4버킷 · EX-2 null policies→빈 결과(throw 금지) · EX-3 깨진 Policy 섞임→해당건 review(누락 금지) · EX-4 `profile={}`→전건 review · EX-5 age NaN/음수→review(blocked 아님) · EX-6 중복 정책→중복 그대로(중복제거는 Phase 2 책임).

**DoD:** 4축×3분기 + P-1~4 + EX-1~6 녹색. now/soon `reasons=[]`, blocked/review `reasons.length≥1`. 순수·throw-free. coverage(eligibility.ts) ≥90%.

---

## 6. 🔴 RED — Test 3.3 배타·순서 규칙 (`eligibility.rules.test.ts`)

### 선언적 규칙 테이블
```ts
// src/domain/rules/programRules.ts
export type ProgramKey = 'youth_allowance'|'youth_challenge'|'kuk_chwi'|'monthly_rent';
export interface ExclusionRule { kind:'mutual_exclusive'; group: ProgramKey[]; reason: ReasonCode; }
export interface SequenceRule { kind:'sequence'; target: ProgramKey; requires: ProgramKey; reason: ReasonCode; }
export type ProgramRule = ExclusionRule | SequenceRule;
export const PROGRAM_RULES: ProgramRule[] = [
  { kind:'mutual_exclusive', group:['youth_allowance','youth_challenge','kuk_chwi','monthly_rent'], reason:'DUPLICATE_EXCLUSIVE' },
  { kind:'sequence', target:'kuk_chwi', requires:'youth_challenge', reason:'PREREQ_NOT_MET' },
];
// ⚠ 배타 그룹 범위(4개 전부 vs 일부 쌍)는 정책 원문 미확정 — 잠정값, 주석에 근거 미확정 명시.
```

### 배타
RULE-1 대상 kuk_chwi + active ['youth_allowance']→blocked `DUPLICATE_EXCLUSIVE` · RULE-2 active []→통과 · **RULE-3 active undefined→review `PREREQ_UNKNOWN`** · RULE-4 동일사업 재참여→잠정 review(확인필요) · RULE-5 programKey=null→규칙 비적용(자격축만).

### 순서 (청년도전 수료→국취)
SEQ-1 completed ['youth_challenge']→통과 · SEQ-2 completed []→blocked `PREREQ_NOT_MET` · **SEQ-3 completed undefined→review `PREREQ_UNKNOWN`** · SEQ-4 순서 비대상→통과.

### 규칙 vs 자격 우선순위
자격 blocked + 배타 blocked→blocked(reasons 복수). 자격 통과 + 순서 PREREQ_UNKNOWN→review.

**DoD:** RULE-1~5, SEQ-1~4 녹색. programKey=null→규칙 미적용. 이력 미입력→전부 `PREREQ_UNKNOWN` review(blocked 아님).

---

## 7. 🔵 REFACTOR — Task 3.6

if-사슬 규칙 → `PROGRAM_RULES` 데이터 + 범용 `applyRules(profile, policy, rules) → ReasonCode[]`. 자격 4축도 `{axis, evaluate→{verdict,reason?}}[]` 배열로 모아 evaluate가 순회 + §5 우선순위 합성 중앙화. 테스트 전건 녹색 유지. 새 규칙 1행 추가 회귀 가드 케이스 추가.

---

## 8. safety-domain-auditor 사전 공유 — 안전 검증 포인트(테스트 앵커)

| 안전 불변식 | 테스트 앵커 | 실패 시 영향 |
|---|---|---|
| **미확인 → review(탈락 아님)** ★ | A-9, B-8/9/10, C-4/5, D-5, RULE-3, SEQ-3, P-1, EX-3/4 | false reject |
| `unknown ≠ none`(소득) | B-7 | false accept |
| 불명 지역 ≠ 전국 | C-4 | false accept |
| 모집창 invalid → unknown | RX-1~4, R1-b, D-5 | 마감 오노출/유효 오탈락 |
| throw-free | EX-1~6, RX-1~4 | 크래시 |
| blocked 사유 설명 가능 | 전 blocked `reasons.length≥1`, ReasonCode enum | 신뢰 훼손 |
| blocked > review(헛희망 차단) | P-2 | 혼란 |

**중점:** review/blocked 코드 분리 · `IncomeCriteria.kind:'unknown'`이 none으로 새지 않는지 데이터 흐름 추적(B-7) · 추가 필드 미입력 시 추정 통과/탈락 없이 review로.

---

## 9. tdd-implementer 전달 요약

1. 타입 확장(승인됨): `UserProfile.regionCode: string`, `UserProfile.completedPrograms?/activePrograms?: string[]`, `Policy.programKey?: ProgramKey|null`.
2. evaluate 반환 4버킷(`+review`).
3. 순서: recruitStatus → eligibility 4축 → 규칙 → REFACTOR.
4. 파일 전부 `src/domain/` 아래. 테스트 `test/unit/domain/`.
5. 순수·throw-free·clock 주입(`Date.now()` 금지). 기존 타입(`RecruitStatus`/`IncomeCriteria`) 재사용.
6. DoD 게이트 + 체크리스트(커버리지 ≥90%, 경계/모집/배타 전 케이스, 애매=review).
