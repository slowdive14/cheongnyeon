/**
 * 안전 자원 — 위기 청년에게 항상 최상단 노출할 상담 자원(SSOT).
 *
 * 안전: 위기(crisis=true) 결과는 반드시 이 목록을 채운다. 변경은 여기 1곳에서만.
 * 출처: 보건복지부 자살예방상담전화(109), 정신건강위기상담전화(1577-0199).
 */

export interface SafetyResource {
  label: string;
  phone: string;
  available: string;
  note?: string;
}

export const SAFETY_RESOURCES: readonly SafetyResource[] = [
  { label: '자살예방상담전화', phone: '109', available: '24시간 365일' },
  { label: '정신건강위기상담전화', phone: '1577-0199', available: '24시간 365일' },
];

/** 방어적 복제(소비자가 배열을 변형해도 SSOT 불변). */
export function safetyResources(): SafetyResource[] {
  return SAFETY_RESOURCES.map((r) => ({ ...r }));
}
