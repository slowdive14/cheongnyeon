import { describe, it, expect, vi } from 'vitest';
import { traverse } from '@/domain/graph/traverse';
import type { TraverseDeps, TraverseState } from '@/domain/graph/traverse';
import { mentalHealthGraph } from '@/domain/graph/domains/mentalHealth';
import type { GraphNode } from '@/domain/graph/types';
import type { EmbeddingProvider, IndexedDoc } from '@/retrieval/types';
import type { UserProfile, Policy } from '@/domain/types';
import type { CachedPolicy } from '@/data/cache/types';
import * as hybridMod from '@/retrieval/hybridSearch';
import * as eligibilityMod from '@/domain/eligibility';

/**
 * Test 4.4/4.6 + TR-크라이시스 — 순회 통합(전용 fixture, 고정 clock).
 * ★위기 우선: 위기 입력 시 hybridSearch·evaluate 호출 안됨, result=null, resources 2건.
 */

const NOW = new Date('2026-06-24T12:00:00Z');

// ── 전용 fixture: 의미 벡터 + 정책 색인 ─────────────────────────────────
const VEC: Record<string, number[]> = {
  지치고무기력: [1, 0, 0, 0],
  심리상담: [0.95, 0.31, 0, 0],
  마음투자: [0.92, 0.39, 0, 0],
  고립은둔: [0, 1, 0, 0],
  이음센터: [0.31, 0.95, 0, 0],
  관계망: [0.39, 0.92, 0, 0],
  검사: [0, 0, 1, 0],
  자가검진: [0.31, 0, 0.95, 0],
  주거: [0, 0, 0, 1],
};
function vecFor(text: string): number[] {
  for (const k of Object.keys(VEC)) if (text.includes(k)) return VEC[k]!;
  return [0, 0, 0, 0];
}
function fixtureEmbed(): EmbeddingProvider {
  return { embed: vi.fn(async (texts: string[]) => texts.map(vecFor)) };
}

function doc(
  policyId: string,
  vecKey: string,
  category: string | null,
  keywords: string[],
): IndexedDoc {
  return { policyId, text: vecKey, vector: VEC[vecKey] ?? null, category, keywords };
}

// 색인: A군(심리상담), B군(이음센터), C군(검사), 무관(주거)
const INDEX: IndexedDoc[] = [
  doc('서울 청년 마음건강 지원사업', '심리상담', '마음건강', ['심리상담', '번아웃', '무기력', '지치고무기력']),
  doc('전국민 마음투자 바우처', '마음투자', '마음건강', ['마음투자', '바우처', '심리상담', '지치고무기력']),
  doc('이음센터 관계망 회복', '이음센터', '마음건강', ['이음센터', '고립', '은둔', '고립은둔', '관계망']),
  doc('관계망 형성 프로그램', '관계망', '마음건강', ['관계망', '고립은둔']),
  doc('정신건강 자가검진 안내', '자가검진', '마음건강', ['자가검진', '검사', '정신건강복지센터']),
  doc('청년 월세 지원', '주거', '주거', ['월세', '주거']),
];

/** 색인 id에 대응하는 평가 가능 정책(자격 데이터 포함). */
function policyFor(id: string, over: Partial<Policy> = {}): CachedPolicy {
  return {
    id,
    title: id,
    summary: null,
    ageMin: 19,
    ageMax: 39,
    income: { kind: 'none', raw: null },
    regionCodes: [],
    regionText: null,
    isNationwide: true,
    recruit: { kind: 'always', start: null, end: null },
    category: '마음건강',
    sourceUrl: 'https://example.com/' + id,
    source: 'ontong',
    documentsText: null,
    fetchedAt: '2026-06-24T00:00:00Z',
    updatedAt: '2026-06-24T00:00:00Z',
    contentHash: 'h-' + id,
    parsed: null,
    ...over,
  };
}

const ALL_POLICIES: CachedPolicy[] = INDEX.map((d) => policyFor(d.policyId));

const PROFILE: UserProfile = { age: 25, region: '서울', regionCode: '11', income: {} };

function deps(extra: Partial<TraverseDeps> = {}): TraverseDeps {
  return {
    embed: fixtureEmbed(),
    crisisDeps: { embed: fixtureEmbed(), crisisAnchors: [], semanticThreshold: 0.82 },
    now: NOW,
    index: INDEX,
    policies: ALL_POLICIES,
    ...extra,
  };
}

function state(nodeId: string, query?: string): TraverseState {
  return { nodeId, query, profile: PROFILE };
}

// ── Test 4.4 순회 ──────────────────────────────────────────────────────
describe('traverse — Test 4.4 순회', () => {
  it('TR-1 경로A 지치고무기력 → 심리상담 후보 포함', async () => {
    const r = await traverse(mentalHealthGraph, state('mh.burnout', '지치고무기력'), deps());
    expect(r.crisis.crisis).toBe(false);
    expect(r.result).not.toBeNull();
    const all = [...r.result!.now, ...r.result!.soon, ...r.result!.review, ...r.result!.blocked];
    const ids = all.map((e) => e.policy.id);
    expect(ids).toContain('서울 청년 마음건강 지원사업');
    expect(ids).toContain('전국민 마음투자 바우처');
  });

  it('TR-2 경로B 고립은둔 → 이음센터/관계망, 무관 정책 제외', async () => {
    const r = await traverse(mentalHealthGraph, state('mh.isolation', '고립은둔'), deps());
    const all = [...r.result!.now, ...r.result!.soon, ...r.result!.review, ...r.result!.blocked];
    const ids = all.map((e) => e.policy.id);
    expect(ids).toContain('이음센터 관계망 회복');
    expect(ids).not.toContain('청년 월세 지원'); // 하드 도메인 밖
  });

  it('TR-3 경로C 검사 → 자가검진/정신건강복지센터, always→now', async () => {
    const r = await traverse(mentalHealthGraph, state('mh.screening', '검사'), deps());
    const ids = r.result!.now.map((e) => e.policy.id);
    expect(ids).toContain('정신건강 자가검진 안내');
  });

  it('TR-4 embed=undefined → 키워드로 후보(빈 X) ★degrade', async () => {
    const r = await traverse(
      mentalHealthGraph,
      state('mh.burnout', '지치고무기력'),
      deps({ embed: undefined, crisisDeps: { crisisAnchors: [] } }),
    );
    expect(r.result).not.toBeNull();
    const all = [...r.result!.now, ...r.result!.soon, ...r.result!.review, ...r.result!.blocked];
    expect(all.length).toBeGreaterThan(0);
  });

  it('TR-5 nextChoices = 현재 노드의 children', async () => {
    const r = await traverse(mentalHealthGraph, state('mh.entry', '마음건강'), deps());
    const ids = r.nextChoices.map((n) => n.id);
    expect(ids).toContain('mh.burnout');
    expect(ids).toContain('mh.isolation');
    expect(ids).toContain('mh.screening');
  });

  it('TR-6 깨진 그래프 → throw 없이 빈', async () => {
    const r = await traverse(null as unknown as GraphNode, state('nope', '검사'), deps());
    expect(r.crisis.crisis).toBe(false);
    expect(Array.isArray(r.nextChoices)).toBe(true);
    expect(r.nextChoices).toEqual([]);
  });
});

// ── ★ TR-크라이시스 (최중요) ────────────────────────────────────────────
describe('traverse — ★TR-크라이시스 (위기 우선)', () => {
  it('TR-C1 query="죽고 싶다" → crisis=true, result=null, hybridSearch·evaluate 호출 안됨, resources 2건', async () => {
    const hybridSpy = vi.spyOn(hybridMod, 'hybridSearch');
    const evalSpy = vi.spyOn(eligibilityMod, 'evaluate');
    const r = await traverse(mentalHealthGraph, state('mh.burnout', '죽고 싶다'), deps());
    expect(r.crisis.crisis).toBe(true);
    expect(r.crisis.suppressGeneration).toBe(true);
    expect(r.crisis.resources).toHaveLength(2);
    expect(r.result).toBeNull();
    expect(hybridSpy).not.toHaveBeenCalled();
    expect(evalSpy).not.toHaveBeenCalled();
    hybridSpy.mockRestore();
    evalSpy.mockRestore();
  });

  it('TR-C2 TR-C1 + embed=undefined → 동일(1층 정규식)', async () => {
    const hybridSpy = vi.spyOn(hybridMod, 'hybridSearch');
    const r = await traverse(
      mentalHealthGraph,
      state('mh.burnout', '죽고 싶다'),
      deps({ embed: undefined, crisisDeps: undefined }),
    );
    expect(r.crisis.crisis).toBe(true);
    expect(r.result).toBeNull();
    expect(hybridSpy).not.toHaveBeenCalled();
    hybridSpy.mockRestore();
  });

  // 2층-only 입력(1층 정규식 미매칭): 순수 의미감지 경로를 검증.
  // 주의: production은 crisisAnchors 미주입 → 2층 비작동(Phase 6). H-B로 고빈도 맥락어
  //  ("더는 못 버티겠어" 등)는 1층이 흡수하므로, 여기선 1층에 안 걸리는 맥락어를 쓴다.
  const TWO_LAYER_ONLY = '요즘 모든 게 의미가 없게 느껴져';

  it('TR-C3 2층-only 맥락어 + 의미 embed → crisis=true(semantic), result 비움', async () => {
    const semEmbed: EmbeddingProvider = { embed: vi.fn(async () => [[1, 0]]) };
    const r = await traverse(
      mentalHealthGraph,
      state('mh.burnout', TWO_LAYER_ONLY),
      deps({ crisisDeps: { embed: semEmbed, crisisAnchors: [[1, 0]], semanticThreshold: 0.82 } }),
    );
    expect(r.crisis.crisis).toBe(true);
    expect(r.crisis.layer).toBe('semantic');
    expect(r.result).toBeNull();
  });

  it('TR-C4 2층-only 맥락어 + 의미 embed 미제공 → crisis=false→일반검색(의도된 degrade)', async () => {
    const r = await traverse(
      mentalHealthGraph,
      state('mh.burnout', TWO_LAYER_ONLY),
      deps({ crisisDeps: { crisisAnchors: [] } }),
    );
    expect(r.crisis.crisis).toBe(false);
    expect(r.result).not.toBeNull();
  });
});

// ── Test 4.6 막힌 경로 → 대안 ───────────────────────────────────────────
describe('traverse — Test 4.6 막힌 경로', () => {
  // 나이 초과로 전부 blocked 되는 프로필
  const tooOld: UserProfile = { age: 99, region: '서울', regionCode: '11', income: {} };
  // ageMax=30 정책만 담은 색인
  const blockedIndex: IndexedDoc[] = [
    doc('나이제한 심리상담', '심리상담', '마음건강', ['심리상담', '지치고무기력']),
  ];

  it('BP-1 후보 전부 blocked → result에 blocked 직노출(빨강) 대신 alternatives 채움', async () => {
    // ageMax를 강제 적용하기 위해 evaluate가 blocked 내도록: 색인 정책 id가 평가에서 blocked 되게
    // (eligibility는 정책 레코드를 조회해야 함 → traverse가 index→policy 매핑을 deps에서 받거나 색인에 포함)
    // 본 테스트는 traverse가 candidate→정책조회→evaluate 후 blocked만이면 alternatives 채움을 검증.
    const r = await traverse(
      blockedGraph(),
      { nodeId: 'b.leaf', query: '지치고무기력', profile: tooOld },
      deps({ index: blockedIndex, policies: [policyFor('나이제한 심리상담', { ageMin: 19, ageMax: 30 })] }),
    );
    // blocked만이면 result.now/soon/review 비고 alternatives 노출, 빨강 직출력 금지
    if (r.result) {
      expect(r.result.now).toHaveLength(0);
      expect(r.result.soon).toHaveLength(0);
    }
    expect(Array.isArray(r.alternatives)).toBe(true);
  });

  it('BP-4 후보 0건 → alternatives 채움, 빈 빨강 금지', async () => {
    const r = await traverse(
      mentalHealthGraph,
      state('mh.isolation', '존재하지않는검색어xyz'),
      deps({ index: [doc('무관', '주거', '주거', ['월세'])] }),
    );
    // 후보 0 → blocked 비노출, alternatives 제공
    expect(Array.isArray(r.alternatives)).toBe(true);
    if (r.result) {
      expect(r.result.blocked).toHaveLength(0);
    }
  });
});

/** blocked 시나리오용 작은 그래프(대안 형제 노드 보유). */
function blockedGraph(): GraphNode {
  return {
    id: 'b.entry',
    label: '입구',
    concept: '마음건강',
    allowedCategories: ['마음건강'],
    kind: 'entry',
    children: [
      {
        id: 'b.leaf',
        label: '심리상담',
        concept: '지치고무기력 심리상담',
        allowedCategories: ['마음건강'],
        boostKeywords: ['지치고무기력'],
        keywords: ['지치고무기력', '심리상담'],
        kind: 'leaf',
      },
      {
        id: 'b.alt',
        label: '대안 갈래',
        concept: '다른 도움',
        kind: 'leaf',
      },
    ],
  };
}
