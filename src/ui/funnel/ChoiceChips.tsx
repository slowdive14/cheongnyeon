import { Heart, Home, Briefcase, GraduationCap, Wallet, MessageCircle, ChevronRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { GraphNode } from '@/domain/types';

/**
 * 갈래 선택 칩(T-E3) — 그래프 노드 children을 상황 카드로. 아이콘+제목+부제(영역)+화살표.
 *
 * 시각(시안 반영): 영역별 파스텔 그라데이션 카드 + 아이콘 스퀘어. 색·간격은 첨부 시안 유지.
 * 안전/제약:
 *  - kind==='safety' 노드는 일반 칩에서 제외(위기 라우팅은 traverse/crisisDetect 전담).
 *  - 빈 choices → 0 버튼(throw 없음).
 *  - 아이콘은 aria-hidden(장식). 접근명은 라벨 텍스트(aria-label) — 색만으로 의미 전달 금지.
 */
export interface ChoiceChipsProps {
  choices: GraphNode[];
  onSelect: (nodeId: string) => void;
}

interface ChipTheme {
  icon: LucideIcon;
  subtitle?: string;
  cardBg: string;
  border: string;
  iconBg: string;
  iconColor: string;
}

const NEUTRAL: ChipTheme = {
  icon: MessageCircle,
  cardBg: 'linear-gradient(135deg,#FFFFFF,#FBF6EE)',
  border: '#F0E6D8',
  iconBg: 'linear-gradient(135deg,#F1E7D8,#E9DCC8)',
  iconColor: '#9A8A78',
};

/** 카테고리/키워드 → 영역 테마(시안 색). 매칭 없으면 중립. */
function chipTheme(node: GraphNode): ChipTheme {
  const cats = [...(node.allowedCategories ?? []), node.id, node.concept ?? ''].join(' ');
  if (/마음|상담|심리|정신/.test(cats))
    return { icon: Heart, subtitle: '심리·정서 지원', cardBg: 'linear-gradient(135deg,#FBF3FB,#F6EAF6)', border: '#ECD9EC', iconBg: 'linear-gradient(135deg,#EAD3EB,#E0C0E2)', iconColor: '#8E5D91' };
  if (/일자리|취업|고용|창업|job/.test(cats))
    return { icon: Briefcase, subtitle: '취업·창업 지원', cardBg: 'linear-gradient(135deg,#F1F8EE,#E6F2E2)', border: '#D6E9D0', iconBg: 'linear-gradient(135deg,#D3E8CD,#C3DFBB)', iconColor: '#5C8A56' };
  if (/주거|집|월세|전세|주택|house/.test(cats))
    return { icon: Home, subtitle: '주거·월세 지원', cardBg: 'linear-gradient(135deg,#FEF4ED,#FCE9DB)', border: '#F6DBC8', iconBg: 'linear-gradient(135deg,#FAD6C0,#F6C4A6)', iconColor: '#C25A38' };
  if (/교육|학습|학자금|장학|자격증|edu/.test(cats))
    return { icon: GraduationCap, subtitle: '교육·자기계발', cardBg: 'linear-gradient(135deg,#F0F6FA,#E3EFF6)', border: '#D2E4F0', iconBg: 'linear-gradient(135deg,#CFE1EF,#BAD3E8)', iconColor: '#4E7BA0' };
  if (/금융|자산|대출|저축|생활비|복지|welfare/.test(cats))
    return { icon: Wallet, subtitle: '금융·생활 지원', cardBg: 'linear-gradient(135deg,#FCF7E8,#F9EFD2)', border: '#EFE0BA', iconBg: 'linear-gradient(135deg,#F8E3AE,#F4D488)', iconColor: '#B98514' };
  return NEUTRAL;
}

export function ChoiceChips({ choices, onSelect }: ChoiceChipsProps) {
  const visible = (Array.isArray(choices) ? choices : []).filter((c) => c && c.kind !== 'safety');

  return (
    <div data-testid="choice-chips" data-funnel-region="choices" className="grid grid-cols-1 gap-2.5">
      {visible.map((node) => {
        const t = chipTheme(node);
        const Icon = t.icon;
        return (
          <button
            key={node.id}
            type="button"
            onClick={() => onSelect(node.id)}
            aria-label={node.label}
            style={{ background: t.cardBg, borderColor: t.border }}
            className="flex min-h-[44px] items-center gap-3 rounded-[18px] border p-3.5 text-left transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-clay-500"
          >
            <span
              className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[13px]"
              style={{ background: t.iconBg }}
              aria-hidden="true"
            >
              <Icon className="h-5 w-5" style={{ color: t.iconColor }} aria-hidden="true" />
            </span>
            <span className="flex-1">
              <span className="block text-[15px] font-semibold text-ink-900">{node.label}</span>
              {t.subtitle ? <span className="mt-0.5 block text-xs text-[#A2937F]">{t.subtitle}</span> : null}
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-[#D6C7B4]" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
