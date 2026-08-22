import { chromium, EXEC } from './_pw.mjs'

//  ═══════════════════════════════════════════════════════════════════════════
//   0069 — 「옆에서 알려 주는」 사용 안내
//
//   확인하는 것
//    · 업무별로 짧게 나뉘어 있는가 (3~5단계)
//    · **짚은 자리를 진짜로 누를 수 있는가** ← 예전 것과의 핵심 차이
//    · 눌러서 다음으로 넘어가는가
//    · 짚을 것이 없으면 그 단계를 건너뛰는가
//    · 글자가 크고 단추가 손가락 크기인가
//    · 끝나면 하던 자리로 돌아가는가
//  ═══════════════════════════════════════════════════════════════════════════

const BASE = 'http://localhost:4173'
const UID = '00000000-0000-0000-0000-0000000000f1'
const C1 = '00000000-0000-0000-0000-0000000000a1'
const V1 = '00000000-0000-0000-0000-0000000000v1'
const ok = (c, m, d = '') => { console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`); if (!c) process.exitCode = 1 }
const flat = (t) => (t ?? '').replace(/\s+/g, ' ').trim()
const T = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })

const me = { id: UID, email: 'f@b.c', name: '김준기', role: 'field', font_scale: 'normal', active: true,
  approved_at: '2026-01-01T00:00:00Z', client_id: null, vehicle_id: V1, created_at: '2026-01-01T00:00:00Z' }
const clients = [{ id: C1, name: '한마음요양병원', type: '요양병원', address: '경기도 남양주시 오남읍 양지로 47-35',
  manager: '김담당', phone: '031-111-2222', collection_cycle: '주 3회', collects_medical_waste: true,
  collects_diaper: true, storage_size: '보통', note: '', is_demo_generated: false, active: true, pricing: {},
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }]
const vehicles = [{ id: V1, name: '80가 1234', waste_type: '의료폐기물', tonnage: 1,
  nominal_capacity: 1000, expected_capacity: 800, driver: '오대성', active: true }]
const schedules = [{ id: 's1', date: T, client_id: C1, waste_type: '의료폐기물', vehicle_id: null,
  scheduled_time: '09:00', status: '예정', expected_amount: 120, actual_amount: null, completed_at: null,
  memo: '', origin: 'system', canceled_at: null, created_at: `${T}T00:00:00Z`, updated_at: `${T}T00:00:00Z` }]

const b = await chromium.launch({ executablePath: EXEC })
async function open(ver = 67) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  ctx.route('**/auth/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: UID, aud: 'authenticated', email: 'f@b.c', app_metadata: {}, user_metadata: {} }) }))
  ctx.route('**/rest/v1/**', (r) => {
    const url = r.request().url()
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    if (url.includes('/rpc/app_schema_version')) return json(ver)
    if (url.includes('/rpc/')) return json(null)
    if (url.includes('/profiles')) return json(single ? me : [me])
    if (url.includes('/clients')) return json(single ? clients[0] : clients)
    if (url.includes('/schedules')) return json(schedules)
    if (url.includes('/vehicles')) return json(single ? vehicles[0] : vehicles)
    if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
    return json([])
  })
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: UID, aud: 'authenticated', email: 'f@b.c', app_metadata: {}, user_metadata: {} }])
  await p.goto(`${BASE}/today`, { waitUntil: 'domcontentloaded' })
  await p.waitForFunction(() => {
    const t = document.querySelector('main')?.innerText ?? ''
    return t.length > 20 && !/불러오는 중/.test(t)
  }, null, { timeout: 40000 }).catch(() => {})
  await p.waitForTimeout(800)
  return { ctx, p }
}

//  「도움말 → 사용 방법」 열기
async function openHelp(p) {
  const help = p.locator('button[aria-label="도움말"], button').filter({ hasText: /도움말/ }).first()
  await help.dispatchEvent('click')
  await p.waitForTimeout(700)
}

// ── ① 업무별로 나뉘어 있는가 ───────────────────────────────────────────────
{
  const { ctx, p } = await open()
  await openHelp(p)
  const picks = await p.locator('[data-guide-pick]').count()
  ok(picks === 4, '**업무별로 네 가지로 나뉘어 있음** (긴 투어 하나가 아님)', `${picks}개`)
  const txt = flat(await p.locator('[data-guide-picker]').innerText())
  ok(/오늘 갈 곳 보기/.test(txt) && /수거 입력하기/.test(txt), '이름이 「하는 일」로 적혀 있음')
  //  고르는 단추가 손가락 크기
  const box = await p.locator('[data-guide-pick]').first().boundingBox()
  ok((box?.height ?? 0) >= 60, '고르는 단추가 큼', `${Math.round(box?.height ?? 0)}px`)
  await ctx.close()
}

// ── ② 짚은 자리를 **진짜로 누를 수 있는가** ────────────────────────────────
{
  const { ctx, p } = await open()
  await openHelp(p)
  const t0 = Date.now()
  await p.locator('[data-guide-pick="today"]').dispatchEvent('click')
  await p.waitForSelector('[data-guide-bar]', { timeout: 10000 })
  console.log(`   (참고) 안내가 뜨기까지 ${Date.now() - t0}ms`)
  //  ⚠ 시트가 닫히며 스크롤을 되돌립니다. 안내가 **스스로 따라잡는지**를
  //     봐야 하므로, 그 일이 끝난 뒤에 잽니다.
  await p.waitForTimeout(1100)

  ok((await p.locator('[data-guide-spot]').count()) === 1, '**짚는 자리가 실제로 표시됨** (예전엔 하나도 없었습니다)')

  //  예전 투어는 화면 전체에 막을 덮어 아무것도 못 눌렀습니다.
  //  여기서는 짚은 자리 한가운데를 눌렀을 때 **그 요소가 잡혀야** 합니다.
  //  ⚠⚠ **테두리가 설명하는 그 물건을 감싸고 있는가.**
  //     처음에 여기가 틀렸습니다 — 「날짜 줄」을 설명하면서 테두리는
  //     「수거 입력 시작」 단추를 감싸고 있었습니다. 굴린 직후에 자리를
  //     읽어서 굴리기 전 좌표가 남은 것이었습니다.
  //     설명과 테두리가 어긋나면 안내가 아니라 방해입니다.
  const onTarget = await p.evaluate(() => {
    const spot = document.querySelector('[data-guide-spot]')
    const target = document.querySelector('[data-guide="guide-day-strip"]')
    if (!spot || !target) return null
    const a = spot.getBoundingClientRect(), b = target.getBoundingClientRect()
    //  대상이 테두리 안에 들어와 있어야 합니다 (여유 8px)
    const mid = document.elementFromPoint(a.left + a.width / 2, a.top + a.height / 2)
    return { ok: b.top >= a.top - 8 && b.bottom <= a.bottom + 8 && b.left >= a.left - 8,
      spot: `${Math.round(a.top)}~${Math.round(a.bottom)}`, target: `${Math.round(b.top)}~${Math.round(b.bottom)}`,
      scrollY: Math.round(window.scrollY), stripVisible: !!target.offsetParent,
      mid: mid ? `${mid.tagName}.${String(mid.className).slice(0, 26)}` : '없음' }
  })
  ok(onTarget?.ok === true, '**테두리가 설명하는 그 물건을 감쌈**',
    onTarget ? `테두리 ${onTarget.spot} · 대상 ${onTarget.target} · scrollY ${onTarget.scrollY} · 가운데 ${onTarget.mid}` : '못 찾음')
  await p.screenshot({ path: 'shots/guide_aligned.png' })

  const reachable = await p.evaluate(() => {
    const spot = document.querySelector('[data-guide-spot]')
    const r = spot.getBoundingClientRect()
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return { tag: el?.tagName, cls: String(el?.className ?? '').slice(0, 30),
      inGuide: !!el?.closest('[data-guide-on]'), scrollY: Math.round(window.scrollY),
      at: `${Math.round(r.left + r.width / 2)},${Math.round(r.top + r.height / 2)}` }
  })
  ok(!reachable.inGuide, '**짚은 자리가 막혀 있지 않음 — 직접 누를 수 있음**',
    `${reachable.at} 에서 ${reachable.tag}.${reachable.cls} · scrollY ${reachable.scrollY}`)

  //  글자·단추 크기
  const say = await p.evaluate(() => {
    const el = document.querySelector('[data-guide-say]')
    return { px: Math.round(parseFloat(getComputedStyle(el).fontSize)), len: (el.textContent ?? '').trim().length }
  })
  ok(say.px >= 19, '설명 글자가 큼', `${say.px}px`)
  ok(say.len <= 60, '한 단계 설명이 한두 문장', `${say.len}자`)
  const nb = await p.locator('[data-guide-next]').boundingBox()
  ok((nb?.height ?? 0) >= 44, '「다음」이 손가락 크기', `${Math.round(nb?.height ?? 0)}px`)
  ok((await p.locator('[data-guide-prev]').count()) === 1 && (await p.locator('[data-guide-skip]').count()) === 1,
    '이전 · 그만보기가 늘 보임')

  await ctx.close()
}

// ── ③ 단계가 빠르게 넘어가는가 ─────────────────────────────────────────────
{
  const { ctx, p } = await open()
  await openHelp(p)
  await p.locator('[data-guide-pick="today"]').dispatchEvent('click')
  await p.waitForSelector('[data-guide-bar]', { timeout: 10000 })
  await p.waitForTimeout(400)
  const waits = []
  let steps = 1
  for (let i = 0; i < 8; i += 1) {
    const before = flat(await p.locator('[data-guide-say]').textContent())
    const t = Date.now()
    await p.locator('[data-guide-next]').dispatchEvent('click')
    try {
      await p.waitForFunction((prev) => {
        const el = document.querySelector('[data-guide-say]')
        return !el || (el.textContent ?? '').replace(/\s+/g, ' ').trim() !== prev
      }, before, { timeout: 6000 })
    } catch { /* 끝 */ }
    waits.push(Date.now() - t)
    if ((await p.locator('[data-guide-bar]').count()) === 0) break
    steps += 1
  }
  const avg = Math.round(waits.reduce((a, x) => a + x, 0) / waits.length)
  ok(steps >= 3 && steps <= 6, '**3~6단계로 끝남**', `${steps}단계`)
  ok(avg < 300, '**단계 전환에 기다림이 거의 없음**', `평균 ${avg}ms · 가장 오래 ${Math.max(...waits)}ms`)
  ok((await p.locator('[data-guide-bar]').count()) === 0, '끝나면 안내가 사라짐')
  await ctx.close()
}

// ── ④ 눌러서 다음으로 — 직접 해 보면서 익힙니다 ────────────────────────────
{
  const { ctx, p } = await open()
  await openHelp(p)
  await p.locator('[data-guide-pick="collect"]').dispatchEvent('click')
  await p.waitForSelector('[data-guide-bar]', { timeout: 10000 })
  await p.waitForTimeout(700)
  ok(new URL(p.url()).pathname === '/collection', '**그 업무 화면으로 데려감**', new URL(p.url()).pathname)
  const say = flat(await p.locator('[data-guide-say]').textContent())
  ok(/병원/.test(say), '첫 설명이 그 화면의 첫 할 일', say.slice(0, 40))
  await ctx.close()
}

// ── ⑤ 짚을 것이 없으면 건너뜁니다 ──────────────────────────────────────────
//    (예전 투어는 짚을 것이 없어도 어두운 배경에 글자만 띄웠습니다)
{
  const { ctx, p } = await open()
  await openHelp(p)
  await p.locator('[data-guide-pick="client"]').dispatchEvent('click')
  await p.waitForSelector('[data-guide-bar]', { timeout: 10000 })
  await p.waitForTimeout(900)
  ok((await p.locator('[data-guide-spot]').count()) === 1, '거래처 화면에서도 짚는 자리가 있음')
  await ctx.close()
}

// ── ⑥ 끝나면 하던 자리로 ───────────────────────────────────────────────────
{
  const { ctx, p } = await open()
  await p.goto(`${BASE}/clients`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(1500)
  await openHelp(p)
  await p.locator('[data-guide-pick="collect"]').dispatchEvent('click')
  await p.waitForSelector('[data-guide-bar]', { timeout: 10000 })
  await p.waitForTimeout(700)
  await p.locator('[data-guide-skip]').dispatchEvent('click')
  await p.waitForTimeout(900)
  ok(new URL(p.url()).pathname === '/clients', '**그만보기를 누르면 보던 화면으로 돌아옴**', new URL(p.url()).pathname)
  await ctx.close()
}

// ── ⑦ 「사용 방법」 문이 두 개인데 같은 곳으로 오는가 ──────────────────────
//    ⚠ 도움말 시트와 더보기 메뉴, 두 군데입니다. 한 곳만 바꿔 두면 기사님이
//      다른 문으로 들어가 예전 투어(짚는 것 없이 글자만)를 봅니다.
//      실제로 그렇게 남아 있었습니다 — 그래서 이 검사를 답니다.
{
  const { ctx, p } = await open()
  await p.goto(`${BASE}/more`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(2200)
  const more = p.locator('[data-tour-start]').first()
  ok((await more.count()) > 0, '더보기에 「사용 방법」이 있음')
  await more.dispatchEvent('click')
  await p.waitForTimeout(800)
  ok((await p.locator('[data-guide-pick]').count()) === 4,
    '**더보기의 「사용 방법」도 같은 목록을 엶**', `${await p.locator('[data-guide-pick]').count()}개`)
  ok((await p.locator('[data-tour-card]').count()) === 0, '예전 투어 상자가 안 뜸')
  await ctx.close()
}

await b.close()
