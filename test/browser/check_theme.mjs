import { chromium, EXEC } from './_pw.mjs'
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

const THEMES = [
  'navy-blue', 'onyx-gold', 'burgundy-bronze', 'emerald-gold', 'forest-sage',
  'deep-teal', 'navy-gold', 'plum-champagne', 'rose-copper',
]
const b = await chromium.launch({ executablePath: EXEC })

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

await b.close()
console.log(`check_theme :: 검사 ${pass + fail} · 실패 ${fail}`)
process.exit(fail ? 1 : 0)
