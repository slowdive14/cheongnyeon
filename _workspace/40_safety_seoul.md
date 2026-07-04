# 안전·신뢰 감사 — Phase B(서울 청년몽땅정보통 수집기)

- 날짜: 2026-07-04
- 감사자: safety-domain-auditor (최후 방어선)
- 대상: 신규 `src/data/seoulClient.ts`, `src/domain/parse/mentalHealth.ts` / 수정 `src/data/ontongClient.ts`, `scripts/ingest.ts`
- 게이트 실측: **771 tests 통과 · tsc clean · eslint clean · vite build 성공**(직접 재현 확인).

## 총평 — 안전 게이트: 조건부 통과 (High 1건 차단 필요)

기존 안전 불변식(위기 라우팅·자격 보수 판정·LLM 그라운딩·blocked 미노출·'추정' 고지·원문 링크)은 **대부분 회귀 없이 보존**된다. 위기 라우팅·마음건강 하드필터 식별에 회귀 없음을 코드·테스트로 교차 확인했다. 다만 **출처 표기 정확성(감사 포인트 3)에서 High 1건**을 발견했다 — 결과 카드가 모든 정책의 원문 링크 라벨을 "(온통청년)"으로 하드코딩하므로, 서울 정책 카드가 실제로 노출되면 **틀린 출처를 사용자에게 표기**한다. 안전 High는 defer 금지이므로 SEOUL_INGEST=on 배포 전 수정 대상이다.

`SEOUL_INGEST`는 기본 off이고 서울 클라이언트는 opt-in이므로, **현 기본 상태(off)에서는 청년 화면에 서울 카드가 뜨지 않아** High가 실사용자에게 노출되지 않는다. 그래서 "즉시 프로덕션 장애"는 아니나, 이 Phase의 목적(SEOUL_INGEST=on 실운영)을 켜는 순간 노출되므로 **on 전제의 게이트로는 차단**한다.

---

## High (즉시 차단·수정 — defer 금지)

### H-1. 결과 카드 원문 링크 라벨이 출처와 무관하게 "(온통청년)" 하드코딩 → 서울 정책에 틀린 출처 표기
- 위치: `src/ui/funnel/PolicyResultCard.tsx:177`
- 현상: 링크 텍스트가 `신청 페이지 열기 (온통청년)`로 고정. `policy.source`(`seoul-youth`)를 참조하지 않는다. SEOUL_INGEST=on으로 서울 정책이 결과에 렌더되면, URL은 올바르게 `youth.seoul.go.kr/...view.do`(H 없음)를 가리키지만 **버튼 라벨은 "온통청년"이라고 거짓 표기**한다.
- 왜 High(안전·신뢰): 이 프로젝트는 취약 청년의 신뢰가 핵심 자산이고, 출처 정확성은 감사 포인트 3의 명시 불변식이다. "온통청년"이라 적힌 버튼이 서울시 사이트로 이동하면 사용자는 링크가 잘못됐다고 오인하거나(→클릭 회피), 출처를 혼동한다. adaptSeoulItem이 `source='seoul-youth'`로 정확히 구분해 둔 성과가 **UI 최종단에서 무효화**된다.
- 근거: `adaptSeoulItem`은 `source:'seoul-youth'`, `sourceUrl: view.do?plcyBizId=key`를 정확히 세팅(seoulClient.ts:248,250). 그러나 카드는 source 분기 없음(`Grep source ⇒ PolicyResultCard.tsx는 sourceUrl만 사용, 온통청년 문자열 하드코딩`).
- 조치: 카드 링크 라벨을 `policy.source`로 분기하라. 예: `seoul-youth → "(서울 청년몽땅)"`, `ontong → "(온통청년)"`, 그 외/불명 → 출처 라벨 생략("신청 페이지 열기"). 매핑은 SSOT 유틸(예: `sourceLabel(source)`)로 두고 카드·향후 표기에서 재사용. **회귀 테스트 추가 필수**: source별 라벨 렌더 검증(아래 T-1).
- 담당: tdd-implementer에 즉시 SendMessage(머지 차단).

---

## Med (SEOUL_INGEST=on 배포 전 처리 권장 — 신뢰 저하)

### M-1. 동일 실세계 정책의 이중 카드(온통 + 서울) — 2차 dedup이 수동후보만 수집, 자동병합 없음
- 위치: `src/data/ingest.ts:131,153`(1차 키 `source+id`, 2차 `collectManualCandidates`), `scripts/ingest.ts:77-91`.
- 현상: 서울 청년수당은 서울 키 `V202600005`, 온통 키 20자리 숫자로 **source·id가 모두 달라 1차 dedup에서 절대 병합되지 않는다.** 2차(제목+기관 유사도≥0.85)는 `dedupeManualCandidates`로 **로그만 남기고 자동병합하지 않음**(설계상 의도: 오병합 방지). 결과적으로 SEOUL_INGEST=on이면 **같은 정책이 두 카드로 렌더**될 수 있다.
- 신뢰 영향 평가(요청 사항): 중간. 청년이 동일 정책을 두 번 인지하면 (a) 결과 신뢰도 하락("이 앱 정리가 안 됐네"), (b) 두 카드의 자격 판정이 엇갈릴 위험이 더 큰 문제다 — 서울 상세의 `소득 => 중위소득 150% 이하`는 `medianRatio(150)`로 파싱되지만, 온통 API 동일 정책은 `earnEtcCn`/`earnCndSeCd` 경로로 **다르게 파싱**되어(같은 정책인데 한 카드는 blocked, 한 카드는 review로) **상충하는 자격 신호**를 줄 수 있다. 이는 단순 중복보다 신뢰에 더 해롭다.
- 완화 요소: B0 정찰(_recon §3)상 V-접두 순증은 ~16건, 그중 온통과 겹치는 편집변형이 절반. 서울 필터(regionCodes '11')와 마음건강 하드필터를 통과해 동시 노출될 실제 쌍은 소수. 그래도 청년수당·마음건강 지원처럼 **고가치·고노출 정책일수록 겹칠 확률**이 높다(하필 사용자가 가장 볼 정책).
- 조치(택1, on 전):
  1. (권장) `dedupeManualCandidates` 쌍을 **표시 단계에서 억제** — 같은 후보쌍이면 온통(정본 API·lastModified 보유) 카드를 우선하고 서울 카드를 숨기는 결정형 규칙. 자동 데이터 병합이 아니라 렌더 억제라 오병합 리스크 없음.
  2. B0 리더 권고(안 B, 경량 시드)대로 **마음건강·고립은둔 순증 정책만** 선별 편입하면 겹침 자체가 최소화됨(아래 관찰 O-1 참조).
- 검증 요청: SEOUL_INGEST=on 실크롤 후 `coverage-report.json`의 `dedupeManualCandidates` 실제 쌍 수·제목을 확인해 동시노출 규모를 계량하라(현재는 코드상 가능성만 확인, 실규모 미검증).

### M-2. 서울 정책은 `lastModified` 미설정 → 결과 카드에 '최종 업데이트' 표기 누락
- 위치: `adaptSeoulItem`(seoulClient.ts:238-251)은 `lastModified`를 세팅하지 않음. cf. `adaptOntongItem`은 `lastMdfcnDt`→`lastModified` 세팅(ontongClient.ts:206).
- 현상: 카드의 '최종 업데이트 {날짜}'(PolicyResultCard.tsx:163)는 `CachedPolicy.updatedAt`(=인제스트 시각)에서 오므로 표기 자체는 뜬다. 다만 이는 "우리가 적재한 시각"이지 "정책이 갱신된 시각"이 아니다. 온통은 원천 갱신일을, 서울은 스크랩 시각을 보여 **같은 화면에서 신선도 의미가 불일치**한다.
- 왜 Med(고지·투명성): 감사 포인트 4의 '데이터 최종 업데이트 시각'은 표기는 되므로 High 아님. 그러나 상세 dt/dd에 `등록일`/`수정일`류가 있으면 파싱해 채우는 편이 정직하다. 청년몽땅 상세에 해당 필드가 없으면 현행(적재시각)이 최선의 보수 처리 — 그 경우 **정상**으로 승인.
- 조치: 상세 파싱 시 `수정일`/`등록일` 라벨 후보를 `field()`로 시도해 있으면 `lastModified`에 매핑. 없으면 현행 유지(적재시각). 낮은 우선순위.

---

## Low (개선 권고 — 안전엔 영향 미미)

### L-1. `seoulRecruitDates` — 신청기간에 날짜가 1개만 있으면 start만 세팅, end=undefined
- 위치: seoulClient.ts:187-199. `adaptSeoulItem`이 start만 넘기면 `parseRecruit`가 `reconcile(part(start), part(null))` → **`kind:'dated', end:null`**로 확정. 마감일 없는 상시성 모집이 "시작만 있는 dated"로 처리될 수 있다.
- 안전성: recruit 상태 분류가 dated·end=null을 어떻게 다루는지는 Phase 3 위임이며, 자격을 blocked로 단정하지 않으므로(파싱 실패→unknown→review 원칙) 헛절망 리스크는 낮다. 보수 방향으로 안전.
- 조치: 상시/연중 문구가 섞인 경우 온통처럼 `recruitText='상시'` 폴백을 seoul에도 두면 더 정확. 낮은 우선순위.

### L-2. 라이선스(공공누리) 미확인 리스크 고지 — 코드 주석엔 있으나 사용자/운영 문서 반영 미흡
- 위치: seoulClient.ts:19 주석("⚠️ 라이선스: 공공누리 표기 미확인 … 공개 배포 전 이용약관 확인은 운영자 책임"), _recon §4.
- 평가: **코드·정찰 문서에는 적절히 고지됨**(감사 포인트 7 충족). 다만 이는 개발자만 보는 위치다. SEOUL_INGEST=on 실운영·공개 배포 시 운영자가 놓치지 않도록 **배포 체크리스트/README/env 설명**에 "SEOUL_INGEST=on은 이용약관·저작권 정책 확인 후"를 명시 권고. 코드 안전 이슈 아님(운영 절차).
- 조치: `scripts/ingest.ts`의 SEOUL_INGEST 판정부(라인 77)에 on일 때 콘솔 경고 1줄("[seoul] 라이선스(공공누리) 미확인 — 공개 배포 전 이용약관 확인 필요") 추가 권고.

---

## 회귀 없음 확인 (기존 안전 불변식 — 통과)

- **위기 라우팅 불변(감사 포인트 6·체크리스트 1):** 회귀 없음. 위기 감지(`crisisDetect.ts`, `crisis/config.ts`)는 사용자 free-text 입력 대상 1층 정규식으로 동작하며 **정책 category·source와 무관**. Phase B는 이 경로를 건드리지 않는다. `crisisDetect.test.ts` 통과 확인.
- **마음건강 하드필터 식별 동일성(감사 포인트 6):** `mentalHealth.ts`의 `MH_STRONG`/`MH_TERM` 정규식이 이관 전 ontongClient(HEAD 커밋)의 인라인 정규식과 **바이트 동일**(git show 대조 확인). `isMentalHealthTitle`의 결합식 `MH_STRONG.test(t) || (m.includes('건강') && MH_TERM.test(t))`도 구 로직과 동일. 하드필터 카테고리(`mentalHealthGraph.allowedCategories=['마음건강']`)로 이어지는 의미 변화 없음. `grounding.regression.test.ts` 포함 175 tests 통과.
- **자격 보수 판정(감사 포인트 1·체크리스트 2):** 통과.
  - 소득: 서울 상세에 소득 dt 부재 시 `incomeText=undefined`→`parseIncome`이 `kind:'unknown'`→eligibility `review('INCOME_UNKNOWN')`(eligibility.ts:112). **unknown≠none 원칙 준수**(none만 PASS, unknown은 review). 확인.
  - 연령: `field(fields,'연령')?.split('(')[0]` — "만19세~34세 (출생일…)"에서 괄호 앞만 사용해 출생일이 range 정규식을 오염시키지 않음(seoulClient.ts:225, test 라인 101 검증). 파싱 실패는 null(보수).
  - 모집: `parseRecruit`가 파싱 실패/역전을 dated로 가리지 않고 unknown 처리(recruit.ts reconcile). 헛절망 방지.
- **그라운딩/날조 금지(감사 포인트 4·체크리스트 3):** 통과. 파싱 실패 시 값을 지어내지 않고 `undefined`→normalize에서 unknown/null로 떨어진다(seoulClient의 `field()`는 빈 값이면 undefined 반환). 인제스트 explain은 화이트리스트 필드만 주입 + 후처리 환각검증(explain.ts)으로 source 무관 동일 방어. 서울 미보유 필드(lastModified 등)는 whitelist에 없어 프롬프트 유입·날조 경로 없음.
- **원문 링크 정확성(감사 포인트 2):** URL 자체는 정확. `seoulDetailUrl`이 항상 `view.do?plcyBizId={encodeURIComponent(key)}` 생성(seoulClient.ts:202-205, test 라인 88·107 검증). 홈/잘못된 URL로 새지 않음. (단 라벨 표기는 H-1 참조.)
- **부분 실패 격리(감사 포인트 5):** 통과. `scripts/ingest.ts:83-88` try/catch로 서울 fetch 실패를 흡수하고 온통 항목 배열은 그대로 반환(`[...ontongItems, ...seoulItems]`, seoulItems=[]). 서울 실패가 온통 적재를 절단·삭제하지 않음. 클라이언트 내부도 개별 상세 실패를 `safeGet`이 빈 문자열로 흡수(seoulClient.ts:108-115), test '개별 상세 실패는 흡수'로 검증.
- **blocked 카드 미노출:** 통과. `ResultList.tsx`는 now/soon/review만 렌더, blocked는 화면 누수 금지 + 노출 0이면 대안 갈래 유도(ResultList.tsx:37-60). Phase B가 이 경로를 바꾸지 않음.
- **'추정' 고지:** 통과. `DisclaimerNote`가 모든 카드에 무조건 렌더(PolicyResultCard.tsx:187-189) — source 무관.
- **graceful degradation(체크리스트 6):** 통과. SEOUL_INGEST 미설정→서울 빈 배열(무영향), GEMINI 키 없음→explain/embed off, ONTONG 키 없음→fixture. `createSeoulClient()` no-opts→`[]` 확인(test 라인 135).

---

## 관찰(비차단) — 리더 결정 상기

### O-1. 구현 범위가 B0 정찰의 리더 권고(안 B, 경량 시드)와 다르다
- `_workspace/40_B0_recon.md` §6 리더 의견은 **안 B(경량 시드 큐레이션)** — 순증 ~16건만 정적 시드로 편입, "스크래퍼 상시화 없음 → 라이선스 리스크 최소". 그러나 이번 Phase B는 **안 A(전면 크롤러)** `createSeoulClient({live})`를 구현했다(SEOUL_INGEST=on gating으로 완화).
- 안전 관점 함의: 전면 크롤 상시화는 (a) 라이선스 리스크(L-2)와 (b) 이중 카드(M-1) 노출면을 안 B보다 키운다. **opt-in 기본 off**로 리스크를 봉인해 둔 것은 방어적이나, on 전제로 켜기 전에 **리더가 안 A vs B를 재확인**하는 것이 정찰 결론과의 정합성상 바람직하다. 이는 감사자 판정 밖(제품 결정)이므로 차단 사유로 올리지 않는다 — 리더에게 상기만.

---

## 필요한 추가 테스트(누락 시나리오 지목)

- **T-1 (H-1 회귀, 필수):** `PolicyResultCard` — `policy.source='seoul-youth'`인 정책 렌더 시 링크 라벨이 "온통청년"이 **아님**을 검증(서울 라벨 또는 라벨 생략). 현재 카드 테스트에 source별 라벨 케이스가 **비어 있음**.
- **T-2 (M-1 검증):** 인제스트/표시 단에 온통·서울 동일정책 쌍 fixture를 넣고, (억제 규칙 도입 후) **한 쪽만 렌더**되는지 검증. 현재 dedup 테스트는 same-source id 병합만 다루고 **cross-source 동일정책 동시노출 억제 시나리오가 비어 있음**.
- **T-3 (소득 unknown 보수, 권장):** 소득 dt가 없는 서울 상세(fields에 소득 키 부재) → `adaptSeoulItem` → `normalizePolicy` → income `kind:'unknown'` → eligibility `review`(blocked 아님) end-to-end 1케이스. 현재 seoulClient 테스트는 소득 있는 케이스만 검증.

---

## 발신
- **tdd-implementer:** H-1 즉시 수정 요청(머지 차단). T-1 회귀 테스트 동반.
- **integration-qa:** 안전 게이트 = **조건부 통과**. H-1 미수정 시 SEOUL_INGEST=on 배포 차단. off 기본값 유지 시 현 프로덕션 무영향. M-1(이중 카드 자격 상충)은 on 전 처리 권장 — 실크롤 후 dedupeManualCandidates 실규모 계량 요청.
