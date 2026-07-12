# 06 Code Review — 제출서류 원문 발췌(F-⑤) + 컴팩트 검색 바

대상: 워킹트리 변경분(직전 커밋 b1eebc6 이후 전부), 2건 묶음.
검수자: code-reviewer. 등급 정책: blocker/High만 수정 요구, 그 외 개선 제안.

## 게이트 재실행 결과 (모두 통과)
- `npx vitest run --exclude "**/.claude/**"` → **54 files / 891 tests passed**
- `npx tsc --noEmit` → **exit 0**
- `npx eslint src test scripts` → **exit 0**
- 병렬 편집 충돌 검사: `git grep '<<<<<<<|=======|>>>>>>>'` → **마커 없음**. FunnelContainer/DESIGN.md 통합 정합(아래 상세).

## 등급별 건수
- **blocker / High: 0**
- **should: 2**
- **nit: 3**

수정 요구 사항(blocker/High) **없음** — 병합·머지 진행 가능. should/nit은 개선 제안으로 남긴다.

---

## 병렬 편집 정합 확인 (요청 중점)
두 작업(①원문 발췌 / ②컴팩트 바)이 `FunnelContainer.tsx`·`DESIGN.md`를 함께 건드렸으나:
- **FunnelContainer**: 외곽 셸을 `max-w-[420px] lg:max-w-5xl` 고정, 시각 폭은 `innerWidth`(홈=`lg:max-w-[420px]`, 결과=전폭) 내부 래퍼로 분리. div 중첩 균형 정상(innerWidth div가 하단 블록까지 감싸도록 재배치, tsc/JSX 유효). `variant={showResultHeader ? 'compact' : 'hero'}` 분기 일관. **모순·중복 없음.**
- **DESIGN.md**: §3.1 외곽 셸 기준선 통일 + §4 표의 자유입력/펼침 행이 두 변경을 모두 반영. 이전 3단계·"오늘은 이것만"·"자주 쓰는 서류" 카피 행이 원문 발췌 카피로 **교체**(잔존 중복 없음). 코드와 문서 일치.

## 정확성 중점 확인 (요청 항목)
- **matchedDocuments 부분 문자열 오매칭**: `DOCUMENTS.filter(d => documentsText.includes(d.name))`. 사전 10개 서류명 중 서로가 서로의 부분 문자열인 쌍 **없음**. 요청 예시 "주민등록등본"↔"주민등록초본"은 `includes`가 정확 일치이므로 **교차 오매칭 안 됨**(초본 텍스트가 등본을 매칭하지 않음). 테스트 UI-F5에서 실증. → **문제 없음.**
- **cleanDocumentsText 가드(HTML 엔티티·화살표)**: seoul 경로는 `field()`→`stripTags()`가 상류에서 태그 제거+엔티티 복원(`&gt;`·`&nbsp;` 등)을 이미 수행하므로, 가드가 받는 값엔 엔티티가 없다. 가드는 한글 2자 미만이면 null(화살표·대시 전용 노이즈 차단). 테스트로 `"--> --> -"`·`"- - -"`·`"→ →"` null 확인. → **견고.**
- **variant 분기 일반성**: onCrisis/onSubmit/submit/handleKeyDown 로직을 두 variant가 **완전 공유**(분기는 렌더 트리에 한정). compact에서도 위기어 → onCrisis(true)·onSubmit 억제 회귀 테스트(UI-C2, funnel A4) 통과. **안전 라우팅 불변 유지.**
- **타입**: `Policy.documentsText: string | null` 신설, normalizePolicy/safeDefault/supabaseMapping toRow·fromRow·setup.sql 모두 반영. 왕복(round-trip) 및 컬럼 부재 시 null 폴백 테스트 존재.

---

## should (개선 제안, 차단 아님)

### S-1. ontong 경로는 노이즈 가드(cleanDocumentsText)를 통과하지 않음 — 소스 간 비대칭
`src/data/ontongClient.ts`의 `documentsText = str(o.sbmsnDcmntCn).trim() || undefined`는 **trim/빈값 처리만** 한다. seoul은 `cleanDocumentsText`(한글 2자 미만 → null)를 거치지만 ontong·normalizePolicy(`asNonEmptyString`)는 그 가드를 적용하지 않는다.
- 왜 문제인가: ontong `sbmsnDcmntCn`에 `"-"`·`"해당없음"` 같은 저정보 값이 오면 그대로 카드 펼침에 노출된다(원문 그대로 원칙상 완전한 오류는 아니나, "없는 게 낫다" 설계 의도와 어긋남). seoul에서 걸러낸 종류의 노이즈가 ontong에선 통과.
- 제안: `cleanDocumentsText`를 공용 유틸로 승격해 ontong 어댑터(또는 normalizePolicy)에도 적용, 소스 무관 동일 가드. (실 ontong 데이터에 arrow-junk가 확인되지 않았다면 우선순위 낮음 — 관찰 사항으로 기록.)

### S-2. matchedDocuments는 "제출 불요"로 언급된 서류도 발급처 안내로 surface 가능
발췌문이 `"재직증명서는 제출하지 않아도 됩니다"`처럼 **부정 문맥**으로 서류명을 담아도 `includes`는 매칭 → "발급처 안내"에 노출된다.
- 왜 문제인가: 사용자가 불필요 서류를 준비하도록 오도할 소지. 다만 라벨이 "필요 서류"가 아닌 "발급처 안내"이고 프레임이 "원문에서 확인"이라 위험은 완화됨.
- 도메인/안전 성격이 강하므로 **safety-domain-auditor 판단에 위임**(기술 관점에선 blocker 아님).

---

## nit
- **N-1** `FunnelContainer.tsx` 210행 `<div>`(className 없음)는 innerWidth 래퍼로 전체가 감싸진 뒤 남은 무의미 래퍼 — 제거해도 무방(레이아웃 영향 없음).
- **N-2** `PolicyResultCard`의 `(policy as Partial<CachedPolicy>).documentsText` 캐스트는 이제 `Policy`가 `documentsText`를 직접 보유하므로 불필요(직접 `policy.documentsText` 접근 가능). 방어적 `typeof === 'string'` 재검사도 normalizePolicy가 이미 string|null 보장 → 무해하나 중복.
- **N-3** seoul `stripTags`가 `\s+ → ' '`로 줄바꿈을 접어, seoul 발췌는 항상 한 줄이 된다. `whitespace-pre-wrap`의 줄바꿈 보존 이점은 ontong 원문에만 실효. (기능 손상 아님, 인지만.)

## 테스트 충실도
- 신규 테스트가 구현을 사후 추종한 흔적 낮음: 경계값(빈값/공백/비문자/null, 노이즈 3종, 부분매칭 배제, 발췌 없음시 doc-guide 미렌더, 위기 회귀 3종, 셸 폭 전환 무점프)을 실제로 검증. 스킵·flaky·`only` 없음.
- 유일한 준-토톨로지: "쓰레기값 → 정규화 단계 null → 토글 미렌더" 테스트는 카드에 이미 null을 주입해 검증(정크 처리 자체는 seoulClient 레벨에서 별도 검증되므로 계층 배치 적절).
