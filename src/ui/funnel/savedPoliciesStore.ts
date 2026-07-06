import { useCallback, useState } from 'react';
import type { Policy } from '@/domain/types';

/**
 * 내 신청함(F-④) — 관심 정책 저장소(localStorage 영속) + 재방문 표시.
 *
 * 안전/제약:
 *  - 저장은 최소 메타(id·제목·원문·출처·저장시각)만 — 전체 정책 재적재 없이 목록 렌더.
 *  - 로드 시 재검증(오염·비정상 항목 제거). 접근/파싱 실패 → 빈 목록(throw-free, degrade).
 *  - 자격 단정 없음: 저장은 "관심 표시"일 뿐, 자격/신청 가능 여부를 뜻하지 않는다(문구는 UI에서 보수).
 *  - 위기 렌더 불변식은 상위(FunnelContainer)가 보장 — 이 저장소는 위기와 무관(순수 데이터).
 */

export const SAVED_STORAGE_KEY = 'cheongnyeon.saved';
const MAX_SAVED = 100; // 폭주 방지 상한(가장 최근 우선).

export interface SavedPolicy {
  id: string;
  title: string;
  sourceUrl: string | null;
  source?: string;
  /** 저장 시각(ISO). 재방문 정렬·표시용. */
  savedAt: string;
}

/** 저장 항목 재검증 — id·title 문자열 필수, 그 외 방어. 비정상은 제거. */
export function sanitizeSavedList(raw: unknown): SavedPolicy[] {
  if (!Array.isArray(raw)) return [];
  const out: SavedPolicy[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    if (r === null || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const id = typeof o.id === 'string' ? o.id.trim() : '';
    const title = typeof o.title === 'string' ? o.title.trim() : '';
    if (id.length === 0 || title.length === 0 || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      title,
      sourceUrl: typeof o.sourceUrl === 'string' && o.sourceUrl.length > 0 ? o.sourceUrl : null,
      source: typeof o.source === 'string' && o.source.length > 0 ? o.source : undefined,
      savedAt: typeof o.savedAt === 'string' && o.savedAt.length > 0 ? o.savedAt : new Date(0).toISOString(),
    });
  }
  return out.slice(0, MAX_SAVED);
}

export function loadSavedPolicies(): SavedPolicy[] {
  try {
    const v = localStorage.getItem(SAVED_STORAGE_KEY);
    if (typeof v !== 'string' || v.length === 0) return [];
    return sanitizeSavedList(JSON.parse(v));
  } catch {
    return [];
  }
}

export function writeSavedPolicies(list: SavedPolicy[]): void {
  try {
    localStorage.setItem(SAVED_STORAGE_KEY, JSON.stringify(list.slice(0, MAX_SAVED)));
  } catch {
    // 접근 불가 — 무시(영속 없이 세션 내 동작).
  }
}

/** 정책 → 최소 저장 메타. */
export function toSavedPolicy(policy: Policy, now: string): SavedPolicy {
  return {
    id: policy.id,
    title: typeof policy.title === 'string' && policy.title.length > 0 ? policy.title : '제목 미상 정책',
    sourceUrl: typeof policy.sourceUrl === 'string' && policy.sourceUrl.length > 0 ? policy.sourceUrl : null,
    source: typeof policy.source === 'string' && policy.source.length > 0 ? policy.source : undefined,
    savedAt: now,
  };
}

/** 토글: 이미 있으면 제거, 없으면 맨 앞에 추가(최근 우선). 순수. */
export function toggleInList(list: SavedPolicy[], entry: SavedPolicy): SavedPolicy[] {
  if (list.some((x) => x.id === entry.id)) return list.filter((x) => x.id !== entry.id);
  return [entry, ...list].slice(0, MAX_SAVED);
}

export interface UseSavedPolicies {
  items: SavedPolicy[];
  isSaved: (id: string) => boolean;
  toggle: (policy: Policy) => void;
  remove: (id: string) => void;
}

export function useSavedPolicies(): UseSavedPolicies {
  const [items, setItems] = useState<SavedPolicy[]>(() => loadSavedPolicies());
  const toggle = useCallback((policy: Policy) => {
    if (!policy || typeof policy.id !== 'string' || policy.id.length === 0) return;
    setItems((cur) => {
      const next = toggleInList(cur, toSavedPolicy(policy, new Date().toISOString()));
      writeSavedPolicies(next);
      return next;
    });
  }, []);
  const remove = useCallback((id: string) => {
    setItems((cur) => {
      const next = cur.filter((x) => x.id !== id);
      writeSavedPolicies(next);
      return next;
    });
  }, []);
  const isSaved = useCallback((id: string) => items.some((x) => x.id === id), [items]);
  return { items, isSaved, toggle, remove };
}
