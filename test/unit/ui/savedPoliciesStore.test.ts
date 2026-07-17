import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  sanitizeSavedList,
  loadSavedPolicies,
  writeSavedPolicies,
  toggleInList,
  toSavedPolicy,
  useSavedPolicies,
  SAVED_STORAGE_KEY,
  type SavedPolicy,
} from '@/ui/funnel/savedPoliciesStore';
import type { Policy } from '@/domain/types';

/** F-④ 내 신청함 저장소 — 저장/토글/재검증/localStorage 왕복. */

const P: Policy = {
  id: 'V202600005',
  title: '2026 서울 청년수당',
  summary: null,
  ageMin: 19,
  ageMax: 34,
  income: { kind: 'unknown', raw: null },
  regionCodes: ['11'],
  regionText: '서울특별시',
  isNationwide: false,
  recruit: { kind: 'unknown', start: null, end: null },
  category: '복지.문화',
  sourceUrl: 'https://youth.seoul.go.kr/x',
  source: 'seoul-youth',
  documentsText: null,
  raw: null,
};

beforeEach(() => localStorage.clear());

describe('sanitizeSavedList — 재검증', () => {
  it('id·title 있는 항목만, 중복 제거', () => {
    const r = sanitizeSavedList([
      { id: 'a', title: 'A', savedAt: '2026-07-01T00:00:00Z' },
      { id: 'a', title: 'A 중복' },
      { id: '', title: '빈 id' },
      { id: 'b' }, // title 없음
      { id: 'c', title: 'C', sourceUrl: 'https://x', source: 'ontong' },
    ]);
    expect(r.map((x) => x.id)).toEqual(['a', 'c']);
    expect(r[1]!.source).toBe('ontong');
  });
  it('배열 아님 → 빈', () => {
    expect(sanitizeSavedList(null)).toEqual([]);
    expect(sanitizeSavedList({ id: 'a' })).toEqual([]);
  });
});

describe('toggleInList', () => {
  it('없으면 추가(맨 앞), 있으면 제거', () => {
    const e = toSavedPolicy(P, '2026-07-05T00:00:00Z');
    const added = toggleInList([], e);
    expect(added.map((x) => x.id)).toEqual(['V202600005']);
    const removed = toggleInList(added, e);
    expect(removed).toEqual([]);
  });
});

describe('load/write 왕복', () => {
  it('저장 후 로드 정합', () => {
    const list: SavedPolicy[] = [toSavedPolicy(P, '2026-07-05T00:00:00Z')];
    writeSavedPolicies(list);
    expect(loadSavedPolicies()).toEqual(list);
  });
  it('깨진 JSON → 빈(throw 없음)', () => {
    localStorage.setItem(SAVED_STORAGE_KEY, '{bad');
    expect(loadSavedPolicies()).toEqual([]);
  });
});

describe('useSavedPolicies', () => {
  it('toggle 저장·해제 + isSaved + localStorage 영속', () => {
    const { result } = renderHook(() => useSavedPolicies());
    expect(result.current.isSaved('V202600005')).toBe(false);
    act(() => result.current.toggle(P));
    expect(result.current.isSaved('V202600005')).toBe(true);
    expect(result.current.items[0]!.title).toBe('2026 서울 청년수당');
    // 재마운트(새로고침) → 복원
    const re = renderHook(() => useSavedPolicies());
    expect(re.result.current.isSaved('V202600005')).toBe(true);
    // 해제
    act(() => result.current.toggle(P));
    expect(result.current.isSaved('V202600005')).toBe(false);
  });

  it('remove로 제거', () => {
    const { result } = renderHook(() => useSavedPolicies());
    act(() => result.current.toggle(P));
    act(() => result.current.remove('V202600005'));
    expect(result.current.items).toEqual([]);
  });

  it('id 없는 정책 toggle → 무시(throw 없음)', () => {
    const { result } = renderHook(() => useSavedPolicies());
    act(() => result.current.toggle({ ...P, id: '' }));
    expect(result.current.items).toEqual([]);
  });
});
