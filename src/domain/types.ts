/**
 * 도메인 타입 (Phase 1)
 *
 * 모든 타입은 순수 도메인 모델이다. UI·데이터·LLM 계층은 이 타입을 소비한다.
 * 안전 원칙:
 *  - 소득 unknown ≠ none (불명을 무관으로 흡수하면 부적격 통과 위험)
 *  - 불명 지역 ≠ 전국 (false negative 방지)
 *  - 원문(regionText, income.raw, sourceUrl)은 '추정' 고지 근거로 보존
 */

import type { ProgramKey } from './rules/programRules';

/** 소득 자격 조건. 불명(unknown)과 무관(none)을 절대 동일시하지 않는다. */
export interface IncomeCriteria {
  /** none=소득 무관, medianRatio=중위소득 비율 상한, amountMax=금액 상한, unknown=불명(확인 필요) */
  kind: 'none' | 'medianRatio' | 'amountMax' | 'unknown';
  /** medianRatio일 때 상한 비율(예: 150 = 중위소득 150%) */
  maxRatio?: number;
  /** amountMax일 때 상한 금액(원) */
  maxAmount?: number;
  /** 원문 보존(고지·디버깅 근거). 없으면 null. */
  raw: string | null;
}

/**
 * 모집 기간(window). Phase 1은 파싱·보존만 하고 상태 분류(now/soon/closed)는 하지 않는다.
 * 상태 분류는 Phase 3에서 clock 주입으로 수행한다.
 */
export interface RecruitWindow {
  /** dated=기간 명시, always=상시모집, unknown=불명/파싱불가 */
  kind: 'dated' | 'always' | 'unknown';
  /** ISO 날짜 문자열(YYYY-MM-DD) 또는 null */
  start: string | null;
  /** ISO 날짜 문자열(YYYY-MM-DD) 또는 null */
  end: string | null;
}

/**
 * 모집 상태. Phase 1은 선언만 한다.
 * 실제 분류는 Phase 3에서 고정 clock을 주입해 계산한다.
 */
export type RecruitStatus = 'now' | 'soon' | 'closed' | 'unknown';

/** 정규화된 정책 레코드. normalizePolicy의 출력 계약. */
export interface Policy {
  id: string;
  title: string;
  summary: string | null;
  /** 연령 하한(이상). 미지정/파싱불가는 null. */
  ageMin: number | null;
  /** 연령 상한(이하). 미지정/파싱불가는 null. */
  ageMax: number | null;
  income: IncomeCriteria;
  /** 법정 시·도 코드 등 식별된 지역 코드. 불명은 빈 배열. */
  regionCodes: string[];
  /** 지역 원문 보존. 없으면 null. */
  regionText: string | null;
  /** 전국 대상 여부. 불명은 false(보수). */
  isNationwide: boolean;
  recruit: RecruitWindow;
  category: string | null;
  /** 원문 링크. 없으면 null. */
  sourceUrl: string | null;
  /** 출처 라벨(ontong/mongttang 등). */
  source: 'ontong' | 'mongttang' | string;
  /** 원본 raw 데이터(디버깅·재처리용). */
  raw?: unknown;
  /**
   * 배타·순서 규칙 대상 사업 키. Phase 3 추가(U3).
   * null/미지정이면 어떤 규칙의 대상도 아님 → 자격 4축만 적용.
   */
  programKey?: ProgramKey | null;
}

/**
 * 사용자 프로필(자격 판정 입력). YAGNI — Phase 3에서 확정.
 */
export interface UserProfile {
  /**
   * 나이. 미입력(undefined)이면 ageAxis가 review(AGE_UNKNOWN)로 보수 판정.
   * NaN·음수·비유한도 eligibility.isUsableAge가 review로 안전 폴백(false-accept 없음).
   * UI 파서(profileInput.parseAgeInput)는 정수·비음만 통과시켜 이중 방어.
   */
  age?: number;
  /** 지역 표시용 텍스트(원문 보존). 자격 비교에는 쓰지 않는다. */
  region: string;
  /**
   * 법정 시·도 코드. Phase 3 추가(U1). 엔진은 이 코드로 Policy.regionCodes와 동일성 비교.
   * 미입력(빈 문자열/undefined)이면 지역축 → review(REGION_PROFILE_MISSING).
   */
  regionCode?: string;
  income?: {
    medianRatio?: number;
    amount?: number;
  };
  /** 수료(완료)한 사업 키 목록. 미입력(undefined)이면 순서 규칙 → review(U4). */
  completedPrograms?: string[];
  /** 현재 참여 중인 사업 키 목록. 미입력(undefined)이면 배타 규칙 → review(U4). */
  activePrograms?: string[];
}

/**
 * 욕구 그래프 노드. Phase 4에서 소비한다. Phase 1은 컴파일 가능 수준만.
 */
export interface GraphNode {
  id: string;
  label: string;
  /** 개념 설명문(임베딩·매칭 근거) */
  concept: string;
  /** 거친 도메인 스코프(하드 필터용) */
  allowedCategories?: string[];
  /** 세부 갈래 소프트 부스트 카테고리(가산만, 제외 X). Phase 4 추가(Q-2). */
  boostCategories?: string[];
  /** 세부 갈래 소프트 부스트 키워드(가산만). Phase 4 추가(Q-2). */
  boostKeywords?: string[];
  /** 대표 키워드(폴백 검색용) */
  keywords?: string[];
  children?: GraphNode[];
  kind?: 'entry' | 'branch' | 'leaf' | 'safety';
}
