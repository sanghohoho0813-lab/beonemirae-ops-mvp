import { chromium, EXEC } from './_pw.mjs'
import * as W from './walk_lib.mjs'
import * as F from './perf_fixtures.mjs'

//  0125 — AX 코치 Mission 수명주기 감사 (고치지 않고 **있는 그대로 잽니다**)
//
//   ① 같은 날 새로고침 → 같은 Mission 3개인가
//   ② 실제 업무 1건 → 0/3 → 1/3 인가 (단추를 눌러서가 아니라 기록으로)
//   ③ 3개 다 하면 → 그 자리에서 새 3개가 또 나오는가, 아니면 3/3 으로 남는가
//   ④ 다음 날 → 남은 부족분 기준으로 다시 고르는가 · 어제 한 것을 또 시키는가
//   ⑤ 화면의 「N개」와 사이드바의 「N개」가 같은가
//
//   ⚠ 이 검사는 **판정이 아니라 관찰**입니다. 무엇이 나왔는지 그대로 찍습니다.
//   ⚠ 날짜는 Playwright clock 으로만 옮깁니다 — 시스템·운영 DB 를 건드리지 않습니다.

let pass = 0
let fail = 0
const ok = (name, cond, detail = '') => {
  if (cond) pass += 1
  else fail += 1
  console.log(`${cond ? ' OK ' : 'FAIL'} | ${name}${detail ? ` — ${detail}` : ''}`)
}
const note = (s) => console.log(`     · ${s}`)
const b = await chromium.launch({ executablePath: EXEC })

const C0 = F.clients[0].id
const C1 = F.clients[1].id
const C2 = F.clients[2].id

/** 오늘 갈 곳(미완료) — 「오늘 갈 병원 …」 Mission 이 나오게 하는 자료 */
const pending = (id, cid, date, time) => ({
  id, date, client_id: cid, waste_type: '의료폐기물', vehicle_id: 'v1', scheduled_time: time,
  status: '예정', expected_amount: 100, actual_amount: null, completed_at: null, memo: '', origin: 'field',
  is_additional: false, demo_session_id: null, plan_batch: null, handover_status: null, driver_name: '1호기사',
  created_at: `${date}T00:00:00Z`, updated_at: `${date}T00:00:00Z`,
})
/** 실제 수거 입력 이벤트 — Mission 을 「확인됨」으로 바꾸는 유일한 근거 */
const doneEvent = (id, sid, cid, at) => ({
  id, at, actor_id: 'u-field', actor_name: '1호기사', actor_role: 'field', screen: '수거 입력',
  action: '수거 완료', schedule_id: sid, created_schedule: false, client_id: cid,
  client_name: F.clients.find((c) => c.id === cid)?.name ?? '', waste_type: '의료폐기물', amount_kg: 100,
  before_state: { status: '예정', actualAmount: null, handoverStatus: null }, material_ids: [], stock_before: {},
  request_updates: [], note: '', reverted: false, reverted_at: null, demo_session_id: null, input_duration_ms: 60000,
})
const portalReq = (id, cid, at) => ({
  id, client_id: cid, kind: '추가수거', content: '추가 수거 부탁드립니다', desired_date: null, urgent: false,
  status: '접수', source: 'portal', requester_name: '원무과', reply: '', handled_by: null, handled_at: null,
  created_at: at, demo_session_id: null, clients: { name: F.clients.find((c) => c.id === cid)?.name ?? '' },
})

/**
 * /ax-coach 를 엽니다.
 *  day  — 화면이 「오늘」로 볼 날짜 (clock 으로 고정)
 *  s/e/r — 일정 · 이벤트 · 포털 요청
 */
async function open({ day, schedules = [], events = [], requests = [], start }) {
  const prof = { ...W.profileFor('admin'), font_scale: 'normal' }
  const state = { profile: prof, reqs: 0, writes: [], schemaVersion: 122, schedules }
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } })
  W.wire(ctx, state)
  const json = (r, v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
  await ctx.route('**/rest/v1/collection_events*', (r) => json(r, events))
  await ctx.route('**/rest/v1/client_requests*', (r) => json(r, requests))
  await ctx.route('**/rest/v1/experiment_settings*', (r) => json(r, { id: 1, start_date: start, pilot_start_date: start, pilot_client_ids: [C0, C1, C2] }))
  //  발행 이력 표(0108)는 이 감사에서 비워 둡니다 — 「오늘 0시부터」 기준으로 봅니다.
  await ctx.route('**/rest/v1/ax_coach_missions*', (r) => json(r, []))
  const p = await ctx.newPage()
  //  ⚠ 화면이 보는 「오늘」만 옮깁니다. 서버·시스템 시각은 그대로입니다.
  await p.clock.setFixedTime(new Date(`${day}T09:00:00+09:00`))
  await p.addInitScript(([k, u]) => {
    window.localStorage.setItem(k, JSON.stringify({ access_token: 't', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u }))
    window.localStorage.setItem('beonemirae-ops:tour-seen', 'staff,field,client')
  }, ['beonemirae-ops:auth', { id: prof.id, aud: 'authenticated', email: prof.email, app_metadata: {}, user_metadata: {} }])
  await p.goto(`${W.BASE}/ax-coach`, { waitUntil: 'domcontentloaded' })
  await W.settle(p, state)
  await p.locator('[data-coach-today]').waitFor({ state: 'visible', timeout: 20000 })
  await p.waitForTimeout(500)
  return { ctx, p }
}

/** 화면에 보이는 오늘 할 일 / 확인된 일 */
async function read(p) {
  return p.evaluate(() => {
    const keys = (sel) => [...document.querySelectorAll(sel)].map((e) => e.getAttribute('data-coach-mission'))
    const all = [...document.querySelectorAll('[data-coach-mission]')]
    const doneWrap = document.querySelector('[data-coach-done]')
    const done = doneWrap ? [...doneWrap.querySelectorAll('[data-coach-mission]')] : []
    const doneKeys = done.map((e) => e.getAttribute('data-coach-mission'))
    return {
      todo: all.map((e) => e.getAttribute('data-coach-mission')).filter((k) => !doneKeys.includes(k)),
      done: doneKeys,
      badge: (document.querySelector('[data-coach-today-count]')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
      progress: (document.querySelector('[data-coach-progress]')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
      pin: (document.querySelector('[data-coach-pin-today]')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
      pct: (document.querySelector('[data-coach-total-pct]')?.textContent ?? '').trim(),
      keys,
    }
  })
}

const D1 = '2026-09-16'   // Pilot 시작일 = 실증 대상 첫날
const D2 = '2026-09-17'
const START = D1
const S = [pending('s1', C0, D1, '09:00'), pending('s2', C1, D1, '11:00'), pending('s3', C2, D1, '14:00')]

// ── SCENARIO 1 · 같은 날 새로고침 ────────────────────────────────────────────
console.log('\n── S1 · 같은 날 두 번 열기 ─────────────────────────────')
let first = null
{
  const { ctx, p } = await open({ day: D1, schedules: S, start: START })
  first = await read(p)
  note(`1회차 todo=[${first.todo}] done=[${first.done}] 배지="${first.badge}" 준비도=${first.pct}`)
  ok('S1 오늘 할 일이 1~3개', first.todo.length >= 1 && first.todo.length <= 3, `${first.todo.length}개`)
  await p.reload({ waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(2500)
  const again = await read(p)
  note(`2회차 todo=[${again.todo}]`)
  ok('S1 **새로고침해도 같은 Mission · 같은 순서**', JSON.stringify(again.todo) === JSON.stringify(first.todo), `${first.todo} vs ${again.todo}`)
  ok('S1 배지 숫자 = 할 일 수', again.badge === `오늘 해야 할 ${again.todo.length}개`, `${again.badge} / ${again.todo.length}`)
  await ctx.close()
}

// ── SCENARIO 2 · 실제 업무 1건 → 1개 확인됨 ─────────────────────────────────
console.log('\n── S2 · 실제 수거 1건 (단추가 아니라 기록으로) ──────────')
{
  const done1 = [...S.map((x) => ({ ...x }))]
  done1[0] = { ...done1[0], status: '완료', actual_amount: 95, completed_at: `${D1}T01:00:00Z`, event_id: 'e1' }
  const { ctx, p } = await open({ day: D1, schedules: done1, events: [doneEvent('e1', 's1', C0, `${D1}T01:00:00Z`)], start: START })
  const r = await read(p)
  note(`todo=[${r.todo}] done=[${r.done}] 진행="${r.progress}"`)
  ok('S2 **실제 수거 기록으로 1개가 확인됨으로 바뀜**', r.done.length === 1, `확인 ${r.done.length}개`)
  ok('S2 진행 줄에 「N개 중 1개 확인됨」', /1개 확인됨/.test(r.progress), r.progress)
  ok('S2 사이드바 숫자도 같음', /1개 확인됨/.test(r.pin), r.pin)
  await ctx.close()
}

// ── SCENARIO 3 · 3개 다 하면? (관찰) ────────────────────────────────────────
console.log('\n── S3 · 오늘 할 일을 다 하면 무엇이 일어나는가 ──────────')
{
  const allDone = S.map((x, i) => ({ ...x, status: '완료', actual_amount: 90, completed_at: `${D1}T0${i + 1}:00:00Z`, event_id: `e${i + 1}` }))
  const evs = [doneEvent('e1', 's1', C0, `${D1}T01:00:00Z`), doneEvent('e2', 's2', C1, `${D1}T02:00:00Z`), doneEvent('e3', 's3', C2, `${D1}T03:00:00Z`)]
  const { ctx, p } = await open({ day: D1, schedules: allDone, events: evs, requests: [portalReq('r1', C0, `${D1}T04:00:00Z`)], start: START })
  const r = await read(p)
  note(`todo=[${r.todo}] done=[${r.done}] 진행="${r.progress}"`)
  note(r.todo.length === 0
    ? '→ 관찰: 오늘 할 일이 0개로 남습니다 (A: 오늘은 끝)'
    : `→ 관찰: 오늘 할 일이 ${r.todo.length}개 **다시 채워졌습니다** (B: 즉시 새 Mission) — ${r.todo}`)
  ok('S3 확인된 일이 그 자리에 남아 보임', r.done.length >= 1, `확인 ${r.done.length}개`)
  ok('S3 한 번에 주는 할 일은 3개 이하', r.todo.length <= 3, `${r.todo.length}개`)
  //  ⚠ 여기서 「무한 재충전」을 FAIL 로 찍지 않습니다 — 지금 동작을 기록하고
  //    보고서에서 정책과 견줍니다. 검사가 제품 정책을 임의로 정하지 않습니다.
  console.log(`     · S3 판정 자료: todo=${r.todo.length} done=${r.done.length}`)
  await ctx.close()
}

// ── SCENARIO 4 · 다음 날 ────────────────────────────────────────────────────
console.log('\n── S4 · 다음 날 (clock 으로만 이동) ─────────────────────')
{
  //  어제 3건을 다 했고, 오늘(D2)도 갈 곳이 하나 있습니다.
  const yesterdayDone = S.map((x, i) => ({ ...x, status: '완료', actual_amount: 90, completed_at: `${D1}T0${i + 1}:00:00Z`, event_id: `e${i + 1}` }))
  const todayPending = [pending('s4', C0, D2, '10:00')]
  const evs = [doneEvent('e1', 's1', C0, `${D1}T01:00:00Z`), doneEvent('e2', 's2', C1, `${D1}T02:00:00Z`), doneEvent('e3', 's3', C2, `${D1}T03:00:00Z`)]
  const { ctx, p } = await open({ day: D2, schedules: [...yesterdayDone, ...todayPending], events: evs, start: START })
  const r = await read(p)
  note(`todo=[${r.todo}] done=[${r.done}] 준비도=${r.pct}`)
  ok('S4 다음 날 할 일이 다시 나옴', r.todo.length >= 1, `${r.todo.length}개`)
  ok('S4 여전히 3개 이하', r.todo.length <= 3, `${r.todo.length}개`)
  ok('S4 **어제 확인된 것이 오늘 확인됨으로 넘어오지 않음** (오늘 기록만 셈)', r.done.length === 0, `확인 ${r.done.length}개`)
  //  어제 다 한 「오늘 갈 병원」이 오늘도 갈 곳이 있으면 다시 나오는 것은 정상입니다.
  note(r.todo.includes('collect-today') ? '→ 오늘도 갈 곳이 있어 collect-today 가 다시 나옴 (정상)' : '→ collect-today 는 오늘 후보에 없음')
  await ctx.close()
}

// ── SCENARIO 5 · 부족한 갈래가 먼저 나오는가 ────────────────────────────────
console.log('\n── S5 · Evidence Gap 우선순위 ──────────────────────────')
{
  //  포털 기록이 하나도 없는 상태 — 「병원이 직접 올리게」가 후보에 있어야 합니다.
  const { ctx, p } = await open({ day: D1, schedules: S, start: START })
  const r = await read(p)
  const cov = await p.evaluate(() => [...document.querySelectorAll('[data-coach-area]')].map((e) => `${e.getAttribute('data-coach-area')}:${(e.textContent.match(/(\d+)%/) ?? [])[1] ?? '?'}`))
  note(`갈래별 준비도 ${cov.join(' · ')}`)
  note(`todo=[${r.todo}]`)
  ok('S5 네 갈래가 다 계산됨', cov.length === 4, cov.join(','))
  ok('S5 할 일이 부족한 갈래에서 나옴 (0% 갈래가 있는데 할 일이 0개이지 않음)', r.todo.length > 0)
  await ctx.close()
}

console.log(`\n합계 ${pass + fail}검사 · 실패 ${fail}`)
await b.close()
if (fail > 0) process.exitCode = 1
