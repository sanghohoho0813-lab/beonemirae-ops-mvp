import { chromium, EXEC } from './_pw.mjs'

//  「아직 안 읽었다」와 「정말로 없다」는 다른 말입니다
//
//   실제 계정 E2E 에서 병원 담당자로 로그인한 직후 몇 초 동안
//     「연결된 병원 정보를 찾을 수 없습니다 — 담당자에게 계정 연결을 요청해 주세요」
//   가 떴습니다. 실제로는 연결돼 있었습니다. 파일럿 첫날 병원 담당자가 이걸
//   보면 화면을 더 안 기다리고 전화를 겁니다.
//
//   여기서 재는 것은 네 가지입니다.
//     ① 느린 서버 — 자료가 오기 전에 「없습니다」라고 하지 않는가
//     ② 자료가 온 뒤 — 정상 화면이 뜨는가
//     ③ 읽기 실패 — 「없습니다」가 아니라 「불러오지 못했습니다」인가
//     ④ **진짜로 비었을 때는 그대로 「없습니다」라고 하는가**
//        (④ 가 없으면 빈 화면을 영원히 도는 물레방아로 덮는 것이 통과합니다)

const BASE = 'http://localhost:4173'
const UID = '00000000-0000-0000-0000-0000000000ad'
const SUID = '00000000-0000-0000-0000-0000000000af'
const CA = '00000000-0000-0000-0000-0000000000c1'
const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  if (!c) process.exitCode = 1
}
const flat = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const TODAY = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const clients = [{
  id: CA, name: '가나요양병원', type: '병원', address: '', manager: '', phone: '',
  collection_cycle: '주 1회', collects_medical_waste: true, collects_diaper: false,
  storage_size: '보통', note: '', is_demo_generated: false, demo_session_id: null, active: true,
  contract_start: '2025-01-01', contract_end: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}]
const schedules = [{
  id: 's-1', date: TODAY, client_id: CA, waste_type: '의료폐기물', vehicle_id: null,
  scheduled_time: '09:30', status: '예정', expected_amount: 100, actual_amount: null,
  completed_at: null, memo: '', origin: 'system', is_additional: false, demo_session_id: null,
  plan_batch: null, created_at: `${TODAY}T00:00:00Z`, updated_at: `${TODAY}T00:00:00Z`,
}]

const b = await chromium.launch({ executablePath: EXEC })

/**
 * @param mode 'slow'  자료는 정상이지만 응답이 DELAY ms 늦다
 *             'fail'  첫 읽기가 500 으로 실패한다
 *             'empty' 정상 응답인데 **정말로** 아무것도 없다
 */
function wire(ctx, { mode = 'slow', delay = 3000, role = 'client' } = {}) {
  const id = role === 'client' ? UID : SUID
  const pf = {
    id, email: 'a@b.c', name: role === 'client' ? '가나요양병원 담당자' : '사무실',
    role, font_scale: 'normal', active: true, approved_at: '2026-01-01T00:00:00Z',
    client_id: role === 'client' ? CA : null, created_at: '2026-01-01T00:00:00Z',
  }
  ctx.route('**/auth/v1/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ id, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }) }))

  //  ⚠ 요청마다 delay 를 더하면 안 됩니다 — loadAppData 가 여러 번 나눠
  //    읽으면 3.5초 × N 이 되어 「끝내 안 온다」가 됩니다. 재려는 것은
  //    「처음 몇 초」이므로, **시작 시각 기준으로** 같은 순간에 풀립니다.
  const t0 = Date.now()
  ctx.route('**/rest/v1/**', async (r) => {
    const url = r.request().url()
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })

    //  로그인 판정(profiles)은 늦추지 않습니다 — 늦추면 로그인 화면이 뜨고,
    //  우리가 재려는 「로그인은 됐는데 자료가 아직」 상태가 안 만들어집니다.
    if (url.includes('/profiles')) return json(single ? pf : [pf])
    if (url.includes('/rpc/app_schema_version')) return json(64)
    if (url.includes('/rpc/app_health_check')) return json({ version: 64, ok: true, missing: [], checkedAt: '' })
    if (url.includes('/rpc/recent_app_errors')) return json({ days: 7, total: 0, groups: [], checkedAt: '' })
    if (r.request().method() === 'POST' && url.includes('/app_errors')) return json([])

    if (mode === 'slow') await sleep(Math.max(0, delay - (Date.now() - t0)))
    if (mode === 'fail') {
      return r.fulfill({ status: 500, contentType: 'application/json',
        body: JSON.stringify({ message: '서버가 응답하지 않습니다' }) })
    }
    if (mode === 'empty') return json(single ? null : [])
    if (url.includes('/schedules')) return json(schedules)
    if (url.includes('/clients')) return json(single ? clients[0] : clients)
    return json([])
  })
}

async function open(ctx, path, { wait = 0 } = {}) {
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: ctx.__uid, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }])
  await p.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
  if (wait) await p.waitForTimeout(wait)
  return p
}

const body = async (p) => flat(await p.textContent('body'))

// ── 1~4. 병원 첫 화면 · 느린 서버 ────────────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
  ctx.__uid = UID
  wire(ctx, { mode: 'slow', delay: 3500 })
  const p = await open(ctx, '/portal', { wait: 1400 })

  const t = await body(p)
  ok(!/연결된 병원 정보를 찾을 수 없습니다/.test(t),
     '① 자료가 오기 전에 「연결된 병원 정보를 찾을 수 없습니다」가 뜨지 않음')
  ok(await p.locator('[data-load-state="loading"]').count() > 0,
     '② 대신 「불러오는 중」이 보임')
  ok(/불러오는 중/.test(t), '③ 글자로도 「불러오는 중」이라고 적혀 있음')

  //  자료가 도착하면 정상 화면
  const came = await p.waitForSelector('[data-portal-cta="collect"]', { timeout: 20000 })
    .then(() => true, () => false)
  ok(came, '④ 자료가 도착하면 정상 첫 화면이 뜸')
  await ctx.close()
}

// ── 5~6. 병원 첫 화면 · 읽기 실패 ────────────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
  ctx.__uid = UID
  wire(ctx, { mode: 'fail' })
  const p = await open(ctx, '/portal', { wait: 3000 })
  const t = await body(p)
  ok(!/연결된 병원 정보를 찾을 수 없습니다/.test(t),
     '⑤ 읽기가 실패했을 때 「계정 연결을 요청하세요」라고 하지 않음')
  ok(/자료를 불러오지 못했습니다/.test(t), '⑥ 「자료를 불러오지 못했습니다」라고 말함')
  await ctx.close()
}

// ── 7~8. 병원 첫 화면 · 진짜로 비었을 때 (검사가 무는지) ─────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
  ctx.__uid = UID
  wire(ctx, { mode: 'empty' })
  const p = await open(ctx, '/portal', { wait: 3000 })
  const t = await body(p)
  ok(/연결된 병원 정보를 찾을 수 없습니다/.test(t),
     '⑦ **정말로** 연결이 없으면 그대로 「찾을 수 없습니다」라고 함')
  ok(await p.locator('[data-load-state="loading"]').count() === 0,
     '⑧ 그때는 물레방아가 남아 돌지 않음')
  await ctx.close()
}

// ── 9~12. 현장·사무실 화면 ──────────────────────────────────────────────────
const staffPages = [
  ['/today', /등록된 일정이 없어요/, '오늘 일정'],
  ['/clients', /아직 등록된 거래처가 없습니다/, '거래처'],
  ['/requests', /요청이 없습니다/, '병원 요청'],
]
for (const [path, empty, label] of staffPages) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
  ctx.__uid = SUID
  wire(ctx, { mode: 'slow', delay: 3500, role: 'office' })
  const p = await open(ctx, path, { wait: 1400 })
  const t = await body(p)
  //  ⚠ 「불러오는 중」이라는 **글자**만 보면 안 됩니다 — 위쪽 띠(SyncBar)가
  //    원래 그렇게 적습니다. 그러면 화면 몸통이 「없습니다」인 채로도 통과합니다.
  //    몸통에 실제로 로딩 자리가 놓였는지를 봅니다.
  const spinner = await p.locator('[data-load-state="loading"]').count()
  ok(!empty.test(t) && spinner > 0,
     `⑨ ${label} — 자료 오기 전에 「없다」고 하지 않음`, `로딩자리 ${spinner}개`)
  await ctx.close()
}

// ── 13. 사무실 화면도 진짜 빈 상태는 그대로 ─────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
  ctx.__uid = SUID
  wire(ctx, { mode: 'empty', role: 'office' })
  const p = await open(ctx, '/clients', { wait: 3000 })
  const t = await body(p)
  ok(/아직 등록된 거래처가 없습니다/.test(t), '⑩ 거래처가 진짜 없으면 그대로 「없습니다」')
  await ctx.close()
}

await b.close()
