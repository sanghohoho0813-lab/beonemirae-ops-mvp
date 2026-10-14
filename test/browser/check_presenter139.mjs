import { chromium, EXEC } from './_pw.mjs'
import * as W from './walk_lib.mjs'
import * as F from './perf_fixtures.mjs'
import { PRESENTER_STEPS, CLOSING, FLOW, SAMPLE_REQUEST } from '../../src/lib/presenter.ts'

// ─────────────────────────────────────────────────────────────────────────────
//  심사 시연 Presenter Mode (0139)
//
//   ① 시작 화면 — 시작 버튼 · 시연 준비 상태(확인 가능한 것만 자동 ✓) · 시연 순서
//   ② 시작 → 안내 카드 · 단계마다 맞는 화면 · 다음/이전 · 강조(대상 하나)
//   ③ 새로고침해도 그 단계 그대로 · 종료하면 흔적 없음
//   ④ 엉뚱한 화면이면 「이 단계 화면으로」 · 시연 거래처가 없으면 준비 화면으로
//   ⑤ 강조 대상이 없어도 깨지지 않음
//   ⑥ 골든 패스 끝까지 — 병원 요청 → 직원 AI 분석 → 회신 → 병원 확인 → 성과 → 마무리
//   ⑦ 일반 사용 중에는 카드가 없다 · 폰 틀 안에는 없다 · 폰 폭에서는 위 막대 + 시트
//   ⑧ 문구 규칙 — 검증 안 된 % · 과장 표현 · 출처 미확정 숫자 없음
// ─────────────────────────────────────────────────────────────────────────────

let pass = 0
let fail = 0
const ok = (cond, name, detail = '') => {
  if (cond) pass += 1
  else fail += 1
  console.log(`${cond ? ' OK ' : 'FAIL'} | ${name}${detail && !cond ? ` — ${detail}` : ''}`)
}
const flat = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
//  PRESENTER_SHOTS=<폴더> 를 주면 눈으로 볼 화면을 찍어 둡니다
const SHOTS = process.env.PRESENTER_SHOTS
const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: `${SHOTS}/${name}.png` }) }
const b = await chromium.launch({ executablePath: EXEC })
const TODAY = F.TODAY
const C0 = F.clients[0]
const json = (r, v, s = 200) => r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(v) })

const RESULT = {
  kind: '긴급수거', alsoKinds: ['소모품'], urgency: '높음', summary: '폐기물 조기 포화로 빠른 수거와 63L 용기 10개를 요청함.',
  points: ['빠른 수거', '63L 용기 10개'], draft: '요청 확인했습니다. 방문 가능 여부와 용기 준비 여부를 확인한 뒤 안내드리겠습니다.',
  basis: '「빨리 찼다」는 표현이 있어 높음으로 봄.', model: 'test-model',
}

async function open(role, path, { width = 1440, aiCalls = [], clientPick = true, shared = null } = {}) {
  const prof = { ...W.profileFor(role), font_scale: 'normal' }
  const state = { profile: prof, reqs: 0, writes: [], schemaVersion: 106 }
  const ctx = await b.newContext({ viewport: { width, height: width < 700 ? 844 : 900 }, isMobile: width < 700, hasTouch: width < 700, timezoneId: 'Asia/Seoul' })
  W.wire(ctx, state)
  const S = shared ?? { requests: [] }
  const asRow = (x) => ({ status: '접수', source: 'portal', requester_name: '원무과', reply: '', handled_at: null, handled_by: null, snoozed_until: null, snoozed_by_name: '', demo_session_id: null, desired_date: null, urgent: false, updated_at: x.created_at, clients: { name: C0.name }, ...x })
  await ctx.route('**/rest/v1/client_requests*', async (r) => {
    const m = r.request().method()
    if (m === 'POST') {
      const body = JSON.parse(r.request().postData() ?? '{}')
      const one = Array.isArray(body) ? body[0] : body
      const row = { id: `dddddddd-4444-4444-8444-${String(S.requests.length + 1).padStart(12, '0')}`, created_at: new Date().toISOString(), ...one }
      S.requests.push(row)
      return json(r, [asRow(row)])
    }
    if (m === 'PATCH') {
      const id = new URL(r.request().url()).searchParams.get('id')?.replace(/^eq\./, '')
      const row = S.requests.find((x) => x.id === id)
      if (row) Object.assign(row, JSON.parse(r.request().postData() ?? '{}'))
      return json(r, row ? [asRow(row)] : [])
    }
    return json(r, S.requests.map(asRow).slice().reverse())
  })
  await ctx.route('**/rest/v1/ai_calls*', (r) => (r.request().method() === 'GET' ? json(r, aiCalls) : json(r, [])))
  await ctx.route('**/rest/v1/experiment_settings*', (r) => json(r, { id: 1, start_date: TODAY }))
  await ctx.route('**/functions/v1/ai-triage', (r) => (r.request().method() === 'OPTIONS' ? r.fulfill({ status: 200, body: 'ok' }) : json(r, { ok: true, result: RESULT, callId: 'c1', logged: true, ms: 1500 })))
  const p = await ctx.newPage()
  const errors = []
  p.on('pageerror', (e) => errors.push(String(e)))
  await p.addInitScript(([k, u, cid, pick]) => {
    window.localStorage.setItem(k, JSON.stringify({ access_token: 't', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u }))
    window.localStorage.setItem('beonemirae-ops:tour-seen', 'staff,field,client,demo')
    if (pick) window.localStorage.setItem('beonemirae-ops:presenter-client', cid)
  }, ['beonemirae-ops:auth', { id: prof.id, aud: 'authenticated', email: prof.email, app_metadata: {}, user_metadata: {} }, C0.id, clientPick])
  await p.goto(`${W.BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await W.settle(p, state)
  await p.waitForTimeout(500)
  return { ctx, p, errors, state, S }
}
const card = (p) => p.locator('[data-presenter-card]:visible').first()
const stepNo = async (p) => flat(await p.locator('[data-presenter-card]:visible [data-presenter-stepno]').first().innerText().catch(() => ''))
const spotOf = (p) => p.evaluate(() => {
  const el = document.querySelector('[data-presenter-spot]')
  if (!el) return null
  return [...el.attributes].map((a) => `${a.name}=${a.value}`).filter((x) => /^data-(tour|presenter|ai|portal|req|reply|sheet|ir)/.test(x)).join(' ')
})
//  강조한 버튼의 한가운데를 누르면 실제로 그 버튼이 눌리는가 — 안내 카드가 덮고 있으면 실패
const covered = (p) => p.evaluate(() => {
  const el = document.querySelector('[data-presenter-spot]')
  if (!el) return null
  const r = el.getBoundingClientRect()
  const pts = [[0.5, 0.5], [0.15, 0.5], [0.85, 0.5]].map(([fx, fy]) => [r.left + r.width * fx, r.top + r.height * fy])
  const hit = pts.map(([x, y]) => document.elementFromPoint(x, y)).filter(Boolean)
  return hit.some((h) => h.closest('[data-presenter-card]')) ? `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}` : ''
})
const coverIssues = []
const waitSpot = async (p, re, ms = 4000) => {
  const t0 = Date.now()
  let s = null
  while (Date.now() - t0 < ms) {
    s = await spotOf(p)
    if (s && re.test(s)) {
      await p.waitForTimeout(450)   //  카드가 자리를 옮기는 시간(0.35초 간격 확인)
      const c = await covered(p)
      if (c) coverIssues.push(`${s} @ ${c}`)
      return s
    }
    await p.waitForTimeout(200)
  }
  return s
}

// ── ⑦ 일반 사용 중에는 카드가 없다 ─────────────────────────────────────────────
for (const [role, path] of [['admin', '/'], ['admin', '/requests'], ['office', '/requests'], ['admin', `/portal/c/${C0.id}`]]) {
  const { ctx, p } = await open(role, path)
  ok((await p.locator('[data-presenter-card]').count()) === 0 && (await p.locator('[data-presenter-spot]').count()) === 0, `⑦ ${role} ${path} — 시작 전에는 안내 카드 · 강조가 없다`)
  await ctx.close()
}

// ── ⑦ 권한 — 발표 가이드는 관리자만 시작 · 현장 직원 화면에는 카드가 없다 ──────────
{
  const { ctx, p } = await open('office', '/presentation')
  //  권한 문지기(RequireAuth)는 주소를 그대로 두고 그 자리에 「접근 권한이 없는 화면입니다」를 그립니다
  ok(/접근 권한이 없는 화면입니다/.test(flat(await p.textContent('body'))) && (await p.locator('[data-presenter-start]').count()) === 0, '⑦ 사무실 계정은 발표 가이드를 열 수 없다 (관리자 전용 유지)', p.url())
  await ctx.close()
}
for (const role of ['field', 'office']) {
  const { ctx, p } = await open(role, '/')
  await p.evaluate(() => sessionStorage.setItem('beonemirae-ops:presenter', JSON.stringify({ index: 1, clientId: null, at: Date.now() })))
  await p.reload({ waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(1500)
  const n = await p.locator('[data-presenter-card]:visible').count()
  ok(role === 'field' ? n === 0 : n === 1, role === 'field' ? '⑦ 현장 직원 화면에는 진행 기록이 있어도 카드가 없다' : '⑦ 사무실 계정은 진행 중인 시연을 이어 볼 수 있다 (같은 탭)')
  await ctx.close()
}
{
  const { ctx, p } = await open('admin', '/')
  await p.evaluate(() => sessionStorage.setItem('beonemirae-ops:presenter', JSON.stringify({ index: 2, clientId: null, at: Date.now() - 4 * 3600 * 1000 })))
  await p.reload({ waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(1500)
  ok((await p.locator('[data-presenter-card]').count()) === 0, '③ 3시간 지난 진행 기록은 버린다 (다음 날 업무 화면에 카드가 남지 않음)')
  await ctx.close()
}

// ── ① 시작 화면 ───────────────────────────────────────────────────────────────
{
  const { ctx, p, errors } = await open('admin', '/presentation', { aiCalls: [] })
  await shot(p, '00_start')
  ok((await p.locator('[data-presenter-start]').count()) === 1 && /심사 시연 시작/.test(flat(await p.locator('[data-presenter-start]').innerText())), '① 「심사 시연 시작」 단추')
  const flow = flat(await p.locator('[data-presenter-flow]').innerText())
  ok(FLOW.every((f) => flow.includes(f)), '① 오늘 보여드릴 흐름 — 병원 → 요청 → 직원 확인 → AI 업무보조 → 현장 처리 → 운영 데이터 축적', flow)
  const mark = async (k) => p.locator(`[data-ready="${k}"]`).getAttribute('data-ready-mark')
  ok((await mark('admin')) === 'ok' && (await mark('live')) === 'ok' && (await mark('requests')) === 'ok', '① 준비 상태 — 관리자 · 운영 연결 · 요청 화면은 자동 ✓')
  ok((await mark('ai')) === 'todo' && /아직 성공한 호출이 없습니다/.test(flat(await p.locator('[data-ready="ai"]').innerText())), '① AI — 성공 기록이 없으면 ✓ 하지 않는다 (확인 필요)')
  ok((await mark('client')) === 'warn' && /실제 거래처입니다/.test(flat(await p.locator('[data-ready="client"]').innerText())), '① 시연 거래처가 실제 거래처면 주의 (요청 · 기록이 그 병원에 남음)')
  ok((await p.locator('[data-ready-manual]').count()) === 3, '① 화면이 모르는 것은 직접 체크 (인터넷 · 프로젝터 · 새로고침)')
  ok((await p.locator('[data-presenter-jump]').count()) === PRESENTER_STEPS.length, '① 시연 순서 — 단계 목록 · 아무 단계부터 시작 가능')
  ok((await p.locator('[data-demo-tour] [data-tour-start]').count()) === 1, '① 60초 투어는 「빠른 연습」으로 남아 있다')
  const page = flat(await p.textContent('main'))
  ok(!/105\s*톤|49\s*곳|53\s*곳/.test(page) && !/상세 시연 자료/.test(page), '① 출처 미확정 숫자(105톤 · 49곳) · /demo 연결 없음')
  ok(errors.length === 0, '① 화면 오류 0', errors.join(' | '))
  await ctx.close()
}
{
  const { ctx, p } = await open('admin', '/presentation', { aiCalls: [{ id: 'a1', kind: 'request_triage', request_id: null, ok: true, error: '', ms: 1800, model: 'gpt-x', actor_name: '대표', edited: false, created_at: `${TODAY}T01:00:00Z` }] })
  ok((await p.locator('[data-ready="ai"]').getAttribute('data-ready-mark')) === 'ok' && /최근 성공/.test(flat(await p.locator('[data-ready="ai"]').innerText())), '① AI — 실제 성공 기록이 있으면 ✓ (최근 성공 시각 · 모델)')
  //  ai_calls.created_at 은 UTC(01:00Z) — 화면은 한국 시각 10:00 으로
  ok(flat(await p.locator('[data-ready="ai"]').innerText()).includes(`${TODAY.slice(5)} 10:00`), '① AI 최근 성공 시각은 한국 시각으로 (UTC 01:00 → 10:00)', flat(await p.locator('[data-ready="ai"]').innerText()))
  await p.locator('[data-presenter-jump="7"]').click()
  await p.waitForTimeout(800)
  ok((await p.locator('[data-presenter-close]').count()) === 1 && (await p.locator('[data-close-ai-unverified]').count()) === 0, '① AI 성공 기록이 있으면 마무리에 「확인 전」 표시 없음')
  await ctx.close()
}

// ── ② ~ ⑥ 골든 패스 끝까지 (PC) ────────────────────────────────────────────────
{
  const { ctx, p, errors, S } = await open('admin', '/presentation')
  await p.locator('[data-presenter-start]').click()
  await card(p).waitFor({ state: 'visible', timeout: 5000 })
  await shot(p, '01_intro')
  ok(/시작/.test(await stepNo(p)) && /실제 업무 흐름/.test(flat(await p.locator('[data-presenter-card]:visible [data-presenter-title]').innerText())), '② 시작 → 안내 카드 (시작 · 실제 업무 흐름)')
  ok(/data-presenter-flow/.test((await waitSpot(p, /presenter-flow/)) ?? ''), '② 0단계 — 흐름 띠를 강조')
  const cardText = flat(await card(p).innerText())
  ok(/지금 보여드리는 것/.test(cardText) && /지금 할 일/.test(cardText) && /발표자 메모/.test(cardText), '② 카드 — 지금 보여드리는 것 · 지금 할 일 · 발표자 메모')
  ok(!(await p.locator('[data-presenter-note]').evaluate((d) => d.open)), '② 발표자 메모는 기본 접힘')

  //  STEP 1 — 오늘 운영 화면
  await p.locator('[data-presenter-card]:visible [data-presenter-next]').click()
  await p.waitForTimeout(900)
  ok(new URL(p.url()).pathname === '/' && /STEP 1 \/ 7/.test(await stepNo(p)), '② 「시연 시작」 → STEP 1 · 대시보드', `${p.url()} ${await stepNo(p)}`)
  ok(/today-focus|today-board/.test((await waitSpot(p, /today-/)) ?? ''), '② STEP 1 — 오늘 할 일 칸 강조')
  await shot(p, '02_today')
  const c1 = flat(await card(p).innerText())
  ok(/기존/.test(c1) && /바뀐 방식/.test(c1) && /기대 효과/.test(c1) && /구현됨/.test(c1), '② 카드 — 기존 · 바뀐 방식 · 기대 효과 · 상태(구현됨)')

  //  ③ 새로고침해도 그대로
  await p.reload({ waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(1500)
  ok(/STEP 1 \/ 7/.test(await stepNo(p)), '③ 새로고침해도 STEP 1 그대로')

  //  STEP 2 — 수거 입력
  await p.locator('[data-presenter-card]:visible [data-presenter-next]').click()
  await p.waitForTimeout(1200)
  ok(new URL(p.url()).pathname === '/collection' && /STEP 2/.test(await stepNo(p)), '② STEP 2 · /collection')
  ok(/collect-save/.test((await waitSpot(p, /collect-save/)) ?? ''), '② STEP 2 — 저장 단추 강조')
  await shot(p, '03_collect')
  ok(/실제 기록/.test(flat(await card(p).innerText())), '② STEP 2 — 저장은 실제 기록이라고 알린다')

  //  ④ 엉뚱한 화면 → 돌아가기
  await p.goto(`${W.BASE}/stats`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(1500)
  ok((await p.locator('[data-presenter-card]:visible [data-presenter-offroute]').count()) === 1 && (await p.locator('[data-presenter-spot]').count()) === 0, '④ 다른 화면이면 「이 단계 화면이 아닙니다」 · 강조 없음')
  await shot(p, '04_offroute')
  await p.locator('[data-presenter-card]:visible [data-presenter-go]').click()
  await p.waitForTimeout(1000)
  ok(new URL(p.url()).pathname === '/collection', '④ 「이 단계 화면으로」 → /collection 으로 복귀')

  //  이전 · 다음
  await p.locator('[data-presenter-card]:visible [data-presenter-prev]').click()
  await p.waitForTimeout(800)
  ok(new URL(p.url()).pathname === '/' && /STEP 1/.test(await stepNo(p)), '② 「이전」 → STEP 1 · 대시보드')
  await p.locator('[data-presenter-card]:visible [data-presenter-next]').click()
  await p.waitForTimeout(600)
  await p.locator('[data-presenter-card]:visible [data-presenter-next]').click()
  await p.waitForTimeout(1500)

  //  STEP 3 — 병원 포털 (관리자 미리보기)
  ok(new URL(p.url()).pathname === `/portal/c/${C0.id}` && /STEP 3/.test(await stepNo(p)), '② STEP 3 · 병원 화면(관리자 미리보기)', p.url())
  ok(/portal-cta=urgent/.test((await waitSpot(p, /portal-cta/)) ?? ''), '② STEP 3 — 「긴급수거 요청」 강조')
  await shot(p, '05_portal')
  ok(flat(await p.locator('[data-presenter-card]:visible [data-presenter-sample]').innerText()) === SAMPLE_REQUEST, '② STEP 3 — 예시 문장 + 복사 단추')
  ok(/추가 채널/.test(flat(await card(p).innerText())), '② STEP 3 — 포털은 추가 채널 (전화 · 문자도 그대로)')
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: W.BASE })
  await p.locator('[data-presenter-card]:visible [data-presenter-copy]').click()
  await p.waitForTimeout(300)
  const copyLabel = flat(await p.locator('[data-presenter-card]:visible [data-presenter-copy]').innerText())
  const clip = await p.evaluate(() => navigator.clipboard.readText().catch(() => ''))
  ok(/복사됨/.test(copyLabel) && clip === SAMPLE_REQUEST, '② STEP 3 — 「예시 문장 복사」 → 클립보드에 그 문장 · 「복사됨」 표시', `${copyLabel} / ${clip.slice(0, 20)}`)
  await p.locator('[data-portal-cta="urgent"]').click()
  await p.locator('[data-portal-sheet="urgent"]').waitFor({ state: 'visible', timeout: 8000 })
  ok(/req-send/.test((await waitSpot(p, /req-send/)) ?? ''), '② 시트가 열리면 강조가 「요청하기」로 옮겨 간다')
  await shot(p, '06_portal_sheet')
  const side = await card(p).evaluate((el) => el.getBoundingClientRect().left)
  ok(side < 400 && (await card(p).getAttribute('data-presenter-compact')) === '1', '② 시트가 열리면 카드가 짧아져 왼쪽으로 비킨다 (단계 · 지금 할 일 · 이전/다음만)', `${Math.round(side)}px`)
  const navBox = await p.locator('[data-presenter-card]:visible [data-presenter-next]').boundingBox()
  ok(navBox && navBox.y + navBox.height <= 900, '② 「다음 단계」는 늘 화면 안에 보인다', JSON.stringify(navBox))
  await p.locator('[data-choice="reason"] [data-choice-item]').first().click()
  await p.locator('[data-req-memo]').fill(SAMPLE_REQUEST)
  await p.locator('[data-req-send]').click()
  await p.locator('[data-sheet-done]').waitFor({ state: 'visible', timeout: 8000 })
  ok(S.requests.length === 1 && S.requests[0].content.includes('63L 용기도 10개'), '② 병원 요청이 실제로 저장됐다 (안내 카드는 데이터를 만들지 않음 — 화면이 저장)')

  //  STEP 4 — 직원 요청함 + AI
  await p.locator('[data-presenter-card]:visible [data-presenter-next]').click()
  await p.waitForTimeout(1500)
  ok(new URL(p.url()).pathname === '/requests' && /STEP 4/.test(await stepNo(p)), '② STEP 4 · /requests')
  ok(/presenter=reply-open/.test((await waitSpot(p, /reply-open/)) ?? ''), '② STEP 4 — 「회신 남기기」 강조')
  ok((await p.locator('[data-presenter-card]:visible [data-presenter-ai]').getAttribute('data-presenter-ai')) === 'unverified', '② STEP 4 — AI 성공 기록이 없으면 「실제 호출 확인 필요」')
  await p.locator('[data-presenter="reply-open"]').first().click()
  ok(/ai-triage-run/.test((await waitSpot(p, /ai-triage-run/)) ?? ''), '② 회신 창이 열리면 「AI 분석 실행」 강조')
  await p.locator('[data-ai-triage-run]').click()
  await p.locator('[data-ai-triage-result]').waitFor({ state: 'visible', timeout: 8000 })
  await shot(p, '07_ai_result')
  ok(/ai-use-draft/.test((await waitSpot(p, /ai-use-draft/)) ?? ''), '② AI 결과가 나오면 「초안 사용」 강조')
  await p.locator('[data-ai-use-draft]').click()

  //  STEP 5 — 회신 → 병원 확인
  await p.locator('[data-presenter-card]:visible [data-presenter-next]').click()
  await p.waitForTimeout(900)
  ok(/STEP 5/.test(await stepNo(p)) && (await p.locator('[role="dialog"] [data-reply-save]').count()) === 1, '② STEP 5 — 회신 창은 그대로 (다음을 눌러도 쓰던 것이 안 사라짐)')
  await shot(p, '08_reply')
  ok(/reply-save/.test((await waitSpot(p, /reply-save/)) ?? ''), '② STEP 5 — 「회신 저장」 강조')
  await p.locator('#reply-text').fill(`${RESULT.draft} 오늘 중 연락드리겠습니다.`)
  await p.locator('[data-reply-save]').click()
  await p.waitForTimeout(1000)
  ok(/오늘 중 연락드리겠습니다/.test(S.requests[0].reply ?? ''), '② 회신은 담당자가 저장 (실제 저장)')
  await p.locator('[data-presenter-card]:visible [data-presenter-portal-check="portal"]').click()
  await p.waitForTimeout(1500)
  ok(new URL(p.url()).pathname === `/portal/c/${C0.id}/requests` && /STEP 5/.test(await stepNo(p)), '② 「병원 화면에서 확인」 → 병원 요청 내역 (같은 단계)')
  await p.locator('[data-req-list] [data-req-open]').first().click()
  await p.locator('[data-req-reply]').first().waitFor({ state: 'visible', timeout: 8000 })
  ok(/오늘 중 연락드리겠습니다/.test(flat(await p.locator('[data-req-reply]').first().innerText())) && /req-reply/.test((await waitSpot(p, /req-reply/)) ?? ''), '② 병원 화면 「담당자 안내」에 회신이 보이고 강조된다')

  await shot(p, '09_portal_check')
  //  STEP 6 — 성과
  await p.keyboard.press('Escape').catch(() => {})
  await p.locator('[data-presenter-card]:visible [data-presenter-next]').click()
  await p.waitForTimeout(1500)
  ok(new URL(p.url()).pathname === '/performance/ir' && /STEP 6/.test(await stepNo(p)) && (await p.locator('[data-ir]').count()) === 1, '② STEP 6 · 발표용 성과 화면')

  await shot(p, '10_ir')
  //  STEP 7 — 마무리
  await p.locator('[data-presenter-card]:visible [data-presenter-next]').click()
  await p.waitForTimeout(1200)
  ok(new URL(p.url()).pathname === '/presentation' && /STEP 7/.test(await stepNo(p)), '② STEP 7 · 마무리 (/presentation)')
  await shot(p, '11_close')
  const close = flat(await p.locator('[data-presenter-close]').innerText())
  ok(/구현됨/.test(close) && /실증 단계/.test(close) && /향후 계획/.test(close) && close.includes(CLOSING.message), '② 마무리 — 구현됨 · 실증 단계 · 향후 계획 + 마지막 문장')
  ok((await p.locator('[data-close-ai-unverified]').count()) === 1, '② 마무리 — AI 성공 기록이 없으면 「AI 요청 분석」 옆에 「실제 호출 확인 전」')
  ok((await p.locator('[data-presenter-card]:visible [data-presenter-finish]').count()) === 1, '② 마지막 단계는 「발표 가이드 종료」')
  await p.locator('[data-presenter-card]:visible [data-presenter-finish]').click()
  await p.waitForTimeout(600)
  ok((await p.locator('[data-presenter-card]').count()) === 0 && (await p.locator('[data-presenter-spot]').count()) === 0, '③ 종료 → 카드 · 강조 사라짐')
  ok(await p.evaluate(() => sessionStorage.getItem('beonemirae-ops:presenter') === null), '③ 종료 → 진행 기록도 지움')
  await p.reload({ waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(1200)
  ok((await p.locator('[data-presenter-card]').count()) === 0, '③ 종료 뒤 새로고침해도 카드 없음 (일반 화면으로 완전 복귀)')
  ok(coverIssues.length === 0, '② 넓은 화면 — 안내 카드가 강조한 버튼을 한 번도 가리지 않았다', coverIssues.join(' | '))
  ok(errors.length === 0, '② 골든 패스 화면 오류 0', errors.join(' | '))
  await ctx.close()
}

// ── ④ 시연 거래처 없이 병원 단계 ───────────────────────────────────────────────
{
  const { ctx, p } = await open('admin', '/presentation', { clientPick: false })
  await p.locator('[data-presenter-client]').selectOption('')
  await p.locator('[data-presenter-jump="3"]').click()
  await p.waitForTimeout(900)
  const t = flat(await card(p).innerText())
  ok(/시연 거래처를 먼저 고르세요/.test(t) && new URL(p.url()).pathname === '/presentation', '④ 거래처 없이 병원 단계 → 「시연 거래처를 먼저 고르세요」 (엉뚱한 병원으로 가지 않음)', t.slice(0, 80))
  await p.locator('[data-presenter-client]').selectOption(C0.id)
  await p.waitForTimeout(400)
  ok(/이 단계 화면이 아닙니다/.test(flat(await card(p).innerText())), '④ 거래처를 고르면 안내가 「이 단계 화면으로」로 바뀐다')
  await p.locator('[data-presenter-card]:visible [data-presenter-go]').click()
  await p.waitForTimeout(1200)
  ok(new URL(p.url()).pathname === `/portal/c/${C0.id}`, '④ 거래처를 고르면 그 병원 화면으로', p.url())
  await ctx.close()
}

// ── ③ ✕ 는 한 번 더 묻는다 — 잘못 눌러도 시연이 날아가지 않게 ─────────────────
{
  const { ctx, p } = await open('admin', '/presentation')
  await p.locator('[data-presenter-jump="2"]').click()
  await p.waitForTimeout(1200)
  await p.locator('[data-presenter-card]:visible [data-presenter-stop]').click()
  ok((await p.locator('[data-presenter-card]:visible [data-presenter-stop-ask]').count()) === 1 && (await card(p).count()) === 1, '③ ✕ → 「발표 가이드를 끝낼까요?」 (바로 끝나지 않음)')
  await p.locator('[data-presenter-card]:visible [data-presenter-stop-no]').click()
  ok((await p.locator('[data-presenter-stop-ask]').count()) === 0 && /STEP 2/.test(await stepNo(p)), '③ 「계속」 → 같은 단계 그대로')
  await p.locator('[data-presenter-card]:visible [data-presenter-stop]').click()
  await p.locator('[data-presenter-card]:visible [data-presenter-stop-yes]').click()
  await p.waitForTimeout(500)
  ok((await p.locator('[data-presenter-card]').count()) === 0 && (await p.locator('[data-presenter-spot]').count()) === 0 && new URL(p.url()).pathname === '/collection', '③ 「끝내기」 → 카드 · 강조 사라지고 지금 화면에 그대로 (평소 사용)')
  ok(await p.evaluate(() => sessionStorage.getItem('beonemirae-ops:presenter') === null), '③ 「끝내기」 → 진행 기록도 지움')
  await ctx.close()
}

// ── ⑤ 강조 대상이 없어도 깨지지 않음 ───────────────────────────────────────────
{
  const { ctx, p, errors } = await open('admin', '/presentation')
  await p.locator('[data-presenter-jump="5"]').click()   //  회신 단계 — 회신 창이 닫혀 있으면 대상 없음
  await p.waitForTimeout(1500)
  ok(new URL(p.url()).pathname === '/requests' && (await p.locator('[data-presenter-spot]').count()) === 0 && (await card(p).count()) === 1, '⑤ 대상이 없으면 강조 없이 카드만 (오류 없음)')
  ok(errors.length === 0, '⑤ 화면 오류 0', errors.join(' | '))
  await ctx.close()
}

// ── ⑦ 폰 폭 · 폰 틀 ────────────────────────────────────────────────────────────
{
  const { ctx, p, errors } = await open('admin', '/presentation', { width: 390 })
  await p.locator('[data-presenter-start]').click()
  await p.waitForTimeout(800)
  await shot(p, '20_m_bar')
  ok((await p.locator('[data-presenter-bar]:visible').count()) === 1, '⑦ 폰 — 위쪽 한 줄 막대')
  const bar = await p.locator('[data-presenter-bar]').boundingBox()
  ok(bar.y < 30 && bar.height <= 90, '⑦ 폰 — 막대는 위에 얇게 (아래 버튼 · 시트를 가리지 않음)', JSON.stringify(bar))
  await p.locator('[data-presenter-open]').click()
  await p.locator('[data-presenter-sheet]').waitFor({ state: 'visible', timeout: 4000 })
  await p.waitForTimeout(300)
  await shot(p, '21_m_sheet')
  ok(/지금 보여드리는 것/.test(flat(await p.locator('[data-presenter-sheet]').innerText())), '⑦ 폰 — 펼치면 아래 시트에 전체 안내')
  await p.locator('[data-presenter-sheet] [data-presenter-next]').click()
  await p.waitForTimeout(1000)
  ok(new URL(p.url()).pathname === '/' && (await p.locator('[data-presenter-sheet]').count()) === 0 && (await p.locator('[data-presenter-bar]:visible').count()) === 1, '⑦ 폰 — 다음을 누르면 화면 이동 · 시트는 접힘')
  await shot(p, '22_m_today')
  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  ok(over <= 0, '⑦ 폰 — 가로로 안 밀림', `${over}px`)
  //  폰 틀 안 (관리자 PC 의 「휴대폰 화면으로 보기」) — 안쪽 화면에는 카드가 없다
  await p.goto(`${W.BASE}/portal/c/${C0.id}?frame=1`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(1500)
  ok((await p.locator('[data-presenter-card]').count()) === 0, '⑦ 폰 틀(frame=1) 안에는 카드를 그리지 않는다 (겹침 없음)')
  ok(errors.length === 0, '⑦ 화면 오류 0', errors.join(' | '))
  await ctx.close()
}

// ── ⑧ 문구 규칙 ────────────────────────────────────────────────────────────────
{
  const all = JSON.stringify(PRESENTER_STEPS.map((s) => [s.title, s.show, s.before, s.now, s.effects, s.todo, s.note, s.aside])) + JSON.stringify(CLOSING)
  ok(!/\d+\s*%|%/.test(all), '⑧ 검증 안 된 % 가 없다')
  ok(!/자동\s*배차|자동으로 배차|수거량을? 예측|발생량을? 예측|완전 자동|전체 업무가 AI|병원 전체가|최적 (수거)?경로/.test(all), '⑧ 과장 표현(자동 배차 · 예측 · 완전 자동화 · 병원 전체) 없음')
  ok(!/105\s*톤|49\s*곳|53\s*곳|억\s*원|매출/.test(all), '⑧ 출처 미확정 숫자 · 매출을 AX 효과로 쓰지 않음')
  ok(PRESENTER_STEPS.every((s) => s.note.split(/(?<=[.다])\s/).length <= 4 && s.note.length <= 160), '⑧ 발표자 메모는 짧게 (두세 문장)', PRESENTER_STEPS.map((s) => s.note.length).join(','))
  ok(PRESENTER_STEPS.filter((s) => s.key !== 'intro' && s.key !== 'close').every((s) => s.show && s.before && s.now && s.effects?.length && s.todo), '⑧ 업무 단계마다 다섯 가지 — 보여드리는 것 · 기존 · 바뀐 방식 · 기대 효과 · 지금 할 일')
  ok(/전화가 (완전히 )?없어/.test(all) === false, '⑧ 「전화가 없어진다」 같은 말 없음')
}

await b.close()
console.log(`\ncheck_presenter139 OK=${pass} FAIL=${fail}`)
process.exit(fail ? 1 : 0)
