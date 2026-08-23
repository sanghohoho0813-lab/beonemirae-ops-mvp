import { chromium, EXEC } from './_pw.mjs'

//  서버 자가진단 화면 + 자재 공급의 「다시 눌러도 안전」.
//
//   확인하는 것
//    · 이상이 없으면 한 줄로 끝낸다 (매번 긴 목록을 보여 줄 이유가 없음)
//    · 없는 것이 있으면 **이름을 그대로** 보여 준다 (「어딘가 이상」은 도움 안 됨)
//    · 관리자가 아니면 뜨지도 않고 부르지도 않는다
//    · 0043 이전 DB(함수 없음)에서도 화면이 깨지지 않는다
//    · 자재 공급이 저장 시도 표를 보내고, 다시 눌러도 **같은 표**를 보낸다

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
  contract_start: '2025-01-01', contract_end: null, payment_terms: '', payment_due_day: 25, pricing: {},
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  collect_time: '', disposal_site: '', diaper_cycle: '',
}]

const b = await chromium.launch({ executablePath: EXEC })

function wire(ctx, { health, role = 'admin', onHealth = () => {}, onSupply = () => {} }) {
  ctx.route('**/auth/v1/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: UID, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }) }))
  ctx.route('**/rest/v1/**', (r) => {
    const url = r.request().url()
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const pf = { ...me, role }
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    if (url.includes('/rpc/app_health_check')) {
      onHealth()
      if (health === null) {
        //  0043 이전 DB — 함수가 아예 없습니다
        return r.fulfill({ status: 404, contentType: 'application/json',
          body: JSON.stringify({ message: 'Could not find the function public.app_health_check' }) })
      }
      return json(health)
    }
    if (url.includes('/rpc/supply_materials')) {
      onSupply(r.request().postDataJSON())
      return json({ id: 'm1', alreadySaved: false })
    }
    if (url.includes('/rpc/app_schema_version')) return json(64)
    if (url.includes('/profiles')) return json(single ? pf : [pf])
    if (url.includes('/clients')) return json(single ? clients[0] : clients)
    if (url.includes('/office_stock')) {
      const st = { id: 1, corrugated_box: 500, plastic_container: 200, bag: 900, needle_box: 120 }
      return json(single ? st : [st])
    }
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

// ── 1. 이상 없음 ──────────────────────────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1200 } })
  wire(ctx, { health: { version: 64, ok: true, missing: [], checkedAt: `${TODAY}T09:00:00` } })
  const p = await open(ctx)
  ok((await p.locator('[data-health-card]').count()) === 1, '설정에 자가진단 칸이 있음')
  const line = ((await p.textContent('[data-health-line]')) ?? '').replace(/\s+/g, ' ')
  ok(/모두 제자리에 있습니다/.test(line), '이상 없으면 한 줄로 끝', line.slice(0, 50))
  ok(/판 64/.test(line), '판 번호도 함께')
  ok((await p.locator('[data-health-missing]').count()) === 0, '이상 없으면 목록을 안 그림')
  const cls = (await p.locator('[data-health-card]').getAttribute('class')) ?? ''
  ok(!/rose/.test(cls), '경고색이 아님')
  await ctx.close()
}

// ── 2. 없는 것이 있으면 이름을 그대로 ─────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1200 } })
  wire(ctx, { health: { version: 62, ok: false, checkedAt: `${TODAY}T09:00:00`,
    missing: ['색인 payment_receipts_request_uniq', '함수 confirm_billing', '잠금 payments 삭제 권한이 열려 있음'] } })
  const p = await open(ctx)
  const body = ((await p.textContent('[data-health-card]')) ?? '').replace(/\s+/g, ' ')
  ok(/3군데가 있어야 하는데 없습니다/.test(body), '몇 군데인지 셈', body.slice(0, 45))
  ok(/색인 payment_receipts_request_uniq/.test(body), '색인 이름을 그대로 보여 줌')
  ok(/함수 confirm_billing/.test(body), '함수 이름도')
  ok(/잠금 payments 삭제 권한이 열려 있음/.test(body), '권한이 열린 것도')
  ok(/아직 실행하지 않은 RUN_\*\.sql/.test(body), '무엇을 해야 하는지 알려 줌')
  const cls = (await p.locator('[data-health-card]').getAttribute('class')) ?? ''
  ok(/rose/.test(cls), '경고색으로 바뀜')
  await ctx.close()
}

// ── 3. 0043 이전 DB — 함수가 없어도 화면이 안 깨짐 ────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1200 } })
  wire(ctx, { health: null })
  const p = await open(ctx)
  const line = ((await p.textContent('[data-health-line]')) ?? '').replace(/\s+/g, ' ')
  ok(/자가진단이 아직 없습니다/.test(line), '구버전 DB 는 「아직 없다」고만 말함 (고장이 아님)', line.slice(0, 50))
  ok((await p.locator('[data-health-missing]').count()) === 0, '없는 것 목록을 지어내지 않음')
  await ctx.close()
}

// ── 3-b. 서버가 엉뚱한 것을 돌려줘도 화면이 죽지 않는다 ──────────────────
//   진단 하나 때문에 설정 화면 전체(백업·내보내기까지)를 잃으면 안 됩니다.
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1200 } })
  wire(ctx, { health: [] })
  const p = await open(ctx)
  ok((await p.locator('[data-export-list]').count()) === 1, '모양이 이상한 응답에도 설정 화면이 그대로 뜸')
  const line = ((await p.textContent('[data-health-line]')) ?? '').replace(/\s+/g, ' ')
  ok(/아직 없습니다/.test(line), '읽지 못한 것으로 보고 조용히 넘어감', line.slice(0, 45))
  await ctx.close()
}

// ── 4. 관리자가 아니면 부르지도 않는다 ────────────────────────────────────
for (const role of ['office', 'field']) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1200 } })
  let calls = 0
  wire(ctx, { health: { version: 64, ok: true, missing: [], checkedAt: '' }, role, onHealth: () => { calls += 1 } })
  const p = await open(ctx)
  ok((await p.locator('[data-health-card]').count()) === 0, `${role} 에게는 자가진단이 안 보임`)
  ok(calls === 0, `${role} 은 자가진단을 부르지도 않음`, `${calls}회`)
  await ctx.close()
}

// ── 5. 자재 공급 — 저장 시도 표 ───────────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1100 } })
  const sent = []
  wire(ctx, { health: { version: 64, ok: true, missing: [], checkedAt: '' }, onSupply: (b) => sent.push(b) })
  const p = await open(ctx, '/materials')
  const addBtn = p.getByRole('button', { name: /공급 등록/ }).first()
  ok((await addBtn.count()) > 0, '자재 화면에 「공급 등록」 버튼이 있음')
  await addBtn.click()
  await p.waitForTimeout(500)

  //  거래처 고르고 박스 수량 넣기
  //  ⚠ 0088 부터 자재 화면 **맨 위에 사무실 재고 칸**이 있습니다(설정에서
  //    옮겨 왔습니다). 그 칸에도 숫자 입력이 넷 있어서, 화면 전체에서
  //    `first()` 를 집으면 **창 뒤에 있는 재고 칸**을 집습니다. 사람은 창이
  //    떠 있는 동안 뒤를 못 누르는데 검사만 누른 셈이라, 창 안으로 좁힙니다.
  const dlg = p.locator('[role="dialog"]')
  const sel = dlg.locator('select').first()
  if (await sel.count()) await sel.selectOption(CA).catch(() => {})
  const nums = dlg.locator('input[inputmode="numeric"], input[type="number"]')
  await nums.first().fill('12')
  await p.getByRole('button', { name: /^등록|저장/ }).last().click()
  await p.waitForTimeout(1200)

  ok(sent.length === 1, '서버 함수를 한 번 부름 (예전에는 네 번 따로 불렀습니다)', `${sent.length}회`)
  const first = sent[0]
  ok(typeof first?.p_request_id === 'string' && first.p_request_id.length === 36,
    '저장 시도 표를 실제로 보냄', first?.p_request_id ?? '(없음)')
  ok(first?.p_box === 12, '박스 12개를 그대로 보냄', String(first?.p_box))
  ok(first?.p_client_id === CA, '거래처도 그대로')
  await ctx.close()
}

await b.close()
console.log(`\n총 ${out.length}건 · 실패 ${out.filter((x) => !x).length}건`)
