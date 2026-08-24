import { chromium, EXEC } from './_pw.mjs'

//  오늘 일정 — 매일 아침 여는 화면.
//
//   실측에서 나온 것 (390×844 · 오늘 일정 15건)
//    첫 화면에 **일정 카드가 하나도 없었습니다.** 「시작하기」 체크리스트와
//    소개 배너가 화면을 통째로 채웠고, 「오늘 일정」 제목조차 y=1007px 에
//    있었습니다. 기사가 오늘 첫 방문지를 보려면 매일 스크롤해야 했습니다.
//    PC(1440)에서도 첫 일정 카드가 y=925px 이었습니다.
//
//   확인하는 것
//    · 오늘 일정에는 안내물이 없다 (제목이 화면 맨 위)
//    · 그렇다고 없앤 게 아니다 — 대시보드에는 그대로 있다
//    · 「첫 수거 완료 입력」이 엑셀로 가져온 완료 수거도 인정한다

const BASE = 'http://localhost:4173'
const UID = '00000000-0000-0000-0000-0000000000ad'
const out = []
const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  out.push(c)
  if (!c) process.exitCode = 1
}
const TODAY = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })

const profile = {
  id: UID, email: 'a@b.c', name: '대표', role: 'admin', font_scale: 'normal',
  active: true, approved_at: '2026-01-01T00:00:00Z', client_id: null, created_at: '2026-01-01T00:00:00Z',
}
const CA = '00000000-0000-0000-0000-0000000000a1'
const clients = [{
  id: CA, name: '가나요양병원', type: '병원', address: '서울시 강남구', manager: '원무과',
  phone: '02-000-0000', collection_cycle: '주 2회', collects_medical_waste: true, collects_diaper: false,
  storage_size: '보통', note: '', is_demo_generated: false, demo_session_id: null, active: true,
  contract_start: '2025-01-01', contract_end: null, payment_terms: '', payment_due_day: 25,
  pricing: {}, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  collect_time: '', disposal_site: '', diaper_cycle: '',
}]
const vehicles = [{
  id: 'v1', name: '1호차', waste_type: '의료폐기물', tonnage: 1.2, nominal_capacity: 1500,
  expected_capacity: 1200, driver: '이기사', active: true,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}]
//  엑셀에서 가져온 모양 — 완료된 수거는 있는데 「수거 입력 이벤트」는 없습니다.
const schedules = [
  { id: 's1', date: TODAY, client_id: CA, waste_type: '의료폐기물', vehicle_id: 'v1', scheduled_time: '10:00',
    status: '완료', expected_amount: 100, actual_amount: 118, completed_at: `${TODAY}T01:00:00Z`, memo: '',
    origin: 'import', is_additional: false, demo_session_id: null, plan_batch: null,
    handover_status: '인계 완료', driver_name: '이기사',
    created_at: `${TODAY}T00:00:00Z`, updated_at: `${TODAY}T00:00:00Z` },
  { id: 's2', date: TODAY, client_id: CA, waste_type: '의료폐기물', vehicle_id: 'v1', scheduled_time: '14:00',
    status: '예정', expected_amount: 90, actual_amount: null, completed_at: null, memo: '',
    origin: 'plan', is_additional: false, demo_session_id: null, plan_batch: null,
    handover_status: null, driver_name: '이기사',
    created_at: `${TODAY}T00:00:00Z`, updated_at: `${TODAY}T00:00:00Z` },
]

const b = await chromium.launch({ executablePath: EXEC })
function wire(ctx, role = 'admin') {
  ctx.route('**/auth/v1/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: UID, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }) }))
  ctx.route('**/rest/v1/**', (r) => {
    const url = r.request().url()
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const pf = { ...profile, role }
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    if (url.includes('/rpc/app_schema_version')) return json(64)
    if (url.includes('/profiles')) return json(single ? pf : [pf])
    if (url.includes('/schedules')) return json(schedules)
    if (url.includes('/vehicles')) return json(vehicles)
    if (url.includes('/clients')) return json(single ? clients[0] : clients)
    if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
    return json([])
  })
}
async function open(ctx, path) {
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: UID, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }])
  await p.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(2200)
  return p
}
const headY = (p) => p.evaluate(() => {
  const h = [...document.querySelectorAll('h1,h2')].find((e) => e.textContent.trim() === '오늘 일정')
  return h ? Math.round(h.getBoundingClientRect().top + window.scrollY) : -1
})

// ── 1. 폰 ─────────────────────────────────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
  wire(ctx)
  const p = await open(ctx, '/today')
  const body = ((await p.textContent('body')) ?? '').replace(/\s+/g, ' ')
  ok(!/시작하기/.test(body), '폰 오늘 일정에 「시작하기」 체크리스트가 없음')
  ok(!/비원미래 AX 운영시스템/.test(body), '폰 오늘 일정에 소개 배너가 없음')
  const y = await headY(p)
  ok(y >= 0 && y < 200, '「오늘 일정」 제목이 첫 화면 맨 위에 있음 (예전 1007px)', `y=${y}px`)
  //  첫 화면 안에 실제 일정이 보이는가 — 이게 이 화면의 목적입니다
  const seen = await p.evaluate(() => {
    const hit = [...document.querySelectorAll('*')].filter(
      (e) => e.children.length === 0 && /가나요양병원/.test(e.textContent ?? ''))
    return hit.some((e) => {
      const r = e.getBoundingClientRect()
      return r.top >= 0 && r.top < window.innerHeight && r.height > 0
    })
  })
  ok(seen, '스크롤하지 않고도 오늘 갈 거래처가 보임')
  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  ok(over <= 1, '390px 폭에서 가로 스크롤 없음', `초과 ${over}px`)
  await p.screenshot({ path: 'today_mo.png' })
  await ctx.close()
}

// ── 2. PC ─────────────────────────────────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
  wire(ctx)
  const p = await open(ctx, '/today')
  const y = await headY(p)
  ok(y >= 0 && y < 200, 'PC 에서도 제목이 맨 위 (예전 717px)', `y=${y}px`)
  const cardY = await p.evaluate(() => {
    const c = document.querySelector('[data-tour="today-list"]')
    return c ? Math.round(c.getBoundingClientRect().top + window.scrollY) : -1
  })
  ok(cardY > 0 && cardY < 500, '첫 일정 카드가 첫 화면 안에 있음 (예전 925px)', `y=${cardY}px`)
  await p.screenshot({ path: 'today_pc.png' })
  await ctx.close()
}

// ── 3. 없앤 게 아니라 옮긴 것 ─────────────────────────────────────────────
//   기능을 숨겨서 업무가 불가능해지면 안 됩니다. 대시보드에는 그대로 있어야
//   하고, 「도입 전 기준값 입력」처럼 아직 안 끝난 줄은 계속 보여야 합니다.
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
  wire(ctx)
  const p = await open(ctx, '/')
  const body = ((await p.textContent('body')) ?? '').replace(/\s+/g, ' ')
  //  0080 — 이미 굴러가는 회사에서는 큰 카드가 **한 줄로 줄어듭니다.**
  //  없어진 것이 아니라 자리를 덜 차지하는 것이라, 둘 중 하나는 있어야
  //  합니다. (한 줄로 줄었는지 자체는 check_pilot80 이 봅니다)
  const startHere =
    (await p.locator('[data-start-here-mini]').count()) +
    (await p.locator('[data-start-here-full]').count())
  ok(startHere === 1, '대시보드에는 「시작하기」가 그대로 있음 (한 줄이든 카드든)', `${startHere}개`)
  ok(/도입 전 기준값 입력/.test(body), '아직 안 끝난 줄이 계속 보임')
  //  ── 엑셀로 가져온 완료 수거도 「첫 수거 완료 입력」으로 인정 ──────────
  //   예전에는 수거 입력 이벤트만 봤습니다. 엑셀로 수천 건을 가져온 회사도
  //   이 줄이 영원히 「안 끝남」이었습니다 — 이미 다 해 본 일을 매일
  //   「아직 안 했다」고 말하는 셈입니다.
  const doneFirst = await p.evaluate(() => {
    //  한 줄로 줄었을 때는 **남은 것만** 적습니다 — 거기 없으면 끝난 것입니다.
    const mini = document.querySelector('[data-start-here-mini]')
    if (mini) return !/첫 수거 완료 입력/.test(mini.textContent ?? '')
    const el = [...document.querySelectorAll('p')].find((e) => e.textContent.trim() === '첫 수거 완료 입력')
    return el ? getComputedStyle(el).textDecorationLine.includes('line-through') : null
  })
  ok(doneFirst === true, '엑셀로 가져온 완료 수거만으로도 「첫 수거 완료 입력」이 끝남',
    doneFirst === null ? '줄을 못 찾음' : '취소선')
  await ctx.close()
}

// ── 4. 현장 담당자 (회귀) ─────────────────────────────────────────────────
//   현장 담당자에게는 원래도 「시작하기」가 안 보입니다. 그대로여야 합니다.
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
  wire(ctx, 'field')
  const p = await open(ctx, '/today')
  const body = ((await p.textContent('body')) ?? '').replace(/\s+/g, ' ')
  ok(!/시작하기/.test(body), '현장 담당자 폰에도 「시작하기」 없음 (예전과 같음)')
  ok(/가나요양병원/.test(body), '현장 담당자도 오늘 일정은 그대로 봄')
  await ctx.close()
}

await b.close()
console.log(`\n총 ${out.length}건 · 실패 ${out.filter((x) => !x).length}건`)
