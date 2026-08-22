import { chromium, EXEC } from './_pw.mjs'

//  같은 날 · 같은 금액 · 같은 적요의 **진짜 입금 2건**이 중복으로 오판되지
//  않아야 합니다.
//
//   실제로 있는 일입니다 — 한 병원이 6월분과 7월분을 같은 날 같은 금액으로
//   따로 이체하면 통장에는 똑같이 생긴 줄이 두 개 찍힙니다. 두 번째를
//   「이미 기록함」으로 막아 버리면 그 달 미수금이 영원히 남습니다.
//
//   동시에, **같은 파일을 다시 올렸을 때는** 여전히 막아야 합니다.

const BASE = 'http://localhost:4173'
const UID = '00000000-0000-0000-0000-0000000000ad'
const C1 = '00000000-0000-0000-0000-0000000000c1'
const P6 = 'p0000000-0000-0000-0000-000000000006'
const P7 = 'p0000000-0000-0000-0000-000000000007'

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
const D = add(TODAY, -2)

const profile = {
  id: UID, email: 'admin@beonemirae.test', name: '대표', role: 'admin', font_scale: 'normal',
  active: true, approved_at: '2026-01-01T00:00:00Z', client_id: null, created_at: '2026-01-01T00:00:00Z',
}
const clients = [{
  id: C1, name: '해올요양병원', type: '병원', address: '', manager: '', phone: '',
  collection_cycle: '주 1회', collects_medical_waste: true, collects_diaper: false,
  storage_size: '보통', note: '', is_demo_generated: false, demo_session_id: null, active: true,
  contract_start: null, contract_end: null, payment_terms: '', payment_due_day: null,
  pricing: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}]
//  6월분·7월분 각각 430만원 미수 — 같은 금액입니다.
const mkPay = (id, month) => ({
  id, client_id: C1, billing_month: month, amount: 4300000, status: '미수금',
  method: '무통장', paid_at: null, memo: '', snapshot: null, canceled_at: null,
})
const payments = [mkPay(P6, '2026-06'), mkPay(P7, '2026-07')]

//  통장에 똑같이 생긴 줄이 두 개
const CSV = [
  '거래일자,적요,출금액,입금액,잔액',
  `${D},해올요양병원,,4300000,4300000`,
  `${D},해올요양병원,,4300000,8600000`,
].join('\n')

let receipts = []
const posts = []
const b = await chromium.launch({ executablePath: EXEC })

const open = async (rows) => {
  const ctx = await b.newContext({ viewport: { width: 1400, height: 1100 } })
  await ctx.route('**/auth/v1/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: UID, aud: 'authenticated', email: profile.email, app_metadata: {}, user_metadata: {} }) }))
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
    if (url.includes('/payment_receipts')) return json(rows)
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
  await p.goto(`${BASE}/bank`, { waitUntil: 'domcontentloaded' })
  await p.waitForSelector('[data-bank-page]', { timeout: 20000 })
  await p.setInputFiles('input[type=file]', {
    name: '입금내역.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV, 'utf-8'),
  })
  await p.waitForSelector('[data-bank-summary]', { timeout: 15000 })
  await p.waitForTimeout(500)
  return { ctx, p }
}

// ── 1. 똑같이 생긴 두 줄이 모두 살아 있어야 합니다 ────────────────────────
//
//   6월분·7월분 미수가 둘 다 430만원이라 어느 줄이 어느 달인지는 시스템이
//   알 수 없습니다 — 그래서 「확인 필요」로 사람에게 넘기는 것이 맞습니다.
//   중요한 것은 **두 줄이 두 줄로 남아 있는가** 입니다.
{
  const { ctx, p } = await open(receipts)
  const s = (await p.locator('[data-bank-summary]').textContent()) ?? ''
  ok(/읽은 입금 줄 2건/.test(await p.textContent('main')), '두 줄 모두 읽음')
  ok(/확인 필요\s*2건/.test(s.replace(/\s+/g, ' ')), '두 줄 모두 살아 있음 (하나가 사라지지 않음)',
    s.replace(/\s+/g, ' ').slice(0, 70))
  ok(/이미 기록\s*0건/.test(s.replace(/\s+/g, ' ')), '아직 기록한 것이 없으니 「이미 기록」 0건')
  const rowCount = await p.locator('[data-bank-check] [data-bank-row]').count()
  ok(rowCount === 2, '화면에도 줄이 두 개 그려짐 (지문이 같으면 한 줄로 겹칩니다)', String(rowCount))

  //  첫 줄은 6월, 둘째 줄은 7월로 사람이 지정합니다.
  const picks = p.locator('[data-bank-pick]')
  const ids = await picks.evaluateAll((els) => els.map((e) => e.getAttribute('data-bank-pick')))
  const first6 = ids.find((x) => x.endsWith(`|${P6}`))
  const second7 = ids.filter((x) => x.endsWith(`|${P7}`)).pop()
  ok(!!first6 && !!second7, '두 줄 각각에 6월·7월 후보가 붙음')
  await p.locator(`[data-bank-pick="${first6}"]`).click()
  await p.waitForTimeout(1200)
  await p.locator(`[data-bank-pick="${second7}"]`).click()
  await p.waitForTimeout(1200)

  ok(posts.length === 2, '두 건 모두 서버로 보냄', String(posts.length))
  ok(posts[0]?.p_source_ref !== posts[1]?.p_source_ref,
    '두 줄의 지문이 서로 다름 — 서버가 둘째를 중복으로 막지 않음',
    `${posts[0]?.p_source_ref} / ${posts[1]?.p_source_ref}`)
  const paid = posts.map((x) => x.p_payment_id).sort()
  ok(paid[0] !== paid[1], '서로 다른 청구(6월·7월)에 붙음', paid.join(' · '))
  await ctx.close()
}

// ── 2. 같은 파일을 다시 올리면 두 줄 다 「이미 기록」 ──────────────────────
{
  receipts = posts.map((x, i) => ({
    id: `r${i}`, payment_id: x.p_payment_id, received_on: x.p_received_on, amount: x.p_amount,
    method: '계좌이체', memo: x.p_memo, actor_name: '대표',
    created_at: `${x.p_received_on}T00:00:00Z`, source_ref: x.p_source_ref,
  }))
  const { ctx, p } = await open(receipts)
  const s = (await p.locator('[data-bank-summary]').textContent()) ?? ''
  ok(/이미 기록\s*2건/.test(s.replace(/\s+/g, ' ')), '파일을 다시 올리면 두 줄 다 「이미 기록」',
    s.replace(/\s+/g, ' ').slice(0, 70))
  ok(/확인 필요\s*0건/.test(s.replace(/\s+/g, ' ')), '다시 붙일 것이 없음')
  await ctx.close()
}

// ── 3. 한 건만 기록돼 있으면 나머지 한 건은 여전히 살아 있어야 합니다 ─────
{
  const { ctx, p } = await open([receipts[0]])
  const s = (await p.locator('[data-bank-summary]').textContent()) ?? ''
  ok(/이미 기록\s*1건/.test(s.replace(/\s+/g, ' ')), '먼저 기록한 한 줄만 「이미 기록」',
    s.replace(/\s+/g, ' ').slice(0, 70))
  //  6월분이 이미 채워졌으니 남은 후보는 7월 하나뿐 — 애매함이 사라져 「확실」이 됩니다.
  ok(/확실 — 바로 기록\s*1건/.test(s.replace(/\s+/g, ' ')), '나머지 한 줄은 후보가 하나뿐이라 확실로 잡힘')
  await ctx.close()
}

await b.close()
console.log('')
console.log(`총 ${out.length}건 · 실패 ${out.filter((v) => !v).length}건`)
