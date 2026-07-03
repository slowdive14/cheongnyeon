/**
 * 캐시 추상화 배럴. 소비자는 PolicyCache 인터페이스에만 의존하고,
 * 구현체(LocalJsonCache ↔ 향후 FirestoreCache)는 교체 가능하다.
 */
export type { CachedPolicy, PolicyCache } from './types';
export { LocalJsonCache } from './localJsonCache';
// Phase 2는 LocalJsonCache만 구현. FirestoreCache는 동일 PolicyCache 계약 뒤에서
// Phase 5+ 운영 단계에 추가한다(자리만 — 구현 없음).
