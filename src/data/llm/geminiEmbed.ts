import type { EmbeddingProvider } from '../../retrieval/types';
import { MAX_EMBED_BATCH, splitIntoBatches } from './batch';
import { l2normalize } from './normalize';

/**
 * Gemini 임베딩 제공자 — 색인·위기 2층 앵커용 벡터 생성.
 *
 * 안전/제약(엄수):
 *  - 키 없으면 undefined 반환(미주입) → 색인 vector=null·crisisAnchors=[](layer-2 잠금).
 *    layer-1(정규식 위기) 및 키워드 색인은 키 무관 항상 작동(degrade 보호).
 *  - 실 SDK(@google/genai)는 동적 import로 격리 → 키 없으면 미로드. SDK 미설치/오프라인이어도
 *    키 없는 게이트는 무조건 그린.
 *  - embed는 throw 가능(호출부 buildCrisisAnchors/embed가 흡수).
 *
 * ★실 SDK 호출 경로는 키 있는 환경 전용 → 결정적 게이트 미도달(커버리지 제외).
 */

// gemini-embedding-001(GA): 구형 text-embedding-004는 2026-01-14 셧다운(404). 차원 3072.
// 색인/질의/위기앵커가 모두 동일 provider를 쓰므로 코사인 정합은 차원과 무관하게 보장.
const DEFAULT_EMBED_MODEL = 'gemini-embedding-001';

export interface GeminiEmbedOptions {
  apiKey?: string;
  model?: string;
  /** 출력 차원(Matryoshka 축소). 지정 시 그 차원으로 받고 L2 정규화. 미지정=모델 기본(3072). */
  outputDimensionality?: number;
}

/* c8 ignore start -- 실 SDK 임베딩 경로: 키 있는 환경 전용, 결정적 게이트 미도달. */

/** 키 있으면 실 임베딩 제공자, 없으면 undefined(layer-2 잠금·키워드 degrade). */
export function createGeminiEmbeddingProvider(
  opts: GeminiEmbedOptions = {},
): EmbeddingProvider | undefined {
  if (!opts.apiKey) return undefined;
  const apiKey = opts.apiKey;
  const model = opts.model ?? DEFAULT_EMBED_MODEL;
  const dim = opts.outputDimensionality;
  const config = typeof dim === 'number' && dim > 0 ? { outputDimensionality: dim } : undefined;

  return {
    async embed(texts: string[]): Promise<number[][]> {
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey });
      // batchEmbedContents 한계(≤100/요청) — 정책 수백 건은 분할해 순서 보존 임베딩.
      // ★배치별 회복력: 한 배치 실패가 전체를 null로 만들지 않게(부분 성공 보존, 실패분은 다음 run 백필).
      const out: number[][] = [];
      for (const batch of splitIntoBatches(texts, MAX_EMBED_BATCH)) {
        let vals: number[][] = [];
        // 1회 재시도(일시 429/네트워크 흡수). 실패 시 해당 배치만 빈 벡터.
        for (let attempt = 0; attempt < 2; attempt += 1) {
          try {
            const res = await ai.models.embedContent({ model, contents: batch, config });
            const embeddings = res?.embeddings ?? [];
            vals = embeddings.map((e) => (Array.isArray(e?.values) ? e.values : []));
            break;
          } catch {
            if (attempt === 0) await new Promise((r) => setTimeout(r, 1500));
            else vals = [];
          }
        }
        // 입력 수만큼 정합(부족/실패분은 빈 벡터 → 호출부 null 처리). 축소 차원은 정규화(코사인 일관성).
        for (let k = 0; k < batch.length; k += 1) {
          const v = Array.isArray(vals[k]) ? vals[k]! : [];
          out.push(config && v.length > 0 ? l2normalize(v) : v);
        }
      }
      return out;
    },
  };
}

/* c8 ignore stop */
