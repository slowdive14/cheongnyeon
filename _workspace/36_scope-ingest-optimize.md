# 인제스트 최적화 — 동시성 풀 + 배치 임베딩

날짜: 2026-06-28 · 전량 인제스트 현실화 · TDD + 라이브 측정

## 변경 (`src/data/ingest.ts`)
- step6 재구성: **순차 → (6a) parseChunk·설명 동시성 풀 + (6b) 임베딩 배치 + (6c) 순서보존 조립.**
- `IngestEmbedder.embed`: 단건 → **배치**(`(texts) => (number[]|null)[]`, provider가 ≤100/콜 분할).
- `mapPool(items, limit, fn)` 동시성 헬퍼(in-place, 출력 items 순서 보존 → 결정성 유지).
- `safeEmbedMany`(throw-free, 순서정합). `IngestDeps.concurrency`(기본 12).
- 스크립트: 배치 embedder 배선, `INGEST_CONCURRENCY`(기본12)·`INGEST_PARSE=off`(청크 LLM 생략) 플래그.

## 결정성·안전
- 출력 순서 = seoul 순서(items.map) → 동시성에도 결정적. reparsed=filter(reparse).length(경합 없음).
- 증분(reparse만 재계산, 결손 backfill)·throw 흡수(설명/임베딩 누락이 적재 비차단) 보존.

## 측정 (라이브, 200건, 임시 LocalJson)
- 200건 적재 · 벡터 1536d 200 · **200초 = 1.0초/건**(conc 12) → **2,633건 ≈ 44분.** 순차 추정(~3~4h) 대비 ~4~5×.
- 1.0초/건은 Gemini 티어 RPM 한도에 묶인 값(동시성↑해도 429 가능). 비용은 사소(~$1).
- 더 빠르게: `INGEST_PARSE=off`(flash 2→1콜/건 → ~25~30분), 또는 상위 티어 RPM.

## 게이트
- 테스트 **602 passed (37 files)** · tsc 0 · eslint 0. 배치 embedder·throw흡수 회귀 테스트 추가.

## 다음
- 운영자 `npm run ingest`(~44분, conc/parse 플래그로 조절) → Supabase 전량 적재.
- **C3**: 앱 재배선(Edge Function 검색 + 클라 자격/위기/렌더). (데이터 적재와 독립 — 먼저 짤 수 있음)
