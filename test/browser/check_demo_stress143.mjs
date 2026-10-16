import { chromium, EXEC } from './_pw.mjs'
import * as W from './walk_lib.mjs'
import * as F from './perf_fixtures.mjs'
import { SAMPLE_REQUEST, PRESENTER_STEPS, AI_ORDER, FULL_ORDER } from '../../src/lib/presenter.ts'

// ─────────────────────────────────────────────────────────────────────────────
//  0143 — 시연 안정화 (대표님: 「안정화 작업 들어가줘 — 특히 시연 기능 위주로」)
//
//   발표장에서 일어날 수 있는 일을 한 번씩 일부러 일으켜 봅니다:
//    ① 9단계를 처음부터 끝까지 — 1440 · 1280 · 1920 폭. 단계마다 주소 · 카드 · 강조 · 말풍선이 화면 안 ·
//       카드가 강조를 가리지 않음 · 화면 오류(페이지 오류 · 콘솔 오류) 0
//    ② 단계마다 새로고침 — 같은 단계 그대로
//    ③ 브라우저 뒤로 가기 — 카드가 「이 단계 화면으로 돌아가기」를 주고, 누르면 돌아옴
//    ④ AI 가 느림 · 실패 · 서버에 못 닿음 · 처리 계획만 실패 · 옛 서버 — 까닭 · 다시 시도 · 다음 단계로 그대로
//    ⑤ 이전 시연에서 처리 완료한 요청이 남아 있으면 — 새 시연 요청 하나만 만들어 씀
//    ⑥ 중간에 끝내고 다시 시작 — STEP 1 부터 · 카드 하나
//
//  ⚠ AI 자리는 시험용 응답입니다(실제 Gemini 증명 아님).
// ─────────────────────────────────────────────────────────────────────────────

let pass = 0
let fail = 0
const ok = (cond, name, detail = '') => {
  if (cond) pass += 1
  else fail += 1
  console.log(`${cond ? ' OK ' : 'FAIL'} | ${name}${detail && !cond ? ` — ${detail}` : ''}`)
}
const flat = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
//  SHINBO_SHOTS=<폴더> 를 주면 눈으로 볼 화면을 찍어 둡니다
const SHOTS = process.env.SHINBO_SHOTS
const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: `${SHOTS}/${name}.png` }) }
const b = await chromium.launch({ executablePath: EXEC })
const TODAY = F.TODAY
const json = (r, v, s = 200) => r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(v) })
const DEMO_ID = '0e140000-0000-4000-8000-0000000000d0'

const RESULT = {
  kind: '긴급수거', alsoKinds: ['소모품'], urgency: '높음',
  summary: '폐기물 조기 포화로 빠른 수거와 63L 용기 10개를 요청함.',
  points: ['빠른 수거', '내일 오전 희망', '63L 용기 10개'],
  draft: '요청 확인했습니다. 방문 가능 여부와 용기 준비 여부를 확인한 뒤 안내드리겠습니다.',
  basis: '「빨리 찼다」는 표현이 있어 높음으로 봄.', model: 'test-model',
}

const PLAN = {
  asks: [{ what: '빠른 수거', qty: null, item: null }, { what: '63L 용기', qty: 10, item: '63L 박스' }],
  when: '내일 오전',
  steps: [{ title: '방문일 정하기', detail: '그날 차량별 방문 수를 보고 가장 여유 있는 차량' }, { title: '63L 박스 10개 챙기기', detail: '사무실 재고 확인' }, { title: '회신', detail: '확정 뒤 안내' }],
  watch: [],
  reply: '요청 확인했습니다. 내일 오전 수거가 가능하도록 일정을 확인하고 있으며, 63L 용기 10개도 함께 준비할 수 있는지 확인하고 있습니다. 확정되면 다시 안내드리겠습니다.',
}

function makeShared() {
  return { clients: [...F.clients], requests: [], creates: 0, posts: 0, patches: [], aiMode: 'ok', aiCalls: [] }
}

async function open(role, path, { width = 1440, height = null, font = 'normal', S = makeShared() } = {}) {
  const prof = { ...W.profileFor(role), font_scale: font }
  const state = { profile: prof, reqs: 0, writes: [], schemaVersion: 106 }
  //  시연용 거래처 만들기(create_client) — 같은 시도 표면 같은 곳 (서버와 같게)
  state.rpc = (url, req) => {
    if (url.includes('/rpc/create_client')) {
      S.creates += 1
      const body = JSON.parse(req.postData() ?? '{}')
      const c = body.p_client ?? {}
      if (!S.clients.some((x) => x.id === DEMO_ID)) {
        S.clients.push({ ...F.clients[0], ...c, id: DEMO_ID, address: c.address ?? '', phone: c.phone ?? '', is_demo_generated: !!c.is_demo_generated, active: true })
      }
      return { id: DEMO_ID, alreadySaved: S.creates > 1, duplicates: [] }
    }
    return null
  }
  const ctx = await b.newContext({ viewport: { width, height: height ?? (width < 700 ? 844 : 900) }, isMobile: width < 700, hasTouch: width < 700, timezoneId: 'Asia/Seoul' })
  W.wire(ctx, state)
  await ctx.route('**/rest/v1/clients*', (r) => {
    if (r.request().method() !== 'GET') return json(r, [])
    const u = new URL(r.request().url())
    const id = u.searchParams.get('id')?.replace(/^eq\./, '')
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    if (id) { const row = S.clients.find((c) => c.id === id) ?? null; return json(r, single ? row : row ? [row] : []) }
    return json(r, single ? S.clients[0] : S.clients)
  })
  const nameOf = (cid) => S.clients.find((c) => c.id === cid)?.name ?? ''
  const asRow = (x) => ({ status: '접수', source: 'portal', requester_name: '시연 담당자', reply: '', handled_at: null, handled_by: null, snoozed_until: null, snoozed_by_name: '', demo_session_id: null, desired_date: null, urgent: false, updated_at: x.created_at, clients: { name: nameOf(x.client_id) }, ...x })
  await ctx.route('**/rest/v1/client_requests*', async (r) => {
    const m = r.request().method()
    if (m === 'POST') {
      S.posts += 1
      const body = JSON.parse(r.request().postData() ?? '{}')
      const one = Array.isArray(body) ? body[0] : body
      //  같은 시도 표(request_id)면 두 번째는 서버 색인이 막음 — 그대로 흉내
      if (one.request_id && S.requests.some((x) => x.request_id === one.request_id)) return json(r, { code: '23505', message: 'duplicate key value violates unique constraint "client_requests_request_uniq"' }, 409)
      const row = { id: `dddddddd-4444-4444-8444-${String(S.requests.length + 1).padStart(12, '0')}`, created_at: new Date().toISOString(), ...one }
      S.requests.push(row)
      return json(r, [asRow(row)])
    }
    if (m === 'PATCH') {
      const id = new URL(r.request().url()).searchParams.get('id')?.replace(/^eq\./, '')
      const patch = JSON.parse(r.request().postData() ?? '{}')
      S.patches.push({ id, ...patch })
      const row = S.requests.find((x) => x.id === id)
      if (row) Object.assign(row, patch)
      return json(r, row ? [asRow(row)] : [])
    }
    return json(r, S.requests.map(asRow).slice().reverse())
  })
  await ctx.route('**/rest/v1/ai_calls*', (r) => (r.request().method() === 'GET' ? json(r, S.aiCalls) : json(r, [{ id: 'x' }])))
  await ctx.route('**/rest/v1/experiment_settings*', (r) => json(r, { id: 1, start_date: TODAY }))
  await ctx.route('**/functions/v1/ai-triage', async (r) => {
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 200, body: 'ok' })
    const body = JSON.parse(r.request().postData() ?? '{}')
    //  0142 — 「AI 처리 계획」은 같은 함수의 다른 작업 (요청 분석과 같이 불림)
    if (body.task === 'request_plan') {
      S.planBodies = [...(S.planBodies ?? []), body]
      if (S.planMode === 'old') return json(r, { ok: true, result: RESULT, callId: 'old', logged: true, ms: 900 })   // 옛 서버 — task 를 모름
      if (S.planMode === 'fail') return json(r, { error: '처리 계획에 받은 자료에 없는 숫자(7)가 있어 쓰지 않았습니다', callId: 'pf' }, 502)
      if (S.planMode === 'slow') await new Promise((res) => setTimeout(res, 2500))
      return json(r, { ok: true, task: 'request_plan', result: { ...PLAN, model: 'test-model' }, callId: 'p1', logged: true, ms: 1400 })
    }
    //  업무 보조 AI (브리핑 · 메모 · 독촉) — S.assistMode 'old' 면 옛 서버처럼 task 를 모름
    if (body.task && S.assistMode === 'old') return json(r, { ok: true, result: RESULT, callId: 'old', logged: true, ms: 900 })
    if (body.task === 'briefing') return json(r, { ok: true, task: 'briefing', result: { headline: '오늘은 긴급 요청부터.', items: [{ title: '긴급 요청 확인', detail: '처리 전 긴급 건부터', when: '지금', go: '요청함' }, { title: '남은 방문', detail: '오후 일정 확인', when: '오후', go: '오늘 일정' }], note: '', model: 'test-model' }, callId: 'b1', logged: true, ms: 1300 })
    if (body.task === 'field_note') return json(r, { ok: true, task: 'field_note', result: { summary: '85kg 수거 · 용기 파손', issues: ['용기 교체 필요'], followups: [{ kind: '추가수거', text: '다음주 추가수거 희망' }], cleaned: '용기 일부 파손(교체 필요). 다음주 추가수거 희망.', fill: { amountKg: 85, containers: [{ label: '합성수지 전용용기', qty: 6 }], supplied: [{ item: '63L 박스', qty: 5 }], handover: '인계 대기' }, model: 'test-model' }, callId: 'f1', logged: true, ms: 1300 })
    if (body.task === 'dunning') return json(r, { ok: true, task: 'dunning', result: { message: '{병원명} 담당자님, 비원미래입니다. 청구 금액 {금액}이 아직 확인되지 않아 안내드립니다.', model: 'test-model' }, callId: 'd1', logged: true, ms: 1300 })
    if (body.task) return json(r, { error: `모르는 작업 ${body.task}` }, 400)
    if (S.aiMode === 'slow') await new Promise((res) => setTimeout(res, 3000))
    if (S.aiMode === 'down') return r.abort('connectionrefused')
    S.lastAiBody = body
    if (S.aiMode === 'fail') return json(r, { ok: false, error: 'AI 키가 올바르지 않습니다 (401) — invalid x-api-key', callId: 'c-fail' }, 502)
    S.aiCalls.push({ id: `a${S.aiCalls.length + 1}`, kind: 'request_triage_demo', request_id: body.requestId, ok: true, error: '', ms: 1800, model: 'test-model', actor_name: '대표', edited: false, created_at: new Date().toISOString() })
    return json(r, { ok: true, result: RESULT, callId: 'c1', logged: true, ms: 1800 })
  })
  const p = await ctx.newPage()
  const errors = []
  p.on('pageerror', (e) => errors.push(String(e)))
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|status of 4\d\d|status of 5\d\d/.test(m.text())) errors.push(`console: ${m.text().slice(0, 200)}`) })
  await p.addInitScript(([k, u]) => {
    window.localStorage.setItem(k, JSON.stringify({ access_token: 't', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u }))
    window.localStorage.setItem('beonemirae-ops:tour-seen', 'staff,field,client,demo')
  }, ['beonemirae-ops:auth', { id: prof.id, aud: 'authenticated', email: prof.email, app_metadata: {}, user_metadata: {} }])
  await p.goto(`${W.BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await W.settle(p, state)
  await p.waitForTimeout(500)
  return { ctx, p, errors, state, S }
}
const spotOf = (p) => p.evaluate(() => {
  const el = document.querySelector('[data-presenter-spot]')
  return el ? [...el.attributes].map((a) => `${a.name}=${a.value}`).join(' ') + (el.closest('[data-req-focus]') ? ' in-focus' : '') : null
})
const waitSpot = async (p, re, ms = 4000) => {
  const t0 = Date.now(); let s = null
  while (Date.now() - t0 < ms) { s = await spotOf(p); if (s && re.test(s)) return s; await p.waitForTimeout(200) }
  return s
}
const stepNo = async (p) => flat(await p.locator('[data-presenter-card]:visible [data-presenter-stepno]').first().innerText().catch(() => ''))


const CARD = '[data-presenter-card]:visible'
const next = async (p, ms = 1100) => { await p.locator(`${CARD} [data-presenter-next]`).click(); await p.waitForTimeout(ms) }

/** 지금 화면 상태 한 장 — 강조 · 말풍선 · 카드 겹침 */
const frame = (p) => p.evaluate(() => {
  const spot = document.querySelector('[data-presenter-spot]')
  const vis = (el) => { const b = el.getBoundingClientRect(); const st = getComputedStyle(el); return b.width > 2 && b.height > 2 && st.display !== 'none' && st.visibility !== 'hidden' }
  const cards = [...document.querySelectorAll('[data-presenter-card]')].filter(vis)
  const card = cards[0] ?? null
  const bubble = document.querySelector('[data-presenter-bubble]')
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height, r: b.right, b: b.bottom } }
  const S = r(spot), C = r(card), B = r(bubble)
  const overlap = (a, c) => !!a && !!c && a.x < c.r && a.r > c.x && a.y < c.b && a.b > c.y
  return {
    spot: S, card: C, bubble: B,
    spotOnScreen: !!S && S.b > 0 && S.y < innerHeight && S.r > 0 && S.x < innerWidth,
    bubbleOnScreen: !B || (B.y >= -2 && B.b <= innerHeight + 2 && B.x >= -2 && B.r <= innerWidth + 2),
    cardCoversSpot: overlap(S, C),
    cardCount: cards.length,
    hscroll: document.documentElement.scrollWidth > innerWidth + 1,
  }
})

// ═══ ① 9단계 처음부터 끝까지 — 세 가지 폭 ═════════════════════════════════════
//  발표장 프로젝터 해상도까지 — 1280×720 · 1024×768 · 1920×1080 + 큰 글씨 설정
for (const [width, height, font] of [[1440, 900, 'normal'], [1280, 720, 'normal'], [1024, 768, 'normal'], [1920, 1080, 'normal'], [1440, 900, 'large']]) {
  const S = makeShared()
  const { ctx, p, errors } = await open('admin', '/presentation', { width, height, font, S })
  await p.locator('[data-presenter-ai-start]').click()
  await p.waitForURL(/\/requests/, { timeout: 10000 }).catch(() => {})
  await p.waitForTimeout(1200)
  const seen = []
  for (let i = 0; i < AI_ORDER.length; i++) {
    const key = AI_ORDER[i]
    const step = PRESENTER_STEPS.find((s) => s.key === key)
    const no = await stepNo(p)
    ok(new RegExp(`STEP ${i + 1} / ${AI_ORDER.length}`).test(no), `① ${width}×${height}${font === 'large' ? ' 큰 글씨' : ''} · ${key} — STEP ${i + 1} / ${AI_ORDER.length}`, no)
    const path = new URL(p.url()).pathname
    ok(step.routes({ clientId: S.clients.find((c) => c.is_demo_generated)?.id ?? null, demoRequestId: null }).some((r) => r === path) || key === 'portal',
      `① ${width}×${height}${font === 'large' ? ' 큰 글씨' : ''} · ${key} — 그 단계 화면 (${path})`)
    //  1단계 — 회신 창 열고 AI 까지
    if (key === 'triage') {
      await p.locator('[data-req-focus] [data-presenter="reply-open"]').first().click()
      await p.locator('[role="dialog"] [data-ai-triage-run]').click()
      await p.locator('[role="dialog"] [data-ai-plan-result]').waitFor({ state: 'visible', timeout: 10000 }).catch(() => {})
      await p.waitForTimeout(900)
    }
    const f = await frame(p)
    seen.push(`${key}:${f.spot ? 'spot' : '-'}`)
    ok(f.cardCount === 1, `① ${width}×${height}${font === 'large' ? ' 큰 글씨' : ''} · ${key} — 안내 카드 하나`, String(f.cardCount))
    if (f.spot && !['close', 'roadmap'].includes(key)) {
      ok(f.spotOnScreen && f.bubbleOnScreen, `① ${width}×${height}${font === 'large' ? ' 큰 글씨' : ''} · ${key} — 강조 · 말풍선이 화면 안`, JSON.stringify({ s: f.spot, b: f.bubble }))
      ok(!f.cardCoversSpot, `① ${width}×${height}${font === 'large' ? ' 큰 글씨' : ''} · ${key} — 안내 카드가 강조한 곳을 가리지 않음`, JSON.stringify({ s: f.spot, c: f.card }))
    }
    if (f.bubble && f.spot) {
      //  말풍선은 강조한 것 바로 옆/위/아래 (멀리 떨어져 있지 않음)
      const near = Math.abs((f.bubble.y + f.bubble.b) / 2 - (f.spot.y + f.spot.b) / 2) < 140 || Math.abs(f.bubble.b - f.spot.y) < 90 || Math.abs(f.bubble.y - f.spot.b) < 90
      ok(near, `① ${width}×${height}${font === 'large' ? ' 큰 글씨' : ''} · ${key} — 말풍선이 강조한 단추 곁에`, JSON.stringify({ s: f.spot, b: f.bubble }))
    }
    ok(!f.hscroll, `① ${width}×${height}${font === 'large' ? ' 큰 글씨' : ''} · ${key} — 가로 스크롤 없음`)
    if (key === 'triage') { await p.keyboard.press('Escape').catch(() => {}); await p.waitForTimeout(300) }
    if (i < AI_ORDER.length - 1) await next(p)
  }
  ok((await p.locator(`${CARD} [data-presenter-finish]`).count()) === 1, `① ${width}×${height}${font === 'large' ? ' 큰 글씨' : ''} — 마지막 단계는 「발표 가이드 종료」`)
  ok(errors.length === 0, `① ${width}×${height}${font === 'large' ? ' 큰 글씨' : ''} — 9단계 내내 화면 오류 0 (페이지 · 콘솔)`, errors.slice(0, 3).join(' | '))
  await ctx.close()
}

// ═══ ⑦ AI 가 도는 다른 단계 — 브리핑 · 메모 칸 채우기 · 독촉 문구 (옛 서버 포함) ═══════════
for (const assistMode of ['ok', 'old']) {
  const S = { ...makeShared(), assistMode }
  const { ctx, p, errors, state } = await open('admin', '/presentation', { S })
  await p.locator('[data-presenter-ai-start]').click()
  await p.waitForURL(/\/requests/, { timeout: 10000 }).catch(() => {})
  await p.waitForTimeout(900)
  await next(p); await next(p)   // → STEP 3 대시보드
  const tag = `⑦ ${assistMode === 'ok' ? '' : '옛 서버 · '}`
  await p.locator('[data-ai-assist-run="briefing"]').click()
  await p.waitForFunction(() => !document.querySelector('[data-ai-assist="briefing"] [data-ai-assist-busy]'), null, { timeout: 10000 }).catch(() => {})
  await p.waitForTimeout(400)
  if (assistMode === 'ok') ok((await p.locator('[data-ai-briefing-item]').count()) === 2 && (await p.locator('[data-ai-briefing-go="요청함"]').count()) === 1, `${tag}STEP 3 브리핑 — 할 일 · 화면 단추`)
  else ok(/서버 코드를 새 판으로/.test(flat(await p.locator('[data-ai-assist="briefing"] [data-ai-assist-error]').innerText().catch(() => ''))), `${tag}STEP 3 브리핑 — 「서버 코드를 새 판으로」 까닭 그대로`)
  await next(p)   // → STEP 4 수거 입력
  ok(new URL(p.url()).pathname === '/collection', `${tag}STEP 4 수거 입력`, p.url())
  const fold = p.locator('[data-fold="memo"]').first()
  if (await fold.count()) await fold.click().catch(() => {})
  await p.waitForTimeout(300)
  await p.locator('textarea[placeholder="현장 특이사항을 입력하세요 (선택)"]').fill('오늘 85kg 수거함. 합성수지 용기 6개 가져옴. 63L 박스 5개 두고 옴. 용기 2개 깨져서 교체 필요. 처리장 인계는 내일')
  const writes0 = state.writes.length
  await p.locator('[data-ai-assist-run="field_note"]').click()
  await p.waitForFunction(() => !document.querySelector('[data-ai-assist="field_note"] [data-ai-assist-busy]'), null, { timeout: 10000 }).catch(() => {})
  await p.waitForTimeout(500)
  if (assistMode === 'ok') {
    ok(/ai-field-fill-apply/.test((await waitSpot(p, /ai-field-fill-apply/)) ?? ''), `${tag}STEP 4 — 강조가 「수거 입력 칸에 채우기」로`)
    await p.locator('[data-ai-field-fill-apply]').click()
    await p.waitForTimeout(400)
    ok((await p.locator('#collection-amount').inputValue()) === '85' && state.writes.length === writes0, `${tag}STEP 4 — 칸만 채움 (저장 안 함)`)
    //  시연 거래처가 미리 골라져 있음 (실제 병원에 시연 기록이 남지 않게)
    const sel = await p.locator('select').evaluateAll((els) => els.map((e) => e.selectedOptions?.[0]?.textContent ?? '').join(' | '))
    ok(/시연용 병원/.test(sel) || /시연용 병원/.test(flat(await p.locator('main').innerText())), `${tag}STEP 4 — 시연 거래처가 미리 골라져 있음`, sel.slice(0, 120))
  } else {
    ok(/서버 코드를 새 판으로/.test(flat(await p.locator('[data-ai-assist="field_note"] [data-ai-assist-error]').innerText().catch(() => ''))), `${tag}STEP 4 — 까닭 그대로 · 칸은 그대로`)
    ok((await p.locator('#collection-amount').inputValue()) === '', `${tag}STEP 4 — 실패하면 칸을 건드리지 않음`)
  }
  await next(p)   // → STEP 5 포털
  await next(p)   // → STEP 6 미수금
  ok(new URL(p.url()).pathname === '/receivables' && /STEP 6/.test(await stepNo(p)), `${tag}STEP 6 미수금`, p.url())
  const row = p.locator('[data-dunning-row]').first()
  if (await row.count()) {
    await row.locator('[data-dunning-msg]').click()
    await p.locator('[data-ai-assist-run="dunning"]').click()
    await p.waitForFunction(() => !document.querySelector('[data-ai-assist="dunning"] [data-ai-assist-busy]'), null, { timeout: 10000 }).catch(() => {})
    await p.waitForTimeout(400)
    const txt = await p.locator('[data-dunning-text]').inputValue().catch(() => '')
    if (assistMode === 'ok') ok(!/\{병원명\}|\{금액\}/.test(txt) && /○/.test(txt), `${tag}STEP 6 — 문구에 이름(가림) · 금액이 채워짐`, txt.slice(0, 80))
    else ok(/서버 코드를 새 판으로/.test(flat(await p.locator('[data-ai-assist="dunning"] [data-ai-assist-error]').innerText().catch(() => ''))) && txt.length > 0, `${tag}STEP 6 — 까닭 그대로 · 원래 문구는 그대로`)
    await p.keyboard.press('Escape').catch(() => {})
    await p.waitForTimeout(300)
  } else ok(false, `${tag}STEP 6 — 독촉 대상 줄이 있음`)
  await next(p)
  ok(/STEP 7/.test(await stepNo(p)), `${tag}AI 결과와 상관없이 다음 단계로`, await stepNo(p))
  ok(errors.length === 0, `${tag}화면 오류 0`, errors.slice(0, 3).join(' | '))
  await ctx.close()
}

// ═══ ② 단계마다 새로고침 ═══════════════════════════════════════════════════════
{
  const S = makeShared()
  const { ctx, p, errors } = await open('admin', '/presentation', { S })
  await p.locator('[data-presenter-ai-start]').click()
  await p.waitForURL(/\/requests/, { timeout: 10000 }).catch(() => {})
  await p.waitForTimeout(1000)
  const bad = []
  for (let i = 0; i < AI_ORDER.length; i++) {
    const before = await stepNo(p)
    const url = p.url()
    await p.reload({ waitUntil: 'domcontentloaded' })
    await W.settle(p, { reqs: 0 }, 400, 8000).catch(() => {})
    await p.waitForTimeout(900)
    const after = await stepNo(p)
    if (after !== before || p.url() !== url) bad.push(`${AI_ORDER[i]}: ${before} → ${after} · ${url} → ${p.url()}`)
    if (i < AI_ORDER.length - 1) await next(p)
  }
  ok(bad.length === 0, '② 아홉 단계 모두 새로고침해도 같은 단계 · 같은 화면', bad.join(' | '))
  ok(errors.length === 0, '② 화면 오류 0', errors.slice(0, 3).join(' | '))
  await ctx.close()
}

// ═══ ③ 뒤로 가기 · 엉뚱한 화면 ════════════════════════════════════════════════
{
  const S = makeShared()
  const { ctx, p, errors } = await open('admin', '/presentation', { S })
  await p.locator('[data-presenter-ai-start]').click()
  await p.waitForURL(/\/requests/, { timeout: 10000 }).catch(() => {})
  await p.waitForTimeout(900)
  await next(p)   // STEP 2 회신
  await next(p)   // STEP 3 대시보드
  const no3 = await stepNo(p)
  await p.goBack()
  await p.waitForTimeout(1000)
  const back = await p.locator(`${CARD} [data-presenter-offroute]`).count()
  ok(/STEP 3/.test(await stepNo(p)) && back === 1, '③ 뒤로 가기 — 단계는 그대로(STEP 3) · 「이 단계 화면으로 돌아가기」', `${no3} → ${await stepNo(p)} · 돌아가기 ${back}`)
  if (back) {
    await p.locator(`${CARD} [data-presenter-offroute]`).click()
    await p.waitForTimeout(1000)
    ok(new URL(p.url()).pathname === '/', '③ 「돌아가기」 → 대시보드(STEP 3 화면)', p.url())
  }
  //  메뉴로 엉뚱한 화면에 가도 같은 안내
  await p.goto(`${W.BASE}/settings`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(1200)
  ok((await p.locator(`${CARD} [data-presenter-offroute]`).count()) === 1 && (await p.locator('[data-presenter-spot]').count()) === 0, '③ 다른 화면 — 강조 없이 「돌아가기」만')
  ok(errors.length === 0, '③ 화면 오류 0', errors.slice(0, 3).join(' | '))
  await ctx.close()
}

// ═══ ④ AI 가 느림 · 실패 · 못 닿음 · 처리 계획만 실패 · 옛 서버 ══════════════════
for (const [mode, planMode, expect] of [
  ['slow', 'ok', 'result'],
  ['fail', 'ok', 'error'],
  ['down', 'ok', 'error'],
  ['ok', 'fail', 'plan-error'],
  ['ok', 'old', 'plan-old'],
  ['ok', 'slow', 'result'],
]) {
  const S = { ...makeShared(), aiMode: mode, planMode }
  const { ctx, p, errors } = await open('admin', '/presentation', { S })
  await p.locator('[data-presenter-ai-start]').click()
  await p.waitForURL(/\/requests/, { timeout: 10000 }).catch(() => {})
  await p.waitForTimeout(900)
  await p.locator('[data-req-focus] [data-presenter="reply-open"]').first().click()
  const run = p.locator('[role="dialog"] [data-ai-triage-run]')
  await run.click()
  //  눌린 동안 — 「분석 중」 · 단추 잠김 (두 번 못 누름)
  const busyShown = await p.locator('[role="dialog"] [data-ai-triage-busy]').waitFor({ state: 'visible', timeout: 1500 }).then(() => true).catch(() => false)
  const tag = `④ AI ${mode} · 계획 ${planMode}`
  if (mode === 'slow') ok(busyShown && await run.isDisabled(), `${tag} — 기다리는 동안 「AI가 읽고 있습니다」 · 단추 잠김`)
  await p.waitForFunction(() => !document.querySelector('[role="dialog"] [data-ai-triage-busy]') && !document.querySelector('[role="dialog"] [data-ai-plan-busy]'), null, { timeout: 15000 }).catch(() => {})
  await p.waitForTimeout(400)
  const dlg = p.locator('[role="dialog"]')
  if (expect === 'result') {
    ok((await dlg.locator('[data-ai-triage-result]').count()) === 1 && (await dlg.locator('[data-ai-plan-result]').count()) === 1, `${tag} — 분석 · 처리 계획 모두 나옴`)
    //  0143 — 어느 쪽이 먼저 와도 강조(「초안 사용」)와 분석 제목이 화면 안
    await p.waitForTimeout(1200)
    const f = await frame(p)
    ok(f.spot && f.spotOnScreen && f.bubbleOnScreen, `${tag} — 강조한 「초안 사용」이 화면 안`, JSON.stringify({ s: f.spot, b: f.bubble }))
    const badge = await p.locator('[role="dialog"] [data-ai-human-badge]').boundingBox()
    ok(badge && badge.y > 0, `${tag} — 분석 제목(「AI 제안 → 담당자 최종 확인」)도 화면 안`, JSON.stringify(badge))
  } else if (expect === 'error') {
    const t = flat(await dlg.locator('[data-ai-triage-error]').innerText().catch(() => ''))
    ok(/불러오지 못했습니다/.test(t) && /까닭/.test(t) && (await dlg.locator('[data-ai-triage-result]').count()) === 0, `${tag} — 까닭을 그대로 · 결과를 지어내지 않음`, t)
    ok(/다시 시도/.test(flat(await run.innerText())) && !(await run.isDisabled()), `${tag} — 「다시 시도」로 바로 다시 누를 수 있음`)
  } else if (expect === 'plan-error') {
    ok((await dlg.locator('[data-ai-triage-result]').count()) === 1, `${tag} — 분석 결과는 그대로 나옴`)
    const t = flat(await dlg.locator('[data-ai-plan-error]').innerText().catch(() => ''))
    ok(/처리 계획을 받지 못했습니다/.test(t) && /없는 숫자/.test(t), `${tag} — 처리 계획 칸만 까닭과 함께 실패`, t)
  } else if (expect === 'plan-old') {
    //  0143 — 서버가 옛 판이면 발표 중엔 처리 계획 칸을 아예 숨김 (빨간 실패 칸 없음)
    ok((await dlg.locator('[data-ai-triage-result]').count()) === 1 && (await dlg.locator('[data-ai-plan-error], [data-ai-plan-old], [data-ai-plan]').count()) === 0,
      `${tag} — 분석 결과는 그대로 · 발표 중엔 「옛 서버」 칸을 숨김`)
  }
  //  0143 — 대표님: 「초안 사용 눌러도 반응 없다」 → 누르면 회신 칸으로 화면이 옮겨지고 칸이 보임
  if (expect !== 'error') {
    await dlg.locator('[data-ai-use-draft]').click()
    await p.waitForTimeout(900)
    const box = await p.locator('#reply-text').evaluate((el) => { const r = el.getBoundingClientRect(); return { y: r.top, b: r.bottom, h: innerHeight, v: el.value } })
    ok(box.v === RESULT.draft && box.y >= 0 && box.b <= box.h, `${tag} — 「초안 사용」 → 회신 칸에 들어가고 화면에 보임`, JSON.stringify(box).slice(0, 160))
    ok(/회신 칸에 넣었습니다/.test(flat(await dlg.locator('[data-ai-use-draft]').innerText())), `${tag} — 단추 글이 「회신 칸에 넣었습니다」로 바뀜`)
  }
  //  어떤 경우든 다음 단계로 넘어갈 수 있어야 함
  await p.keyboard.press('Escape').catch(() => {})
  await p.waitForTimeout(300)
  await next(p)
  ok(/STEP 2 \/ 9/.test(await stepNo(p)), `${tag} — 그대로 다음 단계로`, await stepNo(p))
  ok(errors.length === 0, `${tag} — 화면 오류 0`, errors.slice(0, 3).join(' | '))
  await ctx.close()
}

// ═══ ⑤ 지난 시연에서 처리 완료한 요청만 남아 있으면 ══════════════════════════════
{
  const S = makeShared()
  const DEMO = '0e140000-0000-4000-8000-0000000000d0'
  S.clients.push({ ...F.clients[0], id: DEMO, name: '시연용 병원 (신보 발표)', address: '', phone: '', is_demo_generated: true, note: 'AI 시연용', active: true })
  S.requests.push({ id: 'dddddddd-4444-4444-8444-000000000099', client_id: DEMO, kind: '긴급수거', content: SAMPLE_REQUEST, urgent: true, status: '처리 완료', source: 'portal', reply: '지난 시연 회신', created_at: new Date(Date.now() - 86400000).toISOString() })
  const { ctx, p, errors } = await open('admin', '/presentation', { S })
  await p.locator('[data-presenter-ai-start]').click()
  await p.waitForURL(/\/requests/, { timeout: 10000 }).catch(() => {})
  await p.waitForTimeout(1200)
  const focus = new URL(p.url()).searchParams.get('focus')
  ok(S.creates === 0 && S.posts === 1 && focus && focus !== 'dddddddd-4444-4444-8444-000000000099', '⑤ 있던 시연 병원은 그대로 · 처리 완료 요청 대신 새 시연 요청 하나', `create ${S.creates} · post ${S.posts} · focus ${focus}`)
  ok((await p.locator('[data-req-focus]').count()) === 1 && !/지난 시연 회신/.test(flat(await p.locator('[data-req-focus]').innerText())), '⑤ 화면에는 새 시연 요청만 (지난 것과 섞이지 않음)')
  ok(errors.length === 0, '⑤ 화면 오류 0', errors.slice(0, 3).join(' | '))
  await ctx.close()
}

// ═══ ⑧ 지난 연습 흔적 — 다음 시연 중에도 안 보이고, 끝내면 이번 것도 안 보임 (0143) ═════════
{
  const S = makeShared()
  const DEMO = '0e140000-0000-4000-8000-0000000000d0'
  const ago = (h) => new Date(Date.now() - h * 3600_000).toISOString()
  S.clients.push({ ...F.clients[0], id: DEMO, name: '시연용 병원 (신보 발표)', address: '', phone: '', is_demo_generated: true, note: 'AI 시연용', active: true })
  //  지난 연습: 포털에서 넣어 본 긴급수거 · 회신까지 한 시연 요청
  S.requests.push({ id: 'dddddddd-4444-4444-8444-000000000081', client_id: DEMO, kind: '긴급수거', content: '희망 시점: 가능한 가장 빠르게 (지난 연습)', urgent: true, status: '접수', source: 'portal', reply: '', created_at: ago(8) })
  S.requests.push({ id: 'dddddddd-4444-4444-8444-000000000082', client_id: DEMO, kind: '긴급수거', content: SAMPLE_REQUEST, urgent: true, status: '확인 중', source: 'portal', reply: '지난 연습 회신', created_at: ago(12) })
  const { ctx, p, errors } = await open('admin', '/presentation', { S })
  await p.evaluate(([cid]) => localStorage.setItem('beonemirae-ops:collect-draft:test', JSON.stringify({ v: 1, clientId: cid, amount: '85', memo: '지난 연습 메모' })), [DEMO])
  await p.locator('[data-presenter-ai-start]').click()
  await p.waitForURL(/\/requests/, { timeout: 10000 }).catch(() => {})
  await p.waitForTimeout(1200)
  const draftGone = await p.evaluate(() => localStorage.getItem('beonemirae-ops:collect-draft:test') === null)
  ok(draftGone, '⑧ 시작하면 시연 병원의 적다 만 수거 입력(이 기기)도 지움')
  //  병원 화면(포털) — 지난 연습 요청 · 회신 없이 이번 시연 요청만
  await p.goto(`${W.BASE}/portal/c/${DEMO}/requests`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(1500)
  const portal = flat(await p.locator('main').innerText().catch(() => ''))
  ok(!/지난 연습/.test(portal) && portal.includes(SAMPLE_REQUEST.slice(0, 12)), '⑧ 시연 중 병원 화면 — 지난 연습 요청 · 회신 없이 이번 시연 요청만', portal.slice(0, 200))
  //  이번 시연에서 포털로 하나 넣은 것처럼 (지금 시각)
  S.requests.push({ id: 'dddddddd-4444-4444-8444-000000000083', client_id: DEMO, kind: '긴급수거', content: '이번 시연에서 넣은 요청', urgent: true, status: '접수', source: 'portal', reply: '', created_at: new Date().toISOString() })
  await p.reload({ waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(1500)
  ok(/이번 시연에서 넣은 요청/.test(flat(await p.locator('main').innerText().catch(() => ''))), '⑧ 이번 시연에서 한 것은 시연 중에 그대로 보임')
  //  끝내면 — 업무 화면 어디에도 없음
  await p.goto(`${W.BASE}/requests`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(1200)
  await p.locator(`${CARD} [data-presenter-stop]`).click()
  await p.locator(`${CARD} [data-presenter-stop-yes]`).click()
  await p.waitForTimeout(800)
  const after = flat(await p.locator('main').innerText().catch(() => ''))
  ok(!/이번 시연에서 넣은 요청|지난 연습|시연용 병원/.test(after) && !after.includes(SAMPLE_REQUEST.slice(0, 12)), '⑧ 시연을 끝내면 이번 시연 기록까지 업무 화면에서 사라짐', after.slice(0, 200))
  ok(errors.length === 0, '⑧ 화면 오류 0', errors.slice(0, 3).join(' | '))
  await ctx.close()
}

// ═══ ⑥ 중간에 끝내고 다시 시작 ═══════════════════════════════════════════════
{
  const S = makeShared()
  const { ctx, p, errors } = await open('admin', '/presentation', { S })
  await p.locator('[data-presenter-ai-start]').click()
  await p.waitForURL(/\/requests/, { timeout: 10000 }).catch(() => {})
  await p.waitForTimeout(900)
  await next(p); await next(p); await next(p)
  ok(/STEP 4/.test(await stepNo(p)), '⑥ STEP 4 까지 감')
  await p.locator(`${CARD} [data-presenter-stop]`).click()
  await p.locator(`${CARD} [data-presenter-stop-yes]`).click()
  await p.waitForTimeout(500)
  ok((await p.locator('[data-presenter-card]').count()) === 0, '⑥ 끝내면 카드 없음')
  await p.goto(`${W.BASE}/presentation`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(1200)
  await p.locator('[data-presenter-ai-start]').click()
  await p.waitForURL(/\/requests/, { timeout: 10000 }).catch(() => {})
  await p.waitForTimeout(1000)
  ok(/STEP 1 \/ 9/.test(await stepNo(p)) && (await p.locator('[data-presenter-card]:visible').count()) === 1, '⑥ 다시 시작하면 STEP 1 부터 · 카드 하나', await stepNo(p))
  ok(S.posts === 2, '⑥ 다시 시작하면 새 시연 요청 (지난 시연 흔적 없이 · 0143)', String(S.posts))
  //  전체 흐름으로도 시작 → 대시보드부터
  await p.locator(`${CARD} [data-presenter-stop]`).click()
  await p.locator(`${CARD} [data-presenter-stop-yes]`).click()
  await p.goto(`${W.BASE}/presentation`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(1200)
  await p.locator('[data-presenter-start]').click()
  await p.waitForTimeout(1200)
  //  전체 흐름은 시작 화면(번호 없음) → 「시연 시작」 → STEP 1 대시보드
  await next(p, 1300)
  ok(/STEP 1 \/ 9/.test(await stepNo(p)) && new URL(p.url()).pathname === '/', '⑥ 「전체 운영 흐름 시연」 → 「시연 시작」 → STEP 1 · 대시보드', `${await stepNo(p)} ${p.url()}`)
  ok(errors.length === 0, '⑥ 화면 오류 0', errors.slice(0, 3).join(' | '))
  await ctx.close()
}

await b.close()
console.log(`\ncheck_demo_stress143 OK=${pass} FAIL=${fail}`)
if (fail) process.exitCode = 1
