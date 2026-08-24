import { chromium, EXEC } from './_pw.mjs'
import { PILOT, skipIfHidden } from './_pilot.mjs'

//  아직 값이 비어서 못 쓰는 기능 — 화면.
//
//   확인하는 것
//    · 설정 화면 맨 위에 뜨는가 · 지금 벌어지는 일을 숫자로 적는가
//    · 다 채우면 「다 채워져 있습니다」로 바뀌는가
//    · 대시보드 한 줄은 비어 있는 것이 없으면 **아예 안 그리는가**
//    · 별표(마크다운)가 화면에 그대로 보이지 않는가
//    · 현장·병원에는 안 뜨는가

const BASE = 'http://localhost:4173'
const UID = '00000000-0000-0000-0000-0000000000ad'
const out = []
const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  out.push(c)
  if (!c) process.exitCode = 1
}
const flat = (s) => (s ?? '').replace(/\s+/g, ' ')
const seen = (p, sel, ms = 20000) => p.waitForSelector(sel, { timeout: ms }).then(() => true, () => false)

const TODAY = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
const THIS_MONTH = TODAY.slice(0, 7)
const shiftMonth = (d) => {
  const [y, m] = THIS_MONTH.split('-').map(Number)
  const t = y * 12 + (m - 1) + d
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`
}
const fwd = (n) => {
  const d = new Date(`${TODAY}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

const CA = '00000000-0000-0000-0000-0000000000c1'
const mkClient = (over = {}) => ({
  id: CA, name: '가나요양병원', type: '병원', address: '경기도 남양주시 오남읍 1',
  manager: '', phone: '', collection_cycle: '주 1회', collects_medical_waste: true, collects_diaper: false,
  storage_size: '보통', note: '', is_demo_generated: false, demo_session_id: null, active: true,
  contract_start: '2025-01-01', contract_end: null, payment_terms: '', payment_due_day: 20,
  biz_no: '2568802759', vat_mode: 'exclusive',
  pricing: { plastic20: { sale: 9000, cost: 5200 } },
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', ...over,
})
const SCHED = [{
  id: 's1', date: fwd(5), client_id: CA, waste_type: '의료폐기물', vehicle_id: null,
  scheduled_time: '', status: '예정', expected_amount: 50, actual_amount: null, completed_at: null,
  memo: '', origin: 'system', is_additional: false, demo_session_id: null, plan_batch: null,
  created_at: `${TODAY}T00:00:00Z`, updated_at: `${TODAY}T00:00:00Z`,
}]
const PAYS = [{
  id: 'p1', client_id: CA, billing_month: shiftMonth(-1), amount: 1000000, status: '입금완료',
  method: '무통장', paid_at: `${TODAY}T00:00:00Z`, memo: '', canceled_at: null,
  snapshot: { invoice: { rows: [], total: 1000000 } },
  created_at: `${TODAY}T00:00:00Z`, updated_at: `${TODAY}T00:00:00Z`,
}]

/** 다 채워진 상태 */
const FULL = {
  cls: [mkClient()],
  holidays: [{ day: fwd(30), name: '추석' }],
  prods: [{ id: 'pr1', name: '용기', spec: '', unit: '개', sale_price: 9000, cost_price: 5200,
    stock_key: null, available: true, image_url: '', description: '', sort: 0, active: true, category: '기타' }],
  costs: [-1, -2, -3].map((d, i) => ({ id: `oc${i}`, month: shiftMonth(d), category: '인건비', amount: 1000000, memo: '' })),
  staff: [{ id: 'st1', name: '김준기', position: '현장', waste_scope: '의료폐기물',
    insured_from: null, insurance: {}, active: true }],
}

const b = await chromium.launch({ executablePath: EXEC })

function wire(ctx, o = {}) {
  const { role = 'admin', cls = FULL.cls, holidays = FULL.holidays, prods = FULL.prods,
    costs = FULL.costs, staff = FULL.staff, pays = PAYS, scheds = SCHED } = o
  const pf = {
    id: UID, email: 'a@b.c', name: '송명근', role, font_scale: 'normal',
    active: true, approved_at: '2026-01-01T00:00:00Z', client_id: null, created_at: '2026-01-01T00:00:00Z',
  }
  ctx.route('**/auth/v1/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: UID, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }) }))
  ctx.route('**/rest/v1/**', (r) => {
    const url = r.request().url()
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    if (url.includes('/rpc/app_schema_version')) return json(64)
    if (url.includes('/rpc/app_health_check')) return json({ version: 64, ok: true, missing: [], checkedAt: '' })
    if (url.includes('/rpc/recent_app_errors')) return json({ days: 7, total: 0, groups: [], checkedAt: '' })
    if (url.includes('/month_close_marks')) return json([])
    if (url.includes('/operating_costs')) return json(costs)
    if (url.includes('/holidays')) return json(holidays)
    if (url.includes('/products')) return json(prods)
    if (url.includes('/staff')) return json(staff)
    if (url.includes('/profiles')) return json(single ? pf : [pf])
    if (url.includes('/payments')) return json(pays)
    if (url.includes('/schedules')) return json(scheds)
    if (url.includes('/clients')) return json(single ? cls[0] : cls)
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

//  여러 곳이 비어 있는 상태
const EMPTY = {
  cls: [mkClient({ biz_no: '', vat_mode: null, pricing: {} })],
  holidays: [], costs: [], staff: [],
  prods: [{ id: 'pr1', name: '용기', spec: '', unit: '개', sale_price: 0, cost_price: 0,
    stock_key: null, available: false, image_url: '', description: '', sort: 0, active: true, category: '기타' }],
}

// ── 1. 다 채워져 있으면 그렇게 말한다 ───────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1600 } })
  wire(ctx)
  const p = await open(ctx, '/settings')
  ok(await seen(p, '[data-setup-clear]'), '**다 채워져 있으면 「다 채워져 있습니다」**')
  ok((await p.locator('[data-setup-gap]').count()) === 0, '빈 칸 목록이 없음')
  await ctx.close()
}
{
  //  대시보드 한 줄은 **아예 안 그립니다** — 지나가는 자리라 조용해야 합니다.
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1600 } })
  wire(ctx)
  const p = await open(ctx, '/')
  ok((await p.locator('[data-setup-line]').count()) === 0,
    '**다 채워져 있으면 대시보드에는 아무것도 안 그림** — 늘 있는 줄은 배경이 됩니다')
  await ctx.close()
}

// ── 2. 비어 있으면 지금 벌어지는 일을 숫자로 ────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1800 } })
  wire(ctx, EMPTY)
  const p = await open(ctx, '/settings')
  ok(await seen(p, '[data-setup-gaps]'), '설정 화면에 목록이 뜸')
  const head = flat(await p.textContent('[data-setup-headline]'))
  ok(/아직 값이 비어서 못 쓰는 기능이 \d+가지 있습니다/.test(head), '몇 가지인지 셈', head)

  const keys = await p.locator('[data-setup-gap]').evaluateAll((els) =>
    els.map((e) => e.getAttribute('data-setup-gap')))
  //  Pilot 동안 소모품은 내려가 있어 그 줄 하나가 빠집니다 (0080).
  ok(keys.length >= (PILOT.supplies ? 4 : 5), '비어 있는 것이 다 올라옴', keys.join(' '))

  //  「채워 주세요」가 아니라 지금 벌어지는 일.
  if (!skipIfHidden('supplies', '2. 소모품 단가가 비었을 때의 안내')) {
    const prod = flat(await p.textContent('[data-setup-effect="productPrice"]'))
    ok(/병원 화면에는 물건이 하나도 안 보입니다/.test(prod),
      '**지금 무슨 일이 벌어지는지 적음** — 「채워 주세요」가 아닙니다', prod.slice(0, 70))
  }
  const biz = flat(await p.textContent('[data-setup-effect="bizInfo"]'))
  ok(/청구가 있는 1곳 중 1곳/.test(biz), '실제 숫자로', biz.slice(0, 50))
  ok(/홈택스에 손으로 넣게 됩니다/.test(biz), '결국 무슨 일이 되는지')

  //  별표가 그대로 보이면 안 됩니다.
  const all = flat(await p.textContent('[data-setup-gaps]'))
  ok(!all.includes('**'), '**별표(마크다운)가 화면에 안 보임**',
    (all.match(/\*\*[^*]{0,20}/) ?? [''])[0])

  //  갈 곳이 있어야 합니다.
  if (!PILOT.supplies) {
    const href = await p.locator('[data-setup-link="productPrice"]').getAttribute('href')
    ok(href === '/supplies', '채우러 갈 곳으로 이어짐', String(href))
  } else {
    //  내려 둔 동안에도 **다른 줄은** 갈 곳이 있어야 합니다.
    const href = await p.locator('[data-setup-link="bizInfo"]').getAttribute('href')
    ok(typeof href === 'string' && href.length > 1, '채우러 갈 곳으로 이어짐', String(href))
  }
  await ctx.close()
}

// ── 3. 돈이 맨 위 ───────────────────────────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1800 } })
  wire(ctx, EMPTY)
  const p = await open(ctx, '/settings')
  const first = flat(await p.locator('[data-setup-gap]').first().textContent())
  ok(first.startsWith('돈'), '**돈이 틀릴 수 있는 것이 맨 위**', first.slice(0, 40))
  const head = flat(await p.textContent('[data-setup-headline]'))
  await p.waitForTimeout(200)
  const sub = flat(await p.textContent('[data-setup-gaps]'))
  ok(/돈이 틀릴 수 있는 자리입니다/.test(sub), '왜 위부터 보라는지 밝힘')
  await ctx.close()
}

// ── 4. 대시보드 한 줄 ───────────────────────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1600 } })
  wire(ctx, EMPTY)
  const p = await open(ctx, '/')
  ok(await seen(p, '[data-setup-line]'), '비어 있으면 대시보드에 한 줄이 뜸')
  const line = flat(await p.textContent('[data-setup-line]'))
  ok(/아직 값이 비어서 못 쓰는 기능 \d+가지/.test(line), '몇 가지인지', line)
  ok(/돈 관련 \d+가지/.test(line), '돈 관련이 몇 가지인지도', line)
  const href = await p.locator('[data-setup-line]').getAttribute('href')
  ok(href === '/settings', '설정으로 이어짐', String(href))
  await ctx.close()
}

// ── 5. 현장·병원에는 안 뜬다 ────────────────────────────────────────────────
//   자기가 넣을 수 없는 값이 매일 떠 있으면 화면 전체를 안 믿게 됩니다.
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  wire(ctx, { ...EMPTY, role: 'field' })
  const p = await open(ctx, '/settings')
  ok((await p.locator('[data-setup-gaps]').count()) === 0, '**현장 담당자에게는 안 뜸**')
  await ctx.close()
}

// ── 5-b. 같은 말을 두 번 하지 않는다 ───────────────────────────────────────
//
//   실증 초기에는 화면이 「미설정·없음」으로 가득합니다. 그건 사실이라
//   지우지 않습니다 — 대신 **같은 문장이 연달아 두 번** 뜨면 시스템이
//   미완성처럼 보입니다. 차량 경고가 실제로 두 번 떴습니다:
//   설정 카드의 설명과 그 안 VehicleManager 의 안내가 같은 말이었습니다.
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  wire(ctx, EMPTY)
  const p = await open(ctx, '/settings')
  const t = ((await p.textContent('main')) ?? '').replace(/\s+/g, ' ')
  const hits = (t.match(/차량이 없으면/g) ?? []).length
  ok(hits === 1, '설정에서 「차량이 없으면…」을 **한 번만** 말함', `${hits}번`)
  //  ⚠ 없애 버린 것이 아닙니다 — 무엇을 해야 하는지는 그대로 있어야 합니다.
  ok(/차량이 한 대도 없습니다/.test(t), '그 한 번은 무슨 일이 벌어지는지까지 말함')
  ok(/구분을 정확히 선택/.test(t), '채울 때 필요한 안내(의료·기저귀 구분)는 남아 있음')
  await ctx.close()
}

// ── 6. 폰에서 읽힌다 ────────────────────────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  wire(ctx, EMPTY)
  const p = await open(ctx, '/settings')
  ok(await seen(p, '[data-setup-gaps]'), '폰에서도 보임')
  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  ok(over <= 1, '가로 스크롤이 생기지 않음', `${over}px`)
  const w = await p.locator('[data-setup-gaps]').evaluate((e) => e.getBoundingClientRect().width)
  ok(w <= 390, '화면 안에 들어옴', `${Math.round(w)}px`)
  await ctx.close()
}

console.log('')
console.log(`총 ${out.length}건 · 실패 ${out.filter((v) => !v).length}건`)
await b.close()
