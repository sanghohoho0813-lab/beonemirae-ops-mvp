import { chromium, EXEC } from './_pw.mjs'

//  배차·경로 화면 — 동선 점검이 붙은 뒤.
//
//   가장 중요한 확인은 **화면에 지어낸 숫자가 없는 것**입니다.
//   예전에는 `8 + 정차수 × 6` 으로 만든 「운행거리 38km (시뮬레이션)」가
//   또렷하게 떠 있었습니다. 좌표가 없어 계산할 수 없는 값입니다.
//   작게 「시뮬레이션」이라 적어 두어도, 옆의 숫자는 사실로 읽힙니다.

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
/** 오늘 기준으로 가장 가까운 지난 <요일>에서 주 단위로 거슬러 올라간 날 */
const weekdayBack = (targetDow, weeksAgo) => {
  const d = new Date(`${TODAY}T00:00:00Z`)
  const diff = (d.getUTCDay() - targetDow + 7) % 7 || 7
  d.setUTCDate(d.getUTCDate() - diff - weeksAgo * 7)
  return d.toISOString().slice(0, 10)
}

const V1 = '00000000-0000-0000-0000-0000000000v1'
const V2 = '00000000-0000-0000-0000-0000000000v2'
//  ⚠ active 를 빼면 repo 가 「사용 중지한 차」로 보고 전부 걸러 냅니다.
//    실제 표에 있는 칸이라 픽스처에도 있어야 합니다.
const vehicles = [
  { id: V1, name: '5506호', waste_type: '의료폐기물', tonnage: 1, nominal_capacity: 1000, expected_capacity: 660, driver: '오대성', active: true },
  { id: V2, name: '9188호', waste_type: '사업장기저귀폐기물', tonnage: 1, nominal_capacity: 1000, expected_capacity: 660, driver: '백광호', active: true },
]

const mkClient = (id, name, address) => ({
  id, name, type: '병원', address, manager: '', phone: '', collection_cycle: '주 1회',
  collects_medical_waste: true, collects_diaper: false, storage_size: '보통', note: '',
  is_demo_generated: false, demo_session_id: null, active: true,
  contract_start: '2025-01-01', contract_end: null, payment_terms: '', payment_due_day: 20,
  pricing: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
})
const clients = [
  mkClient('c1', '가나요양병원', '경기도 남양주시 오남읍 양지로 47-35'),
  mkClient('c2', '다라의원', '경기도 남양주시 진접읍 해밀예당1로 10'),
  mkClient('c3', '마바병원', '경기도 남양주시 화도읍 경춘로 20'),
  mkClient('c4', '사아의원', '경기도 남양주시 별내동 30'),
  mkClient('c5', '자차병원', '경기도 구리시 인창동 40'),
  mkClient('c6', '카타의원', '경기도 남양주시 다산동 50'),
]

//  월요일(1)에 5곳 · 화요일(2)에 1곳 — 이사님 조사표의 5506호 모양.
const schedules = []
let n = 0
const mkSched = (date, clientId, status = '완료') => ({
  id: `s${n++}`, date, client_id: clientId, waste_type: '의료폐기물', vehicle_id: V1,
  scheduled_time: '', status, expected_amount: 50, actual_amount: 50,
  completed_at: `${date}T09:00:00Z`, memo: '', origin: 'field', is_additional: false,
  demo_session_id: null, plan_batch: null, created_at: `${date}T00:00:00Z`, updated_at: `${date}T00:00:00Z`,
})
for (let w = 0; w < 6; w++) {
  for (const c of ['c1', 'c2', 'c3', 'c4', 'c5']) schedules.push(mkSched(weekdayBack(1, w), c))
  schedules.push(mkSched(weekdayBack(2, w), 'c6'))
}

const b = await chromium.launch({ executablePath: EXEC })

function wire(ctx, { rows = schedules, cls = clients, vs = vehicles } = {}) {
  const pf = {
    id: UID, email: 'a@b.c', name: '대표', role: 'admin', font_scale: 'normal',
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
    if (url.includes('/rpc/app_health_check')) return json({ version: 53, ok: true, missing: [], checkedAt: '' })
    if (url.includes('/rpc/recent_app_errors')) return json({ days: 7, total: 0, groups: [], checkedAt: '' })
    if (url.includes('/profiles')) return json(single ? pf : [pf])
    if (url.includes('/schedules')) return json(rows)
    if (url.includes('/vehicles')) return json(vs)
    if (url.includes('/clients')) return json(single ? cls[0] : cls)
    if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
    return json([])
  })
}
async function open(ctx) {
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: UID, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }])
  await p.goto(`${BASE}/dispatch`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(2600)
  return p
}

// ── 1. 지어낸 숫자가 화면에 없다 ────────────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1600 } })
  wire(ctx)
  const p = await open(ctx)
  const body = flat(await p.textContent('body'))
  ok(!/운행거리/.test(body), '**「운행거리 ○km」가 화면에서 사라짐** — 좌표가 없어 계산할 수 없는 값이었습니다')
  ok(!/운행시간/.test(body), '**「운행시간 ○분」도 사라짐**')
  ok(!/시뮬\)/.test(body), '시연 요약에 있던 「운행 ○km (시뮬)」도 사라짐')
  //  코드가 보지 않는 것을 「고려했다」고 적어 두면 안 됩니다.
  ok(!/같은 권역 거래처 우선 묶음/.test(body), '코드가 안 하는 「권역 우선 묶음」을 고려했다고 적지 않음')
  ok(!/기사 근무시간 고려/.test(body), '코드가 안 보는 「기사 근무시간」을 적지 않음')
  ok(/거리·경로 순서·소요시간은 계산하지 않습니다/.test(body), '무엇을 계산하지 않는지 먼저 밝힘')
  await ctx.close()
}

// ── 2. 동선 점검 — 근거가 붙은 제안 ─────────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1600 } })
  wire(ctx)
  const p = await open(ctx)
  ok(await seen(p, '[data-route-review]'), '동선 점검이 배차 화면에 있음')

  const limits = flat(await p.textContent('[data-route-limits]'))
  ok(/거리\(km\)와 소요시간은 계산하지 않았습니다/.test(limits), '**무엇을 계산하지 않았는지 맨 위에** 적음')
  ok(/좌표가 없어/.test(limits), '왜 못 하는지도 밝힘')
  ok(/같은 차가 그날 이미 그 시군구에 간다/.test(limits), '말할 수 있는 범위를 못박음')

  const moves = await p.locator('[data-route-move]').count()
  ok(moves > 0, '옮길 수 있는 곳을 제안함', `${moves}곳`)
  //  구리시는 화요일에 5506호가 안 가므로 제안에 없어야 합니다.
  //  제안이 0곳이면 이 검사는 저절로 통과합니다 — 그건 확인한 게 아닙니다.
  ok(moves > 0 && (await p.locator('[data-route-move="c5"]').count()) === 0,
    '**옮길 요일에 그 차가 안 가는 동네는 제안 안 함** (구리시)', `제안 ${moves}곳 중 구리시 0곳`)

  const basis = flat(await p.textContent('[data-route-basis="c1"]'))
  for (const piece of ['5506호', '남양주시', '최근 12주 실제 기록']) {
    ok(basis.includes(piece), `근거에 「${piece}」`, basis.slice(0, 50))
  }
  ok(/\d+곳/.test(basis), '근거에 실제 곳 수가 들어감')
  //  화면은 아무것도 바꾸지 않습니다 — 옮기는 것은 사람이 합니다.
  ok(/이 화면은 아무것도 바꾸지 않습니다/.test(flat(await p.textContent('[data-route-move="c1"]'))),
    '**읽기만 한다고 밝힘** — 수거 날짜를 자동으로 옮기지 않습니다')
  await ctx.close()
}

// ── 3. 뺀 곳과 요일 부하 ────────────────────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1600 } })
  wire(ctx)
  const p = await open(ctx)
  await p.click('[data-route-skip-toggle]')
  await p.waitForTimeout(400)
  const skipped = flat(await p.textContent('[data-route-skipped]'))
  ok(/자차병원/.test(skipped) && /구리시/.test(skipped), '뺀 곳과 그 이유를 보여 줌', skipped.slice(0, 80))

  await p.click('[data-route-skew-toggle]')
  await p.waitForTimeout(400)
  const bar = flat(await p.textContent('[data-skew="' + V1 + '"]'))
  ok(/5506호/.test(bar), '차량별 요일 부하가 열림')
  ok(/월/.test(bar) && /화/.test(bar), '요일이 그려짐', bar.slice(0, 70))
  ok((await p.locator('[data-skew-flag]').count()) >= 1, '몰린 차량에 표시가 붙음')
  //  기록이 없는 차는 0곳이 아니라 「없다」고 말해야 합니다.
  const blocked = flat(await p.textContent(`[data-skew-blocked="${V2}"]`))
  ok(/기록이 최근 12주에 없습니다/.test(blocked), '**기록 없는 차를 0곳으로 그리지 않음**', blocked)
  await ctx.close()
}

// ── 4. 근거가 없으면 제안하지 않는다 ────────────────────────────────────────
{
  //  주소를 전부 비웁니다 — 시군구를 못 읽으면 묶을 근거가 없습니다.
  const noAddr = clients.map((c) => ({ ...c, address: '' }))
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1400 } })
  wire(ctx, { cls: noAddr })
  const p = await open(ctx)
  ok(await seen(p, '[data-route-none]'), '주소가 없으면 제안을 만들지 않음')
  const none = flat(await p.textContent('[data-route-none]'))
  ok(/근거가 없는데 옮기라고 하면/.test(none) || /요일 쏠림이 크지 않습니다/.test(none),
    '왜 제안이 없는지 말함', none.slice(0, 90))
  ok((await p.locator('[data-route-move]').count()) === 0, '**주소 없이 짐작으로 옮기라고 하지 않음**')
  ok(await seen(p, '[data-route-noaddress]', 3000), '주소를 못 읽은 곳이 몇 곳인지 알려 줌')
  await ctx.close()
}

// ── 5. 폰에서도 읽힌다 ──────────────────────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  wire(ctx)
  const p = await open(ctx)
  ok(await seen(p, '[data-route-review]'), '폰에서도 동선 점검이 보임')
  //  가로로 삐져나가면 글자가 세로로 늘어집니다.
  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  ok(over <= 1, '가로 스크롤이 생기지 않음', `${over}px`)
  const card = await p.locator('[data-route-move]').first().evaluate((e) => e.getBoundingClientRect().width)
  ok(card <= 390, '제안 카드가 화면 안에 들어옴', `${Math.round(card)}px`)
  await ctx.close()
}

console.log('')
console.log(`총 ${out.length}건 · 실패 ${out.filter((v) => !v).length}건`)
await b.close()
