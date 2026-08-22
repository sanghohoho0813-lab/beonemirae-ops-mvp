import { chromium, EXEC } from './_pw.mjs'
import * as W from './walk_lib.mjs'
import * as F from './perf_fixtures.mjs'

//  0077 — 신호가 끊긴 곳에서 저장을 눌렀을 때 (지하 보관실)
//
//   의료폐기물 보관실은 지하가 많습니다. 기사님이 거기서 저장을 누르면
//   무슨 일이 일어나는지 아무도 확인한 적이 없었습니다.
//
//   두 갈래를 나눠서 봅니다 — 폰에서 실제로 갈리는 두 가지입니다:
//     ① 아예 안 나감          요청이 서버에 닿지 못함
//     ② 나갔는데 답이 안 옴   **서버에는 저장됐는데** 폰은 실패로 봄
//                            (지하에서 누르고 엘리베이터를 타면 이렇게 됩니다)
//
//   ②가 위험한 이유: 다시 누르면 서버는 「이미 완료 처리된 일정입니다」로
//   막습니다(자료는 안전합니다). 그런데 그 말이 **빨간 실패**로 뜨면
//   기사님은 저장이 안 된 줄 알고 또 누르고, 결국 사무실에 전화합니다.

const ok = (c, m, d = '') => { console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`); if (!c) process.exitCode = 1 }
const T = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
const C1 = F.clients[0].id
const b = await chromium.launch({ executablePath: EXEC })

async function run(mode) {
  const reached = []   // 서버에 닿은 요청
  const stored = []    // **실제로 저장된** 것
  let net = 'on'
  const sched = { id: 't1', date: T, client_id: C1, waste_type: '의료폐기물', vehicle_id: null,
    scheduled_time: '09:00', status: '예정', expected_amount: 120, actual_amount: null, completed_at: null,
    memo: '', origin: 'system', canceled_at: null, is_additional: false,
    created_at: `${T}T00:00:00Z`, updated_at: `${T}T00:00:00Z` }
  const state = { reqs: 0, writes: [], profile: W.profileFor('field'), schedules: [sched] }
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  W.wire(ctx, state)
  //  ⚠ 끊김 흉내는 **나중에** 답니다 — 나중에 등록한 라우트가 이깁니다.
  //  ⚠ 서버 규칙을 그대로 지킵니다: 이미 완료면 거절 (0007 · 0063).
  //    무조건 성공을 돌려주면 「중복 저장이 난다」는 거짓 결론이 나옵니다.
  await ctx.route('**/rpc/complete_collection*', async (r) => {
    if (net === 'off') return r.abort('internetdisconnected')
    const body = JSON.parse(r.request().postData() ?? '{}')
    reached.push(body)
    if (sched.status === '완료') {
      if (net === 'lost-reply') return r.abort('timedout')
      return r.fulfill({ status: 400, contentType: 'application/json',
        body: JSON.stringify({ code: 'P0001', message: '이미 완료 처리된 일정입니다. (중복 완료 방지)' }) })
    }
    sched.status = '완료'
    sched.actual_amount = Number(body?.p?.actualAmount ?? 0)
    sched.completed_at = `${T}T06:00:00Z`
    stored.push(body)
    if (net === 'lost-reply') return r.abort('timedout')
    return r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, scheduleId: 't1', warnings: [] }) })
  })
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: F.UID, aud: 'authenticated', email: state.profile.email, app_metadata: {}, user_metadata: {} }])
  await p.goto(`${W.BASE}/`, { waitUntil: 'domcontentloaded' })
  await W.settle(p, state, 800, 30000)
  await p.evaluate(() => {
    const v = (e) => e.getBoundingClientRect().height > 2
    const a = [...document.querySelectorAll('[data-guide="guide-today-list"]')].filter(v).find((e) => e.tagName === 'BUTTON')
    a?.click()
  })
  await p.waitForTimeout(3200)
  await p.fill('#collection-amount', '147')
  await p.waitForTimeout(700)

  net = mode
  await p.locator('[data-collect-save]').dispatchEvent('click')
  await p.waitForTimeout(3500)

  //  끊긴 직후 — 적은 값이 살아 있어야 하고, 무슨 일인지 말해 줘야 합니다
  const mid = await p.evaluate(() => {
    const body = (document.body.innerText ?? '').replace(/\s+/g, ' ')
    return {
      amount: document.querySelector('#collection-amount')?.value ?? '',
      말해줌: /네트워크|통신|연결할 수 없/.test(body),
      다시단추: [...document.querySelectorAll('button')].some((e) => e.getBoundingClientRect().height > 2 && /다시/.test(e.innerText || '')),
      거짓완료: /반영되었습니다/.test(body),
    }
  })
  const label = mode === 'off' ? '아예 안 나감' : '나갔는데 답이 안 옴'
  ok(mid.amount === '147', `${label} — **적은 무게가 안 지워짐**`, `"${mid.amount}"`)
  ok(mid.말해줌, `${label} — 무슨 일인지 말해 줌`)
  ok(mid.다시단추, `${label} — 다시 할 수 있음`)
  ok(!mid.거짓완료, `${label} — **저장 안 됐는데 완료라고 하지 않음**`)

  //  신호가 돌아온 뒤 다시 시도
  net = 'on'
  await p.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((e) => e.getBoundingClientRect().height > 2 && /다시/.test(e.innerText || ''))
    btn?.click()
  })
  await p.waitForTimeout(3800)

  const fin = await p.evaluate(() => {
    const body = (document.body.innerText ?? '').replace(/\s+/g, ' ')
    return {
      완료: /반영되었습니다/.test(body),
      안심: /이미 저장돼 있습니다/.test(body),
      빨간띠: !!document.querySelector('[data-sync-error]'),
      실패글: /연결할 수 없|저장하지 못/.test(body),
    }
  })
  //  어느 갈래든 **자료는 한 건만** 저장돼야 합니다
  ok(stored.length === 1, `${label} — **실제로 저장된 것은 한 건뿐**`, `닿은 요청 ${reached.length}건 · 저장 ${stored.length}건`)
  ok(!fin.빨간띠, `${label} — 다시 시도 뒤 **빨간 띠가 안 남음**`)
  ok(!fin.실패글, `${label} — 실패 글이 안 남음`)
  ok(fin.완료 || fin.안심,
    `${label} — **끝났다는 것을 알려 줌**`, fin.완료 ? '수거 완료 화면' : '이미 저장돼 있음 안내')
  //  한 화면이 서로 반대되는 말을 하면 안 됩니다
  ok(!(fin.안심 && fin.실패글), `${label} — 한 화면에서 말이 엇갈리지 않음`)
  await ctx.close()
}

for (const m of ['off', 'lost-reply']) await run(m)

// ── 일정 추가도 같은 갈래를 겪습니다 ───────────────────────────────────────
//
//   「이 날로 잡기」를 지하에서 누르고 엘리베이터를 타면, 요청은 닿았는데
//   답만 못 받습니다. 다시 누르면 서버가 「이미 잡혀 있습니다」로 막는데,
//   그건 **그 날 방문이 잡혀 있다는 뜻**입니다. 빨간 실패로 뜨면 안 됩니다.
const day = (n) => { const d = new Date(`${T}T00:00:00`); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE') }
async function runBook(mode) {
  const reached = []; const stored = []
  let net = 'on'
  const target = day(4)
  const state = { reqs: 0, writes: [], profile: W.profileFor('field'),
    schedules: [{ id: 't1', date: T, client_id: C1, waste_type: '의료폐기물', vehicle_id: null,
      scheduled_time: '09:00', status: '예정', expected_amount: 120, actual_amount: null, completed_at: null,
      memo: '', origin: 'system', canceled_at: null, is_additional: false,
      created_at: `${T}T00:00:00Z`, updated_at: `${T}T00:00:00Z` }] }
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  W.wire(ctx, state)
  await ctx.route('**/rpc/book_visit*', async (r) => {
    if (net === 'off') return r.abort('internetdisconnected')
    const q = JSON.parse(r.request().postData() ?? '{}')
    reached.push(q)
    //  서버 규칙 그대로 — 같은 날 같은 구분이 이미 있으면 거절 (0058)
    const dup = state.schedules.some((s) => s.date === q.p_date && s.client_id === q.p_client_id
      && s.waste_type === q.p_waste_type && !s.canceled_at)
    if (dup) {
      if (net === 'lost-reply') return r.abort('timedout')
      return r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'P0001',
        message: `${F.clients[0].name}의 ${q.p_date} 의료폐기물 방문은 이미 잡혀 있습니다. 같은 날 한 번 더 가야 하면, 그날 수거 입력에서 「추가 수거」로 기록해 주세요.` }) })
    }
    state.schedules = [...state.schedules, { id: 'bk1', date: q.p_date, client_id: q.p_client_id,
      waste_type: q.p_waste_type, vehicle_id: null, scheduled_time: q.p_time, status: '예정',
      expected_amount: 0, actual_amount: null, completed_at: null, memo: '', origin: 'field',
      canceled_at: null, is_additional: false, created_at: `${q.p_date}T00:00:00Z`, updated_at: `${q.p_date}T00:00:00Z` }]
    stored.push(q)
    if (net === 'lost-reply') return r.abort('timedout')
    return r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: 'bk1', date: q.p_date, clientName: F.clients[0].name, requestUpdated: false }) })
  })
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: F.UID, aud: 'authenticated', email: state.profile.email, app_metadata: {}, user_metadata: {} }])
  await p.goto(`${W.BASE}/`, { waitUntil: 'domcontentloaded' })
  await W.settle(p, state, 800, 30000)
  await p.locator(`[data-day="${target}"]`).dispatchEvent('click')
  await p.waitForTimeout(900)
  const sel = (await p.locator('[data-empty-add]').count()) ? '[data-empty-add]' : '[data-add-fab]'
  await p.locator(sel).dispatchEvent('click')
  await p.waitForTimeout(800)
  await p.selectOption('[data-add-visit-client]', C1)

  net = mode
  await p.locator('[data-add-visit-save]').dispatchEvent('click')
  await p.waitForTimeout(3500)
  const label = `일정 추가 · ${mode === 'off' ? '아예 안 나감' : '나갔는데 답이 안 옴'}`
  const mid = await p.evaluate(() => ({
    sheet: !!document.querySelector('[data-add-visit]'),
    done: !!document.querySelector('[data-add-visit-done]'),
    said: /네트워크|통신|연결할 수 없|잡지 못/.test(document.body.innerText ?? ''),
  }))
  ok(mid.sheet, `${label} — 시트가 안 닫힘 (고른 것이 안 날아감)`)
  ok(!mid.done, `${label} — **안 잡혔는데 잡혔다고 하지 않음**`)
  ok(mid.said, `${label} — 무슨 일인지 말해 줌`)

  net = 'on'
  await p.locator('[data-add-visit-save]').dispatchEvent('click').catch(() => {})
  await p.waitForTimeout(3500)
  const fin = await p.evaluate(() => ({
    done: !!document.querySelector('[data-add-visit-done]'),
    bar: !!document.querySelector('[data-sync-error]'),
    err: (document.querySelector('[data-add-visit-error]')?.textContent ?? '').trim(),
    line: (document.querySelector('[data-add-visit-done-line]')?.textContent ?? '').trim(),
  }))
  ok(stored.length === 1, `${label} — **실제로 잡힌 것은 한 건뿐**`, `닿은 요청 ${reached.length}건 · 잡힘 ${stored.length}건`)
  ok(fin.done, `${label} — **잡혔다는 것을 알려 줌**`, fin.line)
  ok(!fin.bar, `${label} — 빨간 띠가 안 남음`)
  ok(fin.err === '', `${label} — 빨간 오류글이 안 남음`, fin.err.slice(0, 40))
  await ctx.close()
}
for (const m of ['off', 'lost-reply']) await runBook(m)

await b.close()
