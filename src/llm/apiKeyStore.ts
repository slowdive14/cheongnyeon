/**
 * Gemini API 키 저장소 — localStorage 영속(키 없으면 LLM off).
 *
 * 안전 불변식(엄수):
 *  - 키는 화면·로그·전송에 평문 노출 0. 이 모듈은 저장/조회/삭제만(콘솔 출력 금지).
 *  - 빈/공백 키는 저장 안 함(off 유지). localStorage 접근 throw 흡수(SSR/차단 환경).
 *  - 키 자체는 사용자 브라우저 localStorage에만 머물고, 실 SDK는 geminiClient가 소비.
 */

export const API_KEY_STORAGE_KEY = 'cheongnyeon.gemini.apiKey';

/** 저장된 키 조회. 없거나 접근 불가 → null. */
export function loadApiKey(): string | null {
  try {
    const v = localStorage.getItem(API_KEY_STORAGE_KEY);
    return typeof v === 'string' && v.trim().length > 0 ? v : null;
  } catch {
    return null;
  }
}

/** 키 저장. 빈/공백은 저장하지 않음(off 유지). throw 흡수. */
export function saveApiKey(key: string): void {
  try {
    if (typeof key !== 'string' || key.trim().length === 0) return;
    localStorage.setItem(API_KEY_STORAGE_KEY, key.trim());
  } catch {
    // 접근 불가 환경 — 무시(키 미저장 = off).
  }
}

/** 키 삭제(LLM off). throw 흡수. */
export function clearApiKey(): void {
  try {
    localStorage.removeItem(API_KEY_STORAGE_KEY);
  } catch {
    // 무시.
  }
}
