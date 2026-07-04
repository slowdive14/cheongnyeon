import { describe, it, expect, vi } from 'vitest';
import { explainMatch, type GroundingRecord } from '@/llm/explain';
import type { LlmClient } from '@/data/parseChunk';
import type { CrisisResult } from '@/domain/crisisDetect';

/**
 * Test 6.2 — 그라운딩 가드 (날조 차단 + 자격 LLM이 못 뒤집음).
 *
 * 불변식(엄수):
 *  - 정책 record 화이트리스트 필드만 프롬프트에 주입(그라운딩).
 *  - 입력 record에 없는 URL/숫자/정책명/자격단정 → 후처리 거부 → fallback.
 *  - suppressGeneration=true → LLM 호출 0, text=null.
 *  - LLM 없음/throw/타임아웃 → fallback. throw-free.
 *  - 자격은 엔진이 SSOT. LLM 설명이 자격을 뒤집지 못함(단정 회피).
 */

const RECORD: GroundingRecord = {
  title: '서울 청년 마음건강 지원사업',
  summary: '심리상담 비용을 지원합니다.',
  category: '마음건강',
  ageMin: 19,
  ageMax: 34,
  regionText: '서울',
  recruit: '상시모집',
  sourceUrl: 'https://example.go.kr/policy/123',
};

function llmReturning(text: string): { llm: LlmClient; fn: ReturnType<typeof vi.fn> } {
  const fn = vi.fn(async () => ({ text }));
  return { llm: { generateStructured: fn }, fn };
}

const NON_CRISIS: CrisisResult = {
  crisis: false,
  layer: 'none',
  resources: [],
  suppressGeneration: false,
};
const CRISIS: CrisisResult = {
  crisis: true,
  layer: 'regex',
  resources: [],
  suppressGeneration: true,
};

describe('explain — EX 그라운딩 가드', () => {
  it('EX-1 prompt에 title/summary/sourceUrl 주입, grounded=true', async () => {
    const { llm, fn } = llmReturning('마음건강 상담 비용을 지원하는 정책으로 보여요.');
    const r = await explainMatch(RECORD, { llm });
    const prompt = String(fn.mock.calls[0]?.[0] ?? '');
    expect(prompt).toContain('서울 청년 마음건강 지원사업');
    expect(prompt).toContain('심리상담 비용을 지원합니다.');
    expect(prompt).toContain('https://example.go.kr/policy/123');
    expect(r.grounded).toBe(true);
    expect(r.source).toBe('llm');
    expect(r.text).toBeTruthy();
  });

  it('D-② 혜택 서술형("~을 지원해요")은 자격단정 아님 → 통과(grounded)', async () => {
    const { llm } = llmReturning('심리상담 비용을 지원하는 정책이에요.');
    const r = await explainMatch(RECORD, { llm });
    expect(r.source).toBe('llm');
    expect(r.grounded).toBe(true);
  });

  it('EX-2 입력외 URL 반환 → 거부·fallback', async () => {
    const { llm } = llmReturning('자세한 내용은 https://evil.example.com 에서 보세요.');
    const r = await explainMatch(RECORD, { llm });
    expect(r.grounded).toBe(false);
    expect(r.source).toBe('fallback');
  });

  it('EX-3 입력외 숫자 "300만원" → 거부·fallback', async () => {
    const { llm } = llmReturning('최대 300만원을 받을 수 있어요.');
    const r = await explainMatch(RECORD, { llm });
    expect(r.source).toBe('fallback');
  });

  it('EX-3b 입력에 있는 숫자(19/34)는 허용', async () => {
    const { llm } = llmReturning('만 19세에서 34세 청년을 위한 정책으로 보여요.');
    const r = await explainMatch(RECORD, { llm });
    expect(r.source).toBe('llm');
    expect(r.grounded).toBe(true);
  });

  it('EX-4 다른 정책명 → 거부·fallback', async () => {
    const { llm } = llmReturning('이것은 경기도 청년 면접수당 정책입니다.');
    const r = await explainMatch(RECORD, { llm });
    expect(r.source).toBe('fallback');
  });

  // ── S3 / H-3: 시·군·구 타지역명 누수 (record regionText='서울'). 제3 변형. ──
  it('EX-4b "강남구 거주 청년 대상" → 거부(corpus에 없는 구)', async () => {
    const { llm } = llmReturning('강남구 거주 청년 대상으로 보여요.');
    expect((await explainMatch(RECORD, { llm })).source).toBe('fallback');
  });
  it('EX-4c "수원시 청년만" → 거부', async () => {
    const { llm } = llmReturning('수원시 청년만 관련 있어 보여요.');
    expect((await explainMatch(RECORD, { llm })).source).toBe('fallback');
  });
  it('EX-4d "해운대구에서 신청" → 거부', async () => {
    const { llm } = llmReturning('해운대구에서 신청하면 좋을 것 같아요.');
    expect((await explainMatch(RECORD, { llm })).source).toBe('fallback');
  });
  it('EX-4e grounded 지역("서울 거주 대상") → 통과(회귀)', async () => {
    const { llm } = llmReturning('서울 거주 청년과 관련 있어 보여요.');
    const r = await explainMatch(RECORD, { llm });
    expect(r.source).toBe('llm');
    expect(r.grounded).toBe(true);
  });
  // M-1(code-reviewer): 단어경계 — "경기 침체"/"세종대왕"은 행정구역 토큰 아님(과도거부 금지).
  it('EX-4f "경기 침체로 힘든 분께" → 행정구역 아님(통과)', async () => {
    const { llm } = llmReturning('요즘 경기 침체로 힘든 분께 도움이 될 수 있어요.');
    expect((await explainMatch(RECORD, { llm })).source).toBe('llm');
  });
  it('EX-4g "세종대왕 같은 리더십" → 행정구역 아님(통과)', async () => {
    const { llm } = llmReturning('세종대왕 같은 마음으로 자신을 돌보는 정책이에요.');
    expect((await explainMatch(RECORD, { llm })).source).toBe('llm');
  });

  // ── S4: 숫자 그라운딩 — 부분문자열 false-pass 차단(정확 토큰 일치). ──
  it('EX-3c "12세"(corpus 19/34에 12 토큰 없음) → 거부', async () => {
    const { llm } = llmReturning('만 12세부터 신청할 수 있어요.');
    expect((await explainMatch(RECORD, { llm })).source).toBe('fallback');
  });
  it('EX-3d "3명 한정" → 거부(corpus에 3 토큰 없음)', async () => {
    const { llm } = llmReturning('선착순 3명 한정이에요.');
    expect((await explainMatch(RECORD, { llm })).source).toBe('fallback');
  });
  it('EX-3e "1년간 지원" → 거부(corpus에 1 토큰 없음)', async () => {
    const { llm } = llmReturning('1년간 지원받을 수 있어요.');
    expect((await explainMatch(RECORD, { llm })).source).toBe('fallback');
  });

  it('EX-5 자격단정 "자격이 됩니다" → 거부(LLM이 자격 판정 0)', async () => {
    const { llm } = llmReturning('회원님은 자격이 됩니다. 신청하세요.');
    const r = await explainMatch(RECORD, { llm });
    expect(r.source).toBe('fallback');
  });

  // ── S2 / H-2: 부정 단정도 자격 전복 — 양방향 차단(엔진 SSOT). 제3 변형 표현. ──
  it('EX-5b "자격이 안 됩니다" → 거부(부정 단정도 자격 전복)', async () => {
    const { llm } = llmReturning('회원님은 자격이 안 됩니다.');
    expect((await explainMatch(RECORD, { llm })).source).toBe('fallback');
  });
  it('EX-5c "자격이 없습니다" → 거부', async () => {
    const { llm } = llmReturning('이 정책은 자격이 없습니다.');
    expect((await explainMatch(RECORD, { llm })).source).toBe('fallback');
  });
  it('EX-5d "신청 대상이 아닙니다" → 거부', async () => {
    const { llm } = llmReturning('아쉽지만 신청 대상이 아닙니다.');
    expect((await explainMatch(RECORD, { llm })).source).toBe('fallback');
  });
  it('EX-5e "해당되지 않습니다" → 거부', async () => {
    const { llm } = llmReturning('조건에 해당되지 않습니다.');
    expect((await explainMatch(RECORD, { llm })).source).toBe('fallback');
  });
  it('EX-5f "받을 수 없어요" → 거부', async () => {
    const { llm } = llmReturning('이 지원은 받을 수 없어요.');
    expect((await explainMatch(RECORD, { llm })).source).toBe('fallback');
  });

  // ── 잔여-H2: 판정 의미클래스 일반화 검증(적격성·수령·확률 단정). ──
  //  auditor 실증 5종(EX-5g~5k) — 표현 나열이 아니라 의미클래스로 흡수돼야.
  const verdictLeaks: Array<[string, string]> = [
    ['EX-5g', '심사 결과 귀하는 부적격입니다.'], // 탈락 단정(최우선)
    ['EX-5h', '수급 대상에서 제외됩니다.'],
    ['EX-5i', '아쉽게도 지원받지 못합니다.'],
    ['EX-5j', '수혜 대상에 포함됩니다.'], // 합격 단정
    ['EX-5k', '선정될 가능성이 높습니다.'], // 확률 단정
  ];
  for (const [id, text] of verdictLeaks) {
    it(`${id} "${text}" → 거부(판정 단정)`, async () => {
      const { llm } = llmReturning(text);
      expect((await explainMatch(RECORD, { llm })).source).toBe('fallback');
    });
  }

  // ★자가검증 제3 변형(auditor 5종과 또 다른 형태) — 일반화 실증.
  const verdictSelf: Array<[string, string]> = [
    ['EX-5l', '당첨 대상입니다.'],
    ['EX-5m', '수급자로 선정됩니다.'],
    ['EX-5n', '혜택을 받으실 수 없습니다.'],
    ['EX-5o', '지원 대상에서 빠집니다.'],
    ['EX-5p', '선정 가능성이 충분합니다.'],
  ];
  for (const [id, text] of verdictSelf) {
    it(`${id} (자가검증) "${text}" → 거부`, async () => {
      const { llm } = llmReturning(text);
      expect((await explainMatch(RECORD, { llm })).source).toBe('fallback');
    });
  }

  // 과차단 회귀 가드(필수): 판정어·단정어미 없는 관련성 표현은 grounded 유지.
  const verdictOk: Array<[string, string]> = [
    ['EX-5ok1', '도움이 될 수 있어요.'],
    ['EX-5ok2', '관련이 있어 보여요.'],
    ['EX-5ok3', '신청해 보시면 좋아요.'],
  ];
  for (const [id, text] of verdictOk) {
    it(`${id} (과차단 가드) "${text}" → 통과(grounded)`, async () => {
      const { llm } = llmReturning(text);
      const r = await explainMatch(RECORD, { llm });
      expect(r.source).toBe('llm');
      expect(r.grounded).toBe(true);
    });
  }

  it('EX-6 "확실히 받을 수 있어요" 단정 → 거부·fallback', async () => {
    const { llm } = llmReturning('확실히 받을 수 있어요.');
    const r = await explainMatch(RECORD, { llm });
    expect(r.source).toBe('fallback');
  });

  it('EX-7 suppressGeneration=true → LLM 호출 0, text=null', async () => {
    const { llm, fn } = llmReturning('아무 텍스트');
    const r = await explainMatch(RECORD, { llm, crisis: CRISIS });
    expect(fn).not.toHaveBeenCalled();
    expect(r.text).toBeNull();
    expect(r.source).toBe('fallback');
  });

  it('EX-8 llm 없음 → fallback (text는 record 기반 안전 문구)', async () => {
    const r = await explainMatch(RECORD, {});
    expect(r.source).toBe('fallback');
    expect(r.grounded).toBe(false);
    expect(typeof r.text === 'string' || r.text === null).toBe(true);
  });

  it('EX-9 llm reject/타임아웃 → fallback, throw 없음', async () => {
    const fn = vi.fn(async () => {
      throw new Error('timeout');
    });
    const r = await explainMatch(RECORD, { llm: { generateStructured: fn }, crisis: NON_CRISIS });
    expect(r.source).toBe('fallback');
  });

  it('EX-10 policy=null/필드 누락 → throw 없음', async () => {
    const { llm } = llmReturning('설명');
    const r1 = await explainMatch(null as unknown as GroundingRecord, { llm });
    expect(r1.text === null || typeof r1.text === 'string').toBe(true);
    const partial = { title: '제목만' } as GroundingRecord;
    const r2 = await explainMatch(partial, { llm });
    expect(r2.source === 'llm' || r2.source === 'fallback').toBe(true);
  });

  it('EX-11 화이트리스트 외 필드(내부 id/raw) 프롬프트 미포함', async () => {
    const withExtra = {
      ...RECORD,
      id: 'SECRET-INTERNAL-ID',
      raw: { internal: 'DO-NOT-LEAK' },
    } as unknown as GroundingRecord;
    const { llm, fn } = llmReturning('서울 청년 마음건강 지원사업 설명.');
    await explainMatch(withExtra, { llm });
    const prompt = String(fn.mock.calls[0]?.[0] ?? '');
    expect(prompt).not.toContain('SECRET-INTERNAL-ID');
    expect(prompt).not.toContain('DO-NOT-LEAK');
  });

  it('EX-단정완화 "받을 수도 있어요"(완화형) → 허용', async () => {
    const { llm } = llmReturning('조건에 맞으면 지원받을 수도 있어요.');
    const r = await explainMatch(RECORD, { llm });
    expect(r.source).toBe('llm');
  });
});
