import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SafetyInlineNotice } from '@/ui/funnel/SafetyInlineNotice';
import { safetyResources } from '@/domain/safetyResources';

/**
 * 작성 중 위기 인라인 배너(§7.1a) — SafetyBanner.test와 대칭(검수 Low-2/L3 잠금).
 * 위기 청년이 실제로 탭하는 표면: 번호·tel 링크가 빈 alert로 퇴행하지 않게 기계적으로 잠근다.
 */
describe('SafetyInlineNotice', () => {
  it('resources를 렌더(라벨·전화번호)', () => {
    render(<SafetyInlineNotice resources={safetyResources()} />);
    expect(screen.getByText(/자살예방상담전화/)).toBeInTheDocument();
    expect(screen.getByText(/109/)).toBeInTheDocument();
    expect(screen.getByText(/1577-0199/)).toBeInTheDocument();
  });

  it('role=alert + safety-inline region (스크린리더 우선·표면 식별)', () => {
    render(<SafetyInlineNotice resources={safetyResources()} />);
    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert.getAttribute('data-funnel-region')).toBe('safety-inline');
  });

  it('전화번호 tel: 링크 2건', () => {
    render(<SafetyInlineNotice resources={safetyResources()} />);
    expect(screen.getByRole('link', { name: /109/ })).toHaveAttribute('href', 'tel:109');
    expect(screen.getByRole('link', { name: /1577-0199/ })).toHaveAttribute('href', 'tel:1577-0199');
  });

  it('헤드라인은 SafetyBanner와 동일 문구(안전 표면 톤 일관)', () => {
    render(<SafetyInlineNotice resources={safetyResources()} />);
    expect(screen.getByText('지금 많이 힘드시다면, 혼자 견디지 않아도 됩니다')).toBeInTheDocument();
  });

  it('빈 resources → throw 없이 렌더', () => {
    expect(() => render(<SafetyInlineNotice resources={[]} />)).not.toThrow();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('비배열 resources → 빈으로 흡수(throw 없음)', () => {
    expect(() =>
      render(<SafetyInlineNotice resources={null as unknown as never} />),
    ).not.toThrow();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('available 없는 자원 → 시간 라벨 생략, throw 없음', () => {
    render(<SafetyInlineNotice resources={[{ label: '긴급상담센터', phone: '109', available: '' }]} />);
    expect(screen.getByText(/긴급상담센터/)).toBeInTheDocument();
  });
});
