# Safety & Domain Audit — Phase 2

판정: **조건부 통과**. High 없음. parseChunk UNKNOWN 폴백·LLM throw 흡수·false-merge 금지·degradation 견고(동작 경로 확인). Phase 3 착수 전 Med 처리 + 누락 테스트 권고.

## 동작 경로 확인 (7항목)
1. parseChunk UNKNOWN 폴백 — **통과(깨끗)**. 빈/null/reject/스키마외/incomeCriterion null 전부 UNKNOWN, none 흡수 0, throw 0. L3(null→UNKNOWN)≠L9(none 명시) 고정.
2. LLM throw 흡수 — 통과. parseChunk try/catch, ingest 중단 없음, 키 없으면 disabled→전 UNKNOWN.
3. 증분 해시 오염 — **부분 통과(V2-1 Med)**.
4. 중복제거 false merge — 통과(1차 source+id만 자동, ≥0.85는 후보만).
5. 서울 필터 — 통과(11 OR 전국 OR 자치구명, droppedNonSeoul/droppedUnknownRegion 분리). 단 동명 자치구 오탐(아래).
6. 신선도·id — 통과(fetchedAt 전건 주입, 무id 제외+카운트).
7. Phase 1 불변식 연속 — 통과.

## 위반
| # | 위반 | 위험도 | 위치 | 실패모드 |
|---|---|---|---|---|
| V2-1 | lastModified 존재 시 해시=id+lastModified만 → 동일 수정일+자격원문 변경 시 재파싱 영구 누락 | **Med** | incremental.ts:62-64 | Phase3 stale 자격 오판 |
| 동명자치구 | 자치구명 `includes()` → 타지역 '중구'(부산/대구) 서울로 오노출 | **Med** | ingest.ts seoulVerdict | (a) 정밀도 결정과 모순 false positive |
| V2-3 | parseInput이 income.raw만 LLM 전달, age/recruit/household 원문 미전달 → 그라운딩 입력 누락 | Low(Phase6 High) | ingest.ts:255-259 | Phase6 실Gemini 연결 시 자격 날조 |
| V2-2 | 수동검증 후보 큐 소멸/승인 경로 부재 | Low | ingest.ts:218-243 | 운영 부채(안전 영향 없음) |

V2-1 근거: 온통 lastModified 신뢰성(U5 미확정)에 안전 의존. 현재 LLM disabled로 전 UNKNOWN(보수)이라 Med, Phase 3 적격 산출 켜기 전 필수 처리.

## 누락 안전 테스트 (RED 추가)
1. (V2-1 차단) lastModified 동일 + income.raw/ageText 변경 → 현재 동일 해시(skip). 권고: 해시 = id+lastModified+eligibilitySignature **이중 결합** → reparse=true. H2/H4 어느 것도 이 교차 미커버.
2. parseChunk 그라운딩 음성(Phase6 선제): 비어있지 않은 입력에 무관한 날조 chunk 후처리 가드 테스트 부재.
3. ingest 2회차 + 자격원문 변경 → 해당 1건만 reparsed 양성 케이스 부재(현재 "변경없음→0"만).

## auditor 결정 (a) 의견
**리더 결정(불명지역 제외+카운트, 정밀도 우선)에 동의.** 비서울 오노출이 누락보다 신뢰 타격 큼. 단 droppedUnknownRegion이 Phase4/5에서 검수 큐로 연결되는지 후속 감사 필요. 보완: 동명 자치구 false positive 가드(시/도 토큰 교차검증)는 (a) 정밀도 목표와 모순이므로 Phase 3 전 처리 권고.

## 권고
머지 가능(High 없음). Phase 3 전 필수: V2-1 이중결합 + 누락 테스트 1·3 + 동명자치구 가드. Phase 6 전 필수: V2-3 High 재평가 + 그라운딩 가드.
