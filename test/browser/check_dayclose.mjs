import { chromium, EXEC } from './_pw.mjs'

//  0088 — 오늘 업무 마감
//
//   왜 이것이 있어야 하는가: 기사님이 하루치를 다 넣고 나서 **같은 내용을
//   카톡으로 다시 보고**하고 있었습니다. 그게 남아 있으면 앱을 써도 카톡이
//   안 없어집니다.
//
//   ⚠ 운영 서버는 아직 판 70 입니다 — 판 73 서버를 흉내 내어 0073 을 올린
//     뒤의 모습을 봅니다. **판 70 에서 안 뜨는 것**도 함께 봅니다.
//     (눌러도 안 되는 단추를 만들지 않기 위해)

const BASE = 'http://localhost:4173'
const ME = '00000000-0000-0000-0000-0000000000f1'
const C1 = '00000000-0000-0000-0000-0000000000a1'
const V3 = '00000000-0000-0000-0000-0000000000v3'
const ok = (c, m, d = '') => { console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`); if (!c) process.exitCode = 1 }
const flat = (t) => (t ?? '').replace(/\s+/g, ' ').trim()
const T = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })

const clients = [{ id: C1, name: '한마음요양병원', type: '요양병원', address: '경기도', manager: '김',
  phone: '031', collection_cycle: '주 3회', collects_medical_waste: true, collects_diaper: true,
  storage_size: '보통', note: '', is_demo_generated: false, active: true, pricing: {},
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }]
const vehicles = [{ id: V3, name: '3호차', waste_type: '의료폐기물', tonnage: 1, nominal_capacity: 1000,
  expected_capacity: 800, driver: '', active: true }]
//  오늘 일정 둘 — 하나는 끝났고 하나는 남았습니다.
const schedules = [
  { id: 's1', client_id: C1, date: T, waste_type: '의료폐기물', scheduled_time: '09:00', status: '완료',
    vehicle_id: V3, expected_amount: 100, actual_amount: 120, memo: '', updated_by: ME },
  { id: 's2', client_id: C1, date: T, waste_type: '기저귀', scheduled_time: '15:00', status: '예정',
    vehicle_id: V3, expected_amount: 40, actual_amount: null, memo: '', updated_by: ME },
]

const b = await chromium.launch({ executablePath: EXEC })

async function open(ver, { role = 'field', closes = [], path = '/today' } = {}) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const me = { id: ME, email: 'f@b.c', name: '김준기', role, font_scale: 'normal', active: true,
    approved_at: '2026-01-01T00:00:00Z', client_id: null, vehicle_id: V3, created_at: '2026-01-01T00:00:00Z' }
  const state = { closes: [...closes], calls: [] }
  ctx.route('**/auth/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: ME, aud: 'authenticated', email: 'f@b.c', app_metadata: {}, user_metadata: {} }) }))
  ctx.route('**/rest/v1/**', (r) => {
    const url = r.request().url()
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    if (url.includes('/rpc/app_schema_version')) return json(ver)
    if (url.includes('/rpc/close_day')) {
      const p = JSON.parse(r.request().postData() ?? '{}')
      state.calls.push(['close', p])
      //  ⚠ 숫자는 **서버가** 셉니다 — 화면이 다시 세지 않는지 여기서 봅니다.
      const summary = { planned: 2, done: 1, left: 1, kg: 120, openVehicles: 0 }
      state.closes.push({ profile_id: ME, profile_name: '김준기', date: p.p_date,
        note: p.p_note ?? '', closed_at: new Date().toISOString(), summary })
      return json({ already: false, summary })
    }
    if (url.includes('/rpc/')) return json(null)
    if (url.includes('/day_closes')) return json(state.closes)
    if (url.includes('/profiles')) return json(single ? me : [me])
    if (url.includes('/clients')) return json(single ? clients[0] : clients)
    if (url.includes('/vehicle_reservations')) return json([])
    if (url.includes('/vehicles')) return json(single ? vehicles[0] : vehicles)
    if (url.includes('/schedules')) return json(schedules)
    if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
    return json([])
  })
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: ME, aud: 'authenticated', email: 'f@b.c', app_metadata: {}, user_metadata: {} }])
  await p.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await p.waitForFunction(() => {
    const t = document.querySelector('main')?.innerText ?? ''
    return t.length > 20 && !/불러오는 중/.test(t)
  }, null, { timeout: 40000 }).catch(() => {})
  await p.waitForTimeout(1200)
  return { ctx, p, state }
}

// ── ① 판 70 — 아직 아무것도 안 뜹니다 ──────────────────────────────────────
{
  const { ctx, p } = await open(70)
  ok((await p.locator('[data-day-close]').count()) === 0,
    '판 70 에서는 마감 칸이 안 뜸 (서버가 아직 못 받음)')
  await ctx.close()
}

// ── ② 판 73 — 기사님 화면에 뜹니다 ─────────────────────────────────────────
{
  const { ctx, p, state } = await open(73)
  const card = p.locator('[data-day-close="open"]')
  ok((await card.count()) === 1, '**기사님 화면에 마감 칸이 보임**')
  const txt = flat(await card.innerText())
  //  ⚠ 이 한 줄이 이 기능의 전부입니다 — 다시 적지 않아도 된다는 말.
  ok(/다시 적지 않으셔도/.test(txt), '**「다시 적지 않으셔도 됩니다」라고 적혀 있음**', txt.slice(0, 60))

  const btn = await p.locator('[data-day-close-go]').boundingBox()
  ok((btn?.height ?? 0) >= 44, '단추가 손가락 크기', `${Math.round(btn?.height ?? 0)}px`)

  //  남길 말은 **비워도 됩니다** — 비워 둔 채 눌러 봅니다.
  await p.locator('[data-day-close-go]').dispatchEvent('click')
  await p.waitForTimeout(1500)
  const sent = state.calls.find(([k]) => k === 'close')
  ok(!!sent, '**마감이 서버로 감**')
  ok(sent?.[1]?.p_date === T, '오늘 날짜로 감', String(sent?.[1]?.p_date))
  ok(sent?.[1]?.p_note === '', '남길 말은 비워도 됨', JSON.stringify(sent?.[1]?.p_note))

  const done = p.locator('[data-day-close="done"]')
  ok((await done.count()) === 1, '**누르면 바로 「마감했습니다」**')
  const dtxt = flat(await done.innerText())
  ok(/완료 1건/.test(dtxt) && /120kg/.test(dtxt), '숫자를 **서버가 세어** 보여 줌', dtxt.slice(0, 70))
  //  ⚠ 이 문장이 없으면 그래도 카톡을 보냅니다.
  ok(/따로 알리지 않으셔도/.test(dtxt), '**따로 알릴 필요가 없다고 적혀 있음**', dtxt.slice(0, 90))
  ok((await p.locator('[data-day-close-go]').count()) === 0, '마감한 뒤에는 단추가 없음 (두 번 누를 자리가 없음)')
  await ctx.close()
}

// ── ③ 새로고침해도 「끝냈다」가 남습니다 ───────────────────────────────────
{
  const closes = [{ profile_id: ME, profile_name: '김준기', date: T, note: '오후 한 곳은 내일',
    closed_at: new Date().toISOString(), summary: { planned: 2, done: 1, left: 1, kg: 120, openVehicles: 0 } }]
  const { ctx, p } = await open(73, { closes })
  ok((await p.locator('[data-day-close="done"]').count()) === 1,
    '**이미 마감했으면 다시 열어도 「마감했습니다」**')
  ok((await p.locator('[data-day-close="open"]').count()) === 0, '마감 단추가 다시 나오지 않음')
  await ctx.close()
}

// ── ④ 대표·사무실 — 「누가 마감했나」 ──────────────────────────────────────
//   ⚠ 이름은 마감 순간에 서버가 적어 둔 값입니다. 화면이 프로필을 다시 읽지
//     않습니다 — 그 권한을 열면 현장 계정이 남의 개인정보를 읽게 됩니다.
{
  const closes = [{ profile_id: ME, profile_name: '김준기', date: T, note: '오후 한 곳은 내일',
    closed_at: new Date().toISOString(), summary: { planned: 2, done: 1, left: 1, kg: 120, openVehicles: 0 } }]
  const { ctx, p } = await open(73, { role: 'admin', closes, path: '/' })
  const box = p.locator('[data-day-close-status]')
  ok((await box.count()) === 1, '**대표 화면에 마감 여부가 보임**')
  const txt = flat(await box.innerText())
  ok(/김준기/.test(txt), '누가 마감했는지 적혀 있음', txt.slice(0, 60))
  ok(/완료 1건/.test(txt), '그날 몇 건인지 함께 보임', txt.slice(0, 70))
  ok(/오후 한 곳은 내일/.test(txt), '기사님이 남긴 말이 그대로 보임', txt.slice(0, 90))
  //  ⚠ 대표님 화면에는 마감 **단추**가 없습니다 — 남의 근무를 대신 찍을 수 없습니다.
  ok((await p.locator('[data-day-close-go]').count()) === 0, '대표 화면에는 마감 단추가 없음')
  await ctx.close()
}

// ── ⑤ 아직 아무도 안 눌렀으면 — 「미이행」이 아니라 「아직」 ────────────────
{
  const { ctx, p } = await open(73, { role: 'admin', path: '/' })
  const box = p.locator('[data-day-close-none]')
  ok((await box.count()) === 1, '아무도 안 눌렀다는 것도 보임')
  const txt = flat(await box.innerText())
  ok(/아직/.test(txt) && !/미이행|누락|미완료 보고/.test(txt),
    '**「아직」이라고만 적음** (아직 일하는 중일 수 있습니다)', txt)
  await ctx.close()
}

// ── ⑥ 병원 계정 — 내부 근무 기록은 안 보입니다 ────────────────────────────
{
  const { ctx, p } = await open(73, { role: 'client', path: '/portal' })
  ok((await p.locator('[data-day-close]').count()) === 0, '**병원 화면에는 마감 칸이 없음**')
  ok((await p.locator('[data-day-close-status]').count()) === 0, '병원 화면에는 마감 여부도 없음')
  await ctx.close()
}

await b.close()
