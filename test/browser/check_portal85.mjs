import { chromium, EXEC } from './_pw.mjs'
import * as W from './walk_lib.mjs'
import * as F from './perf_fixtures.mjs'

//  0085 — 관리자 ↔ 병원 화면 왕복
//
//   대표님: 「대표/이사/개발자/관리자가 병원 포털을 확인할 때 다시 BUSINESS
//   AX로 돌아가기 어렵지 않도록 한다」 · 「가짜 특정 병원 데이터가 모든
//   계정에 고정되어서는 안 된다」
//
//   ⚠ 여기서 제일 중요한 검사는 **어느 병원이 보이는가**입니다.
//     예전에는 화면 일곱 곳이 전부 `data.clients[0]` 이라, 직원 계정에서
//     「병원이 보는 화면」을 누르면 목록의 **첫 병원**이 우리 병원처럼
//     떴습니다. 대표님이 더원요양병원을 보려고 눌러도 다른 병원이 나옵니다.

const ok = (c, m, d = '') => { console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`); if (!c) process.exitCode = 1 }
const flat = (t) => (t ?? '').replace(/\s+/g, ' ').trim()
const b = await chromium.launch({ executablePath: EXEC })

async function open(path, role, w = 1280) {
  const state = { profile: { ...W.profileFor(role), font_scale: 'normal' }, reqs: 0, writes: [], schemaVersion: 83 }
  const ctx = await b.newContext({ viewport: { width: w, height: w < 700 ? 844 : 950 }, isMobile: w < 700, hasTouch: w < 700 })
  W.wire(ctx, state)
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: F.UID, aud: 'authenticated', email: 'x@b.c', app_metadata: {}, user_metadata: {} }])
  await p.goto(`${W.BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await W.settle(p, state); await p.waitForTimeout(700)
  return { ctx, p }
}

// ── ① 직원이 병원을 안 골랐으면 **아무 병원도 안 보여 준다** ───────────────
{
  const { ctx, p } = await open('/portal', 'admin')
  ok((await p.locator('[data-portal-picker]').count()) === 1,
    '**어느 병원을 볼지 먼저 묻는다** (첫 병원을 슬쩍 안 보여 줍니다)')
  const body = flat(await p.locator('main').innerText())
  ok(/어느 병원 화면을 보시겠습니까/.test(body), '무엇을 고르라는지 적혀 있다')
  //  ⚠ 이 자리에서 병원 이름이 「우리 병원」처럼 뜨면 안 됩니다.
  ok(!/님, 환영합니다/.test(body), '**「○○병원님, 환영합니다」가 안 뜬다**', body.slice(0, 60))
  const n = await p.locator('[data-portal-pick]').count()
  ok(n === F.clients.length, '거래처가 다 나온다', `${n}곳 / ${F.clients.length}곳`)
  await ctx.close()
}

// ── ② 고른 병원이 실제로 그 병원인가 ───────────────────────────────────────
{
  //  ⚠ 첫 병원이 아니라 **두 번째** 병원을 골라 봅니다. 첫 병원을 고르면
  //    옛 결함(clients[0])과 결과가 같아서 아무것도 증명하지 못합니다.
  const target = F.clients[1] ?? F.clients[0]
  const { ctx, p } = await open(`/portal?client=${target.id}`, 'admin')
  const hero = flat(await p.locator('[data-portal-hero]').innerText())
  ok(hero.includes(target.name), '**고른 병원 이름이 뜬다**', hero.slice(0, 50))
  ok(!hero.includes(F.clients[0].name) || target.id === F.clients[0].id,
    '**첫 병원 이름이 아니다** (옛 결함이 되살아나지 않았다)', hero.slice(0, 50))
  await ctx.close()
}

// ── ③ 직원이 보고 있다는 것을 화면이 말하는가 ──────────────────────────────
{
  const target = F.clients[1] ?? F.clients[0]
  const { ctx, p } = await open(`/portal?client=${target.id}`, 'admin')
  ok((await p.locator('[data-portal-preview]').count()) === 1, '**「고객 화면 미리보기」 띠가 있다**')
  const bar = flat(await p.locator('[data-portal-preview]').innerText())
  ok(bar.includes(target.name), '어느 병원 화면인지 적혀 있다', bar.slice(0, 60))
  ok(/비원미래 전체 자료가 아닙니다/.test(bar),
    '**전체 자료가 아니라고 못 박는다** (미수금을 회사 전체로 읽으면 안 됩니다)')
  await ctx.close()
}

// ── ④ 돌아가는 길 ──────────────────────────────────────────────────────────
{
  const target = F.clients[1] ?? F.clients[0]
  const { ctx, p } = await open(`/portal?client=${target.id}`, 'admin')
  const back = p.locator('[data-portal-back]')
  ok((await back.count()) === 1, '**「BUSINESS AX로 돌아가기」가 있다**')
  const box = await back.boundingBox()
  ok((box?.height ?? 0) >= 44, '누를 만한 크기', `${Math.round(box?.height ?? 0)}px`)
  //  ⚠ 포털 안을 몇 화면 돌아다닌 뒤에도 **한 번에** 나가야 합니다.
  await p.goto(`${W.BASE}/portal/history?client=${target.id}`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(900)
  await p.goto(`${W.BASE}/portal/billing?client=${target.id}`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(900)
  await p.locator('[data-portal-back]').click()
  await p.waitForTimeout(1200)
  const url = new URL(p.url())
  ok(url.pathname === '/', '**한 번 눌러 내부 화면으로 나온다**', url.pathname)
  const body = flat(await p.locator('main').innerText())
  ok(!/님, 환영합니다/.test(body) && body.length > 60, '내부 화면이 제대로 떴다', body.slice(0, 40))
  await ctx.close()
}

// ── ⑤ 병원 계정에는 미리보기 띠가 **없다** ─────────────────────────────────
{
  const { ctx, p } = await open('/portal', 'client')
  ok((await p.locator('[data-portal-preview]').count()) === 0,
    '**병원 담당자에게는 미리보기 띠가 안 보인다**')
  ok((await p.locator('[data-portal-back]').count()) === 0, '「돌아가기」도 안 보인다')
  ok((await p.locator('[data-portal-picker]').count()) === 0, '병원을 고르라고 묻지 않는다')
  ok((await p.locator('[data-portal-hero]').count()) === 1, '바로 자기 병원 화면이 뜬다')
  await ctx.close()
}

// ── ⑥ 병원 계정은 주소로 남의 병원을 못 본다 ───────────────────────────────
{
  //  ⚠ 서버(RLS)가 막지만, 화면도 주소를 안 따릅니다 — 두 겹입니다.
  const other = F.clients[1] ?? F.clients[0]
  const { ctx, p } = await open(`/portal?client=${other.id}`, 'client')
  ok((await p.locator('[data-portal-picker]').count()) === 0, '고르는 화면이 안 나온다')
  const hero = flat(await p.locator('[data-portal-hero]').innerText())
  ok(hero.includes(F.clients[0].name), '**자기 병원 화면 그대로다**', hero.slice(0, 50))
  await ctx.close()
}

// ── ⑦ 거래처 화면에서 그 병원 화면으로 ─────────────────────────────────────
{
  const target = F.clients[1] ?? F.clients[0]
  const { ctx, p } = await open(`/clients/${target.id}`, 'admin')
  const link = p.locator('[data-client-portal-link] [data-portal-switch]')
  ok((await link.count()) === 1, '**거래처 화면에 「병원 화면 미리보기」가 있다**')
  const href = await link.getAttribute('href')
  ok(href === `/portal?client=${target.id}`, '**그 거래처를 달고 갑니다**', String(href))
  await link.click()
  await p.waitForTimeout(1400)
  const hero = flat(await p.locator('[data-portal-hero]').innerText())
  ok(hero.includes(target.name), '**눌렀더니 그 병원 화면이 열린다**', hero.slice(0, 50))
  await ctx.close()
}

// ── ⑧ 폰에서도 왕복이 되는가 ───────────────────────────────────────────────
{
  const target = F.clients[1] ?? F.clients[0]
  const { ctx, p } = await open(`/portal?client=${target.id}`, 'admin', 390)
  ok((await p.locator('[data-portal-preview]').count()) === 1, '폰에도 미리보기 띠가 있다')
  const back = p.locator('[data-portal-back]')
  ok((await back.count()) === 1, '폰에도 돌아가기가 있다')
  const push = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  ok(push <= 0, '**폰에서 가로로 밀리지 않는다**', `${push}px`)
  await back.click()
  await p.waitForTimeout(1200)
  ok(new URL(p.url()).pathname === '/', '폰에서도 한 번에 나온다', new URL(p.url()).pathname)
  await ctx.close()
}

await b.close()
