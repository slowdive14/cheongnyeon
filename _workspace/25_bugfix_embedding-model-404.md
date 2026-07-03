# 버그 수정 — 임베딩 모델 폐기 404 (안전 직결)

날짜: 2026-06-25 · 모드: 부분 소집(인라인 TDD, 5인 팀 풀가동 생략 — 한 줄 안전 복원 + 순수 헬퍼)

## 증상
- 브라우저 콘솔: `Failed to load resource: the server responded with a status of 404`
- "분석이 안 돼". 실행: `npm run dev` + Gemini API 키 입력됨.

## 근본 원인 (검증 완료)
- 데이터는 정적 번들(`App.tsx` `import policiesJson`) → fetch 404 불가. 유일 네트워크 = Gemini API.
- `src/data/llm/geminiEmbed.ts`의 `DEFAULT_EMBED_MODEL = 'text-embedding-004'` → 이 모델은 **2026-01-14 셧다운**.
  generativelanguage v1beta가 `models/text-embedding-004 is not found` 404 반환. (웹 검증)
- 부차: `batchEmbedContents`는 **요청당 ≤100건**(웹 검증). 정책 474건을 1회 배치로 보내 400 유발 →
  모델명만 고쳐도 정책 시맨틱 색인은 또 실패할 latent 버그(폐기 전에도 동일하게 키워드 degrade 중이었을 것).

## 안전 영향
- 이 임베딩 경로는 **위기 감지 2층 의미앵커(`buildCrisisAnchors`, 8문구)** + **정책 시맨틱 색인**을 구동.
- 404 시 try/catch로 흡수돼 키워드로 degrade되지만 **위기 2층이 조용히 OFF** → 안전 직결. 본 수정은 2층 복원.

## 수정 (RED→GREEN→REFACTOR)
1. `src/data/llm/geminiEmbed.ts`: 모델명 `text-embedding-004` → `gemini-embedding-001`(GA, 3072차원).
2. `src/data/llm/batch.ts` 신규(순수): `splitIntoBatches(items, size)` + `MAX_EMBED_BATCH=100`. 순서 보존 분할.
3. `geminiEmbed.embed()`: 배치 루프로 ≤100건씩 임베딩, 순서대로 concat(인덱스 정합 유지).
4. `test/unit/llm/batch.test.ts` 신규: 빈입력·경계(=100)·초과(474→5배치)·size<=0 방어·상수 범위. RED 확인 후 GREEN.
5. `docs/plans/PLAN_youth-policy-diagnosis-mvp.md:76` 모델명·배치 한계 갱신.

## 차원 변경(768→3072) 안전성
- 벡터는 매 세션 재계산(영속 색인 없음). 색인·질의·위기앵커가 **동일 provider** 사용 → 코사인 정합 차원 무관.
- 코드 내 하드코딩 차원 가정 없음(grep 확인). 마이그레이션 불필요.

## degrade 불변식 점검 (safety, 인라인)
- layer-1 정규식 위기: 임베딩과 독립 → 불변(코드 미접촉). ✅
- 임베딩 throw 흡수: `buildCrisisAnchors`→`[]`(2층만 잠금), `retrieval/embed`→키워드 색인. 불변. ✅
- 배치 중간 실패: for-loop가 throw 전파 → 상위 try/catch가 흡수 → 부분 벡터 누수 없이 전량 키워드 degrade. ✅
- 빈 입력: 이제 호출 자체 생략(빈 contents 요청 제거) → 더 안전. ✅
- 근거: 위기/검색 안전 테스트 포함 전체 559 테스트 GREEN.

## 게이트 결과
- 단위/통합 테스트: **559 passed (33 files)**
- tsc -b: exit 0 · eslint(변경 파일): 0 issue · vite build: exit 0
- coverage: All files 93.97% stmts / 87.21% branch — threshold 위반 없음(신규 `batch.ts`는 `geminiEmbed.ts`와 달리 exclude 아님 → 분할 로직 전 분기 커버).

## 사용자 확인 필요(런타임)
- 실 SDK 경로는 키 환경 전용(c8 ignore)이라 결정적 게이트 미도달. dev 서버에서 키 입력 후 분석 1회 돌려
  콘솔 404 사라짐 + (키 유효 시) 시맨틱 색인 동작을 사용자 측 최종 확인 권장.

---

## 후속(2차 404) — 생성 모델 셧다운

사용자 제공 실제 404 URL: `generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent` → 404.
임베딩(1차)과 별개로 **LLM 생성 모델**도 폐기됨.

- 원인: `src/data/llm/geminiClient.ts`의 `DEFAULT_MODEL='gemini-2.0-flash'`. **gemini-2.0-flash는 2026-06-01 셧다운**(404).
  gemini-2.5-flash도 2026-06-17 셧다운(둘 다 "Previous models / Shut down"). (웹·공식 모델 문서 검증)
- 수정: `DEFAULT_MODEL` → **`gemini-3.5-flash`**(현재 GA Stable). 임베딩 `gemini-embedding-001`은 GA 유지.
- 영향: 이 모델은 explain/classify(해석·질문·설명)만. 후보·자격 판정 아님(엔진 담당) → 그라운딩 계약 불변.
  404 시에도 generateStructured는 `{}` 반환 degrade(키워드 폴백)라 안전 불변식 동일.
- 게이트: 559 passed · tsc 0 · eslint 0 · vite build 성공.

> 교훈: Google이 Gemini 모델을 주기적으로 셧다운(2.0=6/1, 2.5=6/17). 모델 ID는 코드 상수 1곳씩
> (`geminiClient.ts`/`geminiEmbed.ts`)에 격리돼 있어 교체는 한 줄. 404 재발 시 최신 GA로 동일 교체.
