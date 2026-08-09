// ─────────────────────────────────────────────────────────────────────────────
// 거래처 단가를 화면에서 고칠 때 (실제 브라우저 · 실제 DB)
//
//  단가는 이 시스템에서 사람이 손으로 넣는 거의 유일한 숫자입니다.
//  한 번 잘못 들어가면 그 거래처의 모든 청구서가 조용히 틀립니다.
//  그래서 "저장이 됐는가"만이 아니라 "다시 열었을 때도 그대로인가"까지
//  봐야 합니다. 다시 열었을 때 옛 값이 보이면, 사무실은 그것을 보고
//  아무 생각 없이 다시 저장하면서 방금 고친 단가를 되돌려 버립니다.
//
//  밟는 순서
//   1) 사무실(PC)  거래처 → 월 정산·명세서 → 단가 → 판매단가를 고쳐 저장
//   2) DB          그 값이 그대로 들어갔는가
//   3) 화면        단가 창을 다시 열었을 때 방금 넣은 값이 보이는가
//   4) 화면        아무것도 고치지 않고 저장했을 때 값이 유지되는가
//   5) 정산        바뀐 단가가 그 달 매출에 반영되는가
//
//  실행
//    npm run build && npx vite preview --port 4173
//    export SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=...
//    export TEST_OFFICE_PW=...
//    node supabase/test/25_price_editor.mjs
//
//  · 단가는 시작 시점 값으로 반드시 되돌립니다(실패해도 finally 에서).
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
const NEW_SALE = 1234 // 기본값(950)과 확실히 다른 값

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
  console.log('\n════ 거래처 단가를 화면에서 고칠 때 ════')

  //  이번 달에 수거 실적이 있는 거래처를 고릅니다 (정산 반영까지 보려면 필요).
  const month = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 7)
  const done = (await svc(`/schedules?select=client_id,actual_amount&status=eq.완료&date=gte.${month}-01&waste_type=eq.의료폐기물`)).body ?? []
  const clientId = done[0]?.client_id
  if (!clientId) {
    console.error('이번 달 완료된 의료폐기물 수거가 없어 이 검사를 밟을 수 없습니다.')
    process.exit(1)
  }
  const client = (await svc(`/clients?select=id,name,pricing&id=eq.${clientId}`)).body?.[0]
  const pricing0 = client.pricing ?? null
  console.log(`대상 ${client.name} · ${month}`)

  const pw = (await import(process.env.PLAYWRIGHT_MODULE || 'playwright')).default
  const browser = await pw.chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: process.env.CHROMIUM_TLS12 ? ['--ssl-version-max=tls1.2'] : [],
  })
  const errors = []

  try {
    const office = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
    office.on('pageerror', (e) => errors.push(`[사무실] ${e.message}`))
    office.on('console', (m) => { if (m.type() === 'error') errors.push(`[사무실] ${m.text()}`) })
    await signIn(office, `office@${DOMAIN}`, process.env.TEST_OFFICE_PW)

    await office.goto(`${BASE}/clients/${clientId}`, { waitUntil: 'networkidle' })
    await office.waitForTimeout(2500)

    // ── 1. 단가 창을 열어 판매단가를 고친다 ─────────────────────────────
    section('1. 단가를 고쳐 저장')
    await office.locator('button:has-text("월 정산·명세서")').first().click()
    await office.waitForTimeout(2000)

    const openPrice = office.locator('button:has-text("단가")').first()
    check(await openPrice.count() > 0, '「단가」 버튼이 있음')
    await openPrice.click()
    await office.waitForTimeout(1200)

    //  '의료폐기물' 줄의 판매단가 칸 — 모달 안에서만 찾습니다.
    const dialog = office.locator('[role="dialog"]')
    check(await dialog.count() > 0, '단가 창이 열림')
    const medicalRow = dialog.locator('tr').filter({ hasText: '의료폐기물' }).first()
    const saleInput = medicalRow.locator('input[type="number"]').first()
    const before = await saleInput.inputValue()
    check(before !== '', '의료폐기물 판매단가 칸에 현재 값이 들어 있음', before)

    await saleInput.fill(String(NEW_SALE))
    await dialog.locator('button:has-text("저장")').first().click()
    await office.waitForTimeout(3500)

    // ── 2. DB 에 그대로 들어갔는가 ──────────────────────────────────────
    section('2. DB 확인')
    const saved = (await svc(`/clients?select=pricing&id=eq.${clientId}`)).body?.[0]
    check(saved?.pricing?.medical?.sale === NEW_SALE, '고친 판매단가가 DB 에 저장됨',
      `medical.sale = ${saved?.pricing?.medical?.sale}`)

    // ── 3. 다시 열었을 때 방금 넣은 값이 보이는가 ──────────────────────
    section('3. 단가 창을 다시 열었을 때')
    await office.locator('button:has-text("단가")').first().click()
    await office.waitForTimeout(1500)
    const reopened = await office
      .locator('[role="dialog"] tr').filter({ hasText: '의료폐기물' }).first()
      .locator('input[type="number"]').first().inputValue()
    check(reopened === String(NEW_SALE), '다시 열어도 방금 넣은 단가가 보임',
      reopened === String(NEW_SALE) ? '' : `${reopened} 이 보입니다 (기대 ${NEW_SALE})`)

    // ── 4. 그대로 저장했을 때 값이 유지되는가 ──────────────────────────
    //  여기가 진짜 무서운 자리입니다. 창을 열었다가 아무것도 안 고치고
    //  저장을 눌렀는데 옛 단가가 다시 들어가면, 아무도 눈치채지 못합니다.
    section('4. 아무것도 고치지 않고 저장했을 때')
    await office.locator('[role="dialog"] button:has-text("저장")').first().click()
    await office.waitForTimeout(3500)
    const after = (await svc(`/clients?select=pricing&id=eq.${clientId}`)).body?.[0]
    check(after?.pricing?.medical?.sale === NEW_SALE, '그대로 저장해도 단가가 되돌아가지 않음',
      `medical.sale = ${after?.pricing?.medical?.sale} (기대 ${NEW_SALE})`)

    // ── 5. 정산 숫자에 반영되는가 ──────────────────────────────────────
    section('5. 바뀐 단가가 이번 달 매출에 반영')
    await office.reload({ waitUntil: 'networkidle' })
    await office.waitForTimeout(2500)
    await office.locator('button:has-text("월 정산·명세서")').first().click()
    await office.waitForTimeout(2500)

    const kg = done.filter((d) => d.client_id === clientId).reduce((a, d) => a + (d.actual_amount ?? 0), 0)
    const expected = (kg * NEW_SALE).toLocaleString('ko-KR')
    const text = await office.locator('body').innerText()
    check(text.includes(expected), '수거 매출이 새 단가로 계산됨',
      `${kg}kg × ${NEW_SALE}원 = ${expected}원`)

    // ── 6. 화면 오류 ───────────────────────────────────────────────────
    section('6. 콘솔 오류')
    const real = errors.filter((e) => !/favicon|jsdelivr|pretendard|Failed to load resource|net::ERR_/.test(e))
    check(real.length === 0, '자바스크립트 오류 없음', real.slice(0, 3).join(' | '))
    await office.close()
  } catch (e) {
    no('검사 도중 오류가 났습니다', String(e?.message ?? e).slice(0, 200))
  } finally {
    section('정리')
    await svc(`/clients?id=eq.${clientId}`, {
      method: 'PATCH', body: JSON.stringify({ pricing: pricing0 }),
    })
    const back = (await svc(`/clients?select=pricing&id=eq.${clientId}`)).body?.[0]
    check(JSON.stringify(back?.pricing ?? null) === JSON.stringify(pricing0), '단가를 원래대로 되돌림',
      JSON.stringify(back?.pricing ?? null).slice(0, 60))
    await browser.close()

    console.log(`\n════ ${pass} PASS / ${fail} FAIL ════`)
    console.log(`단가 화면: ${fail === 0 ? 'YES' : 'NO'}`)
    process.exit(fail === 0 ? 0 : 1)
  }
}

main().catch((e) => {
  console.error('\n실행 오류:', e)
  process.exit(1)
})
