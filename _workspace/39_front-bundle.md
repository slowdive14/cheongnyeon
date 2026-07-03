# 프론트 묶음 (D-① 자격 체크리스트 + E UI 리디자인 + F-①②③) — 리더 종합

날짜: 2026-07-02 · 팀: planner → tdd-implementer → reviewer ∥ safety-auditor ∥ qa · SSOT: 루트 DESIGN.md

## 구현 (12작업, 테스트 669→755)
- **D-①**: `EvaluatedPolicy.axes?`(축별 verdict, 버킷 계약 무변경) + `policyChecklist.ts`(✓ pass "충족(추정)" / ? review "원문에서 확인") + "왜 맞을까요" prose 표시·호출 정지(정의 export 보존 → D-② 재배선).
- **E**: DESIGN §2 토큰 tailwind 등록(hex 잔존 0)·Pretendard(CDN+폴백)·프로필 알약(펼침)·말풍선 칩+아이콘·카피 전환 전체(§5 13행)·헤드라인 실개수 N. 신선도 라인은 실데이터 없어 제외(거짓 숫자 금지).
- **F-①**: "신청 페이지 열기 (온통청년)" + 브리지. **F-②**: documents.ts 10종(노출은 F-⑤ 인계). **F-③**: youthCenters.ts(phone/centerName 전량 null — 날조 금지, 운영자 검증 대기) + YouthCenterLink(결과 섹션 하단 1회).
- 리더 확정 Q-1~Q-4: soon="곧 신청이 열려요"(DESIGN 선반영)·sido명 매핑·explain 호출 정지·동행 블록 섹션 하단.

## 검수 (3팀 전원 승인)
- code-reviewer: **H-1** 알약 Enter 이중 토글(커스텀 keydown+네이티브 click 상쇄 — jsdom 오탐) → **리더 수정**: 핸들러 제거(네이티브 시맨틱 위임) + H-1 회귀 테스트 2건 교체. Med 3 defer(M-1 카피 공백→QA Low-1과 함께 DESIGN 정정으로 해소, M-2 라벨/체크리스트 이원 소스, M-3 reasons/axes 중복).
- safety-auditor: High/Med 0. 위기 불변식(적대적 주입)·3표면 문구 불변·단정 0·라벨 의미 1:1·날조 0·브리지 정합. Low 2(L-1 "(온통청년)" 라벨-origin, L-2 주석 오타).
- integration-qa: 경계면 5/5 정합·카피 13행 불일치 0·게이트 전종(플레이키 3회 0·커버리지 임계·audit 신규 0). Low-1 DESIGN "OO청년센터" 표기 → DESIGN.md "OO 청년센터"로 정정 완료.

## 라이브 검증 (브라우저)
- 메인: 크림톤·"요즘 어때요?"·알약·말풍선 칩. **발견·수정 2건**: (1) html 배경 투명 → 크림 고정(index.css), (2) "나이 나이 무관" 중복 → "나이 제한 없음(추정)"(policyChecklist).
- 검색(부산·25 "월세"): "상황에 맞을 만한 5개를 찾았어요", 배지("지금 바로 신청돼요"/"거의 다 왔어요 — 나이 조건만 확인"), 체크리스트 ✓/?, prose 제거, 동행 블록+브리지, 추정 고지 유지.
- 위기 "죽고 싶어": 배너(109·1577-0199) 단독, 신규 UI 전량 미렌더.
- 알약 click 토글 실브라우저 확인(Enter는 네이티브 시맨틱 위임으로 구조 해결).

## 최종 게이트
755 tests(49 files)·tsc 0·eslint 0·build ✓ (H-1·문구 수정 반영 후 재실행).

## 잔여 (defer)
- M-2 배지 등급 라벨 ↔ 체크리스트 문구 이원 소스(드리프트 위험) — D-② 때 단일화 검토.
- L-1 원문 버튼 "(온통청년)" 라벨 — 서울 소스(Phase B) 유입 시 origin별 라벨로.
- youthCenters phone/centerName 운영자 검증 입력 대기(입력 시 UI 자동 노출).
- F-⑤(로드맵)에서 documents.ts 노출 배선.
