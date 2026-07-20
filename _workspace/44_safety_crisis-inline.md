# 44 — 안전 감사: cc9b188 위기 라우팅 2단계 (safety-domain-auditor, 2026-07-20)

재실행 게이트: 위기 관련 4파일 53/53 그린. 대상: `git show cc9b188`.

## 최종 판정: **승인 (APPROVE)** — blocker/High/Med 0 · Low 3 · 선택 하드닝 1

## 축별 판정 (전부 PASS)
1. **노출 시점 지연 0**: handleChange 동기 감지→같은 렌더 SafetyInlineNotice. T-IC1 동기 단언(getByRole)이 잠금.
2. **거짓음성 0**: crisisDetect·CRISIS_PATTERNS·실시간 감지 경로 diff 무접촉. submit 경로도 재확인 후 억제 유지.
3. **검색·생성 억제 불변**: 위기 시 onSubmit 도달 0(타이핑·제출 공통), T-IC4가 traverse 추가 호출 0 잠금. suppressGeneration 무접촉.
4. **위기·정책 병렬 금지**: typingCrisis 게이트 전수 확인(헤드라인 L180·프로필 L208·결과/예시 L235·하단 L266). 결과 화면(compact) 카드 잔존 경로 없음(A4 잠금). T-IC2가 표면 8종 미렌더 잠금(testid 실재 확인 — vacuous 아님).
5. **제출 화면 불변**: early-return 조건명만 교체, SafetyBanner·복귀 링크 무변경. B2(regions=['safety']) 무접촉 통과.
6. **인라인 배너**: 번호는 safetyResources() 주입(하드코딩 0), 빈/비배열 throw-free, role=alert, SafetyBanner 동일 헤드라인·진지 톤. "적던 글은 그대로 있어요" = 겨냥한 불안(글 소실)을 해소하는 사실 진술 — 적절.
7. **해제 경로**: 매 change 신선 재평가(sticky 없음) → 삭제 시 해제·재입력 시 재감지. T-IC3 잠금.
8. **DESIGN §7.1 ↔ 코드/테스트 일치**: (a)(b) 불변 전부 테스트로 잠김. T-권고1이 키 없는 실배선 end-to-end(graceful degradation) 확인.

## Low 3건 (등급 정책상 defer — 기록)
- **Low-1 (톤 비대칭)**: 홈 인사 "…맞는 정책을 찾아드려요"(FunnelContainer L196-203)가 작성 중 위기에도 잔존(!hasQuery 분기, typingCrisis 미게이트). 문자상 위반 아님(§7.1a 열거에 인사 없음)이나 위기 문구 위에 남는 톤 미묘. 권고: !typingCrisis 게이트 또는 의식적 잔존 결정.
- **Low-2 (테스트 공백, 안전 표면)**: SafetyInlineNotice 전용 테스트 없음 — 인라인 배너의 tel:109/1577-0199 링크를 어떤 테스트도 단언 안 함(빈 alert만 남아도 그린인 위양성 가능). 코드는 현재 정확(정독 확인). 권고: SafetyBanner.test 대칭의 유닛테스트 + 통합에서 tel href 단언.
- **Low-3 (문서 잔여)**: DESIGN.md L101 브랜드 항목 "위기 시 미렌더 불변"이 2단계 미반영(정확히는 (b) 제출 위기 한정).

## 선택 하드닝
- crisisCommitted 경로(Enter 후)에도 regions==['safety'] 단언 추가(구조상 동일 JSX라 위험 0, 완전 잠금용 nice-to-have).
