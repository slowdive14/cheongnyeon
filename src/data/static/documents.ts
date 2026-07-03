/**
 * F-② 서류 사전 정적 데이터(노출은 F-⑤로 defer, R-2).
 *
 * 데이터 정확성(R-4, 안전):
 *  - 모든 레코드 issuer 필수(비어있지 않음). 지어내기 금지.
 *  - 불확실 항목(수수료·소요시간)은 값을 지어내지 않고 null → 렌더 시 "확인 필요"로.
 *  - 상식 수준만 확정 기재(등본=정부24 무료 등).
 */
export interface DocumentInfo {
  /** 고유 id(중복 금지). */
  id: string;
  /** 서류명. */
  name: string;
  /** 발급처(필수, 비어있지 않음). */
  issuer: string;
  /** 수수료(원). 무료=0, 불확실=null("확인 필요"). */
  fee: number | null;
  /** 예상 소요(분). 불확실=null. */
  estMinutes: number | null;
}

/**
 * 청년정책 신청 시 흔히 요구되는 서류. 상식 수준 확정만, 불확실은 null.
 * (정부24 온라인 발급 무료가 원칙 — 주민센터 창구 발급은 소액 유료일 수 있어 여기선 온라인 기준.)
 */
export const DOCUMENTS: readonly DocumentInfo[] = [
  { id: 'resident_copy', name: '주민등록등본', issuer: '정부24', fee: 0, estMinutes: 5 },
  { id: 'resident_abstract', name: '주민등록초본', issuer: '정부24', fee: 0, estMinutes: 5 },
  { id: 'income_cert', name: '소득금액증명', issuer: '홈택스(국세청)', fee: 0, estMinutes: 10 },
  { id: 'family_relation', name: '가족관계증명서', issuer: '전자가족관계등록시스템(대법원)', fee: 0, estMinutes: 5 },
  { id: 'health_insurance_status', name: '건강보험자격득실확인서', issuer: '국민건강보험공단', fee: 0, estMinutes: 5 },
  { id: 'health_insurance_fee', name: '건강보험료 납부확인서', issuer: '국민건강보험공단', fee: 0, estMinutes: 5 },
  { id: 'basic_cert', name: '기본증명서', issuer: '전자가족관계등록시스템(대법원)', fee: 0, estMinutes: 5 },
  { id: 'employment_cert', name: '재직증명서', issuer: '재직 회사', fee: null, estMinutes: null },
  { id: 'enrollment_cert', name: '재학증명서', issuer: '재학 학교', fee: null, estMinutes: null },
  { id: 'local_tax_payment', name: '지방세 납세증명서', issuer: '정부24', fee: 0, estMinutes: 5 },
];

const BY_ID = new Map(DOCUMENTS.map((d) => [d.id, d]));

/** id → 서류. 빈·미지 id → undefined(throw 0). */
export function getDocument(id: string | undefined | null): DocumentInfo | undefined {
  if (typeof id !== 'string' || id.length === 0) return undefined;
  return BY_ID.get(id);
}
