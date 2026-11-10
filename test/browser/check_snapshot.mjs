import { chromium, EXEC } from './_pw.mjs'

//  전체 스냅샷 — 되돌릴 수 있는 파일.
//
//   Supabase 무료 플랜에는 자동 백업이 없습니다(유료여도 백업은 그 프로젝트 안에 있어
//   프로젝트가 사라지면 같이 사라집니다). 회사에 남는 것은 내려받아 둔 파일뿐입니다.
//
//   확인하는 것
//    · DB 의 줄을 **그대로** 담는가 (화면용으로 바꾸지 않는가)
//    · 금액이 1원까지 그대로인가
//    · 복구 순서·비울 칸이 파일 안에 적혀 있는가
//    · 담기지 않은 표를 파일과 화면이 **스스로 밝히는가**
//    · 못 읽은 표가 있으면 조용히 빈 채로 넘어가지 않는가
//    · 사무실 담당자에게는 열리지 않는가
//    · (0151) 표로 못 읽는 자료(사업계획서 · 설문)의 사본을 담는가 · 못 담으면 밝히는가
//    · (0151) 나중에 더한 표(proposals) 7개를 담는가 · 그 표가 없는 DB 에서는 「이 DB 에 없음」(못 읽음이 아님)
//    · (0151) 계정에 묶인 표 3개는 보관용 사본으로 담는가
//    · (0151) 받았다는 기록을 남기고 「마지막으로 받은 날」을 보여 주는가

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

//  사업계획서 사본용 가짜 답 (가상 내용 · 중립 수치)
const BIZ_OPEN = { api: 147, doc: { id: 'newborn2026', status: 'draft' }, fields: [{ key: 'a.b', value: '가상 내용 1', rev: 3 }],
  requests: [], checks: [], members: [], versions: [{ id: 7, label: '1차 저장' }, { id: 9, label: '2차 저장' }] }
const BIZ_HISTORY = { revisions: [{ id: 1, key: 'a.b', at: '2026-07-01T00:00:00Z' }], request_log: [], check_log: [] }
const BIZ_STRATEGY = { api: 148, strategy: { model: { price: 1000 }, rev: 2 }, decisions: [{ key: 'd1', choice: 'A' }], decision_log: [], log: [], revisions: [] }
const BIZ_SURVEY = { responses: [{ respondent: 'ceo', answers: { q1: '가상 답' } }], invites: [], revisions: [] }

//  나중에 더한 표(proposals) — 그 SQL 을 실행한 DB 에만 있습니다
const LATER = ['item_buckets', 'office_stock_items', 'client_inquiries', 'ops_changes', 'dispatch_decisions', 'recommendation_views', 'ai_calls',
  'day_closes', 'ax_coach_missions', 'vehicle_reservations']
const inquiries = [{ id: 'q1', client_id: CA, topic: '자재', subject: '가상 문의', body: '박스가 모자랍니다', status: '접수', reply: '',
  asked_by_name: '원무과', handled_by: null, handled_at: null, created_by: UID, created_at: '2026-07-20T00:00:00Z', updated_at: '2026-07-20T00:00:00Z' }]
const dayCloses = [{ id: 'd1', profile_id: UID, profile_name: '기사', date: '2026-07-21', note: '이상 없음', summary: { done: 7 }, closed_at: '2026-07-21T09:00:00Z' }]

/** extras — 'ok'(다 열림 · 나중에 더한 표도 있음) · 'missing'(그 기능들이 없는 DB · 기본값) · 'denied'(사업계획서 참여자가 아님) */
function routes(ctx, { blockAudit = false, extras = 'missing', lastSnap = [], writes = [] } = {}) {
  ctx.route('**/auth/v1/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: UID, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }) }))
  ctx.route('**/rest/v1/**', (r) => {
    const url = r.request().url()
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    if (url.includes('/rpc/app_schema_version')) return json(64)
    const fn = url.split('/rpc/')[1]?.split('?')[0]
    if (fn && /^(bizplan_|biz_survey_)/.test(fn)) {
      const none = () => r.fulfill({ status: 404, contentType: 'application/json',
        body: JSON.stringify({ code: 'PGRST202', message: `Could not find the function public.${fn} in the schema cache` }) })
      const deny = () => r.fulfill({ status: 403, contentType: 'application/json',
        body: JSON.stringify({ code: '42501', message: '사업계획서는 참여자로 등록된 계정만 열 수 있습니다.' }) })
      if (extras === 'missing') return none()
      if (extras === 'denied' && fn.startsWith('bizplan_')) return deny()
      if (fn === 'bizplan_open') return json(BIZ_OPEN)
      if (fn === 'bizplan_history') return json(BIZ_HISTORY)
      if (fn === 'bizplan_version_get') return json({ id: JSON.parse(r.request().postData() ?? '{}').p_id, snapshot: { 'a.b': '가상 내용(저장본)' } })
      if (fn === 'bizplan_strategy_open') return json(BIZ_STRATEGY)
      if (fn === 'biz_survey_admin_load') return json(BIZ_SURVEY)
      return none()
    }
    const table = url.split('/rest/v1/')[1]?.split('?')[0]
    if (LATER.includes(table)) {
      //  그 SQL 을 실행하지 않은 DB — PostgREST 는 「그런 표가 없다」고 답합니다
      if (extras === 'missing') return r.fulfill({ status: 404, contentType: 'application/json',
        body: JSON.stringify({ code: 'PGRST205', message: `Could not find the table 'public.${table}' in the schema cache` }) })
      if (table === 'client_inquiries') return json(inquiries)
      if (table === 'day_closes') return json(dayCloses)
      return json([])
    }
    if (url.includes('/profiles')) return json(single ? profile : [profile])
    if (url.includes('/audit_logs')) {
      if (r.request().method() === 'POST') {
        const body = JSON.parse(r.request().postData() ?? '{}')
        writes.push(body)
        //  받았다는 기록이 남으면 그 뒤의 「마지막으로 받은 날」 조회에 보입니다
        if (body.action === 'snapshot.download') lastSnap.unshift({ at: new Date().toISOString(), actor_name: body.actor_name, after_data: body.after_data })
        return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
      }
      //  「마지막으로 받은 날」 조회 — 실제 서버처럼 action 으로 거릅니다
      if (url.includes('action=eq.snapshot.download')) return json(lastSnap.slice(0, 1))
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
const writes1 = []
routes(ctx, { extras: 'ok', writes: writes1 })
const p = await openSettings(ctx)
await p.waitForSelector('[data-snapshot-take]', { timeout: 20000 })
await p.waitForTimeout(1000)

const bodyBefore = ((await p.textContent('body')) ?? '').replace(/\s+/g, ' ')
ok(/전체 스냅샷 받기/.test(bodyBefore), '「전체 스냅샷 받기」 버튼이 있음')
ok(/이 파일에 담기지 않는 것/.test(bodyBefore), '담기지 않는 것을 화면이 먼저 밝힘')
ok(/사용자 계정/.test(bodyBefore) && /개발자 요청/.test(bodyBefore), '무엇이 빠지는지 이름까지', '사용자 계정 · 개발자 요청')
ok(/docs\/RESTORE\.md/.test(bodyBefore), '되돌리는 절차가 어디 있는지 적어 둠')
ok(/무료 서버에는 자동 백업이 없어, 이 파일이 유일한 백업입니다/.test(bodyBefore), '(0151) 무료 서버에는 자동 백업이 없다고 화면이 먼저 밝힘')
ok((await p.locator('[data-snapshot-last="none"]').count()) === 1 && /마지막으로 받은 기록이 없습니다/.test(bodyBefore),
  '(0151) 받은 기록이 없으면 「기록이 없습니다」 (받은 적이 없다고 단정하지 않음)')
ok(/함께 담는 사본/.test(bodyBefore) && /사업계획서/.test(bodyBefore) && /자동 복구 대상은 아니고/.test(bodyBefore),
  '(0151) 함께 담는 사본과 그 한계(자동 복구 아님)를 화면이 밝힘')

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
ok(snap.order.length === 36, '표 36개 (0151 — 나중에 더한 표 7개 포함)', `${snap.order.length}개`)
ok(snap.tables.client_inquiries?.[0]?.subject === '가상 문의' && snap.tables.client_inquiries[0].created_by === UID, '(0151) 병원 문의가 줄 그대로 담김 — 지금까지 빠져 있던 표')
ok(snap.order.indexOf('clients') < snap.order.indexOf('client_inquiries') && snap.order.indexOf('item_buckets') < snap.order.indexOf('office_stock_items'),
  '(0151) 나중에 더한 표도 가리키는 표보다 뒤에')
ok(snap.needs?.client_inquiries === 'PROPOSAL_0083_customer_platform.sql' && Object.keys(snap.needs ?? {}).length === 7 && snap.nullify?.client_inquiries?.includes('created_by'),
  '(0151) 그 표를 만드는 SQL 파일 이름 · 비울 칸이 파일에 적혀 있음')
ok(Array.isArray(snap.absent) && snap.absent.length === 0, '(0151) 이 DB 에 없는 표 없음')
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
ok(/표 36개/.test(doneTxt), '표 몇 개를 받았는지', doneTxt)
const rows = Object.values(snap.tables).reduce((n, r) => n + r.length, 0)
ok(doneTxt.includes(String(rows)), '줄 수도 그대로', `${rows}줄`)

// ── 5-2. (0151) 표로 못 읽는 자료의 사본 ──────────────────────────────────
const ex = Object.fromEntries((snap.extras ?? []).map((x) => [x.name, x]))
ok(Object.keys(ex).sort().join(',') === 'ax_coach_missions,biz_survey,bizplan,bizplan_strategy,day_closes,vehicle_reservations',
  '사본 6가지가 담김 (사업계획서 · 전략 · 설문 + 계정에 묶인 표 3개)', Object.keys(ex).join(','))
ok(ex.day_closes?.data?.[0]?.profile_name === '기사' && ex.day_closes.data[0].summary?.done === 7 && /자동 복구 대상이 아님/.test(ex.day_closes.holds),
  '계정에 묶인 표(하루 마감)는 줄 그대로 사본으로 — 자동 복구 대상이 아니라고 밝힘')
ok(snap.tables.day_closes === undefined && !snap.order.includes('day_closes'), '계정에 묶인 표는 복구 순서에 넣지 않음 (없는 계정을 가리키게 되므로)')
ok(ex.bizplan?.data?.open?.fields?.[0]?.value === '가상 내용 1' && ex.bizplan?.data?.history?.revisions?.length === 1,
  '사업계획서 — 현재 내용 · 기록이 서버 답 그대로')
ok(ex.bizplan?.data?.versions?.length === 2 && ex.bizplan.data.versions.map((v) => v.id).join(',') === '7,9'
   && ex.bizplan.data.versions[0].snapshot?.['a.b'] === '가상 내용(저장본)', '저장해 둔 판은 판마다 내용까지 (목록만이 아님)')
ok(ex.bizplan_strategy?.data?.strategy?.model?.price === 1000 && ex.bizplan_strategy.data.decisions[0].choice === 'A', '전략 모델 · 결정이 그대로')
ok(ex.biz_survey?.data?.responses?.[0]?.answers?.q1 === '가상 답', '설문 응답이 그대로')
ok(ex.bizplan?.via?.includes('bizplan_open') && (ex.bizplan?.holds ?? '').length > 10, '무엇을 어느 함수로 담았는지 파일이 적어 둠')
ok(Array.isArray(snap.extrasSkipped) && snap.extrasSkipped.length === 0, '못 담은 사본 없음')
ok(!snap.order.some((n) => /bizplan|survey/.test(n)) && snap.tables.bizplan === undefined, '사본은 복구 순서 · 표에 섞이지 않음 (복구 SQL 대상 아님)')
ok(/사본도 담았습니다/.test(doneTxt) && /사업계획서/.test(doneTxt), '받은 뒤 화면이 사본을 담았다고 말함', doneTxt.slice(0, 90))

// ── 5-3. (0151) 받았다는 기록 · 「마지막으로 받은 날」 ────────────────────────
const rec = writes1.find((w) => w.action === 'snapshot.download')
ok(!!rec && rec.entity === 'snapshot', '감사기록에 「전체 스냅샷 받기」 한 줄을 남김')
ok(rec?.after_data?.tables === 36 && rec?.after_data?.rows === rows && rec?.after_data?.unreadable?.length === 0,
  '기록에 표 수 · 줄 수 · 못 읽은 표가 그대로', `${rec?.after_data?.tables}개 · ${rec?.after_data?.rows}줄`)
ok(/표 36개/.test(rec?.summary ?? '') && !/가나병원|1234567|가상 문의/.test(JSON.stringify(rec ?? {})), '기록에는 숫자만 — 자료 내용은 넣지 않음', rec?.summary)
ok(!(snap.tables.audit_logs ?? []).some((a) => a.action === 'snapshot.download'), '그 기록은 파일을 다 읽은 뒤에 남김 (파일 안에 자기 기록 없음)')
await p.waitForSelector('[data-snapshot-last="fresh"]', { timeout: 5000 }).catch(() => {})
const lastTxt = ((await p.locator('[data-snapshot-last]').textContent()) ?? '').replace(/\s+/g, ' ')
ok(/마지막으로 받은 날 \d{4}-\d{2}-\d{2} \(오늘 · 대표\)/.test(lastTxt), '받자마자 「마지막으로 받은 날 … (오늘 · 대표)」로 바뀜', lastTxt)

// ── 6. 못 읽은 표가 있으면 조용히 넘어가지 않는가 ─────────────────────────
//   이게 가장 위험한 경우입니다. 반쪽 백업을 온전한 백업으로 알고 있으면
//   백업이 아예 없는 것보다 나쁩니다.
const ctx2 = await b.newContext({ viewport: { width: 1500, height: 1200 }, acceptDownloads: true })
const last2 = []
routes(ctx2, { blockAudit: true, extras: 'denied', lastSnap: last2 })
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
//  (0151) 사업계획서 참여자가 아닌 계정으로 받음 — 사본을 못 담은 것을 숨기지 않습니다
const sk = Object.fromEntries((snap2.extrasSkipped ?? []).map((x) => [x.name, x]))
ok(sk.bizplan?.reason === 'denied' && sk.bizplan_strategy?.reason === 'denied' && /참여자/.test(sk.bizplan?.message ?? ''),
  '권한이 없어 못 담은 사본을 파일이 까닭과 함께 적어 둠', sk.bizplan?.message)
ok((snap2.extras ?? []).map((x) => x.name).join(',') === 'biz_survey,day_closes,ax_coach_missions,vehicle_reservations', '열 수 있는 사본(설문 · 계정에 묶인 표)은 그대로 담김')
ok((await p2.locator('[data-snapshot-extras-failed]').count()) === 1
   && /사업계획서/.test((await p2.locator('[data-snapshot-extras-failed]').textContent()) ?? ''), '화면도 「담지 못한 사본 — 사업계획서 …」라고 말함')
ok(last2[0]?.after_data?.unreadable?.includes('audit_logs') && last2[0]?.after_data?.extrasFailed?.includes('bizplan'), '기록에도 반쪽이었음이 남음')
await p2.waitForSelector('[data-snapshot-last="partial"]', { timeout: 5000 }).catch(() => {})
ok(/반쪽 파일입니다/.test(((await p2.locator('[data-snapshot-last]').textContent().catch(() => '')) ?? '')), '「마지막으로 받은 날」이 반쪽 파일이었다고 알림')
await ctx2.close()

// ── 6-2. (0151) 그 기능이 이 DB 에 없으면 — 담을 것이 없는 것 (실패가 아님) ─────
{
  const c = await b.newContext({ viewport: { width: 1500, height: 1200 }, acceptDownloads: true })
  routes(c, { extras: 'missing', lastSnap: [{ at: new Date(Date.now() - 40 * 86400000).toISOString(), actor_name: '대표', after_data: { unreadable: [] } }] })
  const q = await openSettings(c)
  await q.waitForSelector('[data-snapshot-take]', { timeout: 20000 })
  await q.waitForSelector('[data-snapshot-last="old"]', { timeout: 8000 }).catch(() => {})
  const t = ((await q.locator('[data-snapshot-last]').textContent().catch(() => '')) ?? '').replace(/\s+/g, ' ')
  ok(/\(40일 전 · 대표\)/.test(t) && /30일이 지났습니다/.test(t), '40일 전에 받았으면 「30일이 지났습니다. 다시 받아 주세요」', t)
  const [d] = await Promise.all([q.waitForEvent('download'), q.click('[data-snapshot-take]')])
  const cs = []
  for await (const x of (await d.createReadStream())) cs.push(x)
  const sn = JSON.parse(Buffer.concat(cs).toString('utf8'))
  ok(sn.extras.length === 0 && sn.extrasSkipped.length === 6 && sn.extrasSkipped.every((x) => x.reason === 'missing'), '기능이 없는 DB — 사본 0 · 「없음」으로 적힘')
  ok(sn.absent.length === 7 && sn.absent.some((a) => a.name === 'client_inquiries' && a.needs === 'PROPOSAL_0083_customer_platform.sql') && sn.unreadable.length === 0,
    '나중에 더한 표가 없는 DB — 「이 DB 에 없음」 7개 · 「못 읽음」 0개 (반쪽 백업이 아님)', `${sn.absent.length}개`)
  ok(sn.order.length === 29 && Object.keys(sn.needs).length === 0 && sn.tables.client_inquiries === undefined, '없는 표는 복구 순서에 넣지 않음 · 빈 배열로 위장하지 않음 (표 29개)')
  ok(!/읽지 못했습니다/.test(((await q.textContent('body')) ?? '')), '없는 표를 「읽지 못했다」고 겁주지 않음')
  await q.waitForSelector('[data-snapshot-done]', { timeout: 5000 })
  ok((await q.locator('[data-snapshot-extras-failed]').count()) === 0 && (await q.locator('[data-snapshot-extras]').count()) === 0,
    '기능이 없는 것을 「담지 못했다」고 겁주지 않음')
  await c.close()
}

// ── 7. CSV 카드와 역할이 갈리는가 ─────────────────────────────────────────
const body2 = ((await p.textContent('body')) ?? '').replace(/\s+/g, ' ')
ok(/이 파일로 시스템을 되돌리지는 못합니다/.test(body2), 'CSV 는 여전히 「되돌리지 못한다」고 적혀 있음')
//  (0151) 예전 문구는 「되돌리는 것은 Supabase 백업, 그게 안 되면 스냅샷」 — 무료 플랜에는 그 백업이 없어 사실이 아니었습니다
ok(/되돌리는 것은 위의 전체 스냅샷으로 합니다/.test(body2) && /무료 서버에는 자동 백업이 없습니다/.test(body2) && /유료 플랜이면 Supabase 백업이 먼저/.test(body2),
  '무엇으로 되돌리는지 — 무료는 스냅샷뿐 · 유료면 Supabase 백업이 먼저')
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
