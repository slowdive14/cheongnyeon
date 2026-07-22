import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FunnelContainer } from '@/ui/funnel/FunnelContainer';
import { mentalHealthGraph } from '@/domain/graph/domains/mentalHealth';
import type { TraverseDeps, TraverseResult, TraverseState } from '@/domain/graph/traverse';
import type { GraphNode, UserProfile } from '@/domain/types';
import { safetyResources } from '@/domain/safetyResources';
import { SAVED_STORAGE_KEY } from '@/ui/funnel/savedPoliciesStore';

beforeEach(() => localStorage.clear());

/**
 * Test 5.2 — 위기 화면. 리더 결정 2: 위기 결과를 traverse 주입/모킹으로 검증.
 * 안전 불변식: 배너 DOM상 정책/스텝보다 먼저(compareDocumentPosition 엄격검증),
 *  위기 시 result=null→카드0, crisis=false→배너 미렌더, resources=[]→throw 없음.
 */

const NOW = new Date('2026-06-24T12:00:00Z');

const PROFILE: UserProfile = { age: 25, region: '전국', regionCode: '11', income: {} };

function baseDeps(): TraverseDeps {
  return { now: NOW, index: [], policies: [] };
}

/** 주입형 traverse — 고정 결과 반환(결정형). */
function crisisTraverse(resources = safetyResources()) {
  return vi.fn(
    async (_graph: GraphNode, _state: TraverseState, _deps: TraverseDeps): Promise<TraverseResult> => ({
      crisis: { crisis: true, layer: 'regex', resources, suppressGeneration: true },
      nextChoices: mentalHealthGraph.children ?? [],
      result: null,
      alternatives: [],
    }),
  );
}

/**
 * 적대적 주입 — crisis=true와 동시에 result(now/soon/blocked/review) + alternatives + nextChoices를
 * 모두 채워 반환. early-return이 깨지면 배너 옆에 카드/칩/헤더가 공존하게 되어 잡힌다.
 */
function crisisWithEverythingTraverse() {
  const ev = {
    policy: { id: 'p-leak', title: '누수 정책', sourceUrl: null } as never,
    reasons: [],
    recruitStatus: 'now',
  } as never;
  return vi.fn(
    async (): Promise<TraverseResult> => ({
      crisis: { crisis: true, layer: 'regex', resources: safetyResources(), suppressGeneration: true },
      nextChoices: mentalHealthGraph.children ?? [],
      result: { now: [ev], soon: [ev], blocked: [ev], review: [ev] },
      alternatives: mentalHealthGraph.children ?? [],
    }),
  );
}

function calmTraverse() {
  return vi.fn(
    async (): Promise<TraverseResult> => ({
      crisis: { crisis: false, layer: 'none', resources: [], suppressGeneration: false },
      nextChoices: mentalHealthGraph.children ?? [],
      result: null,
      alternatives: mentalHealthGraph.children ?? [],
    }),
  );
}

describe('Test 5.2 — 위기 화면', () => {
  it('A crisis=true·resources=[109,1577-0199] → 배너 노출', async () => {
    render(
      <FunnelContainer
        graph={mentalHealthGraph}
        profile={PROFILE}
        deps={baseDeps()}
        traverseFn={crisisTraverse()}
      />,
    );
    const banner = await screen.findByRole('alert');
    expect(banner).toBeInTheDocument();
    expect(screen.getByText(/109/)).toBeInTheDocument();
    expect(screen.getByText(/1577-0199/)).toBeInTheDocument();
  });

  it('B 배너가 DOM상 정책/스텝보다 먼저 (compareDocumentPosition 엄격)', async () => {
    render(
      <FunnelContainer
        graph={mentalHealthGraph}
        profile={PROFILE}
        deps={baseDeps()}
        traverseFn={crisisTraverse()}
      />,
    );
    const banner = await screen.findByRole('alert');
    const main = banner.closest('main') ?? document.body;
    // 배너 다음 형제(스텝/안내 영역). 위기 시에도 항상 최상단 보장.
    const others = Array.from(main.querySelectorAll('[data-funnel-region]')).filter(
      (el) => el !== banner && !banner.contains(el),
    );
    for (const el of others) {
      const pos = banner.compareDocumentPosition(el);
      // 배너가 el보다 먼저면 DOCUMENT_POSITION_FOLLOWING 비트가 켜진다.
      expect(pos & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it('B2 회귀: crisis=true가 result/alternatives와 공존해도 main엔 safety region만(early-return 무결성)', async () => {
    render(
      <FunnelContainer
        graph={mentalHealthGraph}
        profile={PROFILE}
        deps={baseDeps()}
        traverseFn={crisisWithEverythingTraverse()}
      />,
    );
    const banner = await screen.findByRole('alert');
    const main = banner.closest('main')!;
    // 렌더된 region이 정확히 safety 하나뿐(배너+다른 region 공존 회귀 차단).
    const regions = Array.from(main.querySelectorAll('[data-funnel-region]')).map((el) =>
      el.getAttribute('data-funnel-region'),
    );
    expect(regions).toEqual(['safety']);
    // 정책 카드·갈래 칩·헤더 미렌더.
    expect(screen.queryByTestId('policy-result-card')).toBeNull();
    expect(screen.queryByTestId('choice-chips')).toBeNull();
    expect(screen.queryByTestId('alternatives')).toBeNull();
    expect(screen.queryByText('누수 정책')).toBeNull();
    expect(main.querySelector('[data-funnel-region="header"]')).toBeNull();
    // T-E5: 신규 UI(프로필 알약·체크리스트·동행 블록) 전부 미렌더(위기 단독 렌더).
    expect(screen.queryByTestId('profile-pill')).toBeNull();
    expect(screen.queryByTestId('policy-checklist')).toBeNull();
    expect(screen.queryByTestId('youth-center-link')).toBeNull();
    // T-F5: 신청 준비 펼침(F-⑤) 우회 렌더 금지 — 위기 시 결과 카드 자체가 없으므로 토글·로드맵도 미렌더.
    expect(screen.queryByRole('button', { name: /신청 준비 같이 보기/ })).toBeNull();
    expect(screen.queryByTestId('apply-roadmap')).toBeNull();
    expect(main.querySelector('[data-funnel-region="profile-input"]')).toBeNull();
    expect(main.querySelector('[data-funnel-region="youth-center"]')).toBeNull();
  });

  it('B3 회귀(safety Med-1): 저장 항목이 있어도 위기 시 내 신청함 미렌더', async () => {
    // 저장함 seed(재방문 상태) — 위기 진입 시에도 SafetyBanner 단독이어야.
    localStorage.setItem(
      SAVED_STORAGE_KEY,
      JSON.stringify([{ id: 'V1', title: '저장된 정책', sourceUrl: 'https://x', savedAt: '2026-07-05T00:00:00Z' }]),
    );
    render(
      <FunnelContainer
        graph={mentalHealthGraph}
        profile={PROFILE}
        deps={baseDeps()}
        traverseFn={crisisTraverse()}
      />,
    );
    await screen.findByRole('alert');
    // 내 신청함 섹션·저장 항목 미렌더(위기 격리).
    expect(screen.queryByTestId('saved-policies')).toBeNull();
    expect(screen.queryByText('저장된 정책')).toBeNull();
  });

  it('C 위기 시 result=null → 정책 카드 0', async () => {
    render(
      <FunnelContainer
        graph={mentalHealthGraph}
        profile={PROFILE}
        deps={baseDeps()}
        traverseFn={crisisTraverse()}
      />,
    );
    await screen.findByRole('alert');
    expect(screen.queryByTestId('policy-result-card')).toBeNull();
  });

  it('C2 위기 시 갈래 칩 억제 (리더 결정 4)', async () => {
    render(
      <FunnelContainer
        graph={mentalHealthGraph}
        profile={PROFILE}
        deps={baseDeps()}
        traverseFn={crisisTraverse()}
      />,
    );
    await screen.findByRole('alert');
    expect(screen.queryByTestId('choice-chips')).toBeNull();
  });

  it('D crisis=false → 배너 미렌더', async () => {
    render(
      <FunnelContainer
        graph={mentalHealthGraph}
        profile={PROFILE}
        deps={baseDeps()}
        traverseFn={calmTraverse()}
      />,
    );
    // 갈래 칩이 떠야(비위기). 배너 없음.
    await screen.findByTestId('choice-chips');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('E resources=[] → throw 없이 배너 렌더', async () => {
    render(
      <FunnelContainer
        graph={mentalHealthGraph}
        profile={PROFILE}
        deps={baseDeps()}
        traverseFn={crisisTraverse([])}
      />,
    );
    const banner = await screen.findByRole('alert');
    expect(banner).toBeInTheDocument();
  });

  it('F 위기 전송 → 전체 화면 → 복귀 링크 → 홈(막다른 길 방지, 안전 §7.1b)', async () => {
    render(
      <FunnelContainer
        graph={mentalHealthGraph}
        profile={PROFILE}
        deps={baseDeps()}
        traverseFn={calmTraverse()}
      />,
    );
    // 홈 자유입력에 위기 문구 → 실시간 layer-1 → 인라인 배너(작성 중 단계, 입력 유지)
    const box = await screen.findByLabelText('지금 내 상황');
    fireEvent.change(box, { target: { value: '죽고 싶다' } });
    await screen.findByRole('alert');
    expect(screen.getByLabelText('지금 내 상황')).toHaveValue('죽고 싶다');
    // 전송(Enter) → 전체 위기 화면(§7.1b): 복귀 링크 존재, 입력 미노출.
    fireEvent.keyDown(box, { key: 'Enter' });
    const back = await screen.findByRole('button', { name: /정책 검색으로 돌아갈게요/ });
    expect(back.getAttribute('data-funnel-region')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    // 클릭 → 배너 사라지고 홈(예시 칩) 복귀
    fireEvent.click(back);
    expect(screen.queryByRole('alert')).toBeNull();
    await screen.findByTestId('choice-chips');
  });

  // ── 작성 중 위기 2단계(승인안 ①, DESIGN §7.1a) — 타이핑 중엔 말 끊지 않기 ──

  it('T-IC1 타이핑 위기 → 감지 즉시 인라인 배너 + 쓰던 글 그대로(언마운트 0)', async () => {
    render(
      <FunnelContainer
        graph={mentalHealthGraph}
        profile={PROFILE}
        deps={baseDeps()}
        traverseFn={calmTraverse()}
      />,
    );
    const box = await screen.findByLabelText('지금 내 상황');
    fireEvent.change(box, { target: { value: '다 놓아버리고 싶어요' } });
    // 같은 렌더 사이클에 배너(지연 0) — findBy 없이 동기 조회로 잠근다.
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByLabelText('지금 내 상황')).toHaveValue('다 놓아버리고 싶어요');
  });

  it('T-IC2 타이핑 위기 중 정책 표면 전부 미렌더(위기·정책 병렬 금지)', async () => {
    render(
      <FunnelContainer
        graph={mentalHealthGraph}
        profile={PROFILE}
        deps={baseDeps()}
        traverseFn={calmTraverse()}
      />,
    );
    const box = await screen.findByLabelText('지금 내 상황');
    fireEvent.change(box, { target: { value: '죽고 싶다' } });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    // 인라인 배너 region 존재 + 정책 표면 0.
    const main = screen.getByRole('alert').closest('main')!;
    expect(main.querySelector('[data-funnel-region="safety-inline"]')).not.toBeNull();
    expect(screen.queryByTestId('profile-pill')).toBeNull();
    expect(screen.queryByTestId('choice-chips')).toBeNull();
    expect(screen.queryByTestId('policy-result-card')).toBeNull();
    expect(screen.queryByTestId('saved-policies')).toBeNull();
    expect(screen.queryByTestId('youth-center-link')).toBeNull();
    expect(screen.queryByTestId('crisis-footer')).toBeNull();
    expect(main.querySelector('[data-funnel-region="results"]')).toBeNull();
    expect(main.querySelector('[data-funnel-region="examples"]')).toBeNull();
    // 인라인 배너의 실제 상담 연락처 렌더 잠금(검수 Low-2/L3): 빈 alert만 남는 회귀 차단.
    expect(screen.getByRole('link', { name: /109/ })).toHaveAttribute('href', 'tel:109');
    expect(screen.getByRole('link', { name: /1577-0199/ })).toHaveAttribute('href', 'tel:1577-0199');
  });

  it('T-IC3 위기 문구 삭제 → 인라인 배너 해제 + 예시 칩 복귀(자동)', async () => {
    render(
      <FunnelContainer
        graph={mentalHealthGraph}
        profile={PROFILE}
        deps={baseDeps()}
        traverseFn={calmTraverse()}
      />,
    );
    const box = await screen.findByLabelText('지금 내 상황');
    fireEvent.change(box, { target: { value: '죽고 싶다' } });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    fireEvent.change(box, { target: { value: '요즘 조금 지쳐요' } });
    expect(screen.queryByRole('alert')).toBeNull();
    await screen.findByTestId('choice-chips');
  });

  it('T-IC5 타이핑 위기 중 브랜드 클릭 → 입력도 함께 초기화(위기 문구 배너 없이 잔존 금지 — Med-1)', async () => {
    render(
      <FunnelContainer
        graph={mentalHealthGraph}
        profile={PROFILE}
        deps={baseDeps()}
        traverseFn={calmTraverse()}
      />,
    );
    const box = await screen.findByLabelText('지금 내 상황');
    fireEvent.change(box, { target: { value: '죽고 싶다' } });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    // 홈 복귀(브랜드 클릭) → 배너 해제 + 입력 리마운트로 빈 값(위기 문구 잔존 창 제거).
    fireEvent.click(screen.getByRole('button', { name: /개인 맞춤 청년정책 검색/ }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByLabelText('지금 내 상황')).toHaveValue('');
    await screen.findByTestId('choice-chips');
  });

  it('T-IC4 위기 상태 Enter → 검색 진입 0(traverse 추가 호출 없음) + 전체 위기 화면', async () => {
    const tf = calmTraverse();
    render(
      <FunnelContainer
        graph={mentalHealthGraph}
        profile={PROFILE}
        deps={baseDeps()}
        traverseFn={tf}
      />,
    );
    const box = await screen.findByLabelText('지금 내 상황');
    fireEvent.change(box, { target: { value: '죽고 싶다' } });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    const baseline = tf.mock.calls.length;
    fireEvent.keyDown(box, { key: 'Enter' });
    // 전체 위기 화면(복귀 링크) + 질의 미설정 → traverse 재호출 0(검색·생성 억제 불변).
    await screen.findByRole('button', { name: /정책 검색으로 돌아갈게요/ });
    expect(tf.mock.calls.length).toBe(baseline);
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});
