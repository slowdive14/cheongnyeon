import { useState } from 'react';
import { Bookmark, ExternalLink, X, ChevronDown, ChevronUp } from 'lucide-react';
import type { SavedPolicy } from './savedPoliciesStore';

/**
 * 내 신청함(F-④) — 저장한 관심 정책 재방문 목록. 접힘/펼침.
 *
 * 안전:
 *  - "관심 표시"일 뿐 자격/신청 가능 단정 아님(문구 보수 — 단정어 금지).
 *  - 원문 링크는 저장 메타의 sourceUrl(있을 때만). '추정' 성격은 원 카드가 담당.
 *  - 위기 시 미렌더는 상위(FunnelContainer)가 보장(이 컴포넌트는 비위기 JSX에만 존재).
 */
export interface SavedPoliciesProps {
  items: SavedPolicy[];
  onRemove: (id: string) => void;
}

/** 출처 라벨(카드와 동일 규칙) — 아는 것만 표기. */
function originLabel(source: string | undefined): string {
  switch (source) {
    case 'ontong':
      return '온통청년';
    case 'seoul-youth':
      return '청년몽땅';
    default:
      return '';
  }
}

export function SavedPolicies({ items, onRemove }: SavedPoliciesProps) {
  const [open, setOpen] = useState(true);
  if (!Array.isArray(items) || items.length === 0) return null;

  return (
    <section data-funnel-region="saved" data-testid="saved-policies" className="rounded-card border border-sand-200 bg-white p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-clay-500"
      >
        <span className="flex items-center gap-1.5 text-base font-medium text-ink-900">
          <Bookmark className="h-4 w-4 text-clay-500" aria-hidden="true" />
          내 신청함 <span className="text-sand-500">{items.length}</span>
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-sand-400" aria-hidden="true" />
        ) : (
          <ChevronDown className="h-4 w-4 text-sand-400" aria-hidden="true" />
        )}
      </button>

      {open ? (
        <>
          <p className="mt-1 text-xs text-sand-500">지난번에 보던 정책이에요. 천천히 다시 봐도 괜찮아요.</p>
          <ul className="mt-3 space-y-2">
            {items.map((it) => {
              const origin = originLabel(it.source);
              return (
                <li key={it.id} className="flex items-start justify-between gap-2 border-t border-sand-200 pt-2 first:border-t-0 first:pt-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ink-900">{it.title}</p>
                    {it.sourceUrl ? (
                      <a
                        href={it.sourceUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-clay-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-clay-500"
                      >
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                        신청 페이지 열기{origin ? ` (${origin})` : ''}
                      </a>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemove(it.id)}
                    aria-label={`${it.title} 신청함에서 빼기`}
                    className="shrink-0 rounded-md p-1 text-sand-400 hover:bg-cream-100 hover:text-ink-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-clay-500"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </section>
  );
}
