import { describe, it, expect, vi } from 'vitest';
import { buildCrisisAnchors, CRISIS_ANCHOR_PHRASES } from '@/llm/crisisAnchors';
import type { EmbeddingProvider } from '@/retrieval/types';
import { detectCrisis } from '@/domain/crisisDetect';
import type { CrisisDetectDeps } from '@/domain/crisisDetect';

/**
 * RED-4 — layer-2 활성화. crisisAnchors 빌더 + 2층 의미감지 경계.
 *
 * 불변식:
 *  - provider 있으면 앵커>0. 없음/throw → [](layer-2 잠금, layer-1 불변).
 *  - 완곡 위기(정규식 미스) + 앵커≥임계 → crisis, layer=semantic.
 *  - 직접 위기어 + embed → layer=regex(2층 호출 0; layer-1 우선 불변).
 *  - 임계 0.82 경계: 0.81 비위기 / 0.82·0.83 위기.
 */

/** 각 앵커를 [1,0]으로 흉내내는 embed mock(코사인=query[0]). */
function anchorEmbed(): EmbeddingProvider {
  return { embed: vi.fn(async (texts: string[]) => texts.map(() => [1, 0])) };
}

/** query 벡터로 sim 고정([sim, sqrt(1-sim^2)]) + 앵커 [1,0]. */
function simEmbed(sim: number): EmbeddingProvider {
  const q = [sim, Math.sqrt(Math.max(0, 1 - sim * sim))];
  return { embed: vi.fn(async () => [q]) };
}

const ANCHORS_FIXED = [[1, 0]];
function semanticDeps(sim: number): CrisisDetectDeps {
  return { embed: simEmbed(sim), crisisAnchors: ANCHORS_FIXED, semanticThreshold: 0.82 };
}

describe('crisisAnchors — CA 빌더', () => {
  it('CA-1 provider 있음 → 앵커 > 0 (앵커 문구 수만큼)', async () => {
    const anchors = await buildCrisisAnchors({ embed: anchorEmbed() });
    expect(Array.isArray(anchors)).toBe(true);
    expect(anchors.length).toBeGreaterThan(0);
    expect(anchors.length).toBe(CRISIS_ANCHOR_PHRASES.length);
    expect(Array.isArray(anchors[0])).toBe(true);
  });

  it('CA-2 provider 없음 → [] (layer-2 잠금)', async () => {
    const anchors = await buildCrisisAnchors({});
    expect(anchors).toEqual([]);
  });

  it('CA-3 provider throw → [] (layer-1 불변, throw 없음)', async () => {
    const embedFn = vi.fn(async (): Promise<number[][]> => {
      throw new Error('boom');
    });
    const anchors = await buildCrisisAnchors({ embed: { embed: embedFn } });
    expect(anchors).toEqual([]);
  });

  it('CA-3b embed가 깨진 벡터(비배열) 반환 → 안전 필터', async () => {
    const embedFn = vi.fn(async () => 'not-array' as unknown as number[][]);
    const anchors = await buildCrisisAnchors({ embed: { embed: embedFn } });
    expect(anchors).toEqual([]);
  });
});

describe('crisisAnchors — CA 2층 의미감지 경계', () => {
  it('CA-4 완곡 "더는 아무 의미가 없는 것 같아"(정규식 미스) + 앵커≥임계 → semantic 위기', async () => {
    const r = await detectCrisis('더는 아무 의미가 없는 것 같아', semanticDeps(0.9));
    expect(r.crisis).toBe(true);
    expect(r.layer).toBe('semantic');
  });

  it('CA-5 맥락 위기 "다 부질없게 느껴져" + 앵커≥임계 → semantic', async () => {
    const r = await detectCrisis('다 부질없게 느껴져', semanticDeps(0.85));
    expect(r.crisis).toBe(true);
    expect(r.layer).toBe('semantic');
  });

  it('CA-6 임계 근처 0.82 → 위기편향(보수)', async () => {
    const r = await detectCrisis('요즘 다 흐릿하게 느껴져', semanticDeps(0.82));
    expect(r.crisis).toBe(true);
    expect(r.layer).toBe('semantic');
  });

  it('CA-7 직접 위기어 "죽고 싶다" + embed 주입 → layer=regex (2층 호출 0)', async () => {
    const embedFn = vi.fn(async () => [[1, 0]]);
    const r = await detectCrisis('죽고 싶다', { embed: { embed: embedFn }, crisisAnchors: ANCHORS_FIXED });
    expect(r.crisis).toBe(true);
    expect(r.layer).toBe('regex'); // 1층 우선
    expect(embedFn).not.toHaveBeenCalled(); // 2층 미진입
  });

  it('CA-8 layer-1 전체 회귀: 직접 위기어는 embed 있어도 여전히 regex', async () => {
    const cases = ['자살', '손목을 그었어', '없어지고 싶어', '다 끝내고 싶다'];
    for (const text of cases) {
      const embedFn = vi.fn(async () => [[1, 0]]);
      const r = await detectCrisis(text, { embed: { embed: embedFn }, crisisAnchors: ANCHORS_FIXED });
      expect(r.crisis).toBe(true);
      expect(r.layer).toBe('regex');
      expect(embedFn).not.toHaveBeenCalled();
    }
  });

  it('CA-9 경계: sim 0.81 비위기 / 0.82·0.83 위기 (정규식 미스 입력)', async () => {
    const TWO_LAYER = '더는 아무 의미가 없는 것 같아';
    expect((await detectCrisis(TWO_LAYER, semanticDeps(0.81))).crisis).toBe(false);
    expect((await detectCrisis(TWO_LAYER, semanticDeps(0.82))).crisis).toBe(true);
    expect((await detectCrisis(TWO_LAYER, semanticDeps(0.83))).crisis).toBe(true);
  });
});
