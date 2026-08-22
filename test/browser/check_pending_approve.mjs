import { chromium, EXEC } from './_pw.mjs'

//  가입 승인 대기 알림.
//
//   실제로 있었던 일: 직원이 신청했는데 아무도 몰랐습니다. 신청한 사람은
//   로그인해도 아무것도 안 보여 「고장 났나」 하고 기다립니다.
//
//   확인하는 것
//    · 기다리는 사람이 있으면 대시보드가 먼저 말한다
//    · 며칠째 기다리는지 사실대로 센다
//    · 없으면 아무것도 그리지 않는다 (없는 일을 만들지 않음)
//    · 관리자가 아니면 조회조차 하지 않는다 (막힐 요청을 보내지 않음)

const BASE = 'http://localhost:4173'
const UID = '00000000-0000-0000-0000-0000000000ad'
const out = []
const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  out.push(c)
  if (!c) process.exitCode = 1
}
const TODAY = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
const shift = (n) => {
  const [y, m, d] = TODAY.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return t.toISOString().slice(0, 10)
}

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

//  기다리는 사람 — 3일째 · 어제 · 오늘
const pending = [
  { id: 'u1', email: 'old@b.c', name: '김기사', role: 'field', active: false, approved_at: null,
    created_at: `${shift(-3)}T02:00:00Z`, client_id: null, font_scale: 'normal' },
  { id: 'u2', email: 'mid@b.c', name: '박사무', role: 'field', active: false, approved_at: null,
    created_at: `${shift(-1)}T02:00:00Z`, client_id: null, font_scale: 'normal' },
  { id: 'u3', email: 'new@b.c', name: '', role: 'field', active: false, approved_at: null,
    created_at: `${TODAY}T02:00:00Z`, client_id: null, font_scale: 'normal' },
]

const b = await chromium.launch({ executablePath: EXEC })

function wire(ctx, { rows, role = 'admin', onProfiles = () => {} }) {
  ctx.route('**/auth/v1/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: UID, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }) }))
  ctx.route('**/rest/v1/**', (r) => {
    const url = r.request().url()
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const pf = { ...me, role }
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    if (url.includes('/rpc/app_schema_version')) return json(64)
    if (url.includes('/profiles')) {
      //  로그인한 본인 조회(id=eq.…)와 「계정 목록 전체」를 구분합니다.
      //  전체 목록을 부르는 것이 곧 「승인 대기 확인」입니다.
      if (url.includes('id=eq.')) return json(single ? pf : [pf])
      onProfiles(url)
      return json([pf, ...rows])
    }
    if (url.includes('/clients')) return json(single ? clients[0] : clients)
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
  await p.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(2500)
  return p
}

// ── 1. 기다리는 사람이 있으면 말한다 ──────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } })
  wire(ctx, { rows: pending })
  const p = await open(ctx)
  ok((await p.locator('[data-pending-approvals]').count()) === 1, '대시보드가 승인 대기를 알려 줌')
  const txt = ((await p.textContent('[data-pending-approvals]')) ?? '').replace(/\s+/g, ' ')
  ok(/기다리는 사람 3명/.test(txt), '몇 명인지 그대로', txt.slice(0, 40))
  ok(/김기사/.test(txt), '가장 오래 기다린 사람을 먼저 보여 줌')
  ok(/3일째 기다리는 중/.test(txt), '며칠째인지 사실대로', (txt.match(/\d+일째 기다리는 중/) ?? [''])[0])
  ok(/외 2명/.test(txt), '나머지 인원수도')
  ok(/승인하면 바로 쓸 수 있습니다/.test(txt), '승인만 하면 된다고 알려 줌 (0041)')
  const href = await p.locator('[data-pending-approvals]').getAttribute('href')
  ok(href === '/users', '누르면 사용자 관리로', href ?? '')
  await ctx.close()
}

// ── 2. 오래 기다릴수록 눈에 띈다 ──────────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } })
  //  오늘 신청한 사람만 — 급하지 않습니다
  wire(ctx, { rows: [pending[2]] })
  const p = await open(ctx)
  const txt = ((await p.textContent('[data-pending-approvals]')) ?? '').replace(/\s+/g, ' ')
  ok(/기다리는 사람 1명/.test(txt), '한 명이면 한 명이라고')
  ok(/오늘 신청/.test(txt), '오늘 신청한 사람은 「오늘 신청」', txt.slice(0, 50))
  ok(/new@b\.c/.test(txt), '이름이 비어 있으면 이메일로 (「」 로 비워 두지 않음)')
  const cls = (await p.locator('[data-pending-approvals]').getAttribute('class')) ?? ''
  ok(!/amber/.test(cls), '오늘 신청은 경고색이 아님')
  await ctx.close()
}
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } })
  wire(ctx, { rows: [pending[0]] })
  const p = await open(ctx)
  const cls = (await p.locator('[data-pending-approvals]').getAttribute('class')) ?? ''
  ok(/amber/.test(cls), '이틀 넘게 기다리면 눈에 띄는 색으로')
  await ctx.close()
}

// ── 3. 없으면 아무것도 그리지 않는다 ──────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } })
  wire(ctx, { rows: [] })
  const p = await open(ctx)
  ok((await p.locator('[data-pending-approvals]').count()) === 0, '기다리는 사람이 없으면 안 뜸')
  const body = ((await p.textContent('body')) ?? '').replace(/\s+/g, ' ')
  ok(!/기다리는 사람/.test(body), '없는 일을 만들어 내지 않음')
  await ctx.close()
}

// ── 4. 관리자가 아니면 조회조차 하지 않는다 ───────────────────────────────
//   RLS 로 막힐 요청을 보내 놓고 오류를 삼키면, 콘솔만 지저분해지고
//   화면에는 아무 일도 안 일어납니다. 아예 부르지 않습니다.
for (const role of ['office', 'field']) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } })
  let listCalls = 0
  wire(ctx, { rows: pending, role, onProfiles: () => { listCalls += 1 } })
  const p = await open(ctx)
  ok((await p.locator('[data-pending-approvals]').count()) === 0, `${role} 화면에는 안 뜸`)
  ok(listCalls === 0, `${role} 은 계정 목록을 조회조차 하지 않음`, `${listCalls}회`)
  await ctx.close()
}

// ── 5. 폰 ─────────────────────────────────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
  wire(ctx, { rows: pending })
  const p = await open(ctx)
  ok((await p.locator('[data-pending-approvals]').count()) === 1, '폰에서도 뜸')
  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  ok(over <= 1, '390px 폭에서 가로 스크롤 없음', `초과 ${over}px`)
  await p.screenshot({ path: 'pending_mo.png' })
  await ctx.close()
}

await b.close()
console.log(`\n총 ${out.length}건 · 실패 ${out.filter((x) => !x).length}건`)
