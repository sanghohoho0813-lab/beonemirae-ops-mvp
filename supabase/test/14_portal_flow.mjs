// ─────────────────────────────────────────────────────────────────────────────
// 병원 포털 실사용 흐름 종단 검증 (실제 브라우저 · 실제 계정)
//
//  지금까지 포털은 "무엇을 못 보는가"만 확인했습니다. 정작 병원 담당자가
//  실제로 하는 일 — 요청을 올리고, 답을 기다리고, 답이 왔는지 확인하는 —
//  그 한 바퀴는 밟아 본 적이 없습니다.
//
//  이 흐름이 끊기면 병원은 전화를 겁니다. 그러면 시스템을 도입한 의미가
//  사라집니다. 그래서 세 사람의 화면을 차례로 밟습니다.
//
//    1) 병원(모바일)  요청을 올린다
//    2) 사무실(PC)    그 요청을 보고 회신을 남긴다
//    3) 병원(모바일)  회신을 확인한다
//
//  실행
//    npm run build && npx vite preview --port 4173      # 다른 터미널에서
//    export SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=...
//    export TEST_OFFICE_PW=... TEST_CLIENT_PW=...
//    node supabase/test/14_portal_flow.mjs
//
//  · 만드는 요청에는 '[검증]' 이 붙고 끝나면 지웁니다.
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

async function main() {
  console.log('\n════ 병원 포털 실사용 흐름 ════')

  const content = `${MARK}격리환자 발생으로 배출량이 늘었습니다 ${Date.now() % 100000}`
  const reply = `${MARK}내일 오전 중 추가 방문하겠습니다`

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
  let requestId = null

  try {
    // ── 1. 병원이 요청을 올린다 ───────────────────────────────────────────
    section('1. 병원 담당자가 휴대폰으로 요청을 올림')
    const hospital = await (await browser.newContext(MOBILE)).newPage()
    watch(hospital, '병원')
    await signIn(hospital, `client@${DOMAIN}`, process.env.TEST_CLIENT_PW)
    check(new URL(hospital.url()).pathname.startsWith('/portal'), '로그인하면 포털이 열림', new URL(hospital.url()).pathname)

    // 포털은 데이터를 받아온 뒤 그려집니다. 먼저 나타날 때까지 기다린 뒤 봅니다.
    const askBtn = hospital.locator('button:has-text("추가 수거")').first()
    await askBtn.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {})
    const text = await hospital.locator('body').innerText()
    check(text.includes('다음 수거'), '다음 수거 일정이 첫 화면에 보임',
      (text.match(/다음 수거[^\n]*/) ?? [''])[0].slice(0, 40))
    check(await askBtn.count() > 0, '요청 버튼이 있음')
    await askBtn.click()
    await hospital.waitForTimeout(800)

    const box = hospital.locator('textarea').first()
    check(await box.count() > 0, '요청 입력칸이 열림')
    await box.fill(content)
    await hospital.waitForTimeout(300)
    const sendBtn = hospital.locator('button:has-text("요청 보내기"), button:has-text("보내기"), button:has-text("전송")').last()
    if (await sendBtn.count()) await sendBtn.click()
    await hospital.waitForTimeout(3000)

    const saved = (await svc(`/client_requests?select=*&content=eq.${encodeURIComponent(content)}`)).body?.[0]
    check(!!saved, '요청이 실제 DB 에 저장됨', saved ? `${saved.kind} · ${saved.status}` : '저장 안 됨')
    if (!saved) throw new Error('요청이 저장되지 않아 이후 흐름을 볼 수 없습니다')
    requestId = saved.id
    check(saved.source === 'portal' && saved.status === '접수',
      '포털에서 올라온 접수 상태로 기록', `${saved.source} · ${saved.status}`)
    check(saved.requester_name && saved.requester_name !== '',
      '요청한 사람이 남음', saved.requester_name)

    const afterSend = await hospital.locator('body').innerText()
    check(afterSend.includes('접수') || afterSend.includes('전달') || afterSend.includes(content.slice(0, 12)),
      '보낸 뒤 화면에서 접수를 확인할 수 있음')

    // ── 2. 사무실이 회신을 남긴다 ─────────────────────────────────────────
    section('2. 사무실이 PC 에서 요청을 보고 회신')
    const office = await (await browser.newContext(DESKTOP)).newPage()
    watch(office, '사무실')
    await signIn(office, `office@${DOMAIN}`, process.env.TEST_OFFICE_PW)
    await office.goto(`${BASE}/requests`, { waitUntil: 'networkidle' })
    await office.waitForTimeout(1800)

    const list = await office.locator('body').innerText()
    check(list.includes(content.slice(0, 20)), '병원이 올린 요청이 사무실 목록에 보임')

    const replyBtn = office.locator('button:has-text("회신 남기기")').first()
    check(await replyBtn.count() > 0, '회신 버튼이 있음')
    await replyBtn.click()
    await office.waitForTimeout(800)
    const replyBox = office.locator('textarea').first()
    await replyBox.fill(reply)
    await office.locator('button:has-text("회신 저장")').first().click()
    await office.waitForTimeout(3000)

    const withReply = (await svc(`/client_requests?select=*&id=eq.${requestId}`)).body?.[0]
    check(withReply?.reply === reply, '회신이 DB 에 저장됨', `"${withReply?.reply ?? ''}"`)
    check(!!withReply?.handled_by, '처리한 사람이 자동으로 기록됨',
      withReply?.handled_by ? '기록됨' : '비어 있음')
    check(!!withReply?.handled_at, '처리 시각이 기록됨', withReply?.handled_at?.slice(0, 19) ?? '')

    // ── 3. 병원이 회신을 확인한다 ─────────────────────────────────────────
    section('3. 병원이 회신을 확인')
    await hospital.reload({ waitUntil: 'networkidle' })
    await hospital.waitForTimeout(2000)
    const seen = await hospital.locator('body').innerText()
    check(seen.includes(reply.slice(0, 15)), '병원 화면에 회신이 그대로 보임')
    check(seen.includes(content.slice(0, 12)), '자기가 올린 요청도 함께 보임')

    // 병원은 처리 상태를 스스로 바꿀 수 없어야 합니다
    const tamper = await fetch(`${U}/rest/v1/client_requests?id=eq.${requestId}`, {
      method: 'PATCH',
      headers: {
        apikey: A, 'Content-Type': 'application/json', Prefer: 'return=representation',
        Authorization: `Bearer ${(await fetch(`${U}/auth/v1/token?grant_type=password`, {
          method: 'POST', headers: { apikey: A, 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: `client@${DOMAIN}`, password: process.env.TEST_CLIENT_PW }),
        }).then((r) => r.json())).access_token}`,
      },
      body: JSON.stringify({ status: '처리 완료', reply: '병원이 바꾼 회신' }),
    }).then(json)
    const untouched = (await svc(`/client_requests?select=status,reply&id=eq.${requestId}`)).body?.[0]
    check(untouched?.reply === reply, '병원이 회신을 고칠 수 없음', `(${tamper.status}) "${untouched?.reply}"`)

    // ── 4. 다른 병원에게는 안 보인다 ──────────────────────────────────────
    section('4. 다른 병원 계정에는 보이지 않는가')
    if (process.env.TEST_CLIENT2_PW) {
      const other = await (await browser.newContext(MOBILE)).newPage()
      watch(other, '병원2')
      await signIn(other, `client2@${DOMAIN}`, process.env.TEST_CLIENT2_PW)
      await other.waitForTimeout(1500)
      const otherText = await other.locator('body').innerText()
      check(!otherText.includes(content.slice(0, 20)), '다른 병원 화면에는 그 요청이 없음')
      check(!otherText.includes(reply.slice(0, 15)), '다른 병원 화면에는 그 회신도 없음')
      await other.close()
    } else {
      console.log('  (건너뜀) TEST_CLIENT2_PW 가 없어 교차 확인을 하지 못했습니다')
    }

    // ── 5. 화면 오류 ──────────────────────────────────────────────────────
    section('5. 콘솔 오류')
    const real = errors.filter((e) => !/favicon|jsdelivr|pretendard|Failed to load resource|net::ERR_/.test(e))
    check(real.length === 0, '세 화면 모두 자바스크립트 오류 없음', real.slice(0, 3).join(' | '))
  } finally {
    section('정리')
    if (requestId) await svc(`/client_requests?id=eq.${requestId}`, { method: 'DELETE' })
    const mine = (await svc(`/client_requests?select=id&id=eq.${requestId}`)).body ?? []
    check(mine.length === 0, '검사가 만든 요청을 지움')
    // 다른 검사가 남긴 '[검증]' 요청이 있으면 알려 줍니다 (병원 화면에 그대로 보입니다)
    const stale = (await svc(`/client_requests?select=id&content=like.*${encodeURIComponent(MARK)}*`)).body ?? []
    if (stale.length) console.log(`  참고  다른 검사가 남긴 '[검증]' 요청 ${stale.length}건이 있습니다 (병원 포털에 보입니다)`)
    await browser.close()
  }

  console.log(`\n════ ${pass} PASS / ${fail} FAIL ════`)
  console.log(`포털 실사용 흐름: ${fail === 0 ? 'YES' : 'NO'}`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
