# Phase 1 구현 보고서 — 토대 & 도메인 타입 (tdd-implementer)

> SSOT: `_workspace/01_planner_phase1_tasks.md` · 계획: `docs/plans/PLAN_youth-policy-diagnosis-mvp.md` Phase 1
> 방법론: RED → GREEN → REFACTOR. 도메인 순수함수, Date.now() 금지, 보수적 판정.

## 1. 구현 요약

| 단계 | 산출물 | 상태 |
|---|---|---|
| 0 스캐폴드 | package.json, vite/vitest/tsconfig(app·node)/tailwind/postcss/eslint/.gitignore, test/setup.ts | ✅ |
| 🔴 RED | test/unit/domain/normalizePolicy.test.ts, test/fixtures/ontong-policies.sample.json | ✅ (모듈 미존재 FAIL 확인) |
| 🟢 GREEN 타입 | src/domain/types.ts (Policy, IncomeCriteria, RecruitWindow, RecruitStatus, UserProfile, GraphNode) | ✅ |
| 🟢 GREEN 구현 | src/domain/normalizePolicy.ts (throw 금지·순수·보수) | ✅ |
| 🟢 GREEN 셸 | index.html, src/main.tsx, src/App.tsx, src/index.css, src/vite-env.d.ts | ✅ |
| 🔵 REFACTOR | src/domain/parse/{primitives,age,income,region,recruit}.ts 추출, normalizePolicy는 조합+가드+원문보존만 | ✅ |

스택: react@^19, react-dom@^19, date-fns@^4, lucide-react / vite@^7, typescript@~5.9, vitest@^4, @vitest/coverage-v8, @testing-library/{react,jest-dom}, jsdom, tailwindcss@^3.4, eslint + typescript-eslint, @types/node.
설정: tsconfig strict + noUncheckedIndexedAccess + paths `@/*`→`src/*`; vitest jsdom·globals·setup(jest-dom)·coverage.provider v8·**coverage.include ['src/domain/**']**·thresholds 90·clearMocks.

## 2. 🔴 RED 실패 출력 (인용)

`normalizePolicy.ts` 작성 전 `npm test` 결과 — 모듈 미존재로 스위트 로드 실패:

```
 FAIL  test/unit/domain/normalizePolicy.test.ts [ test/unit/domain/normalizePolicy.test.ts ]
Error: Failed to resolve import "@/domain/normalizePolicy" from
       "test/unit/domain/normalizePolicy.test.ts". Does the file exist?
  Plugin: vite:import-analysis
  File: .../test/unit/domain/normalizePolicy.test.ts:2:32
  2  |  import { normalizePolicy } from "@/domain/normalizePolicy";
     |                                   ^
 Test Files  1 failed (1)
      Tests  no tests
```

정상적인 RED(함수 미존재 FAIL). 이후 타입+구현 작성으로 GREEN 전환.

## 3. 통과 테스트 · 커버리지 수치

- **통과 테스트: 35 / 35 (스킵 0)** — S1~S7 전 시나리오 + recruit 경계 보강 3건.
- **flaky 없음**: 3회 연속 실행 모두 35 passed.
- **커버리지(src/domain만 집계)**:

```
File          | % Stmts | % Branch | % Funcs | % Lines
All files     |   98.87 |    98.13 |     100 |     100
 domain/parse |   98.78 |    97.77 |     100 |     100
  recruit.ts  |   97.14 |    95.23 |     100 |     100  (uncovered 27,43 = 방어적 분기)
Statements 98.87% (88/89) · Branches 98.13% (105/107) · Functions 100% (12/12) · Lines 100% (82/82)
```
→ 도메인 ≥90% 충족(전 항목). normalizePolicy.ts·types.ts·age/income/region/primitives 100%.

## 4. 종료 게이트 결과

| 게이트 | 명령 | 결과 |
|---|---|---|
| 테스트 | `npm test` | ✅ 35 passed (0 skip) |
| 커버리지 | `npm test -- --coverage` | ✅ 98.87% stmts / 100% lines (≥90) |
| 타입 | `npx tsc --noEmit` | ✅ 출력 없음(통과) |
| 린트 | `npm run lint` | ✅ 오류 0 |
| 빌드 | `npm run build` (tsc -b && vite build) | ✅ built in ~2s, dist 생성 |
| audit | `npm audit` | ⚠️ low 1건(아래 5) |

앱 셸: `vite build` 성공으로 main.tsx(React19 createRoot) → App 렌더 경로 검증. `npm run dev` 동일 진입점.

## 5. 남은 TODO / 확인 필요 (보수 처리 + 코드 주석)

명세 "확인 필요" 항목은 임의 결정 없이 **보수 방향(거부/null/unknown)** 으로 잠정 구현하고 `// TODO(확인필요):` 주석을 남김.

1. **id 누락/오염 시 fallback** — 순수함수 제약(Date.now()/random 금지)으로 결정적 placeholder `'unknown'` 반환. 안정·고유 id 부여는 **Phase 2 인제스트(원문 키 기반)** 로 위임. (`normalizePolicy.ts` fallbackId)
2. **소득 amountMax(금액 상한)** 표기 패턴 미확정 → 현재 unknown 보수 처리. Phase 2 실측 후 추가. (`parse/income.ts`)
3. **타 시·도 법정코드 매핑** — MVP는 서울(11)만 정밀 식별, 나머지는 식별 없이 isNationwide=false. Phase 2 확장. (`parse/region.ts`)
4. **역순 연령(34~19)** → 보수 거부 null/null. **역전 모집기간(end<start)** → unknown. (명세 "권장" 채택)
5. **온통청년 raw 스키마 미확정** — 잠정 fixture(`ageText`/`incomeText`/`regionText`/`recruitText`/`recruitStartText`/`recruitEndText`)로 계약 고정. 실제 필드명은 Phase 2 실측 보정 필요(계약 자체는 안정).
6. **npm audit low 1건**: `esbuild` dev-server 임의 파일 읽기(GHSA-g7r4-m6w7-qqqr). vite@7 전이 의존, **개발 서버 한정·프로덕션 번들 무관**. 신규 도입 아님(스택 기본). `npm audit fix`는 vite 메이저 변동 위험 있어 보류, 리뷰어 판단 위임.

## 6. 안전(safety-domain-auditor) 검증 포인트 — 구현 반영

- **소득 unknown ≠ none**: 텍스트 누락→`{kind:'unknown', raw:null}` (S3-c), 숫자 없는 텍스트→`unknown`+raw 보존 (S3-d). 불명을 무관으로 흡수하지 않음 → Phase 3 부적격 통과 차단.
- **불명 지역 ≠ 전국**: 지역 누락→`regionCodes:[] / isNationwide:false` (S4-d). "전국" 문자열에만 isNationwide=true.
- **throw 없는 방어**: null/undefined/문자열/42/[]/true → safeDefault Policy 반환(S6). 위기 청년이 깨진 데이터로도 결과 화면 도달 가능.
- **원문 보존**: regionText·income.raw·sourceUrl 보존 → '추정' 고지 근거.
- **시간·I/O 없음**: normalize는 fetchedAt/updatedAt 미생성(S7), 모집상태 분류는 Phase 3 clock 주입으로 위임. Date.now() 미사용(순수).

## 7. 경계면 메모 (다음 Phase 소비 대상)

- **Phase 2 (인제스트)**: `normalizePolicy(raw)`를 받기→정규화 단계에서 호출. id placeholder 'unknown' 교체(원문 키), fetchedAt/updatedAt 주입, regionCodes 시·도 매핑 확장, income amountMax 패턴 추가. raw 필드는 `Policy.raw`에 보존됨.
- **Phase 3 (자격 엔진)**: `RecruitWindow{kind,start,end}` + `RecruitStatus`를 입력으로 고정 clock 주입해 now/soon/closed 분류. `IncomeCriteria.kind==='unknown'`은 "확인 필요"로 보수 처리(탈락 금지). `ageMin/ageMax` null은 미지정.
- **Phase 4 (그래프/검색)**: `GraphNode{id,label,concept,allowedCategories?,keywords?,children?,kind?}` 선언 완료 — 마음건강 그래프 데이터가 채움.
- **공용 파싱 헬퍼**: `src/domain/parse/*`는 raw 레코드(`Record<string,unknown>`) 단위 파서. 재사용·단위 테스트 분리 용이.

## 8. 산출 파일 경로

- 테스트: `test/unit/domain/normalizePolicy.test.ts`, `test/fixtures/ontong-policies.sample.json`, `test/setup.ts`
- 도메인: `src/domain/types.ts`, `src/domain/normalizePolicy.ts`, `src/domain/parse/{primitives,age,income,region,recruit}.ts`
- 셸: `index.html`, `src/main.tsx`, `src/App.tsx`, `src/index.css`, `src/vite-env.d.ts`
- 설정: `package.json`, `tsconfig*.json`, `vite.config.ts`, `vitest.config.ts`, `tailwind.config.js`, `postcss.config.js`, `eslint.config.js`, `.gitignore`

→ **code-reviewer · safety-domain-auditor 리뷰 요청.** (특히 §5 확인필요 항목 보수 처리 방향, §6 안전 불변식)

---

## 수정 루프 1차 (code-reviewer · safety-domain-auditor 수렴 결함 3건)

두 리뷰어가 독립적으로 같은 부분일치(substring) 결함에 수렴. Phase 3 자격 엔진 상속 시 **부적격 통과** 직결이라 RED→GREEN으로 일반화 수정(특정 케이스 땜질 아님). 기존 35건 회귀 없음.

### 🔴 RED 추가 (12건, 먼저 실패 확인)
`npm test` → `Tests 7 failed | 40 passed (47)` — 신규 7건이 의도대로 실패:
```
× V1-a "소득과 무관하게 지원"(안내문) → unknown (none 오탐 차단)
× V1-b "중위소득 150% 또는 소득 무관"(혼합문) → medianRatio / 150 (상한 소실 금지)
× V2-a "전국체전 입상자"(비전국 표현) → isNationwide false
× V2-b "서울 거주, 전국체전 입상자 우대" → 서울 식별 + 전국 아님
× V3-a 무효 start("2026-13-99") + 유효 end → unknown (침묵의 dated 금지)
× V3-b 유효 start + 무효 end → unknown (대칭)
× V3-c recruitText 내 달력상 무효 날짜(2026.02.30~) → unknown (입력 있으나 파싱 실패)
```
회귀 고정 RED(처음부터 통과): V1-c "소득 무관"→none, V1-d "150퍼센트"→unknown, V1-e "150% 이내"→unknown, V2-c "전국"→true, V2-d "전국 청년"→true, V3-d 단일 유효날짜→dated.

### 🟢 GREEN 수정 (일반화)
- **V1 / S-3 — `src/domain/parse/income.ts`**: 순서 역전 — **구체 제약(중위소득 %)을 먼저** 매칭하고 `무관/제한없음`을 fallback으로. 추가로 `isIncomeUnrestricted`로 **앵커 매칭**(`(무관|제한 없음|상관 없음)$`) 적용 → "소득과 무관하게 지원" 안내문 오탐 차단, 혼합문에서 medianRatio 상한 보존. "소득 무관" 단독은 여전히 none.
- **V2 — `src/domain/parse/region.ts`**: 시·도 식별을 전국 여부와 **분리**(공존 가능). `isNationwideText`로 `전국(?=$|[\s,./]|청년|민|단위|거주|대상|일원)` — "전국"이 지역 지정 단위로 쓰인 경우만 true. "전국체전"(뒤에 '체') 미매칭, "전국"·"전국 청년" 매칭.
- **V3 / S-2 — `src/domain/parse/recruit.ts`**: `reconcile`가 `DatePart{raw, iso}`를 받아 **"입력 없음(raw=null)"과 "입력 있으나 파싱 실패(raw≠null && iso=null)"를 구분**. 한쪽이라도 파싱 실패면 보수적 `unknown`(침묵의 dated 금지). 둘 다 유효 + 역전도 unknown. 단일 유효 날짜는 dated 유지.

### 게이트 재실행 (수정 후)
| 게이트 | 결과 |
|---|---|
| `npm test` | ✅ **47 passed (0 skip)**, 3회 연속 flaky 없음 |
| `npm test -- --coverage` (src/domain만) | ✅ stmts 97.87% · branches 96.46% · funcs 100% · lines 98.85% (≥90). 미커버 recruit.ts:80 = reconcile 양쪽 raw=null 분기(parseRecruit 가드로 도달 불가한 방어 코드) |
| `npx tsc --noEmit` | ✅ 통과 |
| `npm run lint` | ✅ 오류 0 |
| `npm run build` | ✅ 성공 |

### 안전 효과
세 결함 모두 **부적격 통과(false negative) 차단** 방향으로 수렴 수정: 소득 상한 소실 방지(V1), 비전국→전국 오인 방지(V2), 무효 모집기간이 dated로 위장하는 침묵 실패 차단(V3). Phase 3 엔진은 이 보수 출력(unknown/none 구분, isNationwide 정확, recruit.kind 무효=unknown)을 신뢰 가능.
