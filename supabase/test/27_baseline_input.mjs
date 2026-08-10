// ─────────────────────────────────────────────────────────────────────────────
// 설정 화면의 기준값·실증기간 입력 (실제 브라우저 · 실제 DB)
//
//  여기 넣는 다섯 숫자가 'AX 도입 성과'의 기준선입니다. 개선율·절감시간이
//  전부 이 값에서 나오므로, 여기가 한 자리라도 틀리면 대표님께 보여드리는
//  성과 숫자가 통째로 틀립니다. 그런데 아무도 이 숫자를 다시 검산하지
//  않습니다 — 한 번 넣고 잊는 값이기 때문입니다.
//
//  특히 확인하는 것: 사람처럼 한 글자씩 칠 때 그대로 들어가는가.
//  예전에는 글자를 칠 때마다 서버에 쓰고 전체 데이터를 다시 읽어 와서,
//  그 응답이 늦게 도착하며 입력하던 숫자를 덮어썼습니다.
//  ('120' 을 치면 '2' 가 저장됐습니다)
//
//  실행
//    npm run build && npx vite preview --port 4173
//    export SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=...
//    export TEST_ADMIN_PW=... TEST_OFFICE_PW=...
//    node supabase/test/27_baseline_input.mjs
//
//  · 기준값·실증 시작일은 시작 시점 값으로 반드시 되돌립니다.
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
const TYPED = '120'

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
  console.log('\n════ 기준값 · 실증기간 입력 ════')

  const before = (await svc('/performance_baselines?select=*&id=eq.1')).body?.[0] ?? null
  const exp0 = (await svc('/experiment_settings?select=*&id=eq.1')).body?.[0] ?? null

  const pw = (await import(process.env.PLAYWRIGHT_MODULE || 'playwright')).default
  const browser = await pw.chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: process.env.CHROMIUM_TLS12 ? ['--ssl-version-max=tls1.2'] : [],
  })
  const errors = []

  try {
    const admin = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
    admin.on('pageerror', (e) => errors.push(`[관리자] ${e.message}`))
    admin.on('console', (m) => { if (m.type() === 'error') errors.push(`[관리자] ${m.text()}`) })
    await signIn(admin, `admin@${DOMAIN}`, process.env.TEST_ADMIN_PW)
    await admin.goto(`${BASE}/settings`, { waitUntil: 'networkidle' })
    await admin.waitForTimeout(3000)

    // ── 1. 한 글자씩 칠 때 그대로 들어가는가 ────────────────────────────
    section('1. 사람처럼 한 글자씩 칠 때')
    const field = admin.locator('#bl-adminMinutesPerCollection').first()
    check(await field.count() > 0, '기준값 입력칸이 있음')

    await field.click()
    await field.press('Control+a')
    for (const ch of TYPED) {
      await admin.keyboard.type(ch)
      await admin.waitForTimeout(250)
    }
    const typing = await field.inputValue()
    check(typing === TYPED, '치는 도중에도 화면 값이 밀리지 않음', `"${typing}" (기대 "${TYPED}")`)

    // ── 2. 칸을 벗어나면 저장되는가 ─────────────────────────────────────
    section('2. 칸을 벗어났을 때')
    await admin.keyboard.press('Enter')
    await admin.waitForTimeout(5000)
    const shown = await field.inputValue()
    check(shown === TYPED, '저장 뒤에도 화면 값이 그대로', `"${shown}"`)

    const saved = (await svc('/performance_baselines?select=*&id=eq.1')).body?.[0]
    check(saved?.admin_minutes_per_collection === Number(TYPED), '친 숫자가 그대로 DB 에 저장됨',
      `${saved?.admin_minutes_per_collection} (기대 ${TYPED})`)

    // ── 3. 새로고침해도 남는가 ──────────────────────────────────────────
    section('3. 새로고침')
    await admin.reload({ waitUntil: 'networkidle' })
    await admin.waitForTimeout(3000)
    const afterReload = await admin.locator('#bl-adminMinutesPerCollection').first().inputValue()
    check(afterReload === TYPED, '새로고침해도 값이 남아 있음', `"${afterReload}"`)

    // ── 3-2. 실증 시작일 ───────────────────────────────────────────────
    section('3-2. 실증 시작일 입력')
    //  이 날짜 이후의 입력만 '도입 후 성과' 로 집계합니다. 하루만 어긋나도
    //  성과 구간이 통째로 달라집니다. 날짜 칸도 기준값과 같은 방식(칸을 채우면
    //  바로 저장)이라 실제로 그대로 들어가는지 봅니다.
    const EXP = '2026-07-01'
    const dateField = admin.locator('#exp-start').first()
    check(await dateField.count() > 0, '실증 시작일 칸이 있음')
    await dateField.fill(EXP)
    await admin.waitForTimeout(5000)
    const expSaved = (await svc('/experiment_settings?select=start_date&id=eq.1')).body?.[0]
    check(expSaved?.start_date === EXP, '고른 날짜가 그대로 DB 에 저장됨',
      `${expSaved?.start_date} (기대 ${EXP})`)

    await admin.reload({ waitUntil: 'networkidle' })
    await admin.waitForTimeout(3000)
    check((await admin.locator('#exp-start').first().inputValue()) === EXP,
      '새로고침해도 실증 시작일이 남아 있음')

    //  해제하면 전체 기간 집계로 돌아가야 합니다.
    await admin.locator('button:has-text("해제")').first().click()
    await admin.waitForTimeout(4000)
    const expCleared = (await svc('/experiment_settings?select=start_date&id=eq.1')).body?.[0]
    check(expCleared?.start_date === null, '「해제」 를 누르면 비워짐',
      `${expCleared?.start_date}`)

    // ── 4. 그 숫자가 성과 화면의 기준선으로 쓰이는가 ────────────────────
    section('4. 성과 화면에 기준선으로 반영')
    await admin.goto(`${BASE}/performance`, { waitUntil: 'networkidle' })
    await admin.waitForTimeout(3000)
    const perf = await admin.locator('body').innerText()
    check(perf.includes(TYPED), '성과 화면에 방금 넣은 기준값이 보임',
      perf.includes(TYPED) ? '' : '화면에서 찾지 못했습니다')

    // ── 5. 사무실은 설정 화면에 들어갈 수 없는가 ────────────────────────
    section('5. 설정은 관리자만')
    const office = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
    await signIn(office, `office@${DOMAIN}`, process.env.TEST_OFFICE_PW)
    await office.goto(`${BASE}/settings`, { waitUntil: 'networkidle' })
    await office.waitForTimeout(2500)
    //  막힌 경로는 주소를 바꾸지 않고 그 자리에 차단 화면을 그립니다.
    //  주소만 보고 판정하면 '안 막혔다'고 잘못 읽습니다.
    const blocked = await office.locator('body').innerText()
    check(blocked.includes('접근 권한이 없는 화면입니다'), '사무실 계정은 설정 화면이 막힘',
      blocked.includes('접근 권한이 없는 화면입니다') ? '' : blocked.slice(0, 60).replace(/\n/g, ' '))
    check(!blocked.includes('기준값'), '차단 화면에는 기준값 입력칸이 보이지 않음')
    await office.close()

    // ── 6. 화면 오류 ────────────────────────────────────────────────────
    section('6. 콘솔 오류')
    const real = errors.filter((e) => !/favicon|jsdelivr|pretendard|Failed to load resource|net::ERR_/.test(e))
    check(real.length === 0, '자바스크립트 오류 없음', real.slice(0, 3).join(' | '))
    await admin.close()
  } catch (e) {
    no('검사 도중 오류가 났습니다', String(e?.message ?? e).slice(0, 200))
  } finally {
    section('정리')
    if (before) {
      await svc('/performance_baselines?id=eq.1', {
        method: 'PATCH',
        body: JSON.stringify({
          admin_minutes_per_collection: before.admin_minutes_per_collection,
          repeat_entries_per_collection: before.repeat_entries_per_collection,
          monthly_doc_hours: before.monthly_doc_hours,
          monthly_rework_count: before.monthly_rework_count,
          daily_capacity: before.daily_capacity,
          source: before.source,
        }),
      })
    }
    if (exp0) {
      await svc('/experiment_settings?id=eq.1', {
        method: 'PATCH', body: JSON.stringify({ start_date: exp0.start_date }),
      })
    }
    const back = (await svc('/performance_baselines?select=admin_minutes_per_collection&id=eq.1')).body?.[0]
    check(
      (back?.admin_minutes_per_collection ?? null) === (before?.admin_minutes_per_collection ?? null),
      '기준값을 시작 시점으로 되돌림',
      `${back?.admin_minutes_per_collection ?? 'null'}`,
    )
    await browser.close()

    console.log(`\n════ ${pass} PASS / ${fail} FAIL ════`)
    console.log(`기준값 입력: ${fail === 0 ? 'YES' : 'NO'}`)
    process.exit(fail === 0 ? 0 : 1)
  }
}

main().catch((e) => {
  console.error('\n실행 오류:', e)
  process.exit(1)
})
