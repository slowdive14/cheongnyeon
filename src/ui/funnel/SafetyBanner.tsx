import { Phone, LifeBuoy } from 'lucide-react';
import type { SafetyResource } from '@/domain/safetyResources';

/**
 * 안전 배너 — 위기 시 항상 DOM 최상단(정책·스텝보다 먼저) 노출.
 *
 * 안전 불변식:
 *  - role="alert"로 스크린리더 우선 안내.
 *  - resources가 비어도 throw 없이 렌더(안내 문구는 항상).
 *  - 순수 표시 컴포넌트(부수효과·I/O 없음).
 */
export interface SafetyBannerProps {
  resources: SafetyResource[];
}

export function SafetyBanner({ resources }: SafetyBannerProps) {
  const safe = Array.isArray(resources) ? resources : [];
  return (
    <section
      role="alert"
      data-funnel-region="safety"
      className="rounded-2xl border-2 border-rose-300 bg-rose-50 p-5 text-rose-900 shadow-sm"
    >
      <div className="flex items-center gap-2">
        <LifeBuoy className="h-6 w-6 shrink-0 text-rose-600" aria-hidden="true" />
        <h2 className="text-lg font-bold">지금 많이 힘드시다면, 혼자 견디지 않아도 됩니다</h2>
      </div>
      <p className="mt-2 text-sm text-rose-800">
        아래 상담 전화로 24시간 도움을 받을 수 있어요. 전화는 무료이며 비밀이 보장됩니다.
      </p>
      <ul className="mt-3 space-y-2">
        {safe.map((r) => (
          <li key={`${r.label}-${r.phone}`}>
            <a
              href={`tel:${r.phone}`}
              className="flex items-center gap-2 rounded-xl bg-white px-4 py-3 font-semibold text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-500"
            >
              <Phone className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span>
                {r.label} {r.phone}
              </span>
              {r.available ? (
                <span className="ml-auto text-xs font-normal text-rose-500">{r.available}</span>
              ) : null}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
