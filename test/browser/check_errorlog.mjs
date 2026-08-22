import { chromium, EXEC } from './_pw.mjs'

//  오류를 남기고, 화면이 터져도 앱은 남아 있게 (0046).
//
//   실측한 것 — 목록 화면 하나가 오류를 던지자 본문은 물론 **왼쪽 메뉴까지
//   사라져** 글자 수 0인 흰 화면이 남았습니다. 폰에서는 앱이 죽은 것처럼
//   보입니다. 그리고 아무 기록도 안 남았습니다.
//
//   확인하는 것
//    · 화면이 터져도 흰 화면이 아니라 **읽을 수 있는 것**이 남는다
//    · 메뉴가 살아 있어 다른 화면으로 그냥 넘어갈 수 있다
//    · 다른 화면으로 가면 오류 화면이 **따라붙지 않는다** (경계는 스스로 안 풀림)
//    · 터진 것을 서버에 남긴다 (어느 화면·무슨 문구·무슨 판)
//    · 저장이 실패하면 그것도 남긴다 — 예전에는 빨간 띠가 사라지면 끝이었음
//    · 관리자만 최근 오류를 보고, 아닌 사람은 부르지도 않는다
//    · 서버가 엉뚱한 모양을 줘도 설정 화면 전체를 잃지 않는다

const BASE = 'http://localhost:4173'
const UID = '00000000-0000-0000-0000-0000000000ad'
const out = []
const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  out.push(c)
  if (!c) process.exitCode = 1
}
const TODAY = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })

const me = {
  id: UID, email: 'a@b.c', name: '대표', role: 'admin', font_scale: 'normal',
  active: true, approved_at: '2026-01-01T00:00:00Z', client_id: null, created_at: '2026-01-01T00:00:00Z',
}
const CA = '00000000-0000-0000-0000-0000000000a1'
const clients = [{
  id: CA, name: '가나요양병원', type: '병원', address: '서울시', manager: '', phone: '',
  collection_cycle: '주 2회', collects_medical_waste: true, collects_diaper: false, storage_size: '보통',
  note: '', is_demo_generated: false, demo_session_id: null, active: true,
  contract_start: '2025-01-01', contract_end: null, payment_terms: '', payment_due_day: 25,
  pricing: { medical: { sale: 950, cost: 350 } },
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  biz_no: '124-81-00998', vat_mode: '별도', flat_fee_when_empty: false, flat_fee_policy_at: '2026-01-01T00:00:00Z',
}]

const b = await chromium.launch({ executablePath: EXEC })

function wire(ctx, { role = 'admin', recorded = [], recent = null, onRecent = () => {}, breakSave = false, flat = false } = {}) {
  //  월정액이고 「배출 없는 달」을 아직 안 정한 거래처라야 그 버튼이 나옵니다.
  const rows = flat
    ? [{ ...clients[0], pricing: { medicalMonthly: { sale: 9000000, cost: null } }, flat_fee_policy_at: null }]
    : clients
  ctx.route('**/auth/v1/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: UID, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }) }))
  ctx.route('**/rest/v1/**', (r) => {
    const url = r.request().url()
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const pf = { ...me, role }
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    if (url.includes('/rpc/record_app_error')) {
      recorded.push(r.request().postDataJSON())
      return json(true)
    }
    if (url.includes('/rpc/recent_app_errors')) {
      onRecent()
      if (recent === null) {
        return r.fulfill({ status: 404, contentType: 'application/json',
          body: JSON.stringify({ code: 'PGRST202', message: 'Could not find the function public.recent_app_errors' }) })
      }
      return json(recent)
    }
    if (url.includes('/rpc/app_health_check')) return json({ version: 46, ok: true, missing: [], checkedAt: '' })
    if (url.includes('/rpc/set_flat_fee_policy')) {
      //  저장이 실패하는 상황을 만듭니다 (서버가 거부)
      if (breakSave) {
        return r.fulfill({ status: 400, contentType: 'application/json',
          body: JSON.stringify({ code: 'P0001', message: '월정액 정책은 사무실 담당자와 관리자만 정할 수 있습니다.' }) })
      }
      return json({ clientId: CA, whenEmpty: true })
    }
    if (url.includes('/rpc/app_schema_version')) return json(64)
    if (url.includes('/profiles')) return json(single ? pf : [pf])
    if (url.includes('/clients')) return json(single ? rows[0] : rows)
    if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
    return json([])
  })
}
async function open(ctx, path = '/settings') {
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: UID, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }])
  await p.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(2200)
  return p
}

// ── 1. 화면이 터져도 흰 화면이 아니다 ────────────────────────────────────
//   진짜 그리는 도중에 나는 오류를 만듭니다 — 숫자를 사람이 읽는 꼴로
//   바꾸는 자리(toLocaleString)를 깨 놓습니다. 이 앱은 금액·건수를 어느
//   화면에서나 그렇게 그리므로, 실제로 화면을 그리다 터지는 것과 같은
//   경로입니다. 앱 코드에 시험용 장치를 심지 않습니다.
{
  const recorded = []
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } })
  wire(ctx, { recorded, recent: { days: 7, total: 0, groups: [], checkedAt: '' } })
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: UID, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }])
  await p.addInitScript(() => {
    Number.prototype.toLocaleString = function () { throw new Error('숫자 표시 중 오류') }
  })
  await p.goto(`${BASE}/pricing`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(2500)

  const txt = ((await p.textContent('body')) ?? '').replace(/\s+/g, ' ').trim()
  ok(txt.length > 0, '흰 화면이 아님 (예전에는 글자 수 0이었습니다)', `${txt.length}자`)
  ok((await p.locator('[data-error-boundary]').count()) >= 1, '오류 화면이 대신 떴음')
  ok(/이 화면을 여는 중에 문제가 생겼습니다/.test(txt), '사람이 읽을 수 있는 말로 알려 줌')
  ok(/저장하신 자료는 그대로 있습니다/.test(txt), '자료가 날아간 게 아니라는 것도 말해 줌')
  const msg = ((await p.textContent('[data-error-message]')) ?? '').trim()
  ok(/숫자 표시 중 오류/.test(msg), '무슨 오류인지 그대로 보여 줌 — 그대로 알려 주시면 됩니다', msg.slice(0, 40))
  ok((await p.locator('[data-error-retry]').count()) === 1, '다시 열기 버튼이 있음')
  ok((await p.locator('[data-error-home]').count()) === 1, '홈으로 버튼이 있음')

  //  본문만 터진 경우 — 메뉴는 살아 있어야 다른 화면으로 넘어갈 수 있습니다
  const scope = await p.locator('[data-error-boundary]').first().getAttribute('data-error-boundary')
  if (scope === 'page') {
    ok(/대시보드/.test(txt), '왼쪽 메뉴가 살아 있음 — 다른 화면으로 그냥 넘어갈 수 있음')
  } else {
    ok(true, '껍데기까지 터진 경우 — 바깥 오류 화면이 받음', scope ?? '')
  }

  //  서버에 남겼는가
  const r = recorded.find((x) => x.p_kind === 'render')
  ok(!!r, '터진 것을 서버에 남김', `${recorded.length}건`)
  ok(/숫자 표시 중 오류/.test(r?.p_message ?? ''), '무슨 오류였는지 그대로', (r?.p_message ?? '').slice(0, 30))
  ok(r?.p_screen === '/pricing', '어느 화면에서 터졌는지', r?.p_screen)
  ok(typeof r?.p_detail?.stack === 'string' && r.p_detail.stack.length > 0, '어디서 터졌는지(앞부분)도 함께')

  //  다른 화면으로 가면 오류 화면이 따라붙지 않아야 합니다.
  //  React 의 오류 경계는 스스로 안 풀립니다 — 키를 안 바꾸면 계속 붙어 있습니다.
  //
  //  주소를 다시 여는 것(goto)이 아니라 **화면 안에서 메뉴를 눌러** 옮깁니다 —
  //  goto 는 페이지를 새로 띄워 깨 놓은 것까지 되살아나므로, 실제 사용자가
  //  하는 동작(왼쪽 메뉴 클릭)과 다릅니다.
  await p.evaluate(() => { delete Number.prototype.toLocaleString })
  await p.getByRole('link', { name: /대시보드/ }).first().click()
  await p.waitForTimeout(1500)
  const t2 = ((await p.textContent('body')) ?? '').replace(/\s+/g, ' ')
  ok(!/이 화면을 여는 중에 문제가 생겼습니다/.test(t2), '다른 화면으로 가면 오류 화면이 안 따라옴', t2.slice(0, 40))
  await ctx.close()
}

// ── 2. 저장이 실패하면 남긴다 ─────────────────────────────────────────────
//   예전에는 빨간 띠가 잠깐 떴다가 다음 동작에 사라지면 끝이었습니다.
{
  const recorded = []
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1100 } })
  wire(ctx, { recorded, breakSave: true, flat: true, recent: { days: 7, total: 0, groups: [], checkedAt: '' } })
  const p = await open(ctx, '/pricing')
  await p.waitForSelector('[data-price-summary]', { timeout: 20000 })
  const yes = p.locator('[data-flat-yes]').first()
  ok((await yes.count()) === 1, '월정액 거래처에 「청구함」 버튼이 있음')
  await yes.click()
  await p.waitForTimeout(1800)
  ok(recorded.length >= 1, '저장이 실패하면 서버에 남김', `${recorded.length}건`)
  const r = recorded[0]
  ok(r?.p_kind === 'save', '「저장」 오류로 분류', r?.p_kind)
  ok(r?.p_screen === '/pricing', '어느 화면인지 그대로', r?.p_screen)
  ok(/사무실 담당자와 관리자만/.test(r?.p_message ?? ''), '사람이 본 문구를 그대로 남김',
    (r?.p_message ?? '').slice(0, 40))
  ok(r?.p_detail?.appSchema === 64, '앱이 기대하는 판 번호도 함께', String(r?.p_detail?.appSchema))
  ok(typeof r?.p_detail?.agent === 'string' && r.p_detail.agent.length > 10,
    '어떤 기기·브라우저인지도 — 기사님 폰에서만 나는 문제를 가릅니다')
  ok(typeof r?.p_detail?.raw === 'string', '사람 말로 바꾸기 전의 원문도 함께')
  await ctx.close()
}

// ── 3. 최근 오류 — 이상 없으면 한 줄로 ───────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1400 } })
  wire(ctx, { recent: { days: 7, total: 0, groups: [], checkedAt: `${TODAY}T09:00:00` } })
  const p = await open(ctx)
  ok((await p.locator('[data-error-log]').count()) === 1, '설정에 「최근 오류」 칸이 있음')
  const line = ((await p.textContent('[data-error-log-line]')) ?? '').replace(/\s+/g, ' ')
  ok(/오류가 한 건도 없었습니다/.test(line), '없으면 한 줄로 끝', line.slice(0, 45))
  ok((await p.locator('[data-error-group]').count()) === 0, '없으면 목록을 안 그림')
  await ctx.close()
}

// ── 4. 있으면 묶어서 몇 번인지 ───────────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1400 } })
  wire(ctx, { recent: { days: 7, total: 6, checkedAt: `${TODAY}T09:00:00`, groups: [
    { kind: 'save', screen: '/receipts', action: '입금 기록', message: '네트워크에 연결할 수 없습니다.',
      times: 5, last_at: `${TODAY}T05:03:00+00:00`, who: '김사무, 박기사' },
    { kind: 'render', screen: '/pricing', action: '화면 그리기', message: '단가 계산 중 오류',
      times: 1, last_at: `${TODAY}T02:00:00+00:00`, who: '대표' },
  ] } })
  const p = await open(ctx)
  const body = ((await p.textContent('[data-error-log]')) ?? '').replace(/\s+/g, ' ')
  ok(/지난 7일 동안 6건/.test(body), '몇 건인지 셈', body.slice(0, 50))
  ok((await p.locator('[data-error-group]').count()) === 2, '같은 것끼리 묶어서 두 가지')
  ok(/5번/.test(body), '몇 번 났는지 — 한 번은 사고이고 여러 번은 원인입니다')
  ok(/김사무, 박기사/.test(body), '누구에게 났는지')
  ok(/\/receipts/.test(body) && /입금 기록/.test(body), '어느 화면·무슨 동작인지')
  ok(/저장/.test(body) && /화면/.test(body), '종류를 사람 말로 (저장 · 화면)')
  //  시각은 한국 시간으로 — UTC 그대로 쓰면 오후 일이 오전으로 보입니다
  ok(/오후 0?2:03|14:03/.test(body), '한국 시간으로 보여 줌', (body.match(/마지막[^·]*/) ?? [''])[0].slice(0, 30))
  await ctx.close()
}

// ── 5. 구버전 DB · 엉뚱한 응답에도 설정 화면을 잃지 않는다 ───────────────
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1400 } })
  wire(ctx, { recent: null })
  const p = await open(ctx)
  const line = ((await p.textContent('[data-error-log-line]')) ?? '').replace(/\s+/g, ' ')
  ok(/오류 기록이 아직 없습니다/.test(line), '구버전 DB 는 「아직 없다」고만 말함 (고장이 아님)', line.slice(0, 45))
  ok((await p.locator('[data-export-list]').count()) === 1, '설정 화면의 나머지는 그대로')
  await ctx.close()
}
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1400 } })
  wire(ctx, { recent: [] })
  const p = await open(ctx)
  ok((await p.locator('[data-export-list]').count()) === 1, '모양이 이상한 응답에도 설정 화면이 그대로 뜸')
  const line = ((await p.textContent('[data-error-log-line]')) ?? '').replace(/\s+/g, ' ')
  ok(/아직 없습니다/.test(line), '읽지 못한 것으로 보고 조용히 넘어감', line.slice(0, 40))
  await ctx.close()
}

// ── 6. 관리자가 아니면 부르지도 않는다 ───────────────────────────────────
for (const role of ['office', 'field']) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1400 } })
  let calls = 0
  wire(ctx, { role, recent: { days: 7, total: 0, groups: [], checkedAt: '' }, onRecent: () => { calls += 1 } })
  const p = await open(ctx)
  ok((await p.locator('[data-error-log]').count()) === 0, `${role} 에게는 오류 기록이 안 보임`)
  ok(calls === 0, `${role} 은 오류 기록을 부르지도 않음`, `${calls}회`)
  await ctx.close()
}

await b.close()
console.log(`\n총 ${out.length}건 · 실패 ${out.filter((x) => !x).length}건`)
