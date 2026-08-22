import { chromium, EXEC } from './_pw.mjs'

//  물품 개수 자릿수 방어 + 월정액 「수거 0건에도 청구」 계약정책.
//
//   ① 박스 개당으로 정산하는 거래처가 실제로 있습니다 — 서울온케어 35L
//      8,000원 · 삼성서울연합 63L 18,000원. 여기서는 개수가 곧 금액이라
//      3개를 30개로 치면 청구액이 열 배가 됩니다. kg 만 보면 절반입니다.
//
//   ② 월정액 계약 중에는 수거가 없어도 계약상 기본료를 받는 것이
//      있습니다. 지금까지는 그런 달이 「확인 필요」로 빠져서 이사님이
//      거래처 화면에서 손으로 만들어야 했습니다 — 매달 반복됩니다.
//      단, 시스템이 짐작해 켜지 않습니다. 계약 기간 밖에도 안 올립니다.

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
  id: UID, email: 'admin@beonemirae.test', name: '대표', role: 'admin', font_scale: 'normal',
  active: true, approved_at: '2026-01-01T00:00:00Z', client_id: null, created_at: '2026-01-01T00:00:00Z',
}
const mkClient = (id, name, o = {}) => ({
  id, name, type: '병원', address: '', manager: '', phone: '', collection_cycle: '주 1회',
  collects_medical_waste: true, collects_diaper: false, storage_size: '보통', note: '',
  is_demo_generated: false, demo_session_id: null, active: true,
  contract_start: o.start ?? null, contract_end: o.end ?? null, payment_terms: '', payment_due_day: null,
  pricing: o.pricing ?? { medical: { sale: 950, cost: 350 } },
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  biz_no: null, biz_ceo: null, biz_type: null, biz_item: null, tax_email: null, vat_mode: null,
  flat_fee_when_empty: o.flatEmpty ?? false,
})
//  박스 개당 정산 거래처 (서울온케어 35L 8,000원)
const CBOX = '00000000-0000-0000-0000-0000000000a1'
//  월정액 — 수거 0건에도 청구 (켜짐)
const CON = '00000000-0000-0000-0000-0000000000b1'
//  월정액 — 지금까지와 같음 (꺼짐)
const COFF = '00000000-0000-0000-0000-0000000000c1'
//  월정액 · 켜짐이지만 지난달에 계약 종료
const CEND = '00000000-0000-0000-0000-0000000000d1'
const FLAT = { medicalMonthly: { sale: 9000000, cost: null } }
const clients = [
  mkClient(CBOX, '서울온케어의원', { pricing: { medical: { sale: 950, cost: 350 }, box35: { sale: 8000, cost: 1045 } } }),
  mkClient(CON, '오남한양병원', { pricing: FLAT, flatEmpty: true }),
  mkClient(COFF, '해올요양병원', { pricing: FLAT, flatEmpty: false }),
  mkClient(CEND, '종료병원', { pricing: FLAT, flatEmpty: true, end: `${PREV}-01` }),
]

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
const mkMat = (id, clientId, date, items) => ({
  id, date, client_id: clientId, box_count: 0, vinyl_count: 0, needle_box_count: 0,
  is_additional_request: false, memo: '', items,
})

//  서울온케어 — 최근 6번 모두 35L 박스 3개 (평소 3개)
const schedules = []
const materials = []
for (let w = 1; w <= 6; w += 1) {
  const d = shift(TODAY, -7 * w)
  schedules.push(mkSched(`sb${w}`, CBOX, d, 100))
  materials.push(mkMat(`mb${w}`, CBOX, d, { box35: 3 }))
}
//  지난달에 이미 저장된 이상치 — 박스 30개
schedules.push(mkSched('sodd', CBOX, `${PREV}-10`, 100))
materials.push(mkMat('modd', CBOX, `${PREV}-10`, { box35: 30 }))

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
  if (url.includes('/rpc/app_schema_version')) return json(35)
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
  if (url.includes('/materials')) return json(materials)
  if (url.includes('/vehicles')) return json(vehicles)
  if (url.includes('/clients')) return json(single ? clients[0] : clients)
  if (url.includes('/office_stock')) return json(single
    ? { id: 1, corrugated_box: 500, plastic_container: 500, bag: 500, needle_box: 500 }
    : [{ id: 1, corrugated_box: 500, plastic_container: 500, bag: 500, needle_box: 500 }])
  return json([])
})
const p = await ctx.newPage()
await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
  access_token: 't', token_type: 'bearer', expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
})), ['beonemirae-ops:auth', { id: UID, aud: 'authenticated', email: profile.email, app_metadata: {}, user_metadata: {} }])

let answer = false
p.on('dialog', (d) => {
  dialogs.push(d.message())
  if (answer) void d.accept()
  else void d.dismiss()
})

// ── 1. 박스 3개 → 30개 — 저장 전에 물어본다 ──────────────────────────────
await p.goto(`${BASE}/collection`, { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(2400)
await p.locator('select').first().selectOption(CBOX)
await p.waitForTimeout(500)
await p.locator('select').nth(1).selectOption('v1')
await p.locator('input[placeholder="예: 320"]').fill('100')
//  35L 박스 칸 — QtyField 가 aria-label 에 품목명을 답니다.
await p.locator('input[aria-label="35L 박스"]').fill('30')
await p.waitForTimeout(500)
dialogs.length = 0
posted.length = 0
answer = false
await p.locator('[data-tour="collect-save"]').click()
await p.waitForTimeout(1500)
const msg = dialogs.join(' ')
ok(/평소와 크게 다른 공급 수량/.test(msg), '물품 개수도 저장 전에 물어봄', msg.slice(0, 110))
ok(/35L 박스 30개 \(평소 3개\)/.test(msg), '품목·개수·평소 개수를 그대로 적음', msg.slice(0, 120))
ok(posted.length === 0, '「아니오」면 저장하지 않음', String(posted.length))

// ── 2. 평소 개수면 묻지 않는다 ────────────────────────────────────────────
await p.goto(`${BASE}/collection`, { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(2400)
await p.locator('select').first().selectOption(CBOX)
await p.waitForTimeout(500)
await p.locator('select').nth(1).selectOption('v1')
await p.locator('input[placeholder="예: 320"]').fill('100')
await p.locator('input[aria-label="35L 박스"]').fill('4')
await p.waitForTimeout(500)
dialogs.length = 0
posted.length = 0
answer = true
await p.locator('[data-tour="collect-save"]').click()
await p.waitForTimeout(2000)
ok(!dialogs.some((d) => /공급 수량/.test(d)), '평소와 비슷한 개수(4개)면 묻지 않음', dialogs.join(' ').slice(0, 70))
ok(posted.length === 1, '그대로 저장')

// ── 3. 월말 청구가 이미 저장된 개수 이상치를 잡는다 ──────────────────────
await p.goto(`${BASE}/billing`, { waitUntil: 'domcontentloaded' })
await p.waitForSelector('[data-close-summary]', { timeout: 20000 })
await p.waitForTimeout(1200)
ok((await p.locator(`[data-close-odd-item="${CBOX}"]`).count()) === 1, '평소와 다른 공급 수량을 표시')
const oddTxt = ((await p.textContent(`[data-close-odd-item="${CBOX}"]`)) ?? '').replace(/\s+/g, ' ')
ok(/35L 박스 30개 \(평소 3개\)/.test(oddTxt), '어느 날 무엇이 몇 개인지 그대로', oddTxt.slice(0, 90))
const boxA = p.locator(`[data-close-row="${CBOX}"] input[type="checkbox"]`)
ok(!(await boxA.isChecked()), '개수 이상치가 있는 곳도 처음부터 체크가 꺼져 있음')

// ── 4. 월정액 — 수거 0건인 달 ─────────────────────────────────────────────
const body = ((await p.textContent('main')) ?? '').replace(/\s+/g, ' ')
//  켜 둔 곳은 정상 대상으로 올라옵니다 (자동 확정이 아니라 목록에 오를 뿐)
ok((await p.locator(`[data-close-row="${CON}"]`).count()) === 1,
  '「수거 0건에도 청구」를 켠 월정액 거래처는 청구 대상으로 올라옴')
const rowOn = ((await p.textContent(`[data-close-row="${CON}"]`)) ?? '').replace(/\s+/g, ' ')
ok(/9,000,000원/.test(rowOn), '월정액 금액 그대로', rowOn.slice(0, 90))

//  꺼 둔 곳은 지금까지와 같이 「확인 필요」에 남습니다
ok((await p.locator(`[data-close-row="${COFF}"]`).count()) === 0, '꺼 둔 곳은 자동으로 청구 대상이 되지 않음')
ok(/해올요양병원/.test(body) && /「배출 없는 달」 청구 여부를 한 번만 정해 주세요/.test(body),
  '아직 안 정한 곳은 「확인 필요」로 돌리고 갈 자리를 말함 (0044)')

//  계약이 끝난 곳은 켜 두었어도 올리지 않습니다 — 가장 위험한 사고입니다
ok((await p.locator(`[data-close-row="${CEND}"]`).count()) === 0,
  '계약 종료 뒤에는 켜 두었어도 기본료를 올리지 않음')
const endRow = (await p.locator('[data-close-row], [data-close-skipped] > div, [data-close-needs] > div')
  .filter({ hasText: '종료병원' }).allTextContents()).join(' ').replace(/\s+/g, ' ')
ok(!/9,000,000원/.test(endRow), '해지한 거래처 줄에 기본료 금액이 없음', endRow.slice(0, 90) || '(행 없음)')

await b.close()
console.log(`\n총 ${out.length}건 · 실패 ${out.filter((x) => !x).length}건`)
