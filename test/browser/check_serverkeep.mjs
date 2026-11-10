import { chromium, EXEC } from './_pw.mjs'
import * as W from './walk_lib.mjs'
import * as F from './perf_fixtures.mjs'

//  무료 서버로 안전하게 운영하기 (0151) — 화면 쪽
//
//   A. 서버 유지 신호 카드 (설정 → 서버 점검 · 관리자만)
//      마지막 신호 시각 · 며칠째 없으면 알림 · 「지금 유지 신호 보내기」의 답을 사람 말로 ·
//      기록 함수가 없어도 깨지지 않음 · **여는 것만으로는 신호를 보내지 않음** · 켜져 있다고 말하지 않음
//   B. 전체 스냅샷 알림 (첫 화면 한 줄 · 관리자만)
//      받은 기록 없음 · 한 달 넘음 · 반쪽 → 한 줄, 누르면 설정의 스냅샷 카드. 알릴 일이 없으면 자리도 없음
//
//   /api/keepalive 함수 자체는 check_keepalive.mjs, DB 함수는 supabase/test/56_keepalive.sql 이 잽니다.

const ok = (c, m, d = '') => { console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`); if (!c) process.exitCode = 1 }
const b = await chromium.launch({ executablePath: EXEC })
const SHOTS = process.env.SHOTS
const shot = async (p, n) => SHOTS && p.screenshot({ path: `${SHOTS}/${n}.png` })
const flat = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const ago = (days, hours = 0) => new Date(Date.now() - days * 86400000 - hours * 3600000).toISOString()
const waitFor = async (fn, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 150)) } return false }

/**
 *  S.hb        'missing'(기록 함수 없음) · {last_at, first_at, pings} · {}(아직 신호 없음)
 *  S.api       /api/keepalive 의 답 — { status, body } · 'html'(이 주소에 함수 없음) · 'abort'
 *  S.lastSnap  감사기록의 「전체 스냅샷 받기」 줄들 (최신이 앞)
 */
async function open(S, role, path, { w = 1440 } = {}) {
  const state = { reqs: 0, writes: [], profile: { ...W.profileFor(role), font_scale: 'normal' }, schemaVersion: 87 }
  const seen = { hb: 0, api: 0, snapQ: 0 }
  const ctx = await b.newContext({ viewport: { width: w, height: w < 700 ? 844 : 1000 }, isMobile: w < 700, hasTouch: w < 700 })
  W.wire(ctx, state)
  await ctx.route('**/rest/v1/rpc/app_heartbeat_status**', (r) => {
    seen.hb += 1
    if (S.hb === 'missing') return r.fulfill({ status: 404, contentType: 'application/json',
      body: JSON.stringify({ code: 'PGRST202', message: 'Could not find the function public.app_heartbeat_status without parameters in the schema cache' }) })
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(S.hb ?? {}) })
  })
  await ctx.route('**/rest/v1/audit_logs**', (r) => {
    if (r.request().method() !== 'GET') return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    if (r.request().url().includes('action=eq.snapshot.download')) {
      seen.snapQ += 1
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify((S.lastSnap ?? []).slice(0, 1)) })
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  await ctx.route('**/api/keepalive', (r) => {
    seen.api += 1
    if (S.api === 'abort') return r.abort('failed')
    if (S.api === 'html' || !S.api) return r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body>app</body></html>' })
    S.onApi?.()
    return r.fulfill({ status: S.api.status, contentType: 'application/json', body: JSON.stringify(S.api.body) })
  })
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message))
  await p.addInitScript(([k, u]) => {
    localStorage.setItem(k, JSON.stringify({ access_token: 't', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u }))
    localStorage.setItem('beonemirae-ops:tour-seen', 'staff,field,client,demo')
  }, ['beonemirae-ops:auth', { id: F.UID, aud: 'authenticated', email: state.profile.email, app_metadata: {}, user_metadata: {} }])
  await p.goto(`${W.BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await W.settle(p, state, 700, 30000)
  return { ctx, p, state, errs, seen }
}
const card = (p) => p.locator('[data-keepalive-card]').first()

// ═══ A1. 기록 함수가 아직 없음 (PROPOSAL_0151 전) ═══════════════════════════════
{
  const S = { hb: 'missing', api: { status: 200, body: { ok: true, state: 'reached', needs_sql: true, at: new Date().toISOString() } } }
  const { ctx, p, errs, seen } = await open(S, 'admin', '/settings')
  ok(await waitFor(async () => (await p.locator('[data-keepalive-card="missing"]').count()) === 1), 'A1 기록 함수가 없어도 카드가 뜸 (깨지지 않음)')
  const t = flat(await card(p).innerText())
  ok(t.includes('PROPOSAL_0151_keepalive.sql') && t.includes('신호는 지금도 보낼 수 있습니다'), 'A1 「기록 기능이 아직 없습니다 — 신호는 보낼 수 있습니다」', t.slice(0, 60))
  ok(seen.api === 0, 'A1 카드를 여는 것만으로는 유지 신호를 보내지 않음', `${seen.api}번`)
  ok(t.includes('예약 호출은 따로 켜야') && !/예약 호출이 켜져 있습니다|자동으로 보내고 있습니다/.test(t), 'A1 「예약은 따로 켜야 합니다」 — 켜져 있다고 말하지 않음')
  ok((await p.locator('[data-health-card]').count()) === 1 && (await p.locator('[data-snapshot-take]').count()) === 1, 'A1 설정의 다른 카드(자가진단 · 스냅샷)는 그대로')
  await card(p).scrollIntoViewIfNeeded()
  await p.click('[data-keepalive-send]')
  ok(await waitFor(async () => (await p.locator('[data-keepalive-sent="warn"]').count()) === 1), 'A1 보내기 → 「DB 까지 닿았습니다. 기록 함수가 없어 시각은 남지 않았습니다」')
  ok(flat(await p.locator('[data-keepalive-sent]').innerText()).includes('DB 까지 닿았습니다') && seen.api === 1, 'A1 닿은 것과 기록된 것을 갈라서 말함 · 한 번만 부름')
  await shot(p, 'sk_missing_pc')
  ok(errs.length === 0, 'A1 화면 오류 없음', errs[0]?.slice(0, 80))
  await ctx.close()
}

// ═══ A2. 기록이 있음 — 오늘 신호 · 보내면 시각이 갱신됨 ═══════════════════════════
{
  const S = { hb: { first_at: ago(20), last_at: ago(0, 2), pings: 12 }, api: { status: 200, body: { ok: true, state: 'ok', needs_sql: false, at: new Date().toISOString() } } }
  S.onApi = () => { S.hb = { ...S.hb, last_at: new Date().toISOString(), pings: 13 } }
  const { ctx, p, seen } = await open(S, 'admin', '/settings')
  ok(await waitFor(async () => (await p.locator('[data-keepalive-card="ready"]').count()) === 1), 'A2 기록이 있으면 마지막 신호를 보여 줌')
  const line = flat(await p.locator('[data-keepalive-line]').innerText())
  ok(/마지막 유지 신호 \d{4}-\d{2}-\d{2} \d{2}:\d{2} \((오늘|1일 전)\) · 누적 12번/.test(line), 'A2 「마지막 유지 신호 날짜 시각 (오늘) · 누적 12번」', line)
  ok((await p.locator('[data-keepalive-quiet]').count()) === 0, 'A2 최근 신호가 있으면 경고 없음')
  await card(p).scrollIntoViewIfNeeded()
  await p.click('[data-keepalive-send]')
  ok(await waitFor(async () => (await p.locator('[data-keepalive-sent="ok"]').count()) === 1), 'A2 보내기 → 「유지 신호를 보냈습니다 — DB 가 기록했습니다」')
  ok(await waitFor(async () => /누적 13번/.test(flat(await p.locator('[data-keepalive-line]').innerText()))), 'A2 보낸 뒤 마지막 신호를 다시 읽음 (12 → 13번)')
  ok(seen.api === 1, 'A2 한 번 누르면 한 번만 부름', `${seen.api}번`)
  await shot(p, 'sk_ok_pc')
  await ctx.close()
}

// ═══ A3. 닷새째 신호 없음 — 「예약이 돌지 않는다」 ════════════════════════════════
{
  const S = { hb: { first_at: ago(30), last_at: ago(5, 1), pings: 40 }, api: { status: 503, body: { ok: false, state: 'paused', needs_sql: false, at: new Date().toISOString() } } }
  const { ctx, p } = await open(S, 'admin', '/settings')
  ok(await waitFor(async () => (await p.locator('[data-keepalive-quiet]').count()) === 1), 'A3 닷새째 신호가 없으면 알림')
  const t = flat(await p.locator('[data-keepalive-quiet]').innerText())
  ok(/5일째 유지 신호가 없습니다/.test(t) && t.includes('예약 호출이 꺼져 있거나 돌지 않고') && t.includes('직원이 매일 앱을 쓰고 있다면 괜찮습니다'), 'A3 「5일째 … 예약이 꺼져 있거나 돌지 않음 — 매일 쓰면 괜찮음」', t.slice(0, 50))
  await card(p).scrollIntoViewIfNeeded()
  await p.click('[data-keepalive-send]')
  ok(await waitFor(async () => (await p.locator('[data-keepalive-sent="bad"]').count()) === 1), 'A3 일시정지 답(503) → 빨간 안내')
  ok(flat(await p.locator('[data-keepalive-sent]').innerText()).includes('서버가 일시정지 상태입니다') && flat(await p.locator('[data-keepalive-sent]').innerText()).includes('Restore project'), 'A3 「서버가 일시정지 상태입니다 … Restore project」')
  await shot(p, 'sk_quiet_pc')
  await ctx.close()
}

// ═══ A4. 그 밖의 답 — 못 닿음 · 설정 없음 · 이 주소에 함수 없음 · 통신 끊김 ═══════════
for (const [name, api, want] of [
  ['못 닿음', { status: 503, body: { ok: false, state: 'down' } }, 'DB 에 닿지 못했습니다'],
  ['환경변수 없음', { status: 500, body: { ok: false, state: 'not_configured' } }, '환경변수가 없습니다'],
  ['이 주소에 함수 없음(화면이 옴)', 'html', '이 주소에는 유지 신호 기능이 없습니다'],
  ['통신 끊김', 'abort', '인터넷 연결을 확인'],
]) {
  const S = { hb: {}, api }
  const { ctx, p, errs } = await open(S, 'admin', '/settings')
  if (name === '못 닿음') ok(flat(await p.locator('[data-keepalive-line]').innerText()).includes('아직 유지 신호가 한 번도 없었습니다'), 'A4 기록 함수는 있는데 신호가 없으면 「한 번도 없었습니다」')
  await card(p).scrollIntoViewIfNeeded()
  await p.click('[data-keepalive-send]')
  ok(await waitFor(async () => (await p.locator('[data-keepalive-sent="bad"]').count()) === 1) && flat(await p.locator('[data-keepalive-sent]').innerText()).includes(want), `A4 ${name} → 「${want}…」`)
  ok(errs.length === 0 && !/보냈습니다/.test(flat(await p.locator('[data-keepalive-sent]').innerText())), `A4 ${name} — 보냈다고 말하지 않음 · 화면 오류 없음`)
  await ctx.close()
}

// ═══ A5. 관리자가 아니면 — 뜨지도, 부르지도 않음 ══════════════════════════════════
{
  const S = { hb: { last_at: ago(0), pings: 3 }, lastSnap: [] }
  const { ctx, p, seen } = await open(S, 'office', '/settings')
  ok((await p.locator('[data-keepalive-card]').count()) === 0 && seen.hb === 0, 'A5 사무실 계정 — 카드 없음 · 서버에 묻지도 않음', `${seen.hb}번`)
  ok(seen.snapQ === 0 && (await p.locator('[data-snapshot-last]').count()) === 0, 'A5 사무실 계정 — 스냅샷 기록도 묻지 않음')
  await ctx.close()
}

// ═══ A6. 폰 — 설정 목차 → 서버 점검 창 ═══════════════════════════════════════════
{
  const S = { hb: { first_at: ago(9), last_at: ago(4, 3), pings: 7 }, api: { status: 200, body: { ok: true, state: 'ok' } } }
  const { ctx, p, errs } = await open(S, 'admin', '/settings#health', { w: 390 })
  ok(await waitFor(async () => (await p.locator('[data-setting-sheet="health"] [data-keepalive-card="ready"]').count()) === 1), 'A6 폰 — 「서버 점검」 창 안에 유지 신호 카드')
  const m = await p.evaluate(() => {
    const c = document.querySelector('[data-setting-sheet="health"] [data-keepalive-card]')
    const btn = c.querySelector('[data-keepalive-send]').getBoundingClientRect()
    const r = c.getBoundingClientRect()
    return { over: document.documentElement.scrollWidth - document.documentElement.clientWidth, btnH: Math.round(btn.height), btnW: Math.round(btn.width), inside: r.left >= 0 && r.right <= window.innerWidth + 1 }
  })
  ok(m.over <= 1 && m.inside, 'A6 폰 — 가로 밀림 없음 · 카드가 화면 안', `${m.over}px`)
  ok(m.btnH >= 44 && m.btnW >= 250, 'A6 폰 — 보내기 단추가 손가락 크기 · 한 줄 가득', `${m.btnW}×${m.btnH}`)
  ok((await p.locator('[data-keepalive-quiet]').count()) === 1, 'A6 폰 — 나흘째 신호 없음 알림')
  await shot(p, 'sk_phone')
  ok(errs.length === 0, 'A6 화면 오류 없음', errs[0]?.slice(0, 80))
  await ctx.close()
}

// ═══ B1. 첫 화면 — 받은 기록이 없으면 한 줄 → 누르면 설정의 스냅샷 카드 ═══════════════
{
  const S = { hb: {}, lastSnap: [] }
  const { ctx, p, state, errs } = await open(S, 'admin', '/')
  ok(await waitFor(async () => (await p.locator('[data-backup-line="none"]').count()) === 1), 'B1 받은 기록이 없으면 첫 화면에 한 줄')
  const t = flat(await p.locator('[data-backup-line]').innerText())
  ok(t.includes('전체 스냅샷을 받은 기록이 없습니다') && t.includes('무료 서버에는 자동 백업이 없습니다'), 'B1 「받은 기록이 없습니다 · 무료 서버에는 자동 백업이 없습니다」', t)
  ok(!/받은 적이 없습니다|백업이 없습니다 —/.test(t), 'B1 「받은 적이 없다」고 단정하지 않음 (기록이 없을 뿐)')
  const g = await p.evaluate(() => {
    const a = document.querySelector('[data-backup-line]').getBoundingClientRect()
    const prev = document.querySelector('[data-backup-line]').parentElement.previousElementSibling
    return { h: Math.round(a.height), w: Math.round(a.width), over: document.documentElement.scrollWidth - document.documentElement.clientWidth }
  })
  ok(g.h >= 44 && g.h <= 70 && g.over <= 1, 'B1 한 줄짜리 띠 (오늘 할 일을 밀지 않음) · 가로 밀림 없음', `${g.w}×${g.h}`)
  await shot(p, 'sk_line_pc')
  await p.click('[data-backup-line]')
  await W.settle(p, state, 600, 20000)
  ok(new URL(p.url()).pathname === '/settings' && new URL(p.url()).hash === '#backup', 'B1 누르면 설정의 스냅샷 카드로', p.url().split('4173')[1])
  ok(await waitFor(async () => (await p.locator('[data-snapshot-take]').count()) === 1 && (await p.locator('[data-snapshot-last="none"]').count()) === 1), 'B1 그 카드에 「받기」 단추와 「받은 기록이 없습니다」')
  ok(errs.length === 0, 'B1 화면 오류 없음', errs[0]?.slice(0, 80))
  await ctx.close()
}

// ═══ B2. 열흘 전에 받음 — 알릴 일이 없으면 자리도 없음 ════════════════════════════
{
  const S = { lastSnap: [{ at: ago(10), actor_name: '대표', after_data: { unreadable: [] } }] }
  const { ctx, p, seen } = await open(S, 'admin', '/')
  await p.waitForTimeout(800)
  ok(seen.snapQ >= 1 && (await p.locator('[data-backup-line]').count()) === 0, 'B2 열흘 전에 받았으면 첫 화면에 아무 줄도 없음', `조회 ${seen.snapQ}번`)
  ok(seen.snapQ === 1, 'B2 한 번만 물음', `${seen.snapQ}번`)
  await ctx.close()
}

// ═══ B3. 45일 전 · 반쪽 ══════════════════════════════════════════════════════════
{
  const S = { lastSnap: [{ at: ago(45), actor_name: '대표', after_data: { unreadable: [] } }] }
  const { ctx, p } = await open(S, 'admin', '/', { w: 390 })
  ok(await waitFor(async () => (await p.locator('[data-backup-line="old"]').count()) === 1), 'B3 45일 전 → 첫 화면에 한 줄 (폰)')
  const t = flat(await p.locator('[data-backup-line]').innerText())
  ok(/전체 스냅샷을 받은 지 45일 지났습니다/.test(t), 'B3 「받은 지 45일 지났습니다」', t)
  const m = await p.evaluate(() => {
    const line = document.querySelector('[data-backup-line]').getBoundingClientRect()
    const focus = document.querySelector('[data-today-focus], [data-focus-card]')?.getBoundingClientRect()
    return { over: document.documentElement.scrollWidth - document.documentElement.clientWidth, h: Math.round(line.height), y: Math.round(line.top + window.scrollY) }
  })
  ok(m.over <= 1 && m.h >= 44, 'B3 폰 — 가로 밀림 없음 · 손가락 크기', `${m.over}px · ${m.h}px`)
  await shot(p, 'sk_line_phone')
  await ctx.close()
}
{
  const S = { lastSnap: [{ at: ago(2), actor_name: '대표', after_data: { unreadable: ['audit_logs'] } }] }
  const { ctx, p } = await open(S, 'admin', '/')
  ok(await waitFor(async () => (await p.locator('[data-backup-line="partial"]').count()) === 1), 'B3 이틀 전이어도 반쪽이었으면 알림')
  ok(flat(await p.locator('[data-backup-line]').innerText()).includes('마지막 전체 스냅샷이 반쪽이었습니다'), 'B3 「마지막 전체 스냅샷이 반쪽이었습니다」')
  await ctx.close()
}

// ═══ B4. 관리자가 아니면 · 서버가 답을 못 주면 — 아무 말도 하지 않음 ═════════════════
{
  const S = { lastSnap: [] }
  const { ctx, p, seen } = await open(S, 'office', '/')
  await p.waitForTimeout(600)
  ok((await p.locator('[data-backup-line]').count()) === 0 && seen.snapQ === 0, 'B4 사무실 계정 — 줄 없음 · 묻지도 않음')
  await ctx.close()
}
{
  const S = { lastSnap: [] }
  const { ctx, p } = await open(S, 'admin', '/')
  //  이 화면만 감사기록 조회를 실패로 — 모르는 것을 「없다」고 하지 않습니다
  const ctx2 = await b.newContext({ viewport: { width: 1440, height: 1000 } })
  const state = { reqs: 0, writes: [], profile: { ...W.profileFor('admin'), font_scale: 'normal' }, schemaVersion: 87 }
  W.wire(ctx2, state)
  await ctx2.route('**/rest/v1/audit_logs**', (r) => r.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ message: 'permission denied' }) }))
  const q = await ctx2.newPage()
  await q.addInitScript(([k, u]) => {
    localStorage.setItem(k, JSON.stringify({ access_token: 't', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u }))
    localStorage.setItem('beonemirae-ops:tour-seen', 'staff,field,client,demo')
  }, ['beonemirae-ops:auth', { id: F.UID, aud: 'authenticated', email: state.profile.email, app_metadata: {}, user_metadata: {} }])
  await q.goto(`${W.BASE}/`, { waitUntil: 'domcontentloaded' })
  await W.settle(q, state, 700, 30000)
  ok((await q.locator('[data-backup-line]').count()) === 0 && (await q.locator('main').count()) === 1, 'B4 기록을 읽지 못하면 아무 말도 하지 않음 (「없다」고 하지 않음) · 화면은 그대로')
  await ctx2.close()
  await ctx.close()
}

await b.close()
