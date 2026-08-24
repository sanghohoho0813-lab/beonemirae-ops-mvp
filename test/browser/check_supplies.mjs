import { chromium, EXEC } from './_pw.mjs'
import { skipIfHidden } from './_pilot.mjs'

//  소모품 추천·주문·수거연계 — 매출 AX 화면 (0048).
//
//   쇼핑몰이 아닙니다. 확인하는 것은 「고를 수 있는가」가 아니라
//   **「왜 이걸 권하는지 병원이 알 수 있는가」** 입니다.
//
//    · 추천에 **근거가 붙는가** (최근 몇 번·몇 개·언제·평균 며칠)
//    · 자료가 모자라면 **추천하지 않고 그렇게 말하는가**
//    · 「다음 수거 때 같이」가 실제 예정일과 연결되는가
//    · 화면이 금액을 서버로 보내지 않는가 (금액은 서버가 계산)
//    · 다시 눌러도 주문이 두 개가 되지 않는가
//    · 현장에는 금액 없이 「전달할 물품」만 보이는가
//    · 실적은 **전달완료만** 세고, 없으면 없다고 말하는가

const BASE = 'http://localhost:4173'
const UID = '00000000-0000-0000-0000-0000000000ad'
const out = []
const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  out.push(c)
  if (!c) process.exitCode = 1
}
const flat = (s) => (s ?? '').replace(/\s+/g, ' ')
//  기다리다 못 찾아도 죽지 않습니다 — 못 찾은 것도 결과의 하나라
//  뒤 검사까지 같이 날리면 무엇이 깨졌는지 못 봅니다.
const seen = (p, sel, ms = 20000) => p.waitForSelector(sel, { timeout: ms }).then(() => true, () => false)
const TODAY = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
const back = (n) => {
  const d = new Date(`${TODAY}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}
const fwd = (n) => {
  const d = new Date(`${TODAY}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

const CA = '00000000-0000-0000-0000-0000000000c1'
const CB = '00000000-0000-0000-0000-0000000000c2'
const mkClient = (id, name) => ({
  id, name, type: '병원', address: '', manager: '', phone: '', collection_cycle: '주 1회',
  collects_medical_waste: true, collects_diaper: false, storage_size: '보통', note: '',
  is_demo_generated: false, demo_session_id: null, active: true,
  contract_start: '2025-01-01', contract_end: null, payment_terms: '', payment_due_day: 20,
  pricing: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
})
const clients = [mkClient(CA, '가나요양병원'), mkClient(CB, '다라병원')]

//  실제 사용 이력 — 30일 간격으로 세 번, 매번 12개 (합성수지 20L)
const mkMat = (id, clientId, date, plastic, box) => ({
  id, client_id: clientId, date, box_count: box ?? 0, vinyl_count: 0, needle_box_count: 0,
  is_additional_request: false, memo: '', items: plastic ? { plastic20: plastic } : {},
  origin: 'field', created_at: `${date}T00:00:00Z`,
})
const materials = [
  mkMat('m1', CA, back(62), 12),
  mkMat('m2', CA, back(32), 12),
  mkMat('m3', CA, back(4), 12),
  //  골판지는 한 번뿐 — 「주기」가 아니므로 추천하면 안 됩니다.
  mkMat('m4', CA, back(20), 0, 30),
]
const NEXT = fwd(6)
const schedules = [{
  id: 's-next', date: NEXT, client_id: CA, waste_type: '의료폐기물', vehicle_id: null,
  scheduled_time: '', status: '예정', expected_amount: 100, actual_amount: null, completed_at: null,
  memo: '', origin: 'system', is_additional: false, demo_session_id: null, plan_batch: null,
  created_at: `${TODAY}T00:00:00Z`, updated_at: `${TODAY}T00:00:00Z`,
}]

const P1 = '00000000-0000-0000-0000-0000000000p1'
const products = [{
  id: P1, name: '합성수지 전용용기', spec: '20L', unit: '개', sale_price: 9000, cost_price: 5200,
  stock_key: 'plastic_container', available: true, image_url: '', description: '', sort: 0, active: true,
  category: '의료폐기물 용기',
}]

//  0050 이 넣어 두는 소모품 — **단가가 아직 없습니다.** 지어낸 가격을
//  넣지 않았기 때문입니다. 그래서 병원 화면에는 안 뜨고, 사무실에는
//  「단가 미정」으로 뜹니다.
const catalog = [
  ...products,
  { id: 'pg1', name: '니트릴 검진장갑', spec: '100매입 · S/M/L', unit: '박스', sale_price: 0, cost_price: 0,
    stock_key: null, available: false, image_url: '', description: '', sort: 10, active: true,
    category: '위생·감염관리' },
  { id: 'pg2', name: '멸균거즈', spec: '4x4 · 100매입', unit: '박스', sale_price: 0, cost_price: 0,
    stock_key: null, available: false, image_url: '', description: '', sort: 20, active: true,
    category: '처치·드레싱' },
  { id: 'pg3', name: '성인용 기저귀', spec: '대형 · 10매입', unit: '팩', sale_price: 0, cost_price: 0,
    stock_key: null, available: false, image_url: '/products/adult-diaper.webp', description: '', sort: 30,
    active: true, category: '환자용품' },
]

const b = await chromium.launch({ executablePath: EXEC })

function wire(ctx, { role = 'client', calls = [], orders = [], prods = products, mats = materials, sales = null } = {}) {
  const pf = {
    id: UID, email: 'a@b.c', name: role === 'client' ? '가나요양병원 담당자' : '대표', role,
    font_scale: 'normal', active: true, approved_at: '2026-01-01T00:00:00Z',
    client_id: role === 'client' ? CA : null, created_at: '2026-01-01T00:00:00Z',
  }
  ctx.route('**/auth/v1/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: UID, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }) }))
  ctx.route('**/rest/v1/**', (r) => {
    const url = r.request().url()
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    if (url.includes('/rpc/request_product_order')) {
      calls.push(r.request().postDataJSON())
      return json({ id: 'new-order', alreadySaved: false, itemCount: 1, total: 0 })
    }
    if (url.includes('/rpc/set_product_order_status')) {
      calls.push(r.request().postDataJSON())
      return json({ id: 'x', status: 'ok', alreadyDone: false, stockMoved: true })
    }
    if (url.includes('/rpc/product_sales_summary')) {
      calls.push({ sales: true })
      if (sales === null) {
        return r.fulfill({ status: 404, contentType: 'application/json',
          body: JSON.stringify({ code: 'PGRST202', message: 'no function' }) })
      }
      return json(sales)
    }
    if (url.includes('/rpc/app_schema_version')) return json(64)
    if (url.includes('/rpc/app_health_check')) return json({ version: 48, ok: true, missing: [], checkedAt: '' })
    if (url.includes('/rpc/recent_app_errors')) return json({ days: 7, total: 0, groups: [], checkedAt: '' })
    if (url.includes('/profiles')) return json(single ? pf : [pf])
    if (url.includes('/product_order_items')) return json(orders.flatMap((o) => o.items ?? []))
    if (url.includes('/product_orders')) return json(orders.map(({ items, ...o }) => o))
    if (url.includes('/products')) return json(prods)
    if (url.includes('/materials')) return json(mats)
    if (url.includes('/schedules')) return json(schedules)
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
  await p.waitForTimeout(2400)
  return p
}

// ── 1. 추천에 근거가 붙는가 ──────────────────────────────────────────────
{
  const calls = []
  const ctx = await b.newContext({ viewport: { width: 900, height: 1400 } })
  wire(ctx, { calls })
  const p = await open(ctx, '/portal/supplies')
  await p.waitForSelector('[data-needs]', { timeout: 20000 })

  ok((await p.locator('[data-need="plastic_container"]').count()) === 1, '합성수지를 추천함 (3번 받으신 기록)')
  const why = flat(await p.textContent('[data-need="plastic_container"] [data-need-why]'))
  ok(/3번/.test(why), '몇 번 받으셨는지', why.slice(0, 70))
  ok(/모두 36개/.test(why), '모두 몇 개인지')
  ok(/한 달 .*개꼴/.test(why), '한 달에 몇 개꼴인지')
  ok(new RegExp(back(4)).test(why), '마지막이 언제였는지')
  ok(/평균 \d+일에 한 번/.test(why), '평균 며칠에 한 번인지')

  //  한 번뿐인 물품은 추천하지 않습니다 — 한 번은 「주기」가 아닙니다
  ok((await p.locator('[data-need="corrugated_box"]').count()) === 0,
    '한 번만 받은 물품은 추천하지 않음 — 한 번은 주기가 아닙니다')
  await ctx.close()
}

// ── 2. 자료가 모자라면 추천하지 않는다 ───────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 900, height: 1200 } })
  wire(ctx, { mats: [] })
  const p = await open(ctx, '/portal/supplies')
  await p.waitForSelector('[data-needs]', { timeout: 20000 })
  const t = flat(await p.textContent('[data-needs-blocked]'))
  ok(/추천할 사용 이력이 아직 충분하지 않습니다/.test(t), '자료가 없으면 그렇게 말함 — 지어내지 않음', t.slice(0, 60))
  ok((await p.locator('[data-need]').count()) === 0, '추천을 하나도 안 그림')
  await ctx.close()
}

// ── 2-b. 파는 물품을 아직 하나도 안 넣었을 때 ───────────────────────────
//   빈 화면을 그냥 두면 병원 눈에는 「고장」으로 보입니다.
{
  const ctx = await b.newContext({ viewport: { width: 900, height: 1200 } })
  wire(ctx, { prods: [] })
  const p = await open(ctx, '/portal/supplies')
  await p.waitForSelector('[data-needs]', { timeout: 20000 })
  ok((await p.locator('[data-order-box]').count()) === 0, '살 것이 없으면 주문표를 안 그림')
  const t = flat(await p.textContent('[data-no-products]'))
  ok(/준비되지 않았습니다/.test(t), '준비가 안 됐다고 그대로 말함 — 빈 화면으로 두지 않음', t.slice(0, 60))
  ok(/전화로/.test(t), '그러면 어떻게 하면 되는지도 알려 줌')
  await ctx.close()
}

// ── 3. 다음 수거 때 같이 · 금액은 서버가 ─────────────────────────────────
{
  const calls = []
  const ctx = await b.newContext({ viewport: { width: 900, height: 1400 } })
  wire(ctx, { calls })
  const p = await open(ctx, '/portal/supplies')
  await p.waitForSelector('[data-needs]', { timeout: 20000 })

  const pick = flat(await p.textContent('[data-with-pickup]'))
  ok(/다음 수거 때 같이 받기/.test(pick), '「다음 수거 때 같이」가 있음')
  ok(new RegExp(String(Number(NEXT.slice(5, 7)))).test(pick) && /방문 예정/.test(pick),
    '실제 다음 방문 예정일을 보여 줌', pick.slice(0, 70))

  //  추천 수량을 그대로 담기
  await p.click('[data-need-add="plastic_container"]')
  await p.waitForTimeout(300)
  ok((await p.textContent(`[data-qty="${P1}"]`)) === '12', '추천 수량 12개가 담김',
    await p.textContent(`[data-qty="${P1}"]`))
  const box = flat(await p.textContent('[data-order-box]'))
  ok(/108,000원/.test(box), '화면 합계 9,000 × 12 = 108,000원', (box.match(/1가지[^원]*원/) ?? [''])[0])

  await p.click('[data-order-send]')
  await p.waitForTimeout(1500)
  ok(calls.length === 1, '서버로 한 번 보냄', `${calls.length}회`)
  const c = calls[0]
  ok(c?.p_client_id === CA, '자기 병원으로만 보냄', c?.p_client_id)
  ok(JSON.stringify(c?.p_items) === JSON.stringify([{ productId: P1, qty: 12 }]),
    '품목과 수량만 보냄', JSON.stringify(c?.p_items))
  ok(!JSON.stringify(c ?? {}).includes('108000') && !JSON.stringify(c ?? {}).includes('9000'),
    '**금액을 서버로 안 보냄** — 금액은 서버가 상품표를 보고 계산합니다')
  ok(c?.p_deliver_schedule_id === 's-next' && c?.p_deliver_on === NEXT,
    '다음 수거 일정에 붙여서 보냄', `${c?.p_deliver_schedule_id} · ${c?.p_deliver_on}`)
  ok(typeof c?.p_request_id === 'string' && c.p_request_id.length === 36,
    '저장 시도 표를 붙임 — 다시 눌러도 두 건이 안 됨', c?.p_request_id)
  const msg = flat(await p.textContent('[data-order-msg]'))
  ok(/요청이 접수되었습니다/.test(msg), '접수됐다고 말함', msg.slice(0, 40))
  await ctx.close()
}

// ── 4. 결제가 아니라 요청 ────────────────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 900, height: 1400 } })
  wire(ctx, {})
  const p = await open(ctx, '/portal/supplies')
  await p.waitForSelector('[data-order-box]', { timeout: 20000 })
  const t = flat(await p.textContent('[data-order-box]'))
  ok(/지금 결제하지 않습니다/.test(t), '결제 쇼핑몰이 아니라고 분명히 함')
  ok(!/장바구니|결제하기|카드/.test(t), '쇼핑몰 말투를 쓰지 않음')
  ok((await p.locator('[data-order-send]').isDisabled()) === true, '아무것도 안 담으면 보낼 수 없음')
  await ctx.close()
}

// ── 5. 사무실 — 주문을 매출로 잇는 자리 ──────────────────────────────────
if (!skipIfHidden('supplies', '5. 사무실 소모품 주문 → 매출')) {
  const calls = []
  const orders = [{
    id: 'o1', client_id: CA, status: '요청', requester_name: '가나 담당자', source: 'portal',
    note: '3층 창고에 넣어 주세요', deliver_schedule_id: 's-next', deliver_on: NEXT,
    requested_at: `${TODAY}T01:00:00Z`, confirmed_at: null, delivered_at: null, canceled_at: null, cancel_reason: '',
    items: [{ id: 1, order_id: 'o1', product_id: P1, name: '합성수지 전용용기', spec: '20L', unit: '개',
      qty: 12, unit_price: 9000, unit_cost: 5200, stock_key: 'plastic_container' }],
  }]
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1200 } })
  wire(ctx, { role: 'admin', calls, orders })
  const p = await open(ctx, '/supplies')
  //  첫 화면은 「상품」입니다(6-f). 주문 처리는 칩을 눌러 들어갑니다.
  await p.click('button:has-text("주문")')
  await p.waitForSelector('[data-order="o1"]', { timeout: 20000 })
  const row = flat(await p.textContent('[data-order="o1"]'))
  ok(/가나요양병원/.test(row), '어느 병원인지')
  ok(/합성수지 전용용기 20L 12개/.test(row), '무엇을 몇 개')
  ok(/108,000원/.test(row), '금액도 (사무실 화면이므로)')
  ok(/수거 때/.test(row), '언제 실어 보낼지', (row.match(/\d+월 \d+일 수거 때/) ?? [''])[0])
  ok(/3층 창고에 넣어 주세요/.test(row), '병원이 남긴 말도')

  await p.click('[data-order-next="o1"]')
  await p.waitForTimeout(1200)
  ok(calls.length === 1 && calls[0]?.p_status === '확인', '다음 단계로 보냄 (요청 → 확인)',
    JSON.stringify(calls[0]))
  ok(!JSON.stringify(calls[0] ?? {}).includes('stock'),
    '**화면이 재고를 건드리지 않음** — 재고는 서버가 전달완료에서 한 번만 뺍니다')
  await ctx.close()
}

// ── 6. 실적은 전달완료만 · 없으면 없다고 ─────────────────────────────────
if (!skipIfHidden('supplies', '6. 소모품 판매 실적')) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1100 } })
  wire(ctx, { role: 'admin', sales: { from: '', to: '', orders: 0, clients: 0, revenue: 0, cost: 0, profit: 0, withPickup: 0 } })
  const p = await open(ctx, '/supplies')
  await p.click('button:has-text("실적")')
  await p.waitForTimeout(1200)
  const t = flat(await p.textContent('body'))
  ok(/실제로 전달한 것만/.test(t), '전달한 것만 센다고 밝힘')
  ok(/수거 서비스 매출과 별개/.test(t), '수거 매출과 섞지 않는다고 밝힘')
  ok(/예상 실적을 실제 성과처럼 표시하지 않습니다/.test(t), '없을 때 허위 실적을 안 만든다고 밝힘')
  await ctx.close()
}
if (!skipIfHidden('supplies', '사무실 소모품 화면 검사 1')) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1100 } })
  wire(ctx, { role: 'admin', sales: { from: '', to: '', orders: 3, clients: 2, revenue: 432000, cost: 249600, profit: 182400, withPickup: 3, repeatClients: 1, repeatOrders: 2 } })
  const p = await open(ctx, '/supplies')
  await p.click('button:has-text("실적")')
  await p.waitForTimeout(1200)
  const t = flat(await p.textContent('[data-sales]'))
  ok(/432,000원/.test(t), '판매 매출', t.slice(0, 60))
  ok(/182,400원/.test(t), '판매 이익 (매출 − 원가)')
  ok(/3건/.test(t) && /2곳/.test(t), '주문 건수 · 구매 거래처')
  ok(/수거 때 전달/.test(t), '수거와 함께 전달한 비율 — 이 사업모델이 도는지의 지표')
  //  거래처당 추가매출 = 432,000 ÷ 2 = 216,000. 화면에서 나누고 서버 값은 안 건드립니다.
  const cell = async (label) => flat(await p.textContent(`[data-sales-cell="${label}"]`))
  ok(/216,000원/.test(await cell('거래처당 추가매출')), '거래처당 추가매출 — 432,000 ÷ 2곳', await cell('거래처당 추가매출'))
  ok(/1곳/.test(await cell('다시 산 곳')), '「다시 산 곳」 — 한 번은 호의, 두 번째부터가 매출')
  ok(/수거 매출 대비/.test(t), '수거 매출과 나란히 놓고 비율을 봄')
  const note = flat(await p.textContent('[data-sales-note]'))
  ok(/두 매출을 더하지 않습니다/.test(note), '두 매출을 더하지 않는다고 못박음', note.slice(0, 60))
  ok(!/RUN_35 미실행/.test(note), '셀 수 있는 서버에서는 경고를 안 띄움')
  await ctx.close()
}

// ── 6-b. 「다시 산 곳」을 못 세는 옛 서버 ────────────────────────────────
//   0049 이전 서버는 이 칸을 안 보냅니다. 없는 것을 0 으로 바꿔 보여 주면
//   「아무도 다시 안 샀다」는 거짓말이 됩니다 — 「—」로 둡니다.
if (!skipIfHidden('supplies', '사무실 소모품 화면 검사 2')) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1100 } })
  wire(ctx, { role: 'admin', sales: { from: '', to: '', orders: 3, clients: 2, revenue: 432000, cost: 249600, profit: 182400, withPickup: 3 } })
  const p = await open(ctx, '/supplies')
  await p.click('button:has-text("실적")')
  await p.waitForTimeout(1200)
  const repeat = flat(await p.textContent('[data-sales-cell="다시 산 곳"]'))
  ok(/—/.test(repeat), '못 세는 것은 0 이 아니라 「—」', repeat)
  ok(!/0곳/.test(repeat), '**0곳이라고 거짓말하지 않음**', repeat)
  const note = flat(await p.textContent('[data-sales-note]'))
  ok(/RUN_35 미실행/.test(note), '왜 못 세는지 그대로 알려 줌', note.slice(0, 80))
  await ctx.close()
}

// ── 6-c. 상품 목록 — 분류로 묶고, 단가 없는 것을 숨기지 않는다 ──────────
//
//   품목만 있고 단가가 없으면 병원 화면에는 **하나도 안 뜹니다.** 그 사실을
//   숨기면 「등록했는데 왜 안 보이지」가 됩니다.
if (!skipIfHidden('supplies', '사무실 소모품 화면 검사 3')) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1600 } })
  wire(ctx, { role: 'admin', prods: catalog })
  const p = await open(ctx, '/supplies')
  await p.click('button:has-text("상품")')
  await p.waitForTimeout(900)

  const groups = await p.locator('[data-product-group]').evaluateAll(
    (els) => els.map((e) => e.getAttribute('data-product-group')))
  ok(groups.length === 4, '분류별로 묶어 보여 줌', groups.join(' · '))
  ok(groups.includes('위생·감염관리') && groups.includes('처치·드레싱') && groups.includes('환자용품'),
    '의료폐기물 말고도 병원이 늘 쓰는 소모품 분류가 있음')

  const warn = flat(await p.textContent('[data-product-needprice]'))
  ok(/3가지/.test(warn), '단가 없는 물품 수를 그대로 셈', warn.slice(0, 70))
  ok(/지어낸 가격은 넣지 않았습니다/.test(warn), '**가격을 지어내지 않았다고 밝힘**')
  ok(/병원 화면에 뜹니다/.test(warn), '단가를 넣어야 보인다는 것도 알려 줌')

  ok((await p.locator('[data-product-noprice="pg1"]').count()) === 1, '단가 없는 줄은 「단가 미정」')
  const row = flat(await p.textContent('[data-product-row="pg1"]'))
  ok(!/원가 0원/.test(row), '**0원이라고 적지 않음** — 0원은 「공짜」로 읽힙니다', row.slice(0, 80))
  ok(/사진 없음/.test(row), '사진이 없다는 것도 그대로')
  ok((await p.locator('[data-product-thumb="pg1"]').count()) === 1, '사진 자리는 미리 있음')
  //  사진이 있는 줄은 실제로 그림을 겁니다 — 나중에 대표님이 넣으실 자리입니다.
  ok((await p.locator('[data-product-thumb="pg3"] img').count()) === 1, '사진을 넣으면 그 자리에 뜸')
  //  실제 파일이 배포에 함께 올라갔는가 — 주소만 맞고 파일이 없으면
  //  병원 화면에 깨진 그림이 남습니다.
  const shot = await p.locator('[data-product-thumb="pg3"] img').evaluate((e) => ({
    src: e.getAttribute('src'), w: e.naturalWidth, h: e.naturalHeight,
  }))
  ok(shot.w > 100 && shot.h > 100, '사진 파일이 실제로 열림', `${shot.src} ${shot.w}x${shot.h}`)
  ok(!/사진 없음/.test(flat(await p.textContent('[data-product-row="pg3"]'))), '사진이 있으면 그 말은 안 함')
  await ctx.close()
}

// ── 6-d. 병원에는 단가 있는 것만 ─────────────────────────────────────────
//   0원짜리 주문이 들어오면 돈이 틀립니다.
{
  const ctx = await b.newContext({ viewport: { width: 900, height: 1400 } })
  wire(ctx, { prods: catalog })
  const p = await open(ctx, '/portal/supplies')
  await p.waitForSelector('[data-needs]', { timeout: 20000 })
  ok((await p.locator('[data-product="pg1"]').count()) === 0, '단가 없는 물품은 병원 화면에 안 뜸')
  ok((await p.locator(`[data-product="${P1}"]`).count()) === 1, '단가 있는 물품은 뜸')
  await ctx.close()
}

// ── 6-e. 단가 0원인데 「공급 가능」으로 켜져 있는 줄 ─────────────────────
//   0050 서버는 이 조합을 막지만, 그 전에 들어간 줄이나 표를 직접 고친
//   줄이 있을 수 있습니다. 화면도 한 번 더 걸러야 0원 주문이 안 들어옵니다.
{
  const bad = [...products, {
    id: 'pbad', name: '값 안 정한 물건', spec: '', unit: '개', sale_price: 0, cost_price: 0,
    stock_key: null, available: true, image_url: '', description: '', sort: 99, active: true, category: '기타',
  }]
  const ctx = await b.newContext({ viewport: { width: 900, height: 1400 } })
  wire(ctx, { prods: bad })
  const p = await open(ctx, '/portal/supplies')
  await p.waitForSelector('[data-needs]', { timeout: 20000 })
  ok((await p.locator('[data-product="pbad"]').count()) === 0,
    '**0원짜리는 켜져 있어도 병원에 안 보임** — 0원 주문이 그대로 확정 판매금액이 됩니다')
  await ctx.close()
}

// ── 6-f. 처음 열면 「상품」 ───────────────────────────────────────────────
//
//   예전 기본값은 「주문」이었습니다. 주문이 0건인 지금은 이 화면을 눌러도
//   빈 칸 한 줄만 나왔습니다 — 무엇을 파는지 보려면 한 번 더 눌러야 했습니다.
//
//   PC 와 폰 **둘 다** 확인합니다. 폰만 고치고 PC 를 빠뜨리는 자리입니다.
for (const [w, h, where] of skipIfHidden('supplies', '6-f. 소모품 화면을 처음 열면 「상품」')
  ? []
  : [[1440, 1600, 'PC'], [390, 844, '폰']]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } })
  wire(ctx, { role: 'admin', prods: catalog })
  const p = await open(ctx, '/supplies')
  //  누르지 않았는데도 상품이 떠 있어야 합니다.
  ok(await seen(p, '[data-product-row="pg1"]'), `${where} — 처음 화면이 「상품」`)
  ok((await p.locator('[data-product-row]').count()) === catalog.length,
    `${where} — 누르지 않아도 상품이 전부 보임`, `${await p.locator('[data-product-row]').count()}가지`)
  ok((await p.locator('[data-order-box]').count()) === 0 &&
     !/아직 들어온 주문이 없습니다/.test(flat(await p.textContent('body'))),
    `${where} — 빈 주문 목록이 첫 화면을 차지하지 않음`)
  //  사진이 **실제로** 걸리는가 — 기본 탭만 바뀌고 그림이 안 뜨면 의미가 없습니다.
  const shot = await p.locator('[data-product-thumb="pg3"] img')
    .evaluate((e) => ({ src: e.getAttribute('src'), w: e.naturalWidth }))
    .catch(() => ({ src: '(사진 자리가 없음)', w: 0 }))
  ok(shot.w > 100, `${where} — 첫 화면에서 사진이 바로 열림`, `${shot.src} ${shot.w}px`)
  await ctx.close()
}

//  들어온 주문을 놓치지 않는가 — 기본 화면이 바뀐 대가입니다.
//  칩의 숫자가 처리할 건수를 그대로 들고 있어야 합니다.
if (!skipIfHidden('supplies', '사무실 소모품 화면 검사 4')) {
  const orders = [{
    id: 'o1', client_id: CA, status: '요청', requester_name: '가나 담당자', source: 'portal',
    note: '', deliver_schedule_id: null, deliver_on: null,
    requested_at: `${TODAY}T01:00:00Z`, confirmed_at: null, delivered_at: null, canceled_at: null, cancel_reason: '',
    items: [{ id: 1, order_id: 'o1', product_id: P1, name: '합성수지 전용용기', spec: '20L', unit: '개',
      qty: 12, unit_price: 9000, unit_cost: 5200, stock_key: 'plastic_container' }],
  }]
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
  wire(ctx, { role: 'admin', prods: catalog, orders })
  const p = await open(ctx, '/supplies')
  ok(await seen(p, '[data-product-row="pg1"]'), '주문이 있어도 처음 화면은 「상품」')
  const badge = await p.locator('[data-open-orders]').first()
  const badgeText = flat(await badge.textContent().catch(() => ''))
  ok(badgeText === '1', '처리할 주문 건수가 칩에 그대로 남음', badgeText)
  //  회색으로 두면 놓칩니다 — 다른 칸을 보고 있을 때는 붉게.
  const bg = await badge.evaluate((e) => getComputedStyle(e).backgroundColor).catch(() => '(배지 없음)')
  ok(/244,\s*63,\s*94/.test(bg), '**처리할 주문이 있으면 눈에 띄게** (붉은 배지)', bg)
  //  실제로 그 칸으로 갈 수 있는가.
  await p.click('button:has-text("주문")')
  await p.waitForSelector('[data-order="o1"]', { timeout: 20000 })
  ok(true, '칩을 누르면 주문 처리 화면으로 들어감')
  await ctx.close()
}
//  주문이 0건이면 붉게 띄우지 않습니다 — 늘 붉으면 아무도 안 봅니다.
if (!skipIfHidden('supplies', '사무실 소모품 화면 검사 5')) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
  wire(ctx, { role: 'admin', prods: catalog })
  const p = await open(ctx, '/supplies')
  ok(await seen(p, '[data-product-row="pg1"]'), '주문이 없을 때도 처음 화면은 「상품」')
  const bg = await p.locator('[data-open-orders]').first()
    .evaluate((e) => getComputedStyle(e).backgroundColor).catch(() => '(배지 없음)')
  ok(!/244,\s*63,\s*94/.test(bg), '처리할 주문이 없으면 붉히지 않음', bg)
  await ctx.close()
}

// ── 7. 현장 — 금액 없이 「전달할 물품」만 ────────────────────────────────
{
  const orders = [{
    id: 'o2', client_id: CA, status: '전달예정', requester_name: '', source: 'portal', note: '',
    deliver_schedule_id: 's-today', deliver_on: TODAY, requested_at: `${TODAY}T01:00:00Z`,
    confirmed_at: `${TODAY}T02:00:00Z`, delivered_at: null, canceled_at: null, cancel_reason: '',
    items: [{ id: 2, order_id: 'o2', product_id: P1, name: '합성수지 전용용기', spec: '20L', unit: '개',
      qty: 12, unit_price: 9000, unit_cost: 5200, stock_key: 'plastic_container' }],
  }]
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
  wire(ctx, { role: 'field', orders })
  //  오늘 일정에 그 병원 방문이 있어야 합니다
  await ctx.route('**/rest/v1/schedules**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{
      ...schedules[0], id: 's-today', date: TODAY,
    }]) }))
  const p = await open(ctx, '/today')
  await p.waitForTimeout(900)
  ok((await p.locator('[data-today-deliveries]').count()) === 1, '오늘 일정에 「전달할 물품」이 뜸')
  const t = flat(await p.textContent('[data-today-deliveries]'))
  ok(/가나요양병원/.test(t) && /합성수지 전용용기 20L 12개/.test(t), '어디에 무엇을 몇 개', t.slice(0, 60))
  ok(!/원/.test(t.replace(/가나요양병원|합성수지 전용용기/g, '')), '**현장 화면에 금액이 없음**')
  await ctx.close()
}

// ── 8. 확인 전 요청은 현장에 안 보낸다 ───────────────────────────────────
//   아직 확인 안 한 요청을 현장에 보내면 사무실이 거절할 것을 싣고 갑니다.
{
  const orders = [{
    id: 'o3', client_id: CA, status: '요청', requester_name: '', source: 'portal', note: '',
    deliver_schedule_id: 's-today', deliver_on: TODAY, requested_at: `${TODAY}T01:00:00Z`,
    confirmed_at: null, delivered_at: null, canceled_at: null, cancel_reason: '',
    items: [{ id: 3, order_id: 'o3', product_id: P1, name: '합성수지 전용용기', spec: '20L', unit: '개',
      qty: 5, unit_price: 9000, unit_cost: 5200, stock_key: 'plastic_container' }],
  }]
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
  wire(ctx, { role: 'field', orders })
  await ctx.route('**/rest/v1/schedules**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{
      ...schedules[0], id: 's-today', date: TODAY,
    }]) }))
  const p = await open(ctx, '/today')
  await p.waitForTimeout(900)
  ok((await p.locator('[data-today-deliveries]').count()) === 0,
    '아직 확인 안 한 요청은 현장에 안 보냄')
  await ctx.close()
}

await b.close()
console.log(`\n총 ${out.length}건 · 실패 ${out.filter((x) => !x).length}건`)
