import { useCallback, useState } from 'react';
import type { UserProfile } from '@/domain/types';

/**
 * 프로필 상태 훅(T10 경계) — App이 소유하던 profile useState + 병합 콜백을 추출.
 *
 * 목적:
 *  - 안정 참조: profile은 변경 시에만 새 객체(setState). ★T8 성능 불변식과 짝 — App의
 *    search/deps memo 배열에 profile을 넣지 않으므로, 이 훅이 안정 참조를 유지해 원격 검색
 *    남발을 막는다(자격 입력이지 검색 입력이 아님).
 *  - localStorage 영속화(R2): 시·도·나이를 새로고침 후에도 유지. 초기값 로드/저장을 이 훅
 *    경계에서 처리하므로 App 계층 변경 0. 저장 값은 로드 시 재검증(오염 값 유입 차단).
 *
 * 안전:
 *  - patch는 바뀐 필드만 병합 → 미입력(undefined) 필드는 그대로 보존(income medianRatio 등).
 *  - income은 영속 대상이 아님(입력 UI 부재 R1) → 항상 initial.income 사용(하드코딩 값 박제 방지).
 *  - localStorage 접근/파싱 throw 흡수(SSR·차단 환경) → 인메모리로 degrade.
 */
export interface ProfilePatch {
  regionCode?: string;
  age?: number;
}

export interface UseProfileState {
  profile: UserProfile;
  /** 바뀐 필드만 병합. undefined도 명시 병합(선택 해제·나이 지움을 반영). */
  onProfileChange: (patch: ProfilePatch) => void;
}

export const PROFILE_STORAGE_KEY = 'cheongnyeon.profile';

/** 영속 대상(사용자 입력) 필드만. income은 제외(R1 미구현 — 하드코딩 값 저장 금지). */
interface StoredProfile {
  age?: number;
  region?: string;
  regionCode?: string;
}

/** 저장 값 재검증 — 오염·비정상 값은 버린다(보수). 나이 범위·문자열 타입 가드. */
export function sanitizeStoredProfile(raw: unknown): StoredProfile {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const o = raw as Record<string, unknown>;
  const out: StoredProfile = {};
  // 나이: 유한 정수 & 상식 범위(0<age<150)만.
  if (typeof o.age === 'number' && Number.isFinite(o.age) && o.age > 0 && o.age < 150) {
    out.age = Math.floor(o.age);
  }
  if (typeof o.regionCode === 'string' && o.regionCode.trim().length > 0) {
    out.regionCode = o.regionCode.trim();
  }
  if (typeof o.region === 'string' && o.region.trim().length > 0) {
    out.region = o.region.trim();
  }
  return out;
}

/** 저장된 프로필 패치 로드(재검증). 접근/파싱 실패 → {}(인메모리 degrade). */
export function loadStoredProfile(): StoredProfile {
  try {
    const v = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (typeof v !== 'string' || v.length === 0) return {};
    return sanitizeStoredProfile(JSON.parse(v));
  } catch {
    return {};
  }
}

/** 프로필의 영속 필드만 저장. throw 흡수. */
export function saveStoredProfile(p: UserProfile): void {
  try {
    const payload: StoredProfile = { age: p.age, region: p.region, regionCode: p.regionCode };
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // 접근 불가 환경 — 무시(영속 없이 인메모리 동작).
  }
}

/** initial 위에 저장 패치를 얹은 시작 프로필. income은 항상 initial(영속 제외). */
function hydrate(initial: UserProfile): UserProfile {
  const stored = loadStoredProfile();
  return {
    ...initial,
    ...(stored.region !== undefined ? { region: stored.region } : {}),
    age: stored.age, // 저장 없으면 undefined(미입력) — initial.age도 undefined
    regionCode: stored.regionCode,
    income: initial.income,
  };
}

export function useProfileState(initial: UserProfile): UseProfileState {
  // 초기화 1회: localStorage 재검증 로드 → initial 위에 병합.
  const [profile, setProfile] = useState<UserProfile>(() => hydrate(initial));
  const onProfileChange = useCallback((patch: ProfilePatch) => {
    setProfile((p) => {
      const next = { ...p, ...patch };
      saveStoredProfile(next);
      return next;
    });
  }, []);
  return { profile, onProfileChange };
}
