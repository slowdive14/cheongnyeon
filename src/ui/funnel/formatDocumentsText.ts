/**
 * F-⑤ 제출서류 발췌 포매터 — "표시 정리(줄 분리)만, 글자 불변"(그라운딩 불변).
 *
 * 철칙(글자 불변): 앞머리 기호 노이즈 제거·줄 나누기만 허용. 문자 추가·수정·재배열·요약 금지.
 *   → 세그먼트를 이어붙였을 때 의미 문자(한글·숫자·영문·원문자)는 원문과 정확히 동일해야 한다
 *     (formatDocumentsText.test.ts의 속성 테스트가 기계적으로 잠근다).
 *
 * cleanDocumentsText(도메인 가드)로 이미 걸러진 값 위에서 "표시"만 정리한다 —
 * 판단·필터·요약은 하지 않는다(원문이 최종 근거).
 *
 * 세그먼트 타입:
 *  - item   : 번호 항목(아라비아 "1." / 원문자 "①") — 숫자 부분 강조.
 *  - note   : 주석·부연(*, ※, ☞) — 작은 뮤트 글씨.
 *  - header : 대괄호/괄호 섹션 표제([필수서류], (온라인 제출) 등) — 살짝 강조.
 *  - text   : 그 외(서두·불릿 항목·발급처 등) — 보통 문단.
 */
export type DocSegmentType = 'item' | 'note' | 'header' | 'text';

export interface DocSegment {
  type: DocSegmentType;
  /** 원문 그대로의 세그먼트 텍스트(trim만 적용 — 글자 불변). */
  text: string;
}

// 앞머리 노이즈: 화살표·기하 불릿·대시·경고 이모지·공백만(첫 내용 표지 전까지 제거).
// 주석 표지(* ※ ☞)·대괄호·괄호·원문자·번호는 '내용 표지'라 제거하지 않는다(타입 판별에 필요).
// ⚠(U+26A0)·VS16(U+FE0F)·ZWJ(U+200D)는 결합문자 오탐(no-misleading-character-class) 방지 위해
// 문자 클래스가 아닌 개별 코드포인트 escape로 나열한다.
const LEADING_NOISE = new RegExp(
  // VS16(U+FE0F)·ZWJ(U+200D)는 결합/변형 문자라 클래스 밖 별도 분기로 둔다(no-misleading-character-class).
  '^(?:[\\s>\\-–—→▶►▷➤▸○●◎◇◆■□▪▫◦•‣⋅·\\u26A0]|\\uFE0F|\\u200D)+',
);

// 세그먼트 경계 표지 — 앞이 문두/공백일 때만(문장 중간 기호는 무시, 보수적).
// 마커 문자는 소비만 하고 슬라이스는 원문 인덱스로 하므로 다음 세그먼트에 그대로 남는다(글자 보존).
const BOUNDARY = new RegExp(
  '(?:^|(?<=\\s))(?:' +
    // (a) 아라비아 번호 "1. " — 1~2자리 + 마침표 + 공백(뒤 공백 필수 → "7.근로"·"정부24"·"1~6" 미분리)
    '[0-9]{1,2}\\.(?=\\s)' +
    // (a') 원문자 ①~⑳ — 뒤가 공백/한글/영문/숫자/원문자/괄호
    '|[\\u2460-\\u2473](?=[\\s가-힣A-Za-z0-9\\u2460-\\u2473(（])' +
    // (b) 주석 표지: * ※ ☞
    '|[*※☞]' +
    // (f) 대괄호 헤더: [필수서류] 등
    '|[[\\uFF3B][^\\]\\uFF3D\\r\\n]{1,24}[\\]\\uFF3D]' +
    // (f') 괄호 헤더: (온라인 제출)·(발급 후 업로드) — 제출/업로드 키워드 포함 시만(오탐 방지)
    '|[（(][^)）\\r\\n]{0,15}(?:제출|업로드)[)）]' +
    // (d) 대시 + 발급처
    '|[-–—]\\s*(?:온라인)?발급처' +
    // (d') 대시 + (필수)/(선택) 라벨
    '|[-–—]\\s*[（(](?:필수|선택)[)）]' +
    // (c) 기하 불릿: ○ ● ■ ▪ ⋅ 등(+ 이모지 VS16) — 뒤가 공백/한글/영문/숫자
    '|[○●◎◇◆■□▪▫◦•‣⋅▶►▷➤]\\uFE0F?(?=[\\s가-힣A-Za-z0-9])' +
    // (c') 줄머리 ㅇ 불릿(U+3147) — 공백 없이 한글에 붙는 실데이터(부산 케이스)
    '|ㅇ(?=[가-힣])' +
    ')',
  'g',
);

// 의미 문자(한글·숫자·영문·원문자) 보유 여부 — 없으면 기호만 남은 세그먼트라 버린다.
const MEANINGFUL = /[가-힣0-9A-Za-z①-⑳]/;

/** 한 줄을 경계 표지 앞에서 자른다. 마커 문자는 잘린 조각의 앞에 그대로 남는다. */
function splitLine(line: string): string[] {
  const cuts: number[] = [];
  BOUNDARY.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = BOUNDARY.exec(line)) !== null) {
    cuts.push(m.index);
    if (BOUNDARY.lastIndex === m.index) BOUNDARY.lastIndex++; // 제로폭 방지
  }
  const bounds = cuts.length > 0 && cuts[0] === 0 ? cuts : [0, ...cuts];
  const pieces: string[] = [];
  for (let i = 0; i < bounds.length; i++) {
    const start = bounds[i];
    const end = i + 1 < bounds.length ? bounds[i + 1] : line.length;
    pieces.push(line.slice(start, end));
  }
  return pieces;
}

/** trim된 세그먼트 텍스트의 타입 판별(선두 문자 기준). */
function classify(text: string): DocSegmentType {
  if (/^(?:[0-9]{1,2}\.|[①-⑳])/.test(text)) return 'item';
  if (/^[*※☞]/.test(text)) return 'note';
  if (/^[[［]/.test(text)) return 'header';
  if (/^[（(][^)）]*(?:제출|업로드)[)）]/.test(text)) return 'header';
  return 'text';
}

/**
 * 원문 발췌 → 세그먼트 배열. 표시 정리(앞머리 노이즈 제거·줄 분리)만 수행하고 글자는 보존한다.
 * 세그먼트가 1개뿐(구조 표지 없음)이면 카드는 현행처럼 문단 하나로 렌더한다.
 */
export function formatDocumentsText(raw: string | null | undefined): DocSegment[] {
  if (typeof raw !== 'string') return [];
  const stripped = raw.replace(LEADING_NOISE, '');
  if (stripped.trim().length === 0) return [];

  const out: DocSegment[] = [];
  for (const line of stripped.split(/\r\n|\r|\n/)) {
    for (const piece of splitLine(line)) {
      const text = piece.trim();
      if (!MEANINGFUL.test(text)) continue; // 기호만 남은 조각 버림(의미 문자 없음)
      out.push({ type: classify(text), text });
    }
  }
  return out;
}
