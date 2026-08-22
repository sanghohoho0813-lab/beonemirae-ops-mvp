import { chromium, EXEC } from './_pw.mjs'

//  경영 매출 현황 — 한 달에 하나의 값.
//
//   전에는 같은 달의 매출이 화면마다 달랐습니다. 특히 엑셀에서만 넘어온
//   거래처(명세서에 날짜가 없어 월 합계만 있는 곳)는 회사 매출에서 통째로
//   빠졌습니다.
//
//   시나리오 — 지난달(PREV)
//    A병원  확정 청구 1,000,000원  + 같은 달 엑셀 실적 900,000원
//           → **확정**만 씁니다. 1,900,000원이 되면 안 됩니다.
//    B의원  엑셀 실적 850,000원만 (수거 기록 없음)
//           → **Excel 실적**. 예전에는 0원으로 빠졌습니다.
//    C의원  완료된 수거 100kg × 950원 = 95,000원, 아직 확정 안 함
//           → **추정**
//    D의원  직접입력 1,234,567원 (확정 500,000원을 덮음)
//           → **직접입력**. 덮은 값이 무엇인지 화면에 남아야 합니다
//
//   합계 = 1,000,000 + 850,000 + 95,000 + 1,234,567 = 3,179,567원 (1원까지)

const BASE = 'http://localhost:4173'
const UID = '00000000-0000-0000-0000-0000000000ad'

const out = []
const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  out.push(c)
  if (!c) process.exitCode = 1
}

const TODAY = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
const [Y, M] = TODAY.slice(0, 7).split('-').map(Number)
const monthAt = (back) => {
  const t = Y * 12 + (M - 1) - back
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`
}
const PREV = monthAt(1)

const profile = {
  id: UID, email: 'admin@beonemirae.test', name: '대표', role: 'admin', font_scale: 'normal',
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
  flat_fee_when_empty: false,
})
const CA = '00000000-0000-0000-0000-0000000000a1'
const CB = '00000000-0000-0000-0000-0000000000b1'
const CC = '00000000-0000-0000-0000-0000000000c1'
const CD = '00000000-0000-0000-0000-0000000000d1'
const clients = [mkClient(CA, 'A병원'), mkClient(CB, 'B의원'), mkClient(CC, 'C의원'), mkClient(CD, 'D의원')]

const mkSched = (id, clientId, date, kg) => ({
  id, date, client_id: clientId, waste_type: '의료폐기물', vehicle_id: null,
  scheduled_time: '', status: '완료', expected_amount: kg, actual_amount: kg,
  completed_at: `${date}T09:00:00Z`, memo: '', origin: 'app', is_additional: false,
  demo_session_id: null, plan_batch: null, created_at: `${date}T00:00:00Z`, updated_at: `${date}T00:00:00Z`,
})
//  A 는 확정된 수거(스냅샷이 덮음) · C 는 미확정
const schedules = [
  mkSched('sa', CA, `${PREV}-05`, 1000),
  mkSched('sc', CC, `${PREV}-07`, 100),
]

const mkPay = (id, clientId, amount) => ({
  id, client_id: clientId, billing_month: PREV, amount, status: '미수금',
  method: '무통장', paid_at: null, memo: '', demo_session_id: null,
  snapshot: { kind: '정기', confirmedAt: `${PREV}-28T00:00:00Z`, scheduleIds: ['sa'], materialIds: [] },
  canceled_at: null, created_at: `${PREV}-28T00:00:00Z`, updated_at: `${PREV}-28T00:00:00Z`,
})
const payments = [mkPay('pa', CA, 1000000), mkPay('pd', CD, 500000)]

const mkXl = (id, clientId, revenue) => ({
  id, client_id: clientId, month: PREV, medical_kg: 500, diaper_kg: 0,
  revenue, cost: 0, profit: revenue, has_dated: false, source_file: 'x.xlsx',
})
const monthlyActuals = [mkXl('x1', CA, 900000), mkXl('x2', CB, 850000)]

let overrides = [{
  id: 'o1', client_id: CD, month: PREV, amount: 1234567,
  reason: '계약서상 월정액', actor_name: '대표',
  created_at: `${TODAY}T00:00:00Z`, updated_at: `${TODAY}T00:00:00Z`,
}]

const rpc = []
const b = await chromium.launch({ executablePath: EXEC })
const ctx = await b.newContext({ viewport: { width: 1500, height: 1400 } })
await ctx.route('**/auth/v1/**', (r) =>
  r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: UID, aud: 'authenticated', email: profile.email, app_metadata: {}, user_metadata: {} }) }))
await ctx.route('**/rest/v1/**', (r) => {
  const url = r.request().url()
  const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
  const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
  if (url.includes('/rpc/app_schema_version')) return json(38)
  if (url.includes('/rpc/set_revenue_override')) {
    const body = JSON.parse(r.request().postData() ?? '{}')
    rpc.push({ kind: 'set', ...body })
    const prev = overrides.find((o) => o.client_id === body.p_client_id && o.month === body.p_month)
    overrides = overrides.filter((o) => o !== prev)
    overrides.push({
      id: 'new', client_id: body.p_client_id, month: body.p_month, amount: body.p_amount,
      reason: body.p_reason, actor_name: '대표',
      created_at: `${TODAY}T00:00:00Z`, updated_at: `${TODAY}T00:00:00Z`,
    })
    return json({ id: 'new', created: !prev, before: prev ? prev.amount : null, amount: body.p_amount })
  }
  if (url.includes('/rpc/delete_revenue_override')) {
    const body = JSON.parse(r.request().postData() ?? '{}')
    rpc.push({ kind: 'del', ...body })
    overrides = overrides.filter((o) => !(o.client_id === body.p_client_id && o.month === body.p_month))
    return json({ month: body.p_month })
  }
  if (url.includes('/revenue_overrides') && r.request().method() === 'PATCH') {
    rpc.push({ kind: 'DIRECT_PATCH' })
    return json([{ id: 'x' }])
  }
  if (url.includes('/audit_logs')) return json([{ id: 1 }])
  if (url.includes('/profiles')) return json(single ? profile : [profile])
  if (url.includes('/revenue_overrides')) return json(overrides)
  if (url.includes('/client_monthly_actuals')) return json(monthlyActuals)
  if (url.includes('/client_prices')) return json([])
  if (url.includes('/holidays')) return json([])
  if (url.includes('/payment_receipts')) return json([])
  if (url.includes('/payments')) return json(payments)
  if (url.includes('/schedules')) return json(schedules)
  if (url.includes('/clients')) return json(single ? clients[0] : clients)
  if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
  return json([])
})
const p = await ctx.newPage()
await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
  access_token: 't', token_type: 'bearer', expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
})), ['beonemirae-ops:auth', { id: UID, aud: 'authenticated', email: profile.email, app_metadata: {}, user_metadata: {} }])

let promptOk = true
p.on('dialog', (d) => { if (promptOk) void d.accept(); else void d.dismiss() })

const txt = async (sel) => ((await p.textContent(sel)) ?? '').replace(/\s+/g, ' ')

await p.goto(`${BASE}/revenue`, { waitUntil: 'domcontentloaded' })
await p.waitForSelector('[data-revenue-kpis]', { timeout: 20000 })
await p.waitForTimeout(1500)
//  지난달로 — 이번 달은 자료가 없습니다
await p.click(`[data-revenue-bar="${PREV}"]`)
await p.waitForTimeout(900)

// ── 1. 한 달에 하나의 값 — 중복 집계가 없다 ───────────────────────────────
const mix = await txt('[data-revenue-mix]')
ok(/확정\s*1,000,000원/.test(mix), 'A병원은 확정만 (엑셀 900,000원을 더하지 않음)', mix.slice(0, 120))
ok(!/1,900,000/.test(mix), '확정 + 엑셀 을 합치지 않음 — 중복 집계 없음')
ok(/Excel 실적\s*850,000원/.test(mix), 'B의원은 엑셀 실적 — 예전에는 0원으로 빠졌습니다')
ok(/추정\s*95,000원/.test(mix), 'C의원은 미확정이라 추정')
ok(/직접입력\s*1,234,567원/.test(mix), 'D의원은 직접입력이 확정을 덮음')

// ── 2. 합계가 1원까지 맞는가 ──────────────────────────────────────────────
//  1,000,000 + 850,000 + 95,000 + 1,234,567 = 3,179,567
const head = await txt('.pill')
ok(/3,179,567원/.test(await txt('main')), '그 달 합계가 1원까지 맞음 (3,179,567원)', head)

// ── 3. 줄마다 출처를 표시한다 ─────────────────────────────────────────────
const rowA = await txt(`[data-revenue-row="${CA}"]`)
ok(/확정/.test(rowA) && /1,000,000원/.test(rowA), 'A병원 줄 — 확정', rowA.slice(0, 70))
const rowB = await txt(`[data-revenue-row="${CB}"]`)
ok(/Excel 실적/.test(rowB) && /850,000원/.test(rowB), 'B의원 줄 — Excel 실적', rowB.slice(0, 70))
const rowC = await txt(`[data-revenue-row="${CC}"]`)
ok(/추정/.test(rowC), 'C의원 줄 — 추정')

// ── 4. 직접입력이 무엇을 덮고 있는지 보여 준다 ────────────────────────────
const rowD = await txt(`[data-revenue-row="${CD}"]`)
ok(/직접입력/.test(rowD) && /1,234,567원/.test(rowD), 'D의원 줄 — 직접입력')
ok(/확정 500,000원 대신/.test(rowD), '무엇을 덮고 있는지 그대로 적음', rowD.slice(0, 110))
ok(/사유 · 계약서상 월정액/.test(rowD), '사유도 함께')

// ── 5. 사유 없이 저장하지 못한다 ──────────────────────────────────────────
await p.click(`[data-revenue-edit="${CC}"]`)
await p.waitForTimeout(600)
await p.fill('[data-revenue-amount]', '500000')
await p.fill('[data-revenue-reason]', '')
rpc.length = 0
await p.click('[data-revenue-save]')
await p.waitForTimeout(900)
ok(rpc.length === 0, '사유가 비면 서버까지 가지도 않음', String(rpc.length))
ok(/사유를 적어 주세요/.test(await txt('[data-revenue-modal-error]')), '왜 안 되는지 화면에 적음',
  await txt('[data-revenue-modal-error]'))

// ── 6. 기존 값을 조용히 덮지 않는다 ───────────────────────────────────────
//  「지금 값 → 바꿀 값」을 보여 주고 확인을 받습니다. 취소하면 저장 안 함.
await p.fill('[data-revenue-reason]', '계약서 확인')
promptOk = false
rpc.length = 0
await p.click('[data-revenue-save]')
await p.waitForTimeout(900)
ok(rpc.length === 0, '확인 창에서 「아니오」를 고르면 저장하지 않음', String(rpc.length))

promptOk = true
await p.click('[data-revenue-save]')
await p.waitForTimeout(1600)
ok(rpc.length === 1 && rpc[0].kind === 'set', '「예」면 서버 함수로 한 번 저장', JSON.stringify(rpc[0]?.kind))
ok(!rpc.some((c) => c.kind === 'DIRECT_PATCH'), '표를 직접 고치지 않음 — 함수로만')
ok(rpc[0]?.p_amount === 500000 && rpc[0]?.p_reason === '계약서 확인' && rpc[0]?.p_month === PREV,
  '금액 · 사유 · 대상월을 그대로 보냄', JSON.stringify(rpc[0]))
ok(rpc[0]?.p_client_id === CC, 'C의원에만')

const msg = await txt('[data-revenue-msg]')
ok(/95,000원 → 500,000원으로 조정/.test(msg) || /500,000원으로 넣었습니다/.test(msg),
  '이전 값과 새 값을 함께 알려 줌', msg.slice(0, 90))

// ── 7. 조정 뒤 합계가 다시 계산된다 ───────────────────────────────────────
//  95,000 → 500,000 이므로 3,179,567 + 405,000 = 3,584,567
await p.waitForTimeout(600)
ok(/3,584,567원/.test(await txt('main')), '조정 뒤 합계가 1원까지 다시 맞음 (3,584,567원)')

// ── 8. 되돌리기 ───────────────────────────────────────────────────────────
rpc.length = 0
await p.click(`[data-revenue-undo="${CC}"]`)
await p.waitForTimeout(1600)
ok(rpc.length === 1 && rpc[0].kind === 'del', '되돌리기도 서버 함수로', JSON.stringify(rpc[0]?.kind))
await p.waitForTimeout(600)
ok(/3,179,567원/.test(await txt('main')), '되돌리면 다시 추정으로 — 합계가 원래대로')

// ── 9. 대시보드 네 숫자 ───────────────────────────────────────────────────
await p.goto(BASE, { waitUntil: 'domcontentloaded' })
await p.waitForSelector('[data-revenue-kpis]', { timeout: 20000 })
await p.waitForTimeout(1200)
const kpi = await txt('[data-revenue-kpis]')
ok(/누적매출/.test(kpi), '올해 누적매출')
ok(/월평균 매출/.test(kpi), '월평균 매출')
ok(/예상 연매출/.test(kpi), '예상 연매출')
ok(/현재 미수금/.test(kpi), '현재 미수금')

// ── 10. 근거가 모자라면 계산하지 않는다 ───────────────────────────────────
//  이 자료에는 끝난 달이 1개뿐입니다 — 그것으로 연매출을 말하면 안 됩니다.
const avg = await txt('[data-revenue-kpi="avg"]')
ok(avg.includes('—'), '끝난 달이 3개월 미만이면 월평균을 계산하지 않음', avg.slice(0, 70))
ok(/3개월이 쌓이면 계산합니다/.test(avg), '왜 비어 있는지 적음')
const proj = await txt('[data-revenue-kpi="proj"]')
ok(proj.includes('—'), '예상 연매출도 계산하지 않음')
ok(/끝난 달이 1개월뿐입니다/.test(proj), '근거가 몇 개월인지 그대로', proj.slice(0, 70))

// ── 11. 진행 중인 달은 평균에서 뺀다 ──────────────────────────────────────
const ytd = await txt('[data-revenue-kpi="ytd"]')
ok(/개월치/.test(ytd), '누적이 몇 개월치인지', ytd.slice(0, 60))

// ── 12. 현장 담당자에게는 열리지 않는다 ───────────────────────────────────
const ctx2 = await b.newContext({ viewport: { width: 1500, height: 1000 } })
await ctx2.route('**/auth/v1/**', (r) =>
  r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: UID, aud: 'authenticated', email: 'f@b.c', app_metadata: {}, user_metadata: {} }) }))
await ctx2.route('**/rest/v1/**', (r) => {
  const url = r.request().url()
  const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
  const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
  if (url.includes('/rpc/app_schema_version')) return json(38)
  if (url.includes('/profiles')) return json(single ? { ...profile, role: 'field' } : [{ ...profile, role: 'field' }])
  if (url.includes('/clients')) return json(single ? clients[0] : clients)
  if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
  return json([])
})
const p2 = await ctx2.newPage()
await p2.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
  access_token: 't', token_type: 'bearer', expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
})), ['beonemirae-ops:auth', { id: UID, aud: 'authenticated', email: 'f@b.c', app_metadata: {}, user_metadata: {} }])
await p2.goto(`${BASE}/revenue`, { waitUntil: 'domcontentloaded' })
await p2.waitForTimeout(2400)
const body2 = ((await p2.textContent('body')) ?? '').replace(/\s+/g, ' ')
ok(!/예상 연매출/.test(body2), '현장 담당자에게는 매출 현황이 열리지 않음', body2.slice(0, 60))

await b.close()
console.log(`\n총 ${out.length}건 · 실패 ${out.filter((x) => !x).length}건`)
