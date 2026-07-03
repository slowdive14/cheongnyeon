/**
 * 욕구 그래프 스키마 (Phase 4 REFACTOR 4.11 — 도메인 무관 분리).
 *
 * GraphNode 정의는 도메인 타입(types.ts)에 단일 선언으로 두고, 그래프 모듈은
 * 여기서 재노출한다(검색·도메인 데이터가 동일 계약을 소비). Q-2: boostCategories/boostKeywords 추가됨.
 */

export type { GraphNode } from '../types';
