# 03 · 기술 품질 검수 — 상시-운영기간 구멍(②) + 연도 변형 dedupe·카테고리 중복(④)

검수: code-reviewer · 2026-07-11 · 대상: `tdd-implementer` 산출물 2건 묶음
안전·도메인 규칙은 `safety-domain-auditor` 소관 — 여기서는 기술 관점만.

## 게이트 재실행 결과 (전부 그린)
- `npx vitest run --exclude "**/.claude/**"` → **54 files / 866 passed** (재현 확인).
- `npx tsc --noEmit` → exit 0, 무출력.
- `npx eslint src test scripts` → exit 0, 무출력.

## 등급별 건수
| 등급 | 건수 |
|------|------|
| blocker | 0 |
| High | 0 |
| Should | 1 (S1 — 도메인 성격, safety-auditor 인계) |
| nit | 4 (N1~N4) |

**결론: blocker/High 0건 → 구현 차단 없음. 커밋 진행 가능.**
Should 1건은 안전·도메인 판정 사안이라 `safety-domain-auditor`로 인계, nit는 개선 제안으로만 남긴다.

## ResultList 간헐 실패 판정 — **새 코드 비결정성 아님**
구현자 보고: full suite 초회에 ResultList 렌더 테스트 3건 flaky 실패, 재실행 그린.

검증:
- **신규 코드에 비결정 요소 없음.** `dedupeYearVariants`는 시계(`Date.now`)·`Math.random` 미사용.
  Map 삽입 순서(버킷 now→soon→review, 배열 순서) 결정적, 대표 선정은 상태→연도→updatedAt→**id 안정 tie-break** 캐스케이드로 입력 순서 무관(테스트 `out1==out2`로 잠금). `updatedAtValue`는 원문 문자열 `Date.parse`만 — 현재 시각 미조회.
- **렌더 경로에 Date 의존 없음.** `PolicyResultCard`는 `useEffect`·async·타이머 전무(useState 1개뿐), `llm` 미주입 시 LLM 호출 없음. 테스트 `ev()`는 `updatedAt` 미설정(→ -Infinity)이라 렌더 결과가 시각·타이머와 무관. 설령 타 파일의 fake timer가 새더라도 이 3건 결과는 안 바뀜.
- **재현 시도:** `ResultList.test.tsx` 단독 3회 연속 = 11/11 green. 격리 실패 없음 → cleanup 정상(누락이면 결정적 실패했을 것).
- **환경 정황:** 전체 실행 `environment 99.12s`(jsdom 54파일 병렬 콜드 셋업). 초회-only·재실행-green 패턴은 **Windows 병렬 워커 콜드스타트 워밍업** 특성과 일치.

판정: 초회 flaky는 리뷰 대상 변경과 **무관**한 환경(콜드 jsdom 워커) 유래. 새 코드가 유발한 비결정 정렬·시계 사용 없음. `integration-qa`에 환경 관찰 권고만 남김(코드 수정 불요).

## Should (safety-auditor 인계)

### S1 — 상시 재해석의 오은폐 방향 전환 (도메인 판정 필요)
`deriveSeoulRecruit`가 '상시'라도 운영기간 종료일이 도출되면 dated로 재해석한다.
- 기술적으로는 정확하고 의도된 변경(구버그 '영구 상시' 차단). 종료일 도출/해넘김 로직도 아래 probe로 정합 확인.
- 그러나 **진짜 연중 상시인데 운영기간이 과거로 표기된(매년 갱신) 사업**은 이제 마감 처리되어 숨겨질 수 있다 — 오은폐의 역방향. 이는 "진행 중 상시 오은폐 금지" 불변식과 상충 가능한 **도메인/안전 트레이드오프**라 `safety-domain-auditor`의 판정 대상. 기술 리뷰로는 blocker 아님(로직 자체는 명세대로 동작).

## nit (개선 제안 — 차단 아님)

### N1 — 연도 strip 정규식이 브랜드 숫자를 연도로 오인
`groupKey`/`titleYear`의 `(19|20)\d{2}` 는 정책명 브랜드 숫자도 연도로 처리(probe 확인):
- `"2050 청·장년마음 안아주기"` → `"청·장년마음 안아주기"` (2050 제거)
- `"2030세대 자산형성"` → `"세대 자산형성"` (2030 제거)
- `"1365 자원봉사"` → 무변(13xx는 미매칭, 안전)
근거: strip 후 `normalizeName` 잔여가 **완전 동일**해야 병합되므로 실제 오병합 위험은 낮고, 대표 선정이 최신판을 남겨 오은폐도 아님. 다만 동일 브랜드의 다른 정책이 우연히 나머지 토큰까지 같으면 병합될 수 있어 관찰 권고. (요청된 "지역 토큰 무접촉"은 확인됨 — 한글 지역명 미접촉, `(성북구)/(중랑구)` 분리 테스트 그린.)

### N2 — 해넘김 보정 경계(`month == startMonth`)
`inheritedEndFromSegment`의 `month < startMonth`만 +1 → `"…12. ~ 12."` 같은 동월 표기는 같은 해로 처리. 실제 1년짜리면 1년 조기 마감(오은폐 방향)이나, 연중 범위는 통상 종료부에 연도를 명시("2024. 1. ~ 2025. 1.")해 `direct` 경로가 처리하므로 도달 불가에 가깝다. 현행 보수 기본값 수용.

### N3 — `dedupeYearVariants` 매 렌더 실행
`ResultList` 렌더마다 재계산(useMemo 미적용). 결과 목록은 소규모라 비용 무시 가능. 필요 시 `result` 의존 memo로 감쌀 수 있음.

### N4 — `displayCategory` 콤마 단일 구분자
콤마(`,`)만 분리·dedup. 보고된 버그("일자리,일자리")는 해결. 다른 구분자(`/`·중점) 혼용 데이터는 미대응이나 스코프 밖. 색 매칭 `categoryTag`는 원문 유지 확인(표기만 정리).

## 정확성 probe (통과)
연도 상속 엣지 — 테스트 어서션과 명세 대조 정합:
- `"2024. 1. ~ 12."` → 종료부 "12."=월 → `2024-12-31` (연도 상속)
- `"2024. 1. 5. ~ 12. 20."` → 월.일 → `2024-12-20`
- `"2024. 11. ~ 3."` → 3<11 해넘김 → `2025-03-31`
- `"2026. 5. ~"`(끝 열림)·운영 undefined → `{ text: '상시' }` 유지(진행 중 오은폐 방지)
- 월>12·일 범위 이탈·시작 연도 미도출 → null(unknown 노출 유지, 보수)
- 전화번호/금액 오탐 차단(`isPlausibleYear`)·last-match(뒤쪽 종료월) 회귀 그린.

## 순수성·타입·테스트 충실도
- **순수성:** `dedupeYearVariants`·seoulClient 헬퍼 모두 시계·전역상태·I/O 무접촉, throw-free(비배열/비문자 입력 방어). 결정적.
- **타입:** `any` 남용 없음. `unknown` 입력을 `typeof` 가드로 좁힘. tsc 그린.
- **테스트 충실도:** 신규/수정 테스트가 경계값(해넘김·끝열림·지역분리·전멸금지·id tie-break·입력순서 무관)과 실패경로(월>12·빈제목)를 실제 검증. 스킵·flaky 유발 코드 없음. 교정된 기존 테스트(`상시 모집`+full-date → dated)는 구버그 인코딩을 정상 동작으로 바로잡은 정당한 변경(테스트-추종 아님).

## 인계
- `safety-domain-auditor`: **S1**(상시 재해석 오은폐 역방향) 도메인 판정 요청. N1(브랜드 숫자 병합)도 결과 억제 표면 인접이라 참고.
- `integration-qa`: 기술 게이트 **통과**. ResultList 초회 flaky는 신규 코드 무관(환경 유래)로 판정 — 코드 수정 불요, 환경 관찰만.
- `tdd-implementer`: blocker/High 0 — 수정 요구 없음. nit는 선택적.
