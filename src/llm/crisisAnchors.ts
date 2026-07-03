import type { EmbeddingProvider } from '../retrieval/types';

/**
 * 위기 의미 앵커 빌더 — 2층(의미) 위기감지 활성화용 앵커 벡터 생성.
 *
 * 안전 불변식(엄수):
 *  - provider 있으면 앵커 문구를 임베딩해 number[][] 반환(layer-2 가동).
 *  - provider 없음/throw/깨진 산출 → [](layer-2 잠금). layer-1(정규식)은 절대 불변.
 *  - 거짓음성 0 우선: 앵커는 완곡·은유 위기 표현(정규식이 못 잡는 의미 클래스) 위주.
 *  - 이 모듈은 SDK를 직접 import하지 않는다 — 주입된 EmbeddingProvider만 소비.
 *
 * 앵커가 []이면 detectCrisis의 2층은 자동 잠금(detectSemantic가 앵커 0이면 비위기 none).
 * 따라서 키/임베딩 없는 환경에서도 layer-1만으로 안전 degrade가 보장된다.
 */

/**
 * 완곡·맥락 위기 앵커 문구(SSOT). 정규식 1층이 놓치기 쉬운 의미 클래스 중심.
 *  - 삶의 의미 상실 / 소진 한계 / 자기 무가치 / 소멸 소망(은유).
 *  - 직접 위기어는 1층이 이미 잡으므로 앵커에서 중복 배제(2층 부담 경감).
 */
export const CRISIS_ANCHOR_PHRASES: ReadonlyArray<string> = [
  '더는 아무 의미가 없는 것 같아',
  '모든 게 부질없고 공허하게 느껴져',
  '나는 아무 쓸모가 없는 사람 같아',
  '그냥 다 사라지면 좋겠어',
  '아무도 나를 필요로 하지 않아',
  '더 이상 견딜 힘이 남아있지 않아',
  '내일이 오지 않았으면 좋겠어',
  '나 같은 건 없는 게 나을지도 몰라',
];

export interface BuildCrisisAnchorsDeps {
  /** 임베딩 제공자(키 있을 때만 주입). 없으면 layer-2 잠금. */
  embed?: EmbeddingProvider;
}

/** number[] 유한 벡터인가(깨진 산출 방어). */
function isFiniteVector(v: unknown): v is number[] {
  return Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'number' && Number.isFinite(x));
}

export async function buildCrisisAnchors(
  deps: BuildCrisisAnchorsDeps = {},
): Promise<number[][]> {
  const provider = deps.embed;
  if (!provider) return []; // layer-2 잠금(layer-1 불변).

  let vectors: unknown;
  try {
    vectors = await provider.embed([...CRISIS_ANCHOR_PHRASES]);
  } catch {
    return []; // throw 흡수 → layer-2만 잠금.
  }
  if (!Array.isArray(vectors)) return [];

  const anchors: number[][] = [];
  for (const v of vectors) {
    if (isFiniteVector(v)) anchors.push(v);
  }
  return anchors;
}
