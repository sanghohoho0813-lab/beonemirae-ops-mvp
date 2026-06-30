/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 신뢰감 있는 네이비 / 청록 / 화이트 계열
        navy: {
          50: '#eef2f7',
          100: '#d9e2ef',
          200: '#b3c5df',
          300: '#8da8cf',
          400: '#5f80b4',
          500: '#3d5a8a',
          600: '#2c4368',
          700: '#1f3150',
          800: '#16243d',
          900: '#0f1a2e',
        },
        teal: {
          50: '#effcfa',
          100: '#c9f5ee',
          200: '#97eadf',
          300: '#5ed8cb',
          400: '#2fbfb2',
          500: '#16a394',
          600: '#0e8278',
          700: '#106861',
          800: '#11534e',
          900: '#114541',
        },
      },
      fontFamily: {
        sans: [
          '"Pretendard"',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Apple SD Gothic Neo"',
          '"Malgun Gothic"',
          'system-ui',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
}
