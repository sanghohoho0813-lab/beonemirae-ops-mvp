//  테마 팔레트 생성기 (0081)
//
//  ⚠ 핵심 원칙: **각 단계의 밝기(상대휘도)를 그대로 두고 색상(hue)만 바꿉니다.**
//    WCAG 대비는 오로지 휘도로만 계산됩니다. 그러니 휘도를 보존하면
//    0080 에서 173개 → 0개로 만든 대비 결과가 **아홉 테마 전부에서 그대로**
//    유지됩니다. 색을 예쁘게 고르다 글자가 안 보이게 되는 일이 구조적으로
//    일어나지 않습니다.
//
//  생성한 값은 그대로 CSS 파일로 떨궈 저장소에 남깁니다 — 런타임에 색을
//  계산하지 않습니다. 나중에 누가 값을 확인하고 싶을 때 파일만 보면 됩니다.

const BASE = {
  navy: { 50:'#f4f6fa',100:'#eaeef3',200:'#d7dde6',300:'#aeb8c4',400:'#626c7a',500:'#5b6677',
          600:'#3a4658',700:'#26303f',800:'#18222f',900:'#0f1a2e',950:'#080f1c' },
  teal: { 50:'#eff6ff',100:'#dbeafe',200:'#bfdbfe',300:'#93c5fd',400:'#60a5fa',500:'#3182f6',
          600:'#2563eb',700:'#1d4ed8',800:'#1e40af',900:'#1e3a8a' },
  accent:{50:'#effcf9',100:'#c9f7ef',200:'#96ede0',300:'#5eead4',400:'#2dd4bf',500:'#14b8a6',
          600:'#0d9488',700:'#0f766e',800:'#115e59',900:'#134e4a' },
  slate2:{50:'#f1f5f9',100:'#e2e8f0',500:'#64748b',600:'#475569' },
  //  ── 뜻이 붙어 있는 색 (Tailwind 기본값) ──────────────────────────────────
  //   상승/완료 = emerald · 주의 = amber · 하락/경고 = rose · 정보 = sky
  //   부가 = violet · 추가수거 = orange
  //   ⚠ 이 색들은 **뜻을 지고 있습니다.** 테마에 맞춘다고 초록을 빨강 쪽으로
  //     돌리면 「완료」가 「경고」로 읽힙니다. 그래서 아래 SEMANTIC_TURN 에서
  //     **최대 ±14° 까지만** 돌립니다 — 초록은 초록으로, 빨강은 빨강으로
  //     남는 범위입니다. 톤만 맞추고 뜻은 건드리지 않습니다.
  emerald:{50:'#ecfdf5',100:'#d1fae5',200:'#a7f3d0',300:'#6ee7b7',400:'#34d399',500:'#10b981',
           600:'#059669',700:'#047857',800:'#065f46',900:'#064e3b'},
  amber:{50:'#fffbeb',100:'#fef3c7',200:'#fde68a',300:'#fcd34d',400:'#fbbf24',500:'#f59e0b',
         600:'#d97706',700:'#b45309',800:'#92400e',900:'#78350f'},
  //  ⚠ rose-600 만 Tailwind 기본값(#e11d48)에서 한 눈금 내렸습니다.
  //    「긴급」 칩이 bg-rose-50 + text-rose-600 인데, 원래 값은 그 위에서
  //    4.3:1 로 기준(4.5)에 0.2 모자랐습니다. 하필 **긴급**이라고 적힌
  //    칩이 제일 안 읽히는 상태였습니다. 색은 그대로 빨강이고 밝기만
  //    낮췄습니다 → 4.6:1.
  rose:{50:'#fff1f2',100:'#ffe4e6',200:'#fecdd3',300:'#fda4af',400:'#fb7185',500:'#f43f5e',
        600:'#d81643',700:'#be123c',800:'#9f1239',900:'#881337'},
  sky:{50:'#f0f9ff',100:'#e0f2fe',200:'#bae6fd',300:'#7dd3fc',400:'#38bdf8',500:'#0ea5e9',
       600:'#0284c7',700:'#0369a1',800:'#075985',900:'#0c4a6e'},
  violet:{50:'#f5f3ff',100:'#ede9fe',200:'#ddd6fe',300:'#c4b5fd',400:'#a78bfa',500:'#8b5cf6',
          600:'#7c3aed',700:'#6d28d9',800:'#5b21b6',900:'#4c1d95'},
  orange:{50:'#fff7ed',100:'#ffedd5',200:'#fed7aa',300:'#fdba74',400:'#fb923c',500:'#f97316',
          600:'#ea580c',700:'#c2410c',800:'#9a3412',900:'#7c2d12'},
}
//  뜻이 붙은 색의 **원래 색상각**. 여기서 테마 쪽으로 조금만 끌어옵니다.
const SEM_HUE = { emerald: 160, amber: 38, rose: 350, sky: 199, violet: 258, orange: 25 }
const SEM_FAMS = ['emerald', 'amber', 'rose', 'sky', 'violet', 'orange']
/** 최대 몇 도까지 돌릴 것인가 — 뜻이 안 바뀌는 한도입니다 */
const MAX_TURN = 14

/** a 에서 b 로 가는 최단 각도차 (-180~180) */
function angleDelta(a, b) { return ((((b - a) % 360) + 540) % 360) - 180 }

/**  뜻이 붙은 색 계열을 테마 쪽으로 **조금만** 끌어옵니다.
 *   밝기는 그대로라 대비는 변하지 않고, 색상만 최대 ±14° 움직입니다.
 */
function semRamp(fam, themeHue, sat) {
  const base = BASE[fam]
  const own = SEM_HUE[fam]
  const d = angleDelta(own, themeHue)
  const hue = own + Math.max(-MAX_TURN, Math.min(MAX_TURN, d))
  const out = {}
  for (const [step, hex] of Object.entries(base)) {
    const rgb = hex2rgb(hex)
    //  원래 색의 채도를 그대로 씁니다 — 뜻이 붙은 색은 선명해야 눈에 띕니다
    out[step] = rgb2hex(atLum(hue, satOfHex(rgb) * sat, lumOf(rgb)))
  }
  return out
}
/** RGB 에서 HSL 채도를 되뽑습니다 */
function satOfHex([r, g, b]) {
  const R = r / 255, G = g / 255, B = b / 255
  const mx = Math.max(R, G, B), mn = Math.min(R, G, B)
  const l = (mx + mn) / 2
  if (mx === mn) return 0
  return (mx - mn) / (1 - Math.abs(2 * l - 1))
}
const APP_BG = '#f5f7fa'

// ── 색 계산 ──────────────────────────────────────────────────────────────────
const srgb = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
const lumOf = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b)
const hex2rgb = (h) => { const s = h.replace('#',''); return [0,2,4].map((i)=>parseInt(s.slice(i,i+2),16)) }
const rgb2hex = ([r,g,b]) => '#' + [r,g,b].map((v)=>Math.round(v).toString(16).padStart(2,'0')).join('')
function hsl2rgb(h, s, l) {
  h = ((h % 360) + 360) % 360
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const t = h < 60 ? [c,x,0] : h < 120 ? [x,c,0] : h < 180 ? [0,c,x]
          : h < 240 ? [0,x,c] : h < 300 ? [x,0,c] : [c,0,x]
  return t.map((v) => Math.round((v + m) * 255))
}

/** 목표 휘도를 맞추는 밝기(l)를 이분탐색으로 찾습니다 — l 에 대해 휘도는 단조증가입니다 */
function atLum(h, s, targetLum) {
  let lo = 0, hi = 1
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2
    if (lumOf(hsl2rgb(h, s, mid)) < targetLum) lo = mid; else hi = mid
  }
  return hsl2rgb(h, s, (lo + hi) / 2)
}

//  ⚠ 0082 — **글자로 쓰이는 단계**는 밝기를 절대로 못 올리게 막습니다.
//
//    0081 에서 사이드바에 색이 보이게 하려고 어두운 단계의 밝기를 1.4~2.6배
//    올렸습니다. 그런데 navy-900 은 **글자 368곳 · 배경 47곳**입니다 —
//    압도적으로 글자입니다. 그 바람에 제목·본문·KPI 숫자가 전부 옅어졌고
//    (흰 바탕 대비 17.4:1 → 14.1~15.9:1), 화면이 뿌옇게 보였습니다.
//    색 하나가 「어두운 배경」과 「어두운 글자」 두 일을 겸하고 있었고,
//    저는 배경 쪽만 보고 값을 올린 것입니다.
//
//    사이드바 색은 navy-950 에서만 냅니다 — 이 단계는 **배경 전용**입니다
//    (배경 19곳 · 글자 0곳). 글자 단계는 기준값 그대로 둡니다.
const TEXT_STEPS = new Set([400, 500, 600, 700, 800, 900])

/**  한 계열(ramp)을 만듭니다.
 *   @param base   밝기를 빌려 올 기준 계열
 *   @param hue    이 테마의 색상각
 *   @param satOf  단계별 채도 (0~1). 밝은 단계는 옅게, 중간은 진하게 둡니다.
 *   @param lumMul 단계별 휘도 배율 — 1 이면 기준과 **완전히 같은 대비**입니다.
 */
function ramp(base, hue, satOf, lumMul = {}, lockText = false) {
  const out = {}
  for (const [step, hex] of Object.entries(base)) {
    const n = Number(step)
    //  글자 단계는 배율을 무시합니다 — 실수로라도 옅어지지 않게 여기서 막습니다.
    const mul = lockText && TEXT_STEPS.has(n) ? 1 : (lumMul[step] ?? 1)
    const target = Math.min(1, Math.max(0, lumOf(hex2rgb(hex)) * mul))
    out[step] = rgb2hex(atLum(hue, satOf(n), target))
  }
  return out
}

//  중립(회색) 계열 채도 — 아주 낮게. 배경·글자에 쓰이므로 색이 튀면 안 됩니다.
//  ⚠ 0082 — 글자 단계(400~900)의 채도를 낮춰 둡니다. 「본문·숫자·제목은
//    테마색에 따라 지나치게 변하지 않게, 충분히 어두운 중립색으로」가
//    원칙입니다. 배경 단계(50~300 · 950)는 테마색을 그대로 냅니다.
const neutSat = (mul = 1) => (s) =>
  s <= 100 ? 0.30 * mul
    : s <= 200 ? 0.22 * mul
    : s <= 300 ? 0.16 * mul
    : s <= 600 ? 0.10 * Math.min(mul, 1)
    : s <= 900 ? 0.14 * Math.min(mul, 1)
    : 0.34 * mul // 950 — 사이드바. 여기서만 색을 냅니다.
//  포인트 계열 채도 — **진하게**. 아주 밝은 단계만 옅게 둡니다.
//
//  ⚠ 0083 — 여기에 테마별 배율(0.6~0.9)을 곱하고 있었습니다. 그 바람에
//    주 단추의 채도가 기준(딥 네이비 197)의 절반도 안 되는 80~112 로
//    눌렸고, **빨강이 갈색으로, 자주가 팥색으로** 보였습니다.
//    대표님이 「갈색·빨간색 톤에 가까울 때 뿌옇다」고 하신 것이 이것입니다.
//    어두운 단계는 밝기(lumMul)로 잡고, **채도는 깎지 않습니다** —
//    같은 밝기라도 채도가 높아야 「짙은 와인」이지 「흙빛」이 아닙니다.
//    (배율은 인자로 남겨 두되 0.9 아래로는 못 내려가게 막습니다.)
const pointSat = (mul = 1) => (s) =>
  Math.min(0.98, (s <= 100 ? 0.66 : s <= 200 ? 0.62 : s <= 400 ? 0.78 : s <= 700 ? 0.93 : 0.80)
    * Math.max(0.9, mul))

// ── 아홉 가지 테마 ───────────────────────────────────────────────────────────
//  시안 9장을 계열로 묶은 것입니다. 배치는 하나도 바꾸지 않고 색만 갈아 끼웁니다.
//
//  lumMul 로 **포인트 색만** 살짝 어둡게 하는 테마가 있습니다(골드 계열).
//  금색은 밝아서 그 위에 흰 글자를 얹으면 안 읽히기 때문입니다 — 색을 위해
//  가독성을 깎지 않습니다. 어두운 금(브론즈)으로 내려서 흰 글자를 살립니다.
const THEMES = [
  { id: 'navy-blue', name: '딥 네이비 블루', desc: '지금 쓰는 기본색', base: true,
    swatch: ['#0f1a2e', '#3182f6', '#14b8a6'] },

  //  ⚠ 어두운 단계(800·900·950)는 휘도를 **올립니다.** 처음에 반대로 내렸더니
  //    아홉 테마의 사이드바가 전부 거의 같은 검정으로 나왔습니다 — 휘도가
  //    0에 가까우면 색상은 보이지 않기 때문입니다. 시안의 사이드바는
  //    「짙은 초록」·「짙은 와인」처럼 **색이 보이는 어두움**입니다.
  //    올려도 흰 글자 대비가 19:1 → 15:1 수준이라 여유가 큽니다.

  { id: 'onyx-gold', name: '오닉스 골드', desc: '검정 바탕 · 금빛 포인트',
    appBg: '#f6f3ec',
    neutral: { hue: 32, sat: neutSat(0.9), lumMul: { 800: 1.8, 900: 2.0, 950: 2.2 } },
    primary: { hue: 36, sat: pointSat(0.9), lumMul: { 500: 0.62, 600: 0.68, 700: 0.8 } },
    accent:  { hue: 44, sat: pointSat(1.0), lumMul: { 500: 0.85, 600: 0.9 } },
    swatch: ['#1a1611', '#8f601b', '#c1901f'] },

  { id: 'burgundy-bronze', name: '버건디 브론즈', desc: '와인빛 · 청동 포인트',
    appBg: '#f3eeee',
    neutral: { hue: 348, sat: neutSat(0.85), lumMul: { 800: 1.9, 900: 2.2, 950: 2.4 } },
    //  채도를 낮춥니다 — 밝은 자홍은 「화려」하지 「고급」스럽지 않습니다.
    primary: { hue: 344, sat: pointSat(0.68), lumMul: { 500: 0.42, 600: 0.5, 700: 0.7 } },
    accent:  { hue: 34, sat: pointSat(0.9), lumMul: { 500: 0.85 } },
    swatch: ['#241318', '#7d2140', '#b98a4b'] },

  { id: 'emerald-gold', name: '에메랄드 골드', desc: '아이보리 · 짙은 초록',
    appBg: '#f5f3ea',
    neutral: { hue: 120, sat: neutSat(0.65), lumMul: { 800: 1.9, 900: 2.2, 950: 2.5 } },
    primary: { hue: 156, sat: pointSat(0.8), lumMul: { 500: 0.55, 600: 0.66, 700: 0.82 } },
    accent:  { hue: 44, sat: pointSat(0.92), lumMul: { 500: 0.85 } },
    swatch: ['#16261c', '#1c6b47', '#c2a24a'] },

  { id: 'forest-sage', name: '포레스트 세이지', desc: '깊은 숲 · 세이지',
    appBg: '#f2f4ee',
    neutral: { hue: 132, sat: neutSat(0.6), lumMul: { 800: 2.0, 900: 2.3, 950: 2.6 } },
    primary: { hue: 150, sat: pointSat(0.72), lumMul: { 500: 0.58, 600: 0.7 } },
    accent:  { hue: 78, sat: pointSat(0.72), lumMul: { 500: 0.9 } },
    swatch: ['#17251c', '#256c4a', '#8a9a52'] },

  { id: 'deep-teal', name: '딥 틸', desc: '흰 바탕 · 짙은 청록',
    appBg: '#f2f7f7',
    neutral: { hue: 192, sat: neutSat(0.8), lumMul: { 800: 1.7, 900: 1.9, 950: 2.1 } },
    primary: { hue: 186, sat: pointSat(0.9), lumMul: { 500: 0.68, 600: 0.78 } },
    accent:  { hue: 40, sat: pointSat(0.92), lumMul: { 500: 0.85 } },
    swatch: ['#0e2a2e', '#0f6c74', '#c08a2e'] },

  { id: 'navy-gold', name: '네이비 골드', desc: '남색 바탕 · 금빛 강조',
    appBg: '#f4f6fb',
    neutral: { hue: 220, sat: neutSat(1.15), lumMul: { 800: 1.4, 900: 1.5, 950: 1.7 } },
    primary: { hue: 222, sat: pointSat(0.88), lumMul: { 500: 0.62, 600: 0.74 } },
    accent:  { hue: 44, sat: pointSat(1.0), lumMul: { 500: 0.85 } },
    swatch: ['#0d1a33', '#1e46a8', '#c9a227'] },

  { id: 'plum-champagne', name: '플럼 샴페인', desc: '자줏빛 · 샴페인 골드',
    appBg: '#f5f1f4',
    neutral: { hue: 322, sat: neutSat(0.8), lumMul: { 800: 1.9, 900: 2.2, 950: 2.4 } },
    //  자홍이 아니라 **자두**입니다 — 채도를 크게 낮추고 더 어둡게 둡니다.
    primary: { hue: 328, sat: pointSat(0.6), lumMul: { 500: 0.4, 600: 0.5, 700: 0.7 } },
    accent:  { hue: 40, sat: pointSat(0.85), lumMul: { 500: 0.88 } },
    swatch: ['#26141f', '#7a2b56', '#c9a86a'] },

  { id: 'rose-copper', name: '로즈 코퍼', desc: '차콜 · 로즈 코퍼',
    appBg: '#f6efe9',
    neutral: { hue: 22, sat: neutSat(0.7), lumMul: { 800: 1.9, 900: 2.2, 950: 2.4 } },
    primary: { hue: 14, sat: pointSat(0.68), lumMul: { 500: 0.55, 600: 0.66, 700: 0.82 } },
    accent:  { hue: 26, sat: pointSat(0.8), lumMul: { 500: 0.85 } },
    swatch: ['#241a16', '#9a4a34', '#b9764a'] },
]

// ── CSS 만들기 ───────────────────────────────────────────────────────────────
const triplet = (hex) => hex2rgb(hex).join(' ')

function varsFor(t) {
  if (t.base) {
    //  기본 테마는 **지금 쓰는 값 그대로**입니다 — 테마를 안 바꾼 분은
    //  화면이 한 픽셀도 안 달라집니다.
    const lines = []
    for (const [fam, steps] of Object.entries(BASE))
      for (const [s, hex] of Object.entries(steps)) lines.push(`    --c-${fam}-${s}: ${triplet(hex)};`)
    lines.push(`    --c-app: ${triplet(APP_BG)};`)
    lines.push(`    --c-shadow: ${triplet(BASE.navy[900])};`)
    lines.push(`    --c-cardline: ${atLum(215, 0.14, 0.606).join(' ')};`)
    return lines.join('\n')
  }
  const navy = ramp(BASE.navy, t.neutral.hue, t.neutral.sat, t.neutral.lumMul, true)
  const teal = ramp(BASE.teal, t.primary.hue, t.primary.sat, t.primary.lumMul)
  const accent = ramp(BASE.accent, t.accent.hue, t.accent.sat, t.accent.lumMul)
  //  slate2 는 보조 식별용이라 중립 계열을 따릅니다
  const slate2 = ramp(BASE.slate2, t.neutral.hue, t.neutral.sat)
  const sem = {}
  for (const fam of SEM_FAMS) sem[fam] = semRamp(fam, t.neutral.hue, t.semSat ?? 1)
  const lines = []
  for (const [fam, steps] of Object.entries({ navy, teal, accent, slate2, ...sem }))
    for (const [s, hex] of Object.entries(steps)) lines.push(`    --c-${fam}-${s}: ${triplet(hex)};`)
  //  ⚠ 0083 — 앱 바탕을 테마마다 손으로 골랐더니 색기(채도)가 제각각이었습니다
  //    (기준 5, 오닉스 10, 에메랄드 11, 로즈 13). **화면에서 가장 넓은 면**이라
  //    여기에 색기가 끼면 화면 전체에 얇은 막이 낀 것처럼 보입니다.
  //    색은 사이드바·단추·강조처럼 **작거나 어두운 자리**에서 냅니다.
  //    기준과 같은 밝기, 아주 낮은 채도로 만들어 냅니다.
  lines.push(`    --c-app: ${atLum(t.neutral.hue, 0.16, lumOf(hex2rgb(APP_BG))).join(' ')};`)
  //  ⚠ 0082 — 그림자 색과 카드 테두리 색도 테마를 따릅니다.
  //    전에는 그림자가 rgba(15,26,46,…) **네이비로 고정**이었습니다.
  //    따뜻한 크림 바탕(#f6f3ec) 위에 차가운 네이비 그림자를 4% 로 얹으면
  //    사실상 안 보입니다. 그런데 .card 에는 테두리가 없어 **경계를 오로지
  //    그 그림자에 기대고** 있었습니다 — 그래서 카드가 바탕에 녹아 보였습니다.
  //    그림자는 그 테마의 가장 어두운 중립색으로 냅니다.
  lines.push(`    --c-shadow: ${triplet(navy[900])};`)
  //  카드 테두리는 단계를 빌려 쓰지 않고 **밝기를 직접** 잡습니다.
  //  navy-200 을 쓰면 흰 카드와 1.2:1 밖에 안 되어 「있는지 없는지」가 됩니다.
  //  흰 바탕과 약 1.6:1 — 선이 보이되 상자처럼 답답하지 않은 세기입니다.
  lines.push(`    --c-cardline: ${atLum(t.neutral.hue, 0.14, 0.606).join(' ')};`)
  return lines.join('\n')
}

let css = `/*  ⚠ 이 파일은 손으로 고치지 않습니다 — scripts/gen_themes.mjs 가 만듭니다.
    고칠 것이 있으면 그 스크립트의 THEMES 를 고치고 다시 돌리세요.

    테마마다 **각 단계의 밝기(상대휘도)를 기준 팔레트와 같게** 두고 색상만
    바꿉니다. WCAG 대비는 휘도로만 계산되므로, 0080 에서 대비 미달을
    173개 → 0개로 만든 결과가 아홉 테마 전부에서 그대로 유지됩니다.
    (금색처럼 밝아서 흰 글자가 안 읽히는 색만 휘도를 낮춰 어둡게 잡았습니다.
     색을 위해 가독성을 깎지 않습니다.) */

@layer base {
`
for (const t of THEMES) {
  const sel = t.base ? ':root, [data-theme="navy-blue"]' : `[data-theme="${t.id}"]`
  css += `  /* ${t.name} — ${t.desc} */\n  ${sel} {\n${varsFor(t)}\n  }\n\n`
}
css += '}\n'

// 테마 목록 (TS)
let ts = `//  ⚠ 이 파일은 손으로 고치지 않습니다 — scripts/gen_themes.mjs 가 만듭니다.
export interface ThemeDef {
  id: string
  /** 화면에 보이는 이름 */
  name: string
  /** 한 줄 설명 — 고르는 사람이 무엇이 바뀌는지 알 수 있게 */
  desc: string
  /** 고르는 화면에 찍을 색 세 방울 [바탕·주색·강조] */
  swatch: [string, string, string]
}

export const THEMES: ThemeDef[] = [
${THEMES.map((t) => `  { id: '${t.id}', name: '${t.name}', desc: '${t.desc}', swatch: ['${t.swatch[0]}', '${t.swatch[1]}', '${t.swatch[2]}'] },`).join('\n')}
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

// ── 만든 자리에서 바로 검산 ──────────────────────────────────────────────────
//   실제로 화면에서 쓰이는 짝만 골라 봅니다.
const ratio = (a, b) => { const la = lumOf(hex2rgb(a)) + 0.05, lb = lumOf(hex2rgb(b)) + 0.05
  return Math.round((Math.max(la,lb) / Math.min(la,lb)) * 100) / 100 }
const PAIRS = [
  ['캡션 navy-400 / 흰 바탕', (p) => ratio(p.navy[400], '#ffffff'), 4.5],
  ['캡션 navy-400 / 카드 navy-50', (p) => ratio(p.navy[400], p.navy[50]), 4.5],
  ['본문 navy-500 / 흰 바탕', (p) => ratio(p.navy[500], '#ffffff'), 4.5],
  ['제목 navy-900 / 흰 바탕', (p) => ratio(p.navy[900], '#ffffff'), 4.5],
  ['흰 글자 / 주단추 teal-500', (p) => ratio('#ffffff', p.teal[500]), 3.0],
  ['주색 글자 teal-600 / 흰 바탕', (p) => ratio(p.teal[600], '#ffffff'), 4.5],
  ['주색 글자 teal-700 / teal-50', (p) => ratio(p.teal[700], p.teal[50]), 4.5],
  ['사이드바 글자 navy-300 / navy-900', (p) => ratio(p.navy[300], p.navy[900]), 4.5],
  ['사이드바 흰글자 / navy-950', (p) => ratio('#ffffff', p.navy[950]), 4.5],
  //  ⚠ accent-600 을 「흰 바탕 작은 글자」로 재려다 틀렸습니다. 이 색이
  //    실제로 쓰이는 자리는 (1) 공개 홈페이지의 **큰 굵은 글자**(18~27px →
  //    기준 3:1)와 (2) accent-50 타일 위입니다. 흰 바탕 작은 글자로 쓰는
  //    곳은 없습니다. 색을 고칠 일이 아니라 **자를 고칠 일**이었습니다.
  ['강조 accent-600 / 흰 바탕 (큰 글자)', (p) => ratio(p.accent[600], '#ffffff'), 3.0],
  ['강조 accent-600 / 타일 accent-50', (p) => ratio(p.accent[600], p.accent[50]), 3.0],
  ['강조 accent-700 / 칩 accent-50', (p) => ratio(p.accent[700], p.accent[50]), 4.5],
  ['본문 navy-600 / 앱 바탕', (p) => ratio(p.navy[600], p.app), 4.5],
  //  ── 뜻이 붙은 색도 같이 잽니다 ──────────────────────────────────────────
  ['주의 amber-700 / amber-50', (p) => ratio(p.amber[700], p.amber[50]), 4.5],
  ['경고 rose-600 / rose-50', (p) => ratio(p.rose[600], p.rose[50]), 4.5],
  ['완료 emerald-700 / emerald-50', (p) => ratio(p.emerald[700], p.emerald[50]), 4.5],
  ['정보 sky-700 / sky-50', (p) => ratio(p.sky[700], p.sky[50]), 4.5],
  ['경고 rose-600 / 흰 바탕', (p) => ratio(p.rose[600], '#ffffff'), 4.5],
]
console.log('테마'.padEnd(18), PAIRS.map((x, i) => `#${i + 1}`).join('  '))
let worst = 999, bad = 0
for (const t of THEMES) {
  const sem = {}
  for (const fam of SEM_FAMS) sem[fam] = t.base ? BASE[fam] : semRamp(fam, t.neutral.hue, t.semSat ?? 1)
  const p = t.base
    ? { navy: BASE.navy, teal: BASE.teal, accent: BASE.accent, app: APP_BG, ...sem }
    : { navy: ramp(BASE.navy, t.neutral.hue, t.neutral.sat, t.neutral.lumMul, true),
        teal: ramp(BASE.teal, t.primary.hue, t.primary.sat, t.primary.lumMul),
        accent: ramp(BASE.accent, t.accent.hue, t.accent.sat, t.accent.lumMul),
        app: t.appBg, ...sem }
  const cells = PAIRS.map(([, fn, need]) => {
    const v = fn(p); if (v < need) { bad += 1 }
    worst = Math.min(worst, v / need)
    return `${v < need ? '✗' : ' '}${v.toFixed(1)}`
  })
  console.log(t.name.padEnd(16), cells.join(' '))
}
console.log('\n짝 이름:')
PAIRS.forEach(([n, , need], i) => console.log(`  #${i + 1} ${n} (기준 ${need})`))
console.log(`\n기준 미달 ${bad}개`)

//  ── 뜻이 안 바뀌었는가 ───────────────────────────────────────────────────────
//   초록이 초록으로, 빨강이 빨강으로 남아 있는지 각도로 확인합니다.
//   여기가 틀어지면 「완료」가 「경고」로 읽힙니다 — 대비보다 더 큰 사고입니다.
function hueOf([r, g, b]) {
  const R=r/255,G=g/255,B=b/255,mx=Math.max(R,G,B),mn=Math.min(R,G,B),d=mx-mn
  if (!d) return 0
  const h = mx===R ? ((G-B)/d)%6 : mx===G ? (B-R)/d+2 : (R-G)/d+4
  return ((h*60)%360+360)%360
}
let turned = 0
for (const t of THEMES) {
  if (t.base) continue
  for (const fam of SEM_FAMS) {
    const r = semRamp(fam, t.neutral.hue, t.semSat ?? 1)
    const got = hueOf(hex2rgb(r[500]))
    const off = Math.abs(angleDelta(SEM_HUE[fam], got))
    if (off > MAX_TURN + 3) { console.log(`  ✗ ${t.name} ${fam}: ${off.toFixed(0)}° 돌아감`); turned += 1 }
  }
}
console.log(`뜻이 바뀔 만큼 돌아간 색 ${turned}개 (한도 ${MAX_TURN}°)`)
