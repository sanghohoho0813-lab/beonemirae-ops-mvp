// ─────────────────────────────────────────────────────────────────────────────
// 실운영 계정 전환 리허설 (실제 브라우저 · 실제 화면)
//
//  HANDOVER.md 에 적어 둔 계정 만드는 순서를, 화면에서 그대로 한 번 밟아
//  봅니다. 순서가 실제로 되는지 — 그리고 만든 계정이 정말 그 역할로만
//  움직이는지 — 를 확인합니다.
//
//   1) 관리자로 로그인해서 「사용자 관리」로 계정을 만든다
//        관리자 2명 → 사무실 → 현장 → 병원  (실제 순서 그대로)
//   2) 만든 계정마다 한 번씩:  로그인 → 역할별 첫 화면 → 권한 제한 → 로그아웃
//   3) 관리자가 두 명이 되어야 [검증] 관리자를 내릴 수 있다는 것까지 확인
//   4) 리허설로 만든 계정은 끝나고 전부 지운다
//
//  섞이지 않게 하는 규칙 — 이 검사가 만드는 계정은 전부
//    · 이메일이 @beonemirae.test  (.test 는 실제로 존재할 수 없는 도메인입니다)
//    · 이름이 [리허설] 로 시작
//  실제 운영 계정은 회사 도메인(@beonemirae.co.kr)을 씁니다. 두 개가 겹칠
//  일이 없습니다.
//
//  비밀번호는 실행할 때마다 무작위로 만들고 메모리에만 둡니다 — 파일에도
//  로그에도 남기지 않습니다.
//
//  실행
//    npm run build && npx vite preview --port 4173
//    export SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=...
//    export TEST_ADMIN_PW=...
//    node supabase/test/49_account_handover.mjs
// ─────────────────────────────────────────────────────────────────────────────

import { randomBytes } from 'node:crypto'

const U = process.env.SUPABASE_URL
const A = process.env.SUPABASE_ANON_KEY
const S = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!U || !A || !S) {
  console.error('SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.')
  process.exit(1)
}
const BASE = process.env.BASE || 'http://localhost:4173'
const DOMAIN = process.env.TEST_EMAIL_DOMAIN || 'beonemirae.test'
const TAG = '[리허설]'

let pass = 0
let fail = 0
const ok = (t, e = '') => { pass++; console.log(`  PASS  ${t}${e ? '  ' + e : ''}`) }
const no = (t, e = '') => { fail++; console.log(`  FAIL  ${t}${e ? '  ' + e : ''}`) }
const check = (c, t, e = '') => (c ? ok(t, e) : no(t, e))
const section = (t) => console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 54 - t.length))}`)

const svc = async (path, init = {}) => {
  const r = await fetch(`${U}/rest/v1${path}`, {
    ...init,
    headers: { apikey: S, Authorization: `Bearer ${S}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers || {}) },
  })
  const t = await r.text()
  try { return JSON.parse(t) } catch { return [] }
}

/** 비밀번호는 매번 새로 만들고 메모리에만 둡니다 */
const newPassword = () => `Rh-${randomBytes(9).toString('base64url')}-9`

//  실제로 만드는 순서 그대로입니다. HANDOVER.md 의 표와 같은 차례입니다.
const PLAN = [
  { key: 'admin1', role: 'admin', name: `${TAG}대표`, landing: '/', label: '관리자(대표)' },
  { key: 'admin2', role: 'admin', name: `${TAG}관리자백업`, landing: '/', label: '관리자(백업)' },
  { key: 'office', role: 'office', name: `${TAG}사무실`, landing: '/', label: '사무실' },
  { key: 'field', role: 'field', name: `${TAG}현장`, landing: '/today', label: '현장' },
  { key: 'client', role: 'client', name: `${TAG}병원`, landing: '/portal', label: '병원' },
]

//  역할마다 "열려야 하는 곳" 과 "막혀야 하는 곳"
const RULES = {
  admin: { open: ['/users', '/audit', '/settings', '/import'], shut: [] },
  office: { open: ['/clients', '/receivables', '/materials'], shut: ['/users', '/audit', '/settings', '/import'] },
  field: { open: ['/today', '/collection'], shut: ['/receivables', '/stats', '/performance', '/users', '/settings'] },
  client: { open: ['/portal'], shut: ['/clients', '/receivables', '/users', '/audit', '/import', '/today'] },
}

const at = (p) => new URL(p.url()).pathname

async function main() {
  console.log('\n════ 실운영 계정 전환 리허설 ════')
  console.log('   만드는 계정은 전부 @' + DOMAIN + ' · 이름 ' + TAG + ' — 운영 계정과 섞이지 않습니다.\n')

  const pw = (await import(process.env.PLAYWRIGHT_MODULE || 'playwright')).default
  const browser = await pw.chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: process.env.CHROMIUM_TLS12 ? ['--ssl-version-max=tls1.2'] : [],
  })
  const errors = []
  const made = []            // 리허설이 만든 계정 (정리 대상)
  const secret = new Map()   // key → 비밀번호 (메모리에만)

  const open = async (wide = true) => {
    const ctx = await browser.newContext(
      wide ? { viewport: { width: 1440, height: 900 } }
           : { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    )
    const page = await ctx.newPage()
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 120)))
    return { ctx, page }
  }
  const signIn = async (page, email, password) => {
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
    await page.fill('#login-email', email)
    await page.fill('#login-password', password)
    await page.click('button[type="submit"]')
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 45000 }).catch(() => {})
    await page.waitForTimeout(2500)
  }

  try {
    // ── 0. 시작 시점 ────────────────────────────────────────────────────
    section('0. 시작 시점의 계정')
    const before = await svc('/profiles?select=email,role,active')
    console.log(`   계정 ${before.length}개 · 관리자 ${before.filter((p) => p.role === 'admin' && p.active).length}명`)
    const hospital = (await svc('/clients?select=id,name&active=eq.true&order=name'))?.[0]
    check(!!hospital, '병원 계정을 붙일 거래처가 있음', hospital?.name ?? '거래처가 없습니다')
    if (!hospital) return

    // ── 1. 관리자가 화면에서 계정을 만든다 ──────────────────────────────
    section('1. 「사용자 관리」에서 순서대로 계정 만들기')
    const { ctx: adminCtx, page: admin } = await open()
    await signIn(admin, `admin@${DOMAIN}`, process.env.TEST_ADMIN_PW)
    check(at(admin) === '/', '관리자로 로그인', at(admin))
    await admin.goto(`${BASE}/users`, { waitUntil: 'networkidle' })
    await admin.waitForTimeout(2500)

    for (const p of PLAN) {
      const email = `rehearsal-${p.key}@${DOMAIN}`
      const password = newPassword()
      secret.set(p.key, password)

      await admin.locator('button:has-text("계정 만들기")').first().click()
      await admin.waitForTimeout(900)
      await admin.fill('#new-user-name', p.name)
      await admin.fill('#new-user-email', email)
      await admin.fill('#new-user-password', password)
      await admin.selectOption('#new-user-role', p.role)
      await admin.waitForTimeout(500)
      if (p.role === 'client') {
        await admin.selectOption('#new-user-client', hospital.id)
        await admin.waitForTimeout(400)
      }
      //  폼 안의 「계정 만들기」 (마지막 것) 를 누릅니다.
      await admin.locator('button:has-text("계정 만들기")').last().click()
      await admin.waitForTimeout(4000)

      const row = (await svc(`/profiles?select=email,role,active,client_id,name&email=eq.${encodeURIComponent(email)}`))?.[0]
      const good = row?.role === p.role && row?.active === true &&
        (p.role !== 'client' || !!row?.client_id)
      check(good, `${p.label} 계정 생성`, good ? email : `역할=${row?.role ?? '없음'} 소속=${row?.client_id ? 'O' : '-'}`)
      if (row) made.push(email)
    }

    // ── 2. 관리자가 두 명이 되었는가 ────────────────────────────────────
    section('2. 관리자가 두 명 이상인가 (한 명만 남으면 아무도 못 들어옵니다)')
    {
      const admins = (await svc('/profiles?select=email&role=eq.admin&active=eq.true'))
      check(admins.length >= 3, '활성 관리자 3명 (검증 1 + 리허설 2)', `${admins.length}명`)
      //  관리자가 여럿이어야 기존 관리자를 내릴 수 있습니다. 화면에서 확인만
      //  하고 실제로 내리지는 않습니다 — 검증 계정은 아직 필요합니다.
      await admin.reload({ waitUntil: 'networkidle' })
      await admin.waitForTimeout(3000)
      const body = await admin.locator('body').innerText()
      check(/관리자 \d+명/.test(body), '화면에 관리자 수가 보임', (body.match(/관리자 \d+명/) ?? [''])[0])
      check(!/관리자가 한 명뿐입니다/.test(body), '「관리자가 한 명뿐」 잠금이 풀림')
    }
    await adminCtx.close()

    // ── 3. 계정마다 로그인 → 첫 화면 → 권한 → 로그아웃 ──────────────────
    for (const p of PLAN) {
      section(`3. ${p.label} — 로그인 → 첫 화면 → 권한 → 로그아웃`)
      const email = `rehearsal-${p.key}@${DOMAIN}`
      const { ctx, page } = await open(p.role === 'field' || p.role === 'client' ? false : true)

      await signIn(page, email, secret.get(p.key))
      check(at(page) === p.landing, `첫 화면이 ${p.landing}`, at(page))

      const rule = RULES[p.role]
      const cantOpen = []
      for (const path of rule.open) {
        await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })
        await page.waitForTimeout(1600)
        const body = await page.locator('body').innerText()
        if (at(page) !== path || /접근 권한이 없는 화면/.test(body)) cantOpen.push(`${path}→${at(page)}`)
      }
      check(cantOpen.length === 0, `자기 업무 화면 ${rule.open.length}개가 열림`, cantOpen.join(' · '))

      const leaked = []
      for (const path of rule.shut) {
        await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })
        await page.waitForTimeout(1600)
        const body = await page.locator('body').innerText()
        const blocked = /접근 권한이 없는 화면/.test(body) || at(page) !== path
        if (!blocked) leaked.push(path)
      }
      check(leaked.length === 0, rule.shut.length ? `막혀야 하는 화면 ${rule.shut.length}개가 막힘` : '전체 권한(관리자)',
        leaked.length ? `열렸습니다: ${leaked.join(' · ')}` : '')

      // 로그아웃 — 폰이면 「더보기」 안에 있습니다
      await page.goto(`${BASE}${p.landing}`, { waitUntil: 'networkidle' })
      await page.waitForTimeout(2500)
      const wide = p.role !== 'field' && p.role !== 'client'
      if (!wide && p.role === 'field') {
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
      await ctx.close()
    }

    // ── 4. 병원 계정이 자기 병원만 보는가 ───────────────────────────────
    section('4. 병원 계정은 자기 병원만')
    {
      const row = (await svc(`/profiles?select=client_id&email=eq.${encodeURIComponent(`rehearsal-client@${DOMAIN}`)}`))?.[0]
      check(row?.client_id === hospital.id, '소속 병원이 지정한 곳으로 붙음', hospital.name)
      //  토큰으로 직접 다른 병원을 읽어 봅니다 (화면이 아니라 서버가 막아야 합니다)
      const tok = (await (await fetch(`${U}/auth/v1/token?grant_type=password`, {
        method: 'POST', headers: { apikey: A, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: `rehearsal-client@${DOMAIN}`, password: secret.get('client') }),
      })).json()).access_token
      const seen = await (await fetch(`${U}/rest/v1/clients?select=id,name`, {
        headers: { apikey: A, Authorization: `Bearer ${tok}` },
      })).json()
      const others = (Array.isArray(seen) ? seen : []).filter((c) => c.id !== hospital.id)
      check(others.length === 0, '서버에서도 다른 병원이 보이지 않음',
        others.length ? others.map((c) => c.name).join(' · ') : `자기 병원 ${Array.isArray(seen) ? seen.length : 0}곳만`)
    }

    // ── 5. 섞이지 않았는가 ──────────────────────────────────────────────
    section('5. 운영 계정과 섞이지 않았는가')
    {
      const all = await svc('/profiles?select=email,name,role')
      const real = all.filter((p) => !p.email.endsWith(`@${DOMAIN}`))
      check(real.length === 0, `운영 도메인 계정이 아직 없음 (전부 @${DOMAIN})`,
        real.length ? real.map((p) => p.email).join(' · ') : `${all.length}개 모두 검증·리허설용`)
      const tagged = all.filter((p) => p.name.startsWith(TAG))
      check(tagged.length === PLAN.length, `${TAG} 이름으로 구분됨`, `${tagged.length}개`)
    }

    section('6. 콘솔 · 자바스크립트 오류')
    const real = errors.filter((e) => !/favicon|jsdelivr|pretendard|Failed to load resource|net::ERR_/.test(e))
    check(real.length === 0, '자바스크립트 오류 없음', real.slice(0, 3).join(' | '))
  } catch (e) {
    no('검사 도중 오류가 났습니다', String(e?.message ?? e).slice(0, 200))
  } finally {
    // ── 정리 — 리허설이 만든 계정만 지웁니다 ────────────────────────────
    section('정리 — 리허설 계정만 지웁니다')
    let removed = 0
    for (const email of made) {
      const prof = (await svc(`/profiles?select=id&email=eq.${encodeURIComponent(email)}`))?.[0]
      if (!prof) continue
      const r = await fetch(`${U}/auth/v1/admin/users/${prof.id}`, {
        method: 'DELETE', headers: { apikey: S, Authorization: `Bearer ${S}` },
      })
      if (r.status < 300) removed++
    }
    check(removed === made.length, '리허설 계정을 모두 지움', `${removed}/${made.length}개`)
    const left = (await svc('/profiles?select=email,name'))
    const stray = left.filter((p) => p.name?.startsWith(TAG) || p.email.startsWith('rehearsal-'))
    check(stray.length === 0, '리허설 흔적이 남지 않음', stray.map((p) => p.email).join(' · '))
    console.log(`   남은 계정 ${left.length}개 — ${left.map((p) => p.email.split('@')[0]).join(' / ')}`)

    await browser.close()
    console.log(`\n════ ${pass} PASS / ${fail} FAIL ════`)
    console.log(`계정 전환 절차: ${fail === 0 ? 'YES' : 'NO'}`)
    process.exit(fail === 0 ? 0 : 1)
  }
}

main().catch((e) => {
  console.error('\n실행 오류:', e)
  process.exit(1)
})
