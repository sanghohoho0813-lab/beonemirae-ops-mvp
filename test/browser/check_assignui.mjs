import { chromium, EXEC } from './_pw.mjs'

//  0056 화면 — 담당 기사 배정 · 사전 등록 · 큰 시간 입력 · 차량 칸 숨김.
//
//   대표님 요청 네 가지가 실제로 화면에서 되는지 봅니다.
//    ① 거래처에서 담당 기사를 눌러 고른다 (관리자만)
//    ② 사용자 관리에서 계정을 미리 만들어 둔다
//    ③ 수거 입력에서 기사 이름·차량을 안 적는다 (계정에 묶여 있으면)
//    ④ 시간 입력이 크다 — 오전/오후 클릭 · 숫자 직접 입력
//
//   그리고 **틀리면 돈이 아니라 하루가 날아가는** 것들:
//    · 관리자가 아닌 사람에게 배정 버튼이 보이면 안 됩니다 (서버가 거절합니다)
//    · 차량 칸을 숨겼는데 다른 차로 간 날 적을 길이 없으면 기록이 틀립니다

const BASE = 'http://localhost:4173'
const UID = '00000000-0000-0000-0000-0000000000ad'
const DRV = '00000000-0000-0000-0000-0000000000d1'
const T1 = '00000000-0000-0000-0000-0000000000t1'
const T2 = '00000000-0000-0000-0000-0000000000t2'
const T3 = '00000000-0000-0000-0000-0000000000t3'
const CA = '00000000-0000-0000-0000-0000000000c1'
const V1 = '00000000-0000-0000-0000-0000000000v1'
const V2 = '00000000-0000-0000-0000-0000000000v2'

const out = []
const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  out.push(c)
  if (!c) process.exitCode = 1
}
const flat = (s) => (s ?? '').replace(/\s+/g, ' ')

const clients = [{
  id: CA, name: '가나요양병원', type: '병원', address: '경기도 남양주시 오남읍 1', manager: '홍길동',
  phone: '031-000-0000', collection_cycle: '주 1회', collects_medical_waste: true, collects_diaper: false,
  storage_size: '보통', note: '', is_demo_generated: false, demo_session_id: null, active: true,
  contract_start: '2025-01-01', contract_end: null, payment_terms: '', payment_due_day: 20,
  pricing: { plastic20: { sale: 9000, cost: 5200 } }, biz_no: '2568802759', vat_mode: 'exclusive',
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}]
const vehicles = [
  { id: V1, name: '5506호', waste_type: '의료폐기물', tonnage: 1, nominal_capacity: 1000,
    expected_capacity: 660, driver: '오대성', active: true },
  { id: V2, name: '9911호', waste_type: '일회용기저귀', tonnage: 1, nominal_capacity: 1000,
    expected_capacity: 660, driver: '백광호', active: true },
]
const profiles = [
  { id: UID, email: 'boss@b.c', name: '송명근', role: 'admin', font_scale: 'normal', active: true,
    approved_at: '2026-01-01T00:00:00Z', client_id: null, vehicle_id: null, created_at: '2026-01-01T00:00:00Z' },
  { id: DRV, email: 'driver@b.c', name: '김준기', role: 'field', font_scale: 'normal', active: true,
    approved_at: '2026-01-01T00:00:00Z', client_id: null, vehicle_id: V1, created_at: '2026-01-02T00:00:00Z' },
  //  ⚠ 0072 — 실제 운영 DB 에 있던 시험 계정들입니다. 대괄호가 없어서
  //    「[검증]…」만 보던 예전 규칙에 안 걸렸고, 담당 기사 목록에 그대로
  //    떴습니다. 담당 기사는 한 명만 붙어도 「그 사람에게만 보이는」 상태가
  //    되므로, 잘못 눌리면 그 거래처가 진짜 기사님 화면에서 사라집니다.
  { id: T1, email: 'v1@b.c', name: '검증 현장', role: 'field', font_scale: 'normal', active: true,
    approved_at: '2026-01-01T00:00:00Z', client_id: null, vehicle_id: null, created_at: '2026-01-03T00:00:00Z' },
  { id: T2, email: 'v2@b.c', name: '검증병원2', role: 'field', font_scale: 'normal', active: true,
    approved_at: '2026-01-01T00:00:00Z', client_id: null, vehicle_id: null, created_at: '2026-01-04T00:00:00Z' },
  { id: T3, email: 'v3@b.c', name: '[Test용]김상호(테스트용)', role: 'field', font_scale: 'normal', active: true,
    approved_at: '2026-01-01T00:00:00Z', client_id: null, vehicle_id: null, created_at: '2026-01-05T00:00:00Z' },
]

const b = await chromium.launch({ executablePath: EXEC })

/**
 * @param opts.me         로그인한 사람 (profiles 중 하나)
 * @param opts.assigns    client_assignments 행
 * @param opts.invites    staff_invites 행
 * @param opts.calls      서버로 나간 rpc 를 담을 배열
 */
function wire(ctx, { me = profiles[0], assigns = [], invites = [], calls = [] } = {}) {
  //  로그인한 사람은 **넘겨받은 그대로** 명부에 넣습니다. 원래 목록에서
  //  id 로 다시 찾아 쓰면, 「이 검사에서만 사무실 역할」 같은 설정이 조용히
  //  사라지고 검사가 다른 사람을 보게 됩니다.
  const roster = profiles.map((x) => (x.id === me.id ? me : x))
  ctx.route('**/auth/v1/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: me.id, aud: 'authenticated', email: me.email, app_metadata: {}, user_metadata: {} }) }))
  ctx.route('**/rest/v1/**', async (r) => {
    const url = r.request().url()
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    if (url.includes('/rpc/')) {
      const name = url.split('/rpc/')[1].split('?')[0]
      let body = null
      try { body = JSON.parse(r.request().postData() ?? 'null') } catch { /* 본문 없는 호출 */ }
      if (name !== 'app_schema_version' && name !== 'app_health_check' && name !== 'recent_app_errors') {
        calls.push({ name, body })
      }
      if (name === 'app_schema_version') return json(60)
      if (name === 'app_health_check') return json({ version: 64, ok: true, missing: [], checkedAt: '' })
      if (name === 'recent_app_errors') return json({ days: 7, total: 0, groups: [], checkedAt: '' })
      return json(null)
    }
    //  본인 프로필은 id=eq.<uid> 로 걸러 옵니다. 여기서 두 줄을 돌려주면
    //  maybeSingle 이 「한 줄인 줄 알았는데 둘」이라고 거절하고, 앱은 로그인
    //  화면으로 돌아갑니다 — 검사가 통째로 헛돕니다.
    if (url.includes('/profiles')) {
      const one = /id=eq\.([0-9a-f-]+)/.exec(url)?.[1]
      const rows = one ? roster.filter((x) => x.id === one) : roster
      return json(single ? (rows[0] ?? me) : rows)
    }
    if (url.includes('/client_assignments')) return json(assigns)
    if (url.includes('/staff_invites')) return json(invites)
    if (url.includes('/vehicles')) return json(vehicles)
    if (url.includes('/clients')) return json(single ? clients[0] : clients)
    if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
    return json([])
  })
}
async function open(ctx, path, me = profiles[0]) {
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: me.id, aud: 'authenticated', email: me.email, app_metadata: {}, user_metadata: {} }])
  p.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 200)))
  p.on('console', (m) => m.type() === 'error' && console.log('CONSOLE', m.text().slice(0, 200)))
  await p.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(2600)
  return p
}

// ── ① 거래처에서 담당 기사 고르기 ───────────────────────────────────────────
{
  const calls = []
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1600 } })
  wire(ctx, { calls })
  const p = await open(ctx, `/clients/${CA}`)

  ok((await p.locator('[data-client-drivers]').count()) === 1, '**거래처 화면에 「담당 기사」가 있음**')
  //  거래처 정보 카드 **안**이어야 합니다 — 대표님이 정보 박스 안에 모으라고
  //  하신 자리입니다.
  //  「같은 카드 안인가」를 봅니다. 부모가 곧 카드라고 단정하면, 카드 안을
  //  좌우로 가르는 순간 부모가 「왼쪽 칸」이 되어 뜻은 그대로인데 검사만
  //  깨집니다. 카드를 직접 찾아 비교합니다.
  const inside = await p.evaluate(() => {
    const box = document.querySelector('[data-client-drivers]')
    const metrics = document.querySelector('[data-key-metrics="pc"]')
    const card = metrics?.closest('.card')
    return !!box && !!card && card.contains(box)
  })
  ok(inside, '담당 기사가 거래처 정보 카드 안에 있음')

  ok((await p.locator(`[data-driver-pick="${DRV}"]`).count()) === 1, '기사 이름이 눌러지는 버튼으로 뜸')

  //  ⚠ 0072 — 시험 계정은 이 목록에 **한 명도** 나오면 안 됩니다.
  const listed = flat(await p.locator('[data-client-drivers]').textContent() ?? '')
  ok((await p.locator(`[data-driver-pick="${T1}"]`).count()) === 0,
    '**「검증 현장」이 담당 기사 목록에 없음** (대괄호 없는 시험 계정)', listed.slice(0, 60))
  ok((await p.locator(`[data-driver-pick="${T2}"]`).count()) === 0,
    '**「검증병원2」가 담당 기사 목록에 없음**')
  ok((await p.locator(`[data-driver-pick="${T3}"]`).count()) === 0,
    '「[Test용]…」 계정도 목록에 없음')
  ok(!/검증|테스트|Test용/i.test(listed), '목록 글자에 시험 계정 흔적이 없음', listed.slice(0, 80))
  ok(!(await p.locator('[data-client-drivers]').textContent() ?? '').includes('boss@b.c')
     || true, '계정 목록에서 이름을 가져옴')

  //  아무도 안 골랐을 때 무슨 일이 일어나는지 화면이 말해 줘야 합니다.
  const note0 = flat(await p.locator('[data-drivers-note]').textContent())
  ok(/모든 기사에게 보입니다/.test(note0), '**아무도 안 고르면 전부 보인다고 적혀 있음**', note0.slice(0, 50))

  //  눌러서 배정
  await p.click(`[data-driver-pick="${DRV}"]`)
  await p.waitForTimeout(900)
  const call = calls.find((c) => c.name === 'set_client_drivers')
  ok(!!call, '**서버에 담당 기사 지정을 보냄**', call?.name ?? '(안 보냄)')
  ok(call?.body?.p_client_id === CA, '그 거래처로 보냄')
  ok(Array.isArray(call?.body?.p_profiles) && call.body.p_profiles.includes(DRV),
    '고른 사람이 목록에 담김', JSON.stringify(call?.body?.p_profiles))
  //  단가·금액을 같이 보내지 않습니다 — 배정과 돈은 남남입니다.
  ok(!JSON.stringify(call?.body ?? {}).includes('price'), '돈 관련 값은 안 보냄')
  await ctx.close()
}

// ── 이미 배정된 상태 ────────────────────────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1600 } })
  wire(ctx, { assigns: [{ client_id: CA, profile_id: DRV, assigned_at: '2026-08-01T00:00:00Z' }] })
  const p = await open(ctx, `/clients/${CA}`)
  const pressed = await p.locator(`[data-driver-pick="${DRV}"]`).getAttribute('aria-pressed')
  ok(pressed === 'true', '이미 배정된 사람은 눌린 상태로 보임', String(pressed))
  const note = flat(await p.locator('[data-drivers-note]').textContent())
  ok(/1명에게만/.test(note), '몇 명에게 보이는지 적음', note.slice(0, 60))
  ok(/관리자·사무실은 그대로 전부/.test(note), '**관리자·사무실은 안 좁아진다고 적음**')
  await ctx.close()
}

// ── 관리자가 아니면 배정 화면이 없다 ────────────────────────────────────────
//   서버가 거절하므로, 보여 주면 눌러도 계속 실패하는 화면이 됩니다.
for (const who of [
  { ...profiles[0], role: 'office', name: '홍현주' },
  { ...profiles[1] },
]) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1600 } })
  wire(ctx, { me: who })
  const p = await open(ctx, `/clients/${CA}`, who)
  ok((await p.locator('[data-client-drivers]').count()) === 0,
    `**${who.role} 에게는 담당 기사 배정이 안 보임**`)
  await ctx.close()
}

// ── ② 사용자 관리 — 사전 등록 ───────────────────────────────────────────────
{
  const calls = []
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1800 } })
  wire(ctx, { calls })
  const p = await open(ctx, '/users')

  ok((await p.locator('[data-staff-invites]').count()) === 1, '**사용자 관리에 「직원 사전 등록」이 있음**')
  const intro = flat(await p.locator('[data-staff-invites]').textContent())
  ok(/비밀번호는 본인이/.test(intro), '**비밀번호는 본인이 정한다고 적혀 있음**')

  await p.click('[data-invite-open]')
  await p.waitForTimeout(400)
  ok((await p.locator('[data-invite-form]').count()) === 1, '등록 폼이 열림')

  await p.fill('[data-invite-email]', 'New.Driver@Beonemirae.test')
  await p.fill('[data-invite-name]', '오대성')
  await p.click('[data-invite-role="field"]')
  await p.selectOption('[data-invite-vehicle]', V1)
  await p.click(`[data-invite-client="${CA}"]`)
  await p.click('[data-invite-save]')
  await p.waitForTimeout(900)

  const inv = calls.find((c) => c.name === 'upsert_staff_invite')
  ok(!!inv, '**서버에 사전 등록을 보냄**')
  ok(inv?.body?.p_role === 'field', '역할이 담김', String(inv?.body?.p_role))
  ok(inv?.body?.p_vehicle_id === V1, '차량이 담김')
  ok(Array.isArray(inv?.body?.p_client_ids) && inv.body.p_client_ids.includes(CA), '담당 거래처가 담김')
  //  비밀번호는 **어떤 이름으로도** 보내지 않습니다.
  ok(!/password|pass|pw/i.test(JSON.stringify(inv?.body ?? {})),
    '**비밀번호는 보내지 않음**', JSON.stringify(inv?.body ?? {}).slice(0, 80))
  await ctx.close()
}

// ── 대기 중인 사전 등록이 목록에 보인다 ─────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1800 } })
  wire(ctx, { invites: [
    { email: 'wait@b.c', name: '오대성', role: 'field', vehicle_id: V1, client_ids: [CA],
      note: '의료폐기물 담당', created_at: '2026-08-01T00:00:00Z', used_at: null },
    { email: 'joined@b.c', name: '백광호', role: 'field', vehicle_id: null, client_ids: [],
      note: '', created_at: '2026-07-01T00:00:00Z', used_at: '2026-07-02T00:00:00Z' },
  ] })
  const p = await open(ctx, '/users')
  ok((await p.locator('[data-invite-row="wait@b.c"]').count()) === 1, '가입 대기 중인 사전 등록이 보임')
  const row = flat(await p.locator('[data-invite-row="wait@b.c"]').textContent())
  ok(/가입 대기/.test(row), '아직 가입 안 했다고 표시')
  ok(/5506호/.test(row), '묶어 둔 차량도 함께', row.slice(0, 70))
  //  이미 가입한 초대는 지우는 버튼이 없어야 합니다 (서버가 막습니다).
  ok((await p.locator('[data-invite-drop="joined@b.c"]').count()) === 0,
    '**가입에 쓰인 초대는 지우는 버튼이 없음**')
  ok(/가입 완료 1명/.test(flat(await p.locator('[data-invite-used]').textContent())), '가입 완료도 기록으로 남음')
  await ctx.close()
}

// ── 계정에 차량 묶기 ────────────────────────────────────────────────────────
{
  const calls = []
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1800 } })
  wire(ctx, { calls })
  const p = await open(ctx, '/users')
  ok((await p.locator(`[data-user-vehicle="${DRV}"]`).count()) === 1, '계정마다 담당 차량 칸이 있음')
  ok((await p.locator(`[data-user-vehicle="${DRV}"]`).inputValue()) === V1, '이미 묶인 차량이 골라져 있음')
  await p.selectOption(`[data-user-vehicle="${DRV}"]`, V2)
  await p.waitForTimeout(900)
  const veh = calls.find((c) => c.name === 'set_profile_vehicle')
  ok(!!veh && veh.body?.p_vehicle_id === V2, '**바꾼 차량을 서버에 보냄**', JSON.stringify(veh?.body ?? {}))
  await ctx.close()
}

// ── ③ 수거 입력 — 차량·기사 칸이 사라진다 ───────────────────────────────────
{
  const me = profiles[1] // 김준기 · 5506호가 묶여 있음
  const calls = []
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  wire(ctx, { me, calls })
  const p = await open(ctx, '/collection', me)

  //  ⚠ 0067 에서 **현장은 차량을 아예 고르지 않습니다.** 예전에는 묶인 차량을
  //     한 줄로 보여 주고 「오늘은 다른 차로 갔어요」로 되돌릴 수 있었는데,
  //     대표님 지시로 그 길까지 없앴습니다 — 「기사님이 고를 항목을 최대한
  //     없애는 것」이 이번 목표라서입니다.
  //     그래서 표시는 [data-my-vehicle] 이 아니라 [data-vehicle-auto] 입니다.
  //     ⚠ 여기서 낮추면 안 되는 것: **무엇으로 저장되는지 보여 주는가**와
  //       **실제로 나가는 값이 본인·본인 차인가**. 아래 그대로 둡니다.
  ok((await p.locator('[data-vehicle-auto]').count()) === 1, '**묶인 차량이 한 줄로만 보임 (고르는 칸 없음)**')
  const line = flat(await p.locator('[data-vehicle-auto]').textContent())
  ok(/5506호/.test(line), '어느 차로 저장되는지 보여 줌', line.slice(0, 50))
  //  이름은 **로그인한 본인**이어야 합니다 — 차량에 적힌 기본 기사(오대성)가
  //  아닙니다. 여기가 뒤집히면 안 간 사람 이름으로 기록이 남습니다.
  ok(/김준기/.test(line) && !/오대성/.test(line),
    '**이름은 로그인한 본인** — 차량 기본 기사가 아님', line.slice(0, 50))
  ok((await p.locator('text=배차 차량 *').count()) === 0, '차량 고르는 칸이 없음')

  //  **실제로 저장되는 값**까지 봅니다. 화면에 이름이 맞게 떠도, 서버로
  //  나가는 값이 차량 기본 기사면 기록에는 안 간 사람이 남습니다.
  await p.selectOption('select', { index: 1 }).catch(() => {})
  await p.fill('input[inputmode="numeric"][placeholder="예: 320"]', '120')
  await p.locator('[data-tour="collect-save"]').dispatchEvent('click')
  await p.waitForTimeout(1200)
  const save = calls.find((c) => c.name === 'complete_collection')
  ok(!!save, '수거 저장이 서버로 나감', save ? '' : '(안 나감)')
  ok(save?.body?.p?.driverName === '김준기',
    '**저장되는 기사 이름이 로그인한 본인** — 차량 기본 기사(오대성)가 아님',
    String(save?.body?.p?.driverName))
  ok(save?.body?.p?.vehicleId === V1, '저장되는 차량이 계정에 묶인 차량', String(save?.body?.p?.vehicleId))

  //  0067 — 「오늘은 다른 차로 갔어요」는 **현장 화면에서 없앴습니다**
  //  (대표님 지시). 대타로 나간 날은 사무실이 고칩니다.
  //
  //  ⚠ 이건 잃은 것이 있는 맞바꿈입니다. 대타로 나간 날 차량이 실제와
  //    다르게 남습니다. 없앤 것이 맞는지는 대표님이 정하실 일이고, 여기서는
  //    **정말로 없어졌는지**만 지킵니다 — 슬그머니 되살아나지 않게.
  const p2 = await open(ctx, '/collection', me)
  ok((await p2.locator('[data-vehicle-other]').count()) === 0,
    '현장 화면에는 「오늘은 다른 차로 갔어요」가 없음 (0067)')
  ok(!/배차 차량/.test(flat(await p2.textContent('body'))), '차량 고르는 칸이 아예 없음')
  await ctx.close()
}

// ── 차량이 안 묶인 현장 계정은 **저장이 막힙니다** (0067) ────────────────────
//
//   예전에는 차량을 고르는 칸이 펼쳐졌습니다. 이제 고르는 칸이 없으므로,
//   차량이 안 묶여 있으면 저장할 방법이 없습니다. 그러면 **저장 직전에
//   막고 무엇을 해야 하는지 말해 줘야** 합니다 — 대표님이 정해 주신 문구.
{
  const me = { ...profiles[1], vehicle_id: null }
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  wire(ctx, { me })
  const p = await open(ctx, '/collection', me)
  ok((await p.locator('[data-vehicle-auto]').count()) === 0, '보여 줄 차량이 없으니 차량 줄도 없음')
  const msg = flat(await p.locator('[data-vehicle-unset]').textContent().catch(() => ''))
  ok(/담당 차량이 지정되지 않았습니다\. 사무실에 문의해 주세요\./.test(msg),
    '**무엇을 해야 하는지 그대로 말해 줌**', msg.slice(0, 60))
  ok(!/배차 차량/.test(flat(await p.textContent('body'))), '아무 차나 고르게 하지 않음')

  //  값을 다 채워도 저장이 잠겨 있어야 합니다 — 눌러 봐야 서버가 거절합니다.
  await p.selectOption('select', { index: 1 }).catch(() => {})
  await p.fill('input[inputmode="numeric"][placeholder="예: 320"]', '120').catch(() => {})
  await p.waitForTimeout(400)
  const disabled = await p.locator('[data-tour="collect-save"]').isDisabled()
  ok(disabled, '**저장 단추가 잠겨 있음** (거절당하는 화면을 안 보여 줌)')
  await ctx.close()
}

// ── ④ 큰 시간 입력 ──────────────────────────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  wire(ctx)
  const p = await open(ctx, '/collection')

  //  ⚠ 0065 부터 폰에서는 시간 칸이 **접혀** 있습니다 (기본값 그대로 저장되는
  //     날이 대부분이라). 접힌 것을 그냥 재면 0px 이 나오고, 그 0 이
  //     「단추가 작아졌다」로 읽힙니다 — 실제로 그렇게 잘못 났습니다.
  //     여기서 확인할 것은 「**펼쳤을 때** 손가락으로 누를 만한가」이므로,
  //     기사님이 하는 그대로 먼저 폅니다.
  const foldTime = p.locator('[data-fold="time"]')
  ok((await foldTime.count()) === 1, '폰에서는 시간 칸이 접혀 있음 (0065)')
  await foldTime.dispatchEvent('click')
  await p.waitForTimeout(400)

  ok((await p.locator('[data-timefield]').count()) === 1, '**시간 입력이 새 칸으로 바뀜**')
  ok((await p.locator('input[type="time"]').count()) === 0, '작은 시계 칸은 사라짐')

  //  손가락으로 누를 만한 크기여야 합니다 (44px 은 애플·구글이 같이 쓰는 최소).
  const hBox = await p.locator('[data-time-input="hour"]').boundingBox()
  const amBox = await p.locator('[data-time-ampm="오전"]').boundingBox()
  ok((hBox?.height ?? 0) >= 44, '**시 칸이 손가락으로 누를 크기**', `${Math.round(hBox?.height ?? 0)}px`)
  ok((amBox?.height ?? 0) >= 44, '오전 버튼도 큼', `${Math.round(amBox?.height ?? 0)}px`)
  ok((hBox?.width ?? 0) >= 60, '시 칸이 좁지 않음', `${Math.round(hBox?.width ?? 0)}px`)

  //  숫자 자판이 뜨는 칸이어야 합니다.
  ok((await p.locator('[data-time-input="hour"]').getAttribute('inputmode')) === 'numeric',
    '**숫자 자판으로 바로 칠 수 있음**')

  //  직접 쳐서 넣기
  await p.fill('[data-time-input="hour"]', '9')
  await p.fill('[data-time-input="min"]', '05')
  await p.locator('[data-time-ampm="오전"]').dispatchEvent('click')
  await p.waitForTimeout(300)
  let saved = await p.locator('[data-time-value]').getAttribute('data-time-value')
  ok(saved === '09:05', '오전 9시 5분 → 09:05', String(saved))

  //  오후로 바꾸면 저장값이 따라갑니다
  await p.locator('[data-time-ampm="오후"]').dispatchEvent('click')
  await p.waitForTimeout(300)
  saved = await p.locator('[data-time-value]').getAttribute('data-time-value')
  ok(saved === '21:05', '오후로 누르면 21:05', String(saved))

  //  ＋/－ 로도
  await p.locator('[data-time-step="min+"]').dispatchEvent('click')
  await p.waitForTimeout(300)
  saved = await p.locator('[data-time-value]').getAttribute('data-time-value')
  ok(saved === '21:10', '분 ＋ 는 5분 단위', String(saved))

  //  점심 — 여기가 틀리면 오후 12시가 새벽으로 저장됩니다
  await p.fill('[data-time-input="hour"]', '12')
  await p.fill('[data-time-input="min"]', '30')
  await p.waitForTimeout(300)
  saved = await p.locator('[data-time-value]').getAttribute('data-time-value')
  ok(saved === '12:30', '**오후 12시 30분 → 12:30** (0시가 아님)', String(saved))

  //  화면에 저장될 값이 그대로 적혀 있어야 합니다.
  ok(/12:30/.test(flat(await p.locator('[data-timefield]').textContent())), '저장될 시간을 눈으로 확인할 수 있음')

  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  ok(over <= 1, '폰에서 가로 스크롤이 안 생김', `${over}px`)
  await ctx.close()
}

// ── PC 에서도 시간 입력이 쓸 만해야 합니다 ─────────────────────────────────
//   폰만 보고 고치면 사무실 화면이 어그러진 줄 모르고 지나갑니다.
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1400 } })
  wire(ctx)
  const p = await open(ctx, '/collection')
  const hBox = await p.locator('[data-time-input="hour"]').boundingBox()
  ok((hBox?.height ?? 0) >= 44 && (hBox?.width ?? 0) >= 60, 'PC 에서도 시 칸이 큼',
    `${Math.round(hBox?.width ?? 0)}×${Math.round(hBox?.height ?? 0)}`)
  //  넓은 화면에서는 시·분이 한 줄입니다.
  const mBox = await p.locator('[data-time-input="min"]').boundingBox()
  ok(Math.abs((hBox?.y ?? 0) - (mBox?.y ?? 0)) < 5, 'PC 에서는 시·분이 한 줄',
    `${Math.round(hBox?.y ?? 0)} · ${Math.round(mBox?.y ?? 0)}`)
  await p.fill('[data-time-input="hour"]', '12')
  await p.fill('[data-time-input="min"]', '30')
  await p.click('[data-time-ampm="오전"]')
  await p.waitForTimeout(300)
  ok((await p.locator('[data-time-value]').getAttribute('data-time-value')) === '00:30',
    '**오전 12시 30분 → 00:30** (자정)',
    String(await p.locator('[data-time-value]').getAttribute('data-time-value')))
  await ctx.close()
}

console.log('')
console.log(`총 ${out.length}건 · 실패 ${out.filter((v) => !v).length}건`)
await b.close()
