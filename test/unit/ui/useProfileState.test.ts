import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useProfileState,
  sanitizeStoredProfile,
  loadStoredProfile,
  saveStoredProfile,
  PROFILE_STORAGE_KEY,
} from '@/ui/funnel/useProfileState';
import type { UserProfile } from '@/domain/types';

/**
 * C-D1(훅 단위 테스트) + C-R2(localStorage 영속) — QA 지적(38_qa D1) 해소.
 * 초기값·patch 병합·income 보존·undefined 명시 병합 + 저장 왕복·오염값 차단.
 */

const INITIAL: UserProfile = {
  age: undefined,
  region: '전국',
  regionCode: undefined,
  income: { medianRatio: 100 },
};

beforeEach(() => {
  localStorage.clear();
});

describe('sanitizeStoredProfile — 오염값 차단', () => {
  it('정상 값만 통과(나이 범위·문자열)', () => {
    expect(sanitizeStoredProfile({ age: 25, region: '서울특별시', regionCode: '11' })).toEqual({
      age: 25,
      region: '서울특별시',
      regionCode: '11',
    });
  });
  it('비정상 나이(음수·과대·NaN·문자)·빈 문자열 거부', () => {
    expect(sanitizeStoredProfile({ age: -3 })).toEqual({});
    expect(sanitizeStoredProfile({ age: 999 })).toEqual({});
    expect(sanitizeStoredProfile({ age: 'twenty' })).toEqual({});
    expect(sanitizeStoredProfile({ regionCode: '   ' })).toEqual({});
  });
  it('객체 아님/배열/null → 빈 객체', () => {
    expect(sanitizeStoredProfile(null)).toEqual({});
    expect(sanitizeStoredProfile([1, 2])).toEqual({});
    expect(sanitizeStoredProfile('x')).toEqual({});
  });
  it('income 등 비영속 필드는 무시(하드코딩 박제 방지)', () => {
    const r = sanitizeStoredProfile({ age: 25, income: { medianRatio: 50 } });
    expect(r).toEqual({ age: 25 });
  });
});

describe('load/saveStoredProfile — 왕복', () => {
  it('저장한 영속 필드만 로드(income 제외)', () => {
    saveStoredProfile({ age: 30, region: '부산광역시', regionCode: '26', income: { medianRatio: 100 } });
    expect(loadStoredProfile()).toEqual({ age: 30, region: '부산광역시', regionCode: '26' });
  });
  it('저장값 없음 → 빈 객체', () => {
    expect(loadStoredProfile()).toEqual({});
  });
  it('깨진 JSON → 빈 객체(throw 없음)', () => {
    localStorage.setItem(PROFILE_STORAGE_KEY, '{not json');
    expect(loadStoredProfile()).toEqual({});
  });
});

describe('useProfileState', () => {
  it('저장값 없으면 initial로 시작', () => {
    const { result } = renderHook(() => useProfileState(INITIAL));
    expect(result.current.profile).toEqual(INITIAL);
  });

  it('patch 병합: regionCode·age 반영, income 보존', () => {
    const { result } = renderHook(() => useProfileState(INITIAL));
    act(() => result.current.onProfileChange({ regionCode: '11', age: 25 }));
    expect(result.current.profile.regionCode).toBe('11');
    expect(result.current.profile.age).toBe(25);
    expect(result.current.profile.income).toEqual({ medianRatio: 100 }); // 보존
  });

  it('undefined 명시 병합: 선택 해제·나이 지움 반영', () => {
    const { result } = renderHook(() => useProfileState(INITIAL));
    act(() => result.current.onProfileChange({ regionCode: '11', age: 25 }));
    act(() => result.current.onProfileChange({ age: undefined }));
    expect(result.current.profile.age).toBeUndefined();
    expect(result.current.profile.regionCode).toBe('11'); // 나머지 유지
  });

  it('C-R2: 변경 시 localStorage 저장 → 재마운트 시 복원', () => {
    const first = renderHook(() => useProfileState(INITIAL));
    act(() => first.result.current.onProfileChange({ regionCode: '26', age: 28 }));
    // 새 마운트(새로고침 시뮬레이션) — 같은 localStorage에서 복원.
    const second = renderHook(() => useProfileState(INITIAL));
    expect(second.result.current.profile.regionCode).toBe('26');
    expect(second.result.current.profile.age).toBe(28);
    expect(second.result.current.profile.income).toEqual({ medianRatio: 100 });
  });

  it('C-R2: 오염된 저장값은 복원하지 않음(재검증)', () => {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify({ age: -1, regionCode: 42 }));
    const { result } = renderHook(() => useProfileState(INITIAL));
    expect(result.current.profile.age).toBeUndefined();
    expect(result.current.profile.regionCode).toBeUndefined();
  });
});
