import { useCallback, useEffect, useRef, useState } from 'react';
import { traverse as defaultTraverse } from '@/domain/graph/traverse';
import type { TraverseDeps, TraverseResult } from '@/domain/graph/traverse';
import type { GraphNode, UserProfile } from '@/domain/types';
import type { EvaluateResult } from '@/domain/eligibility';
import type { SafetyResource } from '@/domain/safetyResources';

/**
 * 깔때기 상태 훅 — nodeId 스택 + traverse 연동(결정형 deps 주입).
 *
 * 안전/불변식:
 *  - 위기 우선: traverse 결과의 crisis를 그대로 소비(컨테이너가 배너 최상단 보장).
 *  - 재질문 방지: 동일 노드 중복 push 금지(스택 상단과 같으면 무시).
 *  - throw-free: traverse reject 시 error=true·crisis=false 안전 상태(생성 누수 없음).
 *  - clock·검색은 deps로만 주입(Date.now 내부 호출 없음).
 */
export interface UseFunnelArgs {
  graph: GraphNode;
  profile: UserProfile;
  deps: TraverseDeps;
  /** traverse 주입(테스트/모킹). 기본 = 도메인 traverse. */
  traverseFn?: typeof defaultTraverse;
  /**
   * 검색 질의 override(자유입력). 비면 노드 concept 사용(버튼 흐름).
   * 자유입력 1차화: 사용자 글을 그대로 질의로 써서 정책을 직접 노출한다.
   */
  queryOverride?: string;
}

export interface FunnelState {
  currentNodeId: string;
  currentNode: GraphNode | null;
  stepIndex: number;
  crisis: boolean;
  resources: SafetyResource[];
  result: EvaluateResult | null;
  nextChoices: GraphNode[];
  alternatives: GraphNode[];
  loading: boolean;
  error: boolean;
  select: (nodeId: string) => void;
  back: () => void;
}

/** 그래프에서 nodeId DFS 탐색(throw-free). */
function findNode(graph: GraphNode | null | undefined, nodeId: string): GraphNode | null {
  if (!graph || typeof graph !== 'object') return null;
  if (graph.id === nodeId) return graph;
  if (!Array.isArray(graph.children)) return null;
  for (const child of graph.children) {
    const found = findNode(child, nodeId);
    if (found) return found;
  }
  return null;
}

const SAFE_TRAVERSE: TraverseResult = {
  crisis: { crisis: false, layer: 'none', resources: [], suppressGeneration: false },
  nextChoices: [],
  result: null,
  alternatives: [],
};

export function useFunnel({ graph, profile, deps, traverseFn = defaultTraverse, queryOverride }: UseFunnelArgs): FunnelState {
  const rootId = graph?.id ?? '';
  const [stack, setStack] = useState<string[]>([rootId]);
  const [tr, setTr] = useState<TraverseResult>(SAFE_TRAVERSE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  // 어떤 검색 입력(노드+질의)의 결과가 마지막으로 커밋됐는지. 이걸로 "결과 미커밋=검색 중"을 즉시 판정.
  const [resolvedKey, setResolvedKey] = useState<string | null>(null);
  // 경합 방지: 최신 요청만 반영.
  const reqRef = useRef(0);

  const currentNodeId = stack[stack.length - 1] ?? rootId;
  const currentNode = findNode(graph, currentNodeId);
  // 검색 입력 키(노드+질의). 질의 제출 즉시 이 키가 바뀌므로, effect가 돌기 전 렌더에서도 loading을 켤 수 있다.
  const searchKey = `${currentNodeId}|${typeof queryOverride === 'string' ? queryOverride.trim() : ''}`;

  useEffect(() => {
    const reqId = reqRef.current + 1;
    reqRef.current = reqId;
    let cancelled = false;
    setLoading(true);
    setError(false);
    // 질의: 자유입력(queryOverride) 우선, 없으면 노드 concept(버튼 흐름).
    //  ★C-C4(a): 엔트리(루트 + 질의 없음)에서는 concept 폴백을 쓰지 않는다 → 빈 질의 →
    //  remoteSearch가 no-op(네트워크 0). 마운트마다 원격 검색 1회 낭비 제거(Gemini 비용·부하).
    //  노드를 실제 선택(stack 진행)했을 때만 concept로 검색해 버튼 흐름은 보존.
    const override = typeof queryOverride === 'string' ? queryOverride.trim() : '';
    const atRoot = currentNodeId === rootId;
    const query = override.length > 0 ? override : atRoot ? '' : currentNode?.concept ?? '';
    traverseFn(graph, { nodeId: currentNodeId, query, profile }, deps)
      .then((res) => {
        if (cancelled || reqRef.current !== reqId) return;
        setTr(res ?? SAFE_TRAVERSE);
        setLoading(false);
        setResolvedKey(searchKey); // 이 입력의 결과 커밋 완료.
      })
      .catch(() => {
        if (cancelled || reqRef.current !== reqId) return;
        // throw 누수 차단: 안전 상태(crisis 없음·생성 없음) + error 표식.
        setTr(SAFE_TRAVERSE);
        setError(true);
        setLoading(false);
        setResolvedKey(searchKey);
      });
    return () => {
      cancelled = true;
    };
    // currentNodeId·deps·profile·graph·질의 변경 시 재순회.
  }, [graph, currentNodeId, currentNode, profile, deps, traverseFn, queryOverride, searchKey]);

  const select = useCallback((nodeId: string) => {
    if (typeof nodeId !== 'string' || nodeId.length === 0) return;
    setStack((prev) => {
      // 재질문 방지: 상단과 동일하면 무시(중복 push 금지).
      if (prev[prev.length - 1] === nodeId) return prev;
      return [...prev, nodeId];
    });
  }, []);

  const back = useCallback(() => {
    setStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
  }, []);

  return {
    currentNodeId,
    currentNode,
    stepIndex: stack.length - 1,
    crisis: tr.crisis?.crisis === true,
    resources: tr.crisis?.resources ?? [],
    result: tr.result,
    nextChoices: tr.nextChoices ?? [],
    alternatives: tr.alternatives ?? [],
    // 현재 검색 입력의 결과가 아직 커밋되지 않았으면(질의 변경 직후 포함) 검색 중 — 빈 결과 번쩍임 방지.
    loading: loading || resolvedKey !== searchKey,
    error,
    select,
    back,
  };
}
