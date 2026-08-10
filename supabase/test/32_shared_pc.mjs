// ─────────────────────────────────────────────────────────────────────────────
// 공용 PC 에서 계정을 바꿔 쓸 때 (실제 브라우저 · 실제 DB)
//
//  사무실 PC 한 대를 여럿이 나눠 씁니다. 사무실 담당자가 미수금을 보다가
//  로그아웃하고 현장 담당자가 그 자리에서 로그인합니다.
//  그때 앞사람의 금액이 잠깐이라도 스치면 안 됩니다 — 현장 담당자에게
//  거래처 미수금은 보이면 안 되는 정보이고, 한 번 본 것은 되돌릴 수 없습니다.
//
//  '잠깐 스치는' 것을 잡기 위해 전환 직후를 여러 번 들여다봅니다.
//  마지막 화면만 보면 그 사이의 잔상은 놓칩니다.
//
//  밟는 순서
//   1) 사무실   미수금 화면에서 금액을 본다
//   2) 로그아웃 화면에 금액이 남지 않는가
//   3) 현장     같은 브라우저로 로그인 — 전환 중 금액이 스치지 않는가
//   4) 현장     미수금 주소로 직접 들어가도 막히는가
//
//  실행
//    npm run build && npx vite preview --port 4173
//    export SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=...
//    export TEST_OFFICE_PW=... TEST_FIELD_PW=...
//    node supabase/test/32_shared_pc.mjs
//
//  · 판정에 쓰는 청구를 하나 만들고 끝나면 지웁니다.
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
const AMOUNT = 987654 // 다른 숫자와 겹치지 않게 고른 값

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

async function main() {
  console.log('\n════ 공용 PC 에서 계정을 바꿔 쓸 때 ════')

  const money = AMOUNT.toLocaleString('ko-KR')
  const client = (await svc('/clients?select=id,name&active=eq.true&limit=1')).body?.[0]
  const month = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 7)
  let paymentId = null

  const pw = (await import(process.env.PLAYWRIGHT_MODULE || 'playwright')).default
  const browser = await pw.chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: process.env.CHROMIUM_TLS12 ? ['--ssl-version-max=tls1.2'] : [],
  })
  const errors = []

  try {
    const made = (await svc('/payments', {
      method: 'POST',
      body: JSON.stringify({
        client_id: client.id, billing_month: month, amount: AMOUNT,
        status: '미수금', method: '무통장', memo: '[검증]공용PC',
      }),
    })).body?.[0]
    check(!!made, `판정용 청구 ${money}원을 만듦`)
    if (!made) return
    paymentId = made.id

    //  공용 PC 한 대 — 브라우저 컨텍스트를 바꾸지 않고 그대로 씁니다.
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await ctx.newPage()
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

    const login = async (who, password) => {
      await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
      await page.fill('#login-email', `${who}@${DOMAIN}`)
      await page.fill('#login-password', password)
      await Promise.all([
        page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 }),
        page.click('button[type="submit"]'),
      ])
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(2000)
    }

    // ── 1. 사무실이 미수금을 본다 ───────────────────────────────────────
    section('1. 사무실 담당자')
    await login('office', process.env.TEST_OFFICE_PW)
    await page.goto(`${BASE}/receivables`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(2500)
    check((await page.locator('body').innerText()).includes(money),
      '미수금 화면에서 금액이 보임', `${money}원`)

    // ── 2. 로그아웃 ────────────────────────────────────────────────────
    section('2. 로그아웃')
    await page.locator('button[title="로그아웃"]').first().click()
    await page.waitForTimeout(3000)
    check(page.url().includes('/login'), '로그인 화면으로 돌아감', page.url().replace(BASE, ''))
    check(!(await page.locator('body').innerText()).includes(money),
      '로그아웃 화면에 앞사람 금액이 남지 않음')

    // ── 3. 같은 브라우저로 현장이 로그인 ────────────────────────────────
    section('3. 현장 담당자가 그 자리에서 로그인')
    //  전환 직후를 여러 번 들여다봅니다 — 마지막 화면만 보면 잔상을 놓칩니다.
    await page.fill('#login-email', `field@${DOMAIN}`)
    await page.fill('#login-password', process.env.TEST_FIELD_PW)
    await page.click('button[type="submit"]')
    const flashes = []
    for (let i = 0; i < 14; i++) {
      await page.waitForTimeout(400)
      const t = await page.locator('body').innerText().catch(() => '')
      if (t.includes(money)) flashes.push(i)
    }
    await page.waitForTimeout(2500)
    check(flashes.length === 0, '전환 중에도 앞사람 금액이 스치지 않음',
      flashes.length ? `${flashes.length}회 보임` : '')
    check(!(await page.locator('body').innerText()).includes(money),
      '현장 첫 화면에도 금액이 없음')

    // ── 4. 주소를 직접 쳐도 막히는가 ────────────────────────────────────
    section('4. 현장이 미수금 주소로 직접 들어갈 때')
    await page.goto(`${BASE}/receivables`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(2500)
    const t = await page.locator('body').innerText()
    check(/접근 권한이 없는 화면/.test(t), '차단 화면이 뜸')
    check(!t.includes(money), '차단 화면에도 금액이 없음')

    // ── 5. 화면 오류 ───────────────────────────────────────────────────
    section('5. 콘솔 오류')
    const real = errors.filter((e) => !/favicon|jsdelivr|pretendard|Failed to load resource|net::ERR_/.test(e))
    check(real.length === 0, '자바스크립트 오류 없음', real.slice(0, 3).join(' | '))
    await page.close()
  } catch (e) {
    no('검사 도중 오류가 났습니다', String(e?.message ?? e).slice(0, 200))
  } finally {
    section('정리')
    if (paymentId) await svc(`/payments?id=eq.${paymentId}`, { method: 'DELETE' })
    const left = (await svc(`/payments?select=id&amount=eq.${AMOUNT}`)).body ?? []
    for (const p of left) await svc(`/payments?id=eq.${p.id}`, { method: 'DELETE' })
    check(left.length === 0, '검증용 청구가 남지 않음', left.length ? `${left.length}건 더 지움` : '')
    await browser.close()

    console.log(`\n════ ${pass} PASS / ${fail} FAIL ════`)
    console.log(`공용 PC 계정 전환: ${fail === 0 ? 'YES' : 'NO'}`)
    process.exit(fail === 0 ? 0 : 1)
  }
}

main().catch((e) => {
  console.error('\n실행 오류:', e)
  process.exit(1)
})
