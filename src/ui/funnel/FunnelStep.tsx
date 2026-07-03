import { ChevronLeft } from 'lucide-react';
import type { GraphNode } from '@/domain/types';
import { ChoiceChips } from './ChoiceChips';

/**
 * 깔때기 한 스텝 — 현재 노드 질문(label) + 갈래 칩 + (깊이>0) 뒤로 버튼.
 *
 * 안전/제약:
 *  - 자유입력 박스 없음(Phase 5는 버튼 전용, 위기 자유입력은 Phase 6).
 *  - safety 노드 칩 제외는 ChoiceChips가 담당.
 */
export interface FunnelStepProps {
  node: GraphNode;
  onSelect: (nodeId: string) => void;
  onBack: () => void;
  stepIndex: number;
}

export function FunnelStep({ node, onSelect, onBack, stepIndex }: FunnelStepProps) {
  const children = Array.isArray(node?.children) ? node.children : [];

  return (
    <section data-funnel-region="step" className="space-y-4">
      {stepIndex > 0 ? (
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          뒤로
        </button>
      ) : null}

      {node?.label ? <h2 className="text-xl font-bold text-slate-900">{node.label}</h2> : null}

      <ChoiceChips choices={children} onSelect={onSelect} />
    </section>
  );
}
