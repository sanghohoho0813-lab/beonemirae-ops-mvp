import { chromium, EXEC } from './_pw.mjs'

//  전달완료한 소모품이 화면에 실제로 보이는가 (0057).
//
//   계산이 맞아도 화면에 안 보이면 대표님은 확정 버튼을 누르기 전에
//   「이 금액이 왜 이런가」를 알 수 없습니다. 세 화면을 봅니다.
//
//    ① 월말 청구 — 「소모품 n건」과 금액
//    ② 단가가 없어 청구에 못 실은 소모품 — 이름까지
//    ③ 거래명세서 — 소모품 줄과 소계 (병원에 나가는 종이)

const BASE = 'http://localhost:4173'
const UID = '00000000-0000-0000-0000-0000000000ad'
const CA = '00000000-0000-0000-0000-0000000000c1'
//  월말 청구 화면은 **지난달**을 기본으로 엽니다 (실제로 확정하는 달).
//  이번 달로 자료를 만들면 화면이 다른 달을 보고 있어 아무것도 안 뜹니다.
const MONTH = (() => {
  const t = new Date(`${new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })}T00:00:00Z`)
  t.setUTCDate(1)
  t.setUTCMonth(t.getUTCMonth() - 1)
  return t.toISOString().slice(0, 7)
})()

const out = []
const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  out.push(c)
  if (!c) process.exitCode = 1
}
const flat = (s) => (s ?? '').replace(/\s+/g, ' ')

const me = {
  id: UID, email: 'a@b.c', name: '송명근', role: 'admin', font_scale: 'normal', active: true,
  approved_at: '2026-01-01T00:00:00Z', client_id: null, vehicle_id: null, created_at: '2026-01-01T00:00:00Z',
}
const clients = [{
  id: CA, name: '가나요양병원', type: '병원', address: '경기도 남양주시', manager: '홍길동', phone: '031-000-0000',
  collection_cycle: '주 1회', collects_medical_waste: true, collects_diaper: false, storage_size: '보통',
  note: '', is_demo_generated: false, demo_session_id: null, active: true,
  contract_start: '2025-01-01', contract_end: null, payment_terms: '', payment_due_day: 20,
  pricing: { medical: { sale: 1000, cost: 600 } }, biz_no: '2568802759', vat_mode: 'exclusive',
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}]
const schedules = [{
  id: 's1', date: `${MONTH}-05`, client_id: CA, waste_type: '의료폐기물', vehicle_id: 'v1',
  scheduled_time: '09:00', status: '완료', expected_amount: 100, actual_amount: 100,
  actual_time: '10:00', driver_name: '김준기', completed_at: `${MONTH}-05T10:00:00Z`,
  memo: '', origin: 'field', is_additional: false, demo_session_id: null, plan_batch: null,
  created_at: '', updated_at: '',
}]
const vehicles = [{ id: 'v1', name: '5506호', waste_type: '의료폐기물', tonnage: 1,
  nominal_capacity: 1000, expected_capacity: 660, driver: '오대성', active: true }]

//  전달완료 주문 — 단가가 있는 것과 **없는 것**을 같이 둡니다.
const orders = [{
  id: 'o1', client_id: CA, status: '전달완료', requester_name: '홍길동', source: 'portal', note: '',
  deliver_schedule_id: null, deliver_on: null, requested_at: `${MONTH}-02T00:00:00Z`,
  confirmed_at: `${MONTH}-03T00:00:00Z`, delivered_at: `${MONTH}-05T10:00:00Z`,
  canceled_at: null, cancel_reason: '',
}, {
  //  아직 전달 안 한 주문 — 매출이 아닙니다
  id: 'o2', client_id: CA, status: '준비', requester_name: '홍길동', source: 'portal', note: '',
  deliver_schedule_id: null, deliver_on: null, requested_at: `${MONTH}-07T00:00:00Z`,
  confirmed_at: null, delivered_at: null, canceled_at: null, cancel_reason: '',
}]
const orderItems = [
  { id: 1, order_id: 'o1', product_id: 'p1', name: '멸균 수술장갑', spec: 'M', unit: '개', qty: 20, unit_price: 3300, unit_cost: 2000, stock_key: null },
  { id: 2, order_id: 'o1', product_id: 'p2', name: '단가없는물건', spec: '', unit: '개', qty: 5, unit_price: 0, unit_cost: 0, stock_key: null },
  { id: 3, order_id: 'o2', product_id: 'p1', name: '멸균 수술장갑', spec: 'M', unit: '개', qty: 99, unit_price: 3300, unit_cost: 2000, stock_key: null },
]

const b = await chromium.launch({ executablePath: EXEC })

function wire(ctx) {
  ctx.route('**/auth/v1/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: UID, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }) }))
  ctx.route('**/rest/v1/**', (r) => {
    const url = r.request().url()
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    if (url.includes('/rpc/app_schema_version')) return json(64)
    if (url.includes('/rpc/app_health_check')) return json({ version: 64, ok: true, missing: [], checkedAt: '' })
    if (url.includes('/rpc/')) return json(null)
    if (url.includes('/profiles')) return json(single ? me : [me])
    if (url.includes('/product_order_items')) return json(orderItems)
    if (url.includes('/product_orders')) return json(orders)
    if (url.includes('/schedules')) return json(schedules)
    if (url.includes('/vehicles')) return json(vehicles)
    if (url.includes('/clients')) return json(single ? clients[0] : clients)
    if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
    return json([])
  })
}
async function open(ctx, path) {
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: UID, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }])
  await p.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(2600)
  return p
}

// ── ① 월말 청구 화면 ────────────────────────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1400 } })
  wire(ctx)
  const p = await open(ctx, '/billing')

  const body = flat(await p.textContent('body'))
  ok(/소모품 1건/.test(body), '**월말 청구에 「소모품 1건」이 보임**', body.match(/수거 \d+건 · 공급 \d+건[^원]{0,20}/)?.[0] ?? '')
  ok((await p.locator(`[data-close-products="${CA}"]`).count()) === 1, '건수 표시에 집을 수 있는 표시가 있음')

  //  금액 — 수거 100kg × 1,000원 + 소모품 20개 × 3,300원 = 166,000원
  ok(/166,000/.test(body), '**청구 금액에 소모품이 더해져 있음** (100,000 + 66,000)',
    body.match(/1[0-9]{2},[0-9]{3}원/g)?.slice(0, 3).join(' ') ?? '')

  //  단가가 없어 못 실은 소모품 — 이름까지 적혀야 합니다
  ok((await p.locator(`[data-close-noprice="${CA}"]`).count()) === 1,
    '**단가가 없어 청구에 안 실린 소모품을 알려 줌**')
  ok(/단가없는물건/.test(flat(await p.locator(`[data-close-noprice="${CA}"]`).textContent())),
    '어떤 물건인지 이름으로', flat(await p.locator(`[data-close-noprice="${CA}"]`).textContent()).slice(0, 60))

  //  아직 전달 안 한 주문(99개)이 새면 허위 매출입니다.
  ok(!/소모품 2건/.test(body) && !/326,700|426,700/.test(body),
    '**전달 안 한 주문은 청구에 안 들어감**')
  await ctx.close()
}

// ── ② 거래명세서 (병원에 나가는 종이) ───────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1600 } })
  wire(ctx)
  const p = await open(ctx, `/clients/${CA}`)
  await p.click('[data-client-tab="settlement"]')
  await p.waitForTimeout(1200)
  //  정산 탭은 **이번 달**로 열립니다 — 자료가 있는 지난달로 바꿉니다.
  await p.selectOption('select', MONTH).catch(() => {})
  await p.waitForTimeout(900)

  const tab = flat(await p.textContent('body'))
  ok(/멸균 수술장갑/.test(tab), '**정산 화면 품목표에 소모품이 올라옴**')
  ok((await p.locator('[data-settle-line="product"]').count()) >= 1, '소모품 줄에 표시가 있음')
  ok((await p.locator('[data-settle-noprice]').count()) === 1, '단가 없는 소모품 안내가 뜸')

  //  명세서 열기
  const btn = p.getByRole('button', { name: /거래명세서/ }).first()
  if (await btn.count()) {
    await btn.dispatchEvent('click')
    await p.waitForTimeout(1200)
    const inv = flat(await p.textContent('body'))
    ok(/소모품 공급 합계/.test(inv), '**명세서에 소모품 소계 줄이 있음**')
    ok(/멸균 수술장갑/.test(inv), '명세서에 품목 이름')
    ok(/66,000/.test(inv), '소모품 소계 66,000원', inv.match(/6[0-9],[0-9]{3}/g)?.slice(0, 3).join(' ') ?? '')
    ok(/166,000/.test(inv), '**명세서 합계가 청구액과 같음** (166,000원)')
  } else {
    ok(false, '거래명세서 단추를 찾지 못함')
  }
  await ctx.close()
}

// ── ③ 소모품이 없는 거래처는 아무것도 안 바뀐다 ────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1200 } })
  ctx.route('**/auth/v1/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: UID, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }) }))
  ctx.route('**/rest/v1/**', (r) => {
    const url = r.request().url()
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    if (url.includes('/rpc/app_schema_version')) return json(64)
    if (url.includes('/rpc/app_health_check')) return json({ version: 64, ok: true, missing: [], checkedAt: '' })
    if (url.includes('/rpc/')) return json(null)
    if (url.includes('/profiles')) return json(single ? me : [me])
    if (url.includes('/schedules')) return json(schedules)
    if (url.includes('/vehicles')) return json(vehicles)
    if (url.includes('/clients')) return json(single ? clients[0] : clients)
    if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
    return json([])   // 주문 없음
  })
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: UID, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }])
  await p.goto(`${BASE}/billing`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(2600)
  const body = flat(await p.textContent('body'))
  ok(/100,000/.test(body), '**소모품이 없으면 예전 금액 그대로** (100,000원)',
    body.match(/1[0-9]{2},[0-9]{3}원/g)?.slice(0, 2).join(' ') ?? '')
  ok(!/소모품 \d+건/.test(body), '소모품 줄도 안 뜸')
  ok((await p.locator('[data-close-noprice]').count()) === 0, '단가 안내도 안 뜸 — 늘 있는 문구는 배경이 됩니다')
  await ctx.close()
}

console.log('')
console.log(`총 ${out.length}건 · 실패 ${out.filter((v) => !v).length}건`)
await b.close()
