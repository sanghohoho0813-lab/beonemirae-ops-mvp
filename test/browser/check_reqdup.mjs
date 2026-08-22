import { chromium, EXEC } from './_pw.mjs'

//  0055 — 병원 요청·현장 메모 「다시 눌러도 안전」 (화면 쪽).
//
//   서버 색인만으로는 부족합니다. **화면이 같은 표를 다시 보내야** 막힙니다.
//   누를 때마다 새 표를 만들면 서버는 서로 다른 시도로 보고 둘 다 넣습니다.
//
//   확인하는 것
//    · 화면이 표를 실어 보내는가
//    · 실패해서 다시 누를 때 **같은 표**를 보내는가 (이게 핵심)
//    · 보내진 뒤 다음 요청은 **새 표**인가
//    · 서버가 중복이라고 하면 화면이 「실패」라고 거짓말하지 않는가

const BASE = 'http://localhost:4173'
const UID = '00000000-0000-0000-0000-0000000000cc'
const out = []
const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  out.push(c)
  if (!c) process.exitCode = 1
}
const flat = (s) => (s ?? '').replace(/\s+/g, ' ')
const seen = (p, sel, ms = 20000) => p.waitForSelector(sel, { timeout: ms }).then(() => true, () => false)

const CA = '00000000-0000-0000-0000-0000000000c1'
const clients = [{
  id: CA, name: '가나요양병원', type: '병원', address: '경기도 남양주시 오남읍 양지로 47-35',
  manager: '', phone: '', collection_cycle: '주 1회', collects_medical_waste: true, collects_diaper: false,
  storage_size: '보통', note: '', is_demo_generated: false, demo_session_id: null, active: true,
  contract_start: '2025-01-01', contract_end: null, payment_terms: '', payment_due_day: 20,
  pricing: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}]

const b = await chromium.launch({ executablePath: EXEC })

/**
 * @param fail  몇 번째 시도까지 실패로 돌려줄지 (통신 끊김 흉내)
 * @param dupAfter  이 번째부터는 「이미 있음」(23505) 으로 돌려줍니다
 */
function wire(ctx, { role = 'client', posts = [], fail = 0, dupAfter = 0 } = {}) {
  const pf = {
    id: UID, email: 'a@b.c', name: '가나요양병원 담당자', role, font_scale: 'normal',
    active: true, approved_at: '2026-01-01T00:00:00Z',
    client_id: role === 'client' ? CA : null, created_at: '2026-01-01T00:00:00Z',
  }
  ctx.route('**/auth/v1/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: UID, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }) }))
  ctx.route('**/rest/v1/**', (r) => {
    const url = r.request().url()
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    if (url.includes('/client_requests') && r.request().method() === 'POST') {
      posts.push(r.request().postDataJSON())
      if (posts.length <= fail) {
        return r.fulfill({ status: 500, contentType: 'application/json',
          body: JSON.stringify({ message: '서버에 연결하지 못했습니다' }) })
      }
      if (dupAfter && posts.length >= dupAfter) {
        //  서버 색인이 막은 것 — 오류가 아니라 「이미 저장됨」입니다.
        return r.fulfill({ status: 409, contentType: 'application/json',
          body: JSON.stringify({
            code: '23505',
            message: 'duplicate key value violates unique constraint "client_requests_request_uniq"',
          }) })
      }
      return json([{ id: 'new-req' }])
    }
    if (url.includes('/rpc/app_schema_version')) return json(64)
    if (url.includes('/rpc/app_health_check')) return json({ version: 64, ok: true, missing: [], checkedAt: '' })
    if (url.includes('/rpc/recent_app_errors')) return json({ days: 7, total: 0, groups: [], checkedAt: '' })
    if (url.includes('/profiles')) return json(single ? pf : [pf])
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

/** 병원 포털에서 요청 한 건 보내기 */
async function sendRequest(p, text) {
  //  「요청하기」를 열고 내용을 적습니다.
  const openBtn = p.getByRole('button', { name: /요청/ }).first()
  await openBtn.click()
  await p.waitForTimeout(700)
  const box = p.locator('textarea').first()
  if (await box.count()) {
    await box.fill(text)
  }
  await p.waitForTimeout(300)
  const send = p.getByRole('button', { name: /보내기|요청 보내기|접수/ }).last()
  await send.click()
  await p.waitForTimeout(1500)
}

// ── 1. 화면이 표를 실어 보낸다 ──────────────────────────────────────────────
{
  const posts = []
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  wire(ctx, { posts })
  const p = await open(ctx, '/portal')
  await sendRequest(p, '3층 창고가 찼습니다')
  ok(posts.length === 1, '요청이 서버로 감', `${posts.length}건`)
  const body = Array.isArray(posts[0]) ? posts[0][0] : posts[0]
  ok(typeof body?.request_id === 'string' && body.request_id.length >= 32,
    '**저장시도 표를 실어 보냄** (0055)', String(body?.request_id).slice(0, 12) + '…')
  await ctx.close()
}

// ── 2. 실패해서 다시 누르면 같은 표 ─────────────────────────────────────────
//   이게 핵심입니다. 누를 때마다 새 표를 만들면 서버는 서로 다른 시도로
//   보고 둘 다 넣습니다 — 중복 방어가 아무 일도 안 합니다.
{
  const posts = []
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  wire(ctx, { posts, fail: 1 }) // 첫 번째는 실패
  const p = await open(ctx, '/portal')
  await sendRequest(p, '3층 창고가 찼습니다')
  ok(posts.length === 1, '첫 시도가 서버로 감')
  const body0 = Array.isArray(posts[0]) ? posts[0][0] : posts[0]

  //  실패 안내가 뜨고 적은 내용이 남아 있어야 합니다.
  ok(await seen(p, '[data-req-error]', 4000), '실패 안내 칸이 뜸')
  const afterFail = flat(await p.textContent('[data-req-error]'))
  ok(/보내지 못했습니다|접수하지 못했습니다|연결하지 못했습니다/.test(afterFail),
    '실패했다고 그 칸에 적음', afterFail.slice(0, 60))
  ok(/적으신 내용은 그대로 있습니다/.test(afterFail), '적은 내용이 남아 있다고 알려 줌')
  ok((await p.locator('[data-req-sent]').count()) === 0, '**실패했는데 「접수되었습니다」를 띄우지 않음**')

  //  다시 보내기
  const send = p.getByRole('button', { name: /보내기|요청 보내기|접수/ }).last()
  await send.click()
  await p.waitForTimeout(1600)
  ok(posts.length === 2, '다시 눌러 두 번째 시도가 감', `${posts.length}건`)
  const body1 = Array.isArray(posts[1]) ? posts[1][0] : posts[1]
  ok(body0?.request_id === body1?.request_id,
    '**다시 눌러도 같은 표** — 이게 없으면 서버 색인이 아무 일도 못 합니다',
    `${String(body0?.request_id).slice(0, 8)} vs ${String(body1?.request_id).slice(0, 8)}`)
  await ctx.close()
}

// ── 3. 보내진 뒤 다음 요청은 새 표 ──────────────────────────────────────────
//   같은 표를 계속 쓰면 두 번째 진짜 요청이 조용히 사라집니다.
{
  const posts = []
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  wire(ctx, { posts })
  const p = await open(ctx, '/portal')
  await sendRequest(p, '3층 창고가 찼습니다')
  await p.waitForTimeout(600)
  await sendRequest(p, '바늘통도 필요합니다')
  ok(posts.length === 2, '두 번 보냄', `${posts.length}건`)
  const a = Array.isArray(posts[0]) ? posts[0][0] : posts[0]
  const c = Array.isArray(posts[1]) ? posts[1][0] : posts[1]
  ok(a?.request_id !== c?.request_id,
    '**성공한 뒤에는 새 표** — 진짜 두 번째 요청이 조용히 사라지면 안 됩니다',
    `${String(a?.request_id).slice(0, 8)} vs ${String(c?.request_id).slice(0, 8)}`)
  await ctx.close()
}

// ── 4. 서버가 「이미 있음」이라고 하면 실패가 아니다 ────────────────────────
//   병원 화면에 「보내지 못했습니다」가 뜨면, 이미 들어간 요청을 또
//   보내려고 계속 누르게 됩니다.
{
  const posts = []
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  wire(ctx, { posts, dupAfter: 1 }) // 첫 시도부터 「이미 있음」
  const p = await open(ctx, '/portal')
  await sendRequest(p, '3층 창고가 찼습니다')
  ok((await p.locator('[data-req-error]').count()) === 0,
    '**「이미 저장됨」을 실패라고 하지 않음** — 이미 들어간 것을 또 보내게 만들면 안 됩니다')
  ok(await seen(p, '[data-req-sent]', 4000), '접수된 것으로 보여 줌')
  const okBox = flat(await p.textContent('[data-req-sent]'))
  ok(/요청이 접수되었습니다/.test(okBox), '접수 안내 문구가 그 칸에 있음', okBox.slice(0, 50))
  await ctx.close()
}

console.log('')
console.log(`총 ${out.length}건 · 실패 ${out.filter((v) => !v).length}건`)
await b.close()
