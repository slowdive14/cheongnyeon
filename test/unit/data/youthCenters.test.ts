import { describe, it, expect } from 'vitest';
import {
  YOUTH_CENTERS,
  YOUTH_CENTER_URL,
  getYouthCenter,
  youthCenterMessage,
} from '@/data/static/youthCenters';

/**
 * T-F3 데이터 — 안전 바닥선: 검증 안 된 전화번호·기관명 날조 금지(v1은 전부 null).
 */

describe('YOUTH_CENTERS 데이터', () => {
  it('17개 시·도 레코드', () => {
    expect(YOUTH_CENTERS).toHaveLength(17);
  });

  it('v1은 phone/centerName 전부 null(날조 0)', () => {
    for (const c of YOUTH_CENTERS) {
      expect(c.phone).toBeNull();
      expect(c.centerName).toBeNull();
    }
  });

  it('regionCode 중복 없음', () => {
    const codes = YOUTH_CENTERS.map((c) => c.regionCode);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('통일 링크는 온통청년 공식 도메인', () => {
    expect(YOUTH_CENTER_URL).toMatch(/^https:\/\/www\.youthcenter\.go\.kr/);
  });
});

describe('getYouthCenter', () => {
  it("'26' → 부산 레코드", () => {
    expect(getYouthCenter('26')?.regionCode).toBe('26');
  });
  it('미지 코드 → undefined(throw 0)', () => {
    expect(getYouthCenter('99')).toBeUndefined();
  });
  it('빈·null·undefined → undefined(throw 0)', () => {
    expect(getYouthCenter('')).toBeUndefined();
    expect(getYouthCenter(null)).toBeUndefined();
    expect(getYouthCenter(undefined)).toBeUndefined();
  });
});

describe('youthCenterMessage', () => {
  it("'26' → 부산광역시 청년센터 문구", () => {
    expect(youthCenterMessage('26')).toMatch(/부산광역시 청년센터가 같이 해줘요/);
  });
  it('미입력 → 지역명 없는 일반 문구', () => {
    expect(youthCenterMessage(undefined)).toMatch(/청년센터가 같이 해줘요/);
    expect(youthCenterMessage(undefined)).not.toMatch(/광역시|특별시|도 청년센터/);
  });
  it('미지 코드 → 일반 문구 폴백(throw 0)', () => {
    expect(youthCenterMessage('99')).toMatch(/청년센터가 같이 해줘요/);
  });
  it('위기(전문기관) 톤 문구 부재(층위 구분)', () => {
    for (const code of ['26', undefined]) {
      expect(youthCenterMessage(code)).not.toMatch(/109|1577-0199|자살예방|생명의전화/);
    }
  });
});
