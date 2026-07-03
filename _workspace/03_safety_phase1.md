# Safety & Domain Audit — Phase 1

판정: **조건부 통과 (CONDITIONAL PASS)**. High 위반 없음(머지 가능). 핵심 불변식(unknown≠none, 불명≠전국, throw-free, 원문보존) 성립. 단 Phase 3 자격 엔진에 상속되면 부적격 통과로 직결되는 **Med 3건** — Phase 2/3 착수 전 처리 또는 차단 테스트 필수.

## 동작 경로 교차 확인
1. 소득 unknown≠none — 핵심 통과. 단 부분일치 결함(V1).
2. 불명 지역≠전국 — 핵심 통과. 단 부분일치 결함(V2). 타 시·도 미식별은 보수(false)라 안전.
3. throw 없는 방어 — **통과(깨끗)**. 전건 .not.toThrow(). 위기 청년 깨진 데이터로도 결과화면 도달 가능.
4. 원문 보존 — 통과(regionText/income.raw/sourceUrl/raw).
5. 확인필요 보수 방향 — 역순연령/역전날짜/id 통과. 단 모집 무효경계 V3.

## 위반 정리
| # | 위반 | 위험도 | 위치 | 실패모드 |
|---|---|---|---|---|
| V1 | 소득 `무관/제한없음` 부분일치로 none 오탐(혼합문 상한 소실) | Med | income.ts:15 | Phase3 부적격 통과 |
| V2 | 지역 `전국` 부분일치 isNationwide 오탐(전국체전 등) | Med | region.ts:20 | 타지역 과노출 |
| V3 | 무효/단일 경계날짜가 dated로 위장(무효 start 은폐) | Med | recruit.ts:56-63 | Phase3 마감정책 'now' 오판 |
| V4 | fallbackId='unknown' 고정 → 다수 시 충돌 | Low | normalizePolicy.ts:68 | Phase2 키 교체 전제 |
| V5 | 연령 상한 범위밖 verbatim | Low(의도) | age.ts | 위반 아님 |

## 누락 안전 테스트 (RED로 추가 요청)
1. `'소득과 무관하게 지원'` → 기대 unknown (현재 none)
2. `'중위소득 150% 또는 소득 무관'` → 기대 medianRatio/150 (현재 none)
3. `'전국체전 입상자'` → 기대 isNationwide:false (현재 true)
4. 무효 start + 유효 end → 기대 unknown (현재 침묵의 dated)
5. 소득 단위 변형 회귀 고정(`150퍼센트`, `150% 이내`)

## 권고
머지 차단 High 없음 → Phase 1 머지 가능. 단 V1/V2/V3는 동일 패턴(부분일치·침묵의 dated). income/region: 앵커/토큰 매칭 또는 강제약 신호 우선. recruit: reconcile에서 무효 사유 있으면 unknown 보수화. 위 5개 RED 먼저 추가 후 GREEN.
