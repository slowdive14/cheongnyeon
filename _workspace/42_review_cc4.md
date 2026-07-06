# C-C4 보안 변경 기술 품질 검수 (커밋 45e801e)

검수 대상: `src/ui/funnel/useFunnel.ts`, `supabase/functions/search/index.ts`
검수 축: 기술 정확성·타입·순수성·테스트 충실도·관용성 (안전/도메인 축은 safety-domain-auditor 담당)

## 게이트 결과 (그린)
- `npx tsc --noEmit`: 통과 (출력 없음).
- `npx eslint .`: 통과 (출력 없음).
- `npx vitest run`: 54 files / **813 passed**. 스킵·실패 0.
- Edge Function은 Deno 런타임 — 앱 tsc/vitest 대상 아님(정상). 별도 Deno 테스트 없음.

## 종합 판정
blocker/High 없음. **통과.** Med 2건·Low 3건은 보고만(즉시 수정 대상 아님).

---

## 검토 포인트별 분석

### 1. useFunnel (a) atRoot 판정 — 정확
`useFunnel.ts:86-88`
```
const override = typeof queryOverride === 'string' ? queryOverride.trim() : '';
const atRoot = currentNodeId === rootId;
const query = override.length > 0 ? override : atRoot ? '' : currentNode?.concept ?? '';
```
- **override 우선 정확**: 자유입력/예시 칩(FunnelContainer가 `queryOverride=query`로 배선)이 있으면 atRoot와 무관하게 그 질의를 사용. `FunnelContainer.tsx:67`에서 항상 `queryOverride` 전달 → 실제 소비 흐름은 override 경로가 지배적.
- **엔트리만 빈 질의**: `atRoot && override 없음` → `query=''` → `traverse`가 `query.length>0` 가드(`traverse.ts:216`)로 `deps.search` 미호출 → remoteSearch no-op(네트워크 0). 마운트 시 concept 폴백 검색 낭비 제거 목적 달성.
- **노드 선택 흐름 concept 보존**: `!atRoot`이면 `currentNode?.concept ?? ''` 유지 → 버튼 흐름(stack 진행)에서 concept 검색 보존. off-by-one 없음(정확히 루트에서만 억제).

### 1b. effect 재실행 조건 — 정확, 무한 루프·경합 없음
`useFunnel.ts:106` deps: `[graph, currentNodeId, currentNode, profile, deps, traverseFn, queryOverride]`
- `currentNodeId`가 deps에 포함 → `select`(stack push)·`back`(stack pop) 모두 currentNodeId 변경 → 재순회 정상. stack 진행/복귀 반영됨.
- **무한 루프 없음**: effect가 `setStack`을 호출하지 않음. `setTr/setLoading/setError`만 갱신하며 이들은 deps에 없음 → 재실행 유발 안 함.
- **경합 방지 정확**: `reqRef` 단조 증가 + `reqRef.current !== reqId` 가드로 stale 응답 폐기. cleanup `cancelled=true`로 언마운트 누수 차단. 이중 방어(cancelled·reqId) 정상.
- 신규 813 테스트 그린, 기존 useFunnel 테스트(select/back/reject/T8 안정 참조)에 회귀 없음.

### 2. Edge Function CORS — 차단 효과 유효, Vary 적절
`index.ts:24-37`
- 미설정 → `'*'`(개발), 설정 시 화이트리스트 정확.
- **차단 효과 유효**: 비허용 origin에는 요청 origin 대신 `ALLOWED_ORIGINS[0]`(대표 도메인) 반환. 브라우저 CORS 규격상 `Access-Control-Allow-Origin`이 요청 Origin과 불일치하면 브라우저가 응답을 스크립트에 노출 거부 → 실질 차단. 관점 정확.
- **`Vary: Origin` 적절**: origin별로 응답 헤더가 달라지므로 캐시 오염 방지에 필요. 정확히 추가됨.

### 3. 레이트리밋 — 고정창 로직 정확, 인메모리 한계 명시됨
`index.ts:52-62`
- 창 만료(`now > w.reset`)·미존재 시 count=1로 리셋 정확. 초과 판정 `w.count > RATE_LIMIT_PER_MIN`으로 정확히 N번째까지 허용, N+1번째 차단(off-by-one 없음).
- `RATE_LIMIT_PER_MIN <= 0` 비활성 가드 정확. `Number(...)` NaN 시(비수치 env) `NaN <= 0`은 false → 비활성 안 되고 이후 `w.count > NaN`은 항상 false → **한도 무제한**이 되는 미세 엣지가 있으나, 정상 배포값(40) 하에선 무해. (Low, 아래)
- **인메모리 한계 주석 명시됨**(`index.ts:40-41`): "서버리스 인스턴스별 인메모리 → 다중 인스턴스 완벽 차단 아님(버스트 억제용)". 정직하게 기록됨.
- 임베딩(비용) 이전 최우선 게이트 배치(`index.ts:138-141`) — 비용 방지 목적에 맞는 순서.

### 3b. IP 추출 — 타당
`index.ts:45-49` `x-forwarded-for` 첫 값 → `x-real-ip` → `'unknown'` 폴백. XFF 첫 값이 원 클라이언트 IP 관례에 부합. Supabase Edge(프록시 뒤)에서 타당. `'unknown'` 폴백은 헤더 없는 요청을 한 버킷으로 묶음(과다 차단 가능하나 남용 방지 방향이라 안전측).

### 4. MAX_QUERY_LEN 절단·origin 전파 — 누락 없음
- 절단: `index.ts:150-153` trim 후 `slice(0, 500)`. 절단 후 빈 질의(공백만)면 조기 반환. 순서 정확(trim→slice→빈 검사).
- origin 전파: 모든 응답 경로 확인 완료 — OPTIONS(135), 405(136), 429(140), 400(147), 빈질의 200(153), 임베딩실패 200(168), 성공 200(172), 500(174) **전부 origin 전달**. 누락 없음.

---

## 발견 목록

### Med-1 (보고만) — atRoot 신규 분기 단위 테스트 부재
`useFunnel.ts`의 핵심 변경(엔트리 빈 질의 no-op)에 대한 직접 테스트가 없음. `test/unit/ui/useFunnel.test.tsx`는 모두 `traverseFn`을 fake로 주입해 실제 `query` 인자를 검증하지 않음(라인 15-27 fake는 state를 흡수만). remoteSearch.test.ts의 "빈 질의 → fetch 미호출"은 remoteSearch 계층 검증이지 useFunnel의 query 산출 검증이 아님.
- **왜 문제인가**: 변경의 회귀 안전망이 없음. 향후 누군가 `atRoot`/override 우선순위를 바꿔도 테스트가 잡지 못함. 813 그린은 이 경로를 커버하지 않음.
- **권장**: `traverseFn` fake의 `state.query`를 캡처해 (1) 엔트리 마운트 시 `query===''`, (2) override 있으면 override, (3) 노드 선택 시 concept 전달을 검증하는 케이스 3개 추가.

### Med-2 (보고만) — 레이트리밋 버킷 메모리 무한 증가
`index.ts:43` `rlBucket` Map은 만료 항목을 삭제하지 않음(`isRateLimited`는 리셋만, delete 없음). 인스턴스 수명이 길고 고유 IP가 많으면 Map이 단조 증가.
- **왜 문제인가**: 서버리스 인스턴스가 오래 살아있으면 IP별 엔트리 누적으로 메모리 압박 가능. 실무상 인스턴스 재활용 주기가 짧아 심각도 낮으나 이론적 누수.
- **권장**: 후속 하드닝(주석이 예고한 Deno KV/테이블 전환) 시 함께 해소. 또는 주기적 만료 스윕 1줄.

### Low-1 (보고만) — RATE_LIMIT_PER_MIN 비수치 env 시 무제한
`index.ts:42` `Number('abc')`=NaN → `NaN <= 0`은 false로 비활성화 안 됨 → 이후 비교가 모두 false → 사실상 무제한 허용. 운영 정상값에선 무해.
- **권장**: `Number.isFinite` 가드 또는 `Number(...) || 40` 폴백.

### Low-2 (보고만) — currentNode effect deps 중복
`useFunnel.ts:106` deps에 `currentNode`와 `currentNodeId` 둘 다 있음. `currentNode`는 `findNode(graph, currentNodeId)` 결과로 `graph`·`currentNodeId`에 종속 → 참조 변경 조건이 이미 deps의 `graph`/`currentNodeId`에 포함됨(redundant). 동작상 무해(추가 재실행 유발 안 함, findNode가 그래프 내 안정 참조 반환).
- **권장**: `currentNode` 제거해도 동일 동작. 가독성 정리 수준.

### Low-3 (보고만) — non-null assertion 사용
`index.ts:47` `xff.split(',')[0]!.trim()`. `xff`가 truthy면 split 결과 첫 원소는 항상 존재하므로 실질 안전하나 `!` 단언 대신 폴백이 방어적.
- **권장**: `(xff.split(',')[0] ?? '').trim()` 또는 현행 유지(무해).

---

## safety-domain-auditor / integration-qa 공유
- 기술 축 **통과**. blocker/High 없음 → tdd-implementer 수정 요청 없음.
- 안전 직결 확인 필요 사항(auditor 판단 위임): CORS 차단이 위기/검색 안전 경계에 영향 없음(검색만 담당, 위기·자격은 클라이언트 바닥선). 엔트리 빈 질의 no-op이 위기 감지 흐름을 건너뛰지 않는지 — traverse는 query 없어도 위기 라우팅을 먼저 수행하나 빈 query면 detectCrisis도 no-op, 자유입력 실시간 layer-1은 FunnelContainer가 별도 보유(freeCrisis) → 엔트리 안전망 유지로 보임. 최종 확인은 safety 담당.
