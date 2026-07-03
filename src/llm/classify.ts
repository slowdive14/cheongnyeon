import type { LlmClient } from '../data/parseChunk';

/**
 * 자유입력 영역 분류 — 키워드 우선 → LLM fallback → degrade(null).
 *
 * 안전/제약(엄수):
 *  - 키워드 매칭이 우선. 매칭되면 LLM 미호출(비용·지연·날조 0).
 *  - 키워드 미스 + LLM 있으면 fallback. 화이트리스트 외 영역은 거부(null).
 *  - LLM 없음/throw/깨진입력 → null(degrade). throw-free.
 *  - 영역은 그래프 도메인 라우팅용. 자격·후보 판정은 절대 안 함(엔진이 SSOT).
 *
 * 위기 검사는 이 함수의 책임이 아니다 — crisisGuard가 선행으로 차단한다(순서 강제).
 */

/** 분류 가능한 영역 화이트리스트(현재 마음건강 깔때기만 라이브). */
export const DOMAIN_WHITELIST: ReadonlySet<string> = new Set(['mentalHealth']);

/** 영역별 키워드(의미 클래스, 특정 표현 과적합 회피). */
const DOMAIN_KEYWORDS: ReadonlyArray<{ domain: string; patterns: ReadonlyArray<RegExp> }> = [
  {
    domain: 'mentalHealth',
    patterns: [
      /우\s*울/,
      /번\s*아\s*웃/,
      /무\s*기\s*력/,
      /힘\s*들/,
      /지\s*쳐|지\s*친|지\s*치/,
      /불\s*안/,
      /고\s*립|은\s*둔|외\s*톨\s*이/,
      /상\s*담/,
      /마\s*음\s*이?\s*(아|힘|안)/,
      /스\s*트\s*레\s*스/,
    ],
  },
];

export type ClassifySource = 'keyword' | 'llm' | 'none';

export interface ClassifyResult {
  domain: string | null;
  source: ClassifySource;
  confidence?: number;
}

export interface ClassifyDeps {
  /** 주입된 LLM(없으면 키워드만). classify는 SDK를 직접 import하지 않는다. */
  llm?: LlmClient;
  /** 키워드 오버라이드(테스트/튜닝). 기본 = DOMAIN_KEYWORDS. */
  keywords?: ReadonlyArray<{ domain: string; patterns: ReadonlyArray<RegExp> }>;
}

const DEGRADE: ClassifyResult = { domain: null, source: 'none' };

/** 키워드 우선 매칭(동기). 매칭 영역 또는 null. */
function matchKeyword(
  text: string,
  table: ReadonlyArray<{ domain: string; patterns: ReadonlyArray<RegExp> }>,
): string | null {
  for (const { domain, patterns } of table) {
    for (const re of patterns) {
      if (re.test(text)) return domain;
    }
  }
  return null;
}

/** LLM 산출에서 화이트리스트 영역만 추출(외부 영역·날조 거부). */
function narrowLlmDomain(raw: unknown): string | null {
  if (raw === null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const d = o.domain;
  if (typeof d !== 'string' || !DOMAIN_WHITELIST.has(d)) return null;
  return d;
}

export async function classifyDomain(
  text: unknown,
  deps: ClassifyDeps = {},
): Promise<ClassifyResult> {
  // 깨진 입력 → degrade(throw 없음).
  if (typeof text !== 'string' || text.trim().length === 0) {
    return DEGRADE;
  }
  const table = deps.keywords ?? DOMAIN_KEYWORDS;

  // 1) 키워드 우선 — 매칭되면 LLM 미호출.
  const kw = matchKeyword(text, table);
  if (kw) {
    return { domain: kw, source: 'keyword', confidence: 1 };
  }

  // 2) LLM fallback(있을 때만). throw 흡수 → degrade.
  if (!deps.llm) {
    return DEGRADE;
  }
  let raw: unknown;
  try {
    raw = await deps.llm.generateStructured(buildClassifyPrompt(text), CLASSIFY_SCHEMA);
  } catch {
    return DEGRADE;
  }
  const domain = narrowLlmDomain(raw);
  if (!domain) {
    return DEGRADE;
  }
  return { domain, source: 'llm', confidence: 0.6 };
}

/** 분류 프롬프트(화이트리스트 영역만 허용 명시). */
function buildClassifyPrompt(text: string): string {
  const domains = [...DOMAIN_WHITELIST].join(', ');
  return [
    '다음 사용자 입력이 어느 정책 영역에 해당하는지 한 단어로 분류하라.',
    `허용 영역: ${domains}. 해당 없으면 domain을 null로 두라.`,
    '자격·후보 판정은 하지 마라(해석만).',
    '',
    `입력: ${text}`,
  ].join('\n');
}

/** responseSchema(geminiClient가 SDK 형식으로 변환). */
export const CLASSIFY_SCHEMA = {
  type: 'object',
  properties: {
    domain: { type: 'string', nullable: true },
  },
} as const;
