import { describe, it, expect } from 'vitest';
import { DOCUMENTS, getDocument } from '@/data/static/documents';

/**
 * T-F2 — 서류 사전 데이터 정확성(R-4). 지어내기 금지: issuer 필수, 불확실은 null.
 */

describe('DOCUMENTS 데이터', () => {
  it('약 10개 레코드', () => {
    expect(DOCUMENTS.length).toBeGreaterThanOrEqual(8);
    expect(DOCUMENTS.length).toBeLessThanOrEqual(14);
  });

  it('모든 레코드 issuer 비어있지 않음(지어내기 금지 강제)', () => {
    for (const d of DOCUMENTS) {
      expect(typeof d.issuer).toBe('string');
      expect(d.issuer.trim().length).toBeGreaterThan(0);
    }
  });

  it('모든 레코드 name 비어있지 않음', () => {
    for (const d of DOCUMENTS) {
      expect(d.name.trim().length).toBeGreaterThan(0);
    }
  });

  it('불확실 항목은 fee/estMinutes를 지어내지 않고 null', () => {
    // 재직·재학증명은 발급처·수수료가 기관마다 달라 null 폴백(확인 필요).
    const employment = getDocument('employment_cert')!;
    expect(employment.fee).toBeNull();
    expect(employment.estMinutes).toBeNull();
  });

  it('상식 검증: 주민등록등본 issuer에 정부24, 무료', () => {
    const doc = getDocument('resident_copy')!;
    expect(doc.issuer).toContain('정부24');
    expect(doc.fee).toBe(0);
  });

  it('id 중복 없음', () => {
    const ids = DOCUMENTS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('getDocument', () => {
  it('존재 id → 레코드', () => {
    expect(getDocument('income_cert')?.name).toBe('소득금액증명');
  });
  it('없는 id → undefined(throw 0)', () => {
    expect(getDocument('nope')).toBeUndefined();
  });
  it('빈 문자열·null → undefined(throw 0)', () => {
    expect(getDocument('')).toBeUndefined();
    expect(getDocument(null)).toBeUndefined();
    expect(getDocument(undefined)).toBeUndefined();
  });
});
