# 버그 수정 — 결과 빈 화면(review 정책 UI 미노출, 안전 직결)

날짜: 2026-06-25 · 모드: 인라인 TDD + 브라우저 실측 · 사용자 승인 후 진행(Phase 5 결정 변경)

## 증상
- 404 해소 후에도 "분석 결과가 아무것도 안 뜸". 자유입력 전송도, 칩 클릭도 빈 화면.

## 진단(라이브 + 파이프라인 시뮬레이션으로 결정적 확인)
1. **자유입력 전송 = no-op**: 비위기 입력은 `classifyDomain`→`mentalHealth`→`findNodeByDomain`→루트 노드
   `select`인데, 사용자는 이미 루트라 중복방지로 무시 → 화면 불변. (단일 도메인 MVP의 구조적 dead-end.)
2. **칩 클릭 → 빈 결과**: 검색·자격 엔진은 정상(burnout 키워드 검색 5건 매칭). 그러나 마음건강 7건
   자격 판정 = now 0 / soon 0 / **review 6** / blocked 1. 대부분 `ageMin/Max=null`(AGE_UNKNOWN),
   `recruit=unknown`(RECRUIT_UNKNOWN)이라 보수적으로 review("확인 필요")로 분류됨.
3. **핵심 버그(계층 계약 불일치)**: `traverse.hasShowable`는 review를 노출대상에 포함하는데,
   `ResultList`는 now/soon만 렌더하고 review를 버림. → "확인 필요" 6건이 계산되고도 화면에서 사라짐.
   PLAN line 262/266 'review 미노출(2상태만)'는 **의도적 Phase 5 안전결정**이었으나, 실데이터에선
   사실상 전 결과를 숨겨 앱이 빈 화면처럼 됨. → 사용자 승인 받아 결정 변경.

## 수정 (RED→GREEN, 사용자 승인)
- `PolicyResultCard`: status에 `'review'` 추가. 배지 '자격 확인 필요'(sky, 빨강/초록 회피),
  `확인 항목: 나이 조건 · 모집 시기`(review 사유→의미라벨 매핑), 원문 링크·추정 고지 유지.
- `ResultList`: review 카드 렌더(now→soon→review). **blocked만 미노출 유지**(헛희망 차단).
- 테스트 갱신: ResultList(review 노출/대안 미노출), PolicyResultCard(review 배지·힌트·보수성),
  통합 funnel.ui E5(미노출→확인필요 카드 노출)로 새 동작 인코딩.

## 안전 불변식(점검 완료)
- blocked(명확 부적격) 미노출 유지 — 헛희망 차단. ✅
- review는 자격 단정 없이 '확인 필요'로만 — 보수 판정 보존, 막힘/부적격/탈락 문구 금지. ✅
- 추정 고지 + 원문 링크 + 최종 업데이트 보존. ✅ (브라우저 실측)
- 위기 우선 라우팅·throw-free 미접촉. ✅

## 게이트 + 실측
- 테스트 **562 passed (33 files)** · tsc 0 · eslint 0 · vite build 성공.
- 커버리지: ui/funnel lines 91.9 / funcs 89.1 / branch 80.4 / stmt 87.9 — threshold 충족.
- 브라우저 실측(localhost preview): '지치고 무기력해요' 클릭 → '정신건강 심리상담 바우처' 등
  '자격 확인 필요' 카드 노출 확인.

## 잔여(별개 이슈)
- **자유입력 전송 no-op**(진단 1)은 미수정. 단일 도메인에서 free-text는 위기감지만 의미 있고
  결과를 직접 내지 않음. 필요 시 'free-text를 검색 질의로 직접 결과 노출' 별도 작업 권장.
- 근본 데이터 품질: 다수 정책의 나이·모집시기 미파싱 → review 쏠림. 파서 보강 시 now/soon 증가.
