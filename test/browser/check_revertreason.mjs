import { chromium, EXEC } from './_pw.mjs'

//  0088 → 0076 — 수거 완료 되돌리기에 **사유**를 남깁니다
//
//   ⚠ 되돌리기 창이 **수거기록 상세 시트 한 곳**으로 모였습니다(0074·0076).
//     예전에는 화면마다 따로 창을 띄웠고, 그러면 한쪽만 고쳐집니다.
//     이 검사도 그 시트를 밟습니다 — 창이 옮겨 갔을 뿐 봐야 할 것은 같습니다.
//
//   되돌리기 자체는 예전부터 됐습니다. 안 남는 것이 **이유**였습니다.
//   한 번에 자재·재고·요청·그 달 청구가 함께 되돌아가는데, 나중에
//   「이 날 왜 취소됐지」를 물으면 아무도 답을 못 했습니다.
//
//   ⚠ 예전 화면은 window.confirm 이라 **사유를 받을 자리가 아예 없었습니다.**
//   ⚠ 판 70 서버에는 저장할 자리가 없습니다 — 그때는 받는 척하지 않습니다.

const BASE = 'http://localhost:4173'
const ME = '00000000-0000-0000-0000-0000000000a9'
const C1 = '00000000-0000-0000-0000-0000000000a1'
const V3 = '00000000-0000-0000-0000-0000000000v3'
const EV = '00000000-0000-0000-0000-0000000000e1'
const ok = (c, m, d = '') => { console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`); if (!c) process.exitCode = 1 }
const flat = (t) => (t ?? '').replace(/\s+/g, ' ').trim()
const T = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })

const clients = [{ id: C1, name: '한마음요양병원', type: '요양병원', address: '경기도', manager: '김',
  phone: '031', collection_cycle: '주 3회', collects_medical_waste: true, collects_diaper: true,
  storage_size: '보통', note: '', is_demo_generated: false, active: true, pricing: {},
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }]
const vehicles = [{ id: V3, name: '3호차', waste_type: '의료폐기물', tonnage: 1, nominal_capacity: 1000,
  expected_capacity: 800, driver: '박기사', active: true }]
const schedules = [{ id: 's1', client_id: C1, date: T, waste_type: '의료폐기물', scheduled_time: '09:00',
  status: '완료', vehicle_id: V3, expected_amount: 100, actual_amount: 120, memo: '', event_id: EV }]
const events = [{ id: EV, at: `${T}T00:10:00Z`, actor_role: 'field', screen: '수거 입력', action: '완료',
  schedule_id: 's1', created_schedule: false, client_id: C1, client_name: '한마음요양병원',
  waste_type: '의료폐기물', amount_kg: 120, before_state: { status: '예정', actualAmount: null, handoverStatus: null },
  material_ids: [], stock_before: {}, request_updates: [], note: '', reverted: false, reverted_at: null }]

const b = await chromium.launch({ executablePath: EXEC })

async function open(ver) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } })
  const me = { id: ME, email: 'a@b.c', name: '관리자', role: 'admin', font_scale: 'normal', active: true,
    approved_at: '2026-01-01T00:00:00Z', client_id: null, vehicle_id: null, created_at: '2026-01-01T00:00:00Z' }
  const state = { calls: [] }
  ctx.route('**/auth/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: ME, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }) }))
  ctx.route('**/rest/v1/**', (r) => {
    const url = r.request().url()
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    if (url.includes('/rpc/app_schema_version')) return json(ver)
    if (url.includes('/rpc/revert_collection_with_reason')) {
      state.calls.push(['reason', JSON.parse(r.request().postData() ?? '{}')])
      return json({ ok: true })
    }
    if (url.includes('/rpc/revert_collection')) {
      state.calls.push(['plain', JSON.parse(r.request().postData() ?? '{}')])
      return json({ ok: true })
    }
    if (url.includes('/rpc/')) return json(null)
    if (url.includes('/profiles')) return json(single ? me : [me])
    if (url.includes('/clients')) return json(single ? clients[0] : clients)
    if (url.includes('/collection_events')) return json(events)
    if (url.includes('/vehicles')) return json(single ? vehicles[0] : vehicles)
    if (url.includes('/schedules')) return json(schedules)
    if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
    return json([])
  })
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: ME, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }])
  await p.goto(`${BASE}/history`, { waitUntil: 'domcontentloaded' })
  await p.waitForFunction(() => {
    const t = document.querySelector('main')?.innerText ?? ''
    return t.length > 20 && !/불러오는 중/.test(t)
  }, null, { timeout: 40000 }).catch(() => {})
  await p.waitForTimeout(1200)
  return { ctx, p, state }
}

// ── ① 판 73 — 사유 없이는 못 되돌립니다 ────────────────────────────────────
{
  const { ctx, p, state } = await open(73)
  ok((await p.locator('[data-history-open="s1"]').count()) === 1, '보기·수정 자리가 있음')
  //  줄 아무 데나 눌러 상세를 열고, 거기서 「기록 취소」로 들어갑니다.
  await p.locator('[data-history-row="s1"] td').first().click()
  await p.waitForTimeout(700)
  await p.locator('[data-record-revert]').click()
  await p.waitForTimeout(600)

  //  ⚠ 예전에는 window.confirm 이라 여기 자체가 없었습니다.
  ok((await p.locator('[data-revert-reason]').count()) === 1, '**사유 적는 자리가 있음**')
  const label = flat(await p.locator('[data-record-client]').textContent())
  ok(/한마음요양병원/.test(label), '무엇을 되돌리는지 사람 말로 적혀 있음', label)

  const body = flat(await p.locator('[data-record]').innerText())
  ok(/지우는 것은 아닙니다|취소됨/.test(body), '**지우는 게 아니라는 것을 적어 줌**', body.slice(0, 80))
  //  ⚠ 예전 화면은 「확정한 청구가 있으면 서버가 막습니다」라고 적어 두었지만
  //    실제로 막는 자리가 없었습니다. 0073 에서 막는 자리를 만들었으니 이제
  //    적습니다 — **판 73 일 때만** (아래 ② 에서 다시 확인합니다).
  ok((await p.locator('[data-revert-billguard]').count()) === 1,
    '확정한 청구는 막힌다고 알려 줌 (판 73)')

  ok(await p.locator('[data-record-revert-go]').isDisabled(), '**사유가 비면 되돌릴 수 없음**')
  await p.locator('[data-record-revert-go]').dispatchEvent('click')
  await p.waitForTimeout(700)
  ok(state.calls.length === 0, '사유 없이 누른 것은 서버로 가지 않음', JSON.stringify(state.calls))

  //  자주 쓰는 이유는 단추로 — 폰에서 한 손으로 글자를 치는 일은 잘 안 합니다.
  const quick = p.locator('[data-revert-quick] button').first()
  ok((await p.locator('[data-revert-quick] button').count()) >= 3, '자주 쓰는 이유가 단추로 있음')
  await quick.dispatchEvent('click')
  await p.waitForTimeout(300)
  const filled = await p.locator('[data-revert-reason]').inputValue()
  ok(filled.length > 0, '단추를 누르면 사유 칸이 채워짐', filled)

  ok(!(await p.locator('[data-record-revert-go]').isDisabled()), '사유가 있으면 되돌릴 수 있음')
  await p.locator('[data-record-revert-go]').dispatchEvent('click')
  await p.waitForTimeout(1500)
  const sent = state.calls.find(([k]) => k === 'reason')
  ok(!!sent, '**사유와 함께 서버로 감**', JSON.stringify(state.calls))
  ok(sent?.[1]?.p_event_id === EV, '그 수거 기록으로 감', String(sent?.[1]?.p_event_id))
  ok(sent?.[1]?.p_reason === filled, '적은 사유가 **그대로** 감', String(sent?.[1]?.p_reason))
  ok(!state.calls.find(([k]) => k === 'plain'), '사유 없는 옛 함수는 부르지 않음')
  await ctx.close()
}

// ── ② 판 70 — 받는 척하지 않습니다 ─────────────────────────────────────────
//   저장할 자리가 없는 서버에서 사유를 받아 두면 그대로 버려집니다.
//   「적었는데 안 남았다」가 제일 나쁩니다.
{
  const { ctx, p, state } = await open(70)
  await p.locator('[data-history-row="s1"] td').first().click()
  await p.waitForTimeout(700)
  await p.locator('[data-record-revert]').click()
  await p.waitForTimeout(600)
  ok((await p.locator('[data-revert-reason]').count()) === 0,
    '**판 70 에서는 사유 칸을 안 보여 줌** (저장할 자리가 없습니다)')
  ok((await p.locator('[data-revert-billguard]').count()) === 0,
    '**없는 보호장치를 있다고 적지 않음** (판 70 에는 막는 자리가 없습니다)')
  ok(!(await p.locator('[data-record-revert-go]').isDisabled()), '그래도 되돌리기는 됩니다')
  await p.locator('[data-record-revert-go]').dispatchEvent('click')
  await p.waitForTimeout(1500)
  ok(!!state.calls.find(([k]) => k === 'plain'), '옛 함수로 그대로 감 (배포 순서가 어긋나도 안 멎음)',
    JSON.stringify(state.calls))
  await ctx.close()
}

await b.close()
