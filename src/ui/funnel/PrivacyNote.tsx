import { ShieldCheck, ChevronDown } from 'lucide-react';

/**
 * 개인정보 안내(P1) — 홈·결과 화면 공통 최하단.
 *
 * 리더 결정: 위기 화면에는 미렌더 — 배치로 보장한다(하단 공통 블록 내부에만 둔다).
 *  · 제출 위기: FunnelContainer early-return이 하단 블록째 제거.
 *  · 작성 중 위기: 하단 블록이 typingCrisis에서 null.
 *  힘든 이야기를 적는 순간에 '개인정보' 안내를 들이미는 건 말을 끊는 일이다.
 *
 * 안전·신뢰 불변식:
 *  - 축3(확신보다 정직): 저장하지 않는다는 유리한 사실만 말하지 않는다. **구글 AI로 문장이
 *    전달된다는 불리한 사실도 같은 목록에 함께** 적는다. 빠뜨리면 고지가 아니라 홍보다.
 *  - 문구는 일반 사용자 언어로만. '기기/단말/클라이언트/로컬' 같은 기술어 금지(테스트로 잠금).
 *  - role="alert" 아님(보조 안내 — SafetyBanner의 위기 우선 alert와 충돌 금지).
 *  - 순수 표시(부수효과 0·throw-free). 상태 없이 <details>로 접기(JS 없이 키보드 접근 가능).
 *
 * 사실 근거(코드와 1:1):
 *  - '적으신 글 미저장' — search Edge Function에 console 출력·DB 쓰기 0건(읽기 전용).
 *  - '위기 글 미전송' — traverse가 검색 이전에 위기 판정 후 즉시 반환(검색 호출 자체 없음).
 *  - '지역만 전송, 나이는 미전송' — 검색 요청 payload는 query·topK·hardCategories·regionCode.
 *  - '구글 전달' — Edge Function이 질의 문장을 Gemini 임베딩 API로 전송.
 */

/** 안내 항목(SSOT) — 유리/불리를 섞지 않고 사실 순서대로. */
const ITEMS: ReadonlyArray<{ title: string; body: string }> = [
  {
    title: '로그인이 없어요',
    body: '이름, 연락처, 이메일을 받지 않아요.',
  },
  {
    title: '적으신 글은 남기지 않아요',
    body: '맞는 정책을 찾는 데만 쓰고 곧바로 사라져요.',
  },
  {
    title: '많이 힘든 마음을 적으셨을 땐, 그 글이 아예 전송되지 않아요',
    body: '지금 보고 계신 화면 안에서만 확인하고, 상담 전화를 알려드려요.',
  },
  {
    title: '지역과 저장한 정책은 이 브라우저에만 남아요',
    body: '브라우저 기록을 지우면 함께 사라져요.',
  },
  {
    title: '문장의 뜻을 파악할 때 구글 AI를 써요',
    body: '그때 적으신 문장이 구글로 전달돼요. 입력하신 지역과 나이는 함께 보내지 않아요.',
  },
];

export function PrivacyNote() {
  return (
    <details
      data-testid="privacy-note"
      data-funnel-region="privacy-note"
      className="group mt-3.5 rounded-2xl border border-[#EFE7DA] bg-[#FDFAF6] px-4 py-3"
    >
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[12.5px] font-semibold text-[#8A7A68] focus-visible:outline focus-visible:outline-2 focus-visible:outline-clay-500 [&::-webkit-details-marker]:hidden">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-[#9C8B78]" aria-hidden="true" />
        적어주신 이야기는 저장하지 않아요
        <ChevronDown
          className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <ul className="mt-2.5 flex flex-col gap-2 border-t border-[#F0E8DC] pt-2.5">
        {ITEMS.map((it) => (
          <li key={it.title} className="text-[12.5px] leading-relaxed">
            <b className="font-semibold text-[#6E6054]">{it.title}</b>
            <span className="text-[#93826F]"> · {it.body}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
