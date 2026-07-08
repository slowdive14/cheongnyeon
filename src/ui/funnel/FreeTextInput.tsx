import { useCallback, useState } from 'react';
import { detectCrisisRegex } from '@/domain/crisisDetect';

/**
 * 자유입력 박스(1차 관문) — 실시간 layer-1 위기감지 + 전송 시 글을 검색 질의로 전달.
 *
 * 안전 불변식(엄수):
 *  1) 입력 change마다 detectCrisisRegex(동기·키 무관)를 즉시 실행 → 위기면 onCrisis(true)를
 *     같은 틱에 호출(배너 우선). 위기는 버튼을 기다리지 않는다(안전망은 항상 실시간).
 *  2) 전송 직전 위기를 재확인 → 위기면 onSubmit 진입 0(검색·생성 억제, 배너 우선).
 *  3) 비위기면 글 원문을 그대로 onSubmit(질의)로 넘긴다 — 의도는 의미검색이 포착(분류 불필요).
 *
 * ★레이어 범위 명시: 이 실시간 경로는 layer-1(정규식) 동기 단독이다. layer-2(의미 임베딩 앵커)는
 *  traverse(결과 순회) 시점의 crisisDeps로 보강한다(키 있을 때). 완곡 위기 일부는 1층에 일반화 흡수.
 */
export interface FreeTextInputProps {
  /** 실시간 위기 여부 콜백(layer-1). 위기면 컨테이너가 배너 우선. */
  onCrisis: (crisis: boolean) => void;
  /** 전송 시 글 원문을 검색 질의로 전달(위기면 미호출). */
  onSubmit: (query: string) => void;
  placeholder?: string;
}

export function FreeTextInput({
  onCrisis,
  onSubmit,
  placeholder = '예) 자취 중인데 월세가 너무 부담돼요…',
}: FreeTextInputProps) {
  const [value, setValue] = useState('');

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const text = e.target.value;
      setValue(text);
      // ── 실시간 layer-1 위기감지(동기·키 무관). 위기면 즉시 배너 우선(버튼 불필요). ──
      onCrisis(detectCrisisRegex(text).crisis);
    },
    [onCrisis],
  );

  // ── 전송 → 위기 재확인(안전). 위기면 검색 억제, 아니면 글을 질의로 전달. ──
  const submit = useCallback(() => {
    const text = value.trim();
    if (text.length === 0) return;
    const crisis = detectCrisisRegex(text).crisis;
    onCrisis(crisis);
    if (crisis) return; // 위기 → 검색/생성 진입 0.
    onSubmit(text);
  }, [value, onCrisis, onSubmit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Enter = 전송, Shift+Enter = 줄바꿈(감정 서술 다행 허용).
      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        submit();
      }
    },
    [submit],
  );

  const canSubmit = value.trim().length > 0;

  return (
    <div
      data-funnel-region="free-input"
      className="rounded-[22px] border border-[#F0E6D8] bg-white p-[18px] shadow-[0_18px_40px_-18px_rgba(160,90,50,.35),0_2px_6px_rgba(160,90,50,.06)]"
    >
      <label htmlFor="free-text-input" className="mb-2.5 block text-[13px] font-semibold text-[#9A8A78]">
        지금 내 상황
      </label>
      <textarea
        id="free-text-input"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={3}
        className="w-full resize-none border-none bg-transparent p-0 text-[16px] leading-relaxed text-ink-900 placeholder:text-[#B4A99A] focus:outline-none"
      />
      <div className="mt-4 flex items-center justify-between border-t border-[#F3EBDD] pt-3.5">
        <span className="text-xs text-[#B4A594]">Enter로 찾기 · Shift+Enter 줄바꿈</span>
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          style={{ background: canSubmit ? 'linear-gradient(135deg,#D2703F,#B84A2C)' : undefined }}
          className="inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-[15px] font-semibold text-white shadow-[0_8px_18px_-6px_rgba(184,74,44,.6)] transition disabled:cursor-not-allowed disabled:bg-sand-400 disabled:shadow-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-clay-500"
        >
          내 정책 찾기
        </button>
      </div>
    </div>
  );
}
