import { useCallback, useMemo, useState, type CSSProperties } from 'react';
import { sidoNameByPrefix } from '@/domain/parse/sido';
import { useFunnel } from './useFunnel';
import type { TraverseDeps, traverse as traverseType } from '@/domain/graph/traverse';
import type { GraphNode, UserProfile } from '@/domain/types';
import type { LlmClient } from '@/data/parseChunk';
import { safetyResources } from '@/domain/safetyResources';
import { SafetyBanner } from './SafetyBanner';
import { ResultList } from './ResultList';
import { dedupeYearVariants } from './dedupeYearVariants';
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
 *  1) 위기(traverse crisis OR 자유입력 실시간 layer-1) → <SafetyBanner/> 최우선·DOM 최상단.
 *     입력/결과/예시/프로필/동행 일절 미렌더(위기 최우선). 단 배너 하단에 절제된
 *     '정책 검색으로 돌아가기' 링크 1개만 허용(막다른 길 방지 — data-funnel-region 없음, DESIGN §7.1).
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

  // 위기 화면 복귀 링크 → 실시간 위기·제출 질의를 모두 해제해 홈(자유입력·예시)으로 돌아간다.
  // 위기 분기에서 자유입력이 언마운트돼 재트리거 루프 없음(홈 재렌더 시 빈 입력).
  const returnToSearch = useCallback(() => {
    setFreeCrisis(false);
    setQuery('');
  }, []);

  // ★위기 시: 배너 최우선·단독(정책·입력·결과·예시·프로필·동행 미렌더). 단 막다른 길이 되지 않게
  //  배너 하단에 절제된 복귀 링크 1개만 허용(입력·정책 콘텐츠 아님, data-funnel-region 없음 — DESIGN §7.1).
  if (inCrisis) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-xl space-y-5 bg-cream-50 px-4 py-6 text-ink-900 sm:px-6">
        <SafetyBanner resources={resources} />
        <div className="pt-1 text-center">
          <button
            type="button"
            onClick={returnToSearch}
            className="inline-flex min-h-[44px] items-center justify-center rounded-full px-5 py-2.5 text-sm font-medium text-sand-600 underline decoration-sand-400 underline-offset-4 transition hover:text-clay-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-clay-500"
          >
            마음이 좀 괜찮아지면, 정책 검색으로 돌아갈게요
          </button>
        </div>
      </main>
    );
  }

  const hasQuery = query.trim().length > 0;

  // 헤드라인 N = 실제 노출 카드 수. ResultList와 동일하게 연도 변형 dedupe 후 센다 —
  // 원본(dedupe 전)을 세면 "N개 찾았어요"가 실제 카드 수보다 커지는 헛개수 발생(R-E2).
  // dedupeYearVariants는 결정적·멱등이라 ResultList가 한 번 더 접어도 결과 동일.
  const r = funnel.result;
  const dedupedResult = dedupeYearVariants({ now: r?.now ?? [], soon: r?.soon ?? [], review: r?.review ?? [] });
  const showable = dedupedResult.now.length + dedupedResult.soon.length + dedupedResult.review.length;
  // 결과 헤드라인·맞춤 배지: 검색 완료 + 노출 카드 있을 때만(로딩·빈결과는 각기 담당).
  const showResultHeader = hasQuery && !funnel.loading && showable > 0;
  const regionName = profile?.regionCode ? sidoNameByPrefix(profile.regionCode) ?? null : null;
  const ageStr =
    typeof profile?.age === 'number' && Number.isFinite(profile.age) ? `${profile.age}세` : null;
  const matchBadge = [regionName, ageStr].filter((x): x is string => Boolean(x)).join(' · ');
  const gradientText: CSSProperties = {
    background: 'linear-gradient(120deg,#E0733F,#C63C7A)',
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  };

  // 반응형(DESIGN §3.1): 외곽 셸 폭 기준선을 홈·결과 공통(max-w-[420px] lg:max-w-5xl)으로 통일.
  // 외곽 프레임이 화면 전환에도 리사이즈되지 않아 배경·좌우 모서리가 튀지 않는다
  // (2026-07-11 사용자 피드백: "검색창이 결과 뜨고 갑자기 확 넓어져 이상"). 시각 폭 차이는
  // 아래 innerWidth(내부 콘텐츠 래퍼)로만 만든다.
  //  - 결과 카드 노출(wideShell): 데스크톱 전폭(5xl) 사용 → 2열 그리드 수용.
  //  - 홈·빈결과: 데스크톱에서 내부를 lg:max-w-[420px] 중앙 고정(시각 결과는 기존 홈과 동일).
  const wideShell = showResultHeader;
  const innerWidth = wideShell ? '' : 'lg:mx-auto lg:max-w-[420px]';

  return (
    <main className="mx-auto min-h-screen w-full max-w-[420px] px-5 pb-8 pt-[22px] text-ink-900 lg:max-w-5xl">
     <div className={innerWidth}>
      {/* 브랜드 바 (설정 기어 없음 — 키 UI 제거) */}
      <div data-funnel-region="header" className="mb-5 flex items-center gap-2.5">
        <div
          className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] shadow-[0_4px_10px_rgba(184,74,44,.28)]"
          style={{ background: 'linear-gradient(135deg,#D2703F,#B84A2C)' }}
          aria-hidden="true"
        >
          <div className="h-[11px] w-[11px] rounded-full border-[2.5px] border-white" />
        </div>
        <span className="text-sm font-bold tracking-tight text-[#6E5C4E]">청년정책 나침반</span>
      </div>

      {/* 인사(홈) / 결과 헤드라인(검색 결과) */}
      {showResultHeader ? (
        <div className="mb-[18px]" style={{ animation: 'floatIn .3s ease' }}>
          {matchBadge ? (
            <div
              className="mb-3 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] font-bold text-[#2F6B45]"
              style={{ background: 'linear-gradient(135deg,#D8F0C6,#B9E9D4)', borderColor: '#B4E0B8' }}
            >
              <span className="h-[7px] w-[7px] rounded-full" style={{ background: '#3FA860', boxShadow: '0 0 0 3px rgba(63,168,96,.22)' }} />
              {matchBadge} 맞춤
            </div>
          ) : null}
          <h1 className="mb-1.5 text-[26px] font-extrabold leading-tight tracking-[-.03em]">
            딱 맞는 정책 <span style={gradientText}>{showable}개</span> 찾았어요
          </h1>
          <p className="text-sm leading-relaxed text-[#8A7A68]">적어주신 내용과 잘 맞는 순서로 보여드려요.</p>
        </div>
      ) : !hasQuery ? (
        <div className="mb-[18px]">
          <h1 className="mb-2 text-[30px] font-extrabold leading-tight tracking-[-.035em]">
            요즘 <span style={gradientText}>어때</span>
          </h1>
          <p className="text-[15px] leading-relaxed text-[#7C6E60]">지금 상황을 편하게 적어주면, 맞는 정책을 찾아드려요.</p>
        </div>
      ) : null}

      {/* ★위기 불변식(S3): ProfileInput은 이 비위기 JSX에만 존재한다. 위기 early-return 분기엔 절대 금지. */}
      <div className="mb-[18px]">
        <ProfileInput
          regionCode={profile?.regionCode}
          age={profile?.age}
          onChange={onProfileChange ?? (() => {})}
        />
      </div>

      <div className="mb-6">
        {/* 결과 화면(showResultHeader)에선 compact 재검색 바 — 홈은 hero 유지. 위기 로직 불변. */}
        <FreeTextInput
          variant={showResultHeader ? 'compact' : 'hero'}
          onCrisis={setFreeCrisis}
          onSubmit={setQuery}
        />
      </div>

      {hasQuery ? (
        <section data-funnel-region="result-section" className="mb-6">
          {/* 검색 대기 중엔 로딩 인디케이터만 — 빈 결과("못 찾았어요")가 잘못 떠서 이탈하는 문제 방지. */}
          {funnel.loading ? (
            <SearchingIndicator />
          ) : (
            <ResultList
              result={funnel.result}
              alternatives={funnel.alternatives}
              onSelectAlternative={onExample}
              profile={profile}
              llm={llm}
              saveControls={saveControls}
            />
          )}
        </section>
      ) : (
        <section data-funnel-region="examples" className="mb-6">
          <div className="mb-3.5 flex items-baseline justify-between">
            <h2 className="text-[17px] font-extrabold tracking-tight">이런 상황이신가요?</h2>
            {/* 입력 수단별 문구 — 모바일(터치)=탭, 데스크톱(lg, 포인터)=클릭. */}
            <span className="text-[13px] text-[#A2937F]">
              <span className="lg:hidden">탭하면 바로 채워져요</span>
              <span className="hidden lg:inline">클릭하면 바로 채워져요</span>
            </span>
          </div>
          <ChoiceChips choices={examples} onSelect={onExample} />
        </section>
      )}

     <div>
      {/* F-③ 동행 블록(검증 연락처 있을 때만) + 상시 위기 안내 푸터(홈·결과 공통 하단, 취약 청년 안전망). */}
      <div className="mb-3.5">
        <YouthCenterLink regionCode={profile?.regionCode} />
      </div>
      <CrisisFooter />

      {/* 내 신청함(F-④): 저장 항목이 있을 때만 노출. 두 화면 공통 하단 — 재방문 리마인드. */}
      <div className="mt-3.5">
        <SavedPolicies items={savedApi.items} onRemove={savedApi.remove} />
      </div>
     </div>
     </div>
    </main>
  );
}
