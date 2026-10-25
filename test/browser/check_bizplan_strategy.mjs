import { chromium, EXEC } from './_pw.mjs'
import * as W from './walk_lib.mjs'
import * as F from './perf_fixtures.mjs'
import { fixtureModel } from './strategy_fixture.mjs'

//  사업화전략 · 3개년 매출 검토 (0148) — 대표님 · 이사님이 폰에서 고르고, 담당이 반영 요청까지
//
//   폰(390) · PC(1440)에서 손가락으로: 요약 → 시나리오 비교 · 직접 수치 수정(저장 안 됨) → 결정
//   (두 번 눌러야 저장 · 의견 조율 필요 · 합의 · 직접 입력 · 추후 결정) → 숫자가 바뀌면 재확인 필요 ·
//   옛 화면 결정 거절 → 심사 대응 → 적용 전 확인(합의 전 미리보기만) → 반영 요청 → 요청함 · 제안 반영
//   (표 모양 그대로) → 본문은 반영 때만 바뀜.
//
//   ⚠ 서버는 흉내입니다. 권한 · 합의 판단 · 숫자 판 거절 · 본문 불변의 진짜 검증은
//     supabase/test/55_bizplan_strategy.sql (로컬 PostgreSQL)이 합니다.
//   ⚠ 가상 회사 · 중립 숫자(strategy_fixture.mjs)입니다. 회사 숫자는 저장소에 없습니다.

const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  if (!c) process.exitCode = 1
}
const SHOTS = process.env.SHOTS
const b = await chromium.launch({ executablePath: EXEC })
const shot = async (p, n) => SHOTS && p.screenshot({ path: `${SHOTS}/${n}.png`, fullPage: false })

const PERSONA = {
  ceo: { id: 'ceo-id', role: 'admin', name: '대표', title: '대표', member: 'reviewer' },
  dir: { id: 'dir-id', role: 'office', name: '이사', title: '이사', member: 'reviewer' },
  dev: { id: 'dev-id', role: 'admin', name: '담당', title: '사업계획 담당', member: 'editor' },
}
const CONTENT = ['qa', 'research', 'facts', 'labels', 'drafts']
const without = (m) => JSON.stringify(Object.fromEntries(Object.entries(m).filter(([k]) => !CONTENT.includes(k))))

function makeServer({ model = fixtureModel() } = {}) {
  const S = {
    seq: 0,
    mode: 'ok', // ok | missing148
    fields: {
      's11.plan.y1': { key: 's11.plan.y1', value: [{ segment: '기존 수거 사업', amount: '1000', basis: '예전 초안' }], status: '초안 입력 완료', basis: {}, rev: 1, content_rev: 1, updated_at: '2026-10-01T01:00:00Z', updated_by: '검사' },
    },
    requests: [],
    checks: [],
    strategy: model ? { model, rev: 1, assump_rev: 1, updated_at: '2026-10-01T01:00:00Z', updated_by: '담당' } : null,
    decisions: [],
    decisionLog: [],
    log: [],
    revisions: [],
    calls: [],
  }
  S.now = () => new Date(Date.UTC(2026, 9, 25, 1, 0, 0) + S.seq++ * 1000).toISOString()
  return S
}
const deciders = () => Object.values(PERSONA).filter((x) => x.member === 'reviewer').map((x) => ({ profile_id: x.id, name: x.name, title: x.title }))
function agreed(S, key) {
  const ds = deciders()
  const live = S.decisions.filter((d) => d.key === key && d.assump_rev === S.strategy.assump_rev && d.choice !== '추후 결정')
  const kinds = new Set(live.map((d) => d.choice + '|' + (d.choice === 'custom' ? JSON.stringify(d.custom) : '')))
  return ds.length > 0 && live.length === ds.length && kinds.size === 1
}

function wire(ctx, S, who) {
  const P = PERSONA[who]
  ctx.route('**/rest/v1/rpc/bizplan_*', async (r) => {
    const fn = r.request().url().split('/rpc/')[1].split('?')[0]
    const a = JSON.parse(r.request().postData() || '{}')
    const send = (status, v) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(v) })
    S.calls.push({ fn, who, a })
    const me = { id: P.id, name: P.name, title: P.title, role: P.member }
    if (fn === 'bizplan_my_role') return send(200, P.member)
    if (fn === 'bizplan_open')
      return send(200, { api: 147, rules: { required: [], recommended: [], finance: [], plan: [], annex: [], by_hand: [] }, me, can_manage: P.role === 'admin', locked_keys: [], doc: { id: 'newborn2026', status: '공동 검토 중', version_label: 'V0.2', locked_label: '', updated_at: null, updated_by: '' }, fields: Object.values(S.fields), requests: S.requests, checks: S.checks, members: [], versions: [] })
    if (fn === 'bizplan_history') return send(200, { revisions: [], request_log: [], check_log: [] })
    if (fn === 'bizplan_survey') return send(200, [])
    if (fn.startsWith('bizplan_strategy') || fn === 'bizplan_decide' || fn === 'bizplan_usage_stats') {
      if (S.mode === 'missing148') return send(404, { code: 'PGRST202', message: 'Could not find the function public.' + fn })
    }
    if (fn === 'bizplan_strategy_open')
      return send(200, {
        api: 148, me, is_decider: P.member === 'reviewer', deciders: deciders(), preflight_month: '2026.10',
        strategy: S.strategy, decisions: S.decisions, decision_log: S.decisionLog, log: S.log, revisions: S.revisions,
      })
    if (fn === 'bizplan_usage_stats')
      return send(200, { from: '2026.09', note: '시연 기록 제외 (검사)', months: [{ month: '2026.09', collections: 10, field_inputs: 9, inputters: 2, avg_input_sec: 41, timed_inputs: 8, requests_portal: 3, requests_staff: 1, requests_done: 4, supply_orders: 2 }, { month: '2026.10', collections: 12, field_inputs: 12, inputters: 2, avg_input_sec: 38, timed_inputs: 12, requests_portal: 4, requests_staff: 0, requests_done: 3, supply_orders: 1 }] })
    if (fn === 'bizplan_decide') {
      if (P.member !== 'reviewer') return send(403, { code: '42501', message: '결정은 사업계획서 「검토」 참여자(대표님 · 이사님)만 남길 수 있습니다.' })
      if (a.p_assump_rev !== S.strategy.assump_rev) return send(409, { code: 'PT409', message: `그사이 숫자 · 결정안이 바뀌었습니다(판 ${a.p_assump_rev} → ${S.strategy.assump_rev}). 새 내용을 확인한 뒤 다시 골라 주세요.` })
      const row = { key: a.p_key, profile_id: P.id, name: P.name, title: P.title, choice: a.p_choice, custom: a.p_choice === 'custom' ? a.p_custom : null, note: a.p_note, assump_rev: S.strategy.assump_rev, basis: a.p_basis, at: S.now() }
      S.decisions = S.decisions.filter((d) => !(d.key === a.p_key && d.profile_id === P.id)).concat(row)
      S.decisionLog.unshift({ id: S.decisionLog.length + 1, ...row })
      return send(200, { ok: true, agreed: agreed(S, a.p_key), decision: row })
    }
    if (fn === 'bizplan_strategy_revision_get') {
      const rv = S.revisions.find((x) => x.id === a.p_id)
      return send(200, rv)
    }
    if (P.member !== 'editor') return send(403, { code: '42501', message: '이 일은 사업계획 담당만 할 수 있습니다.' })
    if (fn === 'bizplan_strategy_save') {
      const cur = S.strategy ?? { model: {}, rev: 0, assump_rev: 0 }
      if (cur.rev !== a.p_expected_rev) return send(200, { ok: false, conflict: true, rev: cur.rev, assump_rev: cur.assump_rev, model: cur.model, updated_by: cur.updated_by, updated_at: cur.updated_at })
      const assumpChanged = without(cur.model) !== without(a.p_model)
      const next = { model: a.p_model, rev: cur.rev + 1, assump_rev: cur.assump_rev + (assumpChanged ? 1 : 0), updated_at: S.now(), updated_by: P.name }
      S.revisions.unshift({ id: S.revisions.length + 1, rev: next.rev, assump_rev: next.assump_rev, sections: ['scenarios'], reason: a.p_reason, actor_name: P.name, at: next.updated_at, before_model: cur.model, after_model: a.p_model })
      S.log.unshift({ id: S.log.length + 1, step: '모델 저장', assump_rev: next.assump_rev, detail: { reason: a.p_reason }, actor_name: P.name, at: next.updated_at })
      S.strategy = next
      return send(200, { ok: true, rev: next.rev, assump_rev: next.assump_rev, assumption_changed: assumpChanged, stale_decisions: S.decisions.filter((d) => d.assump_rev < next.assump_rev).length })
    }
    if (fn === 'bizplan_strategy_propose') {
      if (a.p_assump_rev !== S.strategy.assump_rev) return send(409, { code: 'PT409', message: '그사이 숫자 · 결정안이 바뀌었습니다.' })
      const bad = [...new Set(a.p_items.flatMap((it) => it.decisions))].filter((k) => !agreed(S, k))
      if (bad.length) return send(400, { code: '22023', message: `대표님 · 이사님 합의 전인 결정이 있어 반영 요청을 만들지 않았습니다: ${bad.join(' · ')}` })
      const out = []
      for (const it of a.p_items) {
        const f = S.fields[it.key]
        const q = { id: `s${S.requests.length + 1}-0000-0000-0000-000000000000`, key: it.key, key_label: it.label, req_type: it.req_type, body: `[사업화전략 검토 · 숫자 판 ${S.strategy.assump_rev}] ${it.body}`, suggestion: it.suggestion, suggested_value: it.value, source: 'strategy', snapshot: f?.value ?? null, prev_status: f?.status ?? '작성 전', requester_name: P.name, requester_title: P.title, created_at: S.now(), status: '접수', handler_name: '', handled_at: null, resolution: '', applied_revision: null, updated_at: S.now() }
        S.requests.unshift(q)
        S.fields[it.key] = { ...(f ?? { key: it.key, value: '', basis: {}, rev: 0, content_rev: 0, updated_at: null, updated_by: '' }), status: '수정 요청 있음', rev: (f?.rev ?? 0) + 1 }
        out.push({ key: it.key, request_id: q.id })
      }
      S.log.unshift({ id: S.log.length + 1, step: '반영 요청', assump_rev: S.strategy.assump_rev, detail: { items: out }, actor_name: P.name, at: S.now() })
      return send(200, { ok: true, requests: out, assump_rev: S.strategy.assump_rev })
    }
    if (fn === 'bizplan_save_field') {
      const f = S.fields[a.p_key] ?? { key: a.p_key, value: '', status: '작성 전', basis: {}, rev: 0, content_rev: 0 }
      if (f.rev !== a.p_expected_rev) return send(200, { ok: false, conflict: true, field: f })
      const changed = JSON.stringify(a.p_value) !== JSON.stringify(f.value)
      const nf = { ...f, value: a.p_value ?? f.value, status: a.p_status ?? f.status, rev: f.rev + 1, content_rev: (f.content_rev ?? 0) + (changed ? 1 : 0), updated_at: S.now(), updated_by: P.name }
      S.fields[a.p_key] = nf
      const stale = changed ? S.checks.filter((c) => c.key === a.p_key && c.content_rev < nf.content_rev).length : 0
      if (a.p_request_id) Object.assign(S.requests.find((q) => q.id === a.p_request_id), { status: '반영 완료', handler_name: P.name, handled_at: S.now() })
      return send(200, { ok: true, revision: 1, stale_checks: stale, field: nf })
    }
    return send(404, { code: 'PGRST202', message: 'unknown ' + fn })
  })
}

async function open(S, who, path, w = 390) {
  const P = PERSONA[who]
  const phone = w < 700
  const ctx = await b.newContext({ viewport: { width: w, height: phone ? 844 : 900 }, isMobile: phone, hasTouch: phone, timezoneId: 'Asia/Seoul' })
  const state = { profile: { ...W.profileFor(P.role), name: P.name, font_scale: 'lg' }, reqs: 0, writes: [], schemaVersion: 123 }
  W.wire(ctx, state)
  wire(ctx, S, who)
  const p = await ctx.newPage()
  p.on('pageerror', (e) => ok(false, `화면 오류 없음 (${who} ${path})`, e.message))
  await p.addInitScript(([k, u]) => {
    localStorage.setItem(k, JSON.stringify({ access_token: 't', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u }))
    localStorage.setItem('beonemirae-ops:tour-seen', 'staff,field,client,demo')
  }, ['beonemirae-ops:auth', { id: F.UID, aud: 'authenticated', email: 'x@b.c', app_metadata: {}, user_metadata: {} }])
  await p.goto(`${W.BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await W.settle(p, state)
  await p.waitForTimeout(600)
  return { ctx, p }
}
const text = async (p, sel) => ((await p.locator(sel).first().textContent()) ?? '').replace(/\s+/g, ' ').trim()
const measure = (p) =>
  p.evaluate(() => {
    const vis = (e) => { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden') return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 }
    const overflow = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    const small = [...document.querySelectorAll('[data-strategy] button, [data-strategy] input:not([type=checkbox]), [data-strategy] select, [data-strategy] textarea')]
      .filter(vis).filter((e) => e.getBoundingClientRect().height < 35.5).map((e) => (e.textContent || e.getAttribute('data-sandbox') || e.tagName).trim().slice(0, 16))
    return { overflow, small }
  })
const decide = async (p, key, option) => {
  const card = p.locator(`[data-decision="${key}"]`)
  await card.locator(`[data-option="${option}"]`).first().click()
  await card.locator('[data-decide]').click()
  await p.waitForTimeout(700)
}

// ═══ 1. 서버 준비 전 · 자료 없음 ═════════════════════════════════════════════════
{
  const S = makeServer()
  S.mode = 'missing148'
  const { ctx, p } = await open(S, 'ceo', '/bizplan?tab=strategy')
  ok((await p.getAttribute('[data-strategy-fail]', 'data-strategy-fail')) === 'missing', '1 0148 전 — 「서버 준비 전」 (가짜 숫자 없음)')
  ok((await text(p, '[data-strategy-fail]')).includes('PROPOSAL_0148'), '1 무엇을 실행할지 알려 줌')
  await p.click('[data-bizplan-tab="doc"]'); await p.waitForTimeout(500)
  ok((await p.locator('[data-bizplan-tab="strategy"][aria-selected="true"]').count()) === 0 && (await p.locator('[data-bizplan-page]').count()) === 1, '1 다른 탭(문서)은 그대로 열림')
  await ctx.close()
}
{
  const S = makeServer({ model: null })
  const { ctx, p } = await open(S, 'dir', '/bizplan?tab=strategy')
  ok((await p.locator('[data-strategy-empty]').count()) === 1 && (await p.locator('[data-model-json]').count()) === 0, '1 자료 없음 — 이사님은 안내만 (회사 숫자는 서버에만)')
  await ctx.close()
}
{
  const S = makeServer({ model: null })
  const { ctx, p } = await open(S, 'dev', '/bizplan?tab=strategy', 1440)
  ok((await p.locator('[data-model-json]').count()) === 1, '1 담당 — 처음 자료를 JSON 으로 넣는 칸')
  await p.fill('[data-model-json]', '{"version":1')
  ok((await p.locator('[data-model-parse-error]').count()) === 1 && (await p.isDisabled('[data-model-save]')), '1 JSON 이 틀리면 저장 단추 꺼짐')
  const bad = fixtureModel(); bad.scenarios.B.saas.years['2029'].mix = { basic: 0.9, plus: 0.9 }
  await p.fill('[data-model-json]', JSON.stringify(bad))
  ok((await p.locator('[data-model-errors]').count()) === 1 && (await p.isDisabled('[data-model-save]')), '1 요금제 비중 합이 100%가 아니면 저장 전에 막음')
  await p.fill('[data-model-json]', JSON.stringify(fixtureModel()))
  ok(await p.isDisabled('[data-model-save]'), '1 까닭을 적기 전에는 저장 안 됨')
  await p.fill('[data-model-reason]', '처음 자료 넣기')
  await p.click('[data-model-save]'); await p.waitForTimeout(900)
  ok(S.strategy?.rev === 1 && (await p.locator('[data-strategy]').count()) === 1, '1 저장 → 사업화전략 화면이 열림 (판 1)')
  await ctx.close()
}

// ═══ 2. 대표님 폰 — 요약 · 시나리오 · 직접 수치 수정 ═══════════════════════════════
const S = makeServer()
{
  const { ctx, p } = await open(S, 'ceo', '/bizplan')
  await p.click('[data-bizplan-tab="strategy"]'); await p.waitForTimeout(700)
  ok((await p.locator('[data-strategy-summary]').count()) === 1, '2 폰 — 「사업화전략」 탭 → 핵심 요약')
  ok((await text(p, '[data-hero-total]')).startsWith('15.25억'), '2 마지막 해 전체 15.25억 (손 계산 1,524,800,000원)', await text(p, '[data-hero-total]'))
  ok((await p.locator('[data-st-card="hero"] [data-kind="사업화 목표"]').count()) === 1 && (await text(p, '[data-st-card="hero"]')).includes('계약 · 확정 매출이 아닙니다'), '2 「사업화 목표」 글자 + 확정 매출 아님')
  ok((await text(p, '[data-seg="saas"]')).includes('0.59억') && (await text(p, '[data-seg="b2b"]')).includes('1.35억'), '2 부문 — SaaS 0.59억 · B2B 1.35억')
  ok((await text(p, '[data-stat="guarantee"]')).includes('0.70억') && (await text(p, '[data-stat="check"]')).includes('0.30억'), '2 자금 — 보증 검토 0.70억 · 신보 확인 필요 0.30억')
  ok((await text(p, '[data-prod-rate]')) === '75.0%~83.3%', '2 생산성 — 해당 업무 감소율 75.0%~83.3%', await text(p, '[data-prod-rate]'))
  ok((await text(p, '[data-st-card="productivity"]')).includes('회사 전체 직원의 효율이 아닙니다') && (await text(p, '[data-st-card="productivity"]')).includes('현금 인건비 절감액이 아닙니다'), '2 한 분의 업무시간 · 현금 절감 아님을 글로')
  await p.click('[data-usage-load]'); await p.waitForTimeout(500)
  ok((await p.locator('[data-usage-month]').count()) === 2, '2 실제 사용 기록 (달별) 불러옴')
  ok((await p.locator('[data-undecided]').count()) === 6, '2 아직 정하지 않은 것 6개')
  ok((await p.locator('[data-warning="market_unknown"]').count()) === 1, '2 시장 규모 미확인 → 위험 표시')
  ok((await text(p, '[data-month-mismatch]')).includes('2026.11') && (await text(p, '[data-month-mismatch]')).includes('2026.10'), '2 접수 예정월 2026.11 ≠ 제출 전 점검 2026.10 경고')
  await shot(p, 'st_phone_summary')
  const m1 = await measure(p)
  ok(!m1.overflow, '2 폰 — 가로 밀림 없음'); ok(m1.small.length === 0, '2 폰 — 작은 단추 없음', m1.small.join(','))

  await p.click('[data-strategy-sec="scenarios"]'); await p.waitForTimeout(500)
  ok((await p.locator('[data-scenario]').count()) === 3, '2 시나리오 3장')
  ok((await p.locator('[data-scenario="B"] [data-recommended]').count()) === 1 && (await text(p, '[data-scenario="B"] [data-recommended]')).includes('확정 아님'), '2 B 「추천 · 확정 아님」')
  ok((await text(p, '[data-scenario="B"] [data-sc-total]')) === '15.25억', '2 B 카드 15.25억')
  ok((await text(p, '[data-scenario="B"] [data-sc-original]')).includes('20.00억'), '2 기존 자료(20.00억)와 다시 계산한 숫자를 나란히')
  ok((await text(p, '[data-strategy-scenarios]')).includes('실현 가능성의 통계적 확률이 아닙니다'), '2 A·B·C 는 확률이 아님을 글로')
  const before = S.calls.length
  await p.fill('[data-sandbox="end"]', '48'); await p.waitForTimeout(300)
  const r = await text(p, '[data-sandbox-result]')
  ok(r.includes('+0.') || r.includes('+1.'), '2 직접 수치 수정 — 2029 연말 48곳 → 매출이 다시 계산됨', r)
  ok(!S.calls.slice(before).some((c) => c.fn === 'bizplan_decide' || c.fn === 'bizplan_strategy_save'), '2 직접 수치 수정은 서버에 아무것도 저장하지 않음')
  await shot(p, 'st_phone_scenarios')
  await p.click('[data-sandbox-note]'); await p.waitForTimeout(600)
  ok((await p.inputValue('[data-decision="scenario"] [data-decision-note]')).includes('[직접 수치 수정'), '2 「의견란에 옮기기」 → 결정 1 의견란에만 (저장 아님)')
  ok(!S.decisions.length, '2 아직 아무 결정도 저장되지 않음')
  await ctx.close()
}

// ═══ 3. 결정 — 두 번 눌러야 저장 · 의견 조율 · 합의 · 직접 입력 · 추후 ═════════════════
{
  const { ctx, p } = await open(S, 'ceo', '/bizplan?tab=strategy&sec=decisions')
  ok((await p.locator('[data-decision]').count()) === 6, '3 결정 카드 (검사용 6개)')
  const card = p.locator('[data-decision="scenario"]')
  ok((await card.locator('[data-rec]').count()) === 1, '3 추천 표시')
  ok((await text(p, '[data-decision="scenario"] [data-option="C"] [data-impact]')).includes('마지막 해'), '3 안마다 예상 영향(마지막 해 매출 · 추천 대비)')
  const n0 = S.calls.filter((c) => c.fn === 'bizplan_decide').length
  await card.locator('[data-option="B"]').click(); await p.waitForTimeout(200)
  ok(S.calls.filter((c) => c.fn === 'bizplan_decide').length === n0, '3 안을 누르기만 하면 저장 안 됨')
  ok((await card.locator('[data-decide]').textContent()).includes('기본안'), '3 「「기본안」으로 결정」 단추')
  await card.locator('[data-decide]').click(); await p.waitForTimeout(700)
  const c1 = S.calls.filter((c) => c.fn === 'bizplan_decide').at(-1)
  ok(c1 && c1.a.p_choice === 'B' && c1.a.p_assump_rev === 1 && c1.a.p_basis?.['마지막해매출'] === '15.25억', '3 저장 — 보고 있던 숫자 판 1 · 본 숫자(15.25억)와 함께')
  ok((await p.getAttribute('[data-decision="scenario"] [data-decision-state]', 'data-decision-state')) === '결정 대기', '3 한 분만 → 결정 대기')
  ok(S.decisions.length === 1, '3 고른 것만 저장 (나머지 결정은 추천안으로 저장하지 않음)')
  //  직접 입력
  const lg = p.locator('[data-decision="legacy"]')
  await lg.locator('[data-custom-input]').fill('12.5'); await p.waitForTimeout(200)
  await lg.locator('[data-decide]').click(); await p.waitForTimeout(700)
  ok(S.decisions.find((d) => d.key === 'legacy')?.custom === '12.5', '3 직접 입력 12.5억 저장')
  await p.locator('[data-decision="ai"] [data-decide-later]').click(); await p.waitForTimeout(600)
  ok(S.decisions.find((d) => d.key === 'ai')?.choice === '추후 결정', '3 「추후 결정」도 누른 것만')
  await shot(p, 'st_phone_decisions')
  const m = await measure(p)
  ok(!m.overflow, '3 폰 — 가로 밀림 없음'); ok(m.small.length === 0, '3 폰 — 작은 단추 없음', m.small.join(','))
  await ctx.close()
}
{
  const { ctx, p } = await open(S, 'dir', '/bizplan?tab=strategy&sec=decisions')
  await decide(p, 'scenario', 'C')
  ok((await p.getAttribute('[data-decision="scenario"] [data-decision-state]', 'data-decision-state')) === '의견 조율 필요', '3 이사님 C ≠ 대표님 B → 의견 조율 필요')
  await p.click('[data-strategy-sec="summary"]'); await p.waitForTimeout(400)
  ok((await text(p, '[data-strategy-progress]')).includes('의견 조율 1'), '3 머리에 「의견 조율 1」')
  await p.click('[data-strategy-sec="decisions"]'); await p.waitForTimeout(400)
  await decide(p, 'scenario', 'B')
  ok((await p.getAttribute('[data-decision="scenario"] [data-decision-state]', 'data-decision-state')) === '합의', '3 이사님도 B → 합의')
  await ctx.close()
}
{
  const { ctx, p } = await open(S, 'dev', '/bizplan?tab=strategy&sec=decisions', 1440)
  ok(await p.locator('[data-decision="scenario"] [data-option="A"]').isDisabled(), '3 담당 — 안 단추가 꺼져 있음 (결정은 대표님 · 이사님)')
  ok((await p.locator('[data-decide]').count()) === 0, '3 담당 — 결정 단추 없음')
  await ctx.close()
}

// ═══ 4. 숫자가 바뀌면 재확인 필요 · 옛 화면 결정은 거절 ═══════════════════════════════
{
  const ceo = await open(S, 'ceo', '/bizplan?tab=strategy&sec=decisions')
  //  담당이 그사이 숫자를 고침 (B 2029 연말 36 → 40)
  const dev = await open(S, 'dev', '/bizplan?tab=strategy&sec=edit', 1440)
  await dev.p.click('[data-form-sc="B"]'); await dev.p.click('[data-form-year="2029"]')
  await dev.p.fill('[data-param="scenarios.B.saas.years.2029.endTarget"]', '40')
  await dev.p.fill('[data-model-reason]', '연말 목표 36 → 40 (검사)')
  ok((await text(dev.p, '[data-model-save]')).includes('1곳'), '4 바뀌는 곳 1곳')
  await dev.p.click('[data-model-save]'); await dev.p.waitForTimeout(800)
  ok(S.strategy.assump_rev === 2 && (await text(dev.p, '[data-model-msg]')).includes('재확인 필요'), '4 저장 → 숫자 판 2 · 「재확인 필요」 안내')
  await dev.ctx.close()
  //  대표님 — 옛 화면에서 고르면 서버가 거절
  await ceo.p.locator('[data-decision="structure"] [data-option="broker"]').click()
  await ceo.p.locator('[data-decision="structure"] [data-decide]').click(); await ceo.p.waitForTimeout(900)
  ok((await text(ceo.p, '[data-decision="structure"] [data-decision-error]')).includes('그사이 숫자'), '4 옛 화면(숫자 판 1)에서 고른 것 → 거절 · 안내')
  ok(!S.decisions.some((d) => d.key === 'structure'), '4 거절된 결정은 저장되지 않음')
  ok((await ceo.p.locator('[data-strategy-restale]').count()) === 1, '4 다시 읽은 화면 — 「재확인 필요」 띠')
  const st = await ceo.p.getAttribute('[data-decision="scenario"] [data-decision-state]', 'data-decision-state')
  ok(st === '재확인 필요', '4 합의였던 결정 1 → 재확인 필요 (지우지 않음)', st)
  const cmp = await text(ceo.p, '[data-decision="scenario"] [data-basis-compare]')
  ok(cmp.includes('15.25억') && cmp.includes('고를 때') && cmp.includes('지금'), '4 고를 때 숫자(15.25억) ↔ 지금 숫자', cmp)
  await ceo.p.click('[data-decision="scenario"] [data-reconfirm]')
  await ceo.p.click('[data-decision="scenario"] [data-decide]'); await ceo.p.waitForTimeout(700)
  ok(S.decisions.find((d) => d.key === 'scenario' && d.profile_id === 'ceo-id')?.assump_rev === 2, '4 같은 안을 지금 숫자로 다시 고름 (숫자 판 2)')
  await ceo.ctx.close()
}

// ═══ 5. 적용 전 확인 — 합의 전 미리보기 · 반영 요청 · 요청함 · 표 모양 그대로 반영 ════════
{
  const { ctx, p } = await open(S, 'dev', '/bizplan?tab=strategy&sec=apply', 1440)
  ok((await p.locator('[data-draft="s11.plan.y1"][data-draft-ok="n"] [data-draft-preview]').count()) === 1, '5 합의 전 → 1차년도 표는 「합의 전 · 미리보기」')
  ok(await p.locator('[data-draft-pick="s11.plan.y1"]').isDisabled(), '5 합의 전 칸은 고를 수 없음')
  ok(await p.isDisabled('[data-propose]'), '5 반영 요청 단추 꺼짐')
  ok((await p.locator('[data-draft="a.periods"][data-draft-ok="y"]').count()) === 1, '5 결정과 무관한 칸(차년도 기간)은 바로 가능')
  await ctx.close()
}
for (const who of ['ceo', 'dir']) {
  const { ctx, p } = await open(S, who, '/bizplan?tab=strategy&sec=decisions')
  for (const [k, o] of [['scenario', 'B'], ['legacy', 'x13'], ['saas_target', 'k36'], ['structure', 'direct'], ['funding', 'A']]) {
    const mine = S.decisions.find((d) => d.key === k && d.profile_id === PERSONA[who].id && d.assump_rev === S.strategy.assump_rev && d.choice === o)
    if (!mine) await decide(p, k, o)
  }
  await ctx.close()
}
{
  const { ctx, p } = await open(S, 'dev', '/bizplan?tab=strategy&sec=apply', 1440)
  ok((await p.locator('[data-draft="s11.plan.y1"][data-draft-ok="y"]').count()) === 1, '5 합의 뒤 → 1차년도 표 반영 가능')
  await p.click('[data-more-toggle="diff-s11.plan.y1"]'); await p.waitForTimeout(200)
  ok((await text(p, '[data-draft="s11.plan.y1"]')).includes('예전 초안'), '5 지금 본문 ↔ 초안 비교')
  const f0 = JSON.stringify(S.fields['s11.plan.y1'].value)
  await p.click('[data-pick-all]')
  const picked = await p.locator('[data-draft-pick]:checked').count()
  ok(picked >= 5, '5 반영 가능한 칸 모두 고르기', String(picked))
  await p.fill('[data-propose-note]', '검사 — 합의 반영')
  await p.click('[data-propose]'); await p.waitForTimeout(900)
  const reqs = S.requests.filter((q) => q.source === 'strategy')
  ok(reqs.length === picked, '5 고른 칸마다 수정요청 하나', `${reqs.length}`)
  ok(JSON.stringify(S.fields['s11.plan.y1'].value) === f0, '5 사업계획서 본문은 그대로 (자동 반영 없음)')
  const y1 = reqs.find((q) => q.key === 's11.plan.y1')
  ok(Array.isArray(y1?.suggested_value) && y1.suggested_value.reduce((a, x) => a + Number(x.amount), 0) === 1117, '5 1차년도 제안 = 표 모양 · 합 1,117백만원 (손 계산)')
  ok(reqs.some((q) => q.key === 's9.funding' && q.suggested_value?.guarantee === '70'), '5 자금 — 보증신청 70 (신보 확인 전 30은 넣지 않음)')
  ok((await p.locator('[data-strategy-req="접수"]').count()) === reqs.length, '5 「사업화전략에서 만든 수정요청」 목록')
  ok((await p.locator('[data-draft-pick]:checked').count()) === 0 && (await p.locator('[data-draft="s11.plan.y1"] [data-draft-open-req]').count()) === 1 && (await p.locator('[data-draft-pick="s11.plan.y1"]').isDisabled()), '5 처리 전 요청이 있는 칸은 다시 고를 수 없음 (중복 요청 방지)')
  await shot(p, 'st_pc_apply')
  //  요청함에서 제안 반영 — 표 모양 그대로 펼쳐짐
  await p.click('[data-bizplan-tab="inbox"]'); await p.waitForTimeout(600)
  await p.goto(`${W.BASE}/bizplan?f=s11.plan.y1`); await p.waitForTimeout(1200)
  const btn = p.locator('[data-request-apply], button:has-text("제안 반영")').first()
  await btn.click(); await p.waitForTimeout(600)
  const amounts = await p.$$eval('[data-field-editor="s11.plan.y1"] input, [data-field-editor="s11.plan.y1"] textarea', (els) => els.map((e) => e.value))
  ok(amounts.includes('1092') && amounts.includes('14') && amounts.includes('11'), '5 편집 창에 제안 표가 그대로 (1,092 · 14 · 11)', amounts.slice(0, 9).join('|'))
  await p.click('[data-edit-save]'); await p.waitForTimeout(800)
  ok(S.requests.find((q) => q.key === 's11.plan.y1' && q.source === 'strategy').status === '반영 완료', '5 담당이 저장할 때 요청은 「반영 완료」')
  ok(S.fields['s11.plan.y1'].value.reduce((a, x) => a + Number(x.amount), 0) === 1117 && S.fields['s11.plan.y1'].content_rev === 2, '5 그때 비로소 본문이 바뀜 (내용 판 +1)')
  await ctx.close()
}

// ═══ 6. 심사 대응 · PC 화면 ════════════════════════════════════════════════════════
{
  const { ctx, p } = await open(S, 'dir', '/bizplan?tab=strategy&sec=review', 1440)
  ok((await p.locator('[data-qa]').count()) === 2, '6 심사 질문 카드')
  ok((await p.getAttribute('[data-qa="q1"] [data-qa-status]', 'data-qa-status')) === '근거 부족', '6 상태 글자 「근거 부족」')
  ok((await text(p, '[data-qa="q1"] [data-qa-metrics]')).includes('36곳') || (await text(p, '[data-qa="q1"] [data-qa-metrics]')).includes('40곳'), '6 관련 계산값(연말 고객) 함께', await text(p, '[data-qa="q1"] [data-qa-metrics]'))
  await p.click('[data-more-toggle="qa-q1"]')
  ok((await text(p, '[data-qa="q1"]')).includes('시장 규모 미확인'), '6 아직 확인 안 된 부분을 그대로')
  await p.click('[data-qa="q1"] [data-qa-decision="scenario"]'); await p.waitForTimeout(600)
  ok(p.url().includes('sec=decisions'), '6 관련 결정으로 이동')
  await shot(p, 'st_pc_decisions')
  for (const sec of ['summary', 'scenarios', 'review', 'apply']) {
    await p.goto(`${W.BASE}/bizplan?tab=strategy&sec=${sec}`); await p.waitForTimeout(700)
    const m = await measure(p)
    ok(!m.overflow && m.small.length === 0, `6 PC ${sec} — 가로 밀림 · 작은 단추 없음`, m.small.join(','))
  }
  await shot(p, 'st_pc_apply_dir')
  await ctx.close()
}
{
  const { ctx, p } = await open(S, 'dir', '/bizplan?tab=strategy&sec=review')
  const m = await measure(p)
  ok(!m.overflow && m.small.length === 0, '6 폰 심사 대응 — 가로 밀림 · 작은 단추 없음', m.small.join(','))
  await p.goto(`${W.BASE}/bizplan?tab=strategy&sec=apply`); await p.waitForTimeout(700)
  const m2 = await measure(p)
  ok(!m2.overflow && m2.small.length === 0, '6 폰 적용 전 확인 — 가로 밀림 · 작은 단추 없음', m2.small.join(','))
  await shot(p, 'st_phone_apply')
  await ctx.close()
}

await b.close()
