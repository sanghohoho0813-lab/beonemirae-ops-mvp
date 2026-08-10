// ─────────────────────────────────────────────────────────────────────────────
// 미수금 종단 흐름 (실제 브라우저 · 실제 계정 · 실제 DB)
//
//  돈이 걸린 화면입니다. 여기서 상태를 잘못 눌렀는데 서버에 안 들어가거나,
//  들어갔는데 화면이 안 바뀌면 "받았는지 안 받았는지"를 두고 거래처와
//  다투게 됩니다. 그리고 그 다툼은 몇 달 뒤에 시작됩니다.
//
//  밟는 순서
//   1) 사무실(PC)   미수금 화면에서 청구를 보고 합계를 확인한다
//   2) 사무실(PC)   '확인필요' → '입금완료' 로 처리한다
//   3) 관리자(다른 기기)  같은 상태로 보이는지 확인한다
//   4) 현장·병원    이 화면에 접근조차 못 하는지 확인한다
//   5) 감사기록     누가 입금 처리했는지 남는지 확인한다
//
//  실행
//    npm run build && npx vite preview --port 4173      # 다른 터미널에서
//    export SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=...
//    export TEST_OFFICE_PW=... TEST_ADMIN_PW=... TEST_FIELD_PW=... TEST_CLIENT_PW=...
//    node supabase/test/16_receivables_flow.mjs
//
//  · 이 검사가 만든 청구에는 '[검증]' 이 붙고 끝나면 지웁니다.
//  · 시작·종료 시점의 청구 목록을 비교해 남는 것이 없는지 확인합니다.
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
const won = (n) => n.toLocaleString('ko-KR')

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

const DESKTOP = { viewport: { width: 1440, height: 900 } }
const MOBILE = {
  viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
}

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
/** 역할이 막는 화면인가 — 제품은 주소를 바꾸는 대신 차단 화면을 보여 줍니다 */
const blocked = async (page) => (await page.locator('body').innerText()).includes('접근 권한이 없는 화면입니다')

async function main() {
  console.log('\n════ 미수금 종단 흐름 ════')

  const client = (await svc(`/clients?select=id,name&name=like.${encodeURIComponent(MARK + '*')}&order=name`)).body?.[0]
  if (!client) { console.error('검증용 거래처가 없습니다.'); process.exit(1) }

  // 시작 상태 — 끝에 이 목록으로 돌아와야 합니다
  const before = ((await svc('/payments?select=id')).body ?? []).map((p) => p.id).sort()

  const AMOUNT = 1230000 + (Date.now() % 1000)
  const month = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 7)
  let paymentId = null

  const pw = (await import(process.env.PLAYWRIGHT_MODULE || 'playwright')).default
  const browser = await pw.chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: process.env.CHROMIUM_TLS12 ? ['--ssl-version-max=tls1.2'] : [],
  })
  const errors = []
  const watch = (page, tag) => {
    page.on('pageerror', (e) => errors.push(`[${tag}] ${e.message}`))
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${tag}] ${m.text()}`) })
  }

  try {
    // ── 준비: 청구 한 건 ──────────────────────────────────────────────────
    section('0. 청구 한 건을 넣어 둡니다')
    const made = (await svc('/payments', {
      method: 'POST',
      body: JSON.stringify({
        client_id: client.id, billing_month: month, amount: AMOUNT,
        status: '미수금', method: '무통장', memo: `${MARK}미수금흐름`,
      }),
    })).body?.[0]
    check(!!made, '청구 등록', made ? `${client.name} · ${month} · ${won(AMOUNT)}원` : '실패')
    if (!made) throw new Error('청구를 만들지 못해 이후를 볼 수 없습니다')
    paymentId = made.id

    // ── 1. 사무실 화면에 보이는가 ─────────────────────────────────────────
    section('1. 사무실 미수금 화면')
    const office = await (await browser.newContext(DESKTOP)).newPage()
    watch(office, '사무실')
    await signIn(office, `office@${DOMAIN}`, process.env.TEST_OFFICE_PW)
    await office.goto(`${BASE}/receivables`, { waitUntil: 'networkidle' })
    await office.waitForTimeout(2000)

    const text = await office.locator('body').innerText()
    check(text.includes(won(AMOUNT)), '방금 넣은 청구가 화면에 보임', `${won(AMOUNT)}원`)
    check(text.includes(client.name), '거래처 이름이 함께 보임')
    check(text.includes(month), '청구월이 보임', month)

    // 합계가 DB 와 맞는가 — 화면 숫자와 DB 를 각각 구해 비교합니다
    const all = (await svc('/payments?select=amount,status')).body ?? []
    const dbUnpaid = all.filter((p) => p.status !== '입금완료').reduce((s, p) => s + p.amount, 0)
    check(text.replace(/[,\s]/g, '').includes(String(dbUnpaid)),
      '미수금 합계가 DB 와 일치', `${won(dbUnpaid)}원`)

    // ── 2. 확인필요 → 입금완료 ────────────────────────────────────────────
    section('2. 사무실이 상태를 처리')
    // 화면 위쪽에는 같은 이름의 필터 칩('확인필요' · '입금완료')이 있습니다.
    // 그냥 이름으로 누르면 칩을 눌러 목록만 걸러지고 아무것도 처리되지 않습니다.
    // 그래서 "그 금액이 있는 줄 안에 있고, 필터 줄이 아닌" 버튼만 고릅니다.
    // 화면 위쪽에는 같은 이름의 필터 칩('확인필요' · '입금완료')이 있습니다.
    // 그냥 이름으로 누르면 칩을 눌러 목록만 걸러지고 아무것도 처리되지 않습니다.
    // 그래서 "그 금액이 있는 줄 안에 있고, 필터 줄이 아닌" 버튼만 고릅니다.
    // 줄의 깊이는 화면마다 다르므로 위로 몇 단계까지 훑습니다.
    const rowBtn = async (label) => {
      const btns = await office.locator(`button:has-text("${label}")`).all()
      for (const b of btns) {
        for (const depth of [1, 2, 3, 4]) {
          const near = await b.locator(`xpath=ancestor::div[${depth}]`).innerText().catch(() => '')
          if (!near) continue
          if (near.includes('전체 청구월')) break        // 필터 줄 — 이 버튼은 아님
          if (near.includes(won(AMOUNT))) return b
        }
      }
      return null
    }
    const dumpButtons = async (why) => {
      const btns = await office.locator('button').allInnerTexts()
      console.log(`        (${why}) 화면 버튼: ${btns.map((t) => t.replace(/\s+/g, ' ').slice(0, 14)).filter(Boolean).join(' / ')}`)
    }

    // 기본 필터가 '미수금' 이라 상태를 바꾸면 그 줄이 목록에서 빠집니다.
    // (정상 동작입니다) 처리 과정을 이어서 보려면 '전체' 로 두고 봅니다.
    const allChip = office.locator('button:has-text("전체")').first()
    if (await allChip.count()) { await allChip.click(); await office.waitForTimeout(800) }

    const needCheck = await rowBtn('확인필요')
    if (needCheck) {
      await needCheck.click()
      await office.waitForTimeout(2500)
      const now = (await svc(`/payments?select=status&id=eq.${paymentId}`)).body?.[0]
      check(now?.status === '확인필요', '「확인필요」가 DB 에 반영', now?.status)
      // 상태가 바뀌면 화면이 다시 그려집니다. 다음 버튼을 찾기 전에 기다립니다.
      await office.waitForTimeout(1200)
    } else {
      no('「확인필요」 버튼을 그 줄에서 찾음')
    }

    const payBtn = await rowBtn('입금완료 처리')
    check(!!payBtn, '「입금완료 처리」 버튼을 그 줄에서 찾음')
    if (!payBtn) await dumpButtons('입금완료 처리 못 찾음')
    if (payBtn) {
      //  한 번 입금완료로 바꾸면 화면에서는 되돌릴 수 없습니다. 그래서
      //  먼저 확인을 받고, '아니오' 를 누르면 아무 일도 없어야 합니다.
      let asked = ''
      office.once('dialog', (d) => { asked = d.message(); d.dismiss() })
      await payBtn.click()
      await office.waitForTimeout(2000)
      check(/되돌릴 수 없습니다/.test(asked), '입금완료 전에 확인을 받음',
        asked.replace(/\n/g, ' ').slice(0, 60))
      const notYet = (await svc(`/payments?select=status&id=eq.${paymentId}`)).body?.[0]
      check(notYet?.status !== '입금완료', '확인에서 취소하면 아무것도 바뀌지 않음', notYet?.status)

      const payBtn2 = await rowBtn('입금완료 처리')
      office.once('dialog', (d) => d.accept())
      await (payBtn2 ?? payBtn).click()
      await office.waitForTimeout(3000)
    }
    const paid = (await svc(`/payments?select=status,paid_at,updated_by&id=eq.${paymentId}`)).body?.[0]
    check(paid?.status === '입금완료', '입금완료가 DB 에 반영', paid?.status)
    check(!!paid?.paid_at, '입금 시각이 기록됨', paid?.paid_at?.slice(0, 19) ?? '비어 있음')
    check(!!paid?.updated_by, '처리한 사람이 기록됨', paid?.updated_by ? '기록됨' : '비어 있음')

    const afterText = await office.locator('body').innerText()
    check(!/확인필요[\s\S]{0,80}입금완료 처리/.test(afterText) || afterText.includes('입금 완료'),
      '화면에서도 입금완료로 바뀜')

    // ── 3. 감사기록 ───────────────────────────────────────────────────────
    section('3. 감사기록')
    const audits = (await svc('/audit_logs?select=action,summary,actor_id&order=id.desc&limit=10')).body ?? []
    const payAudit = audits.find((a) => a.action === 'payment.paid')
    check(!!payAudit, '입금 처리가 감사기록에 남음', payAudit?.summary ?? '없음')
    check(!!payAudit?.actor_id, '누가 처리했는지 남음')
    //  기록에 "입금 완료 처리" 여섯 글자만 남으면 나중에 아무 소용이 없습니다.
    //  어느 병원의 몇 월치 얼마인지가 같이 남아야 합니다.
    check(/\d{4}-\d{2}/.test(payAudit?.summary ?? '') && /원/.test(payAudit?.summary ?? ''),
      '기록에 거래처·청구월·금액이 같이 남음', payAudit?.summary ?? '없음')
    const updAudit = audits.find((a) => a.action === 'payment.update')
    check(!!updAudit, '「확인필요」로 바꾼 것도 기록에 남음', updAudit?.summary ?? '없음')

    // ── 4. 다른 기기(관리자) ──────────────────────────────────────────────
    section('4. 관리자가 다른 기기에서 확인')
    const admin = await (await browser.newContext(MOBILE)).newPage()
    watch(admin, '관리자')
    await signIn(admin, `admin@${DOMAIN}`, process.env.TEST_ADMIN_PW)
    await admin.goto(`${BASE}/receivables`, { waitUntil: 'networkidle' })
    await admin.waitForTimeout(2000)
    const adminText = await admin.locator('body').innerText()
    check(adminText.includes(won(AMOUNT)), '관리자 화면에도 같은 청구가 보임')
    check(!adminText.includes('입금완료 처리') || !(await (async () => {
      const b = await rowBtn('입금완료 처리')
      return !!b
    })()), '이미 처리된 건에는 입금완료 버튼이 없음')
    await admin.close()

    // ── 5. 현장·병원은 이 화면을 못 연다 ─────────────────────────────────
    section('5. 현장·병원 계정 차단')
    const field = await (await browser.newContext(MOBILE)).newPage()
    watch(field, '현장')
    await signIn(field, `field@${DOMAIN}`, process.env.TEST_FIELD_PW)
    await field.goto(`${BASE}/receivables`, { waitUntil: 'networkidle' })
    await field.waitForTimeout(1000)
    check(await blocked(field), '현장 계정은 미수금 화면 차단')
    const fieldText = await field.locator('body').innerText()
    check(!fieldText.includes(won(AMOUNT)), '금액이 화면 어디에도 안 보임')
    await field.close()

    const hospital = await (await browser.newContext(MOBILE)).newPage()
    watch(hospital, '병원')
    await signIn(hospital, `client@${DOMAIN}`, process.env.TEST_CLIENT_PW)
    await hospital.goto(`${BASE}/receivables`, { waitUntil: 'networkidle' })
    await hospital.waitForTimeout(1000)
    const hospitalText = await hospital.locator('body').innerText()
    check(await blocked(hospital) || new URL(hospital.url()).pathname.startsWith('/portal'),
      '병원 계정은 미수금 화면 차단')
    check(!hospitalText.includes(won(AMOUNT)), '병원에게 청구 금액이 안 보임')
    await hospital.close()

    // ── 6. 화면 오류 ──────────────────────────────────────────────────────
    section('6. 콘솔 오류')
    const real = errors.filter((e) => !/favicon|jsdelivr|pretendard|Failed to load resource|net::ERR_/.test(e))
    check(real.length === 0, '자바스크립트 오류 없음', real.slice(0, 3).join(' | '))
    await office.close()
  } finally {
    section('정리')
    if (paymentId) await svc(`/payments?id=eq.${paymentId}`, { method: 'DELETE' })
    const after = ((await svc('/payments?select=id')).body ?? []).map((p) => p.id).sort()
    check(JSON.stringify(after) === JSON.stringify(before),
      '청구 목록이 시작 시점과 같음', `${before.length}건 → ${after.length}건`)
    await browser.close()
  }

  console.log(`\n════ ${pass} PASS / ${fail} FAIL ════`)
  console.log(`미수금 종단 흐름: ${fail === 0 ? 'YES' : 'NO'}`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
