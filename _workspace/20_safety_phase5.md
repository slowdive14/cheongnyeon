# Safety & Domain Audit — Phase 5: 깔때기 UI (safety-domain-auditor)

## 판정: 조건부 통과 (High 0 — 머지 차단 없음, Med 1 — scope 결정 요)
calibration 미적용 Phase임에도 안전 직결 거짓음성/누수 없음. 핵심 불변식 코드+런타임(테스트 73 + 적대적 프로브 3) 이중 확인.

## 안전 불변식별 결과
- **S-위기배너순서 — 통과(강함).** crisis=true 시 FunnelContainer(FunnelContainer.tsx:32-38) early-return으로 SafetyBanner만, header·step·result·alternatives 일절 미렌더. 적대적 프로브: traverse가 crisis=true와 동시에 now/soon/blocked/review+alternatives 채워 반환해도 main 내 data-funnel-region은 정확히 ['safety'] 하나뿐, 헤더도 억제. 갈래 칩 억제(결정4) C2 확인.
- **S-blocked비노출 — 통과.** ResultList(ResultList.tsx:21-23) now/soon만. traverse 빈배열(traverse.ts:204) + UI 재차단 이중방어. E1/E4 + LEAK-BLOCKED 프로브.
- **S-review누수(집중) — 통과.** traverse.ts:204 review 채워 반환 → UI 경계 차단 확인. grep review src/ui = 주석만. E5 + ResultList 단위 + LEAK-REVIEW 프로브 3중. "2상태만" 숨은 구멍 실제로 막힘.
- **S-고지·링크·신선도 — 통과.** now/soon 카드 DisclaimerNote 무조건 동반(PolicyResultCard.tsx:80) → 누락 0. sourceUrl/title null 폴백(E6), updatedAt null-safe(synthesizePolicy 폴백서도 null). 고지 문구 "추정/신청 전 반드시 원문 확인" — 단정 회피, 과신 유발 없음.
- **S-throw-free — 통과.** SafetyBanner 비배열/빈 resources 흡수, ResultList null result 흡수, useFunnel reject SAFE_TRAVERSE + error(crisis 거짓활성 0). 프로브: traverse throw → 헤더 정상·crisis 미발화·카드 0.

## Med (머지 비차단, 리더 scope 결정)
- **M1 — 비위기 결과 화면 상시 위기 안내 푸터 부재.** 109/1577-0199는 crisis=true에만 노출(grep: 비위기 경로 safetyResources 렌더 없음). 하네스 체크리스트 4 "위기 안내 푸터 전 결과에"와 발산. **단 planner 19_phase5.md는 상시 푸터를 Phase 5 산출물로 미명시** — 거짓음성/누수 아닌 scope 이슈. 취약 청년 특성상 비위기 화면에도 작은 상담 링크 푸터 권고(Phase 6 자유입력 전). 리더 scope defer 여부 결정 요청. 채택 시 "비위기 결과 화면 상담 링크 존재" 테스트 1건 추가.

## Low
- L1 — ResultList key Math.random()(ResultList.tsx:29,32): id 결손 시 리렌더 key 변동. 안전 무관(정합성/미세성능). REFACTOR 권고. (code-reviewer와 수렴)

## integration-qa 공유
안전 게이트 통과. High 0. 위기 라우팅·blocked/review 누수차단·고지·throw-free 전부 런타임 실증. M1은 scope 확인 후 Phase 6 인계 가능.
