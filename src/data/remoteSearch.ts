import type { CachedPolicy } from './cache/types';
import { fromRow } from './cache/supabaseMapping';

/**
 * 원격 검색 클라이언트 (C3) — 검색 Edge Function 호출 → 정책 행 매핑.
 *
 * 안전/제약:
 *  - 검색만. 위기 감지(layer-1)·자격 판정은 호출부(클라이언트)가 수행한다(키·네트워크 무관 바닥선).
 *  - throw-free: 네트워크/응답 실패 → { hits: [], degraded: true } (호출부가 키워드 폴백 등 degrade).
 *  - anon 키만 사용(공개 안전). service 키·Gemini 키는 서버(Edge Function)에만.
 */

export interface RemoteSearchOptions {
  topK?: number;
  /** 영역 하드필터(allow-list). null/미지정 = 전 영역. */
  hardCategories?: string[] | null;
  /**
   * 사용자 시·도 코드(★지역 인지 후보 선정). 있으면 서버가 양립 불가 정책을 후보에서 제외
   * (topK quota 잠식 방지). null/미지정이면 현 동작 동일. 자격 판정은 여전히 클라 eligibility.
   */
  regionCode?: string | null;
}

export interface RemoteSearchResult {
  hits: CachedPolicy[];
  /** 서버 임베딩 실패 등으로 의미검색 미수행 → 호출부 폴백 신호. */
  degraded: boolean;
}

export interface RemoteSearchDeps {
  /** `<SUPABASE_URL>/functions/v1/search` */
  fnUrl: string;
  anonKey: string;
  /** fetch 주입(테스트). 기본 globalThis.fetch. */
  fetchImpl?: typeof fetch;
}

export interface RemoteSearch {
  search(query: string, opts?: RemoteSearchOptions): Promise<RemoteSearchResult>;
}

export function createRemoteSearch(deps: RemoteSearchDeps): RemoteSearch {
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
  return {
    async search(query: string, opts: RemoteSearchOptions = {}): Promise<RemoteSearchResult> {
      const q = typeof query === 'string' ? query.trim() : '';
      if (q.length === 0) return { hits: [], degraded: false };
      try {
        const res = await fetchImpl(deps.fnUrl, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${deps.anonKey}`,
            apikey: deps.anonKey,
          },
          body: JSON.stringify({
            query: q,
            topK: opts.topK ?? 10,
            hardCategories: opts.hardCategories ?? null,
            // 미선택(빈 문자열 포함)이면 null → 서버는 지역 무필터(현 동작).
            regionCode:
              typeof opts.regionCode === 'string' && opts.regionCode.trim().length > 0
                ? opts.regionCode
                : null,
          }),
        });
        if (!res.ok) return { hits: [], degraded: true };
        const data = (await res.json()) as { hits?: unknown; degraded?: unknown };
        const rows = Array.isArray(data?.hits) ? data.hits : [];
        return {
          hits: rows.map((r) => fromRow(r as Record<string, unknown>)),
          degraded: data?.degraded === true,
        };
      } catch {
        return { hits: [], degraded: true };
      }
    },
  };
}
