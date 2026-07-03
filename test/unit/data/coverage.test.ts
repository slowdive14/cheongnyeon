import { describe, it, expect } from 'vitest';
import { normalizeName, similarity, computeCoverage } from '@/data/coverage';
import type { Policy } from '@/domain/types';

/**
 * Test 2.3 — 커버리지 갭 (순수)
 *
 * 정규화: 공백/기호 제거, 기관명 동의어(서울시↔서울특별시↔서울, (재)/(사) 제거).
 * 유사도: Jaccard(토큰) + 정규화 Levenshtein의 max, 자체 구현, 임계 ≥0.85.
 *  - ==1 & 키동일 → 자동 동일.
 *  - ≥0.85 → manualReviewCandidates (자동 동일 금지).
 *  - <0.85 → 다름.
 */

function pol(over: Partial<Policy> & { title: string }): Policy {
  const base: Policy = {
    id: 'X',
    title: 'untitled',
    summary: null,
    ageMin: null,
    ageMax: null,
    income: { kind: 'unknown', raw: null },
    regionCodes: ['11'],
    regionText: '서울',
    isNationwide: false,
    recruit: { kind: 'unknown', start: null, end: null },
    category: null,
    sourceUrl: null,
    source: 'ontong',
    raw: {},
  };
  return { ...base, ...over };
}

describe('normalizeName', () => {
  it('공백/기호 제거', () => {
    expect(normalizeName('청년 월세 (지원)')).toBe(normalizeName('청년월세지원'));
  });

  it('기관 동의어: 서울시 ↔ 서울특별시 ↔ 서울', () => {
    const a = normalizeName('서울특별시');
    const b = normalizeName('서울시');
    const c = normalizeName('서울');
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('(재)/(사) 제거', () => {
    expect(normalizeName('(재)서울장학재단')).toBe(normalizeName('서울장학재단'));
    expect(normalizeName('(사)청년재단')).toBe(normalizeName('청년재단'));
  });
});

describe('similarity', () => {
  it('완전 동일 → 1', () => {
    expect(similarity('청년월세지원', '청년월세지원')).toBe(1);
  });

  it('완전 무관 → 낮음 (<0.85)', () => {
    expect(similarity('청년월세지원', '노인일자리사업')).toBeLessThan(0.85);
  });

  it('경계: 1자 차이(0.857) ≥ 0.85 → 후보', () => {
    // "청년월세지원금"(7) vs "청년월세지원"(6): Levenshtein dist 1, 1 - 1/7 ≈ 0.857
    const high = similarity('청년월세지원금', '청년월세지원');
    expect(high).toBeGreaterThanOrEqual(0.85);
  });

  it('경계: 2자 차이(0.75) < 0.85 → 다름', () => {
    // "청년월세한시지원"(8) vs "청년월세지원"(6): dist 2, 1 - 2/8 = 0.75
    const low = similarity('청년월세한시지원', '청년월세지원');
    expect(low).toBeLessThan(0.85);
  });

  it('빈 문자열 양쪽 → 1, 한쪽만 빈 → 낮음', () => {
    expect(similarity('', '')).toBe(1);
    expect(similarity('청년정책', '')).toBeLessThan(0.85);
  });

  it('동일 단일 토큰(공백 없음) → 1', () => {
    expect(similarity('청년', '청년')).toBe(1);
  });

  it('Jaccard와 Levenshtein의 max를 취한다', () => {
    // 토큰 재배열로 Jaccard는 높고 Levenshtein은 낮을 수 있음 → max로 높은 쪽 채택
    const s = similarity('월세 지원 청년', '청년 지원 월세');
    expect(s).toBeGreaterThanOrEqual(0.85);
  });
});

describe('computeCoverage', () => {
  it('C1: 동의어 매칭 → matched', () => {
    const ontong = [pol({ id: 'O1', title: '청년월세지원', raw: { orgName: '서울특별시' } })];
    const mongttang = [pol({ id: 'M1', title: '청년월세지원', raw: { orgName: '서울시' }, source: 'mongttang' })];
    const r = computeCoverage(ontong, mongttang);
    expect(r.matched).toBe(1);
    expect(r.mongttangOnly).toHaveLength(0);
    expect(r.gapRate).toBe(0);
  });

  it('C2/C8: ≥0.85 유사 → manualReviewCandidates (자동 동일 금지)', () => {
    const ontong = [pol({ id: 'O1', title: '청년월세지원금', raw: { orgName: '서울시' } })];
    const mongttang = [pol({ id: 'M1', title: '청년월세지원', raw: { orgName: '서울특별시' }, source: 'mongttang' })];
    const r = computeCoverage(ontong, mongttang);
    expect(r.matched).toBe(0);
    expect(r.manualReviewCandidates.length).toBeGreaterThanOrEqual(1);
    const cand = r.manualReviewCandidates[0]!;
    expect(cand.score).toBeGreaterThanOrEqual(0.85);
    expect(cand.score).toBeLessThan(1);
  });

  it('C3: 몽땅 전용 → mongttangOnly', () => {
    const ontong = [pol({ id: 'O1', title: '청년월세지원', raw: { orgName: '서울시' } })];
    const mongttang = [pol({ id: 'M1', title: '청년부동산중개비지원', raw: { orgName: '서울시' }, source: 'mongttang' })];
    const r = computeCoverage(ontong, mongttang);
    expect(r.mongttangOnly).toHaveLength(1);
    expect(r.matched).toBe(0);
    expect(r.gapRate).toBe(1);
  });

  it('C4: 완전 다름 → 매칭 없음', () => {
    const ontong = [pol({ id: 'O1', title: '청년월세지원', raw: { orgName: '서울시' } })];
    const mongttang = [pol({ id: 'M1', title: '노인일자리', raw: { orgName: '부산광역시' }, source: 'mongttang' })];
    const r = computeCoverage(ontong, mongttang);
    expect(r.matched).toBe(0);
    expect(r.manualReviewCandidates).toHaveLength(0);
    expect(r.mongttangOnly).toHaveLength(1);
  });

  it('C5: 빈 ontong → gapRate 1.0', () => {
    const mongttang = [pol({ id: 'M1', title: '청년월세지원', source: 'mongttang' })];
    const r = computeCoverage([], mongttang);
    expect(r.gapRate).toBe(1);
    expect(r.totalOntong).toBe(0);
  });

  it('C6: 빈 mongttang → gapRate 0', () => {
    const ontong = [pol({ id: 'O1', title: '청년월세지원' })];
    const r = computeCoverage(ontong, []);
    expect(r.gapRate).toBe(0);
    expect(r.totalMongttang).toBe(0);
    expect(r.mongttangOnly).toHaveLength(0);
  });

  it('C7: 깨진 항목 포함 → throw 금지', () => {
    const ontong = [pol({ id: 'O1', title: '청년월세지원' })];
    const mongttang = [null, { title: undefined }, pol({ id: 'M1', title: '청년월세지원', source: 'mongttang' })];
    // @ts-expect-error 깨진 입력 전달
    expect(() => computeCoverage(ontong, mongttang)).not.toThrow();
  });

  it('generatedAt은 null (순수·결정성)', () => {
    const r = computeCoverage([], []);
    expect(r.generatedAt).toBeNull();
  });
});
