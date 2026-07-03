import { describe, it, expect, vi } from 'vitest';
import { createRemoteSearch } from '@/data/remoteSearch';

const row = {
  id: 'p1',
  title: '청년 월세 지원',
  summary: '월세 지원',
  category: '주거',
  source: 'ontong',
  age_min: 19,
  age_max: 39,
  income: { kind: 'none', raw: null },
  region_codes: ['11'],
  region_text: '서울특별시',
  is_nationwide: false,
  recruit: { kind: 'always', start: null, end: null },
  source_url: 'https://x/p1',
  keywords: ['월세'],
  parsed: null,
  explanation: '이 정책은 관련이 있어 보여요.',
  embedding: '[0.1,0.2]',
  fetched_at: '2026-06-28T00:00:00Z',
  updated_at: '2026-06-28T00:00:00Z',
  content_hash: 'h',
};

function fakeFetch(body: unknown, ok = true) {
  return vi.fn(
    (_url: RequestInfo | URL, _init?: RequestInit): Promise<Response> =>
      Promise.resolve({ ok, json: async () => body } as unknown as Response),
  );
}

describe('createRemoteSearch', () => {
  it('성공 응답 → 행을 CachedPolicy로 매핑 + POST·anon 헤더', async () => {
    const fetchImpl = fakeFetch({ hits: [row] });
    const rs = createRemoteSearch({ fnUrl: 'https://fn/search', anonKey: 'anon', fetchImpl });
    const r = await rs.search('월세', { topK: 5, hardCategories: ['주거'] });
    expect(r.degraded).toBe(false);
    expect(r.hits).toHaveLength(1);
    expect(r.hits[0]!.id).toBe('p1');
    expect(r.hits[0]!.regionCodes).toEqual(['11']);
    expect(r.hits[0]!.explanation).toBe('이 정책은 관련이 있어 보여요.');
    const call = fetchImpl.mock.calls[0]!;
    expect(call[0]).toBe('https://fn/search');
    const init = call[1]!;
    const headers = init.headers as Record<string, string>;
    expect(init.method).toBe('POST');
    expect(headers.authorization).toBe('Bearer anon');
    expect(JSON.parse(init.body as string)).toMatchObject({ query: '월세', topK: 5, hardCategories: ['주거'] });
  });

  it('regionCode 설정 → POST body에 regionCode 포함', async () => {
    const fetchImpl = fakeFetch({ hits: [] });
    const rs = createRemoteSearch({ fnUrl: 'https://fn/search', anonKey: 'anon', fetchImpl });
    await rs.search('월세', { topK: 10, regionCode: '26' });
    const init = fetchImpl.mock.calls[0]![1]!;
    expect(JSON.parse(init.body as string)).toMatchObject({ query: '월세', regionCode: '26' });
  });

  it('regionCode 미설정 → body.regionCode = null(현 동작 신호)', async () => {
    const fetchImpl = fakeFetch({ hits: [] });
    const rs = createRemoteSearch({ fnUrl: 'https://fn/search', anonKey: 'anon', fetchImpl });
    await rs.search('월세', { topK: 10 });
    const init = fetchImpl.mock.calls[0]![1]!;
    expect(JSON.parse(init.body as string).regionCode).toBeNull();
  });

  it('빈 질의 → fetch 미호출, 빈 결과', async () => {
    const fetchImpl = fakeFetch({ hits: [] });
    const rs = createRemoteSearch({ fnUrl: 'u', anonKey: 'a', fetchImpl });
    expect(await rs.search('   ')).toEqual({ hits: [], degraded: false });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('non-ok 응답 → degraded(throw 없음)', async () => {
    const rs = createRemoteSearch({ fnUrl: 'u', anonKey: 'a', fetchImpl: fakeFetch({}, false) });
    expect(await rs.search('월세')).toEqual({ hits: [], degraded: true });
  });

  it('네트워크 throw → degraded', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('net');
    });
    const rs = createRemoteSearch({ fnUrl: 'u', anonKey: 'a', fetchImpl });
    expect(await rs.search('월세')).toEqual({ hits: [], degraded: true });
  });

  it('서버 degraded 플래그 전달(임베딩 실패 등)', async () => {
    const rs = createRemoteSearch({ fnUrl: 'u', anonKey: 'a', fetchImpl: fakeFetch({ hits: [], degraded: true }) });
    expect((await rs.search('월세')).degraded).toBe(true);
  });
});
