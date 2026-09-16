import { chromium, EXEC } from './_pw.mjs'
import * as W from './walk_lib.mjs'
import * as F from './perf_fixtures.mjs'

//  0122 QA ① — 현장 로그인 → 오늘 일정 → Pilot 병원 → 수거 입력 → 자재 3종 → 저장
//
//   확인하는 것
//    · 저장 1회 (연타해도 1건) · 중복 0
//    · 규격별 사용량 3종이 containers.usedItems 로 **그대로** 저장됨
//    · 4칸(가져온 용기)을 손대지 않았으면 규격별 합계로 채워짐
//    · 「주고 온 자재(공급)」는 0 — 사용과 공급이 섞이지 않음 (재고 차감 0)
//    · 저장 뒤 화면에 「사용 자재 N개 기록」
//    · 거래처 상세 수거이력에 「사용 자재 - 63L 박스 2개 …」
//    · 오늘 일정에 PILOT 배지
//
//   ⚠ 기대값은 검사가 스스로 셉니다 — 시스템 값에 맞추지 않습니다.

const ok = (c, m, d = '') => { console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`); if (!c) process.exitCode = 1 }
const T = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
const C1 = F.clients[0].id
const json = (r, v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
const b = await chromium.launch({ executablePath: EXEC })

//  Pilot 병원 1곳 · 오늘 1건
const seed = () => [
  { id: 'today1', date: T, client_id: C1, waste_type: '의료폐기물', vehicle_id: null,
    scheduled_time: '09:00', status: '예정', expected_amount: 120, actual_amount: null, completed_at: null,
    memo: '', origin: 'system', canceled_at: null, is_additional: false,
    created_at: `${T}T00:00:00Z`, updated_at: `${T}T00:00:00Z` },
]

for (const [label, w, h] of [['폰 390px', 390, 844], ['PC 1440px', 1440, 900]]) {
  console.log(`\n── ${label} ───────────────────────────────────────────`)
  const saved = []
  const events = []
  const state = {
    reqs: 0, writes: [], profile: W.profileFor('field'), schedules: seed(),
    rpc: (url, req) => {
      if (url.includes('complete_collection')) {
        const q = JSON.parse(req.postData() ?? '{}')
        saved.push(q)
        const p = q.p ?? {}
        state.schedules = state.schedules.map((s) => s.id === 'today1'
          ? { ...s, status: '완료', actual_amount: Number(p.actualAmount ?? 0), actual_time: p.actualTime,
              completed_at: `${T}T06:00:00Z`, containers: p.containers, event_id: 'ev1', driver_name: '테스트기사',
              handover_status: p.handoverStatus } : s)
        events.push({ id: 'ev1', at: `${T}T06:00:00Z`, actor_id: F.UID, actor_name: '테스트기사', actor_role: 'field',
          screen: '수거 입력', action: '수거 완료', schedule_id: 'today1', created_schedule: false, client_id: C1,
          client_name: F.clients[0].name, waste_type: '의료폐기물', amount_kg: Number(p.actualAmount ?? 0),
          before_state: { status: '예정', actualAmount: null, handoverStatus: null }, material_ids: [], stock_before: {},
          request_updates: [], note: '', reverted: false, reverted_at: null, demo_session_id: null, input_duration_ms: 12000 })
        return { ok: true, scheduleId: 'today1', eventId: 'ev1', warnings: [] }
      }
      return null
    },
  }
  const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: w < 700, hasTouch: w < 700 })
  W.wire(ctx, state)
  //  ⚠ 나중에 등록한 길이 먼저 잡힙니다 — Pilot 설정과 이벤트만 덧댑니다.
  ctx.route('**/rest/v1/experiment_settings**', (r) => json(r, { id: 1, start_date: T, pilot_client_ids: [C1] }))
  ctx.route('**/rest/v1/collection_events**', (r) => json(r, events))
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: F.UID, aud: 'authenticated', email: state.profile.email, app_metadata: {}, user_metadata: {} }])
  await p.goto(`${W.BASE}/`, { waitUntil: 'domcontentloaded' })
  await W.settle(p, state, 800, 30000)

  // ── ① 오늘 일정 — PILOT 배지 ──────────────────────────────────────────────
  ok(new URL(p.url()).pathname === '/today', '① 로그인하면 오늘 일정으로', new URL(p.url()).pathname)
  const badge = await p.locator('[data-pilot-badge]').count()
  ok(badge >= 1, '① **Pilot 병원 줄에 PILOT 배지**', `${badge}개`)

  // ── ② 병원 → 수거 입력 ───────────────────────────────────────────────────
  const went = await p.evaluate(() => {
    const vis = (e) => e.getBoundingClientRect().height > 2
    const c = [...document.querySelectorAll('main button')].find((e) => vis(e) && /수거정보 입력/.test(e.innerText || ''))
    if (c) { c.click(); return 'PC 카드' }
    const a = [...document.querySelectorAll('[data-guide="guide-today-list"]')].filter(vis).find((e) => e.tagName === 'BUTTON')
    if (a) { a.click(); return '폰 목록 줄' }
    return null
  })
  ok(went !== null, '② 오늘 목록에서 병원을 누름', went ?? '')
  await p.waitForTimeout(3000)
  ok(new URL(p.url()).pathname === '/collection', '② 수거 입력으로 감', new URL(p.url()).pathname)

  // ── ③ 자재 사용량 구역 — 기본 접힘 · 공급과 다른 구역 ────────────────────
  const before = await p.evaluate(() => {
    const txt = document.querySelector('main')?.innerText ?? ''
    return {
      usedFold: !!document.querySelector('[data-fold="used"]') || !!document.querySelector('[data-collect-used]'),
      title: /이번 수거 자재 사용량/.test(txt),
      supplyTitle: /주고 온 자재/.test(txt),
      containerTitle: /가져온 용기/.test(txt),
    }
  })
  ok(before.usedFold && before.title, '③ **「이번 수거 자재 사용량」 구역이 있음**')
  ok(before.supplyTitle && before.containerTitle, '③ 기존 「가져온 용기」·「주고 온 자재」 구역이 그대로 있음')
  if (await p.locator('[data-fold="used"]').count()) {
    await p.locator('[data-fold="used"]').dispatchEvent('click')
    await p.waitForTimeout(500)
  }
  const U = p.locator('[data-collect-used]')
  const shown0 = await p.locator('[data-used-row]:not(.hidden)').count()
  ok(shown0 === 1, '③ 기록 없는 병원은 첫 줄 하나만 펼침 (나머지는 「보기」)', `${shown0}줄`)
  ok((await p.locator('[data-used-more]').count()) === 1, '③ 「나머지 규격 N개 보기」 단추가 있음')
  await p.locator('[data-used-more]').dispatchEvent('click')
  await p.waitForTimeout(400)
  const shown1 = await p.locator('[data-used-row]:not(.hidden)').count()
  ok(shown1 === 13, '③ 펼치면 Material Master 13종이 전부 보임 (하드코딩 없음)', `${shown1}줄`)

  // ── ④ 3종 입력 — + 두 번 · + 한 번 · 직접 숫자 ─────────────────────────────
  await p.fill('#collection-amount', '118')
  await U.getByRole('button', { name: '63L 박스 사용량 더하기' }).click()
  await U.getByRole('button', { name: '63L 박스 사용량 더하기' }).click()
  await U.getByRole('button', { name: '20L 합성수지 사용량 더하기' }).click()
  await U.getByLabel('12L 봉투형용기 사용량', { exact: true }).fill('5')
  await p.waitForTimeout(500)
  const review = await p.locator('[data-collect-review-used]').innerText().catch(() => '')
  ok(/8개/.test(review), '④ 저장 전 확인에 「사용 자재 8개」', review)
  //  공급 구역은 건드리지 않았습니다 — 0 이어야 합니다
  const supplyTxt = await p.evaluate(() => document.querySelector('[data-fold-summary="supply"]')?.textContent ?? document.querySelector('[data-tour="collect-supply"]')?.innerText ?? '')
  ok(!/점 드림/.test(supplyTxt), '④ **주고 온 자재는 그대로 0** (사용을 공급으로 세지 않음)', supplyTxt.slice(0, 30))

  // ── ⑤ 저장 연타 → 1건 ───────────────────────────────────────────────────
  const taps = await p.evaluate(async () => {
    const btn = document.querySelector('[data-collect-save]')
    if (!btn) return null
    const st = []
    for (let i = 0; i < 5; i += 1) { st.push(btn.disabled); btn.click(); await new Promise((r) => setTimeout(r, 40)) }
    return st
  })
  ok(taps !== null && taps[0] === false, '⑤ 저장 단추가 켜져 있음')
  await p.waitForTimeout(2800)
  ok(saved.length === 1, '⑤ **연타해도 저장은 한 번만 · 중복 0**', `${saved.length}건`)
  const q = saved[0]?.p ?? {}
  ok(Number(q.actualAmount) === 118, '⑤ 수거량 118kg 그대로', String(q.actualAmount))
  const used = q.containers?.usedItems ?? null
  ok(JSON.stringify(used) === JSON.stringify({ box63: 2, plastic20: 1, pouch12: 5 }),
    '⑤ **규격별 3종이 containers.usedItems 로 저장됨**', JSON.stringify(used))
  ok(q.containers?.corrugated === 2 && q.containers?.plastic === 1 && q.containers?.bag === 5 && q.containers?.etc === 0,
    '⑤ 4칸을 손대지 않았으니 규격별 합계로 채워짐 (골판지 2 · 합성수지 1 · 봉투 5)', JSON.stringify(q.containers))
  const supplied = q.supplied ?? {}
  ok(Object.values(supplied).every((n) => Number(n) === 0) && Object.keys(q.suppliedItems ?? {}).length === 0,
    '⑤ **공급(재고 차감) 0** — 사용량이 재고를 건드리지 않음', JSON.stringify({ supplied, suppliedItems: q.suppliedItems }))
  ok(q.clientId === C1 && q.scheduleId === 'today1', '⑤ 거래처·일정에 연결됨 (collection_id · customer_id)')

  // ── ⑥ 성공 화면 ─────────────────────────────────────────────────────────
  const doneTxt = await p.evaluate(() => (document.querySelector('main')?.innerText ?? '').replace(/\s+/g, ' '))
  ok(/반영되었습니다/.test(doneTxt), '⑥ 완료가 화면에 보임', doneTxt.slice(0, 40))
  ok((await p.locator('[data-collect-done-used]').count()) === 1 && /사용 자재 8개 기록/.test(doneTxt), '⑥ **「사용 자재 8개 기록」이 성공 화면에**')
  ok(/사용 자재 규격별 기록 · 거래처 수거이력 반영/.test(doneTxt), '⑥ 자동 연결 목록에 사용 자재 줄')

  // ── ⑦ 거래처 상세 — 수거이력에 규격별 사용 자재 ────────────────────────────
  await p.goto(`${W.BASE}/clients/${C1}`, { waitUntil: 'domcontentloaded' })
  await W.settle(p, state, 800, 30000)
  let hist = await p.locator('[data-history-used]').count()
  if (hist === 0) {
    //  탭 뒤에 있으면 탭을 누릅니다 — 이름을 바꾸지 않고 있는 것을 찾습니다
    const tab = p.locator('main button, main [role="tab"]').filter({ hasText: /수거 ?이력/ }).first()
    if (await tab.count()) { await tab.dispatchEvent('click'); await p.waitForTimeout(800) }
    hist = await p.locator('[data-history-used]').count()
  }
  const histTxt = hist ? await p.locator('[data-history-used]').first().innerText() : (await p.evaluate(() => document.querySelector('main')?.innerText ?? ''))
  ok(hist >= 1 && /사용 자재 - 63L 박스 2개 · 20L 합성수지 1개 · 12L 봉투형용기 5개/.test(histTxt),
    '⑦ **거래처 상세 수거이력에 「사용 자재 - 규격 …」**', histTxt.slice(0, 80))
  ok((await p.locator('[data-pilot-badge]').count()) >= 1, '⑦ 거래처 상세 헤더에 PILOT 배지')

  await ctx.close()
}

await b.close()
