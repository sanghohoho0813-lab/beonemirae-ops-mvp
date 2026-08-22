import { chromium, EXEC } from './_pw.mjs'

//  ═══════════════════════════════════════════════════════════════════════════
//   0068 — 기사님이 폰 하나로 「앞일 보기 → 일정 잡기 → 그날 수거 입력」
//
//   ⚠ 운영 DB 는 아직 판 64 라 기사님에게 ＋ 가 안 열립니다(일부러 그렇게
//     막아 뒀습니다). 여기서는 **판 67 인 서버를 흉내 내어** 0067 을 적용한
//     뒤의 모습을 미리 밟습니다. 판 64 일 때 ＋ 가 안 나오는 것도 함께 봅니다.
//  ═══════════════════════════════════════════════════════════════════════════

const BASE = 'http://localhost:4173'
const UID = '00000000-0000-0000-0000-0000000000f1'
const C1 = '00000000-0000-0000-0000-0000000000a1'
const C2 = '00000000-0000-0000-0000-0000000000a2'
const V1 = '00000000-0000-0000-0000-0000000000v1'
const ok = (c, m, d = '') => { console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`); if (!c) process.exitCode = 1 }
const flat = (t) => (t ?? '').replace(/\s+/g, ' ').trim()

const T = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
const day = (n) => { const d = new Date(`${T}T00:00:00`); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE') }

const me = { id: UID, email: 'f@b.c', name: '김준기', role: 'field', font_scale: 'normal', active: true,
  approved_at: '2026-01-01T00:00:00Z', client_id: null, vehicle_id: V1, created_at: '2026-01-01T00:00:00Z' }
const clients = [
  { id: C1, name: '한마음요양병원', type: '요양병원', address: '경기도 남양주시 오남읍 양지로 47-35',
    manager: '김담당', phone: '031-111-2222', collection_cycle: '주 3회', collects_medical_waste: true,
    collects_diaper: true, storage_size: '보통', note: '', is_demo_generated: false, active: true,
    pricing: {}, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  { id: C2, name: '해올요양병원', type: '요양병원', address: '', manager: '관리팀', phone: '',
    collection_cycle: '주 1회', collects_medical_waste: true, collects_diaper: false, storage_size: '보통',
    note: '', is_demo_generated: false, active: true, pricing: {},
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
]
const vehicles = [{ id: V1, name: '80가 1234 (1t)', waste_type: '의료폐기물', tonnage: 1,
  nominal_capacity: 1000, expected_capacity: 800, driver: '오대성', active: true }]

const b = await chromium.launch({ executablePath: EXEC })

async function open(ver, seed = []) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const state = { schedules: [...seed], booked: [] }
  ctx.route('**/auth/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: UID, aud: 'authenticated', email: 'f@b.c', app_metadata: {}, user_metadata: {} }) }))
  ctx.route('**/rest/v1/**', (r) => {
    const url = r.request().url()
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    if (url.includes('/rpc/app_schema_version')) return json(ver)
    if (url.includes('/rpc/book_visit')) {
      const p = JSON.parse(r.request().postData() ?? '{}')
      state.booked.push(p)
      //  실제 서버처럼 **그 자리에서 줄을 만들어** 둡니다. 안 만들면 「저장 뒤
      //  달력·리스트에 즉시 반영」을 확인할 수 없습니다.
      state.schedules.push({
        id: `bk${state.booked.length}`, date: p.p_date, client_id: p.p_client_id,
        waste_type: p.p_waste_type, vehicle_id: null, scheduled_time: p.p_time,
        status: p.p_purpose === '긴급수거' ? '긴급' : '예정', expected_amount: 0, actual_amount: null,
        completed_at: null, memo: p.p_memo ?? '', origin: 'field', canceled_at: null,
        is_additional: p.p_purpose === '추가수거',
        created_at: `${p.p_date}T00:00:00Z`, updated_at: `${p.p_date}T00:00:00Z`,
      })
      return json({ id: `bk${state.booked.length}`, date: p.p_date, clientName: '한마음요양병원', requestUpdated: false })
    }
    if (url.includes('/rpc/')) return json(null)
    if (url.includes('/profiles')) return json(single ? me : [me])
    if (url.includes('/clients')) return json(single ? clients[0] : clients)
    if (url.includes('/schedules')) return json(state.schedules)
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
  await p.waitForTimeout(900)
  return { ctx, p, state }
}

// ── ① 판 64 — ＋ 가 없어야 합니다 ───────────────────────────────────────────
{
  const { ctx, p } = await open(64)
  ok((await p.locator('[data-empty-add]').count()) === 0, '판 64 에서는 「일정 추가」가 안 보임 (서버가 아직 못 받음)')
  ok((await p.locator('[data-add-fab]').count()) === 0, '판 64 에서는 떠 있는 ＋ 도 없음')
  ok(/일정이 없어요/.test(flat(await p.textContent('main'))), '그래도 없다는 말은 함')
  await ctx.close()
}

// ── ② 판 67 — 빈 날에 「일정 추가」가 뜹니다 ────────────────────────────────
{
  const { ctx, p, state } = await open(67)
  ok((await p.locator('[data-day-strip]').count()) === 1, '**날짜 띠가 보임**')
  const days = await p.locator('[data-day]').count()
  ok(days >= 28, '앞으로 4주가 한 줄에 있음', `${days}칸`)
  ok((await p.locator('[data-empty-add]').count()) === 1, '**빈 날에 「이 날 일정 추가」가 뜸**')

  //  손가락 크기
  const box = await p.locator('[data-empty-add]').boundingBox()
  ok((box?.height ?? 0) >= 44, '단추가 손가락으로 누를 크기', `${Math.round(box?.height ?? 0)}px`)

  // ── 일정 추가 ──────────────────────────────────────────────────────────
  await p.locator('[data-empty-add]').dispatchEvent('click')
  await p.waitForTimeout(500)
  ok((await p.locator('[data-add-visit]').count()) === 1, '**하단 시트가 열림**')
  ok(new RegExp(`${Number(T.slice(5, 7))}월`).test(flat(await p.locator('[data-add-visit-date]').textContent())),
    '어느 날인지 시트에 적혀 있음', flat(await p.locator('[data-add-visit-date]').textContent()))

  await p.selectOption('[data-add-visit-client]', C1)
  await p.locator('[data-add-visit-hour="14"]').dispatchEvent('click')
  await p.locator('[data-add-visit-purpose="추가수거"]').dispatchEvent('click')
  await p.fill('[data-add-visit-memo]', '3층 처치실 앞')
  await p.waitForTimeout(300)
  await p.locator('[data-add-visit-save]').dispatchEvent('click')
  await p.waitForTimeout(1500)

  const sent = state.booked[0]
  ok(!!sent, '**서버로 나감**')
  ok(sent?.p_client_id === C1, '고른 병원이 그대로', String(sent?.p_client_id))
  ok(sent?.p_date === T, '고른 날짜가 그대로', String(sent?.p_date))
  ok(sent?.p_time === '14:00', '고른 시간이 그대로', String(sent?.p_time))
  ok(sent?.p_purpose === '추가수거', '**고른 목적이 그대로**', String(sent?.p_purpose))
  ok(sent?.p_memo === '3층 처치실 앞', '메모도 그대로', String(sent?.p_memo))
  ok(sent?.p_waste_type === '의료폐기물', '그 병원이 배출하는 구분으로 감', String(sent?.p_waste_type))

  //  ⚠ 0075 에서 **일부러 바꾼 동작**입니다. 예전에는 저장되면 시트가 그냥
  //    닫혔고, 기사님은 「됐나?」 하고 목록을 다시 훑어야 했습니다.
  //    대표님 요청(「추가한 일정에서 바로 병원 상세 또는 수거입력으로 이어질
  //    수 있게」)에 따라, 이제 잡힌 것을 그 자리에서 보여 주고 다음 길을
  //    내밉니다. **닫히는지**가 아니라 **다음으로 이어지는지**를 봅니다.
  ok((await p.locator('[data-add-visit-done]').count()) === 1,
    '**저장되면 잡힌 것이 그 자리에서 보임**')
  ok((await p.locator('[data-add-visit-go-client]').count()) === 1,
    '**병원 정보로 바로 이어짐**')
  ok((await p.locator('[data-add-visit-save]').count()) === 0,
    '입력칸은 사라짐 (두 번 잡히지 않게)')

  //  닫기를 누르면 그때 닫힙니다
  await p.locator('[data-add-visit-done-close]').dispatchEvent('click')
  await p.waitForTimeout(600)
  ok((await p.locator('[data-add-visit]').count()) === 0, '**닫기를 누르면 시트가 닫힘**')

  // ── 저장 뒤 즉시 반영 ──────────────────────────────────────────────────
  await p.waitForTimeout(1200)
  const main = flat(await p.textContent('main'))
  ok(/한마음요양병원/.test(main), '**저장한 병원이 그 날 목록에 바로 보임**', main.slice(0, 90))
  const cnt = await p.locator(`[data-day="${T}"]`).getAttribute('data-day-count')
  ok(Number(cnt) >= 1, '**날짜 띠의 그 날 건수도 바로 올라감**', `${cnt}건`)
  await ctx.close()
}

// ── ③ 다른 날을 골라 잡을 수 있습니다 ──────────────────────────────────────
{
  const { ctx, p, state } = await open(67)
  const d3 = day(3)
  await p.locator(`[data-day="${d3}"]`).dispatchEvent('click')
  await p.waitForTimeout(500)
  ok(new RegExp(`${Number(d3.slice(8, 10))}일`).test(flat(await p.locator('[data-day-title]').textContent())),
    '날짜를 누르면 그 날로 바뀜', flat(await p.locator('[data-day-title]').textContent()))
  await p.locator('[data-empty-add]').dispatchEvent('click')
  await p.waitForTimeout(400)
  await p.selectOption('[data-add-visit-client]', C2)
  await p.locator('[data-add-visit-save]').dispatchEvent('click')
  await p.waitForTimeout(1200)
  ok(state.booked[0]?.p_date === d3, '**고른 날짜로 잡힘**', String(state.booked[0]?.p_date))
  ok(state.booked[0]?.p_purpose === '정기수거', '목적을 안 건드리면 정기수거')
  await ctx.close()
}

// ── ④ 지난 날에는 못 잡습니다 ──────────────────────────────────────────────
{
  const { ctx, p, state } = await open(67)
  await p.locator(`[data-day="${day(-1)}"]`).dispatchEvent('click')
  await p.waitForTimeout(500)
  await p.locator('[data-empty-add]').dispatchEvent('click')
  await p.waitForTimeout(400)
  await p.selectOption('[data-add-visit-client]', C1)
  await p.waitForTimeout(300)
  ok(await p.locator('[data-add-visit-save]').isDisabled(), '**지난 날은 저장이 잠김**')
  ok(/지난 날짜에는/.test(flat(await p.textContent('[data-add-visit]'))), '왜 안 되는지 말해 줌')
  ok(state.booked.length === 0, '서버로 아무것도 안 나감')
  await ctx.close()
}

// ── ⑤ 일정이 있는 날 — 목록과 떠 있는 ＋ ───────────────────────────────────
{
  const seed = [
    { id: 's1', date: T, client_id: C1, waste_type: '의료폐기물', vehicle_id: null, scheduled_time: '09:00',
      status: '예정', expected_amount: 120, actual_amount: null, completed_at: null, memo: '', origin: 'system',
      canceled_at: null, created_at: `${T}T00:00:00Z`, updated_at: `${T}T00:00:00Z` },
    { id: 's2', date: T, client_id: C2, waste_type: '의료폐기물', vehicle_id: null, scheduled_time: '13:00',
      status: '긴급', expected_amount: 80, actual_amount: null, completed_at: null, memo: '', origin: 'system',
      canceled_at: null, created_at: `${T}T00:00:00Z`, updated_at: `${T}T00:00:00Z` },
  ]
  const { ctx, p } = await open(67, seed)
  ok((await p.locator('[data-add-fab]').count()) === 1, '**일정이 있는 날에도 ＋ 로 더 잡을 수 있음**')
  const fab = await p.locator('[data-add-fab]').boundingBox()
  ok((fab?.height ?? 0) >= 44 && (fab?.width ?? 0) >= 44, '＋ 가 손가락 크기', `${Math.round(fab?.height ?? 0)}px`)
  //  아래 메뉴에 가리지 않아야 합니다
  const nav = await p.locator('nav').last().boundingBox()
  ok((fab?.y ?? 0) + (fab?.height ?? 0) <= (nav?.y ?? 9999) + 2,
    '＋ 가 아래 메뉴에 안 가림', `＋ ${Math.round((fab?.y ?? 0) + (fab?.height ?? 0))}px · 메뉴 ${Math.round(nav?.y ?? 0)}px`)
  const cnt = await p.locator(`[data-day="${T}"]`).getAttribute('data-day-count')
  ok(cnt === '2', '그 날 건수가 띠에 숫자로 붙음', `${cnt}건`)
  const main = flat(await p.textContent('main'))
  ok(/한마음요양병원/.test(main) && /해올요양병원/.test(main), '두 병원이 목록에 보임')
  //  방문 목적 — 평소와 다른 것만 붙습니다
  ok((await p.locator('[data-visit-purpose="s2"]').count()) === 1, '**긴급 방문에는 목적이 붙음**',
     flat(await p.locator('[data-visit-purpose="s2"]').textContent().catch(() => '')))
  ok((await p.locator('[data-visit-purpose="s1"]').count()) === 0,
     '정기 방문에는 안 붙음 (모든 줄에 같은 글자가 붙지 않게)')
  ok((await p.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth))) === 0,
    '가로로 밀리지 않음')
  const h = await p.evaluate(() => document.documentElement.scrollHeight)
  console.log(`   (참고) 일정 2건인 날 문서 ${h}px = ${(h / 844).toFixed(2)}화면`)
  await p.screenshot({ path: 'shots/plan_day.png', fullPage: true })
  await ctx.close()
}

await b.close()
