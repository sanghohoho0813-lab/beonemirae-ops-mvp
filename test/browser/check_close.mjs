import { chromium, EXEC } from './_pw.mjs'

//  월말 청구 화면 검증.
//
//   A병원   단가 있음(kg 1,000원) · 지난달 완료 수거 3건 1,000kg → 100만원 · 확정 대상
//   B의원   단가 **없음** → 기본 단가(950원)로 계산됨 → 체크가 꺼진 채로 나와야 합니다
//   C요양   이미 그 달 청구를 확정해 둠 → 「이미 확정」
//   D의원   그 달 완료 수거가 아예 없음 → 목록에 나오지 않음
//   E병원   확정 뒤 수거가 더 들어옴 → 「추가 청구」

const BASE = 'http://localhost:4173'
const SHOT = (process.env.TEST_OUT ?? '/tmp')
const UID = '00000000-0000-0000-0000-0000000000ad'

const out = []
const ok = (c, m, d = '') => {
  if (process.env.VERBOSE) console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  //  바로 찍습니다 — 모아 뒀다가 끝에 한 번에 내보내면 중간에 터졌을 때
  //  앞의 결과까지 전부 사라지고, 회귀 집계에 「검사 0 · 실패 0」으로
  //  남아 통과한 것처럼 보입니다.
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  out.push(c)
  if (!c) process.exitCode = 1
}

const TODAY = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
const [Y, M] = TODAY.slice(0, 7).split('-').map(Number)
const prev = new Date(Date.UTC(Y, M - 2, 1))
const MONTH = `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}`
const day = (n) => `${MONTH}-${String(n).padStart(2, '0')}`

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
})
const OWN = { medical: { sale: 1000, cost: 400 } }
const CA = '00000000-0000-0000-0000-0000000000a1'
const CB = '00000000-0000-0000-0000-0000000000b1'
const CC = '00000000-0000-0000-0000-0000000000c1'
const CD = '00000000-0000-0000-0000-0000000000d1'
const CE = '00000000-0000-0000-0000-0000000000e1'
//  F — 월정액 900만원 계약인데 그 달 수거가 한 건도 없습니다.
//  (실제 오남한양병원이 이 형태입니다)
const CF = '00000000-0000-0000-0000-0000000000f1'
const clients = [
  mkClient(CA, 'A병원', OWN), mkClient(CB, 'B의원', null), mkClient(CC, 'C요양병원', OWN),
  mkClient(CD, 'D의원', OWN), mkClient(CE, 'E병원', OWN),
  mkClient(CF, 'F한양병원', { medicalMonthly: { sale: 9000000 }, medical: { sale: null, cost: 450 } }),
]

const sched = []
let n = 0
const done = (clientId, d, kg, id) => {
  const sid = id ?? `s${n++}`
  sched.push({
    id: sid, date: d, client_id: clientId, waste_type: '의료폐기물', vehicle_id: null,
    scheduled_time: '', status: '완료', expected_amount: kg, actual_amount: kg,
    completed_at: `${d}T09:00:00Z`, memo: '', origin: 'migrated', is_additional: false,
    demo_session_id: null, plan_batch: null, created_at: `${d}T00:00:00Z`, updated_at: `${d}T00:00:00Z`,
  })
  return sid
}
//  A병원 1,000kg × 1,000원 = 100만원
const a1 = done(CA, day(5), 400)
const a2 = done(CA, day(12), 300)
const a3 = done(CA, day(19), 300)
//  B의원 1,000kg × 기본 950원 = 95만원
done(CB, day(6), 1000)
//  C요양 500kg × 1,000원 = 50만원 — 이미 확정
const c1 = done(CC, day(7), 500)
//  E병원 — 200kg 는 확정에 들어갔고, 300kg 가 확정 뒤에 들어옴
const e1 = done(CE, day(8), 200)
done(CE, day(25), 300)

//  확정 당시 굳는 명세서와 같은 모양입니다.
const mkInvoice = (clientId, clientName, total) => ({
  clientId, clientName, manager: '', month: MONTH,
  from: `${MONTH}-01`, to: `${MONTH}-28`, issuedAt: `${MONTH}-28`, dueDate: null, paymentTerms: '',
  medicalLines: [], diaperLines: [], medicalSubtotal: total, diaperSubtotal: 0,
  medicalKg: 500, diaperKg: 0, vatTotal: 0, total, freeSupplies: [],
})

const payments = [
  {
    id: 'pay-c', client_id: CC, billing_month: MONTH, amount: 500000, status: '미수금',
    method: '무통장', paid_at: null, memo: '정기 청구', canceled_at: null,
    snapshot: { confirmedAt: `${MONTH}-28T00:00:00Z`, kind: '정기', scheduleIds: [c1], materialIds: [],
      revenue: 500000, cost: 200000, profit: 300000,
      invoice: mkInvoice(CC, 'C요양병원', 500000) },
  },
  {
    id: 'pay-e', client_id: CE, billing_month: MONTH, amount: 200000, status: '미수금',
    method: '무통장', paid_at: null, memo: '정기 청구', canceled_at: null,
    snapshot: { confirmedAt: `${MONTH}-28T00:00:00Z`, kind: '정기', scheduleIds: [e1], materialIds: [],
      revenue: 200000, cost: 80000, profit: 120000,
      invoice: mkInvoice(CE, 'E병원', 200000) },
  },
]

const inserted = []
const reloads = []
let counting = false
const b = await chromium.launch({ executablePath: EXEC })
const ctx = await b.newContext({ viewport: { width: 1500, height: 1200 } })
//  감사기록(writeAudit)은 auth.getUser() 로 「누가」를 먼저 확인합니다.
//  이 경로를 막지 않으면 실제 네트워크로 나가 응답이 오지 않고 멈춥니다.
await ctx.route('**/auth/v1/**', (r) =>
  r.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ id: UID, aud: 'authenticated', email: profile.email, app_metadata: {}, user_metadata: {} }),
  }),
)
await ctx.route('**/rest/v1/**', (r) => {
  const url = r.request().url()
  const method = r.request().method()
  const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
  const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
  //  청구 확정은 서버 함수 confirm_billing 이 합니다 (0032) — 화면이
  //  payments 에 직접 넣지 않습니다. 서버가 하는 일을 그대로 흉내 냅니다.
  if (url.includes('/rpc/confirm_billing')) {
    const body = JSON.parse(r.request().postData() ?? '{}')
    const row = {
      client_id: body.p_client_id, billing_month: body.p_month, amount: body.p_amount,
      status: '미수금', method: '무통장', paid_at: null,
      memo: `${body.p_snapshot?.kind ?? '정기'} 청구`, snapshot: body.p_snapshot, canceled_at: null,
    }
    inserted.push(row)
    const created = { ...row, id: `new-${inserted.length}` }
    //  실제 서버처럼, 다시 읽으면 방금 만든 청구도 함께 나옵니다.
    payments.push(created)
    return json({ id: created.id, amount: body.p_amount, month: body.p_month })
  }
  //  화면이 payments 에 직접 INSERT 하면 잡아냅니다 — 그러면 중복 확정을
  //  서버가 막을 수 없습니다.
  if (url.includes('/payments') && method === 'POST') {
    inserted.push({ DIRECT_INSERT: true })
    return json([{ id: 'direct' }])
  }
  if (url.includes('/audit_logs') && method === 'POST') return json([{ id: 1 }])
  //  전체 다시 읽기 횟수를 셉니다. /clients 로만 매칭하면 /client_requests ·
  //  /client_monthly_actuals 까지 걸려 한 번을 세 번으로 셉니다.
  if (/\/rest\/v1\/clients\?/.test(url) && method === 'GET' && counting) reloads.push(url)
  if (url.includes('/profiles')) return json(single ? profile : [profile])
  if (url.includes('/payments')) return json(payments)
  if (url.includes('/schedules')) return json(sched)
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

const body = () => p.textContent('main').then((t) => t ?? '')

await p.goto(`${BASE}/billing`, { waitUntil: 'domcontentloaded' })
await p.waitForSelector('[data-close-summary]', { timeout: 20000 })
await p.waitForTimeout(600)

// ── 폰에서 「확정하기」까지 얼마나 미는가 ───────────────────────────────────
//
//   이 화면은 **돈이 굳는 자리**입니다. 그래서 경고는 하나도 접지 않았습니다.
//   대신 지금 눌러야 할 것이 아닌 것만 접었습니다 —
//    · 「사람만 아는 두 가지」(명세서 보냄·세금계산서 발행)는 **확정 뒤에**
//      하는 일이라 폰에서만 접습니다 (몇 개 표시했는지는 접혀도 보입니다)
//    · 「왜 필요한가」 설명 문단과 같은 말을 두 번 하던 안내문 한 줄
//    · 달 고르기는 한 줄에 하나씩 쌓여 있던 것을 두 칸 격자로
//
//   ⚠ 여기 숫자는 **지금까지 줄인 만큼**이지 목표가 아닙니다.
//     확정 버튼 y=3,004px(3.6화면) → 2,403px(2.8화면), 문서 5,526 → 4,925px.
//   ⚠ **아직 아무것도 확정하기 전**에 잽니다. 아래에서 확정을 눌러 버리면
//     대상이 줄어들어 길이가 저절로 짧아집니다 — 그러면 이 검사는 아무것도
//     증명하지 못합니다. 라우트는 ctx 에 붙어 있으므로 같은 ctx 에 창만
//     하나 더 엽니다.
{
  const p3 = await ctx.newPage()
  await p3.setViewportSize({ width: 390, height: 844 })
  await p3.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: UID, aud: 'authenticated', email: profile.email, app_metadata: {}, user_metadata: {} }])
  await p3.goto(`${BASE}/billing`, { waitUntil: 'domcontentloaded' })
  await p3.waitForSelector('[data-close-summary]', { timeout: 20000 })
  await p3.waitForTimeout(700)

  const yOf = (sel) => p3.locator(sel).first().evaluate((e) => Math.round(e.getBoundingClientRect().top + window.scrollY))
  const yConfirm = await yOf('[data-close-confirm]')
  ok(yConfirm < 2800, '폰 — **「확정하기」가 세 화면 안** (예전 3,004px)', `y=${yConfirm}px`)
  const docH = await p3.evaluate(() => document.documentElement.scrollHeight)
  ok(docH < 5200, '폰 — 문서 길이가 줄어든 상태를 지킴 (예전 5,526px)',
    `${docH}px = ${(docH / 844).toFixed(1)}화면`)
  const over = await p3.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  ok(over <= 1, '폰 — 가로로 밀리지 않음', `${over}px`)

  //  ⚠ **경고는 하나도 접지 않았습니다.** 돈이 굳는 화면입니다.
  const t3 = ((await p3.textContent('main')) ?? '').replace(/\s+/g, ' ')
  ok(/그 순간의 금액과 거래명세서가 그대로 굳습니다/.test(t3), '폰 — 「되돌릴 수 없다」 경고는 그대로')
  ok((await p3.locator('[data-close-warn]').count()) === 1, '폰 — 기본 단가 경고도 그대로')

  //  ⚠ 접었어도 **몇 개를 표시해 뒀는지**는 보여야 합니다.
  const cnt = ((await p3.locator('[data-mark-count]').textContent()) ?? '').replace(/\s+/g, ' ')
  ok(/\d+ \/ \d+ 표시함/.test(cnt), '폰 — 명세서·세금계산서를 몇 개 표시했는지는 접혀도 보임', cnt)
  //  ⚠ **DOM 에 하나만 있어야 합니다.** 두 벌로 그리면 검사가 늘 숨은 쪽을
  //    집어 「접혀 있다」가 항상 통과합니다 — 실제로 그렇게 통과했습니다.
  const rowCount = await p3.locator('[data-mark-row="invoice_sent"]').count()
  ok(rowCount === 1, '폰 — 표시 줄이 DOM 에 **하나만** 있음 (두 벌이면 검사가 헛돕니다)', `${rowCount}개`)
  const rowVisible = await p3.locator('[data-mark-row="invoice_sent"]').isVisible()
  ok(!rowVisible, '폰 — 표시 버튼 줄은 접혀 있음 (확정 뒤에 하는 일)')
  await p3.locator('[data-mark-open]').click()
  await p3.waitForTimeout(400)
  const rowAfter = await p3.locator('[data-mark-row="invoice_sent"]').isVisible()
  ok(rowAfter, '폰 — 누르면 나옴 (지운 것이 아님)')
  await p3.close()
}

// ── 1. 기본은 지난달 ──────────────────────────────────────────────────────
let t = await body()
ok((await p.locator('[data-close-page]').count()) === 1, '월말 청구 화면이 열림')
const monthBtn = await p.locator(`[data-close-month="${MONTH}"]`).getAttribute('class')
ok((monthBtn ?? '').includes('bg-navy-800'), '처음에 지난달이 골라져 있음', MONTH)
ok(/그 순간의 금액과 거래명세서가 그대로 굳습니다/.test(t), '확정의 뜻을 밝힘')

// ── 2. 목록 ───────────────────────────────────────────────────────────────
ok((await p.locator(`[data-close-row="${CA}"]`).count()) === 1, 'A병원이 확정 대상')
ok((await p.locator(`[data-close-row="${CB}"]`).count()) === 1, 'B의원도 목록에 있음 (체크만 꺼짐)')
ok((await p.locator(`[data-close-row="${CC}"]`).count()) === 0, '이미 확정한 C요양은 대상이 아님')
ok((await p.locator(`[data-close-row="${CD}"]`).count()) === 0, '수거가 없는 D의원은 아예 안 나옴')
ok((await p.locator(`[data-close-row="${CE}"]`).count()) === 1, 'E병원은 추가 청구로 대상')

const rowA = (await p.locator(`[data-close-row="${CA}"]`).textContent()) ?? ''
ok(/1,000,000원/.test(rowA), 'A병원 금액 100만원 (자기 단가 1,000원 × 1,000kg)', rowA.replace(/\s+/g, ' ').slice(0, 90))
ok(/수거 3건/.test(rowA), 'A병원 수거 3건')

const rowE = (await p.locator(`[data-close-row="${CE}"]`).textContent()) ?? ''
ok(/추가 청구 · 이미 200,000원/.test(rowE), 'E병원은 추가 청구 · 기존 확정액 표시', rowE.replace(/\s+/g, ' ').slice(0, 90))
ok(/300,000원/.test(rowE), 'E병원 추가분만 30만원 (이미 확정한 20만은 빠짐)')

// ── 3. 기본 단가 경고 ─────────────────────────────────────────────────────
ok((await p.locator('[data-close-warn]').count()) === 1, '기본 단가 경고가 나옴')
ok(/추정 금액이 병원에 나가는 청구서가 됩니다/.test(t), '왜 위험한지 적음')
ok((await p.locator(`[data-close-default="${CB}"]`).count()) === 1, 'B의원에 기본 단가 표시')
ok(/기본 단가 · 의료폐기물/.test((await p.locator(`[data-close-row="${CB}"]`).textContent()) ?? ''),
  '어떤 품목이 기본 단가인지 적음')
const cbChecked = await p.locator(`[data-close-row="${CB}"] input`).isChecked()
ok(cbChecked === false, 'B의원은 체크가 꺼진 채로 시작')
const caChecked = await p.locator(`[data-close-row="${CA}"] input`).isChecked()
ok(caChecked === true, '단가가 있는 A병원은 켜진 채로 시작')

// ── 4. 요약 숫자 ──────────────────────────────────────────────────────────
const s = (await p.locator('[data-close-summary]').textContent()) ?? ''
ok(/확정할 거래처\s*2곳/.test(s.replace(/\s+/g, ' ')), '확정 대상 2곳 (B 제외)', s.replace(/\s+/g, ' ').slice(0, 90))
ok(/1,300,000원/.test(s), '금액 130만원 (A 100만 + E 30만)')
ok(/기본 단가 섞임\s*1곳/.test(s.replace(/\s+/g, ' ')), '기본 단가 1곳')
ok(/확정하기/.test((await p.locator('[data-close-confirm]').textContent()) ?? ''), '확정 버튼')
ok(/2곳 청구 확정하기/.test((await p.locator('[data-close-confirm]').textContent()) ?? ''), '버튼에 2곳')

await p.screenshot({ path: `${SHOT}/close-page.png`, fullPage: true })

// ── 5. 켜고 끄기 ──────────────────────────────────────────────────────────
await p.locator(`[data-close-row="${CB}"] input`).click()
await p.waitForTimeout(300)
ok(/3곳 청구 확정하기/.test((await p.locator('[data-close-confirm]').textContent()) ?? ''),
  'B를 켜면 3곳', (await p.locator('[data-close-confirm]').textContent()) ?? '')
await p.locator(`[data-close-row="${CB}"] input`).click()
await p.waitForTimeout(300)

//  지금은 B 가 빠져 있으므로 버튼은 「전체 선택」입니다.
ok((await p.locator('[data-close-toggle-all]').textContent()) === '전체 선택',
  '빠진 곳이 있으면 버튼이 「전체 선택」')
await p.locator('[data-close-toggle-all]').click()
await p.waitForTimeout(300)
ok(/3곳 청구 확정하기/.test((await p.locator('[data-close-confirm]').textContent()) ?? ''),
  '전체 선택하면 3곳 (기본 단가 포함 — 사람이 명시적으로 켠 것)')
ok((await p.locator('[data-close-toggle-all]').textContent()) === '전체 해제',
  '전부 선택되면 버튼이 「전체 해제」')
await p.locator('[data-close-toggle-all]').click()
await p.waitForTimeout(300)
ok(/0곳 청구 확정하기/.test((await p.locator('[data-close-confirm]').textContent()) ?? ''),
  '전체 해제하면 0곳')

//  A·E 만 켜고 확정합니다.
await p.locator(`[data-close-row="${CA}"] input`).click()
await p.locator(`[data-close-row="${CE}"] input`).click()
await p.waitForTimeout(300)
ok(/2곳 청구 확정하기/.test((await p.locator('[data-close-confirm]').textContent()) ?? ''),
  'A·E 만 켜면 2곳', (await p.locator('[data-close-confirm]').textContent()) ?? '')

// ── 6. 확정 ───────────────────────────────────────────────────────────────
counting = true
await p.locator('[data-close-confirm]').click()
await p.waitForTimeout(3000)
//  2곳을 확정해도 전체 다시 읽기는 마지막 한 번뿐이어야 합니다.
//  건마다 다시 읽으면 거래처가 열여덟 곳일 때 전체 조회를 열여덟 번 합니다.
ok(reloads.length === 1, '2곳을 확정해도 전체 다시 읽기는 한 번', `${reloads.length}회`)
ok(inserted.length === 2, '청구 2건만 만들어짐 (기본 단가 B 는 제외)', String(inserted.length))
ok(!inserted.some((x) => x.DIRECT_INSERT), 'payments 에 직접 넣지 않고 서버 함수로만 확정 (동시 확정 차단)')
const byClient = Object.fromEntries(inserted.map((x) => [x.client_id, x]))
ok(byClient[CA]?.amount === 1000000, 'A병원 청구 100만원', String(byClient[CA]?.amount))
ok(byClient[CE]?.amount === 300000, 'E병원 청구 30만원(추가분만)', String(byClient[CE]?.amount))
ok(!byClient[CB], 'B의원 청구는 만들어지지 않음')
ok(inserted.every((x) => x.billing_month === MONTH), '청구월이 고른 달')
ok(inserted.every((x) => x.status === '미수금'), '미수금 상태로 생성')
ok(inserted.every((x) => x.snapshot), '확정 당시 명세서가 함께 굳음')
ok(byClient[CE]?.snapshot?.kind === '추가', 'E병원은 추가 청구로 기록', String(byClient[CE]?.snapshot?.kind))
ok((await p.locator('[data-close-result]').count()) === 1, '결과가 화면에 나옴')
ok(/2곳 · 1,300,000원 청구를 확정했습니다/.test(await body()), '몇 곳·얼마인지 알려 줌')

// ── 7. 확정하지 않는 곳의 이유 ────────────────────────────────────────────
await p.locator('[data-close-skipped-section] button:has-text("곳 보기")').click()
await p.waitForTimeout(400)
const skipped = (await p.locator('[data-close-skipped]').textContent()) ?? ''
ok(/C요양병원/.test(skipped), '이미 확정한 곳이 목록에 있음')
ok(/이미 확정했습니다 \(500,000원\)/.test(skipped), '이미 확정한 금액을 적음', skipped.replace(/\s+/g, ' ').slice(0, 80))
ok(!/D의원/.test(skipped), '아무 일도 없던 D의원은 목록에 없음')

// ── 7-2. 월정액인데 그 달 수거가 없는 곳은 사라지지 않아야 합니다 ────────
//
//   시스템은 수거가 1건이라도 있어야 월정액을 청구합니다(계약 전·해지 후에
//   기본요금이 저절로 나가지 않게). 그런데 그런 달에 거래처가 목록에서
//   통째로 사라지면, 계약서상 받아야 할 돈이 있어도 알아챌 수 없습니다.
ok((await p.locator('[data-close-check]').count()) === 1, '「확인이 필요한 거래처」 칸이 있음')
const check = (await p.locator('[data-close-check]').textContent()) ?? ''
ok(/F한양병원/.test(check), '월정액 거래처가 목록에 남아 있음 (사라지지 않음)')
ok(/월정액 계약\(의료폐기물 월 9,000,000원\)인데/.test(check),
  '계약 금액과 함께 이유를 적음', check.replace(/\s+/g, ' ').slice(0, 90))
ok(/「배출 없는 달」 청구 여부를 한 번만 정해 주세요/.test(check), '사람 확인으로 넘기되 갈 자리를 이름으로 말함 (0044)')
ok((await p.locator(`[data-close-row="${CF}"]`).count()) === 0,
  '자동으로 청구 대상에 넣지는 않음')
ok(!inserted.some((x) => x.client_id === CF), 'F한양병원 청구는 만들어지지 않음')
ok(/수거가 한 건이라도 있어야 월정액을 청구합니다/.test(await body()), '왜 그런 규칙인지 설명')

// ── 7-3. 확정한 명세서를 한 번에 뽑을 수 있어야 합니다 ────────────────────
//
//   이게 없으면 거래처 화면에 하나씩 들어가 인쇄해야 합니다 — 열여덟 곳이면
//   열여덟 번. 그래서 거래명세서 시트가 든 엑셀을 계속 굴리게 됩니다.
{
  const btn = (await p.locator('[data-close-batch]').textContent()) ?? ''
  //  C요양 · E병원(기존) + 방금 확정한 A · E = 4장
  ok(/확정한 명세서 4장 한 번에 인쇄/.test(btn), '확정한 명세서 장수를 버튼에 표시', btn)
  await p.locator('[data-close-batch]').click()
  await p.waitForTimeout(800)
  ok((await p.locator('[data-invoice-batch]').count()) === 1, '명세서 묶음이 열림')
  const sheets = await p.locator('[data-batch-sheet]').count()
  ok(sheets === 4, '명세서가 4장 이어 붙음', String(sheets))
  const batch = (await p.locator('[data-invoice-batch]').textContent()) ?? ''
  ok(/A병원/.test(batch) && /C요양병원/.test(batch) && /E병원/.test(batch),
    '거래처별 명세서가 모두 들어 있음')
  ok(/확정할 때 굳혀 둔 명세서를 그대로 뽑습니다/.test(batch), '다시 계산하지 않는다고 밝힘')
  ok(/장 한 번에 인쇄 · PDF 저장/.test(batch), '인쇄 버튼이 있음')
  //  A4 한 장씩 끊어지는지 (인쇄 페이지 분리)
  const cls = await p.locator('[data-batch-sheet]').first().getAttribute('class')
  ok((cls ?? '').includes('break-after-page'), '병원마다 페이지가 끊어짐', cls ?? '')
  await p.keyboard.press('Escape').catch(() => {})
  await p.locator('[data-invoice-batch] button[aria-label=닫기]').click()
  await p.waitForTimeout(400)
}

// ── 8. 현장 담당자는 열 수 없다 ───────────────────────────────────────────
{
  const fieldProfile = { ...profile, id: '00000000-0000-0000-0000-0000000000fd', role: 'field', name: '현장' }
  const ctx2 = await b.newContext({ viewport: { width: 1400, height: 1000 } })
  await ctx2.route('**/rest/v1/**', (r) => {
    const url = r.request().url()
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    if (url.includes('/profiles')) return json(single ? fieldProfile : [fieldProfile])
    if (url.includes('/clients')) return json(single ? clients[0] : clients)
    if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
    return json([])
  })
  const p2 = await ctx2.newPage()
  await p2.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: fieldProfile.id, aud: 'authenticated', email: 'f@t.test', app_metadata: {}, user_metadata: {} }])
  await p2.goto(`${BASE}/billing`, { waitUntil: 'domcontentloaded' })
  await p2.waitForTimeout(2000)
  ok((await p2.locator('[data-close-page]').count()) === 0, '현장 담당자에게는 월말 청구가 열리지 않음')
  await ctx2.close()
}

await b.close()
console.log('')
console.log(`총 ${out.length}건 · 실패 ${out.filter((v) => !v).length}건`)
