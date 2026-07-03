import { detectCrisis, type CrisisResult, type CrisisDetectDeps } from '../domain/crisisDetect';
import { classifyDomain, type ClassifyResult } from './classify';
import type { LlmClient } from '../data/parseChunk';

/**
 * 위기 선행 가드 — classify/explain보다 먼저 위기검사(순서 코드강제).
 *
 * 안전 불변식(이 프로젝트 최대 가드, 엄수):
 *  1) detectCrisis를 가장 먼저 호출. crisis면 classify/explain 일절 미실행(LLM 호출 0).
 *  2) 위기는 키/deps 무관 1층 정규식으로도 잡힘(키 없어도 작동).
 *  3) 깨진 입력에도 throw 없음. crisis=false면 classify로 진행.
 *  4) 위기어에 치료적 조언 텍스트 생성 금지(explain은 호출 자체를 안 함).
 *
 * explain은 결과 화면(정책 record 보유) 맥락에서 별도 호출되므로 여기서는 classify만 배선한다.
 * 적대적 입력("죽고싶지만 정책 알려줘")도 1층이 위기로 잡아 classify를 차단한다.
 */

export interface RunFreeInputDeps {
  /** 분류용 LLM(없으면 키워드만). */
  llm?: LlmClient;
  /** 위기 2층 의미감지 deps(앵커·embed). 미주입 시 1층 단독. */
  crisisDeps?: CrisisDetectDeps;
}

export interface RunFreeInputResult {
  crisis: CrisisResult;
  /** 비위기일 때만 채움. 위기면 undefined(미실행). */
  classify?: ClassifyResult;
  /** 자유입력 단계에서는 explain 미실행(결과 맥락 전용) → 항상 undefined. */
  explain?: undefined;
}

/**
 * 자유입력 처리 — 위기 선행 → 비위기면 classify.
 * 순서를 코드로 강제(위기검사 통과 전엔 classify 진입 불가).
 */
export async function runFreeInput(
  text: unknown,
  deps: RunFreeInputDeps = {},
): Promise<RunFreeInputResult> {
  // ── 1) 위기 선행(최우선). throw-free 방어. ──
  let crisis: CrisisResult;
  try {
    crisis = await detectCrisis(text, deps.crisisDeps);
  } catch {
    crisis = { crisis: false, layer: 'none', resources: [], suppressGeneration: false };
  }

  // 위기면 classify/explain 일절 미실행(LLM 호출 0). 안전자원만 위로.
  if (crisis.crisis) {
    return { crisis };
  }

  // ── 2) 비위기 → classify(키워드 우선 → LLM fallback → degrade). ──
  const classify = await classifyDomain(text, { llm: deps.llm });
  return { crisis, classify };
}
