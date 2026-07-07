import { useEffect, useMemo, useState } from 'react';
import policiesJson from '../data/cache/policies.json';
import type { CachedPolicy } from './data/cache/types';
import type { IndexedDoc } from './retrieval/types';
import type { EmbeddingProvider } from './retrieval/types';
import { embed } from './retrieval/embed';
import { youthPolicyGraph } from './domain/graph/domains/youthPolicy';
import type { TraverseDeps } from './domain/graph/traverse';
import type { UserProfile } from './domain/types';
import type { LlmClient } from './data/parseChunk';
import { FunnelContainer } from './ui/funnel/FunnelContainer';
import { useProfileState } from './ui/funnel/useProfileState';
import { createRemoteSearch } from './data/remoteSearch';
import { loadApiKey } from './llm/apiKeyStore';
import { createGeminiClient } from './data/llm/geminiClient';
import { createGeminiEmbeddingProvider } from './data/llm/geminiEmbed';
import { buildCrisisAnchors } from './llm/crisisAnchors';

/**
 * 앱 셸 (Phase 6) — 마음건강 깔때기 end-to-end + 자유입력/설명/위기 2층.
 *
 * 안전 배선(엄수):
 *  - 키 없음(loadApiKey=null) → llm=undefined·embed=undefined → crisisAnchors=[].
 *    layer-2 잠금. layer-1 위기·키워드 색인·버튼 흐름은 키 무관 완전 동작(degrade).
 *  - 키 있음 → embed 제공자 + crisisAnchors 빌드 → deps.crisisDeps 주입(production layer-2 활성).
 *    단 layer-1 우선 불변(직접 위기어는 여전히 regex, 2층 미진입).
 *  - clock = 마운트 시각 1회 고정(렌더 결정성).
 *  - 실 SDK는 동적 import 격리 → 키 없으면 미로드.
 */

// 초기 프로필 — 미입력 상태로 시작(시·도 '선택 안 함' + 나이 빈칸). 지역·나이 입력 UI(ProfileInput)로
// 사용자가 채우면 정밀 판정으로 전환된다(App이 profile을 useState 소유·병합).
//  - regionCode 미입력(undefined) → 지역 정책은 REGION_PROFILE_MISSING로 '확인 필요'(보수 노출).
//    특정 지역 하드코딩 시 타 지자체 정책이 전부 REGION_MISMATCH로 숨겨져 "결과 없음"이 되므로 금지.
//  - age 미입력(undefined) → 연령 정책은 AGE_UNKNOWN로 '확인 필요'(보수). 나이 입력 시 정밀 판정.
//  - income 미입력({}) → 소득 조건 있는 정책은 INCOME_PROFILE_MISSING로 '확인 필요'(보수 노출).
//    소득 입력 UI는 두지 않는다(정책 77%가 소득 무관, 입력 부담↑). 소득을 모른 채 가짜값(옛 medianRatio:100)을
//    쓰면 상한<100% 정책이 INCOME_OVER_LIMIT로 잘못 숨겨진다 → 빈 소득으로 두어 '확인 필요'로 노출(안전).
const INITIAL_PROFILE: UserProfile = {
  age: undefined,
  region: '전국',
  regionCode: undefined,
  income: {},
};

const POLICIES = policiesJson as unknown as CachedPolicy[];

interface LlmEnv {
  llm?: LlmClient;
  embedProvider?: EmbeddingProvider;
  crisisAnchors: number[][];
}

const EMPTY_ENV: LlmEnv = { crisisAnchors: [] };

export default function App() {
  const [index, setIndex] = useState<IndexedDoc[] | null>(null);
  const [env, setEnv] = useState<LlmEnv>(EMPTY_ENV);
  // 키 저장/삭제 시 증가 → 환경 재빌드 트리거(설정 모달 닫힘 연계, F1).
  const [keyEpoch, setKeyEpoch] = useState(0);
  // ── 프로필 소유(결정 2·T10): App이 useProfileState로 소유, ProfileInput onChange → 병합.
  //  안정 참조 유지(변경 시에만 새 객체). ★T8: profile은 아래 search/deps memo 배열에 넣지
  //  않는다(자격 입력이지 검색 입력이 아님). 넣으면 프로필 변경마다 원격 search 함수가 재생성돼
  //  Edge Function 남발. profile→재평가는 useFunnel effect deps(profile)가 담당 — 추가 배선 불필요.
  //  localStorage 영속화(잔여 R2)는 useProfileState 훅 경계에 후속 추가(App 변경 0).
  const { profile, onProfileChange } = useProfileState(INITIAL_PROFILE);
  // 마운트 1회 고정 clock(렌더 결정성).
  const now = useMemo(() => new Date(), []);

  // ── LLM/임베딩 환경 빌드(키 게이트). 키 없으면 EMPTY_ENV(layer-2 잠금). ──
  //  keyEpoch 변경(키 저장/삭제) 시 재빌드 → 같은 세션에서 LLM 모드 즉시 반영(F1).
  useEffect(() => {
    let cancelled = false;
    const apiKey = loadApiKey() ?? undefined;
    if (!apiKey) {
      setEnv(EMPTY_ENV);
      return;
    }
    const llm = createGeminiClient({ apiKey });
    const embedProvider = createGeminiEmbeddingProvider({ apiKey });
    // crisisAnchors 빌드(실패/없음 → []). throw-free.
    buildCrisisAnchors({ embed: embedProvider })
      .then((anchors) => {
        if (!cancelled) setEnv({ llm, embedProvider, crisisAnchors: anchors });
      })
      .catch(() => {
        if (!cancelled) setEnv({ llm, embedProvider, crisisAnchors: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [keyEpoch]);

  // ── 색인 빌드(embed 제공자 있으면 벡터, 없으면 키워드 단독 degrade). throw-free. ──
  useEffect(() => {
    let cancelled = false;
    embed(POLICIES, { embed: env.embedProvider })
      .then((docs) => {
        if (!cancelled) setIndex(docs);
      })
      .catch(() => {
        if (!cancelled) setIndex([]);
      });
    return () => {
      cancelled = true;
    };
  }, [env.embedProvider]);

  // ── 원격 검색(C3): VITE_SEARCH_FN_URL+ANON_KEY 있으면 Edge Function 검색. 없으면 인메모리(dev/degrade). ──
  //  마운트 1회 생성(env는 빌드 시 고정). 위기·자격은 클라가 수행하므로 검색만 원격.
  const search = useMemo<TraverseDeps['search']>(() => {
    const fnUrl = import.meta.env.VITE_SEARCH_FN_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!fnUrl || !anonKey) return undefined;
    const remote = createRemoteSearch({ fnUrl, anonKey });
    return (query, opts) => remote.search(query, opts).then((r) => r.hits);
  }, []);

  // deps 안정화(memo) — 매 렌더 새 객체면 traverse 효과가 매번 재실행(원격 검색 네트워크 남발) → 입력 변화 시에만 갱신.
  const deps = useMemo<TraverseDeps>(
    () => ({
      now,
      index: index ?? [],
      policies: POLICIES,
      embed: env.embedProvider,
      // ★production layer-2 활성화: 앵커 주입(키 없으면 [] → 2층 자동 잠금, layer-1 불변).
      crisisDeps: { embed: env.embedProvider, crisisAnchors: env.crisisAnchors },
      search,
    }),
    [now, index, env.embedProvider, env.crisisAnchors, search],
  );

  if (index === null) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-500">
        불러오는 중…
      </main>
    );
  }

  return (
    <FunnelContainer
      graph={youthPolicyGraph}
      profile={profile}
      deps={deps}
      llm={env.llm}
      onApiKeyChange={() => setKeyEpoch((e) => e + 1)}
      onProfileChange={onProfileChange}
    />
  );
}
