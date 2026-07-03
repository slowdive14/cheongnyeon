/** @type {import('tailwindcss').Config} */
// 색·폰트 토큰은 DESIGN.md §2·§3 SSOT. 컴포넌트는 토큰명만 사용(hex 직접 사용 금지).
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 바탕·텍스트 (웜 뉴트럴)
        cream: {
          50: '#FAF6EF', // 페이지 배경
          100: '#F5EFE4', // 안쪽 면
        },
        sand: {
          200: '#E8E0D3', // 헤어라인 보더
          400: '#B3AA97', // 플레이스홀더·최약 텍스트
          500: '#8A8272', // 뮤트 텍스트
          600: '#6B6558', // 세컨더리 텍스트
        },
        ink: {
          800: '#4A453C', // 본문 보조
          900: '#2C2A26', // 본문·제목
        },
        // 포인트 (클레이)
        clay: {
          50: '#FAECE7', // 옅은 강조면
          500: '#D85A30', // 주 버튼·핵심 아이콘
          700: '#993C1D', // 옅은 클레이 면 위 텍스트
          800: '#712B13',
        },
        // 상태 배지 (자격 판정 3종 + soon)
        teal: {
          50: '#E1F5EE',
          800: '#085041',
        },
        blue: {
          50: '#E6F1FB', // soon 정보성 소배지 한정
          800: '#0C447C',
        },
        amber: {
          50: '#FAEEDA',
          600: '#854F0B',
        },
        warmgray: {
          50: '#F1EFE8',
          800: '#444441',
        },
      },
      borderRadius: {
        // 카드 16~20px, 입력면 16px. 예시 칩 말풍선 꼬리는 컴포넌트에서 직접 지정.
        card: '18px',
        input: '16px',
      },
      fontFamily: {
        // Pretendard 웹폰트 + 오프라인 폴백 시스템 스택(DESIGN §3).
        sans: [
          'Pretendard',
          'Pretendard Variable',
          '-apple-system',
          'BlinkMacSystemFont',
          'system-ui',
          'Segoe UI',
          'Roboto',
          'Apple SD Gothic Neo',
          'Noto Sans KR',
          'Malgun Gothic',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};
