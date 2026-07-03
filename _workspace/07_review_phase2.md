# Code Review — Phase 2 (기술 품질)

판정: **PASS (blocker 0)**. 게이트 전부 재현(tsc 0 / 107 통과 / data 96.53·84.10, domain 97.70 / lint 0). 의존성 주입·any 0·import type 준수·테스트 충실도 양호. GREEN 중 fixture 임계 조정은 구현 추종이 아니라 normalizeName 과잉정규화 버그의 정당한 일반화 수정으로 확인.

## Should (Phase 3 진입 전 권장, S1·S2 우선)
- **S2 incremental.ts** — `eligibilitySignature`가 연령은 파싱값(ageMin/ageMax)만 포함, ageText 원문 누락. 명세 §3은 ageText 원문 명시. age 원문 변경(파싱 동일/실패)이 해시에 안 잡혀 재파싱 누락 가능. (income은 income.raw 포함되어 안전, 연령만 누락.)
- **S1 ingest.ts vs coverage.ts** — 같은 "2차 키 ≥0.85"인데 산식 불일치: coverage는 title만, ingest는 (title+org)/2. 임계 상수도 2곳 중복 선언(ingest:69, coverage:14). 동일 쌍이 모듈마다 후보/비후보 갈림. 공용 헬퍼로 통일 권장.
- **S3 ontongClient.ts** — src가 test/fixtures/*.json 정적 import(src→test 역방향 의존, 레이어 위반). 저비용 대안: fixture를 src/data/__fixtures__/로 이동. (QA 확인: 현재 트리셰이킹돼 번들 미포함이나 의존 방향 자체가 문제.)
- **S4 tsconfig.node.json** — noUncheckedIndexedAccess 누락 → scripts가 약한 검사로 컴파일. 일관성 위해 추가.

## Nit
- N1 pickNewer 동률 후행 우선(ingest:199) — 테스트 공백, 경계 1건 추가 권장.
- N3 ontongClient:10-12 미완성/자기모순 주석 정리.
- N4 coverage O(M·N·L²) — fixture 규모 무관, 실데이터에서 조기 컷오프 고려.

결론: blocker 0, 머지 가능. S1·S2는 자격/증분 정확성 직결 → 우선.
