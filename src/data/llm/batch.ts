/**
 * 임베딩 배치 분할 유틸 (순수 함수).
 *
 * 배경/안전:
 *  - Gemini `batchEmbedContents`는 요청당 최대 100건 → 그 이상은 400(BatchEmbedContentsRequest.requests).
 *    색인 대상 정책(수백 건)을 한계 이하 배치로 쪼개 순서 보존해 임베딩한다.
 *  - 순수 함수 — SDK·네트워크에 의존하지 않으므로 결정적 게이트에서 완전 검증된다.
 *    실 SDK 호출(부수효과)은 geminiEmbed.ts에 격리.
 */

/** batchEmbedContents 요청당 최대 콘텐츠 수(Gemini API 하드 한계). */
export const MAX_EMBED_BATCH = 100;

/**
 * items를 size 단위로 순서 보존 분할.
 *  - 빈 입력 → [](임베딩 호출 자체 생략).
 *  - size<=0 → 전체를 단일 배치로(무한루프 방어).
 */
export function splitIntoBatches<T>(items: T[], size: number): T[][] {
  if (!Array.isArray(items) || items.length === 0) return [];
  if (size <= 0) return [items];
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}
