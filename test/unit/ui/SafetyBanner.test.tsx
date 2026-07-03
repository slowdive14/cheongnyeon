import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SafetyBanner } from '@/ui/funnel/SafetyBanner';
import { safetyResources } from '@/domain/safetyResources';

describe('SafetyBanner', () => {
  it('resources를 렌더(라벨·전화번호)', () => {
    render(<SafetyBanner resources={safetyResources()} />);
    expect(screen.getByText(/자살예방상담전화/)).toBeInTheDocument();
    expect(screen.getByText(/109/)).toBeInTheDocument();
    expect(screen.getByText(/1577-0199/)).toBeInTheDocument();
  });

  it('role=alert (스크린리더 우선)', () => {
    render(<SafetyBanner resources={safetyResources()} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('전화번호 tel: 링크', () => {
    render(<SafetyBanner resources={safetyResources()} />);
    const link = screen.getByRole('link', { name: /109/ });
    expect(link).toHaveAttribute('href', 'tel:109');
  });

  it('빈 resources → throw 없이 렌더', () => {
    expect(() => render(<SafetyBanner resources={[]} />)).not.toThrow();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('비배열 resources → 빈으로 흡수(throw 없음)', () => {
    expect(() =>
      render(<SafetyBanner resources={null as unknown as never} />),
    ).not.toThrow();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('available 없는 자원 → 시간 라벨 생략, throw 없음', () => {
    render(<SafetyBanner resources={[{ label: '긴급상담센터', phone: '109', available: '' }]} />);
    expect(screen.getByText(/긴급상담센터/)).toBeInTheDocument();
  });
});
