import { chromium, EXEC } from './_pw.mjs'

//  화면 → signUp → friendlyError → 안내문 까지 앱 코드 경로를 그대로 지나가게
//  하되, Supabase 응답만 실제로 받아 둔 것으로 바꿔치기합니다.
//  (422 본문은 이 컨테이너에서 실제 운영 Supabase 로 보내 받은 그대로입니다)
const BASE = 'http://localhost:4173'
const SHOT = (process.env.TEST_OUT ?? '/tmp')

const out = []
const ok = (c, m, d = '') => {
  //  바로 찍습니다 — 모아 뒀다가 끝에 한 번에 내보내면 중간에 터졌을 때
  //  앞의 결과까지 전부 사라지고, 회귀 집계에 「검사 0 · 실패 0」으로
  //  남아 통과한 것처럼 보입니다.
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  out.push(c)
  if (!c) process.exitCode = 1
}

const b = await chromium.launch({ executablePath: EXEC })
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } })

const fill = async (p) => {
  await p.fill('#signup-name', '검증직원')
  await p.fill('#signup-email', 'Verify-Signup@Example.com')
  await p.fill('#signup-password', 'verify-pw-1234')
  await p.fill('#signup-password2', 'verify-pw-1234')
}

// ── 1. 로그인 → 가입 신청 동선과 입력 검증 ──────────────────────────────────
{
  const p = await ctx.newPage()
  await p.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  const link = p.getByRole('link', { name: /가입 신청/ })
  ok((await link.count()) > 0, '로그인 화면에 「가입 신청」 링크가 있음')
  await link.first().click()
  await p.waitForURL('**/signup')

  const body = (await p.textContent('body')) ?? ''
  ok(
    !/대표 · 관리자|사무실 담당자|현장 담당자/.test(body),
    '가입 화면에 역할 선택이 없음 (역할은 승인할 때 관리자가 정함)',
  )

  await p.fill('#signup-name', '검증직원')
  await p.fill('#signup-email', 'verify-signup@example.com')
  await p.fill('#signup-password', 'short')
  await p.fill('#signup-password2', 'short')
  ok((await p.locator('text=8자 이상으로 정해 주세요').count()) > 0, '짧은 비밀번호 안내')
  ok(await p.getByRole('button', { name: /가입 신청/ }).isDisabled(), '짧은 비밀번호면 버튼 잠김')

  await p.fill('#signup-password', 'verify-pw-1234')
  await p.fill('#signup-password2', 'verify-pw-9999')
  ok((await p.locator('text=두 비밀번호가 서로 다릅니다').count()) > 0, '비밀번호 불일치 안내')
  ok(await p.getByRole('button', { name: /가입 신청/ }).isDisabled(), '불일치면 버튼 잠김')

  await p.fill('#signup-password2', 'verify-pw-1234')
  ok(!(await p.getByRole('button', { name: /가입 신청/ }).isDisabled()), '올바로 채우면 버튼 열림')
  await p.close()
}

// ── 2. 가입이 아직 꺼져 있을 때 (실제 운영 서버가 지금 돌려주는 응답) ───────
{
  const p = await ctx.newPage()
  await p.route('**/auth/v1/signup*', (route) =>
    route.fulfill({
      status: 422,
      contentType: 'application/json',
      body: '{"code":422,"error_code":"signup_disabled","msg":"Signups not allowed for this instance"}',
    }),
  )
  await p.goto(`${BASE}/signup`, { waitUntil: 'domcontentloaded' })
  await fill(p)
  await p.getByRole('button', { name: /가입 신청/ }).click()
  await p.waitForSelector('text=아직 가입 신청을 받고 있지 않습니다', { timeout: 10000 })
  const body = (await p.textContent('body')) ?? ''
  ok(true, '가입 꺼짐 → 한국어 안내 표시')
  ok(!/Signups not allowed|signup_disabled/.test(body), '영문 오류 원문이 노출되지 않음')
  await p.screenshot({ path: `${SHOT}/signup-disabled.png`, fullPage: true })
  await p.close()
}

// ── 3. 가입이 켜졌을 때 — 접수 화면 ─────────────────────────────────────────
{
  const p = await ctx.newPage()
  let sentBody = null
  let sentUrl = ''
  await p.route('**/auth/v1/signup*', (route) => {
    sentBody = route.request().postDataJSON()
    sentUrl = route.request().url()
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          id: '00000000-0000-0000-0000-0000000000aa',
          aud: 'authenticated',
          email: 'verify-signup@example.com',
          confirmation_sent_at: new Date().toISOString(),
        },
        session: null,
      }),
    })
  })
  await p.goto(`${BASE}/signup`, { waitUntil: 'domcontentloaded' })
  await fill(p)
  await p.getByRole('button', { name: /가입 신청/ }).click()
  await p.waitForSelector('text=가입 신청이 접수되었습니다', { timeout: 10000 })
  ok(true, '가입 성공 → 접수 안내 표시')

  const body = (await p.textContent('body')) ?? ''
  ok(
    /승인 전에는 로그인하셔도 업무 화면이 열리지 않습니다/.test(body),
    '접수 화면이 「승인 전에는 안 열린다」를 분명히 알림',
  )

  //  ── 0041 · 영문 확인 메일 ──────────────────────────────────────────────
  //   실제로 일어난 일: 직원이 신청 → 영문 메일 → 눌렀더니 localhost:3000 →
  //   「사이트에 연결할 수 없음」. 신청한 사람은 자기가 고장 냈다고 생각합니다.
  ok(/누르지 않으셔도 됩니다/.test(body), '영문 확인 메일을 눌러도 안 눌러도 된다고 먼저 알려 줌')
  ok(/Confirm your email address/.test(body), '메일 제목을 그대로 적어 어느 메일인지 알게 함')
  ok(/여기서 하실 일은 끝났습니다/.test(body), '신청자가 더 할 일이 없다고 못 박음')
  ok(!/이메일 인증을 완료해|인증 메일을 확인/.test(body), '「메일을 확인하세요」라고 시키지 않음')

  //  앱이 서버로 무엇을 보냈는가 — 역할을 실어 보내지 않아야 합니다.
  ok(sentBody !== null, '가입 요청이 실제로 나감')
  //  확인 메일이 돌아올 자리 — 이게 없으면 프로젝트 Site URL(기본값
  //  localhost:3000)로 갑니다. 직원 폰에서 열면 반드시 실패합니다.
  const redirect = decodeURIComponent(new URL(sentUrl).searchParams.get('redirect_to') ?? '')
  ok(redirect.startsWith(BASE), '확인 메일이 지금 보고 있는 주소로 돌아오게 함 (localhost 로 안 보냄)', redirect)
  ok(redirect.endsWith('/login'), '돌아오는 자리는 로그인 화면', redirect)
  const data = sentBody?.data ?? {}
  ok(!('role' in data), '가입 요청에 role 이 들어 있지 않음', JSON.stringify(data))
  ok(data.name === '검증직원', '이름만 넘김')
  ok(sentBody?.email === 'verify-signup@example.com', '이메일이 소문자로 정리되어 전송', sentBody?.email)
  await p.screenshot({ path: `${SHOT}/signup-accepted.png`, fullPage: true })
  await p.close()
}

// ── 4. 모바일 폭 ────────────────────────────────────────────────────────────
{
  const p = await ctx.newPage()
  await p.setViewportSize({ width: 390, height: 844 })
  await p.goto(`${BASE}/signup`, { waitUntil: 'domcontentloaded' })
  const over = await p.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  ok(over <= 1, '390px 폭에서 가로 스크롤 없음', `초과 ${over}px`)
  await p.screenshot({ path: `${SHOT}/signup-mobile.png`, fullPage: true })
  await p.close()
}

await b.close()
console.log('')
console.log(`총 ${out.length}건 · 실패 ${out.filter((v) => !v).length}건`)
