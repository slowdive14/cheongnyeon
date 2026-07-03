# Phase 1 QA — 통합 정합성 & 품질 게이트 (integration-qa)

> 검증 대상: 토대 & 도메인 타입 (`02_implementer_phase1_report.md`)
> 방법론: integration-qa — 게이트 직접 실행(출력 인용) + 경계면 교차 비교
> 실행일: 2026-06-23 · 환경: Windows PowerShell · npm 개별 실행

## 결론: **Phase 1 통과 (PASS)**

모든 품질 게이트 통과. 경계면 불일치 0건. flaky 0건(3회 일관). audit low 1건은 기존 dev-server 한정·신규 아님(승인 범위).

---

## 1. 품질 게이트 결과 (출력 인용)

| 게이트 | 명령 | 결과 | 수치/근거 |
|---|---|---|---|
| 테스트 | `npm test` | ✅ PASS | 35 passed / 35, skip 0 |
| 커버리지 | `npm test -- --coverage` | ✅ PASS | domain 98.87% stmts · 100% lines (≥90) |
| 린트 | `npm run lint` | ✅ PASS | 출력 없음(오류 0) |
| 타입 | `npx tsc --noEmit` | ✅ PASS | EXIT_CODE=0 (출력 없음) |
| 빌드 | `npm run build` | ✅ PASS | `✓ built in 1.64s`, EXIT_CODE=0 |
| audit | `npm audit` | ⚠️ low 1 (기존) | esbuild GHSA-g7r4-m6w7-qqqr, 신규 아님 |
| flaky | `npm test` ×3 | ✅ 일관 | 35 passed ×3, 차이 없음 |

### 1-1. `npm test` (run 1)
```
 Test Files  1 passed (1)
      Tests  35 passed (35)
   Duration  2.93s
```
스킵 0. 보고서 명시 35/35과 일치.

### 1-2. `npm test -- --coverage`
```
File               | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
-------------------|---------|----------|---------|---------|------------------
All files          |   98.87 |    98.13 |     100 |     100 |
 domain/parse      |   98.78 |    97.77 |     100 |     100 |
  recruit.ts       |   97.14 |    95.23 |     100 |     100 | 27,43
Statements : 98.87% ( 88/89 )
Branches   : 98.13% ( 105/107 )
Functions  : 100% ( 12/12 )
Lines      : 100% ( 82/82 )
```
domain 98.87% ≫ 90% 임계 충족. coverage.include는 `src/domain/**`만 집계(셸/설정 제외) — 보고서 §3과 동일. uncovered 27/43은 recruit.ts 방어적 분기(보고서 §3 명시와 일치).

### 1-3. `npm run lint`
```
> eslint .
(출력 없음 = 오류 0)
```

### 1-4. `npx tsc --noEmit`
```
EXIT_CODE=0
(출력 없음 = 타입 통과)
```

### 1-5. `npm run build`
```
> tsc -b && vite build
vite v7.3.5 building client environment for production...
✓ 29 modules transformed.
dist/index.html                 0.40 kB │ gzip: 0.29 kB
dist/assets/index-CUOPRksc.css  5.48 kB │ gzip: 1.66 kB
dist/assets/index-Ca8jkXX8.js   193.66 kB │ gzip: 61.00 kB
✓ built in 1.64s
EXIT_CODE=0
```

### 1-6. `npm audit`
```
esbuild  0.27.3 - 0.28.0
esbuild allows arbitrary file read when running the development server on Windows
- https://github.com/advisories/GHSA-g7r4-m6w7-qqqr
1 low severity vulnerability
```
- 보고서 §5.6에 사전 고지된 **동일 1건**. vite@7 전이 의존, **개발 서버 한정·프로덕션 번들 무관**.
- 스택 기본 도입분으로 **신규 취약점 아님** → 신규 취약점 게이트 PASS. `npm audit fix`는 vite 메이저 변동 위험으로 보류(리뷰어 판단 위임) — QA도 동의.

### 1-7. flaky 확인 (`npm test` 추가 2회)
```
run 2:  Tests  35 passed (35)
run 3:  Tests  35 passed (35)
```
run 1 포함 3회 모두 35 passed / skip 0 → **flaky 없음**.

---

## 2. 경계면 교차 비교

양쪽 파일을 동시에 열어 비교(존재 확인 아님). Phase 1 범위에서 실제 코드가 맞물리는 지점.

### 2-1. data→engine: `Policy` 타입 ↔ `normalizePolicy` 반환값 — **일치 (불일치 0)**

`src/domain/types.ts:43-66` (Policy) ↔ `src/domain/normalizePolicy.ts:28-41` (반환 객체) 필드 대조:

| Policy 필드 | 타입 | normalizePolicy 산출 | 일치 |
|---|---|---|---|
| id | string | `asNonEmptyString(r.id) ?? fallbackId()` → string | ✅ |
| title | string | `?? '제목 없음'` → string | ✅ |
| summary | string\|null | `?? null` | ✅ |
| ageMin/ageMax | number\|null | `parseAgeRange` (number\|null) | ✅ |
| income | IncomeCriteria | `parseIncome` 반환 타입이 IncomeCriteria 직참조 | ✅ |
| regionCodes | string[] | `...parseRegion` 스프레드 | ✅ |
| regionText | string\|null | `...parseRegion` | ✅ |
| isNationwide | boolean | `...parseRegion` | ✅ |
| recruit | RecruitWindow | `parseRecruit` 반환 타입이 RecruitWindow 직참조 | ✅ |
| category | string\|null | `?? null` | ✅ |
| sourceUrl | string\|null | `?? null` | ✅ |
| source | 'ontong'\|'mongttang'\|string | `?? 'unknown'` (string 허용) | ✅ |
| raw? | unknown (옵셔널) | 항상 `raw` 대입 | ✅ |

- 필드명·옵셔널·타입 전부 일치. 누락/잉여 필드 없음.
- `parse/income.ts`·`parse/recruit.ts`가 `IncomeCriteria`/`RecruitWindow`를 **공유 타입에서 직접 import**해 반환 → shape drift 구조적으로 차단됨(파서가 타입의 단일 출처를 참조).
- `safeDefault`(비객체 입력 경로, normalizePolicy.ts:45-62)도 동일 13필드+raw로 Policy 완전 충족 → tsc PASS가 이를 보증.
- 참고(불일치 아님): `source` 유니온은 `| string` 포함으로 사실상 `string`. fallback `'unknown'`이 컴파일·런타임 모두 유효.

### 2-2. raw 입력 계약: fixture 키 ↔ parse/* 가 읽는 키 — **일치**

`test/fixtures/ontong-policies.sample.json`이 공급하는 키 ↔ 파서가 읽는 키:
- age: `ageMin`/`ageMax`(직접) · `ageText` — `parse/age.ts` 소비 ✅
- income: `incomeText` — `parse/income.ts` ✅
- region: `regionText` — `parse/region.ts` ✅
- recruit: `recruitStartText`/`recruitEndText`/`recruitText` — `parse/recruit.ts` ✅
- 메타: `id`/`title`/`summary`/`category`/`sourceUrl`/`source` — normalizePolicy ✅

보고서 §5.5 명시대로 **잠정 계약**(실제 온통청년 필드명 미확정). 계약 자체는 fixture↔파서 양쪽이 동일 키로 안정. Phase 2 실측 시 raw 키 보정은 파서 입력측만 변경하면 됨(Policy 출력 계약 불변).

### 2-3. 후속 Phase 소비 적합성 (명백한 누락만 지목) — **누락 없음**

- **Phase 3 eligibility.evaluate 입력**: `ageMin/ageMax`(null=미지정), `income.kind`에 `'unknown'` 포함(탈락 금지 보수 처리 가능), `regionCodes`/`isNationwide`(지역 매칭), `recruit: RecruitWindow`. 자격 판정에 필요한 축 모두 존재. `UserProfile`(types.ts:71-78) 선언됨 — Phase 3 확정 위임 명시(YAGNI 허용).
- **Phase 3 모집상태 분류 위임 정합성**: `RecruitWindow{kind:'dated'|'always'|'unknown', start, end}` = **파싱 결과(상태 없음)**, `RecruitStatus = 'now'|'soon'|'closed'|'unknown'` = **계산 결과** — 두 타입 분리가 명확. Phase 1은 window만 생성(`Date.now()` 미사용, recruit.ts 순수), Phase 3가 clock 주입해 status 계산. **위임 경계 정합** — Policy에 status를 미리 박지 않아(과한 선예측 회피) 보수적이고 올바름.
- **Phase 4 traverse**: `GraphNode{id,label,concept,allowedCategories?,keywords?,children?,kind?}` 선언 완료. `Policy.category`(string\|null)가 노드 `allowedCategories` 매칭 축 제공. Phase 1 컴파일 수준 충족.

### 2-4. 안전 불변식 경계 (소득/지역 누락 보존) — **유지**

- 소득 누락→`{kind:'unknown', raw:null}`, 숫자없는 텍스트→`unknown`+raw 보존 (income.ts:11-25). `unknown ≠ none` 타입·런타임 모두 구분 → Phase 3 부적격 통과 차단 가능.
- 지역 누락→`regionCodes:[]/isNationwide:false`, '전국'만 true (region.ts:16-30). `불명 ≠ 전국` 유지.
- 비객체/null/배열 입력→`safeDefault` throw 없이 Policy 반환 → 깨진 데이터로도 결과 도달.

---

## 3. 미해결/추적 항목 (게이트 영향 없음)

- audit low 1건(esbuild, dev-server 한정) — 기존·신규 아님. Phase 진행 차단 아님.
- 보고서 §5 보수 처리 항목(id placeholder 'unknown', income amountMax, 타 시·도 코드, raw 실측 키)은 모두 `// TODO(확인필요):` 주석 + Phase 2/3 위임으로 추적됨. Phase 1 계약 안정성에 영향 없음.

---

## 4. 담당자 통신

- **tdd-implementer**: 경계 불일치·게이트 실패 **없음** → 수정 요청 사항 없음. audit low는 보고서에 이미 고지·승인 범위.
- **리더(오케스트레이터)**: Phase 1 **전 게이트 PASS, 경계 정합 확인**. 다음 Phase 진행 가능.
