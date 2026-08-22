import { chromium, EXEC } from './_pw.mjs'

//  현장 입력 — 대표님이 요청하신 것.
//
//   ① 거래처마다 수거물량을 직접 넣을 수 있는가 (예정에 없어도)
//   ② 현장 담당자가 넣을 수 있는가
//   ③ **단가·금액이 직원 화면에 한 글자도 안 나오는가**  ← 대표님이 못박은 것
//   ④ 넣으면 대표님 화면에 뜨는가
//   ⑤ 거래처에 「마지막 수거」 한 줄이 붙는가
//
//   ③ 이 이 검사의 핵심입니다. 지금 우연히 없는 것과 앞으로도 없을 것은
//   다릅니다 — 여기서 못박아 둡니다.

const BASE = 'http://localhost:4173'
const UID = '00000000-0000-0000-0000-0000000000ad'
const out = []
const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  out.push(c)
  if (!c) process.exitCode = 1
}
const flat = (s) => (s ?? '').replace(/\s+/g, ' ')
const seen = (p, sel, ms = 20000) => p.waitForSelector(sel, { timeout: ms }).then(() => true, () => false)

const TODAY = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
const back = (n) => {
  const d = new Date(`${TODAY}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

const CA = '00000000-0000-0000-0000-0000000000c1'
const CB = '00000000-0000-0000-0000-0000000000c2'
const V1 = '00000000-0000-0000-0000-0000000000v1'
const mkClient = (id, name) => ({
  id, name, type: '병원', address: '경기도 남양주시 오남읍 1', manager: '홍길동', phone: '031-000-0000',
  collection_cycle: '주 1회', collects_medical_waste: true, collects_diaper: false,
  storage_size: '보통', note: '', is_demo_generated: false, demo_session_id: null, active: true,
  contract_start: '2025-01-01', contract_end: null, payment_terms: '', payment_due_day: 20,
  //  단가가 **있는** 거래처입니다 — 있는데도 현장에 안 보여야 뜻이 있습니다.
  pricing: { plastic20: { sale: 9000, cost: 5200 }, box: { sale: 12345, cost: 7000 } },
  biz_no: '2568802759', vat_mode: 'exclusive',
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
})
const clients = [mkClient(CA, '가나요양병원'), mkClient(CB, '다라병원')]
const vehicles = [{ id: V1, name: '5506호', waste_type: '의료폐기물', tonnage: 1,
  nominal_capacity: 1000, expected_capacity: 660, driver: '오대성', active: true }]

const mkSched = (id, date, clientId, over = {}) => ({
  id, date, client_id: clientId, waste_type: '의료폐기물', vehicle_id: V1,
  scheduled_time: '09:00', status: '완료', expected_amount: 100, actual_amount: 120,
  actual_time: '10:20', driver_name: '김준기', completed_at: `${date}T10:30:00Z`,
  memo: '', origin: 'field', is_additional: false, demo_session_id: null, plan_batch: null,
  created_at: `${date}T00:00:00Z`, updated_at: `${date}T00:00:00Z`, ...over,
})

const b = await chromium.launch({ executablePath: EXEC })

function wire(ctx, { role = 'admin', scheds = [], events = [] } = {}) {
  const pf = {
    id: UID, email: 'a@b.c', name: role === 'field' ? '김준기' : '송명근', role, font_scale: 'normal',
    active: true, approved_at: '2026-01-01T00:00:00Z', client_id: null, created_at: '2026-01-01T00:00:00Z',
  }
  ctx.route('**/auth/v1/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: UID, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }) }))
  ctx.route('**/rest/v1/**', (r) => {
    const url = r.request().url()
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    if (url.includes('/rpc/app_schema_version')) return json(64)
    if (url.includes('/rpc/app_health_check')) return json({ version: 64, ok: true, missing: [], checkedAt: '' })
    if (url.includes('/rpc/recent_app_errors')) return json({ days: 7, total: 0, groups: [], checkedAt: '' })
    if (url.includes('/collection_events')) return json(events)
    if (url.includes('/profiles')) return json(single ? pf : [pf])
    if (url.includes('/schedules')) return json(scheds)
    if (url.includes('/vehicles')) return json(vehicles)
    if (url.includes('/clients')) return json(single ? clients[0] : clients)
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
  await p.waitForTimeout(2600)
  return p
}

const TODAY_IN = [mkSched('s1', TODAY, CA), mkSched('s2', TODAY, CB, { actual_amount: 80, driver_name: '' })]

// ── ① 예정에 없어도 직접 입력할 수 있다 ────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  wire(ctx, { role: 'field', scheds: [] }) // 오늘 예정이 하나도 없는 상태
  const p = await open(ctx, '/collection')
  const body = flat(await p.textContent('body'))
  ok(/직접 입력/.test(body), '**예정이 없어도 「직접 입력」으로 넣을 수 있음**')
  //  ⚠ 0065 에서 문구가 바뀌었습니다 — 예전 「오늘 남은 예정 수거가 없습니다.
  //     직접 입력으로 등록하세요.」는 이미 켜져 있는 「직접 입력」 단추와 함께
  //     떠서, 대표님이 「눌러도 아무 반응이 없다」고 하신 자리였습니다.
  //     확인할 것은 **예정이 없다는 사실을 그대로 말하는가** 하나입니다.
  ok(/예정된 수거가 없어/.test(body), '예정이 없다고 그대로 말함')
  //  거래처를 고를 수 있어야 합니다.
  const opts = await p.locator('select').first().locator('option').allTextContents()
  ok(opts.some((o) => /가나요양병원/.test(o)), '거래처를 골라 넣을 수 있음', opts.join(' · ').slice(0, 60))
  //  수거량 칸이 있어야 합니다.
  ok(/실제 수거량/.test(body), '수거량(kg) 칸이 있음')
  await ctx.close()
}

// ── ①-b 거래처에서 바로 수거 입력으로 갈 수 있다 ───────────────────────────
//   대표님이 실제로 겪으신 일입니다 — 거래처를 보다가 「이 병원 오늘
//   수거했다」를 적으려면 왼쪽 메뉴로 나갔다가 목록에서 그 병원을 다시
//   찾아야 했습니다. 거래처가 100곳 가까이 되면 그게 매번 일입니다.
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1400 } })
  wire(ctx, { scheds: [] })
  const p = await open(ctx, `/clients/${CA}`)
  ok(await seen(p, `[data-go-collect="${CA}"]`), '**거래처 화면에 「수거 입력」 단추가 있음**')
  await p.click(`[data-go-collect="${CA}"]`)
  await p.waitForTimeout(2200)
  ok(p.url().includes('/collection'), '수거 입력으로 넘어감', p.url())
  //  거래처가 이미 골라져 있어야 합니다 — 다시 찾게 하면 뜻이 없습니다.
  const picked = await p.locator('select').first().inputValue()
  ok(picked === CA, '**그 거래처가 이미 골라져 있음**', picked || '(비어 있음)')
  await ctx.close()
}
{
  //  오늘 예정이 있으면 그 일정을 그대로 씁니다 — 차량·시간까지 따라옵니다.
  const pending = [{ ...mkSched('sp', TODAY, CA), status: '예정', actual_amount: null,
    actual_time: '', completed_at: null }]
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1400 } })
  wire(ctx, { scheds: pending })
  const p = await open(ctx, `/clients/${CA}`)
  await p.click(`[data-go-collect="${CA}"]`)
  await p.waitForTimeout(2200)
  const picked = await p.locator('select').first().inputValue()
  ok(picked === CA, '오늘 예정이 있으면 그 일정으로 채워짐', picked || '(비어 있음)')
  const body = flat(await p.textContent('body'))
  ok(/선택한 일정에서 자동 지정됨/.test(body), '**일정에서 자동으로 왔다고 알려 줌**')
  await ctx.close()
}

// ── ③ 현장 화면에 금액이 한 글자도 없다 ────────────────────────────────────
//   대표님이 못박으신 것입니다. 거래처에 단가가 **들어 있는** 상태로 확인합니다 —
//   값이 없어서 안 보이는 것과 있는데도 안 보이는 것은 다릅니다.
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  wire(ctx, { role: 'field', scheds: TODAY_IN })
  for (const path of ['/collection', '/today', `/clients/${CA}`, '/clients']) {
    const p = await open(ctx, path)
    const body = flat(await p.textContent('body'))
    //  단가 자체(9,000 / 12,345)와 「원」 표기가 없어야 합니다.
    ok(!/9,000원|12,345원/.test(body), `${path} — **거래처 단가가 안 보임**`,
      (body.match(/[\d,]+원/g) ?? []).slice(0, 3).join(' '))
    ok(!/원\b/.test(body.replace(/원장|원미래|병원|지원|권역|남양주|고원/g, '')),
      `${path} — 금액 표기(○○원)가 아예 없음`,
      (body.replace(/원장|원미래|병원|지원|권역|남양주|고원/g, '').match(/[^\s]{0,6}원/g) ?? []).slice(0, 3).join(' '))
    await p.close()
  }
  await ctx.close()
}

// ── ④ 넣으면 대표님 화면에 뜬다 ────────────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1600 } })
  wire(ctx, { scheds: TODAY_IN })
  const p = await open(ctx, '/')
  ok(await seen(p, '[data-field-today]'), '**오늘 들어온 입력이 대표님 화면에 뜸**')
  const head = flat(await p.textContent('[data-field-today-headline]'))
  ok(/오늘 현장에서 2건 들어왔습니다/.test(head), '몇 건인지', head)
  const card = flat(await p.textContent('[data-field-today]'))
  ok(/2곳/.test(card) && /200kg/.test(card), '몇 곳 · 모두 몇 kg', card.slice(0, 80))
  ok(/가나요양병원/.test(card) && /120kg/.test(card), '어느 병원 · 얼마', card.slice(0, 120))
  ok(/김준기/.test(card), '누가 넣었는지 (수거 입력에 적힌 기사)')
  //  이름이 안 적힌 건은 지어내지 않습니다.
  ok(/1건은 기사 이름이 안 적혀 있습니다/.test(card),
    '**이름이 없으면 지어내지 않고 그 사실을 말함**', card.slice(-80))
  ok(!/오대성/.test(card),
    '**차량 기본 기사로 대신 채우지 않음** — 실제로 간 사람과 다를 수 있습니다')
  //  금액은 여기에도 없습니다.
  ok(!/9,000원|12,345원/.test(card), '이 카드에도 금액이 없음')
  await ctx.close()
}
{
  //  아무것도 안 들어왔으면 아예 안 그립니다 — 아침마다 「0건」이 뜨면 안 봅니다.
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1400 } })
  wire(ctx, { scheds: [mkSched('old', back(3), CA)] })
  const p = await open(ctx, '/')
  ok((await p.locator('[data-field-today]').count()) === 0,
    '**오늘 안 들어왔으면 아무것도 안 그림** — 「0건」이 매일 떠 있으면 안 보게 됩니다')
  await ctx.close()
}
{
  //  현장 담당자에게는 안 띄웁니다.
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  wire(ctx, { role: 'field', scheds: TODAY_IN })
  const p = await open(ctx, '/today')
  ok((await p.locator('[data-field-today]').count()) === 0, '현장 담당자에게는 안 뜸')
  await ctx.close()
}

// ── ⑤ 거래처에 마지막 수거 한 줄 ───────────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1600 } })
  wire(ctx, { scheds: [mkSched('s1', back(4), CA), mkSched('s0', back(40), CA, { actual_amount: 90 })] })
  const p = await open(ctx, `/clients/${CA}`)
  ok(await seen(p, `[data-last-collection="${CA}"]`), '거래처에 마지막 수거 줄이 붙음')
  const line = flat(await p.textContent(`[data-last-collection="${CA}"]`))
  ok(/마지막 수거/.test(line), '「마지막 수거」라고 적음', line)
  ok(/김준기/.test(line) && /120kg/.test(line), '누가 · 얼마', line)
  //  **가장 최근** 것이어야 합니다 — 40일 전 90kg 이 아니라 4일 전 120kg.
  ok(!/90kg/.test(line), '**가장 최근 수거를 보여 줌** (오래된 것이 아니라)', line)
  //  잘했다/못했다를 매기지 않습니다.
  ok(!/잘|우수|미흡|성실/.test(line), '**성적을 매기지 않고 사실만 적음**', line)
  await ctx.close()
}
{
  //  기록이 없으면 그렇게 말합니다.
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1400 } })
  wire(ctx, { scheds: [] })
  const p = await open(ctx, `/clients/${CA}`)
  const line = flat(await p.textContent(`[data-last-collection="${CA}"]`))
  ok(/수거 기록 없음/.test(line), '기록이 없으면 없다고 말함', line)
  await ctx.close()
}
{
  //  엑셀로 가져온 기록에는 기사·시간이 없습니다 — 날짜와 kg 만 적습니다.
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1400 } })
  wire(ctx, { scheds: [mkSched('imp', back(10), CA, { driver_name: '', actual_time: '' })] })
  const p = await open(ctx, `/clients/${CA}`)
  const line = flat(await p.textContent(`[data-last-collection="${CA}"]`))
  ok(/120kg/.test(line) && !/·\s*·/.test(line),
    '**이름이 없으면 빈 자리 없이 날짜와 kg 만**', line)
  ok(!/오대성/.test(line), '여기서도 차량 기사로 안 채움', line)
  await ctx.close()
}

console.log('')
console.log(`총 ${out.length}건 · 실패 ${out.filter((v) => !v).length}건`)
await b.close()
