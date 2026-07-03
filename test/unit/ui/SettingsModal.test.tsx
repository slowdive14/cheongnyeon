import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsModal } from '@/ui/funnel/SettingsModal';
import { loadApiKey, saveApiKey, clearApiKey, API_KEY_STORAGE_KEY } from '@/llm/apiKeyStore';

/**
 * RED-6 (일부) — Gemini 키 설정 UI + apiKeyStore.
 *
 * 안전 불변식(엄수):
 *  - 키 입력 input은 type=password(평문 미표시).
 *  - 키는 화면·DOM에 평문 노출 0(value는 password로 마스킹, 저장 후 재표시 금지).
 *  - localStorage 저장/삭제. 키 없으면 LLM off.
 */

beforeEach(() => {
  localStorage.clear();
});

describe('apiKeyStore — 키 저장/삭제', () => {
  it('UI-5a 저장 → load로 복원, 삭제 → null', () => {
    expect(loadApiKey()).toBeNull();
    saveApiKey('AIza-secret-key');
    expect(loadApiKey()).toBe('AIza-secret-key');
    expect(localStorage.getItem(API_KEY_STORAGE_KEY)).toBe('AIza-secret-key');
    clearApiKey();
    expect(loadApiKey()).toBeNull();
  });

  it('UI-5b 빈/공백 키 저장 → 저장 안 함(off 유지)', () => {
    saveApiKey('   ');
    expect(loadApiKey()).toBeNull();
    saveApiKey('');
    expect(loadApiKey()).toBeNull();
  });
});

describe('SettingsModal — 키 설정 UI', () => {
  it('UI-6 키 입력 input은 type=password (평문 미표시)', () => {
    render(<SettingsModal open onClose={() => {}} />);
    const input = screen.getByLabelText('API 키') as HTMLInputElement;
    expect(input.type).toBe('password');
  });

  it('UI-5 저장 버튼 → localStorage 저장, 삭제 버튼 → 제거', () => {
    render(<SettingsModal open onClose={() => {}} />);
    const input = screen.getByLabelText('API 키') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'AIza-test-123' } });
    fireEvent.click(screen.getByRole('button', { name: /저장/ }));
    expect(loadApiKey()).toBe('AIza-test-123');

    fireEvent.click(screen.getByRole('button', { name: /삭제|제거/ }));
    expect(loadApiKey()).toBeNull();
  });

  it('UI-6b 저장된 키가 DOM에 평문 텍스트로 노출되지 않음', () => {
    saveApiKey('AIza-SUPER-SECRET');
    const { container } = render(<SettingsModal open onClose={() => {}} />);
    // 본문 텍스트에 키 평문이 보이면 안 됨(input value는 password 마스킹).
    expect(container.textContent).not.toContain('AIza-SUPER-SECRET');
  });

  it('UI-6c open=false → 미렌더', () => {
    render(<SettingsModal open={false} onClose={() => {}} />);
    expect(screen.queryByLabelText('API 키')).toBeNull();
  });
});
