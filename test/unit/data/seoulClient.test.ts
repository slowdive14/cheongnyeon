import { describe, it, expect, vi } from 'vitest';
import {
  createSeoulClient,
  parseSeoulListItems,
  isSeoulNativeKey,
  parseSeoulDetail,
  seoulRecruitDates,
  seoulDetailUrl,
  adaptSeoulItem,
  deriveSeoulRecruit,
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
  <li><a href="#none" class="tit txt-over1" onclick="goView('R2024112528145');">후불 기후동행카드</a></li>
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
    expect(items).toHaveLength(4);
    expect(items[0]).toEqual({ key: '20260614005400213232', title: '청년 부동산 중개보수 및 이사비 지원사업' });
    expect(items[1]).toEqual({ key: 'V202600005', title: '2026 서울 청년수당' });
    expect(items[3]).toEqual({ key: 'R2024112528145', title: '후불 기후동행카드' });
  });

  it('빈/비문자 입력 → 빈 배열(throw 금지)', () => {
    expect(parseSeoulListItems('')).toEqual([]);
    expect(parseSeoulListItems(undefined as unknown as string)).toEqual([]);
  });
});

describe('isSeoulNativeKey', () => {
  it('문자 접두(V·R)=서울 자체 수집, 순수숫자=온통 유입 제외', () => {
    expect(isSeoulNativeKey('V202600005')).toBe(true); // 청년몽땅 자체 편집
    expect(isSeoulNativeKey('R2024112528145')).toBe(true); // 서울 원천 등록(정정: 놓쳤던 형식)
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

describe('deriveSeoulRecruit — 신청기간 우선 + 운영기간 보조 마감', () => {
  it('신청기간 날짜 있음 → 그 기간(dated)', () => {
    expect(deriveSeoulRecruit('2026. 6. 1. ~ 2026. 6. 30.', '2020. 1. 1. ~ 2020. 12. 31.')).toEqual({
      startText: '2026-06-01',
      endText: '2026-06-30',
    });
  });
  it('신청기간 상시지만 운영기간이 닫힌 종료일을 가짐 → 운영기간 내 상시로 재해석(dated)', () => {
    // 상시는 '운영기간 내 상시'로 해석 — 운영이 끝났으면 마감 신호(오은폐 방지의 역방향 구멍 차단).
    expect(deriveSeoulRecruit('상시 모집', '2020. 1. 1. ~ 2020. 12. 31.')).toEqual({
      startText: '2020-01-01',
      endText: '2020-12-31',
    });
  });
  it('신청기간 날짜 없음 + 운영기간 종료일 있음 → 운영기간(끝났으면 마감 신호)', () => {
    expect(deriveSeoulRecruit(undefined, '2024. 1. 1. ~ 2024. 12. 31.')).toEqual({
      startText: '2024-01-01',
      endText: '2024-12-31',
    });
  });
  it('둘 다 날짜 없음 → 미설정(unknown 보수)', () => {
    expect(deriveSeoulRecruit('접수 방법 참조', '별도 안내')).toEqual({});
  });

  // 운영기간 거친(coarse) 종료일 폴백 — full-date 파서가 못 읽는 연.월/연도만/한쪽 물결.
  // 실증: 2023년에 끝난 사업이 "기간 불명 → 보수 노출"로 계속 검색에 잔존.
  it('사례 A: 신청 "미정" + 운영 "2023. 하반기 예정" → 연도만 → 그해 말일', () => {
    expect(deriveSeoulRecruit('미정', '2023. 하반기 예정')).toEqual({ endText: '2023-12-31' });
  });
  it('사례 B: 신청 "-" + 운영 "2023. 3. ~ 2023. 12." (종료부 연.월) → 그 달 말일', () => {
    expect(deriveSeoulRecruit('-', '2023. 3. ~ 2023. 12.')).toEqual({ endText: '2023-12-31' });
  });
  it('종료부 연.월 윤년 말일 정확: "2024. 1. ~ 2024. 2." → 2024-02-29', () => {
    expect(deriveSeoulRecruit('-', '2024. 1. ~ 2024. 2.')).toEqual({ endText: '2024-02-29' });
  });
  it('상반기 표기 → YYYY-06-30: "2023. 상반기"', () => {
    expect(deriveSeoulRecruit('-', '2023. 상반기')).toEqual({ endText: '2023-06-30' });
  });
  it('끝 열린 물결 "2026. 5. ~" → 종료일 없음(진행 중 오은폐 방지)', () => {
    expect(deriveSeoulRecruit('-', '2026. 5. ~')).toEqual({});
  });
  it('끝 열린 물결 + 부연 "2026. 5. ~ (예산 소진 시까지)" → 종료일 없음', () => {
    expect(deriveSeoulRecruit('-', '2026. 5. ~ (예산 소진 시까지)')).toEqual({});
  });
  it('종료부 full-date "~ 2026. 5. 27." → 그 날짜', () => {
    expect(deriveSeoulRecruit('-', '~ 2026. 5. 27.')).toEqual({ endText: '2026-05-27' });
  });
  it('연도 오탐 차단: 운영 "문의 1577-0199" → 종료일 없음(전화번호 배제)', () => {
    expect(deriveSeoulRecruit('-', '문의 1577-0199')).toEqual({});
  });
  it('연도 오탐 차단: 운영 "300만원 지원" → 종료일 없음(금액 배제)', () => {
    expect(deriveSeoulRecruit('-', '300만원 지원')).toEqual({});
  });
  it('운영 full-date 쌍은 현행대로(거친 파싱 개입 없음)', () => {
    expect(deriveSeoulRecruit('-', '2024. 1. 1. ~ 2024. 12. 31.')).toEqual({
      startText: '2024-01-01',
      endText: '2024-12-31',
    });
  });
  it('신청기간 거친 파싱 금지: 신청 "2023. 12." → 신청 미매칭 → 운영기간 폴백', () => {
    // 신청기간은 엄격(연.월.일). 연.월만이면 매칭 실패 → 운영기간으로 넘어감.
    expect(deriveSeoulRecruit('2023. 12.', '2024. 6. 30.')).toEqual({ endText: '2024-06-30' });
  });
  it('물결 없는 단일 연.월 → 그 달 말일: "2025. 4."', () => {
    expect(deriveSeoulRecruit('-', '2025. 4.')).toEqual({ endText: '2025-04-30' });
  });

  // H1 회귀 — 전각 물결/`-` 구분자·last-match. 시작월을 종료로 오인하면 활성 사업이 검색에서 사라짐.
  it('전각 물결 종료부 연.월: "2023. 3. ～ 2023. 12." → 2023-12-31 (시작월 오인 금지)', () => {
    expect(deriveSeoulRecruit('-', '2023. 3. ～ 2023. 12.')).toEqual({ endText: '2023-12-31' });
  });
  it('`-` 구분자 기간: "2023. 3. - 2023. 12." → last-match 뒤쪽 연.월 말일 2023-12-31', () => {
    expect(deriveSeoulRecruit('-', '2023. 3. - 2023. 12.')).toEqual({ endText: '2023-12-31' });
  });
  it('전각 물결 끝 열림: "2026. 5. ～" → 미도출(핵심 보수 불변식)', () => {
    expect(deriveSeoulRecruit('-', '2026. 5. ～')).toEqual({});
  });
  it('물결 변형(∼ U+223C) 끝 열림: "2026. 5. ∼" → 미도출', () => {
    expect(deriveSeoulRecruit('-', '2026. 5. ∼')).toEqual({});
  });
  it('물결 변형(〜 U+301C) 종료부: "2023. 3. 〜 2023. 12." → 2023-12-31', () => {
    expect(deriveSeoulRecruit('-', '2023. 3. 〜 2023. 12.')).toEqual({ endText: '2023-12-31' });
  });

  // 실증 버그(R2024062124263 "2050 청·장년마음 안아주기"): 신청 "연중 상시" + 운영 "2024. 1. ~ 12."
  //  → 2024년에 끝난 사업이 '지금 바로 신청'으로 노출. 원인 2중: ① 상시 분기가 운영기간을 안 봄,
  //  ② 종료부 "12."(연도 생략)를 거친 파서가 못 읽음. 상시=운영기간 내 상시 + 종료부 연도 상속으로 교정.
  //  종료일 도출 시 startText는 미설정(거친 파싱 관례 유지) — 구현 선택.
  it('상시 재해석: "연중 상시" + "2024. 1. ~ 12." → 종료 2024-12-31(연도 상속)', () => {
    expect(deriveSeoulRecruit('연중 상시', '2024. 1. ~ 12.')).toEqual({ endText: '2024-12-31' });
  });
  it('상시 재해석: "상시" + "2026. 1. ~ 12." → 종료 2026-12-31(진행 여부는 런타임 엔진 몫)', () => {
    expect(deriveSeoulRecruit('상시', '2026. 1. ~ 12.')).toEqual({ endText: '2026-12-31' });
  });
  it('상시 유지: "상시" + "2026. 5. ~"(끝 열림) → 종료일 미도출 → 상시(진행 중 오은폐 방지)', () => {
    expect(deriveSeoulRecruit('상시', '2026. 5. ~')).toEqual({ text: '상시' });
  });
  it('상시 유지: "상시" + 운영기간 없음(undefined) → 상시', () => {
    expect(deriveSeoulRecruit('상시', undefined)).toEqual({ text: '상시' });
  });
  it('종료부 연도 상속(월.일): "-" + "2024. 1. 5. ~ 12. 20." → 2024-12-20', () => {
    expect(deriveSeoulRecruit('-', '2024. 1. 5. ~ 12. 20.')).toEqual({ endText: '2024-12-20' });
  });
  it('해넘김 +1 보정: "-" + "2024. 11. ~ 3." → 2025-03-31(종료<시작 → 연도 +1)', () => {
    expect(deriveSeoulRecruit('-', '2024. 11. ~ 3.')).toEqual({ endText: '2025-03-31' });
  });

  // 오은폐 방지(safety High-1): 연도 상속 폴백이 종료부의 계량 숫자(명/개월/최대N)를 월로 오채택하면
  // 진행 중 상시 사업이 가짜 마감으로 완전 은폐된다. mOnly 폴백은 '날짜 형태' 숫자만 수용.
  it('오채택 차단: "상시" + "2026. 2. ~ 5명 모집" → 상시("5명"을 5월로 읽지 않음)', () => {
    expect(deriveSeoulRecruit('상시', '2026. 2. ~ 5명 모집')).toEqual({ text: '상시' });
  });
  it('오채택 차단: "상시" + "2026. 3. ~ 6개월" → 상시("6개월"을 6월로 읽지 않음)', () => {
    expect(deriveSeoulRecruit('상시', '2026. 3. ~ 6개월')).toEqual({ text: '상시' });
  });
  it('오채택 차단: "상시" + "2026. 5. ~ 소진 시(최대 100명)" → 상시("100"을 10월로 읽지 않음)', () => {
    expect(deriveSeoulRecruit('상시', '2026. 5. ~ 소진 시(최대 100명)')).toEqual({ text: '상시' });
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
    // LIST_HTML 4건 중 문자접두 3건(V·V·R) 수집, 숫자 1건 제외. 두 탭 key 중복 제거 → 3건.
    expect(items).toHaveLength(3);
    const ids = items.map((r) => (r as Record<string, unknown>).id);
    expect(ids).toContain('V202600005');
    expect(ids).toContain('V202500013');
    expect(ids).toContain('R2024112528145'); // R-접두도 수집(정정)
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
    expect(items).toHaveLength(3);
  });
});
