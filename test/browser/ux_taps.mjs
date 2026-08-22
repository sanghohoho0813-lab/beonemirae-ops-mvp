import { chromium, EXEC } from './_pw.mjs'

//  0071 — Before/After 계측: 터치 수 · 스크롤 횟수 · 화면 이동 수 (390px)
//  ⚠ 「스크롤 횟수」는 사람이 미는 횟수로 셉니다: 화면 높이의 3/4 을 한 번으로 봅니다.
//  ⚠ 「화면 이동 수」는 주소(route)가 바뀐 횟수입니다. 시트·펼침은 이동이 아닙니다.

const BASE = process.env.BASE ?? 'http://localhost:4173'
const LABEL = process.env.LABEL ?? 'AFTER'
const UID = '00000000-0000-0000-0000-0000000000f1'
const C1 = '00000000-0000-0000-0000-0000000000a1'
const V3 = '00000000-0000-0000-0000-0000000000v3'
const T = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
const day = (n) => { const d = new Date(`${T}T00:00:00`); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE') }

const me = { id: UID, email: 'f@b.c', name: '김준기', role: 'field', font_scale: 'normal', active: true,
  approved_at: '2026-01-01T00:00:00Z', client_id: null, vehicle_id: V3, created_at: '2026-01-01T00:00:00Z' }
const clients = [{ id: C1, name: '한마음요양병원', type: '요양병원', address: '경기도 남양주시', manager: '김담당',
  phone: '031-111-2222', collection_cycle: '주 3회', collects_medical_waste: true, collects_diaper: true,
  storage_size: '보통', note: '', is_demo_generated: false, active: true, pricing: {},
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }]
const vehicles = [{ id: V3, name: '3호차', waste_type: '의료폐기물', tonnage: 1, nominal_capacity: 1000,
  expected_capacity: 800, driver: '', active: true }]
const todaySched = [{ id: 's1', date: T, client_id: C1, waste_type: '의료폐기물', vehicle_id: null,
  scheduled_time: '09:00', status: '예정', expected_amount: 120, actual_amount: null, completed_at: null,
  memo: '', origin: 'system', canceled_at: null, created_at: `${T}T00:00:00Z`, updated_at: `${T}T00:00:00Z` }]

const b = await chromium.launch({ executablePath: EXEC })

async function open(W, seed) {
  const ctx = await b.newContext({ viewport: { width: W, height: 844 }, isMobile: true, hasTouch: true })
  const state = { schedules: [...seed], booked: [], saved: [] }
  ctx.route('**/auth/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: UID, aud: 'authenticated', email: 'f@b.c', app_metadata: {}, user_metadata: {} }) }))
  ctx.route('**/rest/v1/**', (r) => {
    const url = r.request().url()
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    if (url.includes('/rpc/app_schema_version')) return json(70)
    if (url.includes('/rpc/book_visit')) {
      const q = JSON.parse(r.request().postData() ?? '{}')
      state.booked.push(q)
      state.schedules.push({ id: `bk${state.booked.length}`, date: q.p_date, client_id: q.p_client_id,
        waste_type: q.p_waste_type, vehicle_id: null, scheduled_time: q.p_time, status: '예정',
        expected_amount: 0, actual_amount: null, completed_at: null, memo: '', origin: 'field',
        canceled_at: null, is_additional: false, created_at: `${q.p_date}T00:00:00Z`, updated_at: `${q.p_date}T00:00:00Z` })
      return json({ id: 'bk1', date: q.p_date, clientName: '한마음요양병원', requestUpdated: false })
    }
    if (url.includes('/rpc/complete_collection')) { state.saved.push(JSON.parse(r.request().postData() ?? '{}')); return json({ ok: true, scheduleId: 's1', warnings: [] }) }
    if (url.includes('/rpc/')) return json(null)
    if (url.includes('/profiles')) return json(single ? me : [me])
    if (url.includes('/clients')) return json(single ? clients[0] : clients)
    if (url.includes('/vehicle_reservations')) return json([])
    if (url.includes('/vehicles')) return json(single ? vehicles[0] : vehicles)
    if (url.includes('/schedules')) return json(state.schedules)
    if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
    return json([])
  })
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: UID, aud: 'authenticated', email: 'f@b.c', app_metadata: {}, user_metadata: {} }])
  await p.goto(`${BASE}/today`, { waitUntil: 'domcontentloaded' })
  await p.waitForFunction(() => { const t = document.querySelector('main')?.innerText ?? ''; return t.length > 20 && !/불러오는 중/.test(t) }, null, { timeout: 40000 }).catch(() => {})
  await p.waitForTimeout(900)
  return { ctx, p, state }
}

//  한 흐름을 재는 작은 계측기
function meter(p) {
  const m = { taps: 0, routes: 0, scrollPx: 0, route: null }
  return {
    m,
    async mark() { m.route = new URL(p.url()).pathname },
    //  0070 에는 없는 이름표가 있어, 두 판 모두에서 같은 자리를 누르도록
    //  **보이는 것**을 글자로 찾는 길도 둡니다.
    async tapText(text, wait = 500) {
      const before = await p.evaluate(() => window.scrollY)
      const hit = await p.evaluate((t) => {
        const b = [...document.querySelectorAll('main button')].filter((e) => e.innerText.includes(t) && e.getBoundingClientRect().height > 0)
        if (!b[0]) return false
        b[0].scrollIntoView({ block: 'center' })
        b[0].click()
        return true
      }, text)
      if (!hit) throw new Error(`안 보임: ${text}`)
      const after = await p.evaluate(() => window.scrollY)
      m.scrollPx += Math.abs(after - before)
      m.taps += 1
      await p.waitForTimeout(wait)
      const now = new URL(p.url()).pathname
      if (m.route && now !== m.route) m.routes += 1
      m.route = now
    },
    async tap(sel, wait = 500) {
      const el = p.locator(sel).first()
      if (!(await el.count())) throw new Error(`없음: ${sel}`)
      //  화면 밖이면 사람은 먼저 밀어야 합니다 — 민 거리를 잽니다
      const before = await p.evaluate(() => window.scrollY)
      await el.scrollIntoViewIfNeeded().catch(() => {})
      const after = await p.evaluate(() => window.scrollY)
      m.scrollPx += Math.abs(after - before)
      await el.dispatchEvent('click')
      m.taps += 1
      await p.waitForTimeout(wait)
      const now = new URL(p.url()).pathname
      if (m.route && now !== m.route) m.routes += 1
      m.route = now
    },
    async type(sel, v) {
      const before = await p.evaluate(() => window.scrollY)
      await p.locator(sel).first().scrollIntoViewIfNeeded().catch(() => {})
      const after = await p.evaluate(() => window.scrollY)
      m.scrollPx += Math.abs(after - before)
      await p.fill(sel, v)
      m.taps += 1   // 숫자 입력도 손이 한 번 갑니다
      await p.waitForTimeout(800)
    },
    async pick(sel, v) { await p.selectOption(sel, v); m.taps += 1; await p.waitForTimeout(300) },
    done(name) {
      const scrolls = Math.ceil(m.scrollPx / (844 * 0.75))
      console.log(`${LABEL} | ${name} — 터치 ${m.taps}회 · 스크롤 ${scrolls}회(${Math.round(m.scrollPx)}px) · 화면 이동 ${m.routes}회`)
      return { taps: m.taps, scrolls, routes: m.routes }
    },
  }
}

// ── ① 월간 일정 확인까지 ──────────────────────────────────────────────────
{
  const { ctx, p } = await open(390, todaySched)
  const g = meter(p); await g.mark()
  const has = await p.locator('[data-month-toggle]').count()
  if (has) {
    await g.tap('[data-month-toggle]', 600)
    const seen = await p.locator('[data-schedule-calendar]').isVisible()
    console.log(`${LABEL} | 월간 달력 ${seen ? '보임' : '못 봄'}`)
  } else {
    const seen = await p.locator('[data-schedule-calendar]').isVisible().catch(() => false)
    console.log(`${LABEL} | 펼침 단추 없음 · 월간 달력 ${seen ? '보임' : '**390px 에서는 볼 길 없음**'}`)
  }
  g.done('월간 일정 확인')
  await ctx.close()
}

// ── ② 앞으로 올 날에 일정 추가까지 (저장 완료까지) ────────────────────────
{
  const { ctx, p, state } = await open(390, todaySched)
  const g = meter(p); await g.mark()
  const d5 = day(5)
  if (process.env.VIA !== 'strip' && (await p.locator('[data-month-toggle]').count())) {
    await g.tap('[data-month-toggle]', 600)
    await g.tap(`[data-cal-pick="${d5}"]`, 700)
  } else if (await p.locator(`[data-day="${d5}"]`).count()) {
    await g.tap(`[data-day="${d5}"]`, 700)
  }
  if (await p.locator('[data-empty-add]').count()) await g.tap('[data-empty-add]', 700)
  else await g.tap('[data-add-fab]', 700)
  await g.pick('[data-add-visit-client]', C1)
  await g.tap('[data-add-visit-save]', 1400)
  console.log(`${LABEL} | 잡힌 날짜 ${state.booked[0]?.p_date ?? '**실패**'} (원한 날 ${d5})`)
  g.done(`일정 추가 (저장까지)${process.env.VIA === 'strip' ? ' · 날짜 줄 길' : ''}`)
  await ctx.close()
}

// ── ③ 수거 1건 완료까지 (오늘 일정 첫 화면 → 저장) ────────────────────────
{
  const { ctx, p, state } = await open(390, todaySched)
  const g = meter(p); await g.mark()
  await g.tapText('한마음요양병원', 2600)   // 오늘 목록의 병원 줄 → 수거 입력
  await p.waitForSelector('#collection-amount', { timeout: 20000 }).catch(() => {})
  await g.type('#collection-amount', '118')
  await g.tapText('수거 완료 저장', 1700)
  console.log(`${LABEL} | 저장 ${state.saved.length === 1 ? `성공 (${state.saved[0]?.p?.actualAmount}kg)` : '**실패**'}`)
  g.done('수거 1건 완료')
  await ctx.close()
}

await b.close()
