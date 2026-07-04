import { describe, it, expect, vi } from 'vitest';
import { isRetryableRateLimit, withRateLimitRetry } from '@/data/llm/geminiClient';

/**
 * Gemini 레이트리밋 재시도 — 대량 배치 후반 요청이 429로 폴백되던 문제(D-② 커버리지) 해소.
 * RPM(429/RESOURCE_EXHAUSTED/quota)만 백오프 재시도, 크레딧 소진·기타 오류는 즉시 전파.
 */

describe('isRetryableRateLimit', () => {
  it('RPM 초과류는 재시도 대상', () => {
    expect(isRetryableRateLimit(new Error('429 Too Many Requests'))).toBe(true);
    expect(isRetryableRateLimit(new Error('RESOURCE_EXHAUSTED'))).toBe(true);
    expect(isRetryableRateLimit(new Error('Quota exceeded for quota metric'))).toBe(true);
    expect(isRetryableRateLimit({ status: 429, message: 'rate limit' })).toBe(true);
  });

  it('크레딧 소진·결제는 재시도 안 함(회복 불가)', () => {
    expect(isRetryableRateLimit(new Error('Your prepayment credits are depleted.'))).toBe(false);
    expect(isRetryableRateLimit(new Error('429 billing credit depleted'))).toBe(false);
  });

  it('일반 오류·null은 재시도 안 함', () => {
    expect(isRetryableRateLimit(new Error('network down'))).toBe(false);
    expect(isRetryableRateLimit(null)).toBe(false);
    expect(isRetryableRateLimit('timeout')).toBe(false);
  });
});

describe('withRateLimitRetry', () => {
  const noSleep = vi.fn(async () => {});

  it('첫 성공 → 재시도·sleep 0', async () => {
    const fn = vi.fn(async () => 'ok');
    const r = await withRateLimitRetry(fn, { sleep: noSleep });
    expect(r).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(noSleep).not.toHaveBeenCalled();
  });

  it('429 두 번 후 성공 → 백오프 재시도 후 반환', async () => {
    const sleep = vi.fn(async () => {});
    let n = 0;
    const fn = vi.fn(async () => {
      n += 1;
      if (n <= 2) throw new Error('429 RESOURCE_EXHAUSTED');
      return 'done';
    });
    const r = await withRateLimitRetry(fn, { sleep, baseDelayMs: 1 });
    expect(r).toBe('done');
    expect(fn).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('재시도 불가 오류 → 즉시 전파(sleep 0)', async () => {
    const sleep = vi.fn(async () => {});
    const fn = vi.fn(async () => {
      throw new Error('credits depleted');
    });
    await expect(withRateLimitRetry(fn, { sleep })).rejects.toThrow(/credits/);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('maxRetries 소진 → 마지막 오류 전파', async () => {
    const sleep = vi.fn(async () => {});
    const fn = vi.fn(async () => {
      throw new Error('429 rate limit');
    });
    await expect(
      withRateLimitRetry(fn, { sleep, maxRetries: 3, baseDelayMs: 1 }),
    ).rejects.toThrow(/429/);
    expect(fn).toHaveBeenCalledTimes(4); // 최초 1 + 재시도 3
  });
});
