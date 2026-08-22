import { chromium, EXEC } from './_pw.mjs'

//  차량 배정(②단계) 화면 검증.
//
//   차량   의료 A(670kg) · 의료 B(670kg) · 기저귀(750kg)
//   내일   A병원 400kg · B병원 400kg · C병원 500kg (의료) → 670 한도라 두 대로 나뉘고
//          한 건은 실을 자리가 없어 「배정 못 함」이 되어야 합니다
//   D요양   기저귀 200kg → 기저귀 차로만 가야 합니다
//   E의원   의료 100kg, 최근 12주 의료 B 가 실제로 담당한 이력 3회 → B 로 가야 합니다
//   이미 차가 붙은 일정은 대상에서 빠져야 합니다

const BASE = 'http://localhost:4173'
const SHOT = (process.env.TEST_OUT ?? '/tmp')
const UID = '00000000-0000-0000-0000-0000000000ad'

const out = []
const ok = (c, m, d = '') => {
  //  바로 찍습니다 — 모아 뒀다가 끝에 한 번에 내보내면 중간에 터졌을 때
  //  앞의 결과까지 전부 사라지고, 회귀 집계에 「검사 0 · 실패 0」으로
  //  남아 통과한 것처럼 보입니다.
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  out.push(c)
  if (!c) process.exitCode = 1
}

const TODAY = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
const add = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + n)
  return dt.toISOString().slice(0, 10)
}
const TOM = add(TODAY, 1)

const profile = {
  id: UID, email: 'admin@beonemirae.test', name: '대표', role: 'admin', font_scale: 'normal',
  active: true, approved_at: '2026-01-01T00:00:00Z', client_id: null, created_at: '2026-01-01T00:00:00Z',
}
const mkClient = (id, name, diaper = false) => ({
  id, name, type: '병원', address: '', manager: '', phone: '', collection_cycle: '주 1회',
  collects_medical_waste: !diaper, collects_diaper: diaper, storage_size: '보통', note: '',
  is_demo_generated: false, demo_session_id: null, active: true,
  contract_start: null, contract_end: null, payment_terms: '', payment_due_day: null,
  pricing: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
})
const CA = 'c0000000-0000-0000-0000-0000000000a1'
const CB = 'c0000000-0000-0000-0000-0000000000b1'
const CC = 'c0000000-0000-0000-0000-0000000000c1'
const CD = 'c0000000-0000-0000-0000-0000000000d1'
const CE = 'c0000000-0000-0000-0000-0000000000e1'
const clients = [
  mkClient(CA, 'A병원'), mkClient(CB, 'B병원'), mkClient(CC, 'C병원'),
  mkClient(CD, 'D요양원', true), mkClient(CE, 'E의원'),
]

const VM1 = 'v0000000-0000-0000-0000-0000000000m1'
const VM2 = 'v0000000-0000-0000-0000-0000000000m2'
const VD1 = 'v0000000-0000-0000-0000-0000000000d1'
const vehicles = [
  { id: VM1, name: '의료 1톤 A', waste_type: '의료폐기물', tonnage: 1, nominal_capacity: 1000, expected_capacity: 670, driver: '김현수', active: true },
  { id: VM2, name: '의료 1톤 B', waste_type: '의료폐기물', tonnage: 1, nominal_capacity: 1000, expected_capacity: 670, driver: '박정민', active: true },
  { id: VD1, name: '기저귀 1톤', waste_type: '일회용기저귀', tonnage: 1, nominal_capacity: 1000, expected_capacity: 750, driver: '최영재', active: true },
]

const sched = []
let n = 0
const mk = (o) => {
  sched.push({
    id: o.id ?? `s${n++}`, date: o.date, client_id: o.client, waste_type: o.type ?? '의료폐기물',
    vehicle_id: o.vehicle ?? null, scheduled_time: '', status: o.status ?? '예정',
    expected_amount: o.kg, actual_amount: o.actual ?? null, completed_at: o.completed ?? null,
    memo: '', origin: 'system', is_additional: false, demo_session_id: null, plan_batch: null,
    created_at: `${o.date}T00:00:00Z`, updated_at: `${o.date}T00:00:00Z`,
  })
}
//  내일 — 의료 3건(400+400+500=1300kg, 두 차 합계 1340kg 이지만 한 대에 670 한도)
mk({ id: 'sa', date: TOM, client: CA, kg: 400 })
mk({ id: 'sb', date: TOM, client: CB, kg: 400 })
mk({ id: 'sc', date: TOM, client: CC, kg: 500 })
//  기저귀 1건
mk({ id: 'sd', date: TOM, client: CD, type: '일회용기저귀', kg: 200 })
//  담당 이력이 있는 곳
mk({ id: 'se', date: TOM, client: CE, kg: 100 })
//  이미 차가 붙은 일정 — 대상에서 빠져야 합니다
mk({ id: 'sfixed', date: TOM, client: CA, type: '일회용기저귀', kg: 50, vehicle: VD1 })
//  E의원 담당 이력 — 최근 12주 의료 B 로 3번 완료
for (const back of [7, 14, 21]) {
  mk({ date: add(TODAY, -back), client: CE, kg: 100, vehicle: VM2, status: '완료', actual: 100, completed: `${add(TODAY, -back)}T09:00:00Z` })
}

let posted = null
let undoIds = null
const b = await chromium.launch({ executablePath: EXEC })
const ctx = await b.newContext({ viewport: { width: 1500, height: 1200 } })
await ctx.route('**/rest/v1/**', (r) => {
  const url = r.request().url()
  const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
  const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
  if (url.includes('/rpc/assign_schedule_vehicles')) {
    posted = JSON.parse(r.request().postData() ?? '{}').p_rows
    return json({ assigned: posted.length, skipped: 0, vehicles: 3, from: TOM, to: TOM, ids: posted.map((x) => x.scheduleId) })
  }
  if (url.includes('/rpc/unassign_schedule_vehicles')) {
    undoIds = JSON.parse(r.request().postData() ?? '{}').p_ids
    return json({ cleared: undoIds.length, kept: 0 })
  }
  if (url.includes('/profiles')) return json(single ? profile : [profile])
  if (url.includes('/schedules')) return json(sched)
  if (url.includes('/vehicles')) return json(single ? vehicles[0] : vehicles)
  if (url.includes('/clients')) return json(single ? clients[0] : clients)
  if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
  return json([])
})
const p = await ctx.newPage()
await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
  access_token: 't', token_type: 'bearer', expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
})), ['beonemirae-ops:auth', { id: UID, aud: 'authenticated', email: profile.email, app_metadata: {}, user_metadata: {} }])

const body = () => p.textContent('main').then((t) => t ?? '')

await p.goto(`${BASE}/plan`, { waitUntil: 'domcontentloaded' })
//  고정 대기 대신 화면이 그려질 때까지 기다립니다 — 여러 스위트를 연달아
//  돌리면 브라우저가 느려져 고정 대기로는 들쭉날쭉합니다.
await p.waitForSelector('[data-assign-summary]', { timeout: 20000 })
//  ⚠ 여기서 500ms 만 기다렸다가 **가끔 「차량 0건 배정하기」를 잡았습니다.**
//    화면이 뜬 것과 배정 계산이 끝난 것은 다릅니다 — 기계가 바쁠 때는
//    500ms 안에 안 끝납니다. 시간이 아니라 **끝났다는 신호**를 기다립니다.
//    (시간으로 기다리는 검사는 바쁜 날에만 빨개져서, 진짜 실패를 가립니다)
await p.waitForFunction(
  () => !/차량 0건/.test(document.querySelector('[data-assign-save]')?.textContent ?? '차량 0건'),
  null,
  { timeout: 20000 },
)

// ── 1. ② 단계가 나오고 근거를 밝히는가 ──────────────────────────────────
let t = await body()
ok((await p.locator('[data-assign-step]').count()) === 1, '차량 배정 단계가 있음')
ok(/의료폐기물 차량과 기저귀 차량은 섞지 않습니다/.test(t), '분리 운행이 규칙이라고 밝힘')
ok(/실적재 가능량/.test(t), '명목 적재량이 아니라 실적재로 계산한다고 밝힘')
ok(/경로 순서·운행거리·도착시간은 만들지 않습니다/.test(t), '못 하는 것(경로)을 밝힘')
ok(/하루에 몇 곳까지\s*도는지의 상한도 실제 기록이 없어 두지 않았습니다/.test(t.replace(/\s+/g, ' ')),
  '정차 상한을 지어내지 않았다고 밝힘')

// ── 2. 배정 대상 ──────────────────────────────────────────────────────────
//  차가 비어 있는 예정 5건(sa/sb/sc/sd/se). sfixed 는 이미 차가 있어 제외.
const btn = (await p.locator('[data-assign-save]').textContent()) ?? ''
ok(/차량 4건 배정하기/.test(btn), '실을 수 있는 4건만 배정 대상 (1건은 자리 없음)', btn)

// ── 3. 적재 한도를 넘기지 않는가 ──────────────────────────────────────────
const unassigned = (await p.locator('[data-assign-unassigned]').textContent()) ?? ''
ok((await p.locator('[data-assign-unassigned]').count()) === 1, '배정 못 한 일정 목록이 나옴')
ok(/그날 적재 여유가 모자랍니다/.test(unassigned), '이유가 「적재 여유 부족」', unassigned.replace(/\s+/g, ' ').slice(0, 90))
ok(/용차를 부르거나 날짜를 옮겨야 합니다/.test(t), '억지로 싣지 않았다고 안내')

// ── 4. 담당 이력이 있는 곳은 그 차로 ──────────────────────────────────────
await p.getByRole('button', { name: '한 건씩 확인하기' }).click()
await p.waitForTimeout(500)
const rowE = (await p.locator('[data-assign-row="se"]').textContent()) ?? ''
ok(/의료 1톤 B/.test(rowE), 'E의원은 담당 이력이 있는 의료 B 로 배정', rowE.replace(/\s+/g, ' ').slice(0, 80))
ok(/최근 12주 이 거래처를 3번 담당한 차량/.test(rowE), '근거에 담당 횟수가 적힘')
const rowA = (await p.locator('[data-assign-row="sa"]').textContent()) ?? ''
ok(/담당 이력이 없어 적재 여유가 가장 많은 차량/.test(rowA), '이력 없는 곳은 그렇게 적음')

// ── 5. 기저귀는 기저귀 차로만 ─────────────────────────────────────────────
const rowD = (await p.locator('[data-assign-row="sd"]').textContent()) ?? ''
ok(/기저귀 1톤/.test(rowD), 'D요양원(기저귀)은 기저귀 차량으로', rowD.replace(/\s+/g, ' ').slice(0, 70))

// ── 6. 날짜별 적재 표 ─────────────────────────────────────────────────────
ok((await p.locator('[data-assign-loads]').count()) === 1, '날짜별 차량 적재 표가 나옴')
const loadD = (await p.locator(`[data-assign-load="${TOM}|${VD1}"]`).textContent()) ?? ''
//  기저귀 차 — 이미 있던 50kg + 새 200kg = 250 / 750 = 33%
ok(/250 \/ 750kg/.test(loadD), '이미 배정돼 있던 50kg 도 적재량에 함께 셈', loadD.replace(/\s+/g, ' ').slice(0, 80))
ok(/정차 2곳/.test(loadD), '정차 수도 기존 것을 포함')
ok(/33%/.test(loadD), '적재율 33%')
const loads = (await p.locator('[data-assign-loads]').textContent()) ?? ''
ok(!/1[0-9][0-9]%/.test(loads), '어느 차도 100%를 넘기지 않음')

await p.screenshot({ path: `${SHOT}/assign-page.png`, fullPage: true })

// ── 7. 서버로 무엇을 보내는가 ─────────────────────────────────────────────
await p.locator('[data-assign-save]').click()
await p.waitForTimeout(1500)
ok(Array.isArray(posted) && posted.length === 4, '서버로 4건을 보냄', String(posted?.length))
ok(posted.every((r) => r.scheduleId && r.vehicleId), '일정 id 와 차량 id 만 보냄')
ok(!posted.some((r) => r.scheduleId === 'sfixed'), '이미 차가 있던 일정은 보내지 않음')
const sent = Object.fromEntries(posted.map((r) => [r.scheduleId, r.vehicleId]))
ok(sent.sd === VD1, '기저귀 일정은 기저귀 차량 id 로 보냄')
ok(sent.se === VM2, 'E의원은 담당 이력 차량 id 로 보냄')
//  보낸 모든 줄에서 일정 구분과 차량 구분이 일치해야 합니다 (분리 운행).
const typeOfSched = Object.fromEntries(sched.map((s) => [s.id, s.waste_type]))
const typeOfVeh = Object.fromEntries(vehicles.map((v) => [v.id, v.waste_type]))
ok(posted.every((r) => typeOfSched[r.scheduleId] === typeOfVeh[r.vehicleId]),
  '보낸 모든 줄에서 일정 구분 = 차량 구분',
  posted.map((r) => `${typeOfSched[r.scheduleId]}/${typeOfVeh[r.vehicleId]}`).join(' '))

// ── 8. 결과·되돌리기 ──────────────────────────────────────────────────────
ok((await p.locator('[data-assign-result]').count()) === 1, '배정 결과가 나옴')
ok(/4건에 차량을 붙였습니다/.test(await body()), '몇 건 붙였는지 알려 줌')
await p.locator('[data-assign-undo]').click()
await p.waitForTimeout(1200)
ok(Array.isArray(undoIds) && undoIds.length === 4, '되돌릴 때 방금 붙인 id 만 보냄', String(undoIds?.length))
ok((await p.locator('[data-assign-undone]').count()) === 1, '되돌린 결과가 나옴')
ok(/4건의 차량 배정을 풀었습니다/.test(await body()), '푼 건수를 알려 줌')

// ── 9. 배정할 것이 없을 때 ────────────────────────────────────────────────
{
  const allTaken = sched.map((s) => (s.status === '예정' ? { ...s, vehicle_id: VM1 } : s))
  const ctx2 = await b.newContext({ viewport: { width: 1400, height: 1000 } })
  await ctx2.route('**/rest/v1/**', (r) => {
    const url = r.request().url()
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    if (url.includes('/profiles')) return json(single ? profile : [profile])
    if (url.includes('/schedules')) return json(allTaken)
    if (url.includes('/vehicles')) return json(single ? vehicles[0] : vehicles)
    if (url.includes('/clients')) return json(single ? clients[0] : clients)
    if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
    return json([])
  })
  const p2 = await ctx2.newPage()
  await p2.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: UID, aud: 'authenticated', email: profile.email, app_metadata: {}, user_metadata: {} }])
  await p2.goto(`${BASE}/plan`, { waitUntil: 'domcontentloaded' })
  await p2.waitForLoadState('networkidle').catch(() => {})
  await p2.waitForTimeout(1200)
  ok(/차량이 비어 있는 예정이 없습니다/.test(await p2.textContent('main')), '전부 배정돼 있으면 그렇게 알려 줌')
  ok((await p2.locator('[data-assign-loads]').count()) === 0, '건드릴 것이 없으면 적재 표도 안 그림')
  await ctx2.close()
}

await b.close()
console.log('')
console.log(`총 ${out.length}건 · 실패 ${out.filter((v) => !v).length}건`)
