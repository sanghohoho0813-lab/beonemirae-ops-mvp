import { chromium, EXEC } from './_pw.mjs'

//  돈 기록 잠금 (0037) — 화면 쪽.
//
//   취소한 청구는 매출에도 미수금에도 안 잡힙니다. 그런데 그 청구에 입금
//   기록이 남아 있으면 **실제로 받은 돈이 어느 숫자에도 없습니다.**
//
//   시나리오
//    A병원  이번 달 청구 100만원 · 부분입금 40만원
//           → 취소 버튼이 없고, 왜 못 하는지 적혀 있어야 합니다
//    B의원  이번 달 청구 50만원 · 입금 없음
//           → 취소할 수 있고, 표를 직접 고치지 않고 서버 함수로 가야 합니다
//    C의원  이미 취소된 청구 30만원인데 입금 20만원이 남아 있음 (0037 이전 자료)
//           → 미수금 화면이 「갈 곳 없는 입금」으로 찾아 줘야 합니다

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

const profile = {
  id: UID, email: 'admin@beonemirae.test', name: '대표', role: 'admin', font_scale: 'normal',
  active: true, approved_at: '2026-01-01T00:00:00Z', client_id: null, created_at: '2026-01-01T00:00:00Z',
}
const mkClient = (id, name) => ({
  id, name, type: '병원', address: '', manager: '', phone: '', collection_cycle: '주 1회',
  collects_medical_waste: true, collects_diaper: false, storage_size: '보통', note: '',
  is_demo_generated: false, demo_session_id: null, active: true,
  contract_start: null, contract_end: null, payment_terms: '', payment_due_day: null,
  pricing: { medical: { sale: 950, cost: 350 } },
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  biz_no: null, biz_ceo: null, biz_type: null, biz_item: null, tax_email: null, vat_mode: null,
  flat_fee_when_empty: false,
})
const CA = '00000000-0000-0000-0000-0000000000a1'
const CB = '00000000-0000-0000-0000-0000000000b1'
const CC = '00000000-0000-0000-0000-0000000000c1'
const clients = [mkClient(CA, 'A병원'), mkClient(CB, 'B의원'), mkClient(CC, 'C의원')]

//  정산 화면은 그 달에 집계할 것이 있어야 청구 카드를 그립니다.
const mkSched = (id, clientId, kg) => ({
  id, date: `${MONTH}-05`, client_id: clientId, waste_type: '의료폐기물', vehicle_id: null,
  scheduled_time: '', status: '완료', expected_amount: kg, actual_amount: kg,
  completed_at: `${MONTH}-05T09:00:00Z`, memo: '', origin: 'migrated', is_additional: false,
  demo_session_id: null, plan_batch: null,
  created_at: `${MONTH}-05T00:00:00Z`, updated_at: `${MONTH}-05T00:00:00Z`,
})
const schedules = [mkSched('sa', CA, 100), mkSched('sb', CB, 100), mkSched('sc', CC, 100)]

const mkPay = (id, clientId, amount, status, canceled = null) => ({
  id, client_id: clientId, billing_month: MONTH, amount, status,
  method: '무통장', paid_at: null, memo: '', demo_session_id: null,
  snapshot: { kind: '정기', invoice: null }, canceled_at: canceled,
  created_at: `${TODAY}T00:00:00Z`, updated_at: `${TODAY}T00:00:00Z`,
})
const payments = [
  mkPay('pa', CA, 1000000, '미수금'),
  mkPay('pb', CB, 500000, '미수금'),
  mkPay('pc', CC, 300000, '취소', `${TODAY}T00:00:00Z`),
]
const receipts = [
  { id: 'ra', payment_id: 'pa', received_on: TODAY, amount: 400000, method: '계좌이체',
    memo: '', actor_name: '대표', created_at: `${TODAY}T00:00:00Z`, source_ref: null },
  //  0037 이전에 만들어진 어긋난 자료 — 취소된 청구에 입금이 달려 있음
  { id: 'rc', payment_id: 'pc', received_on: TODAY, amount: 200000, method: '계좌이체',
    memo: '', actor_name: '대표', created_at: `${TODAY}T00:00:00Z`, source_ref: null },
]

const calls = []
let cancelFails = false
const b = await chromium.launch({ executablePath: EXEC })
const ctx = await b.newContext({ viewport: { width: 1500, height: 1400 } })
await ctx.route('**/auth/v1/**', (r) =>
  r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: UID, aud: 'authenticated', email: profile.email, app_metadata: {}, user_metadata: {} }) }))
await ctx.route('**/rest/v1/**', (r) => {
  const url = r.request().url()
  const method = r.request().method()
  const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
  const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
  if (url.includes('/rpc/app_schema_version')) return json(37)
  if (url.includes('/rpc/cancel_billing')) {
    const body = JSON.parse(r.request().postData() ?? '{}')
    calls.push({ kind: 'rpc', ...body })
    if (cancelFails) {
      return r.fulfill({ status: 400, contentType: 'application/json',
        body: JSON.stringify({ message: '이 청구에는 입금 400,000원이 이미 기록되어 있습니다. 거래처 화면에서 입금을 먼저 취소한 뒤 청구를 취소해 주세요.' }) })
    }
    return json({ id: body.p_payment_id, status: '취소' })
  }
  if (url.includes('/payments') && method === 'PATCH') {
    calls.push({ kind: 'PATCH', body: r.request().postData() })
    return json([{ id: 'x' }])
  }
  if (url.includes('/audit_logs')) return json([{ id: 1 }])
  if (url.includes('/profiles')) return json(single ? profile : [profile])
  if (url.includes('/client_prices')) return json([])
  if (url.includes('/holidays')) return json([])
  if (url.includes('/payment_receipts')) return json(receipts)
  if (url.includes('/payments')) return json(payments)
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

let promptAnswer = '중복 청구'
p.on('dialog', (d) => {
  if (d.type() === 'prompt') void d.accept(promptAnswer)
  else void d.accept()
})

async function openSettlement(clientId) {
  await p.goto(`${BASE}/clients/${clientId}`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(2200)
  await p.click('button:has-text("월 정산·명세서")')
  await p.waitForTimeout(900)
}

// ── 1. 입금이 있는 청구는 취소 버튼이 없다 ────────────────────────────────
await openSettlement(CA)
ok((await p.locator('[data-bill-cancel="pa"]').count()) === 0, '부분입금이 있는 청구에는 취소 버튼이 없음')
ok((await p.locator('[data-bill-cancel-blocked="pa"]').count()) === 1, '대신 왜 못 하는지 자리에 적음')
const blocked = ((await p.textContent('[data-bill-cancel-blocked="pa"]')) ?? '').replace(/\s+/g, ' ')
ok(/입금 400,000원 기록됨/.test(blocked), '얼마가 들어왔는지 그대로', blocked.slice(0, 80))
ok(/입금을 먼저 취소/.test(blocked), '무엇을 먼저 해야 하는지 적음')

// ── 2. 입금이 없는 청구는 취소할 수 있다 ──────────────────────────────────
await openSettlement(CB)
ok((await p.locator('[data-bill-cancel="pb"]').count()) === 1, '입금이 없는 청구에는 취소 버튼이 있음')
calls.length = 0
await p.click('[data-bill-cancel="pb"]')
await p.waitForTimeout(1800)
ok(calls.length === 1, '한 번만 부름', String(calls.length))
ok(calls[0]?.kind === 'rpc', '표를 직접 고치지 않고 서버 함수로 — 감사기록이 같은 트랜잭션',
  String(calls[0]?.kind))
ok(calls[0]?.p_payment_id === 'pb', '그 청구만', String(calls[0]?.p_payment_id))
ok(calls[0]?.p_reason === '중복 청구', '적은 사유를 그대로 보냄', String(calls[0]?.p_reason))
ok(!calls.some((c) => c.kind === 'PATCH'), 'payments 표를 직접 PATCH 하지 않음')

// ── 3. 서버가 거부하면 그 이유를 화면에 그대로 ────────────────────────────
//  화면이 먼저 걸러도 최종 방어선은 서버입니다. 서버 문구가 사라지면
//  대표님은 왜 안 됐는지 알 수 없습니다.
cancelFails = true
await openSettlement(CB)
await p.click('[data-bill-cancel="pb"]')
await p.waitForTimeout(1800)
const body = ((await p.textContent('main')) ?? '').replace(/\s+/g, ' ')
ok(/입금 400,000원이 이미 기록되어 있습니다/.test(body), '서버가 거부한 이유를 화면에 그대로 보여 줌',
  body.slice(body.indexOf('입금 400'), body.indexOf('입금 400') + 70))
cancelFails = false

// ── 4. 취소한 청구에 남은 입금을 찾아 준다 ────────────────────────────────
//  0037 이전 자료입니다. 이 돈은 매출·미수금·입금완료 어디에도 없습니다.
await p.goto(`${BASE}/receivables`, { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(2400)
ok((await p.locator('[data-stranded]').count()) === 1, '「갈 곳 없는 입금」을 찾아 보여 줌')
const st = ((await p.textContent('[data-stranded]')) ?? '').replace(/\s+/g, ' ')
ok(/취소한 청구에 입금 200,000원이 남아 있습니다 \(1건\)/.test(st), '얼마가 몇 건인지', st.slice(0, 90))
ok(/C의원/.test(st), '어느 거래처인지')
ok(/입금 200,000원/.test(st), '그 청구에 남은 입금액')
ok((await p.locator('[data-stranded-row="pc"]').count()) === 1, '건마다 한 줄')
ok(!/A병원/.test(st) && !/B의원/.test(st), '멀쩡한 청구는 여기 올리지 않음')

//  자동으로 되돌리지 않는다는 것을 화면이 말해야 합니다 — 통장을 봐야
//  어느 쪽이 맞는지 압니다.
ok(/입금 기록을 지우거나/.test(st) && /새로 확정/.test(st), '무엇을 해야 하는지 두 갈래로 적음')

// ── 5. 취소된 청구는 합계에 안 들어간다 (회귀) ────────────────────────────
//  A 100만 + B 50만 = 150만. C(취소) 30만은 빠져야 합니다.
const sums = ((await p.textContent('main')) ?? '').replace(/\s+/g, ' ')
ok(/총 청구액/.test(sums) && /1,500,000원/.test(sums), '총 청구액에 취소한 청구가 안 들어감',
  sums.slice(sums.indexOf('총 청구액'), sums.indexOf('총 청구액') + 40))
//  입금 완료도 마찬가지 — A 의 40만원만.
ok(/400,000원/.test(sums), '입금 완료는 살아 있는 청구의 입금만 (40만원)')

await b.close()
console.log(`\n총 ${out.length}건 · 실패 ${out.filter((x) => !x).length}건`)
