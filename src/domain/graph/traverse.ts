import type { GraphNode, UserProfile, Policy } from '../types';
import type { CachedPolicy } from '../../data/cache/types';
import type { EmbeddingProvider, IndexedDoc, SearchHit } from '../../retrieval/types';
import { detectCrisis, type CrisisResult, type CrisisDetectDeps } from '../crisisDetect';
import * as retrieval from '../../retrieval/hybridSearch';
import * as engine from '../eligibility';
import type { EvaluateResult } from '../eligibility';

/**
 * 욕구 그래프 순회 — 위기 라우팅 → 스코프 검색 → 자격 평가 → 막힌경로 대안.
 *
 * ★안전 순서(엄수):
 *  1) detectCrisis(query). 위기면 즉시 반환 — 검색·evaluate·AI 호출 안 함, result=null,
 *     resources/suppress 채움. (위기가 모든 매칭·생성보다 우선. 거짓음성 0.)
 *  2) 노드 스코프로 hybridSearch(거친=hard, 세부=soft).
 *  3) 후보 → 정책 조회 → evaluate.
 *  4) now/soon/review가 있으면 result로 노출. blocked만(혹은 후보 0)이면 result에 빨강
 *     직노출하지 않고 alternatives(형제 노드)로 대안 갈래 유도(Phase 3 인수인계).
 *
 * throw-free: 깨진 그래프/색인/정책 모두 빈/안전 결과로 흡수.
 * 주의: hybridSearch·evaluate는 namespace로 호출(테스트 spy 가능 — TR-C1 호출 검증).
 */

export interface TraverseState {
  nodeId: string;
  query?: string;
  profile: UserProfile;
}

export interface TraverseResult {
  /** ★최상위·정책보다 먼저. UI가 위기 우선 소비. */
  crisis: CrisisResult;
  nextChoices: GraphNode[];
  /** 위기 시 null. */
  result: EvaluateResult | null;
  /** blocked만/후보0일 때 대안 갈래(빨강 직출력 금지). */
  alternatives: GraphNode[];
}

export interface TraverseDeps {
  embed?: EmbeddingProvider;
  crisisDeps?: CrisisDetectDeps;
  now: Date;
  index: IndexedDoc[];
  /** 색인 id→평가 가능 정책 조회용(없으면 색인에서 최소 Policy 합성→review). */
  policies?: CachedPolicy[];
  soonWithinDays?: number;
  /**
   * 원격 검색 주입(C3). 있으면 인메모리 hybridSearch 대신 이걸로 후보 Policy[]를 얻는다
   * (Edge Function 검색). 없으면 기존 인메모리 경로(degrade/dev). 자격·위기는 무관.
   *
   * opts.regionCode(★blocker 수정): 사용자 시·도가 있으면 서버가 지역 인지 후보 선정을 하도록
   *  전달한다(양립 불가 정책이 topK quota를 잠식하지 않게). 자격 권위는 여전히 클라 eligibility
   *  (서버 필터는 후보 품질용). 미선택이면 미전달 → 현 동작 동일.
   */
  search?: (
    query: string,
    opts: { topK: number; hardCategories?: string[]; regionCode?: string },
  ) => Promise<Policy[]>;
}

/** profile에서 자격 비교용 유효 시·도 코드 추출. 빈 문자열/비문자열 → undefined. */
function usableRegionCode(profile: UserProfile | undefined): string | undefined {
  const code = profile?.regionCode;
  return typeof code === 'string' && code.trim().length > 0 ? code : undefined;
}

/**
 * ★후보 품질용 지역 양립성 판정(자격 판정이 아님).
 *  사용자 지역과 양립 가능한가 = 전국(isNationwide) ∥ 지역 미상(regionCodes 빈 배열) ∥ 코드 일치.
 *  ★보수 원칙: 지역 미상은 배제하지 않는다 — 클라 regionAxis가 REGION_UNKNOWN(확인 필요)으로
 *   노출해야 하므로 후보 보존. 자격 권위는 여전히 클라 eligibility(regionAxis가 최종 판정).
 *   이 함수는 "후보 목록에서 뺄지"만, eligibility는 "판정"만(이중 방어의 후보 선정 절반).
 */
function regionCompatible(p: Policy | undefined, regionCode: string): boolean {
  if (p?.isNationwide === true) return true;
  const codes = Array.isArray(p?.regionCodes) ? p.regionCodes : [];
  if (codes.length === 0) return true; // 지역 미상 보존(REGION_UNKNOWN 노출용)
  return codes.includes(regionCode);
}

/**
 * 인메모리 색인 pre-filter — 양립 불가 정책의 색인 문서를 검색(topK 절단) 이전에 제거해
 *  quota 잠식을 막는다. deps.policies의 지역 메타로 policyId별 양립성 판정. policies 없거나
 *  regionCode 없으면 무변경(전부 통과 = 현 동작).
 */
function filterIndexByRegion(
  index: IndexedDoc[],
  policies: CachedPolicy[] | undefined,
  regionCode: string | undefined,
): IndexedDoc[] {
  if (!regionCode || !Array.isArray(index)) return index;
  const byId = new Map<string, Policy>();
  if (Array.isArray(policies)) {
    for (const p of policies) {
      if (p && typeof p === 'object' && typeof p.id === 'string') byId.set(p.id, p);
    }
  }
  return index.filter((d) => {
    if (!d || typeof d.policyId !== 'string') return true; // 결손 문서는 보존(누락 금지)
    const p = byId.get(d.policyId);
    if (!p) return true; // 정책 미상(합성 폴백 대상) 보존 → review로 처리
    return regionCompatible(p, regionCode);
  });
}

/** 위기일 때 안전 결과(검색·평가 미수행). */
function crisisResult(crisis: CrisisResult, node: GraphNode | null): TraverseResult {
  return {
    crisis,
    nextChoices: childrenOf(node),
    result: null,
    alternatives: [],
  };
}

function childrenOf(node: GraphNode | null): GraphNode[] {
  return node && Array.isArray(node.children) ? node.children.slice() : [];
}

/** 그래프에서 nodeId 탐색(DFS, throw-free). */
function findNode(graph: GraphNode | null | undefined, nodeId: string): GraphNode | null {
  if (!graph || typeof graph !== 'object') return null;
  if (graph.id === nodeId) return graph;
  if (!Array.isArray(graph.children)) return null;
  for (const child of graph.children) {
    const found = findNode(child, nodeId);
    if (found) return found;
  }
  return null;
}

/** 색인 id → 정책 조회. 없으면 색인 메타로 최소 Policy 합성(자격 데이터 결손 → review). */
function resolvePolicies(hits: SearchHit[], deps: TraverseDeps): Policy[] {
  const byId = new Map<string, Policy>();
  if (Array.isArray(deps.policies)) {
    for (const p of deps.policies) {
      if (p && typeof p === 'object' && typeof p.id === 'string') byId.set(p.id, p);
    }
  }
  const indexById = new Map<string, IndexedDoc>();
  if (Array.isArray(deps.index)) {
    for (const d of deps.index) {
      if (d && typeof d === 'object' && typeof d.policyId === 'string') indexById.set(d.policyId, d);
    }
  }

  const out: Policy[] = [];
  for (const hit of hits) {
    if (!hit || typeof hit.policyId !== 'string') continue;
    const found = byId.get(hit.policyId);
    if (found) {
      out.push(found);
      continue;
    }
    // 폴백: 색인 메타로 최소 Policy(자격 결손 → evaluate가 보수적으로 review 처리).
    const doc = indexById.get(hit.policyId);
    out.push(synthesizePolicy(hit.policyId, doc ?? null));
  }
  return out;
}

function synthesizePolicy(id: string, doc: IndexedDoc | null): Policy {
  return {
    id,
    title: id,
    summary: null,
    ageMin: null,
    ageMax: null,
    income: { kind: 'unknown', raw: null },
    regionCodes: [],
    regionText: null,
    isNationwide: false,
    recruit: { kind: 'unknown', start: null, end: null },
    category: doc?.category ?? null,
    sourceUrl: null,
    source: 'unknown',
    documentsText: null,
  };
}

/** result에 노출 가능한(빨강 아님) 결과가 있는가 = now/soon/review 중 하나라도. */
function hasShowable(result: EvaluateResult): boolean {
  return result.now.length > 0 || result.soon.length > 0 || result.review.length > 0;
}

export async function traverse(
  graph: GraphNode,
  state: TraverseState,
  deps: TraverseDeps,
): Promise<TraverseResult> {
  const node = findNode(graph, state?.nodeId);
  const query = typeof state?.query === 'string' ? state.query : '';

  // ── 1) 위기 라우팅(최우선). 위기면 검색·평가·AI 미수행. ──
  let crisis: CrisisResult;
  try {
    crisis = await detectCrisis(query, deps?.crisisDeps);
  } catch {
    // detectCrisis는 throw-free지만 방어: 실패 시 1층만이라도.
    crisis = { crisis: false, layer: 'none', resources: [], suppressGeneration: false };
  }
  if (crisis.crisis) {
    return crisisResult(crisis, node);
  }

  // 그래프 결손 → 빈(throw-free).
  if (!node) {
    return { crisis, nextChoices: [], result: null, alternatives: [] };
  }

  // ── 2) 노드 스코프 검색 → 후보 Policy[]. 원격(deps.search) 우선, 없으면 인메모리 hybridSearch(degrade). ──
  //  ★지역 인지: profile 시·도가 있으면 후보 선정에서 양립 불가 정책을 배제(topK quota 잠식 방지).
  //   regionCode는 state.profile에서 꺼내 opts/필터로만 쓴다(deps memo와 무관 — T8 불변 유지).
  const regionCode = usableRegionCode(state?.profile);
  let policies: Policy[] = [];
  if (query.length > 0) {
    if (deps.search) {
      try {
        // 원격: 서버가 지역 인지 후보 선정(regionCode 있을 때만 전달, 없으면 undefined=현 동작).
        policies = await deps.search(query, {
          topK: 10,
          hardCategories: node.allowedCategories,
          regionCode,
        });
      } catch {
        policies = [];
      }
    } else {
      // 인메모리 degrade도 동일 quota 잠식 문제 → 검색(topK 절단) 이전에 색인을 지역 pre-filter.
      const scopedIndex = filterIndexByRegion(deps.index, deps.policies, regionCode);
      let hits: SearchHit[] = [];
      try {
        hits = await retrieval.hybridSearch(
          query,
          scopedIndex,
          { embed: deps.embed },
          {
            topK: 10,
            hardCategories: node.allowedCategories,
            boostCategories: node.boostCategories,
            boostKeywords: node.boostKeywords,
          },
        );
      } catch {
        hits = [];
      }
      policies = resolvePolicies(hits, deps);
    }
  }

  const siblings = childrenOf(node);

  // ── 후보 0건 → 대안 갈래(빈 빨강 금지). ──
  if (policies.length === 0) {
    return {
      crisis,
      nextChoices: siblings,
      result: { now: [], soon: [], blocked: [], review: [] },
      alternatives: siblings,
    };
  }

  // ── 3) 후보 → evaluate. ──
  let evaluated: EvaluateResult;
  try {
    evaluated = engine.evaluate(state.profile, policies, {
      now: deps.now,
      soonWithinDays: deps.soonWithinDays,
    });
  } catch {
    evaluated = { now: [], soon: [], blocked: [], review: [] };
  }

  // ── 4) blocked만이면 빨강 직노출 금지 → alternatives. ──
  if (!hasShowable(evaluated)) {
    return {
      crisis,
      nextChoices: siblings,
      // blocked는 비노출(대안 갈래로 유도). result는 빈 버킷으로 반환(빨강 직출력 금지).
      result: { now: evaluated.now, soon: evaluated.soon, blocked: [], review: evaluated.review },
      alternatives: siblings,
    };
  }

  return {
    crisis,
    nextChoices: siblings,
    result: evaluated,
    alternatives: [],
  };
}
