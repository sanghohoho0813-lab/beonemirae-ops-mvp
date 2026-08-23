import { chromium, EXEC } from './_pw.mjs'

//  0074 — 재고가 왜 이 숫자인지 보이고, 실수를 바로잡는다
//
//   대표님 말씀: 「단순히 현재재고 숫자를 몰래 덮어쓰는 방식보다, 최근 재고
//   변동이력에서 무엇 때문에 숫자가 바뀌었는지 확인하고 정정할 수 있는 구조」.
//
//   ⚠ material_transactions 는 지금까지 **쓰기만 하고 한 번도 읽지 않았습니다.**
//     그래서 「입고 +11 · 더원 공급 −4 · 입고오류 정정 −1」을 볼 화면이
//     아예 없었습니다.
//
//   확인하는 것
//    · 최근 변동이 이유와 함께 보인다 (입고 / 공급 / 조정)
//    · 바로잡기 — 이유 없이는 못 누른다
//    · −1 을 넣으면 「69 → 68」이 **미리** 보인다
//    · 있는 것보다 많이 빼려 하면 화면이 먼저 말해 준다
//    · 서버로 갈 때 품목·수량·사유가 그대로 간다
//    · 판 73 이하에서는 바로잡기 단추가 없다
//    · 현장 계정에는 아예 안 보인다

const BASE = 'http://localhost:4173'
const ME = '00000000-0000-0000-0000-0000000000a9'
const C1 = '00000000-0000-0000-0000-0000000000a1'
const ok = (c, m, d = '') => { console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`); if (!c) process.exitCode = 1 }
const flat = (t) => (t ?? '').replace(/\s+/g, ' ').trim()
const T = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })

const clients = [{ id: C1, name: '더원요양병원', type: '요양병원', address: '경기도', manager: '김',
  phone: '031', collection_cycle: '주 3회', collects_medical_waste: true, collects_diaper: true,
  storage_size: '보통', note: '', is_demo_generated: false, active: true, pricing: {},
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }]
const stockRow = { id: 1, corrugated_box: 69, plastic_container: 30, bag: 200, needle_box: 12 }
//  대표님이 예로 드신 그 세 줄입니다.
const moves = [
  { id: 't3', created_at: `${T}T05:00:00Z`, kind: '조정', item: 'corrugatedBox', qty: -1, memo: '입고 오류 정정 (11개로 잘못 적음)', clients: null },
  { id: 't2', created_at: `${T}T03:00:00Z`, kind: '공급', item: 'corrugatedBox', qty: -4, memo: '수거 완료 시 동시공급', clients: { name: '더원요양병원' } },
  { id: 't1', created_at: `${T}T01:00:00Z`, kind: '입고', item: 'corrugatedBox', qty: 11, memo: '3월 정기 입고', clients: null },
]

const b = await chromium.launch({ executablePath: EXEC })

async function open(ver, { role = 'admin', w = 1280 } = {}) {
  const ctx = await b.newContext({ viewport: { width: w, height: 1000 }, isMobile: w < 700, hasTouch: w < 700 })
  const me = { id: ME, email: 'a@b.c', name: '관리자', role, font_scale: 'normal', active: true,
    approved_at: '2026-01-01T00:00:00Z', client_id: null, vehicle_id: null, created_at: '2026-01-01T00:00:00Z' }
  const state = { calls: [] }
  ctx.route('**/auth/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: ME, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }) }))
  ctx.route('**/rest/v1/**', (r) => {
    const url = r.request().url()
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    if (url.includes('/rpc/app_schema_version')) return json(ver)
    if (url.includes('/rpc/correct_stock')) {
      state.calls.push(['fix', JSON.parse(r.request().postData() ?? '{}')])
      return json({ item: 'corrugatedBox', before: 69, after: 68 })
    }
    if (url.includes('/rpc/')) return json(null)
    if (url.includes('/material_transactions')) return json(moves)
    if (url.includes('/profiles')) return json(single ? me : [me])
    if (url.includes('/clients')) return json(single ? clients[0] : clients)
    if (url.includes('/office_stock')) return json(single ? stockRow : [stockRow])
    return json([])
  })
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: ME, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }])
  await p.goto(`${BASE}/materials`, { waitUntil: 'domcontentloaded' })
  await p.waitForFunction(() => {
    const t = document.querySelector('main')?.innerText ?? ''
    return t.length > 20 && !/불러오는 중/.test(t)
  }, null, { timeout: 40000 }).catch(() => {})
  await p.waitForTimeout(1400)
  return { ctx, p, state }
}

// ── ① 왜 이 숫자인지 보인다 ────────────────────────────────────────────────
{
  const { ctx, p } = await open(74)
  ok((await p.locator('[data-stock-ledger]').count()) === 1, '**자재 화면에 「최근 재고 변동」이 있다**')
  const t = flat(await p.locator('[data-stock-ledger]').innerText())
  ok(/입고/.test(t) && /\+11/.test(t), '입고 +11 이 보임', t.slice(0, 90))
  ok(/공급/.test(t) && /-4/.test(t), '공급 −4 가 보임')
  ok(/더원요양병원/.test(t), '**어느 병원에 나갔는지도 보임**')
  ok(/조정/.test(t) && /입고 오류 정정/.test(t), '**정정한 줄에 이유가 그대로 남아 있음**')
  ok((await p.locator('[data-stock-move]').count()) === 3, '세 줄 다 보임')
  await ctx.close()
}

// ── ② 바로잡기 ─────────────────────────────────────────────────────────────
{
  const { ctx, p, state } = await open(74)
  await p.locator('[data-stock-fix-open]').click()
  await p.waitForTimeout(600)
  ok((await p.locator('[data-stock-fix-qty]').count()) === 1, '바로잡는 칸이 열림')
  ok(await p.locator('[data-stock-fix-go]').isDisabled(), '아무것도 안 넣으면 못 누름')

  await p.locator('[data-stock-fix-qty]').fill('-1')
  await p.waitForTimeout(400)
  ok(await p.locator('[data-stock-fix-go]').isDisabled(), '**이유 없이는 못 누름**')
  //  ⚠ 「−1 을 넣으면 몇 개가 되지」를 머릿속으로 계산하게 하지 않습니다.
  const prev = flat(await p.locator('[data-stock-fix-preview]').innerText())
  ok(/69/.test(prev) && /68/.test(prev), '**69 → 68 이 미리 보인다**', prev)

  await p.locator('[data-stock-fix-reason]').fill('입고 수량을 잘못 적었습니다')
  await p.waitForTimeout(300)
  ok(!(await p.locator('[data-stock-fix-go]').isDisabled()), '이유를 적으면 누를 수 있음')

  await p.locator('[data-stock-fix-go]').click()
  await p.waitForTimeout(1600)
  const sent = state.calls.find(([k]) => k === 'fix')
  ok(!!sent, '**서버로 감**', JSON.stringify(state.calls).slice(0, 60))
  ok(sent?.[1]?.p_item === 'corrugatedBox', '품목이 그대로', String(sent?.[1]?.p_item))
  ok(sent?.[1]?.p_qty === -1, '수량이 그대로', String(sent?.[1]?.p_qty))
  ok(sent?.[1]?.p_reason === '입고 수량을 잘못 적었습니다', '이유가 그대로', String(sent?.[1]?.p_reason))
  await ctx.close()
}

// ── ③ 있는 것보다 많이 빼려 하면 ───────────────────────────────────────────
{
  const { ctx, p, state } = await open(74)
  await p.locator('[data-stock-fix-open]').click()
  await p.waitForTimeout(600)
  await p.locator('[data-stock-fix-qty]').fill('-999')
  await p.locator('[data-stock-fix-reason]').fill('세어 보니 달랐습니다')
  await p.waitForTimeout(400)
  const prev = flat(await p.locator('[data-stock-fix-preview]').innerText())
  ok(/뺄 수 없습니다/.test(prev), '**화면이 먼저 말해 준다** (서버까지 갈 것도 없이)', prev.slice(0, 70))
  //  ⚠ 말만 해 주고 단추는 열어 두면, 눌러 보고 나서 서버 오류를 또 읽게
  //    됩니다. 한 번에 끝냅니다 — 못 누르게 합니다. (서버도 막습니다: db_amend74 ㉟)
  ok(await p.locator('[data-stock-fix-go]').isDisabled(), '**그 상태로는 누를 수도 없다**')
  ok(state.calls.length === 0, '서버로 안 감')
  await ctx.close()
}

// ── ④ 판 73 이하 · 현장 계정 ───────────────────────────────────────────────
{
  const { ctx, p } = await open(73)
  ok((await p.locator('[data-stock-ledger]').count()) === 1, '판 73 에서도 변동은 보인다 (읽는 것은 막지 않음)')
  ok((await p.locator('[data-stock-fix-open]').count()) === 0,
    '**판 73 에서는 바로잡기 단추가 없다** (서버에 그 함수가 없습니다)')
  await ctx.close()
}
{
  const { ctx, p } = await open(74, { role: 'field', w: 390 })
  //  현장 계정에는 자재 화면 자체가 안 열립니다 — 사무실 재고는 사무실 일입니다.
  ok((await p.locator('[data-stock-ledger]').count()) === 0, '현장 계정에는 사무실 재고가 안 보임')
  await ctx.close()
}

// ── ⑤ 폰에서도 읽힌다 ──────────────────────────────────────────────────────
{
  const { ctx, p } = await open(74, { w: 390 })
  const box = await p.locator('[data-stock-ledger]').boundingBox()
  ok((box?.width ?? 999) <= 390, '폰에서 가로로 안 밀림', `${Math.round(box?.width ?? 0)}px`)
  const btn = await p.locator('[data-stock-fix-open]').boundingBox()
  ok((btn?.height ?? 0) >= 40, '바로잡기 단추가 손가락 크기', `${Math.round(btn?.height ?? 0)}px`)
  await ctx.close()
}

await b.close()
