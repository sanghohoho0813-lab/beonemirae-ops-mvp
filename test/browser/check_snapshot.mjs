import { chromium, EXEC } from './_pw.mjs'

//  전체 스냅샷 — 되돌릴 수 있는 파일.
//
//   Supabase 자동 백업은 그 프로젝트 안에 있습니다. 프로젝트가 사라지면
//   백업도 같이 사라집니다. 그때 회사에 남는 것은 내려받아 둔 파일뿐입니다.
//
//   확인하는 것
//    · DB 의 줄을 **그대로** 담는가 (화면용으로 바꾸지 않는가)
//    · 금액이 1원까지 그대로인가
//    · 복구 순서·비울 칸이 파일 안에 적혀 있는가
//    · 담기지 않은 표를 파일과 화면이 **스스로 밝히는가**
//    · 못 읽은 표가 있으면 조용히 빈 채로 넘어가지 않는가
//    · 사무실 담당자에게는 열리지 않는가

const BASE = 'http://localhost:4173'
const UID = '00000000-0000-0000-0000-0000000000ad'
const out = []
const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  out.push(c)
  if (!c) process.exitCode = 1
}

const profile = {
  id: UID, email: 'a@b.c', name: '대표', role: 'admin', font_scale: 'normal',
  active: true, approved_at: '2026-01-01T00:00:00Z', client_id: null, created_at: '2026-01-01T00:00:00Z',
}
const CA = '00000000-0000-0000-0000-0000000000a1'
const clients = [{
  id: CA, name: '가나병원', type: '병원', address: '경기도 남양주시', manager: '원무과',
  phone: '031-000-0000', collection_cycle: '주 2회', collects_medical_waste: true, collects_diaper: false,
  storage_size: '보통', note: '', is_demo_generated: false, demo_session_id: null, active: true,
  contract_start: '2025-01-01', contract_end: null, payment_terms: '', payment_due_day: 25,
  pricing: { medical: { sale: 950, cost: 350 } },
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  //  화면이 안 쓰는 칸 — 스냅샷에는 그대로 들어 있어야 합니다
  created_by: '00000000-0000-0000-0000-0000000000ad',
  updated_by: '00000000-0000-0000-0000-0000000000ad',
  biz_no: '220-81-62517', flat_fee_when_empty: false,
  collect_time: '평일 09:00~17:00', disposal_site: '○○환경', diaper_cycle: '',
}]
const payments = [{
  id: 'p1', client_id: CA, billing_month: '2026-07', amount: 1234567, status: '미수금', method: '무통장',
  paid_at: null, memo: '', demo_session_id: null,
  snapshot: { kind: '정기', confirmedAt: '2026-07-28T00:00:00Z', scheduleIds: ['s1'], materialIds: [] },
  canceled_at: null, created_at: '2026-07-28T00:00:00Z', updated_at: '2026-07-28T00:00:00Z',
  updated_by: '00000000-0000-0000-0000-0000000000ad',
}]
const receipts = [{
  id: 'r1', payment_id: 'p1', received_on: '2026-07-30', amount: 234567, method: '계좌이체',
  memo: '', actor_id: null, actor_name: '대표', created_at: '2026-07-30T00:00:00Z',
  updated_at: '2026-07-30T00:00:00Z', source_ref: '2026-07-30|234567|가나',
}]
//  화면(AppData)이 아예 읽지 않는 표 — 예전 백업 파일에는 없었습니다
const auditLogs = [{
  id: 41, at: '2026-07-28T00:00:00Z', actor_id: null, actor_name: '대표', actor_role: 'admin',
  action: '청구확정', entity: 'payments', entity_id: 'p1', client_id: CA, client_name: '가나병원',
  screen: '월말청구', source: 'web', before_data: {}, after_data: { amount: 1234567 },
  summary: '가나병원 2026-07 청구 확정',
}]
const matTx = [{
  id: 'mt1', kind: '공급', item: 'corrugatedBox', qty: 12, client_id: CA, material_id: null,
  event_id: null, memo: '', created_at: '2026-07-01T00:00:00Z', created_by: null,
}]

const b = await chromium.launch({ executablePath: EXEC })

function routes(ctx, { blockAudit = false } = {}) {
  ctx.route('**/auth/v1/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: UID, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }) }))
  ctx.route('**/rest/v1/**', (r) => {
    const url = r.request().url()
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    if (url.includes('/rpc/app_schema_version')) return json(64)
    if (url.includes('/profiles')) return json(single ? profile : [profile])
    if (url.includes('/audit_logs')) {
      if (!blockAudit) return json(auditLogs)
      return r.fulfill({ status: 403, contentType: 'application/json',
        body: JSON.stringify({ message: 'permission denied for table audit_logs' }) })
    }
    if (url.includes('/material_transactions')) return json(matTx)
    if (url.includes('/payment_receipts')) return json(receipts)
    if (url.includes('/payments')) return json(payments)
    if (url.includes('/clients')) return json(single ? clients[0] : clients)
    if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
    return json([])
  })
}

async function openSettings(ctx, email = 'a@b.c') {
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: UID, aud: 'authenticated', email, app_metadata: {}, user_metadata: {} }])
  await p.goto(`${BASE}/settings`, { waitUntil: 'domcontentloaded' })
  return p
}

// ── 1. 정상 ───────────────────────────────────────────────────────────────
const ctx = await b.newContext({ viewport: { width: 1500, height: 1200 }, acceptDownloads: true })
routes(ctx)
const p = await openSettings(ctx)
await p.waitForSelector('[data-snapshot-take]', { timeout: 20000 })
await p.waitForTimeout(1000)

const bodyBefore = ((await p.textContent('body')) ?? '').replace(/\s+/g, ' ')
ok(/전체 스냅샷 받기/.test(bodyBefore), '「전체 스냅샷 받기」 버튼이 있음')
ok(/이 파일에 담기지 않는 것/.test(bodyBefore), '담기지 않는 것을 화면이 먼저 밝힘')
ok(/사용자 계정/.test(bodyBefore) && /개발자 요청/.test(bodyBefore), '무엇이 빠지는지 이름까지', '사용자 계정 · 개발자 요청')
ok(/docs\/RESTORE\.md/.test(bodyBefore), '되돌리는 절차가 어디 있는지 적어 둠')

await p.evaluate(() => {
  window.__names = []
  const orig = HTMLAnchorElement.prototype.click
  HTMLAnchorElement.prototype.click = function () {
    if (this.download) window.__names.push(this.download)
    return orig.call(this)
  }
})
const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-snapshot-take]')])
const chunks = []
for await (const c of (await dl.createReadStream())) chunks.push(c)
const snap = JSON.parse(Buffer.concat(chunks).toString('utf8'))
const fname = (await p.evaluate(() => window.__names))[0] ?? ''

ok(/^비원미래-전체스냅샷-\d{8}-\d{4}\.json$/.test(fname), '파일 이름에 날짜와 시각 (같은 날 두 번 받아도 안 덮어씀)', fname)
ok(snap.app === 'beonemirae-ops' && snap.kind === 'full-snapshot' && snap.format === 1, '파일이 스스로 무엇인지 밝힘')
ok(snap.schemaVersion === 64, '만들 때의 DB 판을 적어 둠', String(snap.schemaVersion))
ok(snap.takenBy === '대표', '누가 받았는지', snap.takenBy)

// ── 2. DB 의 줄을 그대로 담는가 ───────────────────────────────────────────
ok(Array.isArray(snap.tables.clients) && snap.tables.clients.length === 1, '거래처 줄이 들어 있음')
const c0 = snap.tables.clients[0]
ok(c0.collection_cycle === '주 2회' && c0.collects_medical_waste === true,
  'DB 칸 이름 그대로 (collection_cycle · collects_medical_waste)')
ok(c0.created_by === '00000000-0000-0000-0000-0000000000ad',
  '화면이 안 쓰는 칸(created_by)도 그대로 — 예전 백업에는 없던 것')
ok(snap.tables.audit_logs?.length === 1 && snap.tables.audit_logs[0].summary.includes('청구 확정'),
  '감사기록이 담김 — 예전 백업 파일에는 아예 없던 표')
ok(snap.tables.material_transactions?.length === 1, '자재 입출고도 담김 — 이것도 없던 표')

// ── 3. 돈 ─────────────────────────────────────────────────────────────────
ok(snap.tables.payments[0].amount === 1234567, '청구액이 1원까지 그대로', '1,234,567')
ok(snap.tables.payment_receipts[0].amount === 234567, '입금액도 1원까지', '234,567')
ok(snap.tables.payments[0].snapshot?.kind === '정기', '굳은 명세서(snapshot)가 통째로 들어 있음')
ok(snap.tables.payment_receipts[0].source_ref === '2026-07-30|234567|가나', '통장 지문까지')

// ── 4. 되돌리는 데 필요한 것이 파일 안에 있는가 ───────────────────────────
ok(Array.isArray(snap.order) && snap.order[0] === 'staff' && snap.order.includes('clients'), '넣는 순서가 파일에 적혀 있음 (사람·거래처가 먼저)')
ok(snap.order.indexOf('payments') < snap.order.indexOf('payment_receipts'), '청구가 입금보다 먼저 — 외래키 순서')
ok(snap.order.indexOf('clients') < snap.order.indexOf('schedules'), '거래처가 수거보다 먼저')
ok(snap.order.length === 29, '표 29개 (0062 현장 의견 포함)', `${snap.order.length}개`)
ok(snap.nullify?.clients?.includes('created_by'), '비울 칸(계정을 가리키는 칸)이 적혀 있음')
//  0056 로 둘이 늘었습니다 — 담당 배정·사전 등록은 계정에 붙는 자료라,
//  계정이 안 담기는 이 파일에 넣으면 되돌릴 때 없는 사람에게 배정된 거래처가
//  남습니다.
ok(snap.excluded?.map((e) => e.name).sort().join(',')
   === 'app_errors,client_assignments,dev_requests,profiles,staff_invites',
  '담지 않은 표를 파일이 이름과 이유까지 적어 둠',
  snap.excluded?.map((e) => e.name).sort().join(','))
ok(snap.excluded?.every((e) => (e.why ?? '').length > 10), '뺀 이유가 표마다 적혀 있음')
ok((snap.excluded ?? []).every((e) => e.why && e.why.length > 10), '왜 안 담았는지도 한 줄씩')
ok(Array.isArray(snap.unreadable) && snap.unreadable.length === 0, '못 읽은 표 없음')

// ── 5. 받은 뒤 화면이 결과를 말하는가 ─────────────────────────────────────
await p.waitForSelector('[data-snapshot-done]', { timeout: 5000 })
const doneTxt = ((await p.textContent('[data-snapshot-done]')) ?? '').replace(/\s+/g, ' ')
ok(/표 29개/.test(doneTxt), '표 몇 개를 받았는지', doneTxt)
const rows = Object.values(snap.tables).reduce((n, r) => n + r.length, 0)
ok(doneTxt.includes(String(rows)), '줄 수도 그대로', `${rows}줄`)

// ── 6. 못 읽은 표가 있으면 조용히 넘어가지 않는가 ─────────────────────────
//   이게 가장 위험한 경우입니다. 반쪽 백업을 온전한 백업으로 알고 있으면
//   백업이 아예 없는 것보다 나쁩니다.
const ctx2 = await b.newContext({ viewport: { width: 1500, height: 1200 }, acceptDownloads: true })
routes(ctx2, { blockAudit: true })
const p2 = await openSettings(ctx2)
await p2.waitForSelector('[data-snapshot-take]', { timeout: 20000 })
await p2.waitForTimeout(1000)
const [dl2] = await Promise.all([p2.waitForEvent('download'), p2.click('[data-snapshot-take]')])
const ch2 = []
for await (const c of (await dl2.createReadStream())) ch2.push(c)
const snap2 = JSON.parse(Buffer.concat(ch2).toString('utf8'))
ok(snap2.unreadable.some((u) => u.name === 'audit_logs'), '못 읽은 표를 파일이 이름으로 적어 둠')
ok(snap2.tables.audit_logs === undefined, '못 읽은 표를 「0줄」로 위장하지 않음 (빈 배열로 넣지 않음)')
ok(!snap2.order.includes('audit_logs'), '못 읽은 표는 복구 순서에서도 빠짐')
await p2.waitForTimeout(600)
const warn = ((await p2.textContent('body')) ?? '').replace(/\s+/g, ' ')
ok(/1개 표를 읽지 못했습니다/.test(warn) && /audit_logs/.test(warn),
  '화면이 빨간 글씨로 알려 줌 — 받았다고만 하지 않음', warn.match(/\d개 표를 읽지 못했습니다[^.]*/)?.[0] ?? '')
await ctx2.close()

// ── 7. CSV 카드와 역할이 갈리는가 ─────────────────────────────────────────
const body2 = ((await p.textContent('body')) ?? '').replace(/\s+/g, ' ')
ok(/이 파일로 시스템을 되돌리지는 못합니다/.test(body2), 'CSV 는 여전히 「되돌리지 못한다」고 적혀 있음')
ok(/되돌리는 것은 Supabase 백업, 그게 안 되면 위의 전체 스냅샷으로/.test(body2),
  '무엇으로 되돌리는지 순서까지 적음')
await ctx.close()

// ── 8. 사무실 담당자에게는 열리지 않는다 ──────────────────────────────────
const ctx3 = await b.newContext({ viewport: { width: 1400, height: 900 } })
ctx3.route('**/auth/v1/**', (r) =>
  r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: UID, aud: 'authenticated', email: 'o@b.c', app_metadata: {}, user_metadata: {} }) }))
ctx3.route('**/rest/v1/**', (r) => {
  const url = r.request().url()
  const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
  const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
  if (url.includes('/rpc/app_schema_version')) return json(64)
  if (url.includes('/profiles')) return json(single ? { ...profile, role: 'office' } : [{ ...profile, role: 'office' }])
  if (url.includes('/clients')) return json(single ? clients[0] : clients)
  if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
  return json([])
})
const p3 = await openSettings(ctx3, 'o@b.c')
await p3.waitForTimeout(2200)
ok((await p3.locator('[data-snapshot-take]').count()) === 0, '사무실 담당자에게는 스냅샷이 열리지 않음')
await ctx3.close()

await b.close()
console.log(`\n총 ${out.length}건 · 실패 ${out.filter((x) => !x).length}건`)
