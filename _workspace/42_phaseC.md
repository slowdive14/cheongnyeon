# Phase C 묶음 + C-C4 보안 — 리더 종합

날짜: 2026-07-06 · 팀: 인라인 구현 + 검수 2팀(code-reviewer ∥ safety-domain-auditor) · SSOT: PLAN Phase C

## 구현 (테스트 781→817, +36)

**C-R2 프로필 localStorage** — `useProfileState`에 로드/저장(로드 시 `sanitizeStoredProfile` 재검증, income 제외=하드코딩 박제 방지). App 변경 0. **브라우저 검증**: 새로고침 후 "부산광역시 · 28세" 복원.

**C-D1 훅 단위 테스트** — 초기값·patch 병합·income 보존·undefined 명시 병합·저장 왕복·오염값 차단(QA 38_qa D1 해소).

**F-④ 내 신청함** — `savedPoliciesStore`(저장/토글/재검증, MAX 100) + `useSavedPolicies` 훅 + 카드 저장 토글(Bookmark, `saved`/`onToggleSave` 옵셔널=기존 소비자 호환) + `SavedPolicies` 뷰(접힘, 출처 라벨, 제거). 위기 시 미렌더(비위기 JSX에만 존재). 자격 단정 없음("관심 표시"일 뿐).

**C-C4 보안**:
- (a) 마운트 불필요 원격 검색 제거 — 엔트리(루트+질의없음) 빈 질의 → `remoteSearch` no-op. 노드 선택 시만 concept 검색(버튼 흐름 보존).
- (b) Edge Function CORS 화이트리스트(`ALLOWED_ORIGINS` env, 미설정 시 `*` 개발기본).
- (c) IP 레이트리밋(`RATE_LIMIT_PER_MIN` 기본 40/분, 인메모리 고정창) + 과대 질의 절단(`MAX_QUERY_LEN` 500).

## 검수 (2팀, High/blocker 0)
- **code-reviewer** PASS: 4포인트 정확(atRoot 판정·CORS 차단효과·레이트리밋 경계·origin 전파 8경로). Med-1(atRoot 직접 테스트 부재)→**보강 완료**(useFunnel 3테스트). Med-2(rlBucket 메모리 단조증가)→defer(KV 하드닝 예고). Low 3 defer.
- **safety-domain-auditor** 재감사 PASS(**코드/안전 관점 공개 승인**, High 0): 위기 라우팅 최우선·레이트리밋 독립·CORS graceful·누적변경(추정고지·원문·서울출처·D-② 그라운딩·F-④ 무오도·blocked 미노출) 전부 유지. safety Med-1(저장항목+위기 조합 미검증)→**보강 완료**(crisis 테스트 B3). Low-1(no-op 계약 테스트)→**보강 완료**. Low-2(App degraded 신호 버림 → 키워드 아닌 대안 갈래로 degrade, 안전 무해)→defer.

## 최종 게이트
817 tests(54 files)·tsc 0·eslint 0. 브라우저: 프로필 영속 확인. (F-④ 저장/검색 라이브는 크레딧 degraded로 카드 미표시 — 통합 테스트가 경로 커버.)

## 운영자 후속 (공개 배포 전)
- Edge Function 재배포 + Supabase env `ALLOWED_ORIGINS=https://<vercel도메인>` (필수), `RATE_LIMIT_PER_MIN` 조정(선택).
- (d) near-dup ~450쌍 데이터 검토(운영자).
- A4 Vercel 연결 + 공개는 라이선스(서울)·크레딧 안정화 후.

## 잔여(defer)
- Med-2 rlBucket 만료 항목 정리(KV/테이블 하드닝).
- Low-2 App degraded→키워드 폴백 배선(현재 대안 갈래로 degrade, 안전 무해).
