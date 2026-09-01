import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PrivacyNote } from '@/ui/funnel/PrivacyNote';

/**
 * 개인정보 안내(P1) — 홈·결과 화면 공통 최하단.
 *
 * 리더 결정: 위기 화면(작성 중·제출 모두)에는 미렌더 — 배치로 보장(하단 공통 블록 내부).
 * 안전·신뢰 불변식:
 *  - 축3(확신보다 정직): 저장하지 않는다는 사실뿐 아니라 **제3자(구글 AI) 전송 사실도** 함께 고지.
 *    유리한 것만 말하고 불리한 것을 빠뜨리면 고지가 아니라 홍보가 된다.
 *  - 위기 문장 미전송(traverse가 검색 전 위기 판정 → 전송 자체 없음)을 일반 사용자 언어로 안내.
 *  - role="alert" 아님(보조 안내 — SafetyBanner의 위기 우선 alert와 충돌 금지).
 *  - 순수 표시(부수효과 0·throw-free).
 */

describe('PrivacyNote — P1 개인정보 안내', () => {
  it('P1-1 요약 문구 노출(접힌 상태에서도 핵심이 보임)', () => {
    render(<PrivacyNote />);
    const note = screen.getByTestId('privacy-note');
    expect(note).toBeInTheDocument();
    expect(note.textContent).toContain('저장하지 않아요');
  });

  it('P1-2 funnel-region 식별자(안전 감사·회귀 추적용)', () => {
    render(<PrivacyNote />);
    expect(screen.getByTestId('privacy-note').getAttribute('data-funnel-region')).toBe('privacy-note');
  });

  it('P1-3 로그인·개인정보를 받지 않는다는 사실 고지', () => {
    render(<PrivacyNote />);
    const t = screen.getByTestId('privacy-note').textContent ?? '';
    expect(t).toContain('로그인');
    expect(t).toContain('이름');
  });

  it('P1-4 ★위기 문장 미전송을 쉬운 말로 고지(기술어 금지)', () => {
    render(<PrivacyNote />);
    const t = screen.getByTestId('privacy-note').textContent ?? '';
    // 일반 사용자 언어: "전송되지 않아요" + "화면 안에서만"(기기·단말 같은 말 대체).
    expect(t).toContain('전송되지 않아요');
    expect(t).toContain('화면 안에서만');
    // 기술어가 새어나오면 안내가 아니라 문서가 된다.
    expect(t).not.toContain('기기');
    expect(t).not.toContain('단말');
    expect(t).not.toContain('클라이언트');
    expect(t).not.toContain('로컬');
  });

  it('P1-5 ★제3자 전송(구글 AI) 고지 — 정직 원칙(불리한 사실 누락 금지)', () => {
    render(<PrivacyNote />);
    const t = screen.getByTestId('privacy-note').textContent ?? '';
    expect(t).toContain('구글');
  });

  it('P1-6 휴대폰에만 남는 항목(지역·저장한 정책) 고지', () => {
    render(<PrivacyNote />);
    const t = screen.getByTestId('privacy-note').textContent ?? '';
    expect(t).toContain('지역');
    expect(t).toContain('저장한 정책');
  });

  it('P1-7 role="alert" 아님(SafetyBanner 위기 우선 alert와 충돌 금지)', () => {
    render(<PrivacyNote />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('P1-8 반복 렌더에도 throw 없음(순수 표시)', () => {
    expect(() => {
      render(<PrivacyNote />);
      render(<PrivacyNote />);
    }).not.toThrow();
  });
});
