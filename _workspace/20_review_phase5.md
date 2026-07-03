# Code Review — Phase 5: 깔때기 UI (기술 품질 축, code-reviewer)

## 판정: PASS (blocker/High 0)

## 게이트 재현 (직접 실행)
| 게이트 | 결과 |
|---|---|
| `npx tsc --noEmit` | EXIT 0 |
| `npx eslint .` | EXIT 0 |
| `npx vitest run` | **412 passed (23 files)** — 구현자 보고 일치 |
| coverage src/ui | ui/funnel Stmts 97.77 / Branch 90.9 / Funcs 100 / Lines 98.71 (임계 85/80 충족) |
| `npx vite build` | EXIT 0 (1901 modules) |

App.tsx `data/cache/policies.json` 임포트 루트 resolve 정상(tsc/build 통과 검증).

## Blocker / High
없음. useFunnel 경합(reqRef 시퀀스 + cancelled 이중 가드), reject 안전전이(SAFE_TRAVERSE + error, crisis 누수 0), 재질문 방지(스택 상단 동일 무시), Date.now 직접호출 0(deps.now/useMemo 주입), any 0, as CachedPolicy 단언 부재(Partial<CachedPolicy> 옵셔널 접근 null-safe).

## Med / Should (묶음 defer)
1. **ResultList key `Math.random()` 폴백** (ResultList.tsx:29,32): id 결손 시 매 렌더 새 key → reconciliation 깨짐(포커스/애니 유실 가능). 영향은 id 없는 합성정책 한정. 권장: index 폴백 `item.policy?.id ?? \`now-${i}\``. → **이번 라운드 수정 채택**(safety L1과 수렴).
2. **App.tsx deps 객체 매 렌더 재생성** (App.tsx:58-62): 현재 무해(App index set 후 미재렌더)이나 상태 추가 시 traverse effect 재실행 트랩. 권장 useMemo. → defer.
3. **useEffect deps에 currentNode 포함** (useFunnel.ts:96): currentNodeId로 충분, 기능 영향 없음. → defer(nit급).

## Low / Nit
- SafetyBanner li key label-phone 중복 자원 시 충돌 가능(실데이터 비현실적).
- FunnelContainer 결과 "뒤로" 버튼 ↔ FunnelStep "뒤로" 마크업 중복(과잉추상화 위험, 강권 안 함).

## SAFETY-SHARE (safety-auditor 위임)
1. **위기 테스트 B(compareDocumentPosition) 공허 통과** (funnel.crisis.test.tsx:62-82): crisis 시 SafetyBanner만 렌더 → others 배열 빈 배열 → for 루프 0건 단언. 배너 우선순위는 C(카드0)·C2(칩0)가 실질 보증하나 B의 "DOM 순서 엄격검증" 의도는 비어있음. 배너+다른 region 공존 시나리오 1건 추가 시 견인력 확보. 안전 표면이라 위임. → **이번 라운드 수정 채택**(적대적 프로브를 정규 회귀 테스트로 코드화).
2. blocked/review 누수·고지/링크 null-safe·safety-kind 제외는 단위/통합 실질 검증(vacuous 아님).

## 테스트 충실도
RED 의미성 양호(E3 경계값/E5 review/E1 blocked 실분기). queryBy null 단언은 특정 문자열/testid 대상이라 오타통과 위험 낮음. 단 SAFETY-SHARE 1만 공허.
