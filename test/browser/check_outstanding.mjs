import { chromium, EXEC } from './_pw.mjs'

//  부분입금이 미수금 합계에 반영되는지 확인합니다.
//
//   0026 으로 부분입금을 넣었는데, 미수금 합계는 여전히 「상태가 입금완료가
//   아니면 청구액 전부」로 세고 있었습니다. 100만원 청구에 30만원이 들어와도
//   미수금은 100만원으로 잡힙니다 — 받은 돈이 장부에서 사라집니다.
//
//   거래처 화면은 paidTotalOf 를 써서 70만원으로 맞게 나오는데, 대시보드와
//   미수금 화면은 100만원입니다. 같은 화면 안에서 숫자가 갈립니다.
//
//   시나리오
//    A병원 100만원 청구 · 30만원 부분입금  → 남은 미수 70만원
//    B의원 50만원 청구 · 입금 없음          → 남은 미수 50만원
//    C요양 40만원 청구 · 40만원 전액 입금    → 남은 미수 0원
//    D의원 20만원 청구 · 취소               → 미수 아님
//    합계 120만원이어야 합니다 (예전 계산은 150만원)

const BASE = 'http://localhost:4173'
const UID = '00000000-0000-0000-0000-0000000000ad'

const out = []
const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  out.push(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  if (!c) process.exitCode = 1
}

const TODAY = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
const MONTH = TODAY.slice(0, 7)

const profile = {
  id: UID, email: 'admin@beonemirae.test', name: '대표', role: 'admin', font_scale: 'normal',
  active: true, approved_at: '2026-01-01T00:00:00Z', client_id: null, created_at: '2026-01-01T00:00:00Z',
}
const mkClient = (id, name) => ({
  id, name, type: '병원', address: '', manager: '', phone: '', collection_cycle: '주 1회',
  collects_medical_waste: true, collects_diaper: false, storage_size: '보통', note: '',
  is_demo_generated: false, demo_session_id: null, active: true,
  contract_start: null, contract_end: null, payment_terms: '', payment_due_day: null,
  pricing: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
})
const CA = '00000000-0000-0000-0000-0000000000a1'
const CB = '00000000-0000-0000-0000-0000000000b1'
const CC = '00000000-0000-0000-0000-0000000000c1'
const CD = '00000000-0000-0000-0000-0000000000d1'
const clients = [mkClient(CA, 'A병원'), mkClient(CB, 'B의원'), mkClient(CC, 'C요양병원'), mkClient(CD, 'D의원')]

const PA = 'p0000000-0000-0000-0000-0000000000a1'
const PB = 'p0000000-0000-0000-0000-0000000000b1'
const PC = 'p0000000-0000-0000-0000-0000000000c1'
const PD = 'p0000000-0000-0000-0000-0000000000d1'
const mkPay = (id, clientId, amount, status, paidAt = null) => ({
  id, client_id: clientId, billing_month: MONTH, amount, status,
  method: '무통장', paid_at: paidAt, memo: '', snapshot: null,
  canceled_at: status === '취소' ? `${TODAY}T00:00:00Z` : null,
})
const payments = [
  mkPay(PA, CA, 1000000, '미수금'),
  mkPay(PB, CB, 500000, '미수금'),
  mkPay(PC, CC, 400000, '입금완료', `${TODAY}T00:00:00Z`),
  mkPay(PD, CD, 200000, '취소'),
]
const receipts = [
  { id: 'r1', payment_id: PA, received_on: TODAY, amount: 300000, method: '계좌이체',
    memo: '1차', actor_name: '사무실', created_at: `${TODAY}T00:00:00Z`, source_ref: null },
  { id: 'r2', payment_id: PC, received_on: TODAY, amount: 400000, method: '계좌이체',
    memo: '완납', actor_name: '사무실', created_at: `${TODAY}T00:00:00Z`, source_ref: null },
]

const posted = []
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
  if (url.includes('/rpc/add_payment_receipt')) {
    posted.push(JSON.parse(r.request().postData() ?? '{}'))
    return json({ paidTotal: 1000000, outstanding: 0, status: '입금완료' })
  }
  if (url.includes('/payments') && method === 'PATCH') {
    posted.push({ DIRECT_PATCH: r.request().postData() })
    return json([{ id: 'x' }])
  }
  if (url.includes('/audit_logs') && method === 'POST') return json([{ id: 1 }])
  if (url.includes('/profiles')) return json(single ? profile : [profile])
  if (url.includes('/payment_receipts')) return json(receipts)
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
p.on('dialog', (d) => d.accept())

// ── 1. 미수금 화면 합계 ───────────────────────────────────────────────────
await p.goto(`${BASE}/receivables`, { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(2200)
let t = (await p.textContent('main')) ?? ''
ok(/1,200,000원/.test(t), '미수금 합계가 120만원 (부분입금 30만원을 뺀 값)',
  (t.match(/미수금 합계\s*[\d,]+원/) ?? [''])[0] || t.replace(/\s+/g, ' ').slice(0, 90))
ok(!/1,500,000원/.test(t), '청구액 전부(150만원)로 세지 않음')
ok(/700,000/.test(t), 'A병원 남은 미수 70만원이 보임')

// ── 2. 대시보드도 같은 값 ─────────────────────────────────────────────────
await p.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(2200)
t = (await p.textContent('main')) ?? ''
ok(/120만원|1,200,000/.test(t), '대시보드 미수금도 120만원', (t.match(/미수금[^0-9]{0,12}[\d,만원.]+/g) ?? []).join(' | ').slice(0, 90))
ok(!/150만원|1,500,000/.test(t), '대시보드도 부풀려지지 않음')

// ── 3. 거래처 화면과 숫자가 같아야 합니다 ─────────────────────────────────
await p.goto(`${BASE}/clients/${CA}`, { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(2200)
t = (await p.textContent('main')) ?? ''
ok(/700,000|70만원/.test(t), '거래처 화면도 70만원 — 화면끼리 숫자가 갈리지 않음',
  (t.match(/[\d,]+원/g) ?? []).slice(0, 6).join(','))

// ── 4. 「입금 완료 처리」가 실제 입금 기록을 남기는가 ─────────────────────
//
//   예전에는 상태만 입금완료로 바꿨습니다. 그러면 30만원만 들어온 청구가
//   「입금완료」가 되면서 남은 70만원이 장부에서 사라집니다. 통장 대사가
//   나중에 실제 입금을 붙일 자리도 없어집니다.
await p.goto(`${BASE}/receivables`, { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(2200)
const payBtn = p.locator('[data-mark-paid]').first()
ok((await payBtn.count()) >= 1, '입금 처리 버튼이 있음')
await payBtn.click()
await p.waitForTimeout(2000)
ok(posted.length >= 1, '서버로 무언가 보냄', String(posted.length))
ok(!posted.some((x) => x.DIRECT_PATCH), '상태만 바꾸지 않음 (payments 직접 수정 없음)')
const rec = posted.find((x) => x.p_payment_id)
ok(!!rec, '입금 기록으로 보냄')
ok(rec?.p_amount === 700000, '남은 금액 70만원만 기록 (이미 받은 30만원은 빼고)', String(rec?.p_amount))
ok(rec?.p_received_on === TODAY, '입금일은 오늘(한국) 날짜', String(rec?.p_received_on))
ok(!rec?.p_source_ref, '통장 지문 없이 — 손입력이므로')

await b.close()
