import { chromium, EXEC } from './_pw.mjs'

//  0122 QA ② — 권한 있는 사용자가 사용 자재 수량을 고친다
//
//   확인하는 것
//    · 상세에 「사용 자재」 줄이 있고 규격별로 적힘 (「가져온 용기」·「주고 온 자재」와 다른 줄)
//    · 수정 → 규격별 줄에서 +1 → 사유 → 저장 → amend_collection **1회**
//    · 보낸 containers.usedItems 가 고친 값 · 4칸(손으로 적힌 값)은 그대로
//    · 공급(suppliedItems · supplied)은 **바뀌지 않음** → 재고 이중차감 0
//    · complete_collection 을 화면이 따로 부르지 않음 (이벤트 중복 0)
//    · 재고 미리보기(69 → …)가 뜨지 않음 — 사용량만 고친 것이라 재고가 안 움직임

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
//  손으로 적은 4칸(골판지 3 · 합성수지 2) + 규격별 사용량 63L 3개 · 20L 2개
const schedules = [{ id: 's1', client_id: C1, date: T, waste_type: '의료폐기물', scheduled_time: '09:00',
  status: '완료', vehicle_id: V3, expected_amount: 100, actual_amount: 120, actual_time: '10:20',
  driver_name: '김준기', memo: '3층 앞', handover_status: '인계 완료', event_id: EV, origin: 'field',
  containers: { corrugated: 3, plastic: 2, bag: 0, etc: 0, usedItems: { box63: 3, plastic20: 2 } }, completed_at: `${T}T01:30:00Z` }]
const events = [{ id: EV, at: `${T}T01:30:00Z`, actor_role: 'field', actor_name: '김준기', screen: '수거 입력', action: '수거 완료',
  schedule_id: 's1', created_schedule: false, client_id: C1, client_name: '한마음요양병원',
  waste_type: '의료폐기물', amount_kg: 120, before_state: { status: '예정', actualAmount: null, handoverStatus: null },
  material_ids: [MAT], stock_before: {}, request_updates: [], note: '3층 앞', reverted: false, reverted_at: null }]
const materials = [{ id: MAT, date: T, client_id: C1, box_count: 4, vinyl_count: 0, needle_box_count: 0,
  is_additional_request: false, memo: '수거 완료 시 동시공급', items: { box63: 4 } }]
const stockRow = { id: 1, corrugated_box: 69, plastic_container: 30, bag: 200, needle_box: 12 }

const b = await chromium.launch({ executablePath: EXEC })

async function open({ role = 'admin', path = '/history', w = 1280 } = {}) {
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
    if (url.includes('/rpc/app_schema_version')) return json(122)
    if (url.includes('/rpc/amend_collection')) {
      state.calls.push(['amend', JSON.parse(r.request().postData() ?? '{}')])
      return json({ eventId: 'newev', scheduleId: 's1' })
    }
    if (url.includes('/rpc/complete_collection')) {
      state.calls.push(['complete', JSON.parse(r.request().postData() ?? '{}')])
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
    if (url.includes('/experiment_settings')) return json(single ? { id: 1, start_date: T, pilot_client_ids: [C1] } : [{ id: 1, start_date: T, pilot_client_ids: [C1] }])
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

// ── ① 상세 — 사용 자재 줄 ───────────────────────────────────────────────────
{
  const { ctx, p, state } = await open()
  await p.locator('[data-history-row="s1"] td').first().click()
  await p.waitForTimeout(700)
  ok((await p.locator('[data-record]').count()) === 1, '① 줄을 누르면 상세가 열린다')
  const t = flat(await p.locator('[data-record]').innerText())
  ok(/가져온 용기/.test(t) && /주고 온 자재/.test(t) && /사용 자재/.test(t), '① 「가져온 용기」·「사용 자재」·「주고 온 자재」 세 줄이 따로 있음')
  const usedLine = flat(await p.locator('[data-record-used]').innerText())
  ok(/63L 박스 3개 · 20L 합성수지 2개/.test(usedLine), '① **사용 자재가 규격별로 적힘**', usedLine)
  ok(/골판지 전용박스 3/.test(t), '① 가져온 용기 4칸은 그대로 보임')
  ok(/63L 박스 4/.test(t) && /회사 재고에서 나갔습니다/.test(t), '① 주고 온 자재(공급)는 다른 줄에 「재고에서 나갔습니다」')

  // ── ② 수정 — 63L 3 → 4 ─────────────────────────────────────────────────
  await p.locator('[data-record-edit]').click()
  await p.waitForTimeout(500)
  const rows = await p.locator('[data-record-used-row]').count()
  ok(rows === 2, '② 값이 있는 규격 2줄만 펼침', `${rows}줄`)
  ok((await p.locator('[data-record-used-more]').count()) === 1, '② 「나머지 규격 보기」가 있음')
  ok(await p.locator('[data-record-save]').isDisabled(), '② 바꾼 것이 없으면 저장 못 함')
  await p.locator('[data-record-used-row="box63"]').getByRole('button', { name: '63L 박스 더하기' }).click()
  await p.waitForTimeout(300)
  ok(await p.locator('[data-record-save]').isDisabled(), '② **사유 없이는 저장 못 함** (기존 amend 정책 그대로)')
  const preview = flat(await p.locator('[data-record]').innerText())
  ok(!/69 → 6[0-9]/.test(preview), '② 재고 미리보기(69 → …)가 뜨지 않음 — 사용량은 재고를 움직이지 않음')
  await p.locator('[data-record-reason]').fill('병원 확인 후 63L 박스 1개 추가')
  await p.waitForTimeout(300)
  ok(!(await p.locator('[data-record-save]').isDisabled()), '② 사유를 적으면 저장할 수 있음')
  await p.locator('[data-record-save]').click()
  await p.waitForTimeout(1500)

  const amends = state.calls.filter((c) => c[0] === 'amend')
  const completes = state.calls.filter((c) => c[0] === 'complete')
  ok(amends.length === 1, '② **amend_collection 1회**', `${amends.length}회`)
  ok(completes.length === 0, '② 화면이 complete_collection 을 따로 부르지 않음 (이벤트 중복 0)', `${completes.length}회`)
  const sent = amends[0]?.[1] ?? {}
  ok(sent.p_event_id === EV && /63L 박스 1개 추가/.test(sent.p_reason ?? ''), '② 어느 기록을 왜 고치는지 함께 감')
  const c = sent.p?.containers ?? {}
  ok(JSON.stringify(c.usedItems) === JSON.stringify({ box63: 4, plastic20: 2 }), '② **usedItems 가 고친 값(63L 4 · 20L 2)**', JSON.stringify(c.usedItems))
  ok(c.corrugated === 3 && c.plastic === 2 && c.bag === 0 && c.etc === 0, '② 손으로 적힌 4칸은 덮어쓰지 않음', JSON.stringify(c))
  ok(JSON.stringify(sent.p?.suppliedItems) === JSON.stringify({ box63: 4 }), '② **공급(suppliedItems)은 그대로 63L 4** — 재고 이중차감 0', JSON.stringify(sent.p?.suppliedItems))
  ok(sent.p?.supplied?.corrugatedBox === 4 && sent.p?.supplied?.plasticContainer === 0, '② 재고 4칸 차감량도 그대로', JSON.stringify(sent.p?.supplied))
  ok(Number(sent.p?.actualAmount) === 120, '② 수거량은 안 건드렸으니 120 그대로')
  await ctx.close()
}

// ── ③ 현장 계정 — 고치는 길 없음 (권한 변경 0) ───────────────────────────────
{
  const { ctx, p } = await open({ role: 'field', path: `/clients/${C1}` })
  ok((await p.locator('[data-record-edit]').count()) === 0, '③ 현장 계정에는 「수정」 단추가 없음 (권한 그대로)')
  await ctx.close()
}

await b.close()
