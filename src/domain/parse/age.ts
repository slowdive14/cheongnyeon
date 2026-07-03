import { asNonEmptyString, asFiniteNumber } from './primitives';

export interface AgeRange {
  ageMin: number | null;
  ageMax: number | null;
}

/**
 * 연령 파싱. 숫자 직접 제공 우선, 없으면 ageText 파싱.
 * 미커버/파싱불가/역순은 보수적으로 null.
 */
export function parseAgeRange(r: Record<string, unknown>): AgeRange {
  const directMin = asFiniteNumber(r.ageMin);
  const directMax = asFiniteNumber(r.ageMax);
  if (directMin !== null || directMax !== null) {
    return reconcile(directMin, directMax);
  }

  const text = asNonEmptyString(r.ageText);
  if (text === null) return { ageMin: null, ageMax: null };

  if (/제한\s*없음|무관/.test(text)) {
    return { ageMin: null, ageMax: null };
  }

  const maxOnly = text.match(/(\d+)\s*세?\s*이하/);
  if (maxOnly && maxOnly[1] !== undefined) {
    return reconcile(null, Number(maxOnly[1]));
  }

  const minOnly = text.match(/(\d+)\s*세?\s*이상/);
  if (minOnly && minOnly[1] !== undefined) {
    return reconcile(Number(minOnly[1]), null);
  }

  const range = text.match(/(\d+)\s*세?\s*[~\-–]\s*(?:만\s*)?(\d+)/);
  if (range && range[1] !== undefined && range[2] !== undefined) {
    return reconcile(Number(range[1]), Number(range[2]));
  }

  return { ageMin: null, ageMax: null };
}

/** 역순(min>max) 등 이상치는 보수적으로 거부(null/null). */
function reconcile(min: number | null, max: number | null): AgeRange {
  if (min !== null && max !== null && min > max) {
    return { ageMin: null, ageMax: null };
  }
  return { ageMin: min, ageMax: max };
}
