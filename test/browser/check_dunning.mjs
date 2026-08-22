import { chromium, EXEC } from './_pw.mjs'

//  미수금이 「얼마나 밀렸는지」 보이는지 확인합니다.
//
//   통장 대사까지는 시스템이 하는데, 그다음이 비어 있었습니다. 미수금
//   화면은 청구월 순으로만 늘어놓아서 석 달 밀린 곳과 어제 청구한 곳이
//   똑같이 보입니다. 이사님은 「누구한테 전화할지」를 눈으로 골랐습니다.
//
//   시나리오 (오늘 = 실행일, 한국 기준)
//    A병원   3개월 전 100만 청구 · 30만 부분입금  → 남은 70만 · 3개월 경과
//    B의원   1개월 전  50만 청구                  → 50만 · 1개월 경과
//    C요양   이번 달   40만 청구 · 결제일 없음     → 아직 밀린 게 아님 (제외)
//    E의원   1개월 전  20만 청구 · 결제일 5일      → 기한(이번 달 5일) 지남
//    F의원   3개월 전  60만 청구 · 취소           → 제외
//    G의원   3개월 전  80만 청구 · 전액 입금        → 제외
//   독촉 대상 3곳 · 합계 140만원

const BASE = 'http://localhost:4173'
const UID = '00000000-0000-0000-0000-0000000000ad'

const out = []
const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  out.push(c)
  if (!c) process.exitCode = 1
}

const TODAY = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
const [Y, M, D] = TODAY.split('-').map(Number)
const shiftMonth = (n) => {
  const y = Y + Math.floor((M - 1 + n) / 12)
  const m = ((((M - 1 + n) % 12) + 12) % 12) + 1
  return `${y}-${String(m).padStart(2, '0')}`
}
const MONTH = shiftMonth(0)
const M1 = shiftMonth(-1)
const M3 = shiftMonth(-3)

//  결제일 5일 거래처의 기한은 「청구월 다음 달 5일」 = 이번 달 5일.
//  실행일이 5일 이전이면 기한이 아직 안 지났으므로 개월 경과로 표시됩니다.
const dueThisMonth = `${MONTH}-05`
const daysLate = Math.round(
  (Date.UTC(Y, M - 1, D) - Date.UTC(Y, M - 1, 5)) / 86400000,
)
const expectE = daysLate > 0 ? `기한 ${daysLate}일 지남` : '1개월 경과'

const profile = {
  id: UID, email: 'admin@beonemirae.test', name: '대표', role: 'admin', font_scale: 'normal',
  active: true, approved_at: '2026-01-01T00:00:00Z', client_id: null, created_at: '2026-01-01T00:00:00Z',
}
const mkClient = (id, name, dueDay = null, phone = '', manager = '') => ({
  id, name, type: '병원', address: '', manager, phone, collection_cycle: '주 1회',
  collects_medical_waste: true, collects_diaper: false, storage_size: '보통', note: '',
  is_demo_generated: false, demo_session_id: null, active: true,
  contract_start: null, contract_end: null, payment_terms: '', payment_due_day: dueDay,
  pricing: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
})
const CA = '00000000-0000-0000-0000-0000000000a1'
const CB = '00000000-0000-0000-0000-0000000000b1'
const CC = '00000000-0000-0000-0000-0000000000c1'
const CE = '00000000-0000-0000-0000-0000000000e1'
const CF = '00000000-0000-0000-0000-0000000000f1'
const CG = '00000000-0000-0000-0000-00000000009a'
const clients = [
  mkClient(CA, 'A병원', null, '031-111-2222', '김간호'),
  mkClient(CB, 'B의원'),
  mkClient(CC, 'C요양병원'),
  mkClient(CE, 'E의원', 5),
  mkClient(CF, 'F의원'),
  mkClient(CG, 'G의원'),
]

const mkPay = (id, clientId, month, amount, status) => ({
  id, client_id: clientId, billing_month: month, amount, status,
  method: '무통장', paid_at: null, memo: '', snapshot: null,
  canceled_at: status === '취소' ? `${TODAY}T00:00:00Z` : null,
})
const payments = [
  mkPay('pa', CA, M3, 1000000, '미수금'),
  mkPay('pb', CB, M1, 500000, '미수금'),
  mkPay('pc', CC, MONTH, 400000, '미수금'),
  mkPay('pe', CE, M1, 200000, '미수금'),
  mkPay('pf', CF, M3, 600000, '취소'),
  mkPay('pg', CG, M3, 800000, '입금완료'),
]
const receipts = [
  { id: 'r1', payment_id: 'pa', received_on: TODAY, amount: 300000, method: '계좌이체',
    memo: '1차', actor_name: '사무실', created_at: `${TODAY}T00:00:00Z`, source_ref: null },
  { id: 'r2', payment_id: 'pg', received_on: TODAY, amount: 800000, method: '계좌이체',
    memo: '완납', actor_name: '사무실', created_at: `${TODAY}T00:00:00Z`, source_ref: null },
]

const b = await chromium.launch({ executablePath: EXEC })
const ctx = await b.newContext({
  viewport: { width: 1500, height: 1100 },
  permissions: ['clipboard-read', 'clipboard-write'],
})
await ctx.route('**/auth/v1/**', (r) =>
  r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: UID, aud: 'authenticated', email: profile.email, app_metadata: {}, user_metadata: {} }) }))
await ctx.route('**/rest/v1/**', (r) => {
  const url = r.request().url()
  const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
  const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
  if (url.includes('/rpc/app_schema_version')) return json(32)
  if (url.includes('/audit_logs')) return json([{ id: 1 }])
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

await p.goto(`${BASE}/receivables`, { waitUntil: 'domcontentloaded' })
await p.waitForSelector('[data-dunning]', { timeout: 20000 })

// ── 1. 대상 선정 ──────────────────────────────────────────────────────────
const rows = p.locator('[data-dunning-row]')
ok((await rows.count()) === 3, '독촉 대상 3곳 (이번 달 청구·취소·완납은 빠짐)', String(await rows.count()))
const panel = (await p.textContent('[data-dunning]')) ?? ''
ok(/1,400,000원/.test(panel), '독촉 합계 140만원 (부분입금 30만원을 뺀 값)',
  (panel.match(/독촉 대상[^원]*원/) ?? [''])[0])
ok(!/C요양병원/.test(panel), '이번 달 청구는 독촉 대상이 아님 (기한이 아직 안 옴)')
ok(!/F의원/.test(panel), '취소한 청구는 제외')
ok(!/G의원/.test(panel), '전액 입금한 청구는 제외')

// ── 2. 밀린 순서 · 경과 표시 ──────────────────────────────────────────────
const ids = await rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-dunning-row')))
ok(ids[0] === CA, '가장 오래 밀린 A병원이 맨 위', ids.join(','))
ok(ids[1] === CB && ids[2] === CE, '같은 1개월이면 금액이 큰 B의원 먼저', ids.join(','))
const rowA = (await rows.nth(0).textContent()) ?? ''
ok(/3개월 경과/.test(rowA), 'A병원 3개월 경과 표시', rowA.replace(/\s+/g, ' ').slice(0, 80))
ok(/700,000원/.test(rowA), 'A병원 남은 70만원 (청구 100만 - 입금 30만)')
const rowE = (await rows.nth(2).textContent()) ?? ''
ok(rowE.includes(expectE), `E의원은 결제일이 있으므로 「${expectE}」`, rowE.replace(/\s+/g, ' ').slice(0, 80))

// ── 3. 구간 요약 ──────────────────────────────────────────────────────────
const buckets = (await p.textContent('[data-dunning-buckets]')) ?? ''
ok(/3개월 이상 1곳/.test(buckets), '3개월 이상이 몇 곳인지 먼저 보임', buckets.replace(/\s+/g, ' ').slice(0, 90))
ok(/700,000원/.test(buckets), '3개월 이상 금액 70만원')

// ── 4. 연락 수단 ──────────────────────────────────────────────────────────
ok((await p.locator('[data-dunning-row="' + CA + '"] a[href^="tel:"]').count()) === 1, '전화번호가 있으면 바로 걸 수 있음')
ok((await p.locator('[data-dunning-row="' + CB + '"] a[href^="tel:"]').count()) === 0, '번호가 없으면 전화 버튼을 만들지 않음')

// ── 5. 독촉 문구 — 사실만 ─────────────────────────────────────────────────
await p.click(`[data-dunning-msg="${CA}"]`)
await p.waitForSelector('[data-dunning-text]', { timeout: 10000 })
const msg = await p.inputValue('[data-dunning-text]')
ok(msg.includes('A병원'), '문구에 거래처명', msg.split('\n')[0])
const [my, mm] = M3.split('-')
ok(msg.includes(`${my}년 ${Number(mm)}월분 700,000원`), '청구월과 남은 금액을 그대로', msg.replace(/\n/g, ' / ').slice(0, 120))
ok(/청구 1,000,000원 중 남은 금액/.test(msg), '부분입금을 받은 건은 그 사실을 밝힘')
ok(!/계좌|은행|[0-9]{3}-[0-9]{2,}-[0-9]{4,}/.test(msg), '계좌번호를 지어내지 않음')
ok(/이미 입금하셨다면/.test(msg), '이미 낸 곳을 위한 문장이 있음')
ok((await p.locator('[data-dunning-copy]').count()) === 1, '복사 버튼')
await p.click('[data-dunning-copy]')
await p.waitForTimeout(600)
const clip = await p.evaluate(() => navigator.clipboard.readText())
ok(clip === msg, '복사한 내용이 화면 문구와 같음', `${clip.length}자`)
await p.keyboard.press('Escape')
await p.waitForTimeout(500)

// ── 6. 미수금 목록에도 밀린 표시 ──────────────────────────────────────────
ok((await p.locator('[data-late="pa"]').count()) === 1, 'A병원 청구 카드에 밀린 표시')
ok((await p.locator('[data-late="pc"]').count()) === 0, '이번 달 청구에는 밀린 표시를 붙이지 않음')
const lateA = (await p.textContent('[data-late="pa"]')) ?? ''
ok(/3개월 경과/.test(lateA), '카드 표시도 3개월 경과', lateA)

// ── 7. 대시보드 ───────────────────────────────────────────────────────────
await p.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(2200)
const dash = (await p.textContent('main')) ?? ''
ok(/밀린 곳 3곳/.test(dash), '대시보드 미수금 옆에 밀린 곳 수', (dash.match(/밀린 곳[^·]*·[^0-9]*[\d,만원.]+/) ?? [''])[0])

await b.close()
console.log(`\n총 ${out.length}건 · 실패 ${out.filter((x) => !x).length}건`)
