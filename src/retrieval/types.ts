/**
 * Retrieval 계층 타입 (Phase 4).
 *
 * 안전/제약:
 *  - EmbeddingProvider.embed는 throw 가능 → 호출부가 흡수(키워드 색인은 계속, degrade).
 *  - 실 Gemini 임베딩 호출 코드는 작성하지 않는다(Phase 6). 키 없으면 미주입/disabled.
 *  - retrieval은 도메인(그래프)을 모른다. 스코프는 옵션으로만 주입받는다.
 */

import type { CachedPolicy } from '../data/cache/types';

/** 임베딩 제공자. 키 없으면 미주입. throw 가능(호출부가 흡수). */
export interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
}

/** 색인 문서 1건. vector=null이면 키워드 색인만으로 후보 가능(degrade). */
export interface IndexedDoc {
  policyId: string;
  text: string;
  vector: number[] | null;
  category: string | null;
  keywords?: string[];
}

/** 검색 결과 1건. arms=각 arm에서의 순위(디버깅·설명용). */
export interface SearchHit {
  policyId: string;
  score: number;
  arms?: { embedRank?: number; keywordRank?: number };
}

export interface HybridSearchOptions {
  topK: number;
  /** 거친 도메인 하드 필터(제외). category=null은 절대 제외 금지. */
  hardCategories?: string[];
  /** 세부 갈래 소프트 부스트(가산만, 제외 금지). */
  boostCategories?: string[];
  /** 키워드 소프트 부스트(가산만). */
  boostKeywords?: string[];
  /** 부스트 가중치. 기본 BOOST_WEIGHT. */
  boostWeight?: number;
  /** RRF 상수 k. 기본 RRF_K. */
  rrfK?: number;
}

export type { CachedPolicy };
