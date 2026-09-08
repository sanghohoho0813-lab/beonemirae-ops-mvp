import { chromium, EXEC } from './_pw.mjs'
import * as W from './walk_lib.mjs'
import * as F from './perf_fixtures.mjs'

// ─────────────────────────────────────────────────────────────────────────────
//  거래처 정리 도우미 · 재고 「쓰는 것만 보기」 (0105)
//
//  이사님 첫 피드백: 「거래처 파일이 일정하지 않아 헷갈린다 · 규격이 많아
//  화면이 복잡해질까 걱정」. 여기서 지키는 것:
//   ① 빈칸·겹침을 **저장된 값으로만** 세고, 묶음 순서(돈→매일→나중→겹침)로 보여 준다
//   ② 한 줄을 누르면 그 거래처의 **수정 창이 열린 채로** 도착한다 — 두 번 누르지 않게
//   ③ 시연용이 섞여 있으면 그 사실만 알린다 (세지는 않는다)
//   ④ 대시보드에는 **한 줄만** — 「첫 화면이 복잡함」을 되풀이하지 않게
//   ⑤ 현장 담당자에게는 안 보인다 (고칠 수 없는 사람에게 목록만 주지 않는다)
//   ⑥ 재고: 최근 90일에 나간 규격·세어 둔 규격만 펼치고 나머지는 접힌다.
//      **줄은 DOM 에 그대로** 있고(13개), 「전부 보기」로 펴진다. 나간 기록이
//      하나도 없으면 접지 않는다.
//   ⑦ 수거 입력: PC 에서도 자재 규격을 접는다 (첫 줄 + 지난번 규격 + 값 넣은 줄)
//   ⑧ 사용자 관리: 같은 이름으로 사용 중인 계정이 둘이면 그 사실만 알린다 —
//      어느 쪽을 중지할지는 시스템이 고르지 않는다 (0102 로그인 소동의 원인)
// ─────────────────────────────────────────────────────────────────────────────

let pass = 0
let fail = 0
const ok = (name, cond, detail = '') => {
  if (cond) pass += 1
  else fail += 1
  console.log(`${cond ? ' OK ' : 'FAIL'} | ${name}${detail && !cond ? ` — ${detail}` : ''}`)
}
const flat = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const b = await chromium.launch({ executablePath: EXEC })

const C = (id, name, extra = {}) => ({
  id, name, type: '병원', address: '경기도 남양주시 오남읍 양지로 1', manager: '원무과', phone: '031-000-0000',
  collection_cycle: '주 2회', collects_medical_waste: true, collects_diaper: false, storage_size: '보통', note: '',
  is_demo_generated: false, demo_session_id: null, active: true, contract_start: '2025-01-01', contract_end: null,
  payment_terms: '', payment_due_day: 20, pricing: { medical: { sale: 950, cost: 350 } },
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', ...extra,
})
//  c1 주소·연락처·계약일 없음 · c2 단가 없음 · c3/c4 이름 겹침 · d1 시연용
const MESSY = [
  C('c1', '오남한양병원', { address: '', phone: '', contract_start: null }),
  C('c2', '카페인의원', { pricing: {} }),
  C('c3', '가나요양병원'),
  C('c4', '가나 요양병원'),
  C('d1', '시연병원', { is_demo_generated: true, demo_session_id: 'demo' }),
]
const CLEAN = [C('c9', '더원요양병원')]

async function open(role, path, { clients = null, width = 1440, stock = null, materials = null, schedules = null, profiles = null } = {}) {
  const prof = { ...W.profileFor(role), font_scale: 'normal' }
  const state = { profile: prof, reqs: 0, writes: [], schemaVersion: 99 }
  if (schedules) state.schedules = schedules
  const ctx = await b.newContext({ viewport: { width, height: 900 }, isMobile: width < 640, hasTouch: width < 640 })
  W.wire(ctx, state)
  //  ⚠ 나중에 건 route 가 이깁니다 — 필요한 표만 덮어씁니다.
  const json = (r, v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
  if (clients) await ctx.route('**/rest/v1/clients*', (r) => {
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    if (single) { const id = (r.request().url().match(/id=eq\.([^&]+)/) ?? [])[1]; return json(r, clients.find((c) => c.id === id) ?? null) }
    return json(r, clients)
  })
  if (stock) await ctx.route('**/rest/v1/office_stock_items*', (r) => json(r, stock))
  if (materials) await ctx.route('**/rest/v1/materials*', (r) => json(r, materials))
  //  내 프로필 조회(id=eq.…, maybeSingle — 두 줄 이상 오면 오류로 칩니다)는
  //  그 한 줄만 주고, 목록 조회에만 바꿔 낀 명단을 줍니다.
  if (profiles) await ctx.route('**/rest/v1/profiles*', (r) => {
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const id = (r.request().url().match(/id=eq\.([^&]+)/) ?? [])[1]
    const rows = id ? profiles.filter((x) => x.id === id) : profiles
    return json(r, single ? (rows[0] ?? null) : rows)
  })
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => {
    window.localStorage.setItem(k, JSON.stringify({ access_token: 't', token_type: 'bearer',
      expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u }))
    window.localStorage.setItem('beonemirae-ops:tour-seen', 'staff,field,client')
  }, ['beonemirae-ops:auth', { id: prof.id, aud: 'authenticated', email: prof.email, app_metadata: {}, user_metadata: {} }])
  await p.goto(`${W.BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await W.settle(p, state)
  await p.waitForTimeout(400)
  return { ctx, p, state }
}

// ── ① 묶음과 개수 ───────────────────────────────────────────────────────────
{
  const { ctx, p } = await open('admin', '/clients', { clients: MESSY })
  await p.locator('[data-tidy-card]').waitFor({ state: 'visible', timeout: 8000 })
  const t = flat(await p.textContent('[data-tidy-card]'))
  ok(/정리할 것/.test(t), '정리 도우미 카드가 뜬다')
  ok(flat(await p.textContent('[data-tidy-total]')) === '5건', '빈칸 4 + 겹침 1 = 5건', flat(await p.textContent('[data-tidy-total]')))
  ok(/거래처 4곳 중 1곳은 깨끗/.test(t), '실제 4곳(시연용 제외) 중 깨끗한 곳 1(c... 아니, 3·4는 겹침)', t.slice(0, 120))
  const groups = await p.locator('[data-tidy-group]').evaluateAll((els) => els.map((e) => e.getAttribute('data-tidy-group')))
  ok(groups.join(',') === '돈,매일,나중,겹침', '묶음 순서가 돈 → 매일 → 나중 → 겹침', groups.join(','))
  ok(/단가 없음/.test(t) && /주소 없음/.test(t) && /연락처 없음/.test(t) && /계약 시작일 없음/.test(t),
    '무엇이 비었는지 그대로 적힌다')
  ok(/비슷한 이름|사실상 같은 이름/.test(t) && /가나 요양병원/.test(t), '겹치는 이름이 어느 곳과 겹치는지 보인다')
  ok((await p.locator('[data-tidy-demo]').count()) === 1 && /시연용 1곳/.test(t), '시연용이 섞여 있다고 알린다')
  ok(!/시연병원.*없음/.test(t), '시연용은 정리 대상으로 세지 않는다')

  //  ② 누르면 수정 창이 열린 채로 도착
  await p.locator('[data-tidy-item="c1:address"]').click()
  await p.locator('[role="dialog"]').first().waitFor({ state: 'visible', timeout: 8000 })
  await p.waitForTimeout(500)
  ok(/\/clients\/c1/.test(p.url()), '그 거래처 화면으로 간다', p.url())
  ok(!/edit=1/.test(p.url()), '한 번 열고 나면 주소의 표시는 지운다 (새로고침해도 다시 안 열리게)', p.url())
  const dlg = flat(await p.textContent('[role="dialog"]'))
  ok(/저장/.test(dlg) && (await p.locator('[role="dialog"] [data-client-cycle]').count()) === 1, '수정 창이 열려 있다')
  await ctx.close()
}

// ── 깨끗하면 한 줄로 ────────────────────────────────────────────────────────
{
  const { ctx, p } = await open('admin', '/clients', { clients: CLEAN })
  await p.locator('[data-tidy-card]').waitFor({ state: 'visible', timeout: 8000 })
  ok((await p.locator('[data-tidy-clean]').count()) === 1, '정리할 것이 없으면 한 줄로 줄어든다')
  ok(/전부 정리됐습니다/.test(flat(await p.textContent('[data-tidy-card]'))), '「전부 정리됨」')
  await ctx.close()
}

// ── ⑤ 현장 담당자에게는 없다 · 사무실에는 있다 ─────────────────────────────
{
  const { ctx, p } = await open('field', '/clients', { clients: MESSY })
  ok((await p.locator('[data-tidy-card]').count()) === 0, '현장 담당자에게는 정리 카드가 없다 (고칠 수 없는 사람)')
  await ctx.close()
}
{
  const { ctx, p } = await open('office', '/clients', { clients: MESSY })
  await p.locator('[data-tidy-card]').waitFor({ state: 'visible', timeout: 8000 })
  ok(true, '사무실 담당자에게는 있다')
  //  접기 — 기억된다
  await p.locator('[data-tidy-fold]').click()
  await p.waitForTimeout(300)
  ok((await p.locator('[data-tidy-group]').count()) === 0, '접으면 목록이 사라진다')
  await p.reload({ waitUntil: 'domcontentloaded' })
  await p.locator('[data-tidy-card]').waitFor({ state: 'visible', timeout: 8000 })
  ok((await p.locator('[data-tidy-group]').count()) === 0, '접은 상태를 기억한다')
  await ctx.close()
}

// ── ④ 대시보드에는 한 줄만 · 항목은 설정 화면 카드에 ───────────────────────
//  「첫 화면이 복잡함」이 첫 피드백 — 대시보드에는 원래 있던 「아직 값이 비어서
//  못 쓰는 기능 N가지」 한 줄만 두고, 거래처 정리 항목 자체는 /settings 카드에 붙습니다.
{
  const { ctx, p } = await open('admin', '/', { clients: MESSY })
  await p.locator('[data-setup-line]').waitFor({ state: 'visible', timeout: 8000 })
  ok((await p.locator('[data-setup-link]').count()) === 0, '대시보드에는 항목별 링크를 늘어놓지 않는다 (한 줄만)')
  ok((await p.locator('[data-tidy-card]').count()) === 0, '대시보드에 정리 카드를 또 그리지 않는다')
  await ctx.close()
}
{
  const { ctx, p } = await open('admin', '/settings', { clients: MESSY })
  const link = p.locator('[data-setup-link="clientTidy"]')
  await link.waitFor({ state: 'visible', timeout: 8000 })
  ok((await link.count()) === 1, '설정 「채워야 할 것」 카드에 거래처 정리 한 줄', `${await link.count()}개`)
  const eff = flat(await p.textContent('[data-setup-effect="clientTidy"]'))
  ok(/거래처 4곳 중 3곳/.test(eff) && /5건/.test(eff), '몇 곳·몇 건인지 한 줄로', eff)
  await link.click()
  await p.waitForTimeout(600)
  ok(/\/clients$/.test(p.url()), '누르면 거래처 화면으로', p.url())
  await p.locator('[data-tidy-card]').waitFor({ state: 'visible', timeout: 8000 })
  ok(true, '거래처 화면에 정리 카드가 있다')
  await ctx.close()
}

// ── ⑥ 재고 — 쓰는 것만 보기 ─────────────────────────────────────────────────
const STOCK = ['plastic2','plastic5','plastic10','plastic20','box63','box35','box30','box12','box4','box79','diaperBoxM','pouch12','diaperBag40']
  .map((k) => ({ item: k, qty: k === 'box63' ? 120 : null, counted_at: null, updated_at: '2026-01-01T00:00:00Z' }))
const recent = new Date(Date.now() - 5 * 86400_000).toISOString().slice(0, 10)
const MAT = [{ id: 'm1', date: recent, client_id: 'c1', box_count: 0, vinyl_count: 0, needle_box_count: 2,
  is_additional_request: false, memo: '', items: { plastic2: 2 }, created_at: `${recent}T01:00:00Z` }]
{
  //  나간 기록이 있으면 → 접힌다 (box63 은 세어 둠, plastic2 는 나감 → 둘만 펼침)
  const { ctx, p } = await open('admin', '/materials', { stock: STOCK, materials: MAT })
  await p.locator('[data-spec-stocks]').waitFor({ state: 'visible', timeout: 8000 })
  await p.waitForTimeout(600)
  ok((await p.locator('[data-spec-stock]').count()) === 13, '규격 13줄이 DOM 에 그대로 있다 (없앤 것이 아니라 접은 것)')
  const visible = await p.locator('[data-spec-stock]:visible').evaluateAll((els) => els.map((e) => e.getAttribute('data-spec-stock')))
  ok(visible.sort().join(',') === 'box63,plastic2', '펼쳐진 것은 세어 둔 63L 과 최근에 나간 2L 뿐', visible.join(','))
  ok((await p.locator('[data-spec-hidden]').count()) >= 2, '묶음마다 「n개 접힘」이 적힌다')
  ok(/합계 120개/.test(flat(await p.textContent('[data-spec-total="corrugatedBox"]'))), '골판지 묶음 합계가 보인다 (센 것만)')
  ok(/미집계/.test(flat(await p.textContent('[data-spec-total="corrugatedBox"]'))), '안 센 규격이 있으면 「미집계」라고 말한다')
  await p.locator('[data-spec-showall]').click()
  await p.waitForTimeout(300)
  ok((await p.locator('[data-spec-stock]:visible').count()) === 13, '「전부 보기」를 누르면 13줄 다 펼쳐진다')
  await p.reload({ waitUntil: 'domcontentloaded' })
  await p.locator('[data-spec-stocks]').waitFor({ state: 'visible', timeout: 8000 })
  await p.waitForTimeout(600)
  ok((await p.locator('[data-spec-stock]:visible').count()) === 13, '「전부 보기」를 기억한다')
  await ctx.close()
}
{
  //  나간 기록이 없으면 → 접지 않는다 (무엇을 쓰는지 알 근거가 없음)
  const { ctx, p } = await open('admin', '/materials', { stock: STOCK, materials: [] })
  await p.locator('[data-spec-stocks]').waitFor({ state: 'visible', timeout: 8000 })
  await p.waitForTimeout(600)
  ok((await p.locator('[data-spec-stock]:visible').count()) === 13, '나간 기록이 없으면 전부 펼쳐 둔다')
  ok((await p.locator('[data-spec-showall]').count()) === 0, '접을 근거가 없으면 토글도 없다')
  await ctx.close()
}

// ── ⑦ 수거 입력 — PC 에서도 자재 규격을 접는다 (0105) ───────────────────────
//  이사님: 「규격이 많아 화면이 복잡해질까 걱정」. 폰에서만 접던 것을 PC 에서도
//  접습니다. 첫 줄 + 지난번에 준 규격 + 값이 들어간 줄만 펼치고, 나머지는
//  「다른 규격 N개 보기」 뒤에 둡니다. 줄은 DOM 에 그대로 있습니다.
const SUPPLY = ['2L 합성수지', '5L 합성수지', '10L 합성수지', '20L 합성수지', '63L 박스', '35L 박스', '30L 박스',
  '12L 박스', '4L 박스', '79L 박스', '기저귀박스 (중)', '12L 봉투형용기', '기저귀비닐 40L']
async function visibleSupply(p) {
  const out = []
  for (const l of SUPPLY) {
    if (await p.getByRole('button', { name: `${l} 더하기`, exact: true }).first().isVisible().catch(() => false)) out.push(l)
  }
  return out
}
//  ?schedule= 은 **오늘 예정**만 받습니다 — 오늘 c0 한 건을 직접 넣어 둡니다
//  (기본 fixture 는 화·금에만 예정이 있어 다른 요일에 돌리면 없습니다).
const TODAY_S = [{ id: 'sx', date: F.TODAY, client_id: 'c0', waste_type: '의료폐기물', vehicle_id: 'v1', scheduled_time: '10:00',
  status: '예정', expected_amount: 80, actual_amount: null, completed_at: null, memo: '', origin: 'field', is_additional: false,
  demo_session_id: null, plan_batch: null, handover_status: null, driver_name: '1호기사',
  created_at: `${F.TODAY}T00:00:00Z`, updated_at: `${F.TODAY}T00:00:00Z` }]
async function openCollect(materials) {
  const { ctx, p } = await open('field', '/collection?schedule=sx', { materials, schedules: TODAY_S })
  await p.locator('[data-collect-here]').waitFor({ state: 'visible', timeout: 8000 })
  return { ctx, p }
}
{
  //  공급 이력이 없는 병원 → 첫 줄만
  const { ctx, p } = await openCollect([])
  ok((await p.locator('[data-fold="supply"]').isVisible().catch(() => false)) === false, 'PC 에서는 접기 손잡이(폰용)가 없다')
  const vis = await visibleSupply(p)
  ok(vis.join(',') === '2L 합성수지', 'PC · 이력 없음 → 첫 줄(2L)만 펼쳐진다', vis.join(','))
  const more = p.locator('[data-supply-more]')
  ok(await more.isVisible().catch(() => false), 'PC 에도 「다른 규격 N개 보기」가 있다')
  ok(flat(await more.textContent()) === '다른 규격 12개 보기', '13 규격 중 12개가 접혀 있다고 적는다', flat(await more.textContent()))
  await more.click()
  await p.waitForTimeout(400)
  ok((await visibleSupply(p)).length === 13, '누르면 13줄 다 펼쳐진다')
  ok((await p.locator('[data-supply-more]').count()) === 0, '펴면 버튼은 사라진다')
  await ctx.close()
}
{
  //  지난번에 35L 박스를 준 병원 → 첫 줄 + 35L
  const d = new Date(Date.now() - 3 * 86400_000).toISOString().slice(0, 10)
  const { ctx, p } = await openCollect([{ id: 'mx', date: d, client_id: 'c0', box_count: 0, vinyl_count: 0, needle_box_count: 0,
    is_additional_request: false, memo: '', origin: 'field', demo_session_id: null, items: { box35: 4 },
    created_at: `${d}T01:00:00Z`, updated_at: `${d}T01:00:00Z` }])
  const vis = await visibleSupply(p)
  ok(vis.join(',') === '2L 합성수지,35L 박스', '지난번에 준 규격(35L)은 펼쳐 둔다', vis.join(','))
  ok(flat(await p.locator('[data-supply-more]').textContent()) === '다른 규격 11개 보기', '접힌 수가 하나 준다', flat(await p.locator('[data-supply-more]').textContent()))
  //  값을 넣은 줄은 펼친 채로 남는다 — 2L 에 값을 넣고 「전부 보기」 없이도 그대로
  await p.getByRole('button', { name: '2L 합성수지 더하기', exact: true }).first().click()
  await p.waitForTimeout(200)
  ok((await visibleSupply(p)).join(',') === '2L 합성수지,35L 박스', '값을 넣어도 접힌 줄이 갑자기 펼쳐지지 않는다')
  await ctx.close()
}

// ── ⑧ 사용자 관리 — 같은 이름 계정 ──────────────────────────────────────────
const P = (id, name, email, extra = {}) => ({ id, email, name, role: 'field', font_scale: 'normal', active: true,
  approved_at: '2026-01-01T00:00:00Z', client_id: null, vehicle_id: null, created_at: '2026-01-01T00:00:00Z', ...extra })
{
  const prof = W.profileFor('admin')
  const list = [{ ...prof, role: 'admin' }, P('u1', '김현장', 'u1@example.com'), P('u2', '김현장', 'u2@example.com'),
    P('u3', '박사무', 'u3@example.com', { role: 'office' }), P('u4', '박사무', 'u4@example.com', { active: false })]
  const { ctx, p } = await open('admin', '/users', { profiles: list })
  await p.locator('[data-user-row="u1"]').waitFor({ state: 'visible', timeout: 8000 })
  const note = p.locator('[data-user-samename]')
  ok((await note.count()) === 1, '같은 이름이 둘이면 안내가 뜬다')
  ok((await p.locator('[data-user-samename-group]').count()) === 1, '중지된 계정은 세지 않는다 (박사무는 한 명만 사용 중)')
  const t = flat(await note.textContent())
  ok(/김현장/.test(t) && /u1@example\.com/.test(t) && /u2@example\.com/.test(t), '누구의 어느 메일인지 적는다', t)
  ok(/시스템이 고르지 않습니다/.test(t), '어느 쪽을 중지할지는 사람이 고른다고 말한다')
  ok((await p.locator('[data-user-dup]').count()) === 2, '그 두 줄에만 표시가 붙는다', `${await p.locator('[data-user-dup]').count()}`)
  ok((await p.locator('[data-user-row="u3"][data-user-dup]').count()) === 0, '박사무 줄에는 붙지 않는다')
  await ctx.close()
}
{
  const prof = W.profileFor('admin')
  const list = [{ ...prof, role: 'admin' }, P('u1', '김현장', 'u1@example.com'), P('u3', '박사무', 'u3@example.com')]
  const { ctx, p } = await open('admin', '/users', { profiles: list })
  await p.locator('[data-user-row="u1"]').waitFor({ state: 'visible', timeout: 8000 })
  ok((await p.locator('[data-user-samename]').count()) === 0, '겹치는 이름이 없으면 아무것도 그리지 않는다')
  await ctx.close()
}

await b.close()
console.log(`\ncheck_tidy OK=${pass} FAIL=${fail}`)
process.exit(fail ? 1 : 0)
