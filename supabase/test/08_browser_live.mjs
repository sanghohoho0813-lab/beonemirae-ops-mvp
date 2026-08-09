// ─────────────────────────────────────────────────────────────────────────────
// 실제 계정 · 실제 Supabase · 실제 브라우저 종단 검증
//
//  05~07 은 API 경로를 봅니다. 이 스크립트는 사람이 실제로 쓰는 경로 —
//  브라우저에서 로그인하고, 화면에서 입력하고, 다른 기기에서 확인하는 —
//  그 흐름을 그대로 밟습니다.
//
//   1) PC(1440) 사무실 계정 로그인 → 메뉴 이동 (로그인 후 네비게이션 회귀 확인)
//   2) PC 화면에서 수거를 직접 입력 (규격별 유상·무상 자재 공급 포함)
//   3) Mobile(390) 현장 계정 로그인 → 방금 PC 에서 넣은 값이 그대로 보이는가
//   4) Mobile 병원 계정 → 포털 밖으로 못 나가는가
//
//  실행
//    npm run build && npx vite preview --port 4173      # 다른 터미널에서
//    export SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=...
//    export TEST_OFFICE_PW=... TEST_FIELD_PW=... TEST_CLIENT_PW=...
//    node supabase/test/08_browser_live.mjs
//
//  · .env.local 에 실제 VITE_SUPABASE_URL / ANON 키가 있어야 합니다
//    (없으면 앱이 시연 모드로 뜨고 로그인 화면이 나오지 않습니다).
//  · service 키는 "DB 에 실제로 뭐가 남았는지" 확인용으로만 씁니다.
//  · PLAYWRIGHT 경로는 환경마다 다릅니다. PLAYWRIGHT_MODULE / CHROMIUM_PATH 로
//    바꿀 수 있습니다.
// ─────────────────────────────────────────────────────────────────────────────

const pw = (await import(process.env.PLAYWRIGHT_MODULE || 'playwright')).default

const BASE = process.env.BASE || 'http://localhost:4173'
const DOMAIN = process.env.TEST_EMAIL_DOMAIN || 'beonemirae.test'
const SB = process.env.SUPABASE_URL
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY

let pass = 0, fail = 0
const ok = (t, e = '') => { pass++; console.log(`  PASS  ${t}${e ? '  ' + e : ''}`) }
const no = (t, e = '') => { fail++; console.log(`  FAIL  ${t}${e ? '  ' + e : ''}`) }
const check = (c, t, e = '') => (c ? ok(t, e) : no(t, e))
const section = (t) => console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 58 - t.length))}`)
const at = (page) => new URL(page.url()).pathname

const truth = async (path, init = {}) => {
  const r = await fetch(`${SB}/rest/v1${path}`, {
    ...init,
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
  })
  const t = await r.text()
  try { return { status: r.status, body: t ? JSON.parse(t) : null } } catch { return { status: r.status, body: t } }
}

const DESKTOP = { viewport: { width: 1440, height: 900 } }
const MOBILE = {
  viewport: { width: 390, height: 844 },
  isMobile: true, hasTouch: true, deviceScaleFactor: 3,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
}

async function login(page, email, pwd) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.fill('#login-email', email)
  await page.fill('#login-password', pwd)
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 }),
    page.click('button[type="submit"]'),
  ])
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(700)
}

/** 역할이 막는 화면인가 — 제품은 주소를 바꾸는 대신 차단 화면을 보여 줍니다 */
async function isBlocked(page) {
  const t = await page.locator('body').innerText()
  return t.includes('접근 권한이 없는 화면입니다') || !at(page).startsWith('/')
    ? t.includes('접근 권한이 없는 화면입니다')
    : false
}

async function main() {
  const browser = await pw.chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    // CHROMIUM_TLS12=1 : 방화벽이 Chromium 의 TLS 1.3 핸드셰이크를 끊는 망에서만
    // 씁니다. 인증서 검증은 그대로 켜 둔 채 버전만 낮춥니다.
    args: process.env.CHROMIUM_TLS12 ? ['--ssl-version-max=tls1.2'] : [],
  })
  const errors = []
  const watch = (page, tag) => {
    page.on('pageerror', (e) => errors.push(`[${tag}] ${e.message}`))
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${tag} console] ${m.text()}`) })
  }

  // ── 1. PC 로그인 + 로그인 후 네비게이션 회귀 ─────────────────────────────
  section('1. PC(1440) 사무실 계정 — 로그인 후 메뉴 이동')
  const d = await (await browser.newContext(DESKTOP)).newPage()
  watch(d, 'PC')

  await login(d, `office@${DOMAIN}`, process.env.TEST_OFFICE_PW)
  check(at(d) === '/', '로그인 직후 대시보드', at(d))

  const bodyText = (page) => page.locator('body').innerText()
  check((await bodyText(d)).includes('검증 사무실'), '로그인한 사람이 화면에 표시')

  const MENUS = [
    ['오늘 일정', '/today'],
    ['수거 입력', '/collection'],
    ['거래처', '/clients'],
    ['배차', '/dispatch'],
    ['미수금', '/receivables'],
    ['통계', '/stats'],
    ['자재', '/materials'],
    ['수거 이력', '/history'],
  ]
  for (const [label, path] of MENUS) {
    const link = d.locator(`a[href="${path}"]`).first()
    if (!(await link.count())) { no(`메뉴 「${label}」 존재`, path); continue }
    await link.click()
    await d.waitForLoadState('networkidle')
    await d.waitForTimeout(300)
    check(at(d) === path, `메뉴 「${label}」 → ${path} 유지`, at(d) === path ? '' : `실제 ${at(d)}`)
  }

  await d.reload({ waitUntil: 'networkidle' })
  await d.waitForTimeout(900)
  check(at(d) === '/history', '새로고침 후에도 로그인·화면 유지', at(d))

  // 사무실 계정은 관리자 전용 화면을 열 수 없어야 합니다
  await d.goto(`${BASE}/audit`, { waitUntil: 'networkidle' })
  await d.waitForTimeout(500)
  check(await isBlocked(d), '사무실 계정은 감사기록(관리자 전용) 차단')

  // ── 2. PC 화면에서 실제 수거 입력 ────────────────────────────────────────
  section('2. PC 화면에서 수거 입력 — 사람이 손으로 넣는 그 경로')
  // 오늘 아직 수거가 없는 검증 거래처를 고릅니다.
  // (같은 날 중복 저장은 제품이 막는 것이 정상이므로, 그 가드에 걸리지 않는
  //  거래처에서 "실제 저장"을 확인해야 검증이 의미가 있습니다. 데이터를 지우지
  //  않기 위해 지우는 대신 대상 거래처를 고릅니다.)
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
  const clients = await truth(`/clients?select=id,name&order=name`)
  const doneToday = await truth(`/schedules?select=client_id&date=eq.${today}&status=eq.완료`)
  const busy = new Set((doneToday.body || []).map((r) => r.client_id))
  const target = clients.body.find((c) => !busy.has(c.id)) ?? clients.body[0]
  console.log(`  입력 대상 거래처: ${target.name}`)
  const before = await truth(`/schedules?select=id&client_id=eq.${target.id}&status=eq.완료`)
  const beforeCount = before.body.length

  await d.goto(`${BASE}/collection`, { waitUntil: 'networkidle' })
  await d.waitForTimeout(1200)

  const selCount = await d.locator('select').count()
  check(selCount >= 2, '수거 입력 화면이 열림 (거래처·차량 선택)', `select ${selCount}개`)

  const uniqueKg = 130 + (new Date().getSeconds() % 60) // 이번 실행을 알아볼 수 있는 값
  try {
    // 거래처
    const clientSel = d.locator('select').first()
    const copts = await clientSel.locator('option').allTextContents()
    const clabel = copts.find((o) => o.startsWith(target.name))
    check(!!clabel, '거래처 목록이 실제 DB 에서 내려옴', clabel ?? copts.join(' / '))
    await clientSel.selectOption({ label: clabel })
    await d.waitForTimeout(300)

    // 수거량 · 시간
    await d.locator('input[placeholder="예: 320"]').first().fill(String(uniqueKg))
    await d.locator('input[type="time"]').first().fill('14:20')

    // 자재 동시공급 — 유상 1종 · 무상 1종을 화면에서 직접 입력합니다
    const supplyBox = d.locator('[data-tour="collect-supply"]')
    const badges = (await supplyBox.innerText()).replace(/\s+/g, ' ')
    check(badges.includes('유상') && badges.includes('무상'),
      '자재 공급 화면에 유상/무상이 품목마다 표시')
    await supplyBox.locator('input[aria-label="20L 합성수지"]').fill('2')
    await supplyBox.locator('input[aria-label="63L 박스"]').fill('3')
    await d.waitForTimeout(300)

    // 같은 날 재방문이면 「추가요청 공급」으로 저장합니다 (제품이 지원하는 정상 경로)
    const addl = d.locator('input[type="checkbox"]').first()
    if (await addl.count()) await addl.check()

    // 차량
    const vehSel = d.locator('select').nth(1)
    const vopts = await vehSel.locator('option').allTextContents()
    const vlabel = vopts.find((o) => o.includes('검증차량'))
    if (vlabel) await vehSel.selectOption({ label: vlabel })
    await d.waitForTimeout(300)

    const saveBtn = d.locator('[data-tour="collect-save"]')
    const enabled = await saveBtn.isEnabled()
    check(enabled, '필수 입력이 채워지면 저장 버튼이 열림')
    await saveBtn.click()
    await d.waitForTimeout(4000)
  } catch (e) {
    no('수거 입력 진행', e.message.split('\n')[0])
  }

  const after = await truth(`/schedules?select=id,actual_amount,created_at,origin&client_id=eq.${target.id}&status=eq.완료&order=created_at.desc`)
  const savedRow = after.body[0]
  const saved = after.body.length > beforeCount
  check(saved && savedRow?.actual_amount === uniqueKg,
    'PC 화면 입력이 실제 DB 에 그대로 저장',
    saved ? `${savedRow.actual_amount}kg (기대 ${uniqueKg}kg)` : `${beforeCount}건 그대로 — ${(await bodyText(d)).slice(0, 160).replace(/\s+/g, ' ')}`)
  check(savedRow?.origin === 'field', '운영 데이터로 저장 (시연 태깅 없음)', String(savedRow?.origin))

  // 화면에서 넣은 규격별 공급이 그대로 남았는가 (정산이 이 값을 씁니다)
  const mat = await truth(`/materials?select=items,is_additional_request&client_id=eq.${target.id}&order=created_at.desc&limit=1`)
  check(mat.body?.[0]?.items?.plastic20 === 2 && mat.body?.[0]?.items?.box63 === 3,
    '화면에서 입력한 규격별 공급이 DB 에 그대로', JSON.stringify(mat.body?.[0]?.items))

  const kgToFind = saved ? savedRow.actual_amount : null

  // ── 3. Mobile 에서 같은 건이 보이는가 ────────────────────────────────────
  section('3. Mobile(390) 현장 계정 — PC 에서 넣은 것이 그대로 보이는가')
  const m = await (await browser.newContext(MOBILE)).newPage()
  watch(m, 'MO')

  await login(m, `field@${DOMAIN}`, process.env.TEST_FIELD_PW)
  check(at(m) === '/today', '현장 계정은 오늘 일정이 첫 화면', at(m))

  await m.goto(`${BASE}/history`, { waitUntil: 'networkidle' })
  await m.waitForTimeout(1500)
  const hist = await bodyText(m)
  check(hist.includes(target.name), '모바일 수거 이력에 그 거래처가 보임', target.name)
  if (kgToFind) {
    check(hist.includes(String(kgToFind)),
      'PC 에서 넣은 수거량이 다른 기기에서 그대로', `${kgToFind}kg`)
  }

  // 현장 계정은 경영 화면을 열 수 없어야 합니다
  await m.goto(`${BASE}/receivables`, { waitUntil: 'networkidle' })
  await m.waitForTimeout(600)
  check(await isBlocked(m), '현장 계정은 미수금 화면 차단')
  await m.goto(`${BASE}/stats`, { waitUntil: 'networkidle' })
  await m.waitForTimeout(600)
  check(await isBlocked(m), '현장 계정은 통계 화면 차단')

  // 모바일 하단 네비게이션이 실제로 이동하는가 (회귀 재확인)
  await m.goto(`${BASE}/today`, { waitUntil: 'networkidle' })
  await m.waitForTimeout(600)
  // 하단 탭은 <button> + navigate() 입니다. 라벨을 눌러 실제로 그 화면으로
  // 가는지 확인합니다 (예전 회귀: 다른 화면으로 튕기던 문제).
  const EXPECT = { '오늘': '/today', '수거입력': '/collection', '거래처': '/clients', '요청': '/requests', '이력': '/history' }
  const tabs = await m.locator('nav.fixed button').all()
  let navOk = 0, navTried = 0
  for (const b of tabs) {
    const label = (await b.innerText()).trim().replace(/\s+/g, '')
    if (label === '더보기') continue
    const want = EXPECT[label]
    navTried++
    await b.click()
    await m.waitForTimeout(800)
    const got = at(m)
    const good = want ? got === want : got !== '/today' || label === '오늘'
    if (good) navOk++
    else console.log(`      「${label}」 → ${got} (기대 ${want ?? '?'})`)
  }
  check(navTried > 0 && navOk === navTried, '모바일 하단 네비게이션이 모두 정확히 이동', `${navOk}/${navTried}`)

  // 「더보기」 시트를 열어 둔 채 탭을 눌러도 그 화면으로 가는가 (z-index 회귀)
  const more = m.locator('nav.fixed button:has-text("더보기")')
  await more.click()
  await m.waitForTimeout(600)
  const sheetOpen = (await bodyText(m)).includes('더보기')
  const firstTab = m.locator('nav.fixed button').first()
  await firstTab.click()
  await m.waitForTimeout(800)
  check(sheetOpen && at(m) === '/today', '더보기 시트를 열어 둔 채 탭을 눌러도 정상 이동', at(m))

  // ── 4. 병원 계정 격리 ────────────────────────────────────────────────────
  section('4. Mobile 병원 계정 — 포털 밖으로 나갈 수 없는가')
  const c = await (await browser.newContext(MOBILE)).newPage()
  watch(c, 'CL')
  await login(c, `client@${DOMAIN}`, process.env.TEST_CLIENT_PW)
  check(at(c).startsWith('/portal'), '병원 계정은 포털이 첫 화면', at(c))

  for (const p of ['/clients', '/stats', '/audit', '/collection']) {
    await c.goto(`${BASE}${p}`, { waitUntil: 'networkidle' })
    await c.waitForTimeout(500)
    check(await isBlocked(c), `병원 계정 ${p} 차단`)
  }
  await c.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await c.waitForTimeout(600)
  check(at(c).startsWith('/portal'), '병원 계정이 「/」로 가면 포털로', at(c))

  await c.goto(`${BASE}/portal`, { waitUntil: 'networkidle' })
  await c.waitForTimeout(1500)
  const ctext = await bodyText(c)
  const mine = clients.body.find((x) => x.name.includes('한마음'))
  const other = clients.body.find((x) => !x.name.includes('한마음'))
  check(ctext.includes(mine.name.replace('[검증]', '')) || ctext.includes(mine.name),
    '병원 계정에는 자기 병원만 보임', mine.name)
  check(!other || !ctext.includes(other.name), '다른 병원 이름은 보이지 않음', other?.name ?? '')

  // ── 5. 자바스크립트 오류 ────────────────────────────────────────────────
  section('5. 콘솔 오류')
  const real = errors.filter((e) => !/favicon|jsdelivr|pretendard|Failed to load resource|net::ERR_/.test(e))
  check(real.length === 0, '브라우저 콘솔 오류 없음', real.slice(0, 3).join(' | '))

  await browser.close()
  console.log(`\n════ ${pass} PASS / ${fail} FAIL ════`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
