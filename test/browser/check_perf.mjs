import { chromium, EXEC } from './_pw.mjs'
import * as F from './perf_fixtures.mjs'

//  3년치가 쌓였을 때도 쓸 수 있는가 — 실측 후 그 자리를 지키는 검증.
//
//   지금까지 확인한 것은 「1,000줄 넘게 읽어 오는가」뿐이었습니다. 읽어 온
//   다음이 문제입니다 — 화면이 몇 초 만에 그려지는지, 날짜를 한 번 넘길 때
//   몇 초 멈추는지는 아무도 재 보지 않았습니다.
//
//   실측 규모: 거래처 18곳 · 수거 5,634건 · 청구 648건 · 입금 576건 (3년)
//
//   기준값은 실측치의 3~5배로 잡았습니다. 조금 느려졌다고 울리지 않고,
//   **무언가 크게 잘못되었을 때만** 울립니다. 특히 「서버 호출 횟수」는
//   화면이 자료를 무한히 다시 읽는 사고를 잡아냅니다.

const BASE = 'http://localhost:4173'
const out = []
const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  out.push(c)
  if (!c) process.exitCode = 1
}
const under = (ms, limit, label) => ok(ms < limit, `${label} < ${limit}ms`, `${ms}ms`)

let reqCount = 0
let bytes = 0

const b = await chromium.launch({ executablePath: EXEC })
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
await ctx.route('**/auth/v1/**', (r) =>
  r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: F.UID, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }) }))
await ctx.route('**/rest/v1/**', (r) => {
  const url = r.request().url()
  const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
  reqCount += 1
  //  supabase-js 는 나눠 읽기를 **질의 문자열**(offset·limit)로 보냅니다.
  //  Range 헤더가 아닙니다 — 헤더만 보고 흉내 내면 매번 전부를 돌려주게 되고,
  //  앱의 pageAll 이 「아직 더 있다」고 판단해 영원히 다시 읽습니다.
  //  (실제로 이 하니스 실수 때문에 거래처 상세가 안 열리는 것처럼 보였습니다)
  const q = new URL(url).searchParams
  const off = Number(q.get('offset') ?? 0)
  const lim = Number(q.get('limit') ?? 0)
  const page = (rows) => {
    const body = JSON.stringify(lim > 0 ? rows.slice(off, off + lim) : rows)
    bytes += body.length
    return r.fulfill({ status: 200, contentType: 'application/json', body })
  }
  const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
  if (url.includes('/rpc/app_schema_version')) return json(64)
  if (url.includes('/profiles')) return json(single ? F.profile : [F.profile])
  if (url.includes('/site_notes')) return page(F.notes)
  if (url.includes('/schedules')) return page(F.schedules)
  if (url.includes('/materials')) return page(F.materials)
  if (url.includes('/payment_receipts')) return page(F.receipts)
  if (url.includes('/payments')) return page(F.payments)
  if (url.includes('/client_prices')) return page(F.prices)
  if (url.includes('/operating_costs')) return page(F.costs)
  if (url.includes('/vehicles')) return page(F.vehicles)
  if (url.includes('/clients')) return single ? json(F.clients[0]) : page(F.clients)
  if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
  return json([])
})

const p = await ctx.newPage()
await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
  access_token: 't', token_type: 'bearer', expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
})), ['beonemirae-ops:auth', { id: F.UID, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }])

//  「다 읽었다」의 기준 — 화면 뼈대는 자료보다 먼저 뜹니다.
async function settle(page, quietMs = 700) {
  let last = reqCount
  let quiet = Date.now()
  for (;;) {
    await page.waitForTimeout(100)
    if (reqCount !== last) { last = reqCount; quiet = Date.now() }
    else if (Date.now() - quiet >= quietMs) return
    if (Date.now() - quiet > 90000) return
  }
}

console.log(`규모 — 거래처 ${F.clients.length} · 수거 ${F.schedules.length} · 청구 ${F.payments.length} · 입금 ${F.receipts.length}`)
ok(F.schedules.length > 5000, '3년치 규모로 재는가 (수거 5,000건 이상)', `${F.schedules.length}건`)

// ── 1. 앱 켜기 ────────────────────────────────────────────────────────────
reqCount = 0; bytes = 0
const t0 = Date.now()
await p.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
await p.waitForSelector('[data-revenue-kpis]', { timeout: 90000 })
await settle(p)
const boot = Date.now() - t0 - 700
under(boot, 5000, '앱 켜기(자료 전부 읽고 숫자까지)')
console.log(`       받은 양 ${(bytes / 1048576).toFixed(1)}MB · 서버 ${reqCount}회`)

//  자료를 무한히 다시 읽고 있지 않은가.
//   실측 28회(수거 6장 + 자재 2장 + 나머지). 60회를 넘으면 무언가 되풀이하고
//   있다는 뜻입니다 — 사람 눈에는 「그냥 좀 느리다」로만 보입니다.
ok(reqCount < 60, '앱 켤 때 서버 호출 60회 미만 (무한 재조회 감지)', `${reqCount}회`)

//  숫자가 실제로 나왔는가 — 빈 화면을 빠르다고 하면 안 됩니다
const kpi = ((await p.textContent('[data-revenue-kpis]')) ?? '').replace(/\s+/g, ' ')
ok(/누적매출/.test(kpi) && /[0-9]/.test(kpi), '빈 화면이 아니라 숫자가 나온 뒤를 잰 것', kpi.slice(0, 40))

// ── 2. 앱 안에서 화면 이동 ────────────────────────────────────────────────
for (const [path, label, sel] of [
  ['/today', '오늘 일정', 'h1, h2'],
  ['/clients', '거래처', '.card'],
  ['/revenue', '매출 현황', '[data-revenue-kpis]'],
]) {
  reqCount = 0
  const link = p.locator(`a[href="${path}"]`).first()
  if ((await link.count()) === 0) continue
  const t = Date.now()
  await link.click()
  await p.waitForSelector(sel, { timeout: 60000 })
  await settle(p, 400)
  under(Date.now() - t - 400, 2000, `화면 이동 · ${label}`)
  ok(reqCount === 0, `${label} 로 옮길 때 서버를 다시 부르지 않음`, `${reqCount}회`)
}

// ── 3. 손가락이 기다리는 시간 ─────────────────────────────────────────────
await p.goto(`${BASE}/clients/c0`, { waitUntil: 'domcontentloaded' })
{
  const t = Date.now()
  await p.waitForSelector('[data-client-tabs]', { timeout: 60000 })
  await settle(p, 400)
  under(Date.now() - t - 400, 4000, '거래처 상세 열기(3년치가 걸린 화면)')
}
{
  const tabs = p.locator('[data-client-tab]')
  const n = Math.min(await tabs.count(), 8)
  let worst = 0
  let worstName = ''
  for (let i = 1; i < n; i += 1) {
    const t = Date.now()
    await tabs.nth(i).click()
    await p.waitForTimeout(50)
    const ms = Date.now() - t - 50
    if (ms > worst) { worst = ms; worstName = (await tabs.nth(i).textContent())?.trim() ?? '' }
  }
  under(worst, 1500, `거래처 상세 탭 전환(가장 느린 「${worstName}」)`)
}
await p.goto(`${BASE}/today`, { waitUntil: 'domcontentloaded' })
await settle(p)
{
  const btn = p.locator('button').first()
  const t = Date.now()
  await btn.click().catch(() => {})
  await p.waitForTimeout(50)
  under(Date.now() - t - 50, 1500, '오늘 일정에서 날짜 넘기기')
}

// ── 4. 폰에서 LTE 로 앱 켜기 ──────────────────────────────────────────────
{
  const ph = await ctx.newPage()
  await ph.setViewportSize({ width: 390, height: 844 })
  await ph.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: F.UID, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }])
  const cdp = await ctx.newCDPSession(ph)
  await cdp.send('Network.enable')
  //  LTE 보통 수준 — 내려받기 12Mbps · 왕복 70ms
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false, downloadThroughput: (12 * 1024 * 1024) / 8, uploadThroughput: (3 * 1024 * 1024) / 8, latency: 70,
  })
  reqCount = 0; bytes = 0
  const t = Date.now()
  await ph.goto(`${BASE}/today`, { waitUntil: 'domcontentloaded' })
  await ph.waitForSelector('h1, h2', { timeout: 120000 })
  await settle(ph)
  const ms = Date.now() - t - 700
  under(ms, 6000, '폰(LTE)에서 앱 켜기')
  //  기사님 데이터 요금 — 켤 때마다 받는 양
  ok(bytes / 1048576 < 12, '앱 한 번 켜는 데 받는 양이 12MB 미만', `${(bytes / 1048576).toFixed(1)}MB`)
  await ph.close()
}

// ── 5. 메모리 ─────────────────────────────────────────────────────────────
const mem = await p.evaluate(() => Math.round(performance.memory.usedJSHeapSize / 1048576))
ok(mem < 300, '브라우저 탭이 쓰는 메모리 300MB 미만 (폰에서 탭이 죽지 않게)', `${mem}MB`)

await b.close()
console.log(`\n총 ${out.length}건 · 실패 ${out.filter((x) => !x).length}건`)
