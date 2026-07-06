import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SavedPolicies } from '@/ui/funnel/SavedPolicies';
import type { SavedPolicy } from '@/ui/funnel/savedPoliciesStore';

/** F-④ 내 신청함 뷰 — 목록·원문 링크·제거·빈 목록 미렌더. */

const ITEMS: SavedPolicy[] = [
  { id: 'V1', title: '2026 서울 청년수당', sourceUrl: 'https://youth.seoul.go.kr/x', source: 'seoul-youth', savedAt: '2026-07-05T00:00:00Z' },
  { id: 'O1', title: '청년월세 지원', sourceUrl: null, source: 'ontong', savedAt: '2026-07-04T00:00:00Z' },
];

describe('SavedPolicies', () => {
  it('항목 목록 + 제목 + 출처별 원문 라벨', () => {
    render(<SavedPolicies items={ITEMS} onRemove={() => {}} />);
    expect(screen.getByTestId('saved-policies')).toBeInTheDocument();
    expect(screen.getByText('2026 서울 청년수당')).toBeInTheDocument();
    expect(screen.getByText('신청 페이지 열기 (청년몽땅)')).toBeInTheDocument();
    // sourceUrl 없으면 링크 미표시(O1)
    expect(screen.queryByText('신청 페이지 열기 (온통청년)')).toBeNull();
  });

  it('빈 목록 → 미렌더(null)', () => {
    const { container } = render(<SavedPolicies items={[]} onRemove={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('제거 버튼 → onRemove(id)', () => {
    const onRemove = vi.fn();
    render(<SavedPolicies items={ITEMS} onRemove={onRemove} />);
    screen.getByRole('button', { name: '2026 서울 청년수당 신청함에서 빼기' }).click();
    expect(onRemove).toHaveBeenCalledWith('V1');
  });
});
