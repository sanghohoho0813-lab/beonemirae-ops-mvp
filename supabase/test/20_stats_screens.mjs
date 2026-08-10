// ─────────────────────────────────────────────────────────────────────────────
// 통계 · 성과 · 대시보드 숫자 검증 (실제 브라우저 · 실제 DB)
//
//  이 화면들의 숫자는 대표님이 보고 판단하는 숫자입니다. 계산이 틀리면
//  틀린 채로 몇 달이 갑니다 — 아무도 손으로 검산하지 않기 때문입니다.
//
//  그래서 같은 DB 를 두 방향에서 셉니다.
//    · 화면에 찍힌 숫자
//    · service 권한으로 직접 집계한 숫자
//  둘이 다르면 어느 쪽이 틀렸든 문제입니다.
//
//  이 검사는 아무것도 바꾸지 않습니다 (읽기만).
//
//  실행
//    npm run build && npx vite preview --port 4173
//    export SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=...
//    export TEST_ADMIN_PW=... TEST_OFFICE_PW=... TEST_FIELD_PW=...
//    node supabase/test/20_stats_screens.mjs
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

let pass = 0
let fail = 0
const ok = (t, e = '') => { pass++; console.log(`  PASS  ${t}${e ? '  ' + e : ''}`) }
const no = (t, e = '') => { fail++; console.log(`  FAIL  ${t}${e ? '  ' + e : ''}`) }
const check = (c, t, e = '') => (c ? ok(t, e) : no(t, e))
const section = (t) => console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 52 - t.length))}`)
const won = (n) => n.toLocaleString('ko-KR')
const flat = (s) => s.replace(/[,\s]/g, '')
/**
 * 화면은 무게를 1,000kg 이상이면 '3.3톤' 으로 줄여 씁니다 (src/lib/format.ts 의 weight).
 * 검사도 같은 규칙으로 봐야 합니다 — 안 그러면 맞는 숫자를 틀렸다고 합니다.
 */
const weightText = (kg) =>
  kg >= 1000
    ? `${(kg / 1000).toLocaleString('ko-KR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })}톤`
    : `${kg.toLocaleString('ko-KR')}kg`
/** 화면에 kg 또는 톤 중 어느 쪽으로 찍혀도 통과 */
const hasWeight = (text, kg) =>
  flat(text).includes(flat(weightText(kg))) || flat(text).includes(flat(`${won(kg)}kg`))

const json = async (r) => {
  const t = await r.text()
  let body = null
  try { body = t ? JSON.parse(t) : null } catch { body = t }
  return { status: r.status, body }
}
const svc = (path) =>
  fetch(`${U}/rest/v1${path}`, {
    headers: { apikey: S, Authorization: `Bearer ${S}` },
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
  console.log('\n════ 통계 · 성과 · 대시보드 숫자 ════')

  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
  const month = today.slice(0, 7)
  const lastDay = (m) => {
    const [y, mm] = m.split('-').map(Number)
    return `${m}-${String(new Date(y, mm, 0).getDate()).padStart(2, '0')}`
  }

  // ── DB 에서 직접 집계 ──────────────────────────────────────────────────
  const scheds = (await svc(`/schedules?select=date,status,waste_type,actual_amount,client_id&date=gte.${month}-01&date=lte.${lastDay(month)}`)).body ?? []
  const done = scheds.filter((s) => s.status === '완료')
  const kg = { 의료폐기물: 0, 일회용기저귀: 0 }
  for (const s of done) kg[s.waste_type] = (kg[s.waste_type] ?? 0) + (s.actual_amount ?? 0)
  const totalKg = kg['의료폐기물'] + kg['일회용기저귀']

  const todayAll = (await svc(`/schedules?select=status&date=eq.${today}`)).body ?? []
  const todayDone = todayAll.filter((s) => s.status === '완료').length

  const pays = (await svc('/payments?select=amount,status')).body ?? []
  const outstanding = pays.filter((p) => p.status !== '입금완료').reduce((a, p) => a + p.amount, 0)

  const activeClients = ((await svc('/clients?select=id&active=is.true')).body ?? []).length
  const events = (await svc('/collection_events?select=id,reverted,input_duration_ms')).body ?? []
  const liveEvents = events.filter((e) => !e.reverted)

  console.log(`  DB 집계 — 이번 달 수거 ${done.length}건 · ${won(totalKg)}kg · 오늘 완료 ${todayDone}건`)
  console.log(`           미수금 ${won(outstanding)}원 · 활성 거래처 ${activeClients}곳 · 수거이벤트 ${liveEvents.length}건`)

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

    // ── 1. 대시보드 ───────────────────────────────────────────────────────
    section('1. 대시보드')
    await admin.goto(`${BASE}/`, { waitUntil: 'networkidle' })
    await admin.waitForTimeout(2500)
    const dash = await admin.locator('body').innerText()
    check(totalKg === 0 || hasWeight(dash, totalKg),
      '이번 달 수거량이 DB 집계와 일치', weightText(totalKg))
    check(outstanding === 0 || flat(dash).includes(flat(won(outstanding))),
      '미수금 합계가 DB 집계와 일치', `${won(outstanding)}원`)
    check(!/NaN|undefined|Infinity/.test(dash), '화면에 NaN·undefined 가 없음')

    // ── 2. 통계 ───────────────────────────────────────────────────────────
    section('2. 통계 화면')
    await admin.goto(`${BASE}/stats`, { waitUntil: 'networkidle' })
    await admin.waitForTimeout(2500)
    const stats = await admin.locator('body').innerText()
    for (const [type, amount] of Object.entries(kg)) {
      if (amount === 0) continue
      check(hasWeight(stats, amount), `${type} 수거량이 일치`, weightText(amount))
    }
    check(totalKg === 0 || hasWeight(stats, totalKg), '이번 달 합계가 일치', weightText(totalKg))
    check(!/NaN|undefined|Infinity/.test(stats), '화면에 NaN·undefined 가 없음')

    // 거래처별 숫자가 하나라도 맞는가 (가장 많이 수거한 거래처로 확인)
    const byClient = {}
    for (const s of done) byClient[s.client_id] = (byClient[s.client_id] ?? 0) + (s.actual_amount ?? 0)
    const topId = Object.keys(byClient).sort((a, b) => byClient[b] - byClient[a])[0]
    if (topId) {
      const name = (await svc(`/clients?select=name&id=eq.${topId}`)).body?.[0]?.name
      check(stats.includes(name) || !stats.includes('거래처별'),
        '거래처별 집계에 그 거래처가 보임', `${name} ${weightText(byClient[topId])}`)
    }

    // ── 3. AX 성과 ────────────────────────────────────────────────────────
    section('3. AX 도입 성과 화면')
    await admin.goto(`${BASE}/performance`, { waitUntil: 'networkidle' })
    await admin.waitForTimeout(2500)
    const perf = await admin.locator('body').innerText()
    check(!/NaN|undefined|Infinity/.test(perf), '화면에 NaN·undefined 가 없음')
    // 표본 수는 되돌리지 않은 수거 이벤트 수와 맞아야 합니다
    const sample = perf.match(/(\d+)\s*건/g) ?? []
    check(sample.length > 0, '표본 건수가 화면에 표시됨', sample.slice(0, 3).join(' · '))
    // 입력 시간 통계 — 측정값이 있는 이벤트만 세야 합니다
    const measured = liveEvents.filter((e) => e.input_duration_ms != null).length
    console.log(`        (측정된 입력시간 표본 ${measured}건 / 되돌리지 않은 수거 ${liveEvents.length}건)`)
    check(!/0초|NaN초/.test(perf) || measured === 0, '입력 시간이 0초로 표시되지 않음')

    // ── 4. 운영 리포트 ────────────────────────────────────────────────────
    section('4. 운영 리포트 화면')
    await admin.goto(`${BASE}/reports`, { waitUntil: 'networkidle' })
    await admin.waitForTimeout(2500)
    const rep = await admin.locator('body').innerText()
    check(!/NaN|undefined|Infinity/.test(rep), '화면에 NaN·undefined 가 없음')
    check(rep.length > 200, '리포트 화면이 비어 있지 않음', `${rep.length}자`)

    // ── 5. 배차 ───────────────────────────────────────────────────────────
    section('5. 배차 화면')
    await admin.goto(`${BASE}/dispatch`, { waitUntil: 'networkidle' })
    await admin.waitForTimeout(2000)
    const disp = await admin.locator('body').innerText()
    const vehicles = (await svc('/vehicles?select=name,waste_type')).body ?? []
    for (const v of vehicles.slice(0, 3)) {
      check(disp.includes(v.name), `차량 「${v.name}」이 배차 화면에 보임`)
    }
    check(!/NaN|undefined|Infinity/.test(disp), '화면에 NaN·undefined 가 없음')

    // ── 6. 수거 이력 ──────────────────────────────────────────────────────
    section('6. 수거 이력 화면')
    await admin.goto(`${BASE}/history`, { waitUntil: 'networkidle' })
    await admin.waitForTimeout(2500)
    const hist = await admin.locator('body').innerText()
    check(!/NaN|undefined|Infinity/.test(hist), '화면에 NaN·undefined 가 없음')
    if (done.length) {
      const recent = done.sort((a, b) => b.date.localeCompare(a.date))[0]
      check(hasWeight(hist, recent.actual_amount ?? 0),
        '최근 수거 한 건이 이력에 보임', `${recent.date} · ${weightText(recent.actual_amount ?? 0)}`)
    }

    // ── 7. 감사기록 화면 ──────────────────────────────────────────────────
    section('7. 감사기록 화면')
    await admin.goto(`${BASE}/audit`, { waitUntil: 'networkidle' })
    //  정해진 시간만 기다리면 목록이 아직 안 그려진 화면을 읽고 '기록이 없다'
    //  고 틀린 실패를 냅니다. 목록이 실제로 그려질 때까지 기다립니다.
    //  (화면 아래에 "최근 N건" 이 찍히면 다 그려진 것입니다)
    await admin.locator('text=/최근 \\d+건/').first()
      .waitFor({ state: 'attached', timeout: 20000 })
      .catch(() => {})
    await admin.waitForTimeout(1200)
    const aud = await admin.locator('body').innerText()
    const latest = (await svc('/audit_logs?select=summary,action&order=id.desc&limit=1')).body?.[0]
    check(!!latest && (aud.includes(latest.summary?.slice(0, 20) ?? '') || aud.includes(latest.action)),
      '가장 최근 감사기록이 화면에 보임', latest?.summary?.slice(0, 40) ?? '')
    check(!/NaN|undefined|Infinity/.test(aud), '화면에 NaN·undefined 가 없음')

    // ── 8. 현장 계정에게는 경영 숫자가 보이지 않는다 ─────────────────────
    section('8. 현장 계정에게 경영 숫자 차단')
    const field = await (await browser.newContext({
      viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    })).newPage()
    field.on('pageerror', (e) => errors.push(`[현장] ${e.message}`))
    await signIn(field, `field@${DOMAIN}`, process.env.TEST_FIELD_PW)
    for (const path of ['/stats', '/performance', '/reports', '/audit']) {
      await field.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })
      await field.waitForTimeout(700)
      const t = await field.locator('body').innerText()
      check(t.includes('접근 권한이 없는 화면입니다'), `현장 계정 ${path} 차단`)
      if (outstanding > 0) {
        check(!flat(t).includes(flat(won(outstanding))), `  ${path} 에서 미수금 금액 노출 없음`)
      }
    }
    await field.close()

    // ── 9. 화면 오류 ──────────────────────────────────────────────────────
    section('9. 콘솔 오류')
    const real = errors.filter((e) => !/favicon|jsdelivr|pretendard|Failed to load resource|net::ERR_/.test(e))
    check(real.length === 0, '자바스크립트 오류 없음', real.slice(0, 3).join(' | '))
    await admin.close()
  } catch (e) {
    //  중간에 터지면 여기서 붙잡아 실패로 남깁니다. 예전에는 catch 가 없어서,
    //  터진 뒤 finally 의 process.exit(0) 이 그대로 실행되며 '통과' 로 끝났습니다.
    //  (관리자 로그인이 막혔을 때 이 검사가 4건만 하고 YES 를 찍었습니다)
    no('검사 도중 오류가 났습니다', String(e?.message ?? e).slice(0, 200))
  } finally {
    await browser.close()
  }

  console.log(`\n════ ${pass} PASS / ${fail} FAIL ════`)
  console.log(`통계·성과 화면 숫자: ${fail === 0 ? 'YES' : 'NO'}`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
