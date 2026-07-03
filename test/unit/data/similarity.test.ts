import { describe, it, expect } from 'vitest';
import { SIMILARITY_THRESHOLD, normalizeName, similarity, pairSimilarity } from '@/data/similarity';

/**
 * 공용 유사도 모듈 — coverage·ingest 드리프트 제거 단일 진실원.
 * 임계 상수·정규화·쌍 유사도가 한 곳에서 정의되고 양 모듈이 동일 결과를 내는지 고정.
 */

describe('SIMILARITY_THRESHOLD', () => {
  it('임계 상수는 0.85 단일 진실원', () => {
    expect(SIMILARITY_THRESHOLD).toBe(0.85);
  });
});

describe('pairSimilarity', () => {
  it('정규화명+기관 키 완전 동일 → 1 (자동 동일 후보)', () => {
    // 기관 동의어(서울시/서울특별시)·공백 차이를 흡수해 키가 같아짐.
    expect(pairSimilarity('서울 청년 정책', '서울시', '서울청년정책', '서울특별시')).toBe(1);
  });

  it('명 1자 차 + 기관 동의어 동일 → ≥0.85 <1 (수동검증 후보)', () => {
    const s = pairSimilarity('청년월세지원금', '서울시', '청년월세지원', '서울특별시');
    expect(s).toBeGreaterThanOrEqual(0.85);
    expect(s).toBeLessThan(1);
  });

  it('명·기관 모두 무관 → <0.85', () => {
    expect(pairSimilarity('청년월세지원', '서울시', '노인일자리', '부산광역시')).toBeLessThan(0.85);
  });

  it('빈 키끼리(둘 다 빈 문자열)는 1로 보지 않음 (오매칭 방지)', () => {
    expect(pairSimilarity('', '', '', '')).not.toBe(1);
  });
});

describe('normalizeName / similarity (재노출 동일성)', () => {
  it('coverage 재노출과 동일 구현', () => {
    expect(normalizeName('(재)서울장학재단')).toBe(normalizeName('서울장학재단'));
    expect(similarity('월세 지원 청년', '청년 지원 월세')).toBeGreaterThanOrEqual(0.85);
  });
});
