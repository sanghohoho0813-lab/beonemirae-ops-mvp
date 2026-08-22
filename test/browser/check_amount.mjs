import { chromium, EXEC } from './_pw.mjs'

//  수거량 자릿수 확인.
//
//   현장에서 폰으로 kg 을 칠 때 0 하나가 더 붙으면 그대로 청구액이 열
//   배가 됩니다. 950원/kg 짜리 거래처의 100kg 이 1,000kg 이 되면 9만
//   5천원이 95만원으로 나갑니다. 그 사실은 월말 청구까지 아무도 모릅니다.
//
//   지금 있던 방어선은 「차량 최대 적재량 초과」 하나뿐이라 큰 거래처의
//   오타만 잡았습니다. 30kg 거래처가 300kg 이 되어도 1톤 차량 안입니다.
//
//   시나리오
//    A병원  최근 8주 매주 100kg 수거 → 평소 100kg
//           1,000kg 을 치면 저장 전에 물어봐야 합니다 (10배)
//           120kg 은 아무 말 없이 저장돼야 합니다
//    B의원  최근 수거 2건뿐 → 「평소」가 없으므로 판단하지 않습니다

const BASE = 'http://localhost:4173'
const UID = '00000000-0000-0000-0000-0000000000ad'

const out = []
const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  out.push(c)
  if (!c) process.exitCode = 1
}

const TODAY = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
const shift = (base, n) => {
  const d = new Date(Date.UTC(+base.slice(0, 4), +base.slice(5, 7) - 1, +base.slice(8, 10)))
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const [Y, M] = TODAY.slice(0, 7).split('-').map(Number)
const PREV = M === 1 ? `${Y - 1}-12` : `${Y}-${String(M - 1).padStart(2, '0')}`

const profile = {
  id: UID, email: 'field@beonemirae.test', name: '기사', role: 'admin', font_scale: 'normal',
  active: true, approved_at: '2026-01-01T00:00:00Z', client_id: null, created_at: '2026-01-01T00:00:00Z',
}
const mkClient = (id, name) => ({
  id, name, type: '병원', address: '', manager: '', phone: '', collection_cycle: '주 1회',
  collects_medical_waste: true, collects_diaper: false, storage_size: '보통', note: '',
  is_demo_generated: false, demo_session_id: null, active: true,
  contract_start: null, contract_end: null, payment_terms: '', payment_due_day: null,
  pricing: { medical: { sale: 950, cost: 350 } },
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  biz_no: null, biz_ceo: null, biz_type: null, biz_item: null, tax_email: null, vat_mode: null,
})
const CA = '00000000-0000-0000-0000-0000000000a1'
const CB = '00000000-0000-0000-0000-0000000000b1'
const clients = [mkClient(CA, 'A병원'), mkClient(CB, 'B의원')]

const vehicles = [{
  id: 'v1', name: '1호차', waste_type: '의료폐기물', tonnage: 5,
  nominal_capacity: 5000, expected_capacity: 4000, driver: '김기사', active: true,
}]

const mkSched = (id, clientId, date, kg) => ({
  id, date, client_id: clientId, waste_type: '의료폐기물', vehicle_id: 'v1',
  scheduled_time: '', status: '완료', expected_amount: kg, actual_amount: kg,
  completed_at: `${date}T09:00:00Z`, memo: '', origin: 'migrated', is_additional: false,
  demo_session_id: null, plan_batch: null, created_at: `${date}T00:00:00Z`, updated_at: `${date}T00:00:00Z`,
})
//  A병원 — 최근 8주 매주 100kg (평소 100kg)
const schedules = []
for (let w = 1; w <= 8; w += 1) schedules.push(mkSched(`sa${w}`, CA, shift(TODAY, -7 * w), 100))
//  B의원 — 2건뿐이라 「평소」를 말할 수 없습니다
schedules.push(mkSched('sb1', CB, shift(TODAY, -7), 50))
//  두 번째 건은 지난달로 못 박습니다. shift(TODAY,-14) 로 두면 달 초에
//  돌릴 때 두 건 모두 이번 달로 들어가, 지난달 청구 목록에서 B의원이
//  통째로 사라집니다 (아래 「멀쩡한 거래처는 켜져 있음」이 못 돕니다).
schedules.push(mkSched('sb2', CB, `${PREV}-20`, 50))
//  지난달에 이미 저장된 이상치 — 월말 청구가 잡아야 합니다
schedules.push(mkSched('odd1', CA, `${PREV}-10`, 1000))
schedules.push(mkSched('n1', CA, `${PREV}-17`, 100))

const posted = []
const dialogs = []
const b = await chromium.launch({ executablePath: EXEC })
const ctx = await b.newContext({ viewport: { width: 1500, height: 1200 } })
await ctx.route('**/auth/v1/**', (r) =>
  r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: UID, aud: 'authenticated', email: profile.email, app_metadata: {}, user_metadata: {} }) }))
await ctx.route('**/rest/v1/**', (r) => {
  const url = r.request().url()
  const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
  const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
  if (url.includes('/rpc/app_schema_version')) return json(34)
  if (url.includes('/rpc/complete_collection')) {
    posted.push(JSON.parse(r.request().postData() ?? '{}'))
    return json({ eventId: 'e1', scheduleId: 'snew' })
  }
  if (url.includes('/audit_logs')) return json([{ id: 1 }])
  if (url.includes('/profiles')) return json(single ? profile : [profile])
  if (url.includes('/holidays')) return json([])
  if (url.includes('/payment_receipts')) return json([])
  if (url.includes('/payments')) return json([])
  if (url.includes('/schedules')) return json(schedules)
  if (url.includes('/vehicles')) return json(vehicles)
  if (url.includes('/clients')) return json(single ? clients[0] : clients)
  if (url.includes('/office_stock')) return json(single ? { id: 1, corrugated_box: 100, plastic_container: 100, bag: 100, needle_box: 100 } : [{ id: 1, corrugated_box: 100, plastic_container: 100, bag: 100, needle_box: 100 }])
  return json([])
})
const p = await ctx.newPage()
await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
  access_token: 't', token_type: 'bearer', expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
})), ['beonemirae-ops:auth', { id: UID, aud: 'authenticated', email: profile.email, app_metadata: {}, user_metadata: {} }])

//  물어보는 창을 기록하고, 기본은 「취소」로 답합니다 — 물어보고 끝내는지
//  확인하기 위해서입니다.
let answer = false
p.on('dialog', (d) => {
  dialogs.push(d.message())
  if (answer) void d.accept()
  else void d.dismiss()
})

async function fillForm(clientId, kg) {
  await p.goto(`${BASE}/collection`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(2200)
  //  첫 select 가 거래처, 그다음이 배차 차량입니다.
  await p.locator('select').first().selectOption(clientId)
  await p.waitForTimeout(500)
  await p.locator('select').nth(1).selectOption('v1')
  //  수거량 — placeholder 「예: 320」 칸입니다 (뒤의 0 칸들은 용기 개수)
  await p.locator('input[placeholder="예: 320"]').fill(String(kg))
  await p.waitForTimeout(400)
}

// ── 1. 평소의 열 배 — 저장 전에 물어본다 ──────────────────────────────────
await fillForm(CA, 1000)
dialogs.length = 0
posted.length = 0
answer = false
await p.locator('[data-tour="collect-save"]').click()
await p.waitForTimeout(1500)
ok(dialogs.length >= 1, '저장 전에 물어봄', String(dialogs.length))
const msg = dialogs.join(' ')
ok(/평소 이 거래처 의료폐기물 수거량은 100kg 정도인데 1,000kg/.test(msg), '평소값과 입력값을 그대로 적음',
  msg.slice(0, 110))
ok(/자릿수를 확인해 주세요/.test(msg), '무엇을 확인해야 하는지 적음')
ok(posted.length === 0, '「아니오」를 고르면 저장하지 않음 — 물어보고 끝', String(posted.length))

// ── 2. 그래도 맞다고 하면 저장한다 (막지 않습니다) ────────────────────────
answer = true
await p.locator('[data-tour="collect-save"]').click()
await p.waitForTimeout(2000)
ok(posted.length === 1, '실제로 그만큼 나온 달이면 그대로 저장 — 막지 않습니다', String(posted.length))
ok(posted[0]?.p_input?.actualAmount === 1000 || JSON.stringify(posted[0]).includes('1000'),
  '입력한 값 그대로 저장', JSON.stringify(posted[0]).slice(0, 90))

// ── 3. 평소 범위 안이면 아무 말 없이 저장 ─────────────────────────────────
await fillForm(CA, 120)
dialogs.length = 0
posted.length = 0
answer = true
await p.locator('[data-tour="collect-save"]').click()
await p.waitForTimeout(2000)
ok(dialogs.length === 0, '평소와 비슷하면 묻지 않음 (120kg)', dialogs.join(' ').slice(0, 60))
ok(posted.length === 1, '그대로 저장')

// ── 4. 근거가 모자라면 판단하지 않는다 ────────────────────────────────────
//  B의원은 수거가 2건뿐입니다. 근거 없이 경고하면 곧 아무도 안 봅니다.
await fillForm(CB, 5000)
dialogs.length = 0
posted.length = 0
answer = true
await p.locator('[data-tour="collect-save"]').click()
await p.waitForTimeout(2000)
ok(!dialogs.some((d) => /평소 이 거래처/.test(d)), '수거 이력이 모자라면 「평소」를 말하지 않음',
  dialogs.join(' ').slice(0, 80))

// ── 5. 이미 저장된 이상치는 월말 청구가 잡는다 ────────────────────────────
//  입력 시점이 첫 방어선이고, 여기가 병원에 나가기 전 마지막입니다.
await p.goto(`${BASE}/billing`, { waitUntil: 'domcontentloaded' })
await p.waitForSelector('[data-close-summary]', { timeout: 20000 })
await p.waitForTimeout(1200)
ok((await p.locator(`[data-close-odd="${CA}"]`).count()) === 1, '평소와 다른 수거량이 있는 거래처를 표시')
const odd = ((await p.textContent(`[data-close-odd="${CA}"]`)) ?? '').replace(/\s+/g, ' ')
ok(/1,000kg \(평소 100kg\)/.test(odd), '어느 날 얼마인지·평소가 얼마인지 그대로', odd.slice(0, 80))
const sum = ((await p.textContent('[data-close-summary]')) ?? '').replace(/\s+/g, ' ')
ok(/평소와 다른 수량\s*1곳/.test(sum), '요약에도 몇 곳인지', sum.slice(0, 120))
ok((await p.locator('[data-close-odd-warn]').count()) === 1, '왜 꺼 두었는지 설명이 있음')

//  체크가 처음부터 꺼져 있어야 합니다 — 그대로 누르면 열 배 금액이 나갑니다.
//  (B의원은 7월 말 수거가 있어 정상 대상으로 남습니다 — 그건 켜져 있어야 합니다)
const boxA = p.locator(`[data-close-row="${CA}"] input[type="checkbox"]`)
ok(!(await boxA.isChecked()), '이상치가 있는 A병원은 처음부터 체크가 꺼져 있음')
const boxB = p.locator(`[data-close-row="${CB}"] input[type="checkbox"]`)
ok(await boxB.isChecked(), '멀쩡한 거래처는 그대로 켜져 있음 — 전부 꺼 버리지 않습니다')

await b.close()
console.log(`\n총 ${out.length}건 · 실패 ${out.filter((x) => !x).length}건`)
