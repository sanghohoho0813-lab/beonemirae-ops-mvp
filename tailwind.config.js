/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        //  ⚠ 0081 — 색을 **CSS 변수**로 뺐습니다. 값은 src/themes.css 에 있고
        //    그 파일은 scripts/gen_themes.mjs 가 만듭니다.
        //
        //    이렇게 두면 화면 코드는 한 줄도 안 바뀝니다. 지금 쓰이는
        //    text-navy-400 · bg-teal-500 같은 클래스 3,000여 곳이 그대로
        //    테마를 따라갑니다 — 배치도 정보 구조도 건드리지 않고 색만
        //    갈아 끼우는 것이 목적이라, 이 방식이 가장 덜 헤집습니다.
        //
        //    rgb(var(--x) / <alpha-value>) 꼴이라 bg-teal-500/20 처럼
        //    투명도를 쓰던 자리도 그대로 동작합니다.
        navy: {
          50: 'rgb(var(--c-navy-50) / <alpha-value>)',
          100: 'rgb(var(--c-navy-100) / <alpha-value>)',
          200: 'rgb(var(--c-navy-200) / <alpha-value>)',
          300: 'rgb(var(--c-navy-300) / <alpha-value>)',
          //  이 색의 **일**은 캡션 글자입니다. 0080 에서 밝기를 낮춰
          //  대비 기준을 넘겼고(흰 바탕 5.3:1), 테마를 바꿔도 **밝기는
          //  그대로 두고 색상만** 바뀌므로 그 결과가 아홉 테마에서 유지됩니다.
          400: 'rgb(var(--c-navy-400) / <alpha-value>)',
          500: 'rgb(var(--c-navy-500) / <alpha-value>)',
          600: 'rgb(var(--c-navy-600) / <alpha-value>)',
          700: 'rgb(var(--c-navy-700) / <alpha-value>)',
          800: 'rgb(var(--c-navy-800) / <alpha-value>)',
          900: 'rgb(var(--c-navy-900) / <alpha-value>)',
          950: 'rgb(var(--c-navy-950) / <alpha-value>)',
        },
        accent: {
          50: 'rgb(var(--c-accent-50) / <alpha-value>)',
          100: 'rgb(var(--c-accent-100) / <alpha-value>)',
          200: 'rgb(var(--c-accent-200) / <alpha-value>)',
          300: 'rgb(var(--c-accent-300) / <alpha-value>)',
          400: 'rgb(var(--c-accent-400) / <alpha-value>)',
          500: 'rgb(var(--c-accent-500) / <alpha-value>)',
          600: 'rgb(var(--c-accent-600) / <alpha-value>)',
          700: 'rgb(var(--c-accent-700) / <alpha-value>)',
          800: 'rgb(var(--c-accent-800) / <alpha-value>)',
          900: 'rgb(var(--c-accent-900) / <alpha-value>)',
        },
        // 포인트 컬러 (key 는 호환을 위해 teal 유지 — 실제 색은 테마가 정합니다)
        teal: {
          50: 'rgb(var(--c-teal-50) / <alpha-value>)',
          100: 'rgb(var(--c-teal-100) / <alpha-value>)',
          200: 'rgb(var(--c-teal-200) / <alpha-value>)',
          300: 'rgb(var(--c-teal-300) / <alpha-value>)',
          400: 'rgb(var(--c-teal-400) / <alpha-value>)',
          500: 'rgb(var(--c-teal-500) / <alpha-value>)',
          600: 'rgb(var(--c-teal-600) / <alpha-value>)',
          700: 'rgb(var(--c-teal-700) / <alpha-value>)',
          800: 'rgb(var(--c-teal-800) / <alpha-value>)',
          900: 'rgb(var(--c-teal-900) / <alpha-value>)',
        },
        //  ⚠ 0084 — 테마마다 색을 3가지에서 **5가지**로 늘렸습니다
        //    (중립 · 주색 · 강조 · 강조2 · 강조3). 강조색 양옆의 이웃 색상이라
        //    서로 싸우지 않습니다. 뜻이 붙은 색(완료 초록 · 경고 빨강)과
        //    메뉴별 색(TONE)은 건드리지 않습니다 — 새 색은 테마가 소유한
        //    자리에만 씁니다.
        accent2: {
          50: 'rgb(var(--c-accent2-50) / <alpha-value>)',
          100: 'rgb(var(--c-accent2-100) / <alpha-value>)',
          200: 'rgb(var(--c-accent2-200) / <alpha-value>)',
          300: 'rgb(var(--c-accent2-300) / <alpha-value>)',
          400: 'rgb(var(--c-accent2-400) / <alpha-value>)',
          500: 'rgb(var(--c-accent2-500) / <alpha-value>)',
          600: 'rgb(var(--c-accent2-600) / <alpha-value>)',
          700: 'rgb(var(--c-accent2-700) / <alpha-value>)',
          800: 'rgb(var(--c-accent2-800) / <alpha-value>)',
          900: 'rgb(var(--c-accent2-900) / <alpha-value>)',
        },
        accent3: {
          50: 'rgb(var(--c-accent3-50) / <alpha-value>)',
          100: 'rgb(var(--c-accent3-100) / <alpha-value>)',
          200: 'rgb(var(--c-accent3-200) / <alpha-value>)',
          300: 'rgb(var(--c-accent3-300) / <alpha-value>)',
          400: 'rgb(var(--c-accent3-400) / <alpha-value>)',
          500: 'rgb(var(--c-accent3-500) / <alpha-value>)',
          600: 'rgb(var(--c-accent3-600) / <alpha-value>)',
          700: 'rgb(var(--c-accent3-700) / <alpha-value>)',
          800: 'rgb(var(--c-accent3-800) / <alpha-value>)',
          900: 'rgb(var(--c-accent3-900) / <alpha-value>)',
        },
        // 일회용기저귀 등 보조 식별용
        slate2: {
          50: 'rgb(var(--c-slate2-50) / <alpha-value>)',
          100: 'rgb(var(--c-slate2-100) / <alpha-value>)',
          500: 'rgb(var(--c-slate2-500) / <alpha-value>)',
          600: 'rgb(var(--c-slate2-600) / <alpha-value>)',
        },
        //  ── 뜻이 붙어 있는 색 ──────────────────────────────────────────────
        //   ⚠ 이 색들은 **뜻을 지고 있습니다.** 테마가 바뀌어도 초록은 초록,
        //     빨강은 빨강으로 남습니다 — 색상을 최대 ±14° 까지만 테마 쪽으로
        //     끌어오고, 밝기는 건드리지 않습니다(scripts/gen_themes.mjs).
        //     「완료」가 「경고」로 읽히는 일은 구조적으로 일어나지 않습니다.
        //     이름을 emerald/amber/rose 로 그대로 둔 이유도 같습니다 —
        //     코드에서 색 이름이 곧 뜻입니다.
        // 상승 · 완료
        emerald: {
          50: 'rgb(var(--c-emerald-50) / <alpha-value>)',
          100: 'rgb(var(--c-emerald-100) / <alpha-value>)',
          200: 'rgb(var(--c-emerald-200) / <alpha-value>)',
          300: 'rgb(var(--c-emerald-300) / <alpha-value>)',
          400: 'rgb(var(--c-emerald-400) / <alpha-value>)',
          500: 'rgb(var(--c-emerald-500) / <alpha-value>)',
          600: 'rgb(var(--c-emerald-600) / <alpha-value>)',
          700: 'rgb(var(--c-emerald-700) / <alpha-value>)',
          800: 'rgb(var(--c-emerald-800) / <alpha-value>)',
          900: 'rgb(var(--c-emerald-900) / <alpha-value>)',
        },
        // 주의 · 확인 필요
        amber: {
          50: 'rgb(var(--c-amber-50) / <alpha-value>)',
          100: 'rgb(var(--c-amber-100) / <alpha-value>)',
          200: 'rgb(var(--c-amber-200) / <alpha-value>)',
          300: 'rgb(var(--c-amber-300) / <alpha-value>)',
          400: 'rgb(var(--c-amber-400) / <alpha-value>)',
          500: 'rgb(var(--c-amber-500) / <alpha-value>)',
          600: 'rgb(var(--c-amber-600) / <alpha-value>)',
          700: 'rgb(var(--c-amber-700) / <alpha-value>)',
          800: 'rgb(var(--c-amber-800) / <alpha-value>)',
          900: 'rgb(var(--c-amber-900) / <alpha-value>)',
        },
        // 경고 · 하락 · 긴급
        rose: {
          50: 'rgb(var(--c-rose-50) / <alpha-value>)',
          100: 'rgb(var(--c-rose-100) / <alpha-value>)',
          200: 'rgb(var(--c-rose-200) / <alpha-value>)',
          300: 'rgb(var(--c-rose-300) / <alpha-value>)',
          400: 'rgb(var(--c-rose-400) / <alpha-value>)',
          500: 'rgb(var(--c-rose-500) / <alpha-value>)',
          600: 'rgb(var(--c-rose-600) / <alpha-value>)',
          700: 'rgb(var(--c-rose-700) / <alpha-value>)',
          800: 'rgb(var(--c-rose-800) / <alpha-value>)',
          900: 'rgb(var(--c-rose-900) / <alpha-value>)',
        },
        // 정보 · 교육 · 리포트
        sky: {
          50: 'rgb(var(--c-sky-50) / <alpha-value>)',
          100: 'rgb(var(--c-sky-100) / <alpha-value>)',
          200: 'rgb(var(--c-sky-200) / <alpha-value>)',
          300: 'rgb(var(--c-sky-300) / <alpha-value>)',
          400: 'rgb(var(--c-sky-400) / <alpha-value>)',
          500: 'rgb(var(--c-sky-500) / <alpha-value>)',
          600: 'rgb(var(--c-sky-600) / <alpha-value>)',
          700: 'rgb(var(--c-sky-700) / <alpha-value>)',
          800: 'rgb(var(--c-sky-800) / <alpha-value>)',
          900: 'rgb(var(--c-sky-900) / <alpha-value>)',
        },
        // 소모품 · 병원 고객
        violet: {
          50: 'rgb(var(--c-violet-50) / <alpha-value>)',
          100: 'rgb(var(--c-violet-100) / <alpha-value>)',
          200: 'rgb(var(--c-violet-200) / <alpha-value>)',
          300: 'rgb(var(--c-violet-300) / <alpha-value>)',
          400: 'rgb(var(--c-violet-400) / <alpha-value>)',
          500: 'rgb(var(--c-violet-500) / <alpha-value>)',
          600: 'rgb(var(--c-violet-600) / <alpha-value>)',
          700: 'rgb(var(--c-violet-700) / <alpha-value>)',
          800: 'rgb(var(--c-violet-800) / <alpha-value>)',
          900: 'rgb(var(--c-violet-900) / <alpha-value>)',
        },
        // 추가 수거
        orange: {
          50: 'rgb(var(--c-orange-50) / <alpha-value>)',
          100: 'rgb(var(--c-orange-100) / <alpha-value>)',
          200: 'rgb(var(--c-orange-200) / <alpha-value>)',
          300: 'rgb(var(--c-orange-300) / <alpha-value>)',
          400: 'rgb(var(--c-orange-400) / <alpha-value>)',
          500: 'rgb(var(--c-orange-500) / <alpha-value>)',
          600: 'rgb(var(--c-orange-600) / <alpha-value>)',
          700: 'rgb(var(--c-orange-700) / <alpha-value>)',
          800: 'rgb(var(--c-orange-800) / <alpha-value>)',
          900: 'rgb(var(--c-orange-900) / <alpha-value>)',
        },
        //  카드 테두리 — .card 에 테두리가 아예 없어서 경계가 그림자에만
        //  기대고 있었습니다(0082). 눈에 보이는 실선 한 겹을 답니다.
        cardline: 'rgb(var(--c-cardline) / <alpha-value>)',
        //  앱 바탕 — 예전에는 #f5f7fa 를 열 군데에 **손으로 적어** 두었습니다.
        //  테마가 바뀌어도 바탕만 안 바뀌면 그게 제일 어색합니다.
        app: 'rgb(var(--c-app) / <alpha-value>)',
      },
      borderRadius: {
        '4xl': '28px',
      },
      boxShadow: {
        //  ⚠ 0082 — 그림자 색이 rgba(15,26,46,…) **네이비로 고정**이었습니다.
        //    따뜻한 크림 바탕 위에 차가운 네이비 그림자를 4% 로 얹으면 거의
        //    안 보입니다. 그런데 .card 에는 테두리가 없어 경계를 오로지 이
        //    그림자에 기대고 있었으니, 테마를 바꾸면 카드가 바탕에 녹았습니다.
        //    이제 그 테마의 어두운 중립색을 씁니다. 세기도 한 단계 올렸습니다
        //    (0.04 → 0.07 / 0.10 → 0.13) — 「또렷하게」가 이번 주문입니다.
        card: '0 1px 2px rgb(var(--c-shadow) / 0.07), 0 8px 24px -12px rgb(var(--c-shadow) / 0.13)',
        nav: '0 -1px 16px -6px rgb(var(--c-shadow) / 0.14)',
        sheet: '0 -8px 40px -8px rgb(var(--c-shadow) / 0.28)',
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
