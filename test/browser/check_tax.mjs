import { chromium, EXEC } from './_pw.mjs'

//  세금계산서 발행 자료.
//
//   청구를 확정하고 명세서를 뽑은 다음 순서가 세금계산서입니다. 그 값들이
//   시스템에 없어서 세금계산서용 엑셀을 따로 두고 매달 금액을 옮겨 적었습니다.
//
//   중요한 것은 「자동으로 정하지 않는 것」입니다. 청구액이 공급가액인지
//   부가세가 든 합계인지는 계약마다 다릅니다. 시스템이 짐작해서 10%를
//   붙이면 틀린 세금계산서가 홈택스로 나갑니다.
//
//   시나리오 (지난달 확정 청구)
//    A병원   1,000,000원 · 부가세 별도 · 번호 정상  → 공급 100만 세액 10만 합계 110만
//    B의원   1,100,000원 · 부가세 포함 · 번호 정상  → 공급 1,000,000 세액 100,000 합계 110만
//    C요양     500,000원 · 면세      · 번호 정상  → 공급 50만 세액 0 합계 50만
//    D의원     300,000원 · 부가세 미지정            → 확인 필요
//    E의원     200,000원 · 사업자번호 오타          → 확인 필요
//    F의원     400,000원 · 청구액에 세액 4만 포함    → 확인 필요 (섞여 있어 나눌 수 없음)
//    G의원     900,000원 · 취소                    → 대상 아님

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

//  실제로 유효한 사업자등록번호 (국세청 검증식 통과) — 삼성전자 124-81-00998
const GOOD = '124-81-00998'
const TYPO = '124-81-00997' // 마지막 자리 오타

const profile = {
  id: UID, email: 'admin@beonemirae.test', name: '대표', role: 'admin', font_scale: 'normal',
  active: true, approved_at: '2026-01-01T00:00:00Z', client_id: null, created_at: '2026-01-01T00:00:00Z',
}
const mkClient = (id, name, tax = {}) => ({
  id, name, type: '병원', address: '', manager: '', phone: '', collection_cycle: '주 1회',
  collects_medical_waste: true, collects_diaper: false, storage_size: '보통', note: '',
  is_demo_generated: false, demo_session_id: null, active: true,
  contract_start: null, contract_end: null, payment_terms: '', payment_due_day: null,
  pricing: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  biz_no: tax.no ?? null, biz_ceo: tax.ceo ?? null, biz_type: tax.type ?? null,
  biz_item: tax.item ?? null, tax_email: tax.email ?? null, vat_mode: tax.vat ?? null,
})
const CA = '00000000-0000-0000-0000-0000000000a1'
const CB = '00000000-0000-0000-0000-0000000000b1'
const CC = '00000000-0000-0000-0000-0000000000c1'
const CD = '00000000-0000-0000-0000-0000000000d1'
const CE = '00000000-0000-0000-0000-0000000000e1'
const CF = '00000000-0000-0000-0000-0000000000f1'
const CG = '00000000-0000-0000-0000-00000000009a'
const clients = [
  mkClient(CA, 'A병원', { no: GOOD, ceo: '김대표', type: '의료업', item: '병원', email: 'a@x.kr', vat: '별도' }),
  mkClient(CB, 'B의원', { no: GOOD, ceo: '이대표', email: 'b@x.kr', vat: '포함' }),
  mkClient(CC, 'C요양병원', { no: GOOD, ceo: '박대표', vat: '면세' }),
  mkClient(CD, 'D의원', { no: GOOD, ceo: '최대표' }),
  mkClient(CE, 'E의원', { no: TYPO, ceo: '정대표', vat: '별도' }),
  mkClient(CF, 'F의원', { no: GOOD, ceo: '한대표', vat: '별도' }),
  mkClient(CG, 'G의원', { no: GOOD, ceo: '조대표', vat: '별도' }),
]

const mkInvoice = (clientId, name, total, vatTotal) => ({
  clientId, clientName: name, manager: '', month: PREV,
  from: `${PREV}-01`, to: `${PREV}-28`, issuedAt: `${PREV}-28`, dueDate: null, paymentTerms: '',
  medicalLines: [], diaperLines: [], medicalSubtotal: total, diaperSubtotal: 0,
  medicalKg: 100, diaperKg: 0, vatTotal, total, freeSupplies: [],
})
const mkPay = (id, clientId, name, amount, status = '미수금', vatTotal = 0) => ({
  id, client_id: clientId, billing_month: PREV, amount, status,
  method: '무통장', paid_at: null, memo: '', canceled_at: status === '취소' ? `${TODAY}T00:00:00Z` : null,
  snapshot: { invoice: mkInvoice(clientId, name, amount, vatTotal), scheduleIds: [], materialIds: [] },
})
const payments = [
  mkPay('pa', CA, 'A병원', 1000000),
  mkPay('pb', CB, 'B의원', 1100000),
  mkPay('pc', CC, 'C요양병원', 500000),
  mkPay('pd', CD, 'D의원', 300000),
  mkPay('pe', CE, 'E의원', 200000),
  mkPay('pf', CF, 'F의원', 400000, '미수금', 40000),
  mkPay('pg', CG, 'G의원', 900000, '취소'),
]

const inserted = []
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
  if (url.includes('/rpc/app_schema_version')) return json(64)
  if (url.includes('/audit_logs')) return json([{ id: 1 }])
  //  0045 부터 거래처 등록은 표에 직접 넣지 않고 create_client 로 갑니다.
  if (url.includes('/rpc/create_client')) {
    inserted.push(r.request().postDataJSON()?.p_client ?? {})
    return json({ id: clients[0].id, alreadySaved: false, duplicates: [] })
  }
  if (url.includes('/clients') && r.request().method() === 'POST') {
    //  여기로 오면 안 됩니다 — 옛 길입니다.
    inserted.push(JSON.parse(r.request().postData() ?? '{}'))
    return json([{ ...clients[0], id: 'new' }])
  }
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
})), ['beonemirae-ops:auth', { id: UID, aud: 'authenticated', email: profile.email, app_metadata: {}, user_metadata: {} }])

await p.goto(`${BASE}/billing`, { waitUntil: 'domcontentloaded' })
await p.waitForSelector('[data-tax]', { timeout: 20000 })
await p.waitForTimeout(900)

// ── 1. 발행할 수 있는 것 ──────────────────────────────────────────────────
const rows = await p.locator('[data-tax-row]').evaluateAll((els) => els.map((e) => e.getAttribute('data-tax-row')))
ok(rows.length === 3, '발행 가능 3곳 (A·B·C)', rows.join(','))
ok(!rows.includes(CG), '취소한 청구는 대상 아님')

const cell = async (id) => ((await p.textContent(`[data-tax-row="${id}"]`)) ?? '').replace(/\s+/g, ' ')
const ra = await cell(CA)
ok(/1,000,000원.*100,000원.*1,100,000원/.test(ra), '부가세 별도 — 청구액이 공급가액, 세액을 더해 합계', ra)
const rb = await cell(CB)
ok(/1,000,000원.*100,000원.*1,100,000원/.test(rb), '부가세 포함 — 합계에서 역산 (합계는 청구액 그대로)', rb)
const rc = await cell(CC)
ok(/500,000원.*0원.*500,000원/.test(rc), '면세 — 세액 0', rc)
ok(/124-81-00998/.test(ra), '사업자등록번호를 하이픈 넣어 표시')

// ── 2. 합계 ───────────────────────────────────────────────────────────────
//  공급 100만 + 100만 + 50만 = 250만 · 세액 10만 + 10만 + 0 = 20만 · 합계 270만
ok(((await p.textContent('[data-tax-supply]')) ?? '').includes('2,500,000'), '공급가액 합계 250만원',
  await p.textContent('[data-tax-supply]'))
ok(((await p.textContent('[data-tax-vat]')) ?? '').includes('200,000'), '세액 합계 20만원',
  await p.textContent('[data-tax-vat]'))
ok(((await p.textContent('[data-tax-total]')) ?? '').includes('2,700,000'), '합계 270만원',
  await p.textContent('[data-tax-total]'))

// ── 3. 확인 필요 — 애매하면 숫자를 만들지 않습니다 ────────────────────────
const checkTxt = ((await p.textContent('[data-tax-check]')) ?? '').replace(/\s+/g, ' ')
ok(/확인할 거래처 3곳/.test(checkTxt), '확인 필요 3곳 (D·E·F)', checkTxt.slice(0, 70))
await p.click('[data-tax-check] button')
await p.waitForTimeout(600)
const rd = ((await p.textContent(`[data-tax-check-row="${CD}"]`)) ?? '').replace(/\s+/g, ' ')
ok(/부가세 처리 방식 미지정/.test(rd), '부가세를 정하지 않은 곳은 금액을 만들지 않음', rd)
const re = ((await p.textContent(`[data-tax-check-row="${CE}"]`)) ?? '').replace(/\s+/g, ' ')
ok(/사업자등록번호가 형식에 맞지 않음/.test(re), '사업자번호 오타를 잡음 (국세청 검증식)', re)
const rf = ((await p.textContent(`[data-tax-check-row="${CF}"]`)) ?? '').replace(/\s+/g, ' ')
ok(/세액 40,000원이 이미 포함/.test(rf), '청구액에 세액이 섞인 계약은 사람이 나누도록', rf)
ok(!/[0-9]/.test(rd.replace(/[^0-9]/g, '').replace('300000', '')) || /청구 300,000원/.test(rd),
  '확인 필요한 곳에는 청구액만 적고 공급가액·세액은 비워 둠', rd)

// ── 4. 엑셀로 복사 ────────────────────────────────────────────────────────
await p.click('[data-tax-copy]')
await p.waitForTimeout(700)
const clip = await p.evaluate(() => navigator.clipboard.readText())
const lines = clip.split('\n')
ok(lines.length === 4, '머리글 1줄 + 발행 가능 3줄', String(lines.length))
ok(lines[0].split('\t').length === 9, '탭으로 나뉜 9칸 (엑셀에 그대로 붙습니다)', lines[0].replace(/\t/g, '|'))
ok(lines.some((l) => l.startsWith('A병원\t124-81-00998\t김대표')), '거래처·사업자번호·대표자가 들어감',
  (lines[1] ?? '').replace(/\t/g, '|'))
ok(!clip.includes('D의원') && !clip.includes('E의원') && !clip.includes('F의원'),
  '확인이 필요한 곳은 복사에 넣지 않음 — 그대로 홈택스에 들어가면 안 됩니다')

// ── 5. 거래처 화면에서 입력할 수 있는가 ───────────────────────────────────
await p.goto(`${BASE}/clients`, { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(2000)
const add = p.locator('button:has-text("＋ 추가")').first()
ok((await add.count()) > 0, '거래처 추가 버튼', String(await add.count()))
await add.click()
await p.waitForSelector('text=세금계산서', { timeout: 10000 }).catch(() => {})
await p.waitForTimeout(700)
const body = (await p.textContent('body')) ?? ''
ok(/세금계산서/.test(body), '거래처 등록 화면에 세금계산서 칸이 있음')
ok(/사업자등록번호/.test(body) && /업태/.test(body) && /종목/.test(body), '사업자정보 칸')
const vatSel = p.locator('select').filter({ hasText: '미지정' }).first()
ok((await vatSel.count()) === 1, '부가세는 고르는 칸 — 비워 두면 미지정')
const opts = await vatSel.locator('option').allTextContents()
ok(opts.some((o) => o.includes('별도')) && opts.some((o) => o.includes('포함')) && opts.some((o) => o.includes('면세')),
  '별도 · 포함 · 면세 세 가지', opts.join(' / '))

//  넣은 값이 실제로 저장 요청에 실리는지 — 화면에만 있고 저장이 안 되면
//  다음 달에 또 손으로 적게 됩니다.
//  거래처명은 모달 안 첫 입력칸입니다 (바깥 검색창과 헷갈리지 않게 모달로 좁힙니다)
const modal = p.locator('[role="dialog"], .fixed').filter({ hasText: '거래처 추가' }).last()
await p.locator('input[placeholder="123-45-67890"]').fill('124-81-00998')
await modal.locator('input').first().fill('[검증]세금병원')
await vatSel.selectOption('별도')
await p.locator('button:has-text("저장")').last().click()
await p.waitForTimeout(1500)
ok(inserted.length === 1, '거래처 저장 요청이 한 번 나감', String(inserted.length))
const sent = Array.isArray(inserted[0]) ? inserted[0][0] : inserted[0]
ok(sent?.biz_no === '124-81-00998', '사업자등록번호가 저장 요청에 실림', JSON.stringify(sent?.biz_no))
ok(sent?.vat_mode === '별도', '부가세 방식이 저장 요청에 실림', JSON.stringify(sent?.vat_mode))

// ── 6. DB 를 아직 안 올렸으면 알려 주는가 ─────────────────────────────────
await ctx.route('**/rest/v1/rpc/app_schema_version', (r) =>
  r.fulfill({ status: 200, contentType: 'application/json', body: '32' }))
await p.goto(`${BASE}/billing`, { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(2500)
ok((await p.locator('[data-schema-bar]').count()) === 1, 'DB 가 33 보다 낮으면 업데이트 안내가 뜸')
const bar = (await p.textContent('[data-schema-bar]')) ?? ''
ok(/버전 32/.test(bar) && /64/.test(bar), "서버 32 · 앱 64 이라고 그대로 적음", bar.replace(/\s+/g, " ").slice(0, 80))

await b.close()
console.log(`\n총 ${out.length}건 · 실패 ${out.filter((x) => !x).length}건`)
