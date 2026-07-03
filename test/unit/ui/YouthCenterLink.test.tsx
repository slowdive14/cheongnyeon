import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { YouthCenterLink } from '@/ui/funnel/YouthCenterLink';

/**
 * T-F3 동행 블록 — 시·도명 반영·날조 0(전화·기관명 미렌더)·통일 링크 실존.
 */

describe('YouthCenterLink', () => {
  it("regionCode '26' → 부산광역시 청년센터 문구", () => {
    render(<YouthCenterLink regionCode="26" />);
    expect(screen.getByText(/부산광역시 청년센터가 같이 해줘요/)).toBeInTheDocument();
  });

  it('regionCode 미입력 → 지역명 없는 일반 문구(throw 0)', () => {
    expect(() => render(<YouthCenterLink />)).not.toThrow();
    expect(screen.getByText(/혼자 하기 버거우면 청년센터가 같이 해줘요/)).toBeInTheDocument();
  });

  it('phone/centerName null(v1) → 전화번호·기관명 UI 미렌더(날조 0)', () => {
    render(<YouthCenterLink regionCode="26" />);
    // 검증 안 된 번호 부재.
    expect(screen.queryByText(/\d{2,4}-\d{3,4}-\d{4}/)).toBeNull();
    // tel: 링크 부재.
    const links = screen.getAllByRole('link');
    expect(links.every((a) => !a.getAttribute('href')?.startsWith('tel:'))).toBe(true);
  });

  it('통일 링크 = 온통청년 공식(target _blank·noreferrer)', () => {
    render(<YouthCenterLink regionCode="26" />);
    const link = screen.getByRole('link', { name: /청년센터 찾기/ });
    expect(link).toHaveAttribute('href', 'https://www.youthcenter.go.kr');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer noopener');
  });

  it('위기(전문기관) 문구 부재(층위 구분)', () => {
    render(<YouthCenterLink regionCode="26" />);
    expect(screen.queryByText(/109|1577-0199|자살예방|생명의전화/)).toBeNull();
  });

  it('알 수 없는 regionCode → 일반 문구 폴백(throw 0)', () => {
    expect(() => render(<YouthCenterLink regionCode="99" />)).not.toThrow();
    expect(screen.getByText(/청년센터가 같이 해줘요/)).toBeInTheDocument();
  });
});
