// ─────────────────────────────────────────────────────────────────────────────
// 전화로 받은 요청을 사무실이 대신 접수할 때 (실제 브라우저 · 실제 DB)
//
//  병원 담당자 대부분은 포털에 들어오지 않고 전화를 겁니다. 그래서 실제로
//  가장 많이 쓰이는 길은 포털이 아니라 이 '대행 접수' 쪽입니다.
//
//  여기서 확인하는 것
//   · 사무실이 대신 넣은 요청이 그 병원 것으로 제대로 붙는가
//     (엉뚱한 병원에 붙으면 그 병원 포털에 남의 요청이 보입니다)
//   · 병원이 자기 포털에서 그 요청을 볼 수 있는가
//   · 사무실이 회신하면 병원 화면에 그대로 보이는가
//   · 「병원 직접 / 대행 접수」 구분이 화면에서 지켜지는가
//
//  실행
//    npm run build && npx vite preview --port 4173
//    export SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=...
//    export TEST_OFFICE_PW=... TEST_CLIENT_PW=...
//    node supabase/test/28_staff_request.mjs
//
//  · 만든 요청은 끝나면 지웁니다. 시작·종료 건수를 비교합니다.
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
const ok = (t, e = '') => { pass++; console.log(`  PASS  ${t}${e ? '  ' + e : ''}`) }
const no = (t, e = '') => { fail++; console.log(`  FAIL  ${t}${e ? '  ' + e : ''}`) }
const check = (c, t, e = '') => (c ? ok(t, e) : no(t, e))
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

async function signIn(page, email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.fill('#login-email', email)
  await page.fill('#login-password', password)
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 }),
    page.click('button[type="submit"]'),
  ])
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1500)
}

async function main() {
  console.log('\n════ 전화로 받은 요청을 사무실이 대신 접수 ════')

  //  병원 계정이 붙어 있는 거래처로 해야 포털 확인까지 갈 수 있습니다.
  const prof = (await svc(`/profiles?select=client_id&email=eq.${encodeURIComponent(`client@${DOMAIN}`)}`)).body?.[0]
  if (!prof?.client_id) {
    console.error('병원 계정에 소속 병원이 없습니다. 05_live.mjs --setup 을 먼저 실행하세요.')
    process.exit(1)
  }
  const client = (await svc(`/clients?select=id,name&id=eq.${prof.client_id}`)).body?.[0]
  const content = `${MARK}전화로 받은 추가 수거 요청-${Date.now() % 100000}`
  const reply = `${MARK}내일 오전에 방문하겠습니다`
  const startCount = ((await svc('/client_requests?select=id')).body ?? []).length
  let madeId = null

  const pw = (await import(process.env.PLAYWRIGHT_MODULE || 'playwright')).default
  const browser = await pw.chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: process.env.CHROMIUM_TLS12 ? ['--ssl-version-max=tls1.2'] : [],
  })
  const errors = []

  try {
    // ── 1. 사무실이 대신 접수 ───────────────────────────────────────────
    section('1. 사무실이 전화 내용을 대신 넣는다')
    const office = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
    office.on('pageerror', (e) => errors.push(`[사무실] ${e.message}`))
    office.on('console', (m) => { if (m.type() === 'error') errors.push(`[사무실] ${m.text()}`) })
    await signIn(office, `office@${DOMAIN}`, process.env.TEST_OFFICE_PW)

    await office.goto(`${BASE}/requests`, { waitUntil: 'networkidle' })
    await office.waitForTimeout(2500)

    //  화면의 실제 이름은 「전화 요청 접수」 입니다.
    const openBtn = office.locator('button:has-text("전화 요청 접수")').first()
    check(await openBtn.count() > 0, '「전화 요청 접수」 버튼이 있음')
    await openBtn.click()
    await office.waitForTimeout(1200)

    const dialog = office.locator('[role="dialog"]')
    check(await dialog.count() > 0, '대행 접수 창이 열림')

    //  거래처를 고르지 않으면 저장 버튼이 잠겨 있어야 합니다.
    const submit = dialog.locator('button:text-is("접수")').first()
    check(await submit.isDisabled(), '거래처·내용이 비면 접수 버튼이 잠김')

    await dialog.locator('#nr-client').selectOption(client.id)
    await dialog.locator('#nr-content').fill(content)
    await office.waitForTimeout(600)
    check(!(await submit.isDisabled()), '거래처와 내용을 채우면 접수 버튼이 열림')
    await submit.click()
    await office.waitForTimeout(4000)

    // ── 2. DB 확인 ──────────────────────────────────────────────────────
    section('2. DB 확인')
    const made = (await svc(`/client_requests?select=*&content=eq.${encodeURIComponent(content)}`)).body?.[0]
    check(!!made, '요청이 DB 에 저장됨', made ? `${made.kind} · ${made.status}` : '안 됨')
    if (!made) return
    madeId = made.id
    check(made.client_id === client.id, '고른 병원에 정확히 붙음', client.name)
    check(made.source === 'staff', "'대행 접수' 로 구분되어 저장됨", made.source)
    check(made.status === '접수', '처음 상태는 접수')

    // ── 3. 병원이 자기 포털에서 보는가 ──────────────────────────────────
    section('3. 병원 포털에서 보이는가')
    const portal = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage()
    portal.on('pageerror', (e) => errors.push(`[병원] ${e.message}`))
    await signIn(portal, `client@${DOMAIN}`, process.env.TEST_CLIENT_PW)
    await portal.goto(`${BASE}/portal/history`, { waitUntil: 'networkidle' })
    await portal.waitForTimeout(3000)
    let ptext = await portal.locator('body').innerText()
    if (!ptext.includes(content.slice(0, 16))) {
      await portal.goto(`${BASE}/portal`, { waitUntil: 'networkidle' })
      await portal.waitForTimeout(3000)
      ptext = await portal.locator('body').innerText()
    }
    check(ptext.includes(content.slice(0, 16)), '병원이 자기 포털에서 그 요청을 봄')

    // ── 4. 사무실 회신이 병원에 보이는가 ────────────────────────────────
    section('4. 사무실 회신 → 병원 확인')
    await office.reload({ waitUntil: 'networkidle' })
    await office.waitForTimeout(2500)
    //  회신은 카드의 「회신 남기기」 로 창을 열어 씁니다.
    const card = office
      .locator('div')
      .filter({ hasText: content })
      .filter({ has: office.locator('button:has-text("회신 남기기")') })
      .last()
    await card.locator('button:has-text("회신 남기기")').first().click()
    await office.waitForTimeout(1500)
    await office.locator('[role="dialog"] textarea').first().fill(reply)
    await office.locator('button:has-text("회신 저장")').first().click()
    await office.waitForTimeout(4000)

    const replied = (await svc(`/client_requests?select=reply,handled_by,handled_at&id=eq.${madeId}`)).body?.[0]
    check(replied?.reply === reply, '회신이 DB 에 저장됨', replied?.reply ?? '없음')
    check(!!replied?.handled_by && !!replied?.handled_at, '처리한 사람과 시각이 남음',
      replied?.handled_at ?? '없음')

    await portal.reload({ waitUntil: 'networkidle' })
    await portal.waitForTimeout(3000)
    const ptext2 = await portal.locator('body').innerText()
    check(ptext2.includes(reply.slice(0, 12)), '병원 화면에 회신이 그대로 보임')
    await portal.close()

    // ── 5. 화면의 구분 ─────────────────────────────────────────────────
    section('5. 「병원 직접 / 대행 접수」 구분')
    await office.goto(`${BASE}/requests`, { waitUntil: 'networkidle' })
    await office.waitForTimeout(2500)
    const direct = office.locator('button:has-text("병원 직접")').first()
    if (await direct.count()) {
      await direct.click()
      await office.waitForTimeout(1500)
      const filtered = await office.locator('body').innerText()
      check(!filtered.includes(content.slice(0, 16)),
        "'병원 직접' 만 골랐을 때 대행 접수 건은 빠짐")
    }

    // ── 6. 화면 오류 ───────────────────────────────────────────────────
    section('6. 콘솔 오류')
    const real = errors.filter((e) => !/favicon|jsdelivr|pretendard|Failed to load resource|net::ERR_/.test(e))
    check(real.length === 0, '자바스크립트 오류 없음', real.slice(0, 3).join(' | '))
    await office.close()
  } catch (e) {
    no('검사 도중 오류가 났습니다', String(e?.message ?? e).slice(0, 200))
  } finally {
    section('정리')
    if (madeId) await svc(`/client_requests?id=eq.${madeId}`, { method: 'DELETE' })
    const endCount = ((await svc('/client_requests?select=id')).body ?? []).length
    check(endCount === startCount, '요청 건수가 시작 시점과 같음', `${startCount}건 → ${endCount}건`)
    await browser.close()

    console.log(`\n════ ${pass} PASS / ${fail} FAIL ════`)
    console.log(`대행 접수 흐름: ${fail === 0 ? 'YES' : 'NO'}`)
    process.exit(fail === 0 ? 0 : 1)
  }
}

main().catch((e) => {
  console.error('\n실행 오류:', e)
  process.exit(1)
})
