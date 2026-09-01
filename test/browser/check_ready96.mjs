import { chromium, EXEC } from './_pw.mjs'

//  0096 — 심사 준비도 화면이 **실데이터를 진짜로 읽는가**
//
//   이 화면의 존재 이유는 「심사장에서 들킬 것을 먼저 들키는 것」입니다.
//   그래서 이 검사는 두 세계를 다 봅니다:
//    · 빈 DB   → 전부 「비어 있음」으로 정직하게 나오는가
//    · 채운 DB → 상태가 실제로 「준비됨」으로 바뀌는가
//   한쪽만 보면 「항상 비어 있음」으로 그리는 고장을 못 잡습니다.

const BASE = 'http://localhost:4173'
const AD = '00000000-0000-0000-0000-0000000000ad'
const C1 = '00000000-0000-0000-0000-0000000000c1'
const ok = (c, m, d = '') => { console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`); if (!c) process.exitCode = 1 }
const flat = (t) => (t ?? '').replace(/\s+/g, ' ').trim()

const ym = (n) => {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** 채운 세계 — 모든 항목이 「준비됨」이 되는 최소 자료 */
function filledWorld() {
  const clients = [{
    id: C1, name: '가나요양병원', type: '병원', address: '경기도 남양주시 오남읍 양지로 1',
    manager: '', phone: '', collection_cycle: '주 1회', collects_medical_waste: true,
    collects_diaper: false, storage_size: '보통', note: '', is_demo_generated: false,
    demo_session_id: null, active: true, contract_start: '2025-01-01', contract_end: null,
    payment_terms: '', payment_due_day: 20, pricing: {},
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  }]
  //  현장 표본 32건 — 시연 아님(demo_session_id null)
  const events = Array.from({ length: 32 }, (_, i) => ({
    id: `ev${i}`, at: `2026-08-${String((i % 28) + 1).padStart(2, '0')}T02:00:00Z`,
    actor_role: 'field', screen: '수거 입력', action: '수거 완료', schedule_id: `s${i}`,
    created_schedule: false, client_id: C1, client_name: '가나요양병원',
    waste_type: '의료폐기물', amount_kg: 50, demo_session_id: null,
    duration_ms: 60000, reverted_at: null,
  }))
  const baseline = {
    id: 1, admin_minutes_per_collection: 3.4, repeat_entries_per_collection: 4,
    monthly_doc_hours: 91.2, monthly_rework_count: 4, daily_capacity: 18.8,
    source: 'survey', updated_at: '2026-08-30T00:00:00Z', updated_by: null,
  }
  const products = [{
    id: 'p1', name: '골판지 전용박스', spec: '30L', unit: '개', sale_price: 1800,
    stock_key: null, available: true, image_url: '', description: '', active: true,
    category: '용기', sort: 1, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  }]
  const costs = [0, 1, 2].map((n) => ({
    id: `oc${n}`, month: ym(n), category: '유류비', amount: 1000000, memo: '',
    actor_id: null, actor_name: '', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  }))
  const orders = [{
    id: 'o1', client_id: C1, status: '전달완료', requester_name: '담당자', source: 'portal',
    note: '', deliver_schedule_id: null, deliver_on: '2026-08-20', requested_at: '2026-08-18T00:00:00Z',
    confirmed_at: '2026-08-18T01:00:00Z', delivered_at: '2026-08-20T02:00:00Z',
    canceled_at: null, cancel_reason: '', demo_session_id: null,
  }]
  const payments = [{
    id: 'pay1', client_id: C1, month: '2026-08', amount: 500000, status: '청구 확정',
    snapshot: { orderIds: ['o1'] }, memo: '', created_at: '2026-08-31T00:00:00Z', updated_at: '2026-08-31T00:00:00Z',
  }]
  const requests = Array.from({ length: 6 }, (_, i) => ({
    id: `rq${i}`, client_id: C1, kind: '추가수거', content: `요청 ${i}`, status: '접수',
    desired_date: null, urgent: false, source: 'portal', requester_name: '담당자',
    created_at: '2026-08-25T00:00:00Z', updated_at: '2026-08-25T00:00:00Z',
    demo_session_id: null, snoozed_until: null, snoozed_by_name: '', reply: '',
  }))
  return { clients, events, baseline, products, costs, orders, payments, requests }
}

const b = await chromium.launch({ executablePath: EXEC })

async function open(path, { world = null, role = 'admin' } = {}) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1200 } })
  const me = {
    id: AD, email: 'a@b.c', name: '송대표', role, font_scale: 'normal', active: true,
    approved_at: '2026-01-01T00:00:00Z', client_id: null, created_at: '2026-01-01T00:00:00Z',
  }
  ctx.route('**/auth/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: AD, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }) }))
  ctx.route('**/rest/v1/**', (r) => {
    const u = r.request().url()
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    //  ⚠ limit/offset 을 지키지 않으면 pageAll 이 영영 돕니다 (0092 교훈)
    const page = (rows) => {
      const m = u.match(/offset=(\d+)/); const off = m ? Number(m[1]) : 0
      const lm = u.match(/limit=(\d+)/); const lim = lm ? Number(lm[1]) : 1000
      return json(rows.slice(off, off + lim))
    }
    if (u.includes('/rpc/app_schema_version')) return json(87)
    if (u.includes('/rpc/')) return json(null)
    if (u.includes('/profiles')) return json(single ? me : [me])
    const w = world
    if (u.includes('/performance_baselines')) return json(w ? w.baseline : null)
    if (u.includes('/clients')) return w ? page(w.clients) : page([])
    if (u.includes('/collection_events')) return w ? page(w.events) : page([])
    if (u.includes('/products')) return w ? page(w.products) : page([])
    if (u.includes('/operating_costs')) return w ? page(w.costs) : page([])
    if (u.includes('/product_orders')) return w ? page(w.orders) : page([])
    if (u.includes('/payments')) return w ? page(w.payments) : page([])
    if (u.includes('/client_requests')) return w ? page(w.requests) : page([])
    return page([])
  })
  const p = await ctx.newPage()
  const errors = []
  p.on('pageerror', (e) => errors.push(String(e)))
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  await p.addInitScript(([k, u]) => localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: AD, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }])
  await p.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(2600)
  return { ctx, p, errors }
}

// ── ① 빈 세계 — 전부 「비어 있음」으로 정직하게 ────────────────────────────
{
  const { ctx, p, errors } = await open('/readiness')
  const items = await p.locator('[data-ready-item]').count()
  ok(items === 9, '준비 항목 9개가 다 나온다', `${items}개`)
  for (const key of ['fieldSamples', 'baseline', 'address', 'productPrice', 'costs', 'newRevenue', 'portalUse']) {
    const st = await p.locator(`[data-ready-item="${key}"]`).getAttribute('data-ready-state')
    ok(st === 'missing', `빈 DB 에서 「${key}」는 비어 있음으로 나온다`, st ?? '없음')
  }
  ok((await p.locator('[data-ready-item="ai"]').getAttribute('data-ready-state')) === 'missing',
    'AI 는 연결 0곳 — 미연결로 정직하게')
  ok((await p.locator('[data-ready-item="ip"]').getAttribute('data-ready-state')) === 'manual',
    '저작권은 「시스템 확인 불가」 — 자동 점검인 척하지 않는다')
  const body = flat(await p.textContent('main'))
  ok(/점수는 내지 않습니다/.test(body), '**합성 점수를 만들지 않는다고 적어 둔다**')
  //  브리핑 — 조사 실측 숫자가 그대로
  ok(/주간 방문 94곳/.test(body), '브리핑에 조사 실측(주간 방문 94곳)이 나온다')
  ok(/3,694km/.test(body), '브리핑에 주간 이동 3,694km 이 나온다')
  ok(/실증 중.*0\/30건/.test(body) || /현장 0\/30건/.test(body), '브리핑도 표본 부족을 감추지 않는다')
  ok(errors.length === 0, '빈 세계 콘솔 오류 0', errors.slice(0, 2).join(' | '))
  await ctx.close()
}

// ── ② 채운 세계 — 상태가 실제로 바뀐다 (화면이 데이터를 진짜 읽는 증거) ────
{
  const { ctx, p, errors } = await open('/readiness', { world: filledWorld() })
  const expect = {
    fieldSamples: 'ok', baseline: 'ok', address: 'ok', productPrice: 'ok',
    costs: 'ok', newRevenue: 'ok', portalUse: 'ok', ai: 'missing', ip: 'manual',
  }
  for (const [key, want] of Object.entries(expect)) {
    const st = await p.locator(`[data-ready-item="${key}"]`).getAttribute('data-ready-state')
    ok(st === want, `채운 DB 에서 「${key}」 → ${want}`, st ?? '없음')
  }
  const v = flat(await p.locator('[data-ready-item="fieldSamples"] [data-ready-value]').innerText())
  ok(/32 \/ 30건/.test(v), '표본 수가 실제 데이터 수와 같다', v)
  ok(errors.length === 0, '채운 세계 콘솔 오류 0', errors.slice(0, 2).join(' | '))

  //  바로가기 — 수거 입력으로 실제 이동
  await p.locator('[data-ready-go="fieldSamples"]').click()
  await p.waitForTimeout(1200)
  ok(p.url().endsWith('/collection'), '「수거 입력」 바로가기가 실제로 이동한다', p.url())
  await ctx.close()
}

// ── ③ 인쇄 — 브리핑만 나온다 ───────────────────────────────────────────────
{
  const { ctx, p } = await open('/readiness')
  await p.emulateMedia({ media: 'print' })
  const brief = await p.locator('[data-ready-brief]').isVisible()
  const list = await p.locator('[data-ready-counts]').isVisible()
  ok(brief, '인쇄에서 브리핑은 보인다')
  ok(!list, '인쇄에서 점검 목록·요약 줄은 빠진다')
  await ctx.close()
}

// ── ④ 권한 — 관리자만 ─────────────────────────────────────────────────────
{
  const { ctx, p } = await open('/readiness', { role: 'field' })
  const body = flat(await p.textContent('body'))
  ok(!/심사 준비도.*지금 데이터로 점검/.test(body), '현장 담당자에게는 안 열린다')
  await ctx.close()
}

await b.close()
