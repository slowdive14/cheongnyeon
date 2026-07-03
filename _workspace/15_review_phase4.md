# Code Review — Phase 4: 매칭 두뇌 (기술 품질 축, code-reviewer)

## 판정: PASS (조건부 — blocker 0)
게이트 전부 녹색. 기술 품질 축 blocker 없음. Med/Should defer 가능, 1건은 safety 공유.

## 게이트 재현
`tsc -b` exit 0 / `vitest run --coverage` 15파일 282통과, retrieval branch 85.09(≥80) domain 93.39(≥90) / `any` 0 / import type 준수 / 신규 의존성 0(retrieval은 data/similarity·data/cache/types만).

## 중점 검증
- **RRF**: Σ1/(k+rank), 합집합 보존, 중복 첫순위만, off-by-one 없음. rank 0-base지만 arm 간 일관·k 흡수 → 버그 아님. 정확.
- **코사인**: 0벡터/차원불일치/NaN/null 전부 0 방어. 무의존. 정확.
- **degrade**: embed undefined/throw→try/catch 흡수, 키워드 arm은 catch 밖 항상 실행(은폐 없음). 정확.
- **throw-free**: 전 구간 흡수. **DI/Phase6 경계**: Date.now/new Date/Math.random/process.env 0(타깃), 실 Gemini 호출 부재. 준수.
- **의존 방향**: retrieval이 domain 미import. namespace spy(retrieval.hybridSearch/engine.evaluate) 유효.

## Med/Should (묶음 defer)
- **Should-1 cosine 중복(DRY)**: hybridSearch.ts:24 ≡ crisisDetect.ts:70 동일 cosine 별도 정의. 드리프트 시 위기 2층·검색 유사도 불일치 가능. 공용 유틸 1곳 추출 권장(spec 4.11 의도).
- **Should-2 IDIOM_HINTS 데드코드**: config.ts:51 미import. "관туфgmaps 억제 동작 중" 착시 + 실제 억제 0. 삭제 또는 NEGATIVE 필터 배선. (safety M-1과 수렴)
- **Should-3 TR-C1/C2 spy positive-sanity 미동반**: not.toHaveBeenCalled()만, 비위기서 호출됨 sanity 부재 → 배선 통째 유실 시 vacuous 녹색 가능. TR-1/2/3가 result id 실검증으로 간접 보증이라 리스크 낮음. 1줄 sanity 추가 권장.

## ★SAFETY-SHARE (safety-auditor 위임)
1층 정규식 false-positive: `유서`→"유서 깊은", `사라지고`→"연기가 사라지고", `끝내고`→"약속을 끝내고"가 위기로 잡힘. Q-1 배너 피로 토큰 경계 문제. 거짓음성 아니므로 High 승격 안 함(누락이었다면 High). 정밀도 판단은 safety 전담.

## Nit
- rrf.ts:7 주석 "0-based" vs spec "1-base"(코드 옳음, 주석 보강 권장).
- hybridSearch.ts:107 options?.topK — options 비옵셔널이라 불필요 방어(무해).
- traverse.ts:163 topK:10 매직넘버 — config로 추출 권장(1곳뿐 무해).

결론: 기술 PASS, blocker 0. Should 3건 defer, SAFETY-SHARE는 safety 검토.
