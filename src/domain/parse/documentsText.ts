/**
 * 제출서류 원문 정제(F-⑤) — 온통·서울 어댑터 공용 SSOT 노이즈 가드.
 * 통과 시 원문 그대로(trim) 반환 — 가공·요약·날조 금지(카드는 이 문자를 그대로 발췌).
 *
 * null 처리(펼침 미노출 — "없는 게 낫다") 기준:
 *  1. 한글 2자 미만 — "--> --> -" 같은 화살표·대시 쓰레기값(서울 실데이터 확인, 2026-07-11).
 *  2. 저정보 토큰 — "해당없음"·"없음"·"별도 공지" 등(정보 0).
 *  3. 무정보 상용구 — "☞ 자세한 내용은 붙임파일을 확인해주시기 바랍니다"(온통 실측 다수):
 *     서류 정보가 아니라 안내문이라 그대로 발췌하면 수십 카드가 같은 문구를 펼친다
 *     ("모든 카드 동일 내용" 재발 방지). 단 실제 서류 명사가 함께 있거나 100자를 넘는
 *     긴 텍스트는 유지(보수 — 유효 원문 과차단 방지).
 */
export function cleanDocumentsText(text: string | undefined | null): string | null {
  if (typeof text !== 'string') return null;
  const t = text.trim();
  if (t.length === 0) return null;

  // 1) 한글 2자 미만 → 쓰레기값.
  const hangul = t.match(/[가-힣]/g);
  if (!hangul || hangul.length < 2) return null;

  // 2) 저정보 토큰(기호·공백 제거 후 완전 일치만 — 부분 포함은 유지).
  const compact = t.replace(/[\s☞→▶►※·.\-~()]/g, '');
  if (/^(해당없음|없음|해당사항없음|별도공지|추후공지|추후안내)$/.test(compact)) return null;

  // 3) 무정보 상용구: 붙임/첨부 안내뿐이고 서류 명사가 전혀 없으며 짧은 문구.
  const mentionsAttachment = /(붙임|첨부)\s*(파일|문서)?/.test(t) && /(확인|참고|바랍니다)/.test(t);
  const hasDocumentNoun = /(서류|증명|등본|초본|신청서|동의서|확인서|통장|사본|증빙|카드|자료)/.test(t);
  if (mentionsAttachment && !hasDocumentNoun && t.length <= 100) return null;

  return t;
}
