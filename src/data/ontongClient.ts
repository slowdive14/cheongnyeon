import page1 from './__fixtures__/ontong-policies.page1.sample.json';
import page2 from './__fixtures__/ontong-policies.page2.sample.json';
import { sidoNameByPrefix } from '../domain/parse/sido';
import { isMentalHealthTitle } from '../domain/parse/mentalHealth';

/**
 * 온통청년 클라이언트. 받기(fetch) 격리 계층.
 *
 * 안전/결정성:
 *  - 키 미설정(ONTONG_API_KEY) → fixture 모드(키 0개로 전 게이트 통과).
 *  - 키 설정 → fetch → parseResponse → 페이지 루프 → 병합.
 *  - 실패는 throw 하지 말고 빈 배열(흐름 단절 금지)로 흡수하지 않는다? 받기 단계는
 *    상위(ingest)가 결정성 위해 client를 주입하므로, 여기서는 fetch 실패만 throw 가능.
 *
 * Phase 2는 fixture 계약이 SSOT. 실 필드명/페이지네이션은 U1~U3로 후보정(어댑터 1곳).
 */

export interface OntongClient {
  /** 모든 페이지를 병합한 raw 정책 배열을 반환. */
  fetchAll(): Promise<unknown[]>;
}

export interface OntongClientOptions {
  apiKey?: string;
  /** true면 키 유무와 무관하게 fixture 모드 강제(테스트). */
  fixture?: boolean;
  /** fetch 주입(테스트·격리). 기본 globalThis.fetch. */
  fetchImpl?: typeof fetch;
  /** 실 fetch 시 베이스 URL. 현행 온통청년 getPlcy. */
  baseUrl?: string;
  /** 페이지 크기(기본 100). */
  pageSize?: number;
  /** 안전 상한 페이지 수(기본 60 = 6000건). */
  maxPages?: number;
}

const FIXTURE_PAGES: unknown[][] = [page1 as unknown[], page2 as unknown[]];

/** 현행 온통청년 정책 API(공공데이터포털 인증키 apiKeyNm). */
const DEFAULT_BASE_URL = 'https://www.youthcenter.go.kr/go/ythip/getPlcy';

export function createOntongClient(opts: OntongClientOptions = {}): OntongClient {
  const useFixture = opts.fixture === true || !opts.apiKey;

  if (useFixture) {
    return {
      async fetchAll(): Promise<unknown[]> {
        return FIXTURE_PAGES.flat();
      },
    };
  }

  // 실 fetch 모드 — 현행 getPlcy(JSON). 응답을 도메인 raw 스키마로 어댑팅한다.
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
  const pageSize = opts.pageSize ?? 100;
  const maxPages = opts.maxPages ?? 60;
  const key = opts.apiKey ?? '';

  return {
    async fetchAll(): Promise<unknown[]> {
      const merged: unknown[] = [];
      // 페이지 수는 1페이지의 totCount로 고정한다. 중간 페이지가 일시적으로 비어도
      // break 하지 않고 건너뛴다(단일 페이지 실패가 전체를 절단하지 않게).
      let totalPages = maxPages;
      for (let page = 1; page <= totalPages; page += 1) {
        const url =
          `${baseUrl}?apiKeyNm=${encodeURIComponent(key)}` +
          `&pageNum=${page}&pageSize=${pageSize}&rtnType=json`;
        const res = await fetchImpl(url);
        const { items, totCount } = parseGetPlcy(await res.text());
        if (page === 1) {
          if (totCount <= 0 && items.length === 0) break; // 1페이지 실패/빈 → 종료.
          if (totCount > 0) totalPages = Math.min(maxPages, Math.ceil(totCount / pageSize));
        }
        for (const it of items) merged.push(adaptOntongItem(it));
      }
      return merged;
    },
  };
}

/** getPlcy JSON 응답 → 항목 배열 + 총건수. 비 JSON/구조 이탈은 빈 결과(throw 금지). */
export function parseGetPlcy(body: string): { items: unknown[]; totCount: number } {
  try {
    const j = JSON.parse(body) as Record<string, unknown>;
    const result = (j?.result ?? {}) as Record<string, unknown>;
    const list = result.youthPolicyList;
    const pagging = (result.pagging ?? {}) as Record<string, unknown>;
    const totCount = Number(pagging.totCount ?? 0);
    return {
      items: Array.isArray(list) ? list : [],
      totCount: Number.isFinite(totCount) ? totCount : 0,
    };
  } catch {
    return { items: [], totCount: 0 };
  }
}

/** "20260615" → "2026-06-15" (8자리 숫자만). 그 외 null. */
function ymd8ToIso(s: unknown): string | null {
  if (typeof s !== 'string') return null;
  const m = s.trim().match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** URL이 도메인 홈이 아니라 구체 페이지(경로/쿼리 보유)인가. 파싱불가는 false. */
function isSpecificUrl(u: string): boolean {
  try {
    const p = new URL(u);
    return p.pathname.length > 1 || p.search.length > 0;
  } catch {
    return false;
  }
}

/**
 * 원문 URL 선택 — 구체 딥링크(경로/쿼리) 우선, 없으면 첫 비어있지 않은 값.
 * 도메인 홈(https://www.bokjiro.go.kr)이 신청URL로 와도 참고URL에 정책 상세 딥링크가 있으면 그쪽을 쓴다.
 */
export function pickSourceUrl(...urls: string[]): string | undefined {
  const cands = urls
    .map((u) => (typeof u === 'string' ? u.trim() : ''))
    .filter((u) => u.length > 0);
  if (cands.length === 0) return undefined;
  return cands.find(isSpecificUrl) ?? cands[0];
}

/**
 * 온통청년 정책 상세 정본 URL(plcyNo 경로 세그먼트). 모든 정책에 정확한 '원문'.
 *  검증(2026-06-28): /youthPolicy/ythPlcyTotalSearch/ythPlcyDetail/{20자리 plcyNo} → 200(SPA가 해당 정책 로드).
 *  (옛 youngPlcyUnifDtl.do?bizId=는 신규 plcyNo로 홈 리다이렉트 → 사용 불가.)
 */
const ONTONG_DETAIL_BASE = 'https://www.youthcenter.go.kr/youthPolicy/ythPlcyTotalSearch/ythPlcyDetail/';
export function ontongDetailUrl(plcyNo: string): string | undefined {
  const id = typeof plcyNo === 'string' ? plcyNo.trim() : '';
  return id.length > 0 ? `${ONTONG_DETAIL_BASE}${encodeURIComponent(id)}` : undefined;
}

/**
 * zipCd(쉼표구분 법정 시군구 코드) + 기관명 → 지역 라벨.
 *  - 다수 시·도(≥10개 prefix)를 덮으면 '전국'(isNationwide).
 *  - 1~9개 시·도 → 해당 시·도 정식 명칭 join(P2A: 17개 전면 매핑) → parseRegion이 코드 수집.
 *  - 매핑 불가/zipCd 없음 → 기관명 폴백.
 */
export function deriveRegionText(zipCd: string, inst: string): string | undefined {
  const codes = zipCd.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
  const sido = new Set(codes.map((c) => c.slice(0, 2)));
  if (sido.size >= 10) return '전국';
  const names = [...sido].map(sidoNameByPrefix).filter((n): n is string => typeof n === 'string');
  if (names.length > 0) return names.join(' ');
  return inst || undefined;
}

/**
 * 실 getPlcy 항목 → 도메인 raw 스키마(normalizePolicy 입력).
 *  - 안전: 소득 불명은 none으로 단정하지 않음(0043001 무관만 none). 모집창 무효는 미설정(→unknown).
 *  - category: 마음건강 의미 키워드면 '마음건강'(하드필터 대상), 아니면 대분류(lclsfNm).
 */
export function adaptOntongItem(raw: unknown): Record<string, unknown> {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

  // 연령: 숫자 직접(미설정/0은 omit → 보수적 unknown).
  const minAge = Number(o.sprtTrgtMinAge);
  const maxAge = Number(o.sprtTrgtMaxAge);
  const ageMin = Number.isFinite(minAge) && minAge > 0 ? minAge : undefined;
  const ageMax = Number.isFinite(maxAge) && maxAge > 0 ? maxAge : undefined;

  // 소득: 0043001(소득무관)만 none. 그 외는 etc 원문(없으면 미설정 → unknown 보수).
  const earnCd = str(o.earnCndSeCd);
  const earnEtc = str(o.earnEtcCn).trim();
  const incomeText =
    earnCd === '0043001' ? '소득 무관' : earnEtc.length > 0 ? earnEtc : undefined;

  // 모집창: aplyYmd "YYYYMMDD ~ YYYYMMDD"(0057001 특정기간). 변환 실패 토큰은 미설정(보수).
  //  aplyPrdSeCd 0057002 = 상시 → 'always'(모집 빈값이라 unknown으로 새지 않게).
  //  ★상시 = "운영기간 내 상시"(서울 deriveSeoulRecruit와 동일 의미, 2026-07-11): 상시여도
  //   사업운영기간 종료일(bizPrdEndYmd)이 있으면 그 기간을 모집창으로 — "그 해 동안 상시"가
  //   영구 상시로 남아 종료 사업이 계속 노출되는 구멍 차단. 종료일 없으면 상시 유지(오은폐 방지).
  const aply = str(o.aplyYmd);
  const aplyYmds = aply.match(/\d{8}/g) ?? [];
  const isAlways = str(o.aplyPrdSeCd) === '0057002' || /상시|연중|수시/.test(aply);
  let recruitStartText: string | undefined;
  let recruitEndText: string | undefined;
  let recruitText: string | undefined;
  if (aplyYmds.length > 0) {
    recruitStartText = ymd8ToIso(aplyYmds[0]) ?? undefined;
    recruitEndText = ymd8ToIso(aplyYmds[1]) ?? undefined;
  } else {
    const bizEnd = ymd8ToIso((str(o.bizPrdEndYmd).match(/\d{8}/) ?? [])[0]);
    if (bizEnd) {
      recruitStartText = ymd8ToIso((str(o.bizPrdBgngYmd).match(/\d{8}/) ?? [])[0]) ?? undefined;
      recruitEndText = bizEnd;
    } else if (isAlways) {
      recruitText = '상시';
    }
  }

  // 지역: zipCd(적용 행정구역 코드)로 판정 — 서울 코드는 '11' 접두.
  //  서울 거주자는 전국 사업의 대상에도 포함되므로, 다수 시·도를 덮는 사업은 '전국'으로,
  //  11코드를 포함하면 '서울'로 식별해 서울 필터를 통과시킨다(기관명만으론 중앙부처 전국사업을 놓침).
  const inst = str(o.rgtrInstCdNm).trim() || str(o.sprvsnInstCdNm).trim();
  const regionText = deriveRegionText(str(o.zipCd), inst);

  // 카테고리: 마음건강이면 하드필터 대상으로, 아니면 대분류(lclsfNm).
  const title = str(o.plcyNm);
  const mclsf = str(o.mclsfNm);
  const isMentalHealth = isMentalHealthTitle(title, mclsf);
  const category = isMentalHealth ? '마음건강' : str(o.lclsfNm).trim() || undefined;

  // 원문: 온통청년 정책 상세(plcyNo)를 정본으로 — 모든 정책에 정확. plcyNo 없으면 원본 URL 폴백(딥링크 우선).
  const sourceUrl =
    ontongDetailUrl(str(o.plcyNo)) ??
    pickSourceUrl(str(o.aplyUrlAddr), str(o.refUrlAddr1), str(o.refUrlAddr2));

  const lastModified = str(o.lastMdfcnDt).slice(0, 10) || undefined; // "YYYY-MM-DD"

  return {
    id: str(o.plcyNo).trim() || undefined,
    title: str(o.plcyNm).trim() || undefined,
    summary: str(o.plcyExplnCn).trim() || undefined,
    ageMin,
    ageMax,
    incomeText,
    regionText,
    recruitStartText,
    recruitEndText,
    recruitText,
    category,
    sourceUrl,
    orgName: inst || regionText,
    lastModified,
    source: 'ontong',
  };
}

/**
 * 응답 본문(JSON 또는 XML) → raw 항목 배열.
 * U2: 실 구조 미확정 → JSON 우선 시도, 실패 시 빈 배열(throw 금지).
 */
export function parseResponse(body: string): unknown[] {
  try {
    const json = JSON.parse(body) as unknown;
    if (Array.isArray(json)) return json;
    if (json && typeof json === 'object') {
      const obj = json as Record<string, unknown>;
      const list = obj.youthPolicyList ?? obj.items ?? obj.data;
      if (Array.isArray(list)) return list;
    }
    return [];
  } catch {
    // XML 등 비 JSON은 U2 후보정 대상. Phase 2는 fixture가 SSOT이므로 빈 배열.
    return [];
  }
}
