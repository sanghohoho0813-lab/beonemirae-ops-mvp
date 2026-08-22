import { chromium, EXEC } from './_pw.mjs'

//  마이그레이션을 실행하지 않은 DB 를 화면이 알아채는지 확인합니다.
//
//   실행하지 않은 채 새 화면을 열면 **오류 없이 틀린 화면**이 나옵니다.
//   없는 표를 읽으면 권한 문제와 구분이 안 돼 빈 값으로 넘기기 때문입니다 —
//   운영비를 넣었는데 「미입력」으로 보이는 식입니다.
//
//   또 하나: 청구 확정이 서버 함수로 옮겨졌으므로, 두 사람이 동시에 눌러
//   서버가 거부하면 화면이 그 사유를 그대로 보여 줘야 합니다.

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

const TODAY = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
const [Y, M] = TODAY.slice(0, 7).split('-').map(Number)
const prev = new Date(Date.UTC(Y, M - 2, 1))
const MONTH = `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}`

const admin = {
  id: UID, email: 'admin@beonemirae.test', name: '대표', role: 'admin', font_scale: 'normal',
  active: true, approved_at: '2026-01-01T00:00:00Z', client_id: null, created_at: '2026-01-01T00:00:00Z',
}
const office = { ...admin, id: '00000000-0000-0000-0000-0000000000bf', role: 'office', name: '사무실' }
const clients = [{
  id: C1, name: '더원요양병원', type: '병원', address: '', manager: '', phone: '',
  collection_cycle: '주 1회', collects_medical_waste: true, collects_diaper: false,
  storage_size: '보통', note: '', is_demo_generated: false, demo_session_id: null, active: true,
  contract_start: null, contract_end: null, payment_terms: '', payment_due_day: null,
  pricing: { medical: { sale: 1000, cost: 400 } },
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}]
const sched = [{
  id: 's1', date: `${MONTH}-05`, client_id: C1, waste_type: '의료폐기물', vehicle_id: null,
  scheduled_time: '', status: '완료', expected_amount: 100, actual_amount: 100,
  completed_at: `${MONTH}-05T00:00:00Z`, memo: '', origin: 'field', is_additional: false,
  demo_session_id: null, plan_batch: null,
  created_at: `${MONTH}-05T00:00:00Z`, updated_at: `${MONTH}-05T00:00:00Z`,
}]

const b = await chromium.launch({ executablePath: EXEC })

/** version: 숫자면 그 값, null 이면 함수 없음(구버전) */
const open = async (version, prof = admin, opts = {}) => {
  const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 } })
  await ctx.route('**/auth/v1/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: prof.id, aud: 'authenticated', email: prof.email, app_metadata: {}, user_metadata: {} }) }))
  await ctx.route('**/rest/v1/**', (r) => {
    const url = r.request().url()
    const method = r.request().method()
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    if (url.includes('/rpc/app_schema_version')) {
      //  함수가 없는 DB 는 PostgREST 가 404 로 답합니다.
      if (version == null) {
        return r.fulfill({ status: 404, contentType: 'application/json',
          body: JSON.stringify({ message: 'Could not find the function public.app_schema_version' }) })
      }
      return json(version)
    }
    if (url.includes('/rpc/confirm_billing')) {
      if (opts.confirmError) {
        return r.fulfill({ status: 400, contentType: 'application/json',
          body: JSON.stringify({ message: opts.confirmError }) })
      }
      return json({ id: 'new-1' })
    }
    if (url.includes('/audit_logs') && method === 'POST') return json([{ id: 1 }])
    if (url.includes('/profiles')) return json(single ? prof : [prof])
    if (url.includes('/schedules')) return json(sched)
    if (url.includes('/clients')) return json(single ? clients[0] : clients)
    if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
    return json([])
  })
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: prof.id, aud: 'authenticated', email: prof.email, app_metadata: {}, user_metadata: {} }])
  p.on('dialog', (d) => d.accept())
  return { ctx, p }
}

// ── 1. 함수 자체가 없는 DB (0032 이전) ────────────────────────────────────
{
  const { ctx, p } = await open(null)
  await p.goto(`${BASE}/billing`, { waitUntil: 'domcontentloaded' })
  await p.waitForSelector('[data-schema-bar]', { timeout: 20000 })
  const bar = (await p.locator('[data-schema-bar]').textContent()) ?? ''
  ok(/DB 업데이트가 필요합니다/.test(bar), '구버전 DB 에 안내가 뜸')
  ok(/구버전/.test(bar), '서버가 구버전이라고 표시', bar.replace(/\s+/g, ' ').slice(0, 80))
  ok(/RUN 파일을 실행해 주세요/.test(bar), '무엇을 해야 하는지 적음')
  ok(/저장되지 않거나 빈 값으로 보일 수 있습니다/.test(bar), '그냥 두면 무슨 일이 생기는지 적음')
  await ctx.close()
}

// ── 2. 버전이 낮은 DB ─────────────────────────────────────────────────────
{
  const { ctx, p } = await open(30)
  await p.goto(`${BASE}/billing`, { waitUntil: 'domcontentloaded' })
  await p.waitForSelector('[data-schema-bar]', { timeout: 20000 })
  const bar = (await p.locator('[data-schema-bar]').textContent()) ?? ''
  ok(/버전 30/.test(bar), '서버 버전을 그대로 보여 줌', bar.replace(/\s+/g, ' ').slice(0, 80))
  ok(/버전 64/.test(bar), '앱이 기대하는 버전도 함께')
  await ctx.close()
}

// ── 3. 버전이 맞으면 아무것도 뜨지 않아야 합니다 ──────────────────────────
//  ⚠ 여기 숫자는 **앱이 기대하는 판**(EXPECTED_SCHEMA_VERSION)이어야 합니다.
//    판을 올릴 때 이 줄을 같이 안 고치면 「맞는데도 안내가 뜬다」로 나옵니다.
{
  const { ctx, p } = await open(64)
  await p.goto(`${BASE}/billing`, { waitUntil: 'domcontentloaded' })
  await p.waitForSelector('[data-close-summary]', { timeout: 20000 })
  await p.waitForTimeout(800)
  ok((await p.locator('[data-schema-bar]').count()) === 0, '버전이 맞으면 안내가 없음')
  await ctx.close()
}

// ── 4. 더 높은 버전(앞서 나간 DB)도 조용히 ────────────────────────────────
//   앱보다 **앞선** 번호여야 합니다. 앱과 같은 번호를 넣으면 위 3번과 똑같은
//   검사가 되어, 「앞서 나간 DB」는 한 번도 안 해 본 채로 통과합니다.
{
  const { ctx, p } = await open(65)
  await p.goto(`${BASE}/billing`, { waitUntil: 'domcontentloaded' })
  await p.waitForSelector('[data-close-summary]', { timeout: 20000 })
  await p.waitForTimeout(800)
  ok((await p.locator('[data-schema-bar]').count()) === 0, 'DB 가 더 최신이면 안내하지 않음')
  await ctx.close()
}

// ── 5. 사무실 담당자에게는 띄우지 않습니다 (손 쓸 수 없는 경고) ───────────
{
  const { ctx, p } = await open(null, office)
  await p.goto(`${BASE}/billing`, { waitUntil: 'domcontentloaded' })
  await p.waitForSelector('[data-close-summary]', { timeout: 20000 })
  await p.waitForTimeout(800)
  ok((await p.locator('[data-schema-bar]').count()) === 0, '사무실에게는 뜨지 않음 (SQL 은 대표님이 실행)')
  await ctx.close()
}

// ── 6. 청구 확정이 서버 함수를 부르는가 ───────────────────────────────────
{
  const posted = []
  const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 } })
  await ctx.route('**/auth/v1/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: UID, aud: 'authenticated', email: admin.email, app_metadata: {}, user_metadata: {} }) }))
  await ctx.route('**/rest/v1/**', (r) => {
    const url = r.request().url()
    const method = r.request().method()
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    if (url.includes('/rpc/app_schema_version')) return json(32)
    if (url.includes('/rpc/confirm_billing')) {
      posted.push(JSON.parse(r.request().postData() ?? '{}'))
      return json({ id: 'new-1' })
    }
    if (url.includes('/payments') && method === 'POST') {
      posted.push({ DIRECT_INSERT: true })
      return json([{ id: 'x' }])
    }
    if (url.includes('/profiles')) return json(single ? admin : [admin])
    if (url.includes('/schedules')) return json(sched)
    if (url.includes('/clients')) return json(single ? clients[0] : clients)
    if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
    return json([])
  })
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: UID, aud: 'authenticated', email: admin.email, app_metadata: {}, user_metadata: {} }])
  p.on('dialog', (d) => d.accept())
  await p.goto(`${BASE}/billing`, { waitUntil: 'domcontentloaded' })
  await p.waitForSelector('[data-close-summary]', { timeout: 20000 })
  await p.waitForTimeout(500)
  await p.locator('[data-close-confirm]').click()
  await p.waitForTimeout(2500)
  ok(posted.length === 1, '서버 호출 한 번', String(posted.length))
  ok(!posted.some((x) => x.DIRECT_INSERT), 'payments 에 직접 넣지 않음 (서버 함수로만)')
  const body = posted[0] ?? {}
  ok(body.p_client_id === C1 && body.p_month === MONTH, '거래처·청구월을 그대로 보냄', JSON.stringify(body).slice(0, 80))
  ok(body.p_amount === 100000, '금액 10만원 (100kg × 1,000원)', String(body.p_amount))
  ok(Array.isArray(body.p_snapshot?.scheduleIds) && body.p_snapshot.scheduleIds.includes('s1'),
    '어떤 수거를 덮는지 스냅샷에 담아 보냄 — 서버가 중복을 이걸로 판단합니다')
  await ctx.close()
}

// ── 7. 서버가 거부하면 그 사유가 화면에 그대로 ────────────────────────────
{
  const { ctx, p } = await open(32, admin, {
    confirmError: '이미 청구한 수거가 들어 있습니다. 다른 사람이 방금 확정했을 수 있습니다 — 화면을 새로 고쳐 확인해 주세요.',
  })
  await p.goto(`${BASE}/billing`, { waitUntil: 'domcontentloaded' })
  await p.waitForSelector('[data-close-summary]', { timeout: 20000 })
  await p.waitForTimeout(500)
  await p.locator('[data-close-confirm]').click()
  await p.waitForTimeout(2500)
  const res = (await p.locator('[data-close-result]').textContent()) ?? ''
  ok(/이미 청구한 수거가 들어 있습니다/.test(res), '동시 확정 거부 사유가 결과 칸에 그대로 나옴',
    res.replace(/\s+/g, ' ').slice(0, 100))
  ok(/화면을 새로 고쳐 확인해 주세요/.test(res), '무엇을 해야 하는지도 그대로')
  ok(/0곳 · 0원 청구를 확정했습니다/.test(res), '한 건도 확정되지 않은 것으로 집계')
  ok(/1곳은 실패했습니다/.test(res), '실패 건수를 알려 줌')
  await ctx.close()
}

await b.close()
console.log('')
console.log(`총 ${out.length}건 · 실패 ${out.filter((v) => !v).length}건`)
