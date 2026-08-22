import { chromium, EXEC } from './_pw.mjs'

//  현장 담당자 권한 재검증 — **돈은 안 보이고, 업무정보는 보인다**
//
//   지시(현장 실증): 「현장직원은 업무정보는 봐야 하고, 돈 정보는 절대 보면
//   안 된다」. 대체기사가 대신 가도 그 병원의 주소·연락처·주의사항은 보여야
//   합니다.
//
//  ── 왜 화면을 다시 재는가 (RLS 만으로는 못 막는 것이 있습니다) ─────────────
//
//   서버 정책을 그대로 읽어 보면 현장 토큰으로도 **실제로 내려오는** 돈이
//   있습니다.
//
//    · `clients_read`  = is_active_user()  → `clients.pricing` (품목별 단가)
//    · `cma_read`      = is_active_user()  → `client_monthly_actuals`
//                                            (revenue · cost · profit)
//
//   반대로 `payments` · `sales_leads` 는 is_staff() 라 현장에는 0건입니다.
//   그래서 이 검사는 **서버가 실제로 주는 것만** 흘려 넣습니다. 안 주는 것을
//   넣어 두고 「안 보인다」고 하면 아무것도 증명하지 못합니다.
//
//   ⚠ 「원」은 **병원·직원·지원**에도 들어갑니다. 숫자가 앞에 붙은 것만
//     돈으로 셉니다 — 예전에 이걸 안 해서 「한마음요양병원」이 금액으로
//     잡혔습니다.

const BASE = 'http://localhost:4173'
const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  if (!c) process.exitCode = 1
}
const flat = (s) => (s ?? '').replace(/\s+/g, ' ').trim()

const TODAY = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
const MONTH = TODAY.slice(0, 7)
const back = (n) => {
  const d = new Date(`${TODAY}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

const C1 = '00000000-0000-0000-0000-0000000000c1'
const C2 = '00000000-0000-0000-0000-0000000000c2'
const FIELD = '00000000-0000-0000-0000-0000000000f1'

//  ⚠ 단가가 **들어 있는** 거래처입니다. 서버는 이 줄을 현장에도 줍니다.
const CLIENTS = [
  {
    id: C1, name: '한마음요양병원', type: '요양병원', address: '서울시 강남구 테헤란로 152',
    manager: '김주현', phone: '02-555-0101', collection_cycle: '주 2회',
    collects_medical_waste: true, collects_diaper: false, storage_size: '보통',
    note: '지하 주차 후 화물엘리베이터', is_demo_generated: false, demo_session_id: null,
    active: true, contract_start: '2025-01-01', contract_end: null, payment_terms: '',
    payment_due_day: 20,
    pricing: { '위탁의료폐기물': { sale: 1450, cost: 890 }, '일반의료폐기물': { sale: 1200, cost: 700 } },
    monthly_flat_fee: 880000,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  },
  {
    //  오늘 이 기사님이 배정받지 않은 병원 — **대체기사**가 대신 갈 때
    //  주소·연락처·주의사항이 보여야 합니다.
    id: C2, name: '새싹의원', type: '의원', address: '서울시 송파구 올림픽로 300',
    manager: '박서연', phone: '02-555-0202', collection_cycle: '주 1회',
    collects_medical_waste: true, collects_diaper: false, storage_size: '협소',
    note: '', is_demo_generated: false, demo_session_id: null, active: true,
    contract_start: '2025-03-01', contract_end: null, payment_terms: '', payment_due_day: 25,
    pricing: { '위탁의료폐기물': { sale: 1600, cost: 950 } },
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  },
]

//  ⚠ 매출·원가·이익이 들어 있는 월 실적 — 이것도 서버가 현장에 줍니다.
const ACTUALS = [
  { id: 'a1', client_id: C1, month: MONTH, medical_kg: 1820, diaper_kg: 0,
    revenue: 2639000, cost: 1619800, profit: 1019200, source: 'excel',
    created_at: `${TODAY}T00:00:00Z`, updated_at: `${TODAY}T00:00:00Z` },
  { id: 'a2', client_id: C2, month: MONTH, medical_kg: 410, diaper_kg: 0,
    revenue: 656000, cost: 389500, profit: 266500, source: 'excel',
    created_at: `${TODAY}T00:00:00Z`, updated_at: `${TODAY}T00:00:00Z` },
]

const SCHEDULES = [
  //  오늘 — 이 기사님 담당
  { id: 's-today', date: TODAY, client_id: C1, waste_type: '의료폐기물', vehicle_id: null,
    scheduled_time: '09:40', status: '예정', expected_amount: 120, actual_amount: null,
    actual_time: null, completed_at: null, containers: null, driver_name: '김준기',
    handover_status: null, handover_at: null, memo: '', event_id: null, origin: 'system',
    is_additional: false, demo_session_id: null, plan_batch: null,
    created_at: `${TODAY}T00:00:00Z`, updated_at: `${TODAY}T00:00:00Z` },
  //  오늘 — **다른 기사** 담당 (대체로 갈 수도 있는 곳)
  { id: 's-other', date: TODAY, client_id: C2, waste_type: '의료폐기물', vehicle_id: null,
    scheduled_time: '14:10', status: '예정', expected_amount: 40, actual_amount: null,
    actual_time: null, completed_at: null, containers: null, driver_name: '이하늘',
    handover_status: null, handover_at: null, memo: '', event_id: null, origin: 'system',
    is_additional: false, demo_session_id: null, plan_batch: null,
    created_at: `${TODAY}T00:00:00Z`, updated_at: `${TODAY}T00:00:00Z` },
  //  지난 기록 — 거래처 상세의 수거 이력
  ...[5, 12, 19].map((n, i) => ({
    id: `s-p${i}`, date: back(n), client_id: C1, waste_type: '의료폐기물', vehicle_id: null,
    scheduled_time: '09:40', status: '완료', expected_amount: 120, actual_amount: 118 + i,
    actual_time: '09:52', completed_at: `${back(n)}T00:52:00Z`, containers: null,
    driver_name: '김준기', handover_status: '수거 완료', handover_at: null, memo: '',
    event_id: null, origin: 'field', is_additional: false, demo_session_id: null,
    plan_batch: null, created_at: `${back(n)}T00:00:00Z`, updated_at: `${back(n)}T00:00:00Z`,
  })),
]

//  ⚠ 칸 이름을 기억으로 쓰지 않고 `repo.ts` 의 `toNote` 에서 그대로 가져왔습니다.
//    (`content` 이지 `body` 가 아닙니다 · `kind` 는 NoteKind · `archived` 필요)
//    처음에 `body`/`author_name`/`pinned` 로 적었다가 이 병원 화면이 통째로
//    ErrorBoundary 에 앉았고, 그 상태로도 「금액 없음」은 통과했습니다 —
//    **터진 화면은 당연히 금액이 없습니다.** 그래서 「열렸는가」를 먼저 잽니다.
const NOTES = [{
  id: 'n1', client_id: C1, kind: '주의',
  content: '오전 10시 전에만 지하 진입 가능 · 경비실에 연락 후 진입',
  done: false, archived: false, request_id: null,
  created_at: `${back(3)}T00:00:00Z`,
}]

const REQUESTS = [{
  id: 'r1', client_id: C1, kind: '추가수거', content: '격리환자 발생으로 배출량이 늘었습니다',
  desired_date: TODAY, urgent: true, status: '접수', source: 'portal',
  requester_name: '병원 담당자', reply: '', handled_by: null, handled_at: null,
  request_id: null, created_at: `${TODAY}T01:00:00Z`, demo_session_id: null,
}]

const b = await chromium.launch({ executablePath: EXEC })

function wire(ctx, role) {
  const pf = {
    id: FIELD, email: 'f@beonemirae.test', name: '김준기', role,
    font_scale: 'normal', active: true, approved_at: '2026-01-01T00:00:00Z',
    client_id: null, created_at: '2026-01-01T00:00:00Z',
  }
  ctx.route('**/auth/v1/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: FIELD, aud: 'authenticated', email: pf.email, app_metadata: {}, user_metadata: {} }) }))
  ctx.route('**/rest/v1/**', (r) => {
    const url = r.request().url()
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    if (url.includes('/rpc/app_schema_version')) return json(64)
    if (url.includes('/rpc/app_health_check')) return json({ version: 64, ok: true, missing: [], checkedAt: '' })
    if (url.includes('/rpc/recent_app_errors')) return json({ days: 7, total: 0, groups: [], checkedAt: '' })
    if (url.includes('/profiles')) return json(single ? pf : [pf])
    if (url.includes('/client_monthly_actuals')) return json(ACTUALS)
    if (url.includes('/client_requests')) return json(REQUESTS)
    if (url.includes('/site_notes')) return json(NOTES)
    if (url.includes('/schedules')) return json(SCHEDULES)
    if (url.includes('/clients')) return json(single ? CLIENTS[0] : CLIENTS)
    //  payments · sales_leads 는 서버가 현장에 0건을 줍니다 — 그대로 흉내 냅니다.
    return json([])
  })
}

async function open(ctx, path) {
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: FIELD, aud: 'authenticated', email: 'f@beonemirae.test', app_metadata: {}, user_metadata: {} }])
  await p.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(2500)
  return p
}

//  숫자가 앞에 붙은 「원」만 돈으로 셉니다 (병원·직원·지원 제외).
const AMOUNT = /\d[\d,]*\s*(?:원|만원|억)/
//  돈을 부르는 말. 「지원」·「직원」에 걸리지 않게 낱말로만 씁니다.
const MONEY_WORD = /단가|매출|미수|청구금액|영업이익|기여이익|정산금액|판매가|원가/

const FIELD_ROUTES = [
  ['/today', '오늘 일정'],
  ['/collection', '수거 입력'],
  ['/clients', '거래처 목록'],
  [`/clients/${C1}`, '거래처 상세 (담당)'],
  [`/clients/${C2}`, '거래처 상세 (대체)'],
  ['/requests', '병원 요청'],
  ['/more', '더보기'],
]

// ── 1. 현장 화면 전수 — 돈이 한 글자도 없는가 (폰 · PC) ─────────────────────
for (const [w, label] of [[390, '폰'], [1440, 'PC']]) {
  const ctx = await b.newContext({ viewport: { width: w, height: w === 390 ? 844 : 1000 } })
  wire(ctx, 'field')
  for (const [path, name] of FIELD_ROUTES) {
    const p = await open(ctx, path)
    const t = flat(await p.textContent('body'))

    //  화면이 실제로 떴는지 먼저 봅니다 — 터진 화면은 당연히 금액이 없습니다.
    const broke = /문제가 생겼습니다|접근 권한이 없는 화면입니다/.test(t) || t.length < 60
    ok(!broke, `${label} ${name} 이 정상적으로 열림`, broke ? t.slice(0, 60) : `${t.length}자`)

    const amt = t.match(AMOUNT)
    ok(!amt, `${label} ${name} 에 금액이 없음`, amt ? amt[0] : '')
    const wrd = t.match(MONEY_WORD)
    ok(!wrd, `${label} ${name} 에 돈을 부르는 말이 없음`, wrd ? wrd[0] : '')
    await p.close()
  }
  await ctx.close()
}

// ── 2. 업무정보는 **보여야** 합니다 — 없애기만 하면 일을 못 합니다 ──────────
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
  wire(ctx, 'field')

  //  담당 병원
  const p1 = await open(ctx, `/clients/${C1}`)
  const t1 = flat(await p1.textContent('body'))
  ok(/한마음요양병원/.test(t1), '담당 병원 이름이 보임')
  ok(/테헤란로 152/.test(t1), '주소가 보임 — 그 자리에서 찾아가야 합니다')
  ok(/김주현/.test(t1), '병원 담당자 이름이 보임')
  ok(/02-555-0101/.test(t1), '전화번호가 보임 — 도착해서 바로 겁니다')
  ok(/화물엘리베이터|경비실에 연락/.test(t1), '주의사항(현장 메모)이 보임')
  await p1.close()

  //  ⚠ **대체기사** — 오늘 자기 배정이 아닌 병원도 업무정보는 보여야 합니다.
  //    이하늘 기사님이 못 가면 김준기 기사님이 대신 갑니다.
  const p2 = await open(ctx, `/clients/${C2}`)
  const t2 = flat(await p2.textContent('body'))
  ok(/새싹의원/.test(t2), '**배정받지 않은 병원**도 열림 (대체기사)')
  ok(/올림픽로 300/.test(t2), '대체로 가도 주소가 보임')
  ok(/02-555-0202/.test(t2), '대체로 가도 전화번호가 보임')
  await p2.close()

  //  ⚠ 돈이 붙는 탭은 **목록에 아예 없어야** 합니다. 탭만 남겨 두고 안을
  //    비우면 「기록이 없다」로 읽힙니다 — 그게 더 나쁩니다.
  //    「월간 리포트」는 0063 부터 서버가 월 실적을 현장에 안 주므로 함께 내렸습니다.
  const p4 = await open(ctx, `/clients/${C1}`)
  const tabs = (await p4.locator('main button, main [role="tab"]').allTextContents()).map(flat)
  for (const t of ['월 정산·명세서', '결제·미수금', '월간 리포트']) {
    ok(!tabs.includes(t), `현장에는 「${t}」 탭이 없음`, tabs.filter(Boolean).slice(0, 8).join(','))
  }
  ok(tabs.includes('현장 메모') || tabs.includes('수거이력'),
    '업무 탭(현장 메모·수거이력)은 그대로 있음', tabs.filter(Boolean).slice(0, 8).join(','))
  await p4.close()

  //  오늘 일정 — 오늘 갈 곳
  const p3 = await open(ctx, '/today')
  const t3 = flat(await p3.textContent('body'))
  ok(/한마음요양병원/.test(t3), '오늘 일정에 갈 곳이 보임')
  ok(/09:40/.test(t3), '몇 시에 가는지 보임')
  await p3.close()
  await ctx.close()
}

// ── 2-b. 「연결되는 매출」 줄 — 사무실에는 있고 현장에는 없다 ───────────────
//   금액은 아니지만 **영업 정보**입니다. 이 화면은 현장도 열기 때문에
//   화면 자체를 막는 것이 아니라 그 한 줄만 뺐습니다.
{
  for (const [role, want] of [['field', false], ['office', true]]) {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } })
    wire(ctx, role)
    const p = await open(ctx, '/requests')
    const t = flat(await p.textContent('body'))
    ok(/격리환자 발생/.test(t), `${role} 도 요청 내용 자체는 그대로 봄`)
    const has = (await p.locator('[data-req-revenue]').count()) > 0
    ok(has === want, want ? '사무실에는 「연결되는 매출」이 그대로 있음' : '**현장에는 「연결되는 매출」이 없음**')
    await p.close()
    await ctx.close()
  }
}

// ── 3. 막힌 화면은 그대로 막혀 있는가 ───────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } })
  wire(ctx, 'field')
  for (const path of ['/receivables', '/billing', '/revenue', '/stats', '/pricing', '/bank', '/supplies', '/performance', '/materials', '/history', '/reports', '/plan', '/dispatch']) {
    const p = await open(ctx, path)
    const t = flat(await p.textContent('body'))
    ok(/접근 권한이 없는 화면입니다/.test(t), `${path} 는 여전히 막힘`, t.slice(0, 40))
    await p.close()
  }
  await ctx.close()
}

// ── 4. 같은 데이터로 사무실은 **보여야** 합니다 ─────────────────────────────
//   지우는 것만 확인하면 「전부 지워도 통과」합니다.
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } })
  wire(ctx, 'office')
  const p = await open(ctx, `/clients/${C1}`)
  const t = flat(await p.textContent('body'))
  ok(AMOUNT.test(t) || MONEY_WORD.test(t), '사무실 담당자에게는 같은 화면에 돈이 보임',
    (t.match(AMOUNT) ?? t.match(MONEY_WORD) ?? [''])[0])
  await p.close()
  await ctx.close()
}

await b.close()
