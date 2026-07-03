import { useState } from 'react';
import { saveApiKey, clearApiKey, loadApiKey } from '@/llm/apiKeyStore';

/**
 * Gemini 키 설정 모달 — localStorage 키 저장/삭제(키 없으면 LLM off).
 *
 * 안전 불변식(엄수):
 *  - 입력 input은 type=password(평문 미표시).
 *  - 저장된 키를 화면에 다시 평문 표시하지 않는다(value는 항상 입력 버퍼만, 마스킹).
 *  - 키는 콘솔·DOM 텍스트로 노출 0. 저장 여부만 표시.
 */
export interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  // 입력 버퍼만 상태로(저장된 키 평문을 채워 넣지 않음 — 노출 방지).
  const [draft, setDraft] = useState('');
  const [saved, setSaved] = useState<boolean>(() => loadApiKey() !== null);

  if (!open) return null;

  const handleSave = () => {
    saveApiKey(draft);
    if (loadApiKey() !== null) setSaved(true);
    setDraft(''); // 입력 버퍼 비움(평문 잔존 방지).
  };

  const handleClear = () => {
    clearApiKey();
    setSaved(false);
    setDraft('');
  };

  return (
    <div
      data-testid="settings-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Gemini API 키 설정"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">Gemini API 키</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-slate-400 hover:text-slate-700"
            aria-label="닫기"
          >
            닫기
          </button>
        </div>

        <p className="text-xs text-slate-500">
          키를 입력하면 자유입력 해석·설명이 켜져요. 키는 이 브라우저에만 저장되며, 비우면 버튼
          흐름으로 동작합니다.
        </p>

        <div className="space-y-1">
          <label htmlFor="gemini-api-key" className="text-xs font-medium text-slate-600">
            API 키
          </label>
          <input
            id="gemini-api-key"
            type="password"
            autoComplete="off"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={saved ? '저장됨 (다시 입력해 교체)' : 'AIza...'}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none"
          />
          <p className="text-xs text-slate-400">
            {saved ? '키가 저장되어 있어요 (LLM 켜짐).' : '키 없음 — LLM 꺼짐(버튼 흐름).'}
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleSave}
            className="flex-1 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
          >
            저장
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            삭제
          </button>
        </div>
      </div>
    </div>
  );
}
