import { chromium, EXEC } from './_pw.mjs'
import { requireFont } from './_font.mjs'
import * as W from './walk_lib.mjs'

// ─────────────────────────────────────────────────────────────────────────────
//  마우스를 올리면 · 손가락으로 누르면 **반응하는가** — 0099 (v3.0 §21·§22)
//
//  「누를 수 있는 것」은 올리면(hover) 티가 나야 하고, 폰에서는 누르는
//  동안(pressed) 티가 나야 합니다. 그래야 「이거 되는 건가?」를 눌러 보기
//  전에 압니다. 지키는 것은 셋입니다.
//
//   ① PC 에서 누를 수 있는 것의 **90% 이상**이 올리면 바뀐다
//      (배경 · 글자색 · 그림자 · 위치 · 밑줄 중 하나라도)
//   ② 그 변화는 **100~250ms** 안에 일어난다 — 즉시(0ms)도 느림(300ms↑)도 아님
//   ③ 폰에서 주 단추는 **누르는 동안** 작아진다(눌린 느낌) — 떼면 돌아온다
//
//  ⚠ 자는 「hover: 클래스가 있는가」를 세지 않습니다. 실제로 마우스를 올리고
//    **계산된 색·그림자·위치가 달라졌는지**를 봅니다. 클래스가 있어도 부모가
//    가리면 안 바뀝니다 — 그건 실패입니다.
// ─────────────────────────────────────────────────────────────────────────────

let pass = 0
let fail = 0
const ok = (name, cond, detail = '') => {
  if (cond) pass += 1
  else fail += 1
  console.log(`${cond ? ' OK ' : 'FAIL'} | ${name}${detail && !cond ? ` — ${detail}` : ''}`)
}

const b = await chromium.launch({ executablePath: EXEC })
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
  const p = await ctx.newPage()
  await p.goto(`${W.BASE}/login`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(2500)
  await requireFont(p, b)
  await ctx.close()
}

async function open(role, width, path) {
  const prof = { ...W.profileFor(role), font_scale: 'normal' }
  const state = { profile: prof, reqs: 0, writes: [] }
  const ctx = await b.newContext({ viewport: { width, height: 900 }, isMobile: width < 640, hasTouch: width < 640 })
  W.wire(ctx, state)
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => {
    window.localStorage.setItem(k, JSON.stringify({ access_token: 't', token_type: 'bearer',
      expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u }))
  }, ['beonemirae-ops:auth', { id: prof.id, aud: 'authenticated', email: prof.email, app_metadata: {}, user_metadata: {} }])
  await p.goto(`${W.BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await W.settle(p, state)
  //  등장 애니메이션이 끝난 뒤에 잽니다 (check_theme 과 같은 이유)
  await p.waitForFunction(() => !document.getAnimations().some((a) => a.playState === 'running')
    && ![...document.body.querySelectorAll('[style*="opacity"]')].some((el) => !el.closest('[hidden]') && Number(getComputedStyle(el).opacity) < 1),
    null, { timeout: 8000 }).catch(() => {})
  await p.waitForTimeout(120)
  return { ctx, p, state }
}

const KEYS = ['backgroundColor', 'color', 'boxShadow', 'transform', 'borderColor', 'textDecorationLine', 'outlineColor', 'filter', 'opacity']

/** 화면 안에서 누를 수 있는 것들 — 흐름 안 · 보이는 것 · 32px 이상 */
async function targets(p) {
  return await p.evaluate(() => {
    const els = [...document.querySelectorAll('button, a[href], tbody tr, [role="button"], summary, label[for]')]
    const out = []
    for (const el of els) {
      const r = el.getBoundingClientRect(); const s = getComputedStyle(el)
      if (r.width < 24 || r.height < 24 || s.visibility === 'hidden' || s.display === 'none' || s.opacity === '0') continue
      if (r.top < 0 || r.bottom > innerHeight || r.left < 0 || r.right > innerWidth) continue
      if (el.closest('[disabled],[aria-disabled="true"]')) continue
      //  이미 골라져 있는 것(켜진 칩 · 지금 보고 있는 메뉴)은 올려도 안 바뀌는 게 맞습니다
      if (el.matches('[aria-pressed="true"],[aria-current]')) continue
      //  줄(tr) 안의 단추는 줄과 따로 셉니다 — 줄이 반응하면 단추도 같이 바뀌므로
      //  단추가 반응하지 않아도 「줄이 켜졌다」로 충분합니다.
      if (el.tagName !== 'TR' && el.closest('tbody tr')) continue
      //  가운데 점이 실제로 이 요소(또는 자식)인지 — 가려진 것은 올려도 안 바뀝니다
      const cx = r.left + r.width / 2, cy = r.top + Math.min(r.height / 2, 20)
      const hit = document.elementFromPoint(cx, cy)
      if (!hit || !(el === hit || el.contains(hit))) continue
      el.setAttribute('data-hover-probe', String(out.length))
      out.push({ i: out.length, x: cx, y: cy, label: (el.textContent ?? el.getAttribute('aria-label') ?? el.tagName).replace(/\s+/g, ' ').trim().slice(0, 22), tag: el.tagName })
    }
    return out
  })
}

async function snap(p, i) {
  return await p.evaluate(([i, KEYS]) => {
    const el = document.querySelector(`[data-hover-probe="${i}"]`)
    if (!el) return null
    const s = getComputedStyle(el)
    const own = Object.fromEntries(KEYS.map((k) => [k, s[k]]))
    //  group-hover 로 **자식만** 바뀌는 것도 반응입니다 — 자식 셋까지 봅니다
    const kids = [...el.querySelectorAll('*')].slice(0, 12).map((k) => { const ks = getComputedStyle(k); return KEYS.map((key) => ks[key]).join('|') })
    const dur = Math.max(...s.transitionDuration.split(',').map((v) => parseFloat(v) * (v.trim().endsWith('ms') ? 1 : 1000)))
    return { own, kids: kids.join('~'), dur }
  }, [i, KEYS])
}

// ── ① · ② PC 에서 올리면 바뀌는가 ──────────────────────────────────────────
const PC_SCREENS = [
  ['admin', '/', '대시보드'], ['admin', '/clients', '거래처'], ['admin', '/settings', '설정'],
  ['client', '/portal', '병원 첫 화면'], ['client', '/portal/history', '병원 이력'],
  //  0103 — 상품·고객지원 화면도 잽니다 (v3.0 §21 Customer Desktop: Product · Report Item)
  ['client', '/portal/supplies', '병원 소모품'], ['client', '/portal/support', '병원 고객지원'],
]
for (const [role, path, label] of PC_SCREENS) {
  const { ctx, p } = await open(role, 1440, path)
  await p.mouse.move(2, 2)
  const list = await targets(p)
  const silent = []
  const slow = []
  let responded = 0
  for (const t of list) {
    const before = await snap(p, t.i)
    await p.mouse.move(t.x, t.y)
    await p.waitForTimeout(320)
    const after = await snap(p, t.i)
    await p.mouse.move(2, 2)
    await p.waitForTimeout(60)
    if (!before || !after) continue
    const diff = KEYS.filter((k) => before.own[k] !== after.own[k])
    const changed = diff.length > 0 || before.kids !== after.kids
    if (changed) {
      responded += 1
      //  밑줄은 켜지거나 꺼지거나라 시간이 없습니다 — 밑줄**만** 바뀐 링크는 시간 기준에서 뺍니다
      const underlineOnly = diff.length === 1 && diff[0] === 'textDecorationLine' && before.kids === after.kids
      if (!underlineOnly && !(after.dur >= 100 && after.dur <= 250)) slow.push(`${t.label}(${after.dur}ms)`)
    } else silent.push(`${t.tag} "${t.label}"`)
  }
  const ratio = list.length ? responded / list.length : 1
  ok(`${label}/PC — 누를 수 있는 것 ${list.length}개 중 90% 이상이 올리면 바뀜`, ratio >= 0.9,
    `${responded}/${list.length} · 조용한 것: ${silent.slice(0, 6).join(' · ')}`)
  ok(`${label}/PC — 반응 시간 100~250ms`, slow.length === 0, slow.slice(0, 5).join(' · '))
  await ctx.close()
}

// ── ③ 폰에서 누르는 동안 눌린 느낌 ─────────────────────────────────────────
//   마우스를 내린 채(떼지 않고) transform 을 읽습니다. 떼기 전에 멀리 옮겨
//   두면 click 이 안 나가므로 화면이 안 바뀝니다.
for (const [role, path, sel, label] of [
  ['field', '/collection', '.btn-primary', '수거 입력 · 주 단추'],
  ['client', '/portal', '[data-portal-quick] button, [data-portal-quick] a, .pressable', '병원 첫 화면 · 빠른 실행'],
]) {
  const { ctx, p } = await open(role, 390, path)
  const box = await p.evaluate((sel) => {
    const el = [...document.querySelectorAll(sel)].find((e) => e.getBoundingClientRect().width > 0)
    if (!el) return null
    el.scrollIntoView({ block: 'center' })
    el.setAttribute('data-press-probe', '1')
    const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, label: (el.textContent ?? '').trim().slice(0, 20) }
  }, sel)
  if (!box) { ok(`${label} — 단추를 찾음`, false, sel); await ctx.close(); continue }
  const read = () => p.evaluate(() => { const s = getComputedStyle(document.querySelector('[data-press-probe]')); return `${s.transform}|${s.backgroundColor}|${s.opacity}` })
  const idle = await read()
  await p.mouse.move(box.x, box.y)
  await p.mouse.down()
  await p.waitForTimeout(250)
  const pressed = await read()
  await p.mouse.move(2, 2)
  await p.mouse.up()
  await p.waitForTimeout(300)
  const released = await read()
  ok(`${label} — 누르는 동안 바뀜 (${box.label})`, pressed !== idle, `${idle} → ${pressed}`)
  ok(`${label} — 떼면 돌아옴`, released === idle, `${released}`)
  await ctx.close()
}

await b.close()
console.log(`\ncheck_hover OK=${pass} FAIL=${fail}`)
process.exit(fail ? 1 : 0)
