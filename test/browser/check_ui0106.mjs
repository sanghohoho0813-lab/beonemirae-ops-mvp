import { chromium, EXEC } from './_pw.mjs'
import * as W from './walk_lib.mjs'
import * as F from './perf_fixtures.mjs'

// ─────────────────────────────────────────────────────────────────────────────
//  0106 — 화면이 사실만 말하는가
//
//   ① 배차: 지어낸 차량 상태(정비·검사 예정)가 없다 · 규칙 기반·AI 아님 · 결정 기록은 판 106 에서만
//   ② 오늘 업무 마감: 운행 기록(계기판·대기)은 판 106 에서만 · 값이 서버 호출에 실린다
//   ③ 첫 화면: 「오늘 엑셀·카톡에 다시 적은 것」 한 줄 — 답하면 사라진다
//   ④ 성과: 측정값만/측정 완료 구분 · 변화 기록이 없으면 「모름」· 있으면 「없음」
//   ⑤ 실증 준비 상태: 두 묶음 · 원본 미확인 · 확인 서류 목록
//   ⑥ 고객 요청: 상태·회신 저장 결과가 그 자리에 보인다 · AI 정리는 판 106 에서만
//   ⑦ 설정: 운영 변화 기록 · 도입 후 조사값 카드가 판에 따라 게이트된다
//   ⑧ 메뉴 이름
// ─────────────────────────────────────────────────────────────────────────────

let pass = 0
let fail = 0
const ok = (name, cond, detail = '') => {
  if (cond) pass += 1
  else fail += 1
  console.log(`${cond ? ' OK ' : 'FAIL'} | ${name}${detail && !cond ? ` — ${detail}` : ''}`)
}
const flat = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const b = await chromium.launch({ executablePath: EXEC })
const TODAY = F.TODAY
const C0 = F.clients[0].id

const TODAY_S = [{ id: 'sx', date: TODAY, client_id: C0, waste_type: '의료폐기물', vehicle_id: 'v1', scheduled_time: '10:00',
  status: '예정', expected_amount: 80, actual_amount: null, completed_at: null, memo: '', origin: 'field', is_additional: false,
  demo_session_id: null, plan_batch: null, handover_status: null, driver_name: '1호기사',
  created_at: `${TODAY}T00:00:00Z`, updated_at: `${TODAY}T00:00:00Z` }]

const EVENTS = Array.from({ length: 12 }, (_, i) => ({
  id: `ev${i}`, at: `${TODAY}T0${(i % 9) + 1}:00:00Z`, actor_role: 'field', screen: '수거 입력', action: '수거 완료',
  schedule_id: `s${i}`, created_schedule: false, client_id: C0, client_name: F.clients[0].name, waste_type: '의료폐기물',
  amount_kg: 50, demo_session_id: null, duration_ms: 90000, input_duration_ms: 90000, reverted: false, reverted_at: null,
  material_ids: [], request_updates: [], before_state: {}, stock_before: {}, note: '',
}))

const REQ = [{ id: 'rq1', client_id: C0, kind: '추가수거', content: '3층 창고가 거의 다 찼습니다. 한 번 더 와 주세요.', status: '접수',
  desired_date: null, urgent: false, source: 'portal', requester_name: '원무과', created_at: `${TODAY}T01:00:00Z`,
  updated_at: `${TODAY}T01:00:00Z`, demo_session_id: null, snoozed_until: null, snoozed_by_name: '', reply: '', handled_at: null, handled_by: null }]

const MISSING_TABLE = (name) => ({ status: 404, contentType: 'application/json',
  body: JSON.stringify({ code: 'PGRST205', message: `Could not find the table 'public.${name}' in the schema cache`, hint: null, details: null }) })

async function open(role, path, { schema = 87, width = 1440, schedules = null, missing = [], routes = {}, rpc = null } = {}) {
  const prof = { ...W.profileFor(role), font_scale: 'normal' }
  const state = { profile: prof, reqs: 0, writes: [], schemaVersion: schema, rpc: rpc ?? undefined }
  if (schedules) state.schedules = schedules
  const ctx = await b.newContext({ viewport: { width, height: 900 }, isMobile: width < 640, hasTouch: width < 640 })
  W.wire(ctx, state)
  const json = (r, v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
  for (const t of missing) await ctx.route(`**/rest/v1/${t}*`, (r) => (r.request().method() === 'GET' ? r.fulfill(MISSING_TABLE(t)) : json(r, {})))
  for (const [t, rows] of Object.entries(routes)) {
    await ctx.route(`**/rest/v1/${t}*`, (r) => {
      if (r.request().method() !== 'GET') { state.writes.push({ url: t, method: r.request().method(), body: r.request().postData() }); return json(r, {}) }
      const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
      const id = (r.request().url().match(/id=eq\.([^&]+)/) ?? [])[1]
      const list = id ? rows.filter((x) => x.id === id) : rows
      return json(r, single ? (list[0] ?? null) : list)
    })
  }
  const p = await ctx.newPage()
  const errors = []
  p.on('pageerror', (e) => errors.push(String(e)))
  await p.addInitScript(([k, u]) => {
    window.localStorage.setItem(k, JSON.stringify({ access_token: 't', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u }))
    window.localStorage.setItem('beonemirae-ops:tour-seen', 'staff,field,client')
  }, ['beonemirae-ops:auth', { id: prof.id, aud: 'authenticated', email: prof.email, app_metadata: {}, user_metadata: {} }])
  await p.goto(`${W.BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await W.settle(p, state)
  await p.waitForTimeout(500)
  return { ctx, p, state, errors }
}

console.log('── ① 배차 ──')
{
  const { ctx, p, errors } = await open('admin', '/dispatch', { schema: 87, schedules: TODAY_S })
  const body = flat(await p.textContent('main'))
  ok('① 「정비 예정 · 검사 예정」 같은 지어낸 상태가 없다', !/정비 예정|검사 예정/.test(body))
  ok('① 차량 상태는 「오늘 운행 / 오늘 일정 없음」뿐', (await p.locator('[data-fleet-row]').count()) > 0 && /오늘 일정 없음|오늘 운행/.test(body))
  ok('① 규칙 기반 · AI 아님이 적혀 있다', /규칙 기반/.test(body) && /AI 아님/.test(body))
  ok('① 거리·순서·소요시간을 계산하지 않는다고 말한다', /거리·경로 순서·소요시간은 계산하지 않습니다/.test(body))
  ok('① 판 87 에서는 결정 기록이 SQL 실행 후라고 말한다', (await p.locator('[data-dispatch-gate]').count()) === 1)
  ok('① 화면이 터지지 않음', errors.length === 0, errors.slice(0, 2).join(' | '))
  await ctx.close()
}
{
  const { ctx, p, state } = await open('office', '/dispatch', { schema: 106, schedules: TODAY_S })
  const plan = p.locator('[data-dispatch-plan]').first()
  ok('① 판 106: 오늘 제안 카드가 있다', (await plan.count()) === 1)
  if ((await plan.count()) === 1) {
    const openBtn = plan.locator('button').first()
    if ((await p.locator('[data-dispatch-apply]').count()) === 0) { await openBtn.click(); await p.waitForTimeout(400) }
    ok('① 「이대로 적용」 단추가 있다', (await p.locator('[data-dispatch-apply]').count()) === 1)
    ok('① 결과(오늘 완료/예정)가 함께 적힌다', /오늘 결과 0\/1곳 완료/.test(flat(await plan.textContent())), flat(await plan.textContent()).slice(0, 120))
    await p.locator('[data-dispatch-reject]').first().click()
    await p.waitForTimeout(200)
    await p.locator('[data-dispatch-reason-save]').first().click()
    await p.waitForTimeout(300)
    ok('① 이유 없이 「적용 안 함」은 저장되지 않는다', (await p.locator('[data-dispatch-error]').count()) === 1)
    await p.locator('[data-dispatch-reason]').first().fill('병원 요청시간이 맞지 않음')
    await p.locator('[data-dispatch-reason-save]').first().click()
    await p.waitForTimeout(900)
    ok('① 결정이 dispatch_decisions 로 저장된다', state.writes.some((w) => /dispatch_decisions/.test(w.url ?? '')), JSON.stringify(state.writes.map((w) => w.url)))
  }
  await ctx.close()
}

console.log('── ② 오늘 업무 마감 ──')
{
  const { ctx, p } = await open('field', '/today', { schema: 73, schedules: TODAY_S, width: 390 })
  ok('② 판 73: 마감 카드는 있고', (await p.locator('[data-day-close="open"]').count()) === 1)
  ok('② 판 73: 운행 기록 칸은 없다 (칸이 없는데 그리지 않음)', (await p.locator('[data-day-close-trip]').count()) === 0)
  await ctx.close()
}
{
  let closeArgs = null
  const rpc = (url, req) => {
    if (url.includes('/rpc/close_day')) { closeArgs = JSON.parse(req.postData() ?? '{}'); return { already: false, summary: { planned: 1, done: 0, left: 1, kg: 0, openVehicles: 0 } } }
    return null
  }
  const { ctx, p } = await open('field', '/today', { schema: 106, schedules: TODAY_S, width: 390, rpc })
  ok('② 판 106: 운행 기록(선택) 접힘 칸이 있다', (await p.locator('[data-day-close-trip]').count()) === 1)
  await p.locator('[data-day-close-trip-toggle]').click()
  await p.waitForTimeout(200)
  await p.locator('[data-day-close-odo-start]').fill('84210')
  await p.locator('[data-day-close-odo-end]').fill('84100')
  await p.locator('[data-day-close-go]').click()
  await p.waitForTimeout(400)
  ok('② 도착이 출발보다 작으면 막는다', /도착 계기판이 출발보다 작습니다/.test(flat(await p.textContent('[data-day-close="open"]'))))
  await p.locator('[data-day-close-odo-end]').fill('84395')
  await p.locator('[data-day-close-wait]').fill('90')
  await p.locator('[data-day-close-go]').click()
  await p.waitForTimeout(900)
  ok('② 마감이 끝난다', (await p.locator('[data-day-close="done"]').count()) === 1)
  ok('② 계기판·대기 값이 서버 호출에 실린다', closeArgs?.p_odometer_start === 84210 && closeArgs?.p_odometer_end === 84395 && closeArgs?.p_wait_min === 90, JSON.stringify(closeArgs))
  await ctx.close()
}
{
  //  값을 안 적으면 예전 서명 그대로 (인자 둘) — 판 106 이전 서버와도 맞습니다
  let closeArgs = null
  const rpc = (url, req) => { if (url.includes('/rpc/close_day')) { closeArgs = JSON.parse(req.postData() ?? '{}'); return { already: false, summary: {} } } return null }
  const { ctx, p } = await open('field', '/today', { schema: 106, schedules: TODAY_S, width: 390, rpc })
  await p.locator('[data-day-close-go]').click()
  await p.waitForTimeout(900)
  ok('② 안 적으면 계기판 인자를 보내지 않는다 (0 으로 채우지 않음)', closeArgs != null && !('p_odometer_start' in closeArgs), JSON.stringify(closeArgs))
  await ctx.close()
}

console.log('── ③ 첫 화면 엑셀 한 줄 ──')
{
  const { ctx, p, state } = await open('admin', '/', { routes: { dev_requests: [] } })
  ok('③ 관리자 첫 화면에 「엑셀·카톡에 다시 적은 것」 한 줄이 있다', (await p.locator('[data-excel-check="ask"]').count()) === 1)
  await p.locator('[data-excel-yes]').click()
  await p.locator('[data-excel-items]').fill('거래처 단가, 자재 규격')
  await p.locator('[data-excel-save]').click()
  await p.waitForTimeout(800)
  ok('③ 답하면 「기록했습니다」로 바뀐다', (await p.locator('[data-excel-check="done"]').count()) === 1)
  const w = state.writes.find((x) => /dev_requests/.test(x.url ?? ''))
  ok('③ dev_requests 에 excel:날짜=2 › 이유 형식으로 저장된다', !!w && /excel:\d{4}-\d{2}-\d{2}=2 › 거래처 단가, 자재 규격/.test(w.body ?? ''), w?.body ?? '없음')
  await ctx.close()
}
{
  const mine = W.profileFor('admin')
  const answered = [{ id: 'd1', requester_id: mine.id, requester_name: mine.name, requester_role: 'admin', topics: ['엑셀 병행 확인'],
    message: `excel:${TODAY}=0`, status: '접수', admin_note: '', handled_at: null, created_at: `${TODAY}T01:00:00Z`, updated_at: `${TODAY}T01:00:00Z` }]
  const { ctx, p } = await open('admin', '/', { routes: { dev_requests: answered } })
  ok('③ 오늘 이미 답했으면 다시 묻지 않는다', (await p.locator('[data-excel-check]').count()) === 0)
  await ctx.close()
}
{
  const { ctx, p } = await open('field', '/today', { schedules: TODAY_S, width: 390 })
  ok('③ 기사 화면에는 이 줄이 없다 (현장을 복잡하게 하지 않음)', (await p.locator('[data-excel-check]').count()) === 0)
  await ctx.close()
}

console.log('── ④ 성과 화면 ──')
{
  const { ctx, p, errors } = await open('admin', '/performance', { routes: { collection_events: EVENTS, dev_requests: [] }, missing: ['ops_changes'] })
  await p.locator('[data-perf-breadth]').waitFor({ state: 'visible', timeout: 8000 })
  const breadth = flat(await p.textContent('[data-perf-breadth]'))
  ok('④ 홍보 문장 대신 표본의 폭 한 줄', /현장 12건/.test(breadth) && /입력 커버리지/.test(breadth), breadth)
  ok('④ 변화 기록 표가 없으면 「모름」', (await p.locator('[data-perf-confounding="unknown"]').count()) === 1)
  ok('④ 입력 소요시간은 「측정값만 (비교 기준 없음)」', (await p.locator('[data-metric="inputTime"][data-metric-status="no-comparable"]').count()) === 1)
  ok('④ 입력 소요시간 값 1.5분이 보인다', /1\.5분/.test(flat(await p.textContent('[data-metric-after="inputTime"]'))), flat(await p.textContent('[data-metric-after="inputTime"]')))
  ok('④ 사무업무 시간(같은 범위)은 측정 중', (await p.locator('[data-metric="adminTime"][data-metric-status="measuring"]').count()) === 1)
  ok('④ 취소 후 재입력도 측정값만', (await p.locator('[data-metric="rework"][data-metric-status="no-comparable"]').count()) === 1)
  const body = flat(await p.textContent('main'))
  ok('④ 「같은 범위」와 「내부 표시 기준」이 적혀 있다', /같은 범위/.test(body) && /내부 표시 기준/.test(body))
  ok('④ 성장 → 병목 → AX → 측정 → 투자 → 목표 사슬이 있다', (await p.locator('[data-growth-step]').count()) === 6)
  ok('④ 사슬에 「원본 미확인」·「전망」 배지가 붙는다', /원본 미확인/.test(body) && /전망 \(확정 아님\)/.test(body))
  ok('④ 관리자에게는 「실증 준비 상태」 단추가 있다', /실증 준비 상태/.test(body))
  ok('④ 화면이 터지지 않음', errors.length === 0, errors.slice(0, 2).join(' | '))
  await ctx.close()
}
{
  const { ctx, p } = await open('office', '/performance', { routes: { collection_events: EVENTS, ops_changes: [] } })
  await p.locator('[data-perf-breadth]').waitFor({ state: 'visible', timeout: 8000 })
  ok('④ 변화 기록이 비어 있으면 「없음」 (모름과 다름)', (await p.locator('[data-perf-confounding="no"]').count()) === 1)
  const body = flat(await p.textContent('main'))
  ok('④ 사무실 계정에는 관리자 전용 화면 단추가 없다 (막다른 길 제거)', !/기준값 설정/.test(body) && !/실증 준비 상태/.test(body))
  ok('④ 엑셀 응답은 관리자만 읽는다고 말한다', /관리자 계정에서만/.test(flat(await p.textContent('[data-perf-excel]'))))
  await ctx.close()
}

console.log('── ⑤ 실증 준비 상태 ──')
{
  const { ctx, p } = await open('admin', '/readiness')
  ok('⑤ 시스템 확인 / 사람 확인 두 묶음', (await p.locator('[data-ready-group="system"]').count()) === 1 && (await p.locator('[data-ready-group="company"]').count()) === 1)
  ok('⑤ 대표가 제공할 서류 목록이 있다', (await p.locator('[data-ready-confirm]').count()) === 1)
  const body = flat(await p.textContent('main'))
  ok('⑤ 특허는 「출원 ≠ 등록」으로 적힌다', /출원이며 등록이 아닙니다|출원 ≠ 등록|등록 아님/.test(body))
  ok('⑤ 브리핑 표에 회사 사실 상태가 적힌다', (await p.locator('[data-brief-fact="rev2026h1"]').count()) === 1 && /대표 전달 · 원본 미확인/.test(body))
  ok('⑤ 「합격」이라는 말이 없다', !/합격/.test(body))
  await ctx.close()
}

console.log('── ⑥ 고객 요청 — 저장 결과 · AI 정리 ──')
{
  const { ctx, p } = await open('office', '/requests', { routes: { client_requests: REQ } })
  const btn = p.locator('[data-req-status="확인 중"]').first()
  ok('⑥ 요청 카드가 있다', (await btn.count()) === 1)
  if ((await btn.count()) === 1) {
    await btn.click()
    await p.waitForTimeout(1200)
    ok('⑥ 상태를 누르면 「저장됨」이 그 자리에 보인다', (await p.locator('[data-req-save="ok"]').count()) === 1, flat(await p.textContent('main')).slice(0, 80))
  }
  await p.getByRole('button', { name: /회신 남기기/ }).first().click()
  await p.waitForTimeout(300)
  ok('⑥ 판 87: AI 정리 칸이 없다', (await p.locator('[data-ai-triage]').count()) === 0)
  ok('⑥ 회신 창에 요청 원문이 보인다', /3층 창고/.test(flat(await p.textContent('[role="dialog"]'))))
  await ctx.close()
}
{
  const { ctx, p } = await open('office', '/requests', { schema: 106, routes: { client_requests: REQ } })
  await p.getByRole('button', { name: /회신 남기기/ }).first().click()
  await p.waitForTimeout(300)
  ok('⑥ 판 106: AI 정리 칸이 있고', (await p.locator('[data-ai-triage]').count()) === 1)
  await p.locator('[data-ai-triage-run]').click()
  await p.waitForTimeout(2500)
  const err = flat(await p.textContent('[data-ai-triage]'))
  ok('⑥ 함수가 없으면 실패를 그대로 적고 가짜 초안을 만들지 않는다', /AI 를 부르지 못했습니다/.test(err) && (await p.locator('[data-ai-triage-result]').count()) === 0, err.slice(0, 120))
  ok('⑥ 보내지 않음 · 상태 안 바꿈 · 약속 안 함이 적혀 있다', /보내지 않습니다/.test(err) && /약속하지 않습니다/.test(err))
  await ctx.close()
}

console.log('── ⑦ 설정 게이트 ──')
{
  const { ctx, p } = await open('admin', '/settings', { schema: 87 })
  ok('⑦ 판 87: 운영 변화 기록은 SQL 실행 후라고 말한다', (await p.locator('[data-ops-changes-gate]').count()) === 1)
  ok('⑦ 판 87: 도입 후 조사값 칸도 SQL 실행 후', (await p.locator('[data-after-survey-gate]').count()) === 1)
  ok('⑦ 설정에서 사용자 관리는 한 곳으로 보낸다 (중복 화면 제거)', (await p.locator('[data-settings-users]').count()) === 1)
  await ctx.close()
}
{
  const { ctx, p, state } = await open('admin', '/settings', { schema: 106, routes: { ops_changes: [] } })
  ok('⑦ 판 106: 「변화 적기」 단추가 있다', (await p.locator('[data-ops-change-new]').count()) === 1)
  await p.locator('[data-ops-change-new]').click()
  await p.locator('[data-ops-change-title]').fill('3.5톤 차량 1대 추가')
  await p.locator('[data-ops-change-save]').click()
  await p.waitForTimeout(900)
  ok('⑦ 저장하면 ops_changes 에 계획(planned)으로 들어간다', state.writes.some((w) => /ops_changes/.test(w.url ?? '') && /planned/.test(w.body ?? '')), JSON.stringify(state.writes.map((w) => w.url)))
  ok('⑦ 도입 후 조사값 입력 칸이 있다', (await p.locator('[data-after-admin]').count()) === 1)
  await ctx.close()
}

console.log('── ⑧ 메뉴 이름 ──')
{
  const { ctx, p } = await open('admin', '/more')
  const body = flat(await p.textContent('main'))
  ok('⑧ 「실증 준비 상태」·「통장 입금 대사」로 보인다', /실증 준비 상태/.test(body) && /통장 입금 대사/.test(body), body.slice(0, 200))
  ok('⑧ 「심사 준비도」는 더 이상 없다', !/심사 준비도/.test(body))
  await ctx.close()
}

await b.close()
console.log(`\ncheck_ui0106 OK=${pass} FAIL=${fail}`)
process.exit(fail ? 1 : 0)
