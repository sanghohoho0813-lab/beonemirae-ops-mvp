import { chromium, EXEC } from './_pw.mjs'

//  회사 자신에 대한 사실 — 직원 명부 · 국세청 신고 매출 (0047).
//
//   실제 자료를 씁니다 (부가가치세과세표준증명 0615-473-4511-219 · 2026-03-19).
//   증감률은 손으로 계산해 둔 값과 맞대 봅니다 — 시스템이 낸 값에 기대를
//   맞추지 않습니다.
//
//     2026 상반기 453,873,146 ÷ 2025 상반기 223,497,401 → +103.1%
//     2025 하반기 357,344,046 ÷ 2024 하반기 233,800,428 → +52.8%
//     2025 상반기 223,497,401 ÷ 2024 상반기 129,181,590 → +73.0%
//     2024 하반기 233,800,428 ÷ 2023 하반기  83,557,010 → +179.8%
//     2024 상반기 129,181,590 ÷ 2023 상반기  47,185,960 → +173.8%
//     2025년 580,841,447 ÷ 2024년 362,982,018 → +60.0%
//     2024년 362,982,018 ÷ 2023년 130,742,970 → +177.6%

const BASE = 'http://localhost:4173'
const UID = '00000000-0000-0000-0000-0000000000ad'
const out = []
const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  out.push(c)
  if (!c) process.exitCode = 1
}

const me = {
  id: UID, email: 'a@b.c', name: '송명근', role: 'admin', font_scale: 'normal',
  active: true, approved_at: '2023-05-01T00:00:00Z', client_id: null, created_at: '2023-05-01T00:00:00Z',
}
const SRC = '0615-473-4511-219'
const filings = [
  ['2023-01-01', '2023-06-30', 47185960, 12529600, 34656360, 1292597],
  ['2023-07-01', '2023-12-31', 83557010, 12480460, 71076550, -926308],
  ['2024-01-01', '2024-06-30', 129181590, 41851340, 87330250, 2057844],
  ['2024-07-01', '2024-12-31', 233800428, 126601568, 107198860, 4614988],
  ['2025-01-01', '2025-06-30', 223497401, 91493311, 132004090, 3371880],
  ['2025-07-01', '2025-12-31', 357344046, 106032468, 251311578, 3500612],
  ['2026-01-01', '2026-06-30', 453873146, 98397666, 355475480, -869186],
].map(([period_from, period_to, base_total, base_taxed, base_exempt, tax_payable], i) => ({
  id: i + 1, period_from, period_to, base_total, base_taxed, base_exempt, tax_payable,
  source_no: SRC, issued_on: '2026-03-19', note: '',
}))
const staff = [
  ['송명근', '대표', '해당없음', '2023-05-01'],
  ['홍현주', '이사', '해당없음', '2023-05-01'],
  ['오대성', '현장', '의료폐기물', '2023-06-01'],
  ['백광호', '현장', '일회용기저귀', '2025-05-20'],
  ['김진환', '현장', '일회용기저귀', '2025-12-01'],
  ['김준기', '현장', '의료폐기물', '2026-03-01'],
].map(([name, position, waste_scope, insured_from], i) => ({
  id: `00000000-0000-0000-0000-00000000000${i + 1}`,
  name, position, waste_scope, insured_from, insurance: {}, active: true, note: '',
}))

const b = await chromium.launch({ executablePath: EXEC })

function wire(ctx, { role = 'admin', tax = filings, people = staff, calls = [] } = {}) {
  ctx.route('**/auth/v1/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: UID, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }) }))
  ctx.route('**/rest/v1/**', (r) => {
    const url = r.request().url()
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const pf = { ...me, role }
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    if (url.includes('/rpc/app_schema_version')) return json(64)
    if (url.includes('/rpc/app_health_check')) return json({ version: 47, ok: true, missing: [], checkedAt: '' })
    if (url.includes('/rpc/recent_app_errors')) return json({ days: 7, total: 0, groups: [], checkedAt: '' })
    if (url.includes('/profiles')) return json(single ? pf : [pf])
    if (url.includes('/rpc/set_tax_filing_confirmed')) {
      calls.push(r.request().postDataJSON())
      return json({ id: 7, confirmed: true, changed: true })
    }
    if (url.includes('/tax_filings')) return json(tax)
    if (url.includes('/staff')) return json(people)
    if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
    return json([])
  })
}
async function open(ctx, path) {
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: UID, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }])
  await p.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(2400)
  return p
}
const flat = (s) => (s ?? '').replace(/\s+/g, ' ')

// ── 1. 전년 동기 대비 ─────────────────────────────────────────────────────
{
  const calls = []
  const ctx = await b.newContext({ viewport: { width: 1500, height: 1400 } })
  wire(ctx, { calls })
  const p = await open(ctx, '/revenue')
  await p.waitForSelector('[data-tax-base]', { timeout: 20000 })

  const latest = flat(await p.textContent('[data-tax-latest]'))
  ok(/2026년 상반기/.test(latest), '가장 최근 반기를 맨 위에', latest.slice(0, 40))
  ok(/453,873,146/.test(latest), '증명서 금액 그대로 (453,873,146원)')
  ok(/\+103\.1%/.test(latest), '전년 동기 대비 +103.1% — 손으로 계산한 값과 같음', latest.slice(0, 90))
  ok(/223,497,401/.test(latest), '작년 같은 반기 금액도 함께')
  ok(/\+230,375,745/.test(latest), '늘어난 금액을 원 단위로', (latest.match(/\+2[\d,]+원/) ?? [''])[0])

  //  확정 전 표시 — 증명서를 그 기간이 끝나기 전에 뽑았습니다
  const prov = flat(await p.textContent('[data-tax-provisional]'))
  ok(/확정 전/.test(prov), '확정 전이라고 밝힘 — 확정된 실적처럼 보여 주지 않음')
  ok(/2026-03-19/.test(prov), '왜 확정 전인지 (증명 발급일)까지', prov.slice(0, 80))
  //  대표님만 「확정된 값입니다」를 누를 수 있습니다 — 종이만으로는 알 수
  //  없고, 아는 사람이 대표님뿐이기 때문입니다.
  ok((await p.locator('[data-tax-confirm]').count()) === 1, '대표님에게 확정 표시 단추가 있음')
  await p.click('[data-tax-confirm]')
  await p.waitForTimeout(900)
  ok(calls.length === 1 && calls[0].p_confirmed === true,
    '확정으로 표시해 달라고 서버에 보냄 — 화면이 혼자 정하지 않음', JSON.stringify(calls[0] ?? {}))
  ok(typeof calls[0]?.p_id === 'number', '어느 과세기간인지 함께', String(calls[0]?.p_id))

  //  반기 표 — 다섯 반기에 전년 대비가 붙습니다
  const table = flat(await p.textContent('[data-tax-table]'))
  for (const [row, want] of [
    ['2025-2', '+52.8%'], ['2025-1', '+73%'], ['2024-2', '+179.8%'], ['2024-1', '+173.8%'],
  ]) {
    const cell = flat(await p.textContent(`[data-tax-row="${row}"]`))
    ok(cell.includes(want), `${row} 전년 동기 ${want}`, cell.slice(0, 70))
  }
  const first = flat(await p.textContent('[data-tax-row="2023-1"]'))
  ok(/비교할 작년 없음/.test(first), '2023 상반기는 비교할 작년이 없다고 말함 — 0%로 위장하지 않음', first.slice(0, 60))

  //  과세·면세를 따로
  ok(/12,529,600/.test(table) && /34,656,360/.test(table), '과세분·면세분을 따로 적음')
  ok(/의료폐기물 수집·운반은 면세/.test(flat(await p.textContent('[data-tax-base]'))),
    '면세분이 큰 이유를 설명함 — 과세분만 매출로 읽지 않게')

  //  연도별
  const years = flat(await p.textContent('[data-tax-years]'))
  ok(/\+177\.6%/.test(years), '2024년 전년 대비 +177.6%', years.slice(0, 60))
  ok(/\+60%/.test(years), '2025년 전년 대비 +60.0%')
  ok(/2026년 \(반기만\)/.test(years), '반기만 있는 해는 그렇게 밝힘')
  ok(!/2026년 \(반기만\)[^0-9+-]*[+-]/.test(years.replace(/[\d,원]/g, '')),
    '반쪽인 해를 온전한 해와 맞대 「반토막」으로 보여 주지 않음')
  ok(/증명 2026\.03\.19 발급/.test(flat(await p.textContent('[data-tax-base]'))), '출처(발급일)를 밝힘')
  ok(new RegExp(SRC).test(flat(await p.textContent('[data-tax-base]'))), '증명번호도')
  await ctx.close()
}

// ── 1-b. 대표님이 확정으로 확인해 준 반기 ────────────────────────────────
//
//   증명서 발급일만 보면 「확정 전」이 맞습니다. 그러나 확정인지 아는 사람은
//   대표님뿐이고, 확인해 주셨으면 시스템이 계속 「확정 전」이라 부르면 안 됩니다.
//
//   그리고 확정된 신고가 올해를 덮으면 **누적매출의 기준**이 바뀝니다 —
//   시스템 집계는 거래처가 다 안 들어와 실제의 몇 분의 일이기 때문입니다.
{
  const confirmed = filings.map((f) =>
    f.period_from === '2026-01-01' ? { ...f, confirmed_at: '2026-08-16T00:00:00Z' } : f)
  const ctx = await b.newContext({ viewport: { width: 1500, height: 1500 } })
  wire(ctx, { tax: confirmed })
  const p = await open(ctx, '/revenue')
  await p.waitForSelector('[data-tax-base]', { timeout: 20000 })

  ok((await p.locator('[data-tax-provisional]').count()) === 0,
    '**「확정 전」이 사라짐** — 사람이 확인해 준 것을 계속 의심하지 않음')
  const row = flat(await p.textContent('[data-tax-row="2026-1"]'))
  ok(/확정/.test(row) && !/확정 전/.test(row), '그 줄에 「확정」이라고 적힘', row.slice(0, 40))
  //  다른 반기는 건드리지 않습니다 — 사람이 확인한 것만 확정입니다.
  const other = flat(await p.textContent('[data-tax-row="2025-2"]'))
  ok(!/확정/.test(other), '확인 안 한 반기는 그대로', other.slice(0, 40))

  //  누적매출이 신고 기준으로 바뀌는가
  const kpi = flat(await p.textContent('[data-revenue-kpi="ytd"]'))
  ok(/4\.5억/.test(kpi), '올해 누적매출이 신고액 기준(4.5억)', kpi.slice(0, 80))
  ok(/국세청 신고 기준/.test(kpi), '어느 자료로 낸 숫자인지 그대로 적음')
  const avg = flat(await p.textContent('[data-revenue-kpi="avg"]'))
  //  453,873,146 ÷ 6 = 75,645,524.33 → 75,645,524
  //  453,873,146 ÷ 6 = 75,645,524.33 → 7,565만원
  ok(/7,565만원/.test(avg), '월평균 = 신고액 ÷ 6개월', avg.slice(0, 70))
  ok(/÷ 6개월/.test(avg), '산식을 그대로 적음')
  const proj = flat(await p.textContent('[data-revenue-kpi="proj"]'))
  //  75,645,524 × 12 = 907,746,288 → 9.1억
  ok(/9\.1억/.test(proj), '예상 연매출 = 월평균 × 12', proj.slice(0, 70))

  //  7월 이후는 **더하지 않고** 따로 — 전체 자료와 일부 자료를 더하면
  //  「7월에 매출이 급감했다」로 읽힙니다.
  const after = flat(await p.textContent('[data-revenue-after]'))
  ok(/더하지 않았습니다/.test(after), '신고 뒤의 달을 누적에 안 더한다고 밝힘', after.slice(0, 90))
  ok(/실제보다 적습니다/.test(after), '왜 그 숫자가 작은지도 밝힘')
  await ctx.close()
}

// ── 1-c. 확정 전이면 누적매출 기준을 바꾸지 않는다 ───────────────────────
//   확인 안 한 값으로 대표님이 보는 큰 숫자를 바꾸면 안 됩니다.
{
  const ctx = await b.newContext({ viewport: { width: 1500, height: 1400 } })
  wire(ctx)
  const p = await open(ctx, '/revenue')
  await p.waitForSelector('[data-tax-base]', { timeout: 20000 })
  const kpi = flat(await p.textContent('[data-revenue-kpi="ytd"]'))
  ok(!/국세청 신고 기준/.test(kpi), '확정 전 신고는 누적매출 기준이 안 됨', kpi.slice(0, 80))
  ok((await p.locator('[data-revenue-after]').count()) === 0, '따로 적는 줄도 안 나옴')
  await ctx.close()
}

// ── 2. 자료가 없으면 그 칸을 아예 안 그린다 ──────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 1500, height: 1200 } })
  wire(ctx, { tax: [] })
  const p = await open(ctx, '/revenue')
  await p.waitForTimeout(600)
  ok((await p.locator('[data-tax-base]').count()) === 0, '신고 자료가 없으면 칸을 안 그림 (없는 일을 만들지 않음)')
  ok((await p.locator('[data-revenue-msg], main').count()) > 0, '매출 화면 자체는 그대로 뜸')
  await ctx.close()
}

// ── 3. 직원 명부 ─────────────────────────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 1500, height: 1600 } })
  wire(ctx)
  const p = await open(ctx, '/settings')
  await p.waitForSelector('[data-staff-card]', { timeout: 20000 })
  const line = flat(await p.textContent('[data-staff-line]'))
  ok(/6명/.test(line) && /현장 4명/.test(line), '6명 · 현장 4명', line)
  ok(/의료폐기물 2명/.test(line) && /일회용기저귀 2명/.test(line), '담당별로 몇 명인지', line)

  const 송 = flat(await p.textContent('[data-staff-row="송명근"]'))
  ok(/대표/.test(송), '송명근 — 대표', 송)
  ok(!/의료폐기물|일회용기저귀/.test(송), '대표에게 없는 담당을 붙이지 않음')
  const 홍 = flat(await p.textContent('[data-staff-row="홍현주"]'))
  ok(/이사/.test(홍), '홍현주 — 이사', 홍)
  for (const [name, scope] of [['백광호', '일회용기저귀'], ['김진환', '일회용기저귀'],
    ['김준기', '의료폐기물'], ['오대성', '의료폐기물']]) {
    const row = flat(await p.textContent(`[data-staff-row="${name}"]`))
    ok(new RegExp(scope).test(row) && /현장/.test(row), `${name} — 현장 · ${scope}`, row)
  }
  const 백 = flat(await p.textContent('[data-staff-row="백광호"]'))
  ok(/2025\.05\.20/.test(백), '자격취득일을 원본 그대로', 백)
  const card = flat(await p.textContent('[data-staff-card]'))
  ok(/주민등록번호는 이 시스템에 저장하지 않습니다/.test(card), '주민등록번호를 안 담는다고 밝힘')
  ok(/4대보험 최초 자격취득일/.test(card), '날짜가 무슨 날짜인지 밝힘 — 입사일과 다를 수 있음')
  ok(!/\d{6}-\d/.test(card), '화면 어디에도 주민번호 모양이 없음')
  await ctx.close()
}

// ── 4. 매출은 돈입니다 — 현장에게는 안 보입니다 ─────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 1500, height: 1200 } })
  //  서버 RLS 가 이미 막지만, 막힌 결과(빈 배열)에도 화면이 조용해야 합니다.
  wire(ctx, { role: 'field', tax: [] })
  const p = await open(ctx, '/revenue')
  await p.waitForTimeout(900)
  ok((await p.locator('[data-tax-base]').count()) === 0, '기사님 화면에 신고 매출이 없음')
  await ctx.close()
}

// ── 5. 담당은 기사님이 **실제로 보는 화면**에 있어야 합니다 ─────────────
//   설정 화면은 기사님이 아예 못 엽니다. 명부를 거기에만 두면 현장에서는
//   없는 것과 같습니다 — 「이건 누가 가지?」가 계속 카톡으로 갑니다.
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
  const TODAY = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
  const CA = '00000000-0000-0000-0000-0000000000c1'
  const CB = '00000000-0000-0000-0000-0000000000c2'
  const mkC = (id, name, med) => ({
    id, name, type: '병원', address: '', manager: '', phone: '', collection_cycle: '주 1회',
    collects_medical_waste: med, collects_diaper: !med, storage_size: '보통', note: '',
    is_demo_generated: false, demo_session_id: null, active: true,
    contract_start: '2025-01-01', contract_end: null, payment_terms: '', payment_due_day: 20,
    pricing: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  })
  const mkS = (id, clientId, waste) => ({
    id, date: TODAY, client_id: clientId, waste_type: waste, vehicle_id: null, scheduled_time: '',
    status: '예정', expected_amount: 100, actual_amount: null, completed_at: null, memo: '',
    origin: 'system', is_additional: false, demo_session_id: null, plan_batch: null,
    created_at: `${TODAY}T00:00:00Z`, updated_at: `${TODAY}T00:00:00Z`,
  })
  ctx.route('**/auth/v1/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: UID, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }) }))
  ctx.route('**/rest/v1/**', (r) => {
    const url = r.request().url()
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const pf = { ...me, role: 'field', name: '오대성' }
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    if (url.includes('/rpc/app_schema_version')) return json(64)
    if (url.includes('/profiles')) return json(single ? pf : [pf])
    if (url.includes('/staff')) return json(staff)
    if (url.includes('/tax_filings')) return json([])
    if (url.includes('/schedules')) return json([mkS('s1', CA, '의료폐기물'), mkS('s2', CA, '의료폐기물'), mkS('s3', CB, '일회용기저귀')])
    if (url.includes('/clients')) return json(single ? mkC(CA, '가나병원', true) : [mkC(CA, '가나병원', true), mkC(CB, '다라요양원', false)])
    if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
    return json([])
  })
  const p = await open(ctx, '/today')
  await p.waitForTimeout(900)
  ok((await p.locator('[data-today-handlers]').count()) === 1, '오늘 일정에 담당 줄이 있음 (기사님도 보는 화면)')
  const med = flat(await p.textContent('[data-today-handler="의료폐기물"]'))
  ok(/2곳/.test(med), '의료폐기물 2곳', med)
  ok(/오대성/.test(med) && /김준기/.test(med), '의료폐기물 담당 두 분을 이름으로', med)
  ok(!/백광호|김진환/.test(med), '기저귀 담당을 의료폐기물에 섞지 않음')
  const dia = flat(await p.textContent('[data-today-handler="일회용기저귀"]'))
  ok(/1곳/.test(dia) && /백광호/.test(dia) && /김진환/.test(dia), '일회용기저귀 1곳 · 담당 두 분', dia)
  ok(!/송명근|홍현주/.test(flat(await p.textContent('[data-today-handlers]'))),
    '대표·이사는 현장 담당으로 넣지 않음')
  await ctx.close()
}

// ── 6. 명부가 비면 담당 줄을 안 그린다 ───────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
  wire(ctx, { role: 'field', tax: [], people: [] })
  const p = await open(ctx, '/today')
  await p.waitForTimeout(700)
  ok((await p.locator('[data-today-handlers]').count()) === 0,
    '명부가 비면 「담당 없음」이라고 겁주지 않고 아무것도 안 그림')
  await ctx.close()
}

await b.close()
console.log(`\n총 ${out.length}건 · 실패 ${out.filter((x) => !x).length}건`)
