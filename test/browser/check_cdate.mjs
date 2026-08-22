import { chromium, EXEC } from './_pw.mjs'

//  다녀온 날을 화면에서 고를 수 있는가 (0061).
//
//   직접 입력이 **무조건 오늘 날짜로** 저장되고 있었습니다. 저녁이나 다음 날
//   아침에 넣으면 하루가 밀리고, **월말에는 하루치가 다음 달 매출**이 됩니다.
//
//   ① 직접 입력에는 「다녀온 날」 칸이 있고 기본이 오늘
//   ② 오늘이 아니면 **눈에 띄게** 알려 준다
//   ③ 달력이 미래·45일 너머를 못 고르게 한다
//   ④ 고른 날짜가 그대로 서버로 간다
//   ⑤ **예정을 눌러 완료할 때는 칸이 없다** (그 일정의 날짜를 씁니다)

const BASE = 'http://localhost:4173'
const UID = '00000000-0000-0000-0000-0000000000fd'
const CA = '00000000-0000-0000-0000-0000000000c1'

const TODAY = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
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
const text = async (loc) => ((await loc.count()) ? flat(await loc.first().textContent()) : '')

const me = {
  id: UID, email: 'f@b.c', name: '김준기', role: 'field', font_scale: 'normal', active: true,
  //  ⚠ 0067 부터 **현장은 차량을 고르지 않습니다.** 계정에 묶인 차로 저장되고,
  //     안 묶여 있으면 저장이 잠깁니다. 그래서 이 fixture 도 실제 파일럿과
  //     같게 **차량이 묶인 계정**으로 둡니다. null 로 두면 여기서 재는 것
  //     (다녀온 날이 그대로 서버로 가는가)이 차량 때문에 막혀 버립니다.
  approved_at: '2026-01-01T00:00:00Z', client_id: null, vehicle_id: 'v1', created_at: '2026-01-01T00:00:00Z',
}
const clients = [{
  id: CA, name: '가나요양병원', type: '병원', address: '경기도 남양주시', manager: '홍길동',
  phone: '031-000-0000', collection_cycle: '주 1회',
  collects_medical_waste: true, collects_diaper: false, storage_size: '보통',
  note: '', is_demo_generated: false, demo_session_id: null, active: true,
  contract_start: '2025-01-01', contract_end: null, payment_terms: '', payment_due_day: 20,
  pricing: {}, biz_no: '', vat_mode: 'inclusive', education_at: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}]
const vehicles = [{ id: 'v1', name: '5506호', waste_type: '의료폐기물', tonnage: 1,
  nominal_capacity: 1000, expected_capacity: 660, driver: '오대성', active: true }]
const schedules = [{
  id: 's1', date: TODAY, client_id: CA, waste_type: '의료폐기물', vehicle_id: 'v1',
  scheduled_time: '09:00', status: '예정', expected_amount: 100, actual_amount: null,
  actual_time: null, driver_name: null, completed_at: null, memo: '', origin: 'system',
  is_additional: false, demo_session_id: null, plan_batch: null, booked_at: null,
  canceled_at: null, cancel_reason: '', containers: null, created_at: '', updated_at: '',
}]

let lastPayload = null
const b = await chromium.launch({ executablePath: EXEC })

function wire(ctx) {
  ctx.route('**/auth/v1/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: UID, aud: 'authenticated', email: 'f@b.c', app_metadata: {}, user_metadata: {} }) }))
  ctx.route('**/rest/v1/**', (r) => {
    const url = r.request().url()
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    if (url.includes('/rpc/app_schema_version')) return json(64)
    if (url.includes('/rpc/app_health_check')) return json({ version: 64, ok: true, missing: [], checkedAt: '' })
    if (url.includes('/rpc/complete_collection')) {
      lastPayload = JSON.parse(r.request().postData() ?? '{}')
      return json({ eventId: 'e1', scheduleId: 's9', createdSchedule: true, materialIds: [], requestUpdates: [] })
    }
    if (url.includes('/rpc/')) return json(null)
    if (url.includes('/profiles')) return json(single ? me : [me])
    if (url.includes('/schedules')) return json(schedules)
    if (url.includes('/vehicles')) return json(vehicles)
    if (url.includes('/clients')) return json(single ? clients[0] : clients)
    if (url.includes('/office_stock')) return json(single ? { id: 1, corrugated_box: 500, plastic_container: 500, bag: 500, needle_box: 500 } : [{ id: 1 }])
    return json([])
  })
}
async function open(ctx, path) {
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: UID, aud: 'authenticated', email: 'f@b.c', app_metadata: {}, user_metadata: {} }])
  await p.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(2600)
  return p
}

// ── ① 직접 입력에 「다녀온 날」 ─────────────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 2000 } })
  wire(ctx)
  const p = await open(ctx, '/collection')
  //  거래처를 직접 고르는 길 (예정을 안 누름)
  await p.locator('select').first().selectOption(CA).catch(() => {})
  await p.waitForTimeout(700)

  const f = p.locator('[data-visit-date]')
  ok((await f.count()) === 1, '**직접 입력에 「다녀온 날」 칸이 있음**')
  ok((await f.inputValue()) === TODAY, '기본은 오늘', await f.inputValue())
  ok((await f.getAttribute('max')) === TODAY,
    '**미래는 못 고름** (아직 안 간 날을 다녀왔다고 할 수 없습니다)')
  ok((await f.getAttribute('min')) === day(-45), '45일 앞까지만', await f.getAttribute('min'))
  ok((await p.locator('[data-visit-past]').count()) === 0, '오늘이면 안내가 없음')
  await ctx.close()
}

// ── ② 오늘이 아니면 눈에 띄게 ───────────────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 2000 } })
  wire(ctx)
  const p = await open(ctx, '/collection')
  await p.locator('select').first().selectOption(CA).catch(() => {})
  await p.waitForTimeout(700)
  await p.locator('[data-visit-date]').fill(day(-2))
  await p.waitForTimeout(500)

  const w = await text(p.locator('[data-visit-past]'))
  ok(w.length > 0, '**오늘이 아니면 안내가 뜸**')
  ok(/그 달 실적·청구에 그 날짜로/.test(w),
    '무엇에 영향을 주는지 적힘 (실적·청구)', w.slice(0, 70))
  await ctx.close()
}

// ── ③ 고른 날짜가 그대로 서버로 ─────────────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 2200 } })
  wire(ctx)
  const p = await open(ctx, '/collection')
  await p.locator('select').first().selectOption(CA).catch(() => {})
  await p.waitForTimeout(700)
  await p.locator('[data-visit-date]').fill(day(-3))
  await p.locator('#collection-amount').fill('120')
  await p.waitForTimeout(400)

  //  0067 — 차량은 계정에 묶인 것이 자동으로 들어갑니다. 고를 칸이 없습니다.
  ok((await p.locator('[data-vehicle-auto]').count()) === 1, '차량이 자동으로 들어감 (고를 칸 없음)')
  await p.waitForTimeout(300)

  lastPayload = null
  const save = p.locator('[data-tour="collect-save"]')
  ok(!(await save.isDisabled()), '필수 칸을 채우면 저장 단추가 열림')
  await save.dispatchEvent('click')
  await p.waitForTimeout(1500)
  //  자릿수 확인 창이 뜰 수 있습니다 — 뜨면 그대로 진행합니다.
  if (lastPayload == null) {
    const go = p.getByRole('button', { name: /맞습니다|그대로 저장|저장/ }).last()
    if (await go.count()) {
      await go.dispatchEvent('click')
      await p.waitForTimeout(1400)
    }
  }
  ok(lastPayload != null, '저장을 눌러 서버로 감')
  ok(lastPayload?.p?.date === day(-3),
    '**고른 날짜가 그대로 서버로 감**', `${lastPayload?.p?.date}`)
  ok(lastPayload?.p?.actualAmount === 120, '수거량도 그대로', `${lastPayload?.p?.actualAmount}`)
  await ctx.close()
}

// ── ④ 예정을 눌러 완료할 때는 칸이 없다 ────────────────────────────────────
//
//   그 길은 원래 일정의 날짜를 씁니다. 칸을 띄우면 「어느 쪽이 이기나」를
//   사람이 헷갈립니다.
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 2000 } })
  wire(ctx)
  const p = await open(ctx, '/collection?schedule=s1')
  await p.waitForTimeout(900)
  ok((await p.locator('[data-visit-date]').count()) === 0,
    '**예정을 눌러 완료할 때는 날짜 칸이 없음** (그 일정의 날짜를 씁니다)')
  await ctx.close()
}

// ── ⑤ 폰에서 쓸 만한가 ──────────────────────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
  wire(ctx)
  const p = await open(ctx, '/collection')
  await p.locator('select').first().selectOption(CA).catch(() => {})
  await p.waitForTimeout(700)
  //  ⚠ 0065 부터 폰에서는 「다녀온 날 · 시간」이 접혀 있습니다. 접힌 것을
  //     재면 0px 이고, 그 0 은 「칸이 좁아졌다」로 읽힙니다. 먼저 폅니다.
  const foldTime = p.locator('[data-fold="time"]')
  if (await foldTime.count()) { await foldTime.dispatchEvent('click'); await p.waitForTimeout(400) }
  const box = await p.locator('[data-visit-date]').boundingBox()
  ok(box != null && box.width > 150, '날짜 칸이 손가락으로 누를 만큼 넓음', `${Math.round(box?.width ?? 0)}px`)
  const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  ok(over <= 1, '가로로 밀리지 않음', `${over}px`)
  await ctx.close()
}

await b.close()
console.log('')
console.log(`총 ${out.length}건 · 실패 ${out.filter((v) => !v).length}건`)
