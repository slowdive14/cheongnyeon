import { Phone, LifeBuoy } from 'lucide-react';
import type { SafetyResource } from '@/domain/safetyResources';

/**
 * 작성 중(미제출) 위기 인라인 안내 — 입력을 빼앗지 않고 '곁에' 두는 컴팩트 상담 배너.
 *
 * 배경(2026-07-19 사용자 결정 ①): 위기 문구를 타이핑하는 중간에 전체 화면으로 전환하면
 * 말이 끊기고 쓰던 글이 사라진다(임상 관점: 내담자 말을 중간에 끊지 않는다). 대신
 * 작성 중에는 이 컴팩트 배너를 입력 바로 아래 노출하고, 제출(Enter) 시에만 전체
 * 위기 화면(SafetyBanner 단독)으로 전환한다.
 *
 * 안전 불변식:
 *  - 노출 시점은 layer-1 감지 즉시(같은 렌더) — 지연 금지(FunnelContainer가 보장).
 *  - role="alert"로 스크린리더 우선 안내. resources가 비어도 throw 없이 렌더.
 *  - 순수 표시 컴포넌트(부수효과·I/O 없음). 헤드라인은 SafetyBanner와 동일 문구
 *    (안전 표면 톤 일관 — 명랑·느낌표 금지).
 */
export interface SafetyInlineNoticeProps {
  resources: SafetyResource[];
}

export function SafetyInlineNotice({ resources }: SafetyInlineNoticeProps) {
  const safe = Array.isArray(resources) ? resources : [];
  return (
    <section
      role="alert"
      data-funnel-region="safety-inline"
      className="rounded-2xl border-2 border-rose-300 bg-rose-50 px-4 py-3.5 text-rose-900 shadow-sm"
    >
      <div className="flex items-center gap-2">
        <LifeBuoy className="h-5 w-5 shrink-0 text-rose-600" aria-hidden="true" />
        <h2 className="text-[15px] font-bold">지금 많이 힘드시다면, 혼자 견디지 않아도 됩니다</h2>
      </div>
      <p className="mt-1 text-[12.5px] leading-relaxed text-rose-800">
        전화는 무료이며 비밀이 보장됩니다. 적던 글은 그대로 있어요.
      </p>
      <ul className="mt-2.5 flex flex-wrap gap-2">
        {safe.map((r) => (
          <li key={`${r.label}-${r.phone}`}>
            <a
              href={`tel:${r.phone}`}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-semibold text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-500"
            >
              <Phone className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                {r.label} {r.phone}
              </span>
              {r.available ? (
                <span className="text-[11px] font-normal text-rose-500">{r.available}</span>
              ) : null}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
