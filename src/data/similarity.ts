/**
 * 공용 유사도·정규화 — coverage와 ingest의 "2차 키(정규화명+기관 ≥0.85)" 산식을 1곳으로 통일.
 *
 * 드리프트 방지: 임계 상수와 쌍 유사도 산식이 양 모듈에서 동일해야 한다(같은 입력 → 같은 결과).
 * 자체 구현(신규 직접 의존성 금지): Jaccard(토큰) + 정규화 Levenshtein의 max.
 *
 * 안전: false merge 금지. ≥0.85는 '자동 동일'이 아니라 '수동검증 후보'. 정규화 키 완전 동일(==1)만 자동 동일.
 */

/** 2차 키 유사도 임계(이상이면 수동검증 후보). 단일 진실원. */
export const SIMILARITY_THRESHOLD = 0.85;

/** 기관명 동의어 정규화 맵(서울 변형 통합). */
const ORG_SYNONYMS: ReadonlyArray<readonly [RegExp, string]> = [
  [/서울특별시/g, '서울'],
  [/서울시/g, '서울'],
];

/**
 * 정책명/기관명 정규화. 법인 표기((재)/(사)/(주)/(법인))만 제거, 기관 동의어 통합,
 * 공백·기호 제거(한글·영숫자만 남김). 깨진 입력(비문자열)은 빈 문자열.
 */
export function normalizeName(name: unknown): string {
  if (typeof name !== 'string') return '';
  let s = name;
  s = s.replace(/[(（]\s*(재|사|주|법인)\s*[)）]/g, '');
  for (const [re, to] of ORG_SYNONYMS) {
    s = s.replace(re, to);
  }
  s = s.replace(/[^0-9A-Za-z가-힣]/g, '');
  return s;
}

/**
 * 문자열 유사도 = max(Jaccard 토큰, 정규화 Levenshtein). 0~1.
 * 토큰화: 공백 분리(재배열 강건성). 빈 양쪽=1, 한쪽만 빈=0.
 */
export function similarity(a: string, b: string): number {
  const sa = typeof a === 'string' ? a : '';
  const sb = typeof b === 'string' ? b : '';
  return Math.max(jaccard(sa, sb), normalizedLevenshtein(sa, sb));
}

/**
 * 쌍 유사도(정규화명+기관). 단일 산식 — coverage·ingest 공용.
 *  - 정규화 키(명|기관)가 완전 동일(빈 키 제외) → 1 (자동 동일 후보).
 *  - 그 외 → 명 유사도와 기관 유사도의 평균(둘 다 보수적으로 반영).
 */
export function pairSimilarity(
  nameA: string,
  orgA: string,
  nameB: string,
  orgB: string,
): number {
  const nnA = normalizeName(nameA);
  const noA = normalizeName(orgA);
  const nnB = normalizeName(nameB);
  const noB = normalizeName(orgB);
  const keyA = `${nnA}|${noA}`;
  const keyB = `${nnB}|${noB}`;
  // 빈 키(명·기관 모두 비어 정규화 결과가 '|')는 유사도 판정 불가 → 0(빈 깨진 레코드 오매칭 방지).
  if (keyA === '|' || keyB === '|') return 0;
  if (keyA === keyB) return 1;
  // 정규화 후 유사도(동의어·공백·기호 차이를 흡수). 명·기관 평균(둘 다 보수적으로 반영).
  const nameSim = similarity(nnA, nnB);
  const orgSim = similarity(noA, noB);
  return (nameSim + orgSim) / 2;
}

function tokenize(s: string): string[] {
  return s
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

function jaccard(a: string, b: string): number {
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  if (ta.size === 0 && tb.size === 0) return a === b ? 1 : 0;
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** 정규화 Levenshtein = 1 - dist/maxLen. 공백 무시(연속 비교). */
function normalizedLevenshtein(a: string, b: string): number {
  const ca = a.replace(/\s+/g, '');
  const cb = b.replace(/\s+/g, '');
  if (ca.length === 0 && cb.length === 0) return 1;
  const dist = levenshtein(ca, cb);
  const maxLen = Math.max(ca.length, cb.length);
  return maxLen === 0 ? 1 : 1 - dist / maxLen;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j += 1) prev[j] = j;
  for (let i = 1; i <= m; i += 1) {
    curr[0] = i;
    const ai = a[i - 1];
    for (let j = 1; j <= n; j += 1) {
      const cost = ai === b[j - 1] ? 0 : 1;
      const del = (prev[j] ?? 0) + 1;
      const ins = (curr[j - 1] ?? 0) + 1;
      const sub = (prev[j - 1] ?? 0) + cost;
      curr[j] = Math.min(del, ins, sub);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n] ?? 0;
}
