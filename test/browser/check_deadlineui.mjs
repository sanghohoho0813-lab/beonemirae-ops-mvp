import { chromium, EXEC } from './_pw.mjs'

//  밀린 마감 띠 — 화면.
//
//   알림은 틀리면 죽습니다. 매일 뜨는 빨간 줄은 곧 안 보게 되고,
//   그러면 진짜 빠뜨린 달도 같이 안 보입니다.
//
//   확인하는 것
//    · 밀린 것이 없으면 **아무것도 안 그린다** (「이상 없음」 띠도 없음)
//    · 밀린 것이 있으면 오늘 할 일보다 **위**에 뜬다
//    · 현장 담당자에게는 안 뜬다 (자기가 할 수 없는 일)
//    · 표시하면 사라진다
//    · 세법 기한을 말하지 않는다

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
const shiftMonth = (month, d) => {
  const [y, m] = month.split('-').map(Number)
  const t = y * 12 + (m - 1) + d
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`
}
const THIS_MONTH = TODAY.slice(0, 7)
const M1 = shiftMonth(THIS_MONTH, -1)
const M3 = shiftMonth(THIS_MONTH, -3)

const CA = '00000000-0000-0000-0000-0000000000c1'
const clients = [{
  id: CA, name: '가나요양병원', type: '병원', address: '경기도 남양주시 오남읍 양지로 47-35',
  manager: '', phone: '', collection_cycle: '주 1회', collects_medical_waste: true, collects_diaper: false,
  storage_size: '보통', note: '', is_demo_generated: false, demo_session_id: null, active: true,
  contract_start: '2025-01-01', contract_end: null, payment_terms: '', payment_due_day: 20,
  pricing: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}]
const mkSched = (id, month) => ({
  id, date: `${month}-10`, client_id: CA, waste_type: '의료폐기물', vehicle_id: null,
  scheduled_time: '', status: '완료', expected_amount: 50, actual_amount: 50,
  completed_at: `${month}-10T09:00:00Z`, memo: '', origin: 'field', is_additional: false,
  demo_session_id: null, plan_batch: null, created_at: `${month}-10T00:00:00Z`, updated_at: `${month}-10T00:00:00Z`,
})
const mkPay = (id, month, amount) => ({
  id, client_id: CA, billing_month: month, amount, status: '입금완료', method: '무통장',
  paid_at: `${month}-25T00:00:00Z`, memo: '', canceled_at: null,
  snapshot: { invoice: { rows: [], total: amount } },
  created_at: `${month}-28T00:00:00Z`, updated_at: `${month}-28T00:00:00Z`,
})

const b = await chromium.launch({ executablePath: EXEC })

function wire(ctx, { role = 'admin', scheds = [], pays = [], marks = [] } = {}) {
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
    if (url.includes('/rpc/app_health_check')) return json({ version: 54, ok: true, missing: [], checkedAt: '' })
    if (url.includes('/rpc/recent_app_errors')) return json({ days: 7, total: 0, groups: [], checkedAt: '' })
    if (url.includes('/month_close_marks')) return json(marks)
    if (url.includes('/profiles')) return json(single ? pf : [pf])
    if (url.includes('/payments')) return json(pays)
    if (url.includes('/schedules')) return json(scheds)
    if (url.includes('/clients')) return json(single ? clients[0] : clients)
    if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
    return json([])
  })
}
async function open(ctx, path = '/') {
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: UID, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }])
  await p.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(2600)
  return p
}

//  밀린 상황: 3달 전과 1달 전에 수거·청구가 있는데 표시가 없습니다.
const BEHIND = {
  scheds: [mkSched('s1', M3), mkSched('s2', M1)],
  pays: [mkPay('p1', M3, 1000000), mkPay('p2', M1, 800000)],
}

// ── 1. 밀린 것이 없으면 아무것도 안 그린다 ──────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1400 } })
  wire(ctx) // 수거도 청구도 없음
  const p = await open(ctx)
  ok((await p.locator('[data-deadlines]').count()) === 0,
    '**아무 일도 없으면 띠를 안 그림** — 「이상 없음」 띠도 안 만듭니다. 늘 있는 것은 배경이 됩니다')
  await ctx.close()
}
{
  //  일은 있었지만 다 표시한 달 — 조용해야 합니다.
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1400 } })
  wire(ctx, {
    ...BEHIND,
    marks: [M1, M3].flatMap((m) => ['invoice_sent', 'tax_issued'].map((step) => ({
      month: m, step, marked_at: `${TODAY}T10:00:00Z`, marked_name: '송명근', note: '',
    }))),
  })
  const p = await open(ctx)
  ok((await p.locator('[data-deadlines]').count()) === 0,
    '**표시를 다 했으면 사라짐** — 알림이 계속 남아 있으면 아무도 안 봅니다')
  await ctx.close()
}

// ── 2. 밀렸으면 오늘 할 일보다 위 ───────────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1600 } })
  wire(ctx, BEHIND)
  const p = await open(ctx)
  ok(await seen(p, '[data-deadlines]'), '밀린 것이 있으면 띠가 뜸')
  const head = flat(await p.textContent('[data-deadlines-headline]'))
  ok(/아직 안 끝난 달이 2개 있습니다/.test(head), '밀린 달 수를 셈', head)

  const rows = await p.locator('[data-overdue]').evaluateAll((els) =>
    els.map((e) => e.getAttribute('data-overdue')))
  ok(rows.length > 0, '무엇이 밀렸는지 줄로 보여 줌', rows.join(' · '))
  ok(rows[0].startsWith(M3), '**오래된 달이 맨 위** — 3달 전 것이 지난달보다 급합니다', rows[0])

  //  세금계산서·명세서 둘 다 있어야 합니다.
  //  ⚠ 띠는 이제 **한 건만 펼칩니다**(화면을 다 먹지 않게). 두 단계가 다
  //    잡혔는지는 펼친 뒤에 봅니다 — 펼치기가 실제로 되는지도 함께 검사됩니다.
  if (await p.locator('[data-deadlines-more]').count()) await p.click('[data-deadlines-more]')
  await p.waitForTimeout(300)
  const all = flat(await p.textContent('[data-deadlines]'))
  ok(/거래명세서 발송/.test(all) && /세금계산서 발행/.test(all), '두 단계를 다 짚음')
  ok(/그 달이 끝난 지 \d+일/.test(all), '**며칠 지났는지 사실만 적음**',
    (all.match(/그 달이 끝난 지 \d+일/) ?? [''])[0])

  //  세법 판단은 하지 않습니다.
  for (const word of ['법정', '가산세', '10일까지', '위반']) {
    ok(!all.includes(word), `「${word}」이라고 말하지 않음`)
  }

  //  오늘 할 일보다 위에 있어야 합니다 — 지지난달 빠뜨린 것이 더 급합니다.
  const yBanner = await p.locator('[data-deadlines]').evaluate((e) => e.getBoundingClientRect().top)
  const yCore = await p.locator('main h1, main h2').first().evaluate((e) => e.getBoundingClientRect().top)
  ok(yBanner > yCore, '인사 아래에 있음', `띠 ${Math.round(yBanner)}px · 제목 ${Math.round(yCore)}px`)
  await ctx.close()
}

// ── 3. 처음엔 3건만, 나머지는 눌러서 ────────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1600 } })
  wire(ctx, BEHIND)
  const p = await open(ctx)
  const first = await p.locator('[data-overdue]').count()
  //  ⚠ 예전에는 3건을 펼쳤습니다. 그랬더니 이 띠 하나가 폰에서 778px(PC 496px)이
  //    되어, 정작 「오늘 처리할 업무」가 폰 y=1,189px 로 밀렸습니다 — 대표님이
  //    이 화면을 여는 이유가 첫 화면에서 사라진 것입니다. 그래서 한 건만
  //    펼칩니다(급한 순서로 정렬되어 있어 맨 위가 지금 제일 급한 것).
  ok(first === 1, '처음에는 한 건만 (화면을 다 먹지 않게)', `${first}건`)
  //  숫자만 세면 다음에 또 늘어날 수 있으니 **실제 높이**로 의도를 지킵니다.
  const bannerH = await p.locator('[data-deadlines]').evaluate((e) => Math.round(e.getBoundingClientRect().height))
  ok(bannerH <= 420, '띠가 화면 하나를 먹지 않음 (420px 이하)', `${bannerH}px`)
  ok(await seen(p, '[data-deadlines-more]', 3000), '나머지를 볼 수 있음')
  const more = flat(await p.textContent('[data-deadlines-more]'))
  ok(/나머지 \d+건 보기/.test(more), '몇 건이 더 있는지 알려 줌', more)
  await p.click('[data-deadlines-more]')
  await p.waitForTimeout(400)
  ok((await p.locator('[data-overdue]').count()) > first, '누르면 다 보임',
    `${await p.locator('[data-overdue]').count()}건`)
  await ctx.close()
}

// ── 4. 현장 담당자에게는 안 뜬다 ────────────────────────────────────────────
//   자기가 할 수 없는 일이 매일 빨갛게 떠 있으면 화면 전체를 안 믿게 됩니다.
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  wire(ctx, { ...BEHIND, role: 'field' })
  const p = await open(ctx, '/today')
  await p.waitForTimeout(1500)
  ok((await p.locator('[data-deadlines]').count()) === 0,
    '**현장 담당자에게는 안 뜸** — 마감은 사무실 일입니다')
  await ctx.close()
}

// ── 5. 오늘 일정에도 뜬다 · 폰에서 읽힌다 ───────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  wire(ctx, BEHIND)
  const p = await open(ctx, '/today')
  ok(await seen(p, '[data-deadlines]'), '오늘 일정에도 뜸 — 사무실이 하루에 제일 많이 여는 화면')
  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  ok(over <= 1, '가로 스크롤이 생기지 않음', `${over}px`)
  const w = await p.locator('[data-deadlines]').evaluate((e) => e.getBoundingClientRect().width)
  ok(w <= 390, '띠가 화면 안에 들어옴', `${Math.round(w)}px`)
  //  글자가 세로로 늘어지지 않는지 — 한 줄 높이로 확인합니다.
  const tall = await p.locator('[data-overdue]').first().evaluate((e) => {
    const r = e.getBoundingClientRect()
    return { h: r.height, w: r.width }
  })
  ok(tall.h < 200, '줄이 세로로 늘어지지 않음', `${Math.round(tall.w)}x${Math.round(tall.h)}px`)
  await ctx.close()
}

console.log('')
console.log(`총 ${out.length}건 · 실패 ${out.filter((v) => !v).length}건`)
await b.close()
