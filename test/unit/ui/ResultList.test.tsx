import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ResultList } from '@/ui/funnel/ResultList';
import type { EvaluatedPolicy, EvaluateResult } from '@/domain/eligibility';
import type { GraphNode, Policy } from '@/domain/types';

function ev(id: string, status: EvaluatedPolicy['recruitStatus'], reasons: EvaluatedPolicy['reasons'] = []): EvaluatedPolicy {
  const policy = {
    id,
    title: id,
    summary: null,
    ageMin: 19,
    ageMax: 39,
    income: { kind: 'none', raw: null },
    regionCodes: [],
    regionText: null,
    isNationwide: true,
    recruit: { kind: 'always', start: null, end: null },
    category: '마음건강',
    sourceUrl: 'https://example.com/' + id,
    source: 'ontong',
  } as Policy;
  return { policy, reasons, recruitStatus: status };
}

function node(id: string): GraphNode {
  return { id, label: id, concept: id, kind: 'leaf' };
}

describe('ResultList', () => {
  it('now1+soon1+blocked1+review1 → 카드 3(now/soon/review), blocked만 숨김', () => {
    const result: EvaluateResult = {
      now: [ev('now-1', 'now')],
      soon: [ev('soon-1', 'soon')],
      blocked: [ev('blocked-1', 'closed', ['RECRUIT_CLOSED'])],
      review: [ev('review-1', 'unknown', ['AGE_UNKNOWN'])],
    };
    render(<ResultList result={result} alternatives={[]} onSelectAlternative={vi.fn()} />);
    // review는 '확인 필요' 카드로 노출(Phase 5 결정 변경). blocked는 여전히 숨김(헛희망 차단).
    expect(screen.getAllByTestId('policy-result-card')).toHaveLength(3);
    expect(screen.getByText('review-1')).toBeInTheDocument();
    // 단일 사유(AGE_UNKNOWN) → '거의 다 왔어요' 등급. (다중 사유면 '몇 가지만 확인하면 돼요')
    expect(screen.getByText(/거의 다 왔어요|몇 가지만 확인하면 돼요/)).toBeInTheDocument();
    expect(screen.queryByText('blocked-1')).toBeNull();
  });

  it('review만(now/soon 0) → review 카드 노출, 대안 칩 미노출(showable>0)', () => {
    const result: EvaluateResult = {
      now: [],
      soon: [],
      blocked: [],
      review: [ev('review-1', 'unknown', ['AGE_UNKNOWN', 'RECRUIT_UNKNOWN'])],
    };
    render(
      <ResultList result={result} alternatives={[node('alt-a')]} onSelectAlternative={vi.fn()} />,
    );
    expect(screen.getAllByTestId('policy-result-card')).toHaveLength(1);
    expect(screen.getByText('review-1')).toBeInTheDocument();
    expect(screen.queryByTestId('alternatives')).toBeNull();
  });

  it('result=null → 카드 0', () => {
    render(<ResultList result={null} alternatives={[]} onSelectAlternative={vi.fn()} />);
    expect(screen.queryByTestId('policy-result-card')).toBeNull();
  });

  it('now·soon 0 + alternatives 2 → 대안 칩 2, blocked 직노출 0', () => {
    const result: EvaluateResult = { now: [], soon: [], blocked: [], review: [] };
    const onSel = vi.fn();
    render(
      <ResultList
        result={result}
        alternatives={[node('alt-a'), node('alt-b')]}
        onSelectAlternative={onSel}
      />,
    );
    expect(screen.queryByTestId('policy-result-card')).toBeNull();
    const alt = screen.getByTestId('alternatives');
    expect(alt).toBeInTheDocument();
    const btns = screen.getAllByRole('button');
    expect(btns).toHaveLength(2);
    fireEvent.click(btns[0]!);
    expect(onSel).toHaveBeenCalledWith('alt-a');
  });

  it('soon 단독 + policy.id 없음 → throw 없이 카드 렌더', () => {
    const broken = ev('', 'soon');
    (broken.policy as { id?: string }).id = undefined;
    const result: EvaluateResult = { now: [], soon: [broken], blocked: [], review: [] };
    expect(() =>
      render(<ResultList result={result} alternatives={[]} onSelectAlternative={vi.fn()} />),
    ).not.toThrow();
    expect(screen.getAllByTestId('policy-result-card')).toHaveLength(1);
  });

  it('now·soon 0 + alternatives 비배열 → 안내만, throw 없음', () => {
    const result: EvaluateResult = { now: [], soon: [], blocked: [], review: [] };
    expect(() =>
      render(
        <ResultList
          result={result}
          alternatives={null as unknown as never}
          onSelectAlternative={vi.fn()}
        />,
      ),
    ).not.toThrow();
    expect(screen.getByTestId('alternatives')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('동일 결과 재렌더 → 안정 key로 카드 DOM 노드 유지(Math.random 회귀 차단)', () => {
    const result: EvaluateResult = { now: [ev('now-1', 'now')], soon: [ev('soon-1', 'soon')], blocked: [], review: [] };
    const view = render(
      <ResultList result={result} alternatives={[]} onSelectAlternative={vi.fn()} />,
    );
    const before = screen.getAllByTestId('policy-result-card');
    const firstNode = before[0]!;
    const firstTitle = within(firstNode).getByRole('heading').textContent;
    // 동일 props 재렌더 — 안정 key면 reconciliation이 기존 노드를 보존한다.
    view.rerender(<ResultList result={result} alternatives={[]} onSelectAlternative={vi.fn()} />);
    const after = screen.getAllByTestId('policy-result-card');
    expect(after).toHaveLength(2);
    expect(after[0]).toBe(firstNode); // 동일 DOM 노드 참조 유지
    expect(within(after[0]!).getByRole('heading').textContent).toBe(firstTitle);
  });

  it('now/soon 있으면 대안 칩 미노출', () => {
    const result: EvaluateResult = { now: [ev('now-1', 'now')], soon: [], blocked: [], review: [] };
    render(
      <ResultList result={result} alternatives={[node('alt-a')]} onSelectAlternative={vi.fn()} />,
    );
    expect(screen.queryByTestId('alternatives')).toBeNull();
  });

  it('연도 변형 후처리 — now 올해판 + review 작년판 → now판만 노출', () => {
    const result: EvaluateResult = {
      now: [ev('a', 'now')],
      soon: [],
      blocked: [],
      review: [ev('b', 'unknown', ['AGE_UNKNOWN'])],
    };
    // 제목을 연도 변형으로 세팅(ev는 title=id이므로 직접 주입).
    (result.now[0]!.policy as { title: string }).title = '2026년 X 지원사업';
    (result.review[0]!.policy as { title: string }).title = '2025년 X 지원사업';
    render(<ResultList result={result} alternatives={[]} onSelectAlternative={vi.fn()} />);
    const cards = screen.getAllByTestId('policy-result-card');
    expect(cards).toHaveLength(1);
    expect(screen.getByText('2026년 X 지원사업')).toBeInTheDocument();
    expect(screen.queryByText('2025년 X 지원사업')).toBeNull();
  });

  it('연도 변형 아님(단일 결과) → 후처리 무영향', () => {
    const result: EvaluateResult = { now: [ev('solo', 'now')], soon: [], blocked: [], review: [] };
    render(<ResultList result={result} alternatives={[]} onSelectAlternative={vi.fn()} />);
    expect(screen.getAllByTestId('policy-result-card')).toHaveLength(1);
  });

  it('결과 목록 컨테이너 → 데스크톱 2열 그리드 클래스(반응형, DESIGN §3.1)', () => {
    const result: EvaluateResult = { now: [ev('now-1', 'now')], soon: [ev('soon-1', 'soon')], blocked: [], review: [] };
    render(<ResultList result={result} alternatives={[]} onSelectAlternative={vi.fn()} />);
    const results = screen.getByTestId('results-list');
    // 모바일 1열(space-y) 유지 + lg에서 2열 그리드로 전환.
    expect(results.className).toMatch(/lg:grid-cols-2/);
    expect(results.className).toMatch(/space-y-3/);
  });
});
