import { Info } from 'lucide-react';

/**
 * '추정' 고지 — 모든 결과 카드에 동반되는 정적 안내.
 *
 * 안전: 결과는 자격 '추정'이며 확정이 아님을 명시하고, 원문 확인을 권고한다.
 */
export function DisclaimerNote() {
  return (
    <p className="flex items-start gap-1.5 text-xs text-slate-500">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>
        자격 여부는 입력 정보로 <strong className="font-semibold">추정</strong>한 결과예요. 신청
        전 반드시 <strong className="font-semibold">원문</strong>에서 최신 조건을 확인하세요.
      </span>
    </p>
  );
}
