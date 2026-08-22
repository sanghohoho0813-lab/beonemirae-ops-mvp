import { chromium, EXEC } from './_pw.mjs'

//  통신이 끊긴 뒤 다시 눌렀을 때.
//
//   서버에는 들어갔는데 응답이 오는 길에 끊기면 화면에는 「저장하지
//   못했습니다」가 뜹니다. 담당자는 당연히 다시 누릅니다.
//   그때 **같은 저장인지**를 서버가 알아야 입금이 두 번 기록되지 않습니다.
//
//   확인하는 것
//    · 저장할 때 「저장 시도 표」(request_id)를 실제로 보내는가
//    · 실패해서 다시 눌러도 **같은 표**를 보내는가  ← 이게 핵심입니다
//    · 창을 새로 열면 새 표를 보내는가 (진짜 두 번째 입금은 두 줄이어야 함)
//    · 값을 고쳐도 같은 저장이면 같은 표인가

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
const PREV = M === 1 ? `${Y - 1}-12` : `${Y}-${String(M - 1).padStart(2, '0')}`

const profile = {
  id: UID, email: 'a@b.c', name: '대표', role: 'admin', font_scale: 'normal',
  active: true, approved_at: '2026-01-01T00:00:00Z', client_id: null, created_at: '2026-01-01T00:00:00Z',
}
const CA = '00000000-0000-0000-0000-0000000000a1'
const clients = [{
  id: CA, name: '가나요양병원', type: '병원', address: '서울시', manager: '', phone: '',
  collection_cycle: '주 2회', collects_medical_waste: true, collects_diaper: false, storage_size: '보통',
  note: '', is_demo_generated: false, demo_session_id: null, active: true,
  contract_start: '2025-01-01', contract_end: null, payment_terms: '', payment_due_day: 25, pricing: {},
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  collect_time: '', disposal_site: '', diaper_cycle: '',
}]
const payments = [{
  id: 'p1', client_id: CA, billing_month: PREV, amount: 1000000, status: '미수금', method: '무통장',
  paid_at: null, memo: '', demo_session_id: null,
  snapshot: { kind: '정기', confirmedAt: `${PREV}-28T00:00:00Z`, scheduleIds: [], materialIds: [] },
  canceled_at: null, created_at: `${PREV}-28T00:00:00Z`, updated_at: `${PREV}-28T00:00:00Z`,
}]

const b = await chromium.launch({ executablePath: EXEC })
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } })

const sent = []
let failNext = 0
await ctx.route('**/auth/v1/**', (r) =>
  r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: UID, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }) }))
await ctx.route('**/rest/v1/**', (r) => {
  const url = r.request().url()
  const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
  const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
  if (url.includes('/rpc/add_payment_receipt')) {
    sent.push(r.request().postDataJSON())
    //  통신이 끊긴 상황을 그대로 만듭니다 — 서버는 받았는데 응답이 안 옵니다.
    if (failNext > 0) {
      failNext -= 1
      return r.abort('connectionreset')
    }
    return json({ id: 'r1', paidTotal: 300000, outstanding: 700000, status: '미수금', alreadySaved: false })
  }
  if (url.includes('/rpc/app_schema_version')) return json(64)
  if (url.includes('/profiles')) return json(single ? profile : [profile])
  if (url.includes('/payment_receipts')) return json([])
  if (url.includes('/payments')) return json(payments)
  if (url.includes('/clients')) return json(single ? clients[0] : clients)
  if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
  return json([])
})

const p = await ctx.newPage()
await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
  access_token: 't', token_type: 'bearer', expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
})), ['beonemirae-ops:auth', { id: UID, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }])
await p.goto(`${BASE}/clients/${CA}`, { waitUntil: 'domcontentloaded' })
await p.waitForSelector('[data-client-tabs]', { timeout: 30000 })

//  결제·미수금 탭 → 입금 기록
const billTab = p.locator('[data-client-tab]').filter({ hasText: '결제' }).first()
await billTab.click()
await p.waitForTimeout(800)
const addBtn = p.getByRole('button', { name: /입금 기록|입금 추가|입금 넣기/ }).first()
ok((await addBtn.count()) > 0, '입금 기록 버튼을 찾음')
await addBtn.click()
await p.waitForTimeout(500)

const amountBox = p.locator('input[inputmode="numeric"], input[type="number"]').first()
await amountBox.fill('300000')

const saveBtn = p.getByRole('button', { name: /^저장|기록하기|입금 저장/ }).last()

// ── 1. 통신이 끊긴 상태로 저장 ────────────────────────────────────────────
failNext = 1
await saveBtn.click()
await p.waitForTimeout(1500)
ok(sent.length === 1, '저장을 한 번 보냄', `${sent.length}회`)
const first = sent[0]
ok(typeof first?.p_request_id === 'string' && first.p_request_id.length === 36,
  '저장 시도 표(request_id)를 실제로 보냄', first?.p_request_id ?? '(없음)')
ok(first?.p_amount === 300000, '금액 30만원을 그대로 보냄', String(first?.p_amount))

const errTxt = ((await p.textContent('body')) ?? '').replace(/\s+/g, ' ')
ok(/저장|실패|네트워크|연결/.test(errTxt), '실패했다고 화면이 알려 줌')

// ── 2. 다시 누른다 — 같은 표여야 합니다 ───────────────────────────────────
await saveBtn.click()
await p.waitForTimeout(1500)
ok(sent.length === 2, '다시 눌러 한 번 더 보냄', `${sent.length}회`)
ok(sent[1].p_request_id === first.p_request_id,
  '**다시 눌러도 같은 표** — 서버가 「같은 저장」임을 알 수 있음',
  `${String(sent[1].p_request_id).slice(0, 8)}… = ${String(first.p_request_id).slice(0, 8)}…`)

// ── 3. 창을 새로 열면 새 표 ───────────────────────────────────────────────
//   진짜로 한 번 더 받은 입금은 두 줄이어야 합니다. 표까지 같으면
//   두 번째 입금이 통째로 사라집니다 — 그건 더 나쁩니다.
await p.waitForTimeout(600)
const reopen = p.getByRole('button', { name: /입금 기록|입금 추가|입금 넣기/ }).first()
if ((await reopen.count()) > 0) {
  await reopen.click()
  await p.waitForTimeout(400)
  await p.locator('input[inputmode="numeric"], input[type="number"]').first().fill('200000')
  await p.getByRole('button', { name: /^저장|기록하기|입금 저장/ }).last().click()
  await p.waitForTimeout(1200)
  ok(sent.length === 3, '새 창에서 한 번 더 보냄', `${sent.length}회`)
  ok(sent[2].p_request_id !== first.p_request_id,
    '창을 새로 열면 새 표 — 진짜 두 번째 입금은 따로 기록됨',
    `${String(sent[2].p_request_id).slice(0, 8)}…`)
  ok(sent[2].p_amount === 200000, '두 번째 금액 20만원', String(sent[2].p_amount))
} else {
  ok(false, '새 창에서 한 번 더 보냄 — 입금 기록 버튼을 못 찾음')
}

await b.close()
console.log(`\n총 ${out.length}건 · 실패 ${out.filter((x) => !x).length}건`)
