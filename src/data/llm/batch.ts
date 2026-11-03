/**
 * 임베딩 배치 분할 유틸 (순수 함수).
 *
 * 배경/안전:
 *  - Gemini `batchEmbedContents`는 요청당 최대 100건 → 그 이상은 400(BatchEmbedContentsRequest.requests).
 *    색인 대상 정책(수백 건)을 한계 이하 배치로 쪼개 순서 보존해 임베딩한다.
 *  - 순수 함수 — SDK·네트워크에 의존하지 않으므로 결정적 게이트에서 완전 검증된다.
 *    실 SDK 호출(부수효과)은 geminiEmbed.ts에 격리.
 */

/**
 * batchEmbedContents 요청당 콘텐츠 수.
 *
 * API 하드 한계는 100이지만 **무료 등급 토큰 한도(TPM)가 100건 묶음을 거부**한다(429 quota exceeded).
 * 실측(2026-11-02): 50건 성공 / 100건 429. 실패 배치는 geminiEmbed가 흡수해 벡터가 null로 남고,
 * 다음 실행도 같은 크기로 또 실패해 영구 미적재가 된다(전체 3,917건 중 749건 임베딩 결손 원인).
 * → 실측 성공선(50) 아래로 여유를 둬 40으로 고정. 결제 등급 상향 시 100까지 되돌릴 수 있다.
 */
export const MAX_EMBED_BATCH = 40;

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
