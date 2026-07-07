import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { FunnelContainer } from '@/ui/funnel/FunnelContainer';
import { mentalHealthGraph } from '@/domain/graph/domains/mentalHealth';
import type { TraverseDeps, TraverseResult } from '@/domain/graph/traverse';
import type { EmbeddingProvider, IndexedDoc } from '@/retrieval/types';
import type { Policy, UserProfile } from '@/domain/types';
import type { CachedPolicy } from '@/data/cache/types';

/**
 * Test 5.1 — 깔때기 통합(RTL). LLM off, 버튼만으로 end-to-end.
 * NOW 고정 = 2026-06-24T12:00:00Z. 결정형(deps 주입).
 *
 * 안전 검증: 지금/곧/확인필요 3상태, '추정' 고지, 원문 링크(null 안전), 최종 업데이트,
 *  blocked만 미노출(review는 '자격 확인 필요'로 노출). (mentalHealth.graph.test.ts의 NOW·INDEX·policyFor 복제.)
 */

const NOW = new Date('2026-06-24T12:00:00Z');

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

const INDEX: IndexedDoc[] = [
  doc('서울 청년 마음건강 지원사업', '심리상담', '마음건강', ['심리상담', '번아웃', '무기력', '지치고무기력']),
  doc('전국민 마음투자 바우처', '마음투자', '마음건강', ['마음투자', '바우처', '심리상담', '지치고무기력']),
  doc('이음센터 관계망 회복', '이음센터', '마음건강', ['이음센터', '고립', '은둔', '고립은둔', '관계망']),
  doc('관계망 형성 프로그램', '관계망', '마음건강', ['관계망', '고립은둔']),
  doc('정신건강 자가검진 안내', '자가검진', '마음건강', ['자가검진', '검사', '정신건강복지센터']),
  doc('청년 월세 지원', '주거', '주거', ['월세', '주거']),
];

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
    fetchedAt: '2026-06-24T00:00:00Z',
    updatedAt: '2026-06-20T00:00:00Z',
    contentHash: 'h-' + id,
    parsed: null,
    ...over,
  };
}

// 기본 프로필(데모용): age 범위 내, income none, region 전국. 리더 결정 3.
const PROFILE: UserProfile = { age: 25, region: '전국', regionCode: '11', income: {} };

function deps(extra: Partial<TraverseDeps> = {}): TraverseDeps {
  return {
    embed: fixtureEmbed(),
    crisisDeps: { embed: fixtureEmbed(), crisisAnchors: [], semanticThreshold: 0.82 },
    now: NOW,
    index: INDEX,
    policies: INDEX.map((d) => policyFor(d.policyId)),
    ...extra,
  };
}

function renderFunnel(extra: Partial<TraverseDeps> = {}) {
  return render(
    <FunnelContainer graph={mentalHealthGraph} profile={PROFILE} deps={deps(extra)} />,
  );
}

/** entry → burnout 갈래 선택 → 결과 도달까지 클릭. */
async function journeyToBurnoutResult() {
  // STEP0: entry. 갈래 칩이 떠야 함.
  const burnoutChip = await screen.findByRole('button', { name: /지치고 무기력/ });
  fireEvent.click(burnoutChip);
}

describe('Test 5.1 — 깔때기 통합 (경로 A journey)', () => {
  it('A 입구 클릭→갈래→결과 카드 ≥1', async () => {
    renderFunnel();
    await journeyToBurnoutResult();
    const cards = await screen.findAllByTestId('policy-result-card');
    expect(cards.length).toBeGreaterThanOrEqual(1);
  });

  it("B '추정' 고지 노출", async () => {
    renderFunnel();
    await journeyToBurnoutResult();
    await screen.findAllByTestId('policy-result-card');
    expect(screen.getAllByText(/추정/).length).toBeGreaterThan(0);
  });

  it('C 원문 링크 href = sourceUrl', async () => {
    renderFunnel();
    await journeyToBurnoutResult();
    const cards = await screen.findAllByTestId('policy-result-card');
    const link = within(cards[0]!).getByRole('link', { name: /신청 페이지 열기|온통청년/ });
    expect(link).toHaveAttribute('href', expect.stringContaining('https://example.com/'));
  });

  it('D 최종 업데이트 시각 표시', async () => {
    renderFunnel();
    await journeyToBurnoutResult();
    await screen.findAllByTestId('policy-result-card');
    expect(screen.getAllByText(/업데이트/).length).toBeGreaterThan(0);
  });

  it('E1 blocked 정책 title 부재 (나이 초과 프로필)', async () => {
    // ageMax=20 정책만 → age 25 프로필은 blocked → 미노출.
    const blockedPolicies = INDEX.filter((d) => d.category === '마음건강').map((d) =>
      policyFor(d.policyId, { ageMin: 10, ageMax: 20 }),
    );
    renderFunnel({ policies: blockedPolicies });
    await journeyToBurnoutResult();
    // 결과 카드 0 + blocked title 직노출 0
    expect(screen.queryByText('서울 청년 마음건강 지원사업')).toBeNull();
    expect(screen.queryByTestId('policy-result-card')).toBeNull();
  });

  it('E2 배지 2종(지금/곧)만, 막힘/부적격 문구 부재', async () => {
    renderFunnel();
    await journeyToBurnoutResult();
    await screen.findAllByTestId('policy-result-card');
    expect(screen.queryByText(/막힘|부적격|탈락|blocked/i)).toBeNull();
    // 지금 또는 곧 배지 존재
    expect(screen.getAllByText(/지금|곧/).length).toBeGreaterThan(0);
  });

  it('E3 경계: end=NOW+5d → soon(곧), end=NOW+30d → now(지금)', async () => {
    const soonPolicy = policyFor('서울 청년 마음건강 지원사업', {
      recruit: { kind: 'dated', start: '2026-06-01', end: '2026-06-29' }, // NOW+5d
    });
    const nowPolicy = policyFor('전국민 마음투자 바우처', {
      recruit: { kind: 'dated', start: '2026-06-01', end: '2026-07-24' }, // NOW+30d
    });
    renderFunnel({ policies: [soonPolicy, nowPolicy] });
    await journeyToBurnoutResult();
    await screen.findAllByTestId('policy-result-card');
    const soonCard = screen.getByText('서울 청년 마음건강 지원사업').closest('[data-testid="policy-result-card"]')!;
    const nowCard = screen.getByText('전국민 마음투자 바우처').closest('[data-testid="policy-result-card"]')!;
    expect(within(soonCard as HTMLElement).getByText(/곧/)).toBeInTheDocument();
    expect(within(nowCard as HTMLElement).getByText(/지금/)).toBeInTheDocument();
  });

  it('E4 후보 0/전부 blocked → 대안 칩 + 안내, blocked 직노출 0', async () => {
    const blockedPolicies = INDEX.filter((d) => d.category === '마음건강').map((d) =>
      policyFor(d.policyId, { ageMin: 10, ageMax: 20 }),
    );
    renderFunnel({ policies: blockedPolicies });
    await journeyToBurnoutResult();
    // 대안 칩(형제 노드) 또는 안내 노출, blocked 카드 0
    expect(screen.queryByTestId('policy-result-card')).toBeNull();
    expect(await screen.findByTestId('alternatives')).toBeInTheDocument();
  });

  it('E5 review 정책 → 자격 확인 필요 카드 노출(보수 판정)', async () => {
    // 비전국 + 나이 null → review(AGE_UNKNOWN). (전국민 null-age는 Lever A로 now가 되므로 비전국으로.)
    const reviewPolicies = INDEX.filter((d) => d.category === '마음건강').map((d) =>
      policyFor(d.policyId, { ageMin: null, ageMax: null, isNationwide: false, regionCodes: ['11'] }),
    );
    renderFunnel({ policies: reviewPolicies });
    await journeyToBurnoutResult();
    const cards = await screen.findAllByTestId('policy-result-card');
    expect(cards.length).toBeGreaterThan(0);
    // review 등급화: 단일 사유="거의 다 왔어요" / 다중 사유="몇 가지만 확인하면 돼요".
    expect(screen.getAllByText(/거의 다 왔어요|몇 가지만 확인하면 돼요/).length).toBeGreaterThan(0);
    // 보수 판정 — 부적격/탈락 단정은 없어야 한다.
    expect(screen.queryByText(/막힘|부적격|탈락/)).toBeNull();
  });

  it('E6 sourceUrl/title null 폴백 안 깨짐', async () => {
    const nullPolicies = [
      policyFor('전국민 마음투자 바우처', { sourceUrl: null, title: null as unknown as string }),
    ];
    renderFunnel({ policies: nullPolicies });
    await journeyToBurnoutResult();
    const cards = await screen.findAllByTestId('policy-result-card');
    expect(cards.length).toBeGreaterThanOrEqual(1);
    // sourceUrl null → 링크 없음(throw 없이)
    expect(within(cards[0]!).queryByRole('link')).toBeNull();
  });

  it('T-E4 헤드라인 N = 실제 노출 카드 수', async () => {
    renderFunnel();
    await journeyToBurnoutResult();
    await screen.findAllByTestId('policy-result-card');
    // 헤드라인 N과 렌더된 카드 수가 정확히 일치(헛개수 금지, blocked 제외).
    await waitFor(() => {
      const cards = screen.getAllByTestId('policy-result-card');
      const headline = screen.getByText(/맞을 만한 \d+개를 찾았어요/).textContent ?? '';
      const n = Number(headline.match(/맞을 만한 (\d+)개/)?.[1]);
      expect(n).toBe(cards.length);
    });
  });

  it('T-E4 빈 결과(카드 0) → 헤드라인 미표시 + "이런 쪽은 어때요?"', async () => {
    // 매칭 0(index·policies 모두 비움) → 노출 카드 0 → 대안 유도.
    renderFunnel({ policies: [], index: [] });
    await journeyToBurnoutResult();
    await screen.findByTestId('alternatives');
    expect(screen.queryByText(/상황에 맞을 만한/)).toBeNull();
    expect(screen.getByText(/이 방향으론 못 찾았어요\. 이런 쪽은 어때요\?/)).toBeInTheDocument();
  });

  it('T-F3 동행 블록: 검증 연락처 없으면(v1) 미렌더 — 결과·CrisisFooter는 정상', async () => {
    renderFunnel();
    await journeyToBurnoutResult();
    await screen.findAllByTestId('policy-result-card');
    // v1: 청년센터 연락처 전량 null → 무실효 블록 미렌더(운영자 검증 입력 시 자동 노출).
    expect(screen.queryByTestId('youth-center-link')).toBeNull();
    // 결과 섹션·CrisisFooter는 정상 노출(동행 블록 게이팅이 다른 요소를 해치지 않음).
    expect(screen.getByTestId('crisis-footer')).toBeInTheDocument();
  });
});

describe('검색 대기 로딩(빈 결과 번쩍임 방지)', () => {
  it('검색 중(traverse 미완) → SearchingIndicator, 빈결과·카드 미노출', async () => {
    let resolveIt: (v: TraverseResult) => void = () => {};
    const pending = new Promise<TraverseResult>((r) => {
      resolveIt = r;
    });
    const traverseFn = vi.fn(() => pending) as unknown as typeof import('@/domain/graph/traverse').traverse;
    render(
      <FunnelContainer graph={mentalHealthGraph} profile={PROFILE} deps={deps()} traverseFn={traverseFn} />,
    );
    // 질의 채움(갈래 클릭) → 검색 시작. 대기 중엔 로딩 인디케이터만.
    fireEvent.click(await screen.findByRole('button', { name: /지치고 무기력/ }));
    expect(await screen.findByTestId('searching')).toBeInTheDocument();
    expect(screen.queryByTestId('alternatives')).toBeNull();
    expect(screen.queryByText(/이 방향으론 못 찾았어요/)).toBeNull();
    expect(screen.queryByTestId('policy-result-card')).toBeNull();

    // 검색 완료(빈 결과) → 인디케이터 사라지고 대안 유도.
    resolveIt({
      crisis: { crisis: false, layer: 'none', resources: [], suppressGeneration: false },
      nextChoices: [],
      result: { now: [], soon: [], blocked: [], review: [] },
      alternatives: mentalHealthGraph.children ?? [],
    });
    await waitFor(() => expect(screen.queryByTestId('searching')).toBeNull());
    expect(screen.getByTestId('alternatives')).toBeInTheDocument();
  });
});
