import seoulFixture from './__fixtures__/seoul-native.sample.json';
import { isMentalHealthTitle } from '../domain/parse/mentalHealth';

/**
 * 서울 청년몽땅정보통 클라이언트 — 받기(fetch)·파싱 격리 계층.
 *
 * B0 정찰(_workspace/40_B0_recon.md) 근거:
 *  - 목록: `/infoData/plcyInfo/ctList.do`(서울시, tabKind=001) · `/infoData/plcyInfo/guList.do`(자치구, tabKind=003).
 *    서버렌더 HTML, 고정 5건/페이지, eGovFrame 페이지네이션(pageIndex).
 *  - 상세: `/infoData/plcyInfo/view.do?plcyBizId={key}` — dt/dd 구조(자격 필드 = 온통청년 동일 스키마).
 *  - 목록 항목 키 2종: `V…`(청년몽땅 자체 편집 정책) vs 20자리 숫자(온통청년 유입 = 우리 DB `id`와 동일).
 *    → **숫자-ID는 원천 제외**(온통청년 중복 0), V-접두만 수집.
 *
 * 안전/결정성:
 *  - 기본(no opts) → 빈 배열(파이프라인 무영향). `fixture:true` → 소규모 고정 샘플(테스트).
 *    `live:true` → 실 크롤(fetchImpl 주입 가능, 예의상 지연·UA 부착).
 *  - 개별 항목 실패는 흡수(throw 금지)해 단일 실패가 전체 적재를 절단하지 않게 한다.
 *  - 원문 링크는 청년몽땅 상세(view.do)를 정본으로 — 항상 존재·안정.
 *  - ⚠️ 라이선스: 공공누리 표기 미확인(_recon §4). 공개 배포 전 이용약관 확인은 운영자 책임.
 */

export interface SeoulClient {
  fetchAll(): Promise<unknown[]>;
}

export interface SeoulClientOptions {
  /** true면 실 크롤(원격). 미설정 → 수집 안 함(빈 배열). */
  live?: boolean;
  /** true면 라이브 대신 소규모 고정 샘플 반환(테스트·오프라인). */
  fixture?: boolean;
  /** fetch 주입(테스트·격리). 기본 globalThis.fetch. */
  fetchImpl?: typeof fetch;
  /** 베이스 URL. 기본 청년몽땅. */
  baseUrl?: string;
  /** 목록 안전 상한 페이지 수(탭별, 기본 80 = 400건). */
  maxPages?: number;
  /** 요청 간 지연(ms) — 예의상 레이트리밋. 기본 300. 테스트는 0. */
  requestDelayMs?: number;
}

const DEFAULT_BASE_URL = 'https://youth.seoul.go.kr';
const UA =
  'Mozilla/5.0 (compatible; cheongnyeon-ingest/1.0; +https://youth.seoul.go.kr) policy-aggregator';

/** 서울 목록 탭(엔드포인트 + tabKind). */
const SEOUL_TABS: { endpoint: string; tabKind: string }[] = [
  { endpoint: 'infoData/plcyInfo/ctList.do', tabKind: '001' }, // 서울시
  { endpoint: 'infoData/plcyInfo/guList.do', tabKind: '003' }, // 자치구
];

export function createSeoulClient(opts: SeoulClientOptions = {}): SeoulClient {
  if (opts.fixture === true) {
    return { async fetchAll() { return (seoulFixture as unknown[]).slice(); } };
  }
  if (opts.live !== true) {
    // 기본: 수집 안 함(파이프라인 무영향). 라이브는 명시적 opt-in.
    return { async fetchAll() { return []; } };
  }

  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  const maxPages = opts.maxPages ?? 80;
  const delayMs = opts.requestDelayMs ?? 300;

  return {
    async fetchAll(): Promise<unknown[]> {
      // 1) 목록 크롤 → V-접두 키 수집(중복 제거).
      const seen = new Set<string>();
      const collected: { key: string; title: string }[] = [];
      for (const tab of SEOUL_TABS) {
        let emptyStreak = 0;
        for (let page = 1; page <= maxPages; page += 1) {
          const url = `${baseUrl}/${tab.endpoint}?pageIndex=${page}&tabKind=${tab.tabKind}`;
          const html = await safeGet(fetchImpl, url);
          const allItems = parseSeoulListItems(html);
          if (allItems.length === 0) {
            emptyStreak += 1;
            if (emptyStreak >= 2) break; // 연속 빈 페이지 → 탭 종료.
          } else {
            emptyStreak = 0;
          }
          const items = allItems.filter((it) => isSeoulNativeKey(it.key));
          for (const it of items) {
            if (!seen.has(it.key)) {
              seen.add(it.key);
              collected.push(it);
            }
          }
          await sleep(delayMs);
        }
      }

      // 2) 상세 크롤 → dt/dd 파싱 → 어댑팅(개별 실패 흡수).
      const out: unknown[] = [];
      for (const { key, title } of collected) {
        const url = seoulDetailUrl(key, baseUrl);
        const html = await safeGet(fetchImpl, url);
        const fields = parseSeoulDetail(html);
        out.push(adaptSeoulItem({ key, title, fields, baseUrl }));
        await sleep(delayMs);
      }
      return out;
    },
  };
}

/** GET(UA 부착) — 실패·비200은 빈 문자열(throw 금지, 흐름 절단 방지). */
async function safeGet(fetchImpl: typeof fetch, url: string): Promise<string> {
  try {
    const res = await fetchImpl(url, { headers: { 'User-Agent': UA } });
    return await res.text();
  } catch {
    return '';
  }
}

function sleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();
}

/**
 * 목록 HTML → {key, title}[]. 항목은 `onclick="goView('KEY');">TITLE</a>` 형태.
 * 파싱 불가/빈 입력은 빈 배열(throw 금지).
 */
export function parseSeoulListItems(html: string): { key: string; title: string }[] {
  if (typeof html !== 'string' || html.length === 0) return [];
  const items: { key: string; title: string }[] = [];
  const re = /goView\('([^']+)'\)\s*;?\s*"[^>]*>([^<]+)</g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const key = (m[1] ?? '').trim();
    const title = decodeEntities((m[2] ?? '').trim());
    if (key.length > 0 && title.length > 0) items.push({ key, title });
  }
  return items;
}

/**
 * 청년몽땅 자체 정책 키인가(수집 대상).
 *  - 순수 숫자(20자리) = 온통청년 유입(우리 DB `id`와 동일) → **제외**(중복).
 *  - 문자 접두(`V`=자체 편집, `R`=서울 원천 등록 정책, 그 외 문자 접두) = 서울 자체 → **수집**.
 *
 * (정정 2026-07-04: 초기엔 V-접두만 수집해 R-접두 서울 원천 정책 294건을 통째로 놓쳤다.
 *  숫자키만 제외하는 방식으로 교정 — 서울시+자치구 순증 ≈280건 확보.)
 */
export function isSeoulNativeKey(key: string): boolean {
  if (typeof key !== 'string') return false;
  const k = key.trim();
  return k.length > 0 && !/^\d+$/.test(k);
}

/**
 * 상세 HTML → 라벨→값 맵. `<dt>라벨</dt><dd>값</dd>`·`<th>…</th><td>…</td>` 쌍 추출.
 * 태그 제거·엔티티 복원·공백 정리. 라벨은 공백 제거 정규화 키로 저장(조회 견고).
 */
export function parseSeoulDetail(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof html !== 'string' || html.length === 0) return out;
  const clean = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');
  const re = /<(dt|th)[^>]*>([\s\S]*?)<\/\1>\s*<(dd|td)[^>]*>([\s\S]*?)<\/\3>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean)) !== null) {
    const label = stripTags(m[2] ?? '');
    const value = stripTags(m[4] ?? '');
    const norm = normalizeLabel(label);
    if (norm.length > 0 && norm.length < 40 && !(norm in out)) {
      out[norm] = value;
    }
  }
  return out;
}

/** 라벨 정규화 — 모든 공백 제거(조회 키 안정화). */
function normalizeLabel(s: string): string {
  return s.replace(/\s+/g, '');
}

/** 여러 라벨 후보를 정규화 매칭해 첫 비어있지 않은 값 반환. */
function field(fields: Record<string, string>, ...labels: string[]): string | undefined {
  for (const l of labels) {
    const v = fields[normalizeLabel(l)];
    if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  }
  return undefined;
}

/**
 * 신청기간 텍스트 → {start,end} ISO. "2026. 5. 27.(수) 10:00 ~ 2026. 5. 29.(금) 16:00" 등
 * 공백·구두점 섞인 'YYYY. M. D'를 관대하게 추출한다. 미매칭은 null.
 */
export function seoulRecruitDates(text: string | undefined): { start: string | null; end: string | null } {
  if (typeof text !== 'string') return { start: null, end: null };
  const re = /(\d{4})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})/g;
  const found: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null && found.length < 2) {
    const y = m[1]!;
    const mo = String(Number(m[2])).padStart(2, '0');
    const d = String(Number(m[3])).padStart(2, '0');
    found.push(`${y}-${mo}-${d}`);
  }
  return { start: found[0] ?? null, end: found[1] ?? null };
}

/**
 * 서울 모집창 도출 — 신청기간 우선, 불명 시 사업운영기간 종료일을 보조 마감 신호로.
 *  1) 신청기간 날짜 있음 → dated(그 기간). (신청기간은 엄격 파서만 — 거친 파싱 개입 없음)
 *  2) 신청기간이 상시/수시/연중 → '상시'(억제 안 함).
 *  3) 사업운영기간 폴백:
 *     - full-date 쌍(seoulRecruitDates)으로 end 도출되면 그대로.
 *     - 미도출 시 거친(coarse) 종료일 도출(연.월 말일·연도만·한쪽 물결). 끝 열린 물결은 종료일 없음.
 *  4) 그 외 → 미설정(unknown, 보수 노출).
 */
export function deriveSeoulRecruit(
  applyText: string | undefined,
  operationText: string | undefined,
): { startText?: string; endText?: string; text?: string } {
  const apply = seoulRecruitDates(applyText);
  if (apply.start !== null || apply.end !== null) {
    return { startText: apply.start ?? undefined, endText: apply.end ?? undefined };
  }
  if (typeof applyText === 'string' && /상시|수시|연중/.test(applyText)) {
    return { text: '상시' };
  }
  const op = seoulRecruitDates(operationText);
  if (op.end !== null) {
    return { startText: op.start ?? undefined, endText: op.end };
  }
  // 운영기간 폴백: full-date 쌍이 없더라도 거친 종료일을 시도(연.월/연도만/한쪽 물결).
  const coarseEnd = coarseOperationEnd(operationText);
  if (coarseEnd !== null) {
    return { endText: coarseEnd };
  }
  return {};
}

/** 종료부 분리에 쓰는 물결 문자군(ASCII `~`·전각 `～`·변형 `∼`·`〜`). */
const TILDE_CHARS = '~～∼〜';
const TILDE_SPLIT_RE = new RegExp(`[${TILDE_CHARS}]`);

/**
 * 사업운영기간 텍스트 → 거친(coarse) 종료일 ISO(없으면 null). 신청기간엔 절대 쓰지 않는다.
 *  - 물결(`~`·전각 `～`·변형 `∼`·`〜`) 있으면 **뒤쪽 종료부만** 해석. 없으면 전체를 하나의 기간으로.
 *  - 세그먼트 내 매칭은 **last-match**(더 늦은 날짜) — `-` 구분자 기간("2023. 3. - 2023. 12.")도
 *    분할 없이 뒤쪽(종료) 연.월이 잡힌다. 시작월을 종료로 오인해 활성 사업을 은폐하는 사고 방지.
 *  - 연.월.일 → 그 날짜. 연.월 → 그 달 말일(윤년 정확). 연도만 → '상반기' 06-30, 그 외 12-31.
 *  - 끝 열린 물결("2026. 5. ~") → null(마감 처리 금지, 진행 중 사업 오은폐 방지).
 *  - 연도 유효 범위 2000~2099만 인정, `\d{4}`가 더 긴 숫자열 일부면 배제(전화번호·금액 오탐 차단).
 *  - 결정성: 시계 미사용 — 텍스트→텍스트 변환만.
 */
function coarseOperationEnd(text: string | undefined): string | null {
  if (typeof text !== 'string') return null;
  const tilde = text.search(TILDE_SPLIT_RE);
  // 물결 있으면 종료부(뒤쪽)만, 없으면 전체를 종료 구간으로.
  const endPart = tilde >= 0 ? text.slice(tilde + 1) : text;
  return coarseEndFromSegment(endPart);
}

/** 정규식 전역 매칭 중 isPlausibleYear를 통과하는 **마지막**(더 늦은) 것을 반환. */
function lastPlausibleMatch(segment: string, source: string): RegExpExecArray | null {
  const re = new RegExp(source, 'g');
  let last: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(segment)) !== null) {
    if (isPlausibleYear(segment, m)) last = m;
    if (m.index === re.lastIndex) re.lastIndex += 1; // 빈 매칭 방어(무한루프 차단).
  }
  return last;
}

/** 단일 구간 문자열 → 거친 종료일 ISO(없으면 null). 각 형식마다 last-match(뒤쪽) 우선. */
function coarseEndFromSegment(segment: string): string | null {
  // 연.월.일 (일까지) 우선.
  const full = lastPlausibleMatch(segment, '(\\d{4})\\s*[.\\-/]\\s*(\\d{1,2})\\s*[.\\-/]\\s*(\\d{1,2})');
  if (full) {
    return `${full[1]}-${pad2(full[2]!)}-${pad2(full[3]!)}`;
  }
  // 연.월 (일 없음) → 그 달 말일.
  const ym = lastPlausibleMatch(segment, '(\\d{4})\\s*[.\\-/]\\s*(\\d{1,2})(?!\\s*[.\\-/]\\s*\\d)');
  if (ym) {
    return `${ym[1]}-${pad2(ym[2]!)}-${pad2(String(lastDayOfMonth(Number(ym[1]), Number(ym[2]))))}`;
  }
  // 연도만 → '상반기' 포함 시 06-30, 그 외(하반기 등) 12-31.
  const yOnly = lastPlausibleMatch(segment, '(\\d{4})');
  if (yOnly) {
    return /상반기/.test(segment) ? `${yOnly[1]}-06-30` : `${yOnly[1]}-12-31`;
  }
  return null;
}

/**
 * 매칭된 4자리 연도가 실제 연도로 타당한가.
 *  - 범위 2000~2099(오탐 차단).
 *  - `\d{4}`가 더 긴 숫자열의 일부면 배제(전화번호 "1577-0199", 금액 "300만원" 등).
 */
function isPlausibleYear(segment: string, m: RegExpExecArray): boolean {
  const year = Number(m[1]);
  if (year < 2000 || year > 2099) return false;
  // 연도 4자리 좌우로 숫자가 더 붙어 있으면(긴 숫자열의 일부) 배제.
  const yStart = m.index + m[0]!.indexOf(m[1]!);
  const before = segment[yStart - 1];
  const after = segment[yStart + 4];
  if (before !== undefined && /\d/.test(before)) return false;
  if (after !== undefined && /\d/.test(after)) return false;
  return true;
}

/** 해당 연·월의 말일(윤년 포함 정확). month는 1~12. */
function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function pad2(v: string | number): string {
  return String(Number(v)).padStart(2, '0');
}

/** 청년몽땅 상세 정본 URL — 원문 링크(항상 존재·안정). */
export function seoulDetailUrl(key: string, baseUrl: string = DEFAULT_BASE_URL): string {
  const base = baseUrl.replace(/\/+$/, '');
  return `${base}/infoData/plcyInfo/view.do?plcyBizId=${encodeURIComponent(key)}`;
}

/**
 * 상세 필드 → 도메인 raw 스키마(normalizePolicy 입력). 온통 어댑터와 동일 계약.
 *  - 연령/소득/모집: 원문 텍스트를 넘겨 검증된 parse 헬퍼가 처리(보수 판정 재사용).
 *    연령은 출생일 괄호(만19세~34세 (1991…))가 range 정규식을 흐리지 않게 첫 '(' 앞만 사용.
 *  - 지역: 서울시 자체(citywide) → '서울특별시'(regionCodes '11' → 서울 게이트 pass).
 *  - 카테고리: 마음건강 의미면 하드필터 대상('마음건강'), 아니면 정책유형 원문.
 *  - 원문: 청년몽땅 상세(view.do) 정본.
 */
export function adaptSeoulItem(input: {
  key: string;
  title: string;
  fields: Record<string, string>;
  baseUrl?: string;
}): Record<string, unknown> {
  const { key, title, fields } = input;
  const baseUrl = input.baseUrl ?? DEFAULT_BASE_URL;

  const summary = field(fields, '정책소개', '지원내용', '지원규모');
  const ageText = field(fields, '연령')?.split('(')[0]?.trim();
  const incomeText = field(fields, '소득', '소득요건');
  // 모집창: 신청기간 우선. 신청기간 불명(날짜 없음·상시 아님) 시 사업운영기간 종료일을 보조 마감 신호로.
  //  상시/수시/연중은 억제하지 않는다(진행 중 사업 오은폐 방지 — 종료일 있을 때만 마감 처리).
  const recruit = deriveSeoulRecruit(
    field(fields, '사업신청기간', '신청기간'),
    field(fields, '사업운영기간'),
  );
  const orgName = field(fields, '주관기관', '운영기관');
  const policyType = field(fields, '정책유형');

  const category = isMentalHealthTitle(title, policyType ?? '')
    ? '마음건강'
    : policyType && policyType.length > 0
      ? policyType
      : undefined;

  return {
    id: key.trim() || undefined,
    title: title.trim() || undefined,
    summary,
    ageText,
    incomeText,
    regionText: '서울특별시',
    recruitStartText: recruit.startText,
    recruitEndText: recruit.endText,
    recruitText: recruit.text,
    category,
    sourceUrl: seoulDetailUrl(key, baseUrl),
    orgName: orgName ?? '서울특별시',
    source: 'seoul-youth',
  };
}

/** HTML 태그 제거 + 엔티티 복원 + 공백 정리. */
function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}
