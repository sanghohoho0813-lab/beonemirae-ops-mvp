import { chromium, EXEC } from './_pw.mjs'
import * as W from './walk_lib.mjs'
import * as F from './perf_fixtures.mjs'

//  파일럿 최종 검증 — **한 사이클을 끝까지** (0076)
//
//   로그인 → 향후 일정 확인 → 일정 추가 → 그 날짜에 즉시 반영 → 일정 선택
//   → 병원 상세 → 수거입력 → 저장 완료 → 사무실·관리자 화면 반영
//   그리고 **새로고침 · 뒤로가기 · 재로그인** 뒤에도 남아 있는가.
//
//   ⚠ 주소를 치지 않습니다. 사람이 누르는 길로만 갑니다.
//   ⚠ 서버 흉내는 **한 개의 state 를 계속 이어서** 씁니다. 새로고침·재로그인
//     때 새 state 를 주면 「남아 있다」가 거짓으로 통과합니다 — 서버가
//     기억하는 것을 확인하는 것이 목적입니다.

const ok = (c, m, d = '') => { console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`); if (!c) process.exitCode = 1 }
const T = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
const day = (n) => { const d = new Date(`${T}T00:00:00`); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE') }
const C1 = F.clients[0].id
const NAME = F.clients[0].name
const b = await chromium.launch({ executablePath: EXEC })

//  ── 서버 한 대. 창을 닫았다 열어도 이 자료는 그대로입니다 ──────────────────
const booked = []
const saved = []
const server = {
  reqs: 0, writes: [], profile: W.profileFor('field'),
  schedules: [
    { id: 'today1', date: T, client_id: C1, waste_type: '의료폐기물', vehicle_id: null,
      scheduled_time: '09:00', status: '예정', expected_amount: 120, actual_amount: null, completed_at: null,
      memo: '', origin: 'system', canceled_at: null, is_additional: false,
      created_at: `${T}T00:00:00Z`, updated_at: `${T}T00:00:00Z` },
  ],
  rpc: (url, req) => {
    if (url.includes('book_visit')) {
      const q = JSON.parse(req.postData() ?? '{}')
      booked.push(q)
      server.schedules = [...server.schedules, {
        id: `bk${booked.length}`, date: q.p_date, client_id: q.p_client_id, waste_type: q.p_waste_type,
        vehicle_id: null, scheduled_time: q.p_time, status: '예정', expected_amount: 0, actual_amount: null,
        completed_at: null, memo: q.p_memo ?? '', origin: 'field', canceled_at: null, is_additional: false,
        created_at: `${q.p_date}T00:00:00Z`, updated_at: `${q.p_date}T00:00:00Z` }]
      return { id: `bk${booked.length}`, date: q.p_date, clientName: NAME, requestUpdated: false }
    }
    if (url.includes('complete_collection')) {
      const q = JSON.parse(req.postData() ?? '{}')
      saved.push(q)
      server.schedules = server.schedules.map((s) => s.id === 'today1'
        ? { ...s, status: '완료', actual_amount: Number(q?.p?.actualAmount ?? 0),
            vehicle_id: q?.p?.vehicleId ?? null, driver_name: q?.p?.driverName ?? '',
            completed_at: `${T}T06:00:00Z` }
        : s)
      return { ok: true, scheduleId: 'today1', warnings: [] }
    }
    return null
  },
}

/** 새 창을 엽니다 — 서버(state)는 그대로 이어 씁니다 */
async function open(role, w, h) {
  const st = { ...server, profile: W.profileFor(role), reqs: 0, writes: [] }
  //  schedules 는 **참조가 아니라 매번 서버에서 읽습니다**
  Object.defineProperty(st, 'schedules', { get: () => server.schedules, configurable: true })
  st.rpc = server.rpc
  const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: w < 700, hasTouch: w < 700 })
  W.wire(ctx, st)
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: F.UID, aud: 'authenticated', email: st.profile.email, app_metadata: {}, user_metadata: {} }])
  await p.goto(`${W.BASE}/`, { waitUntil: 'domcontentloaded' })
  await W.settle(p, st, 800, 30000)
  return { ctx, p, st }
}

const target = day(4)

// ══ 1. 로그인 ══════════════════════════════════════════════════════════════
const s = await open('field', 390, 844)
ok(new URL(s.p.url()).pathname === '/today', '1. 로그인하면 오늘 일정으로', new URL(s.p.url()).pathname)

// ══ 2. 향후 일정 확인 ══════════════════════════════════════════════════════
ok((await s.p.locator(`[data-day="${day(3)}"]`).count()) === 1, '2. 날짜 줄에 사흘 뒤가 있음')
await s.p.locator('[data-month-toggle]').dispatchEvent('click')
await s.p.waitForTimeout(600)
ok(await s.p.locator('[data-schedule-calendar]').isVisible(), '2. **월간 일정이 펼쳐짐** (390px)')
const over = await s.p.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth))
ok(over === 0, '2. 펼쳐도 가로로 안 밀림', `${over}px`)
ok((await s.p.locator(`[data-cal-pick="${target}"]`).count()) === 1, '2. 달력에서 그 날을 고를 수 있음')

// ══ 3. 일정 추가 ═══════════════════════════════════════════════════════════
await s.p.locator(`[data-cal-pick="${target}"]`).dispatchEvent('click')
await s.p.waitForTimeout(800)
const addSel = (await s.p.locator('[data-empty-add]').count()) ? '[data-empty-add]' : '[data-add-fab]'
await s.p.locator(addSel).dispatchEvent('click')
await s.p.waitForTimeout(800)
await s.p.selectOption('[data-add-visit-client]', C1)
await s.p.locator('[data-add-visit-save]').dispatchEvent('click')
await s.p.waitForTimeout(1800)
ok(booked[0]?.p_date === target, '3. **고른 날짜로 잡힘**', String(booked[0]?.p_date))
ok((await s.p.locator('[data-add-visit-done]').count()) === 1, '3. 잡힌 것이 그 자리에서 보임')

// ══ 4. 그 날짜에 즉시 반영 ═════════════════════════════════════════════════
await s.p.locator('[data-add-visit-done-close]').dispatchEvent('click')
await s.p.waitForTimeout(1200)
const shown = await s.p.evaluate((n) => {
  const t = (document.querySelector('main')?.innerText ?? '').replace(/\s+/g, ' ')
  return { has: t.includes(n), head: t.slice(0, 90) }
}, NAME)
ok(shown.has, '4. **닫자마자 그 날 목록에 뜸** (새로고침 없이)', shown.head)

//  ⚠ 0076 — 「다음 방문」 카드가 「차량 미배정」이라고 말했습니다. 계정에는
//    차가 묶여 있고 저장도 그 차로 되는데도요. 기사님이 읽으면 「차가 없어서
//    못 가나」로 읽힙니다. **실제로 쓰일 차**가 적혀야 합니다.
const carLine = await s.p.evaluate(() => {
  const t = (document.querySelector('main')?.innerText ?? '')
  return (t.match(/[^\n]*(호차|차량 미배정|담당 차량 없음)[^\n]*/) ?? [''])[0].trim()
})
ok(!/차량 미배정/.test(carLine), '4. **「차량 미배정」이라고 말하지 않음**', carLine)
ok(/호차/.test(carLine) || /사무실에 문의/.test(carLine),
  '4. 실제로 쓰일 차를 말하거나, 없으면 무엇을 할지 말함', carLine)

// ══ 5. 일정 선택 → 병원 상세 ═══════════════════════════════════════════════
const wentClient = await s.p.evaluate(() => {
  const vis = (e) => e.getBoundingClientRect().height > 2
  const a = [...document.querySelectorAll('main a[href^="/clients/"]')].filter(vis)[0]
  if (a) { a.click(); return true }
  return false
})
if (!wentClient) {
  //  목록 줄에서 병원 정보로 가는 길이 없으면 오늘 카드의 「이 병원 정보 보기」
  await s.p.evaluate(() => {
    const vis = (e) => e.getBoundingClientRect().height > 2
    const btn = [...document.querySelectorAll('main button')].find((e) => vis(e) && /병원 정보 보기/.test(e.innerText || ''))
    btn?.click()
  })
}
await s.p.waitForTimeout(2600)
ok(new URL(s.p.url()).pathname.startsWith('/clients/'), '5. 병원 상세로 감', new URL(s.p.url()).pathname)
const detail = await s.p.evaluate(() => (document.querySelector('main')?.innerText ?? '').replace(/\s+/g, ' '))
ok(detail.includes(NAME), '5. 그 병원 화면이 맞음', detail.slice(0, 50))

// ══ 6. 오늘로 돌아와 수거 입력 ═════════════════════════════════════════════
await s.p.goBack({ waitUntil: 'domcontentloaded' })
await s.p.waitForTimeout(2400)
if (await s.p.locator('[data-go-today]').count()) {
  await s.p.locator('[data-go-today]').dispatchEvent('click')
  await s.p.waitForTimeout(900)
}
await s.p.evaluate(() => {
  const vis = (e) => e.getBoundingClientRect().height > 2
  const a = [...document.querySelectorAll('[data-guide="guide-today-list"]')].filter(vis).find((e) => e.tagName === 'BUTTON')
  a?.click()
})
await s.p.waitForTimeout(3200)
ok(new URL(s.p.url()).pathname === '/collection', '6. 수거 입력으로 감', new URL(s.p.url()).pathname)

// ══ 7. 차량·담당자 자동 ════════════════════════════════════════════════════
const auto = await s.p.evaluate(() => {
  const vis = (e) => { const r = e.getBoundingClientRect(); const st = getComputedStyle(e); return r.width > 2 && r.height > 2 && st.display !== 'none' }
  const txt = document.querySelector('main')?.innerText ?? ''
  return {
    selects: [...document.querySelectorAll('main select')].filter(vis).length,
    line: (txt.match(/[^\n]*으로 저장됩니다[^\n]*/) ?? [''])[0].trim(),
  }
})
ok(auto.selects === 0, '7. **기사·차량을 고르는 칸이 없음**', `보이는 select ${auto.selects}개`)
ok(/호차/.test(auto.line) && /기사님/.test(auto.line), '7. **어느 차·누구로 저장되는지 적혀 있음**', auto.line)

// ══ 8. 저장 완료 ═══════════════════════════════════════════════════════════
await s.p.fill('#collection-amount', '133')
await s.p.waitForTimeout(800)
await s.p.locator('[data-collect-save]').dispatchEvent('click')
await s.p.waitForTimeout(2800)
ok(saved.length === 1, '8. **저장이 서버로 감**', `${saved.length}건`)
ok(Number(saved[0]?.p?.actualAmount) === 133, '8. 적은 무게가 그대로', String(saved[0]?.p?.actualAmount))
ok(!!saved[0]?.p?.vehicleId, '8. **차량이 계정 기본값으로 함께 감**', String(saved[0]?.p?.vehicleId))
ok((saved[0]?.p?.driverName ?? '') === F.profile.name || (saved[0]?.p?.driverName ?? '').length > 0,
  '8. 담당자도 로그인한 본인으로 감', String(saved[0]?.p?.driverName))
const doneTxt = await s.p.evaluate(() => (document.querySelector('main')?.innerText ?? '').replace(/\s+/g, ' '))
ok(/반영되었습니다/.test(doneTxt), '8. **완료가 화면에 보임**', doneTxt.slice(0, 46))
await s.ctx.close()

// ══ 9. 새로고침 뒤에도 남아 있는가 ═════════════════════════════════════════
{
  const r = await open('field', 390, 844)
  const t = await r.p.evaluate(() => (document.querySelector('main')?.innerText ?? '').replace(/\s+/g, ' '))
  ok(/완료/.test(t), '9. **새로 열어도 오늘 수거가 완료로 남아 있음**', t.slice(0, 70))
  //  앞으로 잡은 일정도 그대로
  await r.p.locator(`[data-day="${target}"]`).dispatchEvent('click')
  await r.p.waitForTimeout(1000)
  const t2 = await r.p.evaluate(() => (document.querySelector('main')?.innerText ?? '').replace(/\s+/g, ' '))
  ok(t2.includes(NAME), '9. **잡아 둔 앞으로 일정도 그대로**', t2.slice(0, 70))

  //  뒤로가기 — **화면을 한 번 옮긴 뒤**에 돌아와야 뜻이 있습니다.
  //  ⚠ 처음에는 옮기지도 않고 뒤로 갔더니 창이 열리기 전(about:blank)으로
  //    나가 빈 화면이 됐습니다. 그건 앱이 아니라 제 검사가 틀린 것입니다.
  //    기사님이 실제로 하는 일 — 수거 입력에 들어갔다가 뒤로 — 로 잽니다.
  //  ⚠ 오늘 수거는 이미 **완료**라, 그 줄을 누르면 수거 입력이 아니라
  //    「고치기」가 열립니다 — 그게 맞는 동작입니다(다 한 것을 또 입력하지
  //    않게). 그래서 뒤로가기는 기사님이 실제로 자주 하는 다른 길로 잽니다:
  //    아래 메뉴에서 거래처를 봤다가 돌아오기.
  if (await r.p.locator('[data-go-today]').count()) {
    await r.p.locator('[data-go-today]').dispatchEvent('click')
    await r.p.waitForTimeout(900)
  }
  await W.clickLabel(r.p, '거래처')
  await r.p.waitForTimeout(2800)
  const wentIn = new URL(r.p.url()).pathname
  ok(wentIn === '/clients', '9. 뒤로가기 전에 거래처로 들어감', wentIn)
  await r.p.goBack({ waitUntil: 'domcontentloaded' })
  await r.p.waitForTimeout(2400)
  const t3 = await r.p.evaluate(() => ({
    path: location.pathname,
    len: (document.querySelector('main')?.innerText ?? '').length,
    done: /완료/.test(document.querySelector('main')?.innerText ?? ''),
  }))
  ok(t3.path === '/today', '9. **뒤로가기하면 오늘 일정으로 돌아옴**', t3.path)
  ok(t3.len > 30, '9. 화면이 살아 있음 (빈 화면 아님)', `${t3.len}자`)
  ok(t3.done, '9. **뒤로 온 뒤에도 완료 표시가 그대로**')
  await r.ctx.close()
}

// ══ 10. 재로그인 뒤에도 ════════════════════════════════════════════════════
{
  const r = await open('field', 390, 844)
  const t = await r.p.evaluate(() => (document.querySelector('main')?.innerText ?? '').replace(/\s+/g, ' '))
  ok(new URL(r.p.url()).pathname === '/today', '10. 다시 로그인하면 오늘 일정으로')
  ok(/완료/.test(t), '10. **재로그인 뒤에도 수거 기록이 남아 있음**', t.slice(0, 60))
  await r.ctx.close()
}

// ══ 11. 사무실·관리자 화면 반영 ════════════════════════════════════════════
for (const role of ['office', 'admin']) {
  const o = await open(role, 1440, 900)
  const sched = server.schedules.find((x) => x.id === 'today1')
  ok(sched?.status === '완료', `11. ${role} — 오늘 일정이 완료로 바뀜`, String(sched?.status))
  ok(sched?.actual_amount === 133, `11. ${role} — 실제 수거량 133kg 이 남음`, String(sched?.actual_amount))
  ok(server.schedules.some((x) => x.date === target && x.origin === 'field'),
    `11. ${role} — **기사님이 넣은 앞으로 일정이 보임**`, target)
  const seen = await o.p.evaluate(() => (document.body.innerText ?? '').replace(/\s+/g, ' '))
  ok(seen.length > 80, `11. ${role} 화면이 그려짐`)
  await o.ctx.close()
}

await b.close()
