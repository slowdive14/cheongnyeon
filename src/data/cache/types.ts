import type { Policy } from '../../domain/types';

/**
 * 적재된 정책 레코드. Policy(도메인) + 인제스트가 주입하는 신선도/증분 메타.
 *
 * 안전:
 *  - fetchedAt = '추정' 고지·최종 업데이트 시각 근거.
 *  - contentHash = 증분 재파싱 판정 키(자격영향 원문만, fetchedAt/sourceUrl 제외).
 */
export interface CachedPolicy extends Policy {
  /** 이번 인제스트에서 적재된 시각(ISO). ingest가 now를 주입. */
  fetchedAt: string;
  /** 내용 변경 시각(ISO). 변경 없으면 이전 값 보존. */
  updatedAt: string;
  /** 자격영향 원문 기반 결정적 해시(증분 판정용). */
  contentHash: string;
  /** parseChunk 산출(구조화 자격·청크). 미파싱은 null. */
  parsed: import('../parseChunk').ParseResult | null;
  /**
   * '혜택 한 줄'(D-②) precompute 설명 — 인제스트 시 운영자 키로 생성, 질의 무관 → 정책별 고정.
   * 그라운딩 통과한 LLM 문장만 저장(fallback/미생성은 null → 카드 미노출). 런타임 LLM·사용자 키 없이 표시.
   */
  explanation?: string | null;
  /** 키워드 검색용 토큰(제목·카테고리). 미지정은 빈 배열 취급. */
  keywords?: string[];
  /** precompute 임베딩 벡터(gemini-embedding-001 1536d, 정규화). 미생성은 null. Supabase 저장용. */
  vector?: number[] | null;
}

/**
 * 정책 캐시 추상화. 로컬 JSON ↔ Firestore 교체 가능하도록 인터페이스 뒤에 둔다.
 * Phase 2 구현체는 LocalJsonCache(data/cache/policies.json)뿐. Firestore는 자리만.
 */
export interface PolicyCache {
  /** 전체 스냅샷 읽기. 없으면 빈 배열. */
  readAll(): Promise<CachedPolicy[]>;
  /** contentHash로 조회(증분 skip 판정용). 없으면 null. */
  getByHash(hash: string): Promise<CachedPolicy | null>;
  /** id로 조회. 없으면 null. */
  getById(id: string): Promise<CachedPolicy | null>;
  /** 전체 덮어쓰기. */
  writeAll(policies: CachedPolicy[]): Promise<void>;
}
