import { describe, it, expect, vi } from 'vitest';
import { classifyDomain } from '@/llm/classify';
import type { LlmClient } from '@/data/parseChunk';

/**
 * Test 6.1 — 자유입력 영역 분류 (키워드 우선 → LLM fallback → degrade).
 *
 * 불변식:
 *  - 키워드 매칭 시 LLM 미호출(source=keyword).
 *  - 모호 + LLM 있으면 fallback(source=llm). LLM 없음/throw → null(degrade).
 *  - 화이트리스트 외 영역은 거부(null). 깨진 입력 throw-free.
 *  - 위기 입력 차단은 classify가 아니라 crisisGuard 책임(여기선 분류만).
 */

function llmDomain(domain: unknown): { llm: LlmClient; fn: ReturnType<typeof vi.fn> } {
  const fn = vi.fn(async () => ({ domain }));
  return { llm: { generateStructured: fn }, fn };
}

describe('classify — CL 영역 분류', () => {
  it('CL-1 키워드 매칭 → mentalHealth, source=keyword, LLM 미호출', async () => {
    for (const text of ['우울해요', '번아웃이 왔어요', '너무 힘들어요']) {
      const { llm, fn } = llmDomain('mentalHealth');
      const r = await classifyDomain(text, { llm });
      expect(r.domain).toBe('mentalHealth');
      expect(r.source).toBe('keyword');
      expect(fn).not.toHaveBeenCalled();
    }
  });

  it('CL-2 모호 입력 + LLM mock → source=llm', async () => {
    const { llm, fn } = llmDomain('mentalHealth');
    const r = await classifyDomain('요새 마음이 좀 그래요', { llm });
    expect(r.domain).toBe('mentalHealth');
    expect(r.source).toBe('llm');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('CL-3 모호 + LLM 없음 → null/degrade', async () => {
    const r = await classifyDomain('어제 뭐 했더라', {});
    expect(r.domain).toBeNull();
    expect(r.source).toBe('none');
  });

  it('CL-4 LLM throw → null/degrade, throw 없음', async () => {
    const fn = vi.fn(async () => {
      throw new Error('boom');
    });
    const r = await classifyDomain('알 수 없는 모호 문장', { llm: { generateStructured: fn } });
    expect(r.domain).toBeNull();
    expect(r.source).toBe('none');
  });

  it('CL-5 화이트리스트 외 영역(LLM이 엉뚱 영역 반환) → null', async () => {
    const { llm } = llmDomain('crypto');
    const r = await classifyDomain('모호한 문장입니다', { llm });
    expect(r.domain).toBeNull();
    expect(r.source).toBe('none');
  });

  it('CL-6 깨진 입력(null/숫자/객체/빈) → null, throw 없음', async () => {
    for (const v of [null, undefined, '', '   ', 42, {}, []]) {
      const r = await classifyDomain(v as unknown as string, {});
      expect(r.domain).toBeNull();
      expect(r.source).toBe('none');
    }
  });

  it('CL-7 LLM이 null domain 반환 → null/degrade(디바운스 취소류 안전)', async () => {
    const { llm } = llmDomain(null);
    const r = await classifyDomain('모호 입력', { llm });
    expect(r.domain).toBeNull();
  });

  it('CL-8 키워드 우선 — 위기 비포함 일반 입력은 즉시 keyword (LLM 차단)', async () => {
    const { llm, fn } = llmDomain('mentalHealth');
    const r = await classifyDomain('고립된 느낌이에요', { llm });
    expect(r.source).toBe('keyword');
    expect(fn).not.toHaveBeenCalled();
  });
});
