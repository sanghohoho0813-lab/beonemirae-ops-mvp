import { chromium, EXEC } from './_pw.mjs'
import { skipIfHidden } from './_pilot.mjs'

//  방문 예약과 긴급 신호가 화면에서 실제로 되는가 (0058).
//
//   ① 오늘 일정 · 거래처에서 예약 창을 열 수 있는가 — 기사에게는 안 보이는가
//   ② 창이 그 거래처가 **하는 구분만** 내놓는가 (안 하는 구분은 고를 수도 없게)
//   ③ 지난 날짜를 달력이 아예 못 고르게 하는가
//   ④ 휴무일이면 **막지 않고 알려만** 주는가
//   ⑤ 서버가 거절하면 그 말을 그대로 보여 주는가
//   ⑥ 요청 화면에서 수거 요청에만 「날짜 잡기」가 붙는가
//   ⑦ 긴급 신호 — 지금 손댈 곳이 있을 때만 뜨고, 근거가 적히는가
//   ⑧ 예약된 방문이 오늘 일정에서 갈라 보이는가

const BASE = 'http://localhost:4173'
const UID = '00000000-0000-0000-0000-0000000000ad'
const FID = '00000000-0000-0000-0000-0000000000fd'
const CA = '00000000-0000-0000-0000-0000000000c1'
const CB = '00000000-0000-0000-0000-0000000000c2'

const kst = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
const TODAY = kst()
const day = (n) => {
  const t = new Date(`${TODAY}T00:00:00Z`)
  t.setUTCDate(t.getUTCDate() + n)
  return t.toISOString().slice(0, 10)
}

const out = []
const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  out.push(c)
  if (!c) process.exitCode = 1
}
const flat = (s) => (s ?? '').replace(/\s+/g, ' ')
//  없는 요소의 글자를 읽으면 30초 기다렸다 스위트가 통째로 터집니다.
const text = async (loc) => ((await loc.count()) ? flat(await loc.first().textContent()) : '')

const admin = {
  id: UID, email: 'a@b.c', name: '송명근', role: 'admin', font_scale: 'normal', active: true,
  approved_at: '2026-01-01T00:00:00Z', client_id: null, vehicle_id: null, created_at: '2026-01-01T00:00:00Z',
}
const field = { ...admin, id: FID, email: 'f@b.c', name: '김준기', role: 'field' }

const clients = [
  {
    id: CA, name: '가나요양병원', type: '병원', address: '경기도 남양주시', manager: '홍길동',
    phone: '031-000-0000', collection_cycle: '주 1회',
    //  의료폐기물만 배출합니다 — 기저귀는 고를 수 없어야 합니다.
    collects_medical_waste: true, collects_diaper: false, storage_size: '보통',
    note: '', is_demo_generated: false, demo_session_id: null, active: true,
    contract_start: '2025-01-01', contract_end: null, payment_terms: '', payment_due_day: 20,
    pricing: { medical: { sale: 1000, cost: 600 } }, biz_no: '2568802759', vat_mode: 'inclusive',
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: CB, name: '다라요양원', type: '요양시설', address: '경기도 구리시', manager: '이영희',
    phone: '031-111-1111', collection_cycle: '주 2회',
    collects_medical_waste: true, collects_diaper: true, storage_size: '작음',
    note: '', is_demo_generated: false, demo_session_id: null, active: true,
    contract_start: '2025-01-01', contract_end: null, payment_terms: '', payment_due_day: 20,
    pricing: { medical: { sale: 1000, cost: 600 } }, biz_no: '1112233333', vat_mode: 'inclusive',
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  },
]

const vehicles = [
  { id: 'v1', name: '5506호', waste_type: '의료폐기물', tonnage: 1, nominal_capacity: 1000,
    expected_capacity: 660, driver: '오대성', active: true },
  { id: 'v2', name: '7788호', waste_type: '일회용기저귀', tonnage: 1, nominal_capacity: 1000,
    expected_capacity: 660, driver: '백광호', active: true },
]

//  가나요양병원 — 7일 간격으로 다녀왔고, 앞으로 잡힌 방문이 없습니다.
//  그리고 최근에 급한 요청이 세 번 왔습니다 → 긴급 신호가 떠야 합니다.
const sched = (id, cid, d, status, extra = {}) => ({
  id, date: d, client_id: cid, waste_type: '의료폐기물', vehicle_id: 'v1',
  scheduled_time: '09:00', status, expected_amount: 100,
  actual_amount: status === '완료' ? 100 : null,
  actual_time: status === '완료' ? '10:00' : null, driver_name: '김준기',
  completed_at: status === '완료' ? `${d}T10:00:00Z` : null,
  memo: '', origin: 'field', is_additional: false, demo_session_id: null, plan_batch: null,
  booked_at: null, created_at: '', updated_at: '', ...extra,
})
const schedules = [
  ...Array.from({ length: 8 }, (_, i) => sched(`s${i}`, CA, day(-7 * (8 - i)), '완료')),
  //  오늘 잡혀 있는 방문 하나 — 하나는 **예약**입니다.
  sched('today1', CB, TODAY, '예정'),
  sched('today2', CB, TODAY, '예정', {
    id: 'today2', waste_type: '일회용기저귀', vehicle_id: 'v2',
    booked_at: `${TODAY}T01:00:00Z`, memo: '병원 요청 — 3층 처치실 앞',
  }),
]

const requests = [
  { id: 'q1', client_id: CA, kind: '긴급수거', content: '보관실이 가득 찼습니다', desired_date: day(3),
    urgent: true, status: '접수', source: 'portal', requester_name: '홍길동', reply: '',
    handled_by: null, handled_at: null, created_at: `${day(-30)}T09:00:00Z`, updated_at: '' },
  { id: 'q2', client_id: CA, kind: '긴급수거', content: '또 가득 찼습니다', desired_date: null,
    urgent: true, status: '접수', source: 'portal', requester_name: '홍길동', reply: '',
    handled_by: null, handled_at: null, created_at: `${day(-12)}T09:00:00Z`, updated_at: '' },
  { id: 'q3', client_id: CA, kind: '추가수거', content: '한 번 더 와 주세요', desired_date: null,
    urgent: false, status: '접수', source: 'staff', requester_name: '홍길동', reply: '',
    handled_by: null, handled_at: null, created_at: `${day(-3)}T09:00:00Z`, updated_at: '' },
  //  소모품 요청 — 여기에는 「날짜 잡기」가 붙으면 안 됩니다.
  { id: 'q4', client_id: CB, kind: '소모품', content: '용기 부탁드립니다', desired_date: null,
    urgent: false, status: '접수', source: 'portal', requester_name: '이영희', reply: '',
    handled_by: null, handled_at: null, created_at: `${day(-2)}T09:00:00Z`, updated_at: '' },
]

//  오늘이 휴무일이라고 등록해 둡니다 — 막지 않고 알려만 줘야 합니다.
const holidays = [{ id: 'h1', day: day(5), name: '테스트 공휴일', kind: '공휴일', created_at: '' }]

const b = await chromium.launch({ executablePath: EXEC })

/** 마지막으로 서버에 보낸 book_visit 인자 (창이 무엇을 보내는지 봅니다) */
let lastBook = null
/** 서버가 거절하도록 만들 때 쓸 메시지 */
let bookError = null

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
      if (bookError) {
        return r.fulfill({ status: 400, contentType: 'application/json',
          body: JSON.stringify({ message: bookError }) })
      }
      return json({ id: 'new1', date: lastBook.p_date, clientName: '가나요양병원', requestUpdated: true })
    }
    if (url.includes('/rpc/')) return json(null)
    if (url.includes('/profiles')) return json(single ? me : [me])
    if (url.includes('/client_requests')) return json(requests)
    if (url.includes('/schedules')) return json(schedules)
    if (url.includes('/vehicles')) return json(vehicles)
    if (url.includes('/holidays')) return json(holidays)
    if (url.includes('/clients')) return json(single ? clients[0] : clients)
    if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
    return json([])
  })
}
async function open(ctx, path, me = admin, wait = 2600) {
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: me.id, aud: 'authenticated', email: me.email, app_metadata: {}, user_metadata: {} }])
  await p.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(wait)
  return p
}

// ── ① 오늘 일정에서 열린다 · 기사에게는 안 보인다 ───────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1400 } })
  wire(ctx)
  const p = await open(ctx, '/today')
  ok((await p.locator('[data-book-open]').count()) === 1, '**오늘 일정에 「다른 날 방문 잡기」가 있음**')
  await p.locator('[data-book-open]').dispatchEvent('click')
  await p.waitForTimeout(700)
  ok((await p.locator('[data-book-modal]').count()) === 1, '눌러서 창이 열림')
  ok(/수거량·금액은 현장에서/.test(await text(p.locator('[data-book-modal]'))),
    '여기서는 금액을 안 다룬다고 적혀 있음')
  await ctx.close()
}
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1400 } })
  wire(ctx, field)
  const p = await open(ctx, '/today', field)
  ok((await p.locator('[data-book-open]').count()) === 0,
    '**기사 화면에는 안 보임** (남의 일정을 만드는 자리가 아닙니다)')
  await ctx.close()
}

// ── ② 그 거래처가 하는 구분만 · 지난 날짜는 못 고름 ─────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1600 } })
  wire(ctx)
  const p = await open(ctx, `/clients/${CA}`)
  ok((await p.locator('[data-book-open]').count()) === 1, '**거래처 화면에도 「방문 잡기」가 있음**')
  await p.locator('[data-book-open]').dispatchEvent('click')
  await p.waitForTimeout(700)

  ok((await p.locator('[data-book-kind="의료폐기물"]').count()) === 1, '의료폐기물은 있음')
  ok((await p.locator('[data-book-kind="일회용기저귀"]').count()) === 0,
    '**기저귀를 안 받는 병원에는 기저귀가 아예 안 나옴**')

  const min = await p.locator('[data-book-date]').getAttribute('min')
  const max = await p.locator('[data-book-date]').getAttribute('max')
  ok(min === TODAY, '**달력이 오늘 이전을 못 고르게 함**', `min=${min}`)
  ok(max === day(180), '반년 앞까지만', `max=${max}`)

  //  차량 — 의료폐기물 차만 나와야 합니다.
  const vopts = await p.locator('[data-book-vehicle] option').allTextContents()
  ok(vopts.some((t) => /5506호/.test(t)), '의료폐기물 차량이 나옴', vopts.join(','))
  ok(!vopts.some((t) => /7788호/.test(t)), '**기저귀 차량은 안 나옴**', vopts.join(','))
  await ctx.close()
}

// ── ③ 휴무일은 막지 않고 알려만 준다 ────────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1600 } })
  wire(ctx)
  const p = await open(ctx, `/clients/${CA}`)
  await p.locator('[data-book-open]').dispatchEvent('click')
  await p.waitForTimeout(700)
  await p.locator('[data-book-date]').fill(day(5))
  await p.waitForTimeout(500)
  const h = await text(p.locator('[data-book-holiday]'))
  ok(/테스트 공휴일/.test(h), '**휴무일이라고 알려 줌**', h.slice(0, 60))
  ok(/그대로 잡으시면 됩니다/.test(h), '**그래도 잡을 수 있다고 적음** (막으면 넣을 방법이 없어집니다)')
  ok(!(await p.locator('[data-book-submit]').isDisabled()), '단추가 잠기지 않음')
  await ctx.close()
}

// ── ④ 보내는 값 · 서버가 거절하면 그 말 그대로 ──────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1600 } })
  wire(ctx)
  const p = await open(ctx, `/clients/${CA}`)
  await p.locator('[data-book-open]').dispatchEvent('click')
  await p.waitForTimeout(700)
  await p.locator('[data-book-date]').fill(day(9))
  await p.locator('[data-book-memo]').fill('3층 처치실 앞')
  await p.waitForTimeout(300)

  //  서버가 거절하는 경우
  bookError = '가나요양병원의 09월 01일 의료폐기물 방문은 이미 잡혀 있습니다.'
  lastBook = null
  await p.locator('[data-book-submit]').dispatchEvent('click')
  await p.waitForTimeout(900)
  ok(lastBook?.p_client_id === CA && lastBook?.p_date === day(9),
    '고른 값이 그대로 서버로 감', `${lastBook?.p_date}`)
  ok(lastBook?.p_memo === '3층 처치실 앞', '메모도 그대로', `${lastBook?.p_memo}`)
  ok(lastBook?.p_waste_type === '의료폐기물', '구분도 그대로')
  const e = await text(p.locator('[data-book-error]'))
  ok(/이미 잡혀 있습니다/.test(e), '**서버가 거절한 이유를 그대로 보여 줌**', e.slice(0, 60))
  ok(!/저장에 실패/.test(e), '「저장에 실패했습니다」로 뭉개지 않음')
  ok((await p.locator('[data-book-modal]').count()) === 1, '거절되면 창이 안 닫힘 (고칠 수 있게)')

  //  성공하면 닫힙니다
  bookError = null
  await p.locator('[data-book-submit]').dispatchEvent('click')
  //  ⚠ 고정 대기(1200ms)로 두면 **검사기가 바쁠 때만** 빨간 줄이 납니다.
  //     제품은 멀쩡한데 회귀가 실패하는 가짜 결함이라, 「닫힐 때까지」 기다립니다.
  let closed = false
  try {
    await p.waitForFunction(
      () => document.querySelectorAll('[data-book-modal]').length === 0,
      null, { timeout: 15000 })
    closed = true
  } catch { closed = false }
  ok(closed, '성공하면 창이 닫힘')
  await ctx.close()
}

// ── ⑤ 요청 화면 — 수거 요청에만 「날짜 잡기」 ───────────────────────────────
if (!skipIfHidden('requests', '⑤ 요청 화면의 「날짜 잡기」')) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1800 } })
  wire(ctx)
  const p = await open(ctx, '/requests')
  ok((await p.locator('[data-book-req="q1"]').count()) === 1, '**긴급수거 요청에 「날짜 잡기」가 붙음**')
  ok((await p.locator('[data-book-req="q3"]').count()) === 1, '추가수거 요청에도 붙음')
  ok((await p.locator('[data-book-req="q4"]').count()) === 0,
    '**소모품 요청에는 안 붙음** (엉뚱한 방문이 잡힙니다)')

  //  병원이 적어 낸 희망일이 그대로 열려야 합니다.
  await p.locator('[data-book-req="q1"]').dispatchEvent('click')
  await p.waitForTimeout(800)
  const d = await p.locator('[data-book-date]').inputValue()
  ok(d === day(3), '**병원이 적어 낸 희망일로 열림**', d)
  const memo = await p.locator('[data-book-memo]').inputValue()
  ok(/보관실이 가득 찼습니다/.test(memo), '요청 내용이 기사님 메모로 넘어감', memo.slice(0, 40))

  lastBook = null
  bookError = null
  await p.locator('[data-book-submit]').dispatchEvent('click')
  await p.waitForTimeout(1000)
  ok(lastBook?.p_request_id === 'q1',
    '**요청 id 가 함께 감** (그래야 요청이 「일정 반영」으로 넘어갑니다)', `${lastBook?.p_request_id}`)
  await ctx.close()
}

// ── ⑥ 긴급 신호 ────────────────────────────────────────────────────────────
if (!skipIfHidden('requests', '⑥ 급한 요청이 반복되는 곳 알림')) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1800 } })
  wire(ctx)
  const p = await open(ctx, '/today')
  const banner = p.locator('[data-urgent-banner]')
  ok((await banner.count()) === 1, '**긴급이 반복되는데 앞이 빈 곳을 띄움**')
  const t = await text(banner)
  ok(/가나요양병원/.test(t), '어느 병원인지', t.slice(0, 60))
  ok(/급한 요청 3건/.test(t) && /간격 7일/.test(t) && /잡힌 방문 없음/.test(t),
    '**근거를 사실로 적음** (요청 건수 · 실제 간격 · 앞이 비었음)', t.slice(0, 140))
  ok(/시스템이 바꾸지 않습니다/.test(t),
    '**주기를 시스템이 바꾸지 않는다고 못 박음** (계약입니다)')
  ok(!/점수|등급|불량|미흡/.test(t), '사람을 평가하는 말이 없음')
  ok((await p.locator('[data-urgent-book="' + CA + '"]').count()) === 1,
    '그 자리에서 방문을 잡을 수 있음')

  //  거래처 화면에도 같은 근거가 있어야 합니다.
  const p2 = await open(ctx, `/clients/${CA}`)
  const c = await text(p2.locator(`[data-urgent-client="${CA}"]`))
  ok(c.length > 0, '거래처 화면에도 뜸')
  ok(/급한 요청 3건/.test(c), '같은 근거를 같은 말로 적음', c.slice(0, 90))
  await ctx.close()
}

// ── ⑦ 지금 손댈 곳이 없으면 아무것도 안 그린다 ──────────────────────────────
//
//   매일 같은 줄이 떠 있으면 사람은 곧 그것을 안 봅니다.
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1400 } })
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
    if (url.includes('/profiles')) return json(single ? admin : [admin])
    if (url.includes('/client_requests')) return json(requests)
    //  가나요양병원에 **사흘 뒤 방문이 잡혀 있습니다** — 지금 할 일이 없습니다.
    if (url.includes('/schedules')) return json([...schedules, sched('soon', CA, day(3), '예정')])
    if (url.includes('/vehicles')) return json(vehicles)
    if (url.includes('/holidays')) return json(holidays)
    if (url.includes('/clients')) return json(single ? clients[0] : clients)
    if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
    return json([])
  })
  const p = await open(ctx, '/today')
  ok((await p.locator('[data-urgent-banner]').count()) === 0,
    '**다음 방문이 제때 잡혀 있으면 띠를 안 그림**')

  //  거래처 화면에는 남되 어조가 다릅니다 — 그 병원을 보고 있는 사람에게는
  //  「급한 요청이 세 번 있었다」가 그 자체로 알아야 할 사실입니다.
  if (!skipIfHidden('requests', '⑦ 거래처 화면의 급한 요청 근거')) {
    const p2 = await open(ctx, `/clients/${CA}`)
    const c = await text(p2.locator(`[data-urgent-client="${CA}"]`))
    ok(/다음 방문은 잡혀 있습니다/.test(c), '거래처 화면에는 사실로 남김', c.slice(0, 70))
    ok((await p2.locator(`[data-urgent-book="${CA}"]`).count()) === 0, '재촉하는 단추는 없음')
  }
  await ctx.close()
}

// ── ⑧ 예약된 방문이 오늘 일정에서 갈라 보인다 ───────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1600 } })
  wire(ctx)
  const p = await open(ctx, '/today')
  ok((await p.locator('[data-booked="today2"]').count()) === 1,
    '**사람이 잡은 방문에 「예약」 표시**')
  ok((await p.locator('[data-booked="today1"]').count()) === 0,
    '자동으로 생긴 예정에는 안 붙음')
  ok(/3층 처치실 앞/.test(flat(await p.textContent('body'))), '메모가 기사님 화면에 그대로 보임')
  await ctx.close()
}

// ── ⑨ 폰에서 창이 쓸 만한가 ─────────────────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
  wire(ctx)
  const p = await open(ctx, `/clients/${CA}`)
  await p.locator('[data-book-open]').dispatchEvent('click')
  await p.waitForTimeout(800)
  const box = await p.locator('[data-book-modal]').boundingBox()
  ok(box != null && box.width <= 390, '창이 화면을 안 넘김', `${Math.round(box?.width ?? 0)}px`)
  const dateBox = await p.locator('[data-book-date]').boundingBox()
  ok(dateBox != null && dateBox.width > 150, '**날짜 칸이 손가락으로 누를 만큼 넓음**',
    `${Math.round(dateBox?.width ?? 0)}px`)
  const btn = await p.locator('[data-book-submit]').boundingBox()
  ok(btn != null && btn.height >= 40, '단추가 충분히 큼', `${Math.round(btn?.height ?? 0)}px`)
  const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  ok(over <= 1, '가로로 밀리지 않음', `${over}px`)
  await ctx.close()
}

await b.close()
console.log('')
console.log(`총 ${out.length}건 · 실패 ${out.filter((v) => !v).length}건`)
