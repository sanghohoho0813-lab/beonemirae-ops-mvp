import { chromium, EXEC } from './_pw.mjs'

//  폰 390px — **하루 업무를 끝까지** 밟습니다 (0063 적용 뒤).
//
//   현장   오늘 일정 → 병원 누름 → 수거량 → 용기 → 자재 → 저장
//   병원   수거 요청 보내기 · 자재·용기 주문 보내기
//
//  ── 이 검사가 앞의 것들과 다른 점 ──────────────────────────────────────────
//
//   여기 가짜 서버는 **0063 적용 뒤의 진짜 서버처럼** 굽니다.
//
//    · 거래처를 `select=*` 로 물으면 **permission denied 를 돌려줍니다**
//      (앱이 무심코 별표를 쓰면 여기서 터집니다 — 실서버에서 터지기 전에)
//    · 현장에게 client_billing_terms() 는 `[]`
//    · 현장에게 월실적·상품·문서함은 `[]`
//    · clients_full() 은 관리자만
//
//   예전 검사들은 가짜 서버가 현장에게도 돈을 그대로 줬습니다. 그건
//   「화면이 가리는가」만 재는 것이고, **서버가 안 줄 때 화면이 멀쩡한가**는
//   한 번도 안 재 본 셈이었습니다.

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
function wire(ctx, role, { calls = [], denied = [] } = {}) {
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

// ═══ 현장 기사님의 하루 (390×844) ══════════════════════════════════════════
{
  const calls = []
  const denied = []
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  wire(ctx, 'field', { calls, denied })

  console.log('── 1. 오늘 일정 ──')
  const p = await open(ctx, '/today', FIELD)
  const t1 = flat(await p.textContent('body'))
  ok(!/문제가 생겼습니다/.test(t1), '**서버가 돈을 안 줘도 화면이 멀쩡함**', t1.slice(0, 60))
  ok(/한마음요양병원/.test(t1), '오늘 갈 곳이 보임')
  ok(/09:40/.test(t1), '몇 시에 가는지')
  ok(denied.length === 0, '**앱이 못 읽는 것을 묻지 않음**', denied.join(' · '))
  const over = await p.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth))
  ok(over === 0, '가로로 밀리지 않음', `${over}px`)
  await p.close()

  console.log('── 2. 그 병원으로 수거 입력 ──')
  const q = await open(ctx, '/collection?schedule=s1', FIELD)
  if ((await q.locator('[data-collect-here]').count()) === 0) {
    const pick = q.locator('button').filter({ hasText: /한마음/ }).first()
    if (await pick.count()) { await pick.dispatchEvent('click'); await q.waitForTimeout(900) }
  }
  ok((await q.locator('[data-collect-here]').count()) > 0, '「지금 이 병원」 한 줄로 접힘')
  const here = flat(await q.locator('[data-collect-here]').innerText())
  ok(/양지로/.test(here), '주소가 보임 (서버가 준 업무 칸)')
  ok(/031-111-2222/.test(here), '전화번호가 보임')

  console.log('── 3. 수거량 · 용기 · 자재 ──')
  await q.fill('[data-actual-amount]', '118')
  //  ⚠ 0065 부터 폰에서는 「용기」와 「자재」가 접혀 있습니다 (놓고 온 것이
  //     없는 날이 대부분이라). 기사님이 실제로 하는 그대로 먼저 폅니다.
  for (const id of ['containers', 'supply']) {
    const f = q.locator(`[data-fold="${id}"]`)
    if (await f.count()) { await f.dispatchEvent('click'); await q.waitForTimeout(350) }
  }
  //  ＋ 버튼으로 넣습니다 — 장갑 낀 손으로 실제로 하는 동작입니다.
  for (const [label, n] of [['골판지 전용박스', 3], ['합성수지 전용용기', 2]]) {
    const plus = q.getByRole('button', { name: `${label} 더하기` })
    ok((await plus.count()) > 0, `「${label}」 ＋ 버튼이 있음`)
    const box = await plus.first().boundingBox()
    ok(box != null && box.height >= 44 && box.width >= 44,
      `「${label}」 ＋ 가 44px 이상 (장갑)`, box ? `${Math.round(box.width)}×${Math.round(box.height)}` : '없음')
    for (let i = 0; i < n; i += 1) { await plus.first().click(); await q.waitForTimeout(90) }
  }
  //  ── 자재 칸은 폰에서 **접혀 있습니다** ────────────────────────────────
  //   규격이 열 줄이라 다 펴면 1,000px 입니다. 지난번에 준 규격과 지금 값이
  //   들어간 줄만 펴 두고 나머지는 「다른 규격 N개 보기」 뒤에 둡니다.
  //   이 병원은 공급 이력이 없어서 **전부 접혀 있는 것이 맞습니다.**
  //
  //   ⚠ 예전에 이 버튼을 /더 보기|모두|펼치/ 로 찾다가 못 찾고 「자재 칸이
  //     폰에서 안 닿는다」고 잘못 보고할 뻔했습니다. 문구는 「다른 규격 N개
  //     보기」입니다 — 이름표(data-supply-more)로 집습니다.
  const more = q.locator('[data-supply-more]')
  ok((await more.count()) > 0, '이력이 없으면 자재 규격이 접혀 있고 펴는 길이 있음')
  const moreText = flat(await more.first().textContent())
  ok(/다른 규격 \d+개 보기/.test(moreText), '몇 개가 접혀 있는지 적혀 있음', moreText)
  const mb = await more.first().boundingBox()
  ok(mb != null && mb.height >= 40, '펴는 버튼이 폰에서 눌림', mb ? `${Math.round(mb.height)}px` : '없음')

  await more.first().click()
  await q.waitForTimeout(500)
  ok((await q.locator('[data-supply-more]').count()) === 0, '펴면 그 버튼은 사라짐 (한 번 펴면 그대로)')

  const boxPlus = q.getByRole('button', { name: '63L 박스 더하기' })
  ok((await boxPlus.count()) > 0, '자재 칸(63L 박스)이 폰에서 닿음')
  const bb = await boxPlus.first().boundingBox()
  ok(bb != null && bb.height >= 44 && bb.width >= 44, '자재 ＋ 도 44px 이상 (장갑)',
    bb ? `${Math.round(bb.width)}×${Math.round(bb.height)}` : '없음')
  for (let i = 0; i < 10; i += 1) { await boxPlus.first().click(); await q.waitForTimeout(60) }

  console.log('── 4. 저장 ──')
  const save = q.getByRole('button', { name: /수거 완료 저장/ })
  ok((await save.count()) > 0, '저장 버튼이 있음')
  const sb = await save.first().boundingBox()
  ok(sb != null && sb.height >= 44, '저장 버튼이 44px 이상', sb ? `${Math.round(sb.height)}px` : '없음')
  await save.first().click()
  await q.waitForTimeout(1800)
  //  평소와 크게 다른 수거량이면 한 번 더 묻습니다 — 그때는 확인을 누릅니다.
  const confirm = q.getByRole('button', { name: /그대로 저장|계속|확인/ })
  if ((await confirm.count()) > 0) { await confirm.first().click(); await q.waitForTimeout(1500) }

  const done = calls.find((c) => c.rpc === 'complete_collection')
  ok(done != null, '**서버로 수거 완료가 감**', done ? '' : `보낸 것: ${calls.map((c) => c.rpc ?? c.table).join(',')}`)
  const pay = done?.body?.p ?? {}
  ok(pay.clientId === CA, '어느 병원인지 담겨 감', String(pay.clientId))
  ok(Number(pay.actualAmount) === 118, '수거량 118kg 이 그대로', String(pay.actualAmount))
  ok(pay.containers?.corrugated === 3 && pay.containers?.plastic === 2,
    '용기 골판지 3 · 합성수지 2 가 그대로', JSON.stringify(pay.containers ?? {}))
  ok(Number(pay.supplied?.corrugatedBox ?? 0) === 10, '건넨 자재(63L 박스 10)가 그대로',
    JSON.stringify(pay.supplied ?? {}))
  //  ⚠ 금액은 한 칸도 실려 가면 안 됩니다 — 현장은 금액을 만들지 않습니다.
  const raw = JSON.stringify(done?.body ?? {})
  ok(!/price|revenue|amountWon|salePrice|cost/i.test(raw), '**보낸 것에 금액이 한 칸도 없음**')

  const t2 = flat(await q.textContent('body'))
  ok(/저장|완료/.test(t2), '저장했다고 화면이 말해 줌', t2.slice(0, 60))
  ok(denied.length === 0, '여기까지 오는 동안 못 읽는 것을 묻지 않음', denied.join(' · '))
  await q.close()
  await ctx.close()
}

// ═══ 병원 담당자 (390×844) ═════════════════════════════════════════════════
{
  const calls = []
  const denied = []
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  wire(ctx, 'client', { calls, denied })

  console.log('── 5. 병원 첫 화면 ──')
  const p = await open(ctx, '/portal', HOSP)
  const t = flat(await p.textContent('body'))
  ok(!/문제가 생겼습니다/.test(t), '**서버가 단가를 안 줘도 포털이 멀쩡함**', t.slice(0, 60))
  ok(denied.length === 0, '병원 화면도 못 읽는 것을 묻지 않음', denied.join(' · '))
  const c1 = await p.locator('[data-portal-cta="collect"]').boundingBox()
  //  ⚠ 이 검사가 깨지면 **무엇이 위에서 자리를 먹었는지**를 바로 알아야
  //    고칠 수 있습니다. 숫자만 보면 매번 다시 재야 합니다.
  //    (0089 에서 실제로 「지금 확인이 필요한 항목」이 138px 을 먹어
  //     955px 로 밀렸습니다 — 그때 이 줄이 있었으면 한 번에 찾았습니다)
  if (c1 == null || c1.y + c1.height > 844) {
    const dump = []
    for (const sel of ['header', '[data-portal-preview]', '[data-portal-hero]', '[data-portal-todos]', '[data-portal-actions]']) {
      const bx = await p.locator(sel).first().boundingBox().catch(() => null)
      dump.push(`${sel}=${bx ? `y${Math.round(bx.y)}/h${Math.round(bx.height)}` : '없음'}`)
    }
    console.log('     ↑ 무엇이 위에서 자리를 먹었나:', dump.join(' '))
  }
  const c2 = await p.locator('[data-portal-cta="supplies"]').boundingBox()
  ok(c1 != null && c1.y + c1.height <= 844, '① 수거 요청이 첫 화면 안', c1 ? `${Math.round(c1.y + c1.height)}px` : '없음')
  ok(c2 != null && c2.y + c2.height <= 844, '② 자재·용기 요청이 첫 화면 안', c2 ? `${Math.round(c2.y + c2.height)}px` : '없음')

  //  ── 병원 이름이 읽히는가 · 세로로 늘어진 글자가 없는가 ────────────────
  //   ⚠ 헤더를 한 줄로 자르면 「의료법인 한…」만 남습니다. 정작 어느
  //     병원인지는 **뒤쪽**에 있습니다.
  const hdr = await p.evaluate(() => {
    const el = document.querySelector('header p')
    if (!el) return null
    const b = el.getBoundingClientRect()
    return { text: (el.textContent ?? '').trim(), clipped: el.scrollWidth > el.clientWidth + 1,
             h: Math.round(b.height), headerH: Math.round(document.querySelector('header')?.getBoundingClientRect().height ?? 0) }
  })
  ok(hdr != null && !hdr.clipped, '병원 이름이 잘리지 않음', hdr ? `${hdr.text} (잘림=${hdr.clipped})` : '없음')
  ok(hdr != null && hdr.headerH <= 140, '그래도 헤더가 화면을 먹지 않음', hdr ? `${hdr.headerH}px` : '없음')

  //  ⚠ 폭이 두 글자도 안 되는데 높이가 세 줄 넘는 글자 = 세로로 늘어진 것입니다.
  const vertical = async (page) => page.evaluate(() => {
    const bad = []
    for (const el of document.querySelectorAll('body *')) {
      if (el.children.length > 0) continue
      const t = (el.textContent || '').trim()
      if (t.length < 3) continue
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      const fs = parseFloat(getComputedStyle(el).fontSize) || 16
      if (r.width < fs * 2.2 && r.height > fs * 2.6) bad.push(`${t.slice(0, 14)} (${Math.round(r.width)}×${Math.round(r.height)})`)
    }
    return bad
  })
  const v1 = await vertical(p)
  ok(v1.length === 0, '첫 화면에 세로로 늘어진 글자가 없음', v1.join(' · '))

  console.log('── 6. 수거 요청을 보낸다 ──')
  //  ⚠ 0089 부터 이 창은 **고르는 창**입니다. 예전 판의 #req-content 를
  //    채우던 이 자리에서 스위트가 매번 터졌는데, 앞의 35건은 이미 찍힌
  //    뒤라 「실패 0」으로 보였습니다. 나란히 돌리는 겉껍질이 **끝난
  //    코드**를 안 봤기 때문입니다(0093 에서 고쳤습니다).
  await p.locator('[data-portal-cta="collect"]').dispatchEvent('click')
  await p.waitForSelector('[data-req-send]', { timeout: 15000 })
  await p.locator('[data-choice="reason"] [data-choice-item]').first().click()
  await p.locator('[data-req-memo]').fill('격리환자 발생으로 배출량이 늘었습니다')
  await p.waitForTimeout(200)
  await p.locator('[data-req-send]').click()
  await p.waitForTimeout(1600)
  const req = calls.find((c) => c.table === 'client_requests')
  ok(req != null, '**요청이 서버로 감**')
  ok(req?.body?.client_id === CA, '우리 병원 것으로 감', String(req?.body?.client_id))
  ok(req?.body?.kind === '추가수거', '종류가 추가수거', String(req?.body?.kind))
  ok(/격리환자/.test(req?.body?.content ?? ''), '적은 내용이 그대로')
  ok(flat(await p.textContent('body')).includes('접수'), '접수되었다고 화면이 말해 줌')
  await p.close()

  console.log('── 7. 자재·용기를 주문한다 ──')
  const q = await open(ctx, '/portal', HOSP)
  //  ⚠ 0089 부터 이 칸은 **창을 엽니다** — 화면을 옮기지 않습니다.
  //    주문 화면 자체는 그대로 남아 있어(실사 때 보여 드립니다) 아래에서
  //    그 화면을 따로 엽니다.
  await q.locator('[data-portal-cta="supplies"]').dispatchEvent('click')
  await q.waitForTimeout(1600)
  ok(/do=supply/.test(q.url()), '자재·용기 칸이 창을 엶', q.url())
  await q.keyboard.press('Escape')
  await q.waitForTimeout(700)
  await q.goto(`${BASE}/portal/supplies`, { waitUntil: 'domcontentloaded' })
  await q.waitForTimeout(2600)
  ok(new URL(q.url()).pathname === '/portal/supplies', '물품 화면이 열림', q.url())
  const plus = q.locator(`[data-qty-plus="${PROD}"]`)
  ok((await plus.count()) > 0, '주문할 물품이 보임 (0063 이 병원은 안 막았음)')
  const pb = await plus.first().boundingBox()
  ok(pb != null && pb.height >= 40, '＋ 가 폰에서 눌림', pb ? `${Math.round(pb.width)}×${Math.round(pb.height)}` : '없음')
  for (let i = 0; i < 10; i += 1) { await plus.first().click(); await q.waitForTimeout(60) }
  await q.locator('[data-order-send]').click()
  await q.waitForTimeout(1600)
  const ord = calls.find((c) => c.rpc === 'request_product_order')
  ok(ord != null, '**주문이 서버로 감**')
  ok(ord?.body?.p_client_id === CA, '우리 병원 것으로 감', String(ord?.body?.p_client_id))
  const items = ord?.body?.p_items ?? []
  ok(items.length === 1 && items[0].productId === PROD && items[0].qty === 10,
    '품목과 수량이 그대로 (10개)', JSON.stringify(items))
  //  ⚠ 금액은 화면이 정하지 않습니다 — 서버가 그 시점 단가로 굳힙니다.
  ok(!/price|total|amount/i.test(JSON.stringify(ord?.body ?? {})),
    '**금액을 화면이 보내지 않음** (서버가 정합니다)', JSON.stringify(ord?.body ?? {}).slice(0, 80))
  const msg = flat(await q.textContent('[data-order-msg]').catch(() => ''))
  ok(/접수/.test(msg), '접수되었다고 말해 줌', msg.slice(0, 50))
  ok(denied.length === 0, '주문까지 오는 동안 못 읽는 것을 묻지 않음', denied.join(' · '))
  await q.close()

  console.log('── 8. 월간 리포트 · 수거 이력 ──')
  //   ⚠ 여기 제목이 폰에서 **세로로 한 글자씩** 늘어져 있었습니다
  //     (71px 폭 · 165px 높이). 옆의 달 고르기가 자리를 다 가져갔습니다.
  for (const [path, label] of [['/portal/report', '월간 리포트'], ['/portal/history', '수거 이력']]) {
    const r = await open(ctx, path, HOSP)
    const bad = await vertical(r)
    ok(bad.length === 0, `${label}에 세로로 늘어진 글자가 없음`, bad.join(' · '))
    const over = await r.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth))
    ok(over === 0, `${label}이 가로로 밀리지 않음`, `${over}px`)

    if (path === '/portal/history') {
      //  ⚠ 표가 640px 인데 폰의 칸은 354px 이라 **가로로 286px 밀렸습니다.**
      //    병원이 「용기」와 「처리장 인계」를 보려면 옆으로 밀어야 했고,
      //    밀 수 있다는 표시도 없었습니다. 인증·실사 때 쓰는 자료입니다.
      const inner = await r.evaluate(() => {
        let worst = 0
        for (const el of document.querySelectorAll('main *')) {
          const s = el.scrollWidth - el.clientWidth
          if (s > worst && el.clientWidth > 100) worst = s
        }
        return worst
      })
      ok(inner <= 8, '수거 이력이 **칸 안에서도** 가로로 안 밀림 (예전 286px)', `${inner}px`)
      const cards = await r.locator('[data-portal-hist-card]').count()
      ok(cards > 0, '폰에서는 표 대신 카드로 보임', `${cards}장`)
      const tableVisible = await r.locator('table').first().isVisible().catch(() => false)
      ok(!tableVisible, '폰에서 표는 안 보임 (넓은 화면에는 그대로 있습니다)')
      const t = flat(await r.textContent('[data-portal-hist-cards]'))
      ok(/kg/.test(t), '카드에 배출량이 있음', t.slice(0, 60))
      const pills = await r.locator('[data-portal-hist-handover]').count()
      ok(pills === cards, '카드마다 처리장 인계 알약이 하나씩', `${pills}/${cards}`)
      ok(/인계 완료/.test(t), '인계까지 끝난 건은 「인계 완료」로 보임')
      ok(/수거 완료/.test(t), '아직 인계 전인 건은 그 상태 그대로', t.slice(0, 60))
      //  ⚠ 용기를 안 적었으면 **「미기재」** 입니다. 예전에는 여기가 「개」
      //    한 글자만 떠 있었습니다 (containerType 이 null 인데 그대로 그려서).
      ok(/용기 골판지/.test(t), '적힌 용기는 그대로 보임', t.slice(0, 70))
      ok(/용기 미기재/.test(t), '**안 적은 용기는 「미기재」** (0 으로 채우지 않음)')
      ok(!/^개|\s개\s/.test(t.replace(/\d+개/g, '')), '「개」만 덩그러니 남지 않음')
    }
    await r.close()
  }
  await ctx.close()
}

await b.close()
