import { describe, it, expect } from 'vitest';
import { createGeminiClient, createDisabledLlmClient } from '@/data/llm/geminiClient';

/**
 * geminiClient — 키 게이트 계약(실 네트워크 0).
 *
 * 불변식:
 *  - 키 없으면 createDisabledLlmClient()와 동일 동작({} 반환 → 호출자 degrade).
 *  - disabled 클라이언트는 throw 없이 {} 반환.
 *  - 실 SDK 동적 import 경로는 키 있는 환경 전용(여기선 미도달, 호출 안 함).
 */

describe('geminiClient — 키 게이트', () => {
  it('키 없음 → disabled 동작({} 반환, throw 없음)', async () => {
    const c = createGeminiClient({});
    const r = await c.generateStructured('아무 프롬프트');
    expect(r).toEqual({});
  });

  it('apiKey undefined 명시 → disabled', async () => {
    const c = createGeminiClient({ apiKey: undefined });
    expect(await c.generateStructured('x')).toEqual({});
  });

  it('createDisabledLlmClient → 항상 {} (스키마 무관)', async () => {
    const c = createDisabledLlmClient();
    expect(await c.generateStructured('x', { type: 'object' })).toEqual({});
  });
});
