import { describe, it, expect, vi } from 'vitest';
import { explainMatch, type GroundingRecord } from '@/llm/explain';
import type { LlmClient } from '@/data/parseChunk';
import { detectCrisisRegex } from '@/domain/crisisDetect';

/**
 * 그라운딩/위기 의미클래스 회귀 가드 (Phase 6 재감사 잔여 누수 차단).
 * 자격 판정단정("탈락하셨습니다"·"못 받습니다"·"수령 불가") 인접 변형과
 * 위기 완곡(F-2 거리확장) 과확장을 의미클래스 일반화로 닫았는지 검증한다.
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
function llm(text: string): LlmClient {
  return { generateStructured: vi.fn(async () => ({ text })) };
}

// 반드시 거부(grounded=false): 자격 판정단정 새 변형
const MUST_REJECT = [
  '귀하는 탈락하셨습니다.',
  '선정에서 누락됩니다.',
  '지급 대상이 아니에요.',
  '혜택 제외 대상입니다.',
  '지원금을 못 받습니다.',
  '수령 불가합니다.',
];
// 반드시 통과(grounded=true): 관련성/안내 (과차단 가드)
const MUST_PASS = [
  '마음건강 상담과 관련이 있어 보여요.',
  '신청 자격을 확인해 보세요.',
  '대상일 수 있어요.',
];

describe('LEADER PROBE — 자격단정 일반화', () => {
  for (const t of MUST_REJECT) {
    it(`REJECT: ${t}`, async () => {
      const r = await explainMatch(RECORD, { llm: llm(t) });
      expect(r.grounded).toBe(false);
    });
  }
  for (const t of MUST_PASS) {
    it(`PASS: ${t}`, async () => {
      const r = await explainMatch(RECORD, { llm: llm(t) });
      expect(r.grounded).toBe(true);
    });
  }
});

// 위기 완곡 F-2 거리확장 과확장 가드
const CRISIS_TRUE = ['버틸 기운이 없어', '버틸 힘이 하나도 안 남았어', '버틸 의지가 없어'];
const CRISIS_FALSE = ['버틸 힘이 있는 한 끝까지 남아서 싸운다', '아직 버틸 힘이 남아있어', '버틸 만하다'];
describe('LEADER PROBE — 위기 완곡 과확장', () => {
  for (const t of CRISIS_TRUE) {
    it(`CRISIS: ${t}`, () => expect(detectCrisisRegex(t).crisis).toBe(true));
  }
  for (const t of CRISIS_FALSE) {
    it(`SAFE: ${t}`, () => expect(detectCrisisRegex(t).crisis).toBe(false));
  }
});
