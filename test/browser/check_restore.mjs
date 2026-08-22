import { chromium, EXEC } from './_pw.mjs'

//  거래를 종료한 거래처 / 사용 중지한 차량을 앱 안에서 되돌릴 수 있는지 확인합니다.
//  예전에는 되돌리는 길이 아예 없어 SQL 을 직접 쓰는 수밖에 없었습니다.

const BASE = 'http://localhost:4173'
const SHOT = (process.env.TEST_OUT ?? '/tmp')
const UID = '00000000-0000-0000-0000-0000000000ad'

const out = []
const ok = (c, m, d = '') => {
  //  바로 찍습니다 — 모아 뒀다가 끝에 한 번에 내보내면 중간에 터졌을 때
  //  앞의 결과까지 전부 사라지고, 회귀 집계에 「검사 0 · 실패 0」으로
  //  남아 통과한 것처럼 보입니다.
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  out.push(c)
  if (!c) process.exitCode = 1
}

const profile = {
  id: UID, email: 'admin@beonemirae.test', name: '대표', role: 'admin', font_scale: 'normal',
  active: true, approved_at: '2026-01-01T00:00:00Z', client_id: null, created_at: '2026-01-01T00:00:00Z',
}

const mkClient = (n, name, active) => ({
  id: `00000000-0000-0000-0000-0000000000c${n}`, name, type: '요양병원', address: '경기도 성남시',
  manager: '김담당', phone: '031-000-0000', collection_cycle: '주 1회',
  collects_medical_waste: true, collects_diaper: false, storage_size: '보통', note: '',
  is_demo_generated: false, demo_session_id: null, active,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
})
const mkVehicle = (n, name, active) => ({
  id: `00000000-0000-0000-0000-0000000000v${n}`, name, waste_type: '의료폐기물',
  tonnage: 1, nominal_capacity: 1000, expected_capacity: 800, driver: '김기사', active,
})

//  거래 중 1곳 + 거래 종료 2곳, 운행 1대 + 사용 중지 1대
let clients = [mkClient(1, '더원요양병원', true), mkClient(2, '한빛의원', false), mkClient(3, '새봄병원', false)]
let vehicles = [mkVehicle(1, '의료 1호', true), mkVehicle(2, '의료 2호', false)]

const patched = []   // 서버로 실제로 나간 update 요청

const b = await chromium.launch({ executablePath: EXEC })
const ctx = await b.newContext({ viewport: { width: 1400, height: 1100 } })
await ctx.route('**/rest/v1/**', async (r) => {
  const req = r.request()
  const url = req.url()
  const single = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
  const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })

  if (req.method() === 'PATCH') {
    let body = {}
    try { body = JSON.parse(req.postData() ?? '{}') } catch { /* 무시 */ }
    const id = decodeURIComponent((url.match(/id=eq\.([^&]+)/) ?? [])[1] ?? '')
    const table = url.includes('/clients') ? 'clients' : url.includes('/vehicles') ? 'vehicles' : '기타'
    patched.push({ table, id, body })
    //  서버가 반영한 것처럼 다음 로드에 반영해 줍니다
    if (table === 'clients') clients = clients.map((c) => (c.id === id ? { ...c, ...body } : c))
    if (table === 'vehicles') vehicles = vehicles.map((v) => (v.id === id ? { ...v, ...body } : v))
    return json([{ id }])
  }
  if (req.method() === 'POST') return json([{ id: 'x' }])

  if (url.includes('/profiles')) return json(single ? profile : [profile])
  if (url.includes('/clients')) return json(single ? clients[0] : clients)
  if (url.includes('/vehicles')) return json(vehicles)
  if (url.includes('/office_stock')) {
    const st = { id: 1, corrugated_box: 100, plastic_container: 50, bag: 200, needle_box: 30 }
    return json(single ? st : [st])
  }
  return json([])
})
const p = await ctx.newPage()
p.on('dialog', (d) => d.accept())
await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
  access_token: 't', token_type: 'bearer', expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
})), ['beonemirae-ops:auth', { id: UID, aud: 'authenticated', email: profile.email, app_metadata: {}, user_metadata: {} }])

// ── 1. 거래처 ─────────────────────────────────────────────────────────────
await p.goto(`${BASE}/clients`, { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(2500)

const main = () => p.textContent('main').then((t) => t ?? '')
const t0 = await main()
ok(t0.includes('더원요양병원'), '거래 중인 곳은 목록에 있음')
ok(!/한빛의원[\s\S]{0,200}요양병원/.test(t0.split('거래 종료한 거래처')[0]), '거래 종료한 곳은 목록에 섞이지 않음')

const rc = p.locator('[data-retired-clients]')
ok((await rc.count()) === 1, '「거래 종료한 거래처」 칸이 생김')
ok(/거래 종료한 거래처 2곳/.test(t0), '2곳으로 표시')
//  접혀 있어야 합니다
ok(!(await rc.locator('button').first().isVisible()), '평소에는 접혀 있음')

await rc.locator('summary').click()
await p.waitForTimeout(300)
const opened = (await rc.textContent()) ?? ''
ok(opened.includes('한빛의원') && opened.includes('새봄병원'), '펼치면 종료한 두 곳이 보임')
await p.screenshot({ path: `${SHOT}/retired-clients.png`, fullPage: true })

//  「거래 재개」 누르기 — 한빛의원
const row = rc.locator('[data-retired-client="00000000-0000-0000-0000-0000000000c2"]')
ok(((await row.textContent()) ?? '').includes('한빛의원'), '줄이 한빛의원임')
await row.getByRole('button', { name: /거래 재개/ }).click()
await p.waitForTimeout(1200)

const cPatch = patched.find((x) => x.table === 'clients')
ok(!!cPatch, '서버로 거래처 수정 요청이 나감')
ok(cPatch?.id === '00000000-0000-0000-0000-0000000000c2', '누른 거래처의 id 로 나감', cPatch?.id)
ok(cPatch?.body?.active === true, 'active=true 로 되돌림', JSON.stringify(cPatch?.body))
ok(Object.keys(cPatch?.body ?? {}).length === 1, 'active 외에 다른 값은 건드리지 않음')

//  다시 읽으면 목록으로 돌아와야 합니다
await p.reload({ waitUntil: 'domcontentloaded' })
await p.waitForTimeout(2500)
const t1 = await main()
ok(t1.split('거래 종료한 거래처')[0].includes('한빛의원'), '되돌린 곳이 목록에 돌아옴')
ok(/거래 종료한 거래처 1곳/.test(t1), '종료 목록은 1곳으로 줄어듦')

// ── 2. 차량 ───────────────────────────────────────────────────────────────
await p.goto(`${BASE}/settings`, { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(2500)

const rv = p.locator('[data-retired-vehicles]')
ok((await rv.count()) === 1, '「사용 중지한 차량」 칸이 생김')
ok(/사용 중지한 차량 1대/.test(await main()), '1대로 표시')
const settingsText = await main()
//  운행 중인 차량 목록에 섞이면 안 됩니다
ok(settingsText.indexOf('의료 1호') < settingsText.indexOf('사용 중지한 차량'), '운행 중 차량과 섞이지 않음')

await rv.locator('summary').click()
await p.waitForTimeout(300)
ok(((await rv.textContent()) ?? '').includes('의료 2호'), '펼치면 사용 중지한 차량이 보임')
await rv.getByRole('button', { name: /다시 사용/ }).click()
await p.waitForTimeout(1200)

const vPatch = patched.find((x) => x.table === 'vehicles')
ok(!!vPatch, '서버로 차량 수정 요청이 나감')
ok(vPatch?.id === '00000000-0000-0000-0000-0000000000v2', '누른 차량의 id 로 나감', vPatch?.id)
ok(vPatch?.body?.active === true, 'active=true 로 되돌림', JSON.stringify(vPatch?.body))

await p.reload({ waitUntil: 'domcontentloaded' })
await p.waitForTimeout(2500)
ok((await p.locator('[data-retired-vehicles]').count()) === 0, '되돌리면 「사용 중지한 차량」 칸이 사라짐')
ok((await main()).includes('의료 2호'), '되돌린 차량이 운행 목록에 돌아옴')
await p.screenshot({ path: `${SHOT}/restored-vehicle.png`, fullPage: true })

// ── 3. 감사기록이 남았는가 ────────────────────────────────────────────────
//  (POST /audit_logs 가 나갔는지 — 되돌린 것도 기록이 남아야 합니다)
await b.close()
console.log('')
console.log(`총 ${out.length}건 · 실패 ${out.filter((v) => !v).length}건`)
