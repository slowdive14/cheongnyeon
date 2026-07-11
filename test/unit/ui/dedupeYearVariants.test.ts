import { describe, it, expect } from 'vitest';
import { dedupeYearVariants } from '@/ui/funnel/dedupeYearVariants';
import type { EvaluatedPolicy } from '@/domain/eligibility';
import type { Policy } from '@/domain/types';
import type { CachedPolicy } from '@/data/cache/types';

/**
 * 결과 후처리 — 정책의 연도 변형이 나란히 뜨는 혼란을 클라에서 억제.
 * 그룹당 최신·유효판 1개만 남기고 나머지는 숨긴다(전멸 금지, 지역 토큰은 분리).
 */
function ev(
  over: Partial<CachedPolicy> & { id: string; title: string },
): EvaluatedPolicy {
  const policy = {
    summary: null,
    ageMin: 19,
    ageMax: 39,
    income: { kind: 'none', raw: null },
    regionCodes: [],
    regionText: null,
    isNationwide: true,
    recruit: { kind: 'always', start: null, end: null },
    category: '일자리',
    sourceUrl: 'https://example.com/' + over.id,
    source: 'ontong',
    ...over,
  } as Policy;
  return { policy, reasons: [], recruitStatus: 'now' };
}

describe('dedupeYearVariants — 연도 변형 대표 1개만', () => {
  it('올해판(now) + 작년판(review) → now판만 남고 작년판 숨김', () => {
    const now2026 = ev({ id: 'a', title: '2026년 X 지원사업' });
    const review2025 = ev({ id: 'b', title: '2025년 X 지원사업' });
    const out = dedupeYearVariants({ now: [now2026], soon: [], review: [review2025] });
    expect(out.now).toHaveLength(1);
    expect(out.now[0]!.policy.id).toBe('a');
    // 작년판(review)은 같은 그룹이므로 숨김.
    expect(out.review).toHaveLength(0);
  });

  it('둘 다 review(불명) → 연도 큰 것만 남는다', () => {
    const y2025 = ev({ id: 'old', title: '2025년 X 지원사업' });
    const y2026 = ev({ id: 'new', title: '2026년 X 지원사업' });
    const out = dedupeYearVariants({ now: [], soon: [], review: [y2025, y2026] });
    expect(out.review).toHaveLength(1);
    expect(out.review[0]!.policy.id).toBe('new');
  });

  it('(성북구) vs (중랑구) → 지역 토큰이 키에 남아 둘 다 유지', () => {
    const seongbuk = ev({ id: 's', title: '2026년 미취업청년 자격증 응시료 지원사업(성북구)' });
    const jungnang = ev({ id: 'j', title: '2026년 미취업청년 자격증 응시료 지원사업(중랑구)' });
    const out = dedupeYearVariants({ now: [seongbuk, jungnang], soon: [], review: [] });
    expect(out.now).toHaveLength(2);
    const ids = out.now.map((i) => i.policy.id).sort();
    expect(ids).toEqual(['j', 's']);
  });

  it('연도 없는 단독 정책 → 무영향', () => {
    const solo = ev({ id: 'solo', title: '청년 마음건강 지원사업' });
    const out = dedupeYearVariants({ now: [solo], soon: [], review: [] });
    expect(out.now).toHaveLength(1);
    expect(out.now[0]!.policy.id).toBe('solo');
  });

  it('빈 결과 → 무영향(throw 없음)', () => {
    const out = dedupeYearVariants({ now: [], soon: [], review: [] });
    expect(out.now).toHaveLength(0);
    expect(out.soon).toHaveLength(0);
    expect(out.review).toHaveLength(0);
  });

  it('버킷 횡단: soon 올해판 + review 작년판 → soon만(상태 우선순위 now>soon>review)', () => {
    const soon2026 = ev({ id: 'soon', title: '2026년 Y 지원사업' });
    const review2025 = ev({ id: 'rev', title: '2025년 Y 지원사업' });
    const out = dedupeYearVariants({ now: [], soon: [soon2026], review: [review2025] });
    expect(out.soon).toHaveLength(1);
    expect(out.soon[0]!.policy.id).toBe('soon');
    expect(out.review).toHaveLength(0);
  });

  it('상태 동률(둘 다 now) → updatedAt 최신이 대표', () => {
    const older = ev({ id: 'o', title: 'Z 지원사업', updatedAt: '2026-01-01T00:00:00Z' });
    const newer = ev({ id: 'n', title: 'Z 지원사업', updatedAt: '2026-06-01T00:00:00Z' });
    const out = dedupeYearVariants({ now: [older, newer], soon: [], review: [] });
    expect(out.now).toHaveLength(1);
    expect(out.now[0]!.policy.id).toBe('n');
  });

  it('전멸 금지: 그룹에 항상 대표 1개는 남는다', () => {
    const a = ev({ id: 'a', title: '2024년 W 지원사업' });
    const b = ev({ id: 'b', title: '2025년 W 지원사업' });
    const c = ev({ id: 'c', title: '2026년 W 지원사업' });
    const out = dedupeYearVariants({ now: [], soon: [], review: [a, b, c] });
    const total = out.now.length + out.soon.length + out.review.length;
    expect(total).toBe(1);
    expect(out.review[0]!.policy.id).toBe('c');
  });

  it('결정적: 완전 동률(연도·updatedAt 없음)이면 id 안정 tie-break', () => {
    const x = ev({ id: 'x', title: 'V 지원사업' });
    const y = ev({ id: 'y', title: 'V 지원사업' });
    const out1 = dedupeYearVariants({ now: [x, y], soon: [], review: [] });
    const out2 = dedupeYearVariants({ now: [y, x], soon: [], review: [] });
    expect(out1.now).toHaveLength(1);
    expect(out2.now).toHaveLength(1);
    // 입력 순서와 무관하게 같은 대표.
    expect(out1.now[0]!.policy.id).toBe(out2.now[0]!.policy.id);
  });

  it('제목 완전 동일(연도 없음)이라도 출처·지역이 달라 지역 토큰 남으면 분리', () => {
    const seongbuk = ev({ id: 's', title: '자격증 응시료 지원사업 (성북구)' });
    const jungnang = ev({ id: 'j', title: '자격증 응시료 지원사업 (중랑구)' });
    const out = dedupeYearVariants({ now: [seongbuk, jungnang], soon: [], review: [] });
    expect(out.now).toHaveLength(2);
  });
});
