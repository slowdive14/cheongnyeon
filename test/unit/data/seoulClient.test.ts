import { describe, it, expect, vi } from 'vitest';
import {
  createSeoulClient,
  parseSeoulListItems,
  isSeoulNativeKey,
  parseSeoulDetail,
  seoulRecruitDates,
  seoulDetailUrl,
  adaptSeoulItem,
} from '@/data/seoulClient';
import { normalizePolicy } from '@/domain/normalizePolicy';

/**
 * Phase B1 — 서울 청년몽땅 클라이언트(목록·상세 파싱 + 어댑터 + fetchAll 격리).
 * 근거: _workspace/40_B0_recon.md (V-접두=서울 자체, 숫자=온통 유입 원천 제외, dt/dd 상세).
 */

const LIST_HTML = `
<ul>
  <li><a href="#none" class="tit txt-over1" onclick="goView('20260614005400213232');">청년 부동산 중개보수 및 이사비 지원사업</a></li>
  <li><a href="#none" class="tit txt-over1" onclick="goView('V202600005');">2026 서울 청년수당</a></li>
  <li><a href="#none" class="tit txt-over1" onclick="goView('V202500013');">2025 서울 청년 마음건강 지원사업</a></li>
</ul>`;

const DETAIL_HTML = `
<div class="view">
  <dl>
    <dt>정책 유형</dt><dd>복지.문화</dd>
    <dt>주관 기관</dt><dd>서울특별시 청년사업담당관</dd>
    <dt>정책 소개</dt><dd>ㅇ 서울에 거주하는 만 19~34세 미취업 청년에게 활동지원금을 지급</dd>
    <dt>사업신청기간</dt><dd>2026. 5. 27.(수) 10:00 ~ 2026. 5. 29.(금) 16:00</dd>
    <dt>연령</dt><dd>만19세~34세 (출생일이 1991년 5월 1일~2007년 5월 31일인 자)</dd>
    <dt>소득</dt><dd>중위소득 150% 이하</dd>
  </dl>
</div>`;

describe('parseSeoulListItems', () => {
  it('goView onclick에서 key·title을 추출', () => {
    const items = parseSeoulListItems(LIST_HTML);
    expect(items).toHaveLength(3);
    expect(items[0]).toEqual({ key: '20260614005400213232', title: '청년 부동산 중개보수 및 이사비 지원사업' });
    expect(items[1]).toEqual({ key: 'V202600005', title: '2026 서울 청년수당' });
  });

  it('빈/비문자 입력 → 빈 배열(throw 금지)', () => {
    expect(parseSeoulListItems('')).toEqual([]);
    expect(parseSeoulListItems(undefined as unknown as string)).toEqual([]);
  });
});

describe('isSeoulNativeKey', () => {
  it('V 접두만 서울 자체(수집 대상)', () => {
    expect(isSeoulNativeKey('V202600005')).toBe(true);
    expect(isSeoulNativeKey('20260614005400213232')).toBe(false); // 온통 유입 → 제외
    expect(isSeoulNativeKey('')).toBe(false);
  });
});

describe('parseSeoulDetail', () => {
  it('dt/dd 라벨→값 맵(공백 제거 키)', () => {
    const f = parseSeoulDetail(DETAIL_HTML);
    expect(f['연령']).toBe('만19세~34세 (출생일이 1991년 5월 1일~2007년 5월 31일인 자)');
    expect(f['정책유형']).toBe('복지.문화'); // '정책 유형' → 공백 제거 키
    expect(f['주관기관']).toBe('서울특별시 청년사업담당관');
    expect(f['사업신청기간']).toContain('2026. 5. 27.');
  });

  it('빈 입력 → 빈 객체', () => {
    expect(parseSeoulDetail('')).toEqual({});
  });
});

describe('seoulRecruitDates', () => {
  it('공백·구두점 섞인 YYYY. M. D 관대 추출 → ISO', () => {
    expect(seoulRecruitDates('2026. 5. 27.(수) 10:00 ~ 2026. 5. 29.(금) 16:00')).toEqual({
      start: '2026-05-27',
      end: '2026-05-29',
    });
  });
  it('미매칭/undefined → null', () => {
    expect(seoulRecruitDates('상시 모집')).toEqual({ start: null, end: null });
    expect(seoulRecruitDates(undefined)).toEqual({ start: null, end: null });
  });
});

describe('seoulDetailUrl', () => {
  it('view.do 정본 URL(원문)', () => {
    expect(seoulDetailUrl('V202600005')).toBe(
      'https://youth.seoul.go.kr/infoData/plcyInfo/view.do?plcyBizId=V202600005',
    );
  });
});

describe('adaptSeoulItem → 공통 raw 스키마', () => {
  const fields = parseSeoulDetail(DETAIL_HTML);

  it('핵심 필드 매핑 + source=seoul-youth', () => {
    const r = adaptSeoulItem({ key: 'V202600005', title: '2026 서울 청년수당', fields });
    expect(r.id).toBe('V202600005');
    expect(r.title).toBe('2026 서울 청년수당');
    expect(r.ageText).toBe('만19세~34세'); // 출생일 괄호 제거
    expect(r.incomeText).toBe('중위소득 150% 이하');
    expect(r.regionText).toBe('서울특별시');
    expect(r.recruitStartText).toBe('2026-05-27');
    expect(r.recruitEndText).toBe('2026-05-29');
    expect(r.category).toBe('복지.문화');
    expect(r.sourceUrl).toBe(
      'https://youth.seoul.go.kr/infoData/plcyInfo/view.do?plcyBizId=V202600005',
    );
    expect(r.source).toBe('seoul-youth');
  });

  it('마음건강 제목 → category="마음건강"(하드필터 대상)', () => {
    const r = adaptSeoulItem({ key: 'V202500013', title: '2025 서울 청년 마음건강 지원사업', fields: {} });
    expect(r.category).toBe('마음건강');
  });

  it('고립·은둔 청년 → 마음건강', () => {
    const r = adaptSeoulItem({ key: 'V1', title: '서울시 고립·은둔청년 지원사업', fields: {} });
    expect(r.category).toBe('마음건강');
  });

  it('normalizePolicy로 흘려도 안전(연령·지역·모집 파싱)', () => {
    const p = normalizePolicy(adaptSeoulItem({ key: 'V202600005', title: '2026 서울 청년수당', fields }));
    expect(p.ageMin).toBe(19);
    expect(p.ageMax).toBe(34);
    expect(p.regionCodes).toContain('11'); // 서울 → 게이트 통과
    expect(p.recruit).toEqual({ kind: 'dated', start: '2026-05-27', end: '2026-05-29' });
    expect(p.source).toBe('seoul-youth');
    expect(p.sourceUrl).toContain('youth.seoul.go.kr');
  });
});

describe('createSeoulClient', () => {
  it('기본(no opts) → 빈 배열(파이프라인 무영향)', async () => {
    const items = await createSeoulClient().fetchAll();
    expect(items).toEqual([]);
  });

  it('fixture:true → 고정 샘플(2건)', async () => {
    const items = await createSeoulClient({ fixture: true }).fetchAll();
    expect(items).toHaveLength(2);
    expect((items[0] as Record<string, unknown>).source).toBe('seoul-youth');
  });

  it('live: 목록→상세 크롤, V-접두만 수집(숫자 제외), fetch 주입', async () => {
    const fetchImpl = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.includes('view.do')) return { text: async () => DETAIL_HTML } as Response;
      if (u.includes('pageIndex=1')) return { text: async () => LIST_HTML } as Response;
      return { text: async () => '<html></html>' } as Response; // 이후 페이지 빈 → 종료
    });
    const items = await createSeoulClient({
      live: true,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      requestDelayMs: 0,
      maxPages: 3,
    }).fetchAll();
    // LIST_HTML 3건 중 V-접두 2건만(숫자 1건 제외). 두 탭 모두 같은 목록이나 key 중복 제거 → 2건.
    expect(items).toHaveLength(2);
    const ids = items.map((r) => (r as Record<string, unknown>).id);
    expect(ids).toContain('V202600005');
    expect(ids).toContain('V202500013');
    expect(ids).not.toContain('20260614005400213232');
    // 상세 크롤로 UA 헤더 부착 확인
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining('view.do'),
      expect.objectContaining({ headers: expect.objectContaining({ 'User-Agent': expect.any(String) }) }),
    );
  });

  it('개별 상세 실패는 흡수(throw 금지)', async () => {
    const fetchImpl = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.includes('view.do')) throw new Error('network');
      if (u.includes('pageIndex=1')) return { text: async () => LIST_HTML } as Response;
      return { text: async () => '' } as Response;
    });
    const items = await createSeoulClient({
      live: true,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      requestDelayMs: 0,
      maxPages: 3,
    }).fetchAll();
    // 상세가 전부 실패해도 항목은 생성(빈 fields → 어댑팅), 절단 없음.
    expect(items).toHaveLength(2);
  });
});
