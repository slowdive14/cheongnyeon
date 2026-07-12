import { describe, it, expect } from 'vitest';
import { cleanDocumentsText } from '@/domain/parse/documentsText';

/**
 * 제출서류 공용 노이즈 가드(F-⑤ SSOT) — 온통·서울 어댑터 공용.
 * 원칙: 통과 시 원문 그대로(가공 0), 걸러지면 null(펼침 미노출 — "없는 게 낫다").
 */
describe('cleanDocumentsText', () => {
  it('유효 서류 목록은 원문 그대로(trim) 통과', () => {
    const raw = '  주민등록등본 1부\r\n소득금액증명 1부  ';
    expect(cleanDocumentsText(raw)).toBe('주민등록등본 1부\r\n소득금액증명 1부');
  });

  it('화살표·대시 쓰레기값(한글 2자 미만) → null (서울 실데이터 "--> --> -")', () => {
    expect(cleanDocumentsText('--> --> -')).toBeNull();
    expect(cleanDocumentsText('→ → ※')).toBeNull();
    expect(cleanDocumentsText('   ')).toBeNull();
    expect(cleanDocumentsText(null)).toBeNull();
    expect(cleanDocumentsText(undefined)).toBeNull();
  });

  it('저정보 토큰("해당없음"·"별도 공지" 등 완전 일치) → null', () => {
    expect(cleanDocumentsText('해당없음')).toBeNull();
    expect(cleanDocumentsText('해당 사항 없음')).toBeNull();
    expect(cleanDocumentsText('※ 별도 공지')).toBeNull();
    expect(cleanDocumentsText('추후 안내')).toBeNull();
  });

  it('무정보 상용구("붙임파일 확인") → null (온통 실측 다수 — 전 카드 동일 문구 방지)', () => {
    expect(cleanDocumentsText('☞ 자세한 내용은 붙임파일을 확인해주시기 바랍니다')).toBeNull();
    expect(cleanDocumentsText('자세한 내용은 첨부파일 참고')).toBeNull();
  });

  it('붙임 언급이 있어도 실제 서류 명사가 함께 있으면 유지(보수 — 과차단 방지)', () => {
    const raw = '주민등록등본 1통, 그 외 첨부파일 확인';
    expect(cleanDocumentsText(raw)).toBe(raw);
  });

  it('붙임 언급이 있어도 100자 초과 긴 원문은 유지(보수)', () => {
    const long = `${'가'.repeat(95)} 붙임파일 확인 바랍니다`;
    expect(cleanDocumentsText(long)).toBe(long);
  });
});
