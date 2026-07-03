---
name: youth-policy-build
description: 청년정책 진단 MVP(마음건강 깔때기)를 TDD로 빌드하는 오케스트레이터. Phase 구현·기능 추가·버그 수정·리팩터·리뷰를 에이전트 팀(planner→implementer→reviewer∥safety-auditor→qa)으로 조율한다. 트리거 — "Phase N 구현/진행", "다음 Phase", "자격 엔진/그래프/깔때기/위기 라우팅/Gemini 작업", "테스트부터", "이 모듈 리뷰/QA", "다시 실행/재실행/업데이트/수정/보완", "이전 결과 기반 개선". 단순 질문은 직접 응답.
---

# Youth Policy Build — 오케스트레이터

청년정책 진단 MVP를 안전·신뢰를 지키며 TDD로 완성하는 팀을 조율한다. 빌드 계획은 `docs/plans/PLAN_youth-policy-diagnosis-mvp.md`가 단일 진실 원천(SSOT)이다.

## 실행 모드
**에이전트 팀** (생성-검증 + 파이프라인 하이브리드). 팀원은 `SendMessage`로 직접 통신, `TaskCreate`로 작업 공유, 산출물은 `_workspace/`에 파일로 남긴다.

## 팀 구성
| 에이전트 | 역할 |
|---------|------|
| `phase-planner` | Phase → TDD 작업 분해, 테스트 시나리오·경계값 도출 |
| `tdd-implementer` | RED→GREEN→REFACTOR 구현 (핵심 빌더) |
| `code-reviewer` | 기술 품질·타입·관용성 검수 |
| `safety-domain-auditor` | 위기 라우팅·자격 보수성·그라운딩·고지 감사 (최후 방어선) |
| `integration-qa` | 경계면 교차 비교 + 품질 게이트 |

모든 Agent 호출은 `model: "opus"`.

## Phase 0: 컨텍스트 확인 (워크플로우 시작 시 항상)
1. `_workspace/` 존재 여부 확인.
   - 미존재 → **초기 실행**.
   - 존재 + 부분 수정 요청 → **부분 재실행** (해당 에이전트만 재호출).
   - 존재 + 새 입력/새 Phase → **새 실행** (기존 `_workspace/`를 `_workspace_prev/`로 이동).
2. plan 문서에서 대상 Phase의 Goal·Tasks·체크리스트·관련 Success Criteria·Risk를 읽는다.
3. 어떤 계층(도메인/데이터/LLM/UI)인지 식별 → 안전 관련 Phase(4·6)면 `safety-domain-auditor` 비중을 높인다.

## 워크플로우 (Phase 단위)

**실행 모드: 에이전트 팀**

1. **계획** — `phase-planner`가 대상 Phase를 `_workspace/01_planner_phase{N}_tasks.md`로 분해. 안전 포인트를 `safety-domain-auditor`에 미리 공유.
2. **구현 (RED→GREEN→REFACTOR)** — `tdd-implementer`가 테스트 먼저 실패 확인 후 최소 구현, 리팩터. 모듈 1개 완성마다 다음 단계로.
3. **검증 (병렬, 검수 강도 정책 적용)** — 모듈 완성 직후 검수한다. `integration-qa`는 항상 경계면 교차 비교 + 게이트를 돈다. `code-reviewer`도 항상 돈다. `safety-domain-auditor`는 **안전 직결 모듈에만** 병렬 투입한다(아래 정책).
4. **수정 루프 (강도 정책 적용)** — blocker/High(안전 High 포함)만 `tdd-implementer`가 일반화 반영 → 재검증, 통과까지 반복. Med/Should·Low/Nit는 수정 루프에 넣지 않는다(아래).

### 검수 강도 정책 (calibration, 2026-06-24)
검수는 가치를 지키되 마찰을 줄인다. 등급별로 처리가 다르다:

| 등급 | 처리 |
|------|------|
| **blocker / High** (안전 High 포함) | 즉시 수정 루프. 통과까지 반복. **절대 defer 금지.** |
| **Med / Should** | 단일 묶음으로 보고만 하고 **기본 defer**. 다음 Phase가 그 항목에 안전 의존하거나 사용자가 반영을 원할 때만 수정. |
| **Low / Nit** | 보고서에 1줄 기록만. 수정 루프 진입 금지. |

**safety-domain-auditor 투입 기준** — 모듈이 다음 중 하나라도 건드리면 안전 직결로 보고 풀 투입한다: 자격 보수 판정, 위기 라우팅, LLM 그라운딩/날조 방지, '추정' 고지·원문 링크·신선도, 사용자 입력 해석. 순수 유틸/내부 헬퍼(타입 정의, 포맷터, 수학 함수 등 신뢰 표면에 안 닿는 코드)는 `code-reviewer` + `integration-qa`만으로 검수하고 safety-auditor를 생략한다.

> **이유:** Med/Should를 매번 fix-loop하면 수정 라운드가 누적돼(Phase 2 사례) 속도가 죽는다. 그러나 안전 High를 놓치면 신뢰가 무너진다 — 그래서 등급 게이트와 안전 바닥선은 유지하고, 그 위의 churn만 깎는다. defer한 Med/Should는 사라지지 않고 보고서에 남아 다음 Phase 진입 전 재평가된다.
5. **게이트 통과 확인** — `integration-qa`가 공통 품질 게이트 전부 통과 확인. plan 문서의 Phase 체크박스·진행률 갱신 제안.
6. **종합 보고** — 리더가 산출물·게이트 결과·잔여 항목을 사용자에게 요약.

> **점진적 QA:** 전체 완성 후 1회가 아니라 각 모듈 직후 QA를 돌린다. 경계면 버그는 일찍 잡을수록 싸다.

## 데이터 전달 프로토콜
- **태스크 기반**(`TaskCreate`/`TaskUpdate`): 진행상황·의존관계.
- **파일 기반**(`_workspace/{phase}_{agent}_{artifact}.{ext}`): 산출물·감사 추적. 중간 파일 보존.
- **메시지 기반**(`SendMessage`): 실시간 조율·수정 요청.
- 최종 코드만 `src/`·`test/`에, 중간 산출물은 `_workspace/`에.

## 에러 핸들링
- 에이전트 실패 시 1회 재시도, 재실패면 해당 결과 없이 진행하되 보고서에 누락 명시.
- 상충하는 검수 의견(품질 vs 안전)은 삭제하지 않고 **안전 우선**으로 판정하되 양쪽 출처 병기.
- 품질 게이트 실패는 절대 통과로 가정하지 않고 출력을 인용해 보고.

## 팀 크기
중규모(Phase당 5~12 작업) → 5명. 작은 수정은 필요한 에이전트만 부분 소집.

## 테스트 시나리오
- **정상 흐름:** "Phase 3 자격 엔진 구현해줘" → planner 작업 분해 → implementer가 경계값 테스트 RED→GREEN→REFACTOR → reviewer 품질 + safety-auditor 보수성 검수 → qa 게이트 통과 → plan 체크박스 갱신.
- **에러 흐름:** "Phase 4 위기 라우팅 작업" 중 safety-auditor가 "위기 입력이 거짓양성에서 정책으로 새는 경로" 발견 → implementer에 High 차단 → 안전 테스트 추가 + 수정 → 재감사 통과 후 진행.
