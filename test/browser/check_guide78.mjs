import { chromium, EXEC } from './_pw.mjs'

//  0078 — 「오늘 갈 곳 보기」·「앞으로 갈 곳 보기」 안내가 실제 화면을 짚는가
//
//   대표님: 「설명하려는 요소가 현재 화면에 없거나 접혀 있어서 "지금 화면에는
//   이 자리가 없습니다" 같은 안내가 뜬다. 완성도가 많이 떨어져 보인다.」
//
//   그래서 이 검사의 핵심은 하나입니다 —
//     **모든 단계에서 `data-guide-nospot` 이 뜨지 않는다.**
//
//   그리고 대표님이 시키신 순서를 그대로 밟습니다:
//     로그인 → 오늘 일정 → 도움말 → 오늘 갈 곳 → 앞으로 갈 곳 →
//     수거입력하기 → 병원정보보기

const BASE = 'http://localhost:4173'
const FD = '00000000-0000-0000-0000-0000000000f1'
const C1 = '00000000-0000-0000-0000-0000000000a1'
const C2 = '00000000-0000-0000-0000-0000000000a2'
const V3 = '00000000-0000-0000-0000-0000000000v3'
const ok = (c, m, d = '') => { console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`); if (!c) process.exitCode = 1 }
const flat = (t) => (t ?? '').replace(/\s+/g, ' ').trim()
const T = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
const plus = (n) => {
  const d = new Date(`${T}T00:00:00+09:00`)
  d.setDate(d.getDate() + n)
  return d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
}

const mkClient = (id, name) => ({ id, name, type: '병원', address: `경기도 남양주시 오남읍 ${name}`,
  manager: '김', phone: '031-000-0000', collection_cycle: '주 3회', collects_medical_waste: true,
  collects_diaper: true, storage_size: '보통', note: '', is_demo_generated: false, active: true,
  pricing: {}, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' })
const clients = [mkClient(C1, '남양주백병원'), mkClient(C2, '오남한양병원')]
const vehicles = [{ id: V3, name: '3호차', waste_type: '의료폐기물', tonnage: 1, nominal_capacity: 1000,
  expected_capacity: 800, driver: '김준기', active: true }]
const mkSched = (id, date, over = {}) => ({
  id, client_id: C1, date, waste_type: '의료폐기물', vehicle_id: V3, scheduled_time: '09:00',
  status: '예정', expected_amount: 100, actual_amount: null, memo: '', origin: 'system',
  created_at: `${date}T00:10:00Z`, created_by: FD, created_by_name: '김준기',
  created_via: '기사 직접 추가', event_id: null, canceled_at: null, cancel_reason: '', ...over,
})

const b = await chromium.launch({ executablePath: EXEC })

async function open({ scheds } = { scheds: [] }) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const me = { id: FD, email: 'f@b.c', name: '김준기', role: 'field', font_scale: 'normal',
    active: true, approved_at: '2026-01-01T00:00:00Z', client_id: null, vehicle_id: V3,
    created_at: '2026-01-01T00:00:00Z' }
  ctx.route('**/auth/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: FD, aud: 'authenticated', email: 'f@b.c', app_metadata: {}, user_metadata: {} }) }))
  ctx.route('**/rest/v1/**', (r) => {
    const url = r.request().url()
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    if (url.includes('/rpc/app_schema_version')) return json(77)
    if (url.includes('/rpc/')) return json(null)
    if (url.includes('/profiles')) return json(single ? me : [me])
    if (url.includes('/clients')) return json(single ? clients[0] : clients)
    if (url.includes('/vehicles')) return json(single ? vehicles[0] : vehicles)
    if (url.includes('/schedules')) return json(scheds)
    if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
    return json([])
  })
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: FD, aud: 'authenticated', email: 'f@b.c', app_metadata: {}, user_metadata: {} }])
  await p.goto(`${BASE}/today`, { waitUntil: 'domcontentloaded' })
  await p.waitForFunction(() => {
    const t = document.querySelector('main')?.innerText ?? ''
    return t.length > 20 && !/불러오는 중/.test(t)
  }, null, { timeout: 40000 }).catch(() => {})
  await p.waitForTimeout(1300)
  return { ctx, p }
}

/** 도움말 → 그 안내를 고르고, 끝까지 넘기면서 매 단계를 확인합니다 */
async function walk(p, id, label, silentSteps = 0) {
  await p.locator('[data-help-open]').click()
  await p.waitForTimeout(700)
  await p.locator(`[data-guide-pick="${id}"]`).click()
  await p.waitForTimeout(1200)

  ok((await p.locator('[data-guide-on]').count()) === 1, `${label} — 안내가 켜졌다`)
  const total = Number((flat(await p.locator('[data-guide-count]').innerText()).split('/')[1] ?? '0').trim())
  ok(total >= 3, `${label} — 단계가 있다`, `${total}단계`)

  const bad = []
  const noSpot = []
  for (let n = 0; n < total; n += 1) {
    //  ⚠ 펴 주고 짚는 데 시간이 걸립니다 — 실제로 기다려 봅니다.
    await p.waitForTimeout(1100)
    const say = flat(await p.locator('[data-guide-say]').innerText())
    const gone = (await p.locator('[data-guide-nospot]').count()) > 0
    const spot = (await p.locator('[data-guide-spot]').count()) > 0
    if (gone) noSpot.push(`${n + 1}:${say.slice(0, 22)}`)
    //  ⚠ 짚을 곳을 **아예 안 정한** 단계가 있습니다 (병원 상세처럼 화면
    //    전체가 답인 경우). 그건 결함이 아니라 그렇게 만든 것입니다.
    //    그래서 「말만 하는 단계」 몇 개까지 괜찮은지 미리 정해 둡니다.
    if (!spot && !gone) bad.push(`${n + 1}:${say.slice(0, 22)}`)
    if (n < total - 1) {
      await p.locator('[data-guide-next]').click()
    }
  }
  //  ⚠ 이것이 이번 작업의 전부입니다.
  ok(noSpot.length === 0, `${label} — **「이 자리가 없습니다」가 한 번도 안 뜬다**`, noSpot.join(' · ') || '없음')
  ok(bad.length <= silentSteps, `${label} — 짚겠다고 한 단계는 전부 짚는다`,
    bad.length === 0 ? '전부 짚음' : `말만 하는 단계 ${bad.length}개(허용 ${silentSteps}) — ${bad.join(' · ')}`)

  await p.locator('[data-guide-next]').click()
  await p.waitForTimeout(700)
  ok((await p.locator('[data-guide-on]').count()) === 0, `${label} — 「다 봤습니다」로 끝난다`)
}

// ── ① 오늘 갈 곳이 있는 날 ────────────────────────────────────────────────
{
  const { ctx, p } = await open({ scheds: [mkSched('s1', T), mkSched('s2', plus(3)), mkSched('s3', plus(9))] })
  await walk(p, 'today', '오늘 갈 곳')
  await ctx.close()
}

// ── ② 오늘 갈 곳이 **하나도 없는** 날 ─────────────────────────────────────
{
  //  ⚠ 여기가 예전에 깨지던 자리입니다. 목록 자체가 없으니 짚을 것이 없었습니다.
  const { ctx, p } = await open({ scheds: [mkSched('s2', plus(3))] })
  await walk(p, 'today', '오늘 갈 곳(빈 날)')
  await ctx.close()
}

// ── ③ 앞으로 갈 곳 — 접힌 것들을 펴 가며 ──────────────────────────────────
{
  const { ctx, p } = await open({ scheds: [mkSched('s1', T), mkSched('s2', plus(3)), mkSched('s3', plus(9))] })
  //  ⚠ 시작 전에는 접혀 있어야 검사에 뜻이 있습니다.
  ok((await p.locator('[data-upcoming-body]').count()) === 0, '시작 전 「앞으로 갈 곳」은 접혀 있다')
  await walk(p, 'plan', '앞으로 갈 곳')
  await ctx.close()
}
{
  //  펴 주는 것이 실제로 일어났는지 그 단계에서 직접 봅니다.
  const { ctx, p } = await open({ scheds: [mkSched('s1', T), mkSched('s2', plus(3))] })
  await p.locator('[data-help-open]').click()
  await p.waitForTimeout(700)
  await p.locator('[data-guide-pick="plan"]').click()
  await p.waitForTimeout(1200)
  await p.locator('[data-guide-next]').click()   // 2단계 — 앞으로 갈 곳
  await p.waitForTimeout(1400)
  ok((await p.locator('[data-upcoming-body]').count()) === 1,
    '**접혀 있던 「앞으로 갈 곳」을 안내가 펴 준다**')
  await p.locator('[data-guide-next]').click()   // 3단계 — 월간
  await p.waitForTimeout(1400)
  ok(await p.locator('[data-calendar-body] [data-cal-day]').first().isVisible(),
    '**접혀 있던 월간 달력도 펴 준다**')
  await p.locator('[data-guide-next]').click()   // 4단계 — 일정 추가
  await p.waitForTimeout(900)
  //  ⚠ 여기서 **누르지 않고** 「다음」으로 넘어갑니다 — 예전에 깨지던 길입니다.
  await p.locator('[data-guide-next]').click()   // 5단계 — 일정 추가 시트
  await p.waitForTimeout(1600)
  ok((await p.locator('[data-guide="guide-add-sheet"]').count()) === 1,
    '**누르지 않고 넘어와도 「일정 추가」 시트를 열어 준다**')
  ok((await p.locator('[data-guide-nospot]').count()) === 0,
    '그 단계에서도 「이 자리가 없습니다」가 안 뜬다')
  await ctx.close()
}

// ── ④ 손대지 말라고 하신 두 가지는 그대로 ─────────────────────────────────
{
  const { ctx, p } = await open({ scheds: [mkSched('s1', T)] })
  await walk(p, 'collect', '수거 입력')
  await ctx.close()
}
{
  const { ctx, p } = await open({ scheds: [mkSched('s1', T)] })
  //  ⚠ 마지막 단계는 짚을 곳을 안 정했습니다 — 거래처 상세 화면 전체가
  //    답이라 그렇게 두었습니다. 대표님이 「병원 정보보기는 잘 맞으니 괜히
  //    건드리지 말라」고 하셔서 그대로 둡니다.
  await walk(p, 'client', '병원 정보', 1)
  await ctx.close()
}

// ── ⑤ 뒤 화면이 흔들리지 않는가 ───────────────────────────────────────────
{
  //  ⚠ 예전에는 짚을 것이 안내 띠보다 크면 30ms 마다 다시 굴려서, 뒤 화면이
  //    계속 흔들렸습니다. 한 단계에 머무는 동안 스크롤이 잠잠해야 합니다.
  const { ctx, p } = await open({ scheds: [mkSched('s1', T), mkSched('s2', plus(3))] })
  await p.locator('[data-help-open]').click()
  await p.waitForTimeout(700)
  await p.locator('[data-guide-pick="plan"]').click()
  await p.waitForTimeout(2000)
  const ys = []
  for (let n = 0; n < 12; n += 1) {
    ys.push(await p.evaluate(() => Math.round(window.scrollY)))
    await p.waitForTimeout(120)
  }
  const moved = new Set(ys).size
  ok(moved <= 2, '**한 단계에 머무는 동안 화면이 흔들리지 않는다**', `스크롤 자리 ${moved}가지 — ${ys.join(',')}`)
  await ctx.close()
}

await b.close()
