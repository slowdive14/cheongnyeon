import { describe, it, expect } from 'vitest';
import { splitIntoBatches, MAX_EMBED_BATCH } from '@/data/llm/batch';

/**
 * splitIntoBatches — 임베딩 배치 분할(순수).
 *
 * 불변식:
 *  - Gemini batchEmbedContents 요청당 최대 100건 → 색인 대상(수백 건)을 한계 이하로 쪼갠다.
 *  - 순서·원소 보존(flatten === 원본). 인덱스 정합이 깨지면 벡터-문서 매핑이 어긋난다.
 *  - size<=0/빈 입력 방어(무한루프·빈 호출 금지).
 */
describe('splitIntoBatches — 임베딩 배치 분할', () => {
  it('빈 배열 → 빈 배열(임베딩 호출 자체를 건너뛴다)', () => {
    expect(splitIntoBatches([], 100)).toEqual([]);
  });

  it('size 이하 → 단일 배치', () => {
    expect(splitIntoBatches([1, 2, 3], 100)).toEqual([[1, 2, 3]]);
  });

  it('정확히 size → 단일 배치(경계)', () => {
    const items = Array.from({ length: 100 }, (_, i) => i);
    const out = splitIntoBatches(items, 100);
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(100);
  });

  it('size 초과 → 순서 보존 분할(마지막 부분 배치 포함)', () => {
    const items = Array.from({ length: 474 }, (_, i) => i);
    const out = splitIntoBatches(items, 100);
    expect(out).toHaveLength(5);
    expect(out.map((b) => b.length)).toEqual([100, 100, 100, 100, 74]);
    // 순서·원소 보존 — flatten이 원본과 동일해야 벡터-문서 인덱스 정합이 유지된다.
    expect(out.flat()).toEqual(items);
  });

  it('size<=0 방어 → 전체를 단일 배치로(무한루프 방지)', () => {
    expect(splitIntoBatches([1, 2, 3], 0)).toEqual([[1, 2, 3]]);
    expect(splitIntoBatches([1, 2, 3], -5)).toEqual([[1, 2, 3]]);
  });

  it('MAX_EMBED_BATCH는 1~100(batchEmbedContents 하드 한계)', () => {
    expect(MAX_EMBED_BATCH).toBeGreaterThan(0);
    expect(MAX_EMBED_BATCH).toBeLessThanOrEqual(100);
  });
});
