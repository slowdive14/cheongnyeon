import type { LlmClient } from '../data/parseChunk';
import type { CrisisResult } from '../domain/crisisDetect';

/**
 * 결과 설명(혜택 한 줄, D-②) — 정책 record 주입 그라운딩 + 후처리 환각검증.
 *  질의 무관·정책별 고정(인제스트 precompute). 프롬프트 목적은 "이 정책이 무엇을 도와주는지"(혜택 요약).
 *  자격 판정·관련성 단정이 아니라 정책이 제공하는 혜택만 담담히 서술한다(가드는 아래 불변식 유지).
 *
 * 안전 불변식(엄수):
 *  1) 화이트리스트 필드만 프롬프트에 주입(title/summary/category/ageMin/ageMax/
 *     regionText/recruit/sourceUrl). 내부 id/raw 등은 절대 미주입.
 *  2) suppressGeneration=true(위기) → LLM 호출 0, text=null.
 *  3) 후처리 환각검증: 입력 record에 없는 URL/숫자/정책명/자격단정 → 거부 → fallback.
 *  4) 자격은 엔진이 SSOT. LLM은 자격을 뒤집지 못함(자격 단정 텍스트 거부).
 *  5) LLM 없음/throw/타임아웃/깨진 record → fallback. throw-free.
 *  6) '추정' 톤 유지(단정 회피). 검증 통과한 설명만 grounded=true.
 */

/** explain에 주입 가능한 화이트리스트 필드(이 외 필드는 절대 안 보냄). */
export interface GroundingRecord {
  title?: string | null;
  summary?: string | null;
  category?: string | null;
  ageMin?: number | null;
  ageMax?: number | null;
  regionText?: string | null;
  recruit?: string | null;
  sourceUrl?: string | null;
}

const WHITELIST_FIELDS: ReadonlyArray<keyof GroundingRecord> = [
  'title',
  'summary',
  'category',
  'ageMin',
  'ageMax',
  'regionText',
  'recruit',
  'sourceUrl',
];

export interface ExplainDeps {
  llm?: LlmClient;
  /** 위기 결과. suppressGeneration=true면 호출 0·null. */
  crisis?: CrisisResult;
}

export type ExplainSource = 'llm' | 'fallback';

export interface ExplainResult {
  text: string | null;
  grounded: boolean;
  source: ExplainSource;
}

/**
 * 자격 판정단정 의미클래스 — 합격∪탈락 양방향 차단(S2/H-2 + 잔여-H2).
 *  자격은 엔진 SSOT. LLM 설명이 판정을 단정하면(합격이든 탈락이든) 거부한다.
 *  표현 나열이 아니라 "수혜/판정 동사 + 단정"의 의미클래스로 흡수한다(과적합 회피).
 *
 *  ① 적격성 판정어(적격/부적격/제외/수급/수혜/선정/당첨/포함/대상/해당/자격) + 단정 어미
 *     (됩/돼/된/입니/포함/제외/빠지/아니/없/안 됨). 합격·탈락 단정 모두.
 *  ② 수령 판정: (받|지원받) + (지/을)? + 수? + (없|있|못) — "받을 수 없"·"받지 못"·
 *     "받으실 수 없"·"지원받지 못"까지. ('될 수 있다'는 받 동사 아님 → 미매칭, 관련성 표현 보존)
 *  ③ 확률 단정: 가능성 + (높|큽|충분) — 선정·수령 확률을 단정.
 *  ④ 확신어: 확실히/무조건/반드시/보장.
 *
 *  과차단 가드: "도움이 될 수 있어요"·"관련이 있어 보여요"·"신청해 보시면 좋아요"는 판정어·
 *  수령동사·확률·확신어가 없어 미매칭(grounded 유지). 완화형 "받을 수도 있어요"는 '수도'(조사)로
 *  수령 판정 분기를 벗어나 미매칭.
 */
// 판정 명사(그 자체가 적격/선정/수령 결정을 가리킴). 단정 어미와 결합 시 거부.
const VERDICT_TERMS =
  '적\\s*격|부\\s*적\\s*격|제\\s*외|수\\s*급|수\\s*혜|수\\s*령|선\\s*정|당\\s*첨|탈\\s*락|누\\s*락|포\\s*함|대\\s*상|해\\s*당|자\\s*격';
// 단정 어미(판정을 사실로 못박는 종결). 안내·관련성 표현("확인해 보세요")은 포함하지 않는다.
const VERDICT_VERDICTS =
  '[됩돼된입]|이\\s*에|예\\s*요|하\\s*셨|했\\s*습|불\\s*가|포\\s*함|제\\s*외|빠\\s*[지진집]|아\\s*[니닌님닙녀]|없|안\\s*[됩돼되]|되\\s*지\\s*않|않\\s*[습아어]';

const ASSERTION_PATTERNS: ReadonlyArray<RegExp> = [
  // ① 판정 명사 + 단정 어미(합격·탈락 양방향). "부적격입니다"·"탈락하셨습니다"·"수령 불가" 흡수.
  new RegExp(`(${VERDICT_TERMS})[^.]{0,8}(${VERDICT_VERDICTS})`),
  // ②-a 수령 판정: 받/지원받 + (지|을)? 수? + (없|있|못). "받지 못"·"받을 수 없"·"받으실 수 있/없".
  /(지\s*원\s*)?받\s*[으을지]?\s*[실지]?\s*(수\s*)?(없|있|못)/,
  // ②-b 부정어 양방향: "못 받"(선행)·"받지 못"(후행) 모두 수령 부정 단정.
  /못\s*받|받[^.]{0,3}못\s*[합한해]/,
  // ③ 확률 단정.
  /가\s*능\s*성\s*이?\s*(높|큽|충\s*분)/,
  // ④ 확신어.
  /확\s*실\s*히/,
  /반\s*드\s*시\s*(받|지급|선정|가능)/,
  /무\s*조\s*건/,
  /보\s*장\s*(합|됩|돼)/,
];

/**
 * 행정구역 토큰 일반 클래스(S3/H-3 + M-1) — 광역/기초 단위(시·군·구·도) 일반 추출.
 *  화이트리스트(17 광역) 대신 "1~4자 한글 + 행정접미사 + 단어경계"로 일반화.
 *  record corpus(regionText 등)에 없는 행정구역이 등장하면 다른 지역 정책 날조로 거부.
 *  단어경계 `(?![가-힣])`로 "경기 침체"·"세종대왕"·"구하다" 등 비행정 어휘는 미매칭(M-1).
 *  접미사 뒤가 한글로 이어지면 합성어(대왕/침체)로 보고 행정구역 토큰에서 제외.
 */
//  접미사 뒤가 공백·문장끝·조사(은/는/이/가/을/를/에/의/로/만/도)면 행정구역으로 본다.
//  뒤가 다른 한글(구청/구하다/대왕/침체 등 합성·동사)이면 비행정 → 미매칭(M-1 과도거부 방지).
//  "도"는 조사(수도/이도) 충돌이 커 머리어 2자 이상만 인정(경기도/강원도/충청도).
//  시·군·구는 1자 머리도 허용(중구/수원시/강남구). 광역 접미사는 우선 매칭(서울특별시).
const REGION_SUFFIX = /(특별자치시|특별자치도|특별시|광역시|시|군|구|도)$/;
const REGION_TOKEN_RE =
  /([가-힣]{2,3}도|[가-힣]{1,3}(?:특별자치시|특별자치도|특별시|광역시|시|군|구))(?=\s|$|[은는이가을를에의로만도]|[.,!?])/g;

/** URL 추출(http/https). */
const URL_RE = /https?:\/\/[^\s)>"']+/gi;
/** 의미 단위 동반 숫자 추출(금액·연령·인원·기간·비율). */
const NUMBER_RE = /\d[\d,]*\s*(만\s*원|원|만|%|세|명|개월|년)/g;
/** corpus 내 정수 토큰 추출(정확 일치 집합 구성용). */
const CORPUS_DIGIT_RE = /\d[\d,]*/g;

/** 텍스트를 정규화(공백·구두점 제거)해 부분 포함 비교용으로. */
function norm(s: string): string {
  return s.replace(/[\s,.·]/g, '');
}

/** corpus의 정수 토큰 집합(콤마 제거). S4 정확 일치용. */
function corpusDigitSet(corpus: string): Set<string> {
  const set = new Set<string>();
  const matches = corpus.match(CORPUS_DIGIT_RE) ?? [];
  for (const m of matches) {
    const d = m.replace(/,/g, '');
    if (d.length > 0) set.add(d);
  }
  return set;
}

/** record 화이트리스트 값들을 모은 그라운딩 텍스트(검증 기준). */
function groundingCorpus(record: GroundingRecord): string {
  const parts: string[] = [];
  for (const k of WHITELIST_FIELDS) {
    const v = record?.[k];
    if (typeof v === 'string' && v.trim()) parts.push(v.trim());
    else if (typeof v === 'number' && Number.isFinite(v)) parts.push(String(v));
  }
  return parts.join(' ');
}

/** 환각검증: 설명이 record 근거를 벗어나지 않는가. */
function isGrounded(text: string, record: GroundingRecord): boolean {
  if (typeof text !== 'string' || text.trim().length === 0) return false;

  // (a) 자격 단정 → 즉시 거부(엔진 SSOT 침범).
  for (const re of ASSERTION_PATTERNS) {
    if (re.test(text)) return false;
  }

  const corpus = groundingCorpus(record);
  const normCorpus = norm(corpus);

  // (a2) 입력외 행정구역(시·군·구·도) → 거부(다른 지역 정책 날조). 단어경계로 합성어 배제(M-1).
  let rm: RegExpExecArray | null;
  REGION_TOKEN_RE.lastIndex = 0;
  while ((rm = REGION_TOKEN_RE.exec(text)) !== null) {
    const full = rm[1] ?? ''; // 예: "강남구", "수원시", "서울특별시", "경기도"
    const head = full.replace(REGION_SUFFIX, ''); // 예: "강남", "수원", "서울", "경기"
    // corpus에 전체 토큰 또는 머리어가 있으면 grounded 지역(서울/서울특별시)으로 허용.
    if (normCorpus.includes(norm(full)) || (head && normCorpus.includes(norm(head)))) continue;
    return false;
  }

  // (b) 입력외 URL → 거부. (숫자 검사 전에 URL 제거 — URL 속 숫자 오탐 방지.)
  const urls = text.match(URL_RE) ?? [];
  for (const u of urls) {
    if (!normCorpus.includes(norm(u))) return false;
  }
  const textNoUrl = text.replace(URL_RE, ' ');

  // (c) 입력외 숫자(의미 단위 동반) → 거부. corpus 정수 토큰 집합과 정확 일치만 허용(S4).
  const digitSet = corpusDigitSet(corpus);
  const nums = textNoUrl.match(NUMBER_RE) ?? [];
  for (const raw of nums) {
    const digits = raw.replace(/[^\d]/g, '');
    if (digits.length === 0) continue;
    // 부분문자열이 아닌 정확 토큰 일치(예: corpus 19/34 → "12"는 거부, "19세"는 허용).
    if (!digitSet.has(digits)) return false;
  }

  return true;
}

/** LLM 산출에서 text 추출(스키마 방어). */
function extractText(raw: unknown): string | null {
  if (typeof raw === 'string') return raw;
  if (raw && typeof raw === 'object') {
    const t = (raw as Record<string, unknown>).text;
    if (typeof t === 'string') return t;
  }
  return null;
}

/** record 기반 안전 fallback 문구('추정' 톤, 단정 0). LLM 미사용. */
function fallbackText(record: GroundingRecord): string | null {
  const title = typeof record?.title === 'string' && record.title.trim() ? record.title.trim() : null;
  if (!title) {
    return '입력하신 상황과 관련된 정책으로 추정돼요. 원문에서 자격 조건을 확인해 주세요.';
  }
  return `${title} 정책과 관련이 있어 보여요. 자세한 자격 조건은 원문에서 확인해 주세요. (추정)`;
}

export async function explainMatch(
  record: GroundingRecord,
  deps: ExplainDeps = {},
): Promise<ExplainResult> {
  // ── 1) 위기 억제(최우선). suppressGeneration=true → 호출 0·null. ──
  if (deps.crisis?.suppressGeneration === true) {
    return { text: null, grounded: false, source: 'fallback' };
  }

  const safeRecord: GroundingRecord =
    record && typeof record === 'object' ? record : {};

  // ── 2) LLM 없음 → 안전 fallback. ──
  if (!deps.llm) {
    return { text: fallbackText(safeRecord), grounded: false, source: 'fallback' };
  }

  // ── 3) LLM 호출(화이트리스트만 주입). throw/타임아웃 흡수. ──
  let raw: unknown;
  try {
    raw = await deps.llm.generateStructured(buildExplainPrompt(safeRecord), EXPLAIN_SCHEMA);
  } catch {
    return { text: fallbackText(safeRecord), grounded: false, source: 'fallback' };
  }

  const text = extractText(raw);
  // ── 4) 후처리 환각검증. 실패 → fallback(LLM 텍스트 폐기). ──
  if (text === null || !isGrounded(text, safeRecord)) {
    return { text: fallbackText(safeRecord), grounded: false, source: 'fallback' };
  }

  return { text: text.trim(), grounded: true, source: 'llm' };
}

/** 화이트리스트 필드만 라벨링해 프롬프트 구성(그라운딩). */
function buildExplainPrompt(record: GroundingRecord): string {
  const labels: Record<keyof GroundingRecord, string> = {
    title: '정책명',
    summary: '요약',
    category: '분류',
    ageMin: '연령 하한',
    ageMax: '연령 상한',
    regionText: '지역',
    recruit: '모집',
    sourceUrl: '원문 링크',
  };
  const lines: string[] = [];
  for (const k of WHITELIST_FIELDS) {
    const v = record?.[k];
    if (typeof v === 'string' && v.trim()) lines.push(`${labels[k]}: ${v.trim()}`);
    else if (typeof v === 'number' && Number.isFinite(v)) lines.push(`${labels[k]}: ${v}`);
  }
  return [
    '아래 정책 정보만 사용해, 이 정책이 "무엇을 도와주는지(핵심 혜택)"를 한 문장으로 담담히 요약하라.',
    '규칙(엄수):',
    '- 정책이 무엇을 "지원·제공"하는지 서술하라. 예: "월세 일부를 지원해요", "심리상담 비용을 도와줘요".',
    '- 아래 정보에 없는 사실·숫자·금액·링크·다른 정책명을 절대 만들지 마라.',
    '- 신청 자격·수령 여부를 단정하지 마라("받을 수 있어요", "자격이 됩니다", "대상입니다", "확실히", "무조건" 금지).',
    '  자격은 별도 엔진이 판정한다. 설명은 정책이 주는 혜택만 담는다.',
    '- 한 문장, 40자 내외, 쉽고 따뜻한 말로.',
    '',
    '[정책 정보]',
    ...lines,
  ].join('\n');
}

export const EXPLAIN_SCHEMA = {
  type: 'object',
  properties: {
    text: { type: 'string' },
  },
} as const;
