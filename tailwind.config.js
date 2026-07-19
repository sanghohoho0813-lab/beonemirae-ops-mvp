/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 토스풍 뉴트럴 블루그레이 — 밝은 단계는 차분한 회색, 어두운 단계는 네이비 유지
        navy: {
          50: '#f4f6fa',
          100: '#eaeef3',
          200: '#d7dde6',
          300: '#aeb8c4',
          400: '#7e8a99', // 보조/캡션 텍스트용 뮤트 그레이
          500: '#5b6677',
          600: '#3a4658',
          700: '#26303f',
          800: '#18222f',
          900: '#0f1a2e',
          950: '#080f1c', // 홈페이지 다크 테마용 근-블랙 네이비
        },
        // 홈페이지(공개 사이트) 프리미엄 포인트 — 틸/에메랄드 그린
        accent: {
          50: '#effcf9',
          100: '#c9f7ef',
          200: '#96ede0',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
          700: '#0f766e',
          800: '#115e59',
          900: '#134e4a',
        },
        // 포인트 컬러 — 토스풍 블루 (key 는 호환을 위해 teal 유지)
        teal: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3182f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        // 일회용기저귀 등 보조 식별용 슬레이트 블루
        slate2: {
          50: '#f1f5f9',
          100: '#e2e8f0',
          500: '#64748b',
          600: '#475569',
        },
      },
      borderRadius: {
        '4xl': '28px',
      },
      boxShadow: {
        // 매우 은은한 카드 그림자
        card: '0 1px 2px rgba(15, 26, 46, 0.04), 0 8px 24px -12px rgba(15, 26, 46, 0.10)',
        nav: '0 -1px 16px -6px rgba(15, 26, 46, 0.12)',
        sheet: '0 -8px 40px -8px rgba(15, 26, 46, 0.25)',
      },
      fontFamily: {
        sans: [
          '"Pretendard"',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          '"Apple SD Gothic Neo"',
          '"Noto Sans KR"',
          '"Malgun Gothic"',
          'system-ui',
          'Arial',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
}
