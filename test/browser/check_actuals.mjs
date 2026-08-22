import { chromium, EXEC } from './_pw.mjs'

//  엑셀에서 가져온 월 실적이 거래처 화면을 실제로 채우는지 확인합니다.
//  기준: 오남한양병원 — 명세서에 날짜가 없어 수거 기록은 0건, 월 실적만 8개월.
//  예전에는 이 화면이 전부 0/— 였습니다.

const BASE = 'http://localhost:4173'
const SHOT = (process.env.TEST_OUT ?? '/tmp')
const UID = '00000000-0000-0000-0000-0000000000ad'
const C1 = '00000000-0000-0000-0000-0000000000c1'

const out = []
const ok = (c, m, d = '') => {
  //  바로 찍습니다 — 모아 뒀다가 끝에 한 번에 내보내면 중간에 터졌을 때
  //  앞의 결과까지 전부 사라지고, 회귀 집계에 「검사 0 · 실패 0」으로
  //  남아 통과한 것처럼 보입니다.
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  out.push(c)
  if (!c) process.exitCode = 1
}

const profile = {
  id: UID, email: 'admin@beonemirae.test', name: '대표', role: 'admin', font_scale: 'normal',
  active: true, approved_at: '2026-01-01T00:00:00Z', client_id: null, created_at: '2026-01-01T00:00:00Z',
}
const client = {
  id: C1, name: '오남한양병원', type: '병원', address: '', manager: '원무과 담당', phone: '',
  collection_cycle: '주 1회', collects_medical_waste: true, collects_diaper: false,
  storage_size: '보통', note: '', is_demo_generated: false, demo_session_id: null, active: true,
  contract_start: '2025-05-01', contract_end: '2028-04-30', payment_terms: '익월 25일',
  payment_due_day: 25, pricing: { medicalMonthly: { sale: 9000000, cost: null }, medical: { sale: null, cost: 450 } },
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}

//  실제 파일에서 읽은 값 그대로 (analysis.json 의 오남한양 월별)
const ACT = [
  ['2026-01', 9531, 9000000], ['2026-02', 7040, 9000000], ['2026-03', 8652, 9000000],
  ['2026-04', 8633, 9000000], ['2026-05', 7603, 9000000], ['2026-06', 7578, 9000000],
  ['2026-07', 7713, 9000000], ['2026-08', 2802, 9000000],
]
const actuals = ACT.map(([month, kg, rev], i) => ({
  id: `a${i}`, client_id: C1, month, medical_kg: kg, diaper_kg: 0,
  revenue: rev, cost: 0, profit: 0, has_dated: false,
  source_file: '202304_오남한양병원_거래처관리.xlsx',
}))

const b = await chromium.launch({ executablePath: EXEC })
const ctx = await b.newContext({ viewport: { width: 1500, height: 1100 } })
await ctx.route('**/rest/v1/**', (r) => {
  const url = r.request().url()
  const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
  const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
  if (url.includes('/profiles')) return json(single ? profile : [profile])
  if (url.includes('/client_monthly_actuals')) return json(actuals)
  if (url.includes('/clients')) return json(single ? client : [client])
  if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
  return json([])
})
const p = await ctx.newPage()
await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
  access_token: 't', token_type: 'bearer', expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
})), ['beonemirae-ops:auth', { id: UID, aud: 'authenticated', email: profile.email, app_metadata: {}, user_metadata: {} }])

const body = () => p.textContent('main').then((t) => t ?? '')

await p.goto(`${BASE}/clients/${C1}`, { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(2500)

// ── 1. 월평균 수거량 ──────────────────────────────────────────────────────
let t = await body()
ok(/오남한양병원/.test(t), '거래처 화면이 열림')
//  8개월 합 59,552kg ÷ 8 = 7,444kg
const want = Math.round(ACT.reduce((s, a) => s + a[1], 0) / ACT.length)
//  화면은 1,000kg 이상을 톤으로 적습니다(lib/format 의 weight) — 7,444kg → 7.4톤
const wantTxt = want >= 1000 ? `${(want / 1000).toFixed(1)}톤` : `${want.toLocaleString('ko-KR')}kg`
ok(t.includes(wantTxt), `월평균 수거량이 0 이 아니라 ${wantTxt}`, `${want}kg`)
ok(!/월평균 수거량\s*0kg/.test(t.replace(/\s+/g, ' ')), '더 이상 0kg 이 아님')
await p.screenshot({ path: `${SHOT}/actuals-client.png`, fullPage: true })

// ── 2. 월 정산·명세서 탭 ──────────────────────────────────────────────────
await p.getByRole('button', { name: '월 정산·명세서' }).click()
await p.waitForTimeout(700)
ok((await p.locator('[data-monthly-actuals]').count()) === 1, '정산 탭에 월 실적 표가 나옴')
t = await body()
ok(/엑셀에서 가져온 월 실적/.test(t), '「엑셀에서 가져온 월 실적」 제목')
ok(/8개월/.test(t), '8개월로 표시')
for (const [m] of ACT) ok((await p.locator(`[data-actual-month="${m}"]`).count()) === 1, `${m} 줄이 있음`)
//  금액이 파일 그대로인지 (9,000,000원 × 8 = 72,000,000원)
ok(/72,000,000/.test(t.replace(/\s/g, '')) || /7,200만/.test(t), '합계 매출이 파일 그대로', '72,000,000')
ok(/202304_오남한양병원/.test(t), '어느 파일에서 왔는지 표시')

// ── 3. 월간 리포트 탭 ─────────────────────────────────────────────────────
await p.getByRole('button', { name: '월간 리포트' }).click()
await p.waitForTimeout(700)
ok((await p.locator('[data-monthly-actuals]').count()) === 1, '리포트 탭에도 월 실적이 나옴')
ok(/월간 리포트는 만들지 못하지만/.test(await body()), '왜 리포트가 없는지 설명')

// ── 4. 결제·미수금 탭 ─────────────────────────────────────────────────────
await p.getByRole('button', { name: '결제·미수금' }).click()
await p.waitForTimeout(700)
ok((await p.locator('[data-monthly-actuals]').count()) === 1, '결제·미수금 탭에도 월 실적이 나옴')
t = await body()
ok(/청구·미수금으로 만들지 않았습니다/.test(t), '미수금을 지어내지 않는다고 밝힘')
await p.screenshot({ path: `${SHOT}/actuals-billing.png`, fullPage: true })

// ── 5. 날짜별 기록이 있는 달은 그쪽이 우선 ────────────────────────────────
{
  //  「날짜별 기록 있음」은 저장된 표시가 아니라 **실제 수거 기록**으로 판정합니다
  //  (MonthlyActuals). 그래서 여기서는 2026-08 에 완료 수거를 한 건 넣습니다.
  const sched = [{
    id: '00000000-0000-0000-0000-0000000000s1', date: '2026-08-06', client_id: C1,
    waste_type: '의료폐기물', vehicle_id: null, scheduled_time: '', status: '완료',
    expected_amount: 498, actual_amount: 498, completed_at: '2026-08-06T09:00:00Z',
    memo: '', origin: 'migrated', is_additional: false, demo_session_id: null,
    created_at: '2026-08-06T00:00:00Z', updated_at: '2026-08-06T00:00:00Z',
  }]
  const ctx2 = await b.newContext({ viewport: { width: 1400, height: 1000 } })
  await ctx2.route('**/rest/v1/**', (r) => {
    const url = r.request().url()
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    if (url.includes('/profiles')) return json(single ? profile : [profile])
    if (url.includes('/client_monthly_actuals')) return json(actuals)
    if (url.includes('/schedules')) return json(sched)
    if (url.includes('/clients')) return json(single ? client : [client])
    if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
    return json([])
  })
  const p2 = await ctx2.newPage()
  await p2.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: UID, aud: 'authenticated', email: profile.email, app_metadata: {}, user_metadata: {} }])
  await p2.goto(`${BASE}/clients/${C1}`, { waitUntil: 'domcontentloaded' })
  await p2.waitForTimeout(2200)
  await p2.getByRole('button', { name: '월 정산·명세서' }).click()
  await p2.waitForTimeout(600)
  const row = await p2.locator('[data-actual-month="2026-08"]').textContent()
  ok(/날짜별 기록 있음/.test(row ?? ''), '날짜별 기록이 있는 달은 그렇게 표시')
  await ctx2.close()
}

await b.close()
console.log('')
console.log(`총 ${out.length}건 · 실패 ${out.filter((v) => !v).length}건`)
