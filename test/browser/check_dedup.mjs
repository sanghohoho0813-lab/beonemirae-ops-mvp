import { chromium, EXEC } from './_pw.mjs'

//  같은 거래처가 두 곳이 되지 않게 — 거래처 등록 화면 (0045).
//
//   거래처가 갈리면 수거·청구·미수금·매출이 전부 반쪽이 되고 되돌릴 수 없습니다.
//   예전 화면에는 브라우저 확인 창 한 줄이 있었습니다 — 「그래도 만들까요?」.
//   어느 거래처와 부딪히는지, 그쪽에 뭐가 쌓였는지 알 수 없었고, 이름이
//   글자 그대로 같을 때만 떴습니다.
//
//   확인하는 것
//    · 띄어쓰기·(주)·의료법인만 다른 이름도 부딪히는 것으로 본다
//    · 부딪히는 **거래처를 이름과 실적으로** 보여 준다
//    · 누르면 **그 거래처로 간다** (대부분 찾던 것이 그것입니다)
//    · 「다른 병원입니다」를 눌러야만 서버에 allow 를 보낸다
//    · 표에 직접 넣지 않고 **전용 함수**로 보낸다 · 저장 시도 표를 붙인다
//    · 서버가 막으면 창을 닫지 않고 그대로 말한다 (성공한 척 금지)

const BASE = 'http://localhost:4173'
const UID = '00000000-0000-0000-0000-0000000000ad'

const out = []
const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  out.push(c)
  if (!c) process.exitCode = 1
}
const TODAY = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })

const profile = {
  id: UID, email: 'admin@beonemirae.test', name: '대표', role: 'admin', font_scale: 'normal',
  active: true, approved_at: '2026-01-01T00:00:00Z', client_id: null, created_at: '2026-01-01T00:00:00Z',
}
const C1 = '00000000-0000-0000-0000-000000000001'
const C2 = '00000000-0000-0000-0000-000000000002'
const mkClient = (id, name, active = true) => ({
  id, name, type: '병원', address: '남양주시', manager: '', phone: '', collection_cycle: '주 1회',
  collects_medical_waste: true, collects_diaper: false, storage_size: '보통', note: '',
  is_demo_generated: false, demo_session_id: null, active,
  contract_start: '2025-01-01', contract_end: null, payment_terms: '', payment_due_day: 20,
  pricing: { medical: { sale: 950, cost: 350 } }, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  biz_no: '124-81-00998', vat_mode: '별도', flat_fee_when_empty: false, flat_fee_policy_at: '2026-01-01T00:00:00Z',
})
let clients = []
//  장면마다 처음 상태로 되돌립니다 — 앞 장면이 만든 거래처가 남아 있으면
//  뒤 장면이 엉뚱한 이유로 통과하거나 실패합니다.
const reset = () => { clients = [mkClient(C1, '오남한양병원'), mkClient(C2, '해올요양병원', false)] }
reset()
const schedules = [{
  id: 's1', date: `${TODAY}`, client_id: C1, waste_type: '의료폐기물', vehicle_id: null,
  scheduled_time: '', status: '완료', expected_amount: 500, actual_amount: 500,
  completed_at: `${TODAY}T09:00:00Z`, memo: '', origin: 'migrated', is_additional: false,
  demo_session_id: null, plan_batch: null, created_at: `${TODAY}T00:00:00Z`, updated_at: `${TODAY}T00:00:00Z`,
}]
const payments = [{
  id: 'p1', client_id: C1, billing_month: '2026-07', amount: 500000, status: '입금완료',
  method: '무통장', paid_at: `${TODAY}T00:00:00Z`, memo: '', snapshot: null, canceled_at: null,
}]

const b = await chromium.launch({ executablePath: EXEC })

function wire(ctx, { rpc, inserts, mode = 'ok' }) {
  reset()
  ctx.route('**/auth/v1/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: UID, aud: 'authenticated', email: profile.email, app_metadata: {}, user_metadata: {} }) }))
  ctx.route('**/rest/v1/**', (r) => {
    const url = r.request().url()
    const method = r.request().method()
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    if (url.includes('/rpc/create_client')) {
      const body = r.request().postDataJSON()
      rpc.push(body)
      if (mode === 'blocked' && !body.p_allow_duplicate) {
        //  화면이 못 본 사이 다른 사람이 먼저 만든 경우 — 서버만 막을 수 있습니다
        return r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({
          code: 'P0001',
          message: '이미 같은 이름의 거래처가 있습니다 — 오남한양병원. 같은 곳이면 그 거래처를 쓰시고, 정말 다른 병원이면 「다른 병원입니다」를 눌러 주세요.',
        }) })
      }
      const id = '00000000-0000-0000-0000-0000000000f' + rpc.length
      clients.push(mkClient(id, body.p_client?.name ?? '새거래처'))
      return json({ id, alreadySaved: false, duplicates: [] })
    }
    if (url.includes('/rpc/app_schema_version')) return json(64)
    if (url.includes('/audit_logs')) return json([{ id: 1 }])
    if (url.includes('/clients') && method === 'POST') {
      //  0045 이후로는 여기로 오면 안 됩니다 — 표에 직접 넣는 길입니다
      inserts.push(JSON.parse(r.request().postData() ?? '{}'))
      return json([clients[0]])
    }
    if (url.includes('/profiles')) return json(single ? profile : [profile])
    if (url.includes('/schedules')) return json(schedules)
    if (url.includes('/payments')) return json(payments)
    if (url.includes('/clients')) {
      if (single) {
        const m = url.match(/id=eq\.([0-9a-f-]+)/)
        return json(clients.find((c) => c.id === m?.[1]) ?? clients[0])
      }
      return json(url.includes('active=eq.false') ? clients.filter((c) => !c.active) : clients)
    }
    if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
    return json([])
  })
}
async function open(ctx) {
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: UID, aud: 'authenticated', email: profile.email, app_metadata: {}, user_metadata: {} }])
  await p.goto(`${BASE}/clients`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(2200)
  return p
}
async function typeName(p, name) {
  await p.getByRole('button', { name: '＋ 추가' }).click()
  await p.waitForTimeout(400)
  //  첫 칸은 목록 검색창입니다 — 창 안의 「거래처명」 칸을 집습니다.
  await p.locator('.fixed input, [role="dialog"] input').first().fill(name)
  await p.getByRole('button', { name: '저장' }).last().click()
  await p.waitForTimeout(700)
}

// ── 1. 부딪히면 「어느 거래처인지」 보여 준다 ─────────────────────────────
for (const [label, name] of [
  ['똑같은 이름', '오남한양병원'],
  ['띄어쓰기만 다른 이름', '오남한양 병원'],
  ['(주) 만 붙인 이름', '(주)오남한양병원'],
  ['의료법인만 붙인 이름', '의료법인 오남한양병원'],
]) {
  const rpc = []
  const inserts = []
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1100 } })
  wire(ctx, { rpc, inserts })
  const p = await open(ctx)
  await typeName(p, name)
  const list = await p.locator('[data-dup-list]').count()
  ok(list === 1, `${label} → 부딪히는 거래처를 보여 줌`, list ? '' : '(안 뜸)')
  ok((await p.locator(`[data-dup-open="${C1}"]`).count()) === 1, `${label} → 오남한양병원을 집어 줌`)
  ok(rpc.length === 0, `${label} → 물어보기 전에는 서버로 안 보냄`, `${rpc.length}회`)
  await ctx.close()
}

// ── 2. 그 거래처에 뭐가 쌓였는지 · 누르면 그리로 간다 ────────────────────
{
  const rpc = []
  const inserts = []
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1100 } })
  wire(ctx, { rpc, inserts })
  const p = await open(ctx)
  await typeName(p, '오남한양 병원')
  const txt = ((await p.textContent('[data-dup-list]')) ?? '').replace(/\s+/g, ' ')
  ok(/수거 1건 · 청구 1건/.test(txt), '그 거래처에 뭐가 쌓였는지 함께 보여 줌', txt.slice(0, 60))
  const warn = ((await p.textContent('body')) ?? '').replace(/\s+/g, ' ')
  ok(/수거·청구·미수금이 둘로 갈리고 되돌릴 수 없습니다/.test(warn), '왜 위험한지 말함')
  await p.click(`[data-dup-open="${C1}"]`)
  await p.waitForTimeout(1200)
  ok(p.url().includes(`/clients/${C1}`), '누르면 그 거래처로 감 — 대부분 찾던 것이 그것입니다', p.url().slice(-45))
  ok(rpc.length === 0, '그리로 갔으면 아무것도 안 만듦', `${rpc.length}회`)
  await ctx.close()
}

// ── 3. 거래 종료한 거래처도 셉니다 ────────────────────────────────────────
{
  const rpc = []
  const inserts = []
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1100 } })
  wire(ctx, { rpc, inserts })
  const p = await open(ctx)
  await typeName(p, '해올 요양병원')
  ok((await p.locator(`[data-dup-open="${C2}"]`).count()) === 1,
    '거래 종료한 곳과 이름이 같아도 보여 줌 — 지난 기록이 그쪽에 있습니다')
  const txt = ((await p.textContent('[data-dup-list]')) ?? '').replace(/\s+/g, ' ')
  ok(/거래 종료/.test(txt), '「거래 종료」라고 표시함', txt.slice(0, 50))
  await ctx.close()
}

// ── 4. 「다른 병원입니다」를 눌러야만 만든다 ──────────────────────────────
{
  const rpc = []
  const inserts = []
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1100 } })
  wire(ctx, { rpc, inserts })
  const p = await open(ctx)
  await typeName(p, '오남한양병원')
  await p.click('[data-dup-force]')
  await p.waitForTimeout(1500)
  ok(rpc.length === 1, '눌렀을 때만 서버로 감', `${rpc.length}회`)
  ok(rpc[0]?.p_allow_duplicate === true, '「다른 병원이다」를 서버에 그대로 전함', String(rpc[0]?.p_allow_duplicate))
  ok(inserts.length === 0, '표에 직접 넣지 않고 전용 함수로 감', `${inserts.length}회`)
  ok(typeof rpc[0]?.p_request_id === 'string' && rpc[0].p_request_id.length === 36,
    '저장 시도 표를 붙여 보냄 — 다시 눌러도 두 곳이 안 됨', rpc[0]?.p_request_id ?? '(없음)')
  ok(rpc[0]?.p_client?.name === '오남한양병원', '이름을 그대로 보냄 (시스템이 고쳐 쓰지 않음)', rpc[0]?.p_client?.name)
  await ctx.close()
}

// ── 5. 안 부딪히면 그냥 만든다 ────────────────────────────────────────────
{
  const rpc = []
  const inserts = []
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1100 } })
  wire(ctx, { rpc, inserts })
  const p = await open(ctx)
  await typeName(p, '새로생긴의원')
  ok((await p.locator('[data-dup-list]').count()) === 0, '안 부딪히면 묻지 않음')
  ok(rpc.length === 1 && rpc[0]?.p_allow_duplicate === false, '바로 만들되 allow 는 안 켬',
    JSON.stringify({ n: rpc.length, allow: rpc[0]?.p_allow_duplicate }))
  ok(inserts.length === 0, '이때도 표에 직접 넣지 않음')
  await ctx.close()
}

// ── 6. 서버가 막으면 성공한 척하지 않는다 ────────────────────────────────
//   화면이 확인한 뒤에도 다른 사람이 먼저 만들었을 수 있습니다. 그건 서버만
//   압니다. 그때 창을 닫고 넘어가면 「만들었는데 없다」가 됩니다.
{
  const rpc = []
  const inserts = []
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1100 } })
  wire(ctx, { rpc, inserts, mode: 'blocked' })
  const p = await open(ctx)
  await typeName(p, '새로생긴의원')
  await p.waitForTimeout(1200)
  ok((await p.locator('[data-client-save-error]').count()) === 1, '못 만들었다고 창 안에서 말함')
  ok(!p.url().includes('/clients/0000'), '만들지도 않고 새 거래처 화면으로 가지 않음', p.url().slice(-40))
  const body = ((await p.textContent('body')) ?? '').replace(/\s+/g, ' ')
  ok(/이미 같은 이름의 거래처가 있습니다/.test(body), '서버가 한 말을 그대로 보여 줌')
  await ctx.close()
}

await b.close()
console.log(`\n총 ${out.length}건 · 실패 ${out.filter((x) => !x).length}건`)
