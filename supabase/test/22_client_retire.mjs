// ─────────────────────────────────────────────────────────────────────────────
// 거래처를 그만둘 때 (실제 브라우저 · 실제 DB)
//
//  거래처 화면의 「거래 종료」는 진짜 지우지 않고 비활성으로 둡니다. 지워 버리면
//  과거 수거·정산이 함께 사라지기 때문입니다. 문제는 그 다음입니다.
//
//   · 앱은 활성 거래처만 읽어 옵니다(clients.active = true).
//   · 그런데 청구(payments)는 전부 읽어 옵니다.
//   · 그래서 미수금이 남은 거래처를 비활성으로 두면, 미수금 합계에는
//     금액이 그대로 잡히는데 그 줄의 업체명은 '알 수 없음' 이 됩니다.
//     몇 달 뒤 그 돈이 누구 것인지 아무도 모릅니다.
//
//  여기서는 그 자리를 실제로 밟아 봅니다.
//   1) 검증용 거래처를 만들고 미수금 청구를 하나 붙인다
//   2) 화면에서 「거래 종료」를 누른다
//   3) 미수금 화면에서 그 줄이 어떻게 보이는지 본다
//   4) 과거 수거 이력이 DB 에 남아 있는지 본다
//
//  실행
//    npm run build && npx vite preview --port 4173
//    export SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=...
//    export TEST_ADMIN_PW=...
//    node supabase/test/22_client_retire.mjs
//
//  · 만드는 것에는 '[검증]' 이 붙고 끝나면 모두 지웁니다.
//  · 시작·종료 시점의 거래처 수를 비교합니다.
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
  await page.waitForTimeout(1200)
}

async function main() {
  console.log('\n════ 거래처를 그만둘 때 ════')

  const startCount = ((await svc('/clients?select=id&active=eq.true')).body ?? []).length
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
  const month = today.slice(0, 7)
  const AMOUNT = 137000
  let clientId = null
  let paymentId = null
  let schedId = null
  let extraSchedId = null

  const pw = (await import(process.env.PLAYWRIGHT_MODULE || 'playwright')).default
  const browser = await pw.chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: process.env.CHROMIUM_TLS12 ? ['--ssl-version-max=tls1.2'] : [],
  })
  const errors = []

  try {
    // ── 1. 준비 — 미수금이 남은 거래처 ──────────────────────────────────
    section('1. 미수금이 남은 거래처를 만든다')
    const name = `${MARK}그만둘병원-${Date.now() % 100000}`
    const madeRes = await svc('/clients', {
      method: 'POST',
      body: JSON.stringify({
        name, type: '병원', address: '경기도 남양주시 검증로 1', phone: '031-000-0000',
        collection_cycle: '주 1회', storage_size: '작음', collects_medical_waste: true,
        collects_diaper: false, active: true, is_demo_generated: false,
        manager: '검증담당', payment_terms: '월말 정산',
      }),
    })
    const made = madeRes.body?.[0]
    check(!!made, '검증용 거래처를 만듦', made?.name ?? JSON.stringify(madeRes.body).slice(0, 160))
    if (!made) return
    clientId = made.id

    const sched = (await svc('/schedules', {
      method: 'POST',
      body: JSON.stringify({
        date: today, client_id: clientId, waste_type: '의료폐기물',
        scheduled_time: '09:00', expected_amount: 30, actual_amount: 30, actual_time: '09:10',
        status: '완료', is_additional: false, origin: 'seed', memo: `${MARK}그만두기전 수거`,
        event_id: crypto.randomUUID(),
      }),
    })).body?.[0]
    check(!!sched, '이 거래처의 완료된 수거를 하나 만듦')
    if (sched) schedId = sched.id

    const paid = (await svc('/payments', {
      method: 'POST',
      body: JSON.stringify({
        client_id: clientId, billing_month: month, amount: AMOUNT,
        status: '미수금', method: '무통장', memo: `${MARK}그만두기전 청구`,
      }),
    })).body?.[0]
    check(!!paid, `미수금 ${AMOUNT.toLocaleString('ko-KR')}원 청구를 붙임`)
    if (paid) paymentId = paid.id

    // ── 2. 화면에서 「거래 종료」를 누른다 ──────────────────────────────
    section('2. 관리자가 거래처 화면에서 「거래 종료」를 누른다')
    const admin = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
    admin.on('pageerror', (e) => errors.push(`[관리자] ${e.message}`))
    admin.on('console', (m) => { if (m.type() === 'error') errors.push(`[관리자] ${m.text()}`) })
    await signIn(admin, `admin@${DOMAIN}`, process.env.TEST_ADMIN_PW)

    await admin.goto(`${BASE}/clients/${clientId}`, { waitUntil: 'networkidle' })
    await admin.waitForTimeout(2500)
    check(await admin.locator(`text=${name}`).count() > 0, '거래처 상세 화면이 열림')

    //  이 화면은 미수금을 이미 보여 주고 있습니다 — 무엇을 지우는지 알고 눌러야 합니다
    const detailText = await admin.locator('body').innerText()
    check(detailText.includes(AMOUNT.toLocaleString('ko-KR')),
      '상세 화면에 미수금 금액이 보임', AMOUNT.toLocaleString('ko-KR'))

    //  묻는 말이 실제로 일어나는 일과 같은지도 봅니다. "삭제할까요" 라고만
    //  물으면 기록까지 없어지는 줄 알고 못 누르게 됩니다.
    let asked = ''
    admin.once('dialog', (d) => { asked = d.message(); d.accept() })
    const delBtn = admin.locator('button:has-text("거래 종료")').first()
    check(await delBtn.count() > 0, '「거래 종료」 버튼이 있음')
    await delBtn.click()
    await admin.waitForTimeout(3500)
    check(/기록은 그대로 남습니다/.test(asked), '무슨 일이 일어나는지 그대로 묻고 있음',
      asked.replace(/\n/g, ' ').slice(0, 70))

    const row = (await svc(`/clients?select=active&id=eq.${clientId}`)).body?.[0]
    check(row && row.active === false, '거래처가 지워지지 않고 비활성으로 바뀜',
      row ? `active=${row.active}` : '행이 사라짐')

    // ── 3. 과거 기록은 남는가 ──────────────────────────────────────────
    section('3. 과거 기록')
    const keptSched = (await svc(`/schedules?select=id,actual_amount&id=eq.${schedId}`)).body?.[0]
    check(keptSched?.actual_amount === 30, '과거 수거 이력이 DB 에 그대로 남음')
    const keptPay = (await svc(`/payments?select=amount,status&id=eq.${paymentId}`)).body?.[0]
    check(keptPay?.amount === AMOUNT && keptPay?.status === '미수금', '청구도 그대로 남음')

    // ── 4. 그 돈이 누구 것인지 화면에서 알 수 있는가 ────────────────────
    section('4. 미수금 화면에서 그 돈의 주인을 알 수 있는가')
    await admin.goto(`${BASE}/receivables`, { waitUntil: 'networkidle' })
    await admin.waitForTimeout(2500)
    const all = admin.locator('button:has-text("전체")').first()
    if (await all.count()) { await all.click(); await admin.waitForTimeout(1200) }

    const body = await admin.locator('body').innerText()
    const amountShown = body.includes(AMOUNT.toLocaleString('ko-KR'))
    check(amountShown, '비활성 거래처의 미수금이 여전히 목록에 잡힘')

    //  이름이 남아 있어야 합니다. '알 수 없음' 이면 몇 달 뒤 추적이 불가능합니다.
    //  카드를 정확히 집습니다. 금액만으로 찾으면 가장 안쪽 요소가 잡혀서
    //  업체명이 있는 윗줄이 빠집니다(이전에 실제로 그렇게 잘못 봤습니다).
    let namedRow = false
    if (amountShown) {
      const memoP = admin.locator(`p:has-text("${MARK}그만두기전 청구")`).first()
      const card = memoP.locator('xpath=ancestor::div[2]')
      const cardText = await card.innerText().catch(() => '')
      namedRow = cardText.includes(name)
      check(namedRow, '그 줄에 업체명이 그대로 보임',
        cardText.includes('알 수 없음')
          ? "'알 수 없음' 으로 보임 — 이 돈이 누구 것인지 화면에서 알 수 없습니다"
          : cardText.split('\n').slice(0, 2).join(' / '))
    }

    // ── 5. 오늘 일정이 남은 채로 그만뒀을 때 화면이 버티는가 ────────────
    section('5. 오늘 일정이 남은 채로 그만뒀을 때')
    //  오전에 일정을 잡고 오후에 거래를 정리하면 이 상태가 됩니다.
    //  대시보드의 '오늘 거래처 운영 현황' 이 이 줄을 만나 죽으면 안 됩니다.
    const todaySched = (await svc('/schedules', {
      method: 'POST',
      body: JSON.stringify({
        date: today, client_id: clientId, waste_type: '의료폐기물',
        scheduled_time: '16:00', expected_amount: 10,
        status: '예정', is_additional: true, origin: 'seed', memo: `${MARK}그만둔뒤 남은일정`,
        event_id: crypto.randomUUID(),
      }),
    })).body?.[0]
    check(!!todaySched, '그만둔 거래처의 오늘 일정을 하나 남겨 둠')
    if (todaySched) extraSchedId = todaySched.id

    const beforeDash = errors.length
    await admin.goto(`${BASE}/`, { waitUntil: 'networkidle' })
    await admin.waitForTimeout(3000)
    const dashText = await admin.locator('body').innerText()
    check(errors.length === beforeDash && dashText.includes('오늘'),
      '대시보드가 죽지 않고 그려짐', errors.slice(beforeDash, beforeDash + 2).join(' | '))

    //  수거 이력에서도 그 거래처 이름이 남아야 합니다.
    await admin.goto(`${BASE}/history`, { waitUntil: 'networkidle' })
    await admin.waitForTimeout(2500)
    const search = admin.locator('input[placeholder="거래처명 검색"]').first()
    if (await search.count()) {
      await search.fill(name)
      await admin.waitForTimeout(1500)
      const histText = await admin.locator('body').innerText()
      check(histText.includes(name), '수거 이력에서 그만둔 거래처 이름으로 찾을 수 있음',
        histText.includes('거래처') && !histText.includes(name) ? "이름이 '거래처' 로 뭉개짐" : '')
    }

    // ── 6. 지난 실적이 줄어들지 않는가 ──────────────────────────────────
    section('6. 그만둬도 이번 달 정산에 그 실적이 남는가')
    //  이미 수거해서 청구한 30kg 입니다. 거래를 정리했다고 이번 달 매출이
    //  줄어들면 월 마감 숫자가 뒤에서 조용히 바뀝니다.
    await admin.goto(`${BASE}/stats`, { waitUntil: 'networkidle' })
    await admin.waitForTimeout(3500)
    const repText = await admin.locator('body').innerText()
    check(repText.includes(name), '거래처별 수익성 표에 그만둔 거래처가 남음',
      repText.includes(name) ? '' : repText.includes('거래처별 수익성') ? '표에 없음' : '표를 열지 못함')

    // ── 7. 화면 오류 ────────────────────────────────────────────────────
    section('7. 콘솔 오류')
    const real = errors.filter((e) => !/favicon|jsdelivr|pretendard|Failed to load resource|net::ERR_/.test(e))
    check(real.length === 0, '자바스크립트 오류 없음', real.slice(0, 3).join(' | '))
    await admin.close()
  } catch (e) {
    //  중간에 터지면 여기서 붙잡아 실패로 남깁니다. 예전에는 catch 가 없어서,
    //  터진 뒤 finally 의 process.exit(0) 이 그대로 실행되며 '통과' 로 끝났습니다.
    //  (관리자 로그인이 막혔을 때 이 검사가 4건만 하고 YES 를 찍었습니다)
    no('검사 도중 오류가 났습니다', String(e?.message ?? e).slice(0, 200))
  } finally {
    section('정리')
    if (paymentId) await svc(`/payments?id=eq.${paymentId}`, { method: 'DELETE' })
    if (schedId) await svc(`/schedules?id=eq.${schedId}`, { method: 'DELETE' })
    if (extraSchedId) await svc(`/schedules?id=eq.${extraSchedId}`, { method: 'DELETE' })
    if (clientId) {
      await svc(`/collection_events?client_id=eq.${clientId}`, { method: 'DELETE' })
      await svc(`/clients?id=eq.${clientId}`, { method: 'DELETE' })
    }
    const endCount = ((await svc('/clients?select=id&active=eq.true')).body ?? []).length
    check(endCount === startCount, '거래처 수가 시작 시점과 같음', `${startCount}곳 → ${endCount}곳`)
    await browser.close()

    console.log(`\n════ ${pass} PASS / ${fail} FAIL ════`)
    console.log(`거래처 그만두기: ${fail === 0 ? 'YES' : 'NO'}`)
    process.exit(fail === 0 ? 0 : 1)
  }
}

main().catch((e) => {
  console.error('\n실행 오류:', e)
  process.exit(1)
})
