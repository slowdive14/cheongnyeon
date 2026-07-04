# Code Review — D-② 혜택 한 줄 재생성 + 카드 표시 (커밋 047e634)

검수 범위: 기술 품질·타입 안전·React/TS 관용성·테스트 충실도. 안전·도메인 규칙은 safety-domain-auditor 담당(중복 제외).

## 종합 판정: PASS (blocker/High 0)

게이트 재실행 결과(로컬 재현):
- `npx tsc --noEmit` → exit 0
- `npx eslint` (변경 5파일) → exit 0
- 관련 테스트 `explain.test.ts` + `PolicyResultCard.test.tsx` + `pipeline.test.ts` → 95/95 pass
- 회귀 `grounding.regression.test.ts` → 15/15 pass

blocker/High 발견 없음. Med 1건, Low 2건, nit 1건은 보고만(하네스 검수 강도 정책상 defer).

---

## 검토 포인트별 결과

### 1. forceExplain 분기 정확성 + non-null 단언 — PASS

`src/data/ingest.ts:191-202`

- **재파싱(reparse) 경로**(191-194)는 `deps.forceExplain`을 참조하지 않는다. `deps.explainer ? safeExplain(...) : null`로 원래대로 항상 재생성 → 계약 부합.
- **else 경로**(195-202)에서만 forceExplain을 반영:
  `regenExplain = deps.explainer != null && (prevExpl === null || deps.forceExplain === true)`.
  결손 보강(prevExpl===null)과 목적변경 재생성(forceExplain)을 OR로 통합 — 정확.
- **non-null 단언 `deps.explainer!`(200)는 안전.** `regenExplain`이 truthy이려면 좌항 `deps.explainer != null`이 참이어야 하므로, 삼항 truthy 가지에서 explainer는 반드시 non-null이다. TS가 지역변수(regenExplain)를 통한 좁히기를 못 해 `!`가 필요한 것이며 런타임 위험 0.

### 2. 카드 benefit/summary 폴백 타입·null 안전성 — PASS

`src/ui/funnel/PolicyResultCard.tsx:121-122, 164-170`

- `EvaluatedPolicy.policy` 타입은 `Policy`(explanation 필드 없음)인데 `(policy as Partial<CachedPolicy>).explanation`으로 접근 — **기존 `formatUpdatedAt`의 `(policy as Partial<CachedPolicy>).updatedAt`(105-106) 패턴과 정확히 일관.** 관용적이고, 구 데이터(explanation 미보유)에서 undefined graceful 처리.
- `benefit` 계산은 `typeof === 'string' && trim().length > 0` 가드로 null/빈문자/공백 전부 방어 → null-safe.
- JSX 폴백 순서(`benefit ? … : summary ? … : null`)는 삼중 분기가 명확하고 null 종단 처리 정확. `data-testid="policy-benefit"`는 benefit 분기에만 부여 → 테스트가 폴백/표시를 구분 검증 가능.

### 3. forceExplain 시 parsed/vector/updatedAt 불변(비용 최소 계약) — PASS

- `it.parsed = it.cached?.parsed ?? null`(197) — 이전 파싱 보존, forceExplain 무관.
- `it.updatedAt = it.cached?.updatedAt ?? now`(201) — 이전 시각 보존, forceExplain 무관.
- vector: 6b 블록(213-216)의 `needEmbed` 조건은 `it.reparse || prevVec === null`뿐 — forceExplain은 임베딩 재계산 트리거에 전혀 개입하지 않음.
- 결론: **forceExplain은 오직 `it.explanation` 한 필드만 재생성.** parseChunk·임베딩 재실행 0, updatedAt 불변 → "설명만 재생성=비용 최소" 계약 정확히 준수.

### 4. 테스트 충실도 — PASS (Low gap 1건)

- **pipeline forceExplain 테스트**(`pipeline.test.ts:250-268): 재생성/미재생성을 대비 검증. forceExplain 없이 → `explain not.toHaveBeenCalled()`, forceExplain=true → 호출 + 전 정책 explanation 갱신값 확인. 재파싱 없는 else 경로임은 기존 증분 테스트(124-170)가 뒷받침(변경 없으면 parser 0회·updatedAt 보존).
- **카드 표시/폴백 테스트**(`PolicyResultCard.test.tsx:86-102): explanation 있으면 policy-benefit 표시 + raw summary 미노출(잡음 방지) 검증, explanation=null이면 policy-benefit 부재 + summary 폴백 검증. 경계(있음/없음) 양방향 커버.
- **explain 혜택 서술형 통과 테스트**(`explain.test.ts:59-64): "~을 지원하는 정책이에요"가 자격단정 아님 → grounded 확인. 프롬프트 목적 변경이 그라운딩 회귀를 깨지 않음을 15개 회귀 테스트가 보증.
- 스킵/flaky 없음(vi.fn 결정형, 실 네트워크 0).

---

## 발견 목록

### Med
없음.

(아래 Med는 변경 범위 밖 관찰 — 참고용)
- **[관찰, 범위 밖] scripts/ingest.ts explainer 배선이 `recruit: null` 하드코딩**(`scripts/ingest.ts:110`). 도메인 `Policy`의 구조화 recruit를 GroundingRecord.recruit로 매핑하지 않아 모집 정보가 프롬프트/그라운딩 corpus에 들어가지 않는다. D-②에서 신규 도입한 게 아니라 기존 배선(diff 무변경)이며 타입 안전(recruit는 optional). 혜택 한 줄에 모집 문구가 필요 없다면 무해. 향후 recruit 서술이 필요해지면 매핑 검토 대상.

### Low
1. **forceExplain 테스트가 불변 계약을 직접 assert하지 않음**(`pipeline.test.ts:250-268). forceExplain=true 시 explanation 재생성은 검증하나, 같은 시나리오에서 `updatedAt`/`parsed`/`vector`가 변하지 않았음을 명시 assert하지 않는다. 계약이 코드상 명확하고 updatedAt 보존은 기존 테스트(124-170)가 커버하므로 실질 위험은 낮지만, "설명만 재생성" 계약을 회귀로 못박으려면 forceExplain 케이스에 `expect(written[i].updatedAt).toBe(prev)` / `written[i].parsed`가 seeded와 동일함을 추가하면 계약이 테스트로 고정된다.
2. **explain 프롬프트 예시 어휘가 corpus 미포함 명사**(`src/llm/explain.ts:261, "월세"/"심리상담"). 예시 문구가 출력에 그대로 반영돼도 일반 명사는 그라운딩 검증(URL/숫자/행정구역/자격단정만 검사) 대상이 아니라 통과 — 기술적으로 무해. 다만 예시가 특정 도메인(주거·마음건강)에 치우쳐 있어 다른 카테고리 정책에서 어휘 오도 가능성은 안전 축(auditor)에서 별도 판단 권장.

### nit
1. **`deps.explainer!` 대신 인라인 좁히기 가능**(`src/data/ingest.ts:199-200). `regenExplain` 지역변수를 쓰는 대신 삼항에 `deps.explainer != null && (...)`를 직접 넣으면 TS가 좁혀 `!` 제거 가능하나, 현재 형태가 조건 재사용·가독성 면에서 낫다. 변경 불필요(취향).

---

## tdd-implementer 조치 요청
없음(blocker/High 0). Low/nit는 defer 권장. integration-qa에 통과 공유.
