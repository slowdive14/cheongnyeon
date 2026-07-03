/**
 * Retrieval 튜닝 상수 SSOT (Phase 4 REFACTOR 4.11).
 * 신규 의존성 금지. 값 변경은 여기 1곳에서만.
 */

/** RRF 상수 k. 큰 k일수록 순위 차이 평탄화(보수적 융합). */
export const RRF_K = 60;

/** 소프트 부스트 가중치(가산만, 제외 금지). */
export const BOOST_WEIGHT = 0.5;

/** 키워드 arm 후보 채택 최소 유사도(부분문자열/토큰 매칭 보강). */
export const KEYWORD_MATCH_MIN = 0.6;
