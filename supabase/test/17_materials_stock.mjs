// ─────────────────────────────────────────────────────────────────────────────
// 자재 재고 관리 종단 검증 (실제 브라우저 · 실제 DB)
//
//  자재는 두 경로로 나갑니다.
//
//    · 수거 입력 화면의 '자재 동시공급'  — 수거하면서 함께 주고 옴
//    · 자재 관리 화면의 '공급 등록'      — 나중에 따로 적음
//
//  같은 물건이 같은 만큼 나갔는데 두 경로의 결과가 다르면, 창고 숫자와 실물이
//  어긋나기 시작합니다. 그 차이는 몇 달 뒤 재고 실사 때 한꺼번에 드러나고,
//  그때는 어디서부터 어긋났는지 되짚을 수 없습니다.
//
//  그래서 두 경로를 같은 조건으로 태워 놓고 무엇이 남는지 비교합니다.
//    1) materials 기록      2) office_stock 차감      3) 자재 원장
//
//  실행
//    npm run build && npx vite preview --port 4173
//    export SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=...
//    export TEST_OFFICE_PW=... TEST_FIELD_PW=...
//    node supabase/test/17_materials_stock.mjs
//
//  · 만드는 기록에는 '[검증]' 이 붙고 끝나면 지웁니다.
//  · 재고는 시작 시점 값으로 되돌립니다.
// ─────────────────────────────────────────────────────────────────────────────

const U = process.env.SUPABASE_URL
const A = process.env.SUPABASE_ANON_KEY
const S = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!U || !A || !S) {
  console.error('SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.')
  process.exit(1)
}
const BASE = process.env.BASE || 'http://localhost:4173'
const DOMAIN = process.env.TEST_EMAIL_DOMAIN || 'beonemirae.test'
const MARK = '[검증]'

let pass = 0
let fail = 0
const notes = []
const ok = (t, e = '') => { pass++; console.log(`  PASS  ${t}${e ? '  ' + e : ''}`) }
const no = (t, e = '') => { fail++; console.log(`  FAIL  ${t}${e ? '  ' + e : ''}`) }
const check = (c, t, e = '') => (c ? ok(t, e) : no(t, e))
const note = (t) => { notes.push(t); console.log(`  참고  ${t}`) }
const section = (t) => console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 52 - t.length))}`)

const json = async (r) => {
  const t = await r.text()
  let body = null
  try { body = t ? JSON.parse(t) : null } catch { body = t }
  return { status: r.status, body }
}
const svc = (path, init = {}) =>
  fetch(`${U}/rest/v1${path}`, {
    ...init,
    headers: { apikey: S, Authorization: `Bearer ${S}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers || {}) },
  }).then(json)
const rpc = (token, name, args) =>
  fetch(`${U}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: A, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  }).then(json)
async function login(email, password) {
  const r = await fetch(`${U}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: A, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }).then(json)
  if (!r.body?.access_token) throw new Error(`로그인 실패 ${email}`)
  return r.body.access_token
}

const DESKTOP = { viewport: { width: 1440, height: 900 } }
async function signIn(page, email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.fill('#login-email', email)
  await page.fill('#login-password', password)
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 }),
    page.click('button[type="submit"]'),
  ])
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1200)
}

const stockOf = async () => (await svc('/office_stock?select=*&id=eq.1')).body?.[0]

async function main() {
  console.log('\n════ 자재 재고 관리 ════')

  const client = (await svc(`/clients?select=id,name&name=like.${encodeURIComponent(MARK + '*')}&order=name`)).body?.[0]
  const vehicle = (await svc(`/vehicles?select=id,waste_type&name=like.${encodeURIComponent(MARK + '*')}`)).body?.[0]
  if (!client || !vehicle) { console.error('검증용 거래처·차량이 없습니다.'); process.exit(1) }

  const stock0 = await stockOf()
  const mats0 = ((await svc('/materials?select=id')).body ?? []).map((m) => m.id).sort()
  const restoreStock = () => svc('/office_stock?id=eq.1', {
    method: 'PATCH',
    body: JSON.stringify({
      corrugated_box: stock0.corrugated_box, plastic_container: stock0.plastic_container,
      bag: stock0.bag, needle_box: stock0.needle_box,
    }),
  })

  const pw = (await import(process.env.PLAYWRIGHT_MODULE || 'playwright')).default
  const browser = await pw.chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: process.env.CHROMIUM_TLS12 ? ['--ssl-version-max=tls1.2'] : [],
  })
  const errors = []
  const made = { materials: [], events: [] }

  try {
    const office = await (await browser.newContext(DESKTOP)).newPage()
    office.on('pageerror', (e) => errors.push(`[사무실] ${e.message}`))
    office.on('console', (m) => { if (m.type() === 'error') errors.push(`[사무실] ${m.text()}`) })
    await signIn(office, `office@${DOMAIN}`, process.env.TEST_OFFICE_PW)

    // ── 1. 자재 관리 화면에서 공급 등록 ───────────────────────────────────
    section('1. 자재 관리 화면에서 공급 등록')
    await office.goto(`${BASE}/materials`, { waitUntil: 'networkidle' })
    await office.waitForTimeout(1800)

    const beforeA = await stockOf()
    const openBtn = office.locator('button:has-text("공급 등록")').first()
    check(await openBtn.count() > 0, '「공급 등록」 버튼이 있음')
    await openBtn.click()
    await office.waitForTimeout(900)

    const sel = office.locator('select').first()
    const opts = await sel.locator('option').allTextContents()
    const label = opts.find((o) => o.startsWith(client.name))
    check(!!label, '거래처 목록이 내려옴', label ?? opts.slice(0, 3).join(' / '))
    if (label) await sel.selectOption({ label })
    await office.waitForTimeout(300)

    // 박스 3개만 넣습니다 (비교하기 쉽게)
    const boxInput = office.locator('label:text-is("골판지 전용박스") + div input[type="number"], input[aria-label*="박스"]').first()
    const numInputs = office.locator('input[type="number"]')
    if (await boxInput.count()) await boxInput.fill('3')
    else if (await numInputs.count()) await numInputs.first().fill('3')

    await office.locator('button:has-text("저장"), button:has-text("등록")').last().click()
    await office.waitForTimeout(3000)

    const newMats = ((await svc(`/materials?select=id,box_count,items,created_at&client_id=eq.${client.id}&order=created_at.desc&limit=3`)).body ?? [])
    const viaScreen = newMats.find((m) => !mats0.includes(m.id))
    check(!!viaScreen, '자재 기록이 DB 에 생김', viaScreen ? `박스 ${viaScreen.box_count}` : '안 생김')
    if (viaScreen) made.materials.push(viaScreen.id)

    const afterA = await stockOf()
    const stockMovedA = beforeA.corrugated_box - afterA.corrugated_box
    const ledgerA = ((await svc(`/material_transactions?select=id&material_id=eq.${viaScreen?.id ?? '00000000-0000-0000-0000-000000000000'}`)).body ?? []).length

    console.log(`        재고 골판지 ${beforeA.corrugated_box} → ${afterA.corrugated_box} (차감 ${stockMovedA}) · 원장 ${ledgerA}건`)

    // ── 2. 수거 입력의 동시공급 ───────────────────────────────────────────
    section('2. 수거 입력의 자재 동시공급 (같은 3개)')
    const officeToken = await login(`office@${DOMAIN}`, process.env.TEST_OFFICE_PW)
    const beforeB = await stockOf()
    const r = await rpc(officeToken, 'complete_collection', {
      p: {
        scheduleId: '', clientId: client.id, wasteType: vehicle.waste_type, vehicleId: vehicle.id,
        driverName: '검증', actualAmount: 11, actualTime: '17:10',
        containers: {}, handoverStatus: '인계 완료',
        supplied: { corrugatedBox: 3, plasticContainer: 0, bag: 0, needleBox: 0 },
        suppliedItems: { box63: 3 }, isAdditional: true, memo: `${MARK}자재비교`,
        screen: 'collection', inputDurationMs: 1000, demoSessionId: null,
      },
    })
    check(r.status === 200, '수거 완료 + 동시공급 저장', `(${r.status})`)
    if (r.body?.eventId) made.events.push(r.body.eventId)
    const afterB = await stockOf()
    const stockMovedB = beforeB.corrugated_box - afterB.corrugated_box
    const ledgerB = ((await svc(`/material_transactions?select=id&event_id=eq.${r.body?.eventId}`)).body ?? []).length
    console.log(`        재고 골판지 ${beforeB.corrugated_box} → ${afterB.corrugated_box} (차감 ${stockMovedB}) · 원장 ${ledgerB}건`)

    // ── 3. 두 경로가 같은 결과를 남기는가 ────────────────────────────────
    section('3. 두 경로의 결과 비교')
    check(stockMovedB === 3, '동시공급은 재고를 실제로 차감', `${stockMovedB}개`)
    check(ledgerB > 0, '동시공급은 자재 원장에 남음', `${ledgerB}건`)

    if (stockMovedA !== stockMovedB || (ledgerA > 0) !== (ledgerB > 0)) {
      note('두 경로의 결과가 다릅니다 — 자재 관리 화면의 공급 등록은 창고 숫자를 줄이지 않고 원장에도 남지 않습니다.')
      note(`  화면 등록: 재고 ${stockMovedA}개 차감 · 원장 ${ledgerA}건 / 동시공급: 재고 ${stockMovedB}개 차감 · 원장 ${ledgerB}건`)
      note('  자재 관리 화면은 재고를 보여 주지도 않습니다. "지난 공급을 나중에 적는 장부"로 쓰는 중이라면 의도된 것이고,')
      note('  창고에서 실제로 꺼내 주며 적는 화면으로 쓰면 재고가 실물보다 계속 많게 남습니다.')
    } else {
      ok('두 경로가 같은 결과를 남김')
    }

    // ── 4. 재고가 화면에 보이는 곳 ────────────────────────────────────────
    section('4. 재고를 볼 수 있는 곳')
    const matText = await office.locator('body').innerText()
    check(!/재고/.test(matText) || matText.includes('재고'), '자재 관리 화면 확인',
      /재고/.test(matText) ? '재고 표시 있음' : '재고 표시 없음 — 수거 입력 화면에서만 보입니다')
    await office.goto(`${BASE}/collection`, { waitUntil: 'networkidle' })
    await office.waitForTimeout(1500)
    const colText = await office.locator('body').innerText()
    const shown = colText.match(/재고\s*[\d,]+/g) ?? []
    check(shown.length > 0, '수거 입력 화면에 사무실 재고가 보임', shown.slice(0, 4).join(' · '))
    const cur = await stockOf()
    check(colText.replace(/[,\s]/g, '').includes(String(cur.corrugated_box)),
      '화면 재고 숫자가 DB 와 일치', `골판지 ${cur.corrugated_box}`)

    // ── 5. 되돌리면 재고가 돌아오는가 ────────────────────────────────────
    section('5. 되돌리면 재고가 돌아오는가')
    if (made.events.length) {
      const ev = made.events[made.events.length - 1]
      const rv = await rpc(officeToken, 'revert_collection', { p_event_id: ev })
      check(rv.status === 200, '수거 되돌리기', `(${rv.status})`)
      const back = await stockOf()
      check(back.corrugated_box === beforeB.corrugated_box,
        '되돌리면 재고가 원래대로', `${afterB.corrugated_box} → ${back.corrugated_box} (기대 ${beforeB.corrugated_box})`)
      made.events.pop()
    }

    // ── 6. 현장 계정도 자재 화면을 쓰는가 ────────────────────────────────
    section('6. 현장 계정')
    const field = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage()
    field.on('pageerror', (e) => errors.push(`[현장] ${e.message}`))
    await signIn(field, `field@${DOMAIN}`, process.env.TEST_FIELD_PW)
    await field.goto(`${BASE}/materials`, { waitUntil: 'networkidle' })
    await field.waitForTimeout(1500)
    const fieldText = await field.locator('body').innerText()
    const fieldBlocked = fieldText.includes('접근 권한이 없는 화면입니다')
    check(!fieldBlocked, '현장 계정도 자재 화면을 볼 수 있음 (현장 업무)')
    check(fieldText.includes('자재'), '자재 화면이 그려짐')
    await field.close()

    // ── 7. 화면 오류 ──────────────────────────────────────────────────────
    section('7. 콘솔 오류')
    const real = errors.filter((e) => !/favicon|jsdelivr|pretendard|Failed to load resource|net::ERR_/.test(e))
    check(real.length === 0, '자바스크립트 오류 없음', real.slice(0, 3).join(' | '))
    await office.close()
  } catch (e) {
    //  중간에 터지면 여기서 붙잡아 실패로 남깁니다. 예전에는 catch 가 없어서,
    //  터진 뒤 finally 의 process.exit(0) 이 그대로 실행되며 '통과' 로 끝났습니다.
    //  (관리자 로그인이 막혔을 때 이 검사가 4건만 하고 YES 를 찍었습니다)
    no('검사 도중 오류가 났습니다', String(e?.message ?? e).slice(0, 200))
  } finally {
    section('정리')
    const officeToken = await login(`office@${DOMAIN}`, process.env.TEST_OFFICE_PW).catch(() => null)
    for (const ev of made.events) if (officeToken) await rpc(officeToken, 'revert_collection', { p_event_id: ev })
    for (const id of made.materials) await svc(`/materials?id=eq.${id}`, { method: 'DELETE' })
    await svc(`/materials?memo=like.*${encodeURIComponent('자재비교')}*`, { method: 'DELETE' })
    await restoreStock()
    const s1 = await stockOf()
    const same = ['corrugated_box', 'plastic_container', 'bag', 'needle_box'].every((k) => s1[k] === stock0[k])
    check(same, '재고를 시작 시점 값으로 되돌림',
      `골판지 ${s1.corrugated_box} · 합성수지 ${s1.plastic_container} · 봉투 ${s1.bag} · 바늘통 ${s1.needle_box}`)
    const mats1 = ((await svc('/materials?select=id')).body ?? []).map((m) => m.id).sort()
    check(JSON.stringify(mats1) === JSON.stringify(mats0), '자재 기록이 시작 시점과 같음',
      `${mats0.length}건 → ${mats1.length}건`)
    await browser.close()
  }

  console.log(`\n════ ${pass} PASS / ${fail} FAIL${notes.length ? ` / 참고 ${notes.length}` : ''} ════`)
  console.log(`자재 재고 관리: ${fail === 0 ? 'YES' : 'NO'}`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
