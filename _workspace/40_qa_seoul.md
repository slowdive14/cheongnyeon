# 40 QA — Phase B(서울 청년몽땅 수집기) 통합 정합성 & 품질 게이트

- 일시: 2026-07-04
- 대상: 신규 `src/data/seoulClient.ts`, `src/domain/parse/mentalHealth.ts`, `src/data/__fixtures__/seoul-native.sample.json`, `test/unit/data/seoulClient.test.ts` / 수정 `src/data/ontongClient.ts`, `scripts/ingest.ts`
- 판정: **통과(PASS)**. 모든 게이트 통과, 경계 불일치 0(blocker/high). Low 1건(정보성).

---

## 1. 품질 게이트 (출력 인용)

| 게이트 | 결과 | 수치/인용 |
|--------|------|-----------|
| `npm test` (run 1) | ✅ | `Test Files 50 passed (50)` / `Tests 771 passed (771)` — 스킵 0 |
| `npm test` (run 2) | ✅ | `50 passed (50)` / `771 passed (771)` |
| `npm test` (run 3) | ✅ | `50 passed (50)` / `771 passed (771)` |
| 플레이키 | ✅ | 3회 연속 동일(771/771) — flaky 없음 |
| `npx tsc --noEmit` | ✅ | `TSC_EXIT=0` (에러 0) |
| `npm run lint` (eslint) | ✅ | `LINT_EXIT=0` (오류 0) |
| `npm run build` | ✅ | `✓ built in 7.23s`, `BUILD_EXIT=0` (tsc -b + vite build) |
| `npm audit` | ✅(신규 0) | `1 low severity vulnerability` — 아래 Low 참조 |

보고값(771 tests / 50 files, tsc 0, eslint 0, build ✓) **재현 확인 완료**.

### Low (1줄 기록)
- `npm audit`: esbuild 0.27.3–0.28.0 dev-server 파일읽기 GHSA-g7r4-m6w7-qqqr (low 1건) — Phase B가 `package.json`/`package-lock.json`을 변경하지 않았으므로(git status 확인) **신규 취약점 아님**(기존 transitive dev 의존성). 게이트 무영향.

---

## 2. 경계면 교차 검증 (양쪽 동시 대조)

### 2.1 seoulClient.adaptSeoulItem 산출 raw ↔ normalizePolicy 입력 계약 — 정합 ✅
`adaptSeoulItem`(seoulClient.ts:238–251) 출력 필드를 각 parse 헬퍼 입력과 필드명·타입 대조:

| 어댑터 출력 | 소비처 | 대조 결과 |
|-------------|--------|-----------|
| `ageText`(문자열, `(` 앞 절단) | `parse/age.ts` `asNonEmptyString(r.ageText)` → range 정규식 | 정합. `만19세~34세` → 19/34. |
| `incomeText` | `parse/income.ts` `asNonEmptyString(r.incomeText)` | 정합. `중위소득 150% 이하` → medianRatio 150. |
| `regionText`='서울특별시' | `parse/region.ts` `asNonEmptyString(r.regionText)` | 정합. SIDO 매칭 → `regionCodes ['11']`. |
| `recruitStartText`/`recruitEndText`(ISO) | `parse/recruit.ts` `asNonEmptyString(r.recruit*Text)` | 정합. `2026-05-27`/`2026-05-29` → dated. |
| `category` | `normalizePolicy` `asNonEmptyString(r.category)` | 정합. `복지.문화`/`마음건강` 그대로 보존. |
| `sourceUrl`(view.do 정본) | `normalizePolicy` `asNonEmptyString(r.sourceUrl)` | 정합. |
| `source`='seoul-youth' | `normalizePolicy` `asNonEmptyString(r.source)` | 정합. `dedupeBySourceId` 키 `source+id`에 반영. |
| `orgName`(옵셔널) | `ingest.orgOf(raw.orgName)`(2차 유사도) | 정합. `raw` 보존 경로로 접근 가능. |

특이: 어댑터는 온통과 달리 `ageText`(텍스트) 경로를 쓰고 온통은 `ageMin/ageMax`(숫자). 둘 다 `parseAgeRange`가 커버(숫자 우선, 없으면 텍스트) — 계약 위반 아님. `id`/`title`은 빈 문자열 시 `undefined` 반환 → normalizePolicy가 `fallbackId()`('unknown') 처리 → ingest에서 droppedNoId. 계약 정합.

### 2.2 정규화된 서울 Policy ↔ ingest() 파이프라인 — 정합 ✅
- **dedupeBySourceId(source+id)**: 서울 키는 `seoul-youth+V202600005` 형태로 온통(`ontong+...`)과 네임스페이스 분리 → 동일 숫자-ID 충돌 불가(그리고 클라이언트가 숫자-ID를 원천 제외).
- **seoulVerdict 게이트**: 서울 정책 `regionCodes ['11']` → `pass`. 통합 재현으로 2건 모두 편입 확인(§3).
- **collectManualCandidates 교차출처**: `a.id===b.id && a.source===b.source`일 때만 skip → **ontong↔seoul-youth 쌍은 비교됨**(교차출처 유사 정책 수동검증 후보로 검출, 자동병합 없음). 계약 의도대로.

### 2.3 scripts/ingest.ts 합류 클라이언트 ↔ ingest() IngestClient.fetchAll 계약 — 정합 ✅
- `scripts/ingest.ts:80–92`가 조립하는 `client: IngestClient`는 `fetchAll(): Promise<unknown[]>` 시그니처 준수. 내부에서 `[...ontongItems, ...seoulItems]` 병합.
- **부분실패 격리**: seoul `fetchAll`을 try/catch로 감싸 실패 시 `seoulItems=[]`로 폴백(온통 적재 보존). `createSeoulClient({ live: false })` 기본은 빈 배열 → 파이프라인 무영향. 계약 정합.

### 2.4 ontongClient 리팩터(mentalHealth 이관) 동작 보존 — 정합 ✅
- `isMentalHealthTitle`가 `ontongClient.ts`·`seoulClient.ts` 공용 SSOT(`src/domain/parse/mentalHealth.ts`)로 이관. `adaptOntongItem`은 `isMentalHealthTitle(title, mclsfNm)` 그대로 호출.
- `ontongClient.test.ts` 기존 category 판정 케이스(마음건강/일자리/범용키워드 오분류 차단/소득 등) 전부 통과(771/771에 포함). 판정 동작 보존 확인.

---

## 3. 추가 검증 — 다중 클라이언트 병합 통합 재현

임시 통합 테스트(`ontong fixture ∪ seoul fixture` → 실 `ingest()`)로 재현·확인 후 스크래치 제거:
```
SEOUL_IDS        [ 'V202600005', 'V202500013' ]     # 서울 2건 모두 편입(source=seoul-youth)
SEOUL_CATEGORIES [ '복지.문화', '마음건강' ]          # 카테고리 보존
SEOUL_REGIONCODES [ ['11'], ['11'] ]                # 서울 게이트 pass
ONTONG_IDS       [ 'ON-0001','ON-0002','ON-0004','ON-0005' ]  # 온통 유실 없음(ON-0003 부산은 서울필터 정상 탈락)
```
→ 서울 정책 올바로 편입, 온통 정책 유실 없음(부산 탈락은 서울필터 기대동작이며 서울 합류로 인한 회귀 아님).

### 제안(비차단, Should)
현재 `test/integration/ingest/pipeline.test.ts`는 온통 fixture만 사용한다. 위 다중 클라이언트 병합 케이스(seoul-youth 편입 + 온통 유실 없음 + 교차출처 manualCandidate 검출)를 `pipeline.test.ts`에 상설 추가하면 서울↔온통 경계 회귀를 상시 가드. `createSeoulClient({fixture:true})`·`createOntongClient({})` 조립으로 결정적(주입 fetch 불요).

---

## 4. 리더 보고 요약
- Phase B 게이트: **전부 통과**(771 tests/50 files·tsc 0·eslint 0·build ✓·audit 신규 0), 3회 플레이키 없음.
- 경계 불일치: **0(blocker/high)**. 데이터→도메인, 도메인→파이프라인, 스크립트→ingest, ontong 리팩터 보존 모두 정합.
- Should 1건: 다중 클라이언트 병합 통합 케이스를 pipeline.test.ts에 상설화 제안(구현자 재량).
- Low 1건: esbuild dev-server 취약점 — Phase B 무관(의존성 무변경).
