import { chromium, EXEC } from './_pw.mjs'
import * as W from './walk_lib.mjs'
import * as F from './perf_fixtures.mjs'

//  서버가 멈췄을 때의 안내 — Supabase 일시정지(540) · 응답 없음(503) · 통신 끊김
//
//   무료 프로젝트는 1주일 동안 사용이 없으면 일시정지되고, 그때 모든 요청이 540 으로 옵니다.
//   고치기 전: 로그인해 둔 분에게 「계정 정보를 찾지 못했습니다 — 계정을 다시 만들어야 합니다」(틀린 안내),
//   로그인 화면에는 영어 「Project paused」. 계정도 자료도 멀쩡한데 서버만 멈춘 것입니다.
//
//   잽니다: 무슨 일인지 갈라서 말함 · 푸는 순서 · 틀린 안내 없음 · 서버가 돌아오면 그대로 이어짐 ·
//           쓰는 중에 멈추면 위에 띠 · 병원 화면은 병원용 문구 · 함수 오류(500)는 서버 멈춤으로 안 봄.

const ok = (c, m, d = '') => { console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`); if (!c) process.exitCode = 1 }
const b = await chromium.launch({ executablePath: EXEC })
const SHOTS = process.env.SHOTS
const shot = async (p, n) => SHOTS && p.screenshot({ path: `${SHOTS}/${n}.png` })
const flat = (s) => (s ?? '').replace(/\s+/g, ' ').trim()

/** S.mode — null(정상) · 540 · 503 · 'abort' · 'rpc500'(RPC 만 500) · 'fn503'(Edge Function 만 503) */
async function open(S, role, path, { w = 390, session = true } = {}) {
  const state = { reqs: 0, writes: [], profile: { ...W.profileFor(role), font_scale: 'normal' }, schemaVersion: 87 }
  const ctx = await b.newContext({ viewport: { width: w, height: w < 700 ? 844 : 900 }, isMobile: w < 700, hasTouch: w < 700 })
  W.wire(ctx, state)
  //  나중에 건 길이 먼저 봅니다 — 멈춘 상태일 때만 가로챕니다
  await ctx.route('**/*supabase.co/**', (r) => {
    const url = r.request().url()
    if (S.mode === 'abort') return r.abort('failed')
    if (S.mode === 540 || S.mode === 503) return r.fulfill({ status: S.mode, contentType: 'application/json', body: JSON.stringify({ message: S.mode === 540 ? 'Project paused' : 'Service Unavailable' }) })
    if (S.mode === 'rpc500' && url.includes('/rpc/')) return r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ code: 'P0001', message: '검사용 함수 오류' }) })
    if (S.mode === 'fn503' && url.includes('/functions/v1/')) return r.fulfill({ status: 503, contentType: 'application/json', body: '{}' })
    return r.fallback()
  })
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message))
  await p.addInitScript(([k, u, on]) => {
    if (on) localStorage.setItem(k, JSON.stringify({ access_token: 't', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u }))
    localStorage.setItem('beonemirae-ops:tour-seen', 'staff,field,client,demo')
  }, ['beonemirae-ops:auth', { id: F.UID, aud: 'authenticated', email: state.profile.email, app_metadata: {}, user_metadata: {} }, session])
  await p.goto(`${W.BASE}${path}`, { waitUntil: 'domcontentloaded' })
  return { ctx, p, state, errs }
}
const waitFor = async (fn, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 200)) } return false }
const wake = (p) => p.evaluate(() => window.dispatchEvent(new Event('focus')))

// ═══ 1. 로그인해 둔 분 — 앱을 열었는데 서버가 일시정지 ═══════════════════════════
{
  const S = { mode: 540 }
  const { ctx, p, errs } = await open(S, 'admin', '/')
  ok(await waitFor(async () => (await p.locator('[data-auth-offline="paused"] [data-server-notice="paused"]').count()) === 1), '1 일시정지 — 「서버가 일시정지 상태입니다」 안내')
  const t = flat(await p.locator('[data-auth-offline]').innerText())
  ok(t.includes('로그아웃된 것도, 계정이 없어진 것도 아닙니다') && t.includes('자료는 그대로 있습니다'), '1 계정 · 자료는 멀쩡하다고 말함')
  ok(!/계정 정보를 찾지 못했습니다|계정을 다시 만들어야/.test(flat(await p.locator('body').innerText())), '1 틀린 안내(「계정을 다시 만들어야 합니다」) 없음')
  ok((await p.locator('[data-server-steps] li').count()) === 3 && t.includes('Restore project'), '1 푸는 순서 3단계 — 대시보드 「Restore project」')
  ok(t.includes('031-527-4376'), '1 병원 담당자분은 비원미래로 — 전화번호')
  const m = await p.evaluate(() => ({ over: document.documentElement.scrollWidth - document.documentElement.clientWidth, btn: Math.round(document.querySelector('[data-auth-offline-retry]').getBoundingClientRect().height) }))
  ok(m.over <= 1 && m.btn >= 44, '1 폰 — 가로 밀림 없음 · 「다시 시도」 손가락 크기', `${m.over}px · ${m.btn}px`)
  await shot(p, 'sd_paused_phone')
  //  관리자가 다시 켠 뒤 — 「다시 시도」로 그대로 이어짐 (다시 로그인 안 함)
  S.mode = null
  await p.click('[data-auth-offline-retry]')
  ok(await waitFor(async () => (await p.locator('[data-auth-offline]').count()) === 0 && new URL(p.url()).pathname === '/' && (await p.locator('main').count()) === 1), '1 서버가 돌아오면 「다시 시도」로 바로 업무 화면 (다시 로그인 안 함)')
  ok(errs.length === 0, '1 화면 오류 없음', errs[0]?.slice(0, 80))
  await ctx.close()
}

// ═══ 2. 로그인 화면 — 일시정지 중에 로그인 시도 ═══════════════════════════════════
{
  const S = { mode: 540 }
  const { ctx, p } = await open(S, 'admin', '/login', { session: false })
  await p.waitForTimeout(1200)
  await p.locator('input[type="email"]').fill('a@b.c')
  await p.locator('input[type="password"]').fill('pw12345678')
  await p.locator('button[type="submit"]').first().click()
  ok(await waitFor(async () => /서버가 일시정지 상태입니다/.test(flat(await p.locator('body').innerText()))), '2 로그인 화면 — 「서버가 일시정지 상태입니다 … Restore project」')
  const t = flat(await p.locator('body').innerText())
  ok(!/Project paused/.test(t) && !/이메일 또는 비밀번호가 올바르지/.test(t), '2 영어 원문 · 「비밀번호가 틀렸다」로 말하지 않음')
  await shot(p, 'sd_paused_login')
  await ctx.close()
}

// ═══ 3. 서버 응답 없음(503) · 통신 끊김 — 서로 다른 말 ══════════════════════════════
{
  const S = { mode: 503 }
  const { ctx, p } = await open(S, 'field', '/today')
  ok(await waitFor(async () => (await p.locator('[data-server-notice="down"]').count()) === 1, 25000), '3 503 — 「서버가 잠시 응답하지 않습니다」 (계정 문제로 말하지 않음)')
  ok(!/계정 정보를 찾지 못했습니다/.test(flat(await p.locator('body').innerText())), '3 503 — 틀린 안내 없음')
  await ctx.close()
}
{
  const S = { mode: 'abort' }
  const { ctx, p } = await open(S, 'field', '/today')
  ok(await waitFor(async () => (await p.locator('[data-server-notice="offline"]').count()) === 1, 25000), '3 통신 끊김 — 「지금 통신이 안 됩니다」 (예전 그대로)')
  ok(flat(await p.locator('[data-auth-offline]').innerText()).includes('로그아웃된 것이 아닙니다'), '3 통신 끊김 — 「로그아웃된 것이 아닙니다」')
  await ctx.close()
}

// ═══ 4. 쓰는 중에 서버가 멈춤 — 위에 띠 · 돌아오면 사라짐 ═══════════════════════════
{
  const S = { mode: null }
  const { ctx, p, state } = await open(S, 'admin', '/', { w: 1440 })
  await W.settle(p, state, 800, 30000)
  ok((await p.locator('[data-server-bar]').count()) === 0, '4 평소 — 띠 없음')
  S.mode = 540
  await wake(p)
  ok(await waitFor(async () => (await p.locator('[data-server-bar="paused"]').count()) === 1), '4 쓰는 중 일시정지 → 위에 「서버가 일시정지 상태입니다 — 지금은 저장되지 않습니다」')
  ok(flat(await p.locator('[data-server-bar]').innerText()).includes('Restore project') && (await p.locator('main').count()) === 1, '4 직원용 문구 · 보던 화면은 그대로 (튕기지 않음)')
  await shot(p, 'sd_bar_pc')
  S.mode = null
  await wake(p)
  ok(await waitFor(async () => (await p.locator('[data-server-bar]').count()) === 0), '4 서버가 돌아오면 띠가 저절로 사라짐')
  await ctx.close()
}
{
  const S = { mode: null }
  const { ctx, p, state } = await open(S, 'client', '/portal')
  await W.settle(p, state, 800, 30000)
  S.mode = 540
  await wake(p)
  ok(await waitFor(async () => (await p.locator('[data-server-bar="paused"]').count()) === 1), '4 병원 화면 — 띠')
  const t = flat(await p.locator('[data-server-bar]').innerText())
  ok(t.includes('서비스가 잠시 멈춰') && t.includes('031-527-4376') && !/Supabase|Restore/.test(t), '4 병원 담당자용 문구 — 서버 이름 없이 비원미래 전화', t.slice(0, 50))
  await ctx.close()
}

// ═══ 5. 서버 멈춤으로 보지 않는 것 — 함수 오류(500) · Edge Function 503 ═════════════
{
  const S = { mode: 'rpc500' }
  const { ctx, p, state } = await open(S, 'admin', '/', { w: 1440 })
  await W.settle(p, state, 800, 30000)
  await wake(p); await p.waitForTimeout(1500)
  ok((await p.locator('[data-server-bar]').count()) === 0 && (await p.locator('[data-auth-offline]').count()) === 0, '5 DB 함수 오류(500) 하나로는 「서버 멈춤」으로 보지 않음')
  await ctx.close()
}

await b.close()
