# Code Review — Phase 1 (기술 품질)

판정: **PASS (blocker 없음)**. 게이트 전부 통과(tsc/test 35-35/coverage 98.87%/lint 0). 도메인 순수성·TS 엄격성·throw-free 방어 충실.

## Should (Phase 2 실데이터 진입 전 처리/계약고정 필요)
- **S-1 parse/age.ts:22-39** — `이상`/`이하`/range 분기 상호배타. `"19세이상34세이하"`→`null/34`(하한 19 소실). 복합표기에서 한쪽 경계 소실 → 자격 false positive. 제안: 이상/이하 독립 추출 후 합성.
- **S-2 parse/recruit.ts:56-63** — 한쪽 날짜만 유효해도 `kind:'dated'`+반대편 null. `"2026.02.30~2026.03.05"`→`{dated,start:null,end:...}`. 부분날짜와 단일시작일 구분 안 됨. 제안: `~` 있는데 한쪽 파싱 실패면 보수적 `unknown`, 또는 테스트로 kind 계약 고정.
- **S-3 parse/income.ts:15-25** — `무관` 분기가 medianRatio보다 먼저 → `"소득은 무관하나 중위소득 150%..."`→`none`(상한 소실). 제안: 구체 패턴 우선, `무관`은 fallback.

## Nit
- N-1 테스트가 구현 따라 작성된 징후 — Should 실패경로 fixture 없음. RED로 추가 권장.
- N-2 recruit.ts 27·43 미커버(기능 문제 아님). N-3 3개+ 날짜 앞 2개만 사용(주석 권장). N-5 audit low 1건(esbuild dev, 차단 아님).

종합: tdd-implementer에 S-1~S-3 전달. Phase 1 기술 게이트 통과하나 연령/소득/모집 파싱 경계는 Phase 2 보정 의존.
