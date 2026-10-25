import { chromium, EXEC } from './_pw.mjs'
import * as W from './walk_lib.mjs'
import * as F from './perf_fixtures.mjs'

//  제출 예정 사업계획서 (0146) — 신보 뉴본펭귄 공동작성 · 검토
//
//   대표님 · 이사님은 폰에서 읽고 확인 표시 · 수정요청을 남기고, 담당 한 분이 반영합니다.
//   이 검사는 실제 폰(390) · PC(1440) 크기에서 메뉴 → 목차 → 본문 → 수정요청 → 요청함 →
//   제안 반영(비교) → 충돌 → 버전 → 내보내기(검토 표시 없음)까지 손가락으로 눌러 봅니다.
//
//   ⚠ 서버(bizplan_*)는 여기서 **흉내**만 냅니다. 권한(참여자 · 담당/검토) · 요청이 문서를 안 바꿈 ·
//     기록 지우기 금지 · 주민번호 거절의 진짜 검증은 supabase/test/53_bizplan.sql 이 로컬
//     PostgreSQL 에서 합니다. 여기서는 화면이 그 약속대로 부르고 그리는지를 봅니다.
//   ⚠ 가짜 자료입니다(회사 숫자 아님). 저장소가 공개라 회사 초안은 여기에 넣지 않습니다.

const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  if (!c) process.exitCode = 1
}
const SHOTS = process.env.SHOTS
const b = await chromium.launch({ executablePath: EXEC })

const NAME = { admin: '대표', office: '이사', field: '기사' }

/** 사업계획서 서버 흉내 — 여러 창이 같은 문서 하나를 봅니다 */
function makeServer() {
  const now = () => new Date(Date.now() + S.seq++).toISOString()
  const S = {
    seq: 0,
    mode: 'ok', // ok | missing
    api: 147, // 147 = 확인 표시 판 번호 · 제출 전 점검 (0147) · 146 = 예전 서버
    members: {}, // role → 'editor' | 'reviewer'
    doc: { id: 'newborn2026', status: '초안 작성 중', version_label: 'V0.1', locked_label: '', updated_at: null, updated_by: '' },
    fields: {
      's1.company': { key: 's1.company', value: '시험용 회사', status: '초안 입력 완료', basis: { kind: '사실', source: '검사용', asOf: '2026-10-23' }, rev: 1, content_rev: 1, updated_at: '2026-10-23T01:00:00Z', updated_by: '검사' },
      's1.founded': { key: 's1.founded', value: '', status: '확인 필요', basis: { kind: '미확인', note: '등기부 대조' }, rev: 1, content_rev: 1, updated_at: '2026-10-23T01:00:00Z', updated_by: '검사' },
      's1.industry': { key: 's1.industry', value: '시험 업종 (예시)', status: '확인 필요', basis: {}, rev: 1, content_rev: 1, updated_at: '2026-10-23T01:00:00Z', updated_by: '검사' },
      's1.homepage': { key: 's1.homepage', value: 'www.○○.kr (예시)', status: '확인 필요', basis: {}, rev: 1, content_rev: 1, updated_at: '2026-10-23T01:00:00Z', updated_by: '검사' },
      'a.sales_items': {
        key: 'a.sales_items', status: '초안 입력 완료', basis: { kind: '추정' }, rev: 1, content_rev: 1, updated_at: '2026-10-23T01:00:00Z', updated_by: '검사',
        value: [{ item: '부문 가', y1: '100' }, { item: '부문 나', y1: '50' }],
      },
    },
    requests: [],
    checks: [],
    checkLog: [],
    survey: [{ respondent: 'ceo', status: 'submitted', updated_at: '2026-10-21T01:00:00Z', submitted_at: '2026-10-21T01:00:00Z', edited_by: '이사', answers: { q3: { choice: '40~50만원' }, q6: { choice: '적절함' } } }],
    versions: [{ id: 1, label: 'V0.1', note: '1차', is_submission: false, doc_status: '초안 작성 중', created_by: '검사', created_at: '2026-10-23T01:00:00Z', snapshot: {} }],
    revisions: [],
    calls: [],
    now,
  }
  return S
}
//  점검 규칙 — 검사에 필요한 만큼만 (진짜 목록 · 판단은 서버 bizplan_rules · bizplan_preflight · 54_bizplan_v2.sql)
const RULES = { required: ['s1.company', 's1.founded'], recommended: ['s1.homepage'], finance: [], plan: [], annex: [], by_hand: ['sign.date'] }
function preflightOf(S) {
  const items = []
  for (const q of S.requests.filter((x) => ['접수', '검토 중'].includes(x.status))) items.push({ level: 'block', code: 'open_request', key: q.key, msg: '처리 전 수정요청' })
  const blank = (v) => !v || (typeof v === 'string' ? !v.trim() : JSON.stringify(v) === '{}' || JSON.stringify(v) === '[]')
  for (const k of RULES.required) if (blank(S.fields[k]?.value)) items.push({ level: 'block', code: 'required_blank', key: k, msg: '필수 칸이 비어 있습니다' })
  for (const c of S.checks) if ((c.content_rev ?? 0) < (S.fields[c.key]?.content_rev ?? 0)) items.push({ level: 'warn', code: 'stale_confirm', key: c.key, msg: `변경 전 문장에 대한 표시(${c.name} ${c.mark})` })
  for (const f of Object.values(S.fields)) if (/예시|미정/.test(JSON.stringify(f.value))) items.push({ level: 'warn', code: 'placeholder', key: f.key, msg: '「예시」 등이 남아 있습니다' })
  items.push({ level: 'info', code: 'by_hand', key: null, msg: '주민등록번호 · 계좌 · 서명 20칸은 원본 서식에 직접' })
  return { at: S.now(), submit_month: '2026.10', blocks: items.filter((i) => i.level === 'block').length, warns: items.filter((i) => i.level === 'warn').length, items }
}
const LOCKED = ['sign.seal', 's2.ceo_rrn', 's2.ceo_addr', 's2.ceo_tel', 's2.ceo_house', 's2.ceo_estate', 's10.account', 's10.consent', 'x1.rrn', 'x1.phone', 'x1.house', 'x1.assets', 'x2.rrn', 'x2.phone', 'x2.house', 'x2.assets', 'x3.rrn', 'x3.phone', 'x3.house', 'x3.assets']

function wirePlan(ctx, S, role) {
  ctx.route('**/rest/v1/rpc/bizplan_*', async (r) => {
    const fn = r.request().url().split('/rpc/')[1].split('?')[0]
    const a = JSON.parse(r.request().postData() || '{}')
    const send = (status, v) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(v) })
    const deny = (m) => send(403, { code: '42501', message: m })
    S.calls.push({ fn, role, a })
    if (S.mode === 'missing') return send(404, { code: 'PGRST202', message: 'Could not find the function public.' + fn })
    //  서버 판단 — 관리자는 등록 전에도 검토, 사무실은 등록해야, 현장은 안 됨
    const my = ['admin', 'office'].includes(role) ? S.members[role] ?? (role === 'admin' ? 'reviewer' : null) : null
    if (fn === 'bizplan_my_role') return send(200, my)
    if (!my) return deny('사업계획서는 참여자로 등록된 계정만 열 수 있습니다.')
    const me = { id: `${role}-id`, name: NAME[role], title: role === 'admin' ? '대표' : '이사', role: my }
    const editorOnly = () => my !== 'editor' && deny('이 일은 사업계획 담당만 할 수 있습니다. 수정요청으로 남겨 주세요.')
    if (fn === 'bizplan_open')
      return send(200, {
        ...(S.api >= 147 ? { api: 147, rules: RULES } : {}),
        me, can_manage: S.api >= 147 ? role === 'admin' : role === 'admin' || my === 'editor', locked_keys: LOCKED, doc: S.doc,
        fields: Object.values(S.fields), requests: S.requests.map((q) => ({ ...q, mine: q.requester_role === role })), checks: S.checks,
        members: [], versions: S.versions.map(({ snapshot, ...v }) => v),
      })
    if (fn === 'bizplan_request_create') {
      const f = S.fields[a.p_key]
      const q = {
        id: `r${S.requests.length + 1}-0000-0000-0000-000000000000`, key: a.p_key, key_label: a.p_label, req_type: a.p_type, body: a.p_body, suggestion: a.p_suggestion,
        snapshot: f?.value ?? null, prev_status: f?.status ?? '작성 전', requester_name: me.name, requester_title: me.title, requester_role: role,
        created_at: S.now(), status: '접수', handler_name: '', handled_at: null, resolution: '', applied_revision: null, updated_at: S.now(),
      }
      S.requests.unshift(q)
      //  요청은 내용을 바꾸지 않음 — 상태만 「수정 요청 있음」
      if (!['의견 또는 질문', '최종 확인 요청'].includes(a.p_type)) {
        S.fields[a.p_key] = { ...(f ?? { key: a.p_key, value: '', basis: {}, rev: 0, updated_at: null, updated_by: '' }), status: '수정 요청 있음', rev: (f?.rev ?? 0) + 1 }
      }
      return send(200, q)
    }
    if (fn === 'bizplan_check') {
      const f = S.fields[a.p_key]
      const cr = f?.content_rev ?? 0
      if (S.api >= 147) {
        //  0147 — 내가 본 문장의 판 번호와 함께. 그사이 바뀌었으면 거절 (예전 모양 호출도 거절)
        if (!('p_content_rev' in a)) return send(400, { code: '22023', message: '앱을 새로 고쳐 주세요 — 확인 표시는 지금 보이는 내용의 판 번호와 함께 저장합니다.' })
        if (a.p_content_rev !== cr) return send(409, { code: 'PT409', message: `그사이 이 항목의 내용이 바뀌었습니다(판 ${a.p_content_rev} → ${cr}). 새 내용을 확인한 뒤 다시 표시해 주세요.` })
      }
      S.checks = S.checks.filter((c) => !(c.key === a.p_key && c.profile_id === me.id))
      const row = { key: a.p_key, profile_id: me.id, mark: a.p_mark, note: '', name: me.name, title: me.title, at: S.now(), content_rev: cr, value_snapshot: f?.value ?? '' }
      if (a.p_mark) S.checks.push(row)
      S.checkLog.unshift({ id: S.checkLog.length + 1, ...row })
      return send(200, { ok: true, at: S.now(), content_rev: cr })
    }
    if (fn === 'bizplan_preflight') {
      if (S.api < 147) return send(404, { code: 'PGRST202', message: 'Could not find the function public.bizplan_preflight' })
      return send(200, preflightOf(S))
    }
    if (fn === 'bizplan_survey') return send(200, S.survey)
    if (fn === 'bizplan_history') return send(200, { revisions: S.revisions.filter((x) => !a.p_key || x.key === a.p_key), request_log: [], check_log: S.checkLog.filter((x) => !a.p_key || x.key === a.p_key) })
    if (fn === 'bizplan_version_get') return send(200, S.versions.find((v) => v.id === a.p_id))
    if (fn === 'bizplan_members_list') return send(200, { members: [], candidates: [] })
    if (editorOnly()) return
    if (fn === 'bizplan_save_field') {
      if (LOCKED.includes(a.p_key)) return send(400, { code: '22023', message: '이 칸은 이 시스템에 저장하지 않습니다.' })
      if (/[0-9]{6}\s*-\s*[1-4][0-9]{6}/.test(JSON.stringify(a.p_value ?? ''))) return send(400, { code: '22023', message: '주민등록번호는 이 시스템에 저장하지 않습니다. 제출 직전 원본 서식에 직접 적어 주세요.' })
      const f = S.fields[a.p_key] ?? { key: a.p_key, value: '', status: '작성 전', basis: {}, rev: 0, content_rev: 0, updated_at: null, updated_by: '' }
      if (f.rev !== a.p_expected_rev) return send(200, { ok: false, conflict: true, field: f })
      const value = a.p_value ?? f.value
      const changed = JSON.stringify(value) !== JSON.stringify(f.value)
      let status = a.p_status ?? f.status
      if (S.api >= 147 && changed && status === '최종 확인 완료') status = '수정 반영 완료'
      const nf = { ...f, value, status, basis: a.p_basis ?? f.basis, rev: f.rev + 1, content_rev: (f.content_rev ?? 0) + (changed ? 1 : 0), updated_at: S.now(), updated_by: me.name }
      S.fields[a.p_key] = nf
      const stale = changed ? S.checks.filter((c) => c.key === a.p_key && (c.content_rev ?? 0) < nf.content_rev).length : 0
      S.revisions.unshift({ id: S.revisions.length + 1, key: a.p_key, before_value: f.value, after_value: nf.value, before_status: f.status, after_status: nf.status, reason: a.p_reason, request_id: a.p_request_id, version_label: S.doc.version_label, actor_name: me.name, actor_title: me.title, at: nf.updated_at })
      if (a.p_request_id) Object.assign(S.requests.find((q) => q.id === a.p_request_id), { status: '반영 완료', handler_name: me.name, handled_at: S.now() })
      if (S.doc.status === '제출본 확정') S.doc.status = '수정 중'
      return send(200, { ok: true, revision: S.revisions.length, stale_checks: stale, field: nf })
    }
    if (fn === 'bizplan_request_update') {
      const q = S.requests.find((x) => x.id === a.p_id)
      if (['보류', '반려'].includes(a.p_status) && (a.p_note ?? '').trim().length < 2) return send(400, { code: '22023', message: '까닭을 적어 주세요.' })
      Object.assign(q, { status: a.p_status, handler_name: me.name, handled_at: S.now(), resolution: a.p_note })
      return send(200, q)
    }
    if (fn === 'bizplan_submit' || fn === 'bizplan_version_create') {
      if (fn === 'bizplan_version_create' && a.p_submission && S.api >= 147) return send(400, { code: '22023', message: '제출본 확정은 「제출 전 점검」을 거쳐야 합니다.' })
      if (fn === 'bizplan_submit') {
        const pf = preflightOf(S)
        if (pf.blocks > 0) return send(400, { code: '22023', message: `제출본으로 확정할 수 없습니다 — 고쳐야 할 항목 ${pf.blocks}개` })
        if (pf.warns > 0 && (a.p_reason ?? '').trim().length < 10) return send(400, { code: '22023', message: '까닭을 10자 이상 적어 주세요.' })
        a.p_submission = true
        S.override = a.p_reason
      }
      if (a.p_submission && S.requests.some((q) => ['접수', '검토 중'].includes(q.status))) return send(400, { code: '22023', message: '처리하지 않은 수정요청이 있어 제출본으로 확정할 수 없습니다.' })
      const snapshot = JSON.parse(JSON.stringify(S.fields))
      S.versions.unshift({ id: S.versions.length + 1, label: a.p_label, note: a.p_note, is_submission: !!a.p_submission, doc_status: a.p_submission ? '제출본 확정' : S.doc.status, created_by: me.name, created_at: S.now(), snapshot, override_reason: fn === 'bizplan_submit' ? (a.p_reason ?? '') : '', approved_by: fn === 'bizplan_submit' ? me.name : '' })
      S.doc.version_label = a.p_label
      if (a.p_submission) Object.assign(S.doc, { status: '제출본 확정', locked_label: a.p_label })
      return send(200, { ok: true, id: S.versions[0].id, label: a.p_label })
    }
    if (fn === 'bizplan_doc_set') {
      S.doc.status = a.p_status
      return send(200, { ok: true })
    }
    return send(404, { code: 'PGRST202', message: 'unknown ' + fn })
  })
}

async function openStaff(S, path, { w = 390, role = 'admin', scale = 'lg' } = {}) {
  const phone = w < 700
  const ctx = await b.newContext({ viewport: { width: w, height: phone ? 844 : 900 }, isMobile: phone, hasTouch: phone, timezoneId: 'Asia/Seoul', permissions: ['clipboard-read', 'clipboard-write'], acceptDownloads: true })
  const state = { profile: { ...W.profileFor(role), name: NAME[role], font_scale: scale }, reqs: 0, writes: [], schemaVersion: 123 }
  W.wire(ctx, state)
  wirePlan(ctx, S, role)
  const p = await ctx.newPage()
  p.on('pageerror', (e) => ok(false, `화면 오류 없음 (${role} ${path})`, e.message))
  await p.addInitScript(([k, u]) => {
    localStorage.setItem(k, JSON.stringify({ access_token: 't', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u }))
    localStorage.setItem('beonemirae-ops:tour-seen', 'staff,field,client,demo')
  }, ['beonemirae-ops:auth', { id: F.UID, aud: 'authenticated', email: 'x@b.c', app_metadata: {}, user_metadata: {} }])
  await p.goto(`${W.BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await W.settle(p, state)
  await p.waitForTimeout(700)
  return { ctx, p, state }
}
const shot = async (p, n) => SHOTS && p.screenshot({ path: `${SHOTS}/${n}.png` })

/** 가로 밀림 · 작은 단추 (사업계획서 화면 안) */
const measure = (p, scope) =>
  p.evaluate((scope) => {
    const vis = (e) => { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden') return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 }
    const overflow = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    const small = [...document.querySelectorAll(`${scope} button, ${scope} input, ${scope} textarea`)]
      .filter(vis).filter((e) => e.type !== 'checkbox').filter((e) => e.getBoundingClientRect().height < 35.5).map((e) => (e.textContent || e.getAttribute('aria-label') || e.tagName).trim().slice(0, 14))
    return { overflow, small }
  }, scope)

// ═══ 1. 누가 보나 — 메뉴 단추 · 화면 ═══════════════════════════════════════════
{
  const S = makeServer()
  const { ctx, p } = await openStaff(S, '/more', { role: 'office' })
  ok((await p.locator('[data-more-bizplan]').count()) === 0, '1 사무실 · 등록 전 — 더보기에 단추 없음')
  ok((await p.locator('[data-more-survey]').count()) === 1, '1 사전 설문 단추는 그대로')
  await p.goto(`${W.BASE}/bizplan`); await p.waitForTimeout(1200)
  ok((await p.getAttribute('[data-bizplan-fail]', 'data-bizplan-fail')) === 'denied', '1 사무실 · 등록 전 — 주소로 열어도 서버가 막음')
  await ctx.close()
}
{
  const S = makeServer()
  S.members.office = 'reviewer'
  const { ctx, p } = await openStaff(S, '/more', { role: 'office' })
  ok((await p.locator('[data-more-bizplan]').count()) === 1, '1 사무실 · 참여자 — 더보기에 「제출 예정 사업계획서」')
  const order = await p.evaluate(() => {
    const a = document.querySelector('[data-more-survey]'); const c = document.querySelector('[data-more-bizplan]')
    return !!(a && c && a.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING)
  })
  ok(order, '1 설문 바로 다음 자리')
  await ctx.close()
}
{
  const S = makeServer()
  const { ctx, p } = await openStaff(S, '/bizplan', { role: 'field' })
  ok((await p.locator('[data-bizplan-page]').count()) === 0, '1 현장 — 화면 안 열림')
  ok(!S.calls.some((c) => c.fn === 'bizplan_open'), '1 현장 — 서버에 열기 요청도 안 보냄')
  await ctx.close()
}
{
  const S = makeServer()
  S.mode = 'missing'
  const { ctx, p } = await openStaff(S, '/bizplan', { role: 'admin' })
  ok((await p.getAttribute('[data-bizplan-fail]', 'data-bizplan-fail')) === 'missing', '1 SQL 전 — 「서버 준비 전」 안내 (가짜 화면 없음)')
  ok(((await p.textContent('body')) ?? '').includes('PROPOSAL_0146'), '1 무엇을 실행할지 알려 줌')
  await ctx.close()
}
{
  const S = makeServer()
  const { ctx, p } = await openStaff(S, '/', { role: 'admin', w: 1440, scale: 'normal' })
  ok((await p.locator('[data-side-bizplan]').count()) === 1, '1 PC 사이드바 — 설문 아래 사업계획서')
  await ctx.close()
}

// ═══ 2. 이사님(폰 · 검토) — 목차 → 본문 → 항목 → 수정요청 ═════════════════════════
const S = makeServer()
S.members.office = 'reviewer'
S.members.admin = 'editor'
{
  const { ctx, p } = await openStaff(S, '/bizplan', { role: 'office' })
  ok((await p.getAttribute('[data-bizplan-page]', 'data-bizplan-role')) === 'reviewer', '2 이사님 = 검토')
  ok((await p.textContent('[data-sum-written]')) === '4', '2 작성 칸 수 — 내용 있는 칸만 (빈 「확인 필요」 칸은 미작성)')
  //  대표님 · 이사님은 「확인 · 결정」부터 — 사업계획서 전문은 뒤 탭 (대표님 요청)
  ok((await p.getAttribute('[data-bizplan-tab="review"]', 'aria-selected')) === 'true' && (await p.locator('[data-review-home]').count()) === 1, '2 검토는 「확인 · 결정」 화면부터')
  ok((await p.locator('[data-bizplan-tab]').evaluateAll((es) => es.map((e) => e.dataset.bizplanTab).join(','))) === 'review,strategy,inbox,doc,versions,export', '2 탭 순서 — 확인·결정 · 사업화전략 · 요청함 · 사업계획서 전문 · 기록 · 내보내기')
  ok((await p.locator('[data-kpi]').count()) === 0 && (await p.locator('[data-sum-progress]').count()) === 1, '2 검토 화면 머리는 간단히 — 진행률만 (네 칸 숫자는 담당 화면)')
  await p.click('[data-bizplan-tab="doc"]'); await p.waitForTimeout(400)
  ok(/[?&]tab=doc\b/.test(p.url()), '2 전문 탭 — 주소에 남아 새로 고쳐도 그대로', p.url())
  ok((await p.getAttribute('[data-step="toc"]', 'aria-selected')) === 'true', '2 폰 전문은 ① 목차부터')
  //  표지 · 확약(동의 · 확약 문구)과 겹치는 참고사항(ref1)은 목차 · 본문에서 뺌 (대표님 요청) — 21 − 2
  ok((await p.locator('[data-toc]').count()) === 19 && (await p.locator('[data-toc="cover"], [data-toc="ref1"]').count()) === 0 && (await p.locator('[data-toc="ref2"]').count()) === 1,
    '2 목차 19개 — 표지 · 확약 · 겹치는 참고사항은 뺌 (기술역량평가 작성요령은 남김)')
  const m0 = await measure(p, '[data-bizplan-page]')
  ok(!m0.overflow, '2 폰 — 가로 밀림 없음')
  ok(m0.small.length === 0, '2 폰 — 손가락 단추 크기', m0.small.join(','))
  await shot(p, 'bizplan_phone_toc')
  await p.click('[data-toc="s1"]'); await p.waitForTimeout(400)
  ok((await p.getAttribute('[data-step="body"]', 'aria-selected')) === 'true', '2 목차 → ② 본문')
  ok((await p.locator('[data-card-edit]').count()) === 0, '2 검토에게 편집 단추 없음')
  ok((await p.getAttribute('[data-field-card="s1.founded"]', 'data-field-status')) === '확인 필요', '2 칸마다 상태 글자')
  await p.click('[data-card-detail="s1.founded"]'); await p.waitForTimeout(400)
  ok((await p.getAttribute('[data-step="panel"]', 'aria-selected')) === 'true', '2 항목 → ③ 수정요청')
  const y = await p.evaluate(() => document.querySelector('[data-field-panel]').getBoundingClientRect().top)
  ok(y < 300, '2 ③ 단계로 가면 검토 칸이 화면 위쪽에 (요약을 다시 내려 보지 않음)', String(Math.round(y)))
  await p.click('[data-panel-request]'); await p.waitForTimeout(300)
  ok((await p.textContent('[data-req-target]'))?.includes('설립(개업)일자'), '2 수정 대상 항목 자동')
  ok(await p.isDisabled('[data-req-send]'), '2 유형 · 내용 전에는 보내기 꺼짐')
  await p.click('[data-req-type="사실관계 수정"]')
  await p.fill('[data-req-body]', '등기부 기준 날짜로 적어 주세요')
  await p.fill('[data-req-suggestion]', '2000-01-01 (검사용)')
  await shot(p, 'bizplan_phone_request')
  await p.click('[data-req-send]'); await p.waitForTimeout(900)
  ok(S.requests.length === 1 && S.requests[0].requester_name === '이사', '2 요청 저장 · 요청자 자동')
  ok(S.fields['s1.founded'].value === '', '2 요청만으로 내용은 그대로')
  ok((await p.getAttribute('[data-field-panel="s1.founded"] [data-status-badge]', 'data-status-badge')) === '수정 요청 있음', '2 항목 상태 → 수정 요청 있음')
  //  확인 표시
  await p.click('[data-check-pick="동의"]'); await p.waitForTimeout(600)
  ok(S.checks.some((c) => c.key === 's1.founded' && c.mark === '동의' && c.name === '이사'), '2 「동의」 표시 — 누가 · 언제')
  await ctx.close()
}

// ═══ 3. 대표님(PC · 담당) — 요청함 → 제안 반영 · 비교 → 반영 완료 ═══════════════════
{
  const { ctx, p } = await openStaff(S, '/bizplan', { role: 'admin', w: 1440, scale: 'normal' })
  ok((await p.getAttribute('[data-bizplan-page]', 'data-bizplan-role')) === 'editor', '3 대표(이 검사에서는 담당)')
  ok((await p.locator('[data-bizplan-toc-pane]').count()) === 1 && (await p.locator('[data-bizplan-panel-pane]').count()) === 1, '3 PC 3칸 — 목차 · 본문 · 검토 칸')
  const m1 = await measure(p, '[data-bizplan-page]')
  ok(!m1.overflow, '3 PC — 가로 밀림 없음')
  ok((await p.textContent('[data-tab-badge]')) === '1', '3 요청함 탭에 처리 전 1')
  await shot(p, 'bizplan_pc_doc')
  await p.click('[data-bizplan-tab="inbox"]'); await p.waitForTimeout(300)
  const id = S.requests[0].id
  await p.click(`[data-request-card="${id}"] [data-req-act="apply"]`); await p.waitForTimeout(400)
  ok((await p.inputValue('[data-edit-value]')) === '2000-01-01 (검사용)', '3 편집 창에 제안 문장')
  ok((await p.locator('[data-diff-op="add"]').count()) === 1 && (await p.locator('[data-diff-op="del"]').count()) === 0, '3 비교 — 빈 칸이던 것은 지움 줄 없이')
  await p.click('[data-edit-save]'); await p.waitForTimeout(900)
  ok(S.requests[0].status === '반영 완료' && S.fields['s1.founded'].value === '2000-01-01 (검사용)', '3 저장 → 요청 반영 완료')
  ok(S.calls.some((c) => c.fn === 'bizplan_save_field' && c.a.p_request_id === id), '3 저장이 요청과 이어짐')
  //  충돌 — 창을 연 사이 다른 창이 저장
  await p.click('[data-bizplan-tab="doc"]'); await p.waitForTimeout(300)
  await p.click('[data-toc="s1"]'); await p.waitForTimeout(300)
  ok((await p.getAttribute('[data-section="s1"]', 'data-section-open')) === 'y', '3 목차에서 장을 누르면 펼쳐짐')
  await p.click('[data-card-edit="s1.industry"]'); await p.waitForTimeout(300)
  S.fields['s1.industry'] = { ...S.fields['s1.industry'], value: '다른 창 내용', rev: S.fields['s1.industry'].rev + 1, updated_by: '이사' }
  await p.fill('[data-edit-value]', '이 창 내용')
  await p.click('[data-edit-save]'); await p.waitForTimeout(700)
  ok((await p.locator('[data-edit-conflict]').count()) === 1, '3 충돌 — 저장하지 않고 두 내용을 보여 줌')
  ok(S.fields['s1.industry'].value === '다른 창 내용', '3 조용히 덮어쓰지 않음')
  await p.click('[data-conflict-keep-mine]'); await p.waitForTimeout(800)
  ok(S.fields['s1.industry'].value === '이 창 내용', '3 「확인했고 내 것으로」를 눌러야만 저장')
  ok((await p.locator('[data-edit-conflict]').count()) === 0, '3 저장 뒤 창 닫힘')
  //  주민번호 모양 — 서버 거절 문구가 그대로
  await p.click('[data-card-edit="s1.company"]'); await p.waitForTimeout(300)
  await p.fill('[data-edit-value]', '시험 800101-1234567')
  await p.click('[data-edit-save]'); await p.waitForTimeout(600)
  ok(((await p.textContent('[data-edit-error]')) ?? '').includes('주민등록번호'), '3 주민번호 — 거절 문구')
  await p.keyboard.press('Escape'); await p.waitForTimeout(300)
  //  직접 기입 칸은 편집 단추 없음
  await p.click('[data-toc="s2"]'); await p.waitForTimeout(300)
  ok((await p.locator('[data-card-edit="s2.ceo_rrn"]').count()) === 0 && (await p.locator('[data-field-card="s2.ceo_rrn"] [data-offline-field]').count()) === 1, '3 주민번호 칸 — 저장 안 함 · 직접 기입')
  await ctx.close()
}

// ═══ 3b. 동의한 뒤 문장이 바뀌면 — 재확인 필요 (0147) ══════════════════════════════
//   이사님은 2절에서 s1.founded(빈 칸 · 판 1)에 「동의」 → 3절에서 담당이 「2000-01-01」로 바꿈(판 2)
{
  const { ctx, p } = await openStaff(S, '/bizplan', { role: 'office' })
  ok(S.fields['s1.founded'].content_rev === 2 && S.checks.find((c) => c.key === 's1.founded').content_rev === 1, '3b 서버 — 동의는 판 1 에 그대로 · 문장은 판 2')
  ok((await p.getAttribute('[data-sum-recheck]', 'data-sum-recheck')) === '1', '3b 머리 — 「재확인 필요 1항목」')
  await p.click('[data-sum-recheck]'); await p.waitForTimeout(500)
  ok((await p.getAttribute('[data-filter="재확인 필요"]', 'aria-pressed')) === 'true' && (await p.locator('[data-field-card]').count()) === 1, '3b 누르면 그 항목만 (거르기 「재확인 필요」)')
  ok((await p.getAttribute('[data-field-card="s1.founded"]', 'data-field-recheck')) === '1', '3b 카드에 「재확인 필요」')
  ok((await p.locator('[data-field-card="s1.founded"] [data-check-stale="동의"]').count()) === 1 && (await p.locator('[data-field-card="s1.founded"] [data-check-chip]').count()) === 0,
    '3b 옛 동의는 「변경 전 문장」으로 따로 — 지금 문장의 동의로 보이지 않음')
  await p.click('[data-card-detail="s1.founded"]'); await p.waitForTimeout(400)
  ok((await p.locator('[data-my-recheck]').count()) === 1 && (await p.locator('[data-my-recheck] [data-diff-op="add"]').count()) >= 1, '3b 검토 칸 — 내가 동의한 문장 ↔ 지금 문장 비교')
  ok((await p.getAttribute('[data-check-pick="동의"]', 'aria-pressed')) === 'false', '3b 「동의」 단추가 눌린 것으로 보이지 않음')
  await shot(p, 'bizplan_phone_recheck')
  await p.click('[data-check-pick="동의"]'); await p.waitForTimeout(800)
  const c = S.checks.find((x) => x.key === 's1.founded' && x.name === '이사')
  ok(c.content_rev === 2 && c.value_snapshot === '2000-01-01 (검사용)', '3b 다시 동의 — 판 2(지금 문장)에 대한 동의')
  ok(S.checkLog.filter((x) => x.key === 's1.founded' && x.mark === '동의').map((x) => x.content_rev).sort().join(',') === '1,2', '3b 기록 — 판 1 동의 · 판 2 동의 둘 다 남음')
  ok((await p.locator('[data-my-recheck]').count()) === 0 && (await p.getAttribute('[data-check-pick="동의"]', 'aria-pressed')) === 'true', '3b 재확인 끝 — 표시 사라짐')
  //  옛 화면에서 누른 동의 — 그사이 담당이 고쳤으면 서버가 거절하고 새 문장을 보여 줌
  await p.click('[data-panel-back]'); await p.waitForTimeout(200)
  await p.click('[data-filter="전체"]'); await p.waitForTimeout(200)
  await p.click('[data-card-detail="s1.company"]'); await p.waitForTimeout(300)
  S.fields['s1.company'] = { ...S.fields['s1.company'], value: '다른 창에서 바뀐 회사명', rev: S.fields['s1.company'].rev + 1, content_rev: S.fields['s1.company'].content_rev + 1 }
  await p.click('[data-check-pick="동의"]'); await p.waitForTimeout(900)
  ok(!S.checks.some((x) => x.key === 's1.company' && x.name === '이사'), '3b 보지 않은 문장에는 동의가 붙지 않음 (서버 거절)')
  ok(((await p.textContent('[data-bizplan-toast]')) ?? '').includes('새 문장을 확인'), '3b 안내 — 새 문장을 확인한 뒤 다시')
  ok(((await p.textContent('[data-field-panel="s1.company"] [data-panel-value]')) ?? '').includes('다른 창에서 바뀐 회사명'), '3b 검토 칸의 「지금 내용」이 새 문장으로 바뀜')
  await p.click('[data-check-pick="동의"]'); await p.waitForTimeout(800)
  ok(S.checks.some((x) => x.key === 's1.company' && x.name === '이사' && x.content_rev === S.fields['s1.company'].content_rev), '3b 새 문장을 본 뒤 동의 — 그 판에 대해')
  await ctx.close()
}

// ═══ 3c. 문서 정리 — 장 접기 · 대표님 · 이사님은 자금 위주 · 표지 · 확약 숨김 ════════════
{
  const S2 = makeServer()
  S2.members.office = 'reviewer'
  S2.fields['s9.funding'] = { key: 's9.funding', value: { own: '10', loan: '20' }, status: '확인 필요', basis: {}, rev: 1, content_rev: 1, updated_at: '2026-10-23T01:00:00Z', updated_by: '검사' }
  S2.fields['cover.company'] = { key: 'cover.company', value: '시험용 회사', status: '확인 필요', basis: {}, rev: 1, content_rev: 1, updated_at: '2026-10-23T01:00:00Z', updated_by: '검사' }
  S2.members.admin = 'editor'
  S2.fields['s10.bank'] = { key: 's10.bank', value: '시험은행', status: '초안 입력 완료', basis: {}, rev: 1, content_rev: 1, updated_at: '2026-10-23T01:00:00Z', updated_by: '검사' }
  const { ctx, p } = await openStaff(S2, '/bizplan', { role: 'office' })
  //  첫 화면 「확인 · 결정」 — 고르실 것(사업화전략) · 자금 장 두 개만, 목차 · 거르기 없이
  ok((await p.locator('[data-review-decisions]').count()) === 1 && (await p.locator('[data-review-decide]').count()) === 1, '3c 확인·결정 ① 사업화전략 결정으로 가는 단추')
  ok((await p.locator('[data-review-decisions-fail]').count()) === 1, '3c 결정 현황을 못 받으면 그렇다고 (지어낸 숫자 없음)')
  ok((await p.locator('[data-section]').evaluateAll((es) => es.map((e) => e.dataset.section).join(','))) === 's9,a2', '3c 확인·결정 ② 자금 장 두 개(9번 · 별첨 1차년도 소요자금)만')
  ok((await p.locator('[data-section][data-section-open="n"]').count()) === 0 && (await p.locator('[data-section-toggle]:not([disabled])').count()) === 0, '3c 자금 장은 늘 펼친 채 (접기 없음)')
  ok((await p.locator('[data-bizplan-toc], [data-bizplan-filters], [data-bizplan-steps]').count()) === 0, '3c 목차 · 거르기 · 단계 띠 없음 — 간단히')
  ok((await p.getAttribute('[data-review-money-mine]', 'data-review-money-mine')) === '0', '3c 내 확인 0칸부터')
  const m0 = await measure(p, '[data-bizplan-page]')
  ok(!m0.overflow && m0.small.length === 0, '3c 확인·결정 폰 — 가로 밀림 · 작은 단추 없음', m0.small.join(','))
  await shot(p, 'bizplan_phone_review')
  await p.click('[data-card-detail="s9.funding"]'); await p.waitForTimeout(400)
  ok((await p.locator('[data-field-panel="s9.funding"]').count()) === 1 && /[?&]tab=review\b/.test(p.url()), '3c 자금 칸을 누르면 그 자리에서 검토 칸 (전문으로 넘어가지 않음)', p.url())
  await p.click('[data-check-pick="동의"]'); await p.waitForTimeout(700)
  ok(S2.checks.some((c) => c.key === 's9.funding' && c.mark === '동의' && c.name === '이사'), '3c 확인·결정에서 「동의」 — 기존 확인 표시 그대로')
  await p.click('[data-panel-back]'); await p.waitForTimeout(400)
  ok((await p.getAttribute('[data-review-money-mine]', 'data-review-money-mine')) === '1', '3c 내 확인 1칸')
  ok(S2.fields['s9.funding'].value.own === '10', '3c 확인 표시만으로 본문은 그대로')
  await p.click('[data-review-fulldoc]'); await p.waitForTimeout(400)
  ok((await p.getAttribute('[data-bizplan-tab="doc"]', 'aria-selected')) === 'true', '3c 「사업계획서 전문 보기」 → 전문 탭')
  await p.click('[data-step="body"]'); await p.waitForTimeout(400)
  ok((await p.locator('[data-review-focus]').count()) === 1 && (await p.locator('[data-review-focus-go]').count()) === 2, '3c 이사님 — 맨 위 「정해 주시길 부탁드리는 부분」 (9번 · 별첨 소요자금)')
  ok((await p.getAttribute('[data-section="s9"]', 'data-section-open')) === 'y' && (await p.getAttribute('[data-section="a2"]', 'data-section-open')) === 'y', '3c 자금소요 · 조달계획 장은 처음부터 펼쳐짐')
  ok((await p.getAttribute('[data-section="s1"]', 'data-section-open')) === 'n' && (await p.locator('[data-field-card="s1.company"]').count()) === 0, '3c 나머지 장은 접혀 있음 (머리만)')
  ok(/작성 \d+\/\d+/.test(await p.locator('[data-section="s1"] [data-section-toggle]').textContent()), '3c 접힌 머리에도 작성 칸 수')
  ok((await p.locator('[data-section="cover"], [data-section="ref1"]').count()) === 0, '3c 표지 · 확약 · 겹치는 참고사항 — 본문에 없음')
  ok((await p.locator('[data-field-card="s9.funding"]').count()) === 1, '3c 전문에서도 9번 자금조달계획 칸은 펼쳐져 있음')
  await p.click('[data-section-toggle="s10"]'); await p.waitForTimeout(300)
  ok((await p.locator('[data-field-card="s10.bank"]').count()) === 1 && (await p.locator('[data-field-card="s10.consent"], [data-field-card="s10.notice"]').count()) === 0, '3c 입금동의 서명 · 원본 안내문 칸은 전문에서도 뺌')
  await p.click('[data-section-toggle="s10"]'); await p.waitForTimeout(300)
  const m = await measure(p, '[data-bizplan-page]')
  ok(!m.overflow && m.small.length === 0, '3c 폰 — 가로 밀림 · 작은 단추 없음', m.small.join(','))
  await shot(p, 'bizplan_phone_focus')
  await p.click('[data-section-toggle="s1"]'); await p.waitForTimeout(300)
  ok((await p.getAttribute('[data-section="s1"]', 'data-section-open')) === 'y' && (await p.locator('[data-field-card="s1.company"]').count()) === 1, '3c 장 머리를 누르면 펼쳐짐')
  await p.reload(); await p.waitForTimeout(1200)
  await p.click('[data-step="body"]'); await p.waitForTimeout(400)
  ok((await p.getAttribute('[data-section="s1"]', 'data-section-open')) === 'y', '3c 펼친 장은 이 기기에서 기억')
  await p.click('[data-close-all]'); await p.waitForTimeout(300)
  ok((await p.locator('[data-section][data-section-open="y"]').count()) === 0, '3c 모두 접기')
  await p.click('[data-filter="확인 필요"]'); await p.waitForTimeout(300)
  ok((await p.locator('[data-field-card="s1.industry"]').count()) === 1 && (await p.locator('[data-field-card="s9.funding"]').count()) === 1, '3c 거르기 중에는 맞는 칸이 있는 장이 저절로 펼쳐짐')
  ok((await p.locator('[data-field-card="cover.company"]').count()) === 0, '3c 감춘 표지 칸은 거르기에도 안 나옴')
  await ctx.close()
  //  제출 전 점검 등에서 표지 칸으로 가면 — 그때만 보임
  const o = await openStaff(S2, '/bizplan?f=cover.company', { role: 'office', w: 1440, scale: 'normal' })
  ok((await o.p.locator('[data-section="cover"]').count()) === 1 && (await o.p.locator('[data-field-card="cover.company"]').count()) === 1, '3c 표지 칸으로 바로 가면 그 장만 보임 (자료는 그대로)')
  ok((await o.p.locator('[data-review-focus]').count()) === 1, '3c PC 이사님도 안내')
  await o.p.click('[data-bizplan-tab="export"]'); await o.p.waitForTimeout(500)
  ok(((await o.p.textContent('[data-plan-document]')) ?? '').includes('확약'), '3c 내보내기(원본 순서)에는 표지 · 확약이 그대로')
  await o.ctx.close()
  //  PC 이사님 — 확인·결정은 두 칸(본문 | 검토 칸), 목차 없이
  const r = await openStaff(S2, '/bizplan', { role: 'office', w: 1440, scale: 'normal' })
  ok((await r.p.locator('[data-review-home]').count()) === 1 && (await r.p.locator('[data-bizplan-panel-pane]').count()) === 1 && (await r.p.locator('[data-bizplan-toc-pane]').count()) === 0, '3c PC 확인·결정 — 본문 | 검토 칸 (목차 없음)')
  await r.p.click('[data-card-detail="a.funds"]'); await r.p.waitForTimeout(400)
  ok((await r.p.locator('[data-bizplan-panel-pane] [data-field-panel="a.funds"]').count()) === 1, '3c PC 별첨 소요자금 칸 → 오른쪽 검토 칸')
  const m2 = await measure(r.p, '[data-bizplan-page]')
  ok(!m2.overflow, '3c PC 확인·결정 — 가로 밀림 없음')
  await shot(r.p, 'bizplan_pc_review')
  await r.p.click('[data-bizplan-tab="doc"]'); await r.p.waitForTimeout(400)
  ok((await r.p.locator('[data-bizplan-toc-pane]').count()) === 1 && (await r.p.locator('[data-field-panel="a.funds"]').count()) === 1, '3c 전문으로 가도 고른 칸은 그대로')
  await r.ctx.close()
  const e = await openStaff(S2, '/bizplan', { role: 'admin', w: 1440, scale: 'normal' })
  ok((await e.p.getAttribute('[data-bizplan-tab="doc"]', 'aria-selected')) === 'true' && (await e.p.locator('[data-kpi]').count()) === 4, '3c 담당은 전문부터 · 머리 네 칸 숫자 그대로')
  ok((await e.p.locator('[data-review-focus]').count()) === 0, '3c 담당 화면에는 안내 띠 없음')
  await e.p.click('[data-open-all]'); await e.p.waitForTimeout(300)
  ok((await e.p.locator('[data-section][data-section-open="n"]').count()) === 0, '3c 모두 펼치기')
  await e.ctx.close()
}

// ═══ 4. 거르기 · 버전 · 내보내기 ═══════════════════════════════════════════════
{
  const { ctx, p } = await openStaff(S, '/bizplan', { role: 'admin', w: 1440, scale: 'normal' })
  await p.click('[data-filter="미작성"]'); await p.waitForTimeout(300)
  ok((await p.locator('[data-field-card="s1.company"]').count()) === 0, '4 「미작성」 — 쓴 칸은 숨김')
  await p.click('[data-filter="전체"]'); await p.waitForTimeout(200)
  //  제출본 확정 — 제출 전 점검(0147): 차단 0 · 확인 항목은 예외 승인(확인 + 까닭)
  await p.click('[data-bizplan-tab="versions"]'); await p.waitForTimeout(300)
  await p.click('[data-version-submission]'); await p.waitForTimeout(600)
  ok((await p.textContent('[data-version-save]'))?.includes('V1.0'), '4 제출본 이름 V1.0')
  ok((await p.getAttribute('[data-preflight]', 'data-preflight')) === '0/1' && (await p.locator('[data-preflight-code="placeholder"]').count()) === 1, '4 점검 — 차단 0 · 확인 1 (「예시」 남은 칸)')
  ok(await p.isDisabled('[data-version-save]'), '4 확인 항목이 있으면 예외 승인 전에는 확정 못 함')
  await p.click('[data-submit-ack]')
  await p.fill('[data-submit-reason]', '짧음')
  ok(await p.isDisabled('[data-version-save]'), '4 까닭 10자 미만 — 확정 못 함')
  await p.fill('[data-submit-reason]', '홈페이지 주소는 제출 직전 원본에 적기로 함')
  await p.waitForTimeout(150)
  ok(!(await p.isDisabled('[data-version-save]')), '4 확인 + 까닭 10자 이상 → 확정 단추 켜짐')
  await shot(p, 'bizplan_pc_submit')
  await p.click('[data-version-save]'); await p.waitForTimeout(800)
  ok(S.doc.status === '제출본 확정' && S.doc.locked_label === 'V1.0', '4 제출본 확정')
  ok(S.calls.some((c) => c.fn === 'bizplan_submit' && c.a.p_reason === '홈페이지 주소는 제출 직전 원본에 적기로 함'), '4 점검을 거치는 확정(bizplan_submit) · 까닭 함께')
  ok(((await p.textContent('[data-version-row="V1.0"] [data-version-override]')) ?? '').includes('홈페이지 주소는'), '4 버전 목록에 예외 승인 까닭')
  //  내보내기 — 검토 표시 없음 · 원본 순서 · 합계
  await p.click('[data-bizplan-tab="export"]'); await p.waitForTimeout(400)
  const doc = p.locator('[data-export-doc]')
  ok((await doc.locator('[data-status-badge], [data-basis], [data-check-chip]').count()) === 0, '4 제출본 미리보기 — 상태 · 근거 · 확인 표시 없음')
  const order = await doc.locator('[data-doc-section]').evaluateAll((els) => els.map((e) => e.getAttribute('data-doc-section')).join(','))
  ok(order === 'cover,s1,s2,s3,s4,s5,s6,s7,s8,s9,s10,s11,x1,x2,x3,a1,a2,a3,a4', '4 원본 순서', order)
  ok(((await doc.textContent()) ?? '').includes('150'), '4 표 합계 (100 + 50)')
  ok((await p.getAttribute('[data-export-holders]', 'data-export-holders')) === '1', '4 「(예시)」 남은 칸 경고')
  ok((await p.locator('[data-bizplan-export] [data-preflight]').count()) === 1, '4 내보내기에도 서버 점검 결과')
  await p.click('[data-export-copy]'); await p.waitForTimeout(300)
  const clip = await p.evaluate(() => navigator.clipboard.readText())
  ok(clip.includes('■ 1. 기업체 현황') && !clip.includes('확인 필요') && !clip.includes('수정 요청'), '4 전체 복사 — 원본 순서 · 검토 표시 없음')
  await shot(p, 'bizplan_pc_export')
  await ctx.close()
}

// ═══ 5. 사용자 피드백 › 사업계획서 수정요청 ════════════════════════════════════════
{
  const { ctx, p } = await openStaff(S, '/dev-requests?tab=bizplan', { role: 'admin', w: 390 })
  ok((await p.locator('[data-devreq-view]').count()) === 3, '5 요청함 칸 셋 (설문 · 사업계획서 · 피드백)')
  ok((await p.locator('[data-devreq-bizplan] [data-bizplan-inbox]').count()) === 1, '5 사업계획서 수정요청 목록')
  await p.click('[data-inbox-view="전체"]'); await p.waitForTimeout(200)
  await p.click('[data-request-go]'); await p.waitForTimeout(1200)
  ok(p.url().includes('/bizplan?f=s1.founded'), '5 위치로 이동 → 문서의 그 항목')
  ok((await p.getAttribute('[data-step="body"]', 'aria-selected')) === 'true', '5 폰 — 본문 단계에서 그 항목')
  await ctx.close()
}
{
  const S2 = makeServer()
  const { ctx, p } = await openStaff(S2, '/dev-requests', { role: 'admin', w: 1280, scale: 'normal' })
  ok((await p.getAttribute('[data-devreq-view="survey"]', 'aria-selected')) === 'true', '5 기본 칸은 여전히 사전 설문')
  await p.click('[data-devreq-view="feedback"]'); await p.waitForTimeout(400)
  ok(p.url().includes('tab=feedback'), '5 피드백 칸 그대로')
  await ctx.close()
}

await b.close()
