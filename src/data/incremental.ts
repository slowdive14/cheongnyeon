import type { Policy } from '../domain/types';
import type { CachedPolicy } from './cache/types';

/**
 * 증분 해시 — 재파싱 필요 판정. 순수·결정적(I/O·Date.now 없음).
 *
 * 해시 입력:
 *  - 최종수정일(raw.lastModified) 있으면 id + 최종수정일.
 *  - 없으면 id + 자격영향 원문 정규화 직렬화.
 *  - 제외: fetchedAt / updatedAt / sourceUrl (오염 시 전체 재파싱·변경 누락 위험).
 *  - 키 정렬 + 공백 정규화로 결정성(H8).
 *  - 깨진/null raw도 throw 금지(H7).
 */

/** 공백을 단일 스페이스로 접고 trim(공백 정규화). null은 빈 문자열. */
function normWs(v: string | null): string {
  if (v === null) return '';
  return v.replace(/\s+/g, ' ').trim();
}

/** raw에서 최종수정일을 안전 추출. 없으면 null. */
function lastModifiedOf(policy: Policy): string | null {
  const raw = policy.raw;
  if (raw === null || typeof raw !== 'object') return null;
  const lm = (raw as Record<string, unknown>).lastModified;
  return typeof lm === 'string' && lm.trim().length > 0 ? lm.trim() : null;
}

/**
 * raw에서 자격영향 '원문' 텍스트 필드를 안전 추출.
 * 파싱값(ageMin/income.kind 등)이 동일해도 원문이 바뀌면(예: "19~34"→"만 19세~만 34세")
 * 재해석 가치가 있을 수 있으므로 원문 자체를 서명에 포함한다(발행처 본문 변경 누락 방지).
 * sourceUrl/fetchedAt/updatedAt 등 자격무관·휘발 필드는 의도적으로 제외.
 */
const ELIGIBILITY_RAW_KEYS = [
  'ageText',
  'incomeText',
  'regionText',
  'recruitText',
  'recruitStartText',
  'recruitEndText',
] as const;

function eligibilityRawSignature(policy: Policy): string {
  const raw = policy.raw;
  if (raw === null || typeof raw !== 'object') return '';
  const r = raw as Record<string, unknown>;
  // 키 정렬(상수 배열 자체가 정렬됨) + 공백 정규화로 결정성.
  return [...ELIGIBILITY_RAW_KEYS]
    .map((k) => {
      const v = r[k];
      return `${k}=${typeof v === 'string' ? normWs(v) : ''}`;
    })
    .join('|');
}

/**
 * 자격영향 원문(정규화된 Policy 필드)을 결정적 직렬화한다.
 * title/summary/연령/소득/지역/모집/카테고리/소득원문 포함. sourceUrl 제외.
 * 키 정렬 + 공백 정규화로 키 순서·공백 차이를 흡수한다.
 */
function eligibilitySignature(policy: Policy): string {
  const fields: Record<string, string> = {
    title: normWs(policy.title),
    summary: normWs(policy.summary),
    ageMin: policy.ageMin === null ? '' : String(policy.ageMin),
    ageMax: policy.ageMax === null ? '' : String(policy.ageMax),
    incomeKind: policy.income.kind,
    incomeMaxRatio: policy.income.maxRatio === undefined ? '' : String(policy.income.maxRatio),
    incomeMaxAmount: policy.income.maxAmount === undefined ? '' : String(policy.income.maxAmount),
    incomeRaw: normWs(policy.income.raw),
    regionCodes: [...policy.regionCodes].sort().join(','),
    regionText: normWs(policy.regionText),
    isNationwide: String(policy.isNationwide),
    recruitKind: policy.recruit.kind,
    recruitStart: policy.recruit.start ?? '',
    recruitEnd: policy.recruit.end ?? '',
    category: normWs(policy.category),
    // 자격영향 원문(파싱값과 별개) — 원문만 바뀌어도 변경 감지.
    rawText: eligibilityRawSignature(policy),
  };
  // 키 정렬 직렬화(결정성).
  const keys = Object.keys(fields).sort();
  return keys.map((k) => `${k}=${fields[k]}`).join('|');
}

/**
 * 정책의 자격영향 내용을 결정적 해시로.
 * 해시 입력 = id + lastModified(있으면) + eligibilitySignature 이중 결합(수정일은 1차 신호, 서명은 항상 포함).
 * 의존성 없이 FNV-1a 32bit 자체 구현(신규 직접 의존성 금지).
 */
export function contentHash(policy: Policy): string {
  // 이중 결합: lastModified(저비용 1차 신호)는 있으면 결합하되, 자격영향 서명을 항상 포함.
  // 발행처가 수정일 미갱신 채 본문만 바꿔도 감지(낡은 자격 캐시 방지). sourceUrl/fetchedAt 제외 유지.
  const lm = lastModifiedOf(policy) ?? '';
  const input = `${policy.id} lm ${lm} sig ${eligibilitySignature(policy)}`;
  return fnv1a(input);
}

/** 신규(캐시 없음) 또는 해시 불일치 → 재파싱 필요. */
export function needsReparse(policy: Policy, cached: CachedPolicy | null): boolean {
  if (cached === null) return true;
  return contentHash(policy) !== cached.contentHash;
}

/** FNV-1a 32bit. 결정적·의존성 없음. */
function fnv1a(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    // 32bit FNV prime 곱(부호없는 처리).
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
