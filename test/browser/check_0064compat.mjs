import { chromium, EXEC } from './_pw.mjs'

//  0064 를 **안전하게 적용할 수 있는가** — 앱이 판 64 과 64 둘 다에서 도는가
//
//   0064 는 products.cost_price 와 staff.insured_from / insurance 의 칸 권한을
//   거둡니다. 앱이 별표(*)로 읽고 있으면 그 순간 요청 전체가 403 이 되어
//   **화면이 빈 것이 아니라 오류**가 됩니다 (0063 때 거래처에서 겪은 함정).
//
//   여기서는 가짜 서버를 **두 가지 판**으로 굴립니다.
//
//     판 64 (지금)  · 표에서 cost_price 를 그대로 줌
//                   · product_costs() · staff_hr() 함수는 **없음** (404)
//     판 64 (적용 후) · cost_price / insured_from / insurance 를 물으면 **403**
//                   · 별표로 물어도 **403**  ← 여기서 앱이 깨지는지 봅니다
//                   · 원가·보험은 새 함수로만
//
//   두 판 모두에서 상품 화면·직원 명부·사용자 관리·병원 포털·현장 화면이
//   멀쩡해야 「지금 0064 를 돌려도 된다」고 말할 수 있습니다.

//  ⚠⚠ 이 파일의 63 / 64 는 **일괄 치환하면 안 됩니다.**
//     여기서는 판 63(0064 전)과 64(0064 후)를 **일부러 둘 다** 흉내 냅니다.
//     다른 검사들의 63 을 64 로 옮기면서 이 파일까지 바꿨다가 검사가
//     통째로 무의미해졌습니다. 실제로 한 번 그랬습니다.

const BASE = 'http://localhost:4173'
const UID = '00000000-0000-0000-0000-0000000000ad'
const CA = '00000000-0000-0000-0000-0000000000c1'
const PROD = '00000000-0000-0000-0000-0000000000p1'
const ok = (c, m, d = '') => { console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`); if (!c) process.exitCode = 1 }
const flat = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const TODAY = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })

const PRODUCTS = [
  { id: PROD, name: '합성수지 전용용기', spec: '20L', unit: '개', sale_price: 9000, cost_price: 5200,
    stock_key: 'plastic_container', available: true, image_url: '', description: '', sort: 0,
    active: true, category: '의료폐기물 용기', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
]
const STAFF = [
  { id: 's1', name: '홍현주', position: '이사', waste_scope: '해당없음', insured_from: '2023-05-01',
    insurance: { 건강보험: '2023-05-01' }, profile_id: null, active: true, note: '',
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  { id: 's2', name: '김준기', position: '현장', waste_scope: '의료폐기물', insured_from: '2024-03-01',
    insurance: { 건강보험: '2024-03-01' }, profile_id: null, active: true, note: '',
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
]
const CLIENTS = [{
  id: CA, name: '가나요양병원', type: '병원', address: '', manager: '', phone: '',
  collection_cycle: '주 1회', collects_medical_waste: true, collects_diaper: false, storage_size: '보통',
  note: '', is_demo_generated: false, demo_session_id: null, active: true,
  contract_start: '2025-01-01', contract_end: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}]

const b = await chromium.launch({ executablePath: EXEC })

/** @param ver 63 = 지금 · 64 = 0064 적용 후 */
function wire(ctx, ver, role, denied) {
  const pf = { id: UID, email: 'a@b.c', name: role === 'client' ? '병원 담당자' : '대표', role,
    font_scale: 'normal', active: true, approved_at: '2026-01-01T00:00:00Z',
    client_id: role === 'client' ? CA : null, vehicle_id: null, created_at: '2026-01-01T00:00:00Z' }

  ctx.route('**/auth/v1/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: UID, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }) }))

  ctx.route('**/rest/v1/**', (r) => {
    const url = r.request().url()
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const json = (v, st = 200) => r.fulfill({ status: st, contentType: 'application/json', body: JSON.stringify(v) })
    const sel = decodeURIComponent((url.match(/[?&]select=([^&]*)/) ?? ['', ''])[1])
    const ordr = decodeURIComponent((url.match(/[?&]order=([^&]*)/) ?? ['', ''])[1])
    //  0064 뒤에는 이 칸을 **물어보기만 해도** 거절됩니다 (정렬에 써도 마찬가지).
    const forbidden = (table, cols) => {
      if (ver !== 64) return false
      const asked = sel === '*' || sel === ''
      const hit = cols.some((c) => sel.split(',').map((x) => x.trim()).includes(c) || ordr.startsWith(c))
      return asked || hit
    }

    if (url.includes('/rpc/product_costs')) {
      //  판 64 에는 이 함수가 **없습니다**
      if (ver === 63) return json({ code: 'PGRST202', message: 'Could not find the function public.product_costs() in the schema cache' }, 404)
      return json(PRODUCTS.map((p) => ({ id: p.id, cost_price: p.cost_price })))
    }
    if (url.includes('/rpc/staff_hr')) {
      if (ver === 63) return json({ code: 'PGRST202', message: 'Could not find the function public.staff_hr() in the schema cache' }, 404)
      return json(STAFF.map((s) => ({ id: s.id, name: s.name, insured_from: s.insured_from, insurance: s.insurance })))
    }
    if (url.includes('/rpc/app_schema_version')) return json(ver)
    if (url.includes('/rpc/app_health_check')) return json({ version: ver, ok: true, missing: [], checkedAt: '' })
    if (url.includes('/rpc/recent_app_errors')) return json({ days: 7, total: 0, groups: [], checkedAt: '' })
    if (url.includes('/rpc/client_billing_terms')) return json([])
    if (url.includes('/rpc/')) return json(null)

    if (url.includes('/profiles')) {
      const idEq = (url.match(/[?&]id=eq\.([^&]+)/) ?? [])[1]
      const rows = idEq ? [pf].filter((x) => x.id === decodeURIComponent(idEq)) : [pf]
      return json(single ? (rows[0] ?? null) : rows)
    }
    if (url.includes('/products')) {
      if (forbidden('products', ['cost_price'])) {
        denied.push(`products select=${sel || '(없음)'} order=${ordr}`)
        return json({ code: '42501', message: 'permission denied for table products' }, 403)
      }
      //  판 64 에서는 표에서 cost_price 를 **그대로 줍니다** (0064 전이니까요).
      //  앱이 되돌아가는 길(표에서 그 칸만 다시 읽기)이 실제로 도는지 봅니다.
      return json(ver === 63 ? PRODUCTS : PRODUCTS.map(({ cost_price, ...rest }) => rest))
    }
    //  ⚠ `/staff` 로 넓게 잡으면 **staff_invites** 까지 걸립니다 (다른 표입니다).
    //    처음에 그렇게 잡아 놓고 「앱이 잠긴 칸을 묻는다」고 잘못 셌습니다.
    if (url.includes('/staff_invites')) return json([])
    if (url.includes('/staff')) {
      if (forbidden('staff', ['insured_from', 'insurance'])) {
        denied.push(`staff select=${sel || '(없음)'} order=${ordr}`)
        return json({ code: '42501', message: 'permission denied for table staff' }, 403)
      }
      return json(ver === 63 ? STAFF : STAFF.map(({ insured_from, insurance, ...rest }) => rest))
    }
    if (url.includes('/clients')) return json(single ? CLIENTS[0] : CLIENTS)
    if (url.includes('/vehicles')) return json([])
    if (url.includes('/schedules')) return json([])
    return json([])
  })
}

async function open(ctx, path) {
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 120)))
  await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: UID, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }])
  await p.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(2800)
  return { p, errs }
}

const SCREENS = [
  ['admin', '/supplies', '상품 화면'],
  ['admin', '/settings', '직원 명부 (설정)'],
  ['admin', '/users', '사용자 관리'],
  ['admin', '/today', '현장 화면 (오늘 일정)'],
  ['client', '/portal', '병원 포털'],
]

for (const W of [1440, 390]) {
  for (const ver of [63, 64]) {
    console.log(`\n── 폭 ${W}px · 판 ${ver} ${ver === 63 ? '(0064 전)' : '(0064 후 · 지금)'} ──`)
    for (const [role, path, label] of SCREENS) {
      const denied = []
      const ctx = await b.newContext({
        viewport: { width: W, height: W >= 1024 ? 900 : 844 },
        isMobile: W < 1024, hasTouch: W < 1024,
      })
      wire(ctx, ver, role, denied)
      const { p, errs } = await open(ctx, path)
      const t = flat(await p.textContent('body'))
      const over = await p.evaluate(() =>
        Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth))

      //  ⚠ 여기가 핵심입니다 — **앱이 못 읽는 칸을 물어봤는가.**
      ok(denied.length === 0, `${label} — 잠긴 칸을 묻지 않음`, denied.join(' · ') || '한 번도 안 물음')
      ok(!/문제가 생겼습니다|Something went wrong/.test(t), `${label} — 화면이 터지지 않음`)
      ok(errs.length === 0, `${label} — 자바스크립트 오류 없음`, errs.join(' · '))
      ok(over === 0, `${label} — 가로로 밀리지 않음`, `${over}px`)
      await ctx.close()
    }
  }
}

// ── 원가가 실제로 어떻게 보이는가 ───────────────────────────────────────────
console.log('\n── 원가 표시 ──')
for (const ver of [63, 64]) {
  const denied = []
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
  wire(ctx, ver, 'admin', denied)
  const { p } = await open(ctx, '/supplies')
  //  「상품」 탭으로
  const tab = p.getByRole('button', { name: /^상품$/ })
  if (await tab.count()) { await tab.first().dispatchEvent('click'); await p.waitForTimeout(1200) }
  const cost = p.locator(`[data-product-cost="${PROD}"]`)
  const txt = (await cost.count()) ? flat(await cost.first().innerText()) : '(칸 없음)'
  ok(/원가 5,200원/.test(txt), `판 ${ver} — 관리자에게 원가가 그대로 보임`, txt)
  await ctx.close()
}

// ── 원가를 못 받는 계정은 0원이라고 하지 않는가 ─────────────────────────────
{
  const denied = []
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
  //  판 64 이면서 새 함수도 빈 값 — 「원가를 못 받는」 상태를 만듭니다
  wire(ctx, 64, 'admin', denied)
  //  ⚠ 나중에 건 route 가 이깁니다. wire 앞에 걸었더니 catch-all 이 이겨서
  //    이 검사가 아무것도 안 바꾼 채 통과할 뻔했습니다.
  await ctx.route('**/rest/v1/rpc/product_costs*', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  const { p } = await open(ctx, '/supplies')
  const tab = p.getByRole('button', { name: /^상품$/ })
  if (await tab.count()) { await tab.first().dispatchEvent('click'); await p.waitForTimeout(1200) }
  const cost = p.locator(`[data-product-cost="${PROD}"]`)
  const txt = (await cost.count()) ? flat(await cost.first().innerText()) : '(칸 없음)'
  //  ⚠ 0원이라고 적으면 「이익 100%」로 읽힙니다. 모르면 모른다고 해야 합니다.
  ok(/원가 미확인/.test(txt), '원가를 못 받으면 **0원이라고 하지 않고 「미확인」**', txt)
  ok(!/원가 0원/.test(txt), '「원가 0원」이라고 적지 않음', txt)
  await ctx.close()
}

// ── 「schema cache」 꼬리말이 없는 PGRST202 도 견디는가 ──────────────────────
//
//   PostgREST 는 없는 함수를 부르면 보통
//     「Could not find the function public.xxx() in the schema cache」
//   라고 답합니다. 그런데 서버 판에 따라 **꼬리말이 빠진** 문구가 옵니다.
//   그러면 soft() 가 못 알아보고 오류를 그대로 던져 **자료 읽기 전체가
//   실패**합니다 — 화면 한 칸이 비는 게 아니라 앱이 안 열립니다.
//   실제로 이 검사에서 그렇게 걸렸고, 그래서 코드에 문구를 더했습니다.
//   그 보강이 진짜로 무는지 여기서 잽니다.
{
  const denied = []
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
  wire(ctx, 63, 'admin', denied)
  await ctx.route('**/rest/v1/rpc/product_costs*', (r) =>
    r.fulfill({ status: 404, contentType: 'application/json',
      //  ⚠ 꼬리말(in the schema cache) 이 **없습니다.**
      body: JSON.stringify({ code: 'PGRST202', message: 'Could not find the function public.product_costs' }) }))
  const { p, errs } = await open(ctx, '/supplies')
  const t = flat(await p.textContent('body'))
  ok(!/문제가 생겼습니다/.test(t), '꼬리말 없는 PGRST202 에도 화면이 안 터짐')
  ok(errs.length === 0, '자바스크립트 오류 없음', errs.join(' · '))
  //  자료가 실제로 실린 것까지 봅니다 — 안 터졌는데 텅 비면 소용없습니다.
  ok(/합성수지 전용용기/.test(t), '**상품 목록이 그대로 실림** (읽기 전체가 실패하지 않음)')
  await ctx.close()
}

await b.close()
