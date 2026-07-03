import { Heart, Home, Briefcase, BookOpen, Wallet, MessageCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { GraphNode } from '@/domain/types';

/**
 * 갈래 선택 칩(T-E3) — 그래프 노드 children을 말풍선 칩으로. 카테고리 라인 아이콘 + 라벨.
 *
 * 안전/제약:
 *  - kind==='safety' 노드는 일반 칩에서 제외(위기 라우팅은 traverse/crisisDetect 전담).
 *  - 빈 choices → 0 버튼(throw 없음).
 *  - 아이콘은 aria-hidden(장식) — 접근명은 라벨 텍스트 유지(색만으로 의미 전달 금지, 라벨 필수).
 */
export interface ChoiceChipsProps {
  choices: GraphNode[];
  onSelect: (nodeId: string) => void;
}

/** 카테고리 키워드 → lucide 아이콘(하트·집·서류가방·책·지갑). 기본 말풍선. */
function chipIcon(node: GraphNode): LucideIcon {
  const cats = [...(node.allowedCategories ?? []), node.id].join(' ');
  if (/마음|상담|심리|정신/.test(cats)) return Heart;
  if (/주거|집|월세|전세|주택/.test(cats)) return Home;
  if (/일자리|취업|고용|창업|job/.test(cats)) return Briefcase;
  if (/교육|학습|학자금|장학/.test(cats)) return BookOpen;
  if (/금융|자산|대출|저축|생활비/.test(cats)) return Wallet;
  return MessageCircle;
}

export function ChoiceChips({ choices, onSelect }: ChoiceChipsProps) {
  const visible = (Array.isArray(choices) ? choices : []).filter((c) => c && c.kind !== 'safety');

  return (
    <div data-testid="choice-chips" data-funnel-region="choices" className="flex flex-wrap gap-2">
      {visible.map((node) => {
        const Icon = chipIcon(node);
        return (
          <button
            key={node.id}
            type="button"
            onClick={() => onSelect(node.id)}
            aria-label={node.label}
            // 말풍선 꼬리(DESIGN §3): rounded 999px 3개 + 좌하단 4px.
            style={{ borderRadius: '999px 999px 999px 4px' }}
            className="flex min-h-[44px] items-center gap-1.5 border border-sand-200 bg-white px-4 py-2 text-sm font-medium text-ink-800 transition hover:border-clay-500 hover:bg-clay-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-clay-500"
          >
            <Icon className="h-4 w-4 shrink-0 text-clay-500" aria-hidden="true" />
            {node.label}
          </button>
        );
      })}
    </div>
  );
}
