import { chromium, EXEC } from './_pw.mjs'

//  실계정 로그인 E2E — **운영 서버에 실제로 로그인해서** 봅니다.
//
//  ── 왜 이것만 남았나 ───────────────────────────────────────────────────────
//
//   지금까지의 검사는 두 가지였습니다.
//     · 서버   진짜 Postgres 에 진짜 RLS 를 켜고 **역할 토큰**으로
//     · 화면   0063 뒤의 서버처럼 구는 가짜 서버로
//   둘 다 로그인 자체는 안 지나갑니다. Supabase 는 로그인 뒤에 claims 로
//   판단하므로 서버 쪽 결론은 같지만, **로그인이 실제로 되는가**와
//   **그 계정의 역할이 제대로 붙는가**는 이걸로만 확인됩니다.
//
//  ── 비밀번호는 어디에도 안 적습니다 ────────────────────────────────────────
//
//   환경변수로만 받습니다. 코드·픽스처·문서·git 어디에도 남기지 않습니다.
//
//     E2E_FIELD_EMAIL / E2E_FIELD_PW      현장 담당자
//     E2E_CLIENT_EMAIL / E2E_CLIENT_PW    병원 담당자
//     E2E_OFFICE_EMAIL / E2E_OFFICE_PW    사무실(선택)
//
//   예)  E2E_FIELD_EMAIL=... E2E_FIELD_PW=... node check_live_login.mjs
//
//  ── ⚠ 운영 DB 에 **한 줄도 쓰지 않습니다** ─────────────────────────────────
//
//   읽기만 해야 하므로 GET 이 아닌 요청은 **브라우저 단에서 막습니다.**
//   막힌 것이 하나라도 있으면 그것도 결과로 적습니다 — 조용히 넘기면
//   「안 썼다」가 아니라 「못 봤다」가 됩니다.
//   (auth 요청은 로그인·로그아웃이라 통과시킵니다)

const BASE = process.env.E2E_BASE ?? 'http://localhost:4173'
const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  if (!c) process.exitCode = 1
}
const flat = (s) => (s ?? '').replace(/\s+/g, ' ').trim()

const ROLES = [
  { key: 'FIELD', label: '현장', landing: '/today' },
  { key: 'CLIENT', label: '병원', landing: '/portal' },
  { key: 'OFFICE', label: '사무실', landing: '/' },
]
const given = ROLES.filter((r) => process.env[`E2E_${r.key}_EMAIL`] && process.env[`E2E_${r.key}_PW`])

if (given.length === 0) {
  //  ⚠ 「검사 0」을 통과로 세지 않기 위해, 계정이 없으면 **그렇다고 한 줄**
  //    남기고 실패로 두지 않습니다. 회귀 집계에서 조용히 사라지지 않게
  //    적어도 한 건은 찍습니다.
  ok(true, '실계정이 안 주어져 건너뜀 — E2E_FIELD_EMAIL/PW 등을 넣으면 돕니다')
  process.exit(0)
}

const b = await chromium.launch({ executablePath: EXEC })

for (const role of given) {
  const email = process.env[`E2E_${role.key}_EMAIL`]
  const pw = process.env[`E2E_${role.key}_PW`]
  console.log(`── ${role.label} (${email.replace(/(.{2}).*(@.*)/, '$1***$2')}) ──`)

  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const blocked = []
  //  ⚠ 쓰기 차단. 운영 DB 입니다.
  await ctx.route('**/rest/v1/**', (r) => {
    const m = r.request().method()
    if (m === 'GET' || m === 'HEAD') return r.continue()
    //  RPC 중에도 읽기만 하는 것이 있지만, 여기서는 **가리지 않고 전부** 막습니다.
    //  「아마 읽기일 것」이라고 봐주면 그 봐준 것이 운영 자료를 건드립니다.
    blocked.push(`${m} ${r.request().url().split('/rest/v1/')[1]?.split('?')[0]}`)
    return r.abort()
  })

  const p = await ctx.newPage()
  await p.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(1500)

  const hasForm = (await p.locator('#login-email').count()) > 0
  ok(hasForm, `${role.label} — 로그인 화면이 뜸`)
  if (!hasForm) { await ctx.close(); continue }

  await p.fill('#login-email', email)
  await p.fill('#login-password', pw)
  await p.getByRole('button', { name: /로그인/ }).first().click()
  await p.waitForTimeout(4000)

  const path = new URL(p.url()).pathname
  const body = flat(await p.textContent('body'))
  ok(path !== '/login', `${role.label} — **로그인 성공**`, `${path}`)
  ok(!/로그인에 실패|승인을 기다리는|비활성화된 계정/.test(body),
    `${role.label} — 승인·활성 상태 정상`, body.slice(0, 60))
  ok(path === role.landing || path.startsWith(role.landing),
    `${role.label} — 역할에 맞는 첫 화면으로 감`, `${path} (기대 ${role.landing})`)

  if (role.key === 'FIELD') {
    //  ⚠ 돈이 한 글자도 없어야 합니다. 숫자가 앞에 붙은 「원」만 셉니다
    //    (「병원·직원·지원」이 걸리지 않게).
    const amt = body.match(/\d[\d,]*\s*(?:원|만원|억)/)
    ok(!amt, '현장 — 첫 화면에 금액이 없음', amt ? amt[0] : '')
    const wrd = body.match(/단가|매출|미수|청구금액|영업이익|기여이익/)
    ok(!wrd, '현장 — 돈을 부르는 말이 없음', wrd ? wrd[0] : '')
    //  막힌 화면도 실제로 막히는가
    await p.goto(`${BASE}/receivables`, { waitUntil: 'domcontentloaded' })
    await p.waitForTimeout(2500)
    ok(/접근 권한이 없는 화면입니다/.test(flat(await p.textContent('body'))),
      '현장 — 미수금 화면이 실제로 막힘')
  }
  if (role.key === 'CLIENT') {
    ok(/수거 요청/.test(body), '병원 — 첫 화면에 「수거 요청」이 있음')
    ok(/자재·용기 요청/.test(body), '병원 — 「자재·용기 요청」이 있음')
    await p.goto(`${BASE}/clients`, { waitUntil: 'domcontentloaded' })
    await p.waitForTimeout(2500)
    ok(!/거래처 목록/.test(flat(await p.textContent('body'))),
      '병원 — 포털 밖 내부 화면은 안 열림')
  }

  ok(blocked.length === 0,
    `${role.label} — **읽기만 함** (운영 DB 에 한 줄도 안 씀)`, blocked.join(' · '))
  await ctx.close()
}

await b.close()
