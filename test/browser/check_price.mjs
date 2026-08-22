import { chromium, EXEC } from './_pw.mjs'

//  단가 적용기간 · 변경 이력.
//
//   거래처 단가는 지금까지 「현재 값」 한 칸뿐이라, 계약 중간에 단가가
//   바뀌면 **아직 확정하지 않은 지난달까지 새 단가로 계산**됐습니다.
//   3월분을 확정하기 전에 4월에 950 → 1,200원으로 올리면 3월 청구서가
//   1,200원으로 나갑니다. 병원에 잘못된 금액입니다.
//
//   시나리오
//    A병원  1,000kg 수거가 두 달 (3개월 전 · 2개월 전)
//           단가 판: 처음부터 950원 / 2개월 전 1일부터 1,200원
//           → 3개월 전 달은 95만원, 2개월 전 달은 120만원이어야 합니다
//    B의원  판이 하나도 없음 → 지금 단가(950원)를 모든 달에 씁니다
//           (마이그레이션만 하고 아무것도 안 넣으면 동작이 안 바뀝니다)

const BASE = 'http://localhost:4173'
const UID = '00000000-0000-0000-0000-0000000000ad'

const out = []
const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  out.push(c)
  if (!c) process.exitCode = 1
}

const TODAY = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
const [Y, M] = TODAY.slice(0, 7).split('-').map(Number)
const monthAt = (back) => {
  const t = Y * 12 + (M - 1) - back
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`
}
const M3 = monthAt(3) // 옛 단가 달
const M2 = monthAt(2) // 새 단가 달

const profile = {
  id: UID, email: 'admin@beonemirae.test', name: '대표', role: 'admin', font_scale: 'normal',
  active: true, approved_at: '2026-01-01T00:00:00Z', client_id: null, created_at: '2026-01-01T00:00:00Z',
}
const mkClient = (id, name, pricing) => ({
  id, name, type: '병원', address: '', manager: '', phone: '', collection_cycle: '주 1회',
  collects_medical_waste: true, collects_diaper: false, storage_size: '보통', note: '',
  is_demo_generated: false, demo_session_id: null, active: true,
  contract_start: null, contract_end: null, payment_terms: '', payment_due_day: null,
  pricing, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  biz_no: null, biz_ceo: null, biz_type: null, biz_item: null, tax_email: null, vat_mode: null,
  flat_fee_when_empty: false,
})
const CA = '00000000-0000-0000-0000-0000000000a1'
const CB = '00000000-0000-0000-0000-0000000000b1'
//  지금 단가는 둘 다 1,200원 / 950원 — 판이 있는 A 만 과거가 달라야 합니다.
const clients = [
  mkClient(CA, 'A병원', { medical: { sale: 1200, cost: 350 } }),
  mkClient(CB, 'B의원', { medical: { sale: 950, cost: 350 } }),
]

//  단가 판 — A병원만
const clientPrices = [
  { id: 'p1', client_id: CA, effective_from: `${monthAt(12)}-01`, pricing: { medical: { sale: 950, cost: 350 } },
    memo: '', actor_name: '대표', created_at: '2026-01-01T00:00:00Z' },
  { id: 'p2', client_id: CA, effective_from: `${M2}-01`, pricing: { medical: { sale: 1200, cost: 350 } },
    memo: '', actor_name: '대표', created_at: '2026-01-01T00:00:00Z' },
]

const mkSched = (id, clientId, date, kg) => ({
  id, date, client_id: clientId, waste_type: '의료폐기물', vehicle_id: null,
  scheduled_time: '', status: '완료', expected_amount: kg, actual_amount: kg,
  completed_at: `${date}T09:00:00Z`, memo: '', origin: 'migrated', is_additional: false,
  demo_session_id: null, plan_batch: null, created_at: `${date}T00:00:00Z`, updated_at: `${date}T00:00:00Z`,
})
const schedules = [
  mkSched('a3', CA, `${M3}-10`, 1000),
  mkSched('a2', CA, `${M2}-10`, 1000),
  mkSched('b3', CB, `${M3}-10`, 1000),
]

const rpc = []
const b = await chromium.launch({ executablePath: EXEC })
const ctx = await b.newContext({ viewport: { width: 1500, height: 1200 } })
await ctx.route('**/auth/v1/**', (r) =>
  r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: UID, aud: 'authenticated', email: profile.email, app_metadata: {}, user_metadata: {} }) }))
await ctx.route('**/rest/v1/**', (r) => {
  const url = r.request().url()
  const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
  const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
  if (url.includes('/rpc/app_schema_version')) return json(36)
  if (url.includes('/rpc/set_client_pricing')) {
    rpc.push(JSON.parse(r.request().postData() ?? '{}'))
    return json({ id: 'new', effectiveFrom: '2026-01-01', created: true })
  }
  if (url.includes('/clients') && r.request().method() === 'PATCH') {
    rpc.push({ DIRECT_PATCH: r.request().postData() })
    return json([{ id: 'x' }])
  }
  if (url.includes('/audit_logs')) return json([{ id: 1 }])
  if (url.includes('/profiles')) return json(single ? profile : [profile])
  if (url.includes('/client_prices')) return json(clientPrices)
  if (url.includes('/holidays')) return json([])
  if (url.includes('/payment_receipts')) return json([])
  if (url.includes('/payments')) return json([])
  if (url.includes('/schedules')) return json(schedules)
  if (url.includes('/clients')) return json(single ? clients[0] : clients)
  if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
  return json([])
})
const p = await ctx.newPage()
await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
  access_token: 't', token_type: 'bearer', expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
})), ['beonemirae-ops:auth', { id: UID, aud: 'authenticated', email: profile.email, app_metadata: {}, user_metadata: {} }])
p.on('dialog', (d) => d.accept())

// ── 1. 과거 달은 그때 단가로 ─────────────────────────────────────────────
await p.goto(`${BASE}/billing`, { waitUntil: 'domcontentloaded' })
await p.waitForSelector('[data-close-summary]', { timeout: 20000 })
await p.waitForTimeout(900)
await p.click(`[data-close-month="${M3}"]`)
await p.waitForTimeout(900)
const old = ((await p.textContent(`[data-close-row="${CA}"]`)) ?? '').replace(/\s+/g, ' ')
ok(/950,000원/.test(old), `${M3} 은 그때 단가 950원 → 95만원 (지금 단가 1,200원이 아님)`, old.slice(0, 80))
ok(!/1,200,000원/.test(old), '지금 단가로 과거를 다시 계산하지 않음')

await p.click(`[data-close-month="${M2}"]`)
await p.waitForTimeout(900)
const cur = ((await p.textContent(`[data-close-row="${CA}"]`)) ?? '').replace(/\s+/g, ' ')
ok(/1,200,000원/.test(cur), `${M2} 은 새 단가 1,200원 → 120만원`, cur.slice(0, 80))

// ── 2. 판이 없으면 지금까지와 똑같이 ─────────────────────────────────────
await p.click(`[data-close-month="${M3}"]`)
await p.waitForTimeout(900)
const noVer = ((await p.textContent(`[data-close-row="${CB}"]`)) ?? '').replace(/\s+/g, ' ')
ok(/950,000원/.test(noVer), '판이 하나도 없는 거래처는 지금 단가를 그대로 씀', noVer.slice(0, 80))

// ── 3. 명세서도 같은 단가 ────────────────────────────────────────────────
//  정산과 명세서가 갈리면 병원에 보낸 종이와 미수금 장부가 어긋납니다.
await p.goto(`${BASE}/clients/${CA}`, { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(2400)
const detail = ((await p.textContent('main')) ?? '').replace(/\s+/g, ' ')
ok(detail.length > 0, '거래처 화면이 열림')

// ── 4. 단가 창에 「언제부터」 칸이 있는가 ────────────────────────────────
await p.goto(`${BASE}/pricing`, { waitUntil: 'domcontentloaded' })
await p.waitForSelector('[data-price-summary]', { timeout: 20000 })
await p.waitForTimeout(900)
await p.click('button:has-text("전체")')
await p.waitForTimeout(700)
await p.click(`[data-price-edit="${CA}"]`)
await p.waitForSelector('[data-price-from]', { timeout: 10000 })
ok(await p.locator('[data-price-from]').inputValue() === TODAY, '기본은 오늘부터',
  await p.locator('[data-price-from]').inputValue())
const modal = ((await p.textContent('body')) ?? '').replace(/\s+/g, ' ')
ok(/그 전 달은 그때 단가 그대로/.test(modal), '무슨 뜻인지 화면에 적음')

// ── 5. 저장이 서버 함수로 가는가 (지금 단가 + 판을 한 번에) ──────────────
rpc.length = 0
await p.fill('[data-price-from]', `${M2}-01`)
const saleInput = p.locator('table input[type="number"]').first()
await saleInput.fill('1500')
await p.click('button:has-text("저장")')
await p.waitForTimeout(1800)
ok(rpc.length === 1, '한 번만 저장', String(rpc.length))
ok(!rpc.some((x) => x.DIRECT_PATCH), '거래처 표를 직접 고치지 않음 — 판과 어긋나지 않게 서버 함수로')
ok(rpc[0]?.p_effective_from === `${M2}-01`, '고른 적용 시작일을 그대로 보냄', String(rpc[0]?.p_effective_from))
ok(rpc[0]?.p_pricing?.medical?.sale === 1500, '바꾼 단가를 그대로 보냄', JSON.stringify(rpc[0]?.p_pricing?.medical))
ok(rpc[0]?.p_client_id === CA, 'A병원에만')

// ── 6. 판이 몇 개인지 화면에 ─────────────────────────────────────────────
await p.goto(`${BASE}/pricing`, { waitUntil: 'domcontentloaded' })
await p.waitForSelector('[data-price-summary]', { timeout: 20000 })
await p.click('button:has-text("전체")')
await p.waitForTimeout(900)
const since = ((await p.textContent(`[data-price-since="${CA}"]`)) ?? '').replace(/\s+/g, ' ')
ok(/지금 단가/.test(since) && /이전 판 1개/.test(since), '언제부터인지와 이전 판 개수를 보여 줌', since)
ok((await p.locator(`[data-price-since="${CB}"]`).count()) === 0, '판이 없는 거래처에는 아무것도 안 적음')

await b.close()
console.log(`\n총 ${out.length}건 · 실패 ${out.filter((x) => !x).length}건`)
