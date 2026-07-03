import { describe, it, expect } from 'vitest';
import { l2normalize } from '@/data/llm/normalize';

describe('l2normalize', () => {
  it('단위벡터화: 결과 L2 노름 = 1', () => {
    const r = l2normalize([3, 4]); // 노름 5
    expect(r[0]).toBeCloseTo(0.6);
    expect(r[1]).toBeCloseTo(0.8);
    const norm = Math.sqrt(r.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1);
  });
  it('길이 보존', () => {
    expect(l2normalize([1, 2, 3, 4]).length).toBe(4);
  });
  it('0벡터 → 0벡터(NaN 방지)', () => {
    expect(l2normalize([0, 0, 0])).toEqual([0, 0, 0]);
  });
  it('빈/비배열 → 빈 배열', () => {
    expect(l2normalize([])).toEqual([]);
    expect(l2normalize(null as unknown as number[])).toEqual([]);
  });
  it('비유한 원소 → 0으로 흡수', () => {
    const r = l2normalize([3, NaN, 4]);
    expect(r[1]).toBe(0);
    const norm = Math.sqrt(r.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1);
  });
});
