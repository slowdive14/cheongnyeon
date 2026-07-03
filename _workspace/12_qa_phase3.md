# Phase 3 QA — 자격 매칭(추정) 엔진 · 통합 정합성 & 품질 게이트 (integration-qa 산출)

> 대상: `src/domain/{recruitStatus,eligibility}.ts`, `src/domain/rules/{programRules,applyRules}.ts`, 수정 `src/domain/types.ts`
> 테스트: `test/unit/domain/{recruitStatus,eligibility,eligibility.rules}.test.ts`
> 검수 강도: 2026-06-24 calibration (게이트 실패·경계 shape 불일치 = blocker, 그 외 Med 이하 defer)

## 판정: **통과 (PASS)** — blocker 0

모든 품질 게이트 통과, 경계면 4종 교차 비교 불일치 0. 관찰 2건은 Med/defer.

---

## 1. 품질 게이트 결과표 (전부 개별 실행, 출력 인용)

| 게이트 | 명령 | 결과 | 핵심 출력 |
|---|---|---|---|
| 테스트 | `npx vitest run` | ✅ PASS | `Test Files 10 passed (10)` / `Tests 192 passed (192)` (스킵 0, 회귀 0) |
| 커버리지 | `npx vitest run --coverage` | ✅ PASS | `domain 92 stmt / 93.78 branch / 100 func / 96.55 line` — 전부 ≥90 게이트 통과(exit 0) |
| 타입 | `npx tsc -b` | ✅ PASS | `TSC_EXIT=0` (에러 0) |
| 빌드 | `npm run build` | ✅ PASS | `tsc -b && vite build` → `✓ built in 2.06s` (BUILD_EXIT=0) |
| Lint | `npx eslint .` | ✅ PASS | `LINT_EXIT=0` (오류 0) |
| Audit | `npm audit` | ⚠ Med/defer | `1 low severity vulnerability` (esbuild, dev-server only, 기존 transitive) |
| Flaky | `npx vitest run` ×6 | ✅ PASS | 안정 구간 6회 연속 `10/192` 동일 (아래 관찰 1 참조) |

### 회귀 카운트 검증
- Phase 1·2 회귀 포함 총 **192** (기존 120 + recruitStatus 16 + eligibility 41 + rules 15) — implementer 보고(192)와 일치.
- 디스크상 테스트 파일 **정확히 10개** (Glob/find 교차 확인). 스킵·todo 0.

### 커버리지 상세 (`src/domain/**`, 게이트 ≥90)
```
File               | % Stmts | % Branch | % Funcs | % Lines | Uncovered
 domain            |   92    |  93.78   |  100    |  96.55  |
  eligibility.ts   |  90.09  |  90.9    |  100    |  95.34  | 103,131,154,226
  recruitStatus.ts |  96.87  |  97.77   |  100    |  100    | 43
 domain/rules      |  93.1   |  92.3    |  100    |  95.23  |
  applyRules.ts    |  92.85  |  92.3    |  100    |  95     | 55
```
- 4개 신규 파일 전부 stmt/branch/func/line ≥90. `eligibility.ts` branch 90.9는 게이트 경계 통과(여유 0.9pt — 관찰 2).
- `programRules.ts`는 순수 데이터 테이블(실행 분기 없음) → 집계에 type-only 기여.

### 시간 의존 grep (clock 주입 외 금지)
- `recruitStatus.ts`/`eligibility.ts`/`applyRules.ts`/`programRules.ts` 내 `Date.now()`/`new Date()` **실호출 0**. 매치는 전부 주석 또는 Phase 2 `parse/recruit.ts`(파싱 전용, Phase 3 런타임 clock 아님). clock은 전부 `deps.now` 주입.

### 인코딩/null 바이트 (Phase 2 오염 이력 점검)
- 신규 4파일 `null_bytes=0`, `file`→ UTF-8 정상. 오염 없음.

---

## 2. 경계면 교차 비교 (shape 동시 대조 — 존재 확인 아님)

### B1. Phase 2 산출(types.ts) → Phase 3 소비 — **일치**
- **`IncomeCriteria.kind` 1:1 대응**: 선언 `none|medianRatio|amountMax|unknown` (types.ts:16) ↔ `incomeAxis`(eligibility.ts:79–104) 분기.
  - `none`→PASS / `unknown`→review `INCOME_UNKNOWN` / `medianRatio`→`maxRatio` 사용 / `amountMax`→`maxAmount` 사용 + default→review. **빠진 kind 없음**. 필드명 `maxRatio`/`maxAmount`/`raw` 정확 일치, 옵셔널 동일.
  - 안전 핵심: `unknown`이 `none`으로 새지 않음(B-7 강제). 코드상 분기 분리 확인.
- **`RecruitWindow{kind,start,end}`** (types.ts:29–36) ↔ `recruitStatus`(recruitStatus.ts) 소비: `dated`/`always`/`unknown` 전부 처리, `start|end: string|null` 그대로 `parseISO`. 필드명·옵셔널 일치.
- **`RecruitStatus` enum** `now|soon|closed|unknown` ↔ `recruitAxis`(eligibility.ts:118–123): closed→blocked, unknown→review, now/soon→PASS. 전 값 처리.

### B2. types.ts 확장 정합 — **일치**
- `Policy.programKey?: ProgramKey | null` (types.ts:72) ↔ `applyRules`의 `policy.programKey` 소비(applyRules.ts:18) + `ProgramKey` union(programRules.ts:7–11 `youth_allowance|youth_challenge|kuk_chwi|monthly_rent`). 타입 동일 출처, null→규칙 비대상 처리(RULE-5 강제).
- `UserProfile.regionCode?: string` (types.ts:86) ↔ `regionAxis`의 `profile.regionCode` 비교(eligibility.ts:111) + `Policy.regionCodes: string[]`와 `codes.includes(userCode)` — 양쪽 `string`/`string[]` 동형. 빈 문자열→`REGION_PROFILE_MISSING` 분기 존재.
- `UserProfile.{completedPrograms?,activePrograms?}: string[]` ↔ `applyRules`의 `Array.isArray` 가드 → undefined→`PREREQ_UNKNOWN`(review), `[]`→판정. 타입·옵셔널 일치.

### B3. evaluate 반환 4버킷 ↔ 명세 §2 shape — **일치**
- `EvaluateResult{now,soon,blocked,review: EvaluatedPolicy[]}` (eligibility.ts:43–48) = 명세 §2.
- `EvaluatedPolicy{policy, reasons: ReasonCode[], recruitStatus: RecruitStatus}` (eligibility.ts:37–41) = 명세. 필드명·타입 정확 일치.
- `ReasonCode` 14종(blocked 7 + review 7) = 명세 §2 enum 전부 일치.

### B4. 순환 import 점검 — **런타임 순환 없음 (수용)**
- 모듈 그래프상 사이클 존재: `types → rules/programRules → eligibility → {programRules, types}`.
- 단, 사이클을 닫는 모든 엣지가 **`import type`**(컴파일 시 erase, 런타임 emit 0):
  - `types.ts:11` `import type {ProgramKey}` ← programRules
  - `programRules.ts:1` `import type {ReasonCode}` ← eligibility
  - `applyRules.ts:1–3` 전부 `import type`
- **value import은 단방향**: `eligibility → applyRules/programRules`(programRules는 const 데이터만 export, 부수효과 없음). TDZ/초기화 위험 없음.
- 검증: `tsc -b` 0 에러 + 테스트 클린 실행 → 런타임 초기화 문제 부재 확인. **blocker 아님.**

---

## 3. 점검 포인트 결과

- **now/soon `reasons=[]`, blocked/review `reasons.length≥1`이 데이터로 성립 + 테스트 강제**: ✅
  - 코드: evaluateOne(eligibility.ts:169–177) — blocked/review만 reasons 채움, 전축 통과 시 `reasons:[]`.
  - 테스트 강제: D-3 `reasons).toEqual([])`(soon), 불변식 테스트(eligibility.test.ts:275–289)가 `now+soon→[]`, `blocked+review→≥1` 일괄 단언.
- **clock 주입 외 시간 의존 없음**: ✅ (grep §1).
- **미확인→review(탈락 아님) 안전 불변식**: A-9/B-7~10/C-4~5/D-5/RULE-3/SEQ-3/EX-3~5 전부 review 단언 — 코드·테스트 정합.
- **blocked > review (헛희망 차단)**: P-2(나이35+소득unknown→blocked) 코드·테스트 정합(eligibility.ts:169–172 누적 노출).

---

## 4. 관찰 (Med 이하 — defer, blocker 아님)

| # | 심각도 | 관찰 | 비고 |
|---|---|---|---|
| 1 | Med (defer) | flaky 점검 초기 2회에서 일시적으로 `11 files / 199 tests`로 측정된 뒤, 이후 6회 연속 `10/192`로 안정. 디스크상 테스트 파일은 정확히 10개(Glob+find 교차 확인), 11번째 파일 부재. 초회 측정은 이전 세션의 stale `.vitest` 캐시/잔여 컴파일 산출물로 추정. 안정 구간 결정적. | flaky 본질이 아니라 캐시 잔재로 판단. 권고: 의심 시 `npx vitest run --no-cache` 1회로 재확인. |
| 2 | Med (defer) | `eligibility.ts` branch 커버리지 90.9% — 게이트(≥90) 통과하나 여유 0.9pt. uncovered 103/131/154/226은 전부 방어적 fallthrough(알 수 없는 income kind, applyRules catch 등). | 회귀 시 게이트 하회 위험 작음. 안전 방어 라인이라 테스트 추가 가치 낮음. |
| 3 | Med (defer) | `npm audit`: esbuild 1 low(dev-server 전용, Windows 임의 파일 읽기). vite 경유 transitive. Phase 3는 의존성 무변경 → **신규 취약점 아님**(기존). | 프로젝트 차원 `npm audit fix` 별도 처리 권고. |
| 4 | Low (defer) | implementer 미해결 TODO: 배타 그룹 범위(4개 전부 vs 일부 쌍) 정책 원문 미확정, 동일사업 재참여 전용 ReasonCode 부재(현재 `PREREQ_UNKNOWN` 재사용), 깨진 정책 review 사유 `RECRUIT_UNKNOWN` 임시. | 정책 원문/도메인 결정 사안 — QA 게이트 밖. safety-auditor/리더 검토 영역. |

---

## 5. 결론

- **품질 게이트**: 테스트(192/192, 스킵0)·커버리지(domain ≥90)·tsc(0)·build(성공)·lint(0) 전부 통과.
- **경계면 4종**(데이터→엔진 / types 확장 / 4버킷 shape / 순환 import) 교차 비교 **불일치 0**.
- **안전 불변식**(미확인→review, unknown≠none, blocked>review, throw-free, 시간 주입) 코드·테스트 정합.
- **Phase 3 = 완료(통과).** blocker 0. 관찰 4건은 전부 Med 이하 defer.
