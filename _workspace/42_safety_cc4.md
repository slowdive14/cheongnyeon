# 42 — C-C4 공개 배포 전 안전 재감사 (커밋 45e801e)

**감사자:** safety-domain-auditor
**일자:** 2026-07-06
**범위:** C-C4 변경(useFunnel 엔트리 no-op·Edge Function CORS/레이트리밋/질의절단) + 누적 변경(서울 B·혜택 한 줄 D-②·프로필 영속 C-R2·내 신청함 F-④) 전영역 안전 불변식 재점검.
**판정 근거:** 실제 동작 경로 추적(위기 입력→출력, 원격 검색→degrade, 인제스트 그라운딩) + 코드·테스트 교차 확인. 210건 핵심 안전 테스트 로컬 실행 그린 확인.

---

## 게이트 판정: **코드/안전 관점 공개 승인 (PASS with follow-ups)**

C-C4 변경(a/b/c)과 누적 변경은 이 프로젝트의 안전 불변식을 훼손하지 않는다. **High 위반 없음.** 위기 라우팅 최우선·자격 보수·LLM 그라운딩·'추정' 고지·blocked 미노출·graceful degradation의 6개 바닥선이 모두 코드 경로로 유지된다. 아래 Med/Low는 **머지 차단이 아니며**, 배포 후 또는 후속 배치에서 보강할 테스트 공백·운영 확인 항목이다.

주의: Edge Function은 Deno(앱 tsc/vitest 제외)이며 **서버 배포·환경변수 설정은 운영자 책임**이다. 아래 Med-2는 그 배포 조건이 지켜져야만 효력이 있는 항목으로, 공개 전 운영자 체크리스트로 남긴다.

---

## 감사 포인트별 결과

### 1. 위기 라우팅 최우선 불변 — PASS
- **(a) 엔트리 빈 질의의 위기 무영향 확인.** `useFunnel.ts:88`에서 루트+질의없음 → `query=''`. traverse는 `detectCrisis('')`를 호출하고 `detectCrisisRegex`가 빈 문자열 → `safe()`(비위기) 반환(`crisisDetect.ts:61`). 위기 오검출·누락 없음. 엔트리에서 concept 폴백을 쓰지 않게 된 것이 위기 경로에 미치는 영향은 0 — 위기 감지는 애초에 노드 concept이 아니라 **사용자 입력 원문**에서 이뤄진다.
- **실시간 layer-1 경로 무영향.** `FreeTextInput.tsx:36`가 입력 change마다 `detectCrisisRegex`(동기·키·네트워크 무관)를 실행 → `onCrisis(true)`. 이 경로는 C-C4 변경과 무관하게 그대로다. traverse crisis 경로(`traverse.ts:194-204`)도 무변경.
- **위기 시 SafetyBanner 단독 불변.** `FunnelContainer.tsx:90-96` early-return이 `inCrisis`(traverse crisis OR freeCrisis)면 `<SafetyBanner/>`만 렌더. 입력·결과·프로필·예시·설정·동행·내 신청함 전부 미렌더. 회귀 테스트 `funnel.crisis.test.tsx` B2가 crisis=true에 result/alternatives/nextChoices를 모두 채운 적대적 주입에서도 `data-funnel-region` 목록이 정확히 `['safety']`뿐임을 검증(profile-input·youth-center·checklist·choice-chips 미렌더 명시). 실행 그린 확인.
- 안전자원 SSOT(자살예방 109·정신건강위기 1577-0199) `safetyResources.ts` 불변, SafetyBanner/CrisisFooter가 소비. LLM 치료 조언 텍스트 생성 경로 없음(위기 시 `suppressGeneration=true`로 explain 호출 0 — `explain.ts:211`).

### 2. 레이트리밋이 위기 흐름을 막지 않나 — PASS
- 위기 감지는 **클라이언트 layer-1 정규식 단독**(`crisisDetect.ts:16-19` 명문화, production에서 2층 앵커 미주입). 네트워크·서버 무관하게 항상 작동. Edge Function 레이트리밋(429)은 **검색만** 차단하며 위기 감지와 완전 독립. 429가 위기 사용자의 안전자원 접근을 부당 차단하는 경로는 존재하지 않는다.
- 429는 remoteSearch에서 non-ok → `{ hits: [], degraded: true }`로 흡수(`remoteSearch.ts:67`, 테스트 `remoteSearch.test.ts:76`). 검색 실패가 배너·자원 렌더를 막지 않음.

### 3. CORS 제한이 안전 기능을 깨지 않나 — PASS (운영 확인 Med-2 동반)
- 미설정 시 `allowOrigin`이 `'*'` 반환(`search/index.ts:25`) = 개발 기본. 운영 배포 시 `ALLOWED_ORIGINS` 필수임이 코드 주석(`index.ts:17-18`)과 PLAN(`PLAN_ops-and-seoul-expansion.md:84`)·커밋 메시지에 문서화됨.
- 잘못 설정(비허용 origin)이어도 대표 도메인 반환으로 브라우저 CORS 차단 → remoteSearch fetch 실패 → `degraded:true` → 클라 graceful degrade. OPTIONS·400·405·429·500 응답 모두 `corsHeaders(origin)` 부착(안전 헤더 누락 없음).

### 4. 누적 변경 재점검 — PASS
- **'추정' 고지·원문 링크(전 카드).** `PolicyResultCard.tsx:232-234`가 모든 카드에 `<DisclaimerNote/>`('추정'+원문 확인 권고) 무조건 렌더. `sourceUrl` 있을 때 원문 링크+브리지, `updatedAt` 있으면 최종 업데이트 표시. 서울 카드도 동일 컴포넌트 경유 → 고지·링크 유지.
- **서울 출처 표기(H-1) 정합.** `seoulClient.ts:256` `source:'seoul-youth'` → `PolicyResultCard.originLabel`/`SavedPolicies.originLabel`이 '청년몽땅'으로 표기. `unknown` 등은 괄호 생략(거짓 출처 미생성). `supabaseMapping.fromRow:65`가 원격 응답 source 보존.
- **혜택 한 줄(D-②) 자격 단정 없음.** `explain.ts`가 화이트리스트 필드만 프롬프트 주입, `ASSERTION_PATTERNS`로 합격·탈락 양방향 자격 단정 거부, 입력외 지역/URL/숫자 환각검증, 위기 시 호출 0, 실패 시 '추정' 톤 fallback. 인제스트에서 `scripts/ingest.ts:98-102`가 `explainMatch`(그라운딩 포함)로 precompute → grounded 통과분만 저장. 카드는 저장된 explanation 표시(런타임 LLM 호출 0). 자격 SSOT는 엔진, LLM이 뒤집지 못함.
- **내 신청함(F-④) 오도 없음.** `SavedPolicies.tsx:55` "지난번에 보던 정책이에요" — 관심 표시 문구, 자격/신청가능 단정어 없음. `savedPoliciesStore.ts`가 최소 메타만 저장, 로드 시 재검증. '추정' 성격은 원 카드가 담당.
- **blocked 카드 미노출 불변.** `traverse.ts:274-283` blocked만/후보0이면 result에서 blocked 비우고 alternatives로 유도. `ResultList.tsx`는 now/soon/review만 카드화. `app.profile.test.tsx:143` 회귀(blocked→카드0+대안칩, "막힘/부적격/탈락" 문구 0) 유지.

### 5. 내 신청함 위기 격리 — PASS (구조), 검증 공백은 Med-1
- `SavedPolicies`는 `FunnelContainer.tsx:172`의 비위기 JSX에만 존재하고 early-return(`:90-96`)보다 뒤. 위기 시 미렌더 구조적으로 보장. B2 회귀가 region 목록을 `['safety']`로 고정하므로 saved region도 배제.

---

## 위험도별 항목

### High — 없음
공개 배포를 막는 안전 위반 없음.

### Med
- **Med-1 (테스트 공백): "저장 항목 존재 + 위기" 조합 미검증.** `funnel.crisis` B2 회귀는 저장함이 **비어 있는**(items=[], SavedPolicies가 null 반환) 상태라 saved region이 애초에 렌더 대상이 아니었다. localStorage에 저장 항목이 있는 상태에서 위기 입력 시 SavedPolicies가 미렌더되는지 명시 검증하는 통합 테스트가 없다. 코드 구조상 안전(early-return 우선)이나, 회귀 방지선이 비어 있다.
  - 필요 테스트: `useSavedPolicies`가 항목을 반환하도록 localStorage seed → 자유입력에 위기어 입력 → `screen.queryByTestId('saved-policies')` null 단언(+ region 목록 `['safety']` 재확인).
- **Med-2 (운영 확인, 코드 아님): 공개 전 운영자 체크.** Edge Function은 이 커밋으로 재배포되어야 CORS/레이트리밋이 효력을 갖는다. 공개 직전 운영자가 (1) `search` 함수 재배포, (2) `ALLOWED_ORIGINS=https://<vercel도메인>` 설정, (3) 429 응답에 대한 클라 degrade 육안 확인을 완료해야 한다. 코드·문서는 이를 명시하나 실제 서버 상태는 이 감사 범위 밖(검증 불가 — 배포 후 확인 요망).

### Low
- **Low-1 (테스트 공백): C-C4(a) 엔트리 no-op 계약 미검증.** "루트+질의없음 → traverse가 빈 질의(`query===''`)로 호출되고 노드 concept으로 원격 검색이 발생하지 않음"을 명시 단언하는 테스트가 없다(`useFunnel.test.tsx`·`app.profile.test.tsx` 모두 노드 진행 이후를 다룸). 안전 불변식과 직결되진 않으나(위기·자격 무영향 확인됨) 비용 회귀(마운트 원격 검색 부활) 방지선이 없다.
  - 필요 테스트: 마운트 직후 traverse spy의 첫 호출 `state.query`가 `''`인지, 원격 search spy 호출 0인지 단언.
- **Low-2 (설계상 알려진 리스크, 신규 아님): degraded→키워드 폴백 부재.** `App.tsx:114` `remote.search(...).then((r) => r.hits)`가 degraded 신호를 버리고 hits만 전달한다. traverse는 `deps.search`가 있으면 인메모리 hybridSearch로 폴백하지 않으므로(`traverse.ts:217-227`), 429/서버 임베딩 실패 시 빈 후보 → 대안 갈래로 유도된다(빨강 미노출 = 안전). 다만 "검색 degraded 시 클라 키워드 폴백"이라는 감사 포인트 3의 이상 동작은 **현 배선에서 일어나지 않는다**(대안 유도로 degrade). 안전상 해롭지 않으나(헛희망·오류 노출 0), 사용자 경험상 결과 공백이 될 수 있다. 신규 회귀 아님(C-C4 이전 동일) — 배포 차단 사유 아님. 통합 테스트도 이 경로는 미커버.

---

## integration-qa 공유: 안전 게이트 = PASS
- 위기·자격·그라운딩·고지·막힘·degradation 6개 바닥선 코드 경로 유지 확인. High 0.
- QA 권고 추가 테스트: Med-1(저장항목+위기 격리), Low-1(엔트리 no-op 계약). 둘 다 회귀 방지선 보강용이며 배포 차단은 아님.
- 운영자 배포 체크리스트(Med-2)는 공개 직전 필수 확인 항목.
