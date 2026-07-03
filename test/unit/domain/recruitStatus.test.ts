import { describe, it, expect } from 'vitest';
import { recruitStatus } from '@/domain/recruitStatus';
import type { RecruitWindow } from '@/domain/types';

/**
 * 계약: recruitStatus(window, { now, soonWithinDays=7 }): RecruitStatus
 * - 순수·throw-free. Date.now()/new Date() 내부 호출 금지 — clock은 deps.now 주입.
 * - 비교는 날짜(calendar day) 단위.
 * - always→now, unknown→unknown, dated 분류, invalid→unknown.
 */

const NOW = new Date('2026-06-24T12:00:00Z');

function dated(start: string | null, end: string | null): RecruitWindow {
  return { kind: 'dated', start, end };
}

describe('recruitStatus — R1 비날짜 종류', () => {
  it('R1-a always → now', () => {
    expect(recruitStatus({ kind: 'always', start: null, end: null }, { now: NOW })).toBe('now');
  });
  it('R1-b unknown → unknown', () => {
    expect(recruitStatus({ kind: 'unknown', start: null, end: null }, { now: NOW })).toBe('unknown');
  });
});

describe('recruitStatus — R2 마감 임계(soonWithinDays=7)', () => {
  it('R2-a 06-01~07-31 → now (마감 37일)', () => {
    expect(recruitStatus(dated('2026-06-01', '2026-07-31'), { now: NOW })).toBe('now');
  });
  it('R2-b ~07-02 → now (잔여 8일 >7)', () => {
    expect(recruitStatus(dated('2026-06-01', '2026-07-02'), { now: NOW })).toBe('now');
  });
  it('R2-c ~06-30 → soon (잔여 6일)', () => {
    expect(recruitStatus(dated('2026-06-01', '2026-06-30'), { now: NOW })).toBe('soon');
  });
  it('R2-e ~07-01 → soon (잔여 7일 경계 포함)', () => {
    expect(recruitStatus(dated('2026-06-01', '2026-07-01'), { now: NOW })).toBe('soon');
  });
});

describe('recruitStatus — R3 마감 경계', () => {
  it('R3-a ~06-24 → soon (마감==오늘, 잔여 0)', () => {
    expect(recruitStatus(dated('2026-06-01', '2026-06-24'), { now: NOW })).toBe('soon');
  });
  it('R3-b ~06-23 → closed (잔여 -1)', () => {
    expect(recruitStatus(dated('2026-06-01', '2026-06-23'), { now: NOW })).toBe('closed');
  });
});

describe('recruitStatus — R4 시작 미래(soon으로 합침)', () => {
  it('R4-a 07-01~08-31 → soon (시작 미래)', () => {
    expect(recruitStatus(dated('2026-07-01', '2026-08-31'), { now: NOW })).toBe('soon');
  });
  it('R4-b 09-01~09-30 → soon (먼 미래도 soon)', () => {
    expect(recruitStatus(dated('2026-09-01', '2026-09-30'), { now: NOW })).toBe('soon');
  });
});

describe('recruitStatus — R5 한쪽 null', () => {
  it('R5-a null~07-31 → now (end만 유효, 마감 전)', () => {
    expect(recruitStatus(dated(null, '2026-07-31'), { now: NOW })).toBe('now');
  });
  it('R5-b 06-01~null → now (start 과거·end 미상)', () => {
    expect(recruitStatus(dated('2026-06-01', null), { now: NOW })).toBe('now');
  });
});

describe('recruitStatus — RX 이상치 방어(throw-free)', () => {
  it('RX-1 null → unknown', () => {
    expect(recruitStatus(null as unknown as RecruitWindow, { now: NOW })).toBe('unknown');
  });
  it('RX-2 {} → unknown', () => {
    expect(recruitStatus({} as unknown as RecruitWindow, { now: NOW })).toBe('unknown');
  });
  it('RX-3 invalid 날짜 → unknown', () => {
    expect(recruitStatus(dated('2026-13-99', 'not-a-date'), { now: NOW })).toBe('unknown');
  });
  it('RX-4 start>end 역전 → unknown', () => {
    expect(recruitStatus(dated('2026-08-01', '2026-07-01'), { now: NOW })).toBe('unknown');
  });
  it('RX-5 deps.now invalid + 유효 dated → unknown (clock invalid false-accept 가드)', () => {
    expect(recruitStatus(dated('2026-06-01', '2026-06-23'), { now: new Date('invalid') })).toBe('unknown');
  });
});
