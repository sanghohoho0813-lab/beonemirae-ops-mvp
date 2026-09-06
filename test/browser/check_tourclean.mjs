import { chromium, EXEC } from './_pw.mjs'
import * as W from './walk_lib.mjs'

// ─────────────────────────────────────────────────────────────────────────────
//  안내(투어)·시연을 **끝낸 뒤 화면에 남는 것이 없는가** — 0099 (v3.0 §28)
//
//  덮개(backdrop)·흐림·pointer-events·스크롤 잠금·포커스 가둠은 안내가 떠 있는
//  동안만 있어야 합니다. 하나라도 남으면 「화면이 안 눌린다」「스크롤이 안 된다」가
//  되는데, 원인이 안 보여서 새로고침 말고는 못 벗어납니다.
//
//  세 가지 끝내기(Esc · 건너뛰기 · 끝까지 넘겨서 끝내기)를 각각 해 보고,
//  그 뒤 실제로 **누르고 · 넘기고 · 포커스가 화면에 있는지**를 봅니다.
// ─────────────────────────────────────────────────────────────────────────────

let pass = 0
let fail = 0
const ok = (name, cond, detail = '') => {
  if (cond) pass += 1
  else fail += 1
  console.log(`${cond ? ' OK ' : 'FAIL'} | ${name}${detail && !cond ? ` — ${detail}` : ''}`)
}

const b = await chromium.launch({ executablePath: EXEC })

async function open(width, path = '/') {
  const prof = { ...W.profileFor('admin'), font_scale: 'normal' }
  const state = { profile: prof, reqs: 0, writes: [] }
  const ctx = await b.newContext({ viewport: { width, height: 900 }, isMobile: width < 640, hasTouch: width < 640 })
  W.wire(ctx, state)
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => {
    window.localStorage.setItem(k, JSON.stringify({ access_token: 't', token_type: 'bearer',
      expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u }))
    //  「오늘 하루 보지 않기」·첫 방문 자동 안내가 끼어들지 않게
    window.localStorage.setItem('beonemirae-ops:tour-seen', 'staff,field,client')
  }, ['beonemirae-ops:auth', { id: prof.id, aud: 'authenticated', email: prof.email, app_metadata: {}, user_metadata: {} }])
  await p.goto(`${W.BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await W.settle(p, state)
  await p.waitForTimeout(300)
  return { ctx, p, state }
}

/** 화면에 남은 것 — 전부 0/false 여야 합니다 */
async function residue(p) {
  return await p.evaluate(() => {
    const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el)
      return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0' }
    const all = [...document.body.querySelectorAll('*')]
    const dialogs = all.filter((el) => el.matches('[role="dialog"],[aria-modal="true"]') && vis(el)).length
    //  화면 전체를 덮는 고정 상자 — 남아 있으면 그 밑은 못 누릅니다
    const covers = all.filter((el) => { const s = getComputedStyle(el); if (s.position !== 'fixed') return false
      const r = el.getBoundingClientRect(); return vis(el) && r.width >= innerWidth * 0.9 && r.height >= innerHeight * 0.9 }).length
    const blur = all.filter((el) => { const s = getComputedStyle(el); return vis(el) && ((s.backdropFilter && s.backdropFilter !== 'none') || (s.filter && s.filter !== 'none' && /blur/.test(s.filter))) }).length
    const main = document.querySelector('main')
    const noPointer = [document.body, document.documentElement, main].filter((el) => el && getComputedStyle(el).pointerEvents === 'none').length
    const scrollLock = [document.body, document.documentElement].filter((el) => /hidden|clip/.test(getComputedStyle(el).overflowY)).length
    const ae = document.activeElement
    const focusOk = !ae || ae === document.body || (ae.isConnected && vis(ae) && !ae.closest('[role="dialog"]'))
    const inert = all.filter((el) => el.hasAttribute('inert') || el.getAttribute('aria-hidden') === 'true' && el.matches('main, main *') ).length
    return { dialogs, covers, blur, noPointer, scrollLock, focusOk, inert }
  })
}

//  ⚠ 폰 머리띠·아래 탭은 **원래** backdrop-blur 로 그립니다(유리 느낌). 그건
//    잔존이 아니라 디자인이라, 안내를 **켜기 전** 값(base)과 견줍니다 —
//    끝낸 뒤에 그보다 늘어 있으면 남은 것입니다.
async function afterClose(p, label, base) {
  await p.waitForTimeout(700)
  const r = await residue(p)
  ok(`${label} — 창(dialog) 남지 않음`, r.dialogs === 0, `${r.dialogs}개`)
  ok(`${label} — 화면 덮개 남지 않음`, r.covers <= base.covers, `${r.covers}개 (켜기 전 ${base.covers})`)
  ok(`${label} — 흐림(blur) 남지 않음`, r.blur <= base.blur, `${r.blur}개 (켜기 전 ${base.blur})`)
  ok(`${label} — pointer-events 잠금 남지 않음`, r.noPointer === 0)
  ok(`${label} — 스크롤 잠금 남지 않음`, r.scrollLock === 0)
  ok(`${label} — 포커스가 화면 안에 있음`, r.focusOk)
  ok(`${label} — inert/aria-hidden 남지 않음`, r.inert === 0, `${r.inert}개`)
  //  실제로 눌리는가 — 왼쪽 메뉴(폰은 아래 탭)의 다른 화면으로 가 봅니다
  //  PC 는 왼쪽 메뉴, 폰은 아래 탭 — **보이는** 메뉴 링크 중 지금 화면이 아닌 첫 것
  const before = await p.evaluate(() => location.pathname)
  //  (폰 아래 탭은 링크가 아니라 단추입니다 — 「더보기」는 화면을 안 바꾸니 뺍니다)
  const want = await p.evaluate(() => {
    const here = location.pathname
    for (const el of document.querySelectorAll('nav a[href], nav.fixed.bottom-0 button')) {
      const r = el.getBoundingClientRect()
      if (!(r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight)) continue
      const href = el.getAttribute('href')
      if (href !== null && (!href.startsWith('/') || href === here)) continue
      if (href === null && (/더보기/.test(el.textContent ?? '') || el.getAttribute('aria-current'))) continue
      el.setAttribute('data-clean-probe', '1'); return href ?? (el.textContent ?? '').trim().slice(0, 10)
    }
    return null
  })
  if (want) {
    await p.locator('[data-clean-probe]').click({ timeout: 3000 }).catch(() => {})
    await p.waitForTimeout(600)
    const after = await p.evaluate(() => location.pathname)
    ok(`${label} — 끝낸 뒤 메뉴가 눌림`, after !== before, `${before} → ${after} (누른 것 ${want})`)
    await p.goBack().catch(() => {})
    await p.waitForTimeout(500)
  } else ok(`${label} — 끝낸 뒤 누를 메뉴가 보임`, false, '메뉴 없음')
  //  실제로 넘어가는가
  const scrolled = await p.evaluate(async () => {
    const tall = document.documentElement.scrollHeight > innerHeight + 40
    if (!tall) return 'short'
    window.scrollTo(0, 240); await new Promise((r) => setTimeout(r, 120))
    const y = window.scrollY; window.scrollTo(0, 0); return y > 0 ? 'yes' : 'no'
  })
  ok(`${label} — 끝낸 뒤 스크롤이 됨`, scrolled !== 'no', scrolled)
}

async function startTour(p, width) {
  if (width < 640) {
    await p.click('[data-help-open]')
    await p.waitForTimeout(700)
    await p.click('[data-help-sheet] [data-tour-start]')
  } else {
    await p.click('[data-tour-start]')
  }
  await p.locator('[data-tour-card]').first().waitFor({ state: 'visible', timeout: 8000 })
  await p.waitForTimeout(500)
}

for (const width of [1440, 390]) {
  const tag = width < 640 ? '폰' : 'PC'
  // ── Esc 로 끝내기 ──
  {
    const { ctx, p } = await open(width)
    const base = await residue(p)
    await startTour(p, width)
    await p.locator('[data-tour-card] [data-tour-next]').click()
    await p.waitForTimeout(900)
    ok(`${tag} · 안내가 떠 있는 동안에는 창이 있음`, (await residue(p)).dialogs >= 1)
    await p.keyboard.press('Escape')
    await afterClose(p, `${tag} · Esc 로 끝냄`, base)
    await ctx.close()
  }
  // ── 「건너뛰기」로 끝내기 ──
  {
    const { ctx, p } = await open(width)
    const base = await residue(p)
    await startTour(p, width)
    const skip = p.locator('[data-tour-card] button', { hasText: '건너뛰기' }).first()
    ok(`${tag} · 「건너뛰기」가 있음`, (await skip.count()) === 1)
    await skip.click().catch(() => {})
    await afterClose(p, `${tag} · 건너뛰기로 끝냄`, base)
    await ctx.close()
  }
  // ── 끝까지 넘겨서 끝내기 ──
  {
    const { ctx, p } = await open(width)
    const base = await residue(p)
    await startTour(p, width)
    let steps = 0
    for (let i = 0; i < 20; i += 1) {
      const next = p.locator('[data-tour-card] [data-tour-next]')
      if ((await next.count()) === 0) break
      steps += 1
      await next.click().catch(() => {})
      await p.waitForTimeout(800)
      if ((await p.locator('[data-tour-card]').count()) === 0) break
    }
    ok(`${tag} · 끝까지 넘어감`, steps >= 8 && (await p.locator('[data-tour-card]').count()) === 0, `${steps}단계`)
    await afterClose(p, `${tag} · 끝까지 넘겨 끝냄`, base)
    await ctx.close()
  }
}

// ── 시연(/presentation) 화면을 닫은 뒤 ──
for (const width of [1440, 390]) {
  const tag = width < 640 ? '폰' : 'PC'
  //  닫으면 대시보드로 가므로, 대시보드의 「원래 값」을 먼저 잽니다
  const home = await open(width, '/')
  const base = await residue(home.p)
  await home.ctx.close()
  const { ctx, p } = await open(width, '/presentation')
  const close = p.locator('[aria-label="닫기"]').first()
  ok(`${tag} · 시연 화면에 「닫기」가 있음`, (await close.count()) >= 1)
  await close.click().catch(() => {})
  await p.waitForTimeout(600)
  const path = await p.evaluate(() => location.pathname)
  ok(`${tag} · 시연을 닫으면 시연 화면을 벗어남`, path !== '/presentation', path)
  const r = await residue(p)
  ok(`${tag} · 시연 닫은 뒤 덮개·흐림·잠금 없음`, r.covers <= base.covers && r.blur <= base.blur && r.noPointer === 0 && r.scrollLock === 0,
    `${JSON.stringify(r)} (켜기 전 blur ${base.blur})`)
  await ctx.close()
}

await b.close()
console.log(`\ncheck_tourclean OK=${pass} FAIL=${fail}`)
process.exit(fail ? 1 : 0)
