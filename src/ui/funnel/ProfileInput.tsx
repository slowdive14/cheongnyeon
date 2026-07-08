import { useCallback, useMemo, useState } from 'react';
import { Pencil } from 'lucide-react';
import { sidoOptions, parseAgeInput, parseSidoCode } from '@/ui/funnel/profileInputParse';
import { sidoNameByPrefix } from '@/domain/parse/sido';

/**
 * 프로필 입력(T-E2 리디자인) — 요약 알약 1개 + 탭 시 시·도/나이 펼침. controlled(부모가 상태 소유).
 *
 * DESIGN §4: 서식 2칸 상시 노출 금지 → 알약 접힘이 기본, 탭으로 펼친다.
 *
 * 안전 불변식(엄수):
 *  - 나이 입력의 음수/비정수/비수치는 parseAgeInput 경유로 age=undefined 정규화(S5 이중 방어).
 *  - '선택 안 함'(빈 문자열)·미지 코드는 regionCode=undefined → regionAxis가 보수 review 판정.
 *  - 미입력=보수 판정 유지.
 *
 * 접근성: 알약은 button(터치타깃 44×44, Enter/Space 펼침). 펼침 시 label↔control htmlFor/id 연결.
 */
export interface ProfileInputProps {
  regionCode?: string;
  age?: number;
  onChange: (patch: { regionCode?: string; age?: number }) => void;
}

/** 시·도명(폴백: 코드 그대로). 미지 코드도 throw 없이 표기. */
function regionSummary(regionCode?: string): string | null {
  if (typeof regionCode !== 'string' || regionCode.length === 0) return null;
  return sidoNameByPrefix(regionCode) ?? regionCode;
}

/** 요약 문구: "부산광역시 · 25세" / "부산광역시 · 나이 입력" / "지역 · 나이 입력". */
function summaryText(regionCode?: string, age?: number): string {
  const region = regionSummary(regionCode);
  const ageText = typeof age === 'number' && Number.isFinite(age) ? `${age}세` : '나이 입력';
  const regionText = region ?? '지역';
  return `${regionText} · ${ageText}`;
}

export function ProfileInput({ regionCode, age, onChange }: ProfileInputProps) {
  const [expanded, setExpanded] = useState(false);
  const options = useMemo(() => sidoOptions(), []);

  const handleRegion = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onChange({ regionCode: parseSidoCode(e.target.value) });
    },
    [onChange],
  );

  const handleAge = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange({ age: parseAgeInput(e.target.value) });
    },
    [onChange],
  );

  // Enter/Space 활성화는 <button> 네이티브 동작에 맡긴다(onClick으로 수렴).
  // 커스텀 onKeyDown 토글을 얹으면 Enter keydown 토글 + 이어지는 네이티브 click 토글이
  // 상쇄되어 실브라우저에서 알약이 안 열린다(리뷰 H-1).
  const togglePill = useCallback(() => setExpanded((v) => !v), []);

  return (
    <div data-funnel-region="profile-input">
      <div className="flex items-center gap-2">
        <button
          type="button"
          data-testid="profile-pill"
          onClick={togglePill}
          aria-expanded={expanded}
          aria-label="지역·나이 입력"
          style={{ background: 'linear-gradient(135deg,#D8F0C6,#B9E9D4)', borderColor: '#B4E0B8' }}
          className="flex min-h-[44px] items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold text-[#2F6B45] shadow-[0_3px_10px_-3px_rgba(90,163,107,.4)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-clay-500"
        >
          <span
            className="inline-flex h-2 w-2 rounded-full"
            style={{ background: '#3FA860', boxShadow: '0 0 0 3px rgba(63,168,96,.22)' }}
            aria-hidden="true"
          />
          <span>{summaryText(regionCode, age)}</span>
          <Pencil className="h-3.5 w-3.5" style={{ color: '#4E9469' }} aria-hidden="true" />
        </button>
        <span className="text-[12.5px] text-[#A2937F]">내 정보 기준으로 맞춤 추천</span>
      </div>

      {expanded ? (
        <div className="mt-2.5 grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label htmlFor="profile-region" className="text-sm font-medium text-sand-600">
              거주 지역 (시·도)
            </label>
            <select
              id="profile-region"
              value={regionCode ?? ''}
              onChange={handleRegion}
              className="w-full rounded-input border border-sand-200 bg-white px-3 py-2 text-sm focus:border-clay-500 focus:outline-none"
            >
              {options.map((o) => (
                <option key={o.code} value={o.code}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label htmlFor="profile-age" className="text-sm font-medium text-sand-600">
              나이
            </label>
            {/* type=text + inputMode=numeric: parseAgeInput이 오염값을 직접 차단(S5 이중 방어). */}
            <input
              id="profile-age"
              type="text"
              inputMode="numeric"
              value={age === undefined ? '' : String(age)}
              onChange={handleAge}
              placeholder="만 나이"
              className="w-full rounded-input border border-sand-200 px-3 py-2 text-sm focus:border-clay-500 focus:outline-none"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
