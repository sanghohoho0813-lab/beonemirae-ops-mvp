import { chromium, EXEC } from './_pw.mjs'

//  현장이 입력한 건이 (1) 본인 화면에 바로 보이고 (2) 사무실 화면에도
//  새로고침 없이 따라오는지 확인합니다.
//
//  서버는 흉내 내되 **한 개의 공유 상태**를 둡니다. 현장 탭이 저장하면 그
//  상태가 바뀌고, 사무실 탭이 다시 읽어올 때 그 값을 받습니다 — 실제 서버와
//  같은 관계입니다.

const BASE = 'http://localhost:4173'
const SHOT = (process.env.TEST_OUT ?? '/tmp')
const C1 = '00000000-0000-0000-0000-0000000000c1'
const V1 = '00000000-0000-0000-0000-0000000000v1'
const S1 = '00000000-0000-0000-0000-0000000000a1'

const out = []
const ok = (c, m, d = '') => {
  //  바로 찍습니다 — 모아 뒀다가 끝에 한 번에 내보내면 중간에 터졌을 때
  //  앞의 결과까지 전부 사라지고, 회귀 집계에 「검사 0 · 실패 0」으로
  //  남아 통과한 것처럼 보입니다.
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  out.push(c)
  if (!c) process.exitCode = 1
}

const pad = (n) => String(n).padStart(2, '0')
const dd = new Date()
//  앱은 한국 시각으로 「오늘」을 정합니다(lib/format 의 today()). 컨테이너
//  시계(UTC)로 날짜를 만들면 한국 00:00~09:00 사이에 하루가 어긋나
//  "등록된 일정이 없어요" 가 됩니다 — 실제로 겪었습니다.
const TODAY = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })

//  ── 공유 "서버" 상태 ──────────────────────────────────────────────────────
const server = {
  schedules: [{
    id: S1, date: TODAY, client_id: C1, waste_type: '의료폐기물', vehicle_id: V1,
    scheduled_time: '09:00', status: '예정', expected_amount: 180, actual_amount: null,
    actual_time: null, completed_at: null, containers: null, driver_name: '김기사',
    handover_status: null, handover_at: null, memo: '', event_id: null, origin: 'field',
    demo_session_id: null, created_at: `${TODAY}T00:00:00Z`, updated_at: `${TODAY}T00:00:00Z`,
  }],
  events: [],
}
const clients = [{ id: C1, name: '의료법인한양의료재단', type: '병원', address: '서울시 강남구', manager: '김주현', phone: '02-555-1234', collection_cycle: '주 2회', collects_medical_waste: true, collects_diaper: false, storage_size: '보통', note: '', is_demo_generated: false, demo_session_id: null, active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }]
const vehicles = [{ id: V1, name: '의료폐기물 1호', waste_type: '의료폐기물', tonnage: 1, nominal_capacity: 1000, expected_capacity: 800, driver: '김기사', active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }]
const stock = { id: 1, corrugated_box: 120, plastic_container: 60, bag: 200, needle_box: 45 }

const b = await chromium.launch({ executablePath: EXEC })

let officeScheduleReads = 0

async function open(role, uid, mobile) {
  const ctx = await b.newContext(
    mobile
      ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
      : { viewport: { width: 1400, height: 900 } },
  )
  const profile = {
    id: uid, email: `${role}@beonemirae.test`, name: role === 'field' ? '현장 직원' : '사무실 직원',
    role, font_scale: 'normal', active: true, approved_at: '2026-01-01T00:00:00Z', client_id: null,
    //  ⚠ 0067 부터 **현장은 차량을 고르지 않습니다.** 계정에 묶인 차로
    //     저장되고, 안 묶여 있으면 저장 단추가 잠깁니다. 그래서 이 fixture 도
    //     실제 파일럿과 같게 차량을 묶어 둡니다. 안 묶으면 여기서 재려던 것
    //     (현장이 넣은 값이 사무실 화면에 보이는가)에 닿기도 전에 죽습니다.
    vehicle_id: role === 'field' ? V1 : null,
    created_at: '2026-01-01T00:00:00Z',
  }
  await ctx.route('**/rest/v1/**', async (r) => {
    const req = r.request()
    const url = req.url()
    const single = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })

    //  현장의 「수거 완료」는 DB 함수를 부릅니다. 그 함수가 하는 일을 흉내 냅니다.
    if (url.includes('/rpc/complete_collection')) {
      const p = req.postDataJSON()?.p ?? {}
      const s = server.schedules.find((x) => x.id === p.scheduleId)
      if (s) {
        s.status = '완료'
        s.actual_amount = Number(p.actualAmount)
        s.actual_time = p.actualTime
        s.completed_at = new Date().toISOString()
        s.handover_status = p.handoverStatus
      }
      server.events.push({ id: 'e1', at: new Date().toISOString(), actor_id: uid, actor_name: '현장 직원', actor_role: 'field', screen: '오늘 일정 · 빠른 완료', action: '수거 완료', schedule_id: S1, created_schedule: false, client_id: C1, client_name: clients[0].name, waste_type: '의료폐기물', amount_kg: Number(p.actualAmount), before_state: {}, material_ids: [], stock_before: {}, request_updates: [], note: '', reverted: false, reverted_at: null, demo_session_id: null, input_duration_ms: 1000 })
      return json({ eventId: 'e1', scheduleId: S1, createdSchedule: false })
    }
    if (url.includes('/profiles')) return json(single ? profile : [profile])
    if (url.includes('/clients')) return json(single ? clients[0] : clients)
    if (url.includes('/vehicles')) return json(vehicles)
    if (url.includes('/schedules')) {
      if (role === 'office') officeScheduleReads++
      return json(server.schedules)
    }
    if (url.includes('/collection_events')) return json(server.events)
    if (url.includes('/office_stock')) return json(single ? stock : [stock])
    return json([])
  })
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: uid, aud: 'authenticated', email: profile.email, app_metadata: {}, user_metadata: {} }])
  return { ctx, p }
}

// ── 사무실 화면을 먼저 열어 둡니다 (켜 놓고 일하는 상태) ────────────────────
const office = await open('office', '00000000-0000-0000-0000-0000000000o1', false)
await office.p.goto(`${BASE}/today`, { waitUntil: 'domcontentloaded' })
await office.p.waitForTimeout(2500)
const officeBefore = (await office.p.textContent('main')) ?? ''
ok(/09:00/.test(officeBefore) && !/133kg/.test(officeBefore), '사무실 화면: 아직 예정 상태로 보임')
const readsAfterLoad = officeScheduleReads

// ── 현장이 폰으로 수거를 완료합니다 ─────────────────────────────────────────
const field = await open('field', '00000000-0000-0000-0000-0000000000f1', true)
await field.p.goto(`${BASE}/today`, { waitUntil: 'domcontentloaded' })
await field.p.waitForTimeout(2500)

//  「다음 방문」 카드의 수거 입력 시작 → 상세 화면 대신, 목록의 빠른 완료를 씁니다.
await field.p.getByRole('button', { name: /수거 입력 시작/ }).first().click()
await field.p.waitForTimeout(1200)
//  수거 입력 화면으로 넘어갑니다. 실제 수거량을 넣고 저장합니다.
//  수거량 칸은 **이름으로** 집습니다. 「첫 번째 숫자 칸」으로 집으면 시간
//  입력(시·분)이 앞에 오는 순간 엉뚱한 칸에 값이 들어가고, 저장은 되는데
//  수거량이 0 인 채로 지나갑니다 — 실제로 그렇게 새 나갔습니다.
const amountBox = field.p.locator('[data-actual-amount], #collection-amount').first()
await amountBox.waitFor({ timeout: 15000 })
await amountBox.fill('133')
const saveBtn = field.p.getByRole('button', { name: /수거 완료 저장|저장|완료/ }).last()
await saveBtn.click()
await field.p.waitForTimeout(3000)

const fieldAfter = (await field.p.textContent('body')) ?? ''
ok(/133/.test(fieldAfter), '현장 화면: 입력한 값이 본인에게 바로 보임')
await field.p.screenshot({ path: `${SHOT}/sync-field.png`, fullPage: true })
ok(server.schedules[0].status === '완료', '서버에 완료로 저장됨', `actual=${server.schedules[0].actual_amount}`)

// ── 사무실 화면 — 새로고침 없이 따라오는가 ──────────────────────────────────
//    화면으로 돌아올 때 다시 읽어옵니다. 탭 전환을 그대로 재현합니다.
await office.p.bringToFront()
await office.p.evaluate(() => {
  document.dispatchEvent(new Event('visibilitychange'))
  window.dispatchEvent(new Event('focus'))
})
await office.p.waitForTimeout(2500)

ok(officeScheduleReads > readsAfterLoad, '사무실 화면이 다시 읽어옴 (새로고침 없이)',
  `읽기 ${readsAfterLoad} → ${officeScheduleReads}`)
const officeAfter = (await office.p.textContent('main')) ?? ''
ok(/133kg/.test(officeAfter), '사무실 화면에 현장이 넣은 133kg 가 나타남')
ok(/완료/.test(officeAfter), '사무실 화면에서 완료 상태로 바뀜')
await office.p.screenshot({ path: `${SHOT}/sync-office.png`, fullPage: true })

await b.close()
console.log('')
console.log(`총 ${out.length}건 · 실패 ${out.filter((v) => !v).length}건`)
