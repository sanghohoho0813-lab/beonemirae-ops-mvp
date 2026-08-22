import { chromium, EXEC } from './_pw.mjs'

//  0054 — 「보냈습니다 / 발행했습니다」 표시 (화면).
//
//   위험한 것은 금액이 아니라 **거짓 안심**입니다. 시스템이 스스로
//   「보냈겠지」로 칠하면, 안 보낸 명세서를 보냈다고 믿게 되고 병원에
//   청구서가 안 간 채 한 달이 지나갑니다.
//
//   확인하는 것
//    · 누르기 전에는 **끝이 아니다** — 「준비됨」에 머문다
//    · 누른 뒤에만 「끝」이 되고, **누가 언제** 눌렀는지가 함께 보인다
//    · 화면이 **누가 눌렀는지를 서버로 보내지 않는다** (서버가 채웁니다)
//    · 관리자가 아니면 누를 수 없다 (읽기로만 보인다)
//    · 되돌릴 수 있다

const BASE = 'http://localhost:4173'
const UID = '00000000-0000-0000-0000-0000000000ad'
const out = []
const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  out.push(c)
  if (!c) process.exitCode = 1
}
const flat = (s) => (s ?? '').replace(/\s+/g, ' ')
const seen = (p, sel, ms = 20000) => p.waitForSelector(sel, { timeout: ms }).then(() => true, () => false)

const TODAY = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
const MONTH = TODAY.slice(0, 7)
const PREV = (() => {
  const [y, m] = MONTH.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
})()

const CA = '00000000-0000-0000-0000-0000000000c1'
const clients = [{
  id: CA, name: '가나요양병원', type: '병원', address: '경기도 남양주시 오남읍 양지로 47-35',
  manager: '', phone: '', collection_cycle: '주 1회', collects_medical_waste: true, collects_diaper: false,
  storage_size: '보통', note: '', is_demo_generated: false, demo_session_id: null, active: true,
  contract_start: '2025-01-01', contract_end: null, payment_terms: '', payment_due_day: 20,
  pricing: null, biz_no: '2568802759', biz_ceo: '송명근', vat_mode: 'exclusive',
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}]

//  확정된 청구 한 건 — 명세서 snapshot 이 있어야 「뽑을 수 있음」이 됩니다.
const payments = [{
  id: 'pay1', client_id: CA, billing_month: PREV, amount: 1000000, status: '완료',
  due_date: `${MONTH}-20`, paid_at: `${MONTH}-05`, memo: '', canceled_at: null,
  snapshot: { invoice: { rows: [], total: 1000000 } },
  created_at: `${MONTH}-01T00:00:00Z`, updated_at: `${MONTH}-01T00:00:00Z`,
}]

const b = await chromium.launch({ executablePath: EXEC })

function wire(ctx, { role = 'admin', marks = [], calls = [] } = {}) {
  const pf = {
    id: UID, email: 'a@b.c', name: '송명근', role, font_scale: 'normal',
    active: true, approved_at: '2026-01-01T00:00:00Z', client_id: null, created_at: '2026-01-01T00:00:00Z',
  }
  //  서버처럼 굴립니다 — 함수를 부르면 표가 실제로 바뀝니다.
  const state = [...marks]
  ctx.route('**/auth/v1/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: UID, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }) }))
  ctx.route('**/rest/v1/**', (r) => {
    const url = r.request().url()
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    if (url.includes('/rpc/set_month_close_mark')) {
      const body = r.request().postDataJSON()
      calls.push(body)
      const i = state.findIndex((m) => m.month === body.p_month && m.step === body.p_step)
      if (body.p_done && i < 0) {
        //  이름은 **서버가** 채웁니다. 화면이 보낸 값을 쓰지 않습니다.
        state.push({
          month: body.p_month, step: body.p_step, marked_at: `${TODAY}T10:00:00Z`,
          marked_name: '송명근', note: body.p_note ?? '',
        })
      } else if (!body.p_done && i >= 0) state.splice(i, 1)
      return json({ month: body.p_month, step: body.p_step, done: body.p_done, changed: true })
    }
    if (url.includes('/rpc/app_schema_version')) return json(64)
    if (url.includes('/rpc/app_health_check')) return json({ version: 54, ok: true, missing: [], checkedAt: '' })
    if (url.includes('/rpc/recent_app_errors')) return json({ days: 7, total: 0, groups: [], checkedAt: '' })
    if (url.includes('/month_close_marks')) return json(state)
    if (url.includes('/profiles')) return json(single ? pf : [pf])
    if (url.includes('/payments')) return json(payments)
    if (url.includes('/clients')) return json(single ? clients[0] : clients)
    if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
    return json([])
  })
}
async function open(ctx) {
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: UID, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }])
  await p.goto(`${BASE}/billing`, { waitUntil: 'domcontentloaded' })
  await p.waitForSelector('[data-progress-panel]', { timeout: 20000 })
  await p.waitForTimeout(1200)
  //  지난달을 봅니다 — 마감은 그 달이 끝난 뒤에 합니다.
  const tab = p.locator(`[data-close-month="${PREV}"]`)
  if (await tab.count()) {
    await tab.click()
    await p.waitForTimeout(900)
  }
  return p
}

// ── 1. 누르기 전에는 「끝」이 아니다 ────────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 1500, height: 1600 } })
  wire(ctx)
  const p = await open(ctx)
  ok(await seen(p, '[data-mark-box]'), '표시 칸이 있음')
  const inv = flat(await p.textContent('[data-progress-state="invoice"]'))
  ok(inv.includes('준비됨'), '**누르기 전 거래명세서는 「준비됨」** — 시스템이 스스로 끝이라고 하지 않음', inv)
  const box = flat(await p.textContent('[data-mark-box]'))
  ok(/시스템은 명세서를 뽑을 수 있다는 것까지만 압니다/.test(box), '왜 사람이 눌러야 하는지 밝힘')
  ok(/다시 눌러 되돌릴 수 있습니다/.test(box), '되돌릴 수 있다고 알려 줌')
  await ctx.close()
}

// ── 2. 누르면 「끝」이 되고 누가 언제인지 남는다 ────────────────────────────
{
  const calls = []
  const ctx = await b.newContext({ viewport: { width: 1500, height: 1600 } })
  wire(ctx, { calls })
  const p = await open(ctx)
  await p.click('[data-mark-toggle="invoice_sent"]')
  await p.waitForTimeout(1600)

  ok(calls.length === 1 && calls[0].p_month === PREV && calls[0].p_step === 'invoice_sent' && calls[0].p_done === true,
    '어느 달 · 어느 단계를 보냄', JSON.stringify(calls[0]))
  //  이름을 화면이 보내면 남의 이름으로 표시할 수 있습니다.
  ok(!JSON.stringify(calls[0]).includes('marked_by') && !JSON.stringify(calls[0]).includes('marked_name'),
    '**누가 눌렀는지를 화면이 보내지 않음** — 서버가 로그인한 사람에서 채웁니다',
    Object.keys(calls[0]).join(','))

  const inv = flat(await p.textContent('[data-progress-state="invoice"]'))
  ok(inv.includes('끝'), '누른 뒤에는 「끝」', inv)
  const detail = flat(await p.textContent('[data-mark-detail="invoice_sent"]'))
  ok(/송명근님이/.test(detail) && detail.includes(TODAY), '**누가 언제 눌렀는지 남음**', detail)

  //  되돌리기
  await p.click('[data-mark-toggle="invoice_sent"]')
  await p.waitForTimeout(1600)
  ok(calls.length === 2 && calls[1].p_done === false, '되돌리기도 서버로 감', JSON.stringify(calls[1]))
  const back = flat(await p.textContent('[data-progress-state="invoice"]'))
  ok(back.includes('준비됨'), '되돌리면 다시 「준비됨」', back)
  await ctx.close()
}

// ── 3. 세금계산서도 같은 규칙 ───────────────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 1500, height: 1600 } })
  wire(ctx, {
    marks: [{ month: PREV, step: 'tax_issued', marked_at: `${TODAY}T10:00:00Z`, marked_name: '홍현주', note: '홈택스 일괄' }],
  })
  const p = await open(ctx)
  const detail = flat(await p.textContent('[data-mark-detail="tax_issued"]'))
  ok(/홍현주님이/.test(detail), '이미 표시돼 있으면 누가 했는지 보임', detail)
  const box = flat(await p.textContent('[data-mark-box]'))
  ok(/표시 해제/.test(box), '켜져 있으면 「표시 해제」로 바뀜')
  //  메모도 진행상황에 함께 나옵니다.
  const step = flat(await p.textContent('[data-progress-step="tax"]'))
  ok(/홈택스 일괄/.test(step), '메모가 진행상황에도 보임', step.slice(0, 90))
  ok(/사람이 표시한 기록/.test(step), '**출처가 「사람이 표시한 기록」으로 바뀜** — 시스템 추정이 아님', step.slice(0, 120))
  await ctx.close()
}

// ── 4. 관리자가 아니면 못 누른다 ────────────────────────────────────────────
{
  const calls = []
  const ctx = await b.newContext({ viewport: { width: 1500, height: 1600 } })
  wire(ctx, {
    role: 'office', calls,
    marks: [{ month: PREV, step: 'invoice_sent', marked_at: `${TODAY}T10:00:00Z`, marked_name: '송명근', note: '' }],
  })
  const p = await open(ctx)
  ok((await p.locator('[data-mark-toggle="invoice_sent"]').count()) === 0, '사무실 담당자에게는 누를 단추가 없음')
  const ro = flat(await p.textContent('[data-mark-readonly="invoice_sent"]'))
  ok(/표시됨/.test(ro), '**읽기로는 보임** — 사무실도 「보냈나」를 알아야 합니다', ro)
  const ro2 = flat(await p.textContent('[data-mark-readonly="tax_issued"]'))
  ok(/대표님이 표시/.test(ro2), '아직 안 된 것은 누가 해야 하는지 알려 줌', ro2)
  ok(calls.length === 0, '아무것도 서버로 보내지 않음')
  await ctx.close()
}

// ── 5. 폰에서도 읽힌다 ──────────────────────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  wire(ctx)
  const p = await open(ctx)
  ok(await seen(p, '[data-mark-box]'), '폰에서도 표시 칸이 보임')
  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  ok(over <= 1, '가로 스크롤이 생기지 않음', `${over}px`)
  //  ⚠ 폰에서는 이 두 줄이 **접혀 있습니다.** 명세서 보냄·세금계산서 발행은
  //    청구를 확정한 **뒤에** 하는 일인데, 530px 을 차지해 정작 눌러야 할
  //    「확정하기」를 세 화면 아래로 밀어냈습니다.
  //    접혀 있어도 **몇 개를 표시해 뒀는지**는 보여야 합니다 — 안 보이면
  //    「나중에 하지」가 아니라 「한 줄이 사라졌다」가 됩니다.
  const cnt = ((await p.locator('[data-mark-count]').textContent()) ?? '').replace(/\s+/g, ' ')
  ok(/\d+ \/ \d+ 표시함/.test(cnt), '접혀 있어도 몇 개 표시했는지는 보임', cnt)
  const rows = await p.locator('[data-mark-row="invoice_sent"]').count()
  ok(rows === 1, '표시 줄이 DOM 에 **하나만** 있음 (두 벌이면 검사가 헛돕니다)', `${rows}개`)
  ok(!(await p.locator('[data-mark-row="invoice_sent"]').isVisible()), '기본은 접혀 있음')

  //  펴는 것이 사람이 실제로 하는 동작입니다 — 편 뒤에 단추 크기를 잽니다.
  await p.locator('[data-mark-open]').click()
  await p.waitForTimeout(400)
  const btn = await p.locator('[data-mark-toggle="invoice_sent"]').evaluate((e) => e.getBoundingClientRect())
  ok(btn.height >= 40, '펴면 단추가 손가락으로 누를 만한 크기', `${Math.round(btn.height)}px`)
  ok(btn.right <= 390, '단추가 화면 밖으로 안 나감', `${Math.round(btn.right)}px`)
  await ctx.close()
}

console.log('')
console.log(`총 ${out.length}건 · 실패 ${out.filter((v) => !v).length}건`)
await b.close()
