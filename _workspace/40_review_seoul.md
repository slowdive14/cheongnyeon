# Code Review — Phase B (서울 청년몽땅정보통 수집기) · 기술 품질

검수자: code-reviewer · 일자: 2026-07-04
범위: 기술 품질 · 타입 안전 · React/TS 관용성 · 테스트 충실도 (안전·도메인 축은 safety-domain-auditor 담당)
대상: `src/data/seoulClient.ts`(신규), `src/domain/parse/mentalHealth.ts`(신규), `src/data/ontongClient.ts`(수정), `scripts/ingest.ts`(수정), `src/data/__fixtures__/seoul-native.sample.json`(신규), `test/unit/data/seoulClient.test.ts`(신규)

## 게이트 재현 (직접 실행)

| 게이트 | 명령 | 결과 |
|---|---|---|
| 전체 테스트 | `npx vitest run` | ✅ 771 passed / 50 files |
| seoul+ontong 단위 | `npx vitest run …seoulClient …ontongClient` | ✅ 36 passed |
| 타입 | `npx tsc --noEmit` | ✅ 0 error |
| 린트 | `npx eslint <changed>` | ✅ 0 |

보고된 게이트 상태(771/tsc 0/eslint 0)를 그대로 재현 확인. **blocker/High 없음** — 즉시 수정 대상 없음.

---

## 발견 목록

### blocker
없음.

### High
없음. (아래 Med 항목 중 `parseSeoulListItems` 정규식 취약성은 라이브 크롤 옵트인·B0 정찰 확인·부분실패 격리로 리스크가 억제되어 High까지 올리지 않음. 서울 라이브 스코프가 확대되면 재평가 권고.)

### Med (보고만 — 하네스 검수강도 정책상 defer)

**M1. `parseSeoulListItems` 목록 정규식이 `goView('KEY');">TITLE<` 단일 형태에만 견고 (쟁점 #2 관련).**
직접 프로빙(7개 변형) 결과 3개 형태에서 **항목이 조용히 누락**됨:
- 제목이 중첩 태그로 감싸짐 `onclick="goView('V1');"><span class="new">N</span>제목</a>` → `[]` (신규 배지·아이콘 span은 eGov 목록에서 흔함)
- goView 인자가 큰따옴표 `goView("V1")` → `[]`
- goView 다중 인자 `goView('V1','001')` → `[]`

정상 동작 확인: 표준형, `>` 뒤 공백·개행, `&amp;` 엔티티, onclick 뒤 추가 속성.
근거·완화: B0 정찰(`_workspace/40_B0_recon.md` §1)이 실사이트에서 `goView(key)` 단일인자·평문 제목을 실측했고, 실패해도 `safeGet`+개별 격리로 throw는 없다(전체 절단 아님). 다만 사이트 마크업이 미세 변경되면 **에러 없이 수집량이 0으로 수렴**하는 유형의 침묵 실패라 관측이 어렵다.
제안(비차단): 제목 캡처를 `>([\s\S]*?)</a>` + `stripTags`로 바꿔 중첩태그 흡수, goView 인자 따옴표를 `['"]`로 완화. 또는 라이브 크롤에 "목록 파싱 0건 연속 시 warn 로그" 관측점 추가.

**M2. `seoulRecruitDates`가 텍스트의 앞 2개 날짜를 무조건 start/end로 채택 (쟁점 #3 관련).**
`adaptSeoulItem`은 `사업신청기간 → 신청기간 → 사업운영기간` 순서로 필드를 고르는데, 값에 **공고일·접수개시 등 선행 날짜가 섞이면 오추출**한다. 프로빙:
- `'공고 2026.5.1 신청 2026.5.27 ~ 2026.5.29'` → `{start:2026-05-01, end:2026-05-27}` (오류: 실 신청창은 5.27~5.29)

완화: `사업신청기간` 단일 필드는 실측상 깨끗(recon §2 예시)해서 실피해는 낮고, 역전 케이스(`start>end`)는 downstream `parseRecruit.reconcile`가 `end<start`를 잡아 `unknown`으로 강등하므로 **잘못된 dated로 새지는 않는다**(안전 계약 보존). 순수 오추출(선행 날짜) 케이스만 남는 위험.
제안(비차단): 텍스트에서 `~`/`부터/까지` 기준으로 구간을 먼저 분할한 뒤 각 구간에서 날짜 1개씩 추출하면 선행 공고일 오염을 배제할 수 있다.

**M3. `adaptSeoulItem` 연령 `split('(')[0]`이 괄호 선행 시 빈 문자열 산출.**
`'만19세~34세 (출생일…)'`는 정상(`만19세~34세`)이나, `'(만19~34세) 미취업자'`처럼 **값이 `(`로 시작하면 `''`** → ageText 소실 → `parseAgeRange`가 null/null(보수적). 안전 위반 아님(과대 매칭 아님), 정보 손실만.
제안(비차단): 첫 괄호가 선두면 마지막 `)` 뒤를 쓰거나, 괄호 블록 전체를 `.replace(/\([^)]*\)/g,'')`로 제거하는 편이 견고.

**M4. `parseSeoulDetail` dt/dd 인접성 가정 — 사이 주석·중첩 dl에 취약 (쟁점 #2 관련).**
프로빙 결과 대부분 견고(중첩 `<ul>` dd 정상 흡수, th/td 정상, 다중 dd는 첫 dd만 채택). 다만:
- `<dt>연령</dt><!-- 주석 --><dd>…</dd>` → dt/dd 사이 노드가 있으면 매칭 실패(`{}`).
- 중첩 `<dl>`은 lazy 매칭이 안쪽 `</dd>`를 먼저 잡아 바깥 dt에 안쪽 값이 섞임(경계 오염).
실사이트 dt/dd는 인접·비중첩(recon §2)이라 실피해 낮음. `!(norm in out)` 선착 우선과 `norm.length<40` 가드는 적절.

**M5. `SeoulClient.fetchAll(): Promise<unknown[]>` — `unknown[]`는 계약상 의도적이나 어댑터 산출 형태가 타입으로 문서화되지 않음.**
`adaptOntongItem`/`adaptSeoulItem` 모두 `Record<string, unknown>`을 반환하고 `normalizePolicy`가 방어적으로 좁힌다(계약 준수). 두 어댑터가 공유하는 raw 스키마를 명시 `interface RawPolicyInput`으로 뽑으면 온통·서울 어댑터가 같은 형태를 낸다는 계약이 컴파일러로 강제되어 드리프트를 막는다.
제안(비차단): 공용 `RawPolicyInput` 타입 도입해 두 어댑터 반환형을 통일. 현재도 동작·안전엔 문제 없음.

### Low (참고)

- **L1. 쟁점 #1(중복 렌더) — 현 설계 수용 가능(기술 관점).** `isSeoulNativeKey`가 V-접두만 통과시켜 온통 숫자-ID 유입을 원천 제외(중복 0), source+id 1차 dedup은 `seoul-youth`+V… vs `ontong`+20자리로 키 충돌 없음(설계대로). 잔여 중복은 "연도/편집 변형"(예 서울 청년수당 seoul판 vs ontong판)뿐인데, `collectManualCandidates`가 **교차소스 쌍도 비교**(id·source 동시 일치일 때만 skip)하므로 유사도≥0.85면 수동검증 후보로 **보고됨**. 자동병합 금지는 `similarity.ts` 주석대로 false-merge 방지의 의도적 결정. → 두 카드 동시 렌더 가능성은 남으나, (a) 순증 후보가 recon상 ~16건으로 소규모, (b) 자동병합의 오병합 리스크가 중복표시보다 사용자 피해가 큼을 고려하면 **현 "보고만" 설계가 방어적으로 타당**. 굳이 억제하려면 자동병합이 아니라 UI 렌더 단계에서 manualCandidate 쌍을 접어두는 편이 안전(도메인 결정이라 safety-auditor와 협의 권고).
- **L2. `mentalHealth.ts` 추출은 완전 무손실.** ontong 로컬 `MH_STRONG`/`MH_TERM` 제거분과 신규 SSOT 정규식이 바이트 동일, 호출부 `isMentalHealthTitle(title, mclsf)`가 기존 인라인식과 논리 동일. ontong 회귀 테스트(범용키워드 오분류 방지·중분류'건강'+용어)가 그대로 통과 → 리팩터 검증됨. SSOT화로 온통·서울 판정 드리프트 제거는 순수한 개선.
- **L3. `scripts/ingest.ts` 부분실패 격리 적절.** 합류 `client.fetchAll` 내부 try/catch가 seoul 실패를 흡수하고 `[...ontongItems, ...seoulItems]` 반환 → 온통 적재 보존. `SEOUL_INGEST=on` 옵트인 기본 off로 파이프라인 무영향. `console.warn`으로 실패 관측 가능. 단 ontong.fetchAll() 자체 throw는 미격리(기존 동작, 범위 밖).
- **L4. 결정성·순수성 양호.** seoulClient는 `fetchImpl`·`baseUrl`·`requestDelayMs`·`maxPages` 전부 주입 가능, 테스트는 delay 0. `mentalHealth.ts`는 순수(I/O·전역·Date.now 없음). `sleep(0)`는 `Promise.resolve()`로 setTimeout 회피(테스트 즉시성).
- **L5. `safeGet` 비200 미구분.** `res.text()`만 호출하고 `res.ok`/status를 안 봄 → 404/500 에러페이지 HTML이 파서로 흘러들 수 있으나, 파서가 goView/dt·dd 미발견 시 빈 결과라 실피해 없음(방어적). 관측용 status 로깅은 선택.

## 테스트 충실도 평가

- **강점:** 경계·실패경로 실검증(빈 입력→[], 개별 상세 throw→흡수·절단 없음, 숫자키 제외, UA 헤더 부착, normalizePolicy 통합 흐름). 스킵·`.only`·flaky 없음. fetch 주입으로 네트워크 결정성 확보. `requestDelayMs:0`로 실시간 지연 제거.
- **갭(비차단):** M1~M4의 취약 변형(중첩태그 목록/큰따옴표 goView/선행 공고일/주석삽입 dt·dd)에 대한 부정 테스트 부재 — 현재 테스트는 "행복경로(happy path)" HTML만 다룸. 실사이트 마크업 변경 시 침묵 회귀를 잡을 회귀 테스트가 없다. 라이브 스코프 확대 전 M1·M2 케이스만이라도 추가 권고.
- 테스트가 구현을 그대로 베낀 흔적은 없음(입력·기대값이 실사이트 형태 근거).

## 결론

**기술 품질 게이트 통과. blocker/High 없음 → tdd-implementer 수정 차단 없음.** Med 5건·Low 5건은 보고만(하네스 검수강도 정책). 쟁점 #1(중복 렌더)은 현 "보고만" 설계가 방어적으로 타당하다는 의견(단 UI 접기 방식 검토는 safety-auditor와 협의 권고). 쟁점 #2·#3(파서 견고성·엣지케이스)은 실사이트 확인·부분실패 격리로 현재 리스크 억제됨 — 서울 라이브 크롤 스코프 확대 시 M1·M2 재평가 및 부정 회귀 테스트 추가 권고.
