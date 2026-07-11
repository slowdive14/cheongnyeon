import type { EvaluateResult } from '@/domain/eligibility';
import type { GraphNode, Policy, UserProfile } from '@/domain/types';
import type { LlmClient } from '@/data/parseChunk';
import { PolicyResultCard, reviewLabels } from './PolicyResultCard';
import { ChoiceChips } from './ChoiceChips';
import { dedupeYearVariants } from './dedupeYearVariants';

/** 내 신청함(F-④) 저장 컨트롤 — 카드별 저장 상태·토글을 상위(FunnelContainer)가 주입. */
export interface SaveControls {
  isSaved: (id: string) => boolean;
  onToggle: (policy: Policy) => void;
}

/**
 * 결과 목록 — now/soon/review 카드 렌더(blocked만 미노출).
 *
 * 안전 불변식:
 *  - result.now/soon/review를 카드화. review는 '자격 확인 필요'(보수 판정)로 노출한다.
 *    blocked(명확한 부적격)만 화면에 누수 금지(헛희망 차단).
 *    ※ Phase 5의 'review 미노출' 결정은 실데이터 대부분이 review로 분류돼 결과가
 *      통째로 사라지는 문제 때문에 변경됨(사용자 승인, 2026-06-25). review는 자격을
 *      단정하지 않고 '확인 필요'로만 제시하므로 보수성은 유지된다.
 *  - 노출 가능한 결과(now/soon/review)가 0이고 대안(형제 노드)이 있으면 대안 갈래 칩으로 유도.
 */
export interface ResultListProps {
  result: EvaluateResult | null;
  alternatives: GraphNode[];
  onSelectAlternative: (nodeId: string) => void;
  /** 사용자 프로필(카드 체크리스트 "내 나이" 문구용). */
  profile?: UserProfile;
  /** (예약) '왜 맞는지' 설명 LLM — D-② 재배선용. 현재 카드에서 미사용. */
  llm?: LlmClient;
  /** 내 신청함(F-④) 저장 컨트롤. 미지정이면 카드에 저장 버튼 미렌더. */
  saveControls?: SaveControls;
}

export function ResultList({
  result,
  alternatives,
  onSelectAlternative,
  profile,
  llm,
  saveControls,
}: ResultListProps) {
  // 렌더 직전 1회 후처리: 정책의 연도 변형은 그룹당 대표 1개만 노출(버킷 횡단, 전멸 금지).
  // blocked는 애초에 미노출이므로 dedupe 대상에서 제외한다(안전 표면 무접촉).
  const deduped = dedupeYearVariants({
    now: result?.now ?? [],
    soon: result?.soon ?? [],
    review: result?.review ?? [],
  });
  const nowItems = deduped.now;
  const soonItems = deduped.soon;
  // review는 미확인 항목이 적은(=적격에 가까운) 순으로 노출 — '거의 충족'을 위로.
  const reviewItems = [...deduped.review].sort(
    (a, b) => reviewLabels(a.reasons).length - reviewLabels(b.reasons).length,
  );
  const showable = nowItems.length + soonItems.length + reviewItems.length;

  // 카드별 저장 상태·토글 결선(saveControls 없으면 저장 버튼 미렌더).
  const saveProps = (item: (typeof nowItems)[number]) => {
    const id = item.policy?.id;
    if (!saveControls || typeof id !== 'string' || id.length === 0) return {};
    return { saved: saveControls.isSaved(id), onToggleSave: () => saveControls.onToggle(item.policy) };
  };

  if (showable > 0) {
    return (
      <div
        data-testid="results-list"
        data-funnel-region="results"
        // 모바일 1열(space-y). 데스크톱(lg)만 2열 그리드 — 카드 높이 불균등은 자연 흐름(items-start), masonry 불필요. DESIGN §3.1.
        className="space-y-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-3 lg:space-y-0"
      >
        {nowItems.map((item, i) => (
          <PolicyResultCard key={item.policy?.id ?? `now-${i}`} item={item} status="now" profile={profile} llm={llm} {...saveProps(item)} />
        ))}
        {soonItems.map((item, i) => (
          <PolicyResultCard key={item.policy?.id ?? `soon-${i}`} item={item} status="soon" profile={profile} llm={llm} {...saveProps(item)} />
        ))}
        {reviewItems.map((item, i) => (
          <PolicyResultCard key={item.policy?.id ?? `review-${i}`} item={item} status="review" profile={profile} llm={llm} {...saveProps(item)} />
        ))}
      </div>
    );
  }

  // 노출 가능한 결과 0 → 대안 갈래로 유도(blocked/review 직노출 금지).
  const alts = Array.isArray(alternatives) ? alternatives : [];
  return (
    <div data-testid="alternatives" data-funnel-region="alternatives" className="space-y-3">
      <p className="text-sm text-sand-600">이 방향으론 못 찾았어요. 이런 쪽은 어때요?</p>
      {alts.length > 0 ? <ChoiceChips choices={alts} onSelect={onSelectAlternative} /> : null}
    </div>
  );
}
