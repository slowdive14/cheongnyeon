import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PolicyResultCard } from '@/ui/funnel/PolicyResultCard';
import type { EvaluatedPolicy } from '@/domain/eligibility';
import type { Policy, UserProfile } from '@/domain/types';
import type { CachedPolicy } from '@/data/cache/types';
import type { AxisResult } from '@/domain/eligibility';
import type { LlmClient } from '@/data/parseChunk';

function policy(over: Partial<CachedPolicy> = {}): CachedPolicy {
  return {
    id: 'p1',
    title: '서울 청년 마음건강 지원사업',
    summary: '심리상담 바우처',
    ageMin: 19,
    ageMax: 39,
    income: { kind: 'none', raw: null },
    regionCodes: [],
    regionText: null,
    isNationwide: true,
    recruit: { kind: 'always', start: null, end: null },
    category: '마음건강',
    sourceUrl: 'https://example.com/p1',
    source: 'ontong',
    fetchedAt: '2026-06-24T00:00:00Z',
    updatedAt: '2026-06-20T00:00:00Z',
    contentHash: 'h',
    parsed: null,
    ...over,
  };
}

function item(over: Partial<CachedPolicy> = {}): EvaluatedPolicy {
  return { policy: policy(over) as Policy, reasons: [], recruitStatus: 'now' };
}

describe('PolicyResultCard', () => {
  it('status=now → 지금 배지(확정 문구), title 노출', () => {
    render(<PolicyResultCard item={item()} status="now" />);
    expect(screen.getByText('서울 청년 마음건강 지원사업')).toBeInTheDocument();
    expect(screen.getByText(/지금/)).toBeInTheDocument();
    expect(screen.getByText('지금 바로 신청돼요')).toBeInTheDocument();
  });

  it('status=soon → 곧 배지(확정 문구 "곧 신청이 열려요")', () => {
    render(<PolicyResultCard item={item()} status="soon" />);
    expect(screen.getByText(/곧/)).toBeInTheDocument();
    expect(screen.getByText('곧 신청이 열려요')).toBeInTheDocument();
  });

  it('status=review 다수 → "몇 가지만 확인하면 돼요"(부적격 단정 없음, 원문·고지 유지)', () => {
    const reviewItem: EvaluatedPolicy = {
      policy: policy() as Policy,
      reasons: ['AGE_UNKNOWN', 'RECRUIT_UNKNOWN'],
      recruitStatus: 'unknown',
    };
    render(<PolicyResultCard item={reviewItem} status="review" />);
    expect(screen.getByText('서울 청년 마음건강 지원사업')).toBeInTheDocument();
    expect(screen.getByText(/몇 가지만 확인하면 돼요/)).toBeInTheDocument();
    // 탈락/부적격 단정 금지(보수 판정).
    expect(screen.queryByText(/막힘|부적격|탈락/)).toBeNull();
    expect(screen.queryByText(/자격이 (됩|안 됩)/)).toBeNull();
    // 원문 링크 + '추정' 고지 유지.
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://example.com/p1');
    expect(screen.getByText(/추정/)).toBeInTheDocument();
  });

  it('status=review 단일 사유 → "거의 다 왔어요 — ○○만 확인" (등급화)', () => {
    const nearItem: EvaluatedPolicy = {
      policy: policy() as Policy,
      reasons: ['RECRUIT_UNKNOWN'],
      recruitStatus: 'unknown',
    };
    render(<PolicyResultCard item={nearItem} status="review" />);
    expect(screen.getByText(/거의 다 왔어요/)).toBeInTheDocument();
    expect(screen.getByText(/모집 시기만 확인/)).toBeInTheDocument();
    // 부적격 단정 없음.
    expect(screen.queryByText(/막힘|부적격|탈락/)).toBeNull();
  });

  it("'추정' 고지 포함", () => {
    render(<PolicyResultCard item={item()} status="now" />);
    expect(screen.getByText(/추정/)).toBeInTheDocument();
  });

  it('D-②: explanation(혜택 한 줄) 있으면 표시', () => {
    render(
      <PolicyResultCard
        item={item({ explanation: '월세 일부를 지원하는 정책이에요.', summary: '원문 요약(길고 딱딱함)' })}
        status="now"
      />,
    );
    expect(screen.getByTestId('policy-benefit')).toHaveTextContent('월세 일부를 지원하는 정책이에요.');
    // 혜택 한 줄이 있으면 raw 요약은 대신 노출하지 않음(잡음 방지).
    expect(screen.queryByText('원문 요약(길고 딱딱함)')).toBeNull();
  });

  it('D-②: explanation 없으면 raw 요약으로 폴백', () => {
    render(<PolicyResultCard item={item({ explanation: null, summary: '심리상담 비용을 지원합니다.' })} status="now" />);
    expect(screen.queryByTestId('policy-benefit')).toBeNull();
    expect(screen.getByText('심리상담 비용을 지원합니다.')).toBeInTheDocument();
  });

  it('F-④: onToggleSave 있으면 저장 버튼 렌더, saved=true면 "저장됨"', () => {
    const onToggleSave = vi.fn();
    const { rerender } = render(
      <PolicyResultCard item={item()} status="now" saved={false} onToggleSave={onToggleSave} />,
    );
    const btn = screen.getByRole('button', { name: '내 신청함에 저장' });
    btn.click();
    expect(onToggleSave).toHaveBeenCalledTimes(1);
    rerender(<PolicyResultCard item={item()} status="now" saved={true} onToggleSave={onToggleSave} />);
    expect(screen.getByText('저장됨')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '내 신청함에서 빼기' })).toBeInTheDocument();
  });

  it('F-④: onToggleSave 없으면 저장 버튼 미렌더(기존 소비자 호환)', () => {
    render(<PolicyResultCard item={item()} status="now" />);
    expect(screen.queryByText(/저장/)).toBeNull();
  });

  it('sourceUrl 있으면 원문 링크', () => {
    render(<PolicyResultCard item={item()} status="now" />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', 'https://example.com/p1');
  });

  it('sourceUrl=null → 링크 미생성, throw 없음', () => {
    expect(() =>
      render(<PolicyResultCard item={item({ sourceUrl: null })} status="now" />),
    ).not.toThrow();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('updatedAt 있으면 최종 업데이트 표시', () => {
    render(<PolicyResultCard item={item()} status="now" />);
    expect(screen.getByText(/업데이트/)).toBeInTheDocument();
  });

  it('updatedAt 없으면(폴백) 업데이트 미표시, throw 없음', () => {
    // 신선도 없는 합성 Policy(CachedPolicy 아님).
    const plain: EvaluatedPolicy = {
      policy: policy({ updatedAt: undefined as unknown as string }) as Policy,
      reasons: [],
      recruitStatus: 'now',
    };
    expect(() => render(<PolicyResultCard item={plain} status="now" />)).not.toThrow();
    expect(screen.queryByText(/업데이트/)).toBeNull();
  });

  it('title=null → 폴백(throw 없음)', () => {
    expect(() =>
      render(<PolicyResultCard item={item({ title: null as unknown as string })} status="now" />),
    ).not.toThrow();
  });

  it('updatedAt 깨진 문자열 → 미표시(throw 없음)', () => {
    render(<PolicyResultCard item={item({ updatedAt: 'not-a-date' })} status="now" />);
    expect(screen.queryByText(/업데이트/)).toBeNull();
  });

  it('summary 없음 → throw 없이 렌더', () => {
    expect(() =>
      render(<PolicyResultCard item={item({ summary: null })} status="now" />),
    ).not.toThrow();
  });

  it('막힘/부적격 문구 미포함', () => {
    render(<PolicyResultCard item={item()} status="now" />);
    expect(screen.queryByText(/막힘|부적격|탈락/)).toBeNull();
  });

  it('정책 영역(category) 배지 표시 — 교차 영역 결과 식별', () => {
    render(<PolicyResultCard item={item({ category: '주거' })} status="now" />);
    expect(screen.getByTestId('policy-category')).toHaveTextContent('주거');
  });

  // T-D1c — "왜 맞을까요" prose 표시 제거(Q-3: 표시 제거 + 호출 정지, 정의는 D-② 대비 보존).
  it('T-D1c: llm 없으면 설명 미표시', () => {
    render(<PolicyResultCard item={item()} status="now" />);
    expect(screen.queryByTestId('policy-explanation')).toBeNull();
  });

  it('D-②: stored explanation은 (구)prose(policy-explanation) 아닌 혜택 한 줄(policy-benefit)로 표시', () => {
    const stored: EvaluatedPolicy = {
      policy: policy({ explanation: '미리 만든 설명입니다.' }) as Policy,
      reasons: [],
      recruitStatus: 'now',
    };
    render(<PolicyResultCard item={stored} status="now" />);
    expect(screen.queryByTestId('policy-explanation')).toBeNull(); // 구 "왜 맞을까요" prose 컨테이너 없음
    expect(screen.getByTestId('policy-benefit')).toHaveTextContent('미리 만든 설명입니다.');
  });

  it('T-D1c: llm 있어도 "왜 맞을까요/왜 맞는지" prose 미표시(호출 정지)', () => {
    const llm: LlmClient = {
      generateStructured: vi.fn(async () => ({ text: '마음건강 관련이라 도움이 될 수 있어 보여요.' })),
    };
    render(<PolicyResultCard item={item()} status="now" llm={llm} />);
    expect(screen.queryByTestId('policy-explanation')).toBeNull();
    expect(screen.queryByText(/왜 맞을까요|왜 맞는지/)).toBeNull();
    // 런타임 호출 정지(불필요 비동기·네트워크 0).
    expect(llm.generateStructured).not.toHaveBeenCalled();
  });
});

describe('T-F1 절벽 완화 카피(신청 페이지 열기 + 브리지)', () => {
  it('sourceUrl 있으면 "신청 페이지 열기 (온통청년)" + 브리지 문구', () => {
    render(<PolicyResultCard item={item()} status="now" />);
    expect(screen.getByText('신청 페이지 열기 (온통청년)')).toBeInTheDocument();
    expect(screen.getByText(/‘신청하기’ 버튼을 찾으면 돼요/)).toBeInTheDocument();
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer noopener');
  });

  it('H-1: source=seoul-youth → "(청년몽땅)" 라벨(거짓 출처 표기 금지)', () => {
    render(
      <PolicyResultCard
        item={item({ source: 'seoul-youth', sourceUrl: 'https://youth.seoul.go.kr/p' })}
        status="now"
      />,
    );
    expect(screen.getByText('신청 페이지 열기 (청년몽땅)')).toBeInTheDocument();
    expect(screen.queryByText(/온통청년/)).toBeNull();
  });

  it('H-1: source 불명 → 괄호 출처 생략(틀린 출처 안 만듦)', () => {
    render(<PolicyResultCard item={item({ source: 'unknown' })} status="now" />);
    expect(screen.getByText('신청 페이지 열기')).toBeInTheDocument();
    expect(screen.queryByText(/\(온통청년\)|\(청년몽땅\)/)).toBeNull();
  });

  it('sourceUrl null → 링크·브리지 미렌더(오도 방지), throw 0', () => {
    expect(() =>
      render(<PolicyResultCard item={item({ sourceUrl: null })} status="now" />),
    ).not.toThrow();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByText(/‘신청하기’ 버튼을 찾으면 돼요/)).toBeNull();
  });

  it('하단 메타 줄 → flex-wrap(좁은 폭 줄바꿈, 저장 글자 세로 꺾임 방지, DESIGN §3.2)', () => {
    render(<PolicyResultCard item={item()} status="now" saved={false} onToggleSave={vi.fn()} />);
    const actions = screen.getByTestId('policy-card-actions');
    expect(actions.className).toMatch(/flex-wrap/);
  });
});

describe('F-⑤ 신청 준비 펼침(동행)', () => {
  function toggle() {
    return screen.getByRole('button', { name: /신청 준비 같이 보기/ });
  }

  it('기본 접힘 — 3단계·오늘은 이것만 미표시, 토글 aria-expanded=false', () => {
    render(<PolicyResultCard item={item()} status="now" />);
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('apply-roadmap')).toBeNull();
    expect(screen.queryByTestId('today-only')).toBeNull();
    expect(screen.queryByTestId('doc-dictionary')).toBeNull();
  });

  it('토글 클릭 → 펼침(aria-expanded=true) + 신청 3단계 렌더', () => {
    render(<PolicyResultCard item={item()} status="now" />);
    fireEvent.click(toggle());
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    const roadmap = screen.getByTestId('apply-roadmap');
    expect(roadmap).toHaveTextContent('서류 준비');
    expect(roadmap).toHaveTextContent('신청 방법 확인');
    expect(roadmap).toHaveTextContent('결과 기다리기');
  });

  it('"오늘은 이것만" 박스 — 확정 서류 데이터만(등본·정부24·5분)', () => {
    render(<PolicyResultCard item={item()} status="now" />);
    fireEvent.click(toggle());
    const box = screen.getByTestId('today-only');
    expect(box).toHaveTextContent('오늘은 이것만');
    expect(box).toHaveTextContent('주민등록등본');
    expect(box).toHaveTextContent('정부24');
    expect(box).toHaveTextContent(/5분/);
    // 정책별 필요 서류 단정 금지 → 원문 확인 프레임 유지.
    expect(box).toHaveTextContent(/원문에서 확인/);
  });

  it('자주 쓰는 서류 — null 필드(재직증명서)는 "확인 필요"(수수료·소요 날조 금지)', () => {
    render(<PolicyResultCard item={item()} status="now" />);
    fireEvent.click(toggle());
    const docs = screen.getByTestId('doc-dictionary');
    expect(docs).toHaveTextContent('재직증명서');
    expect(docs).toHaveTextContent(/확인 필요/);
    // 확정 서류는 발급처·무료 노출.
    expect(docs).toHaveTextContent('소득금액증명');
  });

  it('자격 단정 문구 부재(펼침 후에도)', () => {
    render(<PolicyResultCard item={item()} status="now" />);
    fireEvent.click(toggle());
    expect(screen.queryByText(/자격이 됩니다|신청하면 됩니다|자격이 (됩|안 됩)/)).toBeNull();
    // 금지어(간단히/쉽게) 부재.
    expect(screen.queryByText(/간단히|쉽게/)).toBeNull();
  });

  it('펼침 토글 터치 타깃 44px 이상', () => {
    render(<PolicyResultCard item={item()} status="now" />);
    expect(toggle().className).toMatch(/min-h-\[44px\]/);
  });

  it('펼침 섹션이 신청 CTA·추정 고지보다 위에 배치(중복 배치 없음, DESIGN §4)', () => {
    render(<PolicyResultCard item={item()} status="now" />);
    fireEvent.click(toggle());
    const roadmap = screen.getByTestId('apply-roadmap');
    const actions = screen.getByTestId('policy-card-actions');
    const pos = roadmap.compareDocumentPosition(actions);
    // roadmap이 actions보다 먼저면 FOLLOWING 비트가 켜진다.
    expect(pos & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // 원문 링크·추정 고지는 현행 1회 유지(펼침이 중복 생성하지 않음).
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getAllByText(/추정/)).toHaveLength(1);
  });
});

describe('T-D1b 나와 맞는 점 체크리스트', () => {
  const PROFILE: UserProfile = { age: 25, region: '부산', regionCode: '26', income: {} };

  function axesItem(axes: AxisResult[], over: Partial<CachedPolicy> = {}): EvaluatedPolicy {
    return { policy: policy(over) as Policy, reasons: [], recruitStatus: 'now', axes };
  }

  it('pass age축 → ✓ + "나이 …충족" 문구(자격 단정 아님)', () => {
    const it0 = axesItem([{ axis: 'age', verdict: 'pass' }], { ageMin: 19, ageMax: 34 });
    render(<PolicyResultCard item={it0} status="now" profile={PROFILE} />);
    expect(screen.getByText(/나이 19~34세 — 내 나이 25세 충족/)).toBeInTheDocument();
    // 항목별 "(추정)" 표기 없음(추정은 DisclaimerNote 단일 고지).
    expect(screen.getByTestId('policy-checklist').textContent).not.toMatch(/추정/);
    // 자격 단정 금지.
    expect(screen.queryByText(/자격이 (됩|안 됩)/)).toBeNull();
  });

  it('pass region축 → sidoNameByPrefix(26)=부산광역시 문구', () => {
    const it0 = axesItem([{ axis: 'region', verdict: 'pass' }], {
      isNationwide: false,
      regionCodes: ['26'],
      regionText: '부산 자유서식',
    });
    render(<PolicyResultCard item={it0} status="now" profile={PROFILE} />);
    expect(screen.getByText(/부산광역시 거주/)).toBeInTheDocument();
  });

  it('review 축 → ? 마크 + "원문에서 확인", 자격 단정 부재', () => {
    const it0: EvaluatedPolicy = {
      policy: policy() as Policy,
      reasons: ['INCOME_UNKNOWN'],
      recruitStatus: 'now',
      axes: [{ axis: 'income', verdict: 'review', reason: 'INCOME_UNKNOWN' }],
    };
    render(<PolicyResultCard item={it0} status="review" profile={PROFILE} />);
    expect(screen.getByText(/소득 조건 — 원문에서 확인/)).toBeInTheDocument();
    expect(screen.queryByText(/자격이 (됩|안 됩)/)).toBeNull();
  });

  it('blocked 축이 섞여 와도 blocked 라인 미렌더(pass/review만)', () => {
    const it0: EvaluatedPolicy = {
      policy: policy() as Policy,
      reasons: [],
      recruitStatus: 'now',
      axes: [
        { axis: 'age', verdict: 'pass' },
        { axis: 'region', verdict: 'blocked', reason: 'REGION_MISMATCH' },
      ],
    };
    render(<PolicyResultCard item={it0} status="now" profile={PROFILE} />);
    expect(screen.queryByText(/막힘|부적격|탈락|거주.*불일치/)).toBeNull();
  });

  it('axes undefined(구 데이터) → 체크리스트 미렌더, throw 0', () => {
    expect(() => render(<PolicyResultCard item={item()} status="now" profile={PROFILE} />)).not.toThrow();
    expect(screen.queryByTestId('policy-checklist')).toBeNull();
  });

  it('profile 미입력 → 나이 문구는 "내 나이" 없이(throw 0)', () => {
    const it0 = axesItem([{ axis: 'age', verdict: 'pass' }], { ageMin: 19, ageMax: 34 });
    expect(() => render(<PolicyResultCard item={it0} status="now" />)).not.toThrow();
    expect(screen.getByText('나이 19~34세 충족')).toBeInTheDocument();
  });

  it('체크리스트 추가해도 고지·링크 유지', () => {
    const it0 = axesItem([{ axis: 'age', verdict: 'pass' }], { ageMin: 19, ageMax: 34 });
    render(<PolicyResultCard item={it0} status="now" profile={PROFILE} />);
    expect(screen.getAllByText(/추정/).length).toBeGreaterThan(0);
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://example.com/p1');
  });
});
