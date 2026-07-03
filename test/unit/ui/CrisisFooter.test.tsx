import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CrisisFooter } from '@/ui/funnel/CrisisFooter';

/**
 * RED-5 / Task 6.7 (M1) — 비위기 결과 화면 상시 위기 안내 푸터.
 *
 * 리더 결정: 푸터는 결과 화면 한정. 위기 화면은 SafetyBanner 단독(푸터와 충돌 금지).
 * 불변식: 109·1577-0199 상담 링크 상시 노출(취약 청년 안전망).
 */

describe('CrisisFooter — M1 결과 화면 위기 안내', () => {
  it('M1-1 109·1577-0199 상담 링크 노출', () => {
    render(<CrisisFooter />);
    const footer = screen.getByTestId('crisis-footer');
    expect(footer).toBeInTheDocument();
    expect(footer.textContent).toContain('109');
    expect(footer.textContent).toContain('1577-0199');
  });

  it('M1-1b tel: 링크가 실제 걸려있음(클릭 가능)', () => {
    render(<CrisisFooter />);
    const tel109 = screen.getByRole('link', { name: /109/ });
    expect(tel109).toHaveAttribute('href', 'tel:109');
    const tel1577 = screen.getByRole('link', { name: /1577-0199/ });
    expect(tel1577).toHaveAttribute('href', 'tel:1577-0199');
  });

  it('M1-2 푸터는 role="alert"가 아님(SafetyBanner와 충돌 없는 보조 안내)', () => {
    render(<CrisisFooter />);
    const footer = screen.getByTestId('crisis-footer');
    expect(footer.getAttribute('role')).not.toBe('alert');
  });
});
