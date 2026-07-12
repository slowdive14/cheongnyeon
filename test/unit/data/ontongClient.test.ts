import { describe, it, expect, vi } from 'vitest';
import {
  createOntongClient,
  parseResponse,
  parseGetPlcy,
  adaptOntongItem,
  pickSourceUrl,
  ontongDetailUrl,
} from '@/data/ontongClient';

/**
 * Task 2.5 / 실 API 보정 — ontongClient (fixture/live 격리 + getPlcy 어댑터)
 * 키 없으면 fixture(2페이지 병합), 키 있으면 현행 getPlcy(JSON) → adaptOntongItem → 페이지 루프.
 */

describe('createOntongClient (fixture 모드)', () => {
  it('키 없으면 fixture 2페이지를 병합해 반환(6건)', async () => {
    const client = createOntongClient({});
    const items = await client.fetchAll();
    expect(items.length).toBe(6);
  });

  it('fixture:true 강제 시에도 fixture', async () => {
    const client = createOntongClient({ apiKey: 'KEY', fixture: true });
    const items = await client.fetchAll();
    expect(items.length).toBe(6);
  });
});

describe('createOntongClient (live getPlcy, fetch 주입)', () => {
  function plcyPage(items: unknown[], totCount: number): string {
    return JSON.stringify({ result: { pagging: { totCount }, youthPolicyList: items } });
  }

  it('페이지 수는 1페이지 totCount로 고정, 어댑팅해 누적', async () => {
    const pages = [
      plcyPage([{ plcyNo: 'A', plcyNm: 'a' }, { plcyNo: 'B', plcyNm: 'b' }], 3),
      plcyPage([{ plcyNo: 'C', plcyNm: 'c' }], 3),
    ];
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      const body = pages[call] ?? plcyPage([], 3);
      call += 1;
      return { text: async () => body } as Response;
    });
    const client = createOntongClient({ apiKey: 'KEY', fetchImpl, pageSize: 2 });
    const items = await client.fetchAll();
    expect(items).toHaveLength(3); // ceil(3/2)=2 페이지.
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect((items[0] as Record<string, unknown>).id).toBe('A');
    expect((items[0] as Record<string, unknown>).source).toBe('ontong');
  });

  it('중간 빈 페이지가 전체를 절단하지 않음(일시 실패 견고성)', async () => {
    const pages = [
      plcyPage([{ plcyNo: 'A', plcyNm: 'a' }, { plcyNo: 'B', plcyNm: 'b' }], 5),
      plcyPage([], 5), // 일시적 빈 응답.
      plcyPage([{ plcyNo: 'C', plcyNm: 'c' }, { plcyNo: 'D', plcyNm: 'd' }], 5),
    ];
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      const body = pages[call] ?? plcyPage([], 5);
      call += 1;
      return { text: async () => body } as Response;
    });
    const client = createOntongClient({ apiKey: 'KEY', fetchImpl, pageSize: 2 });
    const items = await client.fetchAll();
    // ceil(5/2)=3 페이지 전부 시도 → 빈 2페이지 건너뛰고 4건(절단 없음).
    expect(items).toHaveLength(4);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('1페이지가 비면 종료', async () => {
    const fetchImpl = vi.fn(async () => ({ text: async () => plcyPage([], 0) }) as Response);
    const client = createOntongClient({ apiKey: 'KEY', fetchImpl });
    const items = await client.fetchAll();
    expect(items).toHaveLength(0);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('parseGetPlcy', () => {
  it('정상 getPlcy → items + totCount', () => {
    const body = JSON.stringify({
      result: { pagging: { totCount: 2 }, youthPolicyList: [{ a: 1 }, { a: 2 }] },
    });
    const { items, totCount } = parseGetPlcy(body);
    expect(items).toHaveLength(2);
    expect(totCount).toBe(2);
  });

  it('비 JSON/구조 이탈 → 빈 결과(throw 금지)', () => {
    expect(parseGetPlcy('<xml/>')).toEqual({ items: [], totCount: 0 });
    expect(parseGetPlcy('{"result":{}}')).toEqual({ items: [], totCount: 0 });
  });
});

describe('adaptOntongItem (실 항목 → raw 스키마)', () => {
  const REAL = {
    plcyNo: '20260622005400213244',
    plcyNm: '청년 마음건강 심리상담 바우처',
    plcyExplnCn: '심리상담 비용을 지원',
    lclsfNm: '금융･복지･문화',
    mclsfNm: '건강',
    plcyKywdNm: '바우처',
    sprtTrgtMinAge: '19',
    sprtTrgtMaxAge: '34',
    earnCndSeCd: '0043001',
    earnEtcCn: '',
    rgtrInstCdNm: '서울특별시',
    sprvsnInstCdNm: '서울특별시 미래청년기획관',
    aplyYmd: '20260615 ~ 20260624',
    aplyUrlAddr: 'https://example.go.kr/p',
    lastMdfcnDt: '2026-06-23 13:50:23',
  };

  it('핵심 필드 매핑', () => {
    const r = adaptOntongItem(REAL);
    expect(r.id).toBe('20260622005400213244');
    expect(r.title).toBe('청년 마음건강 심리상담 바우처');
    expect(r.ageMin).toBe(19);
    expect(r.ageMax).toBe(34);
    expect(r.incomeText).toBe('소득 무관'); // 0043001
    expect(r.regionText).toBe('서울특별시');
    expect(r.recruitStartText).toBe('2026-06-15');
    expect(r.recruitEndText).toBe('2026-06-24');
    expect(r.category).toBe('마음건강'); // 강한 복합어/중분류'건강'+용어
    // 원문 = 온통청년 정책 상세 정본(plcyNo). 신청/참고 URL이 있어도 정본을 쓴다.
    expect(r.sourceUrl).toBe(
      'https://www.youthcenter.go.kr/youthPolicy/ythPlcyTotalSearch/ythPlcyDetail/20260622005400213244',
    );
    expect(r.lastModified).toBe('2026-06-23');
    expect(r.source).toBe('ontong');
  });

  it('비-마음건강은 대분류(lclsfNm)로', () => {
    const r = adaptOntongItem({ plcyNo: 'X', plcyNm: '청년 취업지원', lclsfNm: '일자리', mclsfNm: '취업' });
    expect(r.category).toBe('일자리');
  });

  it('제출서류(sbmsnDcmntCn) → documentsText 원문 통과(F-⑤)', () => {
    const r = adaptOntongItem({ ...REAL, sbmsnDcmntCn: '  주민등록등본 1부, 개인정보 제공 동의서  ' });
    // 원문 그대로(외곽 trim은 normalizePolicy가, 어댑터는 통과). 빈 값이면 undefined(섹션 미노출).
    expect(r.documentsText).toBe('주민등록등본 1부, 개인정보 제공 동의서');
  });

  it('제출서류 필드 없음/빈값 → documentsText undefined(섹션 미노출)', () => {
    expect(adaptOntongItem(REAL).documentsText).toBeUndefined();
    expect(adaptOntongItem({ ...REAL, sbmsnDcmntCn: '   ' }).documentsText).toBeUndefined();
  });

  it('무정보 상용구("붙임파일 확인") → documentsText undefined (실측 다수 — 전 카드 동일 문구 방지)', () => {
    const r = adaptOntongItem({
      ...REAL,
      sbmsnDcmntCn: '☞ 자세한 내용은 붙임파일을 확인해주시기 바랍니다',
    });
    expect(r.documentsText).toBeUndefined();
  });

  it('범용 키워드(맞춤형상담서비스)만으론 마음건강 오분류 안 함', () => {
    const r = adaptOntongItem({
      plcyNo: 'Y',
      plcyNm: '청년 창업 지원',
      lclsfNm: '일자리',
      mclsfNm: '창업',
      plcyKywdNm: '맞춤형상담서비스',
    });
    expect(r.category).toBe('일자리');
  });

  it('신청기간 불명 + 사업운영기간(bizPrdEndYmd) 종료일 → 보조 마감 신호(recruitEndText)', () => {
    const r = adaptOntongItem({
      plcyNo: 'B1',
      plcyNm: 't',
      aplyYmd: '', // 신청기간 불명
      aplyPrdSeCd: '0057001', // 상시 아님
      bizPrdBgngYmd: '20240101',
      bizPrdEndYmd: '20241231',
    });
    expect(r.recruitStartText).toBe('2024-01-01');
    expect(r.recruitEndText).toBe('2024-12-31'); // 지난 사업 → recruitStatus에서 closed로 숨김
    expect(r.recruitText).toBeUndefined();
  });

  it('상시 + 운영기간 종료일 → 운영기간을 모집창으로(상시 = "운영기간 내 상시", 2026-07-11)', () => {
    // 서울 deriveSeoulRecruit와 동일 의미 — "그 해 동안 상시"가 영구 상시로 남는 구멍 차단.
    const r = adaptOntongItem({
      plcyNo: 'B2',
      plcyNm: 't',
      aplyYmd: '',
      aplyPrdSeCd: '0057002', // 상시
      bizPrdBgngYmd: '20240101',
      bizPrdEndYmd: '20241231', // 2024년 한 해 운영 → 종료 후 closed로 숨김
    });
    expect(r.recruitStartText).toBe('2024-01-01');
    expect(r.recruitEndText).toBe('2024-12-31');
    expect(r.recruitText).toBeUndefined();
  });

  it('상시 + 운영기간 없음 → 상시 유지(진행 중 오은폐 방지 불변식)', () => {
    const r = adaptOntongItem({
      plcyNo: 'B2a',
      plcyNm: 't',
      aplyYmd: '',
      aplyPrdSeCd: '0057002',
      bizPrdEndYmd: '',
    });
    expect(r.recruitText).toBe('상시');
    expect(r.recruitEndText).toBeUndefined();
  });

  it('상시 + 미래 운영기간 → 미래 종료의 모집창(마감 전까지 노출 유지)', () => {
    const r = adaptOntongItem({
      plcyNo: 'B2b',
      plcyNm: 't',
      aplyYmd: '',
      aplyPrdSeCd: '0057002',
      bizPrdBgngYmd: '20990101',
      bizPrdEndYmd: '20991231', // 먼 미래 — recruitStatus가 now/soon으로 판정(은폐 없음)
    });
    expect(r.recruitEndText).toBe('2099-12-31');
    expect(r.recruitText).toBeUndefined();
  });

  it('신청기간 있으면 사업운영기간 무시(신청기간 우선)', () => {
    const r = adaptOntongItem({
      plcyNo: 'B3',
      plcyNm: 't',
      aplyYmd: '20260601 ~ 20260630',
      bizPrdEndYmd: '20240101',
    });
    expect(r.recruitStartText).toBe('2026-06-01');
    expect(r.recruitEndText).toBe('2026-06-30');
  });

  it('신청기간 불명 + 사업운영기간 공란 → 모집 미설정(unknown 보수)', () => {
    const r = adaptOntongItem({ plcyNo: 'B4', plcyNm: 't', aplyYmd: '', bizPrdEndYmd: '        ' });
    expect(r.recruitStartText).toBeUndefined();
    expect(r.recruitEndText).toBeUndefined();
    expect(r.recruitText).toBeUndefined();
  });

  it('소득 불명은 none으로 단정하지 않음(0043001 외)', () => {
    const r = adaptOntongItem({ plcyNo: 'Z', plcyNm: 't', earnCndSeCd: '0043002', earnEtcCn: '' });
    expect(r.incomeText).toBeUndefined(); // → normalizePolicy에서 unknown(보수)
  });

  it('원문 = 온통청년 상세 정본(plcyNo) — 신청/참고 URL 있어도 정본 우선', () => {
    const r = adaptOntongItem({
      plcyNo: '20260415005400112751',
      plcyNm: '청년 정신건강 지원',
      aplyUrlAddr: 'https://www.bokjiro.go.kr',
      refUrlAddr1: 'https://youth.incheon.go.kr/p?seq=196',
    });
    expect(r.sourceUrl).toBe(
      'https://www.youthcenter.go.kr/youthPolicy/ythPlcyTotalSearch/ythPlcyDetail/20260415005400112751',
    );
  });

  it('plcyNo 없으면 원본 URL 폴백(딥링크 우선)', () => {
    const r = adaptOntongItem({
      plcyNm: 't',
      aplyUrlAddr: 'https://www.bokjiro.go.kr',
      refUrlAddr1: 'https://x.go.kr/a/b?c=1',
    });
    expect(r.sourceUrl).toBe('https://x.go.kr/a/b?c=1');
  });
});

describe('pickSourceUrl / ontongDetailUrl', () => {
  it('pickSourceUrl: 도메인 홈보다 구체 딥링크 우선', () => {
    expect(pickSourceUrl('https://www.bokjiro.go.kr', 'https://x.go.kr/view.do?seq=196')).toBe(
      'https://x.go.kr/view.do?seq=196',
    );
  });
  it('pickSourceUrl: 모두 도메인 홈이면 첫값, 전부 비면 undefined', () => {
    expect(pickSourceUrl('https://www.bokjiro.go.kr', 'https://www.129.go.kr/')).toBe(
      'https://www.bokjiro.go.kr',
    );
    expect(pickSourceUrl('', '   ')).toBeUndefined();
  });
  it('deriveRegionText: zipCd prefix → 시·도 명칭(P2A)', () => {
    expect(adaptOntongItem({ plcyNo: 'A', plcyNm: 't', zipCd: '26110' }).regionText).toBe('부산광역시');
    expect(adaptOntongItem({ plcyNo: 'B', plcyNm: 't', zipCd: '41110,41130' }).regionText).toBe('경기도');
    expect(adaptOntongItem({ plcyNo: 'C', plcyNm: 't', zipCd: '51110' }).regionText).toBe('강원특별자치도');
  });

  it('ontongDetailUrl: plcyNo 경로 세그먼트, 빈값은 undefined', () => {
    expect(ontongDetailUrl('20250316005400210633')).toBe(
      'https://www.youthcenter.go.kr/youthPolicy/ythPlcyTotalSearch/ythPlcyDetail/20250316005400210633',
    );
    expect(ontongDetailUrl('')).toBeUndefined();
  });
});

describe('parseResponse (구 헬퍼 — 하위호환 유지)', () => {
  it('JSON 배열 직접', () => {
    expect(parseResponse('[{"id":"A"}]')).toHaveLength(1);
  });
  it('youthPolicyList 래핑', () => {
    expect(parseResponse('{"youthPolicyList":[{"id":"A"},{"id":"B"}]}')).toHaveLength(2);
  });
  it('비 JSON → 빈 배열', () => {
    expect(parseResponse('<xml></xml>')).toEqual([]);
  });
});
