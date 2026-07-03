import type { CachedPolicy, PolicyCache } from './types';
import type { Policy, IncomeCriteria, RecruitWindow } from '../../domain/types';

/**
 * CachedPolicy ↔ Supabase row(snake_case) 매핑 (순수). 실 SDK는 supabaseCache.ts.
 *  - embedding(pgvector)은 쓰기=number[], 읽기=문자열("[...]") 또는 배열 모두 수용.
 */

export type PolicyRow = Record<string, unknown>;

/** number[] → pgvector 텍스트 리터럴 "[1,2,3]"(PostgREST insert 안전형). 빈/널 → null. */
export function toVectorLiteral(v: number[] | null | undefined): string | null {
  if (!Array.isArray(v) || v.length === 0) return null;
  return `[${v.map((x) => (Number.isFinite(x) ? x : 0)).join(',')}]`;
}

/** CachedPolicy → DB row. */
export function toRow(p: CachedPolicy): PolicyRow {
  return {
    id: p.id,
    title: p.title,
    summary: p.summary,
    category: p.category,
    source: p.source,
    age_min: p.ageMin,
    age_max: p.ageMax,
    income: p.income,
    region_codes: p.regionCodes,
    region_text: p.regionText,
    is_nationwide: p.isNationwide,
    recruit: p.recruit,
    source_url: p.sourceUrl,
    keywords: p.keywords ?? [],
    parsed: p.parsed,
    explanation: p.explanation ?? null,
    embedding: toVectorLiteral(p.vector),
    fetched_at: p.fetchedAt,
    updated_at: p.updatedAt,
    content_hash: p.contentHash,
  };
}

/** pgvector 값(문자열 "[...]" 또는 배열) → number[] | null. */
export function parseVector(v: unknown): number[] | null {
  if (Array.isArray(v)) return v.map((x) => Number(x));
  if (typeof v === 'string' && v.trim().length > 0) {
    try {
      const a = JSON.parse(v);
      return Array.isArray(a) ? a.map((x) => Number(x)) : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** DB row → CachedPolicy. */
export function fromRow(r: PolicyRow): CachedPolicy {
  const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
  return {
    id: String(r.id ?? ''),
    title: String(r.title ?? ''),
    summary: str(r.summary),
    category: str(r.category),
    source: String(r.source ?? 'ontong'),
    ageMin: r.age_min == null ? null : Number(r.age_min),
    ageMax: r.age_max == null ? null : Number(r.age_max),
    income: r.income as IncomeCriteria,
    regionCodes: Array.isArray(r.region_codes) ? (r.region_codes as string[]) : [],
    regionText: str(r.region_text),
    isNationwide: r.is_nationwide === true,
    recruit: r.recruit as RecruitWindow,
    sourceUrl: str(r.source_url),
    keywords: Array.isArray(r.keywords) ? (r.keywords as string[]) : [],
    parsed: (r.parsed as CachedPolicy['parsed']) ?? null,
    explanation: str(r.explanation),
    vector: parseVector(r.embedding),
    fetchedAt: String(r.fetched_at ?? ''),
    updatedAt: String(r.updated_at ?? ''),
    contentHash: String(r.content_hash ?? ''),
  };
}

export type { CachedPolicy, PolicyCache, Policy };
