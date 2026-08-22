import { chromium, EXEC } from './_pw.mjs'

//  달력 · 예약 · 지어낸 값 걷어내기 (대표님 요청 세 가지).
//
//   ① 수거이력에 「성상(손상성·병리계)」이 안 뜬다 — 그 값은 일정 id 를
//      해시해 셋 중 하나를 **찍어 내던** 값이었습니다. 시스템에 그것을 넣는
//      자리가 아예 없는데 화면에는 확정된 사실처럼 떠 있었습니다.
//   ② 오늘 일정 아래에 달력이 있고, 날짜를 누르면 그날 일정이 위에 나온다
//   ③ 앞으로 올 날의 ＋ 로 그 자리에서 방문을 잡는다 (지난 날에는 ＋ 없음)
//   ④ 수거 입력 화면에서도 날짜를 정해 예약한다

const BASE = 'http://localhost:4173'
const UID = '00000000-0000-0000-0000-0000000000ad'
const FID = '00000000-0000-0000-0000-0000000000fd'
const CA = '00000000-0000-0000-0000-0000000000c1'

const TODAY = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
const day = (n) => {
  const t = new Date(`${TODAY}T00:00:00Z`)
  t.setUTCDate(t.getUTCDate() + n)
  return t.toISOString().slice(0, 10)
}
const MONTH = TODAY.slice(0, 7)

const out = []
const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  out.push(c)
  if (!c) process.exitCode = 1
}
const flat = (s) => (s ?? '').replace(/\s+/g, ' ')
const text = async (loc) => ((await loc.count()) ? flat(await loc.first().textContent()) : '')

const admin = {
  id: UID, email: 'a@b.c', name: '송명근', role: 'admin', font_scale: 'normal', active: true,
  approved_at: '2026-01-01T00:00:00Z', client_id: null, vehicle_id: null, created_at: '2026-01-01T00:00:00Z',
}
const field = { ...admin, id: FID, email: 'f@b.c', name: '김준기', role: 'field' }

const clients = [{
  id: CA, name: '가나요양병원', type: '병원', address: '경기도 남양주시', manager: '홍길동',
  phone: '031-000-0000', collection_cycle: '주 1회',
  collects_medical_waste: true, collects_diaper: false, storage_size: '보통',
  note: '', is_demo_generated: false, demo_session_id: null, active: true,
  contract_start: '2025-01-01', contract_end: null, payment_terms: '', payment_due_day: 20,
  pricing: { medical: { sale: 1000, cost: 600 } }, biz_no: '2568802759', vat_mode: 'inclusive',
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}]
const vehicles = [{ id: 'v1', name: '5506호', waste_type: '의료폐기물', tonnage: 1,
  nominal_capacity: 1000, expected_capacity: 660, driver: '오대성', active: true }]

const row = (id, d, over = {}) => ({
  id, date: d, client_id: CA, waste_type: '의료폐기물', vehicle_id: 'v1',
  scheduled_time: '09:00', status: '예정', expected_amount: 100, actual_amount: null,
  actual_time: null, driver_name: null, completed_at: null, memo: '', origin: 'system',
  is_additional: false, demo_session_id: null, plan_batch: null, booked_at: null,
  canceled_at: null, cancel_reason: '', containers: null, created_at: '', updated_at: '', ...over,
})
//  · 어제 다녀온 것 (수거이력에 뜹니다 — 여기 「성상」이 안 나와야 합니다)
//  · 오늘 예정 하나
//  · 사흘 뒤 예정 하나
//  · 닷새 뒤 **무른 것** (달력에서 안 세야 합니다)
const schedules = [
  row('past', day(-1), { status: '완료', actual_amount: 120, completed_at: `${day(-1)}T10:00:00Z`,
                         actual_time: '10:00', driver_name: '김준기', origin: 'field' }),
  row('today1', TODAY),
  row('soon', day(3)),
  row('gone', day(5), { canceled_at: `${TODAY}T01:00:00Z`, cancel_reason: '병원 휴진' }),
]

let lastBook = null
const b = await chromium.launch({ executablePath: EXEC })

function wire(ctx, me = admin) {
  ctx.route('**/auth/v1/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: me.id, aud: 'authenticated', email: me.email, app_metadata: {}, user_metadata: {} }) }))
  ctx.route('**/rest/v1/**', (r) => {
    const url = r.request().url()
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    if (url.includes('/rpc/app_schema_version')) return json(64)
    if (url.includes('/rpc/app_health_check')) return json({ version: 64, ok: true, missing: [], checkedAt: '' })
    if (url.includes('/rpc/book_visit')) {
      lastBook = JSON.parse(r.request().postData() ?? '{}')
      return json({ id: 'new', date: lastBook.p_date, clientName: '가나요양병원', requestUpdated: false })
    }
    if (url.includes('/rpc/')) return json(null)
    if (url.includes('/profiles')) return json(single ? me : [me])
    if (url.includes('/schedules')) return json(schedules)
    if (url.includes('/vehicles')) return json(vehicles)
    if (url.includes('/clients')) return json(single ? clients[0] : clients)
    if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
    return json([])
  })
}
async function open(ctx, path, me = admin) {
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: me.id, aud: 'authenticated', email: me.email, app_metadata: {}, user_metadata: {} }])
  await p.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(2600)
  return p
}

// ── ① 수거이력에 지어낸 「성상」이 없어야 한다 ──────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1800 } })
  wire(ctx)
  const p = await open(ctx, `/clients/${CA}`)
  await p.click('[data-client-tab="history"]')
  await p.waitForTimeout(1000)
  const body = flat(await p.textContent('body'))

  ok(!/성상/.test(body), '**「성상」 칸이 사라짐**')
  ok(!/손상성|병리계|위해성/.test(body),
    '**지어낸 분류값이 화면에 없음** (일정 id 를 해시해 찍어 내던 값입니다)',
    (body.match(/손상성|병리계|위해성/g) ?? []).join(','))
  //  용기도 마찬가지 — 현장에서 안 적었으면 지어내지 않습니다.
  ok(!/골판지 전용박스|합성수지 전용용기/.test(body),
    '**용기 종류도 안 지어냄** (개수는 2~9 사이 아무 값이었습니다)')
  //  표 자체는 살아 있어야 합니다.
  ok(/수거량/.test(body) && /120kg/.test(body), '수거이력 표는 그대로 (실제 기록 120kg)', '120kg')
  await ctx.close()
}

// ── ② 오늘 일정 아래에 달력 ─────────────────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 2200 } })
  wire(ctx)
  const p = await open(ctx, '/today')

  ok((await p.locator('[data-schedule-calendar]').count()) === 1, '**오늘 일정 아래에 달력이 있음**')
  //  일정 목록보다 아래여야 합니다.
  const yCal = (await p.locator('[data-schedule-calendar]').boundingBox())?.y ?? 0
  const yList = (await p.locator('[data-tour="today-list"], main').first().boundingBox())?.y ?? 0
  ok(yCal > yList, '일정 목록 아래에 놓임', `목록 ${Math.round(yList)} · 달력 ${Math.round(yCal)}`)

  ok((await text(p.locator('[data-cal-month]'))).startsWith(MONTH.slice(0, 4)),
    '이번 달로 열림', await text(p.locator('[data-cal-month]')))

  //  칸 수 — 주 단위로 채워지므로 7의 배수여야 합니다.
  const cells = await p.locator('[data-cal-day]').count()
  ok(cells % 7 === 0 && cells >= 28, '**격자가 7칸 단위로 채워짐**', `${cells}칸`)

  //  건수 표시 — 오늘 1건, 사흘 뒤 1건, 어제 다녀옴 1건
  ok((await p.locator(`[data-cal-count="${TODAY}"]`).count()) === 1, '오늘 칸에 건수가 있음')
  ok((await p.locator(`[data-cal-count="${day(3)}"]`).count()) === 1, '사흘 뒤 칸에도')
  //  ⚠ 무른 방문은 안 세야 합니다.
  ok((await p.locator(`[data-cal-count="${day(5)}"]`).count()) === 0,
    '**무른 방문은 달력에 안 뜸** (그날이 찬 것처럼 보이면 빈 날에 안 잡습니다)')

  //  날짜를 누르면 위 목록이 그날로
  await p.locator(`[data-cal-pick="${day(3)}"]`).dispatchEvent('click')
  await p.waitForTimeout(800)
  const after = flat(await p.textContent('body'))
  const [, mm, dd] = day(3).split('-')
  ok(new RegExp(`${Number(mm)}월 ${Number(dd)}일`).test(after),
    '**날짜를 누르면 위 목록이 그날로 바뀜**', `${mm}월 ${dd}일`)
  await ctx.close()
}

// ── ③ 달력에서 방문 잡기 ────────────────────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 2200 } })
  wire(ctx)
  const p = await open(ctx, '/today')

  ok((await p.locator(`[data-cal-book="${day(7)}"]`).count()) === 1, '앞으로 올 날에 ＋ 가 있음')
  ok((await p.locator(`[data-cal-book="${TODAY}"]`).count()) === 1,
    '**오늘도 잡을 수 있음** (아침에 온 전화)')
  ok((await p.locator(`[data-cal-book="${day(-1)}"]`).count()) === 0,
    '**지난 날에는 ＋ 가 없음** (눌리는데 안 되는 단추는 두지 않습니다)')

  await p.locator(`[data-cal-book="${day(7)}"]`).dispatchEvent('click')
  await p.waitForTimeout(800)
  ok((await p.locator('[data-book-modal]').count()) === 1, '＋ 를 누르면 예약 창이 열림')
  const d = await p.locator('[data-book-date]').inputValue()
  ok(d === day(7), '**누른 날짜가 그대로 들어가 있음**', d)

  //  거래처를 고르고 보냅니다.
  await p.locator('[data-book-client]').selectOption(CA)
  await p.waitForTimeout(400)
  lastBook = null
  await p.locator('[data-book-submit]').dispatchEvent('click')
  await p.waitForTimeout(1000)
  ok(lastBook?.p_date === day(7) && lastBook?.p_client_id === CA,
    '**고른 날짜·거래처가 그대로 서버로 감**', `${lastBook?.p_date}`)
  await ctx.close()
}

// ── ④ 달 넘기기 ─────────────────────────────────────────────────────────────
//
//   달 이동 버튼이 곧바로 되돌려지면 다음 달을 아예 볼 수 없습니다.
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 2200 } })
  wire(ctx)
  const p = await open(ctx, '/today')
  const before = await text(p.locator('[data-cal-month]'))
  await p.locator('[data-cal-next]').dispatchEvent('click')
  await p.waitForTimeout(700)
  const after = await text(p.locator('[data-cal-month]'))
  ok(before !== after, '**다음 달로 실제로 넘어감** (곧바로 되돌려지면 안 됩니다)', `${before} → ${after}`)
  await p.locator('[data-cal-prev]').dispatchEvent('click')
  await p.waitForTimeout(700)
  ok((await text(p.locator('[data-cal-month]'))) === before, '지난달 버튼으로 돌아옴')
  await ctx.close()
}

// ── ⑤ 기사에게는 ＋ 가 안 보인다 ────────────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
  wire(ctx, field)
  const p = await open(ctx, '/today', field)
  ok((await p.locator('[data-schedule-calendar]').count()) === 1, '기사도 달력은 봅니다 (언제 가는지)')
  ok((await p.locator('[data-cal-book]').count()) === 0,
    '**기사 화면에는 ＋ 가 없음** (남의 일정을 만드는 자리가 아닙니다)')
  await ctx.close()
}

// ── ⑥ 수거 입력에서도 예약 ──────────────────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 2000 } })
  wire(ctx)
  const p = await open(ctx, '/collection')

  const sec = p.locator('[data-book-section]')
  ok((await sec.count()) === 1, '**수거 입력 화면에 「다음 방문 예약」이 있음**')
  const t = await text(sec)
  ok(/위 수거 입력과는 별개입니다/.test(t),
    '**수거 입력과 다른 자리라고 못 박음** (섞이면 실적이 어긋납니다)', t.slice(0, 70))

  await p.locator('[data-book-section] [data-book-open]').dispatchEvent('click')
  await p.waitForTimeout(800)
  ok((await p.locator('[data-book-modal]').count()) === 1, '예약 창이 열림')
  //  날짜를 직접 고를 수 있어야 합니다.
  const min = await p.locator('[data-book-date]').getAttribute('min')
  ok(min === TODAY, '**날짜를 직접 고름** (오늘 이전은 못 고름)', `min=${min}`)

  await p.locator('[data-book-client]').selectOption(CA)
  await p.locator('[data-book-date]').fill(day(12))
  await p.waitForTimeout(400)
  lastBook = null
  await p.locator('[data-book-submit]').dispatchEvent('click')
  await p.waitForTimeout(1000)
  ok(lastBook?.p_date === day(12), '**고른 날짜로 예약됨**', `${lastBook?.p_date}`)
  await ctx.close()
}

// ── ⑦-a 폰 — 한 달 달력 대신 **날짜 띠** ────────────────────────────────────
//
//   ⚠ 0068 부터 폰에는 한 달 달력을 아예 안 그립니다. 620px 에 누를 칸이
//     42개라 「오늘 갈 곳」을 가렸고, 날짜 띠가 같은 일을 더 잘 합니다.
//     그러니 여기서 「폰에서 달력이 쓸 만한가」를 재면 늘 실패합니다 —
//     제품이 아니라 **재는 자리**가 옮겨간 것입니다.
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
  wire(ctx)
  const p = await open(ctx, '/today')
  ok((await p.locator('[data-schedule-calendar]:visible').count()) === 0, '폰에는 한 달 달력이 없음 (0068)')
  ok((await p.locator('[data-day-strip]').count()) === 1, '**대신 날짜 띠가 있음**')
  const cell = await p.locator(`[data-day="${TODAY}"]`).boundingBox()
  ok((cell?.height ?? 0) >= 44 && (cell?.width ?? 0) >= 44, '띠의 한 칸이 손가락으로 누를 만함',
    `${Math.round(cell?.width ?? 0)}×${Math.round(cell?.height ?? 0)}px`)
  const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  ok(over <= 1, '**가로로 밀리지 않음**', `${over}px`)
  await ctx.close()
}

// ── ⑦-b 넓은 화면 — 한 달 달력은 그대로 ─────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 1024, height: 1200 } })
  wire(ctx)
  const p = await open(ctx, '/today')
  const cal = await p.locator('[data-schedule-calendar]').boundingBox()
  ok(cal != null && cal.width <= 1024, '달력이 화면을 안 넘김', `${Math.round(cal?.width ?? 0)}px`)
  const cell = await p.locator(`[data-cal-day="${TODAY}"]`).boundingBox()
  ok(cell != null && cell.width >= 40, '한 칸이 누를 만함', `${Math.round(cell?.width ?? 0)}px`)
  ok(cell != null && cell.height >= 60, '칸 높이도 충분', `${Math.round(cell?.height ?? 0)}px`)
  await ctx.close()
}

await b.close()
console.log('')
console.log(`총 ${out.length}건 · 실패 ${out.filter((v) => !v).length}건`)
