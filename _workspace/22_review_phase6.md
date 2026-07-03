# Code Review — Phase 6 (Gemini 레이어, code-reviewer)

## 판정: 조건부 통과 (CONDITIONAL). 게이트 4종 재현·동적 import 격리 정확. High 2 수정 권고(머지 비차단이나 기능·그라운딩).

## 게이트 재현 (직접 실행)
| 게이트 | 결과 |
|---|---|
| tsc --noEmit | PASS (0) |
| eslint . | PASS (0) |
| vitest run | PASS — 31 files, **473 passed** |
| vite build | PASS — 2 JS 청크 |
| coverage src/llm | 94.36 stmt / 89.56 branch / 100 func (≥90/≥85 충족) |

**동적 import 격리 실측:** 엔트리 청크엔 `import(...)` 호출사이트만, 실 SDK 본체(generativelanguage 전송코드)는 lazy 청크에 격리. classify/explain은 SDK 직접 import 0·주입 LlmClient만 소비.

## High (수정 권고 — 안전 회귀 아님)
### H-1. SettingsModal 앱 미배선 — LLM/임베딩/layer-2 실사용자 도달 불가
- SettingsModal은 자기 테스트에서만 참조. App/FunnelContainer 어디에도 import·마운트·트리거 없음(grep 확인). App은 loadApiKey 읽으나 키 입력 경로 부재 → Gemini 분류·설명·crisisAnchors·layer-2 실사용자에게 영구 off. Phase 6 end-to-end UI 미완.
- 안전영향 없음(키부재=안전 degrade, planner 합격선). 그래서 High(blocker 아님).
- 수정: FunnelContainer/헤더에 설정 진입 버튼 + useState로 SettingsModal open. 위기 렌더 분기엔 미노출.

### H-2. explain 숫자 그라운딩 false-pass (SAFETY-SHARE) — explain.ts:121-133
- digit-fallback이 `normCorpus.includes(digits)` 부분문자열 매칭 → corpus의 sourceUrl 숫자(policy/123)·연령(19,34) 부분열 가진 날조 숫자 통과. `12세`(123에 12)·`3명`(34에 3)·`1년`(19에 1) 전부 pass.
- 수정: corpus를 숫자 토큰으로 분해해 **토큰 단위 정확 일치(Set 멤버십)**. URL은 숫자 추출 전 strip.

## Med/Should (defer 가능)
- M-1 explain 지역 휴리스틱 과도거부(false-reject): REGION_TOKEN_RE 단어경계 부재로 "경기 침체"/"세종대왕"/"경남친구" 부분어 오매칭→reject. 안전방향(fallback)이라 blocker 아니나 LLM 효용 저하. (safety H-3 일반화와 함께 해소)
- M-2 FreeTextInput 위기 전환 시 in-flight classify race(L60-61): 위기 분기가 reqRef bump 안 함 → stale onDomain. 현재 컨테이너 OR결합이 흡수(안전 회귀 없음). 방어적 reqRef++ 권고.
- S-3 classify 키워드 과매칭("불안정한 일자리"→불안): 현재 화이트리스트 mentalHealth 단독이라 무해. 도메인 추가 시 Low.

## Low/Nit
- crisisGuard.ts:46 미도달 방어 catch(detectCrisis throw-free). explain.ts:152 fallback title 분기 nit. App useEffect [] 1회 loadApiKey(H-1 해소 시 연계).

## SAFETY-SHARE
1. H-2 explain 숫자 false-pass(단위 동반 날조 숫자가 부분열로 통과) — 그라운딩 누수, 안전 직결.
2. (안전 양호 확인) 위기 선행 불변식 견고 — runFreeInput/FreeTextInput/detectCrisis 1층 우선, 위기시 classify/explain 호출0(CG-1~8 + 적대적). suppressGeneration 선행체크 정확. layer-2 경계·layer-1 우선 정상.
