import type { EmbeddingProvider, IndexedDoc, SearchHit, HybridSearchOptions } from './types';
import { rrfFuse } from './rrf';
import { RRF_K, BOOST_WEIGHT, KEYWORD_MATCH_MIN } from './config';
import { similarity } from '../data/similarity';

/**
 * 하이브리드 검색 — 임베딩 arm + 키워드 arm을 RRF로 융합.
 *
 * 안전/degrade(엄수):
 *  - embed 없음/throw → 키워드 단독 결과(빈 X). 위기 라우팅은 traverse가 선처리.
 *  - 하드 카테고리는 거친 도메인 제외만. category=null은 절대 하드 제외 금지(불명≠무관).
 *  - 소프트 부스트는 가산만(제외 X) — 재현율 보호.
 *  - throw-free: 깨진 doc·빈 query·index=[]·topK=0 모두 안전.
 *  - retrieval은 도메인을 모른다. 스코프(hard/boost)는 옵션으로만 주입.
 */

function isUsableDoc(d: unknown): d is IndexedDoc {
  if (!d || typeof d !== 'object') return false;
  const o = d as Partial<IndexedDoc>;
  return typeof o.policyId === 'string' && o.policyId.length > 0;
}

/** 코사인 유사도(무의존). 길이불일치·비유한·null → 0. */
function cosine(a: number[] | null, b: number[] | null): number {
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

/** 쿼리-문서 키워드/본문 매칭 점수(무의존 similarity 재사용). */
function keywordScore(query: string, doc: IndexedDoc): number {
  if (!query) return 0;
  const qTokens = query.split(/\s+/).map((t) => t.trim()).filter((t) => t.length > 0);
  if (qTokens.length === 0) return 0;

  const targets: string[] = [];
  if (Array.isArray(doc.keywords)) {
    for (const k of doc.keywords) if (typeof k === 'string' && k.trim()) targets.push(k.trim());
  }
  if (typeof doc.text === 'string' && doc.text.trim()) targets.push(doc.text.trim());

  let best = 0;
  for (const q of qTokens) {
    for (const t of targets) {
      // 정확 부분문자열 포함은 강한 신호.
      if (t.includes(q) || q.includes(t)) {
        best = Math.max(best, 1);
        continue;
      }
      best = Math.max(best, similarity(q, t));
    }
  }
  return best;
}

/** 옵션의 hardCategories에 의해 제외되는가. category=null은 절대 제외하지 않음. */
function isHardExcluded(doc: IndexedDoc, hardCategories?: string[]): boolean {
  if (!Array.isArray(hardCategories) || hardCategories.length === 0) return false;
  // ★불명≠무관: category=null/빈 → 제외 금지(보수, 재현율 보호).
  if (doc.category === null || doc.category === undefined || doc.category === '') return false;
  return !hardCategories.includes(doc.category);
}

/** 소프트 부스트 점수(가산만). 카테고리·키워드 매칭 시 가중. */
function boostScore(doc: IndexedDoc, options: HybridSearchOptions): number {
  const weight =
    typeof options.boostWeight === 'number' && Number.isFinite(options.boostWeight)
      ? options.boostWeight
      : BOOST_WEIGHT;
  let boost = 0;
  const { boostCategories, boostKeywords } = options;
  if (Array.isArray(boostCategories) && doc.category && boostCategories.includes(doc.category)) {
    boost += weight;
  }
  if (Array.isArray(boostKeywords) && Array.isArray(doc.keywords)) {
    for (const bk of boostKeywords) {
      if (doc.keywords.includes(bk)) {
        boost += weight;
        break;
      }
    }
  }
  return boost;
}

export async function hybridSearch(
  query: string,
  index: IndexedDoc[],
  deps: { embed?: EmbeddingProvider },
  options: HybridSearchOptions,
): Promise<SearchHit[]> {
  const topK = typeof options?.topK === 'number' && Number.isFinite(options.topK) ? options.topK : 0;
  if (topK <= 0) return [];
  if (!Array.isArray(index) || index.length === 0) return [];

  const q = typeof query === 'string' ? query.trim() : '';

  // 1) 하드 필터(거친 도메인 제외, null 보존).
  const docs = index.filter(isUsableDoc).filter((d) => !isHardExcluded(d, options?.hardCategories));
  if (docs.length === 0) return [];

  const rrfK =
    typeof options?.rrfK === 'number' && Number.isFinite(options.rrfK) ? options.rrfK : RRF_K;

  // 2) 임베딩 arm(provider 있고 query 임베딩 성공 시). throw 흡수(키워드 단독 degrade).
  const embedRanked: string[] = [];
  const embedRank = new Map<string, number>();
  const provider = deps?.embed;
  if (provider && q.length > 0) {
    let qVec: number[] | null = null;
    try {
      const vecs = await provider.embed([q]);
      qVec = Array.isArray(vecs) && Array.isArray(vecs[0]) ? vecs[0]! : null;
    } catch {
      qVec = null; // 2층 실패 흡수.
    }
    if (qVec) {
      const scored = docs
        .map((d) => ({ id: d.policyId, s: cosine(qVec, d.vector) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s);
      scored.forEach((x, i) => {
        embedRanked.push(x.id);
        embedRank.set(x.id, i);
      });
    }
  }

  // 3) 키워드 arm(항상 — degrade 보호).
  const keywordRanked: string[] = [];
  const keywordRank = new Map<string, number>();
  if (q.length > 0) {
    const scored = docs
      .map((d) => ({ id: d.policyId, s: keywordScore(q, d) }))
      .filter((x) => x.s >= KEYWORD_MATCH_MIN)
      .sort((a, b) => b.s - a.s);
    scored.forEach((x, i) => {
      keywordRanked.push(x.id);
      keywordRank.set(x.id, i);
    });
  }

  // 4) RRF 융합(합집합 보존).
  const fused = rrfFuse([embedRanked, keywordRanked], rrfK);

  // 5) 소프트 부스트 가산(제외 X).
  const docById = new Map(docs.map((d) => [d.policyId, d]));
  const hits: SearchHit[] = [];
  for (const [id, base] of fused.entries()) {
    const doc = docById.get(id);
    if (!doc) continue;
    const score = base + boostScore(doc, options);
    hits.push({
      policyId: id,
      score,
      arms: { embedRank: embedRank.get(id), keywordRank: keywordRank.get(id) },
    });
  }

  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, topK);
}
