import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChoiceChips } from '@/ui/funnel/ChoiceChips';
import { FunnelStep } from '@/ui/funnel/FunnelStep';
import type { GraphNode } from '@/domain/types';

function node(id: string, label: string, kind: GraphNode['kind'] = 'leaf'): GraphNode {
  return { id, label, concept: label, kind };
}

describe('ChoiceChips', () => {
  it('N개 choices → N개 버튼', () => {
    render(
      <ChoiceChips choices={[node('a', 'A'), node('b', 'B'), node('c', 'C')]} onSelect={vi.fn()} />,
    );
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });

  it('클릭 → onSelect(id)', () => {
    const onSel = vi.fn();
    render(<ChoiceChips choices={[node('a', 'A')]} onSelect={onSel} />);
    fireEvent.click(screen.getByRole('button', { name: 'A' }));
    expect(onSel).toHaveBeenCalledWith('a');
  });

  it('빈 choices → 0 버튼, throw 없음', () => {
    expect(() => render(<ChoiceChips choices={[]} onSelect={vi.fn()} />)).not.toThrow();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('비배열 choices → 0 버튼(throw 없음)', () => {
    expect(() =>
      render(<ChoiceChips choices={null as unknown as never} onSelect={vi.fn()} />),
    ).not.toThrow();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('null 항목 섞여도 throw 없이 유효 노드만 렌더', () => {
    render(
      <ChoiceChips
        choices={[null as unknown as never, node('a', 'A')]}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('safety kind 노드 제외', () => {
    render(
      <ChoiceChips
        choices={[node('a', 'A'), node('s', '위급', 'safety')]}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByText('위급')).toBeNull();
  });

  it('T-E3: 카테고리 아이콘 렌더(aria-hidden 장식), 접근명은 라벨 유지', () => {
    const mh: GraphNode = { id: 'mh.x', label: '마음이 지쳐요', concept: 'c', kind: 'leaf', allowedCategories: ['마음건강'] };
    render(<ChoiceChips choices={[mh]} onSelect={vi.fn()} />);
    const btn = screen.getByRole('button', { name: '마음이 지쳐요' });
    // 장식 아이콘(svg) 존재 + aria-hidden.
    const svg = btn.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
  });

  it('T-E3: 아이콘 없어도(카테고리 미지정) throw 0·라벨 렌더', () => {
    expect(() => render(<ChoiceChips choices={[node('a', 'A')]} onSelect={vi.fn()} />)).not.toThrow();
    expect(screen.getByRole('button', { name: 'A' }).querySelector('svg')).not.toBeNull();
  });
});

describe('FunnelStep', () => {
  it('node children → 칩, 클릭 onSelect(id)', () => {
    const onSel = vi.fn();
    const n: GraphNode = {
      id: 'entry',
      label: '입구',
      concept: '입구',
      kind: 'entry',
      children: [node('a', 'A'), node('b', 'B')],
    };
    render(<FunnelStep node={n} onSelect={onSel} onBack={vi.fn()} stepIndex={0} />);
    expect(screen.getAllByRole('button', { name: /A|B/ })).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'A' }));
    expect(onSel).toHaveBeenCalledWith('a');
  });

  it('stepIndex>0 → 뒤로 버튼, 클릭 onBack', () => {
    const onBack = vi.fn();
    const n: GraphNode = { id: 'n', label: 'n', concept: 'n', kind: 'leaf', children: [node('a', 'A')] };
    render(<FunnelStep node={n} onSelect={vi.fn()} onBack={onBack} stepIndex={1} />);
    fireEvent.click(screen.getByRole('button', { name: /뒤로/ }));
    expect(onBack).toHaveBeenCalled();
  });

  it('stepIndex=0 → 뒤로 버튼 없음', () => {
    const n: GraphNode = { id: 'n', label: 'n', concept: 'n', kind: 'entry', children: [node('a', 'A')] };
    render(<FunnelStep node={n} onSelect={vi.fn()} onBack={vi.fn()} stepIndex={0} />);
    expect(screen.queryByRole('button', { name: /뒤로/ })).toBeNull();
  });

  it('children/label 없는 노드 → throw 없이 빈 칩 영역', () => {
    const n = { id: 'n', concept: 'n', kind: 'leaf' } as unknown as GraphNode;
    expect(() =>
      render(<FunnelStep node={n} onSelect={vi.fn()} onBack={vi.fn()} stepIndex={0} />),
    ).not.toThrow();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
