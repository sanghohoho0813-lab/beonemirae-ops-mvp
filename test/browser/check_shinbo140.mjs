import { chromium, EXEC } from './_pw.mjs'
import * as W from './walk_lib.mjs'
import * as F from './perf_fixtures.mjs'
import { SAMPLE_REQUEST, PRESENTER_STEPS } from '../../src/lib/presenter.ts'

// ─────────────────────────────────────────────────────────────────────────────
//  신보 발표 시연 (0140) — 내일 실제로 누를 순서 그대로
//
//   사이드바 「신보 발표 시연」 → /presentation 첫 화면 → 「AI 요청 분석 시연 시작」
//   → 시연 요청 준비(없으면 시연용 거래처 안에 하나만 · 두 번 눌러도 하나) → 요청함의 그 요청
//   → 「회신 남기기」 → 「AI 분석 실행」 → 결과(유형 · 긴급도 · 요약 · 핵심 · 초안 · 근거 ·
//   「AI 제안 → 담당자 최종 확인」) → 「초안 사용」 → 담당자가 고쳐 저장 → 「전체 운영 흐름 계속 보기」
//   · 「AI 연결 확인」 성공 · 실패 까닭 · 대시보드 · 오늘 일정 · 수거 입력 · 거래처 정상 · 폰 폭
//
//  ⚠ 여기서 AI 자리는 시험용 응답입니다 — 「외부 AI 가 실제로 답했다」는 이 검사가 증명하지
//    않습니다. 그것은 키 등록 · 배포 뒤 「AI 연결 확인」 단추로 합니다(같은 단추를 여기서 시험).
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

async function open(role, path, { width = 1440, S = makeShared() } = {}) {
  const prof = { ...W.profileFor(role), font_scale: 'normal' }
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
  const ctx = await b.newContext({ viewport: { width, height: width < 700 ? 844 : 900 }, isMobile: width < 700, hasTouch: width < 700, timezoneId: 'Asia/Seoul' })
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
      return json(r, { ok: true, task: 'request_plan', result: { ...PLAN, model: 'test-model' }, callId: 'p1', logged: true, ms: 1400 })
    }
    S.lastAiBody = body
    if (S.aiMode === 'fail') return json(r, { ok: false, error: 'AI 키가 올바르지 않습니다 (401) — invalid x-api-key', callId: 'c-fail' }, 502)
    S.aiCalls.push({ id: `a${S.aiCalls.length + 1}`, kind: 'request_triage_demo', request_id: body.requestId, ok: true, error: '', ms: 1800, model: 'test-model', actor_name: '대표', edited: false, created_at: new Date().toISOString() })
    return json(r, { ok: true, result: RESULT, callId: 'c1', logged: true, ms: 1800 })
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

// ═══ ① ~ ⑩ PC — 내일 누를 순서 그대로 ════════════════════════════════════════
const S = makeShared()
{
  const { ctx, p, errors } = await open('admin', '/', { S })
  //  사이드바 — 「오늘 업무」 맨 아래 「신보 발표 시연」 하나 (같은 주소 두 자리 없음)
  await shot(p, '00_sidebar')
  const side = p.locator('aside a[href="/presentation"]')
  ok((await side.count()) === 1, '② 사이드바에 /presentation 링크는 하나 (심사 시연 중복 없음)', String(await side.count()))
  const sideText = flat(await side.first().innerText())
  ok(/신보 발표 시연/.test(sideText) && /발표용/.test(sideText), '② 메뉴명 「신보 발표 시연」 + 작은 표 「발표용」', sideText)
  const order = await p.evaluate(() => [...document.querySelectorAll('aside a')].map((a) => a.getAttribute('href')))
  const iClients = order.indexOf('/clients'), iPres = order.indexOf('/presentation')
  ok(iClients >= 0 && iPres === iClients + 1, '② 위치 — 「오늘 업무」의 거래처 바로 아래', order.slice(0, 6).join(','))
  await side.first().click()
  await p.waitForURL(/\/presentation$/, { timeout: 8000 }).catch(() => {})
  await p.waitForTimeout(800)
  ok(new URL(p.url()).pathname === '/presentation', '③ 클릭 → /presentation', p.url())

  //  첫 화면 — 라벨 · 제목 · 설명 · 가장 큰 단추 = AI 시연
  const head = flat(await p.locator('[data-presentation]').innerText())
  ok(head.includes('신용보증기금 발표 시연') && head.includes('비원미래 AX 운영시스템') && head.includes('현장의 업무 데이터를 하나로 연결하고, AI가 담당자의 판단과 고객 대응을 보조합니다.'),
    '③ 첫 화면 — 「신용보증기금 발표 시연」 · 「비원미래 AX 운영시스템」 · 한 줄 설명')
  await shot(p, '01_presentation')
  const aiBtn = await p.locator('[data-presenter-ai-start]').boundingBox()
  const fullBtn = await p.locator('[data-presenter-start]').boundingBox()
  ok(aiBtn && fullBtn && aiBtn.height > fullBtn.height && aiBtn.y < fullBtn.y, '③ 가장 눈에 띄는 단추 = 「AI 요청 분석 시연 시작」(크고 위) · 그 아래 「전체 운영 흐름 시연」', JSON.stringify({ aiBtn, fullBtn }))
  ok(/병원이 남긴 요청을 AI가 읽고 요청 유형 · 긴급도 · 핵심 내용 · 회신 초안을 제안합니다/.test(head), '③ AI 단추 아래 설명')
  ok(/병원 요청 AI 분석 담당자 판단 수거 · 운영 데이터 축적/.test(flat(await p.locator('[data-presenter-flow]').innerText())), '③ 전체 운영 흐름 한 줄')
  const st = flat(await p.locator('[data-system-status]').innerText())
  ok(/운영 기능 구현됨/.test(st) && /병원 포털 실증 단계/.test(st) && /AI 요청 분석 외부 AI API 연동/.test(st) && /성과 측정 진행 중/.test(st),
    '③ 현재 시스템 상태 — 네 칸 (AI 는 구현 사실 「외부 AI API 연동」만 · 호출 확인은 「발표 준비」 안에서)', st)
  //  0140 정리 — 이 화면은 발표장 프로젝터에 그대로 켜 둡니다. 준비용 도구 · 문구는 접힌 「발표 준비」 안에만.
  ok((await p.locator('[data-presenter-prep]').count()) === 1 && !(await p.locator('[data-presenter-prep]').evaluate((d) => d.open)), '③ 「발표 준비」 칸은 기본 접힘')
  ok(!/시연 준비 상태|쓰지 않는 말|빠른 연습|확인 전|미검증|가짜|실제 거래처입니다|직접 확인/.test(head), '③ 보이는 화면에 준비용 문구 없음 (점검표 · 표현 가이드 · 연습 · 「확인 전」)', head.slice(0, 200))
  ok((await p.locator('[data-prep-ai-dot]').count()) === 1, '③ AI 호출 성공 기록이 없으면 「발표 준비」 옆에 작은 점 (대표님만 알아봄)')
  //  발표 중에는 내부용 단추 · 준비용 안내를 숨김 (data-presenting) — 업무 화면에서는 그대로
  const hidden = await p.evaluate(() => document.documentElement.hasAttribute('data-presenting')
    && [...document.querySelectorAll('[data-hide-presenting]')].length > 0
    && [...document.querySelectorAll('[data-hide-presenting]')].every((e) => getComputedStyle(e).display === 'none'))
  ok(hidden && !/사용 후기 남기기/.test(flat(await p.locator('body').innerText())), '③ 발표 화면 — 「사용 후기 남기기」 · AX 코치 같은 내부용 칸 숨김')
  ok(!/자동\s*배차|수거량을? 예측|완전 자동/.test(flat(await p.textContent('main'))) || /쓰지 않는 말/.test(flat(await p.textContent('main'))), '③ 금지 표현은 「쓰지 않는 말」 목록에만')

  //  ⑤ AI 시연 시작 — 두 번 눌러도 시연 거래처 하나 · 시연 요청 하나
  await p.locator('[data-presenter-ai-start]').click()
  await p.locator('[data-presenter-ai-start]').click({ timeout: 1500 }).catch(() => {})
  await p.waitForURL(/\/requests\?focus=/, { timeout: 15000 }).catch(() => {})
  await p.waitForTimeout(1500)
  const u = new URL(p.url())
  ok(u.pathname === '/requests' && !!u.searchParams.get('focus'), '⑤ 「AI 요청 분석 시연 시작」 → 요청함의 그 시연 요청으로 바로', p.url())
  ok(S.creates === 1 && S.posts === 1 && S.requests.length === 1, '⑤ 두 번 눌러도 시연용 거래처 1 · 시연 요청 1 (중복 없음)', `create_client ${S.creates} · 요청 넣기 ${S.posts}`)
  const madeClient = S.clients.find((c) => c.id === DEMO_ID)
  ok(madeClient && madeClient.is_demo_generated === true && !madeClient.address && !madeClient.phone && /시연용/.test(madeClient.name),
    '⑤ 시연용 거래처 — 시연 표(isDemoGenerated) · 주소 · 연락처 비움(지어내지 않음)', JSON.stringify(madeClient && { name: madeClient.name, demo: madeClient.is_demo_generated, address: madeClient.address }))
  ok(S.requests[0].client_id === DEMO_ID && S.requests[0].content === SAMPLE_REQUEST && S.requests[0].urgent === true,
    '⑤ 시연 요청 — 시연용 거래처 · 예시 문장 그대로 · 긴급')
  ok(F.clients.every((c) => !S.patches.some((x) => x.id === c.id)), '⑤ 실제 거래처 자료는 고치지 않음')
  await shot(p, '02_requests_focus')
  ok((await p.locator('[data-req-focus]').count()) === 1, '⑥ 그 요청 카드가 테두리로 표시됨')
  ok(/STEP 1 \/ 9/.test(await stepNo(p)) && /AI가 병원 요청을 읽고 업무 판단을 보조합니다/.test(flat(await p.locator('[data-presenter-card]:visible [data-presenter-title]').innerText())),
    '⑧ 안내 카드 — STEP 1 / 9 「AI가 병원 요청을 읽고 업무 판단을 보조합니다」', await stepNo(p))
  ok(/in-focus/.test((await waitSpot(p, /reply-open/)) ?? ''), '⑥ 강조 — 그 시연 요청의 「회신 남기기」')
  const cardText = flat(await p.locator('[data-presenter-card]:visible').innerText())
  const tri0 = PRESENTER_STEPS.find((x) => x.key === 'triage')
  //  0140 정리 — 카드는 「설명(읽을 문장)」 · 「누를 곳」 두 칸만 (글자가 많아 무엇을 읽을지 헷갈리지 않게)
  ok(/설명/.test(cardText) && cardText.includes(tri0.note) && /누를 곳/.test(cardText) && cardText.includes(tri0.todo),
    '⑧ 카드 — 설명(AI가 업무를 대신하는 구조는 아닙니다 …) · 누를 곳(회신 남기기 → AI 분석 실행 → 초안 사용)', cardText.slice(0, 200))
  ok(!cardText.includes(tri0.before) && !tri0.effects.some((x) => cardText.includes(x)) && !/기존|바뀐 방식|기대 효과|구현됨/.test(cardText),
    '⑧ 카드 — 기존 · 바뀐 방식 · 기대 효과 · 상태 표 없음', cardText.slice(0, 200))

  //  ⑦ AI 분석 실행 → ⑧ 결과
  await p.locator('[data-req-focus] [data-presenter="reply-open"]').click()
  await p.locator('[data-ai-triage-run]').click()
  await p.locator('[data-ai-triage-result]').waitFor({ state: 'visible', timeout: 8000 })
  //  시연인지는 서버가 DB(시연용 거래처)로 가립니다 — 브라우저가 보내는 것은 요청 번호뿐
  ok(S.lastAiBody?.requestId === S.requests[0].id && Object.keys(S.lastAiBody ?? {}).join(',') === 'requestId', '⑦ 서버 함수로는 요청 번호만 (글 · 시연 여부는 서버가 DB 에서)', JSON.stringify(S.lastAiBody))
  const ys = await p.evaluate(() => ['[data-ai-kind]', '[data-ai-urgency]', '[data-ai-summary]', '[data-ai-points]', '[data-ai-draft]', '[data-ai-basis]', '[data-ai-human-check]']
    .map((sel) => Math.round(document.querySelector(`[role="dialog"] ${sel}`)?.getBoundingClientRect().top ?? -1)))
  //  0140 — 번호 순서로 한 줄씩: ① 요청 종류 ② 긴급도 ③ AI 요약 ④ 핵심 요구사항 ⑤ AI 회신 초안 → 판단 근거 → 담당자 최종 확인
  ok(ys.every((y) => y >= 0) && ys.every((y, i) => i === 0 || y > ys[i - 1]),
    '⑧ 순서 — ① 요청 종류 → ② 긴급도 → ③ AI 요약 → ④ 핵심 요구사항 → ⑤ AI 회신 초안 → 판단 근거 → 「AI 제안 → 담당자 최종 확인」', ys.join(' < '))
  const meta = flat(await p.locator('[role="dialog"] [data-ai-meta]').innerText())
  ok(/^실제 AI 응답/.test(meta) && /모델 test-model/.test(meta), '⑧ 아래 줄 — 「실제 AI 응답 · 모델 · 초」', meta)
  ok((await p.locator('[data-presenter-bubble]').count()) === 1, '⑧ 눌러야 할 곳 위에 「여기를 누르세요」 말풍선')
  //  0141 — 「갈 수 있는 기사 · 일정표 기준」 (AI 결과 아래 · 일정표 계산)
  ok((await p.locator('[role="dialog"] [data-dispatch-hint]').count()) === 1 && /일정표 기준/.test(flat(await p.locator('[role="dialog"] [data-ai-triage]').innerText())), '⑧ AI 결과 아래 「갈 수 있는 기사 · 일정표 기준」')
  const res = flat(await p.locator('[role="dialog"] [data-ai-triage]').innerText())
  ok(/^AI 요청 분석/.test(res) && /긴급수거/.test(res) && /긴급도 높음/.test(res) && /AI 요약/.test(res) && /핵심 요구사항/.test(res) && /AI 회신 초안/.test(res) && /판단 근거:/.test(res),
    '⑧ 제목 「AI 요청 분석」 · 표 「긴급수거」 「긴급도 높음」 · 칸 이름', res.slice(0, 120))
  const disc = flat(await p.locator('[role="dialog"] [data-ai-disclaimer]').innerText())
  ok(/AI 제안 → 담당자 최종 확인/.test(disc) && /AI는 초안을 제안하며, 최종 판단과 회신은 담당자가 수행합니다/.test(disc), '⑧ 「AI 제안 → 담당자 최종 확인」이 결과 바로 아래에 보임', disc)
  const hb = await p.locator('[role="dialog"] [data-ai-human-badge]').boundingBox()
  ok(hb && hb.y > 0 && hb.y + hb.height < 900 && /AI 제안 → 담당자 최종 확인/.test(flat(await p.locator('[role="dialog"] [data-ai-human-badge]').innerText())),
    '⑧ 창을 내리지 않아도 제목 옆에 「AI 제안 → 담당자 최종 확인」', JSON.stringify(hb))
  ok(S.patches.length === 0, '⑧ AI 결과만으로는 요청 상태 · 회신이 바뀌지 않음 (자동 확정 없음)')
  //  0142 — 처리 계획이 나오면 강조는 「이 회신 쓰기」(일정 · 재고 반영 회신)로
  ok(/ai-plan-use-reply/.test((await waitSpot(p, /ai-plan-use-reply/)) ?? ''), '⑧ 강조가 처리 계획의 「이 회신 쓰기」로')
  //  0142 — AI 처리 계획: 같은 클릭에 이어서 · 차량 · 재고 · 이력 · 처리 순서 · 구체 회신
  await p.locator('[role="dialog"] [data-ai-plan-result]').waitFor({ state: 'visible', timeout: 8000 })
  const planIn = (S.planBodies ?? [])[0]?.input
  ok(!!planIn && planIn.request === SAMPLE_REQUEST && !JSON.stringify(planIn).includes('시연용 병원'), '⑧ AI 처리 계획 — 요청 글 · 시스템 자료만 (병원 이름 없음)', JSON.stringify(planIn ?? {}).slice(0, 120))
  ok((await p.locator('[role="dialog"] [data-ai-plan-stock="63L 박스"]').count()) === 1 && (await p.locator('[role="dialog"] [data-ai-plan-use-reply]').count()) === 1,
    '⑧ AI 처리 계획 — 63L 박스 재고를 화면이 다시 확인 · 「이 회신 쓰기」')
  await shot(p, '03_ai_result')
  await p.locator('[role="dialog"] [data-ai-plan]').scrollIntoViewIfNeeded().catch(() => {})
  await shot(p, '03b_ai_plan')

  //  ⑨ 초안 사용 → ⑩ 담당자가 고쳐 저장
  await p.locator('[data-ai-use-draft]').click()
  ok((await p.locator('#reply-text').inputValue()) === RESULT.draft, '⑨ 「초안 사용」 → 회신 칸에 초안')
  await p.locator('#reply-text').fill(`${RESULT.draft} 내일 오전 중 연락드리겠습니다.`)
  ok(/내일 오전 중 연락드리겠습니다/.test(await p.locator('#reply-text').inputValue()), '⑩ 담당자가 고쳐 쓸 수 있음')
  await p.locator('[data-reply-save]').click()
  await p.waitForTimeout(1200)
  ok(S.patches.some((x) => /내일 오전 중 연락드리겠습니다/.test(x.reply ?? '')), '⑩ 고친 회신이 저장됨 (담당자가 누른 저장)')

  //  ⑨' 「다음」만으로 이어감 (0141 — 「전체 운영 흐름 계속 보기」 단추는 뺌)
  await p.keyboard.press('Escape').catch(() => {})
  ok((await p.locator('[data-presenter-continue]').count()) === 0, '⑨ 「전체 운영 흐름 계속 보기」 단추 없음 (다음만)')
  await p.locator('[data-presenter-card]:visible [data-presenter-next]').click()
  await p.waitForTimeout(1000)
  ok(/STEP 2 \/ 9/.test(await stepNo(p)), '⑨ 다음 → STEP 2 (회신 · 날짜 잡기)', await stepNo(p))
  await p.locator('[data-presenter-card]:visible [data-presenter-next]').click()
  await p.waitForTimeout(1200)
  ok(new URL(p.url()).pathname === '/' && /STEP 3 \/ 9/.test(await stepNo(p)) && /오늘 운영 화면/.test(flat(await p.locator('[data-presenter-card]:visible [data-presenter-title]').innerText())),
    '⑨ → 대시보드(오늘 운영 화면)부터 전체 흐름 이어감', `${p.url()} ${await stepNo(p)}`)
  await p.locator('[data-presenter-card]:visible [data-presenter-next]').click()
  await p.waitForTimeout(1000)
  ok(new URL(p.url()).pathname === '/collection', '⑨ 다음 → 수거 입력', p.url())
  await p.locator('[data-presenter-card]:visible [data-presenter-stop]').click()
  await p.locator('[data-presenter-card]:visible [data-presenter-stop-yes]').click()
  await p.waitForTimeout(500)
  ok((await p.locator('[data-presenter-card]').count()) === 0, '⑨ 끝내면 카드 없음')
  ok(errors.length === 0, '① ~ ⑩ 화면 오류 0', errors.join(' | '))
  await ctx.close()
}

// ═══ ⑤' 다시 시작해도 같은 시연 요청 (새로 안 만듦) · AI 연결 확인 ══════════════
{
  const { ctx, p, errors } = await open('admin', '/presentation', { S })
  ok((await p.locator('[data-ready="ai"]').getAttribute('data-ready-mark')) === 'ok' && (await p.locator('[data-prep-ai-dot]').count()) === 0, '⑤\' 실제 호출 성공 기록이 생기면 「발표 준비」의 AI 칸 ✓ · 점 사라짐')
  const before = { c: S.creates, p: S.posts }
  //  처리 완료 전의 같은 요청이 있으면 그것을 씀
  S.requests[0].status = '확인 중'
  await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1500)
  await p.locator('[data-presenter-ai-start]').click()
  await p.waitForURL(/\/requests\?focus=/, { timeout: 15000 }).catch(() => {})
  ok(S.creates === before.c && S.posts === before.p && new URL(p.url()).searchParams.get('focus') === S.requests[0].id, '⑤\' 다시 눌러도 있던 시연 요청을 씀 (새로 만들지 않음)', `${S.creates}/${S.posts}`)
  await p.goto(`${W.BASE}/presentation`, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1500)
  //  성공 · 실패 까닭 그대로
  await p.locator('[data-presenter-end]').click().catch(() => {})
  await p.locator('[data-presenter-prep] > summary').click()
  await p.locator('[data-ai-check]').click()
  await p.locator('[data-ai-check-result]').waitFor({ timeout: 8000 })
  await p.locator('[data-ai-check-result]').scrollIntoViewIfNeeded().catch(() => {})
  await shot(p, '04_ai_check')
  const okText = flat(await p.locator('[data-ai-check-result]').innerText())
  ok((await p.locator('[data-ai-check-result]').getAttribute('data-ai-check-result')) === 'ok' && /성공 · test-model/.test(okText) && /긴급수거 · 긴급도 높음/.test(okText), '「AI 연결 확인」 성공 — 모델 · 처리시간 · 결과 요약', okText)
  S.aiMode = 'fail'
  await p.locator('[data-ai-check]').click()
  await p.waitForFunction(() => document.querySelector('[data-ai-check-result]')?.getAttribute('data-ai-check-result') === 'fail', null, { timeout: 8000 }).catch(() => {})
  const failText = flat(await p.locator('[data-ai-check-result]').innerText())
  ok(/실패/.test(failText) && /AI 키가 올바르지 않습니다 \(401\)/.test(failText), '「AI 연결 확인」 실패 — 까닭을 그대로 (성공처럼 숨기지 않음)', failText)
  ok(errors.length === 0, '⑤\' 화면 오류 0', errors.join(' | '))
  await ctx.close()
}

// ═══ ⑪ 기존 화면 정상 — 대시보드 · 오늘 일정 · 수거 입력 · 거래처 ═══════════════
for (const path of ['/', '/today', '/collection', '/clients']) {
  const { ctx, p, errors } = await open('admin', path)
  const main = flat(await p.textContent('main').catch(() => ''))
  ok(main.length > 80 && errors.length === 0 && (await p.locator('[data-presenter-card]').count()) === 0, `⑪ ${path} — 정상 · 안내 카드 없음`, errors.join(' | ') || main.slice(0, 60))
  if (path === '/') {
    const back = await p.evaluate(() => !document.documentElement.hasAttribute('data-presenting')
      && [...document.querySelectorAll('[data-hide-presenting]')].some((e) => getComputedStyle(e).display !== 'none'))
    ok(back && /사용 후기 남기기/.test(flat(await p.locator('body').innerText())), '⑪ 발표가 아닐 때는 AX 코치 · 사용 후기 단추 그대로')
  }
  await ctx.close()
}
{
  const { ctx, p } = await open('office', '/')
  ok((await p.locator('aside a[href="/presentation"]').count()) === 0, '⑪ 사무실 계정 사이드바에는 발표 메뉴 없음 (관리자 전용 유지)')
  await ctx.close()
}

// ═══ ⑫ 폰 폭 ═════════════════════════════════════════════════════════════════
{
  const { ctx, p, errors } = await open('admin', '/presentation', { width: 390 })
  await shot(p, '05_m_presentation')
  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  const btn = await p.locator('[data-presenter-ai-start]').boundingBox()
  ok(over <= 0 && btn && btn.x >= 0 && btn.x + btn.width <= 390, '⑫ 폰 — 가로로 안 밀림 · AI 시연 단추가 화면 안', `${over}px · ${JSON.stringify(btn)}`)
  const sys = await p.locator('[data-system-item]').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().right)))
  ok(sys.length === 4 && sys.every((r) => r <= 390), '⑫ 폰 — 시스템 상태 네 칸 화면 안', sys.join(','))
  await p.goto(`${W.BASE}/`, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1500)
  await p.locator('nav.fixed.bottom-0 button:has-text("더보기")').click()
  await p.waitForTimeout(800)
  await shot(p, '06_m_more')
  ok((await p.locator('[data-more-section="more-today"] [data-more-item="/presentation"]').count()) === 1, '⑫ 폰 더보기 맨 위 「신보 발표 시연」')
  ok(errors.length === 0, '⑫ 화면 오류 0', errors.join(' | '))
  await ctx.close()
}

//  문구 — AI 단계에 검증 안 된 숫자 · 과장 없음
{
  const tri = PRESENTER_STEPS.find((s) => s.key === 'triage')
  const all = JSON.stringify(tri)
  ok(!/\d+\s*%|자동\s*배차|완전 자동|예측/.test(all), 'AI 단계 문구 — % · 자동 배차 · 완전 자동화 · 예측 없음')
  ok(tri.note === 'AI가 업무를 대신하는 구조는 아닙니다. 병원 요청을 빠르게 읽고 정리해서 담당자의 판단과 회신을 돕는 방식이며, 최종 결정은 사람이 합니다.', 'AI 단계 발표자 메모 — 요청 문구 그대로')
}

await b.close()
console.log(`\ncheck_shinbo140 OK=${pass} FAIL=${fail}`)
process.exit(fail ? 1 : 0)
