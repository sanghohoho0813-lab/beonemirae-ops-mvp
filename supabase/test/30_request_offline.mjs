// ─────────────────────────────────────────────────────────────────────────────
// 요청을 보냈는데 통신이 끊겼을 때 (실제 브라우저 · 실제 DB)
//
//  병원 담당자는 지하나 엘리베이터에서도 폰으로 요청을 올립니다.
//  그때 "요청이 접수되었습니다" 가 뜨는데 실제로는 저장되지 않았다면,
//  병원은 연락을 기다리고 비원미래는 그런 요청이 있는 줄도 모릅니다.
//  긴급수거였다면 보관기한이 걸린 문제가 됩니다.
//
//  사무실의 '전화 요청 접수' 도 같습니다. 통화하며 받아 적은 내용이
//  저장되지 않은 채 창이 닫히면 그 통화는 어디에도 남지 않습니다.
//
//  밟는 순서
//   1) 병원(모바일)  통신을 끊고 요청을 보낸다
//   2) 화면          접수되었다는 안내가 뜨지 않고, 오류가 보이는가
//   3) 화면          적은 내용이 지워지지 않고 남아 있는가
//   4) 통신 복구     다시 보내면 그때 저장되는가
//   5) 사무실(PC)    대행 접수도 같은가
//
//  실행
//    npm run build && npx vite preview --port 4173
//    export SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=...
//    export TEST_CLIENT_PW=... TEST_OFFICE_PW=...
//    node supabase/test/30_request_offline.mjs
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
  console.log('\n════ 요청 도중 통신이 끊겼을 때 ════')

  const stamp = Date.now() % 100000
  const portalText = `${MARK}통신끊김 병원요청-${stamp}`
  const staffText = `${MARK}통신끊김 대행접수-${stamp}`
  const startCount = ((await svc('/client_requests?select=id')).body ?? []).length
  const made = []

  const pw = (await import(process.env.PLAYWRIGHT_MODULE || 'playwright')).default
  const browser = await pw.chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: process.env.CHROMIUM_TLS12 ? ['--ssl-version-max=tls1.2'] : [],
  })
  const errors = []

  try {
    // ── 1. 병원이 통신 끊긴 채로 요청을 보낸다 ──────────────────────────
    section('1. 병원 포털 — 통신이 끊긴 채 보내기')
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    const portal = await ctx.newPage()
    portal.on('pageerror', (e) => errors.push(`[병원] ${e.message}`))
    await signIn(portal, `client@${DOMAIN}`, process.env.TEST_CLIENT_PW)
    await portal.goto(`${BASE}/portal`, { waitUntil: 'networkidle' })
    await portal.waitForTimeout(3000)

    await portal.locator('button:has-text("추가 수거"), button:has-text("요청")').first().click()
    await portal.waitForTimeout(1500)
    const box = portal.locator('#req-content')
    check(await box.count() > 0, '요청 입력칸이 열림')
    await box.fill(portalText)

    await ctx.setOffline(true)
    await portal.locator('button:has-text("요청 보내기")').first().click()
    await portal.waitForTimeout(7000)

    const offText = await portal.locator('body').innerText()
    check(!/요청이 접수되었습니다/.test(offText),
      "저장되지 않았으면 '접수되었습니다' 가 뜨지 않음",
      /요청이 접수되었습니다/.test(offText) ? '접수된 것처럼 보입니다' : '')
    check(/네트워크|연결할 수 없|보내지 못/.test(offText), '통신 문제라는 안내가 보임')
    check((await box.inputValue()) === portalText, '적은 내용이 지워지지 않고 남아 있음')

    const notSaved = (await svc(`/client_requests?select=id&content=eq.${encodeURIComponent(portalText)}`)).body ?? []
    check(notSaved.length === 0, '실제로도 저장되지 않음 (화면과 DB 가 일치)')

    // ── 2. 통신이 돌아오면 다시 보낼 수 있는가 ──────────────────────────
    section('2. 통신이 돌아온 뒤 다시 보내기')
    await ctx.setOffline(false)
    await portal.waitForTimeout(1500)
    await portal.locator('button:has-text("요청 보내기")').first().click()
    await portal.waitForTimeout(7000)

    const saved = (await svc(`/client_requests?select=id,content,source&content=eq.${encodeURIComponent(portalText)}`)).body ?? []
    check(saved.length === 1, '다시 보내면 그때 저장됨', `${saved.length}건`)
    if (saved[0]) made.push(saved[0].id)
    check(saved[0]?.source === 'portal', '병원이 직접 올린 것으로 기록됨', saved[0]?.source ?? '')

    const okText = await portal.locator('body').innerText()
    check(/요청이 접수되었습니다/.test(okText), '이번에는 접수 안내가 보임')
    check(saved.length === 1, '같은 요청이 두 번 저장되지 않음 (실패분이 남지 않음)')
    await portal.close()

    // ── 3. 사무실 대행 접수도 같은가 ───────────────────────────────────
    section('3. 사무실 대행 접수 — 통신이 끊긴 채 보내기')
    const octx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const office = await octx.newPage()
    office.on('pageerror', (e) => errors.push(`[사무실] ${e.message}`))
    await signIn(office, `office@${DOMAIN}`, process.env.TEST_OFFICE_PW)
    await office.goto(`${BASE}/requests`, { waitUntil: 'networkidle' })
    await office.waitForTimeout(2500)

    const client = (await svc(`/clients?select=id,name&active=eq.true&limit=1`)).body?.[0]
    await office.locator('button:has-text("전화 요청 접수")').first().click()
    await office.waitForTimeout(1200)
    const dialog = office.locator('[role="dialog"]')
    await dialog.locator('#nr-client').selectOption(client.id)
    await dialog.locator('#nr-content').fill(staffText)
    await office.waitForTimeout(500)

    await octx.setOffline(true)
    await dialog.locator('button:text-is("접수")').first().click()
    await office.waitForTimeout(7000)

    check(await dialog.count() > 0, '저장에 실패하면 접수 창이 닫히지 않음')
    const staffOff = await office.locator('body').innerText()
    check(/네트워크|연결할 수 없|접수하지 못/.test(staffOff), '사무실 화면에도 통신 안내가 보임')
    check((await dialog.locator('#nr-content').inputValue()) === staffText,
      '받아 적은 내용이 그대로 남아 있음')

    await octx.setOffline(false)
    await office.waitForTimeout(1500)
    await dialog.locator('button:text-is("접수")').first().click()
    await office.waitForTimeout(6000)
    const staffSaved = (await svc(`/client_requests?select=id&content=eq.${encodeURIComponent(staffText)}`)).body ?? []
    check(staffSaved.length === 1, '통신이 돌아온 뒤 접수하면 저장됨', `${staffSaved.length}건`)
    for (const r of staffSaved) made.push(r.id)
    await office.close()

    // ── 4. 화면 오류 ───────────────────────────────────────────────────
    section('4. 콘솔 오류')
    const real = errors.filter((e) => !/favicon|jsdelivr|pretendard|Failed to load resource|net::ERR_/.test(e))
    check(real.length === 0, '자바스크립트 오류 없음', real.slice(0, 3).join(' | '))
  } catch (e) {
    no('검사 도중 오류가 났습니다', String(e?.message ?? e).slice(0, 200))
  } finally {
    section('정리')
    for (const id of made) await svc(`/client_requests?id=eq.${id}`, { method: 'DELETE' })
    //  혹시 남은 것이 있으면 함께 지웁니다.
    const leftovers = (await svc(`/client_requests?select=id&content=like.*${encodeURIComponent(String(stamp))}*`)).body ?? []
    for (const r of leftovers) await svc(`/client_requests?id=eq.${r.id}`, { method: 'DELETE' })
    const endCount = ((await svc('/client_requests?select=id')).body ?? []).length
    check(endCount === startCount, '요청 건수가 시작 시점과 같음', `${startCount}건 → ${endCount}건`)
    await browser.close()

    console.log(`\n════ ${pass} PASS / ${fail} FAIL ════`)
    console.log(`통신 끊김 시 요청: ${fail === 0 ? 'YES' : 'NO'}`)
    process.exit(fail === 0 ? 0 : 1)
  }
}

main().catch((e) => {
  console.error('\n실행 오류:', e)
  process.exit(1)
})
