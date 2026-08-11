// ─────────────────────────────────────────────────────────────────────────────
// 계정 하나를 실제로 검증합니다 — 로그인 → 첫 화면 → 권한 → 로그아웃
//
//  운영 계정을 하나 만들 때마다 이 명령을 한 번 돌리면 됩니다.
//  HANDOVER.md 3번의 「계정을 만들 때마다 하는 확인」 을 사람 대신 합니다.
//
//  실행 (비밀번호는 셸에만 두고, 끝나면 unset 하세요)
//    export SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=...
//    ACCOUNT_EMAIL='hong@회사도메인' ACCOUNT_PW='임시비밀번호' \
//      node supabase/test/verify_account.mjs
//
//  · 아무것도 만들지 않고 아무것도 바꾸지 않습니다. 로그인해 보고 나옵니다.
//  · 비밀번호는 화면에도 로그에도 찍지 않습니다.
// ─────────────────────────────────────────────────────────────────────────────

const U = process.env.SUPABASE_URL
const S = process.env.SUPABASE_SERVICE_ROLE_KEY
const EMAIL = (process.env.ACCOUNT_EMAIL ?? '').trim()
const PW = process.env.ACCOUNT_PW ?? ''
if (!U || !S) { console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.'); process.exit(1) }
if (!EMAIL || !PW) { console.error('ACCOUNT_EMAIL / ACCOUNT_PW 가 필요합니다.'); process.exit(1) }
const BASE = process.env.BASE || 'http://localhost:4173'

let pass = 0
let fail = 0
const ok = (t, e = '') => { pass++; console.log(`  PASS  ${t}${e ? '  ' + e : ''}`) }
const no = (t, e = '') => { fail++; console.log(`  FAIL  ${t}${e ? '  ' + e : ''}`) }
const check = (c, t, e = '') => (c ? ok(t, e) : no(t, e))

const g = async (p) =>
  (await fetch(`${U}/rest/v1/${p}`, { headers: { apikey: S, Authorization: `Bearer ${S}` } })).json()

//  역할마다 첫 화면과, 열려야/막혀야 하는 곳
const SPEC = {
  admin: { landing: '/', open: ['/users', '/audit', '/settings', '/import'], shut: [], ko: '관리자' },
  office: { landing: '/', open: ['/clients', '/receivables', '/materials'], shut: ['/users', '/audit', '/settings', '/import'], ko: '사무실' },
  field: { landing: '/today', open: ['/today', '/collection'], shut: ['/receivables', '/stats', '/performance', '/users', '/settings'], ko: '현장' },
  client: { landing: '/portal', open: ['/portal'], shut: ['/clients', '/receivables', '/users', '/audit', '/today'], ko: '병원' },
}
const at = (p) => new URL(p.url()).pathname

const prof = (await g(`profiles?select=email,name,role,active,client_id&email=eq.${encodeURIComponent(EMAIL)}`))?.[0]
console.log(`\n════ 계정 확인 — ${EMAIL} ════`)
if (!prof) {
  no('그런 계정이 없습니다', '「사용자 관리」에서 먼저 만들어 주세요')
  console.log(`\n════ ${pass} PASS / ${fail} FAIL ════`)
  process.exit(1)
}
const spec = SPEC[prof.role]
console.log(`   ${prof.name} · ${spec?.ko ?? prof.role}${prof.active ? '' : ' · 중지됨'}`)

check(prof.active === true, '쓸 수 있는 상태(활성)')
if (prof.role === 'client') {
  const c = prof.client_id ? (await g(`clients?select=name&id=eq.${prof.client_id}`))?.[0] : null
  check(!!c, '소속 병원이 지정되어 있음', c?.name ?? '없습니다 — 병원 계정은 소속이 있어야 합니다')
}
//  운영 계정이 검증용 도메인에 있으면 나중에 정리할 때 섞입니다.
check(!EMAIL.toLowerCase().endsWith('@beonemirae.test'),
  '검증용 도메인이 아님', EMAIL.endsWith('@beonemirae.test') ? '@beonemirae.test 는 검증 전용입니다' : '')

const pw = (await import(process.env.PLAYWRIGHT_MODULE || 'playwright')).default
const browser = await pw.chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: process.env.CHROMIUM_TLS12 ? ['--ssl-version-max=tls1.2'] : [],
})
try {
  const wide = prof.role === 'admin' || prof.role === 'office'
  const ctx = await browser.newContext(
    wide ? { viewport: { width: 1440, height: 900 } }
         : { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  )
  const page = await ctx.newPage()

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.fill('#login-email', EMAIL)
  await page.fill('#login-password', PW)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 45000 }).catch(() => {})
  await page.waitForTimeout(2500)
  check(at(page) !== '/login', '발급한 비밀번호로 로그인됨',
    at(page) === '/login' ? '로그인되지 않았습니다 — 비밀번호를 확인하세요' : '')

  if (at(page) !== '/login' && spec) {
    check(at(page) === spec.landing, `첫 화면이 ${spec.landing}`, at(page))

    const cantOpen = []
    for (const path of spec.open) {
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })
      await page.waitForTimeout(1600)
      const body = await page.locator('body').innerText()
      if (at(page) !== path || /접근 권한이 없는 화면/.test(body)) cantOpen.push(path)
    }
    check(cantOpen.length === 0,
      prof.role === 'admin' ? '사용자 관리·감사로그·설정·엑셀이 열림' : `자기 업무 화면 ${spec.open.length}개가 열림`,
      cantOpen.join(' · '))

    const leaked = []
    for (const path of spec.shut) {
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })
      await page.waitForTimeout(1600)
      const body = await page.locator('body').innerText()
      if (!(/접근 권한이 없는 화면/.test(body) || at(page) !== path)) leaked.push(path)
    }
    if (spec.shut.length) check(leaked.length === 0, `막혀야 하는 화면 ${spec.shut.length}개가 막힘`, leaked.join(' · '))

    await page.goto(`${BASE}${spec.landing}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(2500)
    if (!wide && prof.role === 'field') {
      await page.locator('nav.fixed button:has-text("더보기")').first().click()
      await page.waitForTimeout(1500)
    }
    const out = page.locator('button[aria-label="로그아웃"], button[title="로그아웃"]').locator('visible=true')
    check((await out.count()) > 0, '로그아웃할 수 있음')
    if ((await out.count()) > 0) {
      await out.first().click()
      await page.waitForTimeout(4000)
      check(at(page) === '/login', '로그아웃하면 로그인 화면으로', at(page))
    }
  }
  await ctx.close()
} catch (e) {
  no('확인 도중 오류가 났습니다', String(e?.message ?? e).slice(0, 160))
} finally {
  await browser.close()
  console.log(`\n════ ${pass} PASS / ${fail} FAIL ════`)
  console.log(`${EMAIL} : ${fail === 0 ? '쓸 준비 완료' : '확인 필요'}`)
  process.exit(fail === 0 ? 0 : 1)
}
