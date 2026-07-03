import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FunnelContainer } from '@/ui/funnel/FunnelContainer';
import { mentalHealthGraph } from '@/domain/graph/domains/mentalHealth';
import type { TraverseDeps } from '@/domain/graph/traverse';
import type { IndexedDoc } from '@/retrieval/types';
import type { Policy, UserProfile } from '@/domain/types';
import type { CachedPolicy } from '@/data/cache/types';

/**
 * 프로필 입력 UI 통합(T5 위기 불변식 + T6 미입력=review 배선).
 *
 * ★안전 불변식:
 *  - S3(T5): 위기 시 profile-input 미렌더(SafetyBanner 단독). 렌더 불변식 1 확장.
 *  - S1(T6): 미입력(시·도 '선택 안 함' + 나이 빈칸) → 비전국 지역·나이 정책 review 유지
 *    (REGION_PROFILE_MISSING/AGE_UNKNOWN → '확인 필요' 카드). blocked/숨김 0.
 */

const NOW = new Date('2026-06-24T12:00:00Z');

// 미입력 프로필: 시·도 '선택 안 함'(regionCode undefined) + 나이 빈칸(age undefined).
const MISSING_PROFILE: UserProfile = { age: undefined, region: '전국', regionCode: undefined, income: {} };

const VEC: Record<string, number[]> = {
  지치고무기력: [1, 0, 0, 0],
  심리상담: [0.95, 0.31, 0, 0],
};
function vecFor(text: string): number[] {
  for (const k of Object.keys(VEC)) if (text.includes(k)) return VEC[k]!;
  return [0, 0, 0, 0];
}
function fixtureEmbed() {
  return { embed: vi.fn(async (texts: string[]) => texts.map(vecFor)) };
}

const INDEX: IndexedDoc[] = [
  {
    policyId: '서울 청년 마음건강 지원사업',
    text: '심리상담',
    vector: VEC['심리상담'] ?? null,
    category: '마음건강',
    keywords: ['심리상담', '번아웃', '무기력', '지치고무기력'],
  },
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

function renderFunnel(profile: UserProfile = MISSING_PROFILE, extra: Partial<TraverseDeps> = {}) {
  return render(
    <FunnelContainer graph={mentalHealthGraph} profile={profile} deps={deps(extra)} />,
  );
}

describe('T5 — 위기 시 ProfileInput 미렌더 (★S3 위기 불변식)', () => {
  it('비위기 초기 화면 → profile 알약 존재(탭 시 펼침)', async () => {
    renderFunnel();
    const pill = await screen.findByTestId('profile-pill');
    expect(pill).toBeInTheDocument();
    fireEvent.click(pill);
    expect(screen.getByLabelText('거주 지역 (시·도)')).toBeInTheDocument();
    expect(screen.getByLabelText('나이')).toBeInTheDocument();
  });

  it("직접 위기어 '죽고 싶어요' → SafetyBanner 존재 && profile-input 부재", async () => {
    renderFunnel();
    const box = await screen.findByRole('textbox', { name: /상황/ });
    fireEvent.change(box, { target: { value: '죽고 싶어요' } });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByTestId('profile-pill')).toBeNull();
    expect(screen.queryByLabelText('거주 지역 (시·도)')).toBeNull();
    expect(screen.queryByLabelText('나이')).toBeNull();
  });

  it("완곡 위기 '버틸 힘이 없어' → profile-input 부재", async () => {
    renderFunnel();
    const box = await screen.findByRole('textbox', { name: /상황/ });
    fireEvent.change(box, { target: { value: '버틸 힘이 없어 정책 추천해줘' } });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByLabelText('거주 지역 (시·도)')).toBeNull();
  });
});

describe('T6 — 미입력 profile → review 유지 (★S1 end-to-end 안전)', () => {
  /** entry → burnout 갈래 선택 → 결과 도달. */
  async function journeyToBurnoutResult() {
    const burnoutChip = await screen.findByRole('button', { name: /지치고 무기력/ });
    fireEvent.click(burnoutChip);
  }

  it('미입력 + 비전국 지역 정책(regionCodes=[26]) → REGION_PROFILE_MISSING review (blocked/숨김 0)', async () => {
    const reviewPolicies = [
      policyFor('서울 청년 마음건강 지원사업', {
        ageMin: null,
        ageMax: null,
        isNationwide: false,
        regionCodes: ['26'],
      }),
    ];
    renderFunnel(MISSING_PROFILE, { policies: reviewPolicies });
    await journeyToBurnoutResult();
    const cards = await screen.findAllByTestId('policy-result-card');
    expect(cards.length).toBeGreaterThan(0);
    expect(screen.getAllByText(/거의 다 왔어요|몇 가지만 확인하면 돼요/).length).toBeGreaterThan(0);
    // 보수 판정 — 부적격/탈락 단정 없음.
    expect(screen.queryByText(/막힘|부적격|탈락/)).toBeNull();
  });

  it('미입력 + 비전국 나이 정책 → AGE_UNKNOWN review (확인 필요, blocked 아님)', async () => {
    const reviewPolicies = [
      policyFor('서울 청년 마음건강 지원사업', {
        ageMin: 19,
        ageMax: 34,
        isNationwide: false,
        regionCodes: ['11'],
      }),
    ];
    renderFunnel({ age: undefined, region: '서울', regionCode: '11', income: {} }, { policies: reviewPolicies });
    await journeyToBurnoutResult();
    const cards = await screen.findAllByTestId('policy-result-card');
    expect(cards.length).toBeGreaterThan(0);
    expect(screen.getAllByText(/거의 다 왔어요|몇 가지만 확인하면 돼요/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/막힘|부적격|탈락/)).toBeNull();
  });
});
