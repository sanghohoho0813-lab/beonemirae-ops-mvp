import { chromium, EXEC } from './_pw.mjs'
import * as W from './walk_lib.mjs'
import * as F from './perf_fixtures.mjs'

//  0074 — PC 화면 ↔ 모바일 화면 전환이 **현장 계정에서도** 되는가
//
//   대표님 보고: 「field 계정에서 PC 버전 → 모바일 버전 전환이 안 된다.
//   admin 에서는 된다.」
//
//   원인: /mobile-preview 가 admin·office 전용이었는데, 왼쪽 아래 「모바일
//   화면」 단추는 현장에게도 보였습니다. **보이는데 누르면 막히는 단추**.
//   게다가 틀 안이 `/` 였습니다 — 대시보드는 현장에게 안 열리므로, 권한만
//   열었다면 이번엔 **틀 안이** 「접근 권한이 없는 화면입니다」로 찼을 겁니다.
//
//   여기서 재는 것: 전환 · 되돌아오기 · 새로고침 · 뒤로가기 · 재로그인.

const ok = (c, m, d = '') => { console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`); if (!c) process.exitCode = 1 }
const b = await chromium.launch({ executablePath: EXEC })

async function open(role, w, h = 900) {
  const state = { reqs: 0, writes: [], profile: W.profileFor(role) }
  const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: w < 700, hasTouch: w < 700 })
  W.wire(ctx, state)
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: F.UID, aud: 'authenticated', email: state.profile.email, app_metadata: {}, user_metadata: {} }])
  await p.goto(`${W.BASE}/`, { waitUntil: 'domcontentloaded' })
  await W.settle(p, state, 800, 30000)
  return { ctx, p, state }
}

const frameText = async (p) => {
  const fr = p.frames().find((f) => f !== p.mainFrame())
  if (!fr) return null
  await fr.waitForTimeout(2200)
  try { return await fr.evaluate(() => ({ path: location.pathname, text: (document.body.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 120) })) } catch { return null }
}

// ── ① PC 폭에서 「모바일 화면」 — 두 역할 모두 열려야 합니다 ────────────────
for (const [role, home] of [['admin', '/'], ['field', '/today']]) {
  const s = await open(role, 1440)
  ok((await s.p.locator('[data-go-mobile-preview]').count()) === 1, `${role} — PC 왼쪽에 「모바일 화면」이 있음`)
  await W.clickLabel(s.p, '모바일 화면')
  await s.p.waitForTimeout(2600)
  const path = new URL(s.p.url()).pathname
  ok(path === '/mobile-preview', `${role} — 눌러서 모바일 미리보기로 감`, path)
  const body = (await s.p.evaluate(() => (document.body.innerText ?? '').replace(/\s+/g, ' ').trim()))
  ok(!/접근 권한이 없는/.test(body), `${role} — **막히지 않음**`, body.slice(0, 50))
  const fr = await frameText(s.p)
  ok(fr !== null, `${role} — 폰 틀이 그려짐`)
  ok(fr?.path === home, `${role} — **틀 안이 본인 첫 화면**`, `${fr?.path} (기대 ${home})`)
  ok(!/접근 권한이 없는/.test(fr?.text ?? ''), `${role} — 틀 **안**도 막히지 않음`, (fr?.text ?? '').slice(0, 46))
  await s.ctx.close()
}

// ── ② 현장 — 모바일 미리보기에서 되돌아가기 · 새로고침 · 뒤로가기 ──────────
{
  const s = await open('field', 1440)
  await W.clickLabel(s.p, '모바일 화면')
  await s.p.waitForTimeout(2400)

  //  새로고침해도 그 자리에 남아야 합니다 (주소로 들어와도 열려야 하니까)
  await s.p.reload({ waitUntil: 'domcontentloaded' })
  await s.p.waitForTimeout(2600)
  const afterReload = (await s.p.evaluate(() => ({ path: location.pathname,
    body: (document.body.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 60) })))
  ok(afterReload.path === '/mobile-preview', '현장 — 새로고침해도 그 화면', afterReload.path)
  ok(!/접근 권한이 없는/.test(afterReload.body), '현장 — **새로고침 뒤에도 안 막힘**', afterReload.body.slice(0, 46))

  //  뒤로가기 — 원래 보던 화면으로
  await s.p.goBack({ waitUntil: 'domcontentloaded' })
  await s.p.waitForTimeout(2200)
  const back = new URL(s.p.url()).pathname
  ok(back === '/today', '현장 — 뒤로가기로 오늘 일정에 돌아옴', back)

  //  다시 들어가고 나오기 (왕복이 한 번만 되는 것이 아님)
  await W.clickLabel(s.p, '모바일 화면')
  await s.p.waitForTimeout(2200)
  ok(new URL(s.p.url()).pathname === '/mobile-preview', '현장 — 두 번째도 들어가짐')
  await W.clickLabel(s.p, '웹 화면으로 보기')
  await s.p.waitForTimeout(2200)
  ok(new URL(s.p.url()).pathname === '/today', '현장 — **「웹 화면으로 보기」로 되돌아옴**', new URL(s.p.url()).pathname)
  await s.ctx.close()
}

// ── ③ 폰에서 PC 화면으로 → 다시 모바일로 (왕복) ────────────────────────────
for (const role of ['admin', 'field']) {
  const s = await open(role, 390, 844)
  await W.clickLabel(s.p, '더보기')
  await s.p.waitForTimeout(900)
  const hit = await s.p.evaluate(() => {
    const el = document.querySelector('[data-pc-view-open]')
    if (!el) return false
    const t = el.closest('[class*=cursor-pointer]') ?? el.parentElement ?? el
    t.click(); return true
  })
  ok(hit, `${role} — 폰 「더보기」에 「PC 화면으로 보기」가 있음`)
  await s.p.waitForTimeout(1800)
  const on = await s.p.evaluate(() => ({
    vp: document.querySelector('meta[name=viewport]')?.content ?? '',
    bar: !!document.querySelector('[data-pc-view-bar]'),
  }))
  ok(/width=1440/.test(on.vp), `${role} — **PC 폭으로 바뀜**`, on.vp.slice(0, 30))
  ok(on.bar, `${role} — 돌아가는 띠가 떠 있음`)

  //  ⚠ 돌아가는 길이 없으면 기사님은 PC 화면에 갇힙니다
  const off = await s.p.evaluate(() => {
    const bar = document.querySelector('[data-pc-view-bar]')
    const btn = [...(bar?.querySelectorAll('button') ?? [])][0]
    if (!btn) return false
    btn.click(); return true
  })
  ok(off, `${role} — 띠에 되돌아가는 단추가 있음`)
  await s.p.waitForTimeout(1400)
  const back = await s.p.evaluate(() => ({
    vp: document.querySelector('meta[name=viewport]')?.content ?? '',
    bar: !!document.querySelector('[data-pc-view-bar]'),
  }))
  ok(/device-width/.test(back.vp), `${role} — **모바일 폭으로 돌아옴**`, back.vp.slice(0, 34))
  ok(!back.bar, `${role} — 띠가 사라짐`)
  await s.ctx.close()
}

// ── ④ 재로그인 — 새로 들어와도 처음부터 모바일 ─────────────────────────────
{
  const s = await open('field', 390, 844)
  await W.clickLabel(s.p, '더보기')
  await s.p.waitForTimeout(800)
  await s.p.evaluate(() => {
    const el = document.querySelector('[data-pc-view-open]')
    const t = el?.closest('[class*=cursor-pointer]') ?? el?.parentElement
    t?.click()
  })
  await s.p.waitForTimeout(1500)
  //  다시 들어온 것처럼 — 새로고침이 곧 새 세션 시작입니다
  await s.p.reload({ waitUntil: 'domcontentloaded' })
  await s.p.waitForTimeout(2600)
  const fresh = await s.p.evaluate(() => ({
    vp: document.querySelector('meta[name=viewport]')?.content ?? '',
    bar: !!document.querySelector('[data-pc-view-bar]'),
    path: location.pathname,
  }))
  ok(/device-width/.test(fresh.vp), '현장 — **다시 들어오면 모바일로 시작**', fresh.vp.slice(0, 34))
  ok(!fresh.bar, '현장 — PC 화면에 갇혀 있지 않음')
  ok(fresh.path === '/today', '현장 — 첫 화면은 오늘 일정', fresh.path)
}

await b.close()
