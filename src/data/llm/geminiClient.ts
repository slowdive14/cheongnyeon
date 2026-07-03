import type { LlmClient } from '../parseChunk';

/**
 * Gemini 클라이언트 — LlmClient 인터페이스 뒤의 실 구현.
 *
 * 안전/제약(엄수):
 *  - Gemini는 해석·질문·설명만. 후보·자격 판정은 엔진(Phase 3). 설명 그라운딩은 explain.ts.
 *  - GEMINI_API_KEY 미설정 → createDisabledLlmClient()(키워드 폴백). 계약 불변.
 *  - 실 SDK(@google/genai)는 동적 import로 격리 → 키 없으면 미로드.
 *    SDK 미설치/오프라인이어도 키 없는 test/build/tsc는 무조건 그린(동적 import).
 *  - responseSchema로 구조화 산출 강제. 그라운딩(정책 record 주입)은 호출자(explain/classify)가
 *    프롬프트에 화이트리스트 필드만 담아 책임진다.
 *
 * ★실 SDK 호출 경로(loadModel/generateStructured 내부 import)는 키 있는 환경에서만 실행되고
 *  결정적 게이트(키 0개)에서는 미도달 → 커버리지 제외(vitest exclude + istanbul ignore).
 */

export interface GeminiClientOptions {
  apiKey?: string;
  model?: string;
}

// gemini-3.5-flash(GA Stable): 구형 gemini-2.0-flash는 2026-06-01 셧다운(404),
// gemini-2.5-flash도 2026-06-17 셧다운. 해석·질문·설명 전용(후보·자격 판정 아님).
const DEFAULT_MODEL = 'gemini-3.5-flash';

/** 키 없을 때 사용하는 비활성 LLM(항상 빈 객체 → 호출자가 보수적으로 폴백). */
export function createDisabledLlmClient(): LlmClient {
  return {
    async generateStructured(): Promise<unknown> {
      // LLM off: 구조화 산출 없음 → 호출자(classify/explain/parseChunk)가 degrade.
      return {};
    },
  };
}

/* c8 ignore start -- 실 SDK 동적 import 경로: 키 있는 환경 전용, 결정적 게이트 미도달. */

/** SDK 모델 핸들 로드(동적 import 격리). 실패 시 throw → 호출자가 흡수. */
async function loadModel(apiKey: string) {
  const { GoogleGenAI } = await import('@google/genai');
  return new GoogleGenAI({ apiKey });
}

/** responseSchema(우리 JSON 스키마)를 SDK config로 전달해 구조화 산출 강제. */
function buildConfig(schema?: unknown): Record<string, unknown> {
  const config: Record<string, unknown> = { responseMimeType: 'application/json' };
  if (schema && typeof schema === 'object') {
    config.responseSchema = schema;
  }
  return config;
}

/** 실 응답 텍스트를 JSON으로 파싱(실패 흡수 → {}). */
function parseJson(text: unknown): unknown {
  if (typeof text !== 'string' || text.trim().length === 0) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

/* c8 ignore stop */

/**
 * 실 Gemini 클라이언트 팩토리.
 *  - 키 없으면 disabled(불변). 키 있으면 동적 import로 실 SDK 연결.
 *  - generateStructured는 throw-free 계약을 지키지 않는다(호출자 parseChunk/classify/explain이
 *    이미 try/catch로 흡수). 단 SDK 로드 실패도 흡수해 {} 반환으로 degrade 보장.
 */
export function createGeminiClient(opts: GeminiClientOptions = {}): LlmClient {
  if (!opts.apiKey) {
    return createDisabledLlmClient();
  }
  const apiKey = opts.apiKey;
  const model = opts.model ?? DEFAULT_MODEL;

  return {
    /* c8 ignore start -- 실 SDK 호출: 키 있는 환경 전용. */
    async generateStructured(prompt: string, schema?: unknown): Promise<unknown> {
      try {
        const ai = await loadModel(apiKey);
        const res = await ai.models.generateContent({
          model,
          contents: prompt,
          config: buildConfig(schema),
        });
        return parseJson(res?.text);
      } catch {
        // SDK 로드/호출 실패 → degrade(호출자가 보수적으로 폴백).
        return {};
      }
    },
    /* c8 ignore stop */
  };
}
