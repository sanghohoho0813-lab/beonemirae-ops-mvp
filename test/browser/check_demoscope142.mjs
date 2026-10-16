import { chromium, EXEC } from './_pw.mjs'
import * as W from './walk_lib.mjs'
import * as F from './perf_fixtures.mjs'

// ─────────────────────────────────────────────────────────────────────────────
//  0142 — 시연 흔적은 시연 안에서만
//
//   대표님: 「시연에서 예시로 입력한 건 시연 끄면 같이 사라져야 하는데, 시연 이후에도
//           『급한 요청이 반복되는 곳』이라고 흔적이 남아 있네.」
//
//   「시연용 병원 (신보 발표)」(시연 표시) 에 긴급 요청 3건이 쌓인 상태에서 —
//    · 시연을 끈 업무 화면(대시보드 · 요청함 · 거래처 · 오늘 일정) → 그 병원 · 그 요청이 안 보임
//    · 시연 중(안내 카드 켜짐) · 발표 시작 화면 → 그대로 보임
//    · DB 에는 지우기 · 고치기를 보내지 않음 (쓰기 0)
//    · 실제 거래처의 긴급 요청은 그대로 보임
// ─────────────────────────────────────────────────────────────────────────────

let pass = 0
let fail = 0
const ok = (cond, name, detail = '') => {
  if (cond) pass += 1
  else fail += 1
  console.log(`${cond ? ' OK ' : 'FAIL'} | ${name}${detail && !cond ? ` — ${detail}` : ''}`)
}
const json = (r, v, s = 200) => r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(v) })
const b = await chromium.launch({ executablePath: EXEC })
const DEMO_ID = '0e140000-0000-4000-8000-0000000000d0'
const DEMO_NAME = '시연용 병원 (신보 발표)'
const REAL = F.clients[0]
const ago = (d) => new Date(Date.now() - d * 86400000).toISOString()

const CLIENTS = [...F.clients, { ...F.clients[0], id: DEMO_ID, name: DEMO_NAME, address: '', phone: '', is_demo_generated: true, note: 'AI 시연용 — 실적 · 성과에서 빠짐', active: true }]
const REQS = [
  { id: 'dddddddd-4444-4444-8444-000000000001', client_id: DEMO_ID, kind: '긴급수거', content: '시연 긴급 1', urgent: true, created_at: ago(1) },
  { id: 'dddddddd-4444-4444-8444-000000000002', client_id: DEMO_ID, kind: '긴급수거', content: '시연 긴급 2', urgent: true, created_at: ago(2) },
  { id: 'dddddddd-4444-4444-8444-000000000003', client_id: DEMO_ID, kind: '긴급수거', content: '시연 긴급 3', urgent: true, created_at: ago(3) },
  { id: 'dddddddd-4444-4444-8444-000000000004', client_id: REAL.id, kind: '긴급수거', content: '실제 거래처 긴급 요청', urgent: true, created_at: ago(1) },
]
const nameOf = (cid) => CLIENTS.find((c) => c.id === cid)?.name ?? ''
const asRow = (x) => ({ status: '접수', source: 'portal', requester_name: '담당자', reply: '', handled_at: null, handled_by: null, snoozed_until: null, snoozed_by_name: '', demo_session_id: null, desired_date: null, updated_at: x.created_at, clients: { name: nameOf(x.client_id) }, ...x })

async function open(path, { presenting = false } = {}) {
  const prof = { ...W.profileFor('admin'), font_scale: 'normal' }
  const state = { profile: prof, reqs: 0, writes: [], schemaVersion: 106 }
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Asia/Seoul' })
  W.wire(ctx, state)
  await ctx.route('**/rest/v1/clients*', (r) => {
    if (r.request().method() !== 'GET') { state.writes.push({ url: 'clients', method: r.request().method() }); return json(r, []) }
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    return json(r, single ? CLIENTS[0] : CLIENTS)
  })
  await ctx.route('**/rest/v1/client_requests*', (r) => {
    if (r.request().method() !== 'GET') { state.writes.push({ url: 'client_requests', method: r.request().method() }); return json(r, []) }
    return json(r, REQS.map(asRow))
  })
  const p = await ctx.newPage()
  const errors = []
  p.on('pageerror', (e) => errors.push(String(e)))
  await p.addInitScript(([k, u, pres, cid]) => {
    localStorage.setItem(k, JSON.stringify({ access_token: 't', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u }))
    localStorage.setItem('beonemirae-ops:tour-seen', 'staff,field,client,demo')
    if (pres) sessionStorage.setItem('beonemirae-ops:presenter', JSON.stringify({ order: ['triage'], pos: 0, clientId: cid, demoRequestId: null, since: pres === 'old' ? undefined : new Date(Date.now() - 30 * 86400000).toISOString(), at: Date.now() }))
  }, ['beonemirae-ops:auth', { id: prof.id, aud: 'authenticated', email: prof.email, app_metadata: {}, user_metadata: {} }, presenting, DEMO_ID])
  await p.goto(`${W.BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await W.settle(p, state)
  await p.waitForTimeout(900)
  return { ctx, p, state, errors }
}

const body = (p) => p.locator('main').innerText()

// ── ① 시연을 끈 대시보드 ──────────────────────────────────────────────────────
{
  const { ctx, p, state, errors } = await open('/')
  const t = await body(p)
  ok(!t.includes('시연용 병원'), '① 대시보드 — 「시연용 병원」 흔적 없음', t.match(/.{0,40}시연용 병원.{0,40}/)?.[0])
  const risk = await p.locator('text=급한 요청이 반복').allInnerTexts()
  ok(risk.every((x) => !x.includes('시연용')), '① 「급한 요청이 반복되는 곳」에 시연 병원이 없음', risk.join(' | '))
  const tableWrites = state.writes.filter((w) => !String(w.url).startsWith('rpc/'))
  ok(tableWrites.length === 0, '① 숨기기만 — 지우기 · 고치기를 보내지 않음', JSON.stringify(tableWrites))
  ok(errors.length === 0, '① 화면 오류 0', errors.join(' | '))
  await ctx.close()
}

// ── ② 시연을 끈 요청함 · 거래처 · 오늘 일정 ──────────────────────────────────
for (const path of ['/requests', '/clients', '/today']) {
  const { ctx, p, errors } = await open(path)
  const t = await body(p)
  ok(!t.includes('시연용 병원') && !t.includes('시연 긴급'), `② ${path} — 시연 병원 · 시연 요청 안 보임`, t.match(/.{0,40}시연.{0,40}/)?.[0])
  if (path === '/requests') ok(t.includes('실제 거래처 긴급 요청'), '② 요청함 — 실제 거래처 요청은 그대로')
  if (path === '/clients') ok(t.includes(REAL.name), '② 거래처 — 실제 거래처는 그대로')
  ok(errors.length === 0, `② ${path} 화면 오류 0`, errors.join(' | '))
  await ctx.close()
}

// ── ③' 이 판 이전에 시작한 진행 기록(시작 시각 없음)은 버림 — 지난 연습 요청 · 회신이 이어지지 않게 (0143) ──
{
  const { ctx, p } = await open('/requests', { presenting: 'old' })
  ok((await p.locator('[data-presenter-card]:visible').count()) === 0, "③' 시작 시각 없는 옛 진행 기록 → 안내 카드 없음 (발표 시작부터 다시)")
  const t = await body(p)
  ok(!t.includes('시연용 병원') && !t.includes('시연 긴급'), "③' 옛 진행 기록을 버리면 시연 병원 흔적도 안 보임")
  await ctx.close()
}

// ── ③ 시연 중에는 그대로 ─────────────────────────────────────────────────────
{
  const { ctx, p, errors } = await open('/requests', { presenting: true })
  ok((await p.locator('[data-presenter-card]:visible').count()) >= 1, '③ 시연 중 (안내 카드 켜짐)')
  const t = await body(p)
  ok(t.includes('시연용 병원') || t.includes('시연 긴급'), '③ 시연 중 요청함 — 시연 병원 요청이 보임', t.slice(0, 200))
  //  시연을 끄면 바로 사라짐
  await p.locator('[data-presenter-card]:visible [data-presenter-stop]').click()
  await p.locator('[data-presenter-card]:visible [data-presenter-stop-yes]').click()
  await p.waitForTimeout(700)
  const t2 = await body(p)
  ok(!t2.includes('시연용 병원') && !t2.includes('시연 긴급'), '③ 시연을 끄면 그 자리에서 안 보임', t2.match(/.{0,40}시연.{0,40}/)?.[0])
  ok(errors.length === 0, '③ 화면 오류 0', errors.join(' | '))
  await ctx.close()
}
{
  const { ctx, p } = await open('/presentation')
  //  준비 상태는 「발표 준비」 안에 접혀 있을 수 있어 글자 그대로 읽습니다
  const t = (await p.locator('[data-ready="client"]').textContent()) ?? ''
  ok(t.includes('시연용 병원'), '③ 발표 시작 화면 — 시연 거래처를 그대로 보여 줌 (준비 상태)', t.slice(0, 300))
  await ctx.close()
}

await b.close()
console.log(`\ncheck_demoscope142 OK=${pass} FAIL=${fail}`)
if (fail) process.exitCode = 1
