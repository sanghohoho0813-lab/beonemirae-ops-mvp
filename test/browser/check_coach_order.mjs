import { chromium, EXEC } from './_pw.mjs'
import * as W from './walk_lib.mjs'
import * as F from './perf_fixtures.mjs'

//  0124 — AX 코치 화면의 **보이는 순서**만 봅니다 (기능·계산은 손대지 않았습니다)
//
//   들어오자마자 3초 안에 「오늘 뭘 해야 하는지」가 읽혀야 합니다.
//    · 준비도 → **오늘 이것만 해주세요** → 무엇이 쌓였고 무엇이 비었나 순서
//    · 제목이 아래 섹션 제목보다 크고 굵다
//    · 「오늘 해야 할 N개」 배지의 N 이 실제 할 일 카드 수와 같다
//    · 실행 영역이 옅은 강조 바탕·테두리로 묶여 있다
//    · 「업무하러 가기」 단추가 52px 이상, 폰에서는 한 줄을 다 쓴다
//    · PC 1440 · 폰 390 둘 다 가로로 밀리지 않는다
//
//   ⚠ 기대값은 화면에서 **직접 재서** 비교합니다 — 숫자를 적어 두지 않습니다.

let pass = 0
let fail = 0
const ok = (name, cond, detail = '') => {
  if (cond) pass += 1
  else fail += 1
  console.log(`${cond ? ' OK ' : 'FAIL'} | ${name}${detail && !cond ? ` — ${detail}` : ''}`)
}
const b = await chromium.launch({ executablePath: EXEC })
const TODAY = F.TODAY
const C0 = F.clients[0].id

//  오늘 갈 곳 한 건 — 할 일이 생기게 하는 최소 자료
const PENDING = [{
  id: 'sx', date: TODAY, client_id: C0, waste_type: '의료폐기물', vehicle_id: 'v1', scheduled_time: '10:00',
  status: '예정', expected_amount: 80, actual_amount: null, completed_at: null, memo: '', origin: 'field',
  is_additional: false, demo_session_id: null, plan_batch: null, handover_status: null, driver_name: '1호기사',
  created_at: `${TODAY}T00:00:00Z`, updated_at: `${TODAY}T00:00:00Z`,
}]

async function open(width) {
  const prof = { ...W.profileFor('admin'), font_scale: 'normal' }
  const state = { profile: prof, reqs: 0, writes: [], schemaVersion: 108, schedules: PENDING }
  const ctx = await b.newContext({
    viewport: { width, height: width < 640 ? 844 : 900 },
    isMobile: width < 640,
    hasTouch: width < 640,
  })
  W.wire(ctx, state)
  await ctx.route('**/rest/v1/ax_coach_missions*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => {
    window.localStorage.setItem(k, JSON.stringify({ access_token: 't', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u }))
    window.localStorage.setItem('beonemirae-ops:tour-seen', 'staff,field,client')
  }, ['beonemirae-ops:auth', { id: prof.id, aud: 'authenticated', email: prof.email, app_metadata: {}, user_metadata: {} }])
  await p.goto(`${W.BASE}/ax-coach`, { waitUntil: 'domcontentloaded' })
  await W.settle(p, state)
  await p.locator('[data-coach-today]').waitFor({ state: 'visible', timeout: 15000 })
  await p.waitForTimeout(400)
  return { ctx, p }
}

for (const width of [1440, 390]) {
  console.log(`\n── ${width}px ─────────────────────────────────────────`)
  const { ctx, p } = await open(width)

  //  ① 세로 순서 — 준비도 → 오늘 할 일 → 네 갈래
  const top = await p.evaluate(() => {
    const y = (sel) => {
      const el = document.querySelector(sel)
      return el ? Math.round(el.getBoundingClientRect().top + window.scrollY) : null
    }
    return { total: y('[data-coach-total]'), today: y('[data-coach-today]'), area: y('[data-coach-area="work"]') }
  })
  ok('① 준비도가 맨 위', top.total != null && top.total < (top.today ?? Infinity), JSON.stringify(top))
  ok('① **오늘 할 일이 준비도 바로 아래** (네 갈래보다 위)', top.today != null && top.area != null && top.today < top.area, JSON.stringify(top))

  //  준비도와 오늘 할 일 사이에 다른 덩어리가 끼어 있지 않은지 — 간격으로 봅니다
  const gap = await p.evaluate(() => {
    const t = document.querySelector('[data-coach-total]')
    const d = document.querySelector('[data-coach-today]')
    if (!t || !d) return null
    return Math.round(d.getBoundingClientRect().top - t.getBoundingClientRect().bottom)
  })
  ok('① 둘 사이에 다른 카드가 끼어 있지 않음', gap != null && gap >= 0 && gap < 80, `${gap}px`)

  //  ② 제목 크기·굵기 — 아래 섹션 제목보다 커야 합니다
  const title = await p.evaluate(() => {
    const el = document.querySelector('[data-coach-today-title]')
    const others = [...document.querySelectorAll('h2')].filter((h) => h !== el && h.getBoundingClientRect().height > 2)
    const sz = (e) => (e ? parseFloat(getComputedStyle(e).fontSize) : 0)
    const wt = (e) => (e ? Number(getComputedStyle(e).fontWeight) : 0)
    return { size: sz(el), weight: wt(el), maxOther: Math.max(0, ...others.map(sz)), text: (el?.textContent ?? '').trim() }
  })
  ok('② 제목이 「오늘 이것만 해주세요」', title.text === '오늘 이것만 해주세요', title.text)
  ok('② 제목이 다른 섹션 제목보다 큼', title.size > title.maxOther, `${title.size}px > ${title.maxOther}px`)
  ok('② 제목이 굵음 (700 이상)', title.weight >= 700, String(title.weight))

  //  ③ 배지 — 실제 할 일 카드 수와 같은 숫자
  const cards = await p.locator('[data-coach-today] [data-coach-mission]').count()
  const doneCards = await p.locator('[data-coach-done] [data-coach-mission]').count()
  const todoCards = cards - doneCards
  const badge = (await p.locator('[data-coach-today-count]').innerText().catch(() => '')).replace(/\s+/g, ' ').trim()
  ok('③ 할 일이 1~3개 (기존 규칙 그대로)', todoCards >= 1 && todoCards <= 3, String(todoCards))
  ok('③ **배지의 숫자가 실제 카드 수와 같음**', badge === `오늘 해야 할 ${todoCards}개`, `${badge} / 카드 ${todoCards}개`)

  //  ④ 강조 Surface / Accent Border
  const surface = await p.evaluate(() => {
    const el = document.querySelector('[data-coach-today]')
    if (!el) return null
    const st = getComputedStyle(el)
    return { border: st.borderTopWidth, bg: st.backgroundColor, radius: st.borderTopLeftRadius }
  })
  ok('④ 실행 영역에 테두리가 있음', parseFloat(surface?.border ?? '0') >= 1.5, JSON.stringify(surface))
  ok('④ 실행 영역 바탕이 흰색·투명이 아님', !!surface && surface.bg !== 'rgba(0, 0, 0, 0)' && surface.bg !== 'rgb(255, 255, 255)', String(surface?.bg))

  //  ⑤ CTA — 크고 명확하게
  const cta = await p.evaluate(() => {
    const el = document.querySelector('[data-coach-today] [data-coach-go]')
    const box = el?.getBoundingClientRect()
    const wrap = el?.closest('[data-coach-mission]')?.getBoundingClientRect()
    return el ? { h: Math.round(box.height), w: Math.round(box.width), cardW: Math.round(wrap?.width ?? 0), size: parseFloat(getComputedStyle(el).fontSize) } : null
  })
  ok('⑤ CTA 높이 52px 이상', (cta?.h ?? 0) >= 52, `${cta?.h}px`)
  ok('⑤ CTA 글자 17px 이상', (cta?.size ?? 0) >= 17, `${cta?.size}px`)
  if (width < 640) ok('⑤ 폰에서는 CTA 가 한 줄을 다 씀', (cta?.w ?? 0) >= (cta?.cardW ?? 0) * 0.7, `${cta?.w} / ${cta?.cardW}`)
  else ok('⑤ PC 에서는 CTA 가 글자 폭만큼만', (cta?.w ?? 0) < (cta?.cardW ?? 0) * 0.7, `${cta?.w} / ${cta?.cardW}`)

  //  ⑥ 「무엇이 쌓였고 무엇이 비었나」는 아래에 그대로 있음 (없애지 않았습니다)
  const areas = await p.locator('[data-coach-area]').count()
  ok('⑥ 네 갈래가 그대로 4개', areas === 4, String(areas))
  ok('⑥ 제목이 아래에 있음', /무엇이 쌓였고 무엇이 비었나/.test(await p.evaluate(() => document.querySelector('main')?.innerText ?? '')))

  //  ⑦ 가로 밀림 0
  const of = await p.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth))
  ok('⑦ 가로로 안 밀림', of === 0, `${of}px`)

  await ctx.close()
}

console.log(`\n합계 ${pass + fail}검사 · 실패 ${fail}`)
await b.close()
if (fail > 0) process.exitCode = 1
