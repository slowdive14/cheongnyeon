import { useCallback, useMemo, useState } from 'react';
import { useFunnel } from './useFunnel';
import type { TraverseDeps, traverse as traverseType } from '@/domain/graph/traverse';
import type { GraphNode, UserProfile } from '@/domain/types';
import type { LlmClient } from '@/data/parseChunk';
import { safetyResources } from '@/domain/safetyResources';
import { SafetyBanner } from './SafetyBanner';
import { ResultList } from './ResultList';
import { ChoiceChips } from './ChoiceChips';
import { FreeTextInput } from './FreeTextInput';
import { ProfileInput } from './ProfileInput';
import { CrisisFooter } from './CrisisFooter';
import { YouthCenterLink } from './YouthCenterLink';
import { SavedPolicies } from './SavedPolicies';
import { SearchingIndicator } from './SearchingIndicator';
import { useSavedPolicies } from './savedPoliciesStore';

/**
 * 깔때기 조립 — 자유입력 1차 관문(글→질의→정책 직접 노출). 칩은 예시 quick-start(질의 채움).
 *
 * ★렌더 불변식(안전):
 *  1) 위기(traverse crisis OR 자유입력 실시간 layer-1) → <SafetyBanner/>만, DOM 최상단.
 *     입력/결과/예시/설정 일절 미렌더(위기 최우선).
 *  2) 질의 있음 → 결과(ResultList: now/soon/review, blocked 미노출). 질의 없음 → 입력 + 예시 칩.
 *  3) 예시 칩(엔트리 갈래)·대안 칩 클릭 → 해당 라벨을 질의로 채워 같은 검색 흐름 실행(별도 funnel 네비 없음).
 *  4) '추정' 고지·원문 링크·위기 안내 푸터는 결과 카드/섹션이 담당.
 */
export interface FunnelContainerProps {
  graph: GraphNode;
  profile: UserProfile;
  deps: TraverseDeps;
  /** traverse 주입(테스트/위기 모킹). 기본 = 도메인 traverse. */
  traverseFn?: typeof traverseType;
  /** (예약) 결과 '왜 맞는지' 설명 생성 LLM — 후속 배선용. */
  llm?: LlmClient;
  /**
   * 프로필 입력 변경 콜백(App이 profile 상태 소유·병합). 미지정이면 ProfileInput 미렌더
   * (기존 소비자 테스트 호환 — profile 입력이 필요한 배선에서만 전달).
   */
  onProfileChange?: (patch: { regionCode?: string; age?: number }) => void;
}

export function FunnelContainer({
  graph,
  profile,
  deps,
  traverseFn,
  llm,
  onProfileChange,
}: FunnelContainerProps) {
  // 자유입력/예시가 설정하는 검색 질의. 비면 초기(예시) 화면.
  const [query, setQuery] = useState('');
  // 자유입력 실시간 layer-1 위기(키 무관). traverse 위기와 OR.
  const [freeCrisis, setFreeCrisis] = useState(false);
  // 내 신청함(F-④) — 관심 정책 저장(localStorage). 위기 시 전체 미렌더(early-return)로 자동 격리.
  const savedApi = useSavedPolicies();
  const saveControls = useMemo(
    () => ({ isSaved: savedApi.isSaved, onToggle: savedApi.toggle }),
    [savedApi.isSaved, savedApi.toggle],
  );

  const funnel = useFunnel({ graph, profile, deps, traverseFn, queryOverride: query });

  const inCrisis = funnel.crisis || freeCrisis;
  const resources = funnel.crisis ? funnel.resources : freeCrisis ? safetyResources() : [];

  // 예시 quick-start: 엔트리 갈래(마음건강)를 '이렇게 적어도 돼요'로. safety 노드는 ChoiceChips가 제외.
  const examples = useMemo(
    () => (Array.isArray(graph?.children) ? graph.children : []),
    [graph],
  );
  // 예시/대안 칩 클릭 → 라벨을 질의로 채워 같은 검색 실행.
  const onExample = useCallback(
    (nodeId: string) => {
      const node = examples.find((e) => e.id === nodeId);
      if (node) {
        setFreeCrisis(false);
        setQuery(node.label);
      }
    },
    [examples],
  );

  // ★위기 시: 배너만, DOM 최상단. 입력·결과·예시·설정 일절 미렌더.
  if (inCrisis) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-xl space-y-5 bg-cream-50 px-4 py-6 text-ink-900 sm:px-6">
        <SafetyBanner resources={resources} />
      </main>
    );
  }

  const hasQuery = query.trim().length > 0;

  // 헤드라인 N = 실제 노출 카드 수(now+soon+review 합, blocked 제외 — 헛개수 금지, R-E2).
  const r = funnel.result;
  const showable = (r?.now.length ?? 0) + (r?.soon.length ?? 0) + (r?.review.length ?? 0);
  // N=0이면 헤드라인 대신 ResultList가 빈결과/대안 문구를 담당(헤드라인 미표시).
  const headline = showable > 0 ? `상황에 맞을 만한 ${showable}개를 찾았어요` : '';

  return (
    <main className="mx-auto min-h-screen w-full max-w-xl space-y-5 bg-cream-50 px-4 py-6 text-ink-900 sm:px-6">
      <header data-funnel-region="header" className="space-y-1">
        <h1 className="text-xl font-medium text-ink-900">요즘 어때</h1>
        <p className="text-sm text-sand-500">지금 상황을 편하게 적어주면, 맞는 정책을 찾아드려요.</p>
      </header>

      {/* ★위기 불변식(S3): ProfileInput은 이 비위기 JSX에만 존재한다. 위기 early-return 분기에는
          절대 넣지 말 것(SafetyBanner 단독). 자격 입력이지 검색 입력이 아니므로 header 아래·검색 위. */}
      <ProfileInput
        regionCode={profile?.regionCode}
        age={profile?.age}
        onChange={onProfileChange ?? (() => {})}
      />

      <FreeTextInput onCrisis={setFreeCrisis} onSubmit={setQuery} />

      {hasQuery ? (
        <section data-funnel-region="result-section" className="space-y-4">
          {/* 검색 대기 중엔 로딩 인디케이터만 — 빈 결과("못 찾았어요")가 잘못 떠서 이탈하는 문제 방지. */}
          {funnel.loading ? (
            <SearchingIndicator />
          ) : (
            <>
              {headline ? <h2 className="text-base font-medium text-ink-900">{headline}</h2> : null}
              <ResultList
                result={funnel.result}
                alternatives={funnel.alternatives}
                onSelectAlternative={onExample}
                profile={profile}
                llm={llm}
                saveControls={saveControls}
              />
              {/* F-③ 동행 블록: 결과 섹션 하단, CrisisFooter 위 1회 노출(Q-4). 카드마다 반복 금지. */}
              <YouthCenterLink regionCode={profile?.regionCode} />
              {/* 비위기 결과 화면 하단 상시 위기 안내 푸터(취약 청년 안전망). */}
              <CrisisFooter />
            </>
          )}
        </section>
      ) : (
        <section data-funnel-region="examples" className="space-y-2">
          <p className="text-sm text-sand-500">이렇게 적는 분들이 많아요</p>
          <ChoiceChips choices={examples} onSelect={onExample} />
        </section>
      )}

      {/* 내 신청함(F-④): 저장 항목이 있을 때만 노출. 두 화면(입력/결과) 공통 하단 — 재방문 리마인드. */}
      <SavedPolicies items={savedApi.items} onRemove={savedApi.remove} />
    </main>
  );
}
