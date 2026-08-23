//  테마 팔레트 생성기 (0086 — 전면 재정리)
//
//  ══════════════════════════════════════════════════════════════════════════
//   가장 중요한 원칙 하나
//
//     **테마색은 포인트로만 씁니다. 중립색은 테마와 무관하게 고정입니다.**
//
//   0081~0085 의 구조적 결함이 여기 있었습니다. 중립 계열(배경·카드·테두리·
//   글자)을 **테마의 색상각에서 만들어 내고** 있었습니다. 그러니 채도를
//   아무리 낮춰도 따뜻한 테마에서는 회색이 적갈색으로 나왔고, 화면 전체가
//   「뿌옇고 붉게」 보였습니다. 채도를 낮추는 것으로는 못 고칩니다 —
//   **중립색을 테마에서 떼어 내야** 고쳐집니다.
//
//   이제 이렇게 갈라 둡니다.
//
//     고정 (아홉 테마 전부 같은 값)
//       navy-50 ~ navy-900   배경 · 카드 · 테두리 · 표 · 모든 글자
//       app                  페이지 바탕 (깨끗한 쿨톤 라이트)
//       cardline / shadow    테두리 · 그림자
//       emerald/amber/rose/sky/violet/orange  뜻이 붙은 색
//
//     테마가 정하는 것 (포인트)
//       navy-950             사이드바 바탕 — **차가운 계열만** 허용
//       teal-*               주 단추
//       accent-* / accent2-* / accent3-*   강조
//  ══════════════════════════════════════════════════════════════════════════

// ── 고정 중립 (쿨톤 슬레이트) ───────────────────────────────────────────────
//   ⚠ 이 값들은 **어떤 테마에서도 바뀌지 않습니다.**
//     50~300 배경/테두리 · 400~900 글자. 0080 에서 대비를 173개 → 0개로
//     만든 값 그대로입니다.
const NEUTRAL = {
  50: '#f4f6fa', 100: '#eaeef3', 200: '#d7dde6', 300: '#aeb8c4',
  400: '#626c7a', // 보조 글자 (밝은 바탕 전용) — 흰 바탕 5.3:1
  500: '#5b6677', 600: '#3a4658', 700: '#26303f', 800: '#18222f',
  900: '#0f1a2e', // 제목·본문 — 진한 네이비 슬레이트
}
const APP_BG = '#f5f7fa'      // 페이지 바탕 — 깨끗한 쿨톤 라이트
const CARD_LINE = '#dbe1e9'   // 카드 테두리 — 중립 회색 (흰 카드와 약 1.5:1)
const SHADOW = '#0f1a2e'      // 그림자 — 중립 슬레이트

//  주색·강조의 **모양(밝기 곡선)** 을 빌려 올 기준 계열
const SHAPE = {
  primary: { 50:'#eff6ff',100:'#dbeafe',200:'#bfdbfe',300:'#93c5fd',400:'#60a5fa',
             500:'#3182f6',600:'#2563eb',700:'#1d4ed8',800:'#1e40af',900:'#1e3a8a' },
  accent:  { 50:'#effcf9',100:'#c9f7ef',200:'#96ede0',300:'#5eead4',400:'#2dd4bf',
             500:'#14b8a6',600:'#0d9488',700:'#0f766e',800:'#115e59',900:'#134e4a' },
}
//  기본 테마의 사이드바 (다른 테마는 각자 정합니다)
const BASE_SIDEBAR = '#080f1c'

// ── 뜻이 붙은 색 — 고정입니다 ───────────────────────────────────────────────
//   ⚠ 0081~0085 에서는 이 색들도 테마 쪽으로 ±14° 씩 돌렸습니다. 그 때문에
//     초록이 누렇게, 빨강이 탁하게 보였습니다. 「증가/감소/주의의 뜻이
//     분명해야 한다」는 요구와 정면으로 부딪칩니다. **돌리지 않습니다.**
const SEMANTIC = {
  emerald:{50:'#ecfdf5',100:'#d1fae5',200:'#a7f3d0',300:'#6ee7b7',400:'#34d399',500:'#10b981',
           600:'#059669',700:'#047857',800:'#065f46',900:'#064e3b'},
  amber:{50:'#fffbeb',100:'#fef3c7',200:'#fde68a',300:'#fcd34d',400:'#fbbf24',500:'#f59e0b',
         600:'#d97706',700:'#b45309',800:'#92400e',900:'#78350f'},
  //  ⚠ rose-600 만 Tailwind 기본값(#e11d48)에서 한 눈금 내렸습니다.
  //    「긴급」 칩이 bg-rose-50 위에서 4.3:1 로 기준(4.5)에 모자랐습니다.
  rose:{50:'#fff1f2',100:'#ffe4e6',200:'#fecdd3',300:'#fda4af',400:'#fb7185',500:'#f43f5e',
        600:'#d81643',700:'#be123c',800:'#9f1239',900:'#881337'},
  sky:{50:'#f0f9ff',100:'#e0f2fe',200:'#bae6fd',300:'#7dd3fc',400:'#38bdf8',500:'#0ea5e9',
       600:'#0284c7',700:'#0369a1',800:'#075985',900:'#0c4a6e'},
  violet:{50:'#f5f3ff',100:'#ede9fe',200:'#ddd6fe',300:'#c4b5fd',400:'#a78bfa',500:'#8b5cf6',
          600:'#7c3aed',700:'#6d28d9',800:'#5b21b6',900:'#4c1d95'},
  orange:{50:'#fff7ed',100:'#ffedd5',200:'#fed7aa',300:'#fdba74',400:'#fb923c',500:'#f97316',
          600:'#ea580c',700:'#c2410c',800:'#9a3412',900:'#7c2d12'},
}
//  보조 식별용(일회용기저귀 막대 등) — **중립 회색**입니다.
//  ⚠ 그래프의 비교/보조 계열은 회색이어야 합니다. 여기에 색을 넣으면
//    「어느 쪽이 주인공인지」가 사라져 두 막대가 뭉개집니다.
const SLATE2 = { 50:'#f1f5f9',100:'#e2e8f0',500:'#64748b',600:'#475569' }

// ── 색 계산 ──────────────────────────────────────────────────────────────────
const srgb = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
const lumOf = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b)
const hex2rgb = (h) => { const s = h.replace('#', ''); return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)) }
const rgb2hex = ([r, g, b]) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
function hsl2rgb(h, s, l) {
  h = ((h % 360) + 360) % 360
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const t = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
          : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  return t.map((v) => Math.round((v + m) * 255))
}
/** 목표 휘도를 맞추는 밝기를 이분탐색으로 — 휘도는 밝기에 대해 단조증가입니다 */
function atLum(h, s, target) {
  let lo = 0, hi = 1
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2
    if (lumOf(hsl2rgb(h, s, mid)) < target) lo = mid; else hi = mid
  }
  return hsl2rgb(h, s, (lo + hi) / 2)
}
const hueOf = ([r, g, b]) => {
  const R = r / 255, G = g / 255, B = b / 255
  const mx = Math.max(R, G, B), mn = Math.min(R, G, B), d = mx - mn
  if (!d) return 0
  const h = mx === R ? ((G - B) / d) % 6 : mx === G ? (B - R) / d + 2 : (R - G) / d + 4
  return ((h * 60) % 360 + 360) % 360
}

//  포인트 계열 채도 — 진하게. 밝은 단계만 옅게 둡니다.
const pointSat = (mul = 1) => (s) =>
  Math.min(0.98, (s <= 100 ? 0.66 : s <= 200 ? 0.62 : s <= 400 ? 0.78 : s <= 700 ? 0.93 : 0.80)
    * Math.max(0.55, mul))

/**  포인트 계열 한 벌 — 밝기 곡선은 기준에서 빌리고 색상만 바꿉니다.
 *   대비는 휘도로만 계산되므로, 밝기를 보존하면 어떤 색을 골라도
 *   읽히는 정도가 기준과 같습니다.
 */
function pointRamp(shape, hue, satMul = 1, lumMul = {}) {
  const sat = pointSat(satMul)
  const out = {}
  for (const [step, hex] of Object.entries(shape)) {
    const target = Math.min(1, Math.max(0, lumOf(hex2rgb(hex)) * (lumMul[step] ?? 1)))
    out[step] = rgb2hex(atLum(hue, sat(Number(step)), target))
  }
  return out
}

// ── 아홉 가지 ───────────────────────────────────────────────────────────────
//
//  ⚠ 사이드바(navy-950)는 **차가운 계열만** 씁니다 — 딥네이비 · 딥그린 ·
//    딥틸 · 차콜 슬레이트. 적갈색 검정 · 와인빛 검정 · 붉은 회색은 쓰지
//    않습니다. 아래 검산에서 색상각이 이 범위를 벗어나면 실패로 잡습니다.
//
//  ⚠ 주색·강조는 **포인트**라 따뜻한 색도 씁니다. 화면에서 차지하는 면적이
//    작고, 중립색이 고정이라 화면 전체가 물들 일이 없습니다.
const COOL_MIN = 150   // 사이드바 색상각 허용 범위 (차가운 계열)
const COOL_MAX = 265
const THEMES = [
  { id: 'navy-blue', name: '딥 네이비 블루', desc: '남색 · 파랑 · 틸',
    sidebar: BASE_SIDEBAR,
    primary: { hue: 215, sat: 1 },
    accent:  { hue: 172, sat: 1 } },

  { id: 'navy-gold', name: '네이비 골드', desc: '남색 · 앤티크 금',
    sidebar: '#0d1424',
    primary: { hue: 228, sat: 1, lumMul: { 500: 0.62, 600: 0.74 } },
    accent:  { hue: 42, sat: 1, lumMul: { 500: 0.76 } } },

  { id: 'emerald-gold', name: '에메랄드 골드', desc: '짙은 초록 · 샴페인 금',
    sidebar: '#0b1f18',
    primary: { hue: 164, sat: 1, lumMul: { 500: 0.72, 600: 0.82 } },
    accent:  { hue: 50, sat: 0.85, lumMul: { 500: 1.12 } } },

  { id: 'forest-sage', name: '포레스트 세이지', desc: '깊은 숲 · 세이지',
    //  ⚠ 처음에 138° 로 뒀더니 사이드바 검산에 걸렸습니다(허용 150~265°).
    //    138° 는 초록이긴 하나 노란 쪽으로 기울어 「탁한 올리브 검정」이
    //    됩니다. 사이드바는 152° 의 제대로 된 숲 초록으로 두고, 주색만
    //    노란 초록으로 둡니다 — 이웃 색이라 서로 어울립니다.
    sidebar: '#0f1d17',
    primary: { hue: 138, sat: 0.7, lumMul: { 500: 0.54, 600: 0.64 } },
    accent:  { hue: 86, sat: 0.75, lumMul: { 500: 0.84 } } },

  { id: 'deep-teal', name: '딥 틸', desc: '청록 · 테라코타',
    sidebar: '#0b1c20',
    primary: { hue: 188, sat: 1, lumMul: { 500: 0.7, 600: 0.8 } },
    accent:  { hue: 18, sat: 0.92, lumMul: { 500: 0.88 } } },

  //  ⚠ 오닉스 골드 — 사이드바를 「적갈색 검정」에서 **차콜 슬레이트**로
  //    바꿨습니다. 금색은 포인트로만 씁니다.
  { id: 'onyx-gold', name: '오닉스 골드', desc: '차콜 · 밝은 금빛',
    sidebar: '#12161c',
    primary: { hue: 44, sat: 1, lumMul: { 500: 0.66, 600: 0.74, 700: 0.86 } },
    accent:  { hue: 48, sat: 1, lumMul: { 500: 1.05 } } },

  //  ⚠ 버건디 — 사이드바가 **와인빛 검정**이라 화면이 붉게 보였습니다.
  //    사이드바는 차가운 슬레이트로 바꾸고, 와인은 **주 단추와 강조**에만
  //    남깁니다. 이름이 뜻하는 색은 그대로 살아 있습니다.
  { id: 'burgundy-slate', name: '버건디 슬레이트', desc: '슬레이트 · 와인 포인트',
    sidebar: '#141821',
    primary: { hue: 348, sat: 1, lumMul: { 500: 0.5, 600: 0.6, 700: 0.78 } },
    accent:  { hue: 26, sat: 0.95, lumMul: { 500: 0.74 } } },

  //  ⚠ 플럼 — 같은 이유로 사이드바를 인디고 슬레이트로.
  { id: 'plum-indigo', name: '플럼 인디고', desc: '인디고 · 자줏빛 포인트',
    sidebar: '#141329',
    primary: { hue: 300, sat: 0.88, lumMul: { 500: 0.5, 600: 0.6, 700: 0.78 } },
    accent:  { hue: 250, sat: 0.9, lumMul: { 500: 0.86 } } },

  //  ⚠ 로즈 코퍼 대신 **스틸 플래티넘** — 「차콜 + 러스트 + 코퍼」는 정체가
  //    통째로 따뜻한 색이라, 붉은기를 빼면 남는 것이 없습니다. 되살리는
  //    대신 **차가운 계열의 담백한 테마** 하나로 갈음했습니다.
  //    (예전에 로즈 코퍼를 골라 두신 분은 기본색으로 돌아갑니다 —
  //     모르는 이름은 기본색으로 가게 되어 있습니다.)
  { id: 'steel-platinum', name: '스틸 플래티넘', desc: '스틸 그레이 · 은빛 블루',
    sidebar: '#171b21',
    primary: { hue: 205, sat: 0.9, lumMul: { 500: 0.62, 600: 0.74 } },
    accent:  { hue: 196, sat: 0.5, lumMul: { 500: 1.15 } } },
]

// ── 한 테마의 CSS 변수 ──────────────────────────────────────────────────────
const triplet = (hex) => hex2rgb(hex).join(' ')

function varsFor(t) {
  const lines = []
  //  ① 중립 — 아홉 테마 전부 같은 값입니다.
  for (const [s, hex] of Object.entries(NEUTRAL)) lines.push(`    --c-navy-${s}: ${triplet(hex)};`)
  //  ② 사이드바만 테마가 정합니다 (배경 전용 · 글자로 쓰이지 않는 단계).
  lines.push(`    --c-navy-950: ${triplet(t.sidebar)};`)
  //  ③ 주색 · 강조 — 포인트.
  const teal = pointRamp(SHAPE.primary, t.primary.hue, t.primary.sat, t.primary.lumMul ?? {})
  const accent = pointRamp(SHAPE.accent, t.accent.hue, t.accent.sat, t.accent.lumMul ?? {})
  //  강조의 **형제**(−26°)와 주색의 **온도 반대편** — 그래프 계열을 위한 색.
  const w = ((t.primary.hue % 360) + 360) % 360
  const a2 = pointRamp(SHAPE.accent, t.accent.hue - 26, t.accent.sat,
    { ...(t.accent.lumMul ?? {}), 500: (t.accent.lumMul?.[500] ?? 1) * 0.82 })
  const a3 = pointRamp(SHAPE.accent, (w >= 300 || w <= 60) ? 192 : 22, 0.62,
    { ...(t.primary.lumMul ?? {}), 500: (t.primary.lumMul?.[500] ?? 1) * 0.8 })
  for (const [fam, steps] of Object.entries({ teal, accent, accent2: a2, accent3: a3 }))
    for (const [s, hex] of Object.entries(steps)) lines.push(`    --c-${fam}-${s}: ${triplet(hex)};`)
  //  ④ 뜻이 붙은 색 · 보조 회색 · 바탕 · 테두리 · 그림자 — 전부 고정.
  for (const [fam, steps] of Object.entries({ ...SEMANTIC, slate2: SLATE2 }))
    for (const [s, hex] of Object.entries(steps)) lines.push(`    --c-${fam}-${s}: ${triplet(hex)};`)
  lines.push(`    --c-app: ${triplet(APP_BG)};`)
  lines.push(`    --c-cardline: ${triplet(CARD_LINE)};`)
  lines.push(`    --c-shadow: ${triplet(SHADOW)};`)
  return lines.join('\n')
}

/** 고르는 화면에 찍을 다섯 방울 — 실제로 쓰이는 색에서 그대로 뽑습니다 */
function swatchOf(t) {
  const teal = pointRamp(SHAPE.primary, t.primary.hue, t.primary.sat, t.primary.lumMul ?? {})
  const accent = pointRamp(SHAPE.accent, t.accent.hue, t.accent.sat, t.accent.lumMul ?? {})
  const w = ((t.primary.hue % 360) + 360) % 360
  const a2 = pointRamp(SHAPE.accent, t.accent.hue - 26, t.accent.sat,
    { ...(t.accent.lumMul ?? {}), 500: (t.accent.lumMul?.[500] ?? 1) * 0.82 })
  const a3 = pointRamp(SHAPE.accent, (w >= 300 || w <= 60) ? 192 : 22, 0.62,
    { ...(t.primary.lumMul ?? {}), 500: (t.primary.lumMul?.[500] ?? 1) * 0.8 })
  return [t.sidebar, teal[500], accent[500], a2[500], a3[500]]
}

let css = `/*  ⚠ 이 파일은 손으로 고치지 않습니다 — scripts/gen_themes.mjs 가 만듭니다.

    0086 — **테마색은 포인트로만. 중립색은 테마와 무관하게 고정.**
    배경 · 카드 · 테두리 · 표 · 모든 글자, 그리고 뜻이 붙은 색(완료 초록 ·
    경고 빨강)은 아홉 테마에서 **완전히 같은 값**입니다.
    테마가 정하는 것은 사이드바 바탕과 주 단추 · 강조뿐입니다. */

@layer base {
`
for (const t of THEMES) {
  const sel = t.id === 'navy-blue' ? ':root, [data-theme="navy-blue"]' : `[data-theme="${t.id}"]`
  css += `  /* ${t.name} — ${t.desc} */\n  ${sel} {\n${varsFor(t)}\n  }\n\n`
}
css += '}\n'

let ts = `//  ⚠ 이 파일은 손으로 고치지 않습니다 — scripts/gen_themes.mjs 가 만듭니다.
export interface ThemeDef {
  id: string
  /** 화면에 보이는 이름 */
  name: string
  /** 한 줄 설명 — 고르는 사람이 무엇이 바뀌는지 알 수 있게 */
  desc: string
  /** 고르는 화면에 찍을 색 다섯 방울 [사이드바·주색·강조·강조2·강조3] */
  swatch: [string, string, string, string, string]
}

export const THEMES: ThemeDef[] = [
${THEMES.map((t) => `  { id: '${t.id}', name: '${t.name}', desc: '${t.desc}', swatch: ['${swatchOf(t).join("', '")}'] },`).join('\n')}
]

export const THEME_IDS = THEMES.map((t) => t.id)
export const DEFAULT_THEME = '${THEMES[0].id}'
export function isTheme(v: unknown): v is string {
  return typeof v === 'string' && THEME_IDS.includes(v)
}
`

const fs = await import('node:fs')
const SRC = new URL('../src/', import.meta.url)
fs.writeFileSync(new URL('themes.css', SRC), css)
fs.writeFileSync(new URL('lib/themes.ts', SRC), ts)

// ══ 검산 ════════════════════════════════════════════════════════════════════
const ratio = (a, b) => {
  const la = lumOf(hex2rgb(a)) + 0.05, lb = lumOf(hex2rgb(b)) + 0.05
  return Math.round((Math.max(la, lb) / Math.min(la, lb)) * 100) / 100
}
const PAIRS = [
  ['캡션 navy-400 / 흰 바탕', (p) => ratio(NEUTRAL[400], '#ffffff'), 4.5],
  ['본문 navy-500 / 흰 바탕', (p) => ratio(NEUTRAL[500], '#ffffff'), 4.5],
  ['제목 navy-900 / 흰 바탕', (p) => ratio(NEUTRAL[900], '#ffffff'), 4.5],
  ['본문 navy-600 / 앱 바탕', (p) => ratio(NEUTRAL[600], APP_BG), 4.5],
  ['카드 테두리 / 흰 카드', (p) => ratio(CARD_LINE, '#ffffff'), 1.25],
  ['흰 글자 / 주단추 teal-500', (p) => ratio('#ffffff', p.teal[500]), 3.0],
  ['주색 글자 teal-600 / 흰 바탕', (p) => ratio(p.teal[600], '#ffffff'), 4.5],
  ['주색 글자 teal-700 / teal-50', (p) => ratio(p.teal[700], p.teal[50]), 4.5],
  ['사이드바 흰글자 / 사이드바', (p) => ratio('#ffffff', p.sidebar), 12],
  ['사이드바 navy-200 / 사이드바', (p) => ratio(NEUTRAL[200], p.sidebar), 7],
  ['강조 accent-600 / 흰 바탕 (큰 글자)', (p) => ratio(p.accent[600], '#ffffff'), 3.0],
  ['강조 accent-700 / 칩 accent-50', (p) => ratio(p.accent[700], p.accent[50]), 4.5],
  ['주의 amber-700 / amber-50', () => ratio(SEMANTIC.amber[700], SEMANTIC.amber[50]), 4.5],
  ['경고 rose-600 / rose-50', () => ratio(SEMANTIC.rose[600], SEMANTIC.rose[50]), 4.5],
  ['완료 emerald-700 / emerald-50', () => ratio(SEMANTIC.emerald[700], SEMANTIC.emerald[50]), 4.5],
  ['정보 sky-700 / sky-50', () => ratio(SEMANTIC.sky[700], SEMANTIC.sky[50]), 4.5],
]
console.log('테마'.padEnd(18), PAIRS.map((x, i) => `#${i + 1}`).join(' '))
let bad = 0
for (const t of THEMES) {
  const p = {
    teal: pointRamp(SHAPE.primary, t.primary.hue, t.primary.sat, t.primary.lumMul ?? {}),
    accent: pointRamp(SHAPE.accent, t.accent.hue, t.accent.sat, t.accent.lumMul ?? {}),
    sidebar: t.sidebar,
  }
  const cells = PAIRS.map(([, fn, need]) => { const v = fn(p); if (v < need) bad += 1; return `${v < need ? '✗' : ' '}${v.toFixed(1)}` })
  console.log(t.name.padEnd(16), cells.join(' '))
}
console.log('\n짝 이름:')
PAIRS.forEach(([n, , need], i) => console.log(`  #${i + 1} ${n} (기준 ${need})`))
console.log(`\n기준 미달 ${bad}개`)

//  ── 사이드바가 차가운 계열인가 ──────────────────────────────────────────────
//   적갈색 검정 · 와인빛 검정 · 붉은 회색을 막습니다.
let warmSide = 0
for (const t of THEMES) {
  const rgb = hex2rgb(t.sidebar)
  const h = hueOf(rgb)
  const chroma = Math.max(...rgb) - Math.min(...rgb)
  //  색기가 거의 없으면(중립 검정) 색상각은 따지지 않습니다.
  if (chroma > 6 && (h < COOL_MIN || h > COOL_MAX)) {
    console.log(`  ✗ ${t.name} 사이드바 ${t.sidebar} — 색상각 ${Math.round(h)}° (허용 ${COOL_MIN}~${COOL_MAX}°)`)
    warmSide += 1
  }
}
console.log(`따뜻한 사이드바 ${warmSide}개 (0 이어야 합니다)`)

//  ── 중립색이 정말 고정인가 ─────────────────────────────────────────────────
//   이 검산이 이번 재정리의 핵심입니다. 중립이 한 테마에서라도 달라지면
//   그 테마만 뿌옇게 보이기 시작합니다.
const neutralBlocks = [...css.matchAll(/\[data-theme="[^"]+"\][^{]*\{([\s\S]*?)\n  \}/g)]
  .map((m) => (m[1].match(/--c-navy-(?:50|100|200|300|400|500|600|700|800|900):[^;]+;/g) ?? []).join('|'))
const neutralSame = new Set(neutralBlocks).size <= 1
console.log(`중립색이 아홉 테마에서 동일: ${neutralSame ? '예' : '**아니오 — 실패**'}`)

//  ── 서로 충분히 다른가 ─────────────────────────────────────────────────────
const MIN_GAP = 120
const key = (t) => {
  const teal = pointRamp(SHAPE.primary, t.primary.hue, t.primary.sat, t.primary.lumMul ?? {})
  const accent = pointRamp(SHAPE.accent, t.accent.hue, t.accent.sat, t.accent.lumMul ?? {})
  return [hex2rgb(t.sidebar), hex2rgb(teal[500]), hex2rgb(accent[500])]
}
const dist = (a, b) => Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0))
const all = []
for (let i = 0; i < THEMES.length; i += 1)
  for (let j = i + 1; j < THEMES.length; j += 1) {
    const A = key(THEMES[i]), B = key(THEMES[j])
    all.push([A.reduce((s, c, k) => s + dist(c, B[k]), 0), THEMES[i].name, THEMES[j].name])
  }
all.sort((x, y) => x[0] - y[0])
console.log('\n가장 닮은 다섯 쌍:')
all.slice(0, 5).forEach(([d, a, b]) => console.log(`  ${d.toFixed(0).padStart(4)}  ${a} ↔ ${b}`))
const tooClose = all.filter(([d]) => d < MIN_GAP)
console.log(`너무 닮은 쌍 ${tooClose.length}개 (최소 ${MIN_GAP})`)

if (bad || warmSide || !neutralSame || tooClose.length) process.exitCode = 1
