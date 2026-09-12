import { chromium, EXEC } from './_pw.mjs'
import * as W from './walk_lib.mjs'
import * as F from './perf_fixtures.mjs'

// ─────────────────────────────────────────────────────────────────────────────
//  0108 — AX 코치 화면
//
//   ⓐ 준비도가 크게 보이고 「성과가 아니다」라고 말하는가
//   ⓑ 네 갈래 · 눌러야 항목이 나오는가
//   ⓒ 오늘 할 일 최대 3개 · **「완료」 단추가 없는가**
//   ⓓ 업무하러 가기를 누르면 실제 업무 화면으로 가는가
//   ⓔ 실제 기록이 있으면 「확인했어요」로 바뀌는가
//   ⓕ 기사님 화면에 돈 관련 일이 안 뜨는가 · 금액이 하나도 없는가
//   ⓖ 폰 390px 에서 밀리지 않고 글자·단추가 기준을 넘는가
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
const pad = (n) => String(n).padStart(2, '0')
const shift = (d, n) => { const x = new Date(`${d}T12:00:00`); x.setDate(x.getDate() + n); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}` }

const PENDING = [{
  id: 'sx', date: TODAY, client_id: C0, waste_type: '의료폐기물', vehicle_id: 'v1', scheduled_time: '10:00',
  status: '예정', expected_amount: 80, actual_amount: null, completed_at: null, memo: '', origin: 'field',
  is_additional: false, demo_session_id: null, plan_batch: null, handover_status: null, driver_name: '1호기사',
  created_at: `${TODAY}T00:00:00Z`, updated_at: `${TODAY}T00:00:00Z`,
}]
const DONE_TODAY = [{ ...PENDING[0], status: '완료', actual_amount: 70, completed_at: `${TODAY}T04:00:00Z` }]
const EVENT_TODAY = [{
  id: 'ev1', at: `${TODAY}T04:00:00Z`, actor_role: 'field', screen: '수거 입력', action: '수거 완료',
  schedule_id: 'sx', created_schedule: false, client_id: C0, client_name: F.clients[0].name,
  waste_type: '의료폐기물', amount_kg: 70, demo_session_id: null, duration_ms: 90000, input_duration_ms: 90000,
  reverted: false, reverted_at: null, material_ids: [], request_updates: [], before_state: {}, stock_before: {}, note: '',
}]
const MISSING_TABLE = (name) => ({ status: 404, contentType: 'application/json',
  body: JSON.stringify({ code: 'PGRST205', message: `Could not find the table 'public.${name}' in the schema cache`, hint: null, details: null }) })

async function open(role, path, { width = 1440, schedules = null, routes = {}, missing = [] } = {}) {
  const prof = { ...W.profileFor(role), font_scale: 'normal' }
  const state = { profile: prof, reqs: 0, writes: [], schemaVersion: 108 }
  if (schedules) state.schedules = schedules
  const ctx = await b.newContext({ viewport: { width, height: width < 640 ? 844 : 900 }, isMobile: width < 640, hasTouch: width < 640 })
  W.wire(ctx, state)
  const json = (r, v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
  for (const t of missing) await ctx.route(`**/rest/v1/${t}*`, (r) => (r.request().method() === 'GET' ? r.fulfill(MISSING_TABLE(t)) : json(r, {})))
  for (const [t, rows] of Object.entries(routes)) {
    await ctx.route(`**/rest/v1/${t}*`, (r) => {
      if (r.request().method() !== 'GET') { state.writes.push({ url: t, method: r.request().method(), body: r.request().postData() }); return json(r, rows[0] ?? {}) }
      const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
      const id = (r.request().url().match(/id=eq\.([^&]+)/) ?? [])[1]
      const list = id ? rows.filter((x) => String(x.id) === id) : rows
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

console.log('── ⓐ 준비도 ──')
{
  const { ctx, p, errors } = await open('admin', '/ax-coach', { schedules: PENDING, routes: { ax_coach_missions: [] } })
  await p.locator('[data-coach-total]').waitFor({ state: 'visible', timeout: 8000 })
  const pct = flat(await p.textContent('[data-coach-total-pct]'))
  ok('ⓐ 실증 자료 준비도가 % 로 크게 보인다', /^\d+%$/.test(pct), pct)
  const size = await p.locator('[data-coach-total-pct]').evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
  ok('ⓐ 핵심 숫자가 28px 이상', size >= 28, `${size}px`)
  ok('ⓐ 「자동으로 올라갑니다」를 말한다', /실제 업무기록이 쌓일수록 자동으로 올라갑니다/.test(flat(await p.textContent('[data-coach-total]'))))
  //  ⚠ 제일 중요한 한 줄 — 준비도는 성과가 아닙니다.
  ok('ⓐ **「성과가 좋아졌다는 뜻이 아니다」라고 못 박는다**', /좋아졌다는 뜻이 아닙니다/.test(flat(await p.textContent('[data-coach-caveat]'))), flat(await p.textContent('[data-coach-caveat]')))
  ok('ⓐ 화면이 터지지 않음', errors.length === 0, errors.slice(0, 2).join(' | '))
  await ctx.close()
}

console.log('── ⓑ 네 갈래 ──')
{
  const { ctx, p } = await open('admin', '/ax-coach', { schedules: PENDING, routes: { ax_coach_missions: [] } })
  await p.locator('[data-coach-area="work"]').waitFor({ state: 'visible', timeout: 8000 })
  ok('ⓑ 네 갈래가 다 있다', (await p.locator('[data-coach-area]').count()) === 4)
  const labels = flat(await p.textContent('[data-coach-total]').then(() => p.textContent('main')))
  ok('ⓑ 쉬운 이름을 쓴다 (업무 활용 · 매출 증거 · 운영 확장 · 병원 직접사용)',
    ['업무 활용', '매출 증거', '운영 확장', '병원 직접사용'].every((s) => labels.includes(s)))
  ok('ⓑ 영어 지표 이름을 앞에 내세우지 않는다', !/EVIDENCE COVERAGE|COVERAGE IS/i.test(labels))
  ok('ⓑ 갈래마다 쉬운 말 한 줄이 있다', (await p.locator('[data-coach-say]').count()) === 4)
  //  긴 표를 첫 화면에 늘어놓지 않습니다 — 눌러야 나옵니다.
  ok('ⓑ 펼치기 전에는 항목 표가 없다', (await p.locator('[data-coach-items]').count()) === 0)
  await p.locator('[data-coach-area="customer"] button').first().click()
  await p.waitForTimeout(300)
  ok('ⓑ 누르면 항목이 나온다', (await p.locator('[data-coach-items="customer"]').count()) === 1)
  const item = flat(await p.textContent('[data-coach-item="portalUse"]'))
  ok('ⓑ 항목에 지금 값 / 목표가 함께 보인다', /\/ 5건/.test(item), item)
  ok('ⓑ 항목마다 어디서 온 숫자인지 적혀 있다', /포털에서 병원이 직접 올린 것만/.test(item), item)
  //  결과를 여기 겹쳐 적지 않고 성과 화면의 그 자리로 보냅니다.
  const href = await p.locator('[data-coach-detail="customer"]').getAttribute('href')
  ok('ⓑ 자세한 것은 성과 화면의 그 칸으로 보낸다', href === '/performance?tab=basis#ax-customer', String(href))
  await ctx.close()
}

console.log('── ⓒⓓ 오늘 할 일 ──')
{
  const { ctx, p, state } = await open('admin', '/ax-coach', { schedules: PENDING, routes: { ax_coach_missions: [] } })
  await p.locator('[data-coach-today]').waitFor({ state: 'visible', timeout: 8000 })
  const n = await p.locator('[data-coach-mission]').count()
  ok('ⓒ 오늘 할 일이 1~3개', n >= 1 && n <= 3, String(n))
  const card = flat(await p.textContent('[data-coach-mission="collect-today"]'))
  ok('ⓒ 오늘 갈 곳이 있으면 「바로 입력」이 뜬다', /바로 입력해 주세요/.test(card), card.slice(0, 80))
  ok('ⓒ 왜 해야 하는지 적혀 있다', /왜\?/.test(card))
  //  ⚠⚠ 이 검사가 이 기능의 핵심입니다.
  const body = flat(await p.textContent('main'))
  //  ⚠ 「완료한 방문」처럼 다른 뜻으로 「완료」가 들어간 글은 셉니다 —
  //    누르면 다 한 것으로 처리되는 **단추**가 있는지만 봅니다.
  const fakeDone = await p.locator('main button').evaluateAll((els) =>
    els.map((e) => (e.textContent ?? '').trim()).filter((x) => /^(완료|했어요|다 했어요|완료했습니다|확인)$/.test(x)))
  ok('ⓒ **「완료」 단추가 없다**', fakeDone.length === 0, fakeDone.join(' / '))
  ok('ⓒ 대신 「누르는 것으로는 확인되지 않는다」고 적는다', /실제 업무기록.*생기면 그때 확인됩니다|누르는 것으로는 확인되지 않습니다/.test(body), body.slice(0, 120))
  //  단추 높이 — 46px 이상
  const h = await p.locator('[data-coach-go="collect-today"]').evaluate((el) => el.getBoundingClientRect().height)
  ok('ⓒ 단추 높이가 46px 이상', h >= 46, `${h}px`)

  await p.locator('[data-coach-go="collect-today"]').click()
  await p.waitForTimeout(900)
  ok('ⓓ 누르면 실제 업무 화면(수거 입력)으로 간다', /\/collection/.test(p.url()), p.url())
  const w = state.writes.find((x) => x.url === 'ax_coach_missions')
  ok('ⓓ 발행 이력에 **받았다는 사실만** 남는다', !!w && /"mission_key":"collect-today"/.test(w.body ?? ''), w?.body ?? '없음')
  ok('ⓓ 발행 이력에 완료 표시를 함께 쓰지 않는다', !!w && !/verified_at/.test(w.body ?? ''), w?.body ?? '없음')
  await ctx.close()
}

console.log('── ⓔ 실제 기록이 생기면 확인 ──')
{
  //  오늘 다녀오고 오늘 입력한 기록 + 오늘 00:30 에 발행된 이력
  const issued = [{
    id: 'mm1', mission_key: 'collect-today', evidence_area: 'work', issued_on: TODAY,
    issued_at: `${TODAY}T00:30:00Z`, issued_name: '대표', issued_role: 'admin',
    target_id: null, verified_at: null, verified_what: '',
  }]
  const { ctx, p } = await open('admin', '/ax-coach', {
    schedules: DONE_TODAY,
    routes: { ax_coach_missions: issued, collection_events: EVENT_TODAY },
  })
  await p.locator('[data-coach-today]').waitFor({ state: 'visible', timeout: 8000 })
  const done = await p.locator('[data-coach-mission-status="verified"]').count()
  ok('ⓔ 실제 수거 입력이 있으면 「확인했어요」로 바뀐다', done >= 1, String(done))
  ok('ⓔ 무엇을 보고 확인했는지 적는다', /실제 업무기록을 확인했어요/.test(flat(await p.textContent('[data-coach-done]'))))
  await ctx.close()
}
{
  //  발행만 하고 아무 기록도 없는 경우 — 「기다리는 중」이지 완료가 아닙니다.
  const issued = [{
    id: 'mm1', mission_key: 'collect-today', evidence_area: 'work', issued_on: TODAY,
    issued_at: `${TODAY}T00:30:00Z`, issued_name: '대표', issued_role: 'admin',
    target_id: null, verified_at: `${TODAY}T01:00:00Z`, verified_what: '거짓으로 적어 둔 값',
  }]
  const { ctx, p } = await open('admin', '/ax-coach', { schedules: PENDING, routes: { ax_coach_missions: issued, collection_events: [] } })
  await p.locator('[data-coach-today]').waitFor({ state: 'visible', timeout: 8000 })
  ok('ⓔ **이력에 확인됨이라고 적혀 있어도 실제 기록이 없으면 확인 안 함**', (await p.locator('[data-coach-mission-status="verified"]').count()) === 0)
  ok('ⓔ 대신 「기록을 기다리는 중」으로 보인다', (await p.locator('[data-coach-waiting="collect-today"]').count()) === 1)
  await ctx.close()
}

console.log('── ⓕ 기사님 화면 ──')
{
  const { ctx, p } = await open('field', '/ax-coach', { schedules: PENDING, width: 390, routes: { ax_coach_missions: [] } })
  await p.locator('[data-coach-today]').waitFor({ state: 'visible', timeout: 8000 })
  const body = flat(await p.textContent('main'))
  ok('ⓕ 기사님도 이 화면을 연다', (await p.locator('[data-coach-total]').count()) === 1)
  ok('ⓕ **금액이 하나도 없다**', !/원\b/.test(body.replace(/[가-힣]원무과/g, '')), (body.match(/\S{0,12}원/g) ?? []).slice(0, 3).join(' / '))
  ok('ⓕ 기사님에게 주문·입금 일이 뜨지 않는다 (열리지 않는 화면이라)',
    (await p.locator('[data-coach-mission="order-deliver"]').count()) === 0 && (await p.locator('[data-coach-mission="payment-match"]').count()) === 0)
  ok('ⓕ 기사님에게는 성과 화면 단추가 없다', (await p.locator('[data-coach-to-perf]').count()) === 0)
  await p.locator('[data-coach-area="work"] button').first().click()
  await p.waitForTimeout(300)
  ok('ⓕ 기사님에게는 성과 화면으로 가는 줄도 없다 (열리지 않는 화면)', (await p.locator('[data-coach-detail]').count()) === 0)
  await ctx.close()
}

console.log('── ⓖ 폰 390px ──')
{
  const { ctx, p, errors } = await open('admin', '/ax-coach', { schedules: PENDING, width: 390, routes: { ax_coach_missions: [] } })
  await p.locator('[data-coach-today]').waitFor({ state: 'visible', timeout: 8000 })
  const over = await p.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth))
  ok('ⓖ 가로로 밀리지 않음', over === 0, `${over}px`)
  const small = await p.evaluate(() => {
    const bad = []
    for (const el of document.querySelectorAll('main *')) {
      if (el.children.length > 0) continue
      const t = (el.textContent ?? '').trim()
      if (t.length < 2) continue
      const fs = parseFloat(getComputedStyle(el).fontSize)
      if (fs > 0 && fs < 15) bad.push(`${t.slice(0, 14)} ${fs}px`)
    }
    return bad
  })
  ok('ⓖ 15px 미만 글자가 없다', small.length === 0, small.slice(0, 3).join(' · '))
  const tap = await p.evaluate(() => {
    const bad = []
    for (const el of document.querySelectorAll('main button, main a')) {
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.height > 0 && r.height < 44) bad.push(`${(el.textContent ?? '').trim().slice(0, 14)} ${Math.round(r.height)}px`)
    }
    return bad
  })
  ok('ⓖ 누르는 자리가 44px 이상', tap.length === 0, tap.slice(0, 3).join(' · '))
  ok('ⓖ 폰에서도 오늘 할 일이 3개를 넘지 않는다', (await p.locator('[data-coach-mission]').count()) <= 3)
  //  ⚠ 좁은 기둥으로 늘어진 글자 — 「결과는 / 성과 / 화면에 / 서」처럼 한 줄에
  //    한 낱말씩 떨어지면 읽을 수 없습니다. 실제로 그랬습니다.
  const vert = await p.evaluate(() => {
    const bad = []
    for (const el of document.querySelectorAll('main *')) {
      if (el.children.length > 0) continue
      const t = (el.textContent ?? '').trim()
      if (t.length < 8) continue
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.width < 90 && r.height > 90) bad.push(`${t.slice(0, 14)} (${Math.round(r.width)}×${Math.round(r.height)})`)
    }
    return bad
  })
  ok('ⓖ 세로로 늘어진 글자 기둥이 없다', vert.length === 0, vert.slice(0, 2).join(' · '))
  ok('ⓖ 화면이 터지지 않음', errors.length === 0, errors.slice(0, 2).join(' | '))
  await ctx.close()
}

console.log('── ⓗ 발행 이력 표가 없을 때 ──')
{
  const { ctx, p } = await open('admin', '/ax-coach', { schedules: PENDING, missing: ['ax_coach_missions'] })
  await p.locator('[data-coach-today]').waitFor({ state: 'visible', timeout: 8000 })
  ok('ⓗ 표가 없어도 화면은 그대로 돌아간다', (await p.locator('[data-coach-mission]').count()) >= 1)
  const body = flat(await p.textContent('main'))
  ok('ⓗ 「오늘 0시부터 확인한다」고 알린다', /오늘 0시부터의 기록으로 확인합니다/.test(body), body.slice(-160))
  ok('ⓗ 완료 Mission 을 0 건이라고 하지 않는다', /표가 아직 없어 세지 못했습니다/.test(body))
  await ctx.close()
}

console.log('── ⓘ 최근 7일 / 14일 ──')
{
  const events = Array.from({ length: 4 }, (_, i) => ({
    ...EVENT_TODAY[0], id: `ev${i}`, at: `${shift(TODAY, -i)}T04:00:00Z`, schedule_id: `sd${i}`,
  }))
  const schedules = events.map((e, i) => ({ ...DONE_TODAY[0], id: `sd${i}`, date: shift(TODAY, -i), completed_at: e.at }))
  const { ctx, p } = await open('admin', '/ax-coach', { schedules, routes: { ax_coach_missions: [], collection_events: events } })
  await p.locator('[data-coach-report="7"]').waitFor({ state: 'visible', timeout: 8000 })
  ok('ⓘ 기본은 최근 7일', (await p.locator('[data-coach-report="7"]').count()) === 1)
  ok('ⓘ 수거 완료 4건이 보인다', /4건/.test(flat(await p.textContent('[data-coach-stat="수거 완료"]'))), flat(await p.textContent('[data-coach-stat="수거 완료"]')))
  ok('ⓘ 준비도 변화가 「전 → 지금」으로 보인다', /→/.test(flat(await p.textContent('[data-coach-report-pct]'))), flat(await p.textContent('[data-coach-report-pct]')))
  ok('ⓘ 다음에 먼저 채울 것을 짚는다', (await p.locator('[data-coach-next]').count()) === 1)
  await p.locator('[data-coach-days="14"]').click()
  await p.waitForTimeout(400)
  ok('ⓘ 14일로 바꿀 수 있다', (await p.locator('[data-coach-report="14"]').count()) === 1)
  await ctx.close()
}

console.log('── ⓙ 첫 화면 한 줄 ──')
{
  const { ctx, p } = await open('admin', '/', { schedules: PENDING, routes: { ax_coach_missions: [] } })
  await p.waitForTimeout(600)
  const line = await p.locator('[data-coach-line]').count()
  ok('ⓙ 첫 화면에 AX 코치 한 줄이 있다', line === 1, String(line))
  ok('ⓙ 한 줄에 오늘 할 일 수와 준비도만 적는다', /오늘 할 일 \d+개.*준비도 \d+%/.test(flat(await p.textContent('[data-coach-line]'))), flat(await p.textContent('[data-coach-line]')))
  await ctx.close()
}
{
  const { ctx, p } = await open('field', '/today', { schedules: PENDING, width: 390, routes: { ax_coach_missions: [] } })
  await p.waitForTimeout(600)
  ok('ⓙ 기사님 오늘 화면은 건드리지 않는다', (await p.locator('[data-coach-line]').count()) === 0)
  await ctx.close()
}

await b.close()
console.log(`\ncheck_coachui OK=${pass} FAIL=${fail}`)
process.exit(fail ? 1 : 0)
