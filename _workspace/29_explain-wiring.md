# '왜 맞는지' 설명 카드 배선 (그라운딩 LLM 설명)

날짜: 2026-06-28 · 사용자 요청 · TDD + 브라우저(degrade) 검증

## 목표
자유입력 흐름의 마지막 조각 — 결과 카드에 "당신이 적은 내용과 이 정책이 왜 맞아 보이는지" 쉬운 말 설명.

## 배선
- `explainMatch(record, { llm })`([src/llm/explain.ts](src/llm/explain.ts))를 카드에 연결. 화이트리스트 필드만
  주입(title/summary/category/ageMin/ageMax/regionText/recruit/sourceUrl), 후처리 환각검증(입력외 URL/숫자/
  지역/정책명·자격단정 거부→fallback) 내장.
- `PolicyResultCard.usePolicyExplanation(record, llm)`: **llm 있을 때만** explain 호출. 없으면 미표시 →
  결정적 게이트(키 0)에서 비동기 0(act 경고 없음). 위기 시 카드 미렌더라 crisis suppress 불필요.
- llm 스레딩: App → FunnelContainer → ResultList → PolicyResultCard.
- UI: 카드에 '왜 맞을까요' 설명 블록(sky 톤) + 로딩 스켈레톤("살펴보는 중…").

## 안전
- 그라운딩: 입력 record 밖 사실/지역/숫자/URL·자격단정 → isGrounded 거부 → 안전 fallback 문구('추정' 톤).
- 자격은 엔진 SSOT — LLM 설명은 관련성만, 판정 단정 불가(테스트로 확인).

## 검증
- 유닛: llm 그라운딩 통과 → 설명 표시 / 입력외 '강남구' 환각 → fallback(원문 확인, '강남구' 미노출).
- 브라우저(키 없음): 결과 카드 정상 렌더 + 설명 미표시(degrade) + 콘솔 에러 0.
- 게이트: 567 passed · tsc 0 · eslint 0 · coverage ui/funnel branches 88.6% 충족.

## 비용 주의
- 키 있을 때 렌더 카드마다 generateStructured 1회(병렬). 결과셋 작아 MVP 허용. 다수 결과 시 상위 N개 한정
  최적화는 후속.
