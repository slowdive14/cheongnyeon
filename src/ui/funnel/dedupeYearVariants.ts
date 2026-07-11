import type { EvaluatedPolicy } from '@/domain/eligibility';
import type { CachedPolicy } from '@/data/cache/types';
import { normalizeName } from '@/data/similarity';

/**
 * 결과 후처리 — 같은 사업의 "연도 변형"이 결과에 나란히 뜨는 혼란을 클라에서 억제한다.
 *
 * 배경: 인제스트의 M-1 억제는 "연도 변형은 유지"(의도) — 작년판/올해판이 함께 적재된다.
 *       인제스트에서 안 걸리는 대신 여기(렌더 직전)서 그룹당 대표 1개만 노출한다.
 *
 * 그룹 키: 제목에서 연도 토큰((19|20)\d{2}년?)만 제거 후 normalizeName(공용 정규화) 적용.
 *   - 괄호 지역명 등 나머지 토큰은 남는다 → "(성북구)" vs "(중랑구)"는 절대 같은 그룹이 아님.
 *   - 정규화 결과가 빈 문자열(깨진 제목)이면 그룹핑하지 않는다(서로 다른 정책 오은폐 방지).
 *
 * 대표 선정 우선순위(높을수록 대표):
 *   1) 모집 상태 버킷: now > soon > review(불명)
 *   2) 제목 연도가 큰 것
 *   3) updatedAt(신선도) 최신
 *   4) id 안정 tie-break(입력 순서 무관, 결정적)
 *
 * 안전:
 *   - 그룹에 항상 대표 1개는 남는다(전멸 금지). 같은 이름의 더 신선한 판이 남으므로 오은폐 아님.
 *   - 순수·throw-free·결정적(시계 미사용 — updatedAt은 원문 파싱만, 현재 시각을 읽지 않음).
 *   - 상태 라벨·고지 등 안전 표면은 건드리지 않는다(버킷 재배치 없이 숨김만).
 */
export interface YearDedupeBuckets {
  now: EvaluatedPolicy[];
  soon: EvaluatedPolicy[];
  review: EvaluatedPolicy[];
}

type BucketName = 'now' | 'soon' | 'review';

/** 상태 우선순위(대표 선정 1순위). now가 가장 높다. */
const STATUS_RANK: Record<BucketName, number> = { now: 3, soon: 2, review: 1 };

/** 그룹 키 — 연도 토큰 제거 후 공용 정규화. 빈 문자열이면 그룹핑 제외(null). */
function groupKey(title: unknown): string | null {
  if (typeof title !== 'string') return null;
  const withoutYear = title.replace(/(19|20)\d{2}년?/g, ' ');
  const key = normalizeName(withoutYear);
  return key.length > 0 ? key : null;
}

/** 제목 내 최대 연도(대표 선정 2순위). 없으면 -Infinity. */
function titleYear(title: unknown): number {
  if (typeof title !== 'string') return -Infinity;
  const matches = title.match(/(19|20)\d{2}/g);
  if (!matches) return -Infinity;
  return Math.max(...matches.map((m) => Number(m)));
}

/** updatedAt(신선도, 대표 선정 3순위) → epoch. 없거나 파싱 불가면 -Infinity. 현재 시각 미사용. */
function updatedAtValue(policy: EvaluatedPolicy['policy']): number {
  const raw = (policy as Partial<CachedPolicy>).updatedAt;
  if (typeof raw !== 'string' || raw.length === 0) return -Infinity;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? -Infinity : t;
}

/** id 안정 tie-break용 — 문자열 id, 없으면 빈 문자열. */
function idOf(item: EvaluatedPolicy): string {
  const id = item.policy?.id;
  return typeof id === 'string' ? id : '';
}

interface Entry {
  item: EvaluatedPolicy;
  bucket: BucketName;
}

/** 두 후보 중 대표를 반환(우선순위 캐스케이드). 완전 동률이면 id 작은 쪽(결정적). */
function pickRepresentative(a: Entry, b: Entry): Entry {
  const ra = STATUS_RANK[a.bucket];
  const rb = STATUS_RANK[b.bucket];
  if (ra !== rb) return ra > rb ? a : b;

  const ya = titleYear(a.item.policy?.title);
  const yb = titleYear(b.item.policy?.title);
  if (ya !== yb) return ya > yb ? a : b;

  const ua = updatedAtValue(a.item.policy);
  const ub = updatedAtValue(b.item.policy);
  if (ua !== ub) return ua > ub ? a : b;

  return idOf(a.item) <= idOf(b.item) ? a : b;
}

/**
 * 버킷 횡단 연도 변형 dedupe. now/soon/review를 하나로 모아 그룹핑하고,
 * 각 그룹의 대표만 원래 버킷에 남긴다(나머지는 숨김). blocked는 호출측이 별도 처리(무접촉).
 */
export function dedupeYearVariants(input: YearDedupeBuckets): YearDedupeBuckets {
  const buckets: BucketName[] = ['now', 'soon', 'review'];

  // 1) 그룹 키별 대표 선정(버킷 횡단). 키가 null(빈/깨짐)이면 그룹핑하지 않는다.
  const winners = new Map<string, Entry>();
  for (const bucket of buckets) {
    const list = Array.isArray(input[bucket]) ? input[bucket] : [];
    for (const item of list) {
      const key = groupKey(item?.policy?.title);
      if (key === null) continue;
      const current = winners.get(key);
      const entry: Entry = { item, bucket };
      winners.set(key, current ? pickRepresentative(current, entry) : entry);
    }
  }

  // 2) 대표가 아닌 항목만 숨김. 키가 null이거나 그룹 단독이면 그대로 유지(무영향).
  const hidden = new Set<EvaluatedPolicy>();
  for (const bucket of buckets) {
    const list = Array.isArray(input[bucket]) ? input[bucket] : [];
    for (const item of list) {
      const key = groupKey(item?.policy?.title);
      if (key === null) continue;
      const winner = winners.get(key);
      if (winner && winner.item !== item) hidden.add(item);
    }
  }

  // 3) 버킷 순서·구조 보존하며 숨김만 제거(안전 표면·라벨 무접촉).
  return {
    now: (Array.isArray(input.now) ? input.now : []).filter((i) => !hidden.has(i)),
    soon: (Array.isArray(input.soon) ? input.soon : []).filter((i) => !hidden.has(i)),
    review: (Array.isArray(input.review) ? input.review : []).filter((i) => !hidden.has(i)),
  };
}
