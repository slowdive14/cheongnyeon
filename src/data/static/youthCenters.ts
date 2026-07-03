import { sidoNameByPrefix } from '@/domain/parse/sido';

/**
 * F-③ 청년센터 연결 데이터(v1) — 안전 바닥선: 검증 안 된 전화번호·기관명 날조 절대 금지.
 *
 * 전략(R-3):
 *  - 시·도별 레코드에 phone/centerName을 null로 비워둔다(운영자 검증 후 채울 자리).
 *    값이 채워지면 UI가 자동 노출하는 구조. null이면 전화·기관명 UI 미렌더(날조 0).
 *  - v1 노출은 온통청년 공식 경로 통일 링크 1개(implementer가 curl 200 확인).
 *  - 동행 문구는 위기(전문기관) 톤과 구분 — 신청 도움 톤만.
 */

/** 온통청년 공식 메인(2026-07-02 curl 200 확인). 센터찾기/상담 진입점. */
export const YOUTH_CENTER_URL = 'https://www.youthcenter.go.kr';

export interface YouthCenter {
  /** 시·도 2자리 코드. */
  regionCode: string;
  /** 검증된 기관명만. 미검증 시 null(날조 금지). */
  centerName: string | null;
  /** 검증된 전화번호만. 미검증 시 null(날조 금지 — null이면 전화 UI 미렌더). */
  phone: string | null;
}

/**
 * 17개 시·도 레코드 — v1은 phone/centerName 전부 null(운영자 검증 대기).
 * 운영자가 검증된 값을 채우면 그 시·도만 전화/기관명이 노출된다.
 */
export const YOUTH_CENTERS: readonly YouthCenter[] = [
  '11', '26', '27', '28', '29', '30', '31', '36',
  '41', '43', '44', '46', '47', '48', '50', '51', '52',
].map((regionCode) => ({ regionCode, centerName: null, phone: null }));

const BY_CODE = new Map(YOUTH_CENTERS.map((c) => [c.regionCode, c]));

/** 시·도 코드 → 레코드. 미지·빈 코드 → undefined(throw 0). */
export function getYouthCenter(regionCode: string | undefined | null): YouthCenter | undefined {
  if (typeof regionCode !== 'string' || regionCode.trim().length === 0) return undefined;
  return BY_CODE.get(regionCode.trim());
}

/**
 * 동행 문구 — "혼자 하기 버거우면 OO청년센터가 같이 해줘요"(DESIGN §5).
 * OO = sidoNameByPrefix(regionCode). 미입력·미지 코드 → 지역명 없는 일반 문구.
 * 위기(전문기관) 톤과 구분: 신청 도움 톤만(자살예방·109·1577-0199 문구 부재).
 */
export function youthCenterMessage(regionCode: string | undefined | null): string {
  const name = typeof regionCode === 'string' ? sidoNameByPrefix(regionCode.trim()) : undefined;
  return name
    ? `혼자 하기 버거우면 ${name} 청년센터가 같이 해줘요`
    : '혼자 하기 버거우면 청년센터가 같이 해줘요';
}
