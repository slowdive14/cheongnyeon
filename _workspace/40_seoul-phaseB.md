# Phase B — 서울 청년몽땅 수집기 — 리더 종합

날짜: 2026-07-04 · 팀: recon→implementer→3검수 병렬 · SSOT: PLAN_ops-and-seoul-expansion.md Phase B

## 결정
사용자가 **전면 스크래퍼(안 A)** 선택. 구현.

## ⚠️ B0 숫자 정정 (2026-07-04, 사용자 지적)
초판 "순증 ≈16~40"은 오류 — 목록 `R`접두(서울 원천 정책) 294건 누락 + 크롤러 `isSeoulNativeKey`도 V만 수집하는 동일 버그. **교정**: 숫자키(온통 id)만 제외, V·R 등 문자접두 전부 수집.
프로덕션 2,638건 대조 실측: 서울 504건(V32+R294+숫자178) → **순증 ≈280건(온테마 ≈105)**. 신선도 격차 확인(청년수당 2025 vs 2026). 회귀 테스트(R키) 추가. Phase B 실익은 초판보다 훨씬 큼 — 안 A가 옳았음.

## 구현 (B1·B2, 테스트 755→773)
- **B1** `src/data/seoulClient.ts` — 목록(ctList/guList) HTML 파싱 → V-접두 키만 수집(숫자-ID=온통 유입 원천 제외) → 상세(view.do) dt/dd 파싱 → `adaptSeoulItem`(공통 raw 스키마, source='seoul-youth'). 연령/소득/모집은 텍스트를 넘겨 검증된 parse 헬퍼 재사용(연령은 출생일 괄호 앞만). 원문=view.do 정본. createSeoulClient: 기본 OFF·fixture·live(fetch 주입·레이트리밋·부분실패 흡수).
- **공용 SSOT** `src/domain/parse/mentalHealth.ts` — 마음건강 식별을 온통·서울 공유(온통에서 이관, 정규식 바이트 동일 → 회귀 0).
- **B2** `scripts/ingest.ts` — 다중 클라이언트 합류(ontong ∪ seoul), SEOUL_INGEST=on일 때만 서울 라이브. 서울 실패 try/catch 격리(온통 적재 보존).

## 라이브 검증(실사이트 스모크)
V-접두 9건 실크롤: 연령(19~34·21~23 등 정책별 상이)·region=11·모집 dated·카테고리(일자리/주거/복지)·원문 URL 전부 정상. income=unknown은 실페이지 소득 dt 부재라 보수 처리(자유텍스트는 배치 parseChunk가 처리 — 온통과 동일 경로).

## 검수 (3팀)
- **code-reviewer**: blocker/High 0. Med 5(defer) — M1 목록 정규식 변형 침묵누락(라이브 확대 전 부정 회귀 권고), M2 모집일 선행 공고일 오추출(단 역전은 parseRecruit이 unknown 강등=안전 보존), M3 연령 빈문자, M4 dt/dd 인접 가정, M5 RawPolicyInput 공용 타입.
- **safety-domain-auditor**: **High 1(H-1) → 리더 즉시 수정**. Med 2·Low 2.
  - **H-1(수정 완료)**: PolicyResultCard 원문 라벨 "(온통청년)" 하드코딩 → 서울 카드에 거짓 출처. `originLabel(policy.source)`로 분기(온통청년/청년몽땅/불명=괄호 생략) + 회귀 테스트 2건 + DESIGN.md §5 갱신.
  - M-1(defer): 교차출처 중복 카드 + 자격 상충 신호(한쪽 blocked·한쪽 review) → 표시단 억제 규칙 필요. **프로덕션 활성화 게이트**.
  - M-2(defer): 서울 lastModified 미설정 → '최종 업데이트'가 적재시각(신선도 의미 온통과 불일치).
  - 회귀 없음 확인: 위기 라우팅·마음건강 하드필터(바이트 동일)·자격 보수(unknown≠none)·부분실패 격리·blocked 미노출·추정 고지 전부 통과.
- **integration-qa**: PASS. 경계면 5/5 정합. 게이트 재현(773 tests·tsc0·eslint0·build✓·audit 신규0·플레이키0). Should: pipeline 다중클라 병합 상설 테스트 추가 권고 → **리더 반영**(2케이스: 편입+온통보존, 교차출처 수동후보 검출).

## B3 — 배치 합류(보수적 마무리)
스크래퍼 완성·검증됐으나 **프로덕션 자동 활성화 안 함**. ingest.yml에 SEOUL_INGEST 스위치 주석 준비(OFF). 
**활성화 상태**: (1) ✅ M-1 교차출처 억제 완료(`suppressCrossSourceDuplicates`: 완전일치 서울 억제·연도변형 보존·순증 무영향·테스트 3). (2) ✅ H-1 출처표기. (3) ⚠️ 라이선스 승인 **미취득**.

**2026-07-04 운영자 결정: `SEOUL_INGEST: 'on'` 활성화 (승인 전 사전 활성화, 승인 요청 후속).**
서울시 이용약관 실측(www.seoul.go.kr/member/rule/rule2.do): 제12조③(서비스 자료 영리이용·제3자 제공 금지), 제13조②(정보 지식재산권 서울시 귀속 — 수정·배포·재라이선스·상업적 이용은 명시적 승인 필요). 공공누리 개방 아님. → 승인 전 수집·재공개는 약관 위반 소지. 운영자가 리스크 인지·수용하고 사전 활성화. 승인 불발·거부 시 스위치 재차단 + 서울(source='seoul-youth') 데이터 purge 필요.

## 최종 게이트
773 tests(50 files)·tsc 0·eslint 0·build ✓ (H-1 수정·회귀·병합 테스트 반영 후).

## 잔여(defer, 활성화 전 처리)
- M-1 교차출처 중복/상충 카드 억제(권장: 서울-온통 유사쌍이면 서울 dup 억제, 순증만 유지). — 활성화 필수 선행.
- 라이선스 확인(운영자) — 활성화 필수 선행. B0 §4.
- M-2 서울 신선도(lastModified) 원천 갱신일 확보 방안.
- M1/M2/M3/M4(code-review) 라이브 스코프 확대 시 부정 회귀 테스트 보강.
