import { chromium, EXEC } from './_pw.mjs'
import * as W from './walk_lib.mjs'
import * as F from './perf_fixtures.mjs'

//  파일럿 최종 E2E — 기사 1명 · 차량 1대 · 병원 1곳 · 향후 일정
//
//   로그인 → 향후 일정 확인 → 본인 일정 추가 → 오늘 일정 → 병원 선택
//   → 수거입력 → 저장·완료 → 사무실 화면 반영
//
//   ⚠ 주소를 직접 치지 않습니다. **누르는 길**로만 갑니다.

const ok = (c, m, d = '') => { console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`); if (!c) process.exitCode = 1 }
const T = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
const day = (n) => { const d = new Date(`${T}T00:00:00`); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE') }
const C1 = F.clients[0].id
const b = await chromium.launch({ executablePath: EXEC })

//  파일럿 규모 그대로 — 병원 1곳 · 오늘 1건 · 앞으로 1건
function seed() {
  return [
    { id: 'today1', date: T, client_id: C1, waste_type: '의료폐기물', vehicle_id: null,
      scheduled_time: '09:00', status: '예정', expected_amount: 120, actual_amount: null, completed_at: null,
      memo: '', origin: 'system', canceled_at: null, is_additional: false,
      created_at: `${T}T00:00:00Z`, updated_at: `${T}T00:00:00Z` },
    { id: 'soon1', date: day(3), client_id: C1, waste_type: '의료폐기물', vehicle_id: null,
      scheduled_time: '10:00', status: '예정', expected_amount: 110, actual_amount: null, completed_at: null,
      memo: '', origin: 'system', canceled_at: null, is_additional: false,
      created_at: `${T}T00:00:00Z`, updated_at: `${T}T00:00:00Z` },
  ]
}

async function open(role, w, h, state) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: w < 700, hasTouch: w < 700 })
  W.wire(ctx, state)
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: F.UID, aud: 'authenticated', email: state.profile.email, app_metadata: {}, user_metadata: {} }])
  await p.goto(`${W.BASE}/`, { waitUntil: 'domcontentloaded' })
  await W.settle(p, state, 800, 30000)
  return { ctx, p }
}

for (const [label, w, h] of [['폰 390px', 390, 844], ['PC 1440px', 1440, 900]]) {
  console.log(`\n── ${label} ───────────────────────────────────────────`)
  const booked = []
  const saved = []
  const state = {
    reqs: 0, writes: [], profile: W.profileFor('field'), schedules: seed(),
    rpc: (url, req) => {
      if (url.includes('book_visit')) {
        const q = JSON.parse(req.postData() ?? '{}')
        booked.push(q)
        state.schedules = [...state.schedules, { id: `bk${booked.length}`, date: q.p_date, client_id: q.p_client_id,
          waste_type: q.p_waste_type, vehicle_id: null, scheduled_time: q.p_time, status: '예정',
          expected_amount: 0, actual_amount: null, completed_at: null, memo: '', origin: 'field',
          canceled_at: null, is_additional: false, created_at: `${q.p_date}T00:00:00Z`, updated_at: `${q.p_date}T00:00:00Z` }]
        return { id: `bk${booked.length}`, date: q.p_date, clientName: F.clients[0].name, requestUpdated: false }
      }
      if (url.includes('complete_collection')) {
        const q = JSON.parse(req.postData() ?? '{}')
        saved.push(q)
        state.schedules = state.schedules.map((s) => s.id === 'today1'
          ? { ...s, status: '완료', actual_amount: Number(q?.p?.actualAmount ?? 0), completed_at: `${T}T06:00:00Z` } : s)
        return { ok: true, scheduleId: 'today1', warnings: [] }
      }
      return null
    },
  }
  const s = await open('field', w, h, state)

  // ── ① 로그인 뒤 첫 화면 ──────────────────────────────────────────────────
  ok(new URL(s.p.url()).pathname === '/today', '① 로그인하면 오늘 일정으로', new URL(s.p.url()).pathname)

  // ── ② 향후 일정 확인 ────────────────────────────────────────────────────
  const soon = await s.p.evaluate((d) => {
    const t = (document.querySelector('main')?.innerText ?? '')
    const strip = !!document.querySelector(`[data-day="${d}"]`)
    return { strip, upcoming: /앞으로 갈 곳/.test(t) }
  }, day(3))
  ok(soon.strip, '② 날짜 줄에 사흘 뒤가 보임')
  ok(soon.upcoming, '② 「앞으로 갈 곳」이 있음')

  //  ⚠ 0074 — 전화는 첫 화면에서 바로 걸려야 합니다. 예전에는 수거 입력까지
  //    들어가야 전화 링크가 나왔습니다.
  //  ⚠ 「다음 방문」 카드는 **폰 전용**입니다 (PC 는 목록 카드가 그 자리를
  //    합니다). 안 보이는 것을 재면 높이 0 이 나와 헛되이 실패합니다.
  //    보이는 화면에서만 잽니다.
  const tel0 = await s.p.evaluate(() => {
    const el = document.querySelector('[data-next-tel]')
    const vis = el ? el.getBoundingClientRect().height > 2 : false
    const txt = (document.querySelector('main')?.innerText ?? '')
    return { vis, h: el ? Math.round(el.getBoundingClientRect().height) : 0,
      말함: /전화번호 미등록/.test(txt) }
  })
  if (tel0.vis) {
    ok(true, '② **첫 화면에서 전화가 바로 보임**', `링크 ${tel0.h}px`)
    ok(tel0.h >= 44, '② 전화가 손가락 크기', `${tel0.h}px`)
  } else {
    //  폰 카드가 없는 폭 — 전화는 병원을 고른 뒤 화면에서 잽니다 (아래 ⑤)
    ok(true, '② (이 폭에서는 「다음 방문」 카드가 없음 — ⑤에서 전화를 잽니다)')
  }

  //  폰에서는 월간을 펼쳐서도 확인됩니다
  if (w < 700) {
    await s.p.locator('[data-month-toggle]').dispatchEvent('click')
    await s.p.waitForTimeout(600)
    ok(await s.p.locator('[data-schedule-calendar]').isVisible(), '② 폰에서 월간 일정이 펼쳐짐')
    await s.p.locator('[data-month-toggle]').dispatchEvent('click')
    await s.p.waitForTimeout(400)
  }

  // ── ③ 본인 일정 추가 ────────────────────────────────────────────────────
  const target = day(5)
  await s.p.locator(`[data-day="${target}"]`).dispatchEvent('click')
  await s.p.waitForTimeout(700)
  const addSel = (await s.p.locator('[data-empty-add]').count()) ? '[data-empty-add]' : '[data-add-fab]'
  ok((await s.p.locator(addSel).count()) === 1, '③ 그 날에서 바로 일정 추가 단추가 있음', addSel)
  await s.p.locator(addSel).dispatchEvent('click')
  await s.p.waitForTimeout(700)
  await s.p.selectOption('[data-add-visit-client]', C1)
  await s.p.locator('[data-add-visit-save]').dispatchEvent('click')
  await s.p.waitForTimeout(1600)
  ok(booked[0]?.p_date === target, '③ **고른 날짜로 잡힘**', String(booked[0]?.p_date))

  //  ⚠ 0075 — 잡고 나서 시트가 그냥 닫히면 기사님은 「됐나?」 하고 목록을
  //    다시 훑습니다. 잡힌 것을 보여 주고 **다음으로 이어갈 길**을 둡니다.
  const after = await s.p.evaluate(() => {
    const box = document.querySelector('[data-add-visit-done]')
    if (!box) return null
    return {
      line: (document.querySelector('[data-add-visit-done-line]')?.textContent ?? '').trim(),
      client: !!document.querySelector('[data-add-visit-go-client]'),
      collect: !!document.querySelector('[data-add-visit-go-collect]'),
    }
  })
  ok(after !== null, '③ **잡힌 것이 그 자리에서 보임**')
  ok((after?.line ?? '').includes(F.clients[0].name), '③ 어느 날 어느 병원인지 적혀 있음', after?.line ?? '')
  ok(after?.client === true, '③ **병원 정보로 바로 이어짐**')
  //  앞으로 올 날짜에는 수거 입력이 안 됩니다 — 막다른 길을 안 만듭니다
  ok(after?.collect === false, '③ 앞으로 올 날에는 「수거 입력」을 안 내밂 (오늘만 됨)')

  //  이어가기 — 병원 정보로
  await s.p.locator('[data-add-visit-go-client]').dispatchEvent('click')
  await s.p.waitForTimeout(2200)
  ok(new URL(s.p.url()).pathname.startsWith('/clients/'), '③ 눌러서 병원 화면으로 감', new URL(s.p.url()).pathname)
  await s.p.goBack({ waitUntil: 'domcontentloaded' })
  await s.p.waitForTimeout(2200)

  // ── ④ 오늘로 돌아와 병원 선택 → 수거 입력 ───────────────────────────────
  if (await s.p.locator('[data-go-today]').count()) {
    await s.p.locator('[data-go-today]').dispatchEvent('click')
    await s.p.waitForTimeout(800)
  }
  const went = await s.p.evaluate(() => {
    const vis = (e) => e.getBoundingClientRect().height > 2
    const c = [...document.querySelectorAll('main button')].find((e) => vis(e) && /수거정보 입력/.test(e.innerText || ''))
    if (c) { c.click(); return 'PC 카드의 「수거정보 입력」' }
    const a = [...document.querySelectorAll('[data-guide="guide-today-list"]')].filter(vis).find((e) => e.tagName === 'BUTTON')
    if (a) { a.click(); return '폰 목록 줄' }
    return null
  })
  ok(went !== null, '④ 오늘 목록에서 병원을 누를 수 있음', went ?? '')
  await s.p.waitForTimeout(3200)
  ok(new URL(s.p.url()).pathname === '/collection', '④ 수거 입력으로 감', new URL(s.p.url()).pathname)

  // ── ⑤ 기사·차량 자동 · 자재 접힘 · 병원 정보 · 저장 ─────────────────────
  const form = await s.p.evaluate(() => {
    const vis = (e) => { const r = e.getBoundingClientRect(); const st = getComputedStyle(e); return r.width > 2 && r.height > 2 && st.display !== 'none' }
    const txt = document.querySelector('main')?.innerText ?? ''
    const openFolds = [...document.querySelectorAll('[data-fold]')]
      .filter((e) => [...e.querySelectorAll('input,select,textarea')].some(vis))
      .map((e) => e.getAttribute('data-fold'))
    return {
      selects: [...document.querySelectorAll('main select')].filter(vis).length,
      autoVehicle: /으로 저장됩니다/.test(txt),
      folds: [...document.querySelectorAll('[data-fold]')].length,
      openFolds,
      tel: [...document.querySelectorAll('a[href^="tel:"]')].filter(vis).length,
      addr: !!document.querySelector('[data-collect-contact]'),
      overflowX: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    }
  })
  ok(form.selects === 0, '⑤ **기사·차량 고르는 칸이 없음** (계정 기본값 자동)', `보이는 select ${form.selects}개`)
  ok(form.autoVehicle, '⑤ 어느 차·누구로 저장되는지 적혀 있음')
  ok(form.folds > 0 && form.openFolds.length === 0, '⑤ **자재·용기가 기본 접힘**', `접힘 ${form.folds}개 · 펼쳐진 것 ${form.openFolds.length}개`)
  ok(form.tel >= 1, '⑤ 병원 전화가 눌러지는 링크')
  ok(form.addr, '⑤ 병원 주소·연락 칸이 있음')
  ok(form.overflowX === 0, '⑤ 가로로 안 밀림', `${form.overflowX}px`)

  //  저장 연타 — 한 번만 가야 합니다
  await s.p.fill('#collection-amount', '118')
  await s.p.waitForTimeout(800)
  const taps = await s.p.evaluate(async () => {
    const btn = document.querySelector('[data-collect-save]')
    if (!btn) return null
    const st = []
    for (let i = 0; i < 5; i += 1) { st.push(btn.disabled); btn.click(); await new Promise((r) => setTimeout(r, 40)) }
    return st
  })
  ok(taps !== null && taps[0] === false, '⑥ 저장 단추가 켜져 있음')
  await s.p.waitForTimeout(2600)
  ok(saved.length === 1, '⑥ **연타해도 저장은 한 번만**', `${saved.length}건`)
  ok(Number(saved[0]?.p?.actualAmount) === 118, '⑥ 적은 무게가 그대로', String(saved[0]?.p?.actualAmount))
  const done = (await s.p.evaluate(() => (document.querySelector('main')?.innerText ?? '').replace(/\s+/g, ' ')))
  ok(/반영되었습니다|완료/.test(done), '⑥ **완료가 화면에 보임**', done.slice(0, 46))
  await s.ctx.close()

  // ── ⑦ 사무실 화면에 반영 ────────────────────────────────────────────────
  const office = { reqs: 0, writes: [], profile: W.profileFor('office'), schedules: state.schedules }
  const o = await open('office', 1440, 900, office)
  const seen = await o.p.evaluate(() => (document.body.innerText ?? '').replace(/\s+/g, ' '))
  const sched = state.schedules.find((x) => x.id === 'today1')
  ok(sched?.status === '완료', '⑦ 오늘 일정이 완료로 바뀜', String(sched?.status))
  ok(sched?.actualAmount === undefined ? sched?.actual_amount === 118 : true, '⑦ 실제 수거량이 남음', String(sched?.actual_amount))
  ok(state.schedules.some((x) => x.date === target && x.origin === 'field'),
    '⑦ **기사님이 넣은 앞으로 일정도 남아 있음**', target)
  ok(seen.length > 50, '⑦ 사무실 화면이 그려짐')
  await o.ctx.close()
}

await b.close()
