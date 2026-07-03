import { describe, it, expect } from 'vitest';
import { normalizePolicy } from '@/domain/normalizePolicy';
import type { Policy } from '@/domain/types';
import sampleRaw from '../../fixtures/ontong-policies.sample.json';

/**
 * 계약: normalizePolicy(raw: unknown): Policy
 * - 절대 throw 금지. 파싱 불가는 null / unknown / [].
 * - 순수 함수: I/O·Date.now() 금지(모집상태 분류는 Phase 3로 위임).
 * - 원문 보존: regionText, income.raw, sourceUrl.
 * - 안전: 소득 unknown ≠ none, 불명 지역 ≠ 전국.
 */

const samples = sampleRaw as Array<Record<string, unknown> & { _case: string }>;

/** fixture 배열에서 _case 접두로 raw 레코드 선택 */
function pick(casePrefix: string): unknown {
  const found = samples.find((s) => s._case.startsWith(casePrefix));
  if (!found) throw new Error(`fixture case not found: ${casePrefix}`);
  return found;
}

/** 편의: 정규화된 Policy 반환 */
function norm(casePrefix: string): Policy {
  return normalizePolicy(pick(casePrefix));
}

describe('normalizePolicy — S1 연령 정상(경계)', () => {
  it('S1-a "19~34" → 19 / 34', () => {
    const p = norm('S1-a');
    expect(p.ageMin).toBe(19);
    expect(p.ageMax).toBe(34);
  });

  it('S1-b "만 19세~만 34세" → 19 / 34', () => {
    const p = norm('S1-b');
    expect(p.ageMin).toBe(19);
    expect(p.ageMax).toBe(34);
  });

  it('S1-c 숫자 직접(ageMin/ageMax) → 19 / 34', () => {
    const p = norm('S1-c');
    expect(p.ageMin).toBe(19);
    expect(p.ageMax).toBe(34);
  });

  it('S1-d "34세 이하" → null / 34 (off-by-one 금지, 정확히 34)', () => {
    const p = norm('S1-d');
    expect(p.ageMin).toBeNull();
    expect(p.ageMax).toBe(34);
  });

  it('S1-e "19세 이상" → 19 / null', () => {
    const p = norm('S1-e');
    expect(p.ageMin).toBe(19);
    expect(p.ageMax).toBeNull();
  });

  it('S1-f "제한없음" → null / null', () => {
    const p = norm('S1-f');
    expect(p.ageMin).toBeNull();
    expect(p.ageMax).toBeNull();
  });
});

describe('normalizePolicy — S2 연령 이상치(throw 없음, 보수 처리)', () => {
  it('S2-a 빈 문자열 → null / null', () => {
    const p = norm('S2-a');
    expect(p.ageMin).toBeNull();
    expect(p.ageMax).toBeNull();
  });

  it('S2-b "서른넷"(파싱불가) → null / null', () => {
    const p = norm('S2-b');
    expect(p.ageMin).toBeNull();
    expect(p.ageMax).toBeNull();
  });

  it('S2-c "34~19"(역순) → 보수 거부 null / null', () => {
    const p = norm('S2-c');
    expect(p.ageMin).toBeNull();
    expect(p.ageMax).toBeNull();
  });

  it('연령 필드 타입 오염(객체/배열) → null / null, throw 없음', () => {
    expect(() => normalizePolicy({ id: 'X', ageText: {} })).not.toThrow();
    const a = normalizePolicy({ id: 'X', ageText: {} });
    expect(a.ageMin).toBeNull();
    expect(a.ageMax).toBeNull();

    const b = normalizePolicy({ id: 'Y', ageMin: 'oops', ageMax: [] });
    expect(b.ageMin).toBeNull();
    expect(b.ageMax).toBeNull();
  });
});

describe('normalizePolicy — S3 소득(unknown ≠ none 절대 구분)', () => {
  it('S3-a "중위소득 150% 이하" → medianRatio / 150, raw 보존', () => {
    const p = norm('S3-a');
    expect(p.income.kind).toBe('medianRatio');
    expect(p.income.maxRatio).toBe(150);
    expect(p.income.raw).toBe('중위소득 150% 이하');
  });

  it('S3-b "소득 무관" → none', () => {
    const p = norm('S3-b');
    expect(p.income.kind).toBe('none');
  });

  it('S3-c 소득 텍스트 누락 → unknown (none 아님)', () => {
    const p = norm('S3-c');
    expect(p.income.kind).toBe('unknown');
    expect(p.income.kind).not.toBe('none');
  });

  it('S3-d 텍스트 있으나 숫자 없음 → unknown + raw 보존', () => {
    const p = norm('S3-d');
    expect(p.income.kind).toBe('unknown');
    expect(p.income.raw).toBe('별도 심사 후 결정');
  });

  // V1 / 수정루프1 — '무관' 부분일치가 medianRatio를 가려 소득 상한을 소실시키지 않아야 함.
  it('V1-a "소득과 무관하게 지원"(안내문) → unknown (none 오탐 차단)', () => {
    const p = normalizePolicy({ id: 'X', incomeText: '소득과 무관하게 지원' });
    expect(p.income.kind).toBe('unknown');
    expect(p.income.kind).not.toBe('none');
    expect(p.income.raw).toBe('소득과 무관하게 지원');
  });

  it('V1-b "중위소득 150% 또는 소득 무관"(혼합문) → medianRatio / 150 (상한 소실 금지)', () => {
    const p = normalizePolicy({ id: 'X', incomeText: '중위소득 150% 또는 소득 무관' });
    expect(p.income.kind).toBe('medianRatio');
    expect(p.income.maxRatio).toBe(150);
  });

  it('V1-c "소득 무관" 단독 → none (정상 무관은 유지)', () => {
    const p = normalizePolicy({ id: 'X', incomeText: '소득 무관' });
    expect(p.income.kind).toBe('none');
  });

  // safety 권고 5 — 패턴 확장 시 회귀 방지(현재 보수적으로 unknown).
  it('V1-d "150퍼센트"(중위소득 단어 없음) → unknown (회귀 고정)', () => {
    const p = normalizePolicy({ id: 'X', incomeText: '150퍼센트' });
    expect(p.income.kind).toBe('unknown');
  });

  it('V1-e "150% 이내"(중위소득 단어 없음) → unknown (회귀 고정)', () => {
    const p = normalizePolicy({ id: 'X', incomeText: '150% 이내' });
    expect(p.income.kind).toBe('unknown');
  });
});

describe('normalizePolicy — S4 지역(불명 ≠ 전국)', () => {
  it('S4-a "서울특별시" → 서울 식별 + 원문 보존', () => {
    const p = norm('S4-a');
    expect(p.regionCodes).toContain('11');
    expect(p.regionText).toBe('서울특별시');
    expect(p.isNationwide).toBe(false);
  });

  it('S4-b "서울특별시 강남구" → 서울 포함', () => {
    const p = norm('S4-b');
    expect(p.regionCodes).toContain('11');
    expect(p.regionText).toBe('서울특별시 강남구');
  });

  it('S4-c "전국" → isNationwide true', () => {
    const p = norm('S4-c');
    expect(p.isNationwide).toBe(true);
  });

  it('S4-d 지역 누락 → [] / false (보수, 전국 아님)', () => {
    const p = norm('S4-d');
    expect(p.regionCodes).toEqual([]);
    expect(p.isNationwide).toBe(false);
  });

  it('S4-e "부산광역시" → 서울(11) 미포함', () => {
    const p = norm('S4-e');
    expect(p.regionCodes).not.toContain('11');
    expect(p.isNationwide).toBe(false);
  });

  // V2 / 수정루프1 — '전국' 부분일치로 비전국 표현이 전국으로 오인되면 안 됨.
  it('V2-a "전국체전 입상자"(비전국 표현) → isNationwide false', () => {
    const p = normalizePolicy({ id: 'X', regionText: '전국체전 입상자' });
    expect(p.isNationwide).toBe(false);
  });

  it('V2-b "서울 거주, 전국체전 입상자 우대" → 서울 식별 + 전국 아님', () => {
    const p = normalizePolicy({ id: 'X', regionText: '서울 거주, 전국체전 입상자 우대' });
    expect(p.regionCodes).toContain('11');
    expect(p.isNationwide).toBe(false);
  });

  it('V2-c "전국" 단독 → isNationwide true (정상 전국은 유지)', () => {
    const p = normalizePolicy({ id: 'X', regionText: '전국' });
    expect(p.isNationwide).toBe(true);
  });

  it('V2-d "전국 청년" → isNationwide true (전국 대상 맥락 유지)', () => {
    const p = normalizePolicy({ id: 'X', regionText: '전국 청년' });
    expect(p.isNationwide).toBe(true);
  });
});

describe('normalizePolicy — S5 모집기간(파싱·보존만, 분류는 Phase 3)', () => {
  it('S5-a ISO start/end → dated + ISO 문자열', () => {
    const p = norm('S5-a');
    expect(p.recruit.kind).toBe('dated');
    expect(p.recruit.start).toBe('2026-06-01');
    expect(p.recruit.end).toBe('2026-08-31');
  });

  it('S5-b "2026.06.01~2026.08.31" → dated + ISO 추출', () => {
    const p = norm('S5-b');
    expect(p.recruit.kind).toBe('dated');
    expect(p.recruit.start).toBe('2026-06-01');
    expect(p.recruit.end).toBe('2026-08-31');
  });

  it('S5-c "상시모집" → always', () => {
    const p = norm('S5-c');
    expect(p.recruit.kind).toBe('always');
  });

  it('S5-d 모집기간 누락 → unknown', () => {
    const p = norm('S5-d');
    expect(p.recruit.kind).toBe('unknown');
    expect(p.recruit.start).toBeNull();
    expect(p.recruit.end).toBeNull();
  });

  it('S5-e 깨진 날짜 → null + unknown (Invalid Date 방어)', () => {
    const p = norm('S5-e');
    expect(p.recruit.start).toBeNull();
    expect(p.recruit.end).toBeNull();
    expect(p.recruit.kind).toBe('unknown');
  });

  it('S5-f 역전(end < start) → unknown 권장', () => {
    const p = norm('S5-f');
    expect(p.recruit.kind).toBe('unknown');
  });

  it('recruitText에 날짜 패턴도 상시 키워드도 없음 → unknown (인라인)', () => {
    const p = normalizePolicy({ id: 'X', recruitText: '추후 공지' });
    expect(p.recruit.kind).toBe('unknown');
    expect(p.recruit.start).toBeNull();
    expect(p.recruit.end).toBeNull();
  });

  it('recruitText에 단일 날짜만 → start만 dated (인라인)', () => {
    const p = normalizePolicy({ id: 'X', recruitText: '2026.06.01 부터' });
    expect(p.recruit.kind).toBe('dated');
    expect(p.recruit.start).toBe('2026-06-01');
    expect(p.recruit.end).toBeNull();
  });

  // V3 / 수정루프1 — 입력은 있었으나 파싱 실패한 경계가 dated에 가려지면 안 됨(침묵의 dated 금지).
  it('V3-a 무효 start("2026-13-99") + 유효 end("2026-08-31") → unknown (침묵의 dated 금지)', () => {
    const p = normalizePolicy({
      id: 'X',
      recruitStartText: '2026-13-99',
      recruitEndText: '2026-08-31',
    });
    expect(p.recruit.kind).toBe('unknown');
    expect(p.recruit.start).toBeNull();
    expect(p.recruit.end).toBeNull();
  });

  it('V3-b 유효 start + 무효 end → unknown (대칭)', () => {
    const p = normalizePolicy({
      id: 'X',
      recruitStartText: '2026-06-01',
      recruitEndText: '쓰레기값',
    });
    expect(p.recruit.kind).toBe('unknown');
  });

  it('V3-c recruitText 내 달력상 무효 날짜(2026.02.30~2026.03.05) → unknown (입력 있으나 파싱 실패)', () => {
    const p = normalizePolicy({ id: 'X', recruitText: '2026.02.30~2026.03.05' });
    expect(p.recruit.kind).toBe('unknown');
    expect(p.recruit.start).toBeNull();
    expect(p.recruit.end).toBeNull();
  });

  it('V3-d 단일 유효 날짜만(입력 1개, 파싱 성공) → dated (정상 단일 경계 유지)', () => {
    const p = normalizePolicy({ id: 'X', recruitText: '2026.06.01 부터' });
    expect(p.recruit.kind).toBe('dated');
    expect(p.recruit.start).toBe('2026-06-01');
    expect(p.recruit.end).toBeNull();
  });
});

describe('normalizePolicy — S6 깨진 입력 방어(throw 없음)', () => {
  it('S6-a {id:null, title:null} → 안전 기본값, throw 없음', () => {
    expect(() => norm('S6-a')).not.toThrow();
    const p = norm('S6-a');
    expect(typeof p.id).toBe('string');
    expect(typeof p.title).toBe('string');
  });

  it('S6-b 필수 키 없는 객체 → 안전 Policy 반환', () => {
    expect(() => norm('S6-b')).not.toThrow();
    const p = norm('S6-b');
    expect(typeof p.id).toBe('string');
    expect(p.income.kind).toBe('unknown');
    expect(p.regionCodes).toEqual([]);
    expect(p.isNationwide).toBe(false);
    expect(p.recruit.kind).toBe('unknown');
  });

  it('비객체/원시값/배열/undefined 입력 → throw 없이 Policy 반환 (인라인)', () => {
    const inputs: unknown[] = [null, undefined, '문자열', 42, [], true];
    for (const input of inputs) {
      expect(() => normalizePolicy(input)).not.toThrow();
      const p = normalizePolicy(input);
      expect(typeof p.id).toBe('string');
      expect(typeof p.title).toBe('string');
      expect(p.income.kind).toBe('unknown');
      expect(p.regionCodes).toEqual([]);
      expect(p.isNationwide).toBe(false);
      expect(p.recruit.kind).toBe('unknown');
      expect(p.ageMin).toBeNull();
      expect(p.ageMax).toBeNull();
    }
  });
});

describe('normalizePolicy — S7 원문/신선도(시간·I/O 없음)', () => {
  it('S7-a sourceUrl 누락 → null', () => {
    const p = norm('S7-a');
    expect(p.sourceUrl).toBeNull();
  });

  it('S7-b source 라벨 보존(mongttang) + sourceUrl 보존', () => {
    const p = norm('S7-b');
    expect(p.source).toBe('mongttang');
    expect(p.sourceUrl).toBe('https://youth.seoul.go.kr/MT-0001');
  });

  it('S1-a 정상 정책의 sourceUrl/source 보존', () => {
    const p = norm('S1-a');
    expect(p.sourceUrl).toBe('https://www.youthcenter.go.kr/policy/ON-0001');
    expect(p.source).toBe('ontong');
  });

  it('normalize는 fetchedAt/updatedAt 같은 시간 필드를 생성하지 않는다 (Phase 2 주입)', () => {
    const p = norm('S1-a') as unknown as Record<string, unknown>;
    expect(p.fetchedAt).toBeUndefined();
    expect(p.updatedAt).toBeUndefined();
  });
});
