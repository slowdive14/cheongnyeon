import { describe, it, expect, vi } from 'vitest';
import { ingest } from '@/data/ingest';
import type { IngestDeps, IngestClient, IngestParser } from '@/data/ingest';
import type { CachedPolicy, PolicyCache } from '@/data/cache/types';
import type { ParseResult } from '@/data/parseChunk';

import page1 from '../../../src/data/__fixtures__/ontong-policies.page1.sample.json';
import page2 from '../../../src/data/__fixtures__/ontong-policies.page2.sample.json';

/**
 * Test 2.1 — 인제스트 파이프라인 (통합)
 *
 * ingest(deps) — deps {client, parser, cache, now} 주입.
 * 직접 fetch · Date.now · I/O 금지(전부 주입으로 결정성).
 *
 * fixture 6건(2페이지):
 *  P1 ON-0001 서울 신규 / P2 ON-0002 강남구 / P3 ON-0003 부산(탈락)
 *  P4 ON-0001 중복(=P1) / P5 ON-0004 전국 / P6 ON-0005(다른 id, 같은 정규화명+기관, 서울)
 */

const NOW = '2026-06-23T00:00:00.000Z';

/** 모든 정책 raw를 2페이지에 걸쳐 반환하는 client. */
function fixtureClient(): IngestClient {
  return {
    fetchAll: vi.fn().mockResolvedValue([...page1, ...page2]),
  };
}

/** UNKNOWN-safe ParseResult를 반환하는 spy parser. */
function spyParser(): IngestParser {
  const fn = vi.fn(
    async (): Promise<ParseResult> => ({
      qualification: {
        householdSeparation: 'UNKNOWN',
        incomeCriterion: { kind: 'UNKNOWN', raw: null },
        duplicateParticipation: 'UNKNOWN',
      },
      chunks: { purpose: null, eligibility: null, application: null },
    }),
  );
  return { parseChunk: fn };
}

/** 인메모리 캐시(I/O 없음). */
function memoryCache(seed: CachedPolicy[] = []): PolicyCache & { store: CachedPolicy[] } {
  let store = [...seed];
  return {
    store,
    readAll: vi.fn(async () => [...store]),
    getByHash: vi.fn(async (h: string) => store.find((p) => p.contentHash === h) ?? null),
    getById: vi.fn(async (id: string) => store.find((p) => p.id === id) ?? null),
    writeAll: vi.fn(async (ps: CachedPolicy[]) => {
      store = [...ps];
    }),
  };
}

function deps(over: Partial<IngestDeps> = {}): IngestDeps {
  return {
    client: fixtureClient(),
    parser: spyParser(),
    cache: memoryCache(),
    now: NOW,
    ...over,
  };
}

describe('ingest pipeline', () => {
  it('페이지 병합: 2페이지 6건을 모두 수신', async () => {
    const client = fixtureClient();
    const d = deps({ client });
    await ingest(d);
    expect(client.fetchAll).toHaveBeenCalledTimes(1);
  });

  it('서울 필터: P3 부산 제외 (11 OR 전국 OR 자치구명)', async () => {
    const cache = memoryCache();
    await ingest(deps({ cache }));
    const written = await cache.readAll();
    const ids = written.map((p) => p.id);
    expect(ids).not.toContain('ON-0003');
    // 통과: ON-0001(서울), ON-0002(강남구), ON-0004(전국), ON-0005(서울)
    expect(ids).toContain('ON-0001');
    expect(ids).toContain('ON-0002');
    expect(ids).toContain('ON-0004');
    expect(ids).toContain('ON-0005');
  });

  it('1차 키 source+id 중복제거: P1=P4 병합 (ON-0001 단일)', async () => {
    const cache = memoryCache();
    await ingest(deps({ cache }));
    const written = await cache.readAll();
    expect(written.filter((p) => p.id === 'ON-0001')).toHaveLength(1);
  });

  it('동일 id 갱신: 최종수정일 최신(P4) 우선 — end 2026-09-30 채택', async () => {
    const cache = memoryCache();
    await ingest(deps({ cache }));
    const written = await cache.readAll();
    const merged = written.find((p) => p.id === 'ON-0001')!;
    expect(merged.recruit.end).toBe('2026-09-30');
  });

  it('2차 키(정규화명+기관) 동일 P6은 자동병합 금지 → 둘 다 유지 + 수동후보', async () => {
    const cache = memoryCache();
    const result = await ingest(deps({ cache }));
    const written = await cache.readAll();
    // ON-0001과 ON-0005 둘 다 존재(자동 병합되지 않음)
    expect(written.find((p) => p.id === 'ON-0001')).toBeDefined();
    expect(written.find((p) => p.id === 'ON-0005')).toBeDefined();
    expect(result.dedupeManualCandidates.length).toBeGreaterThanOrEqual(1);
  });

  it('신선도: 적재분 fetchedAt = 주입 now', async () => {
    const cache = memoryCache();
    await ingest(deps({ cache }));
    const written = await cache.readAll();
    for (const p of written) {
      expect(p.fetchedAt).toBe(NOW);
    }
  });

  it('증분: 변경 없는 정책은 parser 미호출 (spy 0회), updatedAt 보존', async () => {
    // 1차 적재
    const cache = memoryCache();
    await ingest(deps({ cache }));
    const firstWrite = await cache.readAll();
    const prevUpdatedAt = firstWrite.find((p) => p.id === 'ON-0002')!.updatedAt;

    // 2차: 동일 입력, 캐시 보유. parser는 호출되지 않아야 함.
    const parser = spyParser();
    const cache2 = memoryCache(firstWrite);
    await ingest(deps({ cache: cache2, parser, now: '2026-07-01T00:00:00.000Z' }));
    expect(parser.parseChunk).not.toHaveBeenCalled();

    const secondWrite = await cache2.readAll();
    const unchanged = secondWrite.find((p) => p.id === 'ON-0002')!;
    expect(unchanged.updatedAt).toBe(prevUpdatedAt);
  });

  it('증분 2회차(수렴): 1건만 본문 변경(수정일 동일) → 그 1건만 reparsed, 나머지 skip', async () => {
    // 1차 적재.
    const cache = memoryCache();
    const first = await ingest(deps({ cache }));
    expect(first.reparsed).toBe(first.policies.length); // 신규는 전부 파싱
    const firstWrite = await cache.readAll();

    // 2차 입력: ON-0002의 incomeText만 변경, lastModified는 그대로(발행처 미갱신 모사).
    const changedRaw = [...page1, ...page2].map((r) => {
      if ((r as { id?: string }).id === 'ON-0002') {
        return { ...r, incomeText: '중위소득 100% 이하' };
      }
      return r;
    });
    const client2: IngestClient = { fetchAll: vi.fn().mockResolvedValue(changedRaw) };
    const parser2 = spyParser();
    const cache2 = memoryCache(firstWrite);
    const second = await ingest(
      deps({ client: client2, parser: parser2, cache: cache2, now: '2026-07-01T00:00:00.000Z' }),
    );

    expect(second.reparsed).toBe(1);
    expect(parser2.parseChunk).toHaveBeenCalledTimes(1);
    // 변경분만 updatedAt 갱신, 나머지는 보존.
    const written2 = await cache2.readAll();
    const changed = written2.find((p) => p.id === 'ON-0002')!;
    const unchanged = written2.find((p) => p.id === 'ON-0004')!;
    expect(changed.updatedAt).toBe('2026-07-01T00:00:00.000Z');
    expect(unchanged.updatedAt).toBe(firstWrite.find((p) => p.id === 'ON-0004')!.updatedAt);
  });

  it('id 안정화: 무id raw 제외 + droppedNoId 카운트', async () => {
    const client: IngestClient = {
      fetchAll: vi.fn().mockResolvedValue([
        { title: '무id 정책', regionText: '서울특별시', source: 'ontong' },
        page1[0],
      ]),
    };
    const cache = memoryCache();
    const result = await ingest(deps({ client, cache }));
    expect(result.droppedNoId).toBe(1);
    const written = await cache.readAll();
    expect(written.every((p) => p.id !== 'unknown')).toBe(true);
  });

  it('동일 id 갱신: lastModified 한쪽만 있으면 정보 있는 쪽 우선', async () => {
    const client: IngestClient = {
      fetchAll: vi.fn().mockResolvedValue([
        // page1: lastModified 있음, end 8/31
        {
          id: 'ON-7001', title: '서울 정책', regionText: '서울특별시',
          recruitStartText: '2026-06-01', recruitEndText: '2026-08-31',
          lastModified: '2026-05-01', source: 'ontong',
        },
        // page2(후행): lastModified 없음, end 9/30
        {
          id: 'ON-7001', title: '서울 정책', regionText: '서울특별시',
          recruitStartText: '2026-06-01', recruitEndText: '2026-09-30',
          source: 'ontong',
        },
      ]),
    };
    const cache = memoryCache();
    await ingest(deps({ client, cache }));
    const merged = (await cache.readAll()).find((p) => p.id === 'ON-7001')!;
    // lastModified 있는 page1(8/31)이 우선
    expect(merged.recruit.end).toBe('2026-08-31');
  });

  it('비서울(식별된 지역) → droppedNonSeoul, 불명(원문 없음) → droppedUnknownRegion 구분', async () => {
    const client: IngestClient = {
      fetchAll: vi.fn().mockResolvedValue([
        { id: 'ON-8001', title: '부산', regionText: '부산광역시', source: 'ontong' },
        { id: 'ON-8002', title: '불명', source: 'ontong' },
        page1[0],
      ]),
    };
    const cache = memoryCache();
    const result = await ingest(deps({ client, cache }));
    expect(result.droppedNonSeoul).toBe(1);
    expect(result.droppedUnknownRegion).toBe(1);
  });

  it('regionScope=all → 서울필터 미적용(비서울 포함), droppedNonSeoul 0 (P2-B1)', async () => {
    const client: IngestClient = {
      fetchAll: vi.fn().mockResolvedValue([
        { id: 'ON-8001', title: '부산', regionText: '부산광역시', source: 'ontong' },
        { id: 'ON-8003', title: '서울', regionText: '서울특별시', source: 'ontong' },
      ]),
    };
    const cache = memoryCache();
    const result = await ingest(deps({ client, cache, regionScope: 'all' }));
    expect(result.droppedNonSeoul).toBe(0);
    const written = await cache.readAll();
    expect(written.find((p) => p.id === 'ON-8001')).toBeDefined(); // 부산도 적재
    expect(written.length).toBe(2);
  });

  it('explainer 주입 → 변경분에 explanation precompute 저장 (P2-B1)', async () => {
    const explain = vi.fn(async () => '입력하신 상황과 관련이 있어 보여요.');
    const cache = memoryCache();
    await ingest(deps({ cache, explainer: { explain } }));
    const written = await cache.readAll();
    expect(written.length).toBeGreaterThan(0);
    expect(written.every((p) => p.explanation === '입력하신 상황과 관련이 있어 보여요.')).toBe(true);
    expect(explain).toHaveBeenCalled();
  });

  it('D-②: forceExplain=true → 변경 없어도 굳은 설명 재생성(백필 버그 해소)', async () => {
    // 이전 스냅샷: 내용 동일(재파싱 불필요) + 이미 (구)설명 보유.
    const explain = vi.fn(async () => '월세 일부를 지원하는 정책이에요.');
    const cache0 = memoryCache();
    await ingest(deps({ cache: cache0, explainer: { explain: vi.fn(async () => '옛 설명(폴백)') } }));
    const seeded = await cache0.readAll();
    const cache = memoryCache(seeded);
    explain.mockClear();

    // forceExplain 없이: 설명 유지(재생성 안 함).
    await ingest(deps({ cache: memoryCache(seeded), explainer: { explain } }));
    expect(explain).not.toHaveBeenCalled();

    // forceExplain=true: 내용 변경 없어도 전부 재생성.
    await ingest(deps({ cache, explainer: { explain }, forceExplain: true }));
    const written = await cache.readAll();
    expect(explain).toHaveBeenCalled();
    expect(written.every((p) => p.explanation === '월세 일부를 지원하는 정책이에요.')).toBe(true);
  });

  it('embedder(배치) → 변경분 임베딩 1회 배치 호출 + vector 저장 (C1/최적화)', async () => {
    const embed = vi.fn(async (texts: string[]) => texts.map(() => [0.1, 0.2, 0.3]));
    const cache = memoryCache();
    const result = await ingest(deps({ cache, embedder: { embed } }));
    const written = await cache.readAll();
    expect(written.every((p) => Array.isArray(p.vector) && p.vector!.length === 3)).toBe(true);
    // 배치: 건당이 아니라 1회 호출, reparse 건수만큼 텍스트.
    expect(embed).toHaveBeenCalledTimes(1);
    expect(embed.mock.calls[0]![0].length).toBe(result.reparsed);
  });

  it('embedder throw → vector null로 흡수(적재 비차단), keywords는 항상 생성', async () => {
    const cache = memoryCache();
    const boom = { embed: vi.fn(async () => { throw new Error('boom'); }) };
    await ingest(deps({ cache, embedder: boom }));
    const written = await cache.readAll();
    expect(written.every((p) => p.vector === null)).toBe(true);
    expect(written.every((p) => Array.isArray(p.keywords))).toBe(true);
  });

  it('explainer 없으면 explanation null + 설명 실패(throw) 흡수', async () => {
    const cache = memoryCache();
    await ingest(deps({ cache }));
    expect((await cache.readAll()).every((p) => p.explanation === null)).toBe(true);

    // throw하는 explainer → null로 흡수(적재 비차단).
    const cache2 = memoryCache();
    const boom = { explain: vi.fn(async () => { throw new Error('boom'); }) };
    await ingest(deps({ cache: cache2, explainer: boom }));
    expect((await cache2.readAll()).every((p) => p.explanation === null)).toBe(true);
  });

  it('불명 지역 제외 + droppedUnknownRegion 카운트', async () => {
    const client: IngestClient = {
      fetchAll: vi.fn().mockResolvedValue([
        { id: 'ON-9001', title: '불명 지역', source: 'ontong' },
        page1[0],
      ]),
    };
    const cache = memoryCache();
    const result = await ingest(deps({ client, cache }));
    expect(result.droppedUnknownRegion).toBeGreaterThanOrEqual(1);
    const written = await cache.readAll();
    expect(written.find((p) => p.id === 'ON-9001')).toBeUndefined();
  });

  it('동명 자치구 오탐 차단(수렴): "부산광역시 중구" → 서울 탈락(droppedNonSeoul)', async () => {
    const client: IngestClient = {
      fetchAll: vi.fn().mockResolvedValue([
        { id: 'ON-9101', title: '부산 중구 정책', regionText: '부산광역시 중구', source: 'ontong' },
        { id: 'ON-9102', title: '대구 중구 정책', regionText: '대구광역시 중구', source: 'ontong' },
        page1[0],
      ]),
    };
    const cache = memoryCache();
    const result = await ingest(deps({ client, cache }));
    const written = await cache.readAll();
    expect(written.find((p) => p.id === 'ON-9101')).toBeUndefined();
    expect(written.find((p) => p.id === 'ON-9102')).toBeUndefined();
    expect(result.droppedNonSeoul).toBeGreaterThanOrEqual(2);
  });

  it('서울 자치구 인정(수렴): "서울특별시 중구"·"중구"(시도 토큰 없음) → 통과', async () => {
    const client: IngestClient = {
      fetchAll: vi.fn().mockResolvedValue([
        { id: 'ON-9201', title: '서울 중구', regionText: '서울특별시 중구', source: 'ontong' },
        { id: 'ON-9202', title: '중구 단독', regionText: '중구', source: 'ontong' },
      ]),
    };
    const cache = memoryCache();
    await ingest(deps({ client, cache }));
    const written = await cache.readAll();
    expect(written.find((p) => p.id === 'ON-9201')).toBeDefined();
    expect(written.find((p) => p.id === 'ON-9202')).toBeDefined();
  });
});

/**
 * Phase B — 다중 클라이언트 합류(온통 ∪ 서울). QA Should 상설 가드.
 * 서울(source='seoul-youth', V-접두 id)이 온통과 키 충돌 없이 편입되고,
 * 교차출처 동일 정책은 자동병합 없이 수동검증 후보로만 보고되는지 확인.
 */
describe('ingest pipeline — 다중 클라이언트(온통 ∪ 서울)', () => {
  const seoulRaw = [
    {
      id: 'V202600005',
      title: '2026 서울 청년수당',
      regionText: '서울특별시',
      ageText: '만19세~34세',
      source: 'seoul-youth',
      orgName: '서울특별시 청년사업담당관',
      sourceUrl: 'https://youth.seoul.go.kr/infoData/plcyInfo/view.do?plcyBizId=V202600005',
    },
    {
      id: 'V202500013',
      title: '2025 서울 청년 마음건강 지원사업',
      regionText: '서울특별시',
      category: '마음건강',
      source: 'seoul-youth',
      sourceUrl: 'https://youth.seoul.go.kr/infoData/plcyInfo/view.do?plcyBizId=V202500013',
    },
  ];

  it('서울 정책 편입(source=seoul-youth, 서울 게이트 통과) + 온통 유실 없음', async () => {
    const client: IngestClient = {
      fetchAll: vi.fn().mockResolvedValue([...page1, ...page2, ...seoulRaw]),
    };
    const cache = memoryCache();
    const result = await ingest(deps({ client, cache }));
    const written = await cache.readAll();
    // 서울 2건 편입(regionText '서울특별시' → 코드 11 → 서울 게이트 pass).
    const seoul = written.filter((p) => p.source === 'seoul-youth');
    expect(seoul.map((p) => p.id).sort()).toEqual(['V202500013', 'V202600005']);
    expect(seoul.every((p) => p.regionCodes.includes('11'))).toBe(true);
    // 온통 서울/전국 정책 유실 없음(부산 ON-0003만 서울필터 탈락 — 서울 합류와 무관).
    expect(written.some((p) => p.source === 'ontong')).toBe(true);
    expect(result.droppedNoId).toBe(0);
  });

  it('M-1: 교차출처 완전일치(정규화 제목) → 서울 억제, 정본(온통) 유지', async () => {
    // 온통에도 제목이 완전히 같은 "2026 서울 청년수당"(다른 id·source)이 있을 때.
    const ontongDup = {
      id: '20260101005400213000',
      title: '2026 서울 청년수당',
      regionText: '서울특별시',
      orgName: '서울특별시 청년사업담당관',
      source: 'ontong',
    };
    const client: IngestClient = {
      fetchAll: vi.fn().mockResolvedValue([ontongDup, ...seoulRaw]),
    };
    const cache = memoryCache();
    const result = await ingest(deps({ client, cache, regionScope: 'all' }));
    const written = await cache.readAll();
    // 정본(온통) 유지, 서울 사본(V202600005) 억제.
    expect(written.find((p) => p.id === '20260101005400213000')).toBeDefined();
    expect(written.find((p) => p.id === 'V202600005')).toBeUndefined();
    expect(result.suppressedCrossSource).toBe(1);
    // 억제되지 않은 서울 순증(마음건강)은 유지.
    expect(written.find((p) => p.id === 'V202500013')).toBeDefined();
  });

  it('M-1: 연도 변형은 억제하지 않음(신선도 보존) — "2026 X"(서울) vs "서울 청년수당"(온통) 둘 다 유지', async () => {
    // 온통은 연도 없는 구판, 서울은 연도 붙은 최신판 → 정규화 제목 불일치 → 억제 안 함.
    const ontongOld = {
      id: '20250519005400210850',
      title: '서울 청년수당',
      regionText: '서울특별시',
      source: 'ontong',
    };
    const client: IngestClient = {
      fetchAll: vi.fn().mockResolvedValue([ontongOld, ...seoulRaw]),
    };
    const cache = memoryCache();
    const result = await ingest(deps({ client, cache, regionScope: 'all' }));
    const written = await cache.readAll();
    expect(written.find((p) => p.id === '20250519005400210850')).toBeDefined();
    expect(written.find((p) => p.id === 'V202600005')).toBeDefined(); // 최신판 보존
    expect(result.suppressedCrossSource).toBe(0);
  });

  it('M-1: 정본이 없으면(순수 순증) 서울 전량 유지, 억제 0', async () => {
    const client: IngestClient = {
      fetchAll: vi.fn().mockResolvedValue([...page1, ...page2, ...seoulRaw]),
    };
    const cache = memoryCache();
    const result = await ingest(deps({ client, cache, regionScope: 'all' }));
    const written = await cache.readAll();
    // 온통 fixture에 "서울 청년수당"·"마음건강" 동명 없음 → 억제 0, 서울 2건 유지.
    expect(result.suppressedCrossSource).toBe(0);
    expect(written.filter((p) => p.source === 'seoul-youth')).toHaveLength(2);
  });
});
