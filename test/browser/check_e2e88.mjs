import { chromium, EXEC } from './_pw.mjs'
import * as W from './walk_lib.mjs'
import * as F from './perf_fixtures.mjs'

//  0088 — 병원이 한 일이 실제로 비원미래에 닿고, 비원미래가 한 일이
//  실제로 병원 화면에 돌아오는가 (브리프 18 · 32)
//
//   ⚠ 다른 검사들은 **읽기**를 봅니다. 여기서는 **왕복**을 봅니다.
//     그래서 서버 흉내를 「빈 배열을 돌려주는 것」이 아니라 **기억하는 것**
//     으로 만들었습니다. 병원이 올린 요청이 진짜로 저장되고, 직원 화면이
//     그것을 읽고, 직원이 바꾼 상태를 병원 화면이 다시 읽어야 통과합니다.
//
//   ⚠ 화면에 그럴듯한 글자가 떴는지가 아니라 **저장소에 무엇이 남았는지**를
//     함께 봅니다. 화면만 보면 「보내지도 않고 보냈다고 하는」 결함을 못
//     잡습니다 (0055 에서 실제로 있었던 일입니다).

const ok = (c, m, d = '') => { console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`); if (!c) process.exitCode = 1 }
const flat = (t) => (t ?? '').replace(/\s+/g, ' ').trim()
const b = await chromium.launch({ executablePath: EXEC })

//  ⚠ 공용 자료(perf_fixtures)에는 판매 품목이 없습니다. 자재 주문 왕복을
//    보려면 있어야 합니다. **실제 표 모양 그대로** 둡니다.
const PRODUCTS = [
  { id: 'p-box30', name: '골판지 전용박스', spec: '30L', unit: '개', sale_price: 1800,
    stock_key: 'corrugatedBox', available: true, image_url: '', description: '', active: true,
    category: '용기', sort: 1, created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z' },
  { id: 'p-bag', name: '전용 봉투', spec: '60L', unit: '장', sale_price: 700,
    stock_key: 'bag', available: true, image_url: '', description: '', active: true,
    category: '봉투', sort: 2, created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z' },
]

//  ── 기억하는 서버 흉내 ────────────────────────────────────────────────────
//   walk_lib 의 wire 는 쓰기를 버립니다(읽기 검사용). 왕복을 보려면
//   남아 있어야 합니다.
function makeStore() {
  return {
    requests: [],       // client_requests
    orders: [],         // product_orders
    orderItems: [],     // product_order_items
    schedules: [...F.schedules],
    reqs: 0,
    writes: [],
  }
}

function wireStateful(ctx, store, profile, schemaVersion = 87) {
  ctx.route('**/auth/v1/**', (r) => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: F.UID, aud: 'authenticated', email: profile.email, app_metadata: {}, user_metadata: {} }),
  }))
  ctx.route('**/rest/v1/**', async (r) => {
    const req = r.request()
    const url = req.url()
    const method = req.method()
    const q = new URL(url).searchParams
    const single = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const lim = Number(q.get('limit') ?? 0)
    const off = Number(q.get('offset') ?? 0)
    store.reqs += 1
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    const page = (rows) => json(lim > 0 ? rows.slice(off, off + lim) : rows)

    if (url.includes('/rpc/app_schema_version')) return json(schemaVersion)

    //  ── 자재 주문 (브리프 19 · 33) ────────────────────────────────────────
    //   ⚠ 주문은 RPC 로 들어갑니다(서버가 재고를 한 번만 빼려고). 그래서
    //     여기서도 RPC 를 **기억하게** 흉내 냅니다.
    if (url.includes('/rpc/request_product_order')) {
      const a = JSON.parse(req.postData() ?? '{}')
      store.writes.push({ url: 'rpc/request_product_order', method, body: req.postData() ?? '' })
      const id = `ord-${store.orders.length + 1}`
      store.orders.push({
        id, client_id: a.p_client_id, status: '요청', requester_name: '병원 담당자',
        source: 'portal', note: a.p_note ?? '', deliver_schedule_id: a.p_deliver_schedule_id ?? null,
        deliver_on: a.p_deliver_on ?? null, requested_at: new Date().toISOString(),
        confirmed_at: null, delivered_at: null, canceled_at: null, cancel_reason: '',
      })
      for (const it of a.p_items ?? []) {
        const pr = PRODUCTS.find((x) => x.id === it.productId)
        store.orderItems.push({
          id: `oi-${store.orderItems.length + 1}`, order_id: id, product_id: it.productId,
          name: pr?.name ?? '', spec: pr?.spec ?? '', unit: pr?.unit ?? '개',
          qty: it.qty, unit_price: pr?.sale_price ?? 0, stock_key: pr?.stock_key ?? null,
        })
      }
      return json({ id, alreadySaved: false, itemCount: (a.p_items ?? []).length, total: 0 })
    }
    if (url.includes('/rpc/set_product_order_status')) {
      const a = JSON.parse(req.postData() ?? '{}')
      store.writes.push({ url: 'rpc/set_product_order_status', method, body: req.postData() ?? '' })
      const row = store.orders.find((x) => x.id === a.p_order_id)
      if (row) {
        row.status = a.p_status
        if (a.p_status === '확인') row.confirmed_at = new Date().toISOString()
        if (a.p_status === '전달완료') row.delivered_at = new Date().toISOString()
      }
      return json({ status: a.p_status, alreadyDone: false, stockMoved: a.p_status === '전달완료' })
    }
    if (url.includes('/rpc/')) return json(null)

    // ── 쓰기 ──────────────────────────────────────────────────────────────
    if (method !== 'GET') {
      const body = req.postData() ?? ''
      store.writes.push({ url: url.split('/rest/v1/')[1]?.slice(0, 40), method, body })
      if (url.includes('client_requests')) {
        if (method === 'POST') {
          //  ⚠ 실제로 **저장합니다.** 그래야 직원 화면이 이걸 읽습니다.
          const row = JSON.parse(body)
          const saved = {
            id: `req-${store.requests.length + 1}`,
            status: '접수', reply: '', handled_by: null, handled_at: null,
            created_at: new Date().toISOString(), demo_session_id: null,
            ...row,
          }
          store.requests.push(saved)
          return json(single ? saved : [saved])
        }
        if (method === 'PATCH') {
          //  id=eq.<id> 로 옵니다
          const idEq = (q.get('id') ?? '').replace('eq.', '')
          const patch = JSON.parse(body)
          const row = store.requests.find((x) => x.id === idEq)
          if (row) Object.assign(row, patch)
          return json(row ? [row] : [])
        }
      }
      return json(single ? {} : [])
    }

    // ── 읽기 ──────────────────────────────────────────────────────────────
    if (url.includes('/profiles')) return json(single ? profile : [profile])
    if (url.includes('/client_requests')) {
      //  ⚠ 병원 계정에는 **자기 것만** 내려 줍니다 — 서버 RLS 흉내입니다.
      const mine = profile.client_id
        ? store.requests.filter((x) => x.client_id === profile.client_id)
        : store.requests
      return page(mine.map((x) => ({ ...x, clients: { name: F.clients.find((c) => c.id === x.client_id)?.name ?? '' } })))
    }
    if (url.includes('/site_notes')) return page(F.notes)
    if (url.includes('/schedules')) return page(store.schedules)
    if (url.includes('/materials')) return page(F.materials)
    if (url.includes('/payment_receipts')) return page(F.receipts)
    if (url.includes('/payments')) return page(F.payments)
    if (url.includes('/client_prices')) return page(F.prices)
    if (url.includes('/operating_costs')) return page(F.costs)
    if (url.includes('/vehicles')) return page(F.vehicles)
    if (url.includes('/clients')) {
      //  ⚠ 서버 RLS 흉내 — 병원 계정에는 **자기 거래처 한 곳만** 내려갑니다.
      //    이걸 안 하면 병원 계정도 전체 목록을 받아서, 포털이 목록의
      //    첫 병원을 「우리 병원」으로 잡습니다. 실제 서버와 다른 조건에서
      //    검사하는 셈이 됩니다.
      const rows = profile.client_id ? F.clients.filter((c) => c.id === profile.client_id) : F.clients
      return single ? json(rows[0] ?? null) : page(rows)
    }
    if (url.includes('/product_order_items')) {
      const mine = profile.client_id
        ? store.orderItems.filter((i) => store.orders.some((o) => o.id === i.order_id && o.client_id === profile.client_id))
        : store.orderItems
      return page(mine)
    }
    if (url.includes('/product_orders')) {
      const mine = profile.client_id ? store.orders.filter((o) => o.client_id === profile.client_id) : store.orders
      return page(mine)
    }
    if (url.includes('/products')) return page(PRODUCTS)
    if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
    return json([])
  })
}

async function openAs(store, role, path, clientId = null, w = 1440) {
  const profile = { ...W.profileFor(role), font_scale: 'normal', client_id: clientId }
  const ctx = await b.newContext({ viewport: { width: w, height: w < 700 ? 844 : 950 }, isMobile: w < 700, hasTouch: w < 700 })
  wireStateful(ctx, store, profile)
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: F.UID, aud: 'authenticated', email: 'x@b.c', app_metadata: {}, user_metadata: {} }])
  await p.goto(`${W.BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await W.settle(p, store); await p.waitForTimeout(900)
  return { ctx, p }
}

const HOSP = F.clients[2]
const store = makeStore()

// ── ① 병원이 수거 요청을 올린다 ───────────────────────────────────────────
{
  const { ctx, p } = await openAs(store, 'client', '/portal', HOSP.id)
  await p.locator('[data-portal-cta="collect"]').click(); await p.waitForTimeout(500)
  await p.locator('#req-content').fill('격리환자 발생으로 배출량이 늘었습니다')
  await p.locator('#req-date').fill('2026-09-03')
  const kg = p.locator('[data-req-kg]')
  if ((await kg.count()) === 1) await kg.fill('140')
  const waste = p.locator('[data-req-waste]')
  if ((await waste.count()) === 1) await waste.selectOption('의료폐기물')
  await p.getByRole('button', { name: /요청 보내기/ }).click(); await p.waitForTimeout(1400)

  ok((await p.locator('[data-req-sent]').count()) === 1, '병원 화면에 「접수되었습니다」가 뜬다')
  //  ⚠ 화면 글자만 보지 않습니다 — **저장소에 실제로 들어갔는지** 봅니다.
  ok(store.requests.length === 1, '**서버에 요청이 실제로 남았다**', `${store.requests.length}건`)
  const saved = store.requests[0]
  ok(saved.client_id === HOSP.id, `**그 병원 것으로 저장됐다** (${HOSP.name})`, saved.client_id)
  ok(saved.desired_date === '2026-09-03', '희망일이 그대로 저장됐다', String(saved.desired_date))
  ok(saved.content.includes('격리환자'), '적은 내용이 그대로 저장됐다')
  ok(saved.status === '접수', '처음 상태는 「접수」', saved.status)
  if ((await kg.count()) === 1) {
    ok(Number(saved.expected_kg) === 140, '**예상 배출량이 그대로 저장됐다**', String(saved.expected_kg))
  }

  //  올린 직후 병원 화면에 자기 요청이 보이는가
  const body = flat(await p.locator('main').innerText())
  ok(body.includes('격리환자'), '올린 요청이 병원 화면에 바로 보인다')
  await ctx.close()
}

// ── ② 비원미래 직원 화면에 그 요청이 뜬다 ─────────────────────────────────
let reqId = null
{
  const { ctx, p } = await openAs(store, 'admin', '/requests')
  const body = flat(await p.locator('main').innerText())
  ok(body.includes('격리환자'), '**직원 요청함에 병원이 올린 요청이 떴다**')
  ok(body.includes(HOSP.name), `어느 병원인지 적혀 있다 (${HOSP.name})`)
  ok(/희망일 2026-09-03/.test(body), '희망일이 직원 화면에 그대로 나온다')
  if (store.requests[0].expected_kg != null) {
    ok(/병원 어림 140kg/.test(body), '**병원이 어림한 배출량이 배차에 보인다**')
  }
  reqId = store.requests[0].id
  await ctx.close()
}

// ── ③ 직원이 상태를 바꾸면 **서버에 남는다** ──────────────────────────────
{
  const { ctx, p } = await openAs(store, 'admin', '/requests')
  //  「일정 반영」 단추를 찾아 누릅니다.
  const btn = p.locator('button:has-text("일정 반영")').first()
  ok((await btn.count()) === 1, '직원 화면에 「일정 반영」 단추가 있다')
  await btn.click(); await p.waitForTimeout(1400)

  const row = store.requests.find((x) => x.id === reqId)
  ok(row.status === '일정 반영', '**직원이 바꾼 상태가 서버에 남았다**', row.status)
  await ctx.close()
}

// ── ④ 병원 화면이 그 변화를 **다시 읽는다** ───────────────────────────────
{
  const { ctx, p } = await openAs(store, 'client', '/portal', HOSP.id)
  const body = flat(await p.locator('main').innerText())
  ok(/일정 반영/.test(body), '**병원 화면의 요청 상태가 「일정 반영」으로 바뀌었다**')

  //  알림에도 떠야 합니다 — 병원이 화면을 뒤지지 않아도 알 수 있게.
  const bell = p.locator('header [aria-label*="알림"], header button[title*="알림"]').first()
  if ((await bell.count()) === 1) {
    await bell.click(); await p.waitForTimeout(500)
    const notes = flat(await p.locator('body').innerText())
    ok(/요청이 일정에 반영되었습니다/.test(notes), '**알림에도 뜬다**')
  }
  await ctx.close()
}

// ── ⑤ 직원이 회신을 적으면 병원이 읽는다 ──────────────────────────────────
{
  //  회신은 서버에만 넣고(직원 화면 조작은 ③에서 이미 확인), 병원이
  //  읽는지를 봅니다 — 같은 자료를 양쪽이 보고 있는지가 요점입니다.
  store.requests.find((x) => x.id === reqId).reply = '9월 3일 오전에 방문하겠습니다.'
  const { ctx, p } = await openAs(store, 'client', '/portal', HOSP.id)
  const body = flat(await p.locator('main').innerText())
  ok(/9월 3일 오전에 방문하겠습니다/.test(body), '**비원미래 회신이 병원 화면에 그대로 보인다**')
  ok(/비원미래 회신/.test(body), '누가 쓴 말인지 적혀 있다')
  await ctx.close()
}

// ── ⑥ 수거가 끝나면 이력·리포트에 반영된다 (브리프 18 마지막 줄) ──────────
{
  //  먼저 지금 숫자를 재 둡니다.
  const before = await (async () => {
    const { ctx, p } = await openAs(store, 'client', '/portal/history', HOSP.id)
    const n = await p.locator('table tbody tr').count()
    const total = flat(await p.locator('[data-hist-total]').innerText())
    await ctx.close()
    return { n, total }
  })()

  //  ⚠ 수거 완료를 **서버 쪽에 넣습니다.** 병원 화면이 따로 만든 자료가
  //    아니라 같은 수거 기록을 읽고 있는지가 요점입니다.
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
  store.schedules.unshift({
    id: 'e2e-done-1', date: today, client_id: HOSP.id, waste_type: '의료폐기물',
    vehicle_id: 'v1', scheduled_time: '10:00', status: '완료',
    expected_amount: 140, actual_amount: 137, completed_at: `${today}T01:00:00Z`,
    memo: '', origin: 'field', is_additional: true, demo_session_id: null,
    plan_batch: null, handover_status: '인계 완료', driver_name: '1호기사',
    created_at: `${today}T00:00:00Z`, updated_at: `${today}T00:00:00Z`,
  })

  const { ctx, p } = await openAs(store, 'client', '/portal/history', HOSP.id)
  const after = await p.locator('table tbody tr').count()
  ok(after === before.n + 1, '**수거 이력에 한 건 늘었다**', `${before.n} → ${after}`)
  const total = flat(await p.locator('[data-hist-total]').innerText())
  ok(total !== before.total, '합계도 함께 늘었다', `${before.total} → ${total}`)
  const body = flat(await p.locator('main').innerText())
  ok(/137kg/.test(body), '**실제로 실은 무게가 그대로 나온다** (병원이 어림한 140 이 아니라)', body.slice(0, 90))
  await ctx.close()

  //  리포트에도 반영되는가
  const r = await openAs(store, 'client', '/portal/report', HOSP.id)
  const rbody = flat(await r.p.locator('main').innerText())
  ok(/총 수거량/.test(rbody), '월간 리포트가 열린다')
  //  ⚠ 이번 달 합계에 137kg 이 들어가 있어야 합니다.
  const m = rbody.match(/총 수거량\s*([\d,]+)kg/)
  ok(m != null && Number(m[1].replace(/,/g, '')) > 0, '리포트 이번 달 수거량이 잡힌다', m?.[1] ?? '못 읽음')
  await r.ctx.close()
}

// ── ⑦ 다른 병원 자료가 섞이지 않는다 ──────────────────────────────────────
{
  const OTHER = F.clients[7]
  const { ctx, p } = await openAs(store, 'client', '/portal', OTHER.id)
  const body = flat(await p.locator('main').innerText())
  //  ⚠ ①에서 올린 요청은 **다른 병원 것**입니다. 한 글자도 보이면 안 됩니다.
  ok(!body.includes('격리환자'), '**다른 병원의 요청이 한 줄도 안 보인다**')
  ok(!body.includes('9월 3일 오전에 방문하겠습니다'), '다른 병원에 보낸 회신도 안 보인다')
  await ctx.close()
}

// ── ⑧ 자재 주문 왕복 (브리프 19 · 33) ─────────────────────────────────────
//     병원: 30L 박스 10개 요청 → 내부: 확인 → 준비 → 전달완료 → 병원: 완료
{
  const { ctx, p } = await openAs(store, 'client', '/portal/supplies', HOSP.id)
  const box = p.locator('[data-order-box]')
  ok((await box.count()) === 1, '병원 화면에 주문할 품목이 나온다')

  //  30L 박스를 10개로 올립니다.
  //   ⚠ 더하기 단추 글자는 전각(＋)입니다. 글자로 찾지 않고 표시로 찾습니다.
  const plus = p.locator('[data-qty-plus="p-box30"]')
  ok((await plus.count()) === 1, '수량을 올리는 단추가 있다')
  for (let i = 0; i < 10; i += 1) { await plus.click(); await p.waitForTimeout(40) }
  await p.waitForTimeout(300)
  ok(flat(await p.locator('[data-qty="p-box30"]').innerText()) === '10', '화면 수량이 10 이 됐다')
  await p.locator('[data-order-send]').click(); await p.waitForTimeout(1500)

  ok(store.orders.length === 1, '**주문이 서버에 실제로 남았다**', `${store.orders.length}건`)
  const o = store.orders[0]
  ok(o.client_id === HOSP.id, `**그 병원 주문으로 저장됐다** (${HOSP.name})`, o.client_id)
  ok(o.status === '요청', '처음 상태는 「요청」', o.status)
  const it = store.orderItems.filter((x) => x.order_id === o.id)
  ok(it.length >= 1, '품목이 함께 저장됐다', `${it.length}종`)
  ok(it[0].qty === 10, '**수량 10 이 그대로 저장됐다**', String(it[0].qty))

  const msg = flat(await p.locator('[data-order-msg]').innerText().catch(() => ''))
  ok(/접수/.test(msg), '병원 화면에 접수되었다고 뜬다', msg.slice(0, 40))
  await ctx.close()
}

// ── ⑨ 내부에서 상태를 옮기면 병원이 그대로 읽는다 ─────────────────────────
{
  const o = store.orders[0]
  for (const step of ['확인', '준비', '전달예정', '전달완료']) {
    //  ⚠ 상태는 서버 쪽에서 옮깁니다(내부 화면 조작은 별도 검사가 봅니다).
    //    요점은 **같은 자료를 양쪽이 보고 있는가**입니다.
    o.status = step
    const { ctx, p } = await openAs(store, 'client', '/portal/supplies', HOSP.id)
    const body = flat(await p.locator('main').innerText())
    ok(body.includes(step), `병원 주문내역에 「${step}」이 그대로 보인다`)
    await ctx.close()
  }
}

// ── ⑩ 다른 병원에는 그 주문이 안 보인다 ───────────────────────────────────
{
  const OTHER = F.clients[7]
  const { ctx, p } = await openAs(store, 'client', '/portal/supplies', OTHER.id)
  const body = flat(await p.locator('main').innerText())
  ok(!/전달완료/.test(body), '**다른 병원 화면에 남의 주문 상태가 안 보인다**', body.slice(0, 70))
  await ctx.close()
}

await b.close()
