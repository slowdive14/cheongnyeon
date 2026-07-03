import { describe, it, expect, vi } from 'vitest';
import { parseChunk } from '@/data/parseChunk';
import type { LlmClient } from '@/data/parseChunk';

/**
 * Test 2.4 — parseChunk (LLM 해석 → 구조화 자격 + 3청크)
 *
 * 안전 핵심(보수성):
 *  - 누락·null·스키마외값·LLM reject·빈 입력 → 반드시 UNKNOWN (throw 금지).
 *  - incomeCriterion 누락/null → {kind:'UNKNOWN'} (절대 none 아님).
 *  - kind:'none' 명시일 때만 none. (L3 vs L9 = L3 불명 / L9 명시무관)
 */

/** 주어진 응답 객체를 한 번 반환하는 mock LlmClient. */
function mockLlm(response: unknown): LlmClient {
  return {
    generateStructured: vi.fn().mockResolvedValue(response),
  };
}

/** generateStructured가 reject되는 mock. */
function rejectingLlm(): LlmClient {
  return {
    generateStructured: vi.fn().mockRejectedValue(new Error('LLM unavailable')),
  };
}

describe('parseChunk', () => {
  it('L1: 완전한 응답 → 구조화 자격 + 3청크 그대로', async () => {
    const llm = mockLlm({
      householdSeparation: 'required',
      incomeCriterion: { kind: 'medianRatio', value: 150, raw: '중위소득 150% 이하' },
      duplicateParticipation: 'allowed',
      chunks: {
        purpose: '서울 청년 주거 안정 지원',
        eligibility: '만 19~34세, 중위소득 150% 이하',
        application: '온라인 신청',
      },
    });

    const result = await parseChunk('정책 원문', { llm });

    expect(result.qualification.householdSeparation).toBe('required');
    expect(result.qualification.incomeCriterion).toEqual({
      kind: 'medianRatio',
      value: 150,
      raw: '중위소득 150% 이하',
    });
    expect(result.qualification.duplicateParticipation).toBe('allowed');
    expect(result.chunks.purpose).toBe('서울 청년 주거 안정 지원');
    expect(result.chunks.eligibility).toBe('만 19~34세, 중위소득 150% 이하');
    expect(result.chunks.application).toBe('온라인 신청');
  });

  it('L2: householdSeparation 누락 → UNKNOWN', async () => {
    const llm = mockLlm({
      incomeCriterion: { kind: 'none', raw: null },
      duplicateParticipation: 'allowed',
      chunks: { purpose: 'p', eligibility: 'e', application: 'a' },
    });

    const result = await parseChunk('원문', { llm });

    expect(result.qualification.householdSeparation).toBe('UNKNOWN');
  });

  it('L3: incomeCriterion null → {kind:UNKNOWN} (none 아님)', async () => {
    const llm = mockLlm({
      householdSeparation: 'required',
      incomeCriterion: null,
      duplicateParticipation: 'allowed',
      chunks: { purpose: 'p', eligibility: 'e', application: 'a' },
    });

    const result = await parseChunk('원문', { llm });

    expect(result.qualification.incomeCriterion.kind).toBe('UNKNOWN');
    expect(result.qualification.incomeCriterion.kind).not.toBe('none');
  });

  it('L4: 스키마외값 → UNKNOWN', async () => {
    const llm = mockLlm({
      householdSeparation: '아마도?',
      incomeCriterion: { kind: '대충중위소득', value: 'NaN', raw: 'x' },
      duplicateParticipation: 'maybe',
      chunks: { purpose: 'p', eligibility: 'e', application: 'a' },
    });

    const result = await parseChunk('원문', { llm });

    expect(result.qualification.householdSeparation).toBe('UNKNOWN');
    expect(result.qualification.incomeCriterion.kind).toBe('UNKNOWN');
    expect(result.qualification.duplicateParticipation).toBe('UNKNOWN');
  });

  it('L5: LLM reject → 전 UNKNOWN + 청크 null (throw 금지)', async () => {
    const llm = rejectingLlm();

    const result = await parseChunk('원문', { llm });

    expect(result.qualification.householdSeparation).toBe('UNKNOWN');
    expect(result.qualification.incomeCriterion.kind).toBe('UNKNOWN');
    expect(result.qualification.duplicateParticipation).toBe('UNKNOWN');
    expect(result.chunks.purpose).toBeNull();
    expect(result.chunks.eligibility).toBeNull();
    expect(result.chunks.application).toBeNull();
  });

  it('L6: 빈 객체 응답 → 전 UNKNOWN', async () => {
    const llm = mockLlm({});

    const result = await parseChunk('원문', { llm });

    expect(result.qualification.householdSeparation).toBe('UNKNOWN');
    expect(result.qualification.incomeCriterion.kind).toBe('UNKNOWN');
    expect(result.qualification.duplicateParticipation).toBe('UNKNOWN');
  });

  it('L7: application 청크만 제공 → 나머지 청크 null', async () => {
    const llm = mockLlm({
      householdSeparation: 'not_required',
      incomeCriterion: { kind: 'none', raw: null },
      duplicateParticipation: 'disallowed',
      chunks: { application: '방문 신청' },
    });

    const result = await parseChunk('원문', { llm });

    expect(result.chunks.application).toBe('방문 신청');
    expect(result.chunks.purpose).toBeNull();
    expect(result.chunks.eligibility).toBeNull();
  });

  it('L8: 빈/null 입력 → 안전 UNKNOWN (LLM 미호출, throw 금지)', async () => {
    const llm = mockLlm({ householdSeparation: 'required' });

    const empty = await parseChunk('', { llm });
    expect(empty.qualification.householdSeparation).toBe('UNKNOWN');
    expect(empty.chunks.purpose).toBeNull();
    expect(llm.generateStructured).not.toHaveBeenCalled();

    const nullInput = await parseChunk(null, { llm });
    expect(nullInput.qualification.incomeCriterion.kind).toBe('UNKNOWN');
  });

  it('L9: kind=none 명시 → none 보존 (L3 불명과 구분)', async () => {
    const llm = mockLlm({
      householdSeparation: 'not_required',
      incomeCriterion: { kind: 'none', raw: '소득 무관' },
      duplicateParticipation: 'allowed',
      chunks: { purpose: 'p', eligibility: 'e', application: 'a' },
    });

    const result = await parseChunk('원문', { llm });

    expect(result.qualification.incomeCriterion.kind).toBe('none');
  });

  it('amountMax 명시 → value 보존', async () => {
    const llm = mockLlm({
      householdSeparation: 'required',
      incomeCriterion: { kind: 'amountMax', value: 30000000, raw: '연소득 3천만원 이하' },
      duplicateParticipation: 'allowed',
      chunks: { purpose: 'p', eligibility: 'e', application: 'a' },
    });

    const result = await parseChunk('원문', { llm });

    expect(result.qualification.incomeCriterion).toEqual({
      kind: 'amountMax',
      value: 30000000,
      raw: '연소득 3천만원 이하',
    });
  });
});
