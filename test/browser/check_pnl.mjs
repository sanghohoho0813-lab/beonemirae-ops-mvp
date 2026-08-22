import { chromium, EXEC } from './_pw.mjs'

//  월 운영비 · 영업이익 화면 검증 (통계 → 경영 요약).
//
//   가장 중요한 것: **운영비를 넣지 않은 달은 영업이익을 계산하지 않는다.**
//   0원으로 두면 기여이익이 그대로 영업이익처럼 보여 이익을 부풀립니다.
//
//   A병원 이번 달 12번 방문 · 1,200kg
//   B의원 이번 달  3번 방문 ·   300kg
//   운영비 인건비 300만 + 유류비 100만 = 400만
//    → 방문 비중 12:3 이면 A 320만 / B 80만

const BASE = 'http://localhost:4173'
const SHOT = (process.env.TEST_OUT ?? '/tmp')
const UID = '00000000-0000-0000-0000-0000000000ad'
const CA = '00000000-0000-0000-0000-0000000000a1'
const CB = '00000000-0000-0000-0000-0000000000b1'

const out = []
const ok = (c, m, d = '') => {
  //  바로 찍습니다 — 모아 뒀다가 끝에 한 번에 내보내면 중간에 터졌을 때
  //  앞의 결과까지 전부 사라지고, 회귀 집계에 「검사 0 · 실패 0」으로
  //  남아 통과한 것처럼 보입니다.
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  out.push(c)
  if (!c) process.exitCode = 1
}

const TODAY = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
const MONTH = TODAY.slice(0, 7)
const day = (n) => `${MONTH}-${String(n).padStart(2, '0')}`

const profile = {
  id: UID, email: 'admin@beonemirae.test', name: '대표', role: 'admin', font_scale: 'normal',
  active: true, approved_at: '2026-01-01T00:00:00Z', client_id: null, created_at: '2026-01-01T00:00:00Z',
}
const mkClient = (id, name) => ({
  id, name, type: '병원', address: '', manager: '', phone: '', collection_cycle: '주 1회',
  collects_medical_waste: true, collects_diaper: false, storage_size: '보통', note: '',
  is_demo_generated: false, demo_session_id: null, active: true,
  contract_start: null, contract_end: null, payment_terms: '', payment_due_day: null,
  //  kg 당 매출 1,000원 · 원가 400원 → 기여이익률 60%
  pricing: { medical: { sale: 1000, cost: 400 } },
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
})
const clients = [mkClient(CA, 'A병원'), mkClient(CB, 'B의원')]

const sched = []
let n = 0
const done = (clientId, d, kg) => {
  sched.push({
    id: `s${n++}`, date: d, client_id: clientId, waste_type: '의료폐기물', vehicle_id: null,
    scheduled_time: '', status: '완료', expected_amount: kg, actual_amount: kg,
    completed_at: `${d}T09:00:00Z`, memo: '', origin: 'migrated', is_additional: false,
    demo_session_id: null, plan_batch: null, created_at: `${d}T00:00:00Z`, updated_at: `${d}T00:00:00Z`,
  })
}
for (let i = 1; i <= 12; i++) done(CA, day(i), 100) // 12회 · 1,200kg
for (let i = 1; i <= 3; i++) done(CB, day(i + 15), 100) // 3회 · 300kg

//  매출 1,500,000 · 원가 600,000 · 기여이익 900,000
const REVENUE = 1500 * 1000
const PROFIT = 1500 * 600

let costs = []
let posted = null
const b = await chromium.launch({ executablePath: EXEC })

const makeCtx = async (prof = profile) => {
  const ctx = await b.newContext({ viewport: { width: 1500, height: 1200 } })
  await ctx.route('**/rest/v1/**', (r) => {
    const url = r.request().url()
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    if (url.includes('/rpc/set_operating_cost')) {
      posted = JSON.parse(r.request().postData() ?? '{}')
      const i = costs.findIndex((c) => c.category === posted.p_category)
      const row = {
        id: `c${costs.length}`, month: posted.p_month, category: posted.p_category,
        amount: posted.p_amount, memo: posted.p_memo ?? '', actor_name: '대표',
        updated_at: new Date().toISOString(),
      }
      if (i >= 0) costs[i] = row
      else costs.push(row)
      return json({ monthTotal: costs.reduce((s, c) => s + c.amount, 0) })
    }
    if (url.includes('/rpc/delete_operating_cost')) {
      const body = JSON.parse(r.request().postData() ?? '{}')
      costs = costs.filter((c) => c.category !== body.p_category)
      return json({ monthTotal: costs.reduce((s, c) => s + c.amount, 0) })
    }
    if (url.includes('/operating_costs')) return json(costs)
    if (url.includes('/profiles')) return json(single ? prof : [prof])
    if (url.includes('/schedules')) return json(sched)
    if (url.includes('/clients')) return json(single ? clients[0] : clients)
    if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
    return json([])
  })
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: prof.id, aud: 'authenticated', email: prof.email, app_metadata: {}, user_metadata: {} }])
  return { ctx, p }
}

const { ctx, p } = await makeCtx()
const body = () => p.textContent('main').then((t) => t ?? '')

await p.goto(`${BASE}/stats`, { waitUntil: 'domcontentloaded' })
await p.waitForSelector('[data-pnl-summary]', { timeout: 20000 })
await p.waitForTimeout(500)

// ── 1. 운영비를 넣기 전 ───────────────────────────────────────────────────
let t = await body()
ok((await p.locator('[data-pnl-summary]').count()) === 1, '영업이익 칸이 있음')
ok(/운영비를 넣지 않아 영업이익을 계산하지 않았습니다/.test(t), '운영비 미입력이면 영업이익을 계산하지 않는다고 밝힘')
const summary = (await p.locator('[data-pnl-summary]').textContent()) ?? ''
ok((summary.match(/미입력/g) ?? []).length === 2, '운영비·영업이익 두 칸이 「미입력」', summary.replace(/\s+/g, ' ').slice(0, 90))
ok(!/영업이익\s*0원/.test(summary.replace(/\s+/g, ' ')), '영업이익을 0원으로 보여 주지 않음')
ok(/0원으로 두면[\s\S]*이익을 부풀리게 됩니다/.test(t.replace(/\s+/g, ' ')), '왜 계산하지 않는지 설명')
ok((await p.locator('[data-alloc-note]').count()) === 0, '운영비가 없으면 배부도 하지 않음')
ok((await p.locator('[data-cost-panel]').count()) === 1, '운영비 입력 칸이 있음')
for (const c of ['인건비', '유류비', '차량 유지비', '임차료·수수료', '기타 운영비']) {
  ok((await p.locator(`[data-cost-row="${c}"]`).count()) === 1, `${c} 줄이 있음`)
}
ok((await p.locator('[data-cost-amount="인건비"]').textContent()) === '미입력', '넣기 전에는 「미입력」')

// ── 2. 운영비 입력 ────────────────────────────────────────────────────────
await p.locator('[data-cost-edit="인건비"]').click()
await p.locator('[data-cost-input="인건비"]').fill('3000000')
ok((await p.locator('[data-cost-input="인건비"]').inputValue()) === '3,000,000', '금액 칸에 쉼표가 붙음')
await p.locator('[data-cost-save="인건비"]').click()
await p.waitForTimeout(1200)
ok(posted?.p_month === MONTH && posted?.p_amount === 3000000 && posted?.p_category === '인건비',
  '서버로 월·항목·금액을 그대로 보냄', JSON.stringify(posted))

t = await body()
ok(/아직 유류비 · 차량 유지비 · 임차료·수수료 · 기타 운영비이\(가\) 빠져 있어/.test(t.replace(/\s+/g, ' ')),
  '한 항목만 넣으면 나머지가 빠졌다고 경고')
ok(!/운영비를 넣지 않아 영업이익을 계산하지 않았습니다/.test(t), '한 항목이라도 넣으면 영업이익을 계산')

await p.locator('[data-cost-edit="유류비"]').click()
await p.locator('[data-cost-input="유류비"]').fill('1000000')
await p.locator('[data-cost-save="유류비"]').click()
await p.waitForTimeout(1200)

// ── 3. 영업이익 = 기여이익 − 운영비 ───────────────────────────────────────
const OPCOST = 4000000
const OPPROFIT = PROFIT - OPCOST // 900,000 - 4,000,000 = -3,100,000 (적자)
t = await body()
ok(PROFIT === 900000, '이 시나리오의 기여이익은 90만원', String(PROFIT))
const sum2 = (await p.locator('[data-pnl-summary]').textContent()) ?? ''
ok(/400만/.test(sum2), '운영비 400만원이 표시', sum2.replace(/\s+/g, ' ').slice(0, 100))
ok(/-310만/.test(sum2), `영업이익이 ${OPPROFIT.toLocaleString('ko-KR')}원(적자)로 표시`, sum2.replace(/\s+/g, ' '))
ok(!/미입력/.test(sum2), '더 이상 미입력이 아님')

// ── 4. 거래처별 배부 (추정) ───────────────────────────────────────────────
ok((await p.locator('[data-alloc-note]').count()) === 1, '배부 안내가 나옴')
const note = (await p.locator('[data-alloc-note]').textContent()) ?? ''
ok(/추정치입니다/.test(note), '배부가 추정치라고 밝힘')
ok(/방문 횟수 비중/.test(note), '어떤 기준으로 나눴는지 밝힘')
ok(/청구서·거래명세서에는\s*들어가지 않습니다/.test(note.replace(/\s+/g, ' ')), '청구에 안 들어간다고 밝힘')

//  방문 12:3 → 400만 × 12/15 = 320만 / × 3/15 = 80만
//  A 기여이익 720,000 − 3,200,000 = -2,480,000
//  B 기여이익 180,000 −   800,000 =   -620,000
const aProfit = (await p.locator(`[data-alloc-profit="${CA}"]`).textContent()) ?? ''
const bProfit = (await p.locator(`[data-alloc-profit="${CB}"]`).textContent()) ?? ''
ok(/-2,480,000/.test(aProfit), 'A병원 배부 후 영업이익 -2,480,000원', aProfit)
ok(/-620,000/.test(bProfit), 'B의원 배부 후 영업이익 -620,000원', bProfit)

// ── 5. 기준을 바꾸면 배부도 바뀐다 ────────────────────────────────────────
//  수거량도 1200:300 = 12:3 으로 같으므로, 기준만 바뀌고 금액은 같아야 합니다.
await p.locator('[data-alloc-basis="kg"]').click()
await p.waitForTimeout(600)
const note2 = (await p.locator('[data-alloc-note]').textContent()) ?? ''
ok(/수거량\(kg\) 비중/.test(note2), '기준을 바꾸면 안내 문구도 바뀜')
ok(/-2,480,000/.test((await p.locator(`[data-alloc-profit="${CA}"]`).textContent()) ?? ''),
  '이 시나리오는 방문·kg 비중이 같아 금액도 같음')

await p.screenshot({ path: `${SHOT}/pnl-page.png`, fullPage: true })

// ── 6. 지우면 다시 「미입력」로 ────────────────────────────────────────────
await p.locator('[data-cost-edit="인건비"]').click()
await p.locator('[data-cost-remove="인건비"]').click()
await p.waitForTimeout(1200)
await p.locator('[data-cost-edit="유류비"]').click()
await p.locator('[data-cost-remove="유류비"]').click()
await p.waitForTimeout(1200)
t = await body()
ok(/운영비를 넣지 않아 영업이익을 계산하지 않았습니다/.test(t), '전부 지우면 다시 계산하지 않음')
ok((await p.locator('[data-alloc-note]').count()) === 0, '배부도 다시 사라짐')
await ctx.close()

// ── 7. 사무실 담당자는 볼 수만 있고 넣지 못한다 ───────────────────────────
{
  costs = [{ id: 'c0', month: MONTH, category: '인건비', amount: 3000000, memo: '', actor_name: '대표', updated_at: new Date().toISOString() }]
  const officeProfile = { ...profile, id: '00000000-0000-0000-0000-0000000000bf', role: 'office', name: '사무실' }
  const { ctx: c2, p: p2 } = await makeCtx(officeProfile)
  await p2.goto(`${BASE}/stats`, { waitUntil: 'domcontentloaded' })
  await p2.waitForSelector('[data-cost-panel]', { timeout: 20000 })
  await p2.waitForTimeout(500)
  ok((await p2.locator('[data-cost-amount="인건비"]').textContent())?.includes('3,000,000'),
    '사무실도 운영비 금액은 볼 수 있음')
  ok((await p2.locator('[data-cost-edit="인건비"]').count()) === 0, '사무실에게는 고치기 버튼이 없음')
  ok(/운영비 입력은 대표님만 할 수 있습니다/.test(await p2.textContent('main')), '왜 못 넣는지 적혀 있음')
  await c2.close()
}

// ── 8. 현장 담당자는 통계 화면 자체가 안 열린다 ───────────────────────────
{
  const fieldProfile = { ...profile, id: '00000000-0000-0000-0000-0000000000fd', role: 'field', name: '현장' }
  const { ctx: c3, p: p3 } = await makeCtx(fieldProfile)
  await p3.goto(`${BASE}/stats`, { waitUntil: 'domcontentloaded' })
  await p3.waitForTimeout(2000)
  ok((await p3.locator('[data-cost-panel]').count()) === 0, '현장 담당자에게는 운영비가 보이지 않음')
  await c3.close()
}

await b.close()
console.log('')
console.log(`총 ${out.length}건 · 실패 ${out.filter((v) => !v).length}건`)
