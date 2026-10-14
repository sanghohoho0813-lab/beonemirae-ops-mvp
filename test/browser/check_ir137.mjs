import { chromium, EXEC } from './_pw.mjs'
import * as W from './walk_lib.mjs'
import * as F from './perf_fixtures.mjs'

// ─────────────────────────────────────────────────────────────────────────────
//  발표용 성과 요약 /performance/ir (0137)
//
//  대표님: 「/performance 는 절대 삭제·단순화하지 말고, 발표 시연용 요약을 따로.
//  심사위원이 5~10초 안에 — 도입 전 문제 · 실제로 측정한 것 · 어디까지 검증됐는지.
//  최대 4개 지표. 측정값이 없으면 숫자를 만들지 말 것.」
//
//   ① 도입 전 하루 사무업무 = 운영이사 업무조사값 그대로 (3.5~4.7시간/일)
//   ② 동일 업무 Before → After = 업무 재현시험 실측만 · 표본 N회 · 「초기 재현시험」
//      재현시험이 없으면 「측정 전」 (숫자 없음)
//   ③ 실제 사용 증거 = 운영 DB 기록만 · 시연 · 취소 · 연습 제외 · 못 읽으면 「확인 전」
//   ④ 다음에 검증할 사업효과 = 목표값 없이 「측정 예정 / 기록 중」
//   ⑤ 금지: % 절감률 · 46% · 19% · 105톤 · 49곳/53곳 · 매출
//   ⑥ 「근거 보기」 → /performance?tab=basis, /performance 세 탭은 그대로
//   ⑦ 들어오는 길 (/presentation · /performance) · 현장 계정은 못 들어옴 · 폰 폭
//
//  기대값은 아래 자료에서 **손으로 센 값**입니다 (화면 값에 맞추지 않습니다).
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
const addDays = (day, n) => {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d) + n * 86400000).toISOString().slice(0, 10)
}
const START = addDays(TODAY, -10) // 실증 시작일 → 실증기간 11일 (양끝 포함)
const [C0, C1, C2] = [F.clients[0].id, F.clients[1].id, F.clients[2].id]

//  한국 시각 정오 = UTC 03:00 — 어느 시간대로 읽어도 그 날짜에 남습니다.
const at = (day, h = 3) => `${day}T${String(h).padStart(2, '0')}:00:00Z`
const EV = (id, day, extra = {}) => ({
  id, at: at(day), actor_role: 'field', screen: '수거 입력', action: '수거 완료', schedule_id: `s-${id}`,
  created_schedule: false, client_id: C0, client_name: F.clients[0].name, waste_type: '의료폐기물', amount_kg: 50,
  demo_session_id: null, duration_ms: 90000, input_duration_ms: 90000, reverted: false, reverted_at: null,
  material_ids: [], request_updates: [], before_state: {}, stock_before: {}, note: '', actor_id: null, actor_name: '',
  ...extra,
})
//  수거 입력 — 셀 것 5건 (u-a 3 · u-b 1 · 이름만 남은 김준기 1)
//  뺄 것: 시연 1 · 취소 1 (제외 건수에 들어감) · 연습 1 · 40일 전 1 (기간 밖)
const EVENTS = [
  EV('e1', TODAY, { actor_id: 'u-a', actor_name: '백광호' }),
  EV('e2', addDays(TODAY, -1), { actor_id: 'u-a', actor_name: '백광호' }),
  EV('e3', addDays(TODAY, -2), { actor_id: 'u-a', actor_name: '백광호' }),
  EV('e4', addDays(TODAY, -3), { actor_id: 'u-b', actor_name: '오대성' }),
  EV('e5', addDays(TODAY, -4), { actor_id: null, actor_name: '김준기' }),
  EV('e6', TODAY, { actor_id: 'u-z', actor_name: '시연기사', demo_session_id: 'demo-1' }),
  EV('e7', TODAY, { actor_id: 'u-y', actor_name: '취소기사', reverted: true, reverted_at: at(TODAY, 4) }),
  EV('e8', addDays(TODAY, -15), { actor_id: 'u-x', actor_name: '연습기사' }),
  EV('e9', addDays(TODAY, -40), { actor_id: 'u-w', actor_name: '옛기사' }),
]
const RQ = (id, extra) => ({
  id, client_id: C0, kind: '추가수거', content: '한 번 더 와 주세요', status: '접수', desired_date: null, urgent: false,
  source: 'portal', requester_name: '원무과', created_at: at(TODAY), updated_at: at(TODAY), demo_session_id: null,
  snoozed_until: null, snoozed_by_name: '', reply: '', handled_at: null, handled_by: null, ...extra,
})
//  병원 요청 — 셀 것 2건 (포털 원무과 · 직원이 받은 전화), 처리한 직원 u-c · 시연 1건 제외
const REQUESTS = [
  RQ('rq1', { client_id: C0, handled_by: 'u-c', handled_at: at(TODAY, 5), status: '확인 중' }),
  RQ('rq2', { client_id: C1, source: 'staff', requester_name: '홍길동' }),
  RQ('rq3', { client_id: C2, demo_session_id: 'demo-1', requester_name: '시연병원' }),
]
const IQ = (id, extra) => ({
  id, client_id: C1, topic: '수거 일정', subject: '일정 문의', body: '다음 주 일정이 궁금합니다', status: '접수', reply: '',
  asked_by_name: '행정실', handled_by: null, handled_at: null, created_at: at(TODAY), demo_session_id: null, ...extra,
})
//  병원 문의 — 셀 것 2건 (행정실 · 이름 없는 「병원 담당자」), 처리한 직원 u-a(이미 셈)
const INQUIRIES = [
  IQ('q1', { handled_by: 'u-a', handled_at: at(TODAY, 6), status: '답변 완료', reply: '화요일입니다' }),
  IQ('q2', { client_id: C2, asked_by_name: '병원 담당자' }),
]
//  기대값 (손으로 센 값)
//    실제 업무기록 = 수거 5 + 요청 2 + 문의 2 = 9건
//    실사용자 = 직원 {u-a, u-b, 김준기, u-c} 4 + 병원 {C0 원무과, C1 행정실} 2 = 6명
//    제외 = 시연 2 (수거 e6 · 요청 rq3) · 취소 1 (e7)
//    실증기간 = START ~ TODAY = 11일
const exp = { records: 9, users: 6, staff: 4, client: 2, demo: 2, reverted: 1, days: 11 }

const trialRow = (id, msg) => ({
  id, requester_id: W.profileFor('admin').id, requester_name: '대표', requester_role: 'admin', topics: ['업무 재현시험'],
  message: msg, status: '접수', admin_note: '', handled_at: null, created_at: at(TODAY), updated_at: at(TODAY),
})
//  재현시험 — 거래명세서 2회 (25→9분 · 31→11분 → 중앙값 28 → 10분), 수거 정리 1회 (12→4분)
const TRIALS = [
  trialRow('t1', `trial:${addDays(TODAY, -3)}|invoice|old=25,1|new=9,0 › 8월 명세서`),
  trialRow('t2', `trial:${addDays(TODAY, -1)}|invoice|old=31,0|new=11,0 › 9월 명세서`),
  trialRow('t3', `trial:${addDays(TODAY, -2)}|collection|old=12,0|new=4,0 › 하루치 수거`),
  { ...trialRow('t4', '화면이 좋아요'), topics: ['칭찬'] },
]

const MISSING_TABLE = (name) => ({ status: 404, contentType: 'application/json',
  body: JSON.stringify({ code: 'PGRST205', message: `Could not find the table 'public.${name}' in the schema cache`, hint: null, details: null }) })

async function open(role, path, { width = 1440, routes = {}, missing = [] } = {}) {
  const prof = { ...W.profileFor(role), font_scale: 'normal' }
  const state = { profile: prof, reqs: 0, writes: [], schemaVersion: 99 }
  const ctx = await b.newContext({ viewport: { width, height: 900 }, isMobile: width < 640, hasTouch: width < 640, timezoneId: 'Asia/Seoul' })
  W.wire(ctx, state)
  const json = (r, v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
  for (const t of missing) await ctx.route(`**/rest/v1/${t}*`, (r) => (r.request().method() === 'GET' ? r.fulfill(MISSING_TABLE(t)) : json(r, {})))
  for (const [t, rows] of Object.entries(routes)) {
    if (rows === undefined) continue
    await ctx.route(`**/rest/v1/${t}*`, (r) => {
      if (r.request().method() !== 'GET') { state.writes.push({ url: t, method: r.request().method() }); return json(r, {}) }
      const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
      return json(r, single ? (rows[0] ?? null) : rows)
    })
  }
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
  return { ctx, p, state, errors }
}

const FULL = {
  collection_events: EVENTS,
  client_requests: REQUESTS,
  client_inquiries: INQUIRIES,
  dev_requests: TRIALS,
  experiment_settings: [{ id: 1, start_date: START }],
  ops_changes: [],
}

// ── ①~⑤ 자료가 있을 때 ─────────────────────────────────────────────────────
{
  const { ctx, p, errors, state } = await open('admin', '/performance/ir', { routes: FULL })
  await p.locator('[data-ir]').waitFor({ state: 'visible', timeout: 10000 })
  const all = flat(await p.textContent('[data-ir]'))
  ok(/AX 운영혁신 — 초기 실증 결과/.test(flat(await p.textContent('[data-ir-title]'))), '맨 위 제목 「AX 운영혁신 — 초기 실증 결과」')

  //  ① 업무조사값: 배차 0.5~0.67 + 일정 1 + 엑셀 2~3 = 3.5~4.7 시간/일 (opsSurvey 원문)
  const before = flat(await p.textContent('[data-ir-before]'))
  ok(/3\.5~4\.7\s*시간\/일/.test(before), '① 도입 전 업무부담 3.5~4.7시간/일', before)
  ok(/운영이사 업무조사/.test(before) && /2026-08/.test(before) && /30~40분/.test(before) && /2시간~3시간/.test(before), '① 출처(업무조사 · 2026-08)와 원문 범위가 함께', before)

  //  ② 재현시험: 거래명세서 2회 → 중앙값 28 → 10분 · 그 밖에 수거 정리 1회
  ok((await p.locator('[data-ir-trial="measured"]').count()) === 1, '② 재현시험이 있으면 실측값을 보인다')
  const trial = flat(await p.textContent('[data-ir-trial]'))
  ok(/28\s*분\s*10\s*분/.test(trial), '② 거래명세서 중앙값 28분 → 10분 (손으로 센 값)', trial)
  ok(/초기 재현시험 2회/.test(trial) && /중앙값/.test(trial) && /거래명세서 작성/.test(trial), '② 표본 N회 · 「초기 재현시험」 · 무슨 업무인지', trial)
  ok(/오류 1건 → 0건/.test(trial), '② 오류 건수도 그대로 (1 → 0)', trial)
  ok(/수거 건 입력·정리 1회 \(12→4분\)/.test(trial), '② 다른 과제는 작게 (수거 정리 1회 12→4분)', trial)

  //  ③ 실제 사용
  const stat = async (k) => flat(await p.textContent(`[data-ir-stat="${k}"]`))
  const users = await stat('users')
  const records = await stat('records')
  const pilot = await stat('pilot')
  ok(new RegExp(`실사용자\\s*${exp.users}\\s*명`).test(users) && new RegExp(`직원 ${exp.staff} · 병원 ${exp.client}`).test(users), `③ 실사용자 ${exp.users}명 (직원 ${exp.staff} · 병원 ${exp.client})`, users)
  ok(new RegExp(`${exp.records}\\s*건`).test(records) && /수거 입력 5 · 병원 요청 2 · 문의 2/.test(records), `③ 실제 업무기록 ${exp.records}건 (수거 5 · 요청 2 · 문의 2)`, records)
  ok(new RegExp(`${exp.days}\\s*일`).test(pilot) && pilot.includes(`${START}부터`), `③ 실증기간 ${exp.days}일 (${START}부터)`, pilot)
  const note = flat(await p.textContent('[data-ir-usage-note]'))
  ok(new RegExp(`시연 ${exp.demo}건 · 취소 ${exp.reverted}건 제외`).test(note), '③ 뺀 것(시연 · 취소)을 숨기지 않는다', note)
  ok(!/시연기사|취소기사|연습기사|옛기사|시연병원/.test(all), '③ 시연 · 취소 · 연습 · 기간 밖 기록은 화면 어디에도 안 나온다')

  //  ④ 다음에 검증할 사업효과
  const next = await p.locator('[data-ir-next-item]').evaluateAll((els) => els.map((e) => `${e.getAttribute('data-ir-next-item')}:${e.getAttribute('data-ir-next-status')}`))
  ok(next.length >= 2 && next.length <= 3, '④ 다음에 검증할 것은 2~3개', next.join(','))
  ok(next.includes('vehicle:planned') && next.includes('ceoSales:planned'), '④ 기록이 없는 것은 「측정 예정」', next.join(','))
  ok(next.includes('portal:recording') && /병원 1곳 · 포털 요청 1건/.test(flat(await p.textContent('[data-ir-next-item="portal"]'))), '④ 포털 — 실제 기록 건수만 (사용률 %는 내지 않음)')

  //  ⑤ 금지
  ok(!/%/.test(all), '⑤ 절감률 · 사용률 % 가 화면에 없다', all.match(/.{0,20}%.{0,10}/)?.[0] ?? '')
  ok(!/46%|19%|105\s*톤|49\s*곳|53\s*곳/.test(all), '⑤ 예시값(46% · 19%) · 출처 미확정(105톤 · 49곳/53곳) 없음')
  ok(!/매출|억\s*원|억원|목표/.test(all.replace('매출 등 회사 실적은 AX 효과와 섞지 않습니다', '')), '⑤ 매출 · 목표값을 AX 효과로 적지 않는다')
  ok(flat(await p.textContent('[data-ir-disclaimer]')) === '초기 실측값이며 전체 회사 성과로 확대해석하지 않습니다.', '⑤ 아래 작은 문구 그대로')
  //  지표 수 — 큰 칸 둘(도입 전 · 동일 업무) + 실제 사용 한 줄 + 다음 검증 = 4묶음
  ok((await p.locator('[data-ir-before], [data-ir-trial], [data-ir-usage], [data-ir-next]').count()) === 4, '⑤ 지표 묶음은 4개')
  //  rpc/* 는 POST 로 부르는 **읽기 함수**(판 번호 · 원가 등)라 빼고, 표에 쓰는 요청만 봅니다.
  const tableWrites = state.writes.filter((w) => !/^rpc\//.test(w.url ?? ''))
  ok(tableWrites.length === 0, '⑤ 이 화면은 표에 아무것도 쓰지 않는다', JSON.stringify(tableWrites))
  ok(errors.length === 0, '화면 오류 0', errors.join(' | '))

  //  ⑥ 근거 보기 → /performance?tab=basis · 세 탭 그대로
  await p.locator('[data-ir-basis]').click()
  await p.locator('[data-perf-basis]').waitFor({ state: 'visible', timeout: 10000 })
  ok(new URL(p.url()).pathname === '/performance' && new URL(p.url()).searchParams.get('tab') === 'basis', '⑥ 「근거 보기」 → /performance?tab=basis', p.url())
  const tabs = await p.locator('[data-perf-tab]').evaluateAll((els) => els.map((e) => e.getAttribute('data-perf-tab')))
  ok(tabs.join(',') === 'summary,basis,settings', '⑥ /performance 는 요약 · 측정 근거 · 설정 그대로', tabs.join(','))
  ok((await p.locator('[data-metric]').count()) >= 6, '⑥ 측정 근거의 지표 카드(계산 근거 포함)가 그대로 있다', `${await p.locator('[data-metric]').count()}`)
  await p.locator('[data-perf-tab="summary"]').click()
  await p.locator('[data-perf-summary]').waitFor({ state: 'visible', timeout: 8000 })
  ok((await p.locator('[data-perf-growth]').count()) === 1 && (await p.locator('[data-perf-trials]').count()) === 1, '⑥ /performance 요약(기업 성장 · 재현시험)도 그대로')
  await p.locator('[data-open-ir]').click()
  await p.locator('[data-ir]').waitFor({ state: 'visible', timeout: 8000 })
  ok(new URL(p.url()).pathname === '/performance/ir', '⑦ /performance 머리글 「발표용 요약」 → 발표 화면')
  await ctx.close()
}

// ── ② 재현시험이 없으면 「측정 전」 — 숫자를 만들지 않는다 ─────────────────
{
  const { ctx, p } = await open('admin', '/performance/ir', { routes: { ...FULL, dev_requests: [TRIALS[3]] } })
  await p.locator('[data-ir]').waitFor({ state: 'visible', timeout: 10000 })
  ok((await p.locator('[data-ir-trial="none"]').count()) === 1, '② 재현시험이 없으면 「측정 전」 상태')
  const trial = flat(await p.textContent('[data-ir-trial]'))
  ok(/측정 전/.test(trial) && !/\d+\s*분/.test(trial.replace(/숫자는 잰 뒤에만/, '')), '② 「측정 전」 · 분 숫자 없음', trial)
  await ctx.close()
}

// ── ③ 운영 DB 를 못 읽으면 0 이 아니라 「확인 전」 ─────────────────────────
{
  const { ctx, p } = await open('admin', '/performance/ir', { routes: { ...FULL, client_inquiries: undefined }, missing: ['client_inquiries'] })
  await p.locator('[data-ir]').waitFor({ state: 'visible', timeout: 10000 })
  ok((await p.locator('[data-ir-usage="unavailable"]').count()) === 1, '③ 문의 표를 못 읽으면 실제 사용을 세지 않는다')
  const users = flat(await p.textContent('[data-ir-stat="users"]'))
  ok(/확인 전/.test(users) && !/\d+\s*명/.test(users), '③ 「확인 전」 — 0명이라고 적지 않는다', users)
  ok(/읽지 못한 자료/.test(users), '③ 왜 못 셌는지 적는다', users)
  await ctx.close()
}

// ── ③ 실증 시작일이 없으면 기간을 지어내지 않는다 ───────────────────────────
{
  const { ctx, p } = await open('admin', '/performance/ir', { routes: { ...FULL, experiment_settings: [{ id: 1, start_date: null }] } })
  await p.locator('[data-ir]').waitFor({ state: 'visible', timeout: 10000 })
  const pilot = flat(await p.textContent('[data-ir-stat="pilot"]'))
  ok(/확인 전/.test(pilot) && /실증 시작일이 설정되지 않았습니다/.test(pilot), '③ 실증 시작일이 없으면 「확인 전」 + 까닭', pilot)
  await ctx.close()
}

// ── ⑦ 들어오는 길 · 권한 · 폰 ───────────────────────────────────────────────
{
  const { ctx, p } = await open('admin', '/presentation', { routes: FULL })
  await p.locator('[data-open-ir]').waitFor({ state: 'visible', timeout: 10000 })
  await p.locator('[data-open-ir]').click()
  await p.locator('[data-ir]').waitFor({ state: 'visible', timeout: 8000 })
  ok(new URL(p.url()).pathname === '/performance/ir', '⑦ 심사 시연 화면 → 「발표용 성과 요약 열기」')
  await ctx.close()
}
{
  const { ctx, p } = await open('office', '/performance/ir', { routes: FULL })
  ok((await p.locator('[data-ir]').count()) === 1, '⑦ 사무실 계정도 열 수 있다 (/performance 와 같은 권한)')
  ok((await p.locator('[data-ir-trial-scope]').count()) === 1, '⑦ 사무실 계정 — 재현시험은 본인 것만 보인다고 적는다')
  await ctx.close()
}
{
  const { ctx, p } = await open('field', '/performance/ir', { routes: FULL })
  await p.waitForTimeout(800)
  ok((await p.locator('[data-ir]').count()) === 0, '⑦ 현장 계정은 못 연다', p.url())
  await ctx.close()
}
for (const w of [390, 1440]) {
  const { ctx, p } = await open('admin', '/performance/ir', { routes: FULL, width: w })
  await p.locator('[data-ir]').waitFor({ state: 'visible', timeout: 10000 })
  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  ok(over <= 0, `${w}px ⑦ 가로로 안 밀린다`, `${over}px`)
  const bx = await p.locator('[data-ir-before]').boundingBox()
  const tx = await p.locator('[data-ir-trial]').boundingBox()
  if (w >= 1024) ok(Math.abs(bx.y - tx.y) < 4 && bx.x < tx.x, `${w}px ⑦ 도입 전 → 동일 업무 처리가 한 줄`)
  else ok(tx.y > bx.y, `${w}px ⑦ 폰에서는 도입 전 아래에 동일 업무 처리`)
  //  눈으로 볼 캡처 — IR_SHOTS=폴더 를 주면 남깁니다 (검사 판정과 무관)
  if (process.env.IR_SHOTS) {
    await p.screenshot({ path: `${process.env.IR_SHOTS}/ir_${w}.png`, fullPage: true })
    await p.screenshot({ path: `${process.env.IR_SHOTS}/ir_${w}_first.png` })
  }
  //  글자 크기 — 다른 화면과 같은 기준(16px 미만 글자 없음, check_scale)
  const small = await p.evaluate(() => [...document.querySelectorAll('[data-ir] *')]
    .filter((el) => el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
    .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 })
    .map((el) => ({ t: el.textContent.trim().slice(0, 16), px: parseFloat(getComputedStyle(el).fontSize) }))
    .filter((x) => x.px < 16))
  ok(small.length === 0, `${w}px ⑦ 16px 미만 글자 없음`, small.map((x) => `${x.t}:${x.px}`).join(' | '))
  //  첫 화면(5~10초)에 두 큰 숫자가 보인다
  ok(tx.y + 120 < (w < 640 ? 900 + 400 : 900), `${w}px ⑦ 두 큰 칸이 첫 화면 가까이에 있다`, `${Math.round(tx.y)}`)
  await ctx.close()
}

await b.close()
console.log(`\ncheck_ir137 OK=${pass} FAIL=${fail}`)
process.exit(fail ? 1 : 0)
