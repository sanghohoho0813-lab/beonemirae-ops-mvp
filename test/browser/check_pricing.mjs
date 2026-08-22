import { chromium, EXEC } from './_pw.mjs'

//  거래처 점검 화면 — 단가 + 세금계산서 정보.
//
//   청구가 틀리거나 막히는 원인은 거의 거래처에 빠진 값 하나입니다.
//   단가가 없으면 기본 950원/kg 으로 조용히 청구되고, 사업자정보가
//   없으면 세금계산서를 못 끊습니다. 그런데 이 둘을 확인하려면 거래처를
//   하나씩 열어야 했습니다.
//
//   시나리오 (실제 거래처 정산방식 4종을 그대로)
//    더원요양   단가 O · 세금 O · 청구 3개월          → 완료
//    남양주백   단가 X (기본값) · 세금 O · 청구 2개월  → 단가 확인 (위험)
//    오남한양   월정액 · 부가세 미지정 · 청구 1개월     → 세금계산서 확인
//    목동현대웰 지정 480 + 부가세별도 · 세금 O          → 완료
//    신규의원   단가 X · 세금 X · 청구·수거 없음        → 확인 필요 (안 급함)

const BASE = 'http://localhost:4173'
const UID = '00000000-0000-0000-0000-0000000000ad'

const out = []
const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  out.push(c)
  if (!c) process.exitCode = 1
}

const TODAY = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
const MONTH = TODAY.slice(0, 7)
const [Y, M] = MONTH.split('-').map(Number)

const profile = {
  id: UID, email: 'admin@beonemirae.test', name: '대표', role: 'admin', font_scale: 'normal',
  active: true, approved_at: '2026-01-01T00:00:00Z', client_id: null, created_at: '2026-01-01T00:00:00Z',
}
//  국세청 검증식을 통과하는 실제 형식의 번호
const GOOD = '124-81-00998'
const mkClient = (id, name, opts = {}) => ({
  id, name, type: '병원', address: '', manager: '', phone: '', collection_cycle: '주 1회',
  collects_medical_waste: opts.med ?? true, collects_diaper: opts.dia ?? false,
  storage_size: '보통', note: '',
  is_demo_generated: false, demo_session_id: null, active: true,
  contract_start: null, contract_end: null, payment_terms: '', payment_due_day: opts.due ?? null,
  pricing: opts.pricing ?? null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  biz_no: opts.tax === false ? null : GOOD,
  biz_ceo: opts.tax === false ? null : '김대표',
  biz_type: null, biz_item: null,
  tax_email: opts.tax === false ? null : 'a@x.kr',
  vat_mode: opts.vat === undefined ? (opts.tax === false ? null : '별도') : opts.vat,
})
const C1 = '00000000-0000-0000-0000-000000000001' // 더원요양병원
const C2 = '00000000-0000-0000-0000-000000000002' // 남양주백병원
const C3 = '00000000-0000-0000-0000-000000000003' // 오남한양병원
const C4 = '00000000-0000-0000-0000-000000000004' // 목동현대웰병원
const C5 = '00000000-0000-0000-0000-000000000005' // 신규의원
const clients = [
  mkClient(C1, '더원요양병원', { pricing: { medical: { sale: 950, cost: 350 } }, due: 20 }),
  mkClient(C2, '남양주백병원'),
  //  오남한양은 부가세 처리 방식만 비어 있습니다 — 단가는 멀쩡합니다.
  mkClient(C3, '오남한양병원', { pricing: { medicalMonthly: { sale: 9000000, cost: null } }, vat: null }),
  mkClient(C4, '목동현대웰병원', {
    med: false, dia: true,
    pricing: { diaper: { sale: 480, cost: 220 }, diaperVatPct: { sale: 10, cost: null } },
  }),
  mkClient(C5, '신규의원', { tax: false }),
]

const mkPay = (id, clientId, month) => ({
  id, client_id: clientId, billing_month: month, amount: 1000000, status: '입금완료',
  method: '무통장', paid_at: `${TODAY}T00:00:00Z`, memo: '', snapshot: null, canceled_at: null,
})
const payments = [
  mkPay('p1', C1, '2026-05'), mkPay('p2', C1, '2026-06'), mkPay('p3', C1, '2026-07'),
  mkPay('p4', C2, '2026-06'), mkPay('p5', C2, '2026-07'),
  mkPay('p6', C3, MONTH),
]

//  월말 청구 화면은 지난달을 기본으로 봅니다. 기본 단가로 계산되는 거래처의
//  완료 수거를 지난달에 하나 두어, 그 화면의 경고와 링크가 실제로 뜨게 합니다.
const [py, pm] = [Y, M - 1]
const PREV = pm === 0 ? `${Y - 1}-12` : `${py}-${String(pm).padStart(2, '0')}`
const schedules = [{
  id: 's1', date: `${PREV}-10`, client_id: C2, waste_type: '의료폐기물', vehicle_id: null,
  scheduled_time: '', status: '완료', expected_amount: 500, actual_amount: 500,
  completed_at: `${PREV}-10T09:00:00Z`, memo: '', origin: 'migrated', is_additional: false,
  demo_session_id: null, plan_batch: null, created_at: `${PREV}-10T00:00:00Z`, updated_at: `${PREV}-10T00:00:00Z`,
}]

const patched = []
const b = await chromium.launch({ executablePath: EXEC })
const ctx = await b.newContext({ viewport: { width: 1500, height: 1100 } })
await ctx.route('**/auth/v1/**', (r) =>
  r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: UID, aud: 'authenticated', email: profile.email, app_metadata: {}, user_metadata: {} }) }))
await ctx.route('**/rest/v1/**', (r) => {
  const url = r.request().url()
  const method = r.request().method()
  const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
  const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
  if (url.includes('/rpc/app_schema_version')) return json(32)
  if (url.includes('/rpc/set_client_pricing')) {
    const body = JSON.parse(r.request().postData() ?? '{}')
    patched.push({ url: `pricing:${body.p_client_id}`, body: { pricing: body.p_pricing, from: body.p_effective_from } })
    return json({ id: 'v1', effectiveFrom: body.p_effective_from, created: true })
  }
  if (url.includes('/audit_logs')) return json([{ id: 1 }])
  if (url.includes('/clients') && method === 'PATCH') {
    patched.push({ url, body: JSON.parse(r.request().postData() ?? '{}') })
    return json([{ ...clients[1], pricing: JSON.parse(r.request().postData() ?? '{}').pricing }])
  }
  if (url.includes('/profiles')) return json(single ? profile : [profile])
  if (url.includes('/payment_receipts')) return json([])
  if (url.includes('/schedules')) return json(schedules)
  if (url.includes('/payments')) return json(payments)
  if (url.includes('/clients')) return json(single ? clients[0] : clients)
  if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
  return json([])
})
const p = await ctx.newPage()
await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
  access_token: 't', token_type: 'bearer', expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
})), ['beonemirae-ops:auth', { id: UID, aud: 'authenticated', email: profile.email, app_metadata: {}, user_metadata: {} }])

await p.goto(`${BASE}/pricing`, { waitUntil: 'domcontentloaded' })
await p.waitForSelector('[data-price-summary]', { timeout: 20000 })
//  요약 칸은 자료가 오기 전에도 그려집니다. 행이든 「없음」이든 결과가
//  그려진 뒤에 읽습니다 — 없을 때 죽어 버리면 무엇이 틀렸는지 안 보입니다.
await p.waitForSelector('[data-price-row], [data-empty], main h3', { timeout: 20000 })
await p.waitForTimeout(900)

// ── 1. 요약 ───────────────────────────────────────────────────────────────
const sumTxt = ((await p.textContent('[data-price-summary]')) ?? '').replace(/\s+/g, ' ')
ok(/거래처\s*5곳/.test(sumTxt), '거래처 5곳', sumTxt)
ok(/기본 단가\s*2곳/.test(sumTxt), '기본 단가로 굴러가는 곳 2곳 (남양주백·신규)', sumTxt)
ok(/세금계산서\s*2곳/.test(sumTxt), '세금계산서 정보가 빠진 곳 2곳 (오남한양·신규)', sumTxt)

// ── 2. 경고는 「이미 청구가 나간 곳」만 ───────────────────────────────────
const warn = (await p.textContent('[data-price-warn]')) ?? ''
ok(/1곳이 기본 단가로/.test(warn.replace(/\s+/g, ' ')), '청구가 나간 곳만 경고 (신규의원은 급하지 않음)',
  warn.replace(/\s+/g, ' ').slice(0, 80))
ok(/남양주백병원/.test(warn), '경고에 거래처 이름을 적음')
ok(!/신규의원/.test(warn), '청구·수거가 없는 신규 거래처는 경고에서 뺌')

//  세금계산서도 같은 기준 — 청구가 나간 곳만 경고합니다.
const taxWarn = ((await p.textContent('[data-tax-warn]')) ?? '').replace(/\s+/g, ' ')
ok(/1곳은 아직 세금계산서를 끊을 수 없습니다/.test(taxWarn), '세금계산서 경고도 청구가 나간 곳만',
  taxWarn.slice(0, 80))
ok(/짐작하면 틀린/.test(taxWarn), '왜 시스템이 안 채우는지 적음')

// ── 3. 기본값 표시 ────────────────────────────────────────────────────────
//  기본 필터가 「확인 필요」이므로 남양주백·신규의원만 보여야 합니다.
let rows = await p.locator('[data-price-row]').evaluateAll((els) => els.map((e) => e.getAttribute('data-price-row')))
ok(rows.length === 3, '확인 필요 필터에 3곳 (남양주백·신규·오남한양)', String(rows.length))
ok(rows[0] === C2, '단가가 틀린 채 청구되는 남양주백병원이 맨 위', rows.join(','))
ok(rows[2] === C3, '세금계산서만 빠진 곳은 그 아래 — 틀린 금액이 나가는 쪽이 급합니다', rows.join(','))
const r2 = ((await p.textContent(`[data-price-row="${C2}"]`)) ?? '').replace(/\s+/g, ' ')
ok(/950원\/kg/.test(r2), '남양주백은 기본 950원/kg 으로 청구 중임을 그대로 보여 줌', r2.slice(0, 90))
ok(/기본값/.test(r2), '「기본값」이라고 못 박음')
ok(/청구 2개월/.test(r2), '청구 이력을 함께 보여 줌 — 급한 곳부터 고치도록')

//  세금계산서가 무엇이 빠졌는지 그 자리에 적어야 합니다
const r3check = ((await p.textContent(`[data-price-row="${C3}"]`)) ?? '').replace(/\s+/g, ' ')
ok(/부가세 처리 방식 없음/.test(r3check), '오남한양은 부가세 방식이 빠진 것을 콕 집어 말함', r3check.slice(0, 110))
ok(!/사업자등록번호 없음/.test(r3check), '있는 값은 빠졌다고 하지 않음')
ok((await p.locator(`[data-tax-missing="${C2}"]`).count()) === 0, '남양주백은 세금계산서가 준비돼 있음')

// ── 4. 확인이 끝난 곳 ─────────────────────────────────────────────────────
await p.click('button:has-text("완료")')
await p.waitForTimeout(900)
rows = await p.locator('[data-price-row]').evaluateAll((els) => els.map((e) => e.getAttribute('data-price-row')))
ok(rows.length === 2, '완료 필터에 2곳 (더원·목동)', rows.join(','))
await p.click('button:has-text("전체")')
await p.waitForTimeout(700)
rows = await p.locator('[data-price-row]').evaluateAll((els) => els.map((e) => e.getAttribute('data-price-row')))
ok(rows.length === 5, '전체 필터에 5곳', String(rows.length))
const r3 = ((await p.textContent(`[data-price-row="${C3}"]`)) ?? '').replace(/\s+/g, ' ')
ok(/월정액\s*9,000,000원/.test(r3), '오남한양은 월정액 900만원 (kg 단가가 아님)', r3.slice(0, 90))
ok(/월정액/.test(r3) && !/기본값/.test(r3), '월정액 거래처에 기본값 딱지를 붙이지 않음')
const r4 = ((await p.textContent(`[data-price-row="${C4}"]`)) ?? '').replace(/\s+/g, ' ')
ok(/일회용기저귀\s*480원\/kg/.test(r4), '목동현대웰 지정 480원/kg', r4.slice(0, 90))
ok(/부가세 10% 별도/.test(r4), '부가세 별도 계약을 표시', r4.slice(0, 100))
ok(!/계약 물품/.test(r2 + r4), '계약으로 정하지 않은 기본 물품가는 카드에 늘어놓지 않음')
ok(!/의료폐기물/.test(r4), '수거하지 않는 구분은 아예 묻지 않음 (목동은 지정만)')

//  결제일은 없어도 정상입니다 — 참고로만 적고 「확인 필요」로 세지 않습니다.
ok((await p.locator(`[data-no-dueday="${C2}"]`).count()) === 1, '결제일이 없으면 참고로 적음')
ok((await p.locator(`[data-no-dueday="${C1}"]`).count()) === 0, '결제일을 넣은 곳에는 안 적음')

// ── 5. 고치는 창은 거래처 화면과 같은 창 ──────────────────────────────────
await p.click('button:has-text("확인 필요")')
await p.waitForTimeout(700)
await p.click(`[data-price-edit="${C2}"]`)
await p.waitForTimeout(900)
const modal = (await p.textContent('body')) ?? ''
ok(/남양주백병원 단가/.test(modal), '거래처 단가 창이 열림')
ok(/한 번 정하면 매달 다시 입력하지 않습니다/.test(modal), '거래처 화면과 같은 창 (문구가 같음)')

//  실제로 저장되는지 — 의료 판매단가를 900 으로 바꿉니다.
const saleInput = p.locator('table input[type="number"]').first()
await saleInput.fill('900')
await p.click('button:has-text("저장")')
await p.waitForTimeout(1200)
ok(patched.length === 1, '거래처 하나만 저장 (일괄 변경 아님)', String(patched.length))
ok(patched[0]?.url.includes(C2), '남양주백병원에만 저장')
ok(patched[0]?.url.startsWith('pricing:'), '단가는 서버 함수로 — 거래처 표를 직접 고치면 판과 어긋납니다',
  String(patched[0]?.url))
const saved = patched[0]?.body?.pricing
ok(saved?.medical?.sale === 900, '바꾼 단가 900원이 그대로 저장', JSON.stringify(saved?.medical))
ok(saved?.medical?.cost === 350, '건드리지 않은 원가는 기존 값 유지', JSON.stringify(saved?.medical))

// ── 5-2. 세금계산서 정보를 그 자리에서 넣을 수 있는가 ─────────────────────
//  여기서 못 넣으면 거래처 화면으로 스무 번 왕복하게 됩니다.
await p.click(`[data-tax-edit="${C3}"]`)
await p.waitForSelector('[data-tax-field="vatMode"]', { timeout: 10000 })
const taxModal = (await p.textContent('body')) ?? ''
ok(/오남한양병원 세금계산서 정보/.test(taxModal), '세금계산서 창이 열림')
ok(/짐작하지\s*\n?\s*않습니다|짐작하지 않습니다/.test(taxModal.replace(/\s+/g, ' ')), '부가세는 사람이 정한다고 적음')
await p.selectOption('[data-tax-field="vatMode"]', '포함')
await p.fill('[data-tax-field="bizItem"]', '의료폐기물')
await p.click('[data-tax-save]')
await p.waitForTimeout(1500)
const taxPatch = patched.find((x) => x.url.includes(C3))
ok(!!taxPatch, '세금계산서 정보가 서버로 감', String(patched.length))
ok(taxPatch?.body?.vat_mode === '포함', '고른 부가세 방식이 저장 요청에 실림', JSON.stringify(taxPatch?.body?.vat_mode))
ok(taxPatch?.body?.biz_item === '의료폐기물', '종목도 함께', JSON.stringify(taxPatch?.body?.biz_item))
ok(taxPatch?.body?.pricing === undefined, '단가는 건드리지 않음 — 넣은 칸만 저장',
  JSON.stringify(Object.keys(taxPatch?.body ?? {})))

// ── 6. 월말 청구에서 여기로 오는 길 ───────────────────────────────────────
await p.goto(`${BASE}/billing`, { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(2200)
const link = p.locator('[data-close-pricing-link]')
ok((await link.count()) === 1, '월말 청구의 기본 단가 경고에 단가 화면으로 가는 길이 있음')
ok((await link.getAttribute('href')) === '/pricing', '링크가 /pricing 으로 감', String(await link.getAttribute('href')))
await link.click()
await p.waitForSelector('[data-price-summary]', { timeout: 15000 })
ok(p.url().endsWith('/pricing'), '눌러서 실제로 단가 화면이 열림', p.url())

// ── 7. 현장 담당자는 못 봅니다 (단가는 청구 금액을 정하는 값) ─────────────
await p.evaluate(() => window.localStorage.removeItem('beonemirae-ops:auth'))
const ctx2 = await b.newContext({ viewport: { width: 1500, height: 1100 } })
await ctx2.route('**/auth/v1/**', (r) =>
  r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: UID, aud: 'authenticated', email: 'field@beonemirae.test', app_metadata: {}, user_metadata: {} }) }))
await ctx2.route('**/rest/v1/**', (r) => {
  const url = r.request().url()
  const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
  const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
  if (url.includes('/rpc/app_schema_version')) return json(32)
  if (url.includes('/rpc/set_client_pricing')) {
    const body = JSON.parse(r.request().postData() ?? '{}')
    patched.push({ url: `pricing:${body.p_client_id}`, body: { pricing: body.p_pricing, from: body.p_effective_from } })
    return json({ id: 'v1', effectiveFrom: body.p_effective_from, created: true })
  }
  if (url.includes('/profiles')) return json(single ? { ...profile, role: 'field', name: '기사' } : [{ ...profile, role: 'field' }])
  if (url.includes('/clients')) return json(single ? clients[0] : clients)
  if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
  return json([])
})
const p2 = await ctx2.newPage()
await p2.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
  access_token: 't', token_type: 'bearer', expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
})), ['beonemirae-ops:auth', { id: UID, aud: 'authenticated', email: 'field@beonemirae.test', app_metadata: {}, user_metadata: {} }])
await p2.goto(`${BASE}/pricing`, { waitUntil: 'domcontentloaded' })
await p2.waitForTimeout(2500)
ok((await p2.locator('[data-price-summary]').count()) === 0, '현장 담당자는 단가 화면이 열리지 않음',
  p2.url())

await b.close()
console.log(`\n총 ${out.length}건 · 실패 ${out.filter((x) => !x).length}건`)
