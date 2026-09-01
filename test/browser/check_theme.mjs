import { chromium, EXEC } from './_pw.mjs'
import { requireFont } from './_font.mjs'
import * as W from './walk_lib.mjs'
import { measure } from './a11y_measure.mjs'

// ─────────────────────────────────────────────────────────────────────────────
//  화면 색 (테마) — 0081
//
//  지키는 것은 넷입니다.
//
//   ① 아홉 가지가 **실제로** 적용된다 (PC · 폰 둘 다)
//   ② 고른 색이 **남는다** — 새로고침해도, 다시 로그인해도
//   ③ 어떤 색을 골라도 **글자가 읽히는 정도가 나빠지지 않는다**
//   ④ 뜻이 붙은 색(완료 초록 · 경고 빨강)의 **뜻이 안 바뀐다**
//
//  ③ 이 이 검사의 핵심입니다. 색을 아홉 벌 만들어 두면, 그중 하나쯤은
//  「예쁜데 안 읽히는」 것이 되기 쉽습니다. 기본색에서 잰 값을 기준선으로
//  두고 **그보다 나빠지면 실패**로 봅니다.
// ─────────────────────────────────────────────────────────────────────────────

let pass = 0
let fail = 0
const ok = (name, cond, detail = '') => {
  if (cond) pass += 1
  else fail += 1
  console.log(`${cond ? ' OK ' : 'FAIL'} | ${name}${detail && !cond ? ` — ${detail}` : ''}`)
}

//  ⚠ 0086 — 이름이 바뀐 테마가 있습니다(버건디 브론즈 → 버건디 슬레이트,
//    플럼 샴페인 → 플럼 인디고, 로즈 코퍼 → 스틸 플래티넘).
//    사이드바를 「적갈색 검정 / 와인빛 검정」에서 차가운 슬레이트로 옮기면서
//    성격이 달라졌기 때문입니다. 예전 이름이 저장돼 있던 분은 기본색으로
//    돌아갑니다 — 아래 ②-2 가 그것을 확인합니다.
const THEMES = [
  'navy-blue', 'navy-gold', 'emerald-gold', 'forest-sage', 'deep-teal',
  'onyx-gold', 'burgundy-slate', 'plum-indigo', 'steel-platinum',
]
const b = await chromium.launch({ executablePath: EXEC })

//  ⚠ 자로 재기 전에 **글꼴이 실렸는지** 먼저 봅니다. 안 실린 곳에서는
//    글자 폭이 달라 간격·넘침·대비가 전부 다르게 나옵니다 (_font.mjs 참고).
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
  const p = await ctx.newPage()
  await p.goto(`${W.BASE}/login`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(2500)
  await requireFont(p, b)
  await ctx.close()
}

async function open(role, width, theme, path) {
  const prof = { ...W.profileFor(role), font_scale: 'normal' }
  const state = { profile: prof, reqs: 0, writes: [] }
  const ctx = await b.newContext({ viewport: { width, height: 900 }, isMobile: width < 640, hasTouch: width < 640 })
  W.wire(ctx, state)
  const p = await ctx.newPage()
  await p.addInitScript(([k, u, t]) => {
    window.localStorage.setItem(k, JSON.stringify({ access_token: 't', token_type: 'bearer',
      expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u }))
    if (t) window.localStorage.setItem('beonemirae-ops:theme', t)
  }, ['beonemirae-ops:auth', { id: prof.id, aud: 'authenticated', email: prof.email, app_metadata: {}, user_metadata: {} }, theme])
  await p.goto(`${W.BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await W.settle(p, state)
  await p.waitForTimeout(350)
  return { ctx, p, state }
}

/** 지금 화면에서 실제로 칠해진 색 몇 군데 */
async function paint(p) {
  return await p.evaluate(() => {
    const bgOf = (sel) => {
      const el = document.querySelector(sel)
      return el ? getComputedStyle(el).backgroundColor : null
    }
    return {
      applied: document.documentElement.getAttribute('data-theme'),
      body: getComputedStyle(document.body).backgroundColor,
      //  주 단추(저장·추가) — 테마가 가장 잘 드러나는 자리
      primary: bgOf('.btn-primary') ?? bgOf('[class*="bg-teal-500"]'),
    }
  })
}

// ── ① 아홉 가지가 실제로 적용되는가 (PC · 폰) ───────────────────────────────
const seen = { pc: new Map(), phone: new Map() }
for (const theme of THEMES) {
  for (const [tag, role, width, path] of [['pc', 'admin', 1280, '/'], ['phone', 'field', 390, '/today']]) {
    const { ctx, p } = await open(role, width, theme, path)
    const q = await paint(p)
    ok(`${theme} · ${tag} — data-theme 가 붙음`, q.applied === theme, `${q.applied}`)
    ok(`${theme} · ${tag} — 바탕색이 칠해짐`, !!q.body && q.body !== 'rgba(0, 0, 0, 0)', `${q.body}`)
    ok(`${theme} · ${tag} — 주 단추에 배경색이 있음`, !!q.primary && q.primary !== 'rgba(0, 0, 0, 0)', `${q.primary}`)
    seen[tag].set(theme, `${q.body}|${q.primary}`)
    await ctx.close()
  }
}
//  ⚠ 「적용됐다」는 말은 **서로 다르다**는 뜻이기도 합니다. 변수가 안 붙어도
//    화면은 멀쩡히 그려지기 때문에, 아홉 개가 전부 같은 색이면 그건 실패입니다.
for (const tag of ['pc', 'phone']) {
  ok(`${tag} — 아홉 가지가 서로 다른 색`, new Set(seen[tag].values()).size === THEMES.length,
    `서로 다른 색 ${new Set(seen[tag].values()).size}가지`)
}

// ── ② 고른 색이 남는가 ──────────────────────────────────────────────────────
{
  const { ctx, p } = await open('field', 390, null, '/today')
  //  기본값으로 시작
  ok('처음에는 기본색', (await paint(p)).applied === 'navy-blue', (await paint(p)).applied)
  //  오른쪽 위 단추로 열어서 고릅니다 — 실제 사용자가 하는 그대로
  await p.click('[data-theme-open]')
  await p.waitForTimeout(400)
  const picker = await p.locator('[data-theme-picker]').count()
  ok('오른쪽 위 단추로 고르는 창이 열림', picker > 0)
  const opts = await p.locator('[data-theme-option]').count()
  ok('아홉 가지가 모두 나옴', opts === THEMES.length, `${opts}개`)
  await p.click('[data-theme-option="forest-sage"]')
  await p.waitForTimeout(400)
  ok('누르면 그 자리에서 바뀜', (await paint(p)).applied === 'forest-sage', (await paint(p)).applied)

  //  새로고침
  await p.reload({ waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(700)
  ok('새로고침해도 그대로', (await paint(p)).applied === 'forest-sage', (await paint(p)).applied)
  //  ⚠ React 가 뜨기 **전에** 붙어야 화면이 번쩍이지 않습니다. 첫 그림에
  //    이미 붙어 있는지를 봅니다(index.html 의 짧은 스크립트).
  const early = await p.evaluate(() => document.documentElement.getAttribute('data-theme'))
  ok('첫 그림부터 붙어 있음 (번쩍임 없음)', early === 'forest-sage', `${early}`)

  //  다른 화면으로 이동해도
  await p.goto(`${W.BASE}/clients`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(600)
  ok('다른 화면으로 가도 그대로', (await paint(p)).applied === 'forest-sage')
  await ctx.close()
}

// ── ②-2 저장된 값이 이상하면 기본색으로 ─────────────────────────────────────
//   ⚠ 나중에 테마 이름을 바꾸면 예전 값이 남아 있게 됩니다. 그때 색이 하나도
//     안 정해진 화면이 되면 안 됩니다.
{
  const { ctx, p } = await open('field', 390, 'no-such-theme', '/today')
  const q = await paint(p)
  ok('모르는 이름이 저장돼 있으면 기본색으로', q.applied === 'navy-blue' || q.applied === 'no-such-theme'
    ? q.applied === 'navy-blue' : false, `${q.applied}`)
  ok('그래도 바탕은 칠해져 있음', !!q.body && q.body !== 'rgba(0, 0, 0, 0)', `${q.body}`)
  await ctx.close()
}

// ── ③ 어떤 색을 골라도 읽히는 정도가 나빠지지 않는가 ────────────────────────
//   기본색에서 잰 값이 기준선입니다. 그보다 **나빠지면** 실패입니다.
const baseline = {}
for (const theme of THEMES) {
  let gray = 0, small = 0, tap = 0
  const worst = []
  for (const [role, path] of [['field', '/today'], ['field', '/collection'], ['admin', '/'], ['client', '/portal']]) {
    const { ctx, p } = await open(role, 1280, theme, path)
    const m = await measure(p)
    gray += m.gray; small += m.small; tap += m.tooSmall
    if (m.gray) worst.push(...m.grayList.slice(0, 2))
    await ctx.close()
  }
  if (theme === 'navy-blue') { baseline.gray = gray; baseline.small = small; baseline.tap = tap }
  ok(`${theme} — 대비 미달이 기본색보다 늘지 않음`, gray <= baseline.gray,
    `${gray}개 (기본색 ${baseline.gray}개) · ${worst.slice(0, 2).join(' | ')}`)
  ok(`${theme} — 작은 글자가 기본색보다 늘지 않음`, small <= baseline.small, `${small} / ${baseline.small}`)
  ok(`${theme} — 44px 미만이 기본색보다 늘지 않음`, tap <= baseline.tap, `${tap} / ${baseline.tap}`)
}

// ── ④ 뜻이 붙은 색의 뜻이 안 바뀌는가 ───────────────────────────────────────
//   완료는 초록, 경고는 빨강, 주의는 노랑으로 **남아야** 합니다.
//   색상각(hue)이 제 무리를 벗어나면 실패입니다 — 「완료」가 「경고」로 읽힙니다.
const FAMILY = [
  ['emerald', '완료 · 상승', 100, 190],
  ['amber', '주의', 20, 60],
  ['rose', '경고 · 하락', 330, 15],
  ['sky', '정보', 180, 230],
]
for (const theme of THEMES) {
  const { ctx, p } = await open('admin', 1280, theme, '/')
  const hues = await p.evaluate((fams) => {
    const out = {}
    for (const [fam] of fams) {
      const v = getComputedStyle(document.documentElement).getPropertyValue(`--c-${fam}-500`).trim()
      const [r, g, b] = v.split(/\s+/).map(Number)
      const R = r / 255, G = g / 255, B = b / 255
      const mx = Math.max(R, G, B), mn = Math.min(R, G, B), d = mx - mn
      let h = 0
      if (d) h = mx === R ? ((G - B) / d) % 6 : mx === G ? (B - R) / d + 2 : (R - G) / d + 4
      out[fam] = ((h * 60) % 360 + 360) % 360
    }
    return out
  }, FAMILY)
  for (const [fam, label, lo, hi] of FAMILY) {
    const h = hues[fam]
    //  rose 는 0도를 넘어갑니다 (330~360, 0~15)
    const inside = lo <= hi ? h >= lo && h <= hi : h >= lo || h <= hi
    ok(`${theme} — 「${label}」 색이 제 무리 안에 있음`, inside, `${fam}-500 색상각 ${Math.round(h)}° (${lo}~${hi})`)
  }
  await ctx.close()
}

// ── ⑤ 선명도 — 화면 전체 (0082) ─────────────────────────────────────────────
//
//   ⚠ 여태 자(a11y_measure)가 **main 안만** 봤습니다. 그래서 사이드바·머리띠·
//     하단 탭은 한 번도 잰 적이 없었고, 거기서 「밝은 바탕용 캡션색(navy-400)」이
//     어두운 사이드바에 얹혀 3.2:1 로 있던 것을 못 잡았습니다.
//     여기서는 **body 전체**를 봅니다.
//
//   ⚠ 그리고 **조상에 걸린 opacity 를 곱해서** 봅니다. 부모를 흐리게 만들면
//     자식 글자도 같이 흐려집니다 — 실제로 「시작하기」 목록과 달력 지난 달
//     칸이 그 방식이라 19px 제목이 2.3:1 까지 떨어져 있었습니다.
//     흐림은 **배경색에만** 넣습니다.
async function sharpness(p) {
  return await p.evaluate(() => {
    const srgb = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
    const lum = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b)
    const parse = (c) => { const m = c.match(/rgba?\((\d+), ?(\d+), ?(\d+)(?:, ?([\d.]+))?/)
      return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null }
    const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el)
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0' }
    const effOpacity = (el) => { let n = el, o = 1
      while (n && n !== document.documentElement) { o *= Number(getComputedStyle(n).opacity || 1); n = n.parentElement }
      return o }
    const bgOf = (el) => { let n = el
      while (n && n !== document.documentElement) { const q = parse(getComputedStyle(n).backgroundColor)
        if (q && q[3] > 0.55) return q.slice(0, 3); n = n.parentElement }
      return [255, 255, 255] }
    const ratio = (f, g) => { const a = lum(f) + 0.05, c = lum(g) + 0.05; return a > c ? a / c : c / a }
    const low = []
    let faded = 0
    for (const el of [...document.body.querySelectorAll('*')].filter(vis)) {
      if (![...el.childNodes].some((x) => x.nodeType === 3 && (x.textContent ?? '').trim())) continue
      //  비활성 컨트롤은 WCAG 대비 기준의 적용 대상이 아닙니다 —
      //  「지금은 못 누른다」를 흐리게 보여 주는 것이 그 자체로 정보입니다.
      if (el.closest('[disabled],[aria-disabled="true"]')) continue
      const st = getComputedStyle(el); const fg = parse(st.color); if (!fg) continue
      const px = parseFloat(st.fontSize), bold = Number(st.fontWeight) >= 700
      const need = (px >= 24 || (px >= 18.66 && bold)) ? 3 : 4.5
      const bg = bgOf(el)
      const op = effOpacity(el) * (fg[3] ?? 1)
      if (op < 0.95) faded += 1
      const eff = fg.slice(0, 3).map((v, i) => v * op + bg[i] * (1 - op))
      const r = ratio(eff, bg)
      if (r < need) low.push(`${Math.round(px)}px ${r.toFixed(1)}:1 "${(el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 16)}"`)
    }
    return { low, faded }
  })
}

//  ⚠ 기본 테마(딥 네이비 블루)에는 아는 미달이 남아 있습니다 — **브랜드 파랑
//    위의 흰 글자**(주 단추 라벨, 17~18px, 3.7:1)입니다. 대표님이 이 색을
//    가독성 레퍼런스로 지정하셨고, 「주요 UI 최소 3:1」 기준은 넘기므로
//    색을 저희가 임의로 바꾸지 않았습니다. 다만 **개수를 못 박아** 둡니다 —
//    이보다 늘면 다른 곳이 나빠진 것입니다.
const KNOWN_BRAND_CTA = 8
const SHARP_SCREENS = [['대시보드', 'admin', '/'], ['오늘 일정', 'field', '/today'],
  ['거래처', 'admin', '/clients'], ['수거 입력', 'field', '/collection'], ['설정', 'admin', '/settings']]
for (const theme of THEMES) {
  let low = 0, faded = 0
  const worst = []
  for (const [label, role, path] of SHARP_SCREENS) {
    for (const width of [1440, 390]) {
      const { ctx, p } = await open(role, width, theme, path)
      const r = await sharpness(p)
      low += r.low.length; faded += r.faded
      if (r.low.length) worst.push(`[${label}/${width}] ${r.low.slice(0, 2).join(' | ')}`)
      await ctx.close()
    }
  }
  const budget = theme === 'navy-blue' ? KNOWN_BRAND_CTA : 0
  ok(`${theme} — 화면 전체에 대비 미달 없음`, low <= budget, `${low}개 (허용 ${budget}) · ${worst.slice(0, 2).join(' / ')}`)
  //  글자에 걸린 투명도는 0 이어야 합니다 — 흐림은 배경색에만.
  ok(`${theme} — 부모 opacity 로 흐려진 글자 없음`, faded === 0, `${faded}개`)
}

// ── ⑥ 카드 경계가 보이는가 (0082) ───────────────────────────────────────────
//   .card 에 테두리가 아예 없어서 경계를 그림자에만 기대고 있었습니다.
//   그 그림자는 네이비로 고정이라 따뜻한 바탕의 테마에서는 거의 안 보였고,
//   그래서 카드가 바탕에 녹아 「경계가 또렷하지 않다」가 됐습니다.
for (const theme of THEMES) {
  const { ctx, p } = await open('admin', 1440, theme, '/')
  const r = await p.evaluate(() => {
    const srgb = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
    const lum = ([r2, g, b]) => 0.2126 * srgb(r2) + 0.7152 * srgb(g) + 0.0722 * srgb(b)
    const parse = (c) => { const m = c.match(/rgba?\((\d+), ?(\d+), ?(\d+)/); return m ? [+m[1], +m[2], +m[3]] : null }
    //  ⚠ 첫 번째 .card 를 집으면 바탕이 흰색이 아닌 카드(경고 카드 등)를
    //    집을 수 있습니다. **흰 카드**를 찾아 재야 값이 맞습니다.
    const card = [...document.querySelectorAll('.card')]
      .find((el) => getComputedStyle(el).backgroundColor === 'rgb(255, 255, 255)')
      ?? document.querySelector('.card')
    if (!card) return null
    const st = getComputedStyle(card)
    const line = parse(st.borderTopColor), face = parse(st.backgroundColor)
    if (!line || !face) return null
    const a = lum(line) + 0.05, b2 = lum(face) + 0.05
    return { w: parseFloat(st.borderTopWidth), ratio: Math.round((a > b2 ? a / b2 : b2 / a) * 100) / 100,
      shadow: st.boxShadow.slice(0, 40) }
  })
  ok(`${theme} — 카드에 테두리가 있음`, !!r && r.w >= 1, r ? `${r.w}px` : '카드를 못 찾음')
  ok(`${theme} — 카드 테두리가 눈에 보임`, !!r && r.ratio >= 1.25, r ? `${r.ratio}:1` : '-')
  ok(`${theme} — 카드 그림자가 테마를 따름`, !!r && !/15, ?26, ?46/.test(r.shadow), r ? r.shadow : '-')
  await ctx.close()
}

await b.close()
console.log(`check_theme :: 검사 ${pass + fail} · 실패 ${fail}`)
process.exit(fail ? 1 : 0)
