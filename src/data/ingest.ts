import type { Policy } from '../domain/types';
import { normalizePolicy } from '../domain/normalizePolicy';
import type { CachedPolicy, PolicyCache } from './cache/types';
import type { ParseResult } from './parseChunk';
import { contentHash, needsReparse } from './incremental';
import { SIMILARITY_THRESHOLD, pairSimilarity, normalizeName } from './similarity';
import { buildText, buildKeywords } from '../retrieval/embed';

/**
 * 인제스트 파이프라인 — 받기 → 정규화 → id안정화·신선도 → 증분 재파싱 → 중복제거 → 서울필터 → 캐시.
 *
 * 결정성: 직접 fetch · Date.now · I/O 금지. client/parser/cache/now를 전부 주입받는다.
 *
 * 리더 확정 결정:
 *  - 서울 필터 = regionCodes∋'11' OR isNationwide OR 서울 25개 자치구명 포함.
 *    불명 지역은 제외 + droppedUnknownRegion 카운트.
 *  - 동일 id 갱신: 최종수정일 최신 우선, 없으면 page2(후행) 우선.
 *  - 1차 키 = source+id. 2차(정규화명+기관 유사도≥0.85)는 자동병합 금지 → dedupeManualCandidates.
 *  - 무id 제외 + droppedNoId 카운트.
 */

export interface IngestClient {
  fetchAll(): Promise<unknown[]>;
}

export interface IngestParser {
  parseChunk(policyText: string): Promise<ParseResult>;
}

/** '왜 맞는지' 설명 precompute 제공자(운영자 키). 미주입 시 설명 미생성(null). */
export interface IngestExplainer {
  explain(policy: Policy): Promise<string | null>;
}

/** 임베딩 precompute 제공자(운영자 키, 1536d 정규화). 배치 입력 → 순서 정합 출력. 미주입 시 벡터 미생성. */
export interface IngestEmbedder {
  embed(texts: string[]): Promise<(number[] | null)[]>;
}

export interface IngestDeps {
  client: IngestClient;
  parser: IngestParser;
  cache: PolicyCache;
  /** 적재 시각(ISO). Date.now 대신 주입. */
  now: string;
  /** 지역 범위: 'seoul'(기본, 서울/전국만) | 'all'(전국 적재, 서울필터 미적용). */
  regionScope?: 'seoul' | 'all';
  /** 설명 precompute 제공자(있으면 변경분에 한해 explanation 생성·저장). */
  explainer?: IngestExplainer;
  /** 임베딩 precompute 제공자(있으면 변경분에 한해 vector 생성·저장). */
  embedder?: IngestEmbedder;
  /** parseChunk·설명 동시 처리 수(병렬 풀). 기본 DEFAULT_CONCURRENCY. */
  concurrency?: number;
}

/** 인제스트 작업 항목(정책별 precompute 상태). */
interface WorkItem {
  policy: Policy;
  cached: CachedPolicy | null;
  hash: string;
  reparse: boolean;
  parsed: ParseResult | null;
  explanation: string | null;
  vector: number[] | null;
  updatedAt: string;
  embedText: string;
  needEmbed: boolean;
}

/** parseChunk·설명 LLM 동시 호출 기본 수(지연 병목 완화·RPM 균형). */
const DEFAULT_CONCURRENCY = 12;

export interface DedupeManualCandidate {
  /** 유지된 기준 정책 id. */
  kept: string;
  /** 유사하나 자동병합하지 않은 정책 id. */
  candidate: string;
  score: number;
}

export interface IngestResult {
  policies: CachedPolicy[];
  /** 무id로 제외된 raw 수. */
  droppedNoId: number;
  /** 불명 지역으로 제외된 정책 수. */
  droppedUnknownRegion: number;
  /** 서울 필터로 제외된 비서울 정책 수(droppedUnknownRegion 별도). */
  droppedNonSeoul: number;
  /** 1차 키 중복으로 병합된 수. */
  mergedDuplicates: number;
  /** 2차 키 유사(자동병합 금지) 수동검증 후보. */
  dedupeManualCandidates: DedupeManualCandidate[];
  /** 교차출처 중복으로 억제된 서울(seoul-youth) 정책 수(M-1). */
  suppressedCrossSource: number;
  /** 증분으로 재파싱한 정책 수. */
  reparsed: number;
}

/** 서울 25개 자치구명(자치구명 매칭용 상수). */
const SEOUL_GU = [
  '종로구', '중구', '용산구', '성동구', '광진구', '동대문구', '중랑구', '성북구',
  '강북구', '도봉구', '노원구', '은평구', '서대문구', '마포구', '양천구', '강서구',
  '구로구', '금천구', '영등포구', '동작구', '관악구', '서초구', '강남구', '송파구',
  '강동구',
] as const;

/** 비-서울 시/도 토큰(동명 자치구 오탐 차단용 교차검증). */
const NON_SEOUL_SIDO = [
  '부산', '대구', '인천', '광주', '대전', '울산', '세종',
  '경기', '강원', '충북', '충청북도', '충남', '충청남도',
  '전북', '전라북도', '전남', '전라남도', '경북', '경상북도',
  '경남', '경상남도', '제주',
] as const;

export async function ingest(deps: IngestDeps): Promise<IngestResult> {
  const { client, parser, cache, now } = deps;

  // 1) 받기(페이지 병합은 client 내부) → 정규화.
  const rawItems = await client.fetchAll();

  let droppedNoId = 0;
  const normalized: Policy[] = [];
  for (const raw of rawItems) {
    const policy = normalizePolicy(raw);
    // 2) id 안정화: 무id(placeholder 'unknown') 제외.
    if (policy.id === 'unknown') {
      droppedNoId += 1;
      continue;
    }
    normalized.push(policy);
  }

  // 3) 1차 키(source+id) 중복제거 — 동일 id는 갱신 규칙으로 1건 채택.
  const { deduped, mergedDuplicates } = dedupeBySourceId(normalized);

  // 4) 지역 범위 — 'all'이면 전국 적재(서울필터 미적용), 기본은 서울/전국만.
  let droppedNonSeoul = 0;
  let droppedUnknownRegion = 0;
  const seoul: Policy[] = [];
  if (deps.regionScope === 'all') {
    seoul.push(...deduped);
  } else {
    for (const p of deduped) {
      const verdict = seoulVerdict(p);
      if (verdict === 'pass') {
        seoul.push(p);
      } else if (verdict === 'non-seoul') {
        droppedNonSeoul += 1;
      } else {
        droppedUnknownRegion += 1;
      }
    }
  }

  // 5) 교차출처 중복 억제(M-1): 서울(seoul-youth)이 정본(온통 등, 서울/전국) 정책과
  //    정규화 제목 완전 일치 시 서울 쪽 억제(정본 유지 — 구조화 자격 풍부). 연도 변형은 유지(신선도 보존).
  const { kept: afterSuppress, suppressedCrossSource } = suppressCrossSourceDuplicates(seoul);

  // 5b) 2차 키(정규화명+기관 유사도≥0.85) — 자동병합 금지, 수동검증 후보만 수집.
  //     억제 후 집합에서 수집(억제된 완전일치 쌍은 제외 → 운영자에게 남은 near-dup만 보고).
  const dedupeManualCandidates = collectManualCandidates(afterSuppress);

  // 6) 증분 판정 → 변경분 parseChunk·설명 동시 처리 + 임베딩 배치(순차 지연 병목 제거).
  const prevSnapshot = await cache.readAll();
  const prevById = new Map(prevSnapshot.map((p) => [p.id, p]));

  const items: WorkItem[] = afterSuppress.map((p) => {
    const cached = prevById.get(p.id) ?? null;
    return {
      policy: p,
      cached,
      hash: contentHash(p),
      reparse: needsReparse(p, cached),
      parsed: null,
      explanation: null,
      vector: null,
      updatedAt: now,
      embedText: '',
      needEmbed: false,
    };
  });

  // 6a) parseChunk + 설명 — 동시성 풀. 출력은 items 순서로 조립해 결정성 보존.
  await mapPool(items, deps.concurrency ?? DEFAULT_CONCURRENCY, async (it) => {
    if (it.reparse) {
      it.parsed = await parser.parseChunk(parseInput(it.policy));
      it.explanation = deps.explainer ? await safeExplain(deps.explainer, it.policy) : null;
      it.updatedAt = now;
    } else {
      // 변경 없음: 이전 파싱·설명·updatedAt 보존. (explainer 새로 생겼는데 결손이면 보강.)
      it.parsed = it.cached?.parsed ?? null;
      const prevExpl = it.cached?.explanation ?? null;
      it.explanation =
        prevExpl === null && deps.explainer ? await safeExplain(deps.explainer, it.policy) : prevExpl;
      it.updatedAt = it.cached?.updatedAt ?? now;
    }
  });

  // 6b) 임베딩 텍스트(파싱 후 구성) → 변경분/결손만 배치 임베딩(provider가 ≤100/콜 분할).
  for (const it of items) {
    it.embedText = buildText({
      parsed: it.parsed,
      title: it.policy.title,
      summary: it.policy.summary,
    });
    const prevVec = it.cached?.vector ?? null;
    it.needEmbed =
      Boolean(deps.embedder) && (it.reparse || prevVec === null) && it.embedText.trim().length > 0;
    it.vector = it.needEmbed ? null : prevVec;
  }
  if (deps.embedder) {
    const toEmbed = items.filter((it) => it.needEmbed);
    if (toEmbed.length > 0) {
      const vectors = await safeEmbedMany(
        deps.embedder,
        toEmbed.map((it) => it.embedText),
      );
      toEmbed.forEach((it, i) => {
        it.vector = vectors[i] ?? null;
      });
    }
  }

  // 6c) 조립(items 순서 보존).
  const reparsed = items.filter((it) => it.reparse).length;
  const output: CachedPolicy[] = items.map((it) => ({
    ...it.policy,
    fetchedAt: now,
    updatedAt: it.updatedAt,
    contentHash: it.hash,
    parsed: it.parsed,
    explanation: it.explanation,
    keywords: buildKeywords({ title: it.policy.title, category: it.policy.category }),
    vector: it.vector,
  }));

  // 7) 캐시 기록.
  await cache.writeAll(output);

  return {
    policies: output,
    droppedNoId,
    droppedUnknownRegion,
    droppedNonSeoul,
    mergedDuplicates,
    dedupeManualCandidates,
    suppressedCrossSource,
    reparsed,
  };
}

type SeoulVerdict = 'pass' | 'non-seoul' | 'unknown-region';

/**
 * 서울 필터 판정.
 *  - pass: regionCodes∋'11'(서울 식별) OR isNationwide OR 서울 자치구명 매칭(교차검증 통과).
 *  - non-seoul: 지역 식별됨(원문 있음)이나 서울 아님.
 *  - unknown-region: 지역 불명(코드 없음·전국 아님·자치구명 없음·원문 없음).
 *
 * 동명 자치구 오탐 차단(정밀도): '중구'는 부산·대구 등에도 존재 → 자치구명만으로 통과시키지 않는다.
 * 자치구명 매칭은 regionText에 **다른 시/도 토큰이 없을 때만** 인정한다.
 * (regionCodes '11'은 도메인이 '서울' 문자열로 식별했음을 의미하므로 그 자체로 pass.)
 */
function seoulVerdict(p: Policy): SeoulVerdict {
  if (p.regionCodes.includes('11') || p.isNationwide) return 'pass';
  const text = p.regionText;
  if (text !== null) {
    const hasGu = SEOUL_GU.some((gu) => text.includes(gu));
    const hasOtherSido = NON_SEOUL_SIDO.some((sido) => text.includes(sido));
    // 자치구명이 있고, 다른 시/도 토큰이 함께 있지 않을 때만 서울로 인정(예: '부산광역시 중구' 차단).
    if (hasGu && !hasOtherSido) return 'pass';
  }
  // 식별 가능한 지역 원문이 있으나 서울이 아니면 비서울, 없으면 불명.
  if (text !== null && text.trim().length > 0) return 'non-seoul';
  return 'unknown-region';
}

/**
 * 1차 키(source+id) 중복제거. 동일 키는 갱신 규칙으로 1건 채택:
 *  - 양쪽 lastModified 있으면 최신 우선.
 *  - 그 외(없거나 비교 불가)는 후행(page2) 우선 — 배열 뒤 항목이 후행.
 */
function dedupeBySourceId(policies: Policy[]): { deduped: Policy[]; mergedDuplicates: number } {
  const byKey = new Map<string, Policy>();
  let mergedDuplicates = 0;
  for (const p of policies) {
    const key = `${p.source}+${p.id}`;
    const existing = byKey.get(key);
    if (existing === undefined) {
      byKey.set(key, p);
      continue;
    }
    mergedDuplicates += 1;
    byKey.set(key, pickNewer(existing, p));
  }
  return { deduped: [...byKey.values()], mergedDuplicates };
}

/** 갱신 규칙: lastModified 최신 우선, 비교 불가면 후행(b) 우선. */
function pickNewer(a: Policy, b: Policy): Policy {
  const la = lastModifiedOf(a);
  const lb = lastModifiedOf(b);
  if (la !== null && lb !== null) {
    return lb >= la ? b : a;
  }
  // 한쪽만 있으면 있는 쪽 우선(정보 우위), 둘 다 없으면 후행 b.
  if (la !== null && lb === null) return a;
  if (la === null && lb !== null) return b;
  return b;
}

function lastModifiedOf(p: Policy): string | null {
  const raw = p.raw;
  if (raw === null || typeof raw !== 'object') return null;
  const lm = (raw as Record<string, unknown>).lastModified;
  return typeof lm === 'string' && lm.trim().length > 0 ? lm.trim() : null;
}

/**
 * 교차출처 중복 억제(M-1) — 서울(seoul-youth) 정책이 정본(비 seoul-youth, 서울/전국) 정책과
 * 정규화 제목이 완전 일치하면 서울 쪽을 억제하고 정본을 유지한다.
 *
 * 설계 근거:
 *  - 같은 정책이 두 출처로 두 카드(자격 신호 상충: 한쪽 blocked·한쪽 review)로 뜨는 것을 막는다(취약 사용자 혼란 차단).
 *  - 정본(온통) 유지: 구조화 자격 필드(소득코드·지역코드)가 풍부해 과잉 '확인 필요'·상충이 적다.
 *  - 정본에 없는 순증 서울 정책은 영향 없음(제목 무매칭 → 유지).
 *  - **연도 변형은 억제하지 않는다**(제목에 연도 유지 → "2026 X" ≠ "X"): 신선한 최신판을 보존하고,
 *    마감된 구판은 모집상태로 자연 필터되게 한다(신선도 손실 방지).
 *  - 정밀도 우선(오억제 = 순증 소실): 정규화 제목 '완전 일치'만 자동 억제(퍼지 유사≥0.85는
 *    dedupeManualCandidates로 보고만). 정본이 서울/전국일 때만(동명 타지역 정책 오매칭 차단).
 */
function suppressCrossSourceDuplicates(policies: Policy[]): {
  kept: Policy[];
  suppressedCrossSource: number;
} {
  // 정본(비 seoul-youth, 서울/전국) 제목 인덱스.
  const canonTitles = new Set<string>();
  for (const p of policies) {
    if (p.source === 'seoul-youth') continue;
    if (!(p.regionCodes.includes('11') || p.isNationwide)) continue;
    const key = normalizeName(p.title);
    if (key.length > 0) canonTitles.add(key);
  }
  if (canonTitles.size === 0) return { kept: policies, suppressedCrossSource: 0 };

  const kept: Policy[] = [];
  let suppressedCrossSource = 0;
  for (const p of policies) {
    if (p.source === 'seoul-youth') {
      const key = normalizeName(p.title);
      if (key.length > 0 && canonTitles.has(key)) {
        suppressedCrossSource += 1;
        continue; // 정본이 이미 있음 → 서울 사본 억제.
      }
    }
    kept.push(p);
  }
  return { kept, suppressedCrossSource };
}

/**
 * 2차 키 동일성(정규화명+기관 유사도≥0.85) — 자동병합 금지, 수동검증 후보만.
 * 서로 다른 id끼리만 비교. 한 쌍은 한 번만 보고(중복 보고 방지).
 */
function collectManualCandidates(policies: Policy[]): DedupeManualCandidate[] {
  const candidates: DedupeManualCandidate[] = [];
  for (let i = 0; i < policies.length; i += 1) {
    for (let j = i + 1; j < policies.length; j += 1) {
      const a = policies[i]!;
      const b = policies[j]!;
      if (a.id === b.id && a.source === b.source) continue;
      // 공용 pairSimilarity(coverage와 동일 산식·임계) — 드리프트 제거.
      const score = pairSimilarity(a.title, orgOf(a), b.title, orgOf(b));
      if (score >= SIMILARITY_THRESHOLD) {
        candidates.push({ kept: a.id, candidate: b.id, score });
      }
    }
  }
  return candidates;
}

function orgOf(p: Policy): string {
  const raw = p.raw;
  if (raw && typeof raw === 'object') {
    const o = (raw as Record<string, unknown>).orgName;
    if (typeof o === 'string') return o;
  }
  return p.regionText ?? '';
}

/** 설명 precompute(throw-free). 실패/빈 산출 → null(설명 누락이 적재를 막지 않음). */
async function safeExplain(explainer: IngestExplainer, p: Policy): Promise<string | null> {
  try {
    const t = await explainer.explain(p);
    return typeof t === 'string' && t.trim().length > 0 ? t.trim() : null;
  } catch {
    return null;
  }
}

/** 배치 임베딩(throw-free). 입력 순서로 정합, 실패/누락은 null. */
async function safeEmbedMany(
  embedder: IngestEmbedder,
  texts: string[],
): Promise<(number[] | null)[]> {
  try {
    const out = await embedder.embed(texts);
    return texts.map((_, i) => {
      const v = Array.isArray(out) ? out[i] : null;
      return Array.isArray(v) && v.length > 0 ? v : null;
    });
  } catch {
    return texts.map(() => null);
  }
}

/** 동시성 풀 — 최대 limit개를 병렬 처리. items를 in-place 변형(순서 보존). throw는 전파. */
async function mapPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  const n = Math.max(1, Math.floor(limit));
  let idx = 0;
  const worker = async (): Promise<void> => {
    while (idx < items.length) {
      const cur = idx;
      idx += 1;
      await fn(items[cur]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length || 1) }, () => worker()));
}

/** parseChunk 입력 텍스트 조립(자격영향 원문 중심). */
function parseInput(p: Policy): string {
  return [p.title, p.summary, p.regionText, p.income.raw, p.category]
    .filter((s): s is string => typeof s === 'string' && s.length > 0)
    .join('\n');
}
