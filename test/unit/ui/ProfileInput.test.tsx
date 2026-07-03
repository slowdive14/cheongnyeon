import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProfileInput } from '@/ui/funnel/ProfileInput';

/**
 * ProfileInput(T-E2 리디자인) — 요약 알약 1개 + 탭 시 시·도/나이 펼침.
 *
 * DESIGN §4: 서식 2칸 상시 노출 금지 → 알약 접힘이 기본. 탭(클릭/Enter/Space)으로 펼침.
 * 안전(S5): 나이 음수/비정수/비수치 → onChange({ age: undefined }). 접근성: label↔control 연결.
 * onChange 계약 무변경(부산 26 → {regionCode:'26'}, 빈칸 → {age:undefined}).
 */

/** 알약을 눌러 펼친다(공통 헬퍼). */
function expand() {
  fireEvent.click(screen.getByTestId('profile-pill'));
}

describe('ProfileInput — 알약 요약(접힘 기본)', () => {
  it('data-funnel-region="profile-input" 부여(기존 관용구)', () => {
    const { container } = render(<ProfileInput onChange={() => {}} />);
    expect(container.querySelector('[data-funnel-region="profile-input"]')).not.toBeNull();
  });

  it('초기 접힘 → 요약 알약 노출, select/input 미노출', () => {
    render(<ProfileInput regionCode="26" age={25} onChange={() => {}} />);
    const pill = screen.getByTestId('profile-pill');
    // 부산 · 25세 요약.
    expect(pill).toHaveTextContent(/부산/);
    expect(pill).toHaveTextContent(/25세/);
    expect(screen.queryByLabelText('거주 지역 (시·도)')).toBeNull();
    expect(screen.queryByLabelText('나이')).toBeNull();
  });

  it('미입력 → 초대 문구 요약(지역·나이 입력)', () => {
    render(<ProfileInput onChange={() => {}} />);
    expect(screen.getByTestId('profile-pill')).toHaveTextContent(/지역.*나이 입력/);
  });

  it('regionCode만 있고 age 없음 → "부산 · 나이 입력" 부분 요약', () => {
    render(<ProfileInput regionCode="26" onChange={() => {}} />);
    const pill = screen.getByTestId('profile-pill');
    expect(pill).toHaveTextContent(/부산/);
    expect(pill).toHaveTextContent(/나이 입력/);
  });

  it('알 수 없는 regionCode → 지역명 폴백(throw 0)', () => {
    expect(() => render(<ProfileInput regionCode="99" age={25} onChange={() => {}} />)).not.toThrow();
  });
});

describe('ProfileInput — 펼침 동작', () => {
  it('알약 탭 → select/input 접근 가능', () => {
    render(<ProfileInput onChange={() => {}} />);
    expand();
    expect(screen.getByLabelText('거주 지역 (시·도)')).toBeInTheDocument();
    expect(screen.getByLabelText('나이')).toBeInTheDocument();
  });

  // 키보드 Enter/Space 활성화는 <button> 네이티브 시맨틱(keydown→click)에 위임(리뷰 H-1).
  //  커스텀 onKeyDown 토글은 실브라우저에서 "keydown 토글 + 네이티브 click 토글"이 상쇄돼
  //  알약이 안 열린다 — jsdom은 네이티브 click을 이어붙이지 않아 keyDown 단독 단언은 오탐.
  //  계약은 "활성화(click) → 토글" 단일 경로로 검증하고, 이중 토글 재발을 회귀로 잠근다.
  it('활성화(click) 1회 → 펼침, 재활성화 → 접힘(토글 계약)', () => {
    render(<ProfileInput onChange={() => {}} />);
    const pill = screen.getByTestId('profile-pill');
    fireEvent.click(pill);
    expect(screen.getByLabelText('거주 지역 (시·도)')).toBeInTheDocument();
    fireEvent.click(pill);
    expect(screen.queryByLabelText('거주 지역 (시·도)')).toBeNull();
  });

  it('keydown 자체 토글 없음 — 네이티브 click과 이중 토글 방지(H-1 회귀)', () => {
    render(<ProfileInput onChange={() => {}} />);
    const pill = screen.getByTestId('profile-pill');
    // 실브라우저 Enter = keydown + 네이티브 click. keydown 단독은 토글 0이어야
    // 둘의 합이 정확히 1회 토글이 된다(토글은 click에서만).
    fireEvent.keyDown(pill, { key: 'Enter' });
    fireEvent.keyDown(pill, { key: ' ' });
    expect(screen.queryByLabelText('거주 지역 (시·도)')).toBeNull();
    fireEvent.click(pill);
    expect(screen.getByLabelText('거주 지역 (시·도)')).toBeInTheDocument();
  });

  it('시·도 옵션 18개(선택 안 함 + 17) — 펼친 후', () => {
    render(<ProfileInput onChange={() => {}} />);
    expand();
    const select = screen.getByLabelText('거주 지역 (시·도)') as HTMLSelectElement;
    expect(select.options).toHaveLength(18);
    expect(select.options[0]?.textContent).toBe('선택 안 함');
    expect(screen.getByRole('option', { name: '서울특별시' })).toBeInTheDocument();
  });
});

describe('ProfileInput — onChange 계약(펼친 후, 무변경)', () => {
  it("시·도 부산(26) → onChange({ regionCode: '26' })", () => {
    const onChange = vi.fn();
    render(<ProfileInput onChange={onChange} />);
    expand();
    fireEvent.change(screen.getByLabelText('거주 지역 (시·도)'), { target: { value: '26' } });
    expect(onChange).toHaveBeenCalledWith({ regionCode: '26' });
  });

  it("'선택 안 함' → onChange({ regionCode: undefined })", () => {
    const onChange = vi.fn();
    render(<ProfileInput regionCode="11" onChange={onChange} />);
    expand();
    fireEvent.change(screen.getByLabelText('거주 지역 (시·도)'), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith({ regionCode: undefined });
  });

  it("나이 '30' → onChange({ age: 30 })", () => {
    const onChange = vi.fn();
    render(<ProfileInput onChange={onChange} />);
    expand();
    fireEvent.change(screen.getByLabelText('나이'), { target: { value: '30' } });
    expect(onChange).toHaveBeenCalledWith({ age: 30 });
  });

  it("나이 빈칸 → onChange({ age: undefined })", () => {
    const onChange = vi.fn();
    render(<ProfileInput age={25} onChange={onChange} />);
    expand();
    fireEvent.change(screen.getByLabelText('나이'), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith({ age: undefined });
  });

  it("나이 '-5' → onChange({ age: undefined }) (음수 방어 S5)", () => {
    const onChange = vi.fn();
    render(<ProfileInput onChange={onChange} />);
    expand();
    fireEvent.change(screen.getByLabelText('나이'), { target: { value: '-5' } });
    expect(onChange).toHaveBeenCalledWith({ age: undefined });
  });

  it("나이 '12.3' → onChange({ age: undefined }) (비정수 방어)", () => {
    const onChange = vi.fn();
    render(<ProfileInput onChange={onChange} />);
    expand();
    fireEvent.change(screen.getByLabelText('나이'), { target: { value: '12.3' } });
    expect(onChange).toHaveBeenCalledWith({ age: undefined });
  });

  it("나이 'abc' → onChange({ age: undefined }) (비수치 방어)", () => {
    const onChange = vi.fn();
    render(<ProfileInput onChange={onChange} />);
    expand();
    fireEvent.change(screen.getByLabelText('나이'), { target: { value: 'abc' } });
    expect(onChange).toHaveBeenCalledWith({ age: undefined });
  });
});

describe('ProfileInput — 초기값 반영(펼친 후 controlled)', () => {
  it("regionCode='11', age=25 → select value='11', input value='25'", () => {
    render(<ProfileInput regionCode="11" age={25} onChange={() => {}} />);
    expand();
    expect((screen.getByLabelText('거주 지역 (시·도)') as HTMLSelectElement).value).toBe('11');
    expect((screen.getByLabelText('나이') as HTMLInputElement).value).toBe('25');
  });

  it('미입력 → select value 빈 문자열, input value 빈 문자열', () => {
    render(<ProfileInput onChange={() => {}} />);
    expand();
    expect((screen.getByLabelText('거주 지역 (시·도)') as HTMLSelectElement).value).toBe('');
    expect((screen.getByLabelText('나이') as HTMLInputElement).value).toBe('');
  });
});
