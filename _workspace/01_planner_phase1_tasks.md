# Phase 1 — 토대 & 도메인 타입 · TDD 작업 명세 (phase-planner 산출)

> 초기 실행 · 그린필드. SSOT: `docs/plans/PLAN_youth-policy-diagnosis-mvp.md`

## 작업 순서 (왜 이 순서인가)
스캐폴드(전제) → normalizePolicy 테스트(RED, 계약 먼저 고정) → 타입 → 구현 → 앱 셸 → 헬퍼 추출.
정규화 계약은 Phase 2·3·4 입력이므로 테스트로 가장 먼저 못박는다.

| 순서 | Task | 단계 | 파일 |
|---|---|---|---|
| 0 | 스캐폴드 | 사전 | package.json, vite/vitest/ts/tailwind/eslint 설정 |
| 1 | Test 1.1 normalizePolicy 테스트 | 🔴 RED | test/unit/domain/normalizePolicy.test.ts, test/fixtures/ontong-policies.sample.json |
| 2 | Task 1.2 도메인 타입 | 🟢 | src/domain/types.ts |
| 3 | Task 1.3 normalizePolicy 구현 | 🟢 | src/domain/normalizePolicy.ts |
| 4 | Task 1.4 앱 셸 | 🟢 | index.html, src/main.tsx, src/App.tsx, src/index.css |
| 5 | Task 1.5 파싱 헬퍼 추출 | 🔵 | src/domain/parse/{age,income,region,recruit}.ts |

## 불일치 / 확인 필요 (추정 금지)
1. 온통청년 raw 필드 스키마 미확정 → 잠정 fixture로 계약 고정, 실제 필드는 Phase 2 실측 보정.
2. 연령 표기 다양성(`19~34`, `만 19세~만 34세`, `34세 이하`, `제한없음`) — 미커버는 null.
3. 소득 조건 구조 불명 → IncomeCriteria 잠정.
4. 지역 코드 체계 불명 → regionCodes[] + 원문 regionText 병행.
5. GraphNode는 Phase 4 사용 — Phase 1은 컴파일 가능 수준만.
- 보수 결정 필요: 역순 연령, 역전 날짜, id null, 신선도 주입 책임.

## 스캐폴드 (PowerShell 체이닝 금지 — 개별 실행)
수동 파일 구성 권장(create vite 대화형 회피, 결정적). Serein 스택 복제.
- 런타임: react@^19, react-dom@^19, date-fns@^4, lucide-react
- 개발: vite@^7, typescript@~5.9, @vitejs/plugin-react, vitest@^4, @vitest/coverage-v8, @testing-library/react, @testing-library/jest-dom, jsdom, tailwindcss@^3.4, postcss, autoprefixer, eslint + ts-eslint
- 설정: tsconfig(strict, noUncheckedIndexedAccess, jsx react-jsx, paths @/*→src/*), vitest(environment jsdom, globals, setupFiles jest-dom, coverage.provider v8, coverage.include ['src/domain/**'], thresholds 90, clearMocks), tailwind(content index.html+src), .gitignore(node_modules,dist,coverage)
- scripts: dev/build(tsc -b && vite build)/test(vitest run)/lint(eslint .)/preview
- DoD: npm test 러너 동작, tsc --noEmit 통과, coverage가 src/domain만 집계.

## 🔴 RED — Test 1.1 normalizePolicy
계약: `normalizePolicy(raw: unknown): Policy` — **절대 throw 금지**, 파싱 불가는 null/unknown/[].

- S1 연령 정상(경계): "19~34"→19/34, "만 19세~만 34세"→19/34, 숫자 직접→19/34, "34세 이하"→null/34, "19세 이상"→19/null, "제한없음"→null/null. ageMax 정확히 34(off-by-one 금지), 미지정 반드시 null.
- S2 연령 이상치: ""/null/{}/"서른넷"→null/null throw 없음. "34~19"(역순)→보수 거부(null/null) 권장. 타입오염→null/null.
- S3 소득(잠정): "중위소득 150% 이하"→medianRatio/150, "소득 무관"→none, ""/누락→**unknown(none 아님)**, 숫자없음→unknown+raw 보존. **unknown≠none 절대 구분**.
- S4 지역(잠정): "서울특별시"→서울 식별+원문, "서울특별시 강남구"→서울+자치구, "전국"→isNationwide true, ""/누락→[]·false(보수), "부산"→서울 미포함. **불명≠전국**.
- S5 모집기간(파싱·보존만, 분류는 Phase 3): start/end ISO 파싱, "2026.06.01~2026.08.31" 추출, "상시모집"→always, ""/누락→unknown, 깨진날짜→null+unknown(Invalid Date 방어), 역전→unknown 권장. normalize에서 Date.now() 금지.
- S6 깨진 fixture 방어: null/undefined/문자열/42/[]→throw 없이 Policy 반환. {id:null,title:null}→안전 기본값. 비객체/undefined 입력은 테스트 인라인(JSON 표현 불가).
- S7 원문/신선도: sourceUrl 보존(없으면 null), source 라벨 보존. normalize는 fetchedAt/updatedAt 생성 안 함(I/O·시간 없음) — Phase 2 주입.

RED DoD: npm test 모듈 미존재 FAIL 눈으로 확인, S1~S7 전부 존재, 확인필요는 잠정 단정+TODO.

## 🟢 Task 1.2 도메인 타입 (src/domain/types.ts)
- Policy: id:string, title:string, summary:string|null, ageMin/ageMax:number|null, income:IncomeCriteria, regionCodes:string[], regionText:string|null, isNationwide:boolean, recruit:RecruitWindow, category:string|null, sourceUrl:string|null, source:'ontong'|'mongttang'|string, raw?:unknown
- IncomeCriteria: kind:'none'|'medianRatio'|'amountMax'|'unknown'(none≠unknown), maxRatio?, maxAmount?, raw:string|null
- RecruitWindow: kind:'dated'|'always'|'unknown', start:string|null, end:string|null (ISO 문자열)
- RecruitStatus: 'now'|'soon'|'closed'|'unknown' (Phase1은 선언만, 분류는 Phase3 clock)
- UserProfile: age:number, region:string, income?:{medianRatio?;amount?} (YAGNI, Phase3 확정)
- GraphNode: id, label, concept, allowedCategories?, keywords?, children?, kind?:'entry'|'branch'|'leaf'|'safety' (Phase4 소비)
DoD: export, tsc --noEmit 통과.

## 🟢 Task 1.3 구현 (src/domain/normalizePolicy.ts)
순수함수(I/O·Date.now() 금지), throw 금지, 보수 기본값, unknown≠none, 불명지역≠전국, 원문 보존. 인라인 파싱 OK(추출은 1.5).
가드: typeof object && !==null 아니면 기본 Policy → 연령 → 소득 → 지역 → 모집(Invalid Date 방어).
DoD: S1~S7 전부 그린(스킵 0), 커버리지 ≥90%, 깨진입력 throw 없음, tsc 통과, 3회 flaky 없음.

## 🟢 Task 1.4 앱 셸
index.html(#root), main.tsx(React19 createRoot), App.tsx(placeholder), index.css(@tailwind). 라우터는 Phase5 결정(확인필요). DoD: npm run dev 셸 렌더, build 성공.

## 🔵 Task 1.5 헬퍼 추출
parseAgeRange/parseIncome/parseRegion/parseRecruit 추출, normalizePolicy는 조합+가드+원문 보존만. DoD: Test 1.1 전건 그린 유지(회귀 없음), 커버리지 유지, lint 0, tsc 통과.

## 종료 게이트
npm run dev 렌더 · npm test 그린(스킵0)·normalize 커버리지≥90% · 깨진입력 throw 없음 · lint 0 · tsc --noEmit · build 성공 · audit 신규취약점 없음 · RED→GREEN→REFACTOR 순서 · 3회 flaky 없음.

## safety-domain-auditor 사전 공유 (Phase 1 안전 포인트)
1. unknown≠none(소득) — 불명을 무관으로 흡수하면 Phase3 부적격 통과. S3-c/d.
2. 불명지역≠전국 — S4-d.
3. throw 없는 방어 = 위기 청년이 결과 화면에 도달 가능. S6 전건.
4. 원문 보존 = '추정' 고지 근거(regionText/income.raw/sourceUrl).
5. 확인필요 항목은 보수 처리(거부/null) 방향이 안전.
