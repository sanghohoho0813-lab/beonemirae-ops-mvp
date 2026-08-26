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
  //  ⚠ 0089 — 이름이 「자재·용기 요청」에서 「용기 · 봉투 주문」으로
  //    바뀌었습니다. 지켜야 하는 것은 **이름 자체가 아니라** 두 가지입니다 —
  //      ① 「소모품」이라고 부르지 않을 것 (판매 상품 목록처럼 읽힙니다)
  //      ② 무엇이 부족할 때 누르는지가 적혀 있을 것
  ok(/용기|봉투/.test(t2), '두 번째 칸이 용기·봉투를 가리킴', t2.slice(0, 40))
  ok(!/소모품/.test(t2), '**「소모품」이라고 부르지 않음** — 물건을 사라는 뜻이 아닙니다')
  ok(/용기|봉투|바늘통/.test(t2), '무엇이 부족할 때 누르는지 적혀 있음', t2.slice(0, 70))

  //  손가락으로 누를 수 있는 크기인지 — 병원 담당자는 겸직입니다
  ok(c1.height >= 44 && c2.height >= 44, '두 버튼 다 44px 이상', `${Math.round(c1.height)}px · ${Math.round(c2.height)}px`)

  //  가격표가 첫 화면에 나오면 「지금 파는 중」으로 읽힙니다 (지시 14)
  const head = flat(await p.textContent('[data-tour="portal-request"]'))
  ok(!/원\b|결제|구매|장바구니/.test(head), '첫 화면에 가격·결제·구매 같은 말이 없음', head.slice(0, 70))

  await ctx.close()
}

// ── 6. 두 번째 칸이 실제로 주문할 자리를 연다 ───────────────────────────────
//   ⚠ 0089 — 예전에는 **물품 화면으로 옮겨 갔습니다.** 이제는 있던 자리에
//     그대로 있고 주문 창만 뜹니다. 병원 담당자가 「어디로 가야 하지」를
//     생각하지 않게 하는 것이 이번 변경의 목적입니다.
//   ⚠ 그래도 **주문할 자리가 실제로 열려야** 합니다 — 그게 안 되면
//     이름만 바뀌고 하는 일이 없어진 것입니다.
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
  wire(ctx)
  const p = await open(ctx, '/portal')
  await p.waitForSelector('[data-portal-cta="supplies"]', { timeout: 20000 })
  await p.locator('[data-portal-cta="supplies"]').dispatchEvent('click')
  await p.waitForTimeout(1500)
  ok((await p.locator('[data-portal-sheet="supply"]').count()) === 1, '누르면 주문 창이 열림')
  ok(new URL(p.url()).pathname === '/portal', '**화면을 옮기지 않음**', p.url())
  //  ⚠ 새로고침해도 창이 살아 있도록 주소 뒤에 남깁니다.
  ok(new URL(p.url()).searchParams.get('do') === 'supply', '무슨 창인지 주소에 남음', p.url())
  await ctx.close()
}

// ── 7. 수거 요청 창 — **글자를 안 적고도** 보낼 수 있는가 ──────────────────
//   ⚠ 0089 — 예전에는 요청 창 안에서 「요청 종류」를 고르게 했습니다(자재·용기
//     포함). 이제 자재는 **자기 창**을 가집니다(위 6번). 요청 창은 수거만
//     다루고, 대신 적는 칸을 없앴습니다.
//   ⚠ 지켜야 하는 것 — 병원 담당자가 **자판을 한 번도 안 쓰고** 보낼 수
//     있어야 합니다. 빈 칸 앞에서 무엇을 적을지 몰라 전화하는 것이
//     이 화면을 만든 이유였습니다.
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
  wire(ctx)
  const p = await open(ctx, '/portal')
  await p.waitForSelector('[data-portal-cta="collect"]', { timeout: 20000 })
  await p.locator('[data-portal-cta="collect"]').dispatchEvent('click')
  await p.waitForTimeout(1000)

  ok((await p.locator('[data-portal-sheet="pickup"]').count()) === 1, '수거 요청 창이 열림')
  ok(await p.locator('[data-req-send]').isDisabled(), '아무것도 안 고르면 못 보냄')
  await p.locator('[data-choice="reason"] [data-choice-item]').first().click()
  await p.waitForTimeout(300)
  ok(!(await p.locator('[data-req-send]').isDisabled()), '**하나만 골라도 보낼 수 있음**')

  const sheet = flat(await p.textContent('[data-portal-sheet="pickup"]'))
  ok(!/소모품/.test(sheet), '「소모품」이라는 말이 병원 화면에 없음')
  await ctx.close()
}

// ── 8. 고른 것이 **서버가 받는 값**으로 나가는가 ───────────────────────────
//   ⚠ `kind` 는 DB CHECK 값입니다('긴급수거','추가수거','소모품','교육·자료',
//     '기타'). 화면 글자를 바꾸면서 저장값까지 같이 바꾸면 그날 들어온 요청이
//     전부 서버에서 거절됩니다.
//   ⚠ 0089 — 요청 창은 이제 수거만 다룹니다. 일반은 `추가수거`,
//     긴급 칸은 `긴급수거` 로 나가야 합니다.
{
  const posted = []
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
  wire(ctx, { posted })
  const p = await open(ctx, '/portal')
  await p.waitForSelector('[data-portal-cta="collect"]', { timeout: 20000 })
  await p.locator('[data-portal-cta="collect"]').dispatchEvent('click')
  await p.waitForTimeout(1000)
  await p.locator('[data-choice="reason"] [data-choice-item]').first().click()
  await p.waitForTimeout(300)
  await p.locator('[data-req-send]').click()
  await p.waitForTimeout(1800)

  ok(posted.length === 1, '요청이 한 번 갔음', `${posted.length}건`)
  ok(posted[0]?.kind === '추가수거', '**서버가 받는 값으로 나감** (DB CHECK 값)', String(posted[0]?.kind))
  //  ⚠ 고른 것이 **글로** 들어가야 합니다 — 배차가 읽는 것은 글입니다.
  ok(/정기 일정 외 추가 수거/.test(String(posted[0]?.content)), '고른 것이 요청 글에 그대로 감',
    String(posted[0]?.content).slice(0, 60))
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
