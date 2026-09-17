import { chromium, EXEC } from './_pw.mjs'
import { readFileSync } from 'node:fs'

//  0126 — 담당 차량은 **기본값**이지 **제약**이 아닙니다.
//
//   Pilot 에서 「직원 담당차량 불일치로 수거 저장이 막힘」이 났습니다. 원인은
//   화면뿐이었습니다 (서버 complete_collection 은 계정↔차량 묶임을 보지 않고
//   차량의 구분만 봅니다). 이 검사는 대표님이 정해 주신 시나리오 A~G 를 그대로
//   봅니다:
//
//    A. 담당 차량 A · 일정 배차 B  → 기본값 B, 그대로 저장되면 vehicle_id = B
//    B. 일정에 배차 없음           → 기본값 A(담당 차량)
//    C. 「다른 차로 갔어요」→ 같은 구분의 B 로 바꿔 저장 → vehicle_id = B
//    D. 다른 구분(기저귀) 차량     → 고르는 칸에 아예 없음 + 서버 검증 그대로
//    E. 사용자 관리에서 A→B 로 바꾸면 서버 함수 **인자 이름 그대로** 나가고, 새로고침해도 B
//    F. 담당 차량 없는 직원        → 차량을 골라서 저장 (막지 않음)
//    G. 390px 에서 가로 밀림 없음 (기본값 표시 · 고르는 칸 펼침 둘 다)
//
//   ⚠ 시늉 서버는 인자 이름을 안 봅니다. E 에서 이름을 **글자 그대로** 비교하는
//     이유가 그것입니다 — 실제 PostgREST 는 이름이 다르면 함수를 못 찾습니다.

const BASE = 'http://localhost:4173'
const ADM = '00000000-0000-0000-0000-0000000000ad'
const DRV = '00000000-0000-0000-0000-0000000000d1'
const FREE = '00000000-0000-0000-0000-0000000000d2'
const CA = '00000000-0000-0000-0000-0000000000c1'
const VA = '00000000-0000-0000-0000-0000000000v1' // 담당 차량 (의료폐기물)
const VB = '00000000-0000-0000-0000-0000000000v2' // 다른 의료폐기물 차
const VD = '00000000-0000-0000-0000-0000000000v3' // 기저귀 차 — 고를 수 없어야 함
const VX = '00000000-0000-0000-0000-0000000000v4' // 운행 중지 — 고를 수 없어야 함
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
const sched = (id, vehicle_id) => ({
  id, client_id: CA, date: T, waste_type: '의료폐기물', scheduled_time: '09:00', status: '예정',
  vehicle_id, expected_amount: 100, actual_amount: null, completed_at: null, memo: '', origin: 'system',
  is_additional: false, canceled_at: null, demo_session_id: null, handover_status: null, driver_name: '',
  created_at: `${T}T00:00:00Z`, updated_at: `${T}T00:00:00Z`,
})

const b = await chromium.launch({ executablePath: EXEC })

/**
 * @param st.roster   profiles 행 (E 에서 서버가 바꾼 값을 되돌려 주려고 **변하는** 배열)
 * @param st.me       로그인한 사람
 * @param st.schedules
 * @param st.calls    서버로 나간 rpc
 */
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
        //  실제 서버처럼 **정확한 인자 이름**일 때만 받습니다 (0056 정의).
        if (!body || !('p_profile' in body) || !('p_vehicle' in body)) {
          return r.fulfill({ status: 404, contentType: 'application/json',
            body: JSON.stringify({ code: 'PGRST202', message: 'Could not find the function public.set_profile_vehicle(p_profile_id, p_vehicle_id) in the schema cache' }) })
        }
        const row = st.roster.find((x) => x.id === body.p_profile)
        if (row) row.vehicle_id = body.p_vehicle
        return json({ profileId: body.p_profile, vehicle: vehicles.find((v) => v.id === body.p_vehicle)?.name ?? null })
      }
      if (name === 'complete_collection') {
        //  서버 검증 그대로 흉내 — 차량 없음·구분 불일치는 거절
        const p = body?.p ?? {}
        const v = vehicles.find((x) => x.id === p.vehicleId)
        if (!v) return r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'P0001', message: '배차 차량을 선택해 주세요.' }) })
        if (v.waste_type !== p.wasteType) return r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'P0001', message: `${p.wasteType} 수거에는 ${p.wasteType} 차량만 배차할 수 있습니다. (선택한 차량: ${v.waste_type})` }) })
        return json({ eventId: 'e1', scheduleId: p.scheduleId ?? 's9', createdSchedule: !p.scheduleId, materialIds: [], requestUpdates: [] })
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
const state = (me, schedules) => ({ me, roster: [prof(ADM, '송현근', 'admin', null), prof(DRV, '백광호', 'field', VA), prof(FREE, '김진환', 'field', null)].map((x) => (x.id === me.id ? me : x)), schedules, calls: [] })
const amountFill = async (p) => { await p.fill('#collection-amount', '120'); await p.waitForTimeout(300) }
const save = async (p, st) => {
  await p.locator('[data-tour="collect-save"]').dispatchEvent('click')
  await p.waitForTimeout(1500)
  return st.calls.find((c) => c.name === 'complete_collection')
}

// ── A. 담당 차량 A · 일정 배차 B → 기본값 B ─────────────────────────────────
console.log('\n── A. 담당 A · 일정 배차 B ──')
{
  const me = prof(DRV, '백광호', 'field', VA)
  const st = state(me, [sched('s1', VB)])
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  wire(ctx, st)
  const p = await open(ctx, '/collection?schedule=s1', me)
  ok('A 일정이 채워짐', (await p.locator('[data-collect-here]').count()) === 1)
  const src = await p.locator('[data-auto-vehicle]').getAttribute('data-vehicle-source')
  ok('A 기본값의 출처가 「일정 배차」', src === 'schedule', String(src))
  const line = flat(await p.locator('[data-vehicle-auto]').textContent().catch(() => ''))
  ok('A 한 줄에 배차 차량 2호차가 보임', /2호차/.test(line) && !/1호차/.test(line), line)
  ok('A 기사 이름은 로그인한 본인', /백광호/.test(line), line)
  ok('A 「오늘은 다른 차로 갔어요」가 있음', (await p.locator('[data-vehicle-other]').count()) === 1)
  ok('A 저장 단추가 열려 있음', !(await p.locator('[data-tour="collect-save"]').isDisabled()))
  const call = await save(p, st)
  ok('A 저장이 서버로 나감', !!call)
  ok('A **저장된 vehicle_id = B(일정 배차)**', call?.body?.p?.vehicleId === VB, String(call?.body?.p?.vehicleId))
  ok('A driverName = 로그인한 본인', call?.body?.p?.driverName === '백광호', String(call?.body?.p?.driverName))
  ok('A 저장 뒤 오류 없음', !/저장할 수 없|오류/.test(flat(await p.textContent('main'))))
  await ctx.close()
}

// ── B. 일정에 배차 없음 → 기본값 A(담당 차량) ─────────────────────────────
console.log('\n── B. 일정 배차 없음 → 담당 차량 ──')
{
  const me = prof(DRV, '백광호', 'field', VA)
  const st = state(me, [sched('s1', null)])
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  wire(ctx, st)
  const p = await open(ctx, '/collection?schedule=s1', me)
  const src = await p.locator('[data-auto-vehicle]').getAttribute('data-vehicle-source')
  ok('B 기본값의 출처가 「담당 차량」', src === 'profile', String(src))
  const line = flat(await p.locator('[data-vehicle-auto]').textContent().catch(() => ''))
  ok('B 한 줄에 담당 차량 1호차가 보임', /1호차/.test(line), line)
  const call = await save(p, st)
  ok('B **저장된 vehicle_id = A(담당 차량)**', call?.body?.p?.vehicleId === VA, String(call?.body?.p?.vehicleId))
  await ctx.close()
}

// ── C. 다른 차로 갔어요 → 같은 구분 B → 저장 vehicle_id = B ────────────────
console.log('\n── C. 오늘은 다른 차로 ──')
{
  const me = prof(DRV, '백광호', 'field', VA)
  const st = state(me, [sched('s1', null)])
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  wire(ctx, st)
  const p = await open(ctx, '/collection?schedule=s1', me)
  await p.locator('[data-vehicle-other]').dispatchEvent('click')
  await p.waitForTimeout(400)
  ok('C 누르면 고르는 칸이 펼쳐짐', (await p.locator('[data-vehicle-select]').count()) === 1)
  ok('C 펼친 칸에 담당 차량이 미리 골라져 있음', (await p.locator('[data-vehicle-select]').inputValue()) === VA)
  const opts = await p.locator('[data-vehicle-select] option').evaluateAll((o) => o.map((x) => ({ v: x.value, t: x.textContent })))
  ok('C 고를 수 있는 차 = 의료폐기물 운행 중 2대만 (기저귀·중지 차량 없음)',
    opts.filter((o) => o.v).map((o) => o.v).sort().join() === [VA, VB].sort().join(), JSON.stringify(opts))
  ok('C 담당 차량에 「(담당 차량)」 표시', opts.some((o) => o.v === VA && /담당 차량/.test(o.t)), JSON.stringify(opts))
  await p.selectOption('[data-vehicle-select]', VB)
  await p.waitForTimeout(400)
  ok('C 바꾼 뒤 저장 단추 열림', !(await p.locator('[data-tour="collect-save"]').isDisabled()))
  const call = await save(p, st)
  ok('C **저장된 vehicle_id = B(직접 고른 차)** — 담당 차량으로 덮이지 않음', call?.body?.p?.vehicleId === VB, String(call?.body?.p?.vehicleId))
  ok('C driverName 은 여전히 로그인한 본인', call?.body?.p?.driverName === '백광호', String(call?.body?.p?.driverName))
  //  저장 뒤 다음 건은 기본값으로 돌아감 (대차는 그 건에만) — 완료 화면에서
  //  「다음 방문 / 이어서 입력」을 눌러 다시 입력 화면으로 갑니다.
  const next = p.locator('[data-tour="collect-done"] button').first()
  if (await next.count()) { await next.dispatchEvent('click'); await p.waitForTimeout(600) }
  const back = flat(await p.locator('[data-vehicle-auto]').textContent().catch(() => ''))
  ok('C 저장 뒤 다음 건은 다시 담당 차량(1호차)부터', /1호차/.test(back), back)
  await ctx.close()
}

// ── D. 다른 구분 차량 → 고르는 칸에 없음 + 서버 검증 그대로 ──────────────────
console.log('\n── D. 다른 구분 차량 ──')
{
  //  담당 차량이 기저귀 차인데 의료폐기물 수거 — 화면은 이번 건만 골라 달라고
  //  하고, 기저귀 차는 목록에 없습니다.
  const me = prof(DRV, '백광호', 'field', VD)
  const st = state(me, [sched('s1', null)])
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  wire(ctx, st)
  const p = await open(ctx, '/collection?schedule=s1', me)
  ok('D 구분이 다른 담당 차량은 기본값이 되지 않음', (await p.locator('[data-auto-vehicle]').getAttribute('data-vehicle-source')) === 'none')
  const mis = flat(await p.locator('[data-vehicle-mismatch]').textContent().catch(() => ''))
  ok('D 「담당 차량은 일회용기저귀 차량 · 이번 건은 골라 달라」 안내', /일회용기저귀 차량/.test(mis) && /골라 주세요/.test(mis), mis)
  const opts = await p.locator('[data-vehicle-select] option').evaluateAll((o) => o.map((x) => x.value).filter(Boolean))
  ok('D 기저귀 차량(5호차)은 목록에 없음', !opts.includes(VD), opts.join(','))
  ok('D 고르기 전에는 저장 잠김', await p.locator('[data-tour="collect-save"]').isDisabled())
  await ctx.close()
  //  서버 쪽은 코드로 확인합니다 — **마지막 판(PROPOSAL_0070)** 의 complete_collection.
  //  ⚠ 0063 에는 구분 일치 검사가 있었지만 0070 에서 대표님 지시로 뺐습니다.
  //    그래서 서버는 「차량이 있는가」만 보고, 구분을 지키는 자리는 위 목록뿐입니다.
  //    이 검사는 (1) 차량 필수 검사가 그대로인지 (2) 계정↔차량 묶임 검사가
  //    서버에 없는지(=화면이 막던 것이었음)를 봅니다.
  const sql = readFileSync(new URL('../../supabase/proposals/PROPOSAL_0070_ops_setup.sql', import.meta.url), 'utf8')
  //  0070 은 머리를 대문자로, 몸통을 $function$ 로 감쌉니다 — 대소문자 없이 찾습니다.
  const from = sql.search(/create or replace function public\.complete_collection/i)
  const rest = from >= 0 ? sql.slice(from) : ''
  const end = rest.search(/\n\$(function)?\$;?\s*\n/)
  const fn = end > 0 ? rest.slice(0, end) : ''
  ok('D 서버(0070 판) complete_collection 은 차량 필수 검사를 그대로 둠', /배차 차량을 선택해 주세요/.test(fn))
  ok('D 서버(0070 판)는 구분 일치를 보지 않음 — 화면 목록이 유일한 구분 방어선', !/waste_type <> \(p->>'wasteType'\)/.test(fn) && /차량 구분으로 막지 않습니다/.test(fn))
  ok('D 서버는 계정↔차량 묶임을 보지 않음 (profiles.vehicle_id 참조 없음)', fn.length > 0 && !/profiles\.vehicle_id|v_actor\.vehicle_id|v_profile\.vehicle_id/.test(fn))
}

// ── E. 사용자 관리에서 A→B → 서버 인자 이름 그대로 · 새로고침해도 B ─────────
console.log('\n── E. 사용자 관리 담당 차량 변경 ──')
{
  const me = prof(ADM, '송현근', 'admin', null)
  const st = state(me, [])
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1800 } })
  wire(ctx, st)
  const p = await open(ctx, '/users', me)
  const sel = p.locator(`[data-user-vehicle="${DRV}"]`)
  ok('E 담당 차량 칸이 있음', (await sel.count()) === 1)
  ok('E 지금 값 = A', (await sel.inputValue()) === VA)
  const opts = await sel.locator('option').evaluateAll((o) => o.map((x) => x.value))
  ok('E 목록 = 미지정 + 운행 중 차량만 (중지 차량 없음)', opts[0] === '' && opts.includes(VA) && opts.includes(VB) && !opts.includes(VX), opts.join(','))
  await sel.selectOption(VB)
  await p.waitForTimeout(1200)
  const call = st.calls.find((c) => c.name === 'set_profile_vehicle')
  ok('E set_profile_vehicle 이 나감', !!call)
  ok('E **인자 이름이 서버 정의(p_profile, p_vehicle) 그대로**', !!call && call.body?.p_profile === DRV && call.body?.p_vehicle === VB, JSON.stringify(call?.body ?? {}))
  ok('E 오류 없이 바뀜', !/오류|실패|찾을 수 없/.test(flat(await p.textContent('main'))))
  await p.reload({ waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(2500)
  ok('E **새로고침해도 B 가 유지됨**', (await p.locator(`[data-user-vehicle="${DRV}"]`).inputValue()) === VB)
  await ctx.close()

  //  그 기사로 수거 입력을 열면 기본값이 B
  const me2 = st.roster.find((x) => x.id === DRV)
  const st2 = { ...state(me2, [sched('s1', null)]), roster: st.roster }
  const ctx2 = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  wire(ctx2, st2)
  const p2 = await open(ctx2, '/collection?schedule=s1', me2)
  const line = flat(await p2.locator('[data-vehicle-auto]').textContent().catch(() => ''))
  ok('E 그 기사의 수거 입력 기본값이 B(2호차)', /2호차/.test(line), line)
  await ctx2.close()
}

// ── F. 담당 차량 없는 직원 → 골라서 저장 ────────────────────────────────────
console.log('\n── F. 담당 차량 없음 ──')
{
  const me = prof(FREE, '김진환', 'field', null)
  const st = state(me, [sched('s1', null)])
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  wire(ctx, st)
  const p = await open(ctx, '/collection?schedule=s1', me)
  const unset = flat(await p.locator('[data-vehicle-unset]').textContent().catch(() => ''))
  ok('F 「담당 차량이 지정되지 않았습니다 · 오늘 탄 차량을 골라 주세요」', /담당 차량이 지정되지 않았습니다/.test(unset) && /골라 주세요/.test(unset), unset)
  ok('F 「사무실에 문의」로 막지 않음', !/사무실에 문의/.test(unset), unset)
  ok('F 고르는 칸이 바로 펼쳐져 있음', (await p.locator('[data-vehicle-select]').count()) === 1)
  ok('F 고르기 전에는 저장 잠김', await p.locator('[data-tour="collect-save"]').isDisabled())
  await p.selectOption('[data-vehicle-select]', VB)
  await p.waitForTimeout(400)
  ok('F 고르면 저장 열림', !(await p.locator('[data-tour="collect-save"]').isDisabled()))
  const call = await save(p, st)
  ok('F **저장 성공 · vehicle_id = 고른 차(B)**', call?.body?.p?.vehicleId === VB, String(call?.body?.p?.vehicleId))
  ok('F driverName = 로그인한 본인(김진환)', call?.body?.p?.driverName === '김진환', String(call?.body?.p?.driverName))
  ok('F 저장 뒤 오류 없음', !/저장할 수 없|오류/.test(flat(await p.textContent('main'))))
  await ctx.close()
}

// ── G. 390px 가로 밀림 없음 ──────────────────────────────────────────────────
console.log('\n── G. 390px ──')
{
  const me = prof(DRV, '백광호', 'field', VA)
  const st = state(me, [sched('s1', VB)])
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  wire(ctx, st)
  const p = await open(ctx, '/collection?schedule=s1', me)
  const ofl = () => p.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth))
  ok('G 기본값 표시 상태 — 가로 밀림 0', (await ofl()) === 0, `${await ofl()}px`)
  const btn = await p.locator('[data-vehicle-other]').boundingBox()
  ok('G 「다른 차로 갔어요」 누를 높이 ≥ 40px', (btn?.height ?? 0) >= 40, `${Math.round(btn?.height ?? 0)}px`)
  await p.locator('[data-vehicle-other]').dispatchEvent('click')
  await p.waitForTimeout(400)
  ok('G 고르는 칸 펼친 상태 — 가로 밀림 0', (await ofl()) === 0, `${await ofl()}px`)
  const selBox = await p.locator('[data-vehicle-select]').boundingBox()
  ok('G 고르는 칸이 화면 폭 안', !!selBox && selBox.x >= 0 && selBox.x + selBox.width <= 390, JSON.stringify(selBox))
  ok('G 되돌리기 단추가 있음', (await p.locator('[data-vehicle-back]').count()) === 1)
  await p.locator('[data-vehicle-back]').dispatchEvent('click')
  await p.waitForTimeout(300)
  ok('G 되돌리면 다시 기본값 한 줄(2호차)', /2호차/.test(flat(await p.locator('[data-vehicle-auto]').textContent().catch(() => ''))))
  await ctx.close()
}

console.log(`\n합계 ${pass + fail}검사 · 실패 ${fail}`)
await b.close()
if (fail > 0) process.exitCode = 1
