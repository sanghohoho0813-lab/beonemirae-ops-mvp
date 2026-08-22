import { chromium, EXEC } from './_pw.mjs'

//  병원 첫 화면 — 병원이 여기 들어오는 이유 두 가지.
//
//   이사님 통화 기준으로 병원이 급한 것은 ① 수거를 한 번 더 와 달라 와
//   ② 용기가 모자란다 입니다. 「소모품 주문」이라고 적어 두면 판매 상품
//   목록처럼 읽혀서, 정작 용기가 없어 못 버리는 병원이 그 칸을 안 누르고
//   전화를 겁니다.
//
//   ⚠ 여기서 확인하는 것은 **글자만 바뀌고 저장값은 그대로인가** 입니다.
//     `소모품` 은 DB CHECK 로 굳어 있는 값이라 바꾸려면 migration 이
//     필요합니다. 화면 글자를 바꾸면서 저장값까지 같이 바꿔 버리면 그날
//     들어온 요청이 전부 서버에서 거절됩니다 — 그것을 8번에서 잽니다.

const BASE = 'http://localhost:4173'
const UID = '00000000-0000-0000-0000-0000000000ad'
const CA = '00000000-0000-0000-0000-0000000000c1'
const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  if (!c) process.exitCode = 1
}
const flat = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const TODAY = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
const fwd = (n) => {
  const d = new Date(`${TODAY}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

const clients = [{
  id: CA, name: '가나요양병원', type: '병원', address: '', manager: '', phone: '',
  collection_cycle: '주 1회', collects_medical_waste: true, collects_diaper: false,
  storage_size: '보통', note: '', is_demo_generated: false, demo_session_id: null, active: true,
  contract_start: '2025-01-01', contract_end: null, payment_terms: '', payment_due_day: 20,
  pricing: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}]

const schedules = [{
  id: 's-next', date: fwd(3), client_id: CA, waste_type: '의료폐기물', vehicle_id: null,
  scheduled_time: '09:30', status: '예정', expected_amount: 100, actual_amount: null,
  completed_at: null, memo: '', origin: 'system', is_additional: false, demo_session_id: null,
  plan_batch: null, created_at: `${TODAY}T00:00:00Z`, updated_at: `${TODAY}T00:00:00Z`,
}]

//  ⚠ **저장값은 `소모품`** 입니다 — 화면에서만 「자재·용기」로 읽혀야 합니다.
const requests = [{
  id: 'r-sup', client_id: CA, kind: '소모품', content: '20L 용기가 다 떨어졌습니다',
  desired_date: null, urgent: false, status: '접수', source: 'portal',
  requester_name: '병원 담당자', reply: '', handled_by: null, handled_at: null,
  request_id: null, created_at: `${TODAY}T01:00:00Z`, demo_session_id: null,
}]

const b = await chromium.launch({ executablePath: EXEC })

function wire(ctx, { posted = [] } = {}) {
  const pf = {
    id: UID, email: 'a@b.c', name: '가나요양병원 담당자', role: 'client',
    font_scale: 'normal', active: true, approved_at: '2026-01-01T00:00:00Z',
    client_id: CA, created_at: '2026-01-01T00:00:00Z',
  }
  ctx.route('**/auth/v1/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: UID, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }) }))
  ctx.route('**/rest/v1/**', (r) => {
    const url = r.request().url()
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    if (r.request().method() === 'POST' && url.includes('/client_requests')) {
      posted.push(r.request().postDataJSON())
      return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    }
    if (url.includes('/rpc/app_schema_version')) return json(64)
    if (url.includes('/rpc/app_health_check')) return json({ version: 64, ok: true, missing: [], checkedAt: '' })
    if (url.includes('/rpc/recent_app_errors')) return json({ days: 7, total: 0, groups: [], checkedAt: '' })
    if (url.includes('/profiles')) return json(single ? pf : [pf])
    if (url.includes('/client_requests')) return json(requests)
    if (url.includes('/schedules')) return json(schedules)
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
  await p.waitForTimeout(2400)
  return p
}

const box = async (p, sel) => (await p.locator(sel).first().boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 }

// ── 1~5. 폰 첫 화면 ─────────────────────────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
  wire(ctx)
  const p = await open(ctx, '/portal')
  const found = await p.waitForSelector('[data-portal-cta="collect"]', { timeout: 20000 }).then(() => true, () => false)
  ok(found, '병원 첫 화면이 뜸')

  const c1 = await box(p, '[data-portal-cta="collect"]')
  const c2 = await box(p, '[data-portal-cta="supplies"]')

  //  두 개가 **스크롤 없이** 보여야 합니다. 안 보이면 병원은 그냥 전화합니다.
  ok(c1.y + c1.height <= 844, '① 수거 요청이 첫 화면 안에 다 보임', `아래끝 ${Math.round(c1.y + c1.height)}px`)
  ok(c2.y + c2.height <= 844, '② 자재·용기 요청이 첫 화면 안에 다 보임', `아래끝 ${Math.round(c2.y + c2.height)}px`)

  const t2 = flat(await p.textContent('[data-portal-cta="supplies"]'))
  ok(/자재·용기 요청/.test(t2), '두 번째 버튼이 「자재·용기 요청」', t2.slice(0, 40))
  ok(!/소모품/.test(t2), '**「소모품」이라고 부르지 않음** — 물건을 사라는 뜻이 아닙니다')
  ok(/용기|봉투|바늘통/.test(t2), '무엇이 부족할 때 누르는지 적혀 있음', t2.slice(0, 70))

  //  손가락으로 누를 수 있는 크기인지 — 병원 담당자는 겸직입니다
  ok(c1.height >= 44 && c2.height >= 44, '두 버튼 다 44px 이상', `${Math.round(c1.height)}px · ${Math.round(c2.height)}px`)

  //  가격표가 첫 화면에 나오면 「지금 파는 중」으로 읽힙니다 (지시 14)
  const head = flat(await p.textContent('[data-tour="portal-request"]'))
  ok(!/원\b|결제|구매|장바구니/.test(head), '첫 화면에 가격·결제·구매 같은 말이 없음', head.slice(0, 70))

  await ctx.close()
}

// ── 6. 두 번째 버튼이 실제로 물품 화면으로 간다 ─────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
  wire(ctx)
  const p = await open(ctx, '/portal')
  await p.waitForSelector('[data-portal-cta="supplies"]', { timeout: 20000 })
  await p.locator('[data-portal-cta="supplies"]').dispatchEvent('click')
  await p.waitForTimeout(1500)
  ok(new URL(p.url()).pathname === '/portal/supplies', '누르면 물품 화면으로 감', p.url())
  await ctx.close()
}

// ── 7. 요청 창의 종류 이름 ──────────────────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
  wire(ctx)
  const p = await open(ctx, '/portal')
  await p.waitForSelector('[data-portal-cta="collect"]', { timeout: 20000 })
  await p.locator('[data-portal-cta="collect"]').dispatchEvent('click')
  await p.waitForTimeout(900)

  const kinds = await p.locator('label:has-text("무엇이 필요하신가요?") ~ div button').allTextContents()
  const names = kinds.map(flat)
  ok(names.includes('자재·용기'), '요청 종류에 「자재·용기」가 있음', names.join(','))
  ok(!names.includes('소모품'), '「소모품」이라는 종류가 병원 화면에 없음', names.join(','))

  await p.getByRole('button', { name: '자재·용기', exact: true }).click()
  await p.waitForTimeout(400)
  const title = flat(await p.textContent('[role="dialog"] h2, [role="dialog"] h3').catch(() => ''))
  ok(/자재·용기 요청/.test(title) || title === '', '창 제목도 같은 이름', title)
  await ctx.close()
}

// ── 8. 글자만 바꿨고 **저장값은 그대로** ───────────────────────────────────
//   여기가 이번 변경의 핵심입니다. `소모품` 은 DB CHECK 값이라 화면 글자를
//   바꾸면서 같이 바꾸면 서버가 전부 거절합니다.
{
  const posted = []
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
  wire(ctx, { posted })
  const p = await open(ctx, '/portal')
  await p.waitForSelector('[data-portal-cta="collect"]', { timeout: 20000 })
  await p.locator('[data-portal-cta="collect"]').dispatchEvent('click')
  await p.waitForTimeout(900)
  await p.getByRole('button', { name: '자재·용기', exact: true }).click()
  await p.fill('#req-content', '20L 합성수지 용기 10개 부탁드립니다')
  await p.getByRole('button', { name: '요청 보내기' }).click()
  await p.waitForTimeout(1600)

  ok(posted.length === 1, '요청이 한 번 갔음', `${posted.length}건`)
  ok(posted[0]?.kind === '소모품', '**서버로 가는 값은 그대로 `소모품`** (DB CHECK 값)', String(posted[0]?.kind))
  ok(posted[0]?.content === '20L 합성수지 용기 10개 부탁드립니다', '적은 내용이 그대로 감')
  await ctx.close()
}

// ── 9. 이미 들어온 요청도 같은 이름으로 읽힌다 ─────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 900, height: 1400 } })
  wire(ctx)
  const p = await open(ctx, '/portal')
  await p.waitForSelector('[data-portal-cta="collect"]', { timeout: 20000 })
  const body = flat(await p.textContent('body'))
  ok(/자재·용기/.test(body), '저장값이 `소모품` 인 지난 요청도 「자재·용기」로 보임')
  ok(!/>소모품</.test(await p.content()), '「소모품」이라는 알약이 남아 있지 않음')
  await ctx.close()
}

// ── 나가기 단추에 **하는 일**이 적혀 있는가 (0073) ─────────────────────────
//
//   ⚠ 여기에 병원 담당자의 **본인 이름**이 적혀 있었습니다. 이름은 「내 정보」
//     처럼 보이는 자리인데 누르면 그대로 **로그아웃**됐습니다. 다시 들어오려면
//     비밀번호를 쳐야 하는데 병원 담당자는 그걸 모르는 경우가 많습니다.
//   ⚠ 「눌러서 도는 전수 점검」이 병원 계정으로 돌다가 자기 이름을 누르고
//     로그인 화면으로 튕겨 나가면서 드러났습니다.
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
  wire(ctx)
  const p = await open(ctx, '/portal')
  await p.waitForTimeout(1200)
  const out = await p.evaluate(() => {
    const el = [...document.querySelectorAll('button')]
      .find((e) => (e.getAttribute('aria-label') ?? '') === '로그아웃')
    if (!el) return null
    return { text: (el.innerText ?? '').replace(/\s+/g, ' ').trim() }
  })
  ok(out !== null, '나가기 단추가 있음')
  ok(/로그아웃/.test(out?.text ?? ''), '**나가기 단추에 「로그아웃」이라고 적혀 있음**', out?.text ?? '')
  const who = await p.evaluate(() => {
    const el = document.querySelector('[data-portal-who]')
    if (!el) return null
    const btn = el.closest('button')
    return { text: (el.textContent ?? '').trim(), inButton: !!btn }
  })
  ok(who !== null, '이름은 따로 보임')
  ok(who?.inButton === false, '**이름은 단추 안이 아님** (눌러도 나가지지 않음)', JSON.stringify(who))
  await ctx.close()
}

await b.close()
