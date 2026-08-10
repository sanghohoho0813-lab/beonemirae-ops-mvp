// ─────────────────────────────────────────────────────────────────────────────
// 폰에서 화면이 깨지지 않는가 (실제 브라우저)
//
//  현장 담당자는 이 시스템을 거의 폰으로만 씁니다. 화면이 옆으로 밀리면
//  버튼이 손에 닿지 않고, 잘린 글자는 읽을 수 없습니다. 그런데 이런 것은
//  기능 검사로는 안 잡힙니다 — 저장은 잘 되니까요.
//
//  그리고 이 종류의 사고는 "안내 문구 한 줄 추가" 같은 작은 수정에서
//  가장 잘 납니다. 그래서 화면을 고칠 때마다 걸리도록 남겨 둡니다.
//
//  두 가지를 봅니다
//   1) 페이지가 통째로 옆으로 밀리지 않는가 (documentElement.scrollWidth)
//   2) 가로로 스크롤할 수 없는 자리에 화면 밖으로 나간 요소가 없는가
//
//  표나 칩 줄처럼 '제 스스로 가로 스크롤되는' 것은 밖으로 나가도 정상입니다
//  (손으로 밀어서 볼 수 있으므로). 그래서 조상 중에 가로 스크롤이 되는
//  칸이 있으면 넘어갑니다. 이 구분을 안 하면 정상 표까지 전부 오검출됩니다.
//
//  실행
//    npm run build && npx vite preview --port 4173
//    export SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=...
//    export TEST_FIELD_PW=... TEST_OFFICE_PW=... TEST_CLIENT_PW=...
//    node supabase/test/35_mobile_layout.mjs
//
//  · 아무것도 만들지 않고 아무것도 바꾸지 않습니다 (읽기만 합니다).
// ─────────────────────────────────────────────────────────────────────────────

const U = process.env.SUPABASE_URL
const A = process.env.SUPABASE_ANON_KEY
if (!U || !A) {
  console.error('SUPABASE_URL / SUPABASE_ANON_KEY 가 필요합니다.')
  process.exit(1)
}
const BASE = process.env.BASE || 'http://localhost:4173'
const DOMAIN = process.env.TEST_EMAIL_DOMAIN || 'beonemirae.test'
const PHONE = { width: 390, height: 844 } // 가장 좁은 실제 기기 기준

let pass = 0
let fail = 0
const ok = (t, e = '') => { pass++; console.log(`  PASS  ${t}${e ? '  ' + e : ''}`) }
const no = (t, e = '') => { fail++; console.log(`  FAIL  ${t}${e ? '  ' + e : ''}`) }
const check = (c, t, e = '') => (c ? ok(t, e) : no(t, e))
const section = (t) => console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 52 - t.length))}`)

/** 화면 밖으로 나갔는데 손으로 밀어서 볼 수도 없는 요소를 찾습니다. */
const MEASURE = () => {
  const inScroller = (el) => {
    let n = el.parentElement
    while (n && n !== document.body) {
      const s = getComputedStyle(n)
      if (/auto|scroll/.test(s.overflowX) && n.scrollWidth > n.clientWidth + 1) return true
      n = n.parentElement
    }
    return false
  }
  const stuck = []
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.right > window.innerWidth + 1 && !inScroller(el)) {
      stuck.push(`<${el.tagName}> ${(el.textContent || '').trim().slice(0, 30)}`)
    }
  }
  return {
    width: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    stuck: stuck.slice(0, 3),
    count: stuck.length,
  }
}

async function main() {
  console.log('\n════ 폰에서 화면이 깨지지 않는가 (390px) ════')

  const pw = (await import(process.env.PLAYWRIGHT_MODULE || 'playwright')).default
  const browser = await pw.chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: process.env.CHROMIUM_TLS12 ? ['--ssl-version-max=tls1.2'] : [],
  })
  const errors = []

  const visit = async (who, password, paths, label) => {
    section(label)
    const ctx = await browser.newContext({ viewport: PHONE, isMobile: true, hasTouch: true })
    const page = await ctx.newPage()
    page.on('pageerror', (e) => errors.push(`[${who}] ${e.message}`))
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
    await page.fill('#login-email', `${who}@${DOMAIN}`)
    await page.fill('#login-password', password)
    await Promise.all([
      page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 }),
      page.click('button[type="submit"]'),
    ])
    await page.waitForLoadState('networkidle')

    for (const path of paths) {
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })
      await page.waitForTimeout(2200)
      const m = await page.evaluate(MEASURE)
      check(m.scrollWidth <= m.width + 1, `${path} — 페이지가 옆으로 밀리지 않음`,
        m.scrollWidth > m.width + 1 ? `scrollWidth ${m.scrollWidth} > ${m.width}` : '')
      check(m.count === 0, `${path} — 잘려서 못 보는 요소 없음`,
        m.count ? `${m.count}개: ${m.stuck.join(' / ')}` : '')
    }
    await ctx.close()
  }

  try {
    await visit('field', process.env.TEST_FIELD_PW,
      ['/today', '/collection', '/history', '/requests'], '현장 담당자 (폰)')
    await visit('office', process.env.TEST_OFFICE_PW,
      ['/', '/clients', '/receivables', '/materials', '/requests'], '사무실 담당자 (폰)')
    await visit('client', process.env.TEST_CLIENT_PW,
      ['/portal', '/portal/history', '/portal/report'], '병원 담당자 (폰)')

    section('콘솔 오류')
    const real = errors.filter((e) => !/favicon|jsdelivr|pretendard|Failed to load resource|net::ERR_/.test(e))
    check(real.length === 0, '자바스크립트 오류 없음', real.slice(0, 3).join(' | '))
  } catch (e) {
    no('검사 도중 오류가 났습니다', String(e?.message ?? e).slice(0, 200))
  } finally {
    await browser.close()
    console.log(`\n════ ${pass} PASS / ${fail} FAIL ════`)
    console.log(`폰 화면: ${fail === 0 ? 'YES' : 'NO'}`)
    process.exit(fail === 0 ? 0 : 1)
  }
}

main().catch((e) => {
  console.error('\n실행 오류:', e)
  process.exit(1)
})
