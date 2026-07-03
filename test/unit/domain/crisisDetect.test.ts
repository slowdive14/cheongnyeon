import { describe, it, expect, vi } from 'vitest';
import { detectCrisis, detectCrisisRegex } from '@/domain/crisisDetect';
import type { CrisisDetectDeps } from '@/domain/crisisDetect';
import type { EmbeddingProvider } from '@/retrieval/types';

/**
 * Test 4.5 — 위기 2층 감지 (이 프로젝트 최대 안전 리스크).
 * 거짓음성(위기 놓침) 절대 불가, 거짓양성 허용. 임계값 보수적.
 * 불변식: 1)1층 정규식 deps무관 항상작동 2)1층 hit→2층 호출없이 즉시반환
 *         3)crisis=true→resources 2건+suppress=true 4)embed throw→1층 보존
 */

/** 고정 유사도를 흉내내는 embed mock: 임의 query 벡터, 앵커는 [1,0,..] 정렬로 cos=sim. */
function fixedSimEmbed(sim: number): EmbeddingProvider {
  // query 벡터 = [sim, sqrt(1-sim^2)], 앵커 = [1,0] → 코사인 = sim
  const q = [sim, Math.sqrt(Math.max(0, 1 - sim * sim))];
  return {
    embed: vi.fn(async () => [q]),
  };
}

const ANCHORS = [[1, 0]];

function semanticDeps(sim: number): CrisisDetectDeps {
  return { embed: fixedSimEmbed(sim), crisisAnchors: ANCHORS, semanticThreshold: 0.82 };
}

// ── 3-A. 1층 직접 위기어 (API/키/네트워크 무관) ──────────────────────────

describe('crisisDetect — 3-A 1층 직접 위기어 (regex)', () => {
  const direct: Array<[string, string]> = [
    ['CR-1', '죽고 싶다'],
    ['CR-2', '죽고싶어요'],
    ['CR-3a', '자살하고 싶어'],
    ['CR-3b', '자살할까'],
    ['CR-4a', '죽어버리고 싶다'],
    ['CR-4b', '사라지고 싶어'],
    ['CR-5a', '목숨을 끊고 싶다'],
    ['CR-5b', '극단적 선택'],
    ['CR-6a', '자해했어요'],
    ['CR-6b', '자해하고 싶다'],
    ['CR-7', '더 이상 살고 싶지 않아'],
    ['CR-8a', '유서를 썼어'],
    ['CR-8b', '다 끝내고 싶다'],
  ];

  for (const [id, text] of direct) {
    it(`${id} "${text}" → regex 위기`, () => {
      const r = detectCrisisRegex(text);
      expect(r.crisis).toBe(true);
      expect(r.layer).toBe('regex');
      expect(r.suppressGeneration).toBe(true);
      expect(r.resources).toHaveLength(2);
    });
    it(`${id} (detectCrisis deps없이) "${text}" → regex 위기`, async () => {
      const r = await detectCrisis(text);
      expect(r.crisis).toBe(true);
      expect(r.layer).toBe('regex');
      expect(r.resources).toHaveLength(2);
    });
  }

  it('CR-9 detectCrisis("죽고 싶다") deps 전혀 없이 → embed없이 1층 작동', async () => {
    const r = await detectCrisis('죽고 싶다');
    expect(r.crisis).toBe(true);
    expect(r.layer).toBe('regex');
  });

  it('CR-10 embed가 throw해도 1층 위기 보존 + 2층 미호출', async () => {
    const embedFn = vi.fn(async (_texts: string[]): Promise<number[][]> => {
      throw new Error('boom');
    });
    const r = await detectCrisis('죽고 싶다', { embed: { embed: embedFn }, crisisAnchors: ANCHORS });
    expect(r.crisis).toBe(true);
    expect(r.layer).toBe('regex');
    expect(embedFn).not.toHaveBeenCalled();
  });
});

// ── 3-A2. 위기 표현 확장 (H-A 거짓음성 수정 — 완곡·은어·축약·어미회피) ──────

describe('crisisDetect — 3-A2 위기 표현 확장 (H-A safety High)', () => {
  // safety-auditor 런타임 프로브가 잡은 누락(수정 전 전부 crisis=false였음).
  const expanded: Array<[string, string]> = [
    ['CR-27a', '없어지고 싶어'],
    ['CR-27b', '그만 살고 싶다'],
    ['CR-27c', '살기 싫다'],
    ['CR-27d', '살고싶지가 않아'],
    ['CR-27e', '존재하고 싶지 않아'],
    ['CR-27f', '죽고 시퍼'], // 구어/오타
    ['CR-27g', '죽어버릴래'], // 어미 회피
    ['CR-27h', '뒤지고 싶다'], // 은어
  ];

  for (const [id, text] of expanded) {
    it(`${id} "${text}" → regex 위기 (확장 패턴)`, () => {
      const r = detectCrisisRegex(text);
      expect(r.crisis).toBe(true);
      expect(r.layer).toBe('regex');
      expect(r.resources).toHaveLength(2);
    });
    it(`${id} (detectCrisis deps없이) "${text}" → regex 위기`, async () => {
      const r = await detectCrisis(text);
      expect(r.crisis).toBe(true);
      expect(r.layer).toBe('regex');
    });
  }
});

// ── 3-A3. 맥락 위기 표현 1층 흡수 (H-B — 2층 미배포 보강) ────────────────

describe('crisisDetect — 3-A3 맥락 위기 표현 1층 흡수 (H-B safety High)', () => {
  // crisisAnchors 미주입(production)에서도 임베딩 없이 잡혀야 한다(2층 잠듦 보강).
  const contextual: Array<[string, string]> = [
    ['CR-28a', '더는 못 버티겠어'],
    ['CR-28b', '이제 다 포기하고 싶어'],
    ['CR-28c', '다 그만두고 싶어'],
    ['CR-28d', '이제 다 끝내고 싶다'],
  ];

  for (const [id, text] of contextual) {
    it(`${id} "${text}" → regex 위기 (임베딩 없이)`, async () => {
      const r = await detectCrisis(text); // deps 없이 = 1층 단독
      expect(r.crisis).toBe(true);
      expect(r.layer).toBe('regex');
      expect(r.resources).toHaveLength(2);
    });
  }
});

// ── 3-A4. 의미 클래스 일반화 검증 (과적합 방지 — 제3 변형) ────────────────
//   ★이 표현들은 패턴을 짠 뒤 "정말 잡히나" 검증용. 패턴이 의미 클래스로 일반화됐는지
//    측정하려고, 패턴 작성에 쓰지 않은 미세 변형/부사 치환으로 구성했다.
describe('crisisDetect — 3-A4 의미 클래스 일반화 (제3 변형)', () => {
  const variants: Array<[string, string]> = [
    // "못 버티다" 클래스 — 앞 부사 변형
    ['CR-30a', '도저히 못 버티겠어'],
    ['CR-30b', '더 이상은 못 버티겠어'],
    ['CR-30c', '하루도 못 버티겠어'],
    // "~버리고 싶다" 클래스 — 어간 변이
    ['CR-30d', '사라져 버리고 싶어'],
    ['CR-30e', '다 포기해버리고 싶어'],
    // 삶 부정 클래스
    ['CR-30f', '살 이유가 없어'],
    ['CR-30g', '살아갈 자신이 없어'],
    ['CR-30h', '사는 게 의미 없어'],
    // 완곡 죽음 소망형
    ['CR-30i', '깨어나고 싶지 않아'],
    ['CR-30j', '죽는 게 나을 것 같아'],
    ['CR-30k', '그냥 없어졌으면'],
  ];

  for (const [id, text] of variants) {
    it(`${id} "${text}" → 위기 (의미 클래스)`, () => {
      const r = detectCrisisRegex(text);
      expect(r.crisis).toBe(true);
      expect(r.layer).toBe('regex');
    });
    it(`${id} (deps없이) "${text}" → 위기`, async () => {
      const r = await detectCrisis(text);
      expect(r.crisis).toBe(true);
    });
  }
});

// ── 3-A5. ★자해 행위 진술 클래스 (최위험 — '자해' 글자 없이 행위만 서술) ──────
describe('crisisDetect — 3-A5 자해 행위 진술 (★최위험)', () => {
  const selfHarm: Array<[string, string]> = [
    // 패턴 검증용(coordinator 제공)
    ['CR-31a', '손목을 그었어'],
    ['CR-31b', '약을 다 모았어'],
    // ★제3 변형(패턴 짤 때 안 본 형태 — 과적합 방지)
    ['CR-31c', '손목 긋고 싶어'],
    ['CR-31d', '수면제를 털어넣을까'],
    ['CR-31e', '알약을 다 삼켰어'],
    // 삼키다 의지형(제3 변형 — 패턴 짤 때 안 본 형태): 삼킬/삼켜버릴
    ['CR-31f', '알약 다 삼켜버릴까'],
    ['CR-31g', '수면제 삼킬래'],
    ['CR-31h', '약을 한꺼번에 삼킬까'],
  ];

  for (const [id, text] of selfHarm) {
    it(`${id} "${text}" → 위기 (자해 행위)`, () => {
      const r = detectCrisisRegex(text);
      expect(r.crisis).toBe(true);
      expect(r.layer).toBe('regex');
      expect(r.resources).toHaveLength(2);
    });
    it(`${id} (deps없이) "${text}" → 위기`, async () => {
      const r = await detectCrisis(text);
      expect(r.crisis).toBe(true);
    });
  }
});

// ── 3-A6. ★버팀 한계 의미클래스 (H-1 거짓음성 수정 — 긍정형 동사 + 부재 서술) ──────
//   클래스 F가 부정어 선행("못/안 버티")만 잡아 "버틸 힘이 없어"(긍정 동사+부재)를 놓쳤다.
//   ★제3 변형: 패턴 작성에 쓰지 않은 동사·명사·어미 조합으로 의미클래스 일반화 검증.
describe('crisisDetect — 3-A6 버팀 한계 의미클래스 (H-1 safety High)', () => {
  const limit: Array<[string, string]> = [
    ['CR-34a', '버틸 힘이 없어'],
    ['CR-34b', '버틸 힘이 없다'],
    ['CR-34c', '견딜 힘이 없어'],
    ['CR-34d', '버틸 기력이 없다'],
    // 제3 변형(여력/바닥/안 남 — 패턴 짤 때 안 본 부재 표현)
    ['CR-34e', '더 견딜 여력이 없어'],
    ['CR-34f', '버틸 힘이 바닥났어'],
    ['CR-34g', '견딜 힘이 남아있지 않아'],
    // Med 보강(기운/의지 동의어 + 부재어 거리 확장)
    ['CR-34h', '버틸 기운이 없어'],
    ['CR-34i', '버틸 힘이 하나도 안 남았어'],
    ['CR-34j', '이제 버틸 의지가 없어'],
  ];

  for (const [id, text] of limit) {
    it(`${id} "${text}" → 위기 (버팀 한계)`, () => {
      const r = detectCrisisRegex(text);
      expect(r.crisis).toBe(true);
      expect(r.layer).toBe('regex');
      expect(r.resources).toHaveLength(2);
    });
    it(`${id} (deps없이) "${text}" → 위기`, async () => {
      const r = await detectCrisis(text);
      expect(r.crisis).toBe(true);
    });
  }

  // 거짓양성 가드: 긍정 진행형("버티고 있어")은 위기 아님(부재 서술 없음).
  //  ★거리 확장({0,5}→{0,9})이 과확장(긍정 존재 표현 오탐)을 일으키지 않는지 재검.
  const ok: Array<[string, string]> = [
    ['CR-34n1', '그래도 버티고 있어'],
    ['CR-34n2', '아직은 견딜 만해'],
    ['CR-34n3', '버틸 힘이 조금은 남아있어'],
    // Med 거리 확장 과확장 가드(존재·긍정 — 부재어 미동반)
    ['CR-34n4', '아직 버틸 힘이 남아있어'],
    ['CR-34n5', '버틸 만하다'],
    ['CR-34n6', '이 악물고 버티는 중'],
    ['CR-34n7', '힘이 넘쳐'],
  ];
  for (const [id, text] of ok) {
    it(`${id} "${text}" → 비위기 (긍정 진행)`, () => {
      expect(detectCrisisRegex(text).crisis).toBe(false);
    });
  }
});

// ── 3-B. 1층 false positive 경계 (Q-1 결정) ─────────────────────────────

describe('crisisDetect — 3-B 1층 false positive 경계 (Q-1)', () => {
  const nonCrisis: Array<[string, string]> = [
    ['CR-11a', '과제 때문에 죽겠다'],
    ['CR-11b', '배고파 죽겠어'],
    ['CR-11c', '더워 죽겠다'],
    ['CR-12a', '이 게임 죽인다'],
    ['CR-12b', '맛이 죽여줘요'],
    ['CR-13a', '죽은 세포'],
    ['CR-13b', '죽은 식물'],
    // M-2: '유서' 패턴이 '유서 깊은/자유서식'을 위기로 오탐하지 않아야(배너 피로).
    ['CR-29a', '유서 깊은 전통'],
    ['CR-29b', '자유서식으로 작성'],
    // CR-32: 의미 클래스 확장 후 거짓양성 회귀 가드(일상어 충돌 방지).
    ['CR-32a', '살기 좋다'], // 삶 부정 클래스 오탐 금지
    ['CR-32b', '죽이는 맛'], // 감탄
    ['CR-32c', '끝내주는 공연'], // 끝내 클래스 오탐 금지
    ['CR-32d', '포기하지 마'], // 포기 클래스 오탐 금지
    ['CR-32e', '여기 떠나고 싶다'], // 여행 맥락 — '떠나'는 위기 클래스에 안 들어가야
    ['CR-32f', '이 일은 포기할래'], // 일반 포기(자기소멸 아님)
    // CR-33: 삼키다 일반화 후 거짓양성 가드(약물어 미동반 일상 삼킴은 비위기).
    ['CR-33a', '밥을 삼키다'],
    ['CR-33b', '침을 삼켰다'],
    ['CR-33c', '약 받으러 가야지'], // 일반 복약 맥락(삼킬 의지 없음)
  ];

  for (const [id, text] of nonCrisis) {
    it(`${id} "${text}" → 비위기`, () => {
      const r = detectCrisisRegex(text);
      expect(r.crisis).toBe(false);
    });
  }

  it('CR-14 빈문자열 → 비위기, none, throw없음', () => {
    const r = detectCrisisRegex('');
    expect(r.crisis).toBe(false);
    expect(r.layer).toBe('none');
  });

  it('CR-15 null/undefined/숫자 → 비위기, throw없음', () => {
    for (const v of [null, undefined, 42, {}, []]) {
      const r = detectCrisisRegex(v as unknown);
      expect(r.crisis).toBe(false);
      expect(r.layer).toBe('none');
    }
  });
});

// ── 3-C. 2층 의미 임계값 ────────────────────────────────────────────────

describe('crisisDetect — 3-C 2층 의미 임계값', () => {
  // ★주의: CR-16~18은 고정 fixture anchor에 의존한다(실배포 미보장).
  //  production은 crisisAnchors 미주입 → 2층 비작동(Phase 6 실벡터). H-B로 고빈도
  //  맥락어는 1층이 흡수하므로, 여기 입력은 1층에 안 걸리는 순수 2층 검증용으로 고른다.
  it('CR-16 (2층 전용 입력) 유사도0.90 → semantic 위기', async () => {
    const r = await detectCrisis('요즘 모든 게 의미가 없게 느껴져', semanticDeps(0.9));
    expect(r.crisis).toBe(true);
    expect(r.layer).toBe('semantic');
    expect(r.suppressGeneration).toBe(true);
  });

  it('CR-17 0.85 → semantic 위기', async () => {
    const r = await detectCrisis('나는 아무 쓸모가 없는 사람 같아', semanticDeps(0.85));
    expect(r.crisis).toBe(true);
    expect(r.layer).toBe('semantic');
  });

  it('CR-18 0.84 → semantic 위기', async () => {
    const r = await detectCrisis('짐만 되는 것 같아', semanticDeps(0.84));
    expect(r.crisis).toBe(true);
    expect(r.layer).toBe('semantic');
  });

  it('CR-19 "오늘 좀 우울해" 0.40 → 비위기(검색 라우팅)', async () => {
    const r = await detectCrisis('오늘 좀 우울해', semanticDeps(0.4));
    expect(r.crisis).toBe(false);
    expect(r.layer).toBe('none');
  });

  // 2층-only 입력: 1층 정규식에 안 걸리는 맥락어(임베딩 없으면 못 잡음 = 의도된 degrade).
  const TWO_LAYER_ONLY = '요즘 모든 게 의미가 없게 느껴져';

  it('CR-20 embed=undefined(키없음) → 비위기, none (의도된 degrade)', async () => {
    const r = await detectCrisis(TWO_LAYER_ONLY, { crisisAnchors: ANCHORS });
    expect(r.crisis).toBe(false);
    expect(r.layer).toBe('none');
  });

  it('CR-21 embed throw → 비위기, none, throw없음 (2층 실패 흡수)', async () => {
    const embedFn = vi.fn(async (_texts: string[]): Promise<number[][]> => {
      throw new Error('boom');
    });
    const r = await detectCrisis(TWO_LAYER_ONLY, { embed: { embed: embedFn }, crisisAnchors: ANCHORS });
    expect(r.crisis).toBe(false);
    expect(r.layer).toBe('none');
  });

  it('CR-22 유사도 정확히 0.82(=th) → 위기 (≥임계, 보수)', async () => {
    const r = await detectCrisis(TWO_LAYER_ONLY, semanticDeps(0.82));
    expect(r.crisis).toBe(true);
    expect(r.layer).toBe('semantic');
  });

  it('CR-23 유사도 0.819(<th) → 비위기', async () => {
    const r = await detectCrisis(TWO_LAYER_ONLY, semanticDeps(0.819));
    expect(r.crisis).toBe(false);
  });
});

// ── 3-D. 위기 결과 shape — 안전자원 우선 보장 ───────────────────────────

describe('crisisDetect — 3-D 위기 결과 shape', () => {
  it('CR-24 crisis=true → resources 2건 + suppress=true (regex·semantic 모두)', async () => {
    const rx = detectCrisisRegex('죽고 싶다');
    expect(rx.resources).toHaveLength(2);
    expect(rx.suppressGeneration).toBe(true);

    const sem = await detectCrisis('요즘 모든 게 의미가 없게 느껴져', semanticDeps(0.9));
    expect(sem.resources).toHaveLength(2);
    expect(sem.suppressGeneration).toBe(true);
  });

  it('CR-25 phone 검증 → 109와 1577-0199 둘다 존재', () => {
    const r = detectCrisisRegex('죽고 싶다');
    const phones = r.resources.map((x) => x.phone);
    expect(phones).toContain('109');
    expect(phones).toContain('1577-0199');
  });

  it('비위기 결과 → resources 비고 suppress=false', () => {
    const r = detectCrisisRegex('오늘 날씨 좋다');
    expect(r.resources).toHaveLength(0);
    expect(r.suppressGeneration).toBe(false);
  });
});
