/**
 * 검색 중 인디케이터 — 비동기 검색 대기 동안 "빈 결과"가 잘못 노출돼 이탈하는 문제 방지.
 *
 * 안전/디자인(DESIGN 원칙 1):
 *  - 차분한 온기: 페이드(pulse)만, 바운스·스프링 금지. 지치고 무기력한 사용자에게 과한 모션은 부담.
 *  - role=status·aria-live=polite로 스크린리더에 "찾는 중" 상태 전달(빈 결과로 오인 방지).
 *  - 거짓 숫자 금지(원칙 3): 실측 총계를 안전히 얻기 전엔 개수 없는 문구로 둔다.
 */
export function SearchingIndicator() {
  return (
    <div
      data-testid="searching"
      data-funnel-region="searching"
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 py-8 text-sm text-sand-600"
    >
      <span className="flex gap-1" aria-hidden="true">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-clay-500" style={{ animationDelay: '0ms' }} />
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-clay-500" style={{ animationDelay: '160ms' }} />
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-clay-500" style={{ animationDelay: '320ms' }} />
      </span>
      상황에 맞는 정책을 찾고 있어요…
    </div>
  );
}
