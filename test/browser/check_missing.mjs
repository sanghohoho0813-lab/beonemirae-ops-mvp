import { chromium, EXEC } from './_pw.mjs'

//  RUN 파일 하나를 아직 안 올린 서버 — 표 하나가 없을 때.
//
//   대표님이 실제로 겪으신 일입니다. 화면 맨 위에 빨간 띠로
//   「이 기능에 필요한 항목이 서버에 아직 준비되지 않았습니다」만 뜨고,
//   **무엇이** 없는지는 어디에도 없었습니다. SQL 을 다 돌리고도 무엇을
//   더 해야 하는지 알 수 없는 오류는 없는 것과 같습니다.
//
//   확인하는 것
//    · 표 하나가 없다고 **대시보드 전체가 멈추지 않는다**
//      (수거·청구·미수금은 그 표와 아무 상관이 없습니다)
//    · 관리자에게 **무엇이 없는지 이름을 대고** 알려 준다
//    · 사무실·현장에는 손 쓸 수 없는 경고를 띄우지 않는다
//    · 핵심 표(거래처)가 없으면 그때는 **멈추는 것이 맞다**

const BASE = 'http://localhost:4173'
const UID = '00000000-0000-0000-0000-0000000000ad'
const out = []
const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  out.push(c)
  if (!c) process.exitCode = 1
}
const flat = (s) => (s ?? '').replace(/\s+/g, ' ')

const me = {
  id: UID, email: 'a@b.c', name: '대표', role: 'admin', font_scale: 'normal',
  active: true, approved_at: '2026-01-01T00:00:00Z', client_id: null, created_at: '2026-01-01T00:00:00Z',
}
const CA = '00000000-0000-0000-0000-0000000000a1'
const clients = [{
  id: CA, name: '가나요양병원', type: '병원', address: '서울시', manager: '', phone: '',
  collection_cycle: '주 2회', collects_medical_waste: true, collects_diaper: false, storage_size: '보통',
  note: '', is_demo_generated: false, demo_session_id: null, active: true,
  contract_start: '2025-01-01', contract_end: null, payment_terms: '', payment_due_day: 25, pricing: {},
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  collect_time: '', disposal_site: '', diaper_cycle: '',
}]

//  PostgREST 가 실제로 돌려주는 모양 그대로입니다. 지어낸 문구가 아닙니다.
const notInCache = (name) => ({
  status: 404,
  contentType: 'application/json',
  body: JSON.stringify({
    code: 'PGRST205',
    message: `Could not find the table '${name}' in the schema cache`,
  }),
})

const b = await chromium.launch({ executablePath: EXEC })

function wire(ctx, { role = 'admin', gone = [], version = 64 } = {}) {
  ctx.route('**/auth/v1/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: UID, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }) }))
  ctx.route('**/rest/v1/**', (r) => {
    const url = r.request().url()
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    //  아직 안 올린 RUN 파일 때문에 없는 표.
    for (const g of gone) {
      if (new RegExp(`/rest/v1/${g}(\\?|$)`).test(url)) return r.fulfill(notInCache(`public.${g}`))
    }
    if (url.includes('/rpc/app_schema_version')) return json(version)
    if (url.includes('/rpc/')) return json(null)
    if (url.includes('/profiles')) return json(single ? { ...me, role } : [{ ...me, role }])
    if (url.includes('/clients')) return json(single ? clients[0] : clients)
    if (url.includes('/office_stock')) {
      const st = { id: 1, corrugated_box: 500, plastic_container: 200, bag: 900, needle_box: 120 }
      return json(single ? st : [st])
    }
    return json([])
  })
}
async function open(ctx, path = '/') {
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: UID, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }])
  await p.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(2600)
  return p
}

// ── 1. 표 하나가 없어도 나머지는 그대로 돈다 ─────────────────────────────
//   예전에는 여기서 빨간 띠 하나만 남고 대시보드가 통째로 멈췄습니다.
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1300 } })
  wire(ctx, { gone: ['staff'] })
  const p = await open(ctx)
  const body = flat(await p.textContent('body'))
  ok(/오늘 운영 현황/.test(body), '대시보드가 그려짐')
  ok((await p.locator('nav, aside').count()) > 0, '왼쪽 메뉴도 그대로')
  //  ★ 여기가 핵심입니다 — 빨간 띠가 뜨면 그 뒤 자료는 서버에서 온 것이
  //    아닙니다. 예전에는 staff 표 하나 때문에 이 띠가 떴습니다.
  ok((await p.locator('[data-sync-error]').count()) === 0,
    '**빨간 오류 띠가 안 뜸** — 표 하나 때문에 전체 로드가 실패하지 않음',
    flat(await p.textContent('[data-sync-error]').catch(() => '')).slice(0, 70))
  //  거래처는 멀쩡히 읽혔으므로 **서버에서 온 그 이름**이 보여야 합니다.
  await p.goto(`${BASE}/clients`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(1500)
  ok(/가나요양병원/.test(flat(await p.textContent('body'))), '읽을 수 있었던 자료는 그대로 씀')
  await ctx.close()
}

// ── 2. 무엇이 없는지 이름을 댄다 ─────────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1300 } })
  wire(ctx, { gone: ['staff', 'products'] })
  const p = await open(ctx)
  ok((await p.locator('[data-schema-bar]').count()) === 1, '관리자에게 안내 띠가 뜸')
  const t = flat(await p.textContent('[data-schema-missing]'))
  ok(/직원 명부/.test(t), '**무엇이** 없는지 우리 말로 — 직원 명부', t.slice(0, 90))
  ok(/소모품 상품/.test(t), '빠진 것이 둘이면 둘 다')
  ok(/public\.staff/.test(t), '서버가 말한 이름도 그대로 — SQL Editor 에서 찾을 수 있게')
  ok(/RUN/.test(flat(await p.textContent('[data-schema-bar]'))), '무엇을 하면 되는지도 함께')
  await ctx.close()
}

// ── 3. 사무실에게도 알린다 — 다만 다른 말로 ─────────────────────────────
//   돈이 걸린 화면이 조용히 0원을 보여 주는 것이 제일 위험합니다.
//   보는 사람은 그게 진짜 0원인지 못 읽은 것인지 알 수 없습니다.
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1300 } })
  wire(ctx, { role: 'office', gone: ['payments'] })
  const p = await open(ctx)
  ok((await p.locator('[data-schema-bar]').count()) === 1, '사무실도 못 읽은 자료가 있으면 알게 됨')
  const t = flat(await p.textContent('[data-schema-bar]'))
  ok(/청구/.test(t), '무엇을 못 읽었는지 사무실에게도 이름을 댐', t.slice(0, 100))
  ok(/관리자에게 알려/.test(t), '사무실이 할 수 있는 일을 알려 줌')
  ok(!/SQL Editor/.test(t), 'SQL 을 실행하라고 하지 않음 — 사무실은 못 합니다')
  ok(flat(await p.textContent('body')).length > 300, '사무실 화면도 그대로 돔')
  await ctx.close()
}

// ── 3-b. 판 번호만 낮은 것은 여전히 대표님에게만 ─────────────────────────
//   손 쓸 수 없는 경고를 사무실에 띄우면 매일 보다가 안 보게 됩니다.
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1300 } })
  wire(ctx, { role: 'office', gone: [], version: 40 })
  const p = await open(ctx)
  ok((await p.locator('[data-schema-bar]').count()) === 0, '빠진 표 없이 판만 낮으면 사무실에는 안 뜸')
  await ctx.close()
}

// ── 4. 다 제자리에 있으면 아무것도 안 뜬다 ───────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1300 } })
  wire(ctx, { gone: [] })
  const p = await open(ctx)
  ok((await p.locator('[data-schema-bar]').count()) === 0, '빠진 것이 없으면 조용함')
  await ctx.close()
}

// ── 5. 핵심 표가 없으면 그때는 멈추는 것이 맞다 ──────────────────────────
//   거래처가 없으면 화면에 뜨는 숫자가 전부 틀립니다. 조용히 「0곳」이라고
//   보여 주는 쪽이 훨씬 위험합니다.
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1300 } })
  wire(ctx, { gone: ['clients'] })
  const p = await open(ctx)
  const body = flat(await p.textContent('body'))
  ok(/준비되지 않았습니다/.test(body), '핵심 표가 없으면 멈추고 알림', body.slice(0, 120))
  ok(/clients/.test(body), '이때도 무엇이 없는지 이름을 댐')
  await ctx.close()
}

await b.close()
console.log(`\n총 ${out.length}건 · 실패 ${out.filter((x) => !x).length}건`)
