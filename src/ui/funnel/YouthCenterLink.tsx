import { LifeBuoy, ExternalLink } from 'lucide-react';
import {
  YOUTH_CENTER_URL,
  getYouthCenter,
  youthCenterMessage,
} from '@/data/static/youthCenters';

/**
 * F-③ 동행 블록 — "혼자 하기 버거우면 OO청년센터가 같이 해줘요" + 검증된 연락처.
 *
 * 안전 바닥선(날조 0) + 실효성:
 *  - 검증된 연락처(phone 또는 centerName)가 있을 때만 블록 전체를 렌더한다. 둘 다 null이면
 *    남는 건 온통청년 일반 링크뿐이라 실효가 없어 미렌더(운영자가 연락처 채우면 자동 노출).
 *  - 위기(전문기관 109/1577-0199) 톤과 구분 — 신청 도움 톤만.
 *  - 노출 위치: 결과 섹션 하단, CrisisFooter 위 1회(Q-4). 위기 시 결과 섹션 자체 미렌더.
 */
export interface YouthCenterLinkProps {
  regionCode?: string;
}

export function YouthCenterLink({ regionCode }: YouthCenterLinkProps) {
  const center = getYouthCenter(regionCode);
  const message = youthCenterMessage(regionCode);

  // 검증된 연락처가 없으면 미렌더(일반 링크만 남는 무실효 블록 방지).
  if (!center?.phone && !center?.centerName) return null;

  return (
    <div
      data-testid="youth-center-link"
      data-funnel-region="youth-center"
      className="rounded-card border border-sand-200 bg-cream-100 p-4"
    >
      <p className="flex items-center gap-1.5 text-sm font-medium text-ink-800">
        <LifeBuoy className="h-4 w-4 shrink-0 text-clay-500" aria-hidden="true" />
        {message}
      </p>

      {/* 검증된 기관명만 노출(null이면 미렌더 — 날조 0). */}
      {center?.centerName ? (
        <p className="mt-1 text-xs text-sand-600">{center.centerName}</p>
      ) : null}

      {/* 검증된 전화번호만 노출(null이면 미렌더 — 날조 0). */}
      {center?.phone ? (
        <a href={`tel:${center.phone}`} className="mt-1 inline-block text-xs font-medium text-clay-700 hover:underline">
          {center.phone}
        </a>
      ) : null}

      <a
        href={YOUTH_CENTER_URL}
        target="_blank"
        rel="noreferrer noopener"
        className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-clay-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-clay-500"
      >
        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        온통청년에서 청년센터 찾기
      </a>
    </div>
  );
}
