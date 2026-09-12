import { chromium, EXEC } from './_pw.mjs'

//  폰 390px 품질 스윕 — 파일럿에서 실제로 쓰는 모든 화면을 역할별로 훑습니다.
//
//   현장 기사님은 **한 손에 폰, 한 손에 용기** 입니다. PC 로는 아무것도 안 합니다.
//   병원 담당자는 겸직이라 화면을 오래 안 봅니다.
//   그래서 폰에서 다음 네 가지는 「불편」이 아니라 **못 쓰는 것**입니다.
//
//     ① 가로로 밀린다        — 오른쪽 칸을 못 봅니다 (밀 수 있다는 표시도 없습니다)
//     ② 누를 것이 너무 작다  — 장갑 낀 손으로 못 누릅니다 (44px 기준)
//     ③ 글자가 세로로 늘어진다 — 폭이 0 까지 줄어든 칸. 읽을 수 없습니다
//     ④ 화면 밖으로 튀어나간다 — 잘려서 안 보입니다
//
//   ⚠ 가짜 서버는 check_flow390 과 같은 모양입니다 (0063 뒤의 진짜 서버처럼
//     현장에게 돈 칸을 안 줍니다). 서버가 안 줄 때 화면이 어떻게 생기는지를
//     재야 실제와 같습니다.

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

//  ⚠ **빈 화면만 재고 있었습니다.**
//
//   주문을 하나도 안 넣어 두어서 사무실 「소모품」 화면이 늘 「아직 들어온
//   주문이 없습니다」 로만 측정됐습니다. 정작 재야 할 것은 **주문 줄이
//   그려졌을 때** 버튼이 눌리는지·글자가 안 깨지는지입니다.
//   빈 화면만 재는 스윕은 「깨끗하다」고 말하지만 아무것도 안 본 것입니다.
const ORDER_ITEMS = [
  { id: 1, order_id: 'ux-o1', product_id: PROD, name: '합성수지 전용용기', spec: '20L', unit: '개',
    qty: 12, unit_price: 9000, unit_cost: 5200, stock_key: 'plastic_container' },
  { id: 2, order_id: 'ux-o2', product_id: PROD, name: '합성수지 전용용기', spec: '20L', unit: '개',
    qty: 3, unit_price: 9000, unit_cost: 5200, stock_key: 'plastic_container' },
]
const ORDERS = [
  { id: 'ux-o1', client_id: CA, status: '요청', requester_name: '병원 담당자', source: 'portal',
    note: '다음 수거 때 같이 부탁드립니다', deliver_schedule_id: null, deliver_on: null,
    requested_at: `${TODAY}T01:00:00Z`, confirmed_at: null, delivered_at: null,
    canceled_at: null, cancel_reason: '' },
  { id: 'ux-o2', client_id: CA, status: '전달완료', requester_name: '병원 담당자', source: 'portal',
    note: '', deliver_schedule_id: null, deliver_on: back(7),
    requested_at: `${back(9)}T01:00:00Z`, confirmed_at: `${back(8)}T01:00:00Z`,
    delivered_at: `${back(7)}T01:00:00Z`, canceled_at: null, cancel_reason: '' },
]

const b = await chromium.launch({ executablePath: EXEC })

/**
 * 0063 뒤의 서버처럼 구는 가짜 서버.
 *  denied[] 에는 「앱이 물어서는 안 되는 것을 물었다」가 쌓입니다.
 */
function wire(ctx, role, { calls = [], denied = [], fontScale = 'normal' } = {}) {
  const uid = role === 'client' ? HOSP : FIELD
  const pf = {
    id: uid, email: `${role}@beonemirae.test`,
    name: role === 'client' ? '병원 담당자' : '김준기', role,
    font_scale: fontScale, active: true, approved_at: '2026-01-01T00:00:00Z',
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
    //  상품은 **사무실에도** 줍니다 — 「상품」 탭이 빈 화면으로만 측정되고
    //  있었습니다 (0063 이 막는 것은 clients 의 돈 칸이지 products 가 아닙니다).
    if (url.includes('/product_order_items')) return json(ORDER_ITEMS)
    if (url.includes('/product_orders')) return json(ORDERS)
    if (url.includes('/products')) return json(role === 'field' ? [] : PRODUCTS)

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


// ─────────────────────────────────────────────────────────────────────────────
//  화면 하나를 재는 자
// ─────────────────────────────────────────────────────────────────────────────
//  기본은 폰 390px 입니다. UX_W=1440 을 주면 PC 로도 같은 자를 댑니다
//  (지시 §10 — PC 1440 · 모바일 390 둘 다 봅니다).
const W = Number(process.env.UX_W ?? 390)

async function measure(p) {
  return await p.evaluate((W) => {
    const vis = (el) => {
      const s = getComputedStyle(el)
      if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0
    }
    const label = (el) => {
      const t = (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim()
      const tag = el.tagName.toLowerCase()
      return `${tag}${t ? `「${t.slice(0, 24)}」` : `[${(el.className || '').toString().slice(0, 30)}]`}`
    }

    const all = [...document.querySelectorAll('body *')].filter(vis)

    // ① 가로로 밀림
    const pageWide = Math.max(
      document.documentElement.scrollWidth,
      document.body.scrollWidth,
    )

    // ② 누를 것이 44px 보다 작음
    //    - 본문 안의 글 링크(inline)는 뺍니다. 버튼처럼 생긴 것만 봅니다.
    const small = []
    for (const el of all) {
      const tag = el.tagName.toLowerCase()
      const isHit =
        tag === 'button' ||
        (tag === 'a' && el.hasAttribute('href')) ||
        tag === 'select' ||
        (tag === 'input' && !['hidden', 'checkbox', 'radio'].includes(el.type)) ||
        el.getAttribute('role') === 'button'
      if (!isHit) continue
      if (getComputedStyle(el).display === 'inline') continue
      //  ⚠ **적어 둔 예외**만 뺍니다 — 그냥 봐주면 검사가 아무것도 안 잡습니다.
      //    달력의 ＋(방문 잡기)는 일부러 36px 입니다. 폰에서 달력 한 칸이
      //    56px 밖에 안 되어 44px 로 키우면 ＋ 가 칸을 거의 다 덮어
      //    **날짜 고르기를 가로챕니다.** 코드에도 그 이유가 적혀 있습니다.
      if (el.hasAttribute('data-cal-book')) continue
      //  ⚠ 44px 는 **손가락** 기준입니다. 마우스로 쓰는 PC 화면에 그대로 대면
      //    멀쩡한 32~40px 버튼이 전부 결함으로 잡힙니다(실제로 21개 화면이
      //    그렇게 잡혔습니다). PC 에서는 이 자를 대지 않습니다 —
      //    PC 에서 재야 할 것은 밀림·늘어짐·잘림입니다.
      if (W >= 1024) continue
      const r = el.getBoundingClientRect()
      if (r.height < 44 || r.width < 32) small.push({ what: label(el), h: Math.round(r.height), w: Math.round(r.width) })
    }

    // ③ 글자가 세로로 늘어짐 — 폭이 좁은데 키가 큰 글자 칸
    const squeezed = []
    for (const el of all) {
      const txt = (el.textContent || '').replace(/\s+/g, '')
      if (txt.length < 4) continue
      //  글자를 직접 담은 칸만 (자식 요소가 감싸고 있는 상자는 뺍니다)
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 3)
      if (!own) continue
      const r = el.getBoundingClientRect()
      if (r.width < 44 && r.height > 88) squeezed.push({ what: label(el), w: Math.round(r.width), h: Math.round(r.height) })
    }

    // ④ 화면 밖으로 튀어나감 (가로 스크롤 상자 안은 뺍니다 — 일부러 미는 표)
    const outside = []
    for (const el of all) {
      const r = el.getBoundingClientRect()
      if (r.right <= W + 1 && r.left >= -1) continue
      let anc = el.parentElement, inScroller = false
      while (anc) {
        const s = getComputedStyle(anc)
        if (s.overflowX === 'auto' || s.overflowX === 'scroll') { inScroller = true; break }
        anc = anc.parentElement
      }
      if (inScroller) continue
      if (r.width > W * 3) continue // 화면 전체를 덮는 배경띠 같은 것
      outside.push({ what: label(el), left: Math.round(r.left), right: Math.round(r.right) })
    }

    // ⑤ 글자가 잘림 — 줄임표 없이 넘친 칸
    const clipped = []
    for (const el of all) {
      const s = getComputedStyle(el)
      if (s.overflowX !== 'hidden' && s.overflow !== 'hidden') continue
      if (s.textOverflow === 'ellipsis') continue
      //  ⚠ 화면 낭독기 전용 글자(sr-only)는 **일부러** 1px 칸에 숨긴 것입니다.
      //    눈으로 보라고 둔 글자가 아니라 「이 칸이 무엇인지」를 낭독기에만
      //    알려 주는 자리라, 여기서 「잘렸다」고 세면 접근성을 챙길수록
      //    점수가 나빠집니다. 눈에 보이는 크기가 아닌 것은 재지 않습니다.
      const rr = el.getBoundingClientRect()
      if (rr.width <= 1 || rr.height <= 1) continue
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 3)
      if (!own) continue
      if (el.scrollWidth > el.clientWidth + 2) clipped.push({ what: label(el), over: el.scrollWidth - el.clientWidth })
    }

    return { pageWide: Math.round(pageWide), small, squeezed, outside, clipped }
  }, W)
}

const REPORT = process.env.UX_REPORT === '1'
const show = (list, n = 4) => list.slice(0, n).map((x) => JSON.stringify(x)).join(' ')

const SCREENS = [
  ['field', '/today', '현장 · 오늘 일정'],
  ['field', '/collection', '현장 · 수거 입력'],
  ['field', '/clients', '현장 · 거래처'],
  ['field', `/clients/${CA}`, '현장 · 거래처 상세'],
  ['field', '/more', '현장 · 더보기'],
  ['client', '/portal', '병원 · 첫 화면'],
  ['client', '/portal/history', '병원 · 수거 이력'],
  ['client', '/portal/report', '병원 · 월간 리포트'],
  ['client', '/portal/supplies', '병원 · 물품 요청'],
  ['office', '/', '사무실 · 대시보드'],
  ['office', '/today', '사무실 · 오늘 일정'],
  ['office', '/requests', '사무실 · 병원 요청'],
  ['office', '/supplies', '사무실 · 소모품'],
  ['office', '/receivables', '사무실 · 미수금'],
  ['office', '/billing', '사무실 · 월말 청구'],
  //  파일럿에서 같이 열게 되는 화면들 — 여기가 깨지면 결국 엑셀로 돌아갑니다
  ['office', '/history', '사무실 · 수거 이력'],
  ['office', '/plan', '사무실 · 일정 편성'],
  ['office', '/dispatch', '사무실 · 배차'],
  ['office', '/materials', '사무실 · 자재공급'],
  ['office', '/clients', '사무실 · 거래처'],
  ['office', `/clients/${CA}`, '사무실 · 거래처 상세'],
  ['office', '/settings', '사무실 · 설정'],
  ['office', '/more', '사무실 · 더보기'],
  ['office', '/reports', '사무실 · 경영 요약'],
  ['office', '/stats', '사무실 · 통계'],
  //  이번에 붙인 화면들 — 붙였으면 재야 합니다
  ['office', '/performance', '사무실 · AX 성과'],
  //  0108 — AX 코치. 기사님도 여는 화면이라 같은 자로 잽니다.
  ['office', '/ax-coach', '사무실 · AX 코치'],
  ['field', '/ax-coach', '현장 · AX 코치'],
]

// ── 0. **이 자가 실제로 무는가** ────────────────────────────────────────────
//
//   재는 자가 아무것도 못 잡으면, 화면이 멀쩡해서가 아니라 자가 고장 나서
//   전부 통과합니다. 일부러 네 가지를 심어 놓고 넷 다 잡히는지 먼저 봅니다.
{
  const ctx = await b.newContext({
    viewport: { width: W, height: W >= 1024 ? 900 : 844 },
    isMobile: W < 1024, hasTouch: W < 1024,
  })
  wire(ctx, 'field')
  const p = await open(ctx, '/today', FIELD)
  await p.evaluate((W) => {
    const d = document.createElement('div')
    d.innerHTML = `
      <button style="height:22px;width:120px;display:block">너무 작은 버튼</button>
      <div style="width:30px;height:200px;overflow-wrap:break-word">세로로 늘어진 글자입니다</div>
      <div style="position:absolute;left:${W + 40}px;top:10px;width:80px;height:30px">밖으로</div>
      <div style="width:60px;overflow:hidden;white-space:nowrap">아주 긴 글자가 잘린 칸입니다</div>`
    document.body.appendChild(d)
  }, W)
  const m = await measure(p)
  if (W < 1024) ok(m.small.length > 0, '⓪ 자가 문다 — 작은 버튼을 잡음', `${m.small.length}건`)
  ok(m.squeezed.length > 0, '⓪ 자가 문다 — 세로로 늘어진 글자를 잡음', `${m.squeezed.length}건`)
  ok(m.outside.length > 0, '⓪ 자가 문다 — 화면 밖으로 나간 칸을 잡음', `${m.outside.length}건`)
  ok(m.clipped.length > 0, '⓪ 자가 문다 — 잘린 글자를 잡음', `${m.clipped.length}건`)
  await ctx.close()
}

//  ⚠ **큰 글씨(xl)까지 같이 봅니다.**
//    이사님도 기사님도 40~60대입니다. 설정에 「큰 글씨」가 있는데 정작
//    큰 글씨로 켜면 화면이 깨지면, 그 설정은 있으나 마나입니다.
//    폰 390px 에서 글자만 17.8px → 21.4px (＋20%) 로 커집니다 — 칸은 그대로입니다.
const SCALES = process.env.UX_SCALE ? [process.env.UX_SCALE] : ['normal', 'xl']

for (const scale of SCALES)
for (const [role, path, label0] of SCREENS) {
  const label = scale === 'normal' ? label0 : `${label0} · 큰 글씨`
  const ctx = await b.newContext({
    viewport: { width: W, height: W >= 1024 ? 900 : 844 },
    isMobile: W < 1024, hasTouch: W < 1024,
  })
  wire(ctx, role, { fontScale: scale })
  const p = await open(ctx, path, role === 'client' ? HOSP : FIELD)
  const m = await measure(p)

  if (REPORT) {
    console.log(`\n── ${label} (${path})`)
    console.log(`   가로 ${m.pageWide}px · 작은버튼 ${m.small.length} · 세로늘어짐 ${m.squeezed.length} · 밖으로 ${m.outside.length} · 잘림 ${m.clipped.length}`)
    if (m.small.length) console.log('   작은버튼 ', show(m.small, 6))
    if (m.squeezed.length) console.log('   세로늘어짐', show(m.squeezed, 6))
    if (m.outside.length) console.log('   밖으로   ', show(m.outside, 6))
    if (m.clipped.length) console.log('   잘림     ', show(m.clipped, 6))
  } else {
    ok(m.pageWide <= W + 1, `${label} — 가로로 밀리지 않음`, `${m.pageWide}px`)
    ok(m.squeezed.length === 0, `${label} — 글자가 세로로 늘어진 칸 없음`, show(m.squeezed))
    ok(m.outside.length === 0, `${label} — 화면 밖으로 나간 칸 없음`, show(m.outside))
    if (W < 1024) ok(m.small.length === 0, `${label} — 누를 것이 다 44px 이상`, show(m.small))
    ok(m.clipped.length === 0, `${label} — 글자가 잘린 칸 없음`, show(m.clipped))
  }
  await ctx.close()
}

await b.close()
