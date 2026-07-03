# 39 — 프론트 묶음 QA (D-① · E · F-①②③)

작성: 2026-07-02 · integration-qa → 리더(오케스트레이터)
대상 변경분: 신규 4 소스(`policyChecklist.ts`·`documents.ts`·`youthCenters.ts`·`YouthCenterLink.tsx`) + 수정(`eligibility.ts` axes·`tailwind.config.js`·`index.css`·funnel 6·테스트).
근거 SSOT: 루트 `DESIGN.md`, 명세 `_workspace/39_planner_front-bundle_tasks.md`.

## 최종 판정: **통과 (PASS)** — blocker/High 0

품질 게이트 6종 전부 통과, 경계면 5개 전부 정합, 확정 카피 13행 전수 일치. Low 1건(문구 미세 변형)만 개선 권고.

---

## 1. 경계면 교차 비교 (5개 판정)

### ① 엔진(EvaluatedPolicy.axes) ↔ 카드(policyChecklist) — **정합 PASS**
- 엔진 계약(`eligibility.ts:47-63`): `AxisResult = { axis: 'age'|'income'|'region'|'recruit'; verdict: 'pass'|'review'|'blocked'; reason?: ReasonCode }`, `EvaluatedPolicy.axes?: AxisResult[]`(옵셔널 추가).
- 카드 소비(`policyChecklist.ts:1,72-89`): `import type { AxisResult, AxisKind }` 동일 타입 재사용 → 필드명·옵셔널·타입 100% 합치(shape 드리프트 0).
- pass만 ✓(`passText`), review만 ?(`REVIEW_TEXT`), blocked는 항목화 제외(`policyChecklist.ts:86`) — DESIGN §7-4·불변식 준수.
- recruit-pass는 배지가 담당하므로 체크리스트에서 `null` 반환(`policyChecklist.ts:52-54`) → 중복 노출 0.
- **방어**: `axes` undefined(구 경로)·비배열 → `buildChecklist` `[]` 반환(`policyChecklist.ts:77`) → 카드 `checklist.length > 0` 가드(`PolicyResultCard.tsx:147`)로 미렌더, throw 0. 빈 배열도 동일 경로. `policy` undefined도 `!policy` 가드로 흡수.

### ② DESIGN §2 토큰 ↔ tailwind.config.js ↔ 컴포넌트 — **정합 PASS**
- 토큰명·hex 1:1 대조(전량 일치):
  - cream-50 `#FAF6EF`, cream-100 `#F5EFE4`, sand-200 `#E8E0D3`, sand-400 `#B3AA97`, sand-500 `#8A8272`, sand-600 `#6B6558`, ink-800 `#4A453C`, ink-900 `#2C2A26`.
  - clay-50 `#FAECE7`, clay-500 `#D85A30`, clay-700 `#993C1D`, clay-800 `#712B13`(§2의 clay-700 2단계 `#993C1D`/`#712B13`를 700/800으로 분리 등록 — 합리적).
  - teal-50 `#E1F5EE`/teal-800 `#085041`, blue-50 `#E6F1FB`/blue-800 `#0C447C`, amber-50 `#FAEEDA`/amber-600 `#854F0B`, warmgray-50 `#F1EFE8`/warmgray-800 `#444441`. (§2 review 경미 텍스트를 amber-600으로 표기 → 카드도 `text-amber-600` 사용, 일치.)
- **hex 직접 사용 잔존 grep(신규/수정 funnel 표면)**: `src/ui/funnel/*.tsx`에서 `#[0-9a-f]{3,6}` **매치 0** → 컴포넌트는 토큰명만 사용(DESIGN §2 준수).
- **soon 배지**: `PolicyResultCard.tsx:84` `bg-blue-50 text-blue-800` — §2 정보성 소배지(blue-50/blue-800) 반영 확인.

### ③ DESIGN §5 카피 표 ↔ 실제 렌더 — **13행 전수 일치 (불일치 0, 미세 변형 1건 아래 Low)**
| §5 위치 | 확정 문구 | 렌더 소스 | 판정 |
|---|---|---|---|
| 헤더 | 요즘 어때요? | FunnelContainer:102 | ✓ |
| 헤더 보조 | 지금 상황을 편하게 적어주면, 맞는 정책을 찾아드려요 | FunnelContainer:103 (+마침표) | ✓ |
| placeholder | 자취하는데 월세가 벅차요… | FreeTextInput:27 | ✓ |
| 버튼 | 내 정책 찾기 | FreeTextInput:86 | ✓ |
| 헤드라인 | 상황에 맞을 만한 N개를 찾았어요 | FunnelContainer:96 | ✓ |
| 빈 결과 | 이 방향으론 못 찾았어요. 이런 쪽은 어때요? | ResultList:57 | ✓ |
| 배지 now | 지금 바로 신청돼요 | PolicyResultCard:83 | ✓ |
| 배지 soon | 곧 신청이 열려요 | PolicyResultCard:84 | ✓ |
| 배지 review(경미) | 거의 다 왔어요 — N만 확인 | PolicyResultCard:115 | ✓ |
| 배지 review(다수) | 몇 가지만 확인하면 돼요 | PolicyResultCard:86,116 | ✓ |
| 원문 버튼 | 신청 페이지 열기 (온통청년) | PolicyResultCard:177 | ✓ |
| 브리지(F-①) | 열리는 페이지에서 '신청하기' 버튼을 찾으면 돼요 | PolicyResultCard:184 | ✓ |
| 동행(F-③) | 혼자 하기 버거우면 OO청년센터가 같이 해줘요 | youthCenters.ts:50-51 | △ Low(공백) |
- 신선도 라인("어제 업데이트된 전국 N개")은 R-5 권고대로 스코프 제외(실데이터 부재) — 헛숫자 금지 원칙 준수. 카드 개별 "최종 업데이트 YYYY-MM-DD"(PolicyResultCard:166)는 실데이터라 유지.
- 금지 패턴: "자격이 됩니다/안 됩니다"·시스템 주어 문자열 소스 grep 0. 체크리스트는 "충족(추정)"만 사용.

### ④ FunnelContainer ↔ YouthCenterLink ↔ profile — **정합 PASS**
- regionCode 전달: `FunnelContainer:151` `<YouthCenterLink regionCode={profile?.regionCode} />` → `YouthCenterLink:20-22` → `getYouthCenter`/`youthCenterMessage`.
- 시·도명 반영: regionCode '26' → `sidoNameByPrefix('26')='부산광역시'` → "혼자 하기 버거우면 부산광역시 청년센터가 같이 해줘요".
- 미입력/미지 코드 폴백: `youthCenterMessage`가 name undefined 시 "혼자 하기 버거우면 청년센터가 같이 해줘요"(지역명 없는 일반 문구), throw 0.
- **날조 0**: phone/centerName 전량 null(youthCenters.ts:32) → tel·기관명 UI 미렌더(YouthCenterLink:36-45). 통일 링크만 노출(`YOUTH_CENTER_URL=https://www.youthcenter.go.kr`, curl 200 확인 주석).
- **위기 층위**: YouthCenterLink는 `result-section` 내부(FunnelContainer:150-151)에만 존재 → 위기 early-return(FunnelContainer:82-88)에서 SafetyBanner 단독, 동행 블록 미렌더. 위기 전문기관(109·1577-0199) 문구 부재.

### ⑤ T8 회귀(profile 변경 → 원격 search memo 재생성 방지) — **정합 PASS**
- `App.tsx:109-115` `search` useMemo deps `[]`(마운트 1회 생성) — profile 미포함.
- `App.tsx:118-129` `deps` useMemo deps `[now, index, env.embedProvider, env.crisisAnchors, search]` — **profile 미포함** 확인.
- profile→재평가는 useFunnel effect가 담당(주석 App.tsx:60-62 명시). 프로필 변경이 Edge Function 검색 남발을 유발하지 않음.

---

## 2. 품질 게이트 (출력 인용)

### npm run test — **PASS (755/755, 스킵 0)**
```
 Test Files  49 passed (49)
      Tests  755 passed (755)
```
(755 기준 정확히 일치.)

### 플레이키 (3회 반복) — **PASS (flaky 0)**
```
=== RUN 1 ===  Test Files 49 passed (49)  Tests 755 passed (755)
=== RUN 2 ===  Test Files 49 passed (49)  Tests 755 passed (755)
(+ 최초 실행 1회 동일)
```

### 커버리지 (임계) — **PASS**
```
All files          |   94.43 |    88.06 |   97.38 |   96.76
 domain            |   93.26 |    93.98 |     100 |   96.51   (임계 ≥90 전항목 충족)
 data              |   96.94 |    84.84 |     100 |   98.37   (임계 ≥80 충족)
 ui/funnel         |   90.03 |    85.65 |   90.41 |   92.44   (임계 lines/func/stmt≥85·branch≥80 충족)
 llm               |   94.11 |    88.79 |     100 |   96.96   (임계 ≥90/br≥85 충족)
 retrieval         |   94.88 |    86.33 |     100 |    99.3   (임계 ≥80 충족)
```
vitest.config 계층 임계(domain≥90, data≥80) 강제 — coverage run exit 0(임계 위반 없음). 명세 요구(domain≥90·data≥80) 충족.

### npm run lint — **PASS (오류 0)**
```
> eslint .
(출력 없음 = 위반 0)
```

### npx tsc --noEmit — **PASS**
```
EXIT:0
```

### npm run build — **PASS**
```
✓ 1928 modules transformed.
✓ built in 14.65s
```
(chunk >500kB 경고는 기존 informational — 오류 아님. tsc -b 선행 통과.)

### npm audit — **신규 취약점 없음 (PASS)**
```
{ info:0, low:1, moderate:0, high:0, critical:0, total:1 }
esbuild 0.27.3-0.28.0 (low) — vite 개발서버 전이 의존성
```
- low 1건은 esbuild(vite devDependency 전이) — **이 묶음이 추가한 것 아님**(신규 소스 4개는 새 npm 의존성 0, lucide-react/date-fns 기존). 프로덕션 런타임 영향 없음(dev-server 한정).
- **Pretendard CDN은 의존성 아님 확인**: `index.css:2` `@import url(...jsdelivr...)` — CSS 임포트라 npm 트리·audit 대상 아님. 오프라인 시 `font-sans` 폴백.

---

## 3. 결함 등급 목록

- **blocker**: 없음.
- **High**: 없음.
- **Med**: 없음.
- **Low-1 (카피 미세 변형)**: DESIGN §5 동행 문구는 "OO**청년센터**"(붙임)인데 렌더는 "부산광역시**공백**청년센터"(`youthCenters.ts:50` 템플릿 리터럴 공백). §5 표기 그대로면 "부산광역시청년센터"가 되어 가독성 저하 — 현재 "부산광역시 청년센터"가 오히려 자연스러움. 임의 변형이 아니라 가독성 개선으로 판단하나, DESIGN §5 문구와 1:1은 아님. **권고**: DESIGN §5 표기를 "OO 청년센터"(공백)로 정정하여 SSOT-코드 정합화(코드 변경 아닌 문서 정정). 안전·기능 무영향.

---

## 4. 담당자 통지 필요 항목
- 없음(blocker/High/Med 0). Low-1은 DESIGN.md §5 문서 정정 권고 사항으로 리더 판단.
