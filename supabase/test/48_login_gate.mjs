// ─────────────────────────────────────────────────────────────────────────────
// 로그인 · 계정 진입 경험 (실제 브라우저 · PC 1440 / 폰 390)
//
//  실제 서비스의 첫 화면은 로그인입니다. 이 검사는 그 약속이 지켜지는지를
//  봅니다.
//
//   1) 비로그인 상태에서 내부 주소로 들어가면 전부 로그인 화면으로 가는가
//   2) 공개 회원가입 버튼·경로가 어디에도 없는가
//   3) 역할별 첫 화면 — 관리자/사무실은 대시보드, 현장은 오늘 일정,
//      병원은 포털
//   4) 틀린 비밀번호 · 비활성 계정 · 로그아웃 · 세션 만료 · 비밀번호 초기화
//   5) 로그아웃한 뒤 뒤로 가기로 앞사람 화면이 되살아나지 않는가
//
//  실행
//    npm run build && npx vite preview --port 4173
//    export SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=...
//    export TEST_ADMIN_PW=... TEST_OFFICE_PW=... TEST_FIELD_PW=... \
//           TEST_CLIENT_PW=... TEST_CLIENT2_PW=...
//    node supabase/test/48_login_gate.mjs
//
//  · 계정을 만들지 않습니다. client2 계정을 잠깐 중지했다가 반드시 되돌립니다.
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
const STORE_KEY = 'beonemirae-ops:auth'

let pass = 0
let fail = 0
const ok = (t, e = '') => { pass++; console.log(`  PASS  ${t}${e ? '  ' + e : ''}`) }
const no = (t, e = '') => { fail++; console.log(`  FAIL  ${t}${e ? '  ' + e : ''}`) }
const check = (c, t, e = '') => (c ? ok(t, e) : no(t, e))
const section = (t) => console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 54 - t.length))}`)

const svc = (path, init = {}) =>
  fetch(`${U}/rest/v1${path}`, {
    ...init,
    headers: { apikey: S, Authorization: `Bearer ${S}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  })

//  로그인이 필요한 내부 주소. 하나라도 그냥 열리면 안 됩니다.
const INTERNAL = [
  '/', '/today', '/dispatch', '/clients', '/clients/00000000-0000-0000-0000-000000000000',
  '/history', '/collection', '/requests', '/materials', '/receivables', '/stats', '/reports',
  '/more', '/settings', '/why', '/performance', '/audit', '/users', '/import', '/demo',
  '/roadmap', '/presentation', '/portal', '/portal/report', '/portal/history',
  '/mobile-preview',
  //  라우트 표에 없는 주소도 로그인 화면으로 가야 합니다.
  '/settlement', '/aaa-none', '/admin', '/home',
]

//  로그인 없이 열려 있어야 하는 주소 (공개 회사 홈페이지 · 로그인 · 비밀번호 재설정)
const PUBLIC = ['/login', '/company', '/reset-password']

const ROLES = [
  { role: 'admin', pw: 'TEST_ADMIN_PW', landing: '/', label: '관리자' },
  { role: 'office', pw: 'TEST_OFFICE_PW', landing: '/', label: '사무실' },
  { role: 'field', pw: 'TEST_FIELD_PW', landing: '/today', label: '현장' },
  { role: 'client', pw: 'TEST_CLIENT_PW', landing: '/portal', label: '병원' },
]

const path = (p) => new URL(p.url()).pathname

async function main() {
  console.log('\n════ 로그인 · 계정 진입 경험 ════')

  const pw = (await import(process.env.PLAYWRIGHT_MODULE || 'playwright')).default
  const browser = await pw.chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: process.env.CHROMIUM_TLS12 ? ['--ssl-version-max=tls1.2'] : [],
  })
  const errors = []
  let deactivated = null

  const open = async (wide) => {
    const ctx = await browser.newContext(
      wide
        ? { viewport: { width: 1440, height: 900 } }
        : { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    )
    const page = await ctx.newPage()
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 120)))
    return { ctx, page }
  }

  const signIn = async (page, who, password) => {
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
    await page.fill('#login-email', `${who}@${DOMAIN}`)
    await page.fill('#login-password', password)
    await page.click('button[type="submit"]')
    //  로그인 직후에는 아직 역할을 모릅니다. 프로필이 도착하면 화면이 바뀝니다.
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 45000 }).catch(() => {})
    await page.waitForTimeout(2500)
  }

  try {
    for (const wide of [true, false]) {
      const W = wide ? 'PC 1440' : '폰 390'

      // ── 1. 비로그인 — 내부 주소는 전부 로그인으로 ─────────────────────
      section(`1. 로그인하지 않은 사람이 내부 주소로 들어올 때 (${W})`)
      const leaked = []
      for (const p of INTERNAL) {
        const { ctx, page } = await open(wide)
        await page.goto(`${BASE}${p}`, { waitUntil: 'networkidle' })
        await page.waitForTimeout(900)
        if (path(page) !== '/login') leaked.push(`${p} → ${path(page)}`)
        await ctx.close()
      }
      check(leaked.length === 0, `내부 주소 ${INTERNAL.length}개가 모두 로그인 화면으로`,
        leaked.length ? `그냥 열림: ${leaked.slice(0, 4).join(' · ')}` : '')

      // 공개 주소는 열려 있어야 합니다
      const blocked = []
      for (const p of PUBLIC) {
        const { ctx, page } = await open(wide)
        await page.goto(`${BASE}${p}`, { waitUntil: 'networkidle' })
        await page.waitForTimeout(900)
        //  /reset-password 는 메일 링크로 들어오는 자리라 로그인으로 튕기지만
        //  않으면 됩니다. 나머지는 그 주소 그대로여야 합니다.
        if (p !== '/reset-password' && path(page) !== p) blocked.push(`${p} → ${path(page)}`)
        await ctx.close()
      }
      check(blocked.length === 0, '공개 주소(회사 홈페이지·로그인)는 그대로 열림', blocked.join(' · '))

      // ── 2. 가입 신청 화면 ──────────────────────────────────────────────
      //
      //  0021 전에는 "가입 경로가 없는가" 를 봤습니다. 이제는 있습니다.
      //  대신 그 화면이 두 가지를 지키는지 봅니다.
      //
      //   · 역할을 신청자가 고를 수 없다 — 고르게 하면 서버가 읽지 않는데도
      //     "고른 대로 될 것" 이라는 기대가 생깁니다. 애초에 칸이 없어야 합니다.
      //   · 승인이 필요하다고 분명히 말한다 — 이 말이 없으면, 신청한 사람은
      //     로그인만 하면 되는 줄 알고 기다리다가 고장 났다고 연락합니다.
      section(`2. 가입 신청 화면 (${W})`)
      {
        const { ctx, page } = await open(wide)
        await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
        await page.waitForTimeout(800)
        const loginBody = await page.locator('body').innerText()
        const hrefs = await page.locator('a').evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? ''))
        check(hrefs.some((h) => /signup/i.test(h)), '로그인 화면에 가입 신청 경로가 있음')
        check(/승인/.test(loginBody), '로그인 화면이 승인이 필요함을 안내함')
        check(/비밀번호를 잊으셨나요/.test(loginBody), '비밀번호 재설정 경로가 보임')

        await page.goto(`${BASE}/signup`, { waitUntil: 'networkidle' })
        await page.waitForTimeout(500)
        const body = await page.locator('body').innerText()
        const rolePicker = /대표 · 관리자|사무실 담당자|현장 담당자|병원 담당자/.test(body)
        check(!rolePicker, '신청자가 역할을 고를 수 없음',
          rolePicker ? body.match(/[^\n]*담당자[^\n]*/)?.[0] ?? '' : '')
        check(/승인/.test(body), '승인이 필요하다고 안내함')
        const selects = await page.locator('select').count()
        check(selects === 0, '가입 화면에 선택 상자가 없음 (이름·이메일·비밀번호만)', `${selects}개`)
        await ctx.close()
      }

      // ── 3. 역할별 첫 화면 ──────────────────────────────────────────────
      section(`3. 역할별 로그인 첫 화면 (${W})`)
      for (const r of ROLES) {
        const { ctx, page } = await open(wide)
        await signIn(page, r.role, process.env[r.pw])
        check(path(page) === r.landing, `${r.label} → ${r.landing}`, path(page) === r.landing ? '' : `실제 ${path(page)}`)
        await ctx.close()
      }

      // ── 4. 틀린 비밀번호 ───────────────────────────────────────────────
      section(`4. 틀린 비밀번호 (${W})`)
      {
        const { ctx, page } = await open(wide)
        await signIn(page, 'office', '이건-틀린-비밀번호-9999')
        const body = await page.locator('body').innerText()
        check(path(page) === '/login', '로그인 화면에 그대로 머무름', path(page))
        check(/올바르지 않|일치하지|확인해/.test(body), '한국어로 무엇이 잘못됐는지 알려 줌',
          (body.match(/[^\n]*올바르지 않[^\n]*/) ?? [''])[0])
        check(!/Invalid login credentials|AuthApiError|400/.test(body), '영문 오류 원문이 그대로 나오지 않음')
        await ctx.close()
      }

      // ── 5. 중지된 계정 ─────────────────────────────────────────────────
      section(`5. 중지된 계정으로 로그인 (${W})`)
      {
        await svc(`/profiles?email=eq.${encodeURIComponent(`client2@${DOMAIN}`)}`, {
          method: 'PATCH', body: JSON.stringify({ active: false }),
        })
        deactivated = `client2@${DOMAIN}`
        const { ctx, page } = await open(wide)
        await signIn(page, 'client2', process.env.TEST_CLIENT2_PW)
        const body = await page.locator('body').innerText()
        check(/비활성화된 계정/.test(body), '중지된 계정이라고 알려 줌')
        check(!/거래처 목록|미수금 합계|매출/.test(body), '운영 데이터가 보이지 않음')
        //  여기서 막다른 길이 되면 안 됩니다 — 공용 PC 에서 다음 사람이
        //  로그인하려면 브라우저 기록을 지워야 했습니다.
        const out = page.locator('button:has-text("로그아웃")')
        const hasOut = (await out.count()) > 0
        check(hasOut, '로그아웃하고 다른 계정으로 들어갈 수 있음', hasOut ? '' : '버튼이 없어 막다른 길입니다')
        if (hasOut) {
          await out.first().click()
          await page.waitForTimeout(3500)
          check(path(page) === '/login', '로그아웃하면 로그인 화면으로', path(page))
        }
        await ctx.close()
        await svc(`/profiles?email=eq.${encodeURIComponent(`client2@${DOMAIN}`)}`, {
          method: 'PATCH', body: JSON.stringify({ active: true }),
        })
        deactivated = null
      }

      // ── 6. 로그아웃 · 뒤로 가기 ────────────────────────────────────────
      section(`6. 로그아웃한 뒤 앞사람 화면이 남는가 (${W})`)
      {
        const { ctx, page } = await open(wide)
        await signIn(page, 'office', process.env.TEST_OFFICE_PW)
        await page.goto(`${BASE}/clients`, { waitUntil: 'networkidle' })
        await page.waitForTimeout(3000)
        //  폰에는 사이드바가 없습니다. 로그아웃은 하단 탭 「더보기」 안에
        //  있어야 합니다 — 예전에는 PC 사이드바에만 있어서 폰만 쓰는
        //  현장 담당자는 로그아웃할 방법이 아예 없었습니다.
        if (!wide) {
          await page.locator('nav.fixed button:has-text("더보기")').first().click()
          await page.waitForTimeout(1500)
        }
        const out = page.locator('button[aria-label="로그아웃"], button[title="로그아웃"]')
          .locator('visible=true')
        check((await out.count()) > 0, wide ? '로그아웃 버튼이 있음' : '폰에서도 로그아웃할 수 있음',
          (await out.count()) > 0 ? '' : '눌러서 로그아웃할 곳이 없습니다')
        if ((await out.count()) > 0) {
          await out.first().click()
          await page.waitForTimeout(4000)
          check(path(page) === '/login', '로그아웃하면 로그인 화면으로', path(page))
          await page.goBack()
          await page.waitForTimeout(3000)
          const body = await page.locator('body').innerText()
          check(path(page) === '/login', '뒤로 가기를 해도 로그인 화면', path(page))
          check(!/거래처 목록|미수금 합계/.test(body), '앞사람이 보던 내용이 되살아나지 않음')
        }
        await ctx.close()
      }

      // ── 7. 세션 만료 ───────────────────────────────────────────────────
      section(`7. 세션이 끊겼을 때 (${W})`)
      {
        //  (가) 저장된 세션이 사라진 경우 — 브라우저 정리·기기 변경
        const { ctx, page } = await open(wide)
        await signIn(page, 'office', process.env.TEST_OFFICE_PW)
        await page.evaluate((k) => localStorage.removeItem(k), STORE_KEY)
        await page.goto(`${BASE}/clients`, { waitUntil: 'networkidle' })
        await page.waitForTimeout(3500)
        check(path(page) === '/login', '세션이 없으면 로그인 화면으로', path(page))
        await ctx.close()

        //  (나) 토큰이 만료·훼손된 경우 — 멈추지 않고 로그인으로 보내야 합니다
        const b2 = await open(wide)
        await signIn(b2.page, 'office', process.env.TEST_OFFICE_PW)
        await b2.page.evaluate((k) => {
          const raw = JSON.parse(localStorage.getItem(k))
          raw.access_token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.bad.bad'
          raw.refresh_token = 'dead-refresh-token'
          raw.expires_at = Math.floor(Date.now() / 1000) - 3600
          localStorage.setItem(k, JSON.stringify(raw))
        }, STORE_KEY)
        await b2.page.goto(`${BASE}/clients`, { waitUntil: 'networkidle' })
        await b2.page.waitForTimeout(6000)
        const body = await b2.page.locator('body').innerText()
        check(path(b2.page) === '/login', '만료된 토큰이면 로그인 화면으로', path(b2.page))
        check(!/거래처 목록|미수금 합계/.test(body), '만료된 토큰으로 운영 데이터가 보이지 않음')
        check(!/로그인 상태를 확인하는 중/.test(body), '확인 중 화면에서 멈추지 않음')
        await b2.ctx.close()
      }

      // ── 8. 관리자가 계정을 중지하면 곧바로 막히는가 ────────────────────
      section(`8. 쓰는 도중에 계정이 중지되면 (${W})`)
      {
        const { ctx, page } = await open(wide)
        await signIn(page, 'client2', process.env.TEST_CLIENT2_PW)
        await svc(`/profiles?email=eq.${encodeURIComponent(`client2@${DOMAIN}`)}`, {
          method: 'PATCH', body: JSON.stringify({ active: false }),
        })
        deactivated = `client2@${DOMAIN}`
        await page.goto(`${BASE}/today`, { waitUntil: 'networkidle' })
        await page.waitForTimeout(4000)
        const body = await page.locator('body').innerText()
        check(/비활성화된 계정/.test(body), '다음 화면부터 곧바로 막힘',
          /비활성화된 계정/.test(body) ? '' : body.replace(/\n+/g, ' | ').slice(0, 90))
        await ctx.close()
        await svc(`/profiles?email=eq.${encodeURIComponent(`client2@${DOMAIN}`)}`, {
          method: 'PATCH', body: JSON.stringify({ active: true }),
        })
        deactivated = null
      }

      // ── 9. 비밀번호 초기화 ─────────────────────────────────────────────
      section(`9. 비밀번호를 잊었을 때 (${W})`)
      {
        const { ctx, page } = await open(wide)
        await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
        const link = page.locator('button:has-text("비밀번호를 잊으셨나요")')
        check((await link.count()) > 0, '로그인 화면에 재설정 경로가 있음')
        //  이메일을 비운 채 누르면 무엇을 해야 하는지 알려 줘야 합니다.
        await link.first().click()
        await page.waitForTimeout(1200)
        const guide = await page.locator('body').innerText()
        check(/이메일을 입력/.test(guide), '이메일 없이 누르면 무엇을 할지 알려 줌',
          (guide.match(/[^\n]*이메일을 입력[^\n]*/) ?? [''])[0])
        await ctx.close()
      }

      // ── 10. 역할에 없는 화면으로 딥링크된 뒤 로그인 ────────────────────
      section(`10. 못 여는 화면 주소로 들어와 로그인할 때 (${W})`)
      {
        const { ctx, page } = await open(wide)
        //  누가 미수금 화면 주소를 현장 담당자에게 보낸 상황입니다.
        await page.goto(`${BASE}/receivables`, { waitUntil: 'networkidle' })
        await page.waitForTimeout(1200)
        check(path(page) === '/login', '먼저 로그인 화면으로', path(page))
        await page.fill('#login-email', `field@${DOMAIN}`)
        await page.fill('#login-password', process.env.TEST_FIELD_PW)
        await page.click('button[type="submit"]')
        await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 45000 }).catch(() => {})
        await page.waitForTimeout(3000)
        const body = await page.locator('body').innerText()
        check(path(page) === '/today', '자기 업무 화면으로 들어감', path(page))
        check(!/접근 권한이 없는 화면/.test(body), '로그인하자마자 차단 화면을 보지 않음')
        check(!/미수금 합계/.test(body), '못 여는 화면의 내용은 보이지 않음')
        await ctx.close()
      }
    }

    // ── 11. 화면 오류 ────────────────────────────────────────────────────
    section('11. 콘솔 · 자바스크립트 오류')
    const real = errors.filter((e) => !/favicon|jsdelivr|pretendard|Failed to load resource|net::ERR_/.test(e))
    check(real.length === 0, '자바스크립트 오류 없음', real.slice(0, 3).join(' | '))
  } catch (e) {
    no('검사 도중 오류가 났습니다', String(e?.message ?? e).slice(0, 200))
  } finally {
    //  중지한 계정은 무슨 일이 있어도 되돌립니다.
    if (deactivated) {
      await svc(`/profiles?email=eq.${encodeURIComponent(deactivated)}`, {
        method: 'PATCH', body: JSON.stringify({ active: true }),
      }).catch(() => {})
    }
    const back = await (await svc(`/profiles?select=email,active&email=eq.${encodeURIComponent(`client2@${DOMAIN}`)}`)).json()
    check(back?.[0]?.active === true, '검사에 쓴 계정을 원래대로 되돌림', `client2 활성=${back?.[0]?.active}`)
    await browser.close()
    console.log(`\n════ ${pass} PASS / ${fail} FAIL ════`)
    console.log(`로그인 진입 경험: ${fail === 0 ? 'YES' : 'NO'}`)
    process.exit(fail === 0 ? 0 : 1)
  }
}

main().catch((e) => {
  console.error('\n실행 오류:', e)
  process.exit(1)
})
