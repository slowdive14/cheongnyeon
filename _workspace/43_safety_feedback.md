# Safety·Trust Audit — 사용자 피드백 배치 (커밋 cf2c2e1)

감사자: safety-domain-auditor · 날짜: 2026-07-07 · 대상: cf2c2e1 (사용자 피드백 7건)

## 판정 요약

**게이트: 통과 (안전 High 위반 0). 머지 차단 사유 없음.**

- 위기 라우팅 최우선 불변식: 유지 (코드+테스트 교차확인)
- '추정' 고지·원문 링크·최종 업데이트: 전 카드 유지 (무조건 렌더)
- 자격 단정 0 / blocked 미노출: 유지
- graceful degradation(키 없음): 완전 동작 (817 tests·본인 재실행 그린)
- **layer-2 상실 판정: Low** (사유는 아래 상세)

---

## 변경별 상세 판정

### 1. 체크리스트 항목별 "(추정)" 제거 — [무위반 / 안전 유지]

실동작 경로 추적 결과 보수성 유지 확인:

- `policyChecklist.ts`의 pass 문구는 "충족 / 제한 없음"의 **사실 서술**이며 "자격이 됩니다" 류 단정이 없다. 테스트 `policyChecklist.test.ts`가 자격 단정 부재를 명시 검증(`not.toMatch(/자격이 (됩|안 됩)/)`).
- '추정' 고지는 `PolicyResultCard.tsx:232-234`에서 `<DisclaimerNote/>`를 **무조건**(분기 없이) 카드 하단에 렌더 → 단일 출처 1회 표기가 전 카드에 보장. DisclaimerNote 문구에 "추정"·"원문에서 최신 조건 확인" 명시.
- "충족/제한 없음"(항목) + 카드 하단 "추정한 결과·원문 확인"(DisclaimerNote) 조합은 보수성을 유지한다. 항목 문구가 단정으로 읽히지 않음.

**소득 pass = "소득 제한 없음" 정확성 — 검증 통과:**
- `eligibility.ts:108-138` incomeAxis: `pass`는 **오직 `inc.kind === 'none'`**(소득 무관 정책)일 때만 반환. `medianRatio`/`amountMax` 정책 + 기본 `income:{}`(빈 소득)은 `review('INCOME_PROFILE_MISSING')`로 떨어진다(보수).
- 테스트 교차확인: `eligibility.axes.test.ts:161-167`(미입력→review INCOME_PROFILE_MISSING), `eligibility.test.ts:136`(kind none→pass). → 상한 정책이 "소득 제한 없음"으로 잘못 표기될 경로 없음. 문구 정확·안전.

### 2. Gemini 키 설정 UI(버튼·모달) 제거 — [무위반 / layer-2 상실은 Low]

**App 배선 무결성 — 검증 통과:**
- `App.tsx`에서 `keyEpoch`·`onApiKeyChange`·`SettingsModal` 제거됐으나 `crisisDeps` 배선은 그대로 유지: `crisisDeps: { embed: env.embedProvider, crisisAnchors: env.crisisAnchors }` (App.tsx:126). 키 없으면 `env=EMPTY_ENV` → `embedProvider=undefined`·`crisisAnchors=[]` → `detectSemantic`가 즉시 `safe()`(crisisDetect.ts:104). layer-2 자동 잠금, throw 없음.
- 전역 grep: `SettingsModal`/`onApiKeyChange`/`keyEpoch`/`settingsOpen` 잔존 참조 0. `useEffect` deps `[keyEpoch]`→`[]`(마운트 1회 빌드)로 정합.
- `loadApiKey`는 하위호환으로 유지(기존 저장 키 있으면 layer-2 계속). `saveApiKey`/`clearApiKey`는 **호출자 0**(dead export) — 무해하나 정리 권고(Low).

**layer-1 안전 바닥선 무결성 — 검증 통과:**
- `FreeTextInput.tsx`: change마다 + submit 직전 `detectCrisisRegex`(동기·키 무관) 실행 → 위기면 배너 우선·onSubmit 억제. 키 제거와 완전 무관.
- `traverse.ts:197`: `detectCrisis(query, deps?.crisisDeps)` → 1층 우선(hit이면 2층 미호출). deps 없어도 1층 작동.
- `FunnelContainer.tsx:84-90`: `inCrisis`(traverse OR freeCrisis) 시 `<SafetyBanner/>` 단독 early-return. 입력·결과·프로필·내 신청함·동행 전부 미렌더.

**위기 불변식 테스트 교차확인(전량 그린):**
- `funnel.crisis.test.tsx` B/B2: 배너 DOM 최상단(compareDocumentPosition) + crisis=true가 result/alternatives와 공존해도 렌더 region이 정확히 `['safety']` 하나. 카드·칩·헤더·프로필알약·체크리스트·동행·내신청함 전부 미렌더 단언.
- `freeInput.ui.test.tsx` UI-10: 자유입력 위기어→배너 단독, 전체 textbox 0(입력 미노출). UI-2b: 완곡 위기 "버틸 힘이 없어" layer-1 흡수. UI-9: 설정 버튼·모달 부재.

### 3. 그 외 (청년센터·칩 라벨·다시찾기 제거·헤더) — [무위반]
- YouthCenterLink: 검증 연락처 있을 때만 렌더(v1 전량 null→미렌더). CrisisFooter·위기 배너와 무관, DESIGN.md 정합 갱신.
- CrisisFooter는 결과 섹션 하단(FunnelContainer:131)에 상시 유지 — "다시 찾기" 제거·헤더 카피·칩 라벨 변경은 안전 표면 미접촉.

---

## 위험도별 항목

### High — 없음.

### Med — 없음.

### Low
- **L-1 (layer-2 상실 = Low):** 신규 사용자는 이제 Gemini 키를 설정할 UI 경로가 전무(`saveApiKey` 호출자 0). 따라서 신규 사용자에게 layer-2(의미 임베딩 위기 감지)는 **영구 비활성**. **그러나 실질 위기 감지 회귀 아님:**
  - 근거①: layer-2는 **원래도** 키를 직접 입력한 극소수 사용자에게만 켜지던 보조층이었다. SettingsModal이 유일한 키 설정 경로였고(전역 grep 확인), 모달 카피조차 키 용도를 "자유입력 해석·설명"으로만 안내(위기 감지 언급 없음).
  - 근거②: 코드/테스트가 이 상태를 **이미 의도된 degrade로 명문화**하고 있다 — `crisis/config.ts:16-18`("crisisAnchors production 미주입 → 1층 단독"), `crisisDetect.test.ts` CR-20("embed=undefined(키없음)→비위기 none, 의도된 degrade").
  - 근거③: 그 공백을 메우려 고빈도 완곡·맥락 위기 표현을 **layer-1 정규식으로 선제 흡수**(H-A/H-B 클래스 F/I: "버틸 힘이 없어","다 포기하고 싶","깨어나고 싶지 않" 등). 즉 안전 바닥선은 애초에 layer-1이 지도록 설계됨.
  - 결론: 이번 커밋은 "이미 사실상 잠들어 있던 보조층의 활성 스위치를 UI에서 제거"한 것. 위기 감지 능력의 실제 하락분은 "키를 손수 넣던 사용자에게만 켜지던 완곡어 의미감지"로 한정 → **Low**.

- **L-2 (문서 정합 nit):** `App.tsx:69`는 "기존 저장 키 있으면 하위호환 layer-2"라고 하나, `crisis/config.ts:16-18`·`crisisDetect.ts:16-18` 주석은 여전히 "crisisAnchors production 미주입(테스트 fixture 전용)"이라 기술 → 상충. 실제로는 App이 키 있을 때 앵커를 주입하므로 주석이 낡음. 안전 동작엔 무영향.

- **L-3 (dead export):** `apiKeyStore.saveApiKey`/`clearApiKey` 호출자 0. 제거 또는 "하위호환 로드 전용" 주석 권고.

---

## 미검증/누락 안전 테스트 지목

실행 테스트로 확인 불가한 항목은 없음(817 그린 본인 재실행 확인). 다만 **추가 회귀 테스트 권고**:

- **T-권고1 (Med 예방):** App 레벨 통합 테스트에서 "localStorage 키 없음 → layer-1 위기어 입력 시 SafetyBanner 단독" 경로가 명시 커버되지 않음. 현재는 FunnelContainer 단위(traverse 모킹)로만 검증. 키 UI가 사라진 지금, **App 실배선(crisisDeps=[]) + 위기어 → 배너** end-to-end 테스트 1건 추가를 권고(회귀 앵커).
- **T-권고2 (Low):** L-2 주석 상충 해소 시, "키 저장 상태 + layer-2 활성" 하위호환 경로가 코드에 남아있으면 그 경로의 테스트(현재 crisisDetect 단위엔 있음, App 배선엔 없음)를 남길지/제거할지 결정 필요.

---

## 대안 권고 (layer-2 상실 대응 — 선택)

layer-2를 실질 안전망으로 되살릴 계획이 있다면(현재는 보조층이므로 필수 아님):
- **서버측 layer-2 이전 권고:** 검색이 이미 Edge Function(서버)이므로, 완곡·의미 위기 감지도 **서버 임베딩으로 이전**하면 클라이언트 키 없이 모든 사용자에게 layer-2 복원 가능. 단 이때도 layer-1 우선·거짓양성 허용·throw-free degrade 불변식을 서버 경계에서 동일하게 지켜야 함(위기 시 검색 결과 대신 안전자원 라우팅). 이는 신규 Phase 범위 — 이번 배치의 머지 조건 아님.

## 다운스트림 통신
- `tdd-implementer`: High 위반 없음 → 머지 차단 없음. Low 3건(주석 정합·dead export·App 회귀 테스트)은 후속 정리 권고, blocker 아님.
- `integration-qa`: 안전 게이트 **통과**. layer-1 위기 바닥선·'추정' 단일고지·소득 pass 정확성 확인. T-권고1(App 키없음 위기 end-to-end) QA 시나리오 추가 검토 요청.
