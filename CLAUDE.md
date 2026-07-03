# cheongnyeon — 청년정책 진단 MVP

한국 청년의 "욕구 발견 깔때기" 진단 도구. 빌드 계획 SSOT: `docs/plans/PLAN_youth-policy-diagnosis-mvp.md`.

## 하네스: 청년정책 진단 빌드

**목표:** 안전·신뢰(위기 라우팅·자격 보수 판정·LLM 그라운딩·'추정' 고지)를 지키며 마음건강 깔때기를 TDD로 end-to-end 완성한다.

**트리거:** Phase 구현·기능 추가·버그 수정·리팩터·리뷰·QA 등 빌드 작업 요청 시 `youth-policy-build` 스킬(오케스트레이터)을 사용하라. 에이전트 팀(planner→implementer→reviewer∥safety-auditor→qa)으로 조율한다. 단순 질문은 직접 응답 가능.

**변경 이력:**
| 날짜 | 변경 내용 | 대상 | 사유 |
|------|----------|------|------|
| 2026-06-23 | 초기 구성 (에이전트 5 + 스킬 4) | 전체 | 신규 하네스 구축 |
| 2026-06-23 | Write 도구 추가 | agents/{phase-planner,code-reviewer,safety-domain-auditor}.md | Phase 1 라이브 실행 중 산출물 직접 기록 불가 결함 발견 — 리더 대리 저장 제거, 자급자족화 |
| 2026-06-24 | 검수 강도 calibration (등급 게이트 + safety 조건부 투입) | skills/youth-policy-build/SKILL.md | "검수가 너무 빡세다" 피드백 — Med/Should 기본 defer, 순수 유틸은 safety-auditor 생략. 단 blocker/High·안전 직결 모듈은 바닥선 유지 |
