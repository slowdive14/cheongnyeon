import { describe, it, expect } from 'vitest';
import { formatDocumentsText, type DocSegment } from '@/ui/funnel/formatDocumentsText';

/**
 * F-⑤ 제출서류 발췌 포매터 — 표시 정리(줄 분리)만, 글자 불변.
 * 철칙: 세그먼트를 이어붙였을 때 "의미 문자"(한글·숫자·영문·원문자)는 원문과 정확히 동일해야 한다.
 * 노이즈 기호·공백만 정리 대상(추가·수정·재배열·요약 금지).
 */

// 의미 문자만 추림 — 속성 테스트의 글자 보존 잠금(기호·공백·앞머리 노이즈는 자유롭게 정리 가능).
function meaningful(s: string): string {
  return s.replace(/[^가-힣0-9A-Za-z①-⑳]/g, '');
}

function joined(segs: DocSegment[]): string {
  return segs.map((s) => s.text).join('');
}

function byType(segs: DocSegment[], type: DocSegment['type']): DocSegment[] {
  return segs.filter((s) => s.type === type);
}

// 결정적 시드 RNG(LCG) — 무작위 입력에도 글자 보존이 깨지지 않음을 기계적으로 확인.
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (1103515245 * s + 12345) >>> 0;
    return s / 0xffffffff;
  };
}

// ── 실측 6종 고정 케이스(DB 976건 조사에서 추출) ─────────────────────────
// 성동구 스크린샷 예문(아라비아 번호 7 + 주석 3 + 발급처). "1~6"·"정부24"는 미분리.
const SEONGDONG =
  '→ → ○ 제출서류: 공통: 1~6 *단기근로자일 경우 7.근로계약서 추가 제출 ' +
  '* 신청일 기준 한 달 이내 발급한 서류만 인정 *주민등록번호 반드시 가리고 제출 ' +
  '1. 주민등록표초본（최근 5년 주소변동 포함） 2. 고용보험피보험자격이력내역서（취업 여부 확인용） ' +
  '3. 가족관계증명서（상세） 4. 소득금액증명 5. 지방세 납세증명서 6. 본인명의 통장사본 ' +
  '7. 근로계약서 등（단기근로자일 경우만 제출） - 온라인발급처: 주민등록표초본（정부24）';
// 광주 이모지 불릿(▪️).
const GWANGJU = '▪️ 신청서 1부 ▪️ 개인정보 수집·이용 동의서 1부 ▪️ 통장 사본 1부';
// 속초 원문자(①②③) + ☞ 발급처 부연.
const SOKCHO = '① 신청서 ② 개인정보 제공 동의서 ③ 주민등록등본 ☞ 발급처 : 정부24';
// 고성 대괄호 헤더 + 번호 항목(필수/선택 섹션).
const GOSEONG = '[필수서류] 1. 주민등록등본 2. 가족관계증명서 3. 소득금액증명원 [선택서류] 1. 재직증명서';
// 전남 대괄호 헤더 + 대시(필수/선택) 라벨 + ⋅ 불릿.
const JEONNAM = '○ [제출서류] - (필수) ⋅ 신청서 ⋅ 개인정보 동의서 - (선택) ⋅ 경력증명서';
// 부산 ㅇ 나열(줄머리 ㅇ 불릿, 공백 없이 한글에 붙음).
const BUSAN = 'ㅇ신청서, ㅇ개인정보 동의서, ㅇ통장사본';

const REAL_SAMPLES: Array<[string, string]> = [
  ['성동구', SEONGDONG],
  ['광주', GWANGJU],
  ['속초', SOKCHO],
  ['고성', GOSEONG],
  ['전남', JEONNAM],
  ['부산', BUSAN],
];

describe('formatDocumentsText — 글자 보존(속성)', () => {
  it.each(REAL_SAMPLES)('실표본[%s] 재조합 == 원문(의미 문자 불변)', (_name, raw) => {
    const segs = formatDocumentsText(raw);
    expect(meaningful(joined(segs))).toBe(meaningful(raw));
  });

  it('무작위 입력 30종에서도 의미 문자 불변(추가·삭제·재배열 0)', () => {
    const rng = makeRng(20260712);
    const words = ['신청서', '주민등록등본', '소득금액증명', '통장사본', '동의서', '가족관계증명서'];
    const markers = ['', '1. ', '2. ', '① ', '② ', '※ ', '* ', '☞ ', '○ ', '▪️ ', 'ㅇ', '⋅ ', '- (필수) ', '[필수서류] '];
    const prefixes = ['', '→ ', '→ → ○ ', '▶ ', '⚠️ ', '   '];
    const pick = <T,>(arr: T[]): T => arr[Math.floor(rng() * arr.length)]!;
    for (let i = 0; i < 30; i++) {
      let raw = pick(prefixes);
      const n = 1 + Math.floor(rng() * 5);
      for (let k = 0; k < n; k++) {
        raw += pick(markers) + pick(words) + (rng() < 0.4 ? ' 1부' : '') + ' ';
        if (rng() < 0.3) raw += '\r\n';
      }
      const segs = formatDocumentsText(raw);
      expect(meaningful(joined(segs))).toBe(meaningful(raw));
    }
  });
});

describe('formatDocumentsText — 실표본 6종 스냅샷(개수+대표 문자열)', () => {
  it('성동구: item 7 · note 3 · 발급처 text 1(앞머리 노이즈 제거)', () => {
    const segs = formatDocumentsText(SEONGDONG);
    const items = byType(segs, 'item');
    const notes = byType(segs, 'note');
    expect(items).toHaveLength(7);
    expect(items[0]!.text).toMatch(/^1\./);
    expect(items[0]!.text).toContain('주민등록표초본');
    expect(items[6]!.text).toContain('근로계약서');
    // "7.근로계약서"(주석 안, 공백 없음)는 item으로 분리되지 않음 → item은 정확히 7개.
    expect(notes).toHaveLength(3);
    expect(notes.some((n) => n.text.includes('단기근로자'))).toBe(true);
    expect(notes.some((n) => n.text.includes('한 달 이내'))).toBe(true);
    expect(notes.some((n) => n.text.includes('주민등록번호'))).toBe(true);
    // 발급처 안내는 text 세그먼트 1개.
    const guide = byType(segs, 'text').filter((t) => t.text.includes('발급처'));
    expect(guide).toHaveLength(1);
    expect(guide[0]!.text).toContain('정부24');
    // 앞머리 "→ → ○ "는 제거되고 첫 세그먼트는 "제출서류:"로 시작.
    expect(segs[0]!.text.startsWith('제출서류')).toBe(true);
  });

  it('광주: ▪️ 불릿 3줄 분리(모두 text), 앞머리 ▪️ 제거', () => {
    const segs = formatDocumentsText(GWANGJU);
    expect(segs).toHaveLength(3);
    expect(segs.every((s) => s.type === 'text')).toBe(true);
    expect(segs[0]!.text.startsWith('신청서')).toBe(true);
    expect(segs[1]!.text).toContain('개인정보');
    expect(segs[2]!.text).toContain('통장 사본');
  });

  it('속초: 원문자 ①②③ → item 3, ☞ 발급처 → note 1(정부24 미분리)', () => {
    const segs = formatDocumentsText(SOKCHO);
    const items = byType(segs, 'item');
    const notes = byType(segs, 'note');
    expect(items).toHaveLength(3);
    expect(items[0]!.text).toMatch(/^①/);
    expect(items[2]!.text).toContain('주민등록등본');
    expect(notes).toHaveLength(1);
    expect(notes[0]!.text).toMatch(/^☞/);
    expect(notes[0]!.text).toContain('정부24');
  });

  it('고성: [필수서류]/[선택서류] header 2 + item 4', () => {
    const segs = formatDocumentsText(GOSEONG);
    const headers = byType(segs, 'header');
    const items = byType(segs, 'item');
    expect(headers).toHaveLength(2);
    expect(headers[0]!.text).toBe('[필수서류]');
    expect(headers[1]!.text).toBe('[선택서류]');
    expect(items).toHaveLength(4);
    expect(items[0]!.text).toContain('주민등록등본');
  });

  it('전남: [제출서류] header + - (필수)/- (선택) 대시 라벨 + ⋅ 불릿 분리', () => {
    const segs = formatDocumentsText(JEONNAM);
    expect(byType(segs, 'header').some((h) => h.text.includes('제출서류'))).toBe(true);
    expect(segs.some((s) => s.text === '- (필수)')).toBe(true);
    expect(segs.some((s) => s.text === '- (선택)')).toBe(true);
    expect(segs.some((s) => s.text.includes('신청서'))).toBe(true);
    expect(segs.some((s) => s.text.includes('경력증명서'))).toBe(true);
    // 각 항목이 별개 줄로 분리(가독성) — 최소 5줄.
    expect(segs.length).toBeGreaterThanOrEqual(5);
  });

  it('부산: 줄머리 ㅇ 불릿(공백 없이) 3줄 분리', () => {
    const segs = formatDocumentsText(BUSAN);
    expect(segs).toHaveLength(3);
    expect(segs.every((s) => s.type === 'text')).toBe(true);
    expect(segs[0]!.text).toBe('ㅇ신청서,');
    expect(segs[1]!.text).toContain('개인정보');
    expect(segs[2]!.text).toContain('통장사본');
  });
});

describe('formatDocumentsText — 미분리·개행·폴백 규칙', () => {
  it('"1~6"·"정부24"는 번호 항목으로 분리하지 않음(단일 세그먼트)', () => {
    const segs = formatDocumentsText('제출서류 공통 1~6 정부24 안내');
    expect(segs).toHaveLength(1);
    expect(segs[0]!.text).toContain('1~6');
    expect(segs[0]!.text).toContain('정부24');
  });

  it('원문에 이미 있는 \\r\\n·\\n 개행은 그대로 존중(줄마다 세그먼트)', () => {
    const segs = formatDocumentsText('주민등록등본 1부\r\n소득금액증명 1부\n재직증명서');
    expect(segs).toHaveLength(3);
    expect(segs.map((s) => s.text)).toEqual(['주민등록등본 1부', '소득금액증명 1부', '재직증명서']);
  });

  it('구조 표지가 없으면 세그먼트 1개(단일 문단 폴백 대상)', () => {
    expect(formatDocumentsText('주민등록등본 1부')).toHaveLength(1);
    expect(formatDocumentsText('자세한 사항은 공고문 참조')).toHaveLength(1);
  });

  it('null·빈 문자열 → 빈 배열(throw 0)', () => {
    expect(formatDocumentsText(null)).toEqual([]);
    expect(formatDocumentsText(undefined)).toEqual([]);
    expect(formatDocumentsText('   ')).toEqual([]);
  });

  it('기호만 남는 세그먼트는 버림(의미 문자 없는 조각 제거)', () => {
    const segs = formatDocumentsText('신청서 ▪️ ▪️ 동의서');
    // 사이의 빈 ▪️ 조각은 버려지고 실내용만 남음.
    expect(segs.every((s) => /[가-힣]/.test(s.text))).toBe(true);
    expect(meaningful(joined(segs))).toBe(meaningful('신청서 ▪️ ▪️ 동의서'));
  });
});
