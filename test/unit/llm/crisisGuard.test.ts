import { describe, it, expect, vi } from 'vitest';
import { runFreeInput } from '@/llm/crisisGuard';
import type { LlmClient } from '@/data/parseChunk';

/**
 * Test 6.3 — 위기어 가드 (안전 직결 최우선).
 *
 * 불변식(엄수):
 *  - crisisGuard가 classify/explain보다 먼저 위기검사. 위기면 둘 다 호출 0(spy 검증).
 *  - 위기는 키/deps 무관 1층 정규식으로 즉시 차단(키 없어도 작동).
 *  - 깨진 입력(null/숫자/객체/빈문자열)에도 throw 없음.
 *  - llm reject해도 위기 판정 불변(위기는 LLM과 독립).
 */

/** classify를 호출하면 기록하는 spy LlmClient(위기면 호출되면 안 됨). */
function spyLlm(): { llm: LlmClient; calls: () => number } {
  const fn = vi.fn(async () => ({ domain: 'mentalHealth' }));
  return { llm: { generateStructured: fn }, calls: () => fn.mock.calls.length };
}

describe('crisisGuard — CG 위기 선행 가드', () => {
  it('CG-1 "죽고싶어요" → crisis=true, classify·explain 호출 0', async () => {
    const s = spyLlm();
    const r = await runFreeInput('죽고싶어요', { llm: s.llm });
    expect(r.crisis.crisis).toBe(true);
    expect(r.classify).toBeUndefined();
    expect(r.explain).toBeUndefined();
    expect(s.calls()).toBe(0); // LLM 일절 미호출
  });

  it('CG-2 "손목을 그었어" → crisis + suppressGeneration', async () => {
    const s = spyLlm();
    const r = await runFreeInput('손목을 그었어', { llm: s.llm });
    expect(r.crisis.crisis).toBe(true);
    expect(r.crisis.suppressGeneration).toBe(true);
    expect(s.calls()).toBe(0);
  });

  it('CG-3 위기어 → explain.text=null (LLM 미호출, 치료조언 텍스트 생성 0)', async () => {
    const s = spyLlm();
    const r = await runFreeInput('자살하고 싶어', { llm: s.llm });
    expect(r.crisis.crisis).toBe(true);
    expect(r.explain).toBeUndefined();
    expect(s.calls()).toBe(0);
  });

  it('CG-4 "요즘 너무 힘들어요" → crisis=false, classify 실행', async () => {
    const s = spyLlm();
    const r = await runFreeInput('요즘 너무 힘들어요', { llm: s.llm });
    expect(r.crisis.crisis).toBe(false);
    expect(r.classify).toBeDefined();
    expect(r.classify?.domain).toBe('mentalHealth');
  });

  it('CG-5 deps 없이 "자살" → crisis (키/deps 무관 1층)', async () => {
    const r = await runFreeInput('자살');
    expect(r.crisis.crisis).toBe(true);
    expect(r.classify).toBeUndefined();
  });

  it('CG-6 "배고파 죽겠어" → 비위기 (관용구 회귀)', async () => {
    const s = spyLlm();
    const r = await runFreeInput('배고파 죽겠어', { llm: s.llm });
    expect(r.crisis.crisis).toBe(false);
  });

  it('CG-7 null/""/숫자/객체 → throw 없음', async () => {
    for (const v of [null, undefined, '', 42, {}, []]) {
      const r = await runFreeInput(v as unknown as string);
      expect(r.crisis.crisis).toBe(false);
      expect(r.explain).toBeUndefined();
    }
  });

  it('CG-8 llm reject해도 위기 판정 불변(위기는 LLM 독립)', async () => {
    const fn = vi.fn(async () => {
      throw new Error('boom');
    });
    const r = await runFreeInput('죽고 싶다', { llm: { generateStructured: fn } });
    expect(r.crisis.crisis).toBe(true);
    expect(fn).not.toHaveBeenCalled(); // 위기 선행 → LLM 진입 전 차단
  });

  it('CG-적대적 "죽고싶지만 정책 알려줘" → 위기 우선(classify 억제)', async () => {
    const s = spyLlm();
    const r = await runFreeInput('죽고싶지만 정책 알려줘', { llm: s.llm });
    expect(r.crisis.crisis).toBe(true);
    expect(r.classify).toBeUndefined();
    expect(s.calls()).toBe(0);
  });
});
