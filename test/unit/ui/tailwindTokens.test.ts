import { describe, it, expect } from 'vitest';
// @ts-expect-error — tailwind.config.js는 타입 선언 없는 설정 모듈(런타임 import).
import config from '../../../tailwind.config.js';

/**
 * T-E1 — DESIGN §2 색 토큰 + Pretendard 폰트가 tailwind.config에 등록되었는지 검증.
 * 이후 컴포넌트가 hex 직접 사용 없이 토큰명만 쓰도록(§2) 기반을 강제한다.
 */

const colors = config.theme.extend.colors as Record<string, Record<string, string> | string>;

describe('T-E1 색 토큰 (DESIGN §2)', () => {
  it('웜 뉴트럴 계열 키 존재', () => {
    expect(colors.cream).toBeDefined();
    expect(colors.sand).toBeDefined();
    expect(colors.ink).toBeDefined();
    expect(colors.clay).toBeDefined();
  });

  it('cream-50 = #FAF6EF, cream-100 = #F5EFE4', () => {
    expect((colors.cream as Record<string, string>)['50']).toBe('#FAF6EF');
    expect((colors.cream as Record<string, string>)['100']).toBe('#F5EFE4');
  });

  it('clay-500 = #D85A30 (주 버튼)', () => {
    expect((colors.clay as Record<string, string>)['500']).toBe('#D85A30');
  });

  it('sand 계열 헤어라인·텍스트 단계', () => {
    expect((colors.sand as Record<string, string>)['200']).toBe('#E8E0D3');
    expect((colors.sand as Record<string, string>)['500']).toBe('#8A8272');
  });

  it('ink 본문 단계', () => {
    expect((colors.ink as Record<string, string>)['900']).toBe('#2C2A26');
  });

  it('상태 배지 색 3종 + soon(§2)', () => {
    expect((colors.teal as Record<string, string>)['50']).toBe('#E1F5EE');
    expect((colors.teal as Record<string, string>)['800']).toBe('#085041');
    expect((colors.blue as Record<string, string>)['50']).toBe('#E6F1FB');
    expect((colors.blue as Record<string, string>)['800']).toBe('#0C447C');
    expect((colors.amber as Record<string, string>)['50']).toBe('#FAEEDA');
    expect((colors.warmgray as Record<string, string>)['50']).toBe('#F1EFE8');
  });
});

describe('T-E1 폰트', () => {
  it('fontFamily.sans[0]에 Pretendard 포함', () => {
    const sans = config.theme.extend.fontFamily.sans as string[];
    expect(sans[0]).toContain('Pretendard');
    // 오프라인 폴백(시스템 스택) 존재.
    expect(sans.length).toBeGreaterThan(1);
  });
});
