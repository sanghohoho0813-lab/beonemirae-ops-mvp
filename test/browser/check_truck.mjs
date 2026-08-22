import { chromium, EXEC } from './_pw.mjs'

//  0070 — 3.5톤 공용차 예약 · 호차 안내
//   ⚠ 운영 DB 는 아직 판 64 라 실제 계정으로는 못 밟습니다. 판 70 서버를
//     흉내 내어 0070 을 올린 뒤의 모습을 봅니다. 판 64 에서 **안 뜨는 것**도
//     함께 봅니다 (눌러도 안 되는 단추를 만들지 않기 위해).

const BASE = 'http://localhost:4173'
const ME = '00000000-0000-0000-0000-0000000000f1'
const OTHER = '00000000-0000-0000-0000-0000000000f2'
const C1 = '00000000-0000-0000-0000-0000000000a1'
const V3 = '00000000-0000-0000-0000-0000000000v3'
const V35 = '00000000-0000-0000-0000-000000000035'
const ok = (c, m, d = '') => { console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`); if (!c) process.exitCode = 1 }
const flat = (t) => (t ?? '').replace(/\s+/g, ' ').trim()
const T = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })

const clients = [{ id: C1, name: '한마음요양병원', type: '요양병원', address: '경기도', manager: '김',
  phone: '031', collection_cycle: '주 3회', collects_medical_waste: true, collects_diaper: true,
  storage_size: '보통', note: '', is_demo_generated: false, active: true, pricing: {},
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }]
const vehicles = [
  { id: V3, name: '3호차', waste_type: '의료폐기물', tonnage: 1, nominal_capacity: 1000, expected_capacity: 800, driver: '', active: true },
  { id: V35, name: '3.5톤 (공용)', waste_type: '의료폐기물', tonnage: 3.5, nominal_capacity: 3500, expected_capacity: 2800, driver: '', active: true },
]

const b = await chromium.launch({ executablePath: EXEC })

async function open(ver, { role = 'field', uid = ME, holds = [] } = {}) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const me = { id: uid, email: 'f@b.c', name: '김준기', role, font_scale: 'normal', active: true,
    approved_at: '2026-01-01T00:00:00Z', client_id: null, vehicle_id: V3, created_at: '2026-01-01T00:00:00Z' }
  const state = { res: [...holds], calls: [] }
  ctx.route('**/auth/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: uid, aud: 'authenticated', email: 'f@b.c', app_metadata: {}, user_metadata: {} }) }))
  ctx.route('**/rest/v1/**', (r) => {
    const url = r.request().url()
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    if (url.includes('/rpc/app_schema_version')) return json(ver)
    if (url.includes('/rpc/reserve_vehicle')) {
      const p = JSON.parse(r.request().postData() ?? '{}')
      state.calls.push(['reserve', p])
      state.res.push({ id: 'r9', vehicle_id: p.p_vehicle_id, date: p.p_date, profile_id: uid, note: '' })
      return json({ id: 'r9' })
    }
    if (url.includes('/rpc/release_vehicle')) {
      const p = JSON.parse(r.request().postData() ?? '{}')
      state.calls.push(['release', p])
      state.res = state.res.filter((x) => x.id !== p.p_id)
      return json({ ok: true })
    }
    if (url.includes('/rpc/')) return json(null)
    if (url.includes('/profiles')) return json(single ? me : [me])
    if (url.includes('/clients')) return json(single ? clients[0] : clients)
    if (url.includes('/vehicle_reservations')) return json(state.res)
    if (url.includes('/vehicles')) return json(single ? vehicles[0] : vehicles)
    if (url.includes('/schedules')) return json([])
    if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
    return json([])
  })
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: uid, aud: 'authenticated', email: 'f@b.c', app_metadata: {}, user_metadata: {} }])
  await p.goto(`${BASE}/today`, { waitUntil: 'domcontentloaded' })
  await p.waitForFunction(() => {
    const t = document.querySelector('main')?.innerText ?? ''
    return t.length > 20 && !/불러오는 중/.test(t)
  }, null, { timeout: 40000 }).catch(() => {})
  await p.waitForTimeout(900)
  return { ctx, p, state }
}

// ── ① 판 64 — 아무것도 안 뜹니다 ───────────────────────────────────────────
{
  const { ctx, p } = await open(64)
  ok((await p.locator('[data-shared-truck]').count()) === 0,
    '판 64 에서는 공용차 칸이 안 뜸 (서버가 아직 못 받음)')
  await ctx.close()
}

// ── ② 판 70 — 비어 있으면 잡을 수 있습니다 ─────────────────────────────────
{
  const { ctx, p, state } = await open(70)
  ok((await p.locator('[data-shared-truck]').count()) === 1, '**공용차 칸이 보임**')
  ok(/3\.5톤/.test(flat(await p.locator('[data-shared-truck]').innerText())), '3.5톤이라고 적혀 있음')
  ok(flat(await p.locator('[data-truck-state]').textContent()) === '비어 있음', '비어 있다고 알려 줌')

  const btn = await p.locator('[data-truck-toggle]').boundingBox()
  ok((btn?.height ?? 0) >= 44, '단추가 손가락 크기', `${Math.round(btn?.height ?? 0)}px`)
  ok(/이 날 예약하기/.test(flat(await p.locator('[data-truck-toggle]').textContent())), '무엇을 하는 단추인지 적혀 있음')

  await p.locator('[data-truck-toggle]').dispatchEvent('click')
  await p.waitForTimeout(1400)
  const sent = state.calls.find(([k]) => k === 'reserve')
  ok(!!sent, '**예약이 서버로 감**')
  ok(sent?.[1]?.p_vehicle_id === V35, '3.5톤으로 감', String(sent?.[1]?.p_vehicle_id))
  ok(sent?.[1]?.p_date === T, '보고 있던 날짜로 감', String(sent?.[1]?.p_date))
  ok(flat(await p.locator('[data-truck-state]').textContent()) === '내가 씁니다', '**잡고 나면 바로 「내가 씁니다」**')
  ok(/무르기/.test(flat(await p.locator('[data-truck-toggle]').textContent())), '이제 무를 수 있음')
  await ctx.close()
}

// ── ③ 남이 잡아 두면 — 보이되 못 누릅니다 ──────────────────────────────────
{
  const holds = [{ id: 'r1', vehicle_id: V35, date: T, profile_id: OTHER, note: '' }]
  const { ctx, p } = await open(70, { holds })
  ok(flat(await p.locator('[data-truck-state]').textContent()) === '다른 분이 씁니다',
    '**남이 잡은 것이 보임** (병원 빼고 다 압니다)')
  ok((await p.locator('[data-truck-toggle]').count()) === 0,
    '**남의 예약은 누를 수 없음** (눌러 봐야 서버가 거절합니다)')
  await ctx.close()
}

// ── ④ 사무실은 뺄 수 있습니다 ──────────────────────────────────────────────
{
  const holds = [{ id: 'r1', vehicle_id: V35, date: T, profile_id: OTHER, note: '' }]
  const { ctx, p, state } = await open(70, { role: 'office', holds })
  ok((await p.locator('[data-truck-toggle]').count()) === 1, '사무실은 남의 예약도 뺄 수 있음')
  await p.locator('[data-truck-toggle]').dispatchEvent('click')
  await p.waitForTimeout(1200)
  ok(!!state.calls.find(([k]) => k === 'release'), '빼기가 서버로 감')
  await ctx.close()
}

// ── ⑤ 병원에게는 안 보입니다 ───────────────────────────────────────────────
{
  const { ctx, p } = await open(70, { role: 'client' })
  ok((await p.locator('[data-shared-truck]').count()) === 0, '**병원 화면에는 공용차 칸이 없음**')
  await ctx.close()
}

// ── ⑥ 호차 안내 — 2주만, 닫으면 다시 안 뜸 ─────────────────────────────────
{
  const { ctx, p } = await open(70)
  const n = p.locator('[data-car-notice]')
  ok((await n.count()) === 1, '호차 안내가 보임')
  const txt = flat(await n.innerText())
  ok(/출생연도 순/.test(txt) && /바꾸실 수 있/.test(txt), '왜 그렇게 정했는지와 바꿀 수 있다는 것', txt.slice(0, 46))
  const px = await p.evaluate(() => {
    const el = document.querySelector('[data-car-notice] p')
    return Math.round(parseFloat(getComputedStyle(el).fontSize))
  })
  ok(px <= 18, '아주 작은 글씨 (대표님 요청)', `${px}px`)
  const close = await p.locator('[data-car-notice-close]').boundingBox()
  ok((close?.height ?? 0) >= 44, '닫는 자리는 손가락 크기', `${Math.round(close?.height ?? 0)}px`)
  await p.locator('[data-car-notice-close]').dispatchEvent('click')
  await p.waitForTimeout(400)
  ok((await p.locator('[data-car-notice]').count()) === 0, '닫으면 사라짐')
  await p.reload({ waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(2500)
  ok((await p.locator('[data-car-notice]').count()) === 0, '**다시 열어도 안 뜸**')
  await ctx.close()
}

await b.close()
