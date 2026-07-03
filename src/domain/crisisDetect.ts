import type { EmbeddingProvider } from '../retrieval/types';
import { safetyResources, type SafetyResource } from './safetyResources';
import { CRISIS_PATTERNS, SEMANTIC_THRESHOLD } from './crisis/config';

/**
 * 위기 2층 감지 — 이 프로젝트 최대 안전 가드.
 *
 * 안전 불변식(엄수):
 *  1) 1층 정규식(detectCrisisRegex)은 deps 무관·동기·항상 작동(키/네트워크 없어도).
 *  2) 1층 hit이면 2층(embed) 호출 없이 즉시 반환.
 *  3) crisis=true면 resources 2건 + suppressGeneration=true.
 *  4) embed가 throw/없음이어도 1층은 보존(2층만 무력 = 의도된 degrade).
 *
 * 거짓음성(위기 놓침) 절대 불가, 거짓양성 허용. 임계 보수.
 *
 * ★현재 위기 감지는 1층 정규식 단독으로 작동한다. crisisAnchors가 production 코드에
 *  미주입(테스트 fixture 전용)이므로 2층 의미감지는 Phase 6(실벡터·임계 튜닝)까지 잠들어 있다.
 *  그 공백을 메우기 위해 고빈도 맥락 위기 표현을 1층 정규식(crisis/config.ts)으로 흡수했다(H-B).
 */

export interface CrisisResult {
  crisis: boolean;
  layer: 'regex' | 'semantic' | 'none';
  matched?: string;
  /** crisis=true면 항상 채움(안전자원 우선). */
  resources: SafetyResource[];
  /** 위기 시 AI 생성 차단. */
  suppressGeneration: boolean;
}

export interface CrisisDetectDeps {
  /** 없으면 1층만(키 없이 안전). */
  embed?: EmbeddingProvider;
  /** 의미 임계값. 기본 SEMANTIC_THRESHOLD(0.82). */
  semanticThreshold?: number;
  /** 맥락 위기 앵커 벡터(테스트=고정벡터). */
  crisisAnchors?: number[][];
}

/** 비위기 안전 결과. */
function safe(layer: 'none' = 'none'): CrisisResult {
  return { crisis: false, layer, resources: [], suppressGeneration: false };
}

/** 위기 결과(자원·suppress 항상 채움). */
function crisisHit(layer: 'regex' | 'semantic', matched: string): CrisisResult {
  return {
    crisis: true,
    layer,
    matched,
    resources: safetyResources(),
    suppressGeneration: true,
  };
}

/**
 * 1층 단독·동기·완전 무의존. 직접 위기어를 정규식으로 즉시 판정.
 * 깨진 입력(null/undefined/숫자/객체)·빈문자열 → 비위기, throw 없음.
 */
export function detectCrisisRegex(text: unknown): CrisisResult {
  if (typeof text !== 'string' || text.trim().length === 0) {
    return safe();
  }
  for (const re of CRISIS_PATTERNS) {
    const m = text.match(re);
    if (m) {
      return crisisHit('regex', m[0]);
    }
  }
  return safe();
}

/** 코사인 유사도(무의존 소형 유틸). 비유한·길이불일치는 0. */
function cosine(a: number[], b: number[]): number {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || a.length === 0) {
    return 0;
  }
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i];
    const y = b[i];
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) {
      return 0;
    }
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * 2층 감지(제공자 있을 때만 보강). text 벡터를 위기 앵커들과 코사인 비교, ≥임계면 위기.
 * embed throw/없음/앵커없음 → 비위기 none(1층은 호출부에서 이미 보존).
 */
async function detectSemantic(
  text: string,
  deps: CrisisDetectDeps,
): Promise<CrisisResult> {
  const { embed, crisisAnchors } = deps;
  if (!embed || !Array.isArray(crisisAnchors) || crisisAnchors.length === 0) {
    return safe();
  }
  const threshold =
    typeof deps.semanticThreshold === 'number' && Number.isFinite(deps.semanticThreshold)
      ? deps.semanticThreshold
      : SEMANTIC_THRESHOLD;

  let vectors: number[][];
  try {
    vectors = await embed.embed([text]);
  } catch {
    // 2층 실패 흡수(degrade) — 1층은 호출부에서 보존됨.
    return safe();
  }
  const q = Array.isArray(vectors) ? vectors[0] : undefined;
  if (!Array.isArray(q)) return safe();

  for (const anchor of crisisAnchors) {
    const sim = cosine(q, anchor);
    if (sim >= threshold) {
      return crisisHit('semantic', text);
    }
  }
  return safe();
}

/**
 * 2층 위기 감지. 1층 우선(hit이면 2층 호출 없이 즉시 반환).
 * deps 없으면 1층만으로 안전 동작(키 없이).
 */
export async function detectCrisis(
  text: unknown,
  deps?: CrisisDetectDeps,
): Promise<CrisisResult> {
  // 1층: 항상 먼저. hit이면 즉시 반환(2층/embed 호출 안 함).
  const regexResult = detectCrisisRegex(text);
  if (regexResult.crisis) {
    return regexResult;
  }
  // 1층 비위기 + deps 없으면 종료(키 없이 안전).
  if (!deps || typeof text !== 'string' || text.trim().length === 0) {
    return safe();
  }
  // 2층: 제공자 있을 때만 보강(throw/없음 흡수).
  return detectSemantic(text, deps);
}
