/**
 * parseChunk — LLM 해석으로 정책 원문을 구조화 자격 + 3청크로 변환한다.
 *
 * 안전 핵심(보수성 — auditor 최우선 사전 공유):
 *  - 누락 · null · 스키마외값 · LLM reject · 빈 입력 → 반드시 UNKNOWN (throw 금지).
 *  - incomeCriterion 누락/null → {kind:'UNKNOWN'} (절대 none 아님). L3 vs L9.
 *  - kind:'none' 명시일 때만 none.
 *  - LLM은 해석만. 후보·자격 판정은 Phase 3 엔진. 여기선 구조화 + 보수 폴백만.
 */

/** LLM 클라이언트 인터페이스. 실 Gemini는 이 뒤에(src/data/llm/geminiClient.ts). */
export interface LlmClient {
  generateStructured(prompt: string, schema?: unknown): Promise<unknown>;
}

export type TriState = 'required' | 'not_required' | 'UNKNOWN';
export type DupState = 'allowed' | 'disallowed' | 'UNKNOWN';
export type IncomeKind = 'medianRatio' | 'amountMax' | 'none' | 'UNKNOWN';

export interface ParsedIncomeCriterion {
  kind: IncomeKind;
  value?: number;
  raw: string | null;
}

export interface ParsedQualification {
  householdSeparation: TriState;
  incomeCriterion: ParsedIncomeCriterion;
  duplicateParticipation: DupState;
}

export interface ParseChunks {
  purpose: string | null;
  eligibility: string | null;
  application: string | null;
}

export interface ParseResult {
  qualification: ParsedQualification;
  chunks: ParseChunks;
}

export interface ParseChunkDeps {
  llm: LlmClient;
}

/** 모든 필드 UNKNOWN + 청크 null인 안전 기본값. */
function safeResult(): ParseResult {
  return {
    qualification: {
      householdSeparation: 'UNKNOWN',
      incomeCriterion: { kind: 'UNKNOWN', raw: null },
      duplicateParticipation: 'UNKNOWN',
    },
    chunks: { purpose: null, eligibility: null, application: null },
  };
}

const HOUSEHOLD_VALUES: ReadonlySet<string> = new Set(['required', 'not_required']);
const DUP_VALUES: ReadonlySet<string> = new Set(['allowed', 'disallowed']);
const INCOME_KINDS: ReadonlySet<string> = new Set(['medianRatio', 'amountMax', 'none']);

export async function parseChunk(
  policyText: unknown,
  deps: ParseChunkDeps,
): Promise<ParseResult> {
  // L8: 빈/null/비문자열 입력 → LLM 미호출 안전 UNKNOWN.
  if (typeof policyText !== 'string' || policyText.trim().length === 0) {
    return safeResult();
  }

  let raw: unknown;
  try {
    raw = await deps.llm.generateStructured(buildPrompt(policyText));
  } catch {
    // L5: LLM reject → 전 UNKNOWN + 청크 null (throw 흡수, 흐름 단절 금지).
    return safeResult();
  }

  if (raw === null || typeof raw !== 'object') {
    return safeResult();
  }
  const o = raw as Record<string, unknown>;

  return {
    qualification: {
      householdSeparation: narrowTri(o.householdSeparation),
      incomeCriterion: narrowIncome(o.incomeCriterion),
      duplicateParticipation: narrowDup(o.duplicateParticipation),
    },
    chunks: narrowChunks(o.chunks),
  };
}

/** Phase 2 mock 계약용 프롬프트(실 responseSchema는 GeminiClient 뒤). */
function buildPrompt(policyText: string): string {
  return `다음 청년정책 원문을 구조화하라(자격·목적·신청). 불명은 UNKNOWN.\n\n${policyText}`;
}

function narrowTri(v: unknown): TriState {
  return typeof v === 'string' && HOUSEHOLD_VALUES.has(v) ? (v as TriState) : 'UNKNOWN';
}

function narrowDup(v: unknown): DupState {
  return typeof v === 'string' && DUP_VALUES.has(v) ? (v as DupState) : 'UNKNOWN';
}

/**
 * 소득 기준 좁히기. L3 vs L9 핵심:
 *  - null/누락/비객체/스키마외 → {kind:'UNKNOWN'} (none 아님).
 *  - kind:'none' 명시 → none 보존.
 *  - medianRatio/amountMax는 value가 유한수일 때만 value 채택.
 */
function narrowIncome(v: unknown): ParsedIncomeCriterion {
  if (v === null || typeof v !== 'object') {
    return { kind: 'UNKNOWN', raw: null };
  }
  const o = v as Record<string, unknown>;
  const rawText = typeof o.raw === 'string' ? o.raw : null;

  if (typeof o.kind !== 'string' || !INCOME_KINDS.has(o.kind)) {
    return { kind: 'UNKNOWN', raw: rawText };
  }
  const kind = o.kind as Exclude<IncomeKind, 'UNKNOWN'>;

  if (kind === 'none') {
    return { kind: 'none', raw: rawText };
  }

  // medianRatio / amountMax → value 필수(유한수). 없으면 보수적으로 UNKNOWN.
  const value = typeof o.value === 'number' && Number.isFinite(o.value) ? o.value : null;
  if (value === null) {
    return { kind: 'UNKNOWN', raw: rawText };
  }
  return { kind, value, raw: rawText };
}

function narrowChunks(v: unknown): ParseChunks {
  if (v === null || typeof v !== 'object') {
    return { purpose: null, eligibility: null, application: null };
  }
  const o = v as Record<string, unknown>;
  return {
    purpose: typeof o.purpose === 'string' ? o.purpose : null,
    eligibility: typeof o.eligibility === 'string' ? o.eligibility : null,
    application: typeof o.application === 'string' ? o.application : null,
  };
}
