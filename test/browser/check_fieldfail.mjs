import { chromium, EXEC } from './_pw.mjs'

//  **신호가 끊긴 자리에서 저장을 눌렀을 때** — 파일럿에서 실제로 벌어질 일
//
//   의료폐기물 보관실은 지하이거나 건물 뒤쪽입니다. 기사님은 그 자리에서
//   저장을 누릅니다. 그때 통신이 끊기면 다음 세 가지 중 하나가 됩니다.
//
//    ① 적은 것이 화면에서 사라진다  → 기사님은 다시 안 적습니다. 그날 기록이 없어집니다.
//    ② 실패했는데 「저장됐다」고 한다 → 그 수거는 조용히 사라집니다. 월말에 청구가 빕니다.
//    ③ 다시 눌렀더니 두 번 들어간다 → 같은 수거가 두 줄. 청구가 두 배가 됩니다.
//
//   셋 다 「불편」이 아니라 **돈이 틀어지는 일**입니다. 여기서 그 셋을 잽니다.
//
//   ⚠ 이 검사는 실패를 **만들어서** 봅니다. 성공만 재는 검사는 실패했을 때
//     화면이 어떻게 되는지 한 번도 안 본 것과 같습니다.

const BASE = 'http://localhost:4173'
const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  if (!c) process.exitCode = 1
}
const flat = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const TODAY = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })

const FIELD = '00000000-0000-0000-0000-0000000000f1'
const HOSP = '00000000-0000-0000-0000-0000000000h1'
const CA = '00000000-0000-0000-0000-0000000000c1'
const VEH = '00000000-0000-0000-0000-0000000000v1'
const PROD = '00000000-0000-0000-0000-0000000000p1'

//  ⚠ 돈 칸이 **아예 없습니다.** 0063 뒤 현장·병원에게 서버가 주는 모양 그대로.
const CLIENT_SAFE = {
  //  ⚠ **긴 이름**이어야 합니다. 짧은 이름이면 「잘렸는가」 검사가 늘
  //    통과해 버려 아무것도 증명하지 못합니다. 실제로 잘리던 이름입니다.
  id: CA, name: '의료법인 한마음의료재단 한마음요양병원', type: '요양병원',
  address: '경기도 남양주시 오남읍 양지로 47-35', manager: '김주현', phone: '031-111-2222',
  collection_cycle: '주 3회', collects_medical_waste: true, collects_diaper: false,
  storage_size: '보통', note: '지하 주차 후 화물엘리베이터',
  is_demo_generated: false, demo_session_id: null, active: true,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  created_by: null, updated_by: null,
  contract_start: '2025-01-01', contract_end: null,
  collect_time: '', disposal_site: '', diaper_cycle: '',
  name_key: '한마음요양병원', request_id: null, education_at: null,
}

const back = (n) => {
  const d = new Date(`${TODAY}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

//  ⚠ **지난 수거가 있어야** 병원의 「수거 이력」이 빈 화면이 아닙니다.
//    예전에 이걸 빠뜨리고 「카드로 보이는가」를 쟀다가 0장이 나왔습니다 —
//    화면이 잘못된 게 아니라 넣어 준 것이 없었습니다.
//    오늘 일정에는 안 걸리게 **지난 날짜**로만 둡니다.
const PAST = [7, 14, 21].map((n, i) => ({
  id: `p${i}`, date: back(n), client_id: CA, waste_type: '의료폐기물', vehicle_id: VEH,
  scheduled_time: '09:40', status: '완료', expected_amount: 120, actual_amount: 116 + i,
  actual_time: '09:52', completed_at: `${back(n)}T00:52:00Z`,
  //  ⚠ 마지막 한 건은 용기를 **안 적은** 상태입니다 — 「용기 미기재」가
  //    실제로 그려지는지 보려면 그런 줄이 하나는 있어야 합니다.
  containers: i === 2 ? null : { corrugated: 3, plastic: 2, bag: 0, etc: 0 },
  //  ⚠ 인계 상태는 세 가지입니다(수거 완료 · 인계 대기 · 인계 완료).
  //    한 가지만 넣으면 「인계 완료」 갈래를 한 번도 안 지나갑니다.
  driver_name: '김준기', handover_status: i === 0 ? '인계 완료' : '수거 완료',
  handover_at: `${back(n)}T02:00:00Z`,
  memo: '', event_id: null, origin: 'field', is_additional: false, demo_session_id: null,
  plan_batch: null, canceled_at: null,
  created_at: `${back(n)}T00:00:00Z`, updated_at: `${back(n)}T00:00:00Z`,
}))

const SCHEDULES = [...PAST, {
  id: 's1', date: TODAY, client_id: CA, waste_type: '의료폐기물', vehicle_id: VEH,
  scheduled_time: '09:40', status: '예정', expected_amount: 120, actual_amount: null,
  actual_time: null, completed_at: null, containers: null, driver_name: '김준기',
  handover_status: null, handover_at: null, memo: '', event_id: null, origin: 'plan',
  is_additional: false, demo_session_id: null, plan_batch: null, canceled_at: null,
  created_at: `${TODAY}T00:00:00Z`, updated_at: `${TODAY}T00:00:00Z`,
}]

const VEHICLES = [{
  id: VEH, name: '80가 1234 (1t)', waste_type: '의료폐기물', tonnage: 1,
  nominal_capacity: 1000, expected_capacity: 800, driver: '김준기', active: true,
}]

const PRODUCTS = [{
  id: PROD, name: '합성수지 전용용기', spec: '20L', unit: '개', sale_price: 9000,
  cost_price: 5200, stock_key: 'plastic_container', available: true, image_url: '',
  description: '', sort: 0, active: true, category: '의료폐기물 용기',
}]

const b = await chromium.launch({ executablePath: EXEC })

/**
 * 0063 뒤의 서버처럼 구는 가짜 서버.
 *  denied[] 에는 「앱이 물어서는 안 되는 것을 물었다」가 쌓입니다.
 */
function wire(ctx, role, { calls = [], denied = [], fail = { on: true } } = {}) {
  const uid = role === 'client' ? HOSP : FIELD
  const pf = {
    id: uid, email: `${role}@beonemirae.test`,
    name: role === 'client' ? '병원 담당자' : '김준기', role,
    font_scale: 'normal', active: true, approved_at: '2026-01-01T00:00:00Z',
    client_id: role === 'client' ? CA : null, vehicle_id: role === 'field' ? VEH : null,
    created_at: '2026-01-01T00:00:00Z',
  }
  ctx.route('**/auth/v1/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: uid, aud: 'authenticated', email: pf.email, app_metadata: {}, user_metadata: {} }) }))

  ctx.route('**/rest/v1/**', (r) => {
    const url = r.request().url()
    const method = r.request().method()
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const json = (v, status = 200) =>
      r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(v) })
    //  진짜 서버가 돌려주는 모양 그대로 (PostgREST 42501)
    const denyCols = (what) => {
      denied.push(what)
      return json({ code: '42501', message: `permission denied for table clients`, details: null, hint: null }, 403)
    }

    // ── 거래처 — 0063 이 열 단위로 잠근 표 ──────────────────────────────
    if (url.includes('/clients')) {
      const sel = decodeURIComponent((url.match(/[?&]select=([^&]*)/) ?? ['', ''])[1])
      if (sel === '*' || sel === '') return denyCols(`clients select=${sel || '(없음)'}`)
      const bad = ['pricing', 'monthly_flat_fee', 'payment_terms', 'payment_due_day',
                   'biz_no', 'biz_ceo', 'biz_type', 'biz_item', 'tax_email', 'vat_mode',
                   'flat_fee_when_empty', 'flat_fee_policy_at']
        .filter((c) => sel.split(',').map((x) => x.trim()).includes(c))
      if (bad.length) return denyCols(`clients 돈 칸 요청: ${bad.join(',')}`)
      return json(single ? CLIENT_SAFE : [CLIENT_SAFE])
    }

    // ── 현장·병원에게 서버가 아예 안 주는 표 ────────────────────────────
    if (/\/(client_monthly_actuals|client_documents|payments|payment_receipts|sales_leads|operating_costs|revenue_overrides|tax_filings|client_prices)/.test(url)) {
      return json([])
    }
    if (url.includes('/products')) return json(role === 'client' ? PRODUCTS : [])

    // ── RPC ─────────────────────────────────────────────────────────────
    if (url.includes('/rpc/client_billing_terms')) return json([])
    if (url.includes('/rpc/clients_full')) {
      denied.push('clients_full (관리자만)')
      return json({ code: 'P0001', message: '거래처 전체 내려받기는 관리자만 할 수 있습니다.' }, 400)
    }
    if (url.includes('/rpc/app_schema_version')) return json(64)
    if (url.includes('/rpc/app_health_check')) return json({ version: 64, ok: true, missing: [], checkedAt: '' })
    if (url.includes('/rpc/recent_app_errors')) return json({ days: 7, total: 0, groups: [], checkedAt: '' })
    if (url.includes('/rpc/complete_collection')) {
      calls.push({ rpc: 'complete_collection', body: r.request().postDataJSON() })
      //  ⚠ fail.on 이 켜져 있는 동안은 **서버가 끊긴 것처럼** 굽니다.
      //    끄면 그때부터 정상 저장 — 「다시 시도하면 되는가」를 재기 위해서입니다.
      if (fail.on) {
        return r.fulfill({ status: 503, contentType: 'application/json',
          body: JSON.stringify({ message: 'upstream connect error', code: '' }) })
      }
      return json({ eventId: 'e1', scheduleId: 's1', created: false, supplied: 12 })
    }
    if (url.includes('/rpc/request_product_order')) {
      calls.push({ rpc: 'request_product_order', body: r.request().postDataJSON() })
      return json({ id: 'o1', alreadySaved: false, itemCount: 1, total: 90000 })
    }
    if (url.includes('/rpc/')) return json(null)

    // ── 그 밖 ───────────────────────────────────────────────────────────
    if (method === 'POST' && url.includes('/client_requests')) {
      calls.push({ table: 'client_requests', body: r.request().postDataJSON() })
      return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    }
    if (url.includes('/profiles')) return json(single ? pf : [pf])
    if (url.includes('/vehicles')) return json(single ? VEHICLES[0] : VEHICLES)
    if (url.includes('/schedules')) return json(SCHEDULES)
    if (url.includes('/office_stock')) {
      const s = { id: 1, corrugated_box: 500, plastic_container: 500, bag: 500, needle_box: 500,
                  updated_at: `${TODAY}T00:00:00Z`, updated_by: null }
      return json(single ? s : [s])
    }
    return json([])
  })
}

async function open(ctx, path, uid) {
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: uid, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }])
  await p.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(2600)
  return p
}


// ═══ 지하 보관실에서 저장 (390×844) ══════════════════════════════════════════
const calls = []
const denied = []
const fail = { on: true }
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
wire(ctx, 'field', { calls, denied, fail })

const q = await open(ctx, '/collection?schedule=s1', FIELD)
//  평소와 다른 수거량 확인창은 「그대로 저장」으로 넘깁니다 (여기서 재는 것이 아닙니다)
q.on('dialog', (d) => d.accept())

ok((await q.locator('[data-collect-here]').count()) > 0, '준비 — 그 병원으로 수거 입력이 열림')

await q.fill('[data-actual-amount]', '118')
//  ⚠ 0065 부터 폰에서는 「용기」와 「자재」가 접혀 있습니다 (놓고 온 것이 없는
//     날이 대부분이라). 안 펴고 ＋ 를 찾으면 30초 기다리다 스위트가 통째로
//     죽습니다 — 실제로 그렇게 났습니다. 기사님이 하는 그대로 먼저 폅니다.
for (const id of ['containers', 'supply']) {
  const f = q.locator(`[data-fold="${id}"]`)
  if (await f.count()) { await f.dispatchEvent('click'); await q.waitForTimeout(350) }
}
for (const [label, n] of [['골판지 전용박스', 3], ['합성수지 전용용기', 2]]) {
  const plus = q.getByRole('button', { name: `${label} 더하기` })
  for (let i = 0; i < n; i += 1) { await plus.first().click(); await q.waitForTimeout(80) }
}

const save = q.getByRole('button', { name: /수거 완료 저장/ })
await save.first().click()
await q.waitForTimeout(2500)

// ── ② 실패했는데 성공했다고 하지 않는가 ─────────────────────────────────────
const t1 = flat(await q.textContent('body'))
ok(calls.length === 1, '① 저장을 한 번 보냈다', `${calls.length}번`)
ok(!/수거 완료가 반영되었습니다/.test(t1),
   '② **실패했는데 「반영되었습니다」라고 하지 않음**', t1.slice(0, 70))
ok(/저장|못|실패|다시/.test(t1), '③ 안 됐다는 것을 화면이 말해 줌')

// ── ① 적은 것이 화면에 그대로 남아 있는가 ───────────────────────────────────
const kept = await q.evaluate(() => {
  const amt = document.querySelector('[data-actual-amount]')
  return { amount: amt ? amt.value : null }
})
ok(kept.amount === '118', '④ **적은 수거량이 화면에 그대로 있음** (다시 안 적어도 됨)', String(kept.amount))

const cnt = await q.evaluate(() => {
  //  용기 개수는 −／＋ 사이의 숫자 칸입니다. 화면 글자에서 곧바로 읽습니다.
  const t = (document.body.innerText || '').replace(/\s+/g, ' ')
  return t
})
ok(/118/.test(cnt), '⑤ 화면 어디에도 118 이 사라지지 않음')

// ── 저장 버튼이 다시 눌리는가 (잠겨 버리면 그날 기록을 못 넣습니다) ─────────
const stillThere = await q.getByRole('button', { name: /수거 완료 저장/ }).count()
ok(stillThere > 0, '⑥ 저장 버튼이 그대로 있어 다시 누를 수 있음')

// ── ③ 다시 눌렀을 때 — 같은 저장으로 가는가 ─────────────────────────────────
fail.on = false
await q.getByRole('button', { name: /수거 완료 저장/ }).first().click()
await q.waitForTimeout(2500)

ok(calls.length === 2, '⑦ 다시 누르면 다시 보낸다', `${calls.length}번`)
const a = calls[0]?.body?.p ?? {}
const c = calls[1]?.body?.p ?? {}
ok(Number(c.actualAmount) === 118, '⑧ 다시 보낼 때도 수거량 118 그대로', String(c.actualAmount))
ok(c.containers?.corrugated === 3 && c.containers?.plastic === 2,
   '⑨ 용기 3 · 2 도 그대로', JSON.stringify(c.containers ?? {}))
//  ⚠ 두 번 보냈는데 두 줄이 되면 그 달 청구가 두 배가 됩니다.
//
//    처음에 저는 여기서 「같은 requestId 를 보내는가」를 쟀는데, 그건
//    **이 명령이 쓰는 방식이 아니었습니다.** 입금(add_payment_receipt)은
//    requestId 로 묶지만, 수거 완료는 서버가 **자연키로** 막습니다.
//
//      일정을 골랐을 때   이미 완료 처리된 일정입니다. (중복 완료 방지)
//      직접 입력했을 때   그 날·그 병원·그 폐기물 수거가 이미 저장되어 있습니다
//
//    없는 장치를 요구하는 검사는 제품이 멀쩡한데도 FAIL 을 냅니다.
//    실제로 막히는지를 재는 것이 맞습니다.
ok(a.scheduleId === c.scheduleId && !!c.scheduleId,
   '⑩ 두 번 다 같은 일정으로 보냄 — 서버가 자연키로 중복을 막을 수 있음',
   `${a.scheduleId} / ${c.scheduleId}`)

const t2 = flat(await q.textContent('body'))
ok(/수거 완료가 반영되었습니다/.test(t2), '⑪ 통신이 돌아오면 저장이 끝남', t2.slice(0, 70))
ok(denied.length === 0, '⑫ 여기까지 못 읽는 것을 묻지 않음', denied.join(' · '))
await ctx.close()

// ═══ 서버에는 들어갔는데 응답이 끊긴 경우 ════════════════════════════════════
//
//   제일 헷갈리는 갈래입니다. 저장은 됐는데 화면은 「못 했다」고 합니다.
//   기사님이 다시 누르면 서버가 「이미 완료 처리된 일정입니다」로 막습니다.
//   **저장이 됐다는 뜻인데** 빨간 글씨로 뜨면 기사님은 사무실에 전화합니다.
{
  const calls2 = []
  const denied2 = []
  const ctx2 = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  //  fail.on = false 로 두고, complete_collection 만 「이미 완료」로 답하게 합니다.
  wire(ctx2, 'field', { calls: calls2, denied: denied2, fail: { on: false } })
  await ctx2.route('**/rest/v1/rpc/complete_collection', (r) =>
    r.fulfill({ status: 400, contentType: 'application/json',
      body: JSON.stringify({ code: 'P0001', message: '이미 완료 처리된 일정입니다. (중복 완료 방지)' }) }))

  const w = await open(ctx2, '/collection?schedule=s1', FIELD)
  w.on('dialog', (d) => d.accept())
  await w.fill('[data-actual-amount]', '118')
  await w.getByRole('button', { name: /수거 완료 저장/ }).first().click()
  await w.waitForTimeout(2500)

  const t3 = flat(await w.textContent('body'))
  ok((await w.locator('[data-collect-dup]').count()) > 0,
     '⑬ **「이미 저장돼 있습니다」를 빨간 실패가 아니라 안내로 보여 줌**', t3.slice(0, 80))
  ok(/다시 넣지 않으셔도 됩니다/.test(t3), '⑭ 다시 안 넣어도 된다고 분명히 말함')
  ok((await w.locator('[data-collect-dup-check]').count()) > 0,
     '⑮ 확인하러 갈 곳(오늘 일정)을 알려 줌')
  //  ⚠ 저장됐다고 **지어내면** 안 됩니다 — 우리가 방금 보낸 값이 저장된
  //    값이라는 보장이 없습니다. 성공 화면으로 넘기지 않는 것이 맞습니다.
  ok(!/수거 완료가 반영되었습니다/.test(t3),
     '⑯ 그렇다고 「반영되었습니다」라고 지어내지도 않음')
  await ctx2.close()
}
await b.close()
