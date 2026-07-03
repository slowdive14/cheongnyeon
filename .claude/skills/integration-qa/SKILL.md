---
name: integration-qa
description: 청년정책 진단의 통합 정합성과 품질 게이트 검증 방법론. 계층 경계면(API↔정규화↔엔진↔그래프↔UI)의 데이터 shape 교차 비교와 공통 게이트(test/coverage/lint/tsc/build/audit) 실행 절차를 담는다. integration-qa 에이전트가 검증할 때, 또는 경계면 정합성·품질 게이트 확인이 필요할 때 사용.
---

# Integration QA — 통합 정합성 & 품질 게이트

단일 모듈이 통과해도 **경계면에서 shape이 어긋나면** 전체가 깨진다. 핵심은 존재 확인이 아니라 경계 교차 비교다. **점진적**으로 — 각 모듈 완성 직후 실행한다.

## 경계면 교차 비교 (가장 중요)
양쪽 파일을 **동시에 열어** 필드명·옵셔널·타입을 비교한다. 한쪽만 보고 통과시키지 않는다.

| 경계 | 확인 |
|------|------|
| 데이터 → 엔진 | `normalizePolicy` 출력 `Policy` shape ↔ `eligibility.evaluate` 입력 기대 |
| 엔진 → 그래프 | `evaluate`의 `{now, soon, blocked}` ↔ `traverse`/노드 쿼리 소비 |
| 그래프 → UI | 노드·후보·안전자원 ↔ `PolicyResultCard`/`SafetyBanner` props |
| LLM → 엔진/UI | `classify` 영역값 ↔ 그래프 진입점, `explain` 출력 ↔ 카드 표시 |

불일치는 **어느 두 모듈 사이 어느 필드인지** 정확히 지목한다.

## 품질 게이트 (공통, 모든 Phase)
```
npm test                 # 100% 통과(스킵 없음)
npm test -- --coverage   # domain ≥90%, data ≥80%
npm run lint             # 오류 0
npx tsc --noEmit         # 타입 통과
npm run build            # 빌드 성공
npm audit                # 신규 취약점 없음
```
- 3회 연속 실행해 flaky 없음 확인.
- 게이트 실패는 출력을 **그대로 인용**해 보고(감추지 않음). 1개라도 실패하면 Phase "미완".

## 출력
`_workspace/04_qa_phase{N}.md` — 게이트 결과(통과/실패 + 커버리지 수치) + 경계면 불일치 목록.
