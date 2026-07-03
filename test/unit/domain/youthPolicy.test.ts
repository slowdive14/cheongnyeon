import { describe, it, expect } from 'vitest';
import { youthPolicyGraph } from '@/domain/graph/domains/youthPolicy';

/**
 * 멀티도메인 entry(스코프 확장 P1) — 자유입력이 전 영역 검색하도록 entry에 하드필터 없음.
 */
describe('youthPolicyGraph — 멀티도메인 entry', () => {
  it('entry는 전 영역 검색(allowedCategories 미지정 → 하드필터 없음)', () => {
    expect(youthPolicyGraph.kind).toBe('entry');
    expect(youthPolicyGraph.allowedCategories).toBeUndefined();
  });

  it('예시 칩(비-safety children) ≥4, 라벨에 영역 키워드 포함(마음건강·일자리·주거)', () => {
    const examples = (youthPolicyGraph.children ?? []).filter((c) => c.kind !== 'safety');
    expect(examples.length).toBeGreaterThanOrEqual(4);
    const labels = examples.map((c) => c.label).join(' ');
    expect(labels).toMatch(/무기력|마음|우울/);
    expect(labels).toMatch(/일자리|취업/);
    expect(labels).toMatch(/월세|주거/);
  });

  it('safety 노드 포함(위기 라우팅 자리)', () => {
    expect((youthPolicyGraph.children ?? []).some((c) => c.kind === 'safety')).toBe(true);
  });

  it('children id 고유', () => {
    const ids = (youthPolicyGraph.children ?? []).map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
