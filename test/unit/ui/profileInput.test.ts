import { describe, it, expect } from 'vitest';
import { sidoOptions, parseAgeInput, parseSidoCode } from '@/ui/funnel/profileInputParse';
import { SIDO_LIST } from '@/domain/parse/sido';

/**
 * 프로필 입력 순수 헬퍼(T3) — 시·도 옵션 소스 + 나이/시·도 문자열 파서.
 *
 * 안전(S5): 파서는 어떤 문자열에도 throw 없이, 음수/비정수/비수치/공백을 undefined로 정규화한다.
 *  → 도메인 isUsableAge가 review 폴백하고, UI 파서가 정수만 통과시켜 이중 방어(false-accept 없음).
 * SIDO_LIST 재사용(신규 테이블 금지) — 옵션은 sido.ts 단일 진실 원천에서 파생.
 */

describe('sidoOptions', () => {
  it("선두에 '선택 안 함'(value='') + SIDO_LIST 17개 → 길이 18", () => {
    const opts = sidoOptions();
    expect(opts).toHaveLength(18);
    expect(opts[0]).toEqual({ code: '', name: '선택 안 함' });
  });

  it('17개 시·도 코드 집합이 SIDO_LIST와 정확 일치', () => {
    const opts = sidoOptions();
    const codes = opts.slice(1).map((o) => o.code);
    const expected = ['11', '26', '27', '28', '29', '30', '31', '36', '41', '43', '44', '46', '47', '48', '50', '51', '52'];
    expect(new Set(codes)).toEqual(new Set(expected));
  });

  it('각 시·도 name이 SIDO_LIST와 매핑됨', () => {
    const opts = sidoOptions();
    for (const s of SIDO_LIST) {
      const match = opts.find((o) => o.code === s.code);
      expect(match?.name).toBe(s.name);
    }
  });

  it('코드가 유일(중복 없음)', () => {
    const codes = sidoOptions().map((o) => o.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe('parseAgeInput (보수 파서 — 정수·비음만 통과, 나머지 undefined)', () => {
  it("'' (빈칸) → undefined (미입력)", () => {
    expect(parseAgeInput('')).toBeUndefined();
  });
  it("'25' → 25", () => {
    expect(parseAgeInput('25')).toBe(25);
  });
  it("'0' → 0 (유효)", () => {
    expect(parseAgeInput('0')).toBe(0);
  });
  it("'-1' (음수) → undefined (UI 이중 방어)", () => {
    expect(parseAgeInput('-1')).toBeUndefined();
  });
  it("'34.5' (비정수) → undefined (UI는 정수만)", () => {
    expect(parseAgeInput('34.5')).toBeUndefined();
  });
  it("'abc' (비수치) → undefined", () => {
    expect(parseAgeInput('abc')).toBeUndefined();
  });
  it("'   ' (공백) → undefined", () => {
    expect(parseAgeInput('   ')).toBeUndefined();
  });
  it("'999' → 999 (상한 클램프 없음 — 비현실 나이는 도메인이 처리)", () => {
    expect(parseAgeInput('999')).toBe(999);
  });
  it("'34' 앞뒤 공백 ' 34 ' → 34 (트림)", () => {
    expect(parseAgeInput(' 34 ')).toBe(34);
  });
  it("'12abc' → undefined (부분 숫자 거부, throw 없음)", () => {
    expect(parseAgeInput('12abc')).toBeUndefined();
  });
  it('undefined 입력 → undefined (throw 없음)', () => {
    expect(parseAgeInput(undefined as unknown as string)).toBeUndefined();
  });
});

describe('parseSidoCode (유효 코드만, 나머지 undefined)', () => {
  it("'11' → '11' (유효 코드)", () => {
    expect(parseSidoCode('11')).toBe('11');
  });
  it("'' → undefined (선택 안 함)", () => {
    expect(parseSidoCode('')).toBeUndefined();
  });
  it("'99' (테이블 없는 코드) → undefined (방어)", () => {
    expect(parseSidoCode('99')).toBeUndefined();
  });
  it("'52' (전북특별자치도) → '52'", () => {
    expect(parseSidoCode('52')).toBe('52');
  });
  it('undefined 입력 → undefined (throw 없음)', () => {
    expect(parseSidoCode(undefined as unknown as string)).toBeUndefined();
  });
});
