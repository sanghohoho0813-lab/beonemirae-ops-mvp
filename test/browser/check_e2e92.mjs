import { chromium, EXEC } from './_pw.mjs'
import * as W from './walk_lib.mjs'
import * as F from './perf_fixtures.mjs'

//  0092 — 병원이 보낸 것이 **대표·이사님 계정에 실제로 닿는가**
//
//   대표님: 「지금 하실 수 있는 일 여덟 가지에서 요청 보내면 실제로 그 요청이
//   관리자랑 대표·이사님 계정으로 잘 알림이 들어오는지 체크해 주고, 기록이
//   되는지 체크해 줘」
//
//   ⚠ 「서버로 나갔다」로 끝내지 않습니다. **기억하는 서버**를 두고,
//     admin · office 계정으로 다시 들어가 **첫 화면에 뜨는지**까지 봅니다.
//     요청함 화면을 직접 열어야만 보이는 것은 알림이 아닙니다.
//
//   여덟 칸 중 **보내는 것은 넷**입니다 —
//     수거 요청 · 긴급 수거 · 용기·봉투 주문 · 상담·문의
//   나머지 넷(이력·리포트·정산·증빙)은 읽기만 하므로 기록될 것이 없습니다.

const ok = (c, m, d = '') => { console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`); if (!c) process.exitCode = 1 }
const flat = (t) => (t ?? '').replace(/\s+/g, ' ').trim()
const b = await chromium.launch({ executablePath: EXEC })

const HOSP = F.clients[2]

//  ── 기억하는 서버 흉내 ────────────────────────────────────────────────────
const store = { requests: [], inquiries: [], reqs: 0, writes: [] }

function wire(ctx, profile) {
  ctx.route('**/auth/v1/**', (r) => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: F.UID, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }),
  }))
  ctx.route('**/rest/v1/**', (r) => {
    const req = r.request()
    const url = req.url()
    const method = req.method()
    const q = new URL(url).searchParams
    const single = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const lim = Number(q.get('limit') ?? 0)
    const off = Number(q.get('offset') ?? 0)
    store.reqs += 1
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    const page = (rows) => json(lim > 0 ? rows.slice(off, off + lim) : rows)

    if (url.includes('/rpc/app_schema_version')) return json(87)
    if (url.includes('/rpc/')) return json(null)

    if (method !== 'GET') {
      const body = req.postData() ?? ''
      store.writes.push({ url: url.split('/rest/v1/')[1]?.slice(0, 40), method, body })
      if (url.includes('client_requests') && method === 'POST') {
        const row = JSON.parse(body)
        const saved = {
          id: `req-${store.requests.length + 1}`, status: '접수', reply: '',
          handled_by: null, handled_at: null, created_at: new Date().toISOString(),
          demo_session_id: null, ...row,
        }
        store.requests.push(saved)
        return json(single ? saved : [saved])
      }
      if (url.includes('client_inquiries') && method === 'POST') {
        const row = JSON.parse(body)
        const saved = {
          id: `inq-${store.inquiries.length + 1}`, status: '접수', reply: '',
          handled_by: null, handled_at: null, created_at: new Date().toISOString(),
          demo_session_id: null, ...row,
        }
        store.inquiries.push(saved)
        return json(single ? saved : [saved])
      }
      return json(single ? {} : [])
    }

    const named = (rows) =>
      rows.map((x) => ({ ...x, clients: { name: F.clients.find((c) => c.id === x.client_id)?.name ?? '' } }))

    if (url.includes('/profiles')) return json(single ? profile : [profile])
    if (url.includes('/client_requests')) {
      //  ⚠ 서버 RLS 흉내 — 병원 계정에는 자기 것만.
      const mine = profile.client_id
        ? store.requests.filter((x) => x.client_id === profile.client_id)
        : store.requests
      return page(named(mine))
    }
    if (url.includes('/client_inquiries')) {
      const mine = profile.client_id
        ? store.inquiries.filter((x) => x.client_id === profile.client_id)
        : store.inquiries
      return page(named(mine))
    }
    if (url.includes('/site_notes')) return page(F.notes)
    if (url.includes('/schedules')) return page(F.schedules)
    if (url.includes('/materials')) return page(F.materials)
    if (url.includes('/payment_receipts')) return page(F.receipts)
    if (url.includes('/payments')) return page(F.payments)
    if (url.includes('/client_prices')) return page(F.prices)
    if (url.includes('/operating_costs')) return page(F.costs)
    if (url.includes('/vehicles')) return page(F.vehicles)
    //  ⚠ 파는 상품은 **비어 있습니다.** 실제 운영이 그렇습니다 —
    //    그래도 용기 주문이 되어야 한다는 것이 이번 작업입니다.
    if (url.includes('/product_orders')) return json([])
    if (url.includes('/products')) return json([])
    if (url.includes('/clients')) {
      const rows = profile.client_id ? F.clients.filter((c) => c.id === profile.client_id) : F.clients
      return single ? json(rows[0] ?? null) : page(rows)
    }
    if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
    return json([])
  })
}

async function openAs(role, path, clientId = null, w = 1440) {
  const profile = { ...W.profileFor(role), font_scale: 'normal', client_id: clientId }
  const ctx = await b.newContext({ viewport: { width: w, height: w < 700 ? 844 : 950 }, isMobile: w < 700, hasTouch: w < 700 })
  wire(ctx, profile)
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: F.UID, aud: 'authenticated', email: 'x@b.c', app_metadata: {}, user_metadata: {} }])
  await p.goto(`${W.BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await W.settle(p, store); await p.waitForTimeout(900)
  return { ctx, p }
}

// ── ① 용기·봉투 — **고를 것이 실제로 나오는가** ───────────────────────────
//    ⚠ 대표님: 「용기 봉투 주문 눌렀을 때 모두 등록이 안 돼 있거든」.
//      파는 상품 표가 비어 있어도, 저희가 매주 갖다 드리는 13 규격은
//      나와야 합니다.
{
  const { ctx, p } = await openAs('client', '/portal?do=supply', HOSP.id)
  const items = await p.locator('[data-spec-item]').count()
  ok(items >= 10, `**용기 규격이 나온다** (${items}개)`, '파는 상품 표가 비어 있어도')

  const labels = await p.locator('[data-spec-item]').evaluateAll((els) =>
    els.map((e) => e.getAttribute('data-spec-item')))
  //  ⚠ 기사님이 자재 공급을 입력할 때 쓰는 **같은 규격 이름**이어야 합니다.
  //    이름이 갈라지면 요청과 공급을 이어 붙일 수 없습니다.
  for (const key of ['box63', 'plastic20', 'pouch12']) {
    ok(labels.includes(key), `내부와 같은 규격 이름을 쓴다 (${key})`, labels.slice(0, 5).join(','))
  }

  //  ⚠ **단가를 지어내 붙이지 않았는지.** 거래처별 단가는 계약 자료입니다.
  const sheet = flat(await p.locator('[data-portal-sheet="supply"]').innerText())
  ok(!/\d[\d,]*원/.test(sheet), '**용기에 금액을 붙이지 않았다**', (sheet.match(/\d[\d,]*원/g) ?? []).join(','))
  ok(/정산 반영/.test(sheet), '정산에 반영되는 품목은 그렇다고 알려 준다')
  await ctx.close()
}

// ── ② 병원이 용기를 주문한다 → **서버에 남는다** ──────────────────────────
{
  const { ctx, p } = await openAs('client', '/portal?do=supply', HOSP.id)
  await p.locator('[data-spec-quick="box63:10"]').click(); await p.waitForTimeout(200)
  await p.locator('[data-spec-plus="plastic20"]').click(); await p.waitForTimeout(150)
  await p.locator('[data-spec-plus="plastic20"]').click(); await p.waitForTimeout(150)
  await p.locator('[data-supply-send]').click(); await p.waitForTimeout(1600)

  ok(store.requests.length === 1, '**용기 요청이 서버에 남았다**', `${store.requests.length}건`)
  const r = store.requests[0]
  ok(r.client_id === HOSP.id, `그 병원 것으로 저장됐다 (${HOSP.name})`, r.client_id)
  //  ⚠ DB CHECK 값이라 바꾸면 서버가 거절합니다.
  ok(r.kind === '소모품', '서버가 받는 값으로 나갔다', r.kind)
  ok(/63L 박스 10개/.test(r.content), '**고른 규격과 수량이 그대로 적혔다**', r.content)
  ok(/20L 합성수지 2개/.test(r.content), '두 번째 규격도 그대로')
  ok((await p.locator('[data-toast]').count()) === 1, '접수되었다고 알려 준다')
  await ctx.close()
}

// ── ③ 수거 요청 · 긴급 · 문의도 남는다 ────────────────────────────────────
{
  const { ctx, p } = await openAs('client', '/portal?do=urgent', HOSP.id)
  await p.locator('[data-choice="reason"] [data-choice-item]').first().click(); await p.waitForTimeout(200)
  await p.locator('[data-req-send]').click(); await p.waitForTimeout(1500)
  ok(store.requests.length === 2, '긴급 수거 요청이 남았다', `${store.requests.length}건`)
  ok(store.requests[1].kind === '긴급수거' && store.requests[1].urgent === true,
    '**긴급으로 표시되어 저장됐다**', `${store.requests[1].kind} · urgent=${store.requests[1].urgent}`)
  await ctx.close()
}
{
  const { ctx, p } = await openAs('client', '/portal?do=ask', HOSP.id)
  await p.locator('[data-choice="topic"] [data-choice-item="정산"]').click(); await p.waitForTimeout(400)
  await p.locator('[data-choice="quick"] [data-choice-item]').first().click(); await p.waitForTimeout(300)
  await p.locator('[data-ask-send]').click(); await p.waitForTimeout(1500)
  ok(store.inquiries.length === 1, '문의가 남았다', `${store.inquiries.length}건`)
  ok(store.inquiries[0].client_id === HOSP.id, '그 병원 문의로 저장됐다')
  await ctx.close()
}

// ── ④ **대표·이사님 첫 화면에 뜨는가** (제일 중요) ────────────────────────
//    ⚠ 요청함 화면을 직접 열어야만 보이는 것은 알림이 아닙니다.
for (const role of ['admin', 'office']) {
  const { ctx, p } = await openAs(role, '/')
  const body = flat(await p.locator('main').innerText())

  ok(/긴급 요청/.test(body), `${role} 첫 화면에 「긴급 요청」이 뜬다`)
  ok(/처리 대기 요청/.test(body), `${role} 첫 화면에 「처리 대기 요청」이 뜬다`)
  //  ⚠ 0092 에서 새로 넣었습니다 — 문의는 어디에도 안 떴습니다.
  ok(/답변 대기 문의/.test(body), `${role} 첫 화면에 **「답변 대기 문의」가 뜬다**`)
  await ctx.close()
}

// ── ⑤ 요청함에 **내용까지** 뜨는가 ────────────────────────────────────────
{
  const { ctx, p } = await openAs('admin', '/requests')
  const body = flat(await p.locator('main').innerText())
  ok(body.includes(HOSP.name), `어느 병원인지 적혀 있다 (${HOSP.name})`)
  ok(/63L 박스 10개/.test(body), '**용기 요청 내용이 그대로 보인다**')
  //  ⚠ 저장값(`소모품`)이 아니라 사람이 읽는 이름으로.
  ok(/자재·용기/.test(body), '「자재·용기」로 읽힌다')
  ok(!/>소모품</.test(await p.content()), '「소모품」이라는 알약이 남아 있지 않다')
  ok(/이번 달 청구금액/.test(body), '**문의도 같은 화면에 보인다**')
  await ctx.close()
}

// ── ⑥ 월간 리포트 — **양쪽이 같은 것을 본다** ─────────────────────────────
//    대표님: 「월간 배출 리포트도 요청한 거랑 이런 것 다 볼 수 있게,
//    비원미래랑 해당 병원 양쪽이 다 볼 수 있게」
{
  const { ctx, p } = await openAs('client', '/portal?do=report', HOSP.id)
  const t = flat(await p.locator('[data-portal-sheet="report"]').innerText())
  ok(/이 달에 올리신 요청/.test(t), '**병원 리포트에 요청 내역이 있다**')
  ok(/63L 박스 10개/.test(t), '요청 내용이 리포트에 그대로 보인다')
  ok(/문의/.test(t), '문의도 함께 보인다')
  await ctx.close()
}
{
  //  ⚠ 내부 리포트 화면에서 **그 병원을 골라야** 같은 칸이 나옵니다.
  //    아무 병원이나 보고 「있다/없다」를 말하면 검사가 아무것도 안 합니다.
  const { ctx, p } = await openAs('admin', '/reports')
  const pick = p.locator(`text=${HOSP.name}`).first()
  if ((await pick.count()) > 0) {
    await pick.click()
    await p.waitForTimeout(1200)
  }
  const box = p.locator('[data-report-requests]')
  ok((await box.count()) === 1, '**내부 리포트에도 같은 「요청 · 문의」 칸이 있다**')
  const t = flat(await box.innerText())
  ok(/63L 박스 10개/.test(t), '**내부에서도 같은 요청 내용이 보인다**', t.slice(0, 80))
  ok(/이번 달 청구금액/.test(t), '내부에서도 같은 문의가 보인다')
  await ctx.close()
}

// ── ⑦ 병원 화면에 **내부 자료가 새지 않는가** ─────────────────────────────
//    대표님: 「병원에서 보면 안 될 비원미래 내부 자료가 드러나지 않도록
//    주의해 줘」
{
  //  ⚠ 원가·매입·마진·영업이익·처리비는 **병원이 보면 안 되는 말**입니다.
  //    다른 거래처 이름도 마찬가지입니다.
  const BAD = ['원가', '매입', '마진', '영업이익', '손익', '처리비', '소각비', '수익률', '매출총이익']
  const others = F.clients.filter((c) => c.id !== HOSP.id).map((c) => c.name)

  for (const sheet of ['', 'billing', 'report', 'history', 'docs', 'supply', 'ask']) {
    const { ctx, p } = await openAs('client', sheet ? `/portal?do=${sheet}` : '/portal', HOSP.id)
    await p.waitForTimeout(400)
    const t = flat(await p.locator('body').innerText())
    const hit = BAD.filter((w) => t.includes(w))
    ok(hit.length === 0, `${sheet || '홈'} — 내부 용어가 안 보인다`, hit.join(','))
    const leak = others.filter((n) => t.includes(n))
    ok(leak.length === 0, `${sheet || '홈'} — **다른 병원 이름이 안 보인다**`, leak.slice(0, 3).join(','))
    await ctx.close()
  }
}

// ── ⑧ 정산은 **청구가 있어야** 나온다 ─────────────────────────────────────
//    대표님: 「정산 현황은 정산이 한 번이라도 끝나면 그 정보가 나오는 거겠지?」
{
  const { ctx, p } = await openAs('client', '/portal?do=billing', HOSP.id)
  const t = flat(await p.locator('[data-portal-sheet="billing"]').innerText())
  const hasRows = (await p.locator('[data-billing-row]').count()) > 0
  if (hasRows) {
    ok(/청구|입금/.test(t), '청구가 있으면 월별 내역이 나온다')
    //  ⚠ 결제 단추를 만들지 않았습니다 — 결제 연동이 없습니다.
    ok(/결제하실 수 없습니다/.test(t), '지금은 결제할 수 없다고 적어 둔다')
  } else {
    //  ⚠ 청구가 아직 없으면 **왜 없는지** 적어야 합니다.
    ok(/아직 청구 내역이 없습니다/.test(t), '청구가 없으면 왜 없는지 적는다', t.slice(0, 60))
  }
  await ctx.close()
}

await b.close()
