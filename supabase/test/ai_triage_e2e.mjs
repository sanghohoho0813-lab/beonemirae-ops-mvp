// ─────────────────────────────────────────────────────────────────────────────
//  ai-triage — 배포될 함수 코드 그대로 끝까지 (0138)
//
//   병원 포털에서 요청 → 직원 요청함 → 「AI 분석 실행」 → **실제 index.ts (Deno)**
//   → 회신 저장 → 병원 포털 요청 상세의 「담당자 안내」
//
//  ⚠ 여기서 가짜인 것은 둘뿐입니다 — Supabase(작은 Node 서버)와 **모델 자리**
//    (시험용으로 정해 둔 JSON 을 돌려주는 주소). 그래서 이 검사는 「외부 AI 가
//    실제로 답했다」를 증명하지 않습니다. 함수의 인증 · 역할 확인 · DB 읽기 ·
//    입력 가림 · 결과 검사 · ai_calls 기록 · 화면 연결을 실제 코드로 봅니다.
//    실제 AI 호출은 AI_API_KEY 등록 후 README 의 「배포 후 확인」으로 합니다.
//
//  실행: DENO_BIN=/경로/deno PW_MODULE=… node supabase/test/ai_triage_e2e.mjs
//        (미리보기 서버 localhost:4173 이 떠 있어야 합니다 — npx vite build && npx vite preview)
// ─────────────────────────────────────────────────────────────────────────────

import http from 'node:http'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { chromium, EXEC } from '../../test/browser/_pw.mjs'
import * as W from '../../test/browser/walk_lib.mjs'
import * as F from '../../test/browser/perf_fixtures.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const FN_DIR = path.join(here, '../functions/ai-triage')
const DENO = process.env.DENO_BIN || 'deno'
const UP_PORT = 54999
const FN_PORT = 8000

let pass = 0
let fail = 0
const ok = (cond, name, detail = '') => {
  if (cond) pass += 1
  else fail += 1
  console.log(`${cond ? ' OK ' : 'FAIL'} | ${name}${detail && !cond ? ` — ${detail}` : ''}`)
}
const flat = (s) => (s ?? '').replace(/\s+/g, ' ').trim()

// ── 공유 자료 — 앱(브라우저 가짜 서버)과 함수(Node 가짜 Supabase)가 같은 것을 봅니다 ──
const C0 = F.clients[0]
const USERS = {
  'tok-admin': { id: '00000000-0000-4000-8000-0000000000a1', role: 'admin', active: true, name: '홍대표' },
  'tok-office': { id: '00000000-0000-4000-8000-0000000000b1', role: 'office', active: true, name: '김사무' },
  'tok-field': { id: '00000000-0000-4000-8000-0000000000c1', role: 'field', active: true, name: '박기사' },
  'tok-client': { id: '00000000-0000-4000-8000-0000000000d1', role: 'client', active: true, name: '원무과' },
}
const shared = { requests: [], aiCalls: [], modelCalls: [] }
let modelMode = 'good'

//  모델 자리 — 받은 요청 글로 분류해 정해 둔 형식의 JSON 을 돌려줍니다 (시험용)
function fakeModel(body) {
  const user = body.messages?.find((m) => m.role === 'user')?.content ?? ''
  shared.modelCalls.push({ model: body.model, system: body.messages?.[0]?.content ?? '', user, format: body.response_format?.type })
  if (modelMode === 'http500') return { status: 500, body: { error: { message: 'upstream exploded' } } }
  if (modelMode === 'badjson') return { status: 200, body: { model: 'test-model', choices: [{ message: { content: '{"kind":"긴급수거"' } }] } }
  const urgent = /빨리 찼|가득|급/.test(user)
  const out = {
    kind: urgent ? '긴급수거' : '추가수거',
    also_kinds: /박스|봉투|용기/.test(user) ? ['소모품'] : [],
    urgency: urgent ? '높음' : '보통',
    summary: urgent ? '폐기물이 예상보다 빨리 차 빠른 수거를 요청함.' : '추가 수거를 요청함.',
    points: urgent ? ['빠른 수거 희망'] : [],
    draft: '요청 확인했습니다. 원하신 시점에 방문 가능한지 확인한 뒤 안내드리겠습니다.',
    basis: urgent ? '「예상보다 빨리 찼다」는 표현이 있어 높음으로 봄.' : '일반 일정 요청으로 봄.',
  }
  return { status: 200, body: { model: 'test-model-2026', choices: [{ message: { content: JSON.stringify(out) } }], usage: { prompt_tokens: 300, completion_tokens: 120 } } }
}

// ── 가짜 Supabase + 모델 (Node) ─────────────────────────────────────────────
const upstream = http.createServer(async (req, res) => {
  let raw = ''
  for await (const ch of req) raw += ch
  const url = new URL(req.url, `http://127.0.0.1:${UP_PORT}`)
  const send = (status, v) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(v)) }
  const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
  const wantsOne = (req.headers.accept ?? '').includes('vnd.pgrst.object')
  const rows = (list) => (wantsOne ? (list[0] ? send(200, list[0]) : send(406, { message: 'no rows' })) : send(200, list))
  const eqId = url.searchParams.get('id')?.replace(/^eq\./, '')

  if (url.pathname === '/v1/chat/completions') { const r = fakeModel(JSON.parse(raw)); return send(r.status, r.body) }
  if (url.pathname === '/auth/v1/user') {
    const u = USERS[token]
    return u ? send(200, { id: u.id, aud: 'authenticated', role: 'authenticated', email: `${u.role}@t.test` }) : send(401, { msg: 'invalid JWT' })
  }
  const me = USERS[token]
  if (url.pathname === '/rest/v1/profiles') return rows(Object.values(USERS).filter((u) => u.id === eqId).map((u) => ({ role: u.role, active: u.active, name: u.name })))
  if (url.pathname === '/rest/v1/client_requests') {
    //  RLS 흉내 — 직원만 읽음
    if (!me || !['admin', 'office'].includes(me.role)) return rows([])
    return rows(shared.requests.filter((r) => r.id === eqId))
  }
  if (url.pathname === '/rest/v1/clients') return rows(eqId === C0.id ? [{ is_demo_generated: false }] : [])
  if (url.pathname === '/rest/v1/ai_calls' && req.method === 'POST') {
    if (!me || !['admin', 'office'].includes(me.role)) return send(403, { message: 'RLS' })
    const row = JSON.parse(raw)
    const id = `call-${shared.aiCalls.length + 1}`
    shared.aiCalls.push({ id, ...row })
    return wantsOne ? send(201, { id }) : send(201, [{ id }])
  }
  return send(404, { message: `unhandled ${req.method} ${url.pathname}` })
})
await new Promise((r) => upstream.listen(UP_PORT, '127.0.0.1', r))

// ── 실제 함수 코드를 Deno 로 ────────────────────────────────────────────────
//  ⚠ 배포와 같은 조건 — 함수 폴더의 deno.json 을 씁니다(저장소 package.json 을 안 따라가게).
const deno = spawn(DENO, ['run', '--allow-net', '--allow-env', 'index.ts'], {
  cwd: FN_DIR,
  env: {
    ...process.env,
    SUPABASE_URL: `http://127.0.0.1:${UP_PORT}`,
    SUPABASE_ANON_KEY: 'anon-test',
    AI_API_KEY: 'sk-test-only',
    AI_API_URL: `http://127.0.0.1:${UP_PORT}/v1/chat/completions`,
    AI_MODEL: 'test-model',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let denoLog = ''
deno.stdout.on('data', (d) => { denoLog += d })
deno.stderr.on('data', (d) => { denoLog += d })
const fnUrl = `http://127.0.0.1:${FN_PORT}`
for (let i = 0; i < 120; i += 1) {
  try { await fetch(fnUrl, { method: 'OPTIONS' }); break } catch { await new Promise((r) => setTimeout(r, 500)) }
}
const call = async (token, body) => {
  const r = await fetch(fnUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) })
  return { status: r.status, body: await r.json().catch(() => null) }
}

// ── A. 함수 단독 — 권한 · 기록 · 실패 ───────────────────────────────────────
const RID = 'bbbbbbbb-2222-4222-8222-000000000001'
shared.requests.push({ id: RID, client_id: C0.id, content: '폐기물이 예상보다 빨리 찼습니다. 가능하면 내일 오전에 부탁드립니다. 연락 010-9999-8888', kind: '긴급수거', urgent: true, desired_date: null, demo_session_id: null, created_at: new Date(Date.now() - 3600_000).toISOString() })
{
  ok((await call(null, { requestId: RID })).status === 401, 'A 로그인 없음 → 401')
  ok((await call('tok-field', { requestId: RID })).status === 403, 'A 현장 계정 → 403')
  ok((await call('tok-client', { requestId: RID })).status === 403, 'A 병원 계정 → 403')
  ok(shared.modelCalls.length === 0 && shared.aiCalls.length === 0, 'A 거부된 호출은 모델을 부르지도 기록하지도 않는다')
  const r = await call('tok-office', { requestId: RID, content: '다른 글로 바꿔치기' })
  ok(r.status === 200 && r.body.ok === true && r.body.result.kind === '긴급수거' && r.body.result.urgency === '높음', 'A 사무실 계정 → 200 · 분류 · 긴급도', JSON.stringify(r.body).slice(0, 160))
  const sent = shared.modelCalls.at(-1)
  ok(sent.format === 'json_object' && sent.model === 'test-model', 'A 모델 호출 — JSON 모드 · 설정한 모델')
  ok(!/바꿔치기/.test(sent.user) && /예상보다 빨리 찼습니다/.test(sent.user), 'A 브라우저가 보낸 글이 아니라 DB 의 요청 글을 보낸다')
  ok(!/010-9999-8888/.test(sent.user) && /\[전화번호 가림\]/.test(sent.user) && !sent.user.includes(C0.name), 'A 전화번호 가림 · 병원명 안 보냄')
  const row = shared.aiCalls.at(-1)
  ok(row && row.ok === true && row.kind === 'request_triage' && row.request_id === RID && row.model === 'test-model-2026' && Number.isInteger(row.ms), 'A ai_calls — ok · 운영 kind · 요청 · 실제 모델명 · 처리시간', JSON.stringify(row).slice(0, 200))
  ok(row.actor_id === USERS['tok-office'].id && row.actor_name === '김사무', 'A ai_calls — 누가 (서버가 확인한 사용자)')
  modelMode = 'http500'
  const r5 = await call('tok-admin', { requestId: RID })
  ok(r5.status === 502 && /AI 서버 오류 \(500\)/.test(r5.body.error) && shared.aiCalls.at(-1).ok === false, 'A 모델 500 → 502 + 실패 기록')
  modelMode = 'badjson'
  const rb = await call('tok-admin', { requestId: RID })
  ok(rb.status === 502 && /JSON/.test(rb.body.error) && shared.aiCalls.at(-1).ok === false, 'A 깨진 JSON → 502 + 실패 기록')
  modelMode = 'good'
}

// ── B. 화면 끝까지 — 포털 요청 → 직원 AI 분석 → 회신 → 포털 담당자 안내 ─────────
const b = await chromium.launch({ executablePath: EXEC })
async function openApp(role, pathName, clientId = null) {
  const prof = { ...W.profileFor(role), font_scale: 'normal', ...(clientId ? { client_id: clientId } : {}) }
  const state = { profile: prof, reqs: 0, writes: [], schemaVersion: 106 }
  const ctx = await b.newContext({ viewport: { width: role === 'client' ? 390 : 1440, height: 900 }, isMobile: role === 'client', hasTouch: role === 'client', timezoneId: 'Asia/Seoul' })
  W.wire(ctx, state)
  const json = (r, v, s = 200) => r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(v) })
  const asRow = (x) => ({ ...x, status: x.status ?? '접수', source: x.source ?? 'portal', requester_name: x.requester_name ?? '원무과', reply: x.reply ?? '', handled_at: x.handled_at ?? null, handled_by: null, created_at: x.created_at, updated_at: x.created_at, snoozed_until: null, snoozed_by_name: '', clients: { name: C0.name } })
  await ctx.route('**/rest/v1/client_requests*', async (r) => {
    const m = r.request().method()
    if (m === 'POST') {
      const body = JSON.parse(r.request().postData() ?? '{}')
      const one = Array.isArray(body) ? body[0] : body
      const id = `cccccccc-3333-4333-8333-${String(shared.requests.length + 1).padStart(12, '0')}`
      const row = { id, created_at: new Date().toISOString(), demo_session_id: null, ...one }
      shared.requests.push(row)
      return json(r, [asRow(row)])
    }
    if (m === 'PATCH') {
      const id = new URL(r.request().url()).searchParams.get('id')?.replace(/^eq\./, '')
      const patch = JSON.parse(r.request().postData() ?? '{}')
      const row = shared.requests.find((x) => x.id === id)
      if (row) Object.assign(row, patch)
      return json(r, row ? [asRow(row)] : [])
    }
    return json(r, shared.requests.filter((x) => !clientId || x.client_id === clientId).map(asRow).reverse())
  })
  await ctx.route('**/rest/v1/ai_calls*', (r) => (r.request().method() === 'GET' ? json(r, shared.aiCalls) : json(r, [])))
  //  화면의 함수 호출 → **실제 Deno 함수**로 넘깁니다 (토큰만 그 역할의 시험 토큰으로)
  await ctx.route('**/functions/v1/ai-triage', async (r) => {
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 200, body: 'ok' })
    const token = role === 'admin' ? 'tok-admin' : role === 'office' ? 'tok-office' : role === 'field' ? 'tok-field' : 'tok-client'
    const res = await fetch(fnUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: r.request().postData() ?? '{}' })
    return r.fulfill({ status: res.status, contentType: 'application/json', body: await res.text() })
  })
  const p = await ctx.newPage()
  const errors = []
  p.on('pageerror', (e) => errors.push(String(e)))
  await p.addInitScript(([k, u]) => {
    window.localStorage.setItem(k, JSON.stringify({ access_token: 't', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u }))
    window.localStorage.setItem('beonemirae-ops:tour-seen', 'staff,field,client,demo')
  }, ['beonemirae-ops:auth', { id: prof.id, aud: 'authenticated', email: prof.email, app_metadata: {}, user_metadata: {} }])
  await p.goto(`${W.BASE}${pathName}`, { waitUntil: 'domcontentloaded' })
  await W.settle(p, state)
  await p.waitForTimeout(500)
  return { ctx, p, errors }
}

const t0 = Date.now()
{
  //  1) 병원 포털 — 긴급수거 요청
  const { ctx, p, errors } = await openApp('client', '/portal', C0.id)
  const found = await p.locator('[data-portal-cta="urgent"]').waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false)
  if (!found) console.log('  (포털 화면)', p.url(), flat(await p.textContent('body')).slice(0, 300), errors.join(' | '))
  await p.locator('[data-portal-cta="urgent"]').click()
  await p.locator('[data-portal-sheet="urgent"]').waitFor({ state: 'visible', timeout: 8000 })
  await p.locator('[data-choice="reason"] [data-choice-item]').first().click()
  await p.locator('[data-req-memo]').fill('폐기물이 예상보다 빨리 찼습니다. 가능하면 내일 오전에 부탁드립니다.')
  await p.locator('[data-req-send]').click()
  await p.locator('[data-sheet-done]').waitFor({ state: 'visible', timeout: 8000 })
  ok(shared.requests.some((r) => /예상보다 빨리 찼습니다/.test(r.content ?? '')), 'B1 병원 포털 → 긴급수거 요청이 저장됐다')
  await ctx.close()
}
const newReq = shared.requests.at(-1)
{
  //  2) 직원 요청함 → 회신 창 → AI 분석 (실제 함수) → 초안 사용 · 수정 → 회신 저장
  const { ctx, p, errors } = await openApp('office', '/requests')
  const t = flat(await p.textContent('main'))
  ok(/예상보다 빨리 찼습니다/.test(t), 'B2 직원 요청함에 방금 요청이 보인다')
  await p.getByRole('button', { name: /회신 남기기/ }).first().click()
  await p.locator('[data-ai-triage-run]').click()
  await p.locator('[data-ai-triage-result]').waitFor({ state: 'visible', timeout: 25000 })
  const res = flat(await p.locator('[data-ai-triage-result]').innerText())
  ok(/긴급수거/.test(res) && /긴급도 높음/.test(res) && /빠른 수거/.test(res), 'B2 실제 함수가 돌려준 분류 · 긴급도 · 요약이 보인다', res.slice(0, 160))
  const callsBefore = shared.aiCalls.length
  await p.locator('[data-ai-use-draft]').click()
  await p.locator('#reply-text').fill(`${await p.locator('#reply-text').inputValue()} 오전 중 연락드리겠습니다.`)
  await p.locator('[data-reply-save]').click()
  await p.waitForTimeout(1200)
  ok(/오전 중 연락드리겠습니다/.test(newReq.reply ?? ''), 'B2 담당자가 고친 회신이 저장됐다 (사람이 눌러서)')
  ok(newReq.status === '접수', 'B2 AI 분석 · 회신 저장이 요청 상태를 바꾸지 않았다 (상태는 담당자가 따로)', newReq.status)
  ok(shared.aiCalls.length === callsBefore && shared.aiCalls.at(-1).request_id === newReq.id && shared.aiCalls.at(-1).ok === true, 'B2 그 호출이 ai_calls 에 서버 기록으로 한 줄 (브라우저 중복 없음)')
  ok(errors.length === 0, 'B2 화면 오류 0', errors.join(' | '))
  await ctx.close()
}
{
  //  3) 병원 포털 — 요청 상세의 「담당자 안내」
  const { ctx, p } = await openApp('client', '/portal/requests', C0.id)
  await p.locator(`[data-req-open="${newReq.id}"]`).click()
  await p.locator(`[data-req-reply="${newReq.id}"]`).waitFor({ state: 'visible', timeout: 8000 })
  const reply = flat(await p.locator(`[data-req-reply="${newReq.id}"]`).innerText())
  ok(/담당자 안내/.test(reply) && /오전 중 연락드리겠습니다/.test(reply), 'B3 병원 포털 요청 상세에 담당자 안내가 보인다', reply.slice(0, 120))
  await ctx.close()
}
console.log(`  (B 흐름 전체 ${((Date.now() - t0) / 1000).toFixed(1)}초 — 화면 대기 포함)`)

await b.close()
deno.kill()
upstream.close()
if (fail) console.log(denoLog.slice(-1500))
console.log(`\nai_triage_e2e OK=${pass} FAIL=${fail}`)
process.exit(fail ? 1 : 0)
