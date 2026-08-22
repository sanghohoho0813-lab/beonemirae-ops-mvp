import { chromium, EXEC } from './_pw.mjs'

//  기기 시간대가 한국이 아닐 때 날짜가 하루 밀리지 않는지 확인합니다.
//
//   시각을 2026-08-31 15:30 UTC 로 고정합니다 = 한국 2026-09-01 00:30.
//   기기 시간대는 UTC 로 둡니다 (해외에서 열었거나 폰 시간대를 잘못 잡은
//   상황). 이때 화면이 기기 시각을 보면 「8월 31일」로, 달까지 8월로
//   읽습니다 — 청구월·명세서 발행일자·수거 시간이 모두 어긋납니다.
//
//   실제로 이 프로젝트에서 같은 부류의 결함이 두 번 나왔습니다(0027 서버
//   가드, 화면 today()). 남은 자리를 못 박습니다.

const BASE = 'http://localhost:4173'
const UID = '00000000-0000-0000-0000-0000000000ad'
const C1 = '00000000-0000-0000-0000-0000000000c1'

const out = []
const ok = (c, m, d = '') => {
  //  바로 찍습니다 — 모아 뒀다가 끝에 한 번에 내보내면 중간에 터졌을 때
  //  앞의 결과까지 전부 사라지고, 회귀 집계에 「검사 0 · 실패 0」으로
  //  남아 통과한 것처럼 보입니다.
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  out.push(c)
  if (!c) process.exitCode = 1
}

//  UTC 2026-08-31 15:30 = KST 2026-09-01 00:30
const FIXED = new Date('2026-08-31T15:30:00Z')
const KST_DATE = '2026-09-01'
const KST_MONTH = '2026-09'
const KST_HM = '00:30'

const profile = {
  id: UID, email: 'admin@beonemirae.test', name: '대표', role: 'admin', font_scale: 'normal',
  active: true, approved_at: '2026-01-01T00:00:00Z', client_id: null, created_at: '2026-01-01T00:00:00Z',
}
const clients = [{
  id: C1, name: '더원요양병원', type: '병원', address: '', manager: '', phone: '',
  collection_cycle: '주 1회', collects_medical_waste: true, collects_diaper: false,
  storage_size: '보통', note: '', is_demo_generated: false, demo_session_id: null, active: true,
  contract_start: null, contract_end: null, payment_terms: '익월 25일', payment_due_day: 25,
  pricing: { medical: { sale: 950, cost: 350 } },
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}]
const vehicles = [{
  id: 'v1', name: '의료 1톤 A', waste_type: '의료폐기물', tonnage: 1,
  nominal_capacity: 1000, expected_capacity: 670, driver: '김현수', active: true,
}]
//  9월 1일(한국)에 완료된 수거 한 건 — 9월 명세서에 잡혀야 합니다.
const sched = [{
  id: 's1', date: KST_DATE, client_id: C1, waste_type: '의료폐기물', vehicle_id: 'v1',
  scheduled_time: '09:00', status: '완료', expected_amount: 100, actual_amount: 100,
  completed_at: `${KST_DATE}T00:00:00Z`, memo: '', origin: 'field', is_additional: false,
  demo_session_id: null, plan_batch: null,
  created_at: `${KST_DATE}T00:00:00Z`, updated_at: `${KST_DATE}T00:00:00Z`,
}]

const b = await chromium.launch({ executablePath: EXEC })
//  기기 시간대를 UTC 로 — 한국이 아닌 기기를 그대로 재현합니다.
const ctx = await b.newContext({ viewport: { width: 1500, height: 1100 }, timezoneId: 'UTC' })
await ctx.clock.setFixedTime(FIXED)
await ctx.route('**/auth/v1/**', (r) =>
  r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: UID, aud: 'authenticated', email: profile.email, app_metadata: {}, user_metadata: {} }) }))
await ctx.route('**/rest/v1/**', (r) => {
  const url = r.request().url()
  const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
  const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
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
  expires_at: 4102444800, refresh_token: 'r', user: u,
})), ['beonemirae-ops:auth', { id: UID, aud: 'authenticated', email: profile.email, app_metadata: {}, user_metadata: {} }])

const body = () => p.textContent('main').then((t) => t ?? '')

// ── 0. 전제 확인 — 기기는 UTC, 한국은 이미 다음 날 ────────────────────────
await p.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(1500)
const probe = await p.evaluate(() => ({
  tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
  local: new Date().toString().slice(0, 24),
  kst: new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }),
}))
ok(probe.kst === KST_DATE, `한국 기준 오늘은 ${KST_DATE}`, `기기 ${probe.tz} · ${probe.local}`)
ok(!probe.local.includes('Sep'), '기기 시각은 아직 8월 31일 (하루 전)', probe.local)

// ── 1. 일정 편성 — 시작일이 한국 오늘 ─────────────────────────────────────
await p.goto(`${BASE}/plan`, { waitUntil: 'domcontentloaded' })
await p.waitForSelector('[data-plan-summary]', { timeout: 20000 })
await p.waitForTimeout(400)
let t = await body()
ok(/9월 1일/.test(t), '편성 시작일이 9월 1일 (8월 31일이 아님)', (t.match(/\d+월 \d+일 \([가-힣]\) ~ \d+월 \d+일/) ?? [''])[0])

// ── 2. 월말 청구 — 달 목록이 한국 기준 ────────────────────────────────────
await p.goto(`${BASE}/billing`, { waitUntil: 'domcontentloaded' })
await p.waitForSelector('[data-close-summary]', { timeout: 20000 })
await p.waitForTimeout(400)
ok((await p.locator(`[data-close-month="${KST_MONTH}"]`).count()) === 1,
  `달 목록에 ${KST_MONTH} 이 있음 (한국 기준 이번 달)`)
//  9월 1일 수거가 9월 청구 대상으로 잡혀야 합니다.
await p.locator(`[data-close-month="${KST_MONTH}"]`).click()
await p.waitForTimeout(500)
ok((await p.locator(`[data-close-row="${C1}"]`).count()) === 1, '9월 1일 수거가 9월 확정 대상으로 잡힘')
ok(/95,000원/.test((await p.locator(`[data-close-row="${C1}"]`).textContent()) ?? ''),
  '금액 95,000원 (100kg × 950원)')

// ── 3. 명세서 발행일자 — 아직 오지 않은 날짜가 찍히지 않아야 합니다 ───────
await p.goto(`${BASE}/clients/${C1}`, { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(1800)
await p.getByRole('button', { name: '월 정산·명세서' }).click()
await p.waitForTimeout(600)
//  정산 월은 처음부터 한국 기준 이번 달(9월)입니다.
const invBtn = p.getByRole('button', { name: '거래명세서' }).first()
ok((await invBtn.count()) === 1, '거래명세서 버튼이 있음')
ok(!(await invBtn.isDisabled()), '9월 정산에 내용이 있어 버튼이 열려 있음')
await invBtn.click()
await p.waitForTimeout(1000)
const inv = (await p.textContent('body')) ?? ''
const issued = (inv.match(/발행일자\s*:\s*(\d{4}년\s*\d{1,2}월\s*\d{1,2}일)/) ?? [])[1] ?? ''
ok(/9월\s*1일/.test(issued), '명세서 발행일자가 9월 1일 (월말 9월 30일이 아님)', issued || '(못 읽음)')
ok(!/9월\s*30일/.test(issued), '아직 오지 않은 날짜가 병원 문서에 찍히지 않음', issued)
const range = (inv.match(/거래일자\s*:\s*(\d{4}년\s*\d{1,2}월\s*\d{1,2}일\s*~\s*\d{1,2}일)/) ?? [])[1] ?? ''
ok(/~\s*1일/.test(range), '거래기간 종료일도 9월 1일까지', range || '(못 읽음)')

// ── 4. 수거 입력 — 실제 수거 시간 프리필이 한국 시각 ──────────────────────
await p.goto(`${BASE}/collection`, { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(1800)
const timeInput = p.locator('input[type=time]').first()
if (await timeInput.count()) {
  const v = await timeInput.inputValue()
  ok(v === KST_HM, `실제 수거 시간이 한국 시각 ${KST_HM} (기기 시각 15:30 이 아님)`, v)
} else {
  const txt = await body()
  ok(txt.includes(KST_HM), `수거 시간 ${KST_HM} 이 화면에 있음`, (txt.match(/\d\d:\d\d/g) ?? []).join(','))
}

await b.close()
console.log('')
console.log(`총 ${out.length}건 · 실패 ${out.filter((v) => !v).length}건`)
