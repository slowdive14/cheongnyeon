import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useFunnel } from '@/ui/funnel/useFunnel';
import { mentalHealthGraph } from '@/domain/graph/domains/mentalHealth';
import type { TraverseDeps, TraverseResult, TraverseState } from '@/domain/graph/traverse';
import type { GraphNode, UserProfile } from '@/domain/types';

const NOW = new Date('2026-06-24T12:00:00Z');
const PROFILE: UserProfile = { age: 25, region: '전국', regionCode: '11', income: {} };

function deps(): TraverseDeps {
  return { now: NOW, index: [], policies: [] };
}

function fakeTraverse(over: Partial<TraverseResult> = {}) {
  return vi.fn(
    async (_g: GraphNode, state: TraverseState, _d: TraverseDeps): Promise<TraverseResult> => ({
      crisis: { crisis: false, layer: 'none', resources: [], suppressGeneration: false },
      nextChoices: [],
      result: { now: [], soon: [], blocked: [], review: [] },
      alternatives: [],
      ...over,
      // state는 호출 검증용으로 흡수.
      ...(state ? {} : {}),
    }),
  );
}

describe('useFunnel', () => {
  it('초기 nodeId = graph(entry).id', () => {
    const { result } = renderHook(() =>
      useFunnel({ graph: mentalHealthGraph, profile: PROFILE, deps: deps(), traverseFn: fakeTraverse() }),
    );
    expect(result.current.currentNodeId).toBe('mh.entry');
  });

  it('select → 노드 전환 + traverse 재호출', async () => {
    const t = fakeTraverse();
    const { result } = renderHook(() =>
      useFunnel({ graph: mentalHealthGraph, profile: PROFILE, deps: deps(), traverseFn: t }),
    );
    await waitFor(() => expect(t).toHaveBeenCalled());
    const callsBefore = t.mock.calls.length;
    act(() => result.current.select('mh.burnout'));
    expect(result.current.currentNodeId).toBe('mh.burnout');
    await waitFor(() => expect(t.mock.calls.length).toBeGreaterThan(callsBefore));
  });

  it('back → 스택 pop (이전 노드)', async () => {
    const { result } = renderHook(() =>
      useFunnel({ graph: mentalHealthGraph, profile: PROFILE, deps: deps(), traverseFn: fakeTraverse() }),
    );
    act(() => result.current.select('mh.burnout'));
    expect(result.current.currentNodeId).toBe('mh.burnout');
    act(() => result.current.back());
    expect(result.current.currentNodeId).toBe('mh.entry');
  });

  it('재질문 방지: 동일 노드 중복 select → 스택 중복 push 없음', () => {
    const { result } = renderHook(() =>
      useFunnel({ graph: mentalHealthGraph, profile: PROFILE, deps: deps(), traverseFn: fakeTraverse() }),
    );
    act(() => result.current.select('mh.burnout'));
    act(() => result.current.select('mh.burnout'));
    expect(result.current.currentNodeId).toBe('mh.burnout');
    act(() => result.current.back());
    // 중복 push 안 됐으면 한 번만 pop해도 entry.
    expect(result.current.currentNodeId).toBe('mh.entry');
  });

  it('traverse reject → 안전 상태(throw 누수 없음, crisis 없음)', async () => {
    const rejecting = vi.fn(async () => {
      throw new Error('boom');
    });
    const { result } = renderHook(() =>
      useFunnel({ graph: mentalHealthGraph, profile: PROFILE, deps: deps(), traverseFn: rejecting }),
    );
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.crisis).toBe(false);
  });

  it('빈/비문자 select → 무시(스택 불변)', () => {
    const { result } = renderHook(() =>
      useFunnel({ graph: mentalHealthGraph, profile: PROFILE, deps: deps(), traverseFn: fakeTraverse() }),
    );
    act(() => result.current.select(''));
    act(() => result.current.select(undefined as unknown as string));
    expect(result.current.currentNodeId).toBe('mh.entry');
    expect(result.current.stepIndex).toBe(0);
  });

  it('루트에서 back → 스택 불변(언더플로 없음)', () => {
    const { result } = renderHook(() =>
      useFunnel({ graph: mentalHealthGraph, profile: PROFILE, deps: deps(), traverseFn: fakeTraverse() }),
    );
    act(() => result.current.back());
    expect(result.current.currentNodeId).toBe('mh.entry');
  });

  it('graph 결손(null) → currentNodeId 빈, throw 없음', () => {
    expect(() =>
      renderHook(() =>
        useFunnel({
          graph: null as unknown as GraphNode,
          profile: PROFILE,
          deps: deps(),
          traverseFn: fakeTraverse(),
        }),
      ),
    ).not.toThrow();
  });

  it('traverse가 undefined 반환 → 안전 기본 상태', async () => {
    const t = vi.fn(async () => undefined as unknown as TraverseResult);
    const { result } = renderHook(() =>
      useFunnel({ graph: mentalHealthGraph, profile: PROFILE, deps: deps(), traverseFn: t }),
    );
    await waitFor(() => expect(t).toHaveBeenCalled());
    expect(result.current.crisis).toBe(false);
    expect(result.current.result).toBeNull();
  });

  // ── T8: profile 변경 재평가 vs 안정 참조 (deps memo 안정성 회귀) ──
  it('T8-a profile 새 객체(regionCode 변경) → traverse 재호출(재평가 필요)', async () => {
    const t = fakeTraverse();
    const { rerender } = renderHook(
      ({ profile }: { profile: UserProfile }) =>
        useFunnel({ graph: mentalHealthGraph, profile, deps: deps(), traverseFn: t }),
      { initialProps: { profile: { ...PROFILE, regionCode: undefined } as UserProfile } },
    );
    await waitFor(() => expect(t).toHaveBeenCalled());
    const before = t.mock.calls.length;
    // 지역 선택(새 profile 객체) → 재평가되어야 함.
    rerender({ profile: { ...PROFILE, regionCode: '26' } });
    await waitFor(() => expect(t.mock.calls.length).toBeGreaterThan(before));
    // traverse에 전달된 profile.regionCode가 갱신됐는지 확인.
    const lastState = t.mock.calls[t.mock.calls.length - 1]?.[1];
    expect(lastState?.profile.regionCode).toBe('26');
  });

  it('T8-b 동일 profile 참조로 재렌더 → traverse 재호출 없음(안정 참조)', async () => {
    const t = fakeTraverse();
    const sameProfile: UserProfile = { ...PROFILE };
    const sameDeps = deps();
    const { rerender } = renderHook(() =>
      useFunnel({ graph: mentalHealthGraph, profile: sameProfile, deps: sameDeps, traverseFn: t }),
    );
    await waitFor(() => expect(t).toHaveBeenCalled());
    const before = t.mock.calls.length;
    // 동일 참조(profile·deps) 재렌더 → effect deps 불변 → 재호출 없음(원격 검색 남발 방지).
    rerender();
    rerender();
    // 마이크로태스크 소진 후에도 호출 수 불변.
    await new Promise((r) => setTimeout(r, 20));
    expect(t.mock.calls.length).toBe(before);
  });

  it('crisis 결과 → state.crisis=true, resources 전달', async () => {
    const t = fakeTraverse({
      crisis: { crisis: true, layer: 'regex', resources: [{ label: 'x', phone: '109', available: '24h' }], suppressGeneration: true },
      result: null,
    });
    const { result } = renderHook(() =>
      useFunnel({ graph: mentalHealthGraph, profile: PROFILE, deps: deps(), traverseFn: t }),
    );
    await waitFor(() => expect(result.current.crisis).toBe(true));
    expect(result.current.resources).toHaveLength(1);
  });
});
