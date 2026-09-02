import { chromium, EXEC } from './_pw.mjs'

//  수거 일정 편성 화면 검증.
//
//   A병원 — 최근 12주 화·금 규칙적으로 수거 (편성 대상)
//   B의원 — 12주 동안 2번뿐 (근거 부족 → 편성하지 않고 이유 표시)
//   C요양 — 마지막 수거가 두 달 전 (오래됨 → 편성하지 않음)
//   A병원의 다음 화요일에는 이미 일정이 있음 (건너뛰어야 함)

const BASE = 'http://localhost:4173'
const SHOT = (process.env.TEST_OUT ?? '/tmp')
const UID = '00000000-0000-0000-0000-0000000000ad'
const A = '00000000-0000-0000-0000-0000000000c1'
const B = '00000000-0000-0000-0000-0000000000c2'
const C = '00000000-0000-0000-0000-0000000000c3'

const out = []
const ok = (c, m, d = '') => {
  //  바로 찍습니다 — 모아 뒀다가 끝에 한 번에 내보내면 중간에 터졌을 때
  //  앞의 결과까지 전부 사라지고, 회귀 집계에 「검사 0 · 실패 0」으로
  //  남아 통과한 것처럼 보입니다.
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  out.push(c)
  if (!c) process.exitCode = 1
}

//  앱과 같은 기준(한국 시각)으로 오늘을 잡습니다.
const TODAY = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
const add = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + n)
  return dt.toISOString().slice(0, 10)
}
const wd = (iso) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}
/** 오늘 이후 첫 번째 해당 요일 */
const nextWd = (target) => {
  for (let i = 0; i < 8; i++) if (wd(add(TODAY, i)) === target) return add(TODAY, i)
  return TODAY
}

const profile = {
  id: UID, email: 'admin@beonemirae.test', name: '대표', role: 'admin', font_scale: 'normal',
  active: true, approved_at: '2026-01-01T00:00:00Z', client_id: null, created_at: '2026-01-01T00:00:00Z',
}
const mkClient = (id, name) => ({
  id, name, type: '병원', address: '', manager: '', phone: '', collection_cycle: '주 2회',
  collects_medical_waste: true, collects_diaper: false, storage_size: '보통', note: '',
  is_demo_generated: false, demo_session_id: null, active: true,
  contract_start: null, contract_end: null, payment_terms: '', payment_due_day: null,
  pricing: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
})
const clients = [mkClient(A, 'A병원'), mkClient(B, 'B의원'), mkClient(C, 'C요양병원')]

const sched = []
let n = 0
const done = (clientId, date, kg) => {
  sched.push({
    id: `s${n++}`, date, client_id: clientId, waste_type: '의료폐기물', vehicle_id: null,
    scheduled_time: '', status: '완료', expected_amount: kg, actual_amount: kg,
    completed_at: `${date}T09:00:00Z`, memo: '', origin: 'migrated', is_additional: false,
    demo_session_id: null, plan_batch: null,
    created_at: `${date}T00:00:00Z`, updated_at: `${date}T00:00:00Z`,
  })
}

//  A병원 — 지난 12주 화(2)·금(5). 화요일 100kg 고정, 금요일은 들쭉날쭉하게
//  넣어 중앙값이 평균과 다르게 나오는지도 봅니다.
const friKg = [40, 50, 60, 70, 900, 60, 50, 60, 70, 60, 50, 60]
for (let w = 1; w <= 12; w++) {
  for (let back = 1; back <= 7; back++) {
    const d = add(TODAY, -(w * 7) + back - 7)
    if (d >= TODAY) continue
    if (wd(d) === 2) done(A, d, 100)
    if (wd(d) === 5) done(A, d, friKg[w - 1])
  }
}
//  B의원 — 12주 동안 딱 2번 (근거 부족)
done(B, add(TODAY, -10), 30)
done(B, add(TODAY, -31), 32)
//  C요양병원 — 규칙적이었지만 마지막이 두 달 전 (거래 중단)
for (let w = 9; w <= 12; w++) done(C, add(TODAY, -(w * 7)), 55)

//  A병원의 다음 화요일에는 이미 일정이 있습니다 → 건너뛰어야 합니다
const TAKEN = nextWd(2)
sched.push({
  id: 'taken', date: TAKEN, client_id: A, waste_type: '의료폐기물', vehicle_id: null,
  scheduled_time: '', status: '예정', expected_amount: 77, actual_amount: null,
  completed_at: null, memo: '손대면 안 되는 기존 일정', origin: 'field', is_additional: false,
  demo_session_id: null, plan_batch: null, created_at: `${TAKEN}T00:00:00Z`, updated_at: `${TAKEN}T00:00:00Z`,
})

let posted = null
const b = await chromium.launch({ executablePath: EXEC })
const ctx = await b.newContext({ viewport: { width: 1500, height: 1100 } })
await ctx.route('**/rest/v1/**', (r) => {
  const url = r.request().url()
  const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
  const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
  if (url.includes('/rpc/create_planned_schedules')) {
    posted = JSON.parse(r.request().postData() ?? '{}').p_rows
    return json({ batch: 'b1', inserted: posted.length, skipped: 0, clients: 1, from: posted[0]?.date, to: posted[posted.length - 1]?.date })
  }
  if (url.includes('/rpc/undo_schedule_batch')) return json({ deleted: 8, kept: 0 })
  if (url.includes('/profiles')) return json(single ? profile : [profile])
  if (url.includes('/schedules')) return json(sched)
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
await p.waitForSelector('[data-plan-summary]', { timeout: 20000 })
//  ⚠ 0098 — 요약 칸이 뜬 뒤 **0.5초를 더 기다리는 것**으로는 모자랐습니다.
//    편성 목록은 12주치 기록을 훑어 요일을 찾은 뒤에 그려지는데, 나란히
//    세 개를 돌리면 그 계산이 0.5초를 넘습니다. 그러면 아직 안 그려진
//    목록을 「없다」로 적습니다(전체 회귀에서 세 줄이 그렇게 빨갛게 떴고,
//    단독으로 돌리면 멀쩡했습니다).
//    시간이 아니라 **목록이 그려질 때까지** 기다립니다. 끝내 안 그려지면
//    아래 검사가 그대로 실패하므로 눈감아 주는 것이 아닙니다.
await p.waitForFunction(
  () => document.querySelectorAll('[data-plan-pattern]').length > 0,
  null, { timeout: 20000 },
).catch(() => {})
await p.waitForTimeout(300)

// ── 1. 화면이 열리고 근거를 먼저 밝히는가 ─────────────────────────────────
let t = await body()
ok((await p.locator('[data-plan-page]').count()) === 1, '일정 편성 화면이 열림')
ok(/최근 12주 동안 실제로 완료된 수거의 요일/.test(t), '무엇을 근거로 만드는지 화면에 적혀 있음')
ok(/수거이력·정산·매출에는 잡히지 않고/.test(t), '「예정일 뿐」이라고 밝힘')
ok(/공휴일은 아직 반영하지 않습니다/.test(t), '못 하는 것도 밝힘 (공휴일)')

// ── 2. A병원의 반복 요일을 화·금으로 찾았는가 ─────────────────────────────
const pat = p.locator(`[data-plan-pattern="${A}|의료폐기물"]`)
ok((await pat.count()) === 1, 'A병원이 편성 대상으로 잡힘')
const patText = (await pat.textContent()) ?? ''
ok(/화/.test(patText) && /금/.test(patText), '반복 요일이 화·금', patText.replace(/\s+/g, ' ').slice(0, 90))
ok(!/월|수|목|토|일/.test(patText.replace('일회용', '').replace(/\d+회/g, '')), '다른 요일은 들어가지 않음')
//  금요일 중앙값 — 평균(127kg)이 아니라 60kg 이어야 합니다 (900kg 한 번에 끌려가지 않음)
ok(/평소 60kg/.test(patText), '금요일 예상량이 중앙값 60kg (평균 아님)', patText.match(/평소 \d+kg/g)?.join(',') ?? '')
ok(/평소 100kg/.test(patText), '화요일 예상량 100kg')

// ── 3. 근거가 모자란 곳은 만들지 않고 이유를 적는가 ───────────────────────
ok(/편성하지 않은 거래처/.test(t), '편성하지 않은 거래처 항목이 있음')
await p.getByRole('button', { name: /근거가 모자란/ }).click()
await p.waitForTimeout(500)
const un = (await p.locator('[data-plan-unusable]').textContent()) ?? ''
ok(/B의원/.test(un), 'B의원은 편성하지 않음')
ok(/반복되는 요일을 찾지 못했습니다/.test(un), 'B의원에 이유가 적혀 있음', un.replace(/\s+/g, ' ').slice(0, 80))
ok(/C요양병원/.test(un), 'C요양병원도 편성하지 않음')
ok(/35일 넘게 없습니다/.test(un), 'C요양병원은 「오래 수거 없음」 이유', un.replace(/\s+/g, ' ').slice(-70))
ok((await p.locator(`[data-plan-pattern="${B}|의료폐기물"]`).count()) === 0, 'B의원은 편성 목록에 없음')

// ── 4. 이미 일정이 있는 날은 건너뛰는가 ───────────────────────────────────
ok(/건너뛴 날/.test(t), '건너뛴 날 항목이 있음')
ok((await p.locator(`[data-plan-row="${TAKEN}|${A}|의료폐기물"]`).count()) === 0,
  `이미 일정이 있는 ${TAKEN} 은 만들 목록에 없음`)

// ── 5. 만들 건수 ──────────────────────────────────────────────────────────
//  4주(오늘~27일 뒤) 안의 화·금 개수에서 기존 일정 1건을 뺀 값
let expect = 0
for (let i = 0; i < 28; i++) {
  const d = add(TODAY, i)
  if (wd(d) === 2 || wd(d) === 5) expect++
}
expect -= 1
const btn = await p.locator('[data-plan-create]').textContent()
ok(new RegExp(`일정 ${expect}건 만들기`).test(btn ?? ''), `버튼에 만들 건수 ${expect}건`, btn ?? '')

// ── 6. 기간을 바꾸면 건수도 바뀌는가 ──────────────────────────────────────
await p.locator('[data-plan-range="1"]').click()
await p.waitForTimeout(400)
let w1 = 0
for (let i = 0; i < 7; i++) {
  const d = add(TODAY, i)
  if (wd(d) === 2 || wd(d) === 5) w1++
}
if (wd(TAKEN) === 2 && TAKEN < add(TODAY, 7)) w1 -= 1
ok(new RegExp(`일정 ${w1}건 만들기`).test((await p.locator('[data-plan-create]').textContent()) ?? ''),
  `1주로 줄이면 ${w1}건`, (await p.locator('[data-plan-create]').textContent()) ?? '')
await p.locator('[data-plan-range="4"]').click()
await p.waitForTimeout(400)

// ── 7. 거래처를 빼면 만들지 않는가 ────────────────────────────────────────
await pat.locator('input[type=checkbox]').click()
await p.waitForTimeout(400)
ok(/일정 0건 만들기/.test((await p.locator('[data-plan-create]').textContent()) ?? ''),
  '유일한 거래처를 빼면 0건')
await pat.locator('input[type=checkbox]').click()
await p.waitForTimeout(400)

await p.screenshot({ path: `${SHOT}/plan-page.png`, fullPage: true })

// ── 8. 실제로 만들 때 서버로 무엇을 보내는가 ──────────────────────────────
await p.locator('[data-plan-create]').click()
await p.waitForTimeout(1500)
ok(Array.isArray(posted) && posted.length === expect, `서버로 ${expect}건을 보냄`, String(posted?.length))
ok(posted.every((r) => r.date >= TODAY), '지난 날짜는 한 건도 보내지 않음')
ok(posted.every((r) => r.clientId === A), 'A병원 것만 보냄')
ok(posted.every((r) => wd(r.date) === 2 || wd(r.date) === 5), '화·금 날짜만 보냄')
ok(posted.every((r) => r.date !== TAKEN), '이미 일정이 있는 날은 보내지 않음')
ok(posted.filter((r) => wd(r.date) === 2).every((r) => r.expectedAmount === 100), '화요일 예상량 100kg 로 보냄')
ok(posted.filter((r) => wd(r.date) === 5).every((r) => r.expectedAmount === 60), '금요일 예상량 60kg 로 보냄')
ok(posted.every((r) => /최근 12주 .요일 \d+회/.test(r.basis)), '근거 문구가 함께 저장됨', posted[0]?.basis ?? '')

// ── 9. 결과와 되돌리기 ────────────────────────────────────────────────────
ok((await p.locator('[data-plan-result]').count()) === 1, '만든 결과가 화면에 나옴')
ok(/예정 \d+건을 만들었습니다/.test(await body()), '몇 건 만들었는지 알려 줌')
ok((await p.locator('[data-plan-undo]').count()) === 1, '되돌리기 버튼이 나타남')
await p.locator('[data-plan-undo]').click()
await p.waitForTimeout(1200)
ok((await p.locator('[data-plan-undone]').count()) === 1, '되돌린 결과가 나옴')
ok(/8건을 되돌렸습니다/.test(await body()), '되돌린 건수를 알려 줌')
await p.screenshot({ path: `${SHOT}/plan-done.png`, fullPage: true })

// ── 10. 현장 담당자는 들어갈 수 없다 ──────────────────────────────────────
{
  const fieldProfile = { ...profile, id: '00000000-0000-0000-0000-0000000000fd', role: 'field', name: '현장' }
  const ctx2 = await b.newContext({ viewport: { width: 1400, height: 1000 } })
  await ctx2.route('**/rest/v1/**', (r) => {
    const url = r.request().url()
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    if (url.includes('/profiles')) return json(single ? fieldProfile : [fieldProfile])
    if (url.includes('/schedules')) return json(sched)
    if (url.includes('/clients')) return json(single ? clients[0] : clients)
    if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
    return json([])
  })
  const p2 = await ctx2.newPage()
  await p2.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: fieldProfile.id, aud: 'authenticated', email: 'f@t.test', app_metadata: {}, user_metadata: {} }])
  await p2.goto(`${BASE}/plan`, { waitUntil: 'domcontentloaded' })
  await p2.waitForLoadState('networkidle').catch(() => {})
  await p2.waitForTimeout(1200)
  ok((await p2.locator('[data-plan-page]').count()) === 0, '현장 담당자에게는 일정 편성 화면이 열리지 않음')
  ok(!/일정 편성/.test(await p2.textContent('body')), '메뉴에도 나오지 않음')
  await ctx2.close()
}

await b.close()
console.log('')
console.log(`총 ${out.length}건 · 실패 ${out.filter((v) => !v).length}건`)
