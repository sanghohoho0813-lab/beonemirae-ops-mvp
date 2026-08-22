import { chromium, EXEC } from './_pw.mjs'

//  운영 데이터 내보내기.
//
//   지금 백업은 Supabase 자동 백업 하나뿐입니다. 그건 사고가 났을 때
//   되살리는 장치이지, 대표님이 **숫자를 확인하는 수단이 아닙니다.**
//   표를 CSV 로 내려받아 엑셀에서 눈으로 검산할 수 있어야 합니다.
//
//   확인하는 것
//    · 표가 다 있는가 · 줄 수가 실제 자료와 맞는가
//    · 한글이 깨지지 않는가 (BOM)
//    · 쉼표·따옴표가 든 값이 칸을 밀지 않는가
//    · 금액이 1원까지 그대로인가
//    · 「복구는 안 된다」를 화면이 말하는가

const BASE = 'http://localhost:4173'
const UID = '00000000-0000-0000-0000-0000000000ad'
const out = []
const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  out.push(c)
  if (!c) process.exitCode = 1
}
const TODAY = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
const TODAY_STAMP = TODAY
const [Y, M] = TODAY.slice(0, 7).split('-').map(Number)
const PREV = M === 1 ? `${Y - 1}-12` : `${Y}-${String(M - 1).padStart(2, '0')}`

const profile = {
  id: UID, email: 'a@b.c', name: '대표', role: 'admin', font_scale: 'normal',
  active: true, approved_at: '2026-01-01T00:00:00Z', client_id: null, created_at: '2026-01-01T00:00:00Z',
}
const CA = '00000000-0000-0000-0000-0000000000a1'
const CB = '00000000-0000-0000-0000-0000000000b1'
//  쉼표·따옴표가 든 이름 — CSV 가 칸을 밀면 안 됩니다
const clients = [
  { id: CA, name: '가나병원, 본관', type: '병원', address: '경기도 남양주시 "정문" 앞', manager: '원무과',
    phone: '031-000-0000', collection_cycle: '주 2회', collects_medical_waste: true, collects_diaper: true,
    storage_size: '보통', note: '', is_demo_generated: false, demo_session_id: null, active: true,
    contract_start: '2025-01-01', contract_end: null, payment_terms: '', payment_due_day: 25,
    pricing: { medical: { sale: 950, cost: 350 } },
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    biz_no: '220-81-62517', biz_ceo: '홍길동', biz_type: '의료업', biz_item: '병원',
    tax_email: 'a@b.c', vat_mode: '별도', flat_fee_when_empty: false,
    collect_time: '평일 09:00~17:00', disposal_site: '○○환경', diaper_cycle: '주 1회' },
  { id: CB, name: 'B의원', type: '의원', address: '', manager: '', phone: '', collection_cycle: '주 1회',
    collects_medical_waste: true, collects_diaper: false, storage_size: '작음', note: '',
    is_demo_generated: false, demo_session_id: null, active: true,
    contract_start: null, contract_end: null, payment_terms: '', payment_due_day: null,
    pricing: {}, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    biz_no: null, biz_ceo: null, biz_type: null, biz_item: null, tax_email: null, vat_mode: null,
    flat_fee_when_empty: false, collect_time: '', disposal_site: '', diaper_cycle: '' },
]
const schedules = [
  { id: 's1', date: `${PREV}-05`, client_id: CA, waste_type: '의료폐기물', vehicle_id: null,
    scheduled_time: '', status: '완료', expected_amount: 100, actual_amount: 1234,
    completed_at: `${PREV}-05T09:00:00Z`, memo: '문 앞, 조심', origin: 'field', is_additional: false,
    demo_session_id: null, plan_batch: null, created_at: `${PREV}-05T00:00:00Z`, updated_at: `${PREV}-05T00:00:00Z` },
]
const payments = [
  { id: 'p1', client_id: CA, billing_month: PREV, amount: 1234567, status: '미수금', method: '무통장',
    paid_at: null, memo: '', demo_session_id: null,
    snapshot: { kind: '정기', confirmedAt: `${PREV}-28T00:00:00Z`, scheduleIds: ['s1'], materialIds: [] },
    canceled_at: null, created_at: `${PREV}-28T00:00:00Z`, updated_at: `${PREV}-28T00:00:00Z` },
]
const receipts = [
  { id: 'r1', payment_id: 'p1', received_on: `${PREV}-30`, amount: 234567, method: '계좌이체',
    memo: '', actor_name: '대표', created_at: `${PREV}-30T00:00:00Z`, source_ref: `${PREV}-30|234567|가나` },
]

const b = await chromium.launch({ executablePath: EXEC })
const ctx = await b.newContext({ viewport: { width: 1500, height: 1200 }, acceptDownloads: true })
await ctx.route('**/auth/v1/**', (r) =>
  r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: UID, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }) }))
await ctx.route('**/rest/v1/**', (r) => {
  const url = r.request().url()
  const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
  const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
  if (url.includes('/rpc/app_schema_version')) return json(64)
  if (url.includes('/profiles')) return json(single ? profile : [profile])
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
})), ['beonemirae-ops:auth', { id: UID, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }])

await p.goto(`${BASE}/settings`, { waitUntil: 'domcontentloaded' })
await p.waitForSelector('[data-export-list]', { timeout: 20000 })
await p.waitForTimeout(1200)

// ── 1. 표가 다 있는가 ─────────────────────────────────────────────────────
const keys = await p.locator('[data-export-row]').evaluateAll((els) => els.map((e) => e.getAttribute('data-export-row')))
for (const k of ['clients', 'schedules', 'materials', 'payments', 'receipts', 'revenue']) {
  ok(keys.includes(k), `표 「${k}」 가 목록에 있음`)
}
const listTxt = ((await p.textContent('[data-export-list]')) ?? '').replace(/\s+/g, ' ')
ok(/거래처.*2줄/.test(listTxt), '줄 수를 미리 보여 줌 (거래처 2줄)', listTxt.slice(0, 60))

// ── 2. 내려받아 내용을 확인 ───────────────────────────────────────────────
//  Playwright 는 blob 다운로드의 제안 이름을 'download' 로만 넘겨 줍니다.
//  실제 파일 이름을 정하는 것은 <a download="..."> 값이므로 그것을 직접 봅니다.
await p.evaluate(() => {
  window.__names = []
  const orig = HTMLAnchorElement.prototype.click
  HTMLAnchorElement.prototype.click = function () {
    if (this.download) window.__names.push(this.download)
    return orig.call(this)
  }
})

async function grab(key) {
  const [dl] = await Promise.all([
    p.waitForEvent('download'),
    p.click(`[data-export-one="${key}"]`),
  ])
  const stream = await dl.createReadStream()
  const chunks = []
  for await (const c of stream) chunks.push(c)
  return { name: dl.suggestedFilename(), text: Buffer.concat(chunks).toString('utf8') }
}

const cli = await grab('clients')
const names = await p.evaluate(() => window.__names)
ok(names[0]?.includes('거래처') && names[0]?.includes(TODAY) && names[0]?.endsWith('.csv'),
  '파일 이름에 표 이름과 날짜', names[0])
ok(cli.text.charCodeAt(0) === 0xfeff, 'BOM 이 있어 엑셀에서 한글이 안 깨짐')
ok(cli.text.includes('사업자등록번호'), '머리글이 한글 그대로')
//  쉼표·따옴표가 든 이름이 칸을 밀면 안 됩니다
ok(cli.text.includes('"가나병원, 본관"'), '쉼표가 든 이름을 따옴표로 감쌈')
ok(cli.text.includes('"경기도 남양주시 ""정문"" 앞"'), '따옴표가 든 값도 규칙대로 (엑셀이 한 칸으로 읽음)')
const cliLines = cli.text.trim().split('\r\n')
ok(cliLines.length === 3, '머리글 1줄 + 거래처 2줄', `${cliLines.length}줄`)
ok(cli.text.includes('평일 09:00~17:00') && cli.text.includes('○○환경'),
  '0039 에서 만든 칸(수거 가능시간·처리장)도 함께 나감')

const pay = await grab('payments')
ok(pay.text.includes('1234567'), '청구액이 1원까지 그대로 (1,234,567)')
ok(pay.text.includes('234567'), '받은 금액도')
ok(pay.text.includes('1000000'), '남은 금액 = 1,234,567 − 234,567 = 1,000,000')

const rec = await grab('receipts')
ok(rec.text.includes(`${PREV}-30|234567|가나`), '입금의 통장 출처(지문)까지 나감')

const rev = await grab('revenue')
ok(rev.text.includes('출처'), '월 매출 표에 출처 칸')
ok(rev.text.includes('확정'), '확정 청구가 있는 달은 「확정」으로')
ok(rev.text.includes('1234567'), '매출 금액이 1원까지')

const sch = await grab('schedules')
ok(sch.text.includes('1234'), '실제 수거량 그대로')
ok(sch.text.includes('문 앞, 조심') || sch.text.includes('"문 앞, 조심"'), '쉼표가 든 메모도 안전하게')

// ── 3. 복구용이 아니라는 것을 말하는가 ────────────────────────────────────
const card = ((await p.textContent('body')) ?? '').replace(/\s+/g, ' ')
ok(/이 파일로 시스템을 되돌리지는 못합니다/.test(card),
  '「복구는 안 된다」를 화면에 그대로 적음 — 백업인 줄 알고 안심하면 안 됩니다')
ok(/엑셀에서 바로 열립니다/.test(card), '무엇을 할 수 있는지도')

// ── 4. 전부 내려받기 ──────────────────────────────────────────────────────
const got = []
p.on('download', (d) => got.push(d.suggestedFilename()))
await p.click('[data-export-all]')
await p.waitForTimeout(4000)
ok(got.length >= 5, '「전부 내려받기」가 표 여러 개를 실제로 내려받음', `${got.length}개`)

// ── 5. 사무실 담당자에게는 설정이 열리지 않는다 (회귀) ────────────────────
const ctx2 = await b.newContext({ viewport: { width: 1400, height: 900 } })
await ctx2.route('**/auth/v1/**', (r) =>
  r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: UID, aud: 'authenticated', email: 'o@b.c', app_metadata: {}, user_metadata: {} }) }))
await ctx2.route('**/rest/v1/**', (r) => {
  const url = r.request().url()
  const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
  const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
  if (url.includes('/rpc/app_schema_version')) return json(64)
  if (url.includes('/profiles')) return json(single ? { ...profile, role: 'office' } : [{ ...profile, role: 'office' }])
  if (url.includes('/clients')) return json(single ? clients[0] : clients)
  if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
  return json([])
})
const p2 = await ctx2.newPage()
await p2.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
  access_token: 't', token_type: 'bearer', expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
})), ['beonemirae-ops:auth', { id: UID, aud: 'authenticated', email: 'o@b.c', app_metadata: {}, user_metadata: {} }])
await p2.goto(`${BASE}/settings`, { waitUntil: 'domcontentloaded' })
await p2.waitForTimeout(2200)
ok((await p2.locator('[data-export-list]').count()) === 0, '사무실 담당자에게는 내보내기가 열리지 않음')
await ctx2.close()

await b.close()
console.log(`\n총 ${out.length}건 · 실패 ${out.filter((x) => !x).length}건`)
