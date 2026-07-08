import { Phone } from 'lucide-react';
import { safetyResources } from '@/domain/safetyResources';

/**
 * 위기 안내 푸터 (M1) — 비위기 결과 화면 하단 상시 노출.
 *
 * 리더 결정: 결과 화면 한정. 위기 화면은 SafetyBanner 단독(이 푸터 미렌더).
 * 안전: 취약 청년 안전망 — 109·1577-0199 상담 링크 상시. role="alert" 아님(보조 안내,
 *  SafetyBanner의 위기 우선 alert와 충돌 금지). 순수 표시(부수효과 0).
 */
export function CrisisFooter() {
  const resources = safetyResources();
  return (
    <footer
      data-testid="crisis-footer"
      data-funnel-region="crisis-footer"
      className="rounded-2xl border border-[#ECE2D3] bg-[#FAF5EE] px-4 py-3.5"
    >
      <p className="mb-2.5 text-[13px] font-semibold text-[#6E6054]">많이 힘들다면 혼자 견디지 마세요.</p>
      <ul className="flex flex-wrap gap-2">
        {resources.map((r) => (
          <li key={`${r.label}-${r.phone}`}>
            <a
              href={`tel:${r.phone}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#EDD9D2] bg-white px-3.5 py-2 text-[13px] font-semibold text-[#B23A4A] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-500"
            >
              <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {r.label} <b className="text-[#8E2A38]">{r.phone}</b>
            </a>
          </li>
        ))}
      </ul>
    </footer>
  );
}
