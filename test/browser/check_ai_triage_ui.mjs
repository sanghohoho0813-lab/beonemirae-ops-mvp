import { chromium, EXEC } from './_pw.mjs'
import * as W from './walk_lib.mjs'
import * as F from './perf_fixtures.mjs'

// ─────────────────────────────────────────────────────────────────────────────
//  고객 요청 「AI 요청 분석 · 회신 초안」 — 화면 · 브라우저 쪽 흐름 (0138)
//
//  서버 함수(ai-triage) 자리에는 **서버가 실제로 돌려주는 모양**의 답을 끼웁니다
//  (서버 코드 자체는 check_ai_triage_core 가 시험합니다). 화면 · 호출 함수 ·
//  기록 · 회신 저장은 실제 앱 코드 그대로입니다.
//
//   ① 정상 → 종류 · 함께 든 종류 · 긴급도 · 요약 · 핵심 · 근거 · 초안 · 모델 · 안내 문구
//      보내는 것은 요청 번호뿐 · 회신 칸에 자동으로 넣지 않음 · 「초안 사용」을 눌러야
//      AI 실행만으로는 요청 상태 · 회신 · 일정이 바뀌지 않음 · 기록은 서버가(브라우저 중복 기록 없음)
//   ② 수정 → edited 기록 · 그대로 쓰면 기록 안 함 · 초안 미사용도 표시
//   ③ 연타 → 서버 호출 한 번
//   ④ 실패(500 · 시간 초과/네트워크 · 미배포 404 · 형식 틀림) → 안내 문구 + 회신 · 상태 처리는 그대로
//      서버에 닿지 못한 실패는 브라우저가 한 줄 기록 (시연 요청이면 시연 kind)
//   ⑤ 같은 요청을 다시 열면 최근 결과 그대로 (다시 안 부름) · 다른 요청과 안 섞임
//   ⑥ 권한 — 관리자 · 사무실만 칸이 있다 (서버 거부는 core 검사)
//   ⑦ 준비도 화면 — 시연 요청 AI 호출은 운영 실적에서 뺀다
// ─────────────────────────────────────────────────────────────────────────────

let pass = 0
let fail = 0
const ok = (cond, name, detail = '') => {
  if (cond) pass += 1
  else fail += 1
  console.log(`${cond ? ' OK ' : 'FAIL'} | ${name}${detail && !cond ? ` — ${detail}` : ''}`)
}
const flat = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const b = await chromium.launch({ executablePath: EXEC })
const TODAY = F.TODAY
const C0 = F.clients[0].id
const C1 = F.clients[1].id

const R1 = 'aaaaaaaa-1111-4111-8111-000000000001'
const R2 = 'aaaaaaaa-1111-4111-8111-000000000002'
const RD = 'aaaaaaaa-1111-4111-8111-00000000000d'
const CONTENT = '의료폐기물이 예상보다 빨리 찼습니다. 가능하면 내일 오전에 수거 부탁드립니다. 63L 박스도 10개 정도 같이 부탁드립니다.'
const rq = (id, extra) => ({ id, client_id: C0, kind: '긴급수거', content: CONTENT, status: '접수', desired_date: null, urgent: true,
  source: 'portal', requester_name: '원무과', created_at: `${TODAY}T01:00:00Z`, updated_at: `${TODAY}T01:00:00Z`, demo_session_id: null,
  snoozed_until: null, snoozed_by_name: '', reply: '', handled_at: null, handled_by: null, ...extra })
const REQS = [
  rq(R1),
  rq(R2, { client_id: C1, kind: '추가수거', content: '3층 창고가 거의 다 찼습니다. 이번 주 안에 한 번 더 와 주세요.', urgent: false, created_at: `${TODAY}T00:30:00Z` }),
]
const RESULT = {
  kind: '긴급수거', alsoKinds: ['소모품'], urgency: '높음',
  summary: '폐기물 조기 포화로 내일 오전 수거와 63L 박스 10개 공급을 요청함.',
  points: ['내일 오전 수거 희망', '63L 박스 10개'],
  draft: '요청 확인했습니다. 내일 오전 수거 가능 여부와 63L 박스 10개 준비 여부를 확인한 뒤 안내드리겠습니다.',
  basis: '보관 공간이 찼다는 표현과 내일 수거 요청이 있어 높음으로 봄.',
  model: 'gpt-4o-mini-2024-07-18',
}
//  0142 — AI 처리 계획 (시험용 정해진 답 — 실제 Gemini 증명 아님)
const PLAN = {
  asks: [{ what: '빠른 수거', qty: null, item: null }, { what: '63L 박스', qty: 10, item: '63L 박스' }],
  when: '내일 오전',
  steps: [{ title: '방문일 정하기', detail: '그날 차량별 방문 수를 보고 가장 여유 있는 차량' }, { title: '63L 박스 10개 챙기기', detail: '사무실 재고 확인' }, { title: '회신', detail: '확정 뒤 안내' }],
  watch: ['다음 방문이 잡혀 있지 않음'],
  reply: '요청 확인했습니다. 내일 오전 수거가 가능하도록 일정을 확인하고 있으며, 63L 박스 10개도 함께 준비할 수 있는지 확인하고 있습니다. 확정되면 다시 안내드리겠습니다.',
}
const json = (r, v, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(v) })

/**
 * @param fn 서버 함수 자리 — (route, body) => 응답. 부른 횟수 · 몸통 · 인증 헤더를 셉니다.
 */
async function open(role, path, { routes = {}, fn = null, width = 1440 } = {}) {
  const prof = { ...W.profileFor(role), font_scale: 'normal' }
  const state = { profile: prof, reqs: 0, writes: [], schemaVersion: 106 }
  const ctx = await b.newContext({ viewport: { width, height: 900 }, isMobile: width < 640, hasTouch: width < 640, timezoneId: 'Asia/Seoul' })
  W.wire(ctx, state)
  const seen = { fn: [], plan: [], aiInsert: [], aiPatch: [], reqWrites: [] }
  await ctx.route('**/rest/v1/client_requests*', (r) => {
    const m = r.request().method()
    if (m !== 'GET') { seen.reqWrites.push({ method: m, url: r.request().url(), body: r.request().postData() }); return json(r, [{ ...REQS[0] }]) }
    return json(r, routes.client_requests ?? REQS)
  })
  await ctx.route('**/rest/v1/ai_calls*', (r) => {
    const m = r.request().method()
    if (m === 'POST') { seen.aiInsert.push(JSON.parse(r.request().postData() ?? '{}')); return json(r, { id: `client-${seen.aiInsert.length}` }) }
    if (m === 'PATCH') { seen.aiPatch.push({ url: r.request().url(), body: JSON.parse(r.request().postData() ?? '{}') }); return json(r, []) }
    return json(r, routes.ai_calls ?? [])
  })
  for (const [t, rows] of Object.entries(routes)) {
    if (t === 'client_requests' || t === 'ai_calls') continue
    await ctx.route(`**/rest/v1/${t}*`, (r) => (r.request().method() === 'GET' ? json(r, rows) : json(r, {})))
  }
  await ctx.route('**/functions/v1/ai-triage', async (r) => {
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 200, body: 'ok' })
    const body = JSON.parse(r.request().postData() ?? '{}')
    //  0142 — 「AI 처리 계획」은 같은 함수의 다른 작업입니다(요청 분석과 같이 불림). 따로 셉니다.
    if (body.task === 'request_plan') {
      seen.plan.push({ body, auth: r.request().headers()['authorization'] ?? '' })
      return json(r, { ok: true, task: 'request_plan', result: { ...PLAN, model: 'gemini-3.1-flash-lite' }, callId: 'p1', logged: true, ms: 1400 })
    }
    seen.fn.push({ body, auth: r.request().headers()['authorization'] ?? '' })
    if (!fn) return json(r, { error: 'not mocked' }, 500)
    return fn(r, body)
  })
  const p = await ctx.newPage()
  const errors = []
  p.on('pageerror', (e) => errors.push(String(e)))
  await p.addInitScript(([k, u]) => {
    window.localStorage.setItem(k, JSON.stringify({ access_token: 't', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u }))
    window.localStorage.setItem('beonemirae-ops:tour-seen', 'staff,field,client,demo')
  }, ['beonemirae-ops:auth', { id: prof.id, aud: 'authenticated', email: prof.email, app_metadata: {}, user_metadata: {} }])
  await p.goto(`${W.BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await W.settle(p, state)
  await p.waitForTimeout(500)
  return { ctx, p, state, seen, errors }
}

/** 첫 요청(또는 n번째)의 회신 창을 엽니다 */
async function openReply(p, n = 0) {
  await p.getByRole('button', { name: /회신 남기기/ }).nth(n).click()
  await p.locator('[role="dialog"] [data-ai-triage]').waitFor({ state: 'visible', timeout: 8000 })
}
const okFn = (delay = 0) => async (r) => {
  if (delay) await new Promise((res) => setTimeout(res, delay))
  return json(r, { ok: true, result: RESULT, callId: 'call-1', logged: true, ms: 1800, demo: false })
}

// ── ① 정상 ───────────────────────────────────────────────────────────────────
{
  const { ctx, p, seen, errors } = await open('office', '/requests', { fn: okFn() })
  await openReply(p)
  const dlg = p.locator('[role="dialog"]')
  ok(/AI 분석 실행/.test(flat(await dlg.locator('[data-ai-triage-run]').innerText())), '① 실행 전 단추 「AI 분석 실행」')
  ok((await dlg.locator('[data-ai-triage-result]').count()) === 0, '① 실행 전에는 결과가 없다 (미리 만든 결과 없음)')
  await dlg.locator('[data-ai-triage-run]').click()
  await dlg.locator('[data-ai-triage-result]').waitFor({ state: 'visible', timeout: 8000 })
  ok(seen.fn.length === 1 && JSON.stringify(seen.fn[0].body) === JSON.stringify({ requestId: R1 }), '① 서버에 보내는 것은 요청 번호뿐 (요청 글 · 병원명 없음)', JSON.stringify(seen.fn[0]?.body))
  ok(/^Bearer /.test(seen.fn[0].auth), '① 로그인 토큰을 달고 부른다 (서버가 역할을 다시 확인)')
  const res = flat(await dlg.locator('[data-ai-triage-result]').innerText())
  ok((await dlg.locator('[data-ai-kind="긴급수거"]').count()) === 1 && /긴급수거/.test(res), '① 요청 종류 칩 — 긴급수거')
  ok((await dlg.locator('[data-ai-also="소모품"]').count()) === 1 && /\+ 자재·용기/.test(res), '① 함께 든 종류 — + 자재·용기 (병원 말)')
  ok((await dlg.locator('[data-ai-urgency="높음"]').count()) === 1 && /긴급도 높음/.test(res), '① 긴급도 높음')
  ok(flat(await dlg.locator('[data-ai-summary]').innerText()) === RESULT.summary, '① 요약 = 서버가 돌려준 그대로')
  //  ── 0142 · AI 처리 계획 — 분석과 같이 불림 · 시스템 자료로 다시 확인 · 구체 회신 ──
  await dlg.locator('[data-ai-plan-result]').waitFor({ state: 'visible', timeout: 8000 })
  const pb = seen.plan[0]?.body
  ok(seen.plan.length === 1 && pb?.task === 'request_plan' && pb.input?.request === CONTENT, '① 처리 계획 — 같은 클릭에 한 번 · 요청 글 · 작업 이름', JSON.stringify(pb ?? {}).slice(0, 160))
  const sentPlan = JSON.stringify(pb?.input ?? {})
  ok(!sentPlan.includes(F.clients[0].name) && !F.vehicles.some((v) => v.driver && sentPlan.includes(v.driver)), '① 처리 계획 — 병원 이름 · 기사 이름은 보내지 않음 (차량 이름 · 숫자만)', sentPlan.slice(0, 200))
  ok(Array.isArray(pb?.input?.vehicles) && Array.isArray(pb?.input?.stock) && pb.input.stock.length === 4 && typeof pb?.input?.history?.urgent90 === 'number' && /^\d{4}-\d{2}-\d{2}$/.test(pb?.input?.target?.date ?? ''),
    '① 처리 계획 — 그날 차량별 방문 · 사무실 재고 4칸 · 이 병원 이력 · 방문 날짜 후보를 함께 보냄')
  const planTxt = flat(await dlg.locator('[data-ai-plan]').innerText())
  ok(/요청에서 뽑은 것/.test(planTxt) && /다시 확인한 것/.test(planTxt) && /처리 순서/.test(planTxt) && /구체 회신/.test(planTxt), '① 처리 계획 — 뽑은 것 · 다시 확인 · 처리 순서 · 구체 회신', planTxt.slice(0, 200))
  ok((await dlg.locator('[data-ai-plan-step]').count()) === PLAN.steps.length && (await dlg.locator('[data-ai-plan-watch]').count()) === 1, '① 처리 순서 · 주의 = 서버가 돌려준 그대로')
  //  재고 충분/부족은 화면이 직접 셈 — 보이는 재고 숫자와 판정이 맞는가
  const st = dlg.locator('[data-ai-plan-stock="63L 박스"]')
  const stTxt = flat(await st.innerText().catch(() => ''))
  const have = Number((stTxt.match(/재고 (\d+)개/) ?? [])[1])
  const enough = await st.getAttribute('data-enough').catch(() => null)
  ok(/골판지 전용박스/.test(stTxt) && Number.isFinite(have) && enough === (have >= 10 ? 'yes' : 'no'), '① 재고 — 63L 박스 → 골판지 전용박스 칸 · 충분/부족을 화면이 셈', `${stTxt} / ${enough}`)
  ok((await dlg.locator('[data-ai-plan-check-history]').count()) === 1 && (await dlg.locator('[data-ai-plan-check-dispatch]').count()) === 1, '① 다시 확인 — 그날 차량 · 이 병원 이력')
  await dlg.locator('[data-ai-plan-use-reply]').click()
  ok((await p.locator('#reply-text').inputValue()) === PLAN.reply && seen.reqWrites.length === 0, '① 「이 회신 쓰기」 → 회신 칸에만 (저장 안 함)')
  await p.locator('#reply-text').fill('')
  ok((await dlg.locator('[data-ai-points] li').count()) === 2, '① 핵심 요구사항 2개')
  ok(/판단 근거: 보관 공간이 찼다는/.test(flat(await dlg.locator('[data-ai-basis]').innerText())), '① 판단 근거')
  ok(flat(await dlg.locator('[data-ai-draft]').innerText()) === RESULT.draft, '① 회신 초안 = 서버가 돌려준 그대로')
  ok(/모델 gpt-4o-mini-2024-07-18/.test(flat(await dlg.locator('[data-ai-meta]').innerText())), '① 실제 모델 이름 · 처리 시간 표시')
  const disc = flat(await dlg.locator('[data-ai-disclaimer]').innerText())
  //  0140 — 발표 화면에서 반드시 보이게: 「AI 제안 → 담당자 최종 확인」 + 자동 확정 · 전송 없음
  ok(/AI 제안 → 담당자 최종 확인/.test(disc) && /AI는 초안을 제안하며, 최종 판단과 회신은 담당자가 수행합니다/.test(disc) && /병원에 보내지 않습니다/.test(disc), '① 안내 — AI 제안 → 담당자 최종 확인 (자동 확정 · 전송 없음)', disc)
  ok((await p.locator('#reply-text').inputValue()) === '', '① 회신 칸에 자동으로 넣지 않는다 (사람이 「초안 사용」을 눌러야)')
  ok(seen.reqWrites.length === 0, '① AI 실행만으로 요청 상태 · 회신이 바뀌지 않는다 (쓰기 0건)', JSON.stringify(seen.reqWrites))
  ok(seen.aiInsert.length === 0, '① 기록은 서버가 남긴다 — 브라우저가 중복 기록하지 않는다')
  if (process.env.AI_SHOTS) await dlg.screenshot({ path: `${process.env.AI_SHOTS}/ai_result.png` })
  await dlg.locator('[data-ai-use-draft]').click()
  ok((await p.locator('#reply-text').inputValue()) === RESULT.draft, '① 「초안 사용」 → 회신 칸에 초안')
  await p.waitForTimeout(800)
  const rb = await p.locator('#reply-text').evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight })
  ok(rb, '① 「초안 사용」 → 회신 칸이 화면에 보이게 옮겨짐 (0143 — 「반응 없다」)')
  ok(/다시 분석/.test(flat(await dlg.locator('[data-ai-triage-run]').innerText())), '① 결과가 있으면 단추는 「다시 분석」 (명시적으로만 다시 부름)')
  ok(errors.length === 0, '① 화면 오류 0', errors.join(' | '))

  // ── ② 고쳐 쓰면 edited 기록 ─────────────────────────────────────────────
  await p.locator('#reply-text').fill(`${RESULT.draft} 확인 후 바로 연락드리겠습니다.`)
  await p.locator('[data-reply-save]').click()
  await p.waitForTimeout(1200)
  ok(seen.reqWrites.some((w) => w.method === 'PATCH' && /확인 후 바로 연락드리겠습니다/.test(w.body ?? '')), '② 회신 저장은 담당자가 누른 그대로 (병원 화면에 보일 글)')
  ok(seen.aiPatch.length === 1 && /id=eq\.call-1/.test(seen.aiPatch[0].url) && seen.aiPatch[0].body.edited === true && /^\[수정\]/.test(seen.aiPatch[0].body.edited_note), '② 초안을 고쳐 쓰면 그 호출에 edited=true · [수정]', JSON.stringify(seen.aiPatch))
  ok(!seen.reqWrites.some((w) => /"status"/.test(w.body ?? '')), '② 회신 저장이 상태를 몰래 바꾸지 않는다 (상태는 따로 사람이)')
  await ctx.close()
}
{
  //  초안을 그대로 쓰면 edited 를 남기지 않는다
  const { ctx, p, seen } = await open('admin', '/requests', { fn: okFn() })
  await openReply(p)
  await p.locator('[data-ai-triage-run]').click()
  await p.locator('[data-ai-use-draft]').waitFor({ state: 'visible', timeout: 8000 })
  await p.locator('[data-ai-use-draft]').click()
  await p.locator('[data-reply-save]').click()
  await p.waitForTimeout(1200)
  ok(seen.aiPatch.length === 0 && seen.reqWrites.length >= 1, '② 초안을 그대로 쓰면 edited 를 남기지 않는다 (관리자도 실행 가능)', JSON.stringify(seen.aiPatch))
  await ctx.close()
}
{
  //  초안을 쓰지 않고 직접 적으면 「초안 미사용」
  const { ctx, p, seen } = await open('office', '/requests', { fn: okFn() })
  await openReply(p)
  await p.locator('[data-ai-triage-run]').click()
  await p.locator('[data-ai-triage-result]').waitFor({ state: 'visible', timeout: 8000 })
  await p.locator('#reply-text').fill('담당자가 직접 전화드리겠습니다.')
  await p.locator('[data-reply-save]').click()
  await p.waitForTimeout(1200)
  ok(seen.aiPatch.length === 1 && /^\[초안 미사용\]/.test(seen.aiPatch[0].body.edited_note), '② 초안을 안 쓰고 직접 적으면 edited · [초안 미사용]', JSON.stringify(seen.aiPatch))
  await ctx.close()
}

// ── ③ 연타 ───────────────────────────────────────────────────────────────────
{
  const { ctx, p, seen } = await open('office', '/requests', { fn: okFn(1500) })
  await openReply(p)
  const btn = p.locator('[data-ai-triage-run]')
  await btn.click()
  await btn.click({ force: true }).catch(() => {})
  await btn.click({ force: true }).catch(() => {})
  await p.waitForTimeout(150)
  ok(await btn.isDisabled(), '③ 호출 중에는 단추가 잠긴다')
  ok((await p.locator('[data-ai-triage-busy]').count()) === 1 && /분석 중/.test(flat(await btn.innerText())), '③ 「분석 중…」 표시')
  await p.locator('[data-ai-triage-result]').waitFor({ state: 'visible', timeout: 8000 })
  ok(seen.fn.length === 1, '③ 세 번 눌러도 서버 호출은 한 번', String(seen.fn.length))
  await ctx.close()
}

// ── ④ 실패 — 업무는 그대로 ───────────────────────────────────────────────────
const FAILS = [
  ['모델 500 (서버가 기록)', async (r) => json(r, { error: 'AI 서버 오류 (500)', callId: 'call-9', ms: 900 }, 502), { clientLog: false, why: /AI 서버 오류 \(500\)/ }],
  ['시간 초과 (서버가 기록)', async (r) => json(r, { error: 'AI 응답 시간 초과 (20초)', callId: 'call-8', ms: 20000 }, 504), { clientLog: false, why: /시간 초과/ }],
  ['키 없음 (서버가 기록)', async (r) => json(r, { error: 'AI_API_KEY 가 서버에 등록되지 않았습니다 (연결 전)', callId: 'call-7', ms: 5 }, 503), { clientLog: false, why: /등록되지 않았습니다/ }],
  ['네트워크 끊김 · 시간 초과', async (r) => r.abort('timedout'), { clientLog: true, why: /./ }],
  ['함수 미배포 404', async (r) => json(r, { code: 'NOT_FOUND', message: 'Requested function was not found' }, 404), { clientLog: true, why: /not found/i }],
  ['형식 틀린 성공 응답', async (r) => json(r, { ok: true, result: { ...RESULT, urgency: undefined }, callId: 'call-6', logged: true }), { clientLog: false, why: /형식/ }],
]
for (const [name, fn, exp] of FAILS) {
  const { ctx, p, seen, errors } = await open('office', '/requests', { fn })
  await openReply(p)
  await p.locator('[data-ai-triage-run]').click()
  await p.locator('[data-ai-triage-error]').waitFor({ state: 'visible', timeout: 12000 })
  const t = flat(await p.locator('[data-ai-triage-error]').innerText())
  if (process.env.AI_SHOTS && name === '모델 500 (서버가 기록)') await p.locator('[role="dialog"]').screenshot({ path: `${process.env.AI_SHOTS}/ai_error.png` })
  ok(/AI 분석을 불러오지 못했습니다\. 요청 처리는 그대로 진행할 수 있습니다\./.test(t) && exp.why.test(t), `④ ${name} → 안내 문구 + 까닭`, t)
  ok((await p.locator('[data-ai-triage-result]').count()) === 0 && (await p.locator('#reply-text').inputValue()) === '', `④ ${name} → 가짜 초안 없음`)
  ok(/다시 시도/.test(flat(await p.locator('[data-ai-triage-run]').innerText())) && !(await p.locator('[data-ai-triage-run]').isDisabled()), `④ ${name} → 「다시 시도」로 명시적 재시도`)
  ok(seen.aiInsert.length === (exp.clientLog ? 1 : 0), `④ ${name} → ${exp.clientLog ? '서버에 닿지 못했으니 브라우저가 실패 한 줄 기록' : '서버가 기록했으니 브라우저는 기록하지 않음'}`, JSON.stringify(seen.aiInsert))
  if (exp.clientLog) {
    const row = seen.aiInsert[0] ?? {}
    ok(row.ok === false && row.kind === 'request_triage' && row.request_id === R1 && /서버 함수에 닿지 못했습니다/.test(row.error) && row.input === '' && row.model === '', `④ ${name} → 실패 기록 내용 (ok=false · 운영 kind · 요청 번호 · 까닭)`, JSON.stringify(row))
  }
  //  업무는 그대로 — 회신 저장 · 상태 변경
  await p.locator('#reply-text').fill('확인 후 연락드리겠습니다.')
  await p.locator('[data-reply-save]').click()
  await p.waitForTimeout(1000)
  ok(seen.reqWrites.some((w) => w.method === 'PATCH' && /확인 후 연락드리겠습니다/.test(w.body ?? '')), `④ ${name} → 회신 저장은 그대로 된다`)
  const st = p.locator('[data-req-status="확인 중"]').first()
  if (await st.count()) {
    await st.click()
    await p.waitForTimeout(900)
    ok(seen.reqWrites.some((w) => /"status":"확인 중"/.test(w.body ?? '')), `④ ${name} → 상태 변경도 그대로 된다`)
  }
  ok(errors.length === 0, `④ ${name} → 화면 오류 0`, errors.join(' | '))
  await ctx.close()
}

// ── ⑤ 다시 열기 · 다른 요청 ─────────────────────────────────────────────────
{
  const { ctx, p, seen } = await open('office', '/requests', { fn: okFn() })
  await openReply(p, 0)
  await p.locator('[data-ai-triage-run]').click()
  await p.locator('[data-ai-triage-result]').waitFor({ state: 'visible', timeout: 8000 })
  await p.locator('[role="dialog"]').getByRole('button', { name: '취소' }).click()
  await p.waitForTimeout(400)
  await openReply(p, 0)
  ok((await p.locator('[data-ai-triage-result]').count()) === 1 && seen.fn.length === 1, '⑤ 같은 요청을 다시 열면 최근 결과 그대로 (다시 부르지 않음)')
  await p.locator('[role="dialog"]').getByRole('button', { name: '취소' }).click()
  await p.waitForTimeout(400)
  await openReply(p, 1)
  ok((await p.locator('[data-ai-triage-result]').count()) === 0, '⑤ 다른 요청을 열면 앞 요청의 결과가 섞이지 않는다')
  await ctx.close()
}

// ── ⑥ 권한 ───────────────────────────────────────────────────────────────────
{
  for (const role of ['admin', 'office']) {
    const { ctx, p } = await open(role, '/requests', { fn: okFn() })
    await openReply(p)
    ok((await p.locator('[data-ai-triage]').count()) === 1, `⑥ ${role} — AI 칸이 있다`)
    await ctx.close()
  }
  const { ctx, p, seen } = await open('field', '/requests', { fn: okFn() })
  ok((await p.locator('[data-ai-triage-run]').count()) === 0 && seen.fn.length === 0, '⑥ 현장 계정 — AI 칸이 없고 호출도 없다 (서버도 403)')
  await ctx.close()
  const c = await open('client', '/portal/requests', { fn: okFn() })
  ok((await c.p.locator('[data-ai-triage-run]').count()) === 0 && c.seen.fn.length === 0, '⑥ 병원 계정 — 포털에 AI 칸이 없고 호출도 없다 (서버도 403)')
  await c.ctx.close()
}

// ── ⑦ 시연 분리 ──────────────────────────────────────────────────────────────
{
  //  시연 요청에서 서버에 닿지 못하면 — 브라우저 실패 기록도 시연 kind
  const demoReqs = [rq(RD, { demo_session_id: 'demo-1' })]
  const { ctx, p, seen } = await open('office', '/requests', { routes: { client_requests: demoReqs }, fn: async (r) => r.abort('failed') })
  await openReply(p)
  await p.locator('[data-ai-triage-run]').click()
  await p.locator('[data-ai-triage-error]').waitFor({ state: 'visible', timeout: 12000 })
  ok(seen.aiInsert[0]?.kind === 'request_triage_demo', '⑦ 시연 요청의 실패 기록은 request_triage_demo', JSON.stringify(seen.aiInsert[0]))
  await ctx.close()
}
{
  //  준비도 — 실제 요청 호출만 센다 (시연 kind · 시연 요청 · 지워진 요청 제외)
  const calls = [
    { id: 'c1', kind: 'request_triage', request_id: R1, ok: true, error: '', ms: 1800, model: 'm', actor_name: '사무', edited: false, created_at: `${TODAY}T02:00:00Z` },
    { id: 'c2', kind: 'request_triage', request_id: R2, ok: false, error: '500', ms: 900, model: 'm', actor_name: '사무', edited: false, created_at: `${TODAY}T02:10:00Z` },
    { id: 'c3', kind: 'request_triage_demo', request_id: RD, ok: true, error: '', ms: 1500, model: 'm', actor_name: '대표', edited: false, created_at: `${TODAY}T02:20:00Z` },
    { id: 'c4', kind: 'request_triage', request_id: RD, ok: true, error: '', ms: 1500, model: 'm', actor_name: '대표', edited: false, created_at: `${TODAY}T02:30:00Z` },
    { id: 'c5', kind: 'request_triage', request_id: 'aaaaaaaa-1111-4111-8111-0000000000ff', ok: true, error: '', ms: 1500, model: 'm', actor_name: '대표', edited: false, created_at: `${TODAY}T02:40:00Z` },
  ]
  const { ctx, p } = await open('admin', '/readiness', { routes: { client_requests: [...REQS, rq(RD, { demo_session_id: 'demo-1' })], ai_calls: calls } })
  await p.waitForTimeout(800)
  const t = flat(await p.textContent('main'))
  //  손으로 센 값: 실제 요청 호출 = c1 · c2 → 2건 (성공 1), 제외 = c3(시연 kind) · c4(시연 요청) · c5(요청 없음) → 3건
  ok(/실제 요청 호출 2건 \(성공 1\) · 시연 3건 제외/.test(t), '⑦ 준비도 — 실제 요청 호출 2건(성공 1) · 시연 3건 제외 (손으로 센 값)', (t.match(/.{0,10}실제 요청 호출.{0,40}/) ?? [''])[0])
  await ctx.close()
}

await b.close()
console.log(`\ncheck_ai_triage_ui OK=${pass} FAIL=${fail}`)
process.exit(fail ? 1 : 0)
