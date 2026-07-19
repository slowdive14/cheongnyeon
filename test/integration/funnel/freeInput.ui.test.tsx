import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FunnelContainer } from '@/ui/funnel/FunnelContainer';
import { FreeTextInput } from '@/ui/funnel/FreeTextInput';
import { mentalHealthGraph } from '@/domain/graph/domains/mentalHealth';
import type { TraverseDeps, TraverseResult } from '@/domain/graph/traverse';
import type { UserProfile } from '@/domain/types';

/**
 * 자유입력 1차 관문 UI 통합.
 *
 * 안전 불변식(엄수, DESIGN §7.1 2단계 — 2026-07-19 승인안 ①):
 *  - 위기어 입력 → 실시간 layer-1(키 무관) 감지 즉시 인라인 배너(작성 중 단계, 입력·글 유지,
 *    정책 콘텐츠 미렌더). 전송 시도 → 전체 위기 화면(SafetyBanner 단독). 검색·생성 억제는 두 단계 공통.
 *  - 전송(버튼/Enter) → 글 원문을 그대로 질의로(onSubmit). 분류 없음(의미검색이 의도 포착).
 *  - 초기 화면 = 자유입력 + 예시 칩(quick-start). 질의 있으면 결과 + M1 푸터.
 */

const NOW = new Date('2026-06-24T12:00:00Z');
const PROFILE: UserProfile = { age: 25, region: '서울', regionCode: '11', income: {} };

function calmDeps(): TraverseDeps {
  return { now: NOW, index: [], policies: [] };
}

/** 비위기 + 빈 결과/대안 칩 반환 traverse(결과 화면 진입용). */
function calmResultTraverse() {
  return vi.fn(
    async (): Promise<TraverseResult> => ({
      crisis: { crisis: false, layer: 'none', resources: [], suppressGeneration: false },
      nextChoices: mentalHealthGraph.children ?? [],
      result: { now: [], soon: [], blocked: [], review: [] },
      alternatives: mentalHealthGraph.children ?? [],
    }),
  );
}

describe('FreeTextInput — UI 단위', () => {
  it('UI-2 위기어 입력 → onCrisis(true) 즉시(layer-1), 전송해도 onSubmit 억제', () => {
    const onCrisis = vi.fn();
    const onSubmit = vi.fn();
    render(<FreeTextInput onCrisis={onCrisis} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '죽고 싶어요' } });
    expect(onCrisis).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByRole('button', { name: '내 정책 찾기' }));
    expect(onSubmit).not.toHaveBeenCalled(); // 위기 → 검색 억제
  });

  it('UI-4 전송 → 글 원문을 질의로(onSubmit) 1회', () => {
    const onSubmit = vi.fn();
    render(<FreeTextInput onCrisis={() => {}} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '요새 너무 지쳐' } });
    fireEvent.click(screen.getByRole('button', { name: '내 정책 찾기' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith('요새 너무 지쳐');
  });

  it('UI-4b 입력 비어있으면 버튼 비활성', () => {
    render(<FreeTextInput onCrisis={() => {}} onSubmit={() => {}} />);
    const btn = screen.getByRole('button', { name: '내 정책 찾기' });
    expect(btn).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '우울해요' } });
    expect(btn).toBeEnabled();
  });

  it('UI-3c Enter → 전송, Shift+Enter → 줄바꿈(전송 안 함)', () => {
    const onSubmit = vi.fn();
    render(<FreeTextInput onCrisis={() => {}} onSubmit={onSubmit} />);
    const box = screen.getByRole('textbox');
    fireEvent.change(box, { target: { value: '우울해요' } });
    fireEvent.keyDown(box, { key: 'Enter', shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledWith('우울해요');
  });

  it('UI-H1 기본(hero) 무변경 — 라벨 노출·Shift+Enter 안내 유지', () => {
    render(<FreeTextInput onCrisis={() => {}} onSubmit={() => {}} />);
    // hero 라벨은 시각 노출(sr-only 아님).
    expect(screen.getByText('지금 내 상황').className).not.toMatch(/sr-only/);
    // hero엔 여러 줄 안내 문구 유지.
    expect(screen.getByText(/Shift\+Enter/)).toBeInTheDocument();
  });
});

describe('FreeTextInput — compact variant (결과 화면 재검색 바)', () => {
  it('UI-C1 compact 한 줄 입력 + 접근 가능한 라벨 + 전송 동작', () => {
    const onSubmit = vi.fn();
    render(<FreeTextInput variant="compact" onCrisis={() => {}} onSubmit={onSubmit} />);
    // 라벨은 sr-only(시각 숨김·접근성 유지) — 이름으로 여전히 찾힌다.
    const box = screen.getByRole('textbox', { name: /상황/ });
    expect(box).toBeInTheDocument();
    expect(screen.getByText('지금 내 상황').className).toMatch(/sr-only/);
    // compact엔 Shift+Enter 안내 문구 생략.
    expect(screen.queryByText(/Shift\+Enter/)).toBeNull();
    fireEvent.change(box, { target: { value: '월세 지원 받고 싶어' } });
    fireEvent.click(screen.getByRole('button', { name: '내 정책 찾기' }));
    expect(onSubmit).toHaveBeenCalledWith('월세 지원 받고 싶어');
  });

  it('UI-C2 compact 위기어 입력 → onCrisis(true)·onSubmit 억제 (위기 라우팅 회귀)', () => {
    const onCrisis = vi.fn();
    const onSubmit = vi.fn();
    render(<FreeTextInput variant="compact" onCrisis={onCrisis} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByRole('textbox', { name: /상황/ }), { target: { value: '죽고 싶어요' } });
    expect(onCrisis).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByRole('button', { name: '내 정책 찾기' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('UI-C3 compact Enter → 전송(회귀)', () => {
    const onSubmit = vi.fn();
    render(<FreeTextInput variant="compact" onCrisis={() => {}} onSubmit={onSubmit} />);
    const box = screen.getByRole('textbox', { name: /상황/ });
    fireEvent.change(box, { target: { value: '자취 월세' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledWith('자취 월세');
  });
});

describe('FunnelContainer + 자유입력 통합', () => {
  it('UI-3 초기 화면 = 자유입력 + 예시 칩(quick-start)', async () => {
    render(<FunnelContainer graph={mentalHealthGraph} profile={PROFILE} deps={calmDeps()} />);
    expect(await screen.findByTestId('choice-chips')).toBeInTheDocument();
    // 프로필 입력(나이 textbox)이 추가돼 textbox가 2개가 되었으므로 자유입력을 이름으로 지정.
    expect(screen.getByRole('textbox', { name: /상황/ })).toBeInTheDocument();
  });

  it('UI-1/UI-8 자유입력 전송 → 결과 화면(자유입력 + M1 푸터 공존)', async () => {
    render(
      <FunnelContainer
        graph={mentalHealthGraph}
        profile={PROFILE}
        deps={calmDeps()}
        traverseFn={calmResultTraverse()}
      />,
    );
    fireEvent.change(await screen.findByRole('textbox', { name: /상황/ }), { target: { value: '요새 너무 지쳐' } });
    fireEvent.click(screen.getByRole('button', { name: '내 정책 찾기' }));
    expect(await screen.findByTestId('crisis-footer')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /상황/ })).toBeInTheDocument();
  });

  it('UI-1b 예시 칩 클릭 → 결과 화면(라벨을 질의로 채워 검색)', async () => {
    render(
      <FunnelContainer
        graph={mentalHealthGraph}
        profile={PROFILE}
        deps={calmDeps()}
        traverseFn={calmResultTraverse()}
      />,
    );
    fireEvent.click(await screen.findByRole('button', { name: '지치고 무기력해요' }));
    expect(await screen.findByTestId('crisis-footer')).toBeInTheDocument();
  });

  it('UI-2 통합: 자유입력 위기어 → 인라인 배너 즉시 + 입력·글 유지, 정책 콘텐츠 억제(§7.1a)', async () => {
    render(
      <FunnelContainer
        graph={mentalHealthGraph}
        profile={PROFILE}
        deps={calmDeps()}
        traverseFn={calmResultTraverse()}
      />,
    );
    const box = await screen.findByRole('textbox', { name: /상황/ });
    fireEvent.change(box, { target: { value: '자해하고 싶어' } });
    // 감지 즉시(같은 렌더) 인라인 배너 — 지연 0.
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    // 정책 콘텐츠 억제: 푸터·예시 칩 미렌더(번호는 인라인 배너가 담당, 중복 금지).
    expect(screen.queryByTestId('crisis-footer')).toBeNull();
    expect(screen.queryByTestId('choice-chips')).toBeNull();
    // ★작성 중 단계: 입력은 유지되고 쓰던 글이 보존된다(말 끊지 않기 — 승인안 ①).
    expect(screen.getByRole('textbox', { name: /상황/ })).toHaveValue('자해하고 싶어');
  });

  it('UI-2b 완곡 위기 "버틸 힘이 없어" → 인라인 배너 + 입력·글 유지 (H-1·§7.1a)', async () => {
    render(
      <FunnelContainer
        graph={mentalHealthGraph}
        profile={PROFILE}
        deps={calmDeps()}
        traverseFn={calmResultTraverse()}
      />,
    );
    fireEvent.change(await screen.findByRole('textbox', { name: /상황/ }), {
      target: { value: '버틸 힘이 없어 정책 추천해줘' },
    });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /상황/ })).toHaveValue('버틸 힘이 없어 정책 추천해줘');
  });

  it('UI-9 설정 버튼·모달 없음(Gemini 키 UI 제거)', async () => {
    render(<FunnelContainer graph={mentalHealthGraph} profile={PROFILE} deps={calmDeps()} />);
    await screen.findByRole('textbox', { name: /상황/ });
    expect(screen.queryByRole('button', { name: /설정/ })).toBeNull();
    expect(screen.queryByTestId('settings-modal')).toBeNull();
  });

  it('UI-10 위기어 입력 후 전송(Enter) → 전체 위기 화면(SafetyBanner 단독, 입력 미노출 — §7.1b)', async () => {
    render(
      <FunnelContainer
        graph={mentalHealthGraph}
        profile={PROFILE}
        deps={calmDeps()}
        traverseFn={calmResultTraverse()}
      />,
    );
    const box = await screen.findByRole('textbox', { name: /상황/ });
    fireEvent.change(box, { target: { value: '죽고 싶어요' } });
    await screen.findByRole('alert'); // 작성 중 인라인 배너(입력 유지)
    expect(screen.getByRole('textbox', { name: /상황/ })).toBeInTheDocument();
    // 전송 시도 → 전체 위기 화면: 입력·설정 일절 미노출(검색 진입 0).
    fireEvent.keyDown(box, { key: 'Enter' });
    await screen.findByRole('alert');
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByTestId('settings-modal')).toBeNull();
  });
});
