import { chromium, EXEC } from './_pw.mjs'

//  AX 성과 화면 — **화면이 숫자를 크게 보이게 하지 않는가**
//
//   계산이 맞는지는 check_axevidence 에서 규칙을 직접 두들겼습니다.
//   여기서 보는 것은 화면입니다.
//
//    · 전달 완료액과 입금 완료액이 **다른 칸**에 남는가
//    · 주문만 들어온 900,000원짜리가 매출 칸에 안 들어가는가
//    · 못 세는 값이 「0」이 아니라 「—」로 비는가
//    · 표본이 적으면 「측정 중」이 붙는가
//    · 거리·시간을 계산하지 않는다고 화면이 말하는가
//    · 폰 390px 에서 가로로 안 밀리는가

const BASE = 'http://localhost:4173'
const UID = '00000000-0000-0000-0000-0000000000ad'
const C1 = '00000000-0000-0000-0000-0000000000c1'
const C2 = '00000000-0000-0000-0000-0000000000c2'
const V1 = '00000000-0000-0000-0000-0000000000v1'
const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  if (!c) process.exitCode = 1
}
const flat = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const TODAY = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
const back = (n) => {
  const d = new Date(`${TODAY}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}
const MONTH = TODAY.slice(0, 7)

const clients = [C1, C2].map((id, i) => ({
  id, name: i === 0 ? '가나요양병원' : '다라의원', type: '병원', address: '', manager: '', phone: '',
  collection_cycle: '주 1회', collects_medical_waste: true, collects_diaper: false, storage_size: '보통',
  note: '', is_demo_generated: false, demo_session_id: null, active: true,
  contract_start: '2025-01-01', contract_end: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}))

//  c1 은 골판지를 세 번 받아 갔습니다 → 추천이 뜹니다. c2 는 한 번뿐입니다.
const materials = [
  { id: 'm1', date: back(80), client_id: C1, box_count: 20, vinyl_count: 0, needle_box_count: 0, is_additional_request: false, memo: '', items: null },
  { id: 'm2', date: back(50), client_id: C1, box_count: 20, vinyl_count: 0, needle_box_count: 0, is_additional_request: false, memo: '', items: null },
  { id: 'm3', date: back(20), client_id: C1, box_count: 20, vinyl_count: 0, needle_box_count: 0, is_additional_request: false, memo: '', items: null },
  { id: 'm4', date: back(30), client_id: C2, box_count: 10, vinyl_count: 0, needle_box_count: 0, is_additional_request: true, memo: '', items: null },
]

const oi = (id, orderId, qty, price, cost) => ({
  id, order_id: orderId, product_id: 'p1', name: '골판지 전용박스', spec: '63L', unit: '개',
  qty, unit_price: price, unit_cost: cost, stock_key: 'corrugated_box',
})

const orders = [
  { id: 'o1', client_id: C1, status: '전달완료', requester_name: '병원', source: 'portal', note: '',
    deliver_schedule_id: null, deliver_on: back(10), requested_at: `${back(12)}T01:00:00Z`,
    confirmed_at: null, delivered_at: `${back(10)}T01:00:00Z`, canceled_at: null, cancel_reason: '',
    items: [oi(1, 'o1', 10, 9000, 5000)] },
  { id: 'o2', client_id: C1, status: '전달완료', requester_name: '병원', source: 'portal', note: '',
    deliver_schedule_id: null, deliver_on: back(4), requested_at: `${back(6)}T01:00:00Z`,
    confirmed_at: null, delivered_at: `${back(4)}T01:00:00Z`, canceled_at: null, cancel_reason: '',
    items: [oi(2, 'o2', 5, 9000, 5000)] },
  //  ⚠ **주문만** 들어온 900,000원짜리. 매출 칸에 들어가면 안 됩니다.
  { id: 'o3', client_id: C2, status: '요청', requester_name: '병원', source: 'portal', note: '',
    deliver_schedule_id: null, deliver_on: null, requested_at: `${back(2)}T01:00:00Z`,
    confirmed_at: null, delivered_at: null, canceled_at: null, cancel_reason: '',
    items: [oi(3, 'o3', 100, 9000, 5000)] },
]

const payments = [
  { id: 'pay1', client_id: C1, billing_month: MONTH, amount: 500000, status: '입금완료', method: '무통장',
    paid_at: `${TODAY}T01:00:00Z`, memo: '', snapshot: { orderIds: ['o1'] }, canceled_at: null },
  { id: 'pay2', client_id: C1, billing_month: MONTH, amount: 300000, status: '미수금', method: '무통장',
    paid_at: null, memo: '', snapshot: { orderIds: ['o2'] }, canceled_at: null },
]

const schedules = [10, 4, 2].map((n, i) => ({
  id: `s${i}`, date: back(n), client_id: i === 2 ? C2 : C1, waste_type: '의료폐기물', vehicle_id: V1,
  scheduled_time: '09:00', status: '완료', expected_amount: 100, actual_amount: 100, actual_time: '09:20',
  completed_at: `${back(n)}T00:20:00Z`, containers: null, driver_name: i === 1 ? '백광호' : '김준기',
  handover_status: '수거 완료', handover_at: null, memo: '', event_id: null, origin: 'plan',
  is_additional: false, demo_session_id: null, plan_batch: null, canceled_at: null,
  booked_at: `${back(n + 2)}T00:00:00Z`,
  created_at: `${back(n)}T00:00:00Z`, updated_at: `${back(n)}T00:00:00Z`,
}))

const requests = [
  { id: 'r1', client_id: C1, kind: '긴급수거', content: '급합니다', desired_date: null, urgent: true,
    status: '접수', source: 'portal', requester_name: '병원', reply: '', handled_by: null, handled_at: null,
    request_id: null, created_at: `${back(9)}T01:00:00Z`, demo_session_id: null },
  { id: 'r2', client_id: C1, kind: '소모품', content: '박스요', desired_date: null, urgent: false,
    status: '접수', source: 'portal', requester_name: '병원', reply: '', handled_by: null, handled_at: null,
    request_id: null, created_at: `${back(5)}T01:00:00Z`, demo_session_id: null },
  //  전화로 받아 대신 올린 것 — 포털 이용이 아닙니다
  { id: 'r3', client_id: C2, kind: '추가수거', content: '', desired_date: null, urgent: false,
    status: '접수', source: 'staff', requester_name: '사무실', reply: '', handled_by: null, handled_at: null,
    request_id: null, created_at: `${back(3)}T01:00:00Z`, demo_session_id: null },
]

const b = await chromium.launch({ executablePath: EXEC })

function wire(ctx, { experimentStart = null, role = 'admin' } = {}) {
  const pf = { id: UID, email: 'a@b.c', name: '대표', role, font_scale: 'normal',
    active: true, approved_at: '2026-01-01T00:00:00Z', client_id: null, vehicle_id: null,
    created_at: '2026-01-01T00:00:00Z' }
  //  ⚠ 계정 목록은 **관리자만** 읽을 수 있습니다 (profiles RLS: 본인 또는 관리자).
  //    사무실 계정으로 읽으면 본인 한 줄만 옵니다 — 진짜 서버처럼 굽니다.
  const allProfiles = [
    pf,
    { id: 'u2', email: 'h1@x.c', name: '가나 담당자', role: 'client', font_scale: 'normal',
      active: true, approved_at: '2026-01-01T00:00:00Z', client_id: C1, created_at: '2026-01-01T00:00:00Z' },
    { id: 'u3', email: 'h2@x.c', name: '다라 담당자', role: 'client', font_scale: 'normal',
      active: true, approved_at: '2026-01-01T00:00:00Z', client_id: C2, created_at: '2026-01-01T00:00:00Z' },
    //  정지된 병원 계정 — **활성**만 세야 합니다
    { id: 'u4', email: 'h3@x.c', name: '나간 병원', role: 'client', font_scale: 'normal',
      active: false, approved_at: '2026-01-01T00:00:00Z', client_id: null, created_at: '2026-01-01T00:00:00Z' },
    { id: 'u5', email: 'f@x.c', name: '기사', role: 'field', font_scale: 'normal',
      active: true, approved_at: '2026-01-01T00:00:00Z', client_id: null, created_at: '2026-01-01T00:00:00Z' },
  ]
  ctx.route('**/auth/v1/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: UID, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }) }))
  ctx.route('**/rest/v1/**', (r) => {
    const url = r.request().url()
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    if (url.includes('/experiment_settings'))
      return json(single ? { id: 1, start_date: experimentStart } : [{ id: 1, start_date: experimentStart }])
    if (url.includes('/rpc/app_schema_version')) return json(64)
    if (url.includes('/rpc/app_health_check')) return json({ version: 64, ok: true, missing: [], checkedAt: '' })
    if (url.includes('/rpc/recent_app_errors')) return json({ days: 7, total: 0, groups: [], checkedAt: '' })
    if (url.includes('/rpc/client_billing_terms')) return json([])
    if (url.includes('/rpc/')) return json(null)
    if (url.includes('/profiles')) {
      //  ⚠ **id=eq. 필터를 지켜야 합니다.**
      //
      //   진짜 서버는 걸러서 한 줄만 줍니다. 가짜 서버가 그냥 다섯 줄을
      //   돌려줬더니 앱의 maybeSingle() 이 「한 줄인 줄 알았는데 여러 줄」로
      //   보고 오류를 냈고, **로그인 화면으로 튕겼습니다.**
      //   가짜 서버가 진짜와 다르게 굴면 있지도 않은 문제를 잡습니다.
      const idEq = (url.match(/[?&]id=eq\.([^&]+)/) ?? [])[1]
      //  계정 목록은 관리자만 (RLS: 본인 또는 관리자)
      const pool = role === 'admin' ? allProfiles : [pf]
      const rows = idEq ? pool.filter((x) => x.id === decodeURIComponent(idEq)) : pool
      return json(single ? (rows[0] ?? null) : rows)
    }
    if (url.includes('/product_order_items')) return json(orders.flatMap((o) => o.items))
    if (url.includes('/product_orders')) return json(orders)
    if (url.includes('/products')) return json([])
    if (url.includes('/payment_receipts')) return json([])
    if (url.includes('/payments')) return json(payments)
    if (url.includes('/material_transactions')) return json([])
    if (url.includes('/materials')) return json(materials)
    if (url.includes('/client_requests')) return json(requests)
    if (url.includes('/schedules')) return json(schedules)
    if (url.includes('/vehicles')) return json([{ id: V1, name: '80가 1234 (1t)', waste_type: '의료폐기물',
      tonnage: 1, nominal_capacity: 1000, expected_capacity: 800, driver: '김준기', active: true }])
    if (url.includes('/clients')) return json(single ? clients[0] : clients)
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
  await p.waitForTimeout(3000)
  return p
}

// ── PC ──────────────────────────────────────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } })
  wire(ctx)
  const p = await open(ctx, '/performance?tab=basis')

  ok((await p.locator('#ax-work').count()) > 0, '⓪ 업무 AX(당일 입력) 자리가 화면에 있음')
  ok((await p.locator('#ax-sales').count()) > 0, '① 매출 AX 자리가 화면에 있음')
  ok((await p.locator('#ax-customer').count()) > 0, '② 고객 AX 자리가 화면에 있음')
  ok((await p.locator('#ax-capacity').count()) > 0, '③ 확장 AX 자리가 화면에 있음')

  const stage = async (k) => flat(await p.locator(`[data-ax-stage="${k}"]`).innerText())
  ok(/3건/.test(await stage('ordered')), '④ 주문 접수 3건', await stage('ordered'))
  ok(/2건/.test(await stage('delivered')), '⑤ 전달 완료 2건', await stage('delivered'))
  ok(/2건/.test(await stage('billed')), '⑥ 청구 확정 2건', await stage('billed'))
  ok(/1건/.test(await stage('paid')), '⑦ **입금 완료 1건** — 전달과 다른 칸', await stage('paid'))

  const v = async (k) => flat(await p.locator(`[data-ax-value="${k}"]`).innerText())
  //  ⚠ o3 은 900,000원짜리 주문입니다. 매출에 섞이면 1,035,000원이 뜹니다.
  ok((await v('revenue')) === '135,000원', '⑧ **주문만 들어온 900,000원이 매출에 안 섞임**', await v('revenue'))
  ok((await v('paidRevenue')) === '90,000원', '⑨ 입금까지 끝난 금액은 90,000원 (전달액과 다름)', await v('paidRevenue'))
  ok((await v('profit')) === '60,000원', '⑩ 실제 판매이익 60,000원', await v('profit'))

  //  ── 활성 병원 계정 수 ──
  //   관리자로 열었으니 실제로 셉니다. **활성인 병원 계정만** 2개입니다
  //   (정지된 병원 계정 1 · 기사 1 · 관리자 1 은 빠집니다).
  ok((await v('accounts')) === '2개', '⑪ 관리자는 활성 병원 계정 수를 실제로 셈', await v('accounts'))

  //  표본이 적으면 측정 중
  const rs = flat(await p.locator('[data-ax-state="revenue"]').innerText())
  ok(rs === '측정 중', '⑬ 전달 2건짜리 매출은 「측정 중」 — 회사 성과로 확정하지 않음', rs)
  const body = flat(await p.textContent('body'))
  ok(/표본 2건/.test(body), '⑭ 표본이 몇 건인지 화면에 적힘')

  //  고객 AX
  ok((await v('portalShare')) === '66.7%', '⑮ 전체 요청 중 포털 비율 66.7% (전화 대행 제외)', await v('portalShare'))
  ok((await v('portalRequests')) === '2건', '⑯ 포털 요청 2건', await v('portalRequests'))

  //  확장 AX — 거리·시간을 안 만든다고 화면이 말해야 합니다
  ok(/거리\(km\)와 소요시간은 계산하지 않습니다/.test(body), '⑰ **거리·시간은 계산하지 않는다고 화면이 말함**')
  ok(!/km 절감|최적 경로|예상 절감/.test(body), '⑱ 지어낸 km·최적경로가 화면에 없음')
  ok((await p.locator('[data-ax-driver="김준기"]').count()) > 0, '⑲ 기사별 처리건수가 보임')

  //  추천 전환 — 분모를 어떻게 세었는지가 화면에 있어야 합니다
  ok(/일 간격/.test(body) && /쌍/.test(body), '⑳ 추천 전환율의 분모 세는 법이 화면에 적힘')

  //  ── 당일 입력 ──
  //   fixture 의 완료 일정 3건은 전부 그날 안에 입력됐습니다(completed_at 이
  //   같은 날 09:20 KST). 100% 가 나와야 합니다.
  ok((await v('sameDayRate')) === '100%', '⓵ 당일 입력 완료율 100% (fixture 3건 모두 당일)', await v('sameDayRate'))
  ok((await v('oddLag')) === '0건', '⓶ 다녀오기 전에 입력된 건 0건', await v('oddLag'))
  ok((await p.locator('[data-ax-lag-bucket="0"]').count()) > 0, '⓷ 며칠 만에 넣었는지 분포가 보임')
  ok(/파일럿 하루 한 줄 기록/.test(body), '⓸ 파일럿 기록과 같은 정의를 쓴다고 화면이 말함')

  //  ── 도입 전 → 현재 ──
  //   도입일을 안 정했으므로 견주지 않아야 합니다. 「0 → N」을 만들면 안 됩니다.
  ok((await p.locator('[data-ax-cmp]').count()) > 0, '⓹ 「도입 전 → 현재」 자리가 화면에 있음')
  const cmpState = await p.locator('[data-ax-cmp]').getAttribute('data-ax-cmp')
  ok(cmpState === 'no-start', '⓺ 도입일이 없으면 견주지 않는다고 화면이 말함', String(cmpState))
  ok(/도입일\(실증 시작일\)이 설정돼 있지 않아/.test(body), '⓻ 왜 못 견주는지 적혀 있음')
  //  ⚠ 처음에 본문 전체에서 「＋300%」를 찾았다가 FAIL 이 났습니다.
  //    잡힌 것은 **제가 쓴 경고 문구**(「0 → 3」을 「＋300%」로 적지 않습니다)
  //    였습니다. 재야 할 곳은 본문이 아니라 **변화 칸**입니다.
  const diffs = await p.locator('[data-ax-cmp-diff]').allInnerTexts()
  ok(!diffs.some((t) => /%|∞/.test(t)),
    '⓼ **변화 칸에 백분율·∞ 를 쓰지 않음** — 「0 → N」을 부풀리지 않습니다',
    diffs.join(' / ') || '(견줄 줄이 없음)')

  //  ── 차량 × 요일 ──
  ok((await p.locator('[data-ax-vehday]').count()) > 0, '⓽ 차량×요일 표가 화면에 있음')
  ok(/예전 최대 \/ 요즘 평균/.test(body), '⓾ 읽는 법이 적혀 있음 (예전 최대 / 요즘 평균)')
  ok(/두 번 이상 나간 요일만/.test(body), '⑪ 한 번뿐인 요일은 안 적는다고 밝힘')

  ok(!/문제가 생겼습니다/.test(body), '㉑ 화면이 터지지 않음')
  await ctx.close()
}

// ── 도입일이 있을 때 — **실제로 견주는 상태** ────────────────────────────────
//
//   앞 검사의 「변화 칸에 백분율을 안 쓴다」는 견줄 줄이 하나도 없으면
//   **공허하게 통과합니다.** 도입일을 넣어 실제로 줄이 생긴 상태에서 다시 잽니다.
//   fixture 는 도입 전 기간에 기록이 없으므로 「0 → N」 갈래가 그대로 나옵니다.
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } })
  wire(ctx, { experimentStart: back(14) })
  const p = await open(ctx, '/performance?tab=basis')

  const state = await p.locator('[data-ax-cmp]').getAttribute('data-ax-cmp')
  ok(state === 'no-before' || state === 'ok', '⑫ 도입일을 정하면 실제로 견줌', String(state))

  const rows = await p.locator('[data-ax-cmp-row]').count()
  ok(rows > 0, '⑬ 견주는 줄이 실제로 그려짐', `${rows}줄`)

  const diffs = await p.locator('[data-ax-cmp-diff]').allInnerTexts()
  ok(diffs.length > 0, '⑭ 변화 칸이 실제로 있음', String(diffs.length))
  //  ⚠ 여기가 진짜 자리입니다 — 줄이 있는 상태에서 백분율·∞ 가 없어야 합니다.
  ok(!diffs.some((t) => /%|∞/.test(t)),
    '⑮ **줄이 있는 상태에서도 변화 칸에 백분율·∞ 가 없음**', diffs.join(' / '))

  //  도입 전에 기록이 없는 줄은 「기록 없음」이라고 적어야 합니다 — 0 이 아니라.
  const befores = await p.locator('[data-ax-cmp-before]').allInnerTexts()
  ok(befores.some((t) => /기록 없음/.test(t)),
    '⑯ **도입 전에 기록이 없으면 「기록 없음」** (0 이 아님)', befores.join(' / '))
  //  그런 줄의 변화는 만들지 않습니다.
  ok(diffs.some((t) => /견줄 수 없음/.test(t)), '⑰ 한쪽이 없으면 「견줄 수 없음」', diffs.join(' / '))

  await ctx.close()
}

// ── 사무실 계정에서는 계정 수를 못 센다 ─────────────────────────────────────
//
//   profiles 는 관리자만 읽습니다. 사무실로 읽으면 본인 한 줄만 오는데,
//   그걸 「계정 1개」로 적으면 거짓말이 됩니다. 안 세는 것이 맞습니다.
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } })
  wire(ctx, { role: 'office' })
  const p = await open(ctx, '/performance?tab=basis')
  const val = flat(await p.locator('[data-ax-value="accounts"]').innerText())
  const st = flat(await p.locator('[data-ax-state="accounts"]').innerText())
  ok(val === '—', '⑫ **사무실 계정에서는 0 이 아니라 「—」**', val)
  ok(st === '셀 수 없음', '⑬ 그리고 「셀 수 없음」이라고 적음', st)
  ok(/관리자 계정에서만/.test(flat(await p.textContent('body'))), '⑭ 왜 못 세는지 적혀 있음')
  await ctx.close()
}

// ── 자료가 오기 전에는 성과를 말하지 않는다 ─────────────────────────────────
//
//   이 화면은 전부 0 에서 시작합니다. 읽어 오기 전에 그리면
//   「측정 중 · 아직 없음 · 0원」이 줄줄이 뜨고, 그건 **「성과가 없다」**로
//   읽힙니다. 성과판에서 그 오해는 다른 화면보다 훨씬 비쌉니다.
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } })
  //  서버가 늦게 답하는 상황을 만듭니다 (요청마다 더하지 않고 시작 기준으로).
  const t0 = Date.now()
  const pf0 = { id: UID, email: 'a@b.c', name: '대표', role: 'admin', font_scale: 'normal',
    active: true, approved_at: '2026-01-01T00:00:00Z', client_id: null, vehicle_id: null,
    created_at: '2026-01-01T00:00:00Z' }
  await ctx.route('**/auth/v1/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: UID, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }) }))
  await ctx.route('**/rest/v1/**', async (r) => {
    const url = r.request().url()
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    //  로그인 판정은 늦추지 않습니다 — 늦추면 로그인 화면이 떠서 우리가
    //  재려는 「로그인은 됐는데 자료가 아직」 상태가 안 만들어집니다.
    if (url.includes('/profiles')) {
      const idEq = (url.match(/[?&]id=eq\.([^&]+)/) ?? [])[1]
      const rows = idEq ? [pf0].filter((x) => x.id === decodeURIComponent(idEq)) : [pf0]
      return json(single ? (rows[0] ?? null) : rows)
    }
    if (url.includes('/rpc/app_schema_version')) return json(64)
    if (url.includes('/rpc/app_health_check')) return json({ version: 64, ok: true, missing: [], checkedAt: '' })
    if (url.includes('/rpc/recent_app_errors')) return json({ days: 7, total: 0, groups: [], checkedAt: '' })
    await new Promise((res) => setTimeout(res, Math.max(0, 4000 - (Date.now() - t0))))
    return json([])
  })

  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: UID, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }])
  await p.goto(`${BASE}/performance`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(1600)

  const t = flat(await p.textContent('body'))
  ok((await p.locator('[data-load-state="loading"]').count()) > 0, '㉚ 읽는 중에는 「불러오는 중」')
  ok(!/아직 없음|측정 중/.test(t), '㉛ **읽는 중에 「아직 없음 · 측정 중」을 늘어놓지 않음**', t.slice(0, 70))
  ok(!/0원/.test(t), '㉜ 읽는 중에 0원을 보여 주지 않음')
  await ctx.close()
}

// ── 거래처 상세 · 이 병원에 대해 지금 아는 것 ───────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } })
  wire(ctx)
  const p = await open(ctx, `/clients/${C1}`)
  //  ⚠ 0087 에서 탭 순서가 바뀌었습니다 — 예전에는 「운영조건」이 맨 앞이라
  //    화면을 열자마자 이 패널이 보였습니다. 지금은 「수거이력」이 첫 탭이고
  //    (매일 보는 것이 먼저), 이 패널은 설정성 정보와 함께 맨 뒤에 있습니다.
  //    **패널이 없어진 것이 아니라 자리가 바뀐 것**이라, 검사도 그 자리로 갑니다.
  await p.locator('[data-client-tab="ops"]').first().dispatchEvent('click')
  await p.waitForTimeout(700)
  const t = flat(await p.textContent('body'))

  ok((await p.locator('[data-client-ax]').count()) > 0, '⑱ 거래처 상세에 「지금 아는 것」이 있음 (운영조건 탭)')
  //  ⚠ 근거 없는 영업추천이 있으면 안 됩니다.
  //
  //   처음에 **본문 전체**에서 찾았다가 FAIL 이 났습니다. 잡힌 것은 이 화면에
  //   원래 있던 「영업 전환 이력」 구역이었습니다(담당자가 직접 적는 기록이라
  //   근거 없는 추천이 아닙니다). 재야 할 곳은 **이 패널 안**입니다.
  const axText = flat(await p.locator('[data-client-ax]').innerText())
  ok(!/파세요|권해 드립니다|사시는 게|구매하세요/.test(axText),
    '⑲ **「이걸 파세요」식 영업추천이 이 패널에 없음**', axText.slice(0, 60))
  ok(/실제 기록만/.test(t), '⑳ 실제 기록만 쓴다고 화면이 말함')
  //  fixture 의 c1 은 포털로 요청 2건을 올렸습니다.
  const portal = await p.locator('[data-client-ax-portal]').getAttribute('data-client-ax-portal')
  ok(portal === 'yes', '㉑ 포털을 쓰는 병원으로 표시', String(portal))
  //  PC 에서는 접지 않습니다 — 자리가 있습니다.
  ok((await p.locator('[data-client-ax-more]:visible').count()) === 0, '㉒ PC 에서는 접는 버튼이 없음')
  await ctx.close()
}

// ── 거래처 상세 · 폰에서는 한 줄로 접힌다 ───────────────────────────────────
//
//   다 펴 두었더니 거래처 상세 폰 길이가 3,273px 이 됐습니다(한도 3,100px).
//   기사님·이사님이 아래로 더 밀어야 한다는 뜻이라 그냥 두면 안 됩니다.
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  wire(ctx)
  const p = await open(ctx, `/clients/${C1}`)
  //  ⚠ 0087 탭 순서 변경 — 이 패널은 「운영조건」 탭에 있습니다 (위 참조).
  await p.locator('[data-client-tab="ops"]').first().dispatchEvent('click')
  await p.waitForTimeout(700)

  const more = p.locator('[data-client-ax-more]')
  ok((await more.count()) === 1, '㉓ 폰에서는 한 줄로 접혀 있음')
  //  ⚠ 줄이 **한 번만** 그려져야 합니다. 접힌 사본을 따로 그리면 검사가 늘
  //    숨은 쪽을 집어 「접혀 있다」가 언제나 통과합니다.
  ok((await p.locator('[data-client-ax-body]').count()) === 1, '㉔ 몸통은 한 번만 그려짐 (사본 없음)')
  const bodyVisible = await p.locator('[data-client-ax-body]').isVisible()
  ok(!bodyVisible, '㉕ 접힌 동안 몸통이 실제로 안 보임')

  const box = await more.boundingBox()
  ok(box != null && box.height >= 44, '㉖ 펴는 자리가 44px 이상 (장갑)', box ? `${Math.round(box.height)}px` : '없음')

  await more.dispatchEvent('click')
  await p.waitForTimeout(400)
  ok(await p.locator('[data-client-ax-body]').isVisible(), '㉗ 누르면 펴짐')
  ok((await p.locator('[data-client-ax-portal]').count()) === 1, '㉘ 펴면 내용이 보임')
  ok((await p.locator('[data-client-ax-more]').count()) === 0, '㉙ 한 번 펴면 그 버튼은 사라짐')
  await ctx.close()
}

// ── 폰 390px ────────────────────────────────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  wire(ctx)
  const p = await open(ctx, '/performance?tab=basis')
  const over = await p.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth))
  ok(over === 0, '㉒ 폰에서 가로로 밀리지 않음', `${over}px`)
  ok((await p.locator('[data-ax-stage="paid"]').count()) > 0, '㉓ 폰에서도 입금 완료 칸이 보임')
  const vert = await p.evaluate(() => {
    const bad = []
    for (const el of document.querySelectorAll('[data-ax-num] *')) {
      if (el.children.length > 0) continue
      const t = (el.textContent || '').trim()
      if (t.length < 3) continue
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.width < 44 && r.height > 88) bad.push(`${t.slice(0, 12)} (${Math.round(r.width)}×${Math.round(r.height)})`)
    }
    return bad
  })
  ok(vert.length === 0, '㉔ 폰에서 세로로 늘어진 글자 없음', vert.join(' · '))
  await ctx.close()
}

await b.close()
