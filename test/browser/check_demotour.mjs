import { chromium, EXEC } from './_pw.mjs'
import * as W from './walk_lib.mjs'
import * as F from './perf_fixtures.mjs'

// ─────────────────────────────────────────────────────────────────────────────
//  0109 — 심사 시연 투어 (60초 · 6단계)
//
//   ⓐ 여섯 단계가 정해진 화면 순서대로 간다
//   ⓑ **직접 누르는 단계와 읽기만 하는 단계가 확실히 갈린다**
//   ⓒ 직접 누르는 단계에서는 그 자리가 **실제로 눌린다** (덮개에 구멍)
//   ⓓ 읽기만 하는 단계에서는 화면이 **안 눌린다** (예전 그대로)
//   ⓔ 누르면 투어가 따라온다 — 되돌려 끌고 오지 않는다
//   ⓕ 저장이 끝나면 ⑤단계로 저절로 넘어간다
//   ⓖ 기존 세 투어는 한 글자도 안 바뀐다
//
//   ⚠ 전부 흉내 낸 서버로 돕니다. 실제 운영 데이터는 만들지도 바꾸지도
//     않습니다 — 저장 RPC 도 흉내만 냅니다.
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

/** 오늘 예정 방문 1건 — 「오늘 수거 바로 입력」 일이 뜨는 조건 */
const PENDING = [{
  id: 'sx', date: TODAY, client_id: C0, waste_type: '의료폐기물', vehicle_id: 'v1', scheduled_time: '10:00',
  status: '예정', expected_amount: 80, actual_amount: null, completed_at: null, memo: '', origin: 'field',
  is_additional: false, demo_session_id: null, plan_batch: null, handover_status: null, driver_name: '1호기사',
  created_at: `${TODAY}T00:00:00Z`, updated_at: `${TODAY}T00:00:00Z`,
}]

async function open(path, { width = 1440, schedules = PENDING, routes = {} } = {}) {
  const prof = { ...W.profileFor('admin'), font_scale: 'normal' }
  const state = { profile: prof, reqs: 0, writes: [], schemaVersion: 108, schedules, rpcCalls: [] }
  //  저장 RPC 는 **흉내만** 냅니다 — 실제로 아무것도 저장되지 않습니다.
  state.rpc = (url) => {
    if (url.includes('/rpc/complete_collection')) {
      state.rpcCalls.push('complete_collection')
      return { eventId: 'ev-demo', scheduleId: 'sx', createdSchedule: false }
    }
    return null
  }
  const ctx = await b.newContext({ viewport: { width, height: 900 } })
  W.wire(ctx, state)
  const json = (r, v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
  for (const [t, rows] of Object.entries(routes)) {
    await ctx.route(`**/rest/v1/${t}*`, (r) => {
      //  쓰기는 **기록만** 하고 성공한 척합니다 — 실제로 저장되는 것은 없습니다.
      if (r.request().method() !== 'GET') {
        state.writes.push({ url: t, method: r.request().method(), body: r.request().postData() })
        return json(r, rows[0] ?? {})
      }
      return json(r, rows)
    })
  }
  const p = await ctx.newPage()
  const errors = []
  p.on('pageerror', (e) => errors.push(String(e)))
  await p.addInitScript(([k, u]) => {
    window.localStorage.setItem(k, JSON.stringify({ access_token: 't', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u }))
    window.localStorage.setItem('beonemirae-ops:tour-seen', 'staff,field,client,demo')
  }, ['beonemirae-ops:auth', { id: prof.id, aud: 'authenticated', email: prof.email, app_metadata: {}, user_metadata: {} }])
  await p.goto(`${W.BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await W.settle(p, state)
  await p.waitForTimeout(600)
  return { ctx, p, state, errors }
}

/** 지금 단계의 제목 · 직접 누르라는 띠가 있는지 */
const stepInfo = async (p) => ({
  no: flat(await p.textContent('[data-tour-step]')),
  title: flat(await p.textContent('[data-tour-title]')),
  hands: (await p.locator('[data-tour-hands]').count()) === 1
    ? flat(await p.textContent('[data-tour-hands]'))
    : null,
  path: new URL(p.url()).pathname,
})

console.log('── ⓐ 시연 화면에서 시작 ──')
{
  const { ctx, p, errors } = await open('/presentation', { routes: { ax_coach_missions: [] } })
  ok('ⓐ 심사 시연 화면에 60초 투어 안내가 있다', (await p.locator('[data-demo-tour]').count()) === 1)
  const box = flat(await p.textContent('[data-demo-tour]'))
  ok('ⓐ **저장되는 수거 1건이 실제 기록이라고 미리 알린다**', /실제 기록입니다/.test(box), box.slice(0, 120))
  ok('ⓐ 직접 눌러야 하는 단계를 미리 알린다', /③④단계는 직접 누르/.test(box))

  await p.locator('[data-demo-tour] [data-tour-start]').click()
  await p.waitForTimeout(1800)
  const s1 = await stepInfo(p)
  ok('ⓐ ①단계는 대시보드', s1.path === '/' && /오늘 확인할 업무/.test(s1.title), `${s1.path} ${s1.title}`)
  ok('ⓐ 전체 6단계', /1 \/ 6/.test(s1.no), s1.no)
  ok('ⓐ ①단계는 읽기만 하는 단계 (직접 누르라는 띠 없음)', s1.hands === null, String(s1.hands))
  //  읽기만 하는 단계에서는 예전처럼 화면이 안 눌립니다.
  ok('ⓐ 읽기 단계에서는 화면 덮개가 통째로 있다', (await p.locator('[data-tour-card] ~ div, [role="dialog"] > div.absolute.inset-0').count()) >= 1)
  ok('ⓐ 화면이 터지지 않음', errors.length === 0, errors.slice(0, 2).join(' | '))
  await ctx.close()
}

console.log('── ⓑⓒⓔ ②③단계 — 직접 누르기 ──')
{
  const { ctx, p, state } = await open('/presentation', { routes: { ax_coach_missions: [] } })
  await p.locator('[data-demo-tour] [data-tour-start]').click()
  await p.waitForTimeout(1800)

  await p.locator('[data-tour-next]').click()
  await p.waitForTimeout(1800)
  const s2 = await stepInfo(p)
  ok('ⓑ ②단계는 AX 코치 준비도', s2.path === '/ax-coach' && /무엇이 비어 있는가/.test(s2.title), `${s2.path} ${s2.title}`)
  ok('ⓑ ②단계도 읽기만 하는 단계', s2.hands === null)
  ok('ⓑ ②단계가 준비도 칸을 짚는다', (await p.locator('[data-tour="coach-total"]').count()) === 1)
  //  ⚠ 준비도가 성과가 아니라는 말이 단계 설명에도 있어야 합니다.
  ok('ⓑ 준비도가 성과가 아니라고 단계에서도 말한다', /성과가 그만큼 좋아졌다는 뜻이 아닙니다/.test(flat(await p.textContent('[data-tour-why]'))))

  await p.locator('[data-tour-next]').click()
  await p.waitForTimeout(1800)
  const s3 = await stepInfo(p)
  ok('ⓑ ③단계는 「수거 입력으로」', /수거 입력으로/.test(s3.title), s3.title)
  ok('ⓑ **③단계는 직접 누르는 단계라고 띠로 알린다**', !!s3.hands && /직접 눌러 보세요/.test(s3.hands), String(s3.hands))
  ok('ⓑ 무엇을 누르면 되는지 적혀 있다', /「수거 입력으로」 단추를 눌러 주세요/.test(s3.hands ?? ''), String(s3.hands))
  ok('ⓑ ③단계가 실제 미션 단추를 짚는다', (await p.locator('[data-coach-go="collect-today"][data-tour="coach-go"]').count()) === 1)

  //  ⚠⚠ 이 검사가 이번 작업의 핵심 — 투어가 떠 있어도 그 단추가 **진짜 눌립니다.**
  await p.locator('[data-coach-go="collect-today"]').click()
  await p.waitForTimeout(2200)
  const s4 = await stepInfo(p)
  ok('ⓒ **투어 중에도 그 단추가 실제로 눌린다**', s4.path === '/collection', s4.path)
  ok('ⓔ 누르면 ④단계로 따라온다 (되돌려 끌고 오지 않음)', /4 \/ 6/.test(s4.no) && /수거 1건 입력/.test(s4.title), `${s4.no} ${s4.title}`)
  ok('ⓔ 받은 일이 발행 기록으로 남는다', state.writes.some((w) => /ax_coach_missions/.test(w.url ?? '')), JSON.stringify(state.writes.slice(0, 3)))
  ok('ⓑ ④단계도 직접 누르는 단계', !!s4.hands && /저장을 눌러 주세요/.test(s4.hands), String(s4.hands))
  ok('ⓑ ④단계에서 이것이 실제 기록이라고 말한다', /오늘의 실제 기록/.test(flat(await p.textContent('[data-tour-linked]'))))
  await ctx.close()
}

console.log('── ⓕ ④→⑤ 저장하면 결과 단계로 ──')
{
  //  ⚠ 저장은 흉내 낸 RPC 입니다 — 실제 자료는 건드리지 않습니다.
  const { ctx, p, state } = await open('/collection', { routes: { ax_coach_missions: [] } })
  //  투어를 ④단계 자리에서 시작한 것과 같은 상태로 만들기 위해 시연 화면에서 켭니다.
  await p.goto(`${W.BASE}/presentation`, { waitUntil: 'domcontentloaded' })
  await W.settle(p, state)
  await p.locator('[data-demo-tour] [data-tour-start]').click()
  await p.waitForTimeout(1600)
  for (let i = 0; i < 2; i += 1) { await p.locator('[data-tour-next]').click(); await p.waitForTimeout(1500) }
  await p.locator('[data-coach-go="collect-today"]').click()
  await p.waitForTimeout(2200)
  ok('ⓕ ④단계 (수거 입력)', /4 \/ 6/.test(flat(await p.textContent('[data-tour-step]'))))

  //  실제 저장 — 오늘 예정이 하나라 화면이 그 건을 이미 골라 둡니다.
  //  ⚠ 수거량이 있어야 저장 단추가 켜집니다 (canSubmit).
  const save = p.locator('[data-collect-save]')
  await save.waitFor({ state: 'visible', timeout: 8000 })
  //  거래처·차량·수거량 — 대표님이 시연에서 실제로 채우시는 세 칸입니다.
  //  ⚠ 투어 덮개가 떠 있는 상태에서 채워집니다 (④단계는 뚫려 있어야 합니다).
  await p.locator('select').first().selectOption(C0)
  await p.waitForTimeout(500)
  await p.locator('select').nth(1).selectOption('v1')
  await p.locator('[data-actual-amount]').fill('70')
  await p.waitForTimeout(600)
  ok('ⓕ 수거량을 넣으면 저장 단추가 켜진다', await save.isEnabled())
  //  ⚠⚠ 투어 ④단계가 떠 있는 상태에서 **실제로** 저장 단추가 눌립니다.
  await save.click()
  await p.waitForTimeout(2600)
  const s5 = await stepInfo(p)
  ok('ⓕ 저장 RPC 가 한 번 불렸다', state.rpcCalls.filter((x) => x === 'complete_collection').length === 1, state.rpcCalls.join(','))
  ok('ⓕ **저장이 끝나면 ⑤단계로 저절로 넘어간다**', /5 \/ 6/.test(s5.no), `${s5.no} ${s5.title}`)
  ok('ⓕ ⑤단계는 저장 결과를 짚는다', (await p.locator('[data-tour="collect-done"]').count()) === 1)
  ok('ⓕ ⑤단계는 읽기만 하는 단계', s5.hands === null)
  ok('ⓕ 한 번 입력이 어디까지 갔는지 말한다', /수거이력 · 거래처 최근활동 · 자재 재고/.test(flat(await p.textContent('[data-tour-linked]'))))

  await p.locator('[data-tour-next]').click()
  await p.waitForTimeout(2000)
  const s6 = await stepInfo(p)
  ok('ⓕ ⑥단계는 AX 코치로 돌아온다', s6.path === '/ax-coach' && /실제 기록을 확인/.test(s6.title), `${s6.path} ${s6.title}`)
  ok('ⓕ ⑥단계는 「단추를 눌러서가 아니다」라고 말한다', /단추를 눌러서가 아니라/.test(flat(await p.textContent('[data-tour-linked]'))))
  const last = flat(await p.textContent('[data-tour-next]'))
  ok('ⓕ 마지막은 성과 화면으로 이어진다', /AX 도입 성과 보기/.test(last), last)
  await ctx.close()
}

console.log('── ⓓ 읽기 단계에서는 화면이 안 눌린다 ──')
{
  const { ctx, p } = await open('/presentation', { routes: { ax_coach_missions: [] } })
  await p.locator('[data-demo-tour] [data-tour-start]').click()
  await p.waitForTimeout(1800)
  await p.locator('[data-tour-next]').click()
  await p.waitForTimeout(1800)
  //  ②단계(읽기 전용)에서 아래 화면의 단추를 눌러도 아무 일이 없어야 합니다.
  const before = new URL(p.url()).pathname
  await p.locator('[data-coach-go="collect-today"]').click({ force: true, timeout: 3000 }).catch(() => undefined)
  await p.waitForTimeout(1200)
  ok('ⓓ **읽기 단계에서는 눌러도 화면이 안 바뀐다**', new URL(p.url()).pathname === before, `${before} → ${new URL(p.url()).pathname}`)
  await ctx.close()
}

console.log('── ⓗ 뒤로가기 · 앞으로가기 · 새로고침 ──')
{
  const { ctx, p } = await open('/presentation', { routes: { ax_coach_missions: [] } })
  await p.locator('[data-demo-tour] [data-tour-start]').click()
  await p.waitForTimeout(1400)
  await p.locator('[data-tour-next]').click()
  await p.waitForTimeout(1400)
  await p.locator('[data-tour-next]').click()
  await p.waitForTimeout(1400)
  ok('ⓗ ③단계에서 시작', /3 \/ 6/.test(flat(await p.textContent('[data-tour-step]'))))

  await p.locator('[data-coach-go="collect-today"]').click()
  await p.waitForTimeout(2000)
  ok('ⓗ 눌러서 ④단계', /4 \/ 6/.test(flat(await p.textContent('[data-tour-step]'))))

  //  ⚠⚠ 뒤로가기 — 예전에는 투어가 곧바로 되돌려 놓거나 1단계로 튀었습니다.
  await p.goBack()
  await p.waitForTimeout(1600)
  const back = await stepInfo(p)
  ok('ⓗ **뒤로가기를 누르면 그 화면을 맡는 단계(③)로 돌아간다**', /3 \/ 6/.test(back.no) && back.path === '/ax-coach', `${back.no} ${back.path}`)
  ok('ⓗ 1단계로 튀지 않는다', !/1 \/ 6/.test(back.no), back.no)
  //  그리고 되돌려 끌고 가지 않아야 합니다 — 그대로 ③단계에 머뭅니다.
  await p.waitForTimeout(1200)
  ok('ⓗ 뒤로 간 자리에 그대로 머문다 (끌고 가지 않음)', new URL(p.url()).pathname === '/ax-coach', p.url())

  await p.goForward()
  await p.waitForTimeout(1600)
  const fwd = await stepInfo(p)
  ok('ⓗ **앞으로가기를 누르면 다시 ④단계**', /4 \/ 6/.test(fwd.no) && fwd.path === '/collection', `${fwd.no} ${fwd.path}`)

  //  ⚠ 새로고침 — 심사 자리에서 F5 한 번에 1단계로 돌아가면 시연이 끝납니다.
  await p.reload({ waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(2400)
  const after = await stepInfo(p)
  ok('ⓗ **새로고침해도 같은 단계에서 이어진다**', /4 \/ 6/.test(after.no), `${after.no} ${after.title}`)

  //  끝내면 기억도 지웁니다 — 다음에 열 때 되살아나면 안 됩니다.
  await p.locator('[data-tour-card] button[title="종료"]').click()
  await p.waitForTimeout(600)
  await p.reload({ waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(1800)
  ok('ⓗ 끝낸 뒤 새로고침하면 되살아나지 않는다', (await p.locator('[data-tour-card]').count()) === 0)
  await ctx.close()
}

console.log('── ⓘ 단계 전환이 기다리지 않는다 ──')
{
  const { ctx, p } = await open('/presentation', { routes: { ax_coach_missions: [] } })
  await p.locator('[data-demo-tour] [data-tour-start]').click()
  await p.locator('[data-tour-card]').waitFor({ state: 'visible', timeout: 8000 })
  await p.waitForTimeout(1200)

  //  ①→② 는 화면까지 바뀝니다. 그래도 「기다리는 느낌」이 없어야 합니다.
  const t0 = Date.now()
  await p.locator('[data-tour-next]').click()
  await p.locator('[data-tour-title]:has-text("무엇이 비어 있는가")').waitFor({ state: 'visible', timeout: 8000 })
  const moved = Date.now() - t0
  //  ⚠ 예전에는 앵커를 50ms 씩 두 곳에서 두들겨 단계마다 그만큼 쌓였습니다.
  //    자료 읽기까지 포함한 값이라 넉넉히 잡되, 「기다리는 느낌」은 잡아냅니다.
  ok('ⓘ 화면이 바뀌는 단계도 2초 안에 넘어간다', moved < 2000, `${moved}ms`)

  //  ②→③ 은 같은 화면이라 사실상 즉시여야 합니다.
  const t1 = Date.now()
  await p.locator('[data-tour-next]').click()
  await p.locator('[data-tour-title]:has-text("수거 입력으로")').waitFor({ state: 'visible', timeout: 8000 })
  const same = Date.now() - t1
  ok('ⓘ **같은 화면 안에서는 거의 즉시 넘어간다**', same < 700, `${same}ms`)
  await ctx.close()
}

console.log('── ⓖ 기존 투어는 그대로 ──')
{
  const { ctx, p } = await open('/settings', { routes: { ax_coach_missions: [] } })
  await p.locator('[data-tour-start]').first().click()
  await p.waitForTimeout(1800)
  ok('ⓖ 대표·사무실 투어는 10단계 그대로', /1 \/ 10/.test(flat(await p.textContent('[data-tour-step]'))), flat(await p.textContent('[data-tour-step]')))
  ok('ⓖ **기존 투어에는 직접 누르라는 띠가 없다**', (await p.locator('[data-tour-hands]').count()) === 0)
  //  덮개가 통째로 있어야 예전과 같습니다.
  const blocked = await p.evaluate(() => {
    const dlg = document.querySelector('[role="dialog"]')
    if (!dlg) return false
    return [...dlg.children].some((el) => {
      const r = el.getBoundingClientRect()
      return r.width >= window.innerWidth - 1 && r.height >= window.innerHeight - 1 && !el.hasAttribute('data-tour-spot')
    })
  })
  ok('ⓖ 기존 투어는 화면 전체를 덮는다 (예전 그대로)', blocked)
  //  끝내면 아무것도 남지 않아야 합니다 (check_tourclean 과 같은 기준).
  await p.locator('[data-tour-card] button[title="종료"]').click()
  await p.waitForTimeout(800)
  const residue = await p.evaluate(() => ({
    card: document.querySelectorAll('[data-tour-card]').length,
    dialog: document.querySelectorAll('[role="dialog"]').length,
  }))
  ok('ⓖ 끝내면 덮개·설명이 남지 않는다', residue.card === 0 && residue.dialog === 0, JSON.stringify(residue))
  await ctx.close()
}

await b.close()
console.log(`\ncheck_demotour OK=${pass} FAIL=${fail}`)
process.exit(fail ? 1 : 0)
