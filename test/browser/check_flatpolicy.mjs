import { chromium, EXEC } from './_pw.mjs'

//  월정액 「배출 없는 달」 정책 — 거래처 점검 화면 (0044).
//
//   0042 부터 수거 0건인 달도 월정액으로 확정할 수 있습니다. 단 거래처에
//   `flat_fee_when_empty` 가 켜져 있어야 합니다. 그런데 그 값이 꺼져 있다는 게
//   「아니오로 정했다」인지 「아무도 안 정했다」인지 구분이 안 돼서, 화면이
//   무엇을 물어야 할지 몰랐습니다. 그 사이 900만원짜리 계약이 배출 없는 달만
//   엑셀로 넘어갑니다.
//
//   확인하는 것
//    · 월정액 거래처만 물어본다 (kg 단가 거래처는 물을 것이 없음)
//    · 이미 정한 곳은 다시 안 묻는다
//    · 「청구 안 함」도 **값이 그대로여도** 서버로 간다 (그게 이 판의 전부)
//    · 거래처 통짜 저장이 아니라 전용 함수로 간다 (기록이 남아야 함)
//    · 0044 이전 DB 에서는 성공한 척하지 않는다
//    · 월말 청구 화면이 갈 자리를 이름으로 말한다

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
const back = (n) => {
  const t = (Y * 12 + (M - 1)) - n
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`
}
const PREV = back(1) // 월말 청구 화면이 기본으로 보는 달

const profile = {
  id: UID, email: 'admin@beonemirae.test', name: '대표', role: 'admin', font_scale: 'normal',
  active: true, approved_at: '2026-01-01T00:00:00Z', client_id: null, created_at: '2026-01-01T00:00:00Z',
}
const GOOD = '124-81-00998'
const mkClient = (id, name, opts = {}) => ({
  id, name, type: '병원', address: '', manager: '', phone: '', collection_cycle: '주 1회',
  collects_medical_waste: opts.med ?? true, collects_diaper: opts.dia ?? false,
  storage_size: '보통', note: '', is_demo_generated: false, demo_session_id: null, active: true,
  contract_start: '2025-01-01', contract_end: null, payment_terms: '', payment_due_day: 20,
  pricing: opts.pricing ?? null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  biz_no: GOOD, biz_ceo: '김대표', biz_type: null, biz_item: null, tax_email: 'a@x.kr', vat_mode: '별도',
  flat_fee_when_empty: opts.when ?? false,
  flat_fee_policy_at: opts.at ?? null,
})
const F1 = '00000000-0000-0000-0000-0000000000f1' // 오남한양 — 월정액 · 아직 안 정함
const F2 = '00000000-0000-0000-0000-0000000000f2' // 해올 — 월정액 · 「청구함」으로 정해 둠
const F3 = '00000000-0000-0000-0000-0000000000f3' // 인화 — 월정액 · 「청구 안 함」으로 정해 둠
const K1 = '00000000-0000-0000-0000-0000000000k1'.replace(/k/g, 'a') // kg 단가 거래처
const clients = [
  mkClient(F1, '오남한양병원', { pricing: { medicalMonthly: { sale: 9000000, cost: null } } }),
  mkClient(F2, '해올요양병원', {
    pricing: { medicalMonthly: { sale: 1300000, cost: null } }, when: true, at: '2026-08-01T00:00:00Z',
  }),
  mkClient(F3, '인화병원', {
    pricing: { medicalMonthly: { sale: 700000, cost: null } }, when: false, at: '2026-08-01T00:00:00Z',
  }),
  mkClient(K1, '더원요양병원', { pricing: { medical: { sale: 950, cost: 350 } } }),
]
//  F1 에는 이미 청구가 나간 적이 있습니다 — 「다음 빈 달에 바로 막히는 곳」.
//  월말 청구 화면이 보는 달(PREV)이 아니라 그 전 달에 둡니다 — PREV 에 두면
//  「이미 확정된 달」이 되어 그 화면에서 아예 빠집니다.
const payments = [{
  id: 'p1', client_id: F1, billing_month: back(2), amount: 9000000, status: '입금완료',
  method: '무통장', paid_at: `${TODAY}T00:00:00Z`, memo: '', snapshot: null, canceled_at: null,
}]

const b = await chromium.launch({ executablePath: EXEC })

function wire(ctx, { calls, patches, policyFn = 'ok' }) {
  ctx.route('**/auth/v1/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: UID, aud: 'authenticated', email: profile.email, app_metadata: {}, user_metadata: {} }) }))
  ctx.route('**/rest/v1/**', (r) => {
    const url = r.request().url()
    const method = r.request().method()
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    if (url.includes('/rpc/set_flat_fee_policy')) {
      const body = r.request().postDataJSON()
      calls.push(body)
      if (policyFn === 'missing') {
        //  0044 를 아직 안 올린 DB
        return r.fulfill({ status: 404, contentType: 'application/json',
          body: JSON.stringify({ code: 'PGRST202', message: 'Could not find the function public.set_flat_fee_policy' }) })
      }
      //  실제 서버처럼 값을 반영해 둡니다 — 다시 읽으면 정해진 것으로 보여야 합니다.
      const c = clients.find((x) => x.id === body.p_client_id)
      if (c) { c.flat_fee_when_empty = body.p_when_empty; c.flat_fee_policy_at = `${TODAY}T10:00:00Z` }
      return json({ clientId: body.p_client_id, whenEmpty: body.p_when_empty })
    }
    if (url.includes('/rpc/app_schema_version')) return json(64)
    if (url.includes('/audit_logs')) return json([{ id: 1 }])
    if (url.includes('/clients') && method === 'PATCH') {
      patches.push({ url, body: JSON.parse(r.request().postData() ?? '{}') })
      return json([clients[0]])
    }
    if (url.includes('/profiles')) return json(single ? profile : [profile])
    if (url.includes('/payments')) return json(payments)
    if (url.includes('/clients')) return json(single ? clients[0] : clients)
    if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
    return json([])
  })
}
async function open(ctx, path) {
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: UID, aud: 'authenticated', email: profile.email, app_metadata: {}, user_metadata: {} }])
  await p.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(2200)
  return p
}

// ── 1. 안 정한 곳만 물어본다 ──────────────────────────────────────────────
{
  const calls = []
  const patches = []
  const ctx = await b.newContext({ viewport: { width: 1500, height: 1200 } })
  wire(ctx, { calls, patches })
  const p = await open(ctx, '/pricing')
  await p.waitForSelector('[data-price-summary]', { timeout: 20000 })

  const sum = ((await p.textContent('[data-price-summary]')) ?? '').replace(/\s+/g, ' ')
  ok(/월정액 정책\s*1곳/.test(sum), '요약에 「아직 안 정한 곳 1곳」', sum)

  const warn = ((await p.textContent('[data-flat-warn]')) ?? '').replace(/\s+/g, ' ')
  ok(/월정액 거래처 1곳은 배출이 없는 달에 청구를 만들 수 없습니다/.test(warn),
    '무엇이 막히는지 그대로 말함', warn.slice(0, 60))
  ok(/오남한양병원/.test(warn), '어느 거래처인지 이름을 댐')
  ok(!/해올|인화/.test(warn), '이미 정한 곳은 경고에 안 들어감')
  ok(/「청구 안 함」도 정한 것으로 기록되어 다시 묻지 않습니다/.test(warn),
    '왜 아니오도 눌러야 하는지 설명함')

  //  안 정한 곳만 「확인 필요」에 남습니다
  ok((await p.locator(`[data-flat-undecided="${F1}"]`).count()) === 1, '오남한양은 「아직 안 정함」')
  ok((await p.locator('[data-flat-undecided]').count()) === 1, '안 정한 곳은 한 곳뿐')

  //  kg 단가 거래처에는 물을 것이 없습니다
  await p.click('button:has-text("전체")')
  await p.waitForTimeout(500)
  ok((await p.locator(`[data-flat-policy="${K1}"]`).count()) === 0,
    'kg 단가 거래처에는 정책 줄이 아예 없음 (물을 것이 없음)')
  ok((await p.locator(`[data-flat-decided="${F2}"]`).count()) === 1, '이미 정한 곳은 정해진 값을 보여 줌')
  const f2 = ((await p.textContent(`[data-flat-decided="${F2}"]`)) ?? '').trim()
  ok(f2 === '월정액 청구함', '해올은 「청구함」', f2)
  const f3 = ((await p.textContent(`[data-flat-decided="${F3}"]`)) ?? '').trim()
  ok(f3 === '청구 안 함', '인화는 「청구 안 함」', f3)
  await ctx.close()
}

// ── 2. 「청구 안 함」도 정한 것으로 보낸다 ────────────────────────────────
//   여기가 핵심입니다. 값이 이미 false 이므로 「바뀐 게 없으니 보내지 말자」로
//   만들면, 확인한 거래처를 매달 다시 묻게 되고 알림은 곧 무시됩니다.
{
  const calls = []
  const patches = []
  const ctx = await b.newContext({ viewport: { width: 1500, height: 1200 } })
  wire(ctx, { calls, patches })
  const p = await open(ctx, '/pricing')
  await p.waitForSelector('[data-price-summary]', { timeout: 20000 })

  await p.click(`[data-flat-no="${F1}"]`)
  await p.waitForTimeout(1500)
  ok(calls.length === 1, '값이 그대로여도 서버로 감', `${calls.length}회`)
  ok(calls[0]?.p_client_id === F1 && calls[0]?.p_when_empty === false,
    '어느 거래처를 무엇으로 정했는지 그대로 보냄', JSON.stringify(calls[0]))
  ok(patches.length === 0, '거래처 통짜 저장이 아니라 전용 함수로 감 (기록이 남아야 함)',
    `${patches.length}회`)

  //  다시 읽으면 정해진 것으로 보여야 합니다
  const warnGone = await p.locator('[data-flat-warn]').count()
  ok(warnGone === 0, '정하고 나면 경고가 사라짐', `${warnGone}개`)
  //  「확인 필요」 목록에서는 빠집니다 — 더 볼 것이 없기 때문입니다.
  await p.click('button:has-text("전체")')
  await p.waitForTimeout(400)
  ok((await p.locator(`[data-flat-decided="${F1}"]`).count()) === 1, '「청구 안 함」으로 표시됨')
  await ctx.close()
}

// ── 3. 「청구함」도 같은 길로 ─────────────────────────────────────────────
{
  clients[0].flat_fee_when_empty = false
  clients[0].flat_fee_policy_at = null
  const calls = []
  const patches = []
  const ctx = await b.newContext({ viewport: { width: 1500, height: 1200 } })
  wire(ctx, { calls, patches })
  const p = await open(ctx, '/pricing')
  await p.waitForSelector('[data-price-summary]', { timeout: 20000 })
  await p.click(`[data-flat-yes="${F1}"]`)
  await p.waitForTimeout(1500)
  ok(calls.length === 1 && calls[0]?.p_when_empty === true, '「청구함」이 그대로 감',
    JSON.stringify(calls[0]))
  const sum = ((await p.textContent('[data-price-summary]')) ?? '').replace(/\s+/g, ' ')
  ok(/월정액 정책\s*0곳/.test(sum), '정하고 나면 남은 곳이 0', sum)
  await ctx.close()
}

// ── 4. 0044 이전 DB — 성공한 척하지 않는다 ───────────────────────────────
{
  clients[0].flat_fee_when_empty = false
  clients[0].flat_fee_policy_at = null
  const calls = []
  const patches = []
  const ctx = await b.newContext({ viewport: { width: 1500, height: 1200 } })
  wire(ctx, { calls, patches, policyFn: 'missing' })
  const p = await open(ctx, '/pricing')
  await p.waitForSelector('[data-price-summary]', { timeout: 20000 })
  await p.click(`[data-flat-yes="${F1}"]`)
  await p.waitForTimeout(1500)
  const body = ((await p.textContent('body')) ?? '').replace(/\s+/g, ' ')
  ok(/RUN_30/.test(body), '함수가 없으면 무엇을 실행해야 하는지 말함',
    (body.match(/[^.]*RUN_30[^.]*/) ?? [''])[0].slice(0, 70))
  ok((await p.locator(`[data-flat-undecided="${F1}"]`).count()) === 1,
    '못 저장했으면 「아직 안 정함」 그대로 (저장한 척하지 않음)')
  await ctx.close()
}

// ── 5. 월말 청구 화면이 갈 자리를 이름으로 말한다 ────────────────────────
{
  clients[0].flat_fee_when_empty = false
  clients[0].flat_fee_policy_at = null
  const calls = []
  const patches = []
  const ctx = await b.newContext({ viewport: { width: 1500, height: 1200 } })
  wire(ctx, { calls, patches })
  const p = await open(ctx, '/billing')
  await p.waitForTimeout(1200)
  const body = ((await p.textContent('body')) ?? '').replace(/\s+/g, ' ')
  ok(/거래처 점검 화면에서 「배출 없는 달」 청구 여부를 한 번만 정해 주세요/.test(body),
    '안 정한 곳은 어디서 무엇을 하라고 말함',
    (body.match(/월정액 계약[^—]*—[^·]{0,60}/) ?? [''])[0].slice(0, 90))
  //  이미 「청구 안 함」으로 정한 곳은 다르게 말해야 합니다 — 다시 물으면 안 됩니다.
  ok(/「배출 없는 달은 청구 안 함」으로 정해 두셨습니다/.test(body),
    '이미 정한 곳은 다시 묻지 않고 정해 둔 값을 말함',
    (body.match(/정해 두셨습니다/) ?? [''])[0])
  await ctx.close()
}

await b.close()
console.log(`\n총 ${out.length}건 · 실패 ${out.filter((x) => !x).length}건`)
