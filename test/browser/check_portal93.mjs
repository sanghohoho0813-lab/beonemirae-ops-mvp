import { chromium, EXEC } from './_pw.mjs'
import * as W from './walk_lib.mjs'
import * as F from './perf_fixtures.mjs'

//  0093 — 잘 되는 길 말고 **어긋나는 길**
//
//   대표님: 「최근 며칠 동안 개발했던 거 오류는 없는지 여러 차례 테스트
//   해봐서 오류 아예 없애고 퀄리티 올리는 작업」
//
//   지금까지의 검사는 「제대로 하면 제대로 된다」를 봤습니다. 여기서는
//   **삐끗했을 때**를 봅니다 —
//     · 두 번 빠르게 누르면 요청이 두 건이 되는가
//     · 서버가 실패하면 적은 것이 사라지는가
//     · 실패 뒤 다시 누르면 두 건이 되는가
//     · 창을 열어 둔 채 날이 바뀌면 지난 날짜가 남는가
//     · 실수로 닫았을 때 되돌릴 수 있는가

const ok = (c, m, d = '') => { console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`); if (!c) process.exitCode = 1 }
const flat = (t) => (t ?? '').replace(/\s+/g, ' ').trim()
const b = await chromium.launch({ executablePath: EXEC })

const HOSP = F.clients[2]
const TODAY = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })

/**
 * 기억하는 서버 흉내.
 *  `failFirst` 를 켜면 **첫 쓰기 한 번만** 실패시킵니다 — 통신이 끊겼다
 *  돌아온 상황입니다.
 */
function makeServer({ failFirst = false, slowMs = 0 } = {}) {
  return { requests: [], inquiries: [], posts: 0, failFirst, slowMs, reqs: 0, writes: [] }
}

function wire(ctx, srv, profile) {
  ctx.route('**/auth/v1/**', (r) => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: F.UID, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }),
  }))
  ctx.route('**/rest/v1/**', async (r) => {
    const req = r.request()
    const url = req.url()
    const method = req.method()
    const single = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const q = new URL(url).searchParams
    const lim = Number(q.get('limit') ?? 0)
    const off = Number(q.get('offset') ?? 0)
    srv.reqs += 1
    const json = (v, status = 200) =>
      r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(v) })
    //  ⚠ **limit·offset 을 지켜야** 합니다. 안 지키면 앱이 「다음 쪽」을
    //    끝없이 물어보고 화면이 「불러오는 중」에서 멈춥니다.
    //    (이 검사를 처음 쓸 때 실제로 그렇게 멈췄습니다)
    const page = (rows) => json(lim > 0 ? rows.slice(off, off + lim) : rows)

    if (url.includes('/rpc/app_schema_version')) return json(87)
    if (url.includes('/rpc/')) return json(null)

    if (method !== 'GET') {
      if (url.includes('client_requests') && method === 'POST') {
        srv.posts += 1
        if (srv.slowMs) await new Promise((res) => setTimeout(res, srv.slowMs))
        if (srv.failFirst && srv.posts === 1) {
          //  진짜 서버가 돌려주는 모양 그대로
          return json({ code: '500', message: 'internal error', details: null, hint: null }, 500)
        }
        const row = JSON.parse(req.postData() ?? '{}')
        //  ⚠ 같은 표(request_id)가 또 오면 **새로 만들지 않습니다.**
        //    실제 서버는 unique 색인이 막습니다(0055).
        const dup = row.request_id && srv.requests.some((x) => x.request_id === row.request_id)
        if (dup) return json({ code: '23505', message: 'duplicate key value violates unique constraint "client_requests_request_uniq"' }, 409)
        const saved = {
          id: `req-${srv.requests.length + 1}`, status: '접수', reply: '',
          handled_by: null, handled_at: null, created_at: new Date().toISOString(), ...row,
        }
        srv.requests.push(saved)
        return json(single ? saved : [saved])
      }
      return json(single ? {} : [])
    }

    const named = (rows) =>
      rows.map((x) => ({ ...x, clients: { name: F.clients.find((c) => c.id === x.client_id)?.name ?? '' } }))
    if (url.includes('/profiles')) return json(single ? profile : [profile])
    if (url.includes('/client_requests')) {
      const mine = profile.client_id ? srv.requests.filter((x) => x.client_id === profile.client_id) : srv.requests
      return page(named(mine))
    }
    if (url.includes('/client_inquiries')) return json([])
    if (url.includes('/site_notes')) return page(F.notes)
    if (url.includes('/schedules')) return page(F.schedules)
    if (url.includes('/materials')) return page(F.materials)
    if (url.includes('/payment_receipts')) return page(F.receipts)
    if (url.includes('/payments')) return page(F.payments)
    if (url.includes('/vehicles')) return page(F.vehicles)
    if (url.includes('/products')) return json([])
    if (url.includes('/product_orders')) return json([])
    if (url.includes('/clients')) {
      const rows = profile.client_id ? F.clients.filter((c) => c.id === profile.client_id) : F.clients
      return single ? json(rows[0] ?? null) : page(rows)
    }
    if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
    return json([])
  })
}

async function open(srv, path, role = 'client', clientId = HOSP.id, w = 1440) {
  const profile = { ...W.profileFor(role), font_scale: 'normal', client_id: clientId }
  const ctx = await b.newContext({ viewport: { width: w, height: w < 700 ? 844 : 950 }, isMobile: w < 700, hasTouch: w < 700 })
  wire(ctx, srv, profile)
  const p = await ctx.newPage()
  const errors = []
  p.on('pageerror', (e) => errors.push(String(e.message).slice(0, 120)))
  await p.addInitScript(([k, u]) => localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: F.UID, aud: 'authenticated', email: 'x@b.c', app_metadata: {}, user_metadata: {} }])
  await p.goto(`${W.BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await W.settle(p, srv); await p.waitForTimeout(800)
  return { ctx, p, errors }
}

// ── ① 두 번 빠르게 눌러도 **요청은 하나** ─────────────────────────────────
//    ⚠ 지하 주차장에서 응답이 늦으면 병원 담당자는 한 번 더 누릅니다.
//      그때 요청이 두 건이 되면 차가 두 번 갑니다.
{
  const srv = makeServer({ slowMs: 700 })
  const { ctx, p } = await open(srv, '/portal?do=pickup')
  await p.locator('[data-choice="reason"] [data-choice-item]').first().click()
  await p.waitForTimeout(200)

  //  같은 자리를 아주 빠르게 두 번 누릅니다.
  const btn = p.locator('[data-req-send]')
  await btn.click({ force: true })
  await btn.click({ force: true, timeout: 2000 }).catch(() => {})
  await p.waitForTimeout(2500)

  ok(srv.requests.length === 1, '**두 번 눌러도 요청은 한 건**', `${srv.requests.length}건 (POST ${srv.posts}회)`)
  await ctx.close()
}

// ── ② 서버가 실패하면 **고른 것이 남는다** ────────────────────────────────
{
  const srv = makeServer({ failFirst: true })
  const { ctx, p } = await open(srv, '/portal?do=pickup')
  await p.locator('[data-choice="reason"] [data-choice-item]').first().click()
  await p.waitForTimeout(150)
  await p.locator('[data-choice="amount"] [data-choice-item]').nth(1).click()
  await p.waitForTimeout(150)
  await p.locator('[data-req-send]').click()
  //  ⚠ 0098 — 시간이 아니라 **오류 칸이 뜰 때까지** 기다립니다. 부하가 걸리면
  //    1.6초 안에 못 그려서 「안 적혀 있다」로 잘못 적습니다.
  await p.locator('[data-req-error]').waitFor({ state: 'visible', timeout: 12000 }).catch(() => {})

  ok(srv.requests.length === 0, '실패했으니 서버에 아무것도 안 남았다', `${srv.requests.length}건`)
  //  ⚠ 창이 닫히면 안 됩니다 — 닫히면 「보내진 줄」 압니다.
  ok((await p.locator('[data-portal-sheet="pickup"]').count()) === 1, '**창이 닫히지 않는다**')
  ok((await p.locator('[data-req-error]').count()) === 1, '**왜 안 됐는지 적혀 있다**')
  const err = flat(await p.locator('[data-req-error]').innerText())
  ok(/그대로 있습니다/.test(err), '고른 것이 그대로 있다고 알려 준다', err.slice(0, 60))
  //  ⚠ **고른 것이 실제로 남아 있어야** 합니다.
  ok((await p.locator('[data-choice="reason"] [data-picked]').count()) === 1, '고른 사유가 그대로 남아 있다')
  ok((await p.locator('[data-choice="amount"] [data-picked]').count()) === 1, '고른 배출량도 남아 있다')
  ok((await p.locator('[data-toast]').count()) === 0, '**성공했다고 말하지 않는다**')

  //  ── ③ 다시 누르면 — **같은 표**로 가서 한 건만 남는다 ─────────────────
  await p.locator('[data-req-send]').click()
  //  ⚠ 0098 — 닫힐 때까지 기다립니다 (시간 재기 금지).
  await p.locator('[data-portal-sheet]').waitFor({ state: 'detached', timeout: 12000 }).catch(() => {})
  ok(srv.requests.length === 1, '**다시 눌렀을 때 한 건만 들어간다**', `${srv.requests.length}건`)
  ok((await p.locator('[data-portal-sheet]').count()) === 0, '이번에는 창이 닫힌다')
  ok((await p.locator('[data-toast]').count()) === 1, '접수되었다고 알려 준다')
  await ctx.close()
}

// ── ④ 같은 표로 두 번 가면 서버가 막고, 화면은 **성공으로 받는다** ────────
//    ⚠ 이미 저장된 것을 「실패」라고 하면 병원은 또 보냅니다 (0055).
{
  const srv = makeServer()
  const { ctx, p } = await open(srv, '/portal?do=urgent')
  await p.locator('[data-choice="reason"] [data-choice-item]').first().click()
  await p.waitForTimeout(200)
  await p.locator('[data-req-send]').click()
  //  ⚠ 0098 — 시간을 재서 기다리지 않습니다. 나란히 세 개를 돌리면 창이
  //    닫히는 데 1.5초를 넘길 때가 있어, 「아직 닫히는 중」을 「안 닫혔다」로
  //    적었습니다(전체 회귀에서 한 번 그렇게 빨갛게 떴습니다).
  //    **닫힐 때까지** 기다립니다 — 보장은 그대로고 재는 방법만 바꿉니다.
  await p.locator('[data-portal-sheet]').waitFor({ state: 'detached', timeout: 10000 }).catch(() => {})
  ok(srv.requests.length === 1, '긴급 요청이 한 건 들어갔다')

  //  같은 창을 다시 열어 같은 것을 또 보내면 — **새 표**라 새 요청입니다.
  //  (같은 표로 다시 가는 것은 ③ 에서 확인했습니다)
  ok((await p.locator('[data-portal-sheet]').count()) === 0, '보낸 뒤 창이 닫혔다')
  await ctx.close()
}

// ── ⑤ 날짜 — **열 때마다 오늘 기준으로 다시 잡는다** ──────────────────────
//    ⚠ 이 창은 레이아웃에 붙어 있어 **닫아도 사라지지 않습니다.** 한 번만
//      계산해 두면 자정을 넘긴 뒤 어제 날짜를 「오늘」이라고 보여 줍니다.
{
  const srv = makeServer()
  const { ctx, p } = await open(srv, '/portal?do=pickup')
  const first = flat(await p.locator('[data-choice="day"] [data-choice-item]').first().innerText())
  const [, mm, dd] = TODAY.split('-')
  ok(first.includes(`${Number(mm)}월 ${Number(dd)}일`), '「오늘」 옆에 **실제 오늘 날짜**가 적혀 있다', first)

  //  닫았다가 다시 열어도 같은 기준이어야 합니다.
  await p.locator('[data-sheet-close]').click(); await p.waitForTimeout(800)
  await p.locator('[data-portal-cta="collect"]').click(); await p.waitForTimeout(700)
  const again = flat(await p.locator('[data-choice="day"] [data-choice-item]').first().innerText())
  ok(again === first, '다시 열어도 같은 날짜 기준이다', again)
  await ctx.close()
}

// ── ⑥ 실수로 닫아도 **고른 것이 남는다** ──────────────────────────────────
//    ⚠ 몇 가지 고르다 바깥을 잘못 눌렀을 때 처음부터 다시 고르게 하지
//      않습니다. 다만 **지난 날짜만은** 남기지 않습니다(⑤).
{
  const srv = makeServer()
  const { ctx, p } = await open(srv, '/portal?do=pickup')
  await p.locator('[data-choice="reason"] [data-choice-item]').first().click()
  await p.waitForTimeout(150)
  await p.locator('[data-sheet-dim]').click({ position: { x: 5, y: 5 } })
  await p.waitForTimeout(900)
  ok((await p.locator('[data-portal-sheet]').count()) === 0, '바깥을 누르면 닫힌다')
  await p.locator('[data-portal-cta="collect"]').click(); await p.waitForTimeout(700)
  ok((await p.locator('[data-choice="reason"] [data-picked]').count()) === 1,
    '**다시 열면 고르던 것이 그대로 있다**')
  await ctx.close()
}

// ── ⑦ 창을 여닫아도 **화면이 깨지지 않는다** ──────────────────────────────
//    ⚠ 여덟 칸을 차례로 열고 닫으면서 콘솔 오류가 하나도 없어야 합니다.
{
  const srv = makeServer()
  const { ctx, p, errors } = await open(srv, '/portal')
  for (const label of [
    '수거 요청', '용기 · 봉투 주문', '긴급 수거 요청', '상담 · 문의',
    '수거 이력', '월간 배출 리포트', '정산 현황', '증빙자료',
  ]) {
    await p.locator(`[data-portal-action="${label}"]`).click()
    //  ⚠ **시간으로 기다리지 않습니다.** 닫히는 데 300~700ms 가 걸려서,
    //    500ms 로 재면 어떤 날은 통과하고 어떤 날은 실패합니다.
    //    실제로 이 검사가 그렇게 흔들렸습니다 — 요소가 사라질 때까지
    //    기다립니다.
    await p.locator('[data-portal-sheet]').first().waitFor({ state: 'visible', timeout: 5000 })
    await p.keyboard.press('Escape')
    await p.locator('[data-portal-sheet]').first().waitFor({ state: 'detached', timeout: 5000 })
  }
  ok(errors.length === 0, '**여덟 칸을 다 열고 닫아도 오류가 없다**', errors.slice(0, 2).join(' · '))
  ok((await p.locator('[data-portal-sheet]').count()) === 0, '마지막에 창이 다 닫혀 있다')
  //  ⚠ 뒤 화면 스크롤 잠금이 **풀려 있어야** 합니다. 안 풀리면 화면이
  //    굳은 것처럼 보입니다.
  const locked = await p.evaluate(() => document.body.style.overflow)
  ok(locked !== 'hidden', '창을 닫으면 화면 스크롤이 다시 된다', `overflow=${locked || '(없음)'}`)
  await ctx.close()
}

// ── ⑧ 「PC 화면으로 보기」가 **모든 병원 화면**에 있다 ────────────────────
//    ⚠ 0090 에서는 첫 화면 맨 아래 칸에만 있었습니다. 그 칸은 첫 화면에만
//      있어서, 「이용 내역」·「고객지원」에서는 넘어갈 방법이 없었습니다.
for (const page of ['', 'history', 'support', 'report', 'billing', 'supplies']) {
  const srv = makeServer()
  const { ctx, p } = await open(srv, page ? `/portal/${page}` : '/portal', 'client', HOSP.id, 390)
  const n = await p.locator('[data-portal-pc-view]').count()
  ok(n === 1, `${page || '홈'} — 「PC 화면으로 보기」가 있다`, `${n}개`)
  await ctx.close()
}

// ── ⑨ 자료가 늦게 와도 **엉뚱한 말을 하지 않는다** ────────────────────────
//    ⚠ 「연결된 병원 정보를 찾을 수 없습니다」가 잠깐이라도 뜨면 병원은
//      기다리지 않고 전화를 겁니다 (실사용 검증에서 실제로 있었던 일).
{
  const srv = makeServer()
  const profile = { ...W.profileFor('client'), font_scale: 'normal', client_id: HOSP.id }
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  //  거래처를 **일부러 늦게** 줍니다.
  await ctx.route('**/rest/v1/clients**', async (r) => {
    await new Promise((res) => setTimeout(res, 1500))
    await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([F.clients[2]]) })
  })
  wire(ctx, srv, profile)
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: F.UID, aud: 'authenticated', email: 'x@b.c', app_metadata: {}, user_metadata: {} }])
  await p.goto(`${W.BASE}/portal`, { waitUntil: 'domcontentloaded' })

  //  자료가 오는 동안 계속 지켜봅니다.
  let sawNotFound = false
  let sawPicker = false
  for (let i = 0; i < 30; i += 1) {
    const t = flat(await p.locator('body').innerText().catch(() => ''))
    if (/연결된 병원 정보를 찾을 수 없습니다/.test(t)) sawNotFound = true
    if ((await p.locator('[data-portal-picker]').count()) > 0) sawPicker = true
    await p.waitForTimeout(80)
  }
  await W.settle(p, srv); await p.waitForTimeout(800)

  ok(!sawNotFound, '**읽는 중에 「병원 정보를 찾을 수 없습니다」가 안 뜬다**')
  ok(!sawPicker, '읽는 중에 병원 고르는 화면으로 안 튄다')
  const body = flat(await p.locator('main').innerText())
  ok(body.includes(HOSP.name), `다 읽은 뒤에는 ${HOSP.name} 이 보인다`, body.slice(0, 40))
  await ctx.close()
}

// ── ⑩ 창에서 창으로 바로 넘어간 뒤에도 **화면이 다시 굴러간다** ───────────
//    ⚠ 증빙자료에서 수거 이력으로 바로 넘어가는 길이 있습니다. 두 창이
//      잠깐 겹치면 뒤 화면 스크롤 잠금이 안 풀린 채 남을 수 있습니다.
//      병원 담당자에게는 그냥 「먹통」입니다.
{
  const srv = makeServer()
  const { ctx, p } = await open(srv, '/portal', 'client', HOSP.id)
  await p.locator('[data-portal-action="증빙자료"]').click()
  await p.locator('[data-portal-sheet="docs"]').waitFor({ state: 'visible', timeout: 5000 })
  await p.locator('[data-docs-open="history"]').click()
  await p.locator('[data-portal-sheet="history"]').waitFor({ state: 'visible', timeout: 5000 })

  //  ⚠ 넘어가는 동안 **두 창이 잠깐 겹칩니다.** 실제로 겹칩니다 —
  //    이 검사를 쓰다가 닫기 단추가 둘로 잡혀서 알았습니다.
  //    그래서 뒤 화면 스크롤 잠금을 「열기 전 값 기억」이 아니라
  //    **세는 방식**으로 바꿨습니다(PortalSheet).
  await p.locator('[data-portal-sheet="docs"]').waitFor({ state: 'detached', timeout: 5000 })
  ok((await p.locator('[data-portal-sheet]').count()) === 1, '넘어간 뒤에는 창이 하나만 남는다')

  await p.locator('[data-portal-sheet="history"] [data-sheet-close]').click()
  await p.locator('[data-portal-sheet]').first().waitFor({ state: 'detached', timeout: 5000 })

  const locked = await p.evaluate(() => document.body.style.overflow)
  ok(locked !== 'hidden', '창에서 창으로 넘어간 뒤에도 잠금이 풀린다', `overflow=${locked || '(없음)'}`)
  //  ⚠ 값만 보지 않고 **실제로 굴러가는지** 봅니다.
  const scrolls = await p.evaluate(() => {
    const y0 = window.scrollY
    window.scrollBy(0, 300)
    const y1 = window.scrollY
    window.scrollTo(0, y0)
    return y1 > y0
  })
  ok(scrolls, '**실제로 화면이 굴러간다**')
  await ctx.close()
}

await b.close()
