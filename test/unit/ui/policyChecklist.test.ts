import { describe, it, expect } from 'vitest';
import { buildChecklist } from '@/ui/funnel/policyChecklist';
import type { AxisResult } from '@/domain/eligibility';
import type { Policy, UserProfile } from '@/domain/types';

/**
 * T-D1b — 체크리스트 문구 매핑(순수). 자격 단정 금지, sido명·나이 소스 확정(Q-2).
 */

function policy(over: Partial<Policy> = {}): Policy {
  return {
    id: 'p1',
    title: 't',
    summary: null,
    ageMin: 19,
    ageMax: 34,
    income: { kind: 'none', raw: null },
    regionCodes: [],
    regionText: null,
    isNationwide: true,
    recruit: { kind: 'always', start: null, end: null },
    category: null,
    sourceUrl: null,
    source: 'test',
    ...over,
  };
}

const profile: UserProfile = { age: 25, region: '부산', regionCode: '26', income: {} };

describe('buildChecklist', () => {
  it('pass age축 → 나이 범위 + 내 나이 충족(추정)', () => {
    const items = buildChecklist([{ axis: 'age', verdict: 'pass' }], policy({ ageMin: 19, ageMax: 34 }), profile);
    expect(items).toHaveLength(1);
    expect(items[0]!.mark).toBe('pass');
    expect(items[0]!.text).toMatch(/나이 19~34세 — 내 나이 25세 충족\(추정\)/);
  });

  it('pass region축(비전국 26) → sidoNameByPrefix=부산광역시', () => {
    const items = buildChecklist(
      [{ axis: 'region', verdict: 'pass' }],
      policy({ isNationwide: false, regionCodes: ['26'] }),
      profile,
    );
    expect(items[0]!.text).toMatch(/부산광역시 거주/);
  });

  it('pass region축(전국) → 전국 대상 문구', () => {
    const items = buildChecklist([{ axis: 'region', verdict: 'pass' }], policy({ isNationwide: true }), profile);
    expect(items[0]!.text).toMatch(/전국 대상/);
  });

  it('recruit pass → 항목 제외(상태 배지가 담당)', () => {
    const items = buildChecklist([{ axis: 'recruit', verdict: 'pass' }], policy(), profile);
    expect(items).toHaveLength(0);
  });

  it('review 축 → ? + 원문에서 확인', () => {
    const items = buildChecklist(
      [{ axis: 'income', verdict: 'review', reason: 'INCOME_UNKNOWN' }],
      policy(),
      profile,
    );
    expect(items[0]!.mark).toBe('review');
    expect(items[0]!.text).toMatch(/소득 조건 — 원문에서 확인/);
  });

  it('blocked 축 → 제외(카드 미노출 불변)', () => {
    const items = buildChecklist(
      [{ axis: 'region', verdict: 'blocked', reason: 'REGION_MISMATCH' }],
      policy(),
      profile,
    );
    expect(items).toHaveLength(0);
  });

  it('axes undefined → 빈 배열(throw 0)', () => {
    expect(buildChecklist(undefined, policy(), profile)).toEqual([]);
  });

  it('비배열 axes → 빈 배열(throw 0)', () => {
    expect(buildChecklist('x' as unknown as AxisResult[], policy(), profile)).toEqual([]);
  });

  it('profile 미입력 → 나이 범위만("내 나이" 없이)', () => {
    const items = buildChecklist([{ axis: 'age', verdict: 'pass' }], policy({ ageMin: 19, ageMax: 34 }), undefined);
    expect(items[0]!.text).toMatch(/나이 19~34세 충족\(추정\)/);
    expect(items[0]!.text).not.toMatch(/내 나이/);
  });

  it('자격 단정 문구 부재(pass·review 전부)', () => {
    const axes: AxisResult[] = [
      { axis: 'age', verdict: 'pass' },
      { axis: 'income', verdict: 'review', reason: 'INCOME_UNKNOWN' },
    ];
    for (const it of buildChecklist(axes, policy(), profile)) {
      expect(it.text).not.toMatch(/자격이 (됩|안 됩)/);
    }
  });
});
