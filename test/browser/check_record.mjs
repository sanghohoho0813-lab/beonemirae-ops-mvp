import { chromium, EXEC } from './_pw.mjs'

//  0074 — 수거기록을 **눌러서** 고치고 취소한다
//
//   대표님 말씀: 「되돌리기처럼 의미가 애매한 작은 버튼을 찾아야 하는
//   구조보다, 수거기록 자체를 누르면 상세를 보고 바로 수정 / 기록 취소」.
//
//   확인하는 것
//    · 수거이력에서 **줄 아무 데나** 눌러도 상세가 열린다
//    · 상세에 수거량·기사·용기·주고 온 자재가 다 보인다
//    · 「용기(가져온 것)」와 「자재(주고 온 것)」가 **다른 줄**에 있다
//    · 수정 → 사유 없이는 저장 못 함 → 사유 넣으면 amend 가 서버로 감
//    · 고칠 때 재고가 어떻게 되는지 **미리** 보인다 (69 → 65)
//    · 기록 취소는 사유를 받는다
//    · 대표 화면(오늘 현장 현황)에서도 바로 열린다
//    · 판 73 이하에서는 고치는 단추가 안 뜬다
//    · 현장 계정에는 고치는 길이 없다

const BASE = 'http://localhost:4173'
const ME = '00000000-0000-0000-0000-0000000000a9'
const C1 = '00000000-0000-0000-0000-0000000000a1'
const V3 = '00000000-0000-0000-0000-0000000000v3'
const EV = '00000000-0000-0000-0000-0000000000e1'
const MAT = '00000000-0000-0000-0000-0000000000m1'
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
  status: '완료', vehicle_id: V3, expected_amount: 100, actual_amount: 120, actual_time: '10:20',
  driver_name: '김준기', memo: '3층 앞', handover_status: '인계 완료', event_id: EV,
  containers: { corrugated: 3, plastic: 2, bag: 0, etc: 0 }, completed_at: `${T}T01:30:00Z` }]
const events = [{ id: EV, at: `${T}T01:30:00Z`, actor_role: 'field', screen: '수거 입력', action: '수거 완료',
  schedule_id: 's1', created_schedule: false, client_id: C1, client_name: '한마음요양병원',
  waste_type: '의료폐기물', amount_kg: 120, before_state: { status: '예정', actualAmount: null, handoverStatus: null },
  material_ids: [MAT], stock_before: {}, request_updates: [], note: '3층 앞', reverted: false, reverted_at: null }]
const materials = [{ id: MAT, date: T, client_id: C1, box_count: 4, vinyl_count: 0, needle_box_count: 0,
  is_additional_request: false, memo: '수거 완료 시 동시공급', items: { box63: 4 } }]
//  창고에 69개 — 「69 → 65」가 화면에 그대로 나와야 합니다.
const stockRow = { id: 1, corrugated_box: 69, plastic_container: 30, bag: 200, needle_box: 12 }

const b = await chromium.launch({ executablePath: EXEC })

async function open(ver, { role = 'admin', path = '/history', w = 1280 } = {}) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 }, isMobile: w < 700, hasTouch: w < 700 })
  const me = { id: ME, email: 'a@b.c', name: '관리자', role, font_scale: 'normal', active: true,
    approved_at: '2026-01-01T00:00:00Z', client_id: null, vehicle_id: V3, created_at: '2026-01-01T00:00:00Z' }
  const state = { calls: [] }
  ctx.route('**/auth/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: ME, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }) }))
  ctx.route('**/rest/v1/**', (r) => {
    const url = r.request().url()
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    if (url.includes('/rpc/app_schema_version')) return json(ver)
    if (url.includes('/rpc/amend_collection')) {
      state.calls.push(['amend', JSON.parse(r.request().postData() ?? '{}')])
      return json({ eventId: 'newev', scheduleId: 's1' })
    }
    if (url.includes('/rpc/revert_collection_with_reason')) {
      state.calls.push(['revert', JSON.parse(r.request().postData() ?? '{}')])
      return json({ ok: true })
    }
    if (url.includes('/rpc/')) return json(null)
    if (url.includes('/material_transactions')) return json([])
    if (url.includes('/profiles')) return json(single ? me : [me])
    if (url.includes('/clients')) return json(single ? clients[0] : clients)
    if (url.includes('/collection_events')) return json(events)
    if (url.includes('/materials')) return json(materials)
    if (url.includes('/vehicles')) return json(single ? vehicles[0] : vehicles)
    if (url.includes('/schedules')) return json(schedules)
    if (url.includes('/office_stock')) return json(single ? stockRow : [stockRow])
    return json([])
  })
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: ME, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }])
  await p.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await p.waitForFunction(() => {
    const t = document.querySelector('main')?.innerText ?? ''
    return t.length > 20 && !/불러오는 중/.test(t)
  }, null, { timeout: 40000 }).catch(() => {})
  await p.waitForTimeout(1200)
  return { ctx, p, state }
}

// ── ① 줄을 누르면 상세가 열린다 ────────────────────────────────────────────
{
  const { ctx, p } = await open(74)
  //  ⚠ 오른쪽 끝의 작은 글자를 찾아 누르는 것이 아니라 **줄 아무 데나**.
  await p.locator('[data-history-row="s1"] td').first().click()
  await p.waitForTimeout(700)
  ok((await p.locator('[data-record]').count()) === 1, '**줄을 누르면 상세가 열린다**')

  const t = flat(await p.locator('[data-record]').innerText())
  ok(/한마음요양병원/.test(t), '어느 병원인지', t.slice(0, 40))
  ok(/120kg/.test(t), '수거량', t.slice(0, 80))
  ok(/김준기/.test(t), '누가 갔는지')
  ok(/3호차/.test(t), '어느 차로')
  //  ⚠ 이 둘이 섞이면 재고가 틀립니다 — 다른 줄에 다른 이름으로 있어야 합니다.
  ok(/가져온 용기/.test(t) && /주고 온 자재/.test(t), '**「가져온 용기」와 「주고 온 자재」가 따로 있음**')
  ok(/골판지 전용박스 3/.test(t), '가져온 용기 수량이 보임', t.slice(t.indexOf('가져온'), t.indexOf('가져온') + 50))
  ok(/회사 재고에서 나갔습니다/.test(t), '자재는 재고에서 나간 것이라고 적힘')

  ok((await p.locator('[data-record-edit]').count()) === 1, '여기서 바로 「수정」 할 수 있음')
  ok((await p.locator('[data-record-revert]').count()) === 1, '여기서 바로 「기록 취소」 할 수 있음')
  await ctx.close()
}

// ── ② 고치기 ───────────────────────────────────────────────────────────────
{
  const { ctx, p, state } = await open(74)
  await p.locator('[data-history-row="s1"] td').first().click()
  await p.waitForTimeout(600)
  await p.locator('[data-record-edit]').click()
  await p.waitForTimeout(500)

  ok((await p.locator('[data-record-amount-input]').count()) === 1, '수거량을 고칠 칸이 있음')
  ok((await p.locator('[data-record-waste="일회용기저귀"]').count()) === 1, '구분도 고칠 수 있음')

  //  아무것도 안 바꿨으면 못 누릅니다.
  ok(await p.locator('[data-record-save]').isDisabled(), '바꾼 것이 없으면 저장 못 함')

  await p.locator('[data-record-amount-input]').fill('320')
  await p.waitForTimeout(300)
  ok(await p.locator('[data-record-save]').isDisabled(), '**사유 없이는 저장 못 함**')

  //  ⚠ 재고가 어떻게 되는지 미리 보여야 합니다 — 고친 뒤 자재 화면을 따로
  //    열어 확인하게 하지 않습니다.
  const prev = flat(await p.locator('[data-record-stock-preview]').innerText())
  ok(/69/.test(prev), '**지금 재고가 보임 (69)**', prev.slice(0, 60))

  await p.locator('[data-record-reason]').fill('기사님이 자릿수를 잘못 눌렀습니다')
  await p.waitForTimeout(300)
  ok(!(await p.locator('[data-record-save]').isDisabled()), '사유를 적으면 저장할 수 있음')

  await p.locator('[data-record-save]').click()
  await p.waitForTimeout(1600)
  const sent = state.calls.find(([k]) => k === 'amend')
  ok(!!sent, '**고치기가 서버로 감**', JSON.stringify(state.calls).slice(0, 60))
  ok(sent?.[1]?.p_event_id === EV, '그 기록으로 감', String(sent?.[1]?.p_event_id))
  ok(sent?.[1]?.p_reason === '기사님이 자릿수를 잘못 눌렀습니다', '사유가 그대로 감', String(sent?.[1]?.p_reason))
  ok(sent?.[1]?.p?.actualAmount === 320, '고친 수거량이 그대로 감', String(sent?.[1]?.p?.actualAmount))
  //  ⚠ 안 건드린 자재는 원래 값 그대로 가야 합니다 — 아니면 재고가 틀어집니다.
  ok(sent?.[1]?.p?.suppliedItems?.box63 === 4, '안 건드린 자재는 원래 값 그대로', JSON.stringify(sent?.[1]?.p?.suppliedItems))
  await ctx.close()
}

// ── ③ 자재를 줄이면 재고가 돌아온다고 미리 보여 준다 ───────────────────────
{
  const { ctx, p } = await open(74)
  await p.locator('[data-history-row="s1"] td').first().click()
  await p.waitForTimeout(600)
  await p.locator('[data-record-edit]').click()
  await p.waitForTimeout(500)
  //  63L 박스 4 → 0 으로
  await p.locator('[data-record-supply-item="box63"] input[type="number"]').fill('0')
  await p.waitForTimeout(500)
  const prev = flat(await p.locator('[data-record-stock-preview]').innerText())
  ok(/돌아옴/.test(prev), '**자재를 줄이면 재고가 돌아온다고 적힘**', prev.slice(0, 70))
  ok(/73/.test(prev), '69 → 73 으로 미리 보임', prev.slice(0, 70))
  await ctx.close()
}

// ── ④ 기록 취소도 여기서 ───────────────────────────────────────────────────
{
  const { ctx, p, state } = await open(74)
  await p.locator('[data-history-row="s1"] td').first().click()
  await p.waitForTimeout(600)
  await p.locator('[data-record-revert]').click()
  await p.waitForTimeout(600)
  //  ⚠ 창 안에서 다른 창을 열면 앞 창이 곧바로 닫힙니다(뒤로 가기 연동).
  //    그래서 **같은 창 안에서 단계만** 바뀝니다 — 여기가 그 확인입니다.
  ok((await p.locator('[data-record]').count()) === 1, '**창이 사라지지 않고 같은 창에서 단계가 바뀐다**')
  ok((await p.locator('[data-revert-reason]').count()) === 1, '취소도 사유를 받는다')
  ok(await p.locator('[data-record-revert-go]').isDisabled(), '사유 없이는 취소 못 함')
  await p.locator('[data-revert-quick] button').first().click()
  await p.waitForTimeout(300)
  await p.locator('[data-record-revert-go]').click()
  await p.waitForTimeout(1600)
  const sent = state.calls.find(([k]) => k === 'revert')
  ok(!!sent, '**취소가 사유와 함께 서버로 감**', JSON.stringify(state.calls).slice(0, 60))
  ok(String(sent?.[1]?.p_reason ?? '').length > 0, '사유가 비어 있지 않음', String(sent?.[1]?.p_reason))
  await ctx.close()
}

// ── ⑤ 대표 화면에서도 바로 열린다 ──────────────────────────────────────────
{
  const { ctx, p } = await open(74, { path: '/' })
  const btn = p.locator(`[data-field-input-edit="${C1}"]`)
  ok((await btn.count()) === 1, '**오늘 현장 현황에서 바로 「보기·수정」**')
  await btn.click()
  await p.waitForTimeout(800)
  ok((await p.locator('[data-record]').count()) === 1, '거기서 상세가 열림 — 수거이력으로 나가지 않아도 됨')
  await ctx.close()
}

// ── ⑥ 판 73 이하 · 현장 계정 ───────────────────────────────────────────────
{
  const { ctx, p } = await open(73)
  await p.locator('[data-history-row="s1"] td').first().click()
  await p.waitForTimeout(700)
  ok((await p.locator('[data-record]').count()) === 1, '판 73 에서도 상세는 보인다 (읽는 것은 막지 않음)')
  ok((await p.locator('[data-record-edit]').count()) === 0,
    '**판 73 에서는 고치는 단추가 없다** (서버에 그 함수가 없습니다)')
  await ctx.close()
}
{
  const { ctx, p } = await open(74, { role: 'field', path: '/today', w: 390 })
  //  현장 계정에는 수거이력 자체가 안 열립니다 — 오늘 일정에서 확인합니다.
  ok((await p.locator('[data-record-edit]').count()) === 0, '현장 계정 화면에는 고치는 길이 없음')
  await ctx.close()
}

await b.close()
