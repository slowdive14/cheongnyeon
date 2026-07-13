# 오픈소스 사용 내역 및 라이선스 — 「요즘 어때」

> 맞춤형 청년정책 검색 서비스 「요즘 어때」가 사용한 오픈소스·외부 서비스·공공데이터의 내역과 라이선스 정리.
> 실측 근거: `package.json` 의존성 트리 전체(node_modules 373개) 스캔 + 각 패키지 `license` 필드 직접 확인(2026-07-13).
> 전체 자동 목록: `OPEN_SOURCE_full_list.csv` (373행, 패키지·버전·라이선스).

## 1. 요약

- **총 373개** 오픈소스 패키지(의존성 트리 전체) 사용 — **전부 허용형(permissive) 라이선스**.
- **copyleft(GPL·LGPL·AGPL) 0건** → 소스 공개 의무·라이선스 전염(카피레프트) 리스크 없음.
- 라이선스 분포:

  | 라이선스 | 개수 | 성격 |
  |---|---:|---|
  | MIT | 304 | 허용형(저작권 표시 유지) |
  | Apache-2.0 | 25 | 허용형(+NOTICE·특허 조항) |
  | BSD-3-Clause | 17 | 허용형 |
  | ISC | 15 | 허용형(MIT 유사) |
  | BSD-2-Clause | 8 | 허용형 |
  | MIT-0 | 1 | 허용형(표시 의무 없음) |
  | Python-2.0 | 1 | 허용형 |
  | CC-BY-4.0 | 1 | 데이터(출처 표시) |
  | 0BSD | 1 | 퍼블릭도메인 상당 |
  | **합계** | **373** | **전부 허용형** |

- 팀이 **직접 선택한 핵심 라이브러리 25종**은 §2. 그 외 348개는 이들이 끌어온 이행(transitive) 의존성이며 모두 위 표에 포함.

## 2. 직접 사용 라이브러리 (팀 선택 · npm 직접 의존성 25종)

버전은 설치 스냅샷 기준(2026-07-13).

### 2.1 프런트엔드 (실행 코드에 포함)
| 패키지 | 버전 | 라이선스 | 용도 |
|---|---|---|---|
| react | 19.2.7 | MIT | UI 라이브러리 |
| react-dom | 19.2.7 | MIT | React DOM 렌더러 |
| lucide-react | 0.460.0 | ISC | 아이콘 |
| date-fns | 4.4.0 | MIT | 날짜 처리(신선도·모집상태) |
| tailwindcss | 3.4.19 | MIT | 유틸리티 CSS |
| @supabase/supabase-js | 2.109.0 | MIT | Supabase 클라이언트(검색 호출) |
| @google/genai | 2.10.0 | Apache-2.0 | Gemini SDK(수집 배치 파싱·임베딩) |

### 2.2 빌드 · 타입 · 스타일 도구
| 패키지 | 버전 | 라이선스 | 용도 |
|---|---|---|---|
| vite | 7.3.5 | MIT | 번들러·개발 서버 |
| @vitejs/plugin-react | 4.7.0 | MIT | Vite React 플러그인 |
| typescript | 5.9.3 | Apache-2.0 | 정적 타입 |
| typescript-eslint | 8.62.0 | MIT | TS 린트 규칙 |
| eslint | 9.39.4 | MIT | 린터 |
| @eslint/js | 9.39.4 | MIT | ESLint 기본 규칙 |
| globals | 15.15.0 | MIT | 전역 식별자 정의 |
| postcss | 8.5.15 | MIT | CSS 변환 |
| autoprefixer | 10.5.0 | MIT | 벤더 프리픽스 |
| tsx | 4.22.4 | MIT | TS 스크립트 실행(수집 배치) |

### 2.3 테스트 (제품 코드 미포함 · 개발용)
| 패키지 | 버전 | 라이선스 | 용도 |
|---|---|---|---|
| vitest | 4.1.9 | MIT | 테스트 러너 |
| @vitest/coverage-v8 | 4.1.9 | MIT | 커버리지 |
| @testing-library/react | 16.3.2 | MIT | 컴포넌트 테스트 |
| @testing-library/jest-dom | 6.9.1 | MIT | DOM 매처 |
| jsdom | 25.0.1 | MIT | 브라우저 환경 시뮬레이션 |
| @types/node · @types/react · @types/react-dom | 22.20.0 · 19.2.17 · 19.2.3 | MIT | 타입 정의 |

### 2.4 웹폰트 (런타임 CDN 로드)
| 자산 | 버전 | 라이선스 | 사용 방식 |
|---|---|---|---|
| Pretendard | 1.3.9 | SIL Open Font License 1.1 (OFL-1.1) | jsDelivr CDN `@import`로 로드, 실패 시 시스템 폰트 폴백 |

## 3. 런타임 인프라 · 매니지드 서비스

우리가 코드로 번들하지 않고 **호스팅 서비스로 사용**한 구성요소. 오픈소스 엔진은 라이선스를 함께 표기.

| 구성요소 | 성격 | 라이선스 / 약관 | 용도 |
|---|---|---|---|
| Supabase | 매니지드 BaaS | 플랫폼(오픈소스 Apache-2.0 기반) | DB·인증·Edge Functions 호스팅 |
| PostgreSQL | DB 엔진(매니지드) | PostgreSQL License(허용형) | 정책 저장 |
| pgvector | Postgres 확장 | PostgreSQL License(허용형) | 임베딩 벡터 유사도 검색 |
| Deno | Edge Function 런타임 | MIT | 서버리스 검색 함수 실행 |
| Vercel | 호스팅 | 상용 서비스 약관 | 프런트·서버리스 배포 |
| GitHub Actions | CI | 상용 서비스 약관 | 정책 자동 수집 cron |

## 4. 외부 API (오픈소스 아님 — 사용 내역 고지)

| API | 제공자 | 약관 | 용도 |
|---|---|---|---|
| Gemini API (`gemini-3.5-flash`, `gemini-embedding-001`) | Google | Google APIs / Generative AI 이용약관 | 질의·정책 파싱, 혜택 요약, 임베딩 생성 |

## 5. 공공데이터 출처 (저작권 · 이용조건)

| 출처 | 제공 | 이용조건 | 상태 |
|---|---|---|---|
| 온통청년 Open API | 국무조정실 청년정책 통합플랫폼 | 공공데이터 개방 이용 | ✅ 사용 중 — 정책 원천 데이터 **2,651건(전량)** |
| 서울 청년몽땅(서울청년포털) | 서울특별시 | **이용약관 제12조③·제13조** — 배포·제3자 제공·가공 시 서울시 명시적 승인 필요 | ⛔ **일시 제외(2026-07-13)** — 승인 미취득으로 서비스에서 뺌 |

### 5.1 서울 데이터 제외 조치 (2026-07-13)

청년몽땅 이용약관상 명시적 승인 취득 전까지 **서울 데이터를 서비스에서 제외**한다.

- **수집 중단**: `ingest.yml`의 `SEOUL_INGEST`를 `''`(off)로 변경 → 신규 서울분 미수집.
- **기존 데이터 제거**: DB의 서울 정책 310건 purge 완료 → 서비스는 온통청년 2,651건만 노출.
- **♻️ 재개방(reversible)**: 서울시 승인 후 `SEOUL_INGEST='on'` + 배치 1회 실행이면 즉시 복구.
  서울 수집·정규화 코드(`seoulClient` 등)는 삭제하지 않고 보존 → 개방은 설정 한 줄.
- **효과**: 승인 없는 제3자 제공·가공·배포 리스크를 제거하면서, 승인 시 확장 경로는 유지.

## 6. 라이선스 의무 이행 방법

| 라이선스 | 의무 | 우리의 이행 |
|---|---|---|
| MIT · ISC · BSD-2/3 · MIT-0 · 0BSD | 저작권·라이선스 고지 보존(배포물에) | 배포 산출물에 `THIRD-PARTY-NOTICES` 또는 본 문서 + CSV 동봉 |
| Apache-2.0 (typescript, @google/genai 등) | NOTICE 유지, 변경 시 고지, 특허 종료 조항 준수 | 원본 그대로 사용(수정 없음), NOTICE 보존 |
| CC-BY-4.0 (caniuse-lite) | 출처 표시 | 빌드 데이터로만 사용(산출물 미포함), 목록에 출처 표기 |
| OFL-1.1 (Pretendard) | 재배포 시 OFL 고지, 폰트 단독 판매 금지, 예약명 유지 | CDN 링크 참조만(폰트 파일 재배포 안 함) → 의무 최소 |

## 7. 본 프로그램의 라이선스

- 「요즘 어때」 소스는 팀 소유의 **비공개(private) 프로젝트**(`package.json: "private": true`). 제3자 코드를 재배포하지 않음.
- 사용 오픈소스는 전부 허용형이라 서비스 배포에 법적 제약 없음(단 §5 서울 데이터 약관은 별도 검토).

## 8. 제출 형식 제안

1. **발표 슬라이드 1장**: 핵심 라이브러리 표(§2 요약) + "373개 전부 허용형, copyleft 0" 요약 — 심사용 한눈 정리.
2. **제출 문서**: 본 `OPEN_SOURCE_LICENSES.md`(또는 PDF 변환) + `OPEN_SOURCE_full_list.csv`(전체 373개).
3. **재현 방법**: `npx license-checker --summary` 또는 `npm ls --all`로 언제든 재생성 가능.
