import { useCallback, useState } from 'react';
import type { UserProfile } from '@/domain/types';

/**
 * 프로필 상태 훅(T10 경계) — App이 소유하던 profile useState + 병합 콜백을 추출.
 *
 * 목적:
 *  - 안정 참조: profile은 변경 시에만 새 객체(setState). ★T8 성능 불변식과 짝 — App의
 *    search/deps memo 배열에 profile을 넣지 않으므로, 이 훅이 안정 참조를 유지해 원격 검색
 *    남발을 막는다(자격 입력이지 검색 입력이 아님).
 *  - localStorage 영속화 경계(잔여 R2, 결정 4): 지금은 인메모리만. 후속에 이 훅 안에서
 *    apiKeyStore 패턴(localStorage)으로 초기값 로드/저장을 붙이면 App 계층 변경 0으로 확장 가능.
 *
 * 안전: patch는 바뀐 필드만 병합 → 미입력(undefined) 필드는 그대로 보존(income medianRatio 등).
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

export function useProfileState(initial: UserProfile): UseProfileState {
  const [profile, setProfile] = useState<UserProfile>(initial);
  const onProfileChange = useCallback((patch: ProfilePatch) => {
    setProfile((p) => ({ ...p, ...patch }));
  }, []);
  return { profile, onProfileChange };
}
