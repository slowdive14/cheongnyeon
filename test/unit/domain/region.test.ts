import { describe, it, expect } from 'vitest';
import { parseRegion } from '@/domain/parse/region';
import { sidoNameByPrefix, SIDO_LIST } from '@/domain/parse/sido';

/**
 * 지역 17 시·도 매핑 (스코프 확장 P2A). 안전: 불명 ≠ 전국, 불명 코드 빈 배열(보수).
 */
describe('parseRegion — 17 시·도', () => {
  it('서울특별시 → 11', () => {
    expect(parseRegion({ regionText: '서울특별시' }).regionCodes).toEqual(['11']);
  });

  it('부산 26 / 경기 41 / 강원특자 51 / 전북특자 52', () => {
    expect(parseRegion({ regionText: '부산광역시' }).regionCodes).toEqual(['26']);
    expect(parseRegion({ regionText: '경기도' }).regionCodes).toEqual(['41']);
    expect(parseRegion({ regionText: '강원특별자치도' }).regionCodes).toEqual(['51']);
    expect(parseRegion({ regionText: '전북특별자치도' }).regionCodes).toEqual(['52']);
  });

  it('다수 시·도 동시 명시 → 모두 수집', () => {
    expect(parseRegion({ regionText: '서울특별시 부산광역시' }).regionCodes.sort()).toEqual(['11', '26']);
  });

  it('광주광역시 29 — 경기도와 충돌 없음', () => {
    expect(parseRegion({ regionText: '광주광역시' }).regionCodes).toEqual(['29']);
    expect(parseRegion({ regionText: '경기도' }).regionCodes).not.toContain('29');
  });

  it('충북/충남 약칭 구분', () => {
    expect(parseRegion({ regionText: '충청북도' }).regionCodes).toEqual(['43']);
    expect(parseRegion({ regionText: '충청남도' }).regionCodes).toEqual(['44']);
  });

  it('미인식 텍스트 → 빈 배열(보수)', () => {
    expect(parseRegion({ regionText: '어딘가' }).regionCodes).toEqual([]);
  });

  it('전국 → isNationwide true, 코드는 시·도 명시 시만(전국 단독은 빈 코드)', () => {
    const r = parseRegion({ regionText: '전국' });
    expect(r.isNationwide).toBe(true);
    expect(r.regionCodes).toEqual([]);
  });

  it('regionText 없음 → 빈 결과(불명≠전국)', () => {
    const r = parseRegion({});
    expect(r.regionCodes).toEqual([]);
    expect(r.isNationwide).toBe(false);
  });
});

describe('sido 테이블', () => {
  it('17개 시·도, prefix→명칭, 미지정 prefix undefined', () => {
    expect(SIDO_LIST.length).toBe(17);
    expect(sidoNameByPrefix('11')).toBe('서울특별시');
    expect(sidoNameByPrefix('51')).toBe('강원특별자치도');
    expect(sidoNameByPrefix('99')).toBeUndefined();
  });
});
