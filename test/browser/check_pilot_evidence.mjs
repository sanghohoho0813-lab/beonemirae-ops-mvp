import { chromium, EXEC } from './_pw.mjs'
import * as W from './walk_lib.mjs'
import * as F from './perf_fixtures.mjs'

//  0122 QA ③ — Pilot 거래처 5곳 · 수거 여러 건 → Pilot 요약이 DB(가짜 서버)와 일치
//
//   확인하는 것
//    · Pilot 거래처 5곳 (목록에 없는 id 하나가 섞여도 세지 않음)
//    · 수거 입력 = 현장 이벤트 6건 (시연 1 · 시작일 이전 1 · 취소 1 · Pilot 외 1 은 **빠짐**)
//    · 자재사용 기록 3건 (규격별이 적힌 수거만)
//    · 실사용자 2명 · Portal 요청 2건 (직원 접수 · Pilot 외 · 기간 밖은 빠짐)
//    · 카드 어디에도 「%」·「향상」 이 없음
//    · 빠진 건수가 적혀 있음 · 기준값은 KNOWN / UNKNOWN 으로만
//
//   ⚠ 기대값은 이 파일이 만든 자료에서 **스스로** 셉니다.

const ok = (c, m, d = '') => { console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`); if (!c) process.exitCode = 1 }
const T = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
const day = (n) => { const d = new Date(`${T}T00:00:00`); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE') }
const START = day(-6)
const json = (r, v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
const b = await chromium.launch({ executablePath: EXEC })

const PILOT = ['c0', 'c1', 'c2', 'c3', 'c4']
const nameOf = (id) => F.clients.find((c) => c.id === id)?.name ?? id

//  완료 일정 — Pilot 5곳에 6건 (3건에 규격별 사용량) + 시작일 이전 1건 + Pilot 외 1건
const sched = (id, cid, date, used) => ({
  id, date, client_id: cid, waste_type: '의료폐기물', vehicle_id: 'v1', scheduled_time: '09:00', status: '완료',
  expected_amount: 100, actual_amount: 110, completed_at: `${date}T02:00:00Z`, memo: '', origin: 'field',
  is_additional: false, demo_session_id: null, handover_status: '인계 완료', driver_name: '김기사',
  containers: used ? { corrugated: 0, plastic: 0, bag: 0, etc: 0, usedItems: used } : { corrugated: 1, plastic: 0, bag: 0, etc: 0 },
  created_at: `${date}T00:00:00Z`, updated_at: `${date}T00:00:00Z`, event_id: `ev-${id}`,
})
const mine = [
  sched('px1', 'c0', day(-5), { box63: 10, plastic20: 2 }),
  sched('px2', 'c1', day(-4), { box63: 6 }),
  sched('px3', 'c2', day(-2), { pouch12: 20 }),
  sched('px4', 'c0', day(-1), null),
  sched('px5', 'c3', T, null),
  sched('px6', 'c1', T, null),
  sched('px7', 'c0', day(-10), { box63: 99 }), // 시작일 이전 — 빠져야 함
  sched('px8', 'c6', T, { box63: 5 }), // Pilot 외 — 빠져야 함
]
const ev = (id, sid, cid, at, who, extra = {}) => ({
  id, at, actor_id: `u-${who}`, actor_name: who, actor_role: 'field', screen: '수거 입력', action: '수거 완료',
  schedule_id: sid, created_schedule: false, client_id: cid, client_name: nameOf(cid), waste_type: '의료폐기물',
  amount_kg: 110, before_state: { status: '예정', actualAmount: null, handoverStatus: null }, material_ids: [],
  stock_before: {}, request_updates: [], note: '', reverted: false, reverted_at: null, demo_session_id: null,
  input_duration_ms: 30000, ...extra,
})
const events = [
  ev('e1', 'px1', 'c0', `${day(-5)}T02:00:00Z`, '김기사'),
  ev('e2', 'px2', 'c1', `${day(-4)}T02:00:00Z`, '김기사'),
  ev('e3', 'px3', 'c2', `${day(-2)}T02:00:00Z`, '박기사'),
  ev('e4', 'px4', 'c0', `${day(-1)}T02:00:00Z`, '김기사'),
  ev('e5', 'px5', 'c3', `${T}T02:00:00Z`, '박기사'),
  ev('e6', 'px6', 'c1', `${T}T02:30:00Z`, '김기사'),
  ev('e7', 'px7', 'c0', `${day(-10)}T02:00:00Z`, '김기사'), // 시작일 이전
  ev('e8', 'px8', 'c6', `${T}T02:00:00Z`, '김기사'), // Pilot 외
  ev('e9', 'px1', 'c0', `${day(-3)}T02:00:00Z`, '시연자', { demo_session_id: 'demo-1' }), // 시연
  ev('e10', 'px2', 'c1', `${day(-3)}T03:00:00Z`, '김기사', { reverted: true, reverted_at: `${day(-3)}T03:10:00Z` }), // 취소
]
const req = (id, cid, source, createdAt, handled) => ({
  id, client_id: cid, kind: '소모품', content: '박스 요청', desired_date: null, urgent: false, status: handled ? '처리 완료' : '접수',
  source, requester_name: '원무과', reply: '', handled_by: null, handled_at: handled ? createdAt : null, created_at: createdAt,
  demo_session_id: null, clients: { name: nameOf(cid) },
})
const requests = [
  req('r1', 'c0', 'portal', `${day(-2)}T01:00:00Z`, true),
  req('r2', 'c0', 'portal', `${T}T01:00:00Z`, false),
  req('r3', 'c1', 'staff', `${T}T01:00:00Z`, false), // 직원 접수 — 빠짐
  req('r4', 'c6', 'portal', `${T}T01:00:00Z`, false), // Pilot 외 — 빠짐
  req('r5', 'c1', 'portal', `${day(-20)}T01:00:00Z`, true), // 기간 밖 — 빠짐
]

//  ── 기대값 — 검사가 스스로 셉니다 ──────────────────────────────────────────
const inPeriod = (d) => d >= START && d <= T
const fieldEv = events.filter((e) => PILOT.includes(e.client_id) && !e.demo_session_id && !e.reverted && inPeriod(e.at.slice(0, 10)))
const EXP = {
  clients: PILOT.length,
  entered: fieldEv.length,
  users: new Set(fieldEv.map((e) => e.actor_name)).size,
  used: mine.filter((s) => PILOT.includes(s.client_id) && inPeriod(s.date) && s.containers.usedItems).length,
  portal: requests.filter((r) => r.source === 'portal' && PILOT.includes(r.client_id) && inPeriod(r.created_at.slice(0, 10))).length,
  coverage: new Set(fieldEv.map((e) => e.client_id)).size,
  excluded: {
    demo: events.filter((e) => PILOT.includes(e.client_id) && e.demo_session_id).length,
    practice: events.filter((e) => PILOT.includes(e.client_id) && !e.demo_session_id && !e.reverted && e.at.slice(0, 10) < START).length,
    reverted: events.filter((e) => PILOT.includes(e.client_id) && e.reverted).length,
    nonPilot: events.filter((e) => !PILOT.includes(e.client_id)).length,
  },
  //  Pilot 완료 수거 = 내 것 + 공용 자료의 Pilot 거래처 완료 건(기간 안)
  ofRecords: mine.filter((s) => PILOT.includes(s.client_id) && inPeriod(s.date)).length
    + F.schedules.filter((s) => PILOT.includes(s.client_id) && s.status === '완료' && inPeriod(s.date)).length,
}

//  공급 기록 — 진짜 1건 · 시연 중 만들어진 1건.
//  수거 완료가 자재를 함께 넣을 때 서버가 같은 시연 표식을 자재에도 붙이므로,
//  시연 건이 Pilot 거래처에 남아 있을 수 있습니다. 그것이 빠지는지 봅니다.
const supplies = [
  { id: 'sup1', date: day(-3), client_id: 'c0', box_count: 4, vinyl_count: 0, needle_box_count: 0,
    is_additional_request: false, memo: '', origin: 'field', demo_session_id: null, items: { box63: 4 },
    created_at: `${day(-3)}T00:00:00Z`, updated_at: `${day(-3)}T00:00:00Z` },
  { id: 'sup2', date: day(-3), client_id: 'c0', box_count: 7, vinyl_count: 0, needle_box_count: 0,
    is_additional_request: false, memo: '', origin: 'field', demo_session_id: 'demo-1', items: { box63: 7 },
    created_at: `${day(-3)}T00:00:00Z`, updated_at: `${day(-3)}T00:00:00Z` },
]

const state = { reqs: 0, writes: [], profile: W.profileFor('admin'), schedules: [...F.schedules, ...mine] }
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
W.wire(ctx, state)
ctx.route('**/rest/v1/materials**', (r) => json(r, supplies))
//  ⚠ 기존 실증 시작일(start_date)은 **일부러 훨씬 이른 날**로 둡니다. Pilot 집계가
//    이 값을 쓰면 시작일 이전 건(e7, day(-10))까지 세어 버리므로, 두 칸이 정말
//    갈라져 있는지 여기서 드러납니다 (0123).
const OLD_START = day(-30)
ctx.route('**/rest/v1/experiment_settings**', (r) => json(r, {
  id: 1, start_date: OLD_START, pilot_start_date: START,
  pilot_client_ids: [...PILOT, '00000000-0000-0000-0000-00000000dead'],
}))
ctx.route('**/rest/v1/collection_events**', (r) => json(r, events))
ctx.route('**/rest/v1/client_requests**', (r) => json(r, requests))
const p = await ctx.newPage()
await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
  access_token: 't', token_type: 'bearer', expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
})), ['beonemirae-ops:auth', { id: F.UID, aud: 'authenticated', email: state.profile.email, app_metadata: {}, user_metadata: {} }])
await p.goto(`${W.BASE}/performance`, { waitUntil: 'domcontentloaded' })
await W.settle(p, state, 800, 40000)

ok((await p.locator('[data-pilot-summary]').count()) === 1, '성과 화면 요약 탭에 Pilot 카드 1장')
const tile = async (k) => (await p.locator(`[data-pilot-tile="${k}"]`).innerText()).replace(/\s+/g, ' ')
ok(new RegExp(`${EXP.clients}곳`).test(await tile('clients')), `Pilot 거래처 ${EXP.clients}곳 (목록에 없는 id 는 세지 않음)`, await tile('clients'))
ok(new RegExp(`${EXP.entered}건`).test(await tile('entered')), `수거 입력 ${EXP.entered}건 (시연·취소·시작일 이전·Pilot 외 제외)`, await tile('entered'))
//  기존 실증 시작일(30일 전)을 썼다면 e7(10일 전)까지 세어 7건이 됩니다 — 6건이어야 갈라진 것입니다.
ok(!new RegExp(`${EXP.entered + 1}건`).test(await tile('entered')),
  '**기존 실증 시작일(30일 전)이 아니라 Pilot 시작일로 셈** — 두 칸이 갈라져 있음', await tile('entered'))
ok(new RegExp(`${EXP.used}건`).test(await tile('used')), `자재사용 기록 ${EXP.used}건`, await tile('used'))
ok(new RegExp(`${EXP.users}명`).test(await tile('users')), `실사용자 ${EXP.users}명`, await tile('users'))
ok(new RegExp(`${EXP.portal}건`).test(await tile('portal')), `Portal 요청 ${EXP.portal}건 (직원 접수·Pilot 외·기간 밖 제외)`, await tile('portal'))
const period = await p.locator('[data-pilot-period]').innerText()
const shortFrom = `${Number(START.split('-')[1])}/${Number(START.split('-')[2])}`
ok(period.replace(/\s+/g, '') === `${shortFrom}~현재·7일`,
  '제목 옆 기간이 **실제 기간에서 계산**됨 (「1주」 같은 고정 표현 없음)', period)
ok(!/1주/.test(await p.locator('[data-pilot-summary]').innerText()), '카드 어디에도 「1주」라고 적지 않음')
ok(!/미설정/.test(period), 'Pilot 시작일이 설정돼 있음')

await p.locator('[data-pilot-detail-toggle]').click()
await p.waitForTimeout(500)
const detail = (await p.locator('[data-pilot-detail]').innerText()).replace(/\s+/g, ' ')
ok(new RegExp(`자재사용 기록률 ${EXP.used} / ${EXP.ofRecords}건`).test(detail), `기록률 ${EXP.used} / ${EXP.ofRecords}건 — 분모는 Pilot 완료 수거`, detail.match(/자재사용 기록률[^·]*/)?.[0] ?? '')
ok(new RegExp(`거래처 Coverage ${EXP.coverage} / ${EXP.clients}곳`).test(detail), `Coverage ${EXP.coverage} / ${EXP.clients}곳`)
ok(/직원 사용 2명 — (김기사 4건 · 박기사 2건|박기사 2건 · 김기사 4건)/.test(detail), '직원별 건수 (김기사 4 · 박기사 2)')
ok(new RegExp(`입력 정정 기록 취소된 입력 ${EXP.excluded.reverted}건 / 전체 입력 ${EXP.entered}건`).test(detail),
  '**「입력 정정 기록 · 취소된 입력 N건 / 전체 입력 N건」** — 「재입력」이라 부르지 않음')
ok(!/재입력|Re-entry|Reduction/.test(detail), '확인하지 않은 「재입력」·「Reduction」 표현이 없음')
ok(new RegExp(`연결 ${EXP.entered} / ${EXP.entered}건`).test(detail), '입력 → 이력 연결 6 / 6건')
ok(new RegExp(`Portal Self-Service 요청 ${EXP.portal}건 · 처리 1건 · 병원 1곳`).test(detail), 'Portal 요청 · 처리 · 병원 수')
const exc = (await p.locator('[data-pilot-excluded]').innerText()).replace(/\s+/g, ' ')
ok(new RegExp(`시연 ${EXP.excluded.demo}건 · 시작일 이전 ${EXP.excluded.practice}건 · 취소 ${EXP.excluded.reverted}건 · Pilot 외 거래처 ${EXP.excluded.nonPilot}건`).test(exc),
  '**빠진 건수가 그대로 적힘**', exc)
ok(/63L 박스 사용 확인 16개/.test(detail) && /12L 봉투형용기 사용 확인 20개/.test(detail), '규격별 사용 합계 (63L 16 · 봉투 20 — 시작일 이전 99 · Pilot 외 5 는 빠짐)')
//  공급 4(진짜) + 7(시연) 중 4만 세야 합니다
ok(/63L 박스 사용 확인 16개 · 공급 4개/.test(detail), '**시연 중 만든 공급(7개)은 빼고 진짜 공급 4개만 셈**',
  detail.match(/63L 박스[^가-힣]*[^·]*·[^·]*/)?.[0] ?? '')
const card = (await p.locator('[data-pilot-summary]').innerText()).replace(/\s+/g, ' ')
ok(!/\d+(\.\d+)?\s*%/.test(card) && !/향상|절감|개선율/.test(card), '**개선율·% 표기 없음**')
ok(/Pilot 실제 기록/.test(card) && !/1주/.test(card), '제목은 「Pilot 실제 기록」 — 기간을 「1주」로 고정해 부르지 않음')
ok((await p.locator('[data-baseline]').count()) === 5 && /BASELINE UNKNOWN/.test(card), '기준값 5줄 — 없는 것은 UNKNOWN 으로 (지어내지 않음)')
ok(/COLLECTION TABLE/.test(card) && /MATERIAL USAGE/.test(card) && /CUSTOMER REQUEST/.test(card) && /USER FEEDBACK/.test(card), '출처 4종이 줄마다 적힘')

//  거래처별 건수 — 자료에서 센 값과 같아야 합니다
for (const cid of PILOT) {
  const n = fieldEv.filter((e) => e.client_id === cid).length
  const li = (await p.locator(`[data-pilot-client="${cid}"]`).innerText()).replace(/\s+/g, ' ')
  ok(new RegExp(`${n}건`).test(li), `거래처별 — ${nameOf(cid)} ${n}건`, li)
}

// ── 현장 계정에는 카드가 없음 (관리자 전용) ────────────────────────────────
await ctx.close()
{
  const st = { reqs: 0, writes: [], profile: W.profileFor('field'), schedules: [...F.schedules, ...mine] }
  const c2 = await b.newContext({ viewport: { width: 1440, height: 900 } })
  W.wire(c2, st)
  const p2 = await c2.newPage()
  await p2.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: F.UID, aud: 'authenticated', email: st.profile.email, app_metadata: {}, user_metadata: {} }])
  await p2.goto(`${W.BASE}/performance`, { waitUntil: 'domcontentloaded' })
  await W.settle(p2, st, 800, 30000)
  ok((await p2.locator('[data-pilot-summary]').count()) === 0, '현장 계정에는 Pilot 요약 카드가 없음 (관리자 전용 · 별도 Pilot 모드 없음)')
  await c2.close()
}

await b.close()
