import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

/**
 * T-F3 동행 블록 — 검증된 연락처가 있을 때만 렌더(무실효 일반링크 블록 방지),
 *  시·도명 반영, 위기 톤과 층위 구분. 데이터가 전량 null(v1)이므로 렌더 케이스는 모킹으로 검증.
 */

// 검증 연락처 유무를 제어: '26'=검증됨(전화·기관명), 그 외=미검증(null), '99'=미지(undefined).
vi.mock('@/data/static/youthCenters', () => ({
  YOUTH_CENTER_URL: 'https://www.youthcenter.go.kr',
  youthCenterMessage: (rc?: string) =>
    rc === '26'
      ? '혼자 하기 버거우면 부산광역시 청년센터가 같이 해줘요'
      : '혼자 하기 버거우면 청년센터가 같이 해줘요',
  getYouthCenter: (rc?: string) =>
    rc === '26'
      ? { regionCode: '26', centerName: '부산광역시 청년센터', phone: '051-123-4567' }
      : rc === '99'
        ? undefined
        : { regionCode: rc, centerName: null, phone: null },
}));

import { YouthCenterLink } from '@/ui/funnel/YouthCenterLink';

describe('YouthCenterLink', () => {
  it('검증 연락처 있음(26) → 문구·기관명·전화 렌더', () => {
    render(<YouthCenterLink regionCode="26" />);
    expect(screen.getByText(/부산광역시 청년센터가 같이 해줘요/)).toBeInTheDocument();
    expect(screen.getByText('부산광역시 청년센터')).toBeInTheDocument();
    const tel = screen.getByRole('link', { name: '051-123-4567' });
    expect(tel).toHaveAttribute('href', 'tel:051-123-4567');
  });

  it('검증 연락처 없음(phone·centerName null) → 미렌더(무실효 블록 방지)', () => {
    const { container } = render(<YouthCenterLink regionCode="11" />);
    expect(container.firstChild).toBeNull();
  });

  it('미지 regionCode(99) → 미렌더(throw 0)', () => {
    const { container } = render(<YouthCenterLink regionCode="99" />);
    expect(container.firstChild).toBeNull();
  });

  it('위기(전문기관) 문구 부재(층위 구분)', () => {
    render(<YouthCenterLink regionCode="26" />);
    expect(screen.queryByText(/109|1577-0199|자살예방|생명의전화/)).toBeNull();
  });
});
