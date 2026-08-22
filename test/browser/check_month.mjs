import { chromium, EXEC } from './_pw.mjs'

//  0071 — 보통 스마트폰(390px)에서 월간 일정에 닿을 수 있는가
//   ⚠ 0068 에서 폰의 한 달 달력을 없앴더니, 640px 넘는 화면(폴드폰 편 상태)
//     에서만 보였습니다. 보통 폰에서는 볼 길이 아예 없었습니다.

const BASE = 'http://localhost:4173'
const UID = '00000000-0000-0000-0000-0000000000f1'
const C1 = '00000000-0000-0000-0000-0000000000a1'
const V3 = '00000000-0000-0000-0000-0000000000v3'
const ok = (c, m, d = '') => { console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`); if (!c) process.exitCode = 1 }
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

const b = await chromium.launch({ executablePath: EXEC })

async function open(W, ver = 70, seed = []) {
  const ctx = await b.newContext({ viewport: { width: W, height: 844 }, isMobile: W < 700, hasTouch: W < 700 })
  const state = { schedules: [...seed], booked: [], saved: [] }
  ctx.route('**/auth/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: UID, aud: 'authenticated', email: 'f@b.c', app_metadata: {}, user_metadata: {} }) }))
  ctx.route('**/rest/v1/**', (r) => {
    const url = r.request().url()
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    if (url.includes('/rpc/app_schema_version')) return json(ver)
    if (url.includes('/rpc/book_visit')) {
      const p = JSON.parse(r.request().postData() ?? '{}')
      state.booked.push(p)
      state.schedules.push({ id: `bk${state.booked.length}`, date: p.p_date, client_id: p.p_client_id,
        waste_type: p.p_waste_type, vehicle_id: null, scheduled_time: p.p_time, status: '예정',
        expected_amount: 0, actual_amount: null, completed_at: null, memo: '', origin: 'field',
        canceled_at: null, is_additional: false, created_at: `${p.p_date}T00:00:00Z`, updated_at: `${p.p_date}T00:00:00Z` })
      return json({ id: 'bk1', date: p.p_date, clientName: '한마음요양병원', requestUpdated: false })
    }
    if (url.includes('/rpc/complete_collection')) {
      state.saved.push(JSON.parse(r.request().postData() ?? '{}'))
      return json({ ok: true, scheduleId: 's1', warnings: [] })
    }
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
  await p.waitForFunction(() => {
    const t = document.querySelector('main')?.innerText ?? ''
    return t.length > 20 && !/불러오는 중/.test(t)
  }, null, { timeout: 40000 }).catch(() => {})
  await p.waitForTimeout(800)
  return { ctx, p, state }
}

// ── ① 보통 폰에서 월간에 닿는다 ────────────────────────────────────────────
for (const W of [390, 412]) {
  const { ctx, p } = await open(W)
  const tg = p.locator('[data-month-toggle]')
  ok(await tg.isVisible(), `${W}px — **「월간 일정 보기」가 보임**`)
  const tb = await tg.boundingBox()
  ok((tb?.height ?? 0) >= 44, `${W}px — 단추가 손가락 크기`, `${Math.round(tb?.height ?? 0)}px`)
  ok(!(await p.locator('[data-schedule-calendar]').isVisible()), `${W}px — 처음엔 접혀 있음`)

  await tg.dispatchEvent('click')
  await p.waitForTimeout(500)
  ok(await p.locator('[data-schedule-calendar]').isVisible(), `${W}px — **누르면 한 달이 펼쳐짐**`)

  //  가로로 밀리면 안 됩니다
  const over = await p.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth))
  ok(over === 0, `${W}px — **가로로 안 밀림**`, `${over}px`)

  //  글자가 작지 않아야 합니다
  const size = await p.evaluate((t) => {
    const cell = document.querySelector(`[data-cal-pick="${t}"]`)
    const num = cell?.querySelector('span')
    return { px: num ? Math.round(parseFloat(getComputedStyle(num).fontSize)) : 0,
      w: cell ? Math.round(cell.getBoundingClientRect().width) : 0,
      h: cell ? Math.round(cell.getBoundingClientRect().height) : 0 }
  }, T)
  ok(size.px >= 19, `${W}px — 날짜 숫자가 큼`, `${size.px}px`)
  ok(size.h >= 44, `${W}px — 날짜 칸이 손가락 크기`, `${size.w}×${size.h}px`)

  await tg.dispatchEvent('click')
  await p.waitForTimeout(400)
  ok(!(await p.locator('[data-schedule-calendar]').isVisible()), `${W}px — **다시 누르면 접힘**`)
  await ctx.close()
}

// ── ② 넓은 화면은 그대로 (폴드폰 편 상태·태블릿) ───────────────────────────
for (const W of [673, 768]) {
  const { ctx, p } = await open(W)
  ok(await p.locator('[data-schedule-calendar]').isVisible(), `${W}px — 달력이 늘 보임 (예전 그대로)`)
  ok(!(await p.locator('[data-month-toggle]').isVisible()), `${W}px — 펼침 단추는 안 보임 (필요 없음)`)
  const over = await p.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth))
  ok(over === 0, `${W}px — 가로로 안 밀림`, `${over}px`)
  await ctx.close()
}

// ── ③ 월간에서 날짜를 눌러 그날 목록 → 일정 추가 ───────────────────────────
{
  const { ctx, p, state } = await open(390)
  await p.locator('[data-month-toggle]').dispatchEvent('click')
  await p.waitForTimeout(450)
  const d5 = day(5)
  await p.locator(`[data-cal-pick="${d5}"]`).dispatchEvent('click')
  await p.waitForTimeout(600)
  ok(new RegExp(`${Number(d5.slice(8, 10))}일`).test((await p.locator('[data-day-title]').textContent()) ?? ''),
    '**달력에서 날짜를 누르면 그 날로 바뀜**', ((await p.locator('[data-day-title]').textContent()) ?? '').trim())
  ok((await p.locator('[data-empty-add]').count()) === 1, '그 자리에서 바로 「이 날 일정 추가」')

  await p.locator('[data-empty-add]').dispatchEvent('click')
  await p.waitForTimeout(500)
  await p.selectOption('[data-add-visit-client]', C1)
  await p.locator('[data-add-visit-save]').dispatchEvent('click')
  await p.waitForTimeout(1300)
  ok(state.booked[0]?.p_date === d5, '**고른 날짜로 잡힘**', String(state.booked[0]?.p_date))
  await ctx.close()
}

// ── ④ 오늘로 이동 ──────────────────────────────────────────────────────────
{
  const { ctx, p } = await open(390)
  await p.locator(`[data-day="${day(4)}"]`).dispatchEvent('click')
  await p.waitForTimeout(450)
  ok((await p.locator('[data-go-today]').count()) === 1, '오늘이 아니면 「오늘로」가 뜸')
  await p.locator('[data-go-today]').dispatchEvent('click')
  await p.waitForTimeout(450)
  ok((await p.locator('[data-go-today]').count()) === 0, '**누르면 오늘로 돌아옴**')
  await ctx.close()
}

// ── ⑤ 수거 입력 — 순서와 붙은 저장 ─────────────────────────────────────────
{
  const seed = [{ id: 's1', date: T, client_id: C1, waste_type: '의료폐기물', vehicle_id: null,
    scheduled_time: '09:00', status: '예정', expected_amount: 120, actual_amount: null, completed_at: null,
    memo: '', origin: 'system', canceled_at: null, created_at: `${T}T00:00:00Z`, updated_at: `${T}T00:00:00Z` }]
  const { ctx, p, state } = await open(390, 70, seed)
  await p.goto(`${BASE}/collection?schedule=s1`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(2600)

  //  자주 쓰는 칸이 위에 있어야 합니다
  const order = await p.evaluate(() => {
    const y = (sel) => { const el = document.querySelector(sel); return el ? Math.round(el.getBoundingClientRect().top + window.scrollY) : -1 }
    return {
      amount: y('#collection-amount'),
      handover: y('[data-fold="handover"]'),
      memo: y('[data-fold="memo"]'),
      containers: y('[data-fold="containers"]'),
      supply: y('[data-fold="supply"]'),
    }
  })
  ok(order.amount > 0 && order.handover > order.amount, '**수거량 다음이 완료상태**', JSON.stringify(order))
  ok(order.memo > order.handover, '그다음이 특이사항')
  ok(order.containers > order.memo && order.supply > order.memo,
    '**용기·자재는 그 아래로** (매번 쓰지 않는 칸)')

  //  채우면 저장이 아래에 붙습니다
  await p.fill('#collection-amount', '118')
  await p.waitForTimeout(600)
  const stuck = await p.evaluate(() => {
    const el = document.querySelector('[data-collect-save]')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { fixed: getComputedStyle(el).position === 'fixed', top: Math.round(r.top), h: Math.round(r.height) }
  })
  ok(stuck?.fixed === true, '**채우고 나면 저장이 화면 아래에 붙음**', JSON.stringify(stuck))
  ok((stuck?.top ?? 0) < 844 && (stuck?.top ?? 0) > 0, '화면 안에 보임', `y=${stuck?.top}px`)
  ok((stuck?.h ?? 0) >= 44, '손가락 크기', `${stuck?.h}px`)

  //  실제로 저장까지
  await p.locator('[data-collect-save]').dispatchEvent('click')
  await p.waitForTimeout(1600)
  ok(state.saved.length === 1, '**저장이 서버로 감**')
  ok(Number(state.saved[0]?.p?.actualAmount) === 118, '적은 무게가 그대로', String(state.saved[0]?.p?.actualAmount))
  await ctx.close()
}

// ── ⑥ 오늘 일정에서 **눌러서** 들어간 수거 입력도 저장이 켜져 있는가 ───────
//
//   ⚠ 0071 에서 찾은 결함입니다. 주소를 직접 쳐서 들어가면 멀쩡한데,
//     기사님이 실제로 다니는 길(오늘 일정 → 병원 줄 → 수거 입력)로 들어가면
//     담당 차량이 비워져 **저장 단추가 영영 꺼져** 있었습니다.
//     자료가 이미 들어와 있을 때만 나는 증상이라, goto 로 여는 시험은
//     이것을 못 잡습니다. 그래서 **누르고 들어가는** 길로 잽니다.
{
  const seed = [{ id: 's1', date: T, client_id: C1, waste_type: '의료폐기물', vehicle_id: null,
    scheduled_time: '09:00', status: '예정', expected_amount: 120, actual_amount: null, completed_at: null,
    memo: '', origin: 'system', canceled_at: null, created_at: `${T}T00:00:00Z`, updated_at: `${T}T00:00:00Z` }]
  const { ctx, p, state } = await open(390, 70, seed)
  await p.locator('[data-guide="guide-today-list"]').first().dispatchEvent('click')
  await p.waitForTimeout(2600)
  ok(new URL(p.url()).pathname === '/collection', '병원 줄을 누르면 수거 입력으로 감', p.url().slice(-30))
  await p.fill('#collection-amount', '118')
  await p.waitForTimeout(800)
  const dis = await p.evaluate(() => document.querySelector('[data-collect-save]')?.disabled)
  ok(dis === false, '**눌러서 들어가도 저장이 켜짐** (담당 차량이 안 지워짐)', `disabled=${dis}`)
  await p.locator('[data-collect-save]').dispatchEvent('click')
  await p.waitForTimeout(1600)
  ok(state.saved.length === 1, '**눌러서 들어간 길로도 저장됨**')
  ok(Number(state.saved[0]?.p?.actualAmount) === 118, '적은 무게가 그대로', String(state.saved[0]?.p?.actualAmount))
}

await b.close()
