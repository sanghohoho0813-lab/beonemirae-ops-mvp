import { chromium, EXEC } from './_pw.mjs'
import { readFileSync } from 'node:fs'

//  0128 — **직원을 차량에 고정하지 않습니다.** 수거할 때 그날 탄 차를 고릅니다.
//
//   이사님 말씀: 「직원별로 차를 정해둘 필요 없어요. 수거할 때 오늘 타고 간
//   차만 고르면 됩니다.」
//
//   그전에는 계정에 묶인 차(profiles.vehicle_id)가 기본값이었고, 기저귀 차가
//   묶인 분이 의료폐기물을 수거하면 화면이 저장을 막았습니다. 이제 수거 입력은
//   그 칸을 **읽지 않습니다** (칸은 DB 에 그대로 둡니다).
//
//   대표님이 정해 주신 시나리오 A~G 를 그대로 봅니다:
//    A. 담당 차량 없음        → 골라서 정상 저장
//    B. 옛 담당 차량이 남아 있음(기저귀 차) → 무시하고 실제 차를 골라 저장
//    C. 일정 차량 1호차       → 기본값 1호차 → 2호차로 바꿔 저장 → 기록은 2호차
//    D. 의료폐기물 수거       → 기저귀 차·운행중지 차는 목록에 없음
//    E. 저장해도 profiles.vehicle_id 는 그대로 (자동으로 다시 묶이지 않음)
//    F. 다음 수거에 들어가면 지난번 고른 차가 따라오지 않음
//    G. 390px 에서 차량 → 병원 → 수거량 → 자재 → 저장까지 밀림 없이 진행
//
//   ⚠ 여기서 낮추면 안 되는 것: **저장되는 vehicle_id 가 이번에 고른 차인가**와
//     **계정 차량이 조용히 바뀌지 않는가**. 그 둘이 이번 변경의 전부입니다.

const BASE = 'http://localhost:4173'
const ADM = '00000000-0000-0000-0000-0000000000ad'
const DRV = '00000000-0000-0000-0000-0000000000d1'
const CA = '00000000-0000-0000-0000-0000000000c1'
const VA = '00000000-0000-0000-0000-0000000000v1' // 1호차 · 의료폐기물
const VB = '00000000-0000-0000-0000-0000000000v2' // 2호차 · 의료폐기물
const VD = '00000000-0000-0000-0000-0000000000v3' // 5호차 · 일회용기저귀 — 목록에 없어야 함
const VX = '00000000-0000-0000-0000-0000000000v4' // 9호차 · 운행중지 — 목록에 없어야 함
const T = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })

let pass = 0
let fail = 0
const ok = (name, cond, detail = '') => {
  if (cond) pass += 1
  else fail += 1
  console.log(`${cond ? ' OK ' : 'FAIL'} | ${name}${detail && !cond ? ` — ${detail}` : ''}`)
}
const flat = (s) => (s ?? '').replace(/\s+/g, ' ').trim()

const clients = [{
  id: CA, name: '오남한양병원', type: '병원', address: '경기도 남양주시 오남읍 1', manager: '원무과',
  phone: '031-000-0000', collection_cycle: '주 2회', collects_medical_waste: true, collects_diaper: true,
  storage_size: '보통', note: '', is_demo_generated: false, demo_session_id: null, active: true,
  contract_start: '2025-01-01', contract_end: null, payment_terms: '', payment_due_day: 20,
  pricing: { plastic20: { sale: 9000, cost: 5200 } }, biz_no: '2568802759', vat_mode: 'exclusive',
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}]
const veh = (id, name, waste_type, active, driver) => ({
  id, name, waste_type, tonnage: 1, nominal_capacity: 1000, expected_capacity: 660, driver, active,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
})
const vehicles = [
  veh(VA, '1호차', '의료폐기물', true, '백광호'),
  veh(VB, '2호차', '의료폐기물', true, '김진환'),
  veh(VD, '5호차(기저귀)', '일회용기저귀', true, '오대성'),
  veh(VX, '9호차(중지)', '의료폐기물', false, ''),
]
const prof = (id, name, role, vehicle_id) => ({
  id, email: `${id.slice(-2)}@b.c`, name, role, font_scale: 'normal', active: true,
  approved_at: '2026-01-01T00:00:00Z', client_id: null, vehicle_id, created_at: '2026-01-01T00:00:00Z',
})
const sched = (id, vehicle_id, time = '09:00') => ({
  id, client_id: CA, date: T, waste_type: '의료폐기물', scheduled_time: time, status: '예정',
  vehicle_id, expected_amount: 100, actual_amount: null, completed_at: null, memo: '', origin: 'system',
  is_additional: false, canceled_at: null, demo_session_id: null, handover_status: null, driver_name: '',
  created_at: `${T}T00:00:00Z`, updated_at: `${T}T00:00:00Z`,
})

const b = await chromium.launch({ executablePath: EXEC })

function wire(ctx, st) {
  ctx.route('**/auth/v1/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: st.me.id, aud: 'authenticated', email: st.me.email, app_metadata: {}, user_metadata: {} }) }))
  ctx.route('**/rest/v1/**', async (r) => {
    const url = r.request().url()
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    if (url.includes('/rpc/')) {
      const name = url.split('/rpc/')[1].split('?')[0]
      let body = null
      try { body = JSON.parse(r.request().postData() ?? 'null') } catch { /* 본문 없음 */ }
      if (name === 'app_schema_version') return json(123)
      if (name === 'app_health_check') return json({ version: 64, ok: true, missing: [], checkedAt: '' })
      if (name === 'recent_app_errors') return json({ days: 7, total: 0, groups: [], checkedAt: '' })
      st.calls.push({ name, body })
      if (name === 'set_profile_vehicle') {
        const row = st.roster.find((x) => x.id === body?.p_profile)
        if (row) row.vehicle_id = body?.p_vehicle ?? null
        return json({ profileId: body?.p_profile, vehicle: null })
      }
      if (name === 'complete_collection') {
        //  서버(0070 판)가 보는 것만 흉내 냅니다 — 차량이 있는가.
        const p = body?.p ?? {}
        const v = vehicles.find((x) => x.id === p.vehicleId)
        if (!v) return r.fulfill({ status: 400, contentType: 'application/json',
          body: JSON.stringify({ code: 'P0001', message: '배차 차량을 선택해 주세요.' }) })
        //  저장된 일정은 완료로 바뀝니다 — F 에서 「다음 수거」를 보려면 필요합니다.
        const s = st.schedules.find((x) => x.id === p.scheduleId)
        if (s) { s.status = '완료'; s.vehicle_id = p.vehicleId; s.actual_amount = p.actualAmount }
        return json({ eventId: `e${st.calls.length}`, scheduleId: p.scheduleId ?? 's9', createdSchedule: !p.scheduleId, materialIds: [], requestUpdates: [] })
      }
      return json(null)
    }
    if (url.includes('/profiles')) {
      const one = /id=eq\.([0-9a-f-]+)/.exec(url)?.[1]
      const rows = one ? st.roster.filter((x) => x.id === one) : st.roster
      return json(single ? (rows[0] ?? null) : rows)
    }
    if (url.includes('/vehicles')) return json(vehicles)
    if (url.includes('/schedules')) return json(st.schedules)
    if (url.includes('/clients')) return json(single ? clients[0] : clients)
    if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
    return json([])
  })
}
async function open(ctx, path, me) {
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => {
    window.localStorage.setItem(k, JSON.stringify({ access_token: 't', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u }))
    window.localStorage.setItem('beonemirae-ops:tour-seen', 'staff,field,client')
  }, ['beonemirae-ops:auth', { id: me.id, aud: 'authenticated', email: me.email, app_metadata: {}, user_metadata: {} }])
  p.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 200)))
  await p.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await p.waitForFunction(() => !/불러오는 중/.test(document.body?.innerText ?? ''), null, { timeout: 30000 }).catch(() => {})
  await p.waitForTimeout(1500)
  return p
}
const state = (me, schedules) => ({
  me,
  roster: [prof(ADM, '송현근', 'admin', null), me],
  schedules,
  calls: [],
})
const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
const options = (p) =>
  p.locator('[data-vehicle-select] option').evaluateAll((o) => o.map((x) => x.value).filter(Boolean))
const save = async (p, st) => {
  await p.locator('[data-tour="collect-save"]').dispatchEvent('click')
  await p.waitForTimeout(1500)
  return st.calls.filter((c) => c.name === 'complete_collection').pop()
}

// ── A. 담당 차량 없음 → 골라서 저장 ─────────────────────────────────────────
console.log('\n── A. 담당 차량 없는 직원 ──')
{
  const me = prof(DRV, '백광호', 'field', null)
  const st = state(me, [sched('s1', null)])
  const ctx = await b.newContext(phone)
  wire(ctx, st)
  const p = await open(ctx, '/collection?schedule=s1', me)
  ok('A 「오늘 운행 차량」 칸이 보임', (await p.locator('[data-field-vehicle]').count()) === 1)
  ok('A 처음에는 선택 안 됨', (await p.locator('[data-vehicle-select]').inputValue()) === '')
  ok('A 「사무실에 문의」로 막지 않음', !/사무실에 문의/.test(flat(await p.textContent('main'))))
  ok('A 고르기 전에는 저장 잠김', await p.locator('[data-tour="collect-save"]').isDisabled())
  await p.selectOption('[data-vehicle-select]', VA)
  await p.waitForTimeout(400)
  ok('A 고르면 저장 열림', !(await p.locator('[data-tour="collect-save"]').isDisabled()))
  const call = await save(p, st)
  ok('A **정상 저장 · vehicle_id = 고른 차(1호차)**', call?.body?.p?.vehicleId === VA, String(call?.body?.p?.vehicleId))
  ok('A 기사 이름은 로그인한 본인', call?.body?.p?.driverName === '백광호', String(call?.body?.p?.driverName))
  ok('A 저장 뒤 오류 없음', !/저장할 수 없|오류/.test(flat(await p.textContent('main'))))
  await ctx.close()
}

// ── B. 옛 담당 차량이 남아 있어도 무시 ──────────────────────────────────────
console.log('\n── B. 옛 담당 차량(기저귀 차)이 남아 있음 ──')
{
  //  예전 같으면 「담당 차량이 일회용기저귀 차량이라 저장할 수 없습니다」로 막혔습니다.
  const me = prof(DRV, '백광호', 'field', VD)
  const st = state(me, [sched('s1', null)])
  const ctx = await b.newContext(phone)
  wire(ctx, st)
  const p = await open(ctx, '/collection?schedule=s1', me)
  ok('B 옛 담당 차량이 기본값으로 들어오지 않음', (await p.locator('[data-vehicle-select]').inputValue()) === '')
  ok('B 화면에 기저귀 차 이름이 없음', !/5호차/.test(flat(await p.textContent('main'))))
  ok('B 막는 문구가 없음', !/저장할 수 없|사무실에 문의/.test(flat(await p.textContent('main'))))
  await p.selectOption('[data-vehicle-select]', VA)
  await p.waitForTimeout(400)
  const call = await save(p, st)
  ok('B **실제 차(1호차)로 정상 저장**', call?.body?.p?.vehicleId === VA, String(call?.body?.p?.vehicleId))
  ok('B 계정 차량을 고치지 않음', !st.calls.some((c) => c.name === 'set_profile_vehicle'))
  await ctx.close()

  //  ⚠ 서버 쪽도 코드로 확인합니다 — 마지막 판(PROPOSAL_0070)의 complete_collection.
  //    (1) 차량 필수 검사는 그대로, (2) 계정↔차량 묶임은 보지 않음,
  //    (3) 구분 일치도 보지 않음 → 그래서 구분은 **화면 목록**이 지킵니다(D).
  const sql = readFileSync(new URL('../../supabase/proposals/PROPOSAL_0070_ops_setup.sql', import.meta.url), 'utf8')
  const from = sql.search(/create or replace function public\.complete_collection/i)
  const rest = from >= 0 ? sql.slice(from) : ''
  const end = rest.search(/\n\$(function)?\$;?\s*\n/)
  const fn = end > 0 ? rest.slice(0, end) : ''
  ok('B 서버는 차량 필수 검사를 그대로 둠', /배차 차량을 선택해 주세요/.test(fn))
  ok('B 서버는 계정↔차량 묶임을 보지 않음 (막던 것은 화면이었음)',
    fn.length > 0 && !/profiles\.vehicle_id|v_actor\.vehicle_id|v_profile\.vehicle_id/.test(fn))
  ok('B 서버는 구분 일치도 보지 않음 → 화면 목록이 유일한 방어선',
    !/waste_type <> \(p->>'wasteType'\)/.test(fn) && /차량 구분으로 막지 않습니다/.test(fn))
}

// ── C. 일정 차량은 기본값일 뿐 — 바꿀 수 있다 ───────────────────────────────
console.log('\n── C. 일정 차량 1호차 → 2호차로 바꿈 ──')
{
  const me = prof(DRV, '백광호', 'field', null)
  const st = state(me, [sched('s1', VA)])
  const ctx = await b.newContext(phone)
  wire(ctx, st)
  const p = await open(ctx, '/collection?schedule=s1', me)
  ok('C 일정 배차가 기본값', (await p.locator('[data-vehicle-select]').inputValue()) === VA)
  ok('C 출처가 「일정 배차」로 표시됨',
    (await p.locator('[data-field-vehicle]').getAttribute('data-vehicle-source')) === 'schedule')
  const labels = await p.locator('[data-vehicle-select] option').evaluateAll((o) => o.map((x) => x.textContent))
  ok('C 목록에서 「(일정 배차)」를 알아볼 수 있음', labels.some((t) => /1호차 \(일정 배차\)/.test(t ?? '')), labels.join(' / '))
  ok('C 잠겨 있지 않음 (바꿀 수 있음)', !(await p.locator('[data-vehicle-select]').isDisabled()))
  await p.selectOption('[data-vehicle-select]', VB)
  await p.waitForTimeout(400)
  const call = await save(p, st)
  ok('C **저장된 vehicle_id = 2호차(직접 고른 차)** — 일정 차량으로 덮이지 않음',
    call?.body?.p?.vehicleId === VB, String(call?.body?.p?.vehicleId))
  await ctx.close()
}

// ── D. 고를 수 있는 차 = 이 구분 · 운행 중 ──────────────────────────────────
console.log('\n── D. 목록 제한 ──')
{
  const me = prof(DRV, '백광호', 'field', null)
  const st = state(me, [sched('s1', null)])
  const ctx = await b.newContext(phone)
  wire(ctx, st)
  const p = await open(ctx, '/collection?schedule=s1', me)
  const opts = await options(p)
  ok('D 의료폐기물 차량 2대만 보임', opts.sort().join() === [VA, VB].sort().join(), opts.join(','))
  ok('D 기저귀 차량(5호차)은 없음', !opts.includes(VD))
  ok('D 운행 중지 차량(9호차)도 없음', !opts.includes(VX))
  await ctx.close()
}

// ── E. 저장해도 계정 차량은 그대로 ──────────────────────────────────────────
console.log('\n── E. 저장 뒤 계정 차량 ──')
{
  const me = prof(DRV, '백광호', 'field', null)
  const st = state(me, [sched('s1', null)])
  const ctx = await b.newContext(phone)
  wire(ctx, st)
  const p = await open(ctx, '/collection?schedule=s1', me)
  await p.selectOption('[data-vehicle-select]', VB)
  await p.waitForTimeout(300)
  await save(p, st)
  ok('E **set_profile_vehicle 을 부르지 않음** (오늘 탄 차로 다시 묶이지 않음)',
    !st.calls.some((c) => c.name === 'set_profile_vehicle'),
    st.calls.map((c) => c.name).join(','))
  ok('E 계정의 vehicle_id 가 그대로 null', st.roster.find((x) => x.id === DRV)?.vehicle_id === null,
    String(st.roster.find((x) => x.id === DRV)?.vehicle_id))
  await ctx.close()
}

// ── F. 다음 수거에 지난 선택이 따라오지 않는다 ──────────────────────────────
console.log('\n── F. 다음 수거 ──')
{
  const me = prof(DRV, '백광호', 'field', null)
  const st = state(me, [sched('s1', null, '09:00'), sched('s2', null, '11:00')])
  const ctx = await b.newContext(phone)
  wire(ctx, st)
  const p = await open(ctx, '/collection?schedule=s1', me)
  await p.selectOption('[data-vehicle-select]', VB)
  await p.waitForTimeout(300)
  const first = await save(p, st)
  ok('F 첫 건은 2호차로 저장', first?.body?.p?.vehicleId === VB, String(first?.body?.p?.vehicleId))
  //  완료 화면에서 「다음 방문」으로 이어서 입력합니다 — 기사님의 실제 길입니다.
  const next = p.locator('[data-tour="collect-done"] button').first()
  if (await next.count()) { await next.dispatchEvent('click'); await p.waitForTimeout(800) }
  ok('F **다음 건은 다시 「차량 선택」** (지난번 차가 따라오지 않음)',
    (await p.locator('[data-vehicle-select]').inputValue()) === '',
    await p.locator('[data-vehicle-select]').inputValue())
  ok('F 저장도 다시 잠김 (고르기 전까지)', await p.locator('[data-tour="collect-save"]').isDisabled())
  await ctx.close()
}

// ── G. 390px — 차량 → 병원 → 수거량 → 자재 → 저장 ────────────────────────────
console.log('\n── G. 390px 흐름 ──')
{
  const me = prof(DRV, '백광호', 'field', null)
  const st = state(me, [sched('s1', VA)])
  const ctx = await b.newContext(phone)
  wire(ctx, st)
  const p = await open(ctx, '/collection?schedule=s1', me)
  const ofl = () => p.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth))
  ok('G 가로 밀림 0', (await ofl()) === 0, `${await ofl()}px`)
  const box = await p.locator('[data-vehicle-select]').boundingBox()
  ok('G 차량 칸이 화면 폭 안', !!box && box.x >= 0 && box.x + box.width <= 390, JSON.stringify(box))
  ok('G 차량 칸이 손가락으로 누를 높이 (≥44px)', (box?.height ?? 0) >= 44, `${Math.round(box?.height ?? 0)}px`)
  await p.selectOption('[data-vehicle-select]', VB)
  ok('G 병원이 채워져 있음', /오남한양병원/.test(flat(await p.locator('[data-collect-here]').textContent().catch(() => ''))))
  await p.fill('#collection-amount', '140')
  //  사용 자재 한 칸 — 접혀 있으면 펴서
  const more = p.locator('[data-supply-more]')
  if (await more.count()) { await more.first().dispatchEvent('click'); await p.waitForTimeout(300) }
  await p.waitForTimeout(300)
  ok('G 저장 단추가 열려 있음', !(await p.locator('[data-tour="collect-save"]').isDisabled()))
  const call = await save(p, st)
  ok('G **저장까지 정상 · vehicle_id = 2호차**', call?.body?.p?.vehicleId === VB, String(call?.body?.p?.vehicleId))
  ok('G 수거량도 그대로', call?.body?.p?.actualAmount === 140, String(call?.body?.p?.actualAmount))
  ok('G 저장 뒤에도 가로 밀림 0', (await ofl()) === 0, `${await ofl()}px`)
  await ctx.close()
}

console.log(`\n합계 ${pass + fail}검사 · 실패 ${fail}`)
await b.close()
if (fail > 0) process.exitCode = 1
