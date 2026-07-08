import { useMemo } from 'react';
import { ExternalLink, CalendarClock, Check, HelpCircle, Bookmark, BookmarkCheck } from 'lucide-react';
import { format, parseISO, isValid } from 'date-fns';
import type { EvaluatedPolicy, ReasonCode } from '@/domain/eligibility';
import type { CachedPolicy } from '@/data/cache/types';
import type { UserProfile } from '@/domain/types';
import type { LlmClient } from '@/data/parseChunk';
// D-② 재배선 대비 explain 정의 보존(호출은 정지 — Q-3 리더 확정). 표시·호출 없어도 export는 유지.
import { explainMatch, type GroundingRecord } from '@/llm/explain';
import { buildChecklist } from './policyChecklist';
import { DisclaimerNote } from './DisclaimerNote';

/**
 * 결과 카드 — 지금/곧/확인필요 3상태 + "나와 맞는 점" 체크리스트 + 원문 링크 + '추정' 고지 + 최종 업데이트.
 *
 * 안전 불변식:
 *  - status는 'now'|'soon'|'review'만. blocked(부적격)는 ResultList가 필터(미노출).
 *  - review(보수 판정): 자격을 단정하지 않고 무엇을 확인할지 힌트만 제시.
 *    탈락/부적격/막힘 문구는 절대 쓰지 않는다(헛절망 차단). 체크리스트 ✓는 "충족(추정)" 의미로만.
 *  - sourceUrl null → 링크·브리지 미생성(throw 없음).
 *  - 신선도(updatedAt)는 CachedPolicy에만 → 옵셔널 접근, 없으면 graceful 미표시.
 *  - title null → 폴백 라벨.
 *
 * D-② 재활성 대비: usePolicyExplanation/explainMatch/GroundingRecord 정의는 보존하되(export),
 *  표시(JSX)와 런타임 호출은 정지한다(Q-3 리더 확정 — 불필요 비동기·네트워크 0, 결정형 게이트).
 */
export interface PolicyResultCardProps {
  item: EvaluatedPolicy;
  status: 'now' | 'soon' | 'review';
  /** 사용자 프로필(체크리스트 "내 나이" 문구용). 미입력 시 나이 문구는 범위만. */
  profile?: UserProfile;
  /** (예약) '왜 맞는지' 설명 생성 LLM — D-② 재배선용. 현재 미사용(표시·호출 정지). */
  llm?: LlmClient;
  /** 내 신청함(F-④) 저장 상태. 미지정이면 저장 버튼 미렌더(기존 소비자 호환). */
  saved?: boolean;
  /** 저장 토글 콜백. 미지정이면 저장 버튼 미렌더. */
  onToggleSave?: () => void;
}

export interface ExplainState {
  text: string | null;
  loading: boolean;
}

/**
 * '왜 맞는지' 설명 훅 — D-② 재배선용 정의 보존(현재 미호출·미표시).
 * Q-3 리더 확정: 표시 제거 + 런타임 호출 정지. 이 함수·explainMatch·GroundingRecord는 D-②가 재배선한다.
 * export로 정의를 보존한다(D-②가 재배선; 삭제 금지). 카드 본체에서는 호출하지 않는다.
 */
export function usePolicyExplanation(
  record: GroundingRecord,
  llm?: LlmClient,
  stored?: string | null,
): ExplainState {
  // 정의 보존용 순수 계산(부수효과·비동기 0). D-②가 실제 훅 로직으로 복원.
  const _keep = explainMatch; // export 참조 유지(트리셰이크·미사용 제거 방지)
  void _keep;
  void record;
  void llm;
  return stored ? { text: stored, loading: false } : { text: null, loading: false };
}

/** review 사유 코드 → 사용자가 확인할 항목(의미 단위). 부적격 단정 아님. */
const REVIEW_REASON_LABELS: Partial<Record<ReasonCode, string>> = {
  AGE_UNKNOWN: '나이 조건',
  INCOME_UNKNOWN: '소득 조건',
  INCOME_PROFILE_MISSING: '소득 조건',
  REGION_UNKNOWN: '거주 지역',
  REGION_PROFILE_MISSING: '거주 지역',
  RECRUIT_UNKNOWN: '모집 시기',
  PREREQ_UNKNOWN: '사전 조건',
};

/** review 사유 → 확인 항목 라벨(중복 제거). 등급화·힌트 공통 소스. */
export function reviewLabels(reasons: ReasonCode[] | undefined): string[] {
  if (!Array.isArray(reasons)) return [];
  const labels: string[] = [];
  for (const r of reasons) {
    const label = REVIEW_REASON_LABELS[r];
    if (label && !labels.includes(label)) labels.push(label);
  }
  return labels;
}

const STATUS_META: Record<'now' | 'soon' | 'review', { label: string; cls: string }> = {
  // 상태 배지 색은 DESIGN §2 토큰만(hex 금지).
  now: { label: '지금 바로 신청돼요', cls: 'bg-teal-50 text-teal-800 ring-teal-800/20' },
  soon: { label: '곧 신청이 열려요', cls: 'bg-blue-50 text-blue-800 ring-blue-800/20' },
  // review는 부적격 아님(보수 판정) — 카드 렌더 시 등급화(경미/다수)로 라벨 결정.
  review: { label: '몇 가지만 확인하면 돼요', cls: 'bg-warmgray-50 text-warmgray-800 ring-warmgray-800/20' },
};

/**
 * 원문 버튼 출처 라벨 — 정책 출처를 정확히 표기(H-1: 거짓 출처 표기 금지).
 * source를 아는 것만 라벨을 붙이고, 불명(unknown 등)은 괄호를 생략해 틀린 출처를 만들지 않는다.
 */
function originLabel(source: unknown): string {
  switch (source) {
    case 'ontong':
      return '온통청년';
    case 'seoul-youth':
      return '청년몽땅';
    default:
      return '';
  }
}

/** 카테고리 태그 색(시안 파스텔) — 키워드 기반, 기본 크림. */
function categoryTag(category: string | null): { bg: string; text: string } {
  const c = category ?? '';
  if (/마음|심리|정신|상담/.test(c)) return { bg: '#EAD3EB', text: '#7A4A7D' };
  if (/일자리|취업|창업|고용/.test(c)) return { bg: '#D3E8CD', text: '#3F6B45' };
  if (/주거|월세|주택/.test(c)) return { bg: '#FAD6C0', text: '#B4491F' };
  if (/교육|학자금|장학|자격/.test(c)) return { bg: '#CFE1EF', text: '#3D678C' };
  if (/금융|생활|복지|문화/.test(c)) return { bg: '#F8E3AE', text: '#8A6410' };
  return { bg: '#F1E7D8', text: '#8A7A68' };
}

/** CachedPolicy.updatedAt만 신선도 보유 — 옵셔널·null-safe로 포맷. */
function formatUpdatedAt(policy: EvaluatedPolicy['policy']): string | null {
  const raw = (policy as Partial<CachedPolicy>).updatedAt;
  if (typeof raw !== 'string' || raw.length === 0) return null;
  const d = parseISO(raw);
  if (!isValid(d)) return null;
  return format(d, 'yyyy-MM-dd');
}

export function PolicyResultCard({ item, status, profile, saved, onToggleSave }: PolicyResultCardProps) {
  const policy = item.policy;
  const title =
    typeof policy?.title === 'string' && policy.title.length > 0 ? policy.title : '제목 미상 정책';
  const sourceUrl =
    typeof policy?.sourceUrl === 'string' && policy.sourceUrl.length > 0 ? policy.sourceUrl : null;
  const origin = originLabel(policy?.source);
  // 혜택 한 줄(D-②): 그라운딩 통과한 precompute 설명만 표시(없으면 raw 요약으로 폴백).
  const benefitRaw = (policy as Partial<CachedPolicy>).explanation;
  const benefit = typeof benefitRaw === 'string' && benefitRaw.trim().length > 0 ? benefitRaw.trim() : null;
  const updatedAt = formatUpdatedAt(policy);

  // 나와 맞는 점 체크리스트(D-①). axes 미보유(구 데이터) → 빈 배열 → 미렌더.
  const checklist = useMemo(() => buildChecklist(item.axes, policy, profile), [item.axes, policy, profile]);

  // review 등급화: 확인할 항목이 1개뿐이면 '거의 다 왔어요'(가까움), 여러 개면 '몇 가지만 확인하면 돼요'.
  const labels = status === 'review' ? reviewLabels(item.reasons) : [];
  const near = labels.length === 1;
  const meta =
    status === 'review'
      ? near
        ? { label: `거의 다 왔어요 — ${labels[0]}만 확인`, cls: 'bg-amber-50 text-amber-600 ring-amber-600/20' }
        : { label: '몇 가지만 확인하면 돼요', cls: 'bg-warmgray-50 text-warmgray-800 ring-warmgray-800/20' }
      : STATUS_META[status];

  const tag = categoryTag(policy?.category ?? null);

  return (
    <article
      data-testid="policy-result-card"
      data-funnel-region="result-card"
      className="rounded-[20px] border border-[#F0E6D8] bg-white p-[17px] shadow-[0_12px_28px_-16px_rgba(160,90,50,.4),0_2px_5px_rgba(160,90,50,.05)]"
    >
      {/* 상단: 카테고리 태그(좌) + 상태 배지(우). 매칭%·임의 지원규모는 표시하지 않음(실데이터만). */}
      <div className="mb-2.5 flex items-center justify-between gap-2">
        {typeof policy?.category === 'string' && policy.category.length > 0 ? (
          <span
            data-testid="policy-category"
            className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold"
            style={{ background: tag.bg, color: tag.text }}
          >
            {policy.category}
          </span>
        ) : (
          <span />
        )}
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${meta.cls}`}>
          {meta.label}
        </span>
      </div>

      <h3 className="mb-1 text-[17.5px] font-extrabold tracking-tight text-ink-900">{title}</h3>

      {benefit ? (
        <p data-testid="policy-benefit" className="text-sm leading-relaxed text-[#6E6054]">
          {benefit}
        </p>
      ) : policy?.summary ? (
        <p className="text-sm leading-relaxed text-[#6E6054]">{policy.summary}</p>
      ) : null}

      {checklist.length > 0 ? (
        <ul data-testid="policy-checklist" className="mt-3 space-y-1">
          {checklist.map((c) => (
            <li key={`${c.axis}-${c.mark}`} className="flex items-start gap-1.5 text-xs text-ink-800">
              {c.mark === 'pass' ? (
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-800" aria-hidden="true" />
              ) : (
                <HelpCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden="true" />
              )}
              <span>{c.text}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {/* 하단 액션: 좌(신선도·저장) / 우(원문 CTA). */}
      <div className="mt-3.5 flex items-center justify-between gap-2 border-t border-[#F3EBDD] pt-3.5">
        <div className="flex items-center gap-3 text-xs text-[#B4A594]">
          {updatedAt ? (
            <span className="flex items-center gap-1">
              <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
              최종 업데이트 {updatedAt}
            </span>
          ) : null}
          {onToggleSave ? (
            <button
              type="button"
              onClick={onToggleSave}
              aria-pressed={saved === true}
              aria-label={saved ? '내 신청함에서 빼기' : '내 신청함에 저장'}
              className="flex items-center gap-1 font-semibold text-[#A2937F] hover:text-clay-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-clay-500"
            >
              {saved ? (
                <BookmarkCheck className="h-3.5 w-3.5 text-clay-500" aria-hidden="true" />
              ) : (
                <Bookmark className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {saved ? '저장됨' : '저장'}
            </button>
          ) : null}
        </div>
        {sourceUrl ? (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#2B2622] px-4 py-2 text-[13px] font-bold text-white transition-colors hover:bg-[#C25A38] focus-visible:outline focus-visible:outline-2 focus-visible:outline-clay-500"
          >
            신청 페이지 열기{origin ? ` (${origin})` : ''}
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        ) : null}
      </div>

      {/* 브리지(F-①): 링크가 있을 때만 — 링크 없이 뜨면 오도(T-F1). */}
      {sourceUrl ? (
        <p className="mt-2 text-xs text-[#A2937F]">열리는 페이지에서 ‘신청하기’ 버튼을 찾으면 돼요</p>
      ) : null}

      <div className="mt-3 border-t border-[#F3EBDD] pt-2.5">
        <DisclaimerNote />
      </div>
    </article>
  );
}
