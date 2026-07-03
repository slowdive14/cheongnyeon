# 원문 보기 링크 정확도 — 도메인 홈보다 구체 딥링크 우선

날짜: 2026-06-28 · 사용자 보고("원문보기 페이지 부정확") · TDD + 재인제스트 + 브라우저 실측

## 원인
- 어댑터 `adaptOntongItem`이 `aplyUrlAddr || refUrlAddr1 || refUrlAddr2` 순으로 **첫 비어있지 않은 값**을 씀.
- `aplyUrlAddr`가 도메인 홈(예: `https://www.bokjiro.go.kr`)으로 오면 그 범용 주소를 그대로 사용 →
  '원문 보기'가 정책 상세가 아니라 사이트 홈으로 연결.
- 원본 확인: 다수 정책은 `refUrlAddr1`에 구체 딥링크(연수구/충남/울산 상세 등) 보유. 일부(복지부 바우처)는
  세 URL 모두 도메인 홈만 보유(원본 한계).
- 참고: 온통 상세 URL `youngPlcyUnifDtl.do?bizId={plcyNo}`는 우리 20자리 plcyNo로는 홈(:8080) 302
  리다이렉트 → 구성 불가(옛 R-형 bizId 전용). 그래서 원본 URL 필드에서 최선 선택.

## 수정
- `pickSourceUrl(...urls)`: **구체 딥링크(경로>1 또는 쿼리 보유) 우선**, 없으면 첫 비어있지 않은 값.
  (`src/data/ontongClient.ts`) 테스트: 도메인홈+딥링크→딥링크 / 전부 도메인홈→첫값.
- 캐시 적용: 수정 어댑터로 재인제스트(Gemini off, 라이브) → 후보 검수 → 백업 후 교체.
  백업 `_workspace/policies.backup-20260628.json`. 새 캐시 473건(라이브 갱신, 474→473).

## 효과 (브라우저 실측)
- 전국민 마음투자/심리상담 바우처 → `mohw.go.kr/menu.es?mid=a10706040800`(구체) — 개선.
- 직업심리검사 → `work.go.kr/.../jobPsyExamIntro.do`, 2025 마음투자 → `bokjiro.../moveTWAT52011M.do?wlfareInfoId=WLF00005567` — 딥링크.
- (복지부) 바우처 → `bokjiro.go.kr`(원본이 범용만 가짐 — 데이터 한계, 어쩔 수 없음).
- 도메인홈(범용) 비율: URL 보유 356건 중 81건으로 감소.

## 게이트
- 테스트 **569 passed** · tsc 0 · vite build 성공.

## 2차 — 완전 해결: 온통청년 상세 정본 URL (plcyNo)
- 신규 plcyNo용 상세 라우트를 발견: **`/youthPolicy/ythPlcyTotalSearch/ythPlcyDetail/{plcyNo}`**
  (검색 페이지 HTML의 `_btnPlcyDetail`에서 추출. 옛 `youngPlcyUnifDtl.do?bizId=`는 신규 plcyNo로 홈 302).
- 검증: 우리 plcyNo 3건 모두 status 200(홈 리다이렉트/404 아님). plcyNo=Policy.id라 모든 정책 구성 가능.
- 어댑터: `ontongDetailUrl(plcyNo)`를 정본 원문으로(없으면 `pickSourceUrl` 폴백). 재인제스트(Gemini off).
- 효과: **470/470 정책 정본 URL, URL 없음 0**(이전 링크 없던 병역의무자·서울 고립은둔 포함). 브라우저 실측:
  결과 카드 href 모두 `.../ythPlcyDetail/{plcyNo}`. 콘솔 에러 0. 테스트 572 · build OK.
- 남은 한계: plcyNo 없는 비-온통(몽땅) 소스만 폴백 경로. 온통 정책은 보편 정확.
