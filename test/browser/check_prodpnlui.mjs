import { chromium, EXEC } from './_pw.mjs'

//  소모품 원가가 **화면의 뺄셈에서도** 맞는가.
//
//   계산을 고쳐도 화면에 「매출 − 처리비 − 자재비 = 기여이익」이라고 적혀
//   있으면 대표님이 손으로 더해 보고 「숫자가 안 맞는다」고 하십니다. 실제로
//   맞지 않습니다 — 소모품 원가가 그 사이에서 빠져 있기 때문입니다.
//
//   보는 것
//    ① 경영 요약 — 소모품 원가 칸이 뜨고, 화면의 뺄셈이 실제로 맞는가
//    ② 매입가가 없어 원가 0 으로 잡힌 품목을 이름으로 알려 주는가
//    ③ 정산 화면 — 소모품 매출·원가 칸, 그리고 바뀐 설명 문구
//    ④ 소모품만 전달한 달도 정산·명세서가 열리는가 (닫히면 받을 길이 없음)
//    ⑤ 소모품이 없는 달은 지금까지와 한 글자도 다르지 않은가

const BASE = 'http://localhost:4173'
const UID = '00000000-0000-0000-0000-0000000000ad'
const CA = '00000000-0000-0000-0000-0000000000c1'
//  경영 요약(통계)은 **이번 달**로 열립니다.
const MONTH = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 7)

const out = []
const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  out.push(c)
  if (!c) process.exitCode = 1
}
const flat = (s) => (s ?? '').replace(/\s+/g, ' ')
//  없는 요소의 글자를 읽으면 30초 기다렸다가 스위트가 통째로 **터집니다** —
//  뒤 검사를 한 건도 못 하고 끝나 「방어를 되돌렸을 때 무엇이 무너지는지」를
//  알 수 없게 됩니다. 없으면 빈 문자열로 두고 계속 갑니다.
const text = async (loc) => ((await loc.count()) ? flat(await loc.first().textContent()) : '')

const me = {
  id: UID, email: 'a@b.c', name: '송명근', role: 'admin', font_scale: 'normal', active: true,
  approved_at: '2026-01-01T00:00:00Z', client_id: null, vehicle_id: null, created_at: '2026-01-01T00:00:00Z',
}
const clients = [{
  id: CA, name: '가나요양병원', type: '병원', address: '경기도 남양주시', manager: '홍길동', phone: '031-000-0000',
  collection_cycle: '주 1회', collects_medical_waste: true, collects_diaper: false, storage_size: '보통',
  note: '', is_demo_generated: false, demo_session_id: null, active: true,
  contract_start: '2025-01-01', contract_end: null, payment_terms: '', payment_due_day: 20,
  pricing: { medical: { sale: 1000, cost: 600 } }, biz_no: '2568802759', vat_mode: 'inclusive',
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

const orders = [{
  id: 'o1', client_id: CA, status: '전달완료', requester_name: '홍길동', source: 'portal', note: '',
  deliver_schedule_id: null, deliver_on: null, requested_at: `${MONTH}-02T00:00:00Z`,
  confirmed_at: `${MONTH}-03T00:00:00Z`, delivered_at: `${MONTH}-05T10:00:00Z`,
  canceled_at: null, cancel_reason: '',
}]
//  멸균장갑은 매입가가 있고, 체온계는 **매입가가 비어 있습니다.**
//   매출 66,000 + 24,000 = 90,000 · 원가 40,000
const orderItems = [
  { id: 1, order_id: 'o1', product_id: 'p1', name: '멸균 수술장갑', spec: 'M', unit: '개', qty: 20, unit_price: 3300, unit_cost: 2000, stock_key: null },
  { id: 2, order_id: 'o1', product_id: 'p2', name: '전자체온계', spec: '', unit: '개', qty: 2, unit_price: 12000, unit_cost: 0, stock_key: null },
]

const b = await chromium.launch({ executablePath: EXEC })

function wire(ctx, { withOrders = true, withSchedules = true } = {}) {
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
    if (url.includes('/product_order_items')) return json(withOrders ? orderItems : [])
    if (url.includes('/product_orders')) return json(withOrders ? orders : [])
    if (url.includes('/schedules')) return json(withSchedules ? schedules : [])
    if (url.includes('/vehicles')) return json(vehicles)
    if (url.includes('/clients')) return json(single ? clients[0] : clients)
    if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
    return json([])
  })
}
async function open(ctx, path, wait = 2600) {
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: UID, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }])
  await p.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(wait)
  return p
}

// ── ① 경영 요약 — 화면의 뺄셈이 실제로 맞는가 ───────────────────────────────
//
//   매출 190,000 (수거 100,000 + 소모품 90,000)
//   처리비 60,000 · 소모품 원가 40,000 → 기여이익 90,000
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1600 } })
  wire(ctx)
  const p = await open(ctx, '/stats')

  const cost = p.locator('[data-rollup-productcost]')
  ok((await cost.count()) === 1, '**경영 요약에 「소모품 원가」 칸이 생김**')
  const costText = await text(cost)
  ok(/소모품 원가/.test(costText), '칸 이름이 그대로 적힘', costText)
  ok(/-4만원/.test(costText), '**소모품 원가 40,000원이 빠지는 값으로 표시**', costText)

  const box = await text(p.locator('[data-tour="business-summary"]'))
  ok(/19만원/.test(box), '매출 190,000원', box)
  ok(/-6만원/.test(box), '처리비 60,000원', box)
  ok(/9만원/.test(box), '**기여이익 90,000원 — 소모품 원가를 뺀 값**', box)
  //  ⚠ 고치기 전에는 여기가 130,000원(13만원)이었습니다. 그 숫자가 다시
  //  보이면 소모품 원가가 또 빠진 것입니다.
  ok(!/13만원/.test(box), '**부풀려진 130,000원이 아님**', box)

  //  매입가가 없는 품목 — 이름까지
  const nocost = p.locator('[data-rollup-nocost]')
  ok((await nocost.count()) === 1, '**매입가가 없어 원가 0으로 잡힌 품목을 알려 줌**')
  const nt = await text(nocost)
  ok(/전자체온계/.test(nt), '어떤 물건인지 이름으로', nt.slice(0, 70))
  ok(!/멸균 수술장갑/.test(nt), '매입가가 있는 물건은 재촉하지 않음')
  ok(/이익률 100%/.test(nt), '왜 위험한지 한 줄로 적힘', nt.slice(0, 90))
  await ctx.close()
}

// ── ② 정산 화면 — 소모품 매출·원가 칸과 바뀐 설명 ───────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1800 } })
  wire(ctx)
  const p = await open(ctx, `/clients/${CA}`)
  await p.click('[data-client-tab="settlement"]')
  await p.waitForTimeout(1400)

  ok((await p.locator('[data-settle-prodrev]').count()) === 1, '**정산 요약에 「소모품 매출」 칸이 있음**')
  ok((await p.locator('[data-settle-prodcost]').count()) === 1, '**「소모품 원가」 칸도 있음**')
  const rev = await text(p.locator('[data-settle-prodrev]'))
  const cst = await text(p.locator('[data-settle-prodcost]'))
  ok(/90,000/.test(rev), '소모품 매출 90,000원', rev)
  ok(/-40,000/.test(cst), '소모품 원가 40,000원', cst)

  //  설명 문구 — 여기가 안 바뀌면 화면이 거짓말을 합니다.
  const note = await text(p.locator('[data-profit-note]'))
  ok(/소모품 원가/.test(note), '**「기여이익 = 매출 − 처리비 − 자재비 − 소모품 원가」로 고쳐짐**', note.slice(0, 60))

  //  매입가 없는 품목 안내
  const nc = p.locator('[data-settle-nocost]')
  ok((await nc.count()) === 1, '정산 화면에도 매입가 안내가 뜸')
  const nct = await text(nc)
  ok(/전자체온계/.test(nct), '이름까지', nct.slice(0, 70))
  ok(/청구액은 바뀌지 않습니다/.test(nct),
    '**병원에 나가는 금액과는 무관하다고 못 박음** (고쳐도 청구서는 그대로)')
  await ctx.close()
}

// ── ③ 소모품만 전달한 달 ────────────────────────────────────────────────────
//
//   수거가 0건이어도 물건은 나갔습니다. 화면이 「집계할 것이 없다」로 닫히면
//   **판 물건 값을 받을 방법이 화면에 없습니다.**
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1800 } })
  wire(ctx, { withSchedules: false })
  const p = await open(ctx, `/clients/${CA}`)
  await p.click('[data-client-tab="settlement"]')
  await p.waitForTimeout(1400)

  const body = flat(await p.textContent('body'))
  ok(!/이 달에는 집계할 수거·공급·소모품이 없습니다/.test(body),
    '**소모품만 있어도 정산 화면이 열림**')
  ok(/멸균 수술장갑/.test(body), '품목표에 소모품이 올라옴')
  ok((await p.locator('[data-settle-line="product"]').count()) >= 1, '소모품 줄에 표시가 있음')

  const btn = p.getByRole('button', { name: /거래명세서/ }).first()
  const live = (await btn.count()) === 1 && !(await btn.isDisabled())
  ok(live, '**거래명세서 단추가 눌립니다** (닫혀 있으면 청구서를 못 만듭니다)')
  if (live) {
    await btn.dispatchEvent('click')
    await p.waitForTimeout(1200)
  }
  const inv = flat(await p.textContent('body'))
  ok(/소모품 공급 합계/.test(inv), '명세서에 소모품 소계가 있음')
  ok(/90,000/.test(inv), '**명세서 합계 90,000원** (수거 없이 소모품만)',
    inv.match(/9[0-9],[0-9]{3}/g)?.slice(0, 3).join(' ') ?? '')
  await ctx.close()
}

// ── ④ 소모품이 없는 달은 지금까지 그대로 ────────────────────────────────────
//
//   늘 떠 있는 칸과 문구는 배경이 됩니다. 판 적이 없으면 한 글자도 안 늘립니다.
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1400 } })
  wire(ctx, { withOrders: false })
  const p = await open(ctx, '/stats')
  const box = await text(p.locator('[data-tour="business-summary"]'))
  ok((await p.locator('[data-rollup-productcost]').count()) === 0, '**소모품 원가 칸이 안 뜸**')
  ok((await p.locator('[data-rollup-nocost]').count()) === 0, '매입가 안내도 안 뜸')
  ok(/10만원/.test(box), '매출 100,000원 그대로', box)
  ok(/4만원/.test(box), '기여이익 40,000원 그대로', box)
  await ctx.close()
}

// ── ⑤ 폰에서 다섯 칸이 깨지지 않는가 ────────────────────────────────────────
//
//   칸이 하나 늘면 폰(390px)에서 두 칸씩 놓이다가 마지막 칸이 반쪽으로
//   남습니다. 제일 중요한 숫자를 반쪽으로 두지 않습니다.
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 1400 } })
  wire(ctx)
  const p = await open(ctx, '/stats')
  const box = p.locator('[data-tour="business-summary"]')
  const w = (await box.boundingBox())?.width ?? 0
  ok(w > 0 && w <= 390, '요약 카드가 화면을 안 넘김', `${Math.round(w)}px`)

  //  기여이익 칸 — 폰에서는 한 줄을 다 씁니다.
  const cells = box.locator('> div > div')
  const n = await cells.count()
  ok(n === 5, '칸이 다섯 개', `${n}개`)
  //  칸이 모자라면 boundingBox 가 30초 기다렸다 터집니다 — 없는 것은
  //  없는 대로 두고 아래 검사를 마저 합니다.
  const last = n >= 5 ? await cells.nth(4).boundingBox() : null
  ok(last != null && last.width > w * 0.8,
    '**기여이익이 반쪽으로 남지 않음** (폰에서 한 줄을 다 씀)', `${Math.round(last?.width ?? 0)}px`)

  //  가로 스크롤이 생기면 숫자가 잘려 보입니다.
  const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  ok(over <= 1, '가로로 밀리지 않음', `${over}px`)
  await ctx.close()
}

await b.close()
console.log('')
console.log(`총 ${out.length}건 · 실패 ${out.filter((v) => !v).length}건`)
