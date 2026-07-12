import type { Policy } from './types';
import { asNonEmptyString } from './parse/primitives';
import { parseAgeRange } from './parse/age';
import { parseIncome } from './parse/income';
import { parseRegion } from './parse/region';
import { parseRecruit } from './parse/recruit';

/**
 * 정규화 — raw 정책 레코드를 Policy로 변환한다.
 *
 * 계약(엄수):
 *  - 절대 throw 하지 않는다. 파싱 불가는 null / unknown / [].
 *  - 순수 함수: I/O 없음, Date.now() 없음(모집상태 분류는 Phase 3로 위임).
 *  - 안전: 소득 unknown ≠ none, 불명 지역 ≠ 전국.
 *  - 원문 보존: regionText, income.raw, sourceUrl.
 *
 * 이 함수는 조합 + 가드 + 원문 보존만 담당한다. 실제 파싱은 ./parse/* 헬퍼에 위임한다.
 */
export function normalizePolicy(raw: unknown): Policy {
  // 가드: 객체가 아니면(원시값·배열·null·undefined) 안전 기본 Policy 반환
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return safeDefault(raw);
  }
  const r = raw as Record<string, unknown>;

  const { ageMin, ageMax } = parseAgeRange(r);

  return {
    id: asNonEmptyString(r.id) ?? fallbackId(),
    title: asNonEmptyString(r.title) ?? '제목 없음',
    summary: asNonEmptyString(r.summary) ?? null,
    ageMin,
    ageMax,
    income: parseIncome(r),
    ...parseRegion(r),
    recruit: parseRecruit(r),
    category: asNonEmptyString(r.category) ?? null,
    // 제출서류 원문 통과(trim, 빈값→null). 가공하지 않는다(원문 그대로 보존).
    documentsText: asNonEmptyString(r.documentsText),
    sourceUrl: asNonEmptyString(r.sourceUrl) ?? null,
    source: asNonEmptyString(r.source) ?? 'unknown',
    raw,
  };
}

/** 비객체/원시값/배열/null/undefined 입력 → 안전 기본 Policy */
function safeDefault(raw: unknown): Policy {
  return {
    id: fallbackId(),
    title: '제목 없음',
    summary: null,
    ageMin: null,
    ageMax: null,
    income: { kind: 'unknown', raw: null },
    regionCodes: [],
    regionText: null,
    isNationwide: false,
    recruit: { kind: 'unknown', start: null, end: null },
    category: null,
    documentsText: null,
    sourceUrl: null,
    source: 'unknown',
    raw,
  };
}

/**
 * id 누락/오염 시 placeholder. normalizePolicy는 순수 함수여야 하므로 Date.now()/random을 쓰지 않는다.
 * 안정적·고유 id 부여 책임은 Phase 2 인제스트(원문 키 기반)로 위임한다.
 */
function fallbackId(): string {
  // TODO(확인필요): 안정적·고유 id 부여 책임은 Phase 2 인제스트로 위임.
  return 'unknown';
}
