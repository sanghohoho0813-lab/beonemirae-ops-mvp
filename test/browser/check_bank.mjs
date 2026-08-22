import { chromium, EXEC } from './_pw.mjs'

//  통장 입금 대사 화면 검증.
//
//   청구  오남한양병원 2026-06  900만원 (미수)
//         서울인화요양병원 2026-06  120만원 (미수)
//         남양주백병원 2026-06  120만원 (미수 — 서울인화와 금액이 같습니다)
//         본브릿지의원 2026-06  50만원 (30만 부분입금 → 남은 20만)
//
//   통장  ① 오남한양 900만  → 이름·금액 일치 → 확실
//         ② 상호 없음 120만 → 금액만 맞고 후보 2곳 → 확인 필요
//         ③ 본브릿지 20만   → 이름·남은 미수 일치 → 확실
//         ④ 본브릿지 5만    → 이름만 맞음(금액 불일치) → 확인 필요
//         ⑤ 알 수 없는 곳 77만 → 못 찾음
//         ⑥ 출금 -50만 · ⑦ 0원 → 아예 읽지 않음

const BASE = 'http://localhost:4173'
const SHOT = (process.env.TEST_OUT ?? '/tmp')
const UID = '00000000-0000-0000-0000-0000000000ad'

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
const add = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + n)
  return dt.toISOString().slice(0, 10)
}
const D1 = add(TODAY, -3)
const D2 = add(TODAY, -2)

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
const C1 = '00000000-0000-0000-0000-0000000000c1'
const C2 = '00000000-0000-0000-0000-0000000000c2'
const C3 = '00000000-0000-0000-0000-0000000000c3'
const C4 = '00000000-0000-0000-0000-0000000000c4'
const clients = [
  mkClient(C1, '오남한양병원'), mkClient(C2, '서울인화요양병원'),
  mkClient(C3, '남양주백병원'), mkClient(C4, '본브릿지의원'),
]

const P1 = 'p0000000-0000-0000-0000-000000000001'
const P2 = 'p0000000-0000-0000-0000-000000000002'
const P3 = 'p0000000-0000-0000-0000-000000000003'
const P4 = 'p0000000-0000-0000-0000-000000000004'
const mkPay = (id, clientId, amount) => ({
  id, client_id: clientId, billing_month: '2026-06', amount, status: '미수금',
  method: '무통장', paid_at: null, memo: '', snapshot: null, canceled_at: null,
})
const payments = [mkPay(P1, C1, 9000000), mkPay(P2, C2, 1200000), mkPay(P3, C3, 1200000), mkPay(P4, C4, 500000)]
//  본브릿지는 30만원이 이미 들어와 남은 미수가 20만원입니다.
const receipts = [{
  id: 'r1', payment_id: P4, received_on: add(TODAY, -20), amount: 300000,
  method: '계좌이체', memo: '1차', actor_name: '사무실', created_at: `${add(TODAY, -20)}T00:00:00Z`,
  source_ref: null,
}]

//  통장 파일 (CSV) — 은행에서 흔한 모양
const CSV = [
  '조회기간,' + D1 + ' ~ ' + D2,
  '',
  '거래일자,적요,출금액,입금액,잔액',
  `${D1},오남한양병원,,9000000,9000000`,
  `${D1},,,1200000,10200000`,
  `${D2},본브릿지의원,,200000,10400000`,
  `${D2},본브릿지의원,,50000,10450000`,
  `${D2},한빛치과,,770000,11220000`,
  `${D2},차량할부,500000,,10720000`,
  `${D2},이자,,0,10720000`,
].join('\n')

const posts = []
const b = await chromium.launch({ executablePath: EXEC })
const ctx = await b.newContext({ viewport: { width: 1500, height: 1300 } })
await ctx.route('**/rest/v1/**', (r) => {
  const url = r.request().url()
  const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
  const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
  if (url.includes('/rpc/add_payment_receipt')) {
    const body = JSON.parse(r.request().postData() ?? '{}')
    posts.push(body)
    return json({ paidTotal: body.p_amount, outstanding: 0, status: '입금완료' })
  }
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

const body = () => p.textContent('main').then((t) => t ?? '')

await p.goto(`${BASE}/bank`, { waitUntil: 'domcontentloaded' })
await p.waitForSelector('[data-bank-page]', { timeout: 20000 })
await p.waitForTimeout(600)

// ── 1. 화면이 무엇을 하는지·안 하는지 밝히는가 ────────────────────────────
let t = await body()
ok(/은행 서식을 코드에 박아 두지 않습니다/.test(t), '특정 은행 서식을 박지 않았다고 밝힘')
ok(/자동으로 기록하는 것은\s*「확실」뿐/.test(t.replace(/\s+/g, ' ')), '확실만 자동 기록한다고 밝힘')
ok(/같은 통장 줄은 두 번 기록되지 않습니다/.test(t), '중복 방지를 밝힘')

// ── 2. 파일 올리기 ────────────────────────────────────────────────────────
await p.setInputFiles('input[type=file]', {
  name: '입금내역.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV, 'utf-8'),
})
await p.waitForSelector('[data-bank-summary]', { timeout: 15000 })
await p.waitForTimeout(500)

// ── 3. 열 추정 ────────────────────────────────────────────────────────────
ok((await p.locator('[data-bank-cols]').count()) === 1, '열 확인 칸이 나옴')
const dateCol = await p.locator('[data-bank-col=date]').inputValue()
const amtCol = await p.locator('[data-bank-col=amount]').inputValue()
const descCol = await p.locator('[data-bank-col=description]').inputValue()
ok(dateCol === '0', '날짜 열을 첫 번째로 찾음', dateCol)
ok(amtCol === '3', '입금액 열을 네 번째로 찾음 (출금액이 아니라)', amtCol)
ok(descCol === '1', '적요 열을 두 번째로 찾음', descCol)
ok(/3번째 줄을 머리글로 봤습니다/.test(await body()), '머리글 줄을 3번째로 찾음')

// ── 4. 읽은 줄 — 출금·0원은 빠져야 합니다 ─────────────────────────────────
ok(/읽은 입금 줄 5건/.test(await body()), '입금 5줄만 읽음 (출금·0원 제외)')

// ── 5. 3분류 ──────────────────────────────────────────────────────────────
const s = (await p.locator('[data-bank-summary]').textContent()) ?? ''
ok(/확실 — 바로 기록\s*2건/.test(s.replace(/\s+/g, ' ')), '확실 2건', s.replace(/\s+/g, ' ').slice(0, 80))
ok(/확인 필요\s*2건/.test(s.replace(/\s+/g, ' ')), '확인 필요 2건')
ok(/못 찾음\s*1건/.test(s.replace(/\s+/g, ' ')), '못 찾음 1건')

const sure = (await p.locator('[data-bank-sure]').textContent()) ?? ''
ok(/오남한양병원/.test(sure), '오남한양 900만원은 확실')
ok(/남은 미수 9,000,000원과 금액 일치/.test(sure), '확실 판정 근거를 적음', sure.replace(/\s+/g, ' ').slice(0, 110))
ok(/본브릿지의원/.test(sure), '본브릿지 20만원(남은 미수)도 확실')

const check = (await p.locator('[data-bank-check]').textContent()) ?? ''
ok(/이름·금액이 맞는 청구가|금액은 맞지만 적요에서 거래처를 확인하지 못했습니다/.test(check),
  '적요 없는 120만원은 확인 필요', check.replace(/\s+/g, ' ').slice(0, 100))
ok(/서울인화요양병원/.test(check) && /남양주백병원/.test(check), '금액이 같은 두 곳을 후보로 보여 줌')
ok(/이 파일의 다른 줄이 이미 채웁니다/.test(check),
  '본브릿지 5만원은 「그 청구를 다른 줄이 채움」으로 확인 필요', check.replace(/\s+/g, ' ').slice(-90))

await p.locator('button:has-text("1건 보기")').click()
await p.waitForTimeout(400)
const none = (await p.locator('[data-bank-none]').textContent()) ?? ''
ok(/한빛치과/.test(none), '모르는 곳은 못 찾음으로')
ok(/지어내서\s*붙이지 않았습니다/.test((await body()).replace(/\s+/g, ' ')), '지어내지 않았다고 밝힘')

await p.screenshot({ path: `${SHOT}/bank-page.png`, fullPage: true })

// ── 6. 확실만 기록 ────────────────────────────────────────────────────────
ok(/확실한 2건 기록하기/.test((await p.locator('[data-bank-apply]').textContent()) ?? ''),
  '버튼에 확실 건수만')
await p.locator('[data-bank-apply]').click()
await p.waitForTimeout(2500)
ok(posts.length === 2, '서버로 2건만 보냄 (확인 필요·못 찾음은 안 보냄)', String(posts.length))
const byPay = Object.fromEntries(posts.map((x) => [x.p_payment_id, x]))
ok(byPay[P1]?.p_amount === 9000000, '오남한양 청구에 900만원')
ok(byPay[P4]?.p_amount === 200000, '본브릿지 청구에 20만원')
ok(posts.every((x) => x.p_source_ref && x.p_source_ref.includes('|')),
  '통장 줄 지문을 함께 보냄 (중복 방지)', posts[0]?.p_source_ref ?? '')
ok(posts.every((x) => x.p_method === '계좌이체'), '결제수단은 계좌이체')
ok(posts.every((x) => /통장 대사/.test(x.p_memo)), '메모에 통장 대사 표시')
ok(!posts.some((x) => x.p_payment_id === P2 || x.p_payment_id === P3),
  '후보가 둘인 청구에는 함부로 넣지 않음')
ok((await p.locator('[data-bank-result]').count()) === 1, '결과가 화면에 나옴')
ok(/입금 2건을 기록했습니다/.test(await body()), '기록 건수를 알려 줌')

// ── 7. 확인 필요 건을 사람이 고르면 그 청구로 ─────────────────────────────
const before = posts.length
const pick = p.locator('[data-bank-pick]').first()
const pickId = (await pick.getAttribute('data-bank-pick')) ?? ''
await pick.click()
await p.waitForTimeout(1500)
ok(posts.length === before + 1, '고른 만큼만 추가로 보냄', `${before} → ${posts.length}`)
ok(pickId.endsWith(posts[posts.length - 1].p_payment_id), '고른 청구 id 로 보냄', pickId.slice(-40))

// ── 8. 이미 기록한 줄은 다시 붙이지 않음 ──────────────────────────────────
{
  //  같은 파일을 다시 올린 상황 — 통장 줄 지문이 이미 저장돼 있습니다.
  const used = [...receipts, {
    id: 'r2', payment_id: P1, received_on: D1, amount: 9000000, method: '계좌이체',
    memo: '통장 대사', actor_name: '대표', created_at: `${D1}T00:00:00Z`,
    source_ref: `${D1}|9000000|오남한양병원`,
  }]
  const ctx2 = await b.newContext({ viewport: { width: 1400, height: 1100 } })
  await ctx2.route('**/rest/v1/**', (r) => {
    const url = r.request().url()
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    if (url.includes('/profiles')) return json(single ? profile : [profile])
    if (url.includes('/payment_receipts')) return json(used)
    if (url.includes('/payments')) return json(payments)
    if (url.includes('/clients')) return json(single ? clients[0] : clients)
    if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
    return json([])
  })
  const p2 = await ctx2.newPage()
  await p2.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: UID, aud: 'authenticated', email: profile.email, app_metadata: {}, user_metadata: {} }])
  await p2.goto(`${BASE}/bank`, { waitUntil: 'domcontentloaded' })
  await p2.waitForSelector('[data-bank-page]', { timeout: 20000 })
  await p2.setInputFiles('input[type=file]', {
    name: '입금내역.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV, 'utf-8'),
  })
  await p2.waitForSelector('[data-bank-summary]', { timeout: 15000 })
  await p2.waitForTimeout(500)
  const s2 = (await p2.locator('[data-bank-summary]').textContent()) ?? ''
  ok(/이미 기록\s*1건/.test(s2.replace(/\s+/g, ' ')), '다시 올리면 이미 기록한 줄로 잡힘', s2.replace(/\s+/g, ' ').slice(-40))
  ok(/확실 — 바로 기록\s*1건/.test(s2.replace(/\s+/g, ' ')), '이미 기록한 줄은 확실에서 빠짐')
  ok((await p2.locator('[data-bank-sure]').textContent())?.includes('오남한양') === false,
    '오남한양은 더 이상 기록 대상이 아님')
  await ctx2.close()
}

// ── 9. 현장 담당자는 열 수 없다 ───────────────────────────────────────────
{
  const fieldProfile = { ...profile, id: '00000000-0000-0000-0000-0000000000fd', role: 'field', name: '현장' }
  const ctx3 = await b.newContext({ viewport: { width: 1400, height: 1000 } })
  await ctx3.route('**/rest/v1/**', (r) => {
    const url = r.request().url()
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    if (url.includes('/profiles')) return json(single ? fieldProfile : [fieldProfile])
    if (url.includes('/clients')) return json(single ? clients[0] : clients)
    if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
    return json([])
  })
  const p3 = await ctx3.newPage()
  await p3.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: fieldProfile.id, aud: 'authenticated', email: 'f@t.test', app_metadata: {}, user_metadata: {} }])
  await p3.goto(`${BASE}/bank`, { waitUntil: 'domcontentloaded' })
  await p3.waitForTimeout(2000)
  ok((await p3.locator('[data-bank-page]').count()) === 0, '현장 담당자에게는 통장 대사가 열리지 않음')
  await ctx3.close()
}

await b.close()
console.log('')
console.log(`총 ${out.length}건 · 실패 ${out.filter((v) => !v).length}건`)
