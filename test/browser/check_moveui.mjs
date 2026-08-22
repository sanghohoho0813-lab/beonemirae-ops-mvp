import { chromium, EXEC } from './_pw.mjs'

//  옮기기·무르기가 화면에서 실제로 되는가 (0059).
//
//   ① 아직 안 간 방문에만 단추가 붙는가 — **완료된 수거에는 안 붙는가**
//   ② 기사에게는 안 보이는가
//   ③ 옮기기 — 달력이 지난 날짜를 못 고르게 하고, 고른 값이 그대로 서버로
//   ④ 무르기 — **이유 없이는 단추가 안 눌리고**, 지우지 않는다고 적혀 있는가
//   ⑤ 서버가 거절하면 그 말을 그대로 보여 주는가
//   ⑥ 무른 방문은 오늘 일정에 아예 안 나오는가

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

const row = (id, over = {}) => ({
  id, date: TODAY, client_id: CA, waste_type: '의료폐기물', vehicle_id: 'v1',
  scheduled_time: '09:00', status: '예정', expected_amount: 100, actual_amount: null,
  actual_time: null, driver_name: null, completed_at: null, memo: '', origin: 'system',
  is_additional: false, demo_session_id: null, plan_batch: null, booked_at: null,
  canceled_at: null, cancel_reason: '', created_at: '', updated_at: '', ...over,
})
//  오늘 세 건 — 아직 안 간 것 · 이미 다녀온 것 · **무른 것**
const schedules = [
  row('pending'),
  row('done', { id: 'done', status: '완료', actual_amount: 120, completed_at: `${TODAY}T10:00:00Z`,
                actual_time: '10:00', driver_name: '김준기', scheduled_time: '11:00' }),
  row('canceled', { id: 'canceled', scheduled_time: '13:00',
                    canceled_at: `${TODAY}T01:00:00Z`, cancel_reason: '병원 휴진' }),
]

const holidays = [{ id: 'h1', day: day(4), name: '테스트 공휴일', kind: '공휴일', created_at: '' }]

let lastCall = null
let rpcError = null

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
    if (url.includes('/rpc/move_visit') || url.includes('/rpc/cancel_visit')) {
      lastCall = { fn: url.includes('move_visit') ? 'move' : 'cancel',
                   args: JSON.parse(r.request().postData() ?? '{}') }
      if (rpcError) {
        return r.fulfill({ status: 400, contentType: 'application/json',
          body: JSON.stringify({ message: rpcError }) })
      }
      return json({ id: 'x' })
    }
    if (url.includes('/rpc/')) return json(null)
    if (url.includes('/profiles')) return json(single ? me : [me])
    if (url.includes('/schedules')) return json(schedules)
    if (url.includes('/vehicles')) return json(vehicles)
    if (url.includes('/holidays')) return json(holidays)
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

// ── ① 어디에 단추가 붙는가 ──────────────────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1600 } })
  wire(ctx)
  const p = await open(ctx, '/today')

  ok((await p.locator('[data-move-open="pending"]').count()) === 1,
    '**아직 안 간 방문에 「날짜 옮기기 · 무르기」가 붙음**')
  ok((await p.locator('[data-move-open="done"]').count()) === 0,
    '**이미 다녀온 수거에는 안 붙음** (정산·청구로 이어지는 기록입니다)')

  //  ⑥ 무른 방문은 아예 안 나옵니다.
  ok((await p.locator('[data-move-open="canceled"]').count()) === 0,
    '**무른 방문은 오늘 일정에 아예 없음**')
  const body = flat(await p.textContent('body'))
  ok(!/13:00/.test(body), '무른 방문의 시각도 화면에 없음')
  await ctx.close()
}

// ── ② 기사는 못 옮기고, 의견만 낸다 (0062) ─────────────────────────────────
//
//  예전에는 기사 화면에서 이 단추 자체를 안 그렸습니다. 그런데 그러면
//  「이 날짜보다 화요일이 낫습니다」를 전할 길이 전화밖에 없습니다.
//  이제는 단추가 보이되, 열면 **「의견 내기」 하나뿐**입니다 —
//  옮기기·고치기·무르기 탭은 그리지 않습니다. 서버도 막습니다.
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
  wire(ctx, field)
  const p = await open(ctx, '/today', field)
  const btn = p.locator('[data-move-open]').first()
  ok((await btn.count()) > 0, '기사에게도 단추가 있음 (의견을 낼 길)')
  const label = ((await btn.textContent()) ?? '').replace(/\s+/g, ' ').trim()
  ok(/의견 내기/.test(label), '문구가 「이 일정에 의견 내기」', label)

  await btn.dispatchEvent('click')
  await p.waitForTimeout(600)
  const tabs = await p.locator('[data-move-tab]').evaluateAll((els) =>
    els.map((e) => e.getAttribute('data-move-tab')))
  ok(tabs.length === 1 && tabs[0] === 'say',
    '**기사에게는 옮기기·고치기·무르기가 아예 없음**', tabs.join(' · '))
  ok((await p.locator('[data-visit-say]').count()) > 0, '의견 적는 칸이 보임')
  await ctx.close()
}

// ── ③ 옮기기 ────────────────────────────────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1600 } })
  wire(ctx)
  const p = await open(ctx, '/today')
  await p.locator('[data-move-open="pending"]').dispatchEvent('click')
  await p.waitForTimeout(700)
  ok((await p.locator('[data-move-modal]').count()) === 1, '창이 열림')

  const min = await p.locator('[data-move-date]').getAttribute('min')
  ok(min === TODAY, '**달력이 오늘 이전을 못 고르게 함**', `min=${min}`)
  ok((await p.locator('[data-move-date]').getAttribute('max')) === day(180), '반년 앞까지만')

  //  안 바꾸면 단추가 안 눌립니다 — 아무 일도 안 하는 저장을 막습니다.
  ok(await p.locator('[data-move-submit]').isDisabled(), '날짜를 안 바꾸면 단추가 잠김')

  await p.locator('[data-move-date]').fill(day(4))
  await p.waitForTimeout(500)
  const hol = await text(p.locator('[data-move-holiday]'))
  ok(/테스트 공휴일/.test(hol), '휴무일이면 알려 줌', hol.slice(0, 50))
  ok(!(await p.locator('[data-move-submit]').isDisabled()),
    '**휴무일이어도 막지 않음** (병원과 한 약속이면 갑니다)')

  lastCall = null
  rpcError = null
  await p.locator('[data-move-submit]').dispatchEvent('click')
  await p.waitForTimeout(900)
  ok(lastCall?.fn === 'move', '옮기기를 부름', `${lastCall?.fn}`)
  ok(lastCall?.args?.p_schedule_id === 'pending' && lastCall?.args?.p_date === day(4),
    '**고른 값이 그대로 서버로 감**', `${lastCall?.args?.p_date}`)
  await ctx.close()
}

// ── ④ 무르기 ────────────────────────────────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1600 } })
  wire(ctx)
  const p = await open(ctx, '/today')
  await p.locator('[data-move-open="pending"]').dispatchEvent('click')
  await p.waitForTimeout(700)
  await p.locator('[data-move-tab="cancel"]').dispatchEvent('click')
  await p.waitForTimeout(400)

  ok(await p.locator('[data-move-submit]').isDisabled(),
    '**이유를 안 적으면 단추가 안 눌림** (「왜 안 갔나」에 답할 근거)')
  const keep = await text(p.locator('[data-move-keep]'))
  ok(/지우지 않고 남깁니다/.test(keep), '**지우지 않는다고 화면에 적혀 있음**', keep.slice(0, 60))
  ok(/오늘 일정·배차·미수거에서 빠집니다/.test(keep), '무르면 어디서 빠지는지도 적힘')

  await p.locator('[data-move-reason]').fill('병원 요청으로 다음 주로 미룸')
  await p.waitForTimeout(300)
  ok(!(await p.locator('[data-move-submit]').isDisabled()), '이유를 적으면 눌림')

  lastCall = null
  await p.locator('[data-move-submit]').dispatchEvent('click')
  await p.waitForTimeout(900)
  ok(lastCall?.fn === 'cancel', '무르기를 부름')
  ok(lastCall?.args?.p_reason === '병원 요청으로 다음 주로 미룸',
    '**이유가 그대로 서버로 감**', `${lastCall?.args?.p_reason}`)
  await ctx.close()
}

// ── ⑤ 서버가 거절하면 그 말 그대로 ──────────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1600 } })
  wire(ctx)
  const p = await open(ctx, '/today')
  await p.locator('[data-move-open="pending"]').dispatchEvent('click')
  await p.waitForTimeout(700)
  await p.locator('[data-move-date]').fill(day(6))
  await p.waitForTimeout(400)

  rpcError = '가나요양병원의 08월 23일 의료폐기물 방문이 그날 이미 있습니다. 다른 날짜를 골라 주세요.'
  await p.locator('[data-move-submit]').dispatchEvent('click')
  await p.waitForTimeout(900)
  const e = await text(p.locator('[data-move-error]'))
  ok(/그날 이미 있습니다/.test(e), '**서버가 거절한 이유를 그대로 보여 줌**', e.slice(0, 60))
  ok(!/처리하지 못했습니다/.test(e), '「처리하지 못했습니다」로 뭉개지 않음')
  ok((await p.locator('[data-move-modal]').count()) === 1, '거절되면 창이 안 닫힘 (고칠 수 있게)')

  rpcError = null
  await p.locator('[data-move-submit]').dispatchEvent('click')
  await p.waitForTimeout(1000)
  ok((await p.locator('[data-move-modal]').count()) === 0, '되면 창이 닫힘')
  await ctx.close()
}

// ── ⑥ 폰에서 쓸 만한가 ──────────────────────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
  wire(ctx)
  const p = await open(ctx, '/today')
  await p.locator('[data-move-open="pending"]').dispatchEvent('click')
  await p.waitForTimeout(800)
  const box = await p.locator('[data-move-modal]').boundingBox()
  ok(box != null && box.width <= 390, '창이 화면을 안 넘김', `${Math.round(box?.width ?? 0)}px`)
  const tab = await p.locator('[data-move-tab="cancel"]').boundingBox()
  ok(tab != null && tab.height >= 40, '탭이 손가락으로 누를 만큼 큼', `${Math.round(tab?.height ?? 0)}px`)
  const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  ok(over <= 1, '가로로 밀리지 않음', `${over}px`)
  await ctx.close()
}

await b.close()
console.log('')
console.log(`총 ${out.length}건 · 실패 ${out.filter((v) => !v).length}건`)
