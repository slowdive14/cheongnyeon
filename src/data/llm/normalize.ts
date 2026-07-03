/**
 * 벡터 L2 정규화 (순수). gemini-embedding-001 outputDimensionality<3072(Matryoshka 축소) 산출은
 * 단위벡터가 아닐 수 있어, 코사인 일관성 위해 정규화가 필수다. 0벡터·비유한 방어.
 */
export function l2normalize(v: number[]): number[] {
  if (!Array.isArray(v) || v.length === 0) return [];
  let sum = 0;
  for (const x of v) sum += typeof x === 'number' && Number.isFinite(x) ? x * x : 0;
  const norm = Math.sqrt(sum);
  if (norm === 0 || !Number.isFinite(norm)) return v.map(() => 0);
  return v.map((x) => (typeof x === 'number' && Number.isFinite(x) ? x / norm : 0));
}
