import { chromium, EXEC } from './_pw.mjs'
import * as W from './walk_lib.mjs'
import * as F from './perf_fixtures.mjs'

//  폰 화면 안정화 — 대표님: 「글자가 박스 밖을 벗어나지 않게 · 세로로 말도 안 되게
//  늘어진 거 없애고 · 설정은 다 접어서 굉장히 심플하게 · 불필요하게 스크롤 많이
//  내리지 않게」.
//
//   폰 기본 글씨(lg)와 가장 큰 글씨(xl)에서 다음을 잽니다.
//     ① 글자가 세로로 늘어지지 않는다 (폭이 글자 두 개도 안 되는데 네 줄 이상)
//     ② 글자가 자기 상자(카드) 밖으로 나가지 않는다
//     ③ 화면 밖으로 나가거나 가로로 밀리지 않는다
//     ④ 설정은 폰에서 한 줄씩 접혀 있고, 누르면 펼쳐진다 · 화면이 짧다
//     ⑤ 길던 화면의 접힌 칸(인쇄용 브리핑 · 편성 목록 · 입고 칸)은 눌러서 펼쳐진다
//
//   ⚠ 가짜 자료로 봅니다(쓰기 없음). 숫자는 화면 모양을 재는 데만 씁니다.

const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  if (!c) process.exitCode = 1
}

const b = await chromium.launch({ executablePath: EXEC })

async function open(path, { w = 384, scale = 'xl', role = 'admin' } = {}) {
  const state = { profile: { ...W.profileFor(role), font_scale: scale }, reqs: 0, writes: [], schemaVersion: 106 }
  const ctx = await b.newContext({ viewport: { width: w, height: 844 }, isMobile: true, hasTouch: true, timezoneId: 'Asia/Seoul' })
  W.wire(ctx, state)
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => {
    localStorage.setItem(k, JSON.stringify({ access_token: 't', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u }))
    localStorage.setItem('beonemirae-ops:tour-seen', 'staff,field,client,demo')
  }, ['beonemirae-ops:auth', { id: F.UID, aud: 'authenticated', email: 'x@b.c', app_metadata: {}, user_metadata: {} }])
  await p.goto(`${W.BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await W.settle(p, state)
  await p.waitForTimeout(700)
  return { ctx, p, state }
}

/** 눌린 글자 · 상자 밖 글자 · 화면 밖 글자 · 가로 밀림 */
function measure(p) {
  return p.evaluate(() => {
    const docW = document.documentElement.clientWidth
    const vis = (e) => { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden') return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 }
    const inScroller = (e) => { let n = e.parentElement; while (n && n !== document.body) { const ox = getComputedStyle(n).overflowX; if (ox === 'auto' || ox === 'scroll') return true; n = n.parentElement } return false }
    const squeezed = [], spill = [], outside = []
    for (const el of document.querySelectorAll('body *')) {
      if (!vis(el) || el.closest('.sr-only')) continue
      const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').replace(/\s+/g, ' ').trim()
      if (!own) continue
      const s = getComputedStyle(el); const fs = parseFloat(s.fontSize); const lh = parseFloat(s.lineHeight) || fs * 1.4
      const r = el.getBoundingClientRect()
      const label = own.slice(0, 18)
      if (own.length >= 4 && r.width < fs * 2.6 && r.height > lh * 3.5) squeezed.push(`${label} w${Math.round(r.width)}`)
      const card = el.closest('.card, [class*="rounded-"]')
      if (card && card !== el && !inScroller(el)) {
        const c = card.getBoundingClientRect(); const cs = getComputedStyle(card)
        const clip = cs.overflow === 'hidden' || cs.overflowX === 'hidden'
        if (!clip && (r.right > c.right + 2 || r.left < c.left - 2)) spill.push(`${label} [${Math.round(r.left)}..${Math.round(r.right)}] 상자[${Math.round(c.left)}..${Math.round(c.right)}]`)
      }
      if ((r.right > docW + 1 || r.left < -1) && !inScroller(el)) outside.push(`${label} [${Math.round(r.left)}..${Math.round(r.right)}]`)
    }
    return { push: document.documentElement.scrollWidth - docW, squeezed: [...new Set(squeezed)].slice(0, 4), spill: [...new Set(spill)].slice(0, 4), outside: [...new Set(outside)].slice(0, 4), h: document.documentElement.scrollHeight }
  })
}

// ── ①②③ 화면별 — 폰 기본 글씨(360 · lg)와 가장 큰 글씨(384 · xl) ─────────────
const PAGES = [
  ['admin', '/'], ['admin', '/settings'], ['admin', '/materials'], ['admin', '/receivables'],
  ['admin', '/pricing'], ['admin', '/readiness'], ['admin', '/plan'], ['admin', '/schedule'],
  ['client', '/portal'], ['client', '/portal/report'],
]
for (const [w, scale] of [[384, 'xl'], [360, 'lg']]) {
  for (const [role, path] of PAGES) {
    const { ctx, p } = await open(path, { w, scale, role })
    const r = await measure(p)
    const tag = `${w}·${scale} ${path}`
    ok(r.squeezed.length === 0, `${tag} — 세로로 늘어진 글자 없음`, r.squeezed.join(' ; '))
    ok(r.spill.length === 0, `${tag} — 상자 밖으로 나간 글자 없음`, r.spill.join(' ; '))
    ok(r.outside.length === 0 && r.push <= 0, `${tag} — 화면 밖 · 가로 밀림 없음`, `${r.outside.join(' ; ')}${r.push > 0 ? ` 밀림 ${r.push}px` : ''}`)
    await ctx.close()
  }
}

// ── 홈 「10월 매출 … 진행 중」이 칸 안에 ────────────────────────────────────
{
  const { ctx, p } = await open('/')
  const r = await p.evaluate(() => {
    const cell = document.querySelector('[data-dash-kpi="rev"]')
    const small = cell?.querySelector('small')
    if (!cell || !small) return null
    const c = cell.getBoundingClientRect(); const s = small.getBoundingClientRect()
    return { inside: s.right <= c.right + 1 && s.left >= c.left - 1, text: small.textContent }
  })
  ok(r != null && r.inside, '가장 큰 글씨 — 「진행 중」이 매출 칸 안에 있다 (모자라면 아랫줄로)', JSON.stringify(r))
  await ctx.close()
}

// ── ④ 설정 — 폰에서는 한 줄씩 접혀 있다 ─────────────────────────────────────
{
  const { ctx, p } = await open('/settings')
  const t = await p.evaluate(() => {
    const all = [...document.querySelectorAll('[data-setting-toggle]')].filter((e) => e.getBoundingClientRect().height > 0)
    return { n: all.length, open: all.filter((e) => e.getAttribute('aria-expanded') === 'true').length, h: document.documentElement.scrollHeight }
  })
  ok(t.n >= 10 && t.open === 0, '설정 카드가 폰에서 모두 접혀 있다', `${t.n}개 중 펼침 ${t.open}`)
  //  예전 6,434px(가장 큰 글씨). 접힌 한 줄 카드만이면 3,000px 안쪽입니다.
  ok(t.h < 3300, '설정 화면이 짧다 (가장 큰 글씨, 예전 6,434px)', `${t.h}px`)
  //  설명 글은 접혀 있을 때 안 보인다 — 「한 줄」
  const descShown = await p.locator('[data-setting-toggle] .t-muted:visible').count()
  ok(descShown === 0, '접힌 카드에는 설명 글이 안 보인다 (제목 한 줄)', `${descShown}개 보임`)
  //  값이 비어서 못 쓰는 기능 — 접힌 줄에 몇 가지인지만
  const gaps = p.locator('[data-setup-gaps]')
  if (await gaps.count()) {
    ok((await p.locator('[data-setup-gap]:visible').count()) === 0, '「값이 비어서 못 쓰는 기능」 목록도 접혀 있다')
    await p.locator('[data-setup-toggle]').click()
    await p.waitForTimeout(300)
    ok((await p.locator('[data-setup-gap]:visible').count()) > 0, '누르면 그 목록이 펼쳐진다')
  }
  //  도움말 · 화면 색 — 누르면 세 단추가 글 **아래**에 (예전엔 옆에 세워 글이 세로로 늘어짐)
  await p.locator('[data-settings-help] [data-setting-toggle]').click()
  await p.waitForTimeout(300)
  const help = await p.evaluate(() => {
    const box = document.querySelector('[data-settings-help]')
    const start = box?.querySelector('[data-tour-start]')
    const desc = box?.querySelector('[data-setting-toggle] .t-muted')
    if (!start || !desc) return null
    return { below: start.getBoundingClientRect().top >= desc.getBoundingClientRect().bottom - 1, descW: Math.round(desc.getBoundingClientRect().width) }
  })
  ok(help != null && help.below && help.descW > 150, '도움말을 펴면 단추가 글 아래에 · 글은 넉넉한 폭', JSON.stringify(help))
  await ctx.close()
}

// ── ⑤ 길던 화면 — 폰에서 접힌 칸은 눌러서 펼쳐진다 ───────────────────────────
{
  const { ctx, p } = await open('/readiness')
  const brief = p.locator('[data-ready-brief] [data-brief-fact]').first()
  ok(!(await brief.isVisible()), '실증 준비 — 인쇄용 브리핑은 폰에서 접혀 있다')
  await p.locator('[data-brief-toggle]').click()
  await p.waitForTimeout(300)
  ok(await brief.isVisible(), '「브리핑 펼쳐 보기」를 누르면 나온다')
  await ctx.close()
}
{
  const { ctx, p } = await open('/plan')
  const toggle = p.locator('[data-plan-patterns-toggle]')
  if (await toggle.count()) {
    ok((await p.locator('[data-plan-pattern]:visible').count()) === 0, '일정 편성 — 거래처별 목록은 폰에서 접혀 있다')
    await toggle.click()
    await p.waitForTimeout(300)
    ok((await p.locator('[data-plan-pattern]:visible').count()) > 0, '「펼쳐서 고르기」를 누르면 목록이 나온다')
  } else {
    ok(true, '일정 편성 — 반복 요일을 찾은 거래처가 없어 목록 자체가 없음')
  }
  await ctx.close()
}
{
  //  PC 에서는 접지 않는다 — 넓은 화면에서 굳이 누르게 하지 않습니다.
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: 'Asia/Seoul' })
  const state = { profile: { ...W.profileFor('admin'), font_scale: 'normal' }, reqs: 0, writes: [], schemaVersion: 106 }
  W.wire(ctx, state)
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => {
    localStorage.setItem(k, JSON.stringify({ access_token: 't', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u }))
    localStorage.setItem('beonemirae-ops:tour-seen', 'staff,field,client,demo')
  }, ['beonemirae-ops:auth', { id: F.UID, aud: 'authenticated', email: 'x@b.c', app_metadata: {}, user_metadata: {} }])
  await p.goto(`${W.BASE}/settings`, { waitUntil: 'domcontentloaded' })
  await W.settle(p, state)
  await p.waitForTimeout(700)
  ok(await p.locator('[data-settings-help] [data-tour-start]').isVisible(), 'PC 설정 — 도움말 단추가 바로 보인다 (접지 않음)')
  await p.goto(`${W.BASE}/readiness`, { waitUntil: 'domcontentloaded' })
  await W.settle(p, state)
  await p.waitForTimeout(700)
  ok(await p.locator('[data-ready-brief] [data-brief-fact]').first().isVisible(), 'PC 실증 준비 — 브리핑이 바로 보인다')
  await ctx.close()
}

await b.close()
