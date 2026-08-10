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
//  글자 크기 세 가지를 모두 봅니다 (설정 > 글자 크기: 기본 / 크게 / 매우 크게).
//  폰의 기본값이 이미 '크게' 이고, 눈이 불편하신 분은 '매우 크게' 를 씁니다.
//  글자가 커지면 칸은 그대로인데 글씨만 커지므로, 기본 크기에서는 멀쩡하던
//  화면이 밀려 나갑니다. 실제로 '매우 크게' 의 수거 입력 화면에서 카드가
//  404px 까지 뻗어 오른쪽 14px 가 잘렸고, 그 자리는 스크롤도 되지 않아
//  손으로 밀어 볼 수도 없었습니다. 그래서 세 크기를 모두 확인합니다.
//
//  실행
//    npm run build && npx vite preview --port 4173
//    export SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=...
//    export TEST_FIELD_PW=... TEST_OFFICE_PW=... TEST_CLIENT_PW=...
//    node supabase/test/35_mobile_layout.mjs
//
//  · 아무것도 만들지 않습니다. 검사 계정의 '글자 크기' 값만 잠시 바꿨다가
//    끝나면 원래 값으로 되돌립니다(되돌린 것까지 확인합니다).
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
const PHONE = { width: 390, height: 844 } // 가장 좁은 실제 기기 기준

//  글자 크기는 계정(profiles.font_scale)에 저장되고, 로그인하면 그 값이
//  기기 설정보다 우선합니다. 그래서 브라우저 쪽만 바꿔 놓으면 로그인 직후
//  계정 값으로 되돌아가 세 번 다 같은 크기로 재게 됩니다(실제로 그랬습니다).
//  그래서 계정 값을 바꾸고 재 뒤, 끝나면 원래 값으로 되돌립니다.
const SCALES = [
  { db: 'normal', label: '기본' },
  { db: 'lg', label: '크게' },
  { db: 'xl', label: '매우 크게' },
]

const json = async (r) => {
  const t = await r.text()
  try { return t ? JSON.parse(t) : null } catch { return t }
}
const svc = (path, init = {}) =>
  fetch(`${U}/rest/v1${path}`, {
    ...init,
    headers: { apikey: S, Authorization: `Bearer ${S}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  }).then(json)

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
    // 글자 크기가 정말 바뀐 채로 쟀는지 확인하려고 같이 가져옵니다.
    // 이게 없으면 세 번 다 '기본' 으로 재고서 통과했다고 착각할 수 있습니다.
    htmlClass: document.documentElement.className,
    fontSize: getComputedStyle(document.documentElement).fontSize,
  }
}

async function main() {
  console.log('\n════ 폰에서 화면이 깨지지 않는가 (390px · 글자 크기 3가지) ════')

  const pw = (await import(process.env.PLAYWRIGHT_MODULE || 'playwright')).default
  const browser = await pw.chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: process.env.CHROMIUM_TLS12 ? ['--ssl-version-max=tls1.2'] : [],
  })
  const errors = []

  const visit = async (who, password, paths, label) => {
    section(label)
    const email = `${who}@${DOMAIN}`
    const me = (await svc(`/profiles?select=id,font_scale&email=eq.${encodeURIComponent(email)}`))?.[0]
    const restore = me?.font_scale ?? 'normal'
    const setScale = async (v) => {
      if (me) await svc(`/profiles?id=eq.${me.id}`, { method: 'PATCH', body: JSON.stringify({ font_scale: v }) })
    }

    const ctx = await browser.newContext({ viewport: PHONE, isMobile: true, hasTouch: true })
    const page = await ctx.newPage()
    page.on('pageerror', (e) => errors.push(`[${who}] ${e.message}`))

    const seen = new Set()
    try {
      for (const scale of SCALES) {
        await setScale(scale.db)
        //  계정 값이 바뀌었으니 새로 로그인해서 그 값으로 들어옵니다.
        await ctx.clearCookies()
        await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
        await page.evaluate(() => localStorage.clear())
        await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
        await page.fill('#login-email', email)
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
          seen.add(m.fontSize)
          const at = `[${scale.label}] ${path}`
          check(m.scrollWidth <= m.width + 1, `${at} — 페이지가 옆으로 밀리지 않음`,
            m.scrollWidth > m.width + 1 ? `scrollWidth ${m.scrollWidth} > ${m.width}` : '')
          check(m.count === 0, `${at} — 잘려서 못 보는 요소 없음`,
            m.count ? `${m.count}개: ${m.stuck.join(' / ')}` : '')
        }
      }
      //  세 크기가 정말 서로 달랐는지 (= 검사가 헛돌지 않았는지) 확인합니다.
      //  이게 없으면 세 번 다 같은 크기로 재고서 통과했다고 착각합니다.
      check(seen.size === SCALES.length, `${label} — 글자 크기 ${SCALES.length}가지가 실제로 다르게 적용됨`,
        [...seen].join(' / '))
    } finally {
      await setScale(restore)
      const back = (await svc(`/profiles?select=font_scale&email=eq.${encodeURIComponent(email)}`))?.[0]
      check(!me || back?.font_scale === restore, `${label} — 글자 크기를 검사 전 값으로 되돌림`, `${back?.font_scale ?? '-'}`)
      await ctx.close()
    }
  }

  try {
    await visit('field', process.env.TEST_FIELD_PW,
      ['/today', '/collection', '/history', '/requests'], '현장 담당자 (폰)')
    //  '/settlement' 을 넣어 뒀었는데 그런 주소는 없습니다. 없는 주소는
    //  대시보드로 떨어지므로, 정산 화면을 본다고 적어 놓고 실제로는 대시보드를
    //  한 번 더 재고 있었습니다. 월 정산은 거래처 상세의 탭이라 아래에서 따로
    //  열어 봅니다.
    await visit('office', process.env.TEST_OFFICE_PW,
      ['/', '/clients', '/receivables', '/materials', '/requests'], '사무실 담당자 (폰)')
    await visit('client', process.env.TEST_CLIENT_PW,
      ['/portal', '/portal/history', '/portal/report'], '병원 담당자 (폰)')

    // ── 월 정산·명세서 탭 (거래처 상세 안에 있습니다) ──────────────────
    //  월말에 돈을 확인하는 화면입니다. 금액이 길어서 좁은 폰에서 가장 잘
    //  깨지는 자리이기도 합니다.
    section('월 정산·명세서 탭 (폰)')
    {
      const first = (await svc('/clients?select=id,name&active=eq.true&limit=1'))?.[0]
      if (!first) {
        no('정산 탭을 열어 볼 거래처가 없습니다')
      } else {
        const ctx = await browser.newContext({ viewport: PHONE, isMobile: true, hasTouch: true })
        const page = await ctx.newPage()
        page.on('pageerror', (e) => errors.push(`[정산탭] ${e.message}`))
        await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
        await page.fill('#login-email', `office@${DOMAIN}`)
        await page.fill('#login-password', process.env.TEST_OFFICE_PW)
        await Promise.all([
          page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 }),
          page.click('button[type="submit"]'),
        ])
        for (const scale of SCALES) {
          await svc(`/profiles?email=eq.${encodeURIComponent(`office@${DOMAIN}`)}`, {
            method: 'PATCH', body: JSON.stringify({ font_scale: scale.db }),
          })
          await page.goto(`${BASE}/clients/${first.id}`, { waitUntil: 'networkidle' })
          await page.waitForTimeout(2000)
          const tab = page.locator('button', { hasText: '월 정산·명세서' }).first()
          if ((await tab.count()) === 0) { no(`[${scale.label}] 월 정산 탭을 찾지 못함`); continue }
          await tab.click()
          await page.waitForTimeout(2500)
          const m = await page.evaluate(MEASURE)
          check(m.scrollWidth <= m.width + 1, `[${scale.label}] 월 정산 탭 — 페이지가 옆으로 밀리지 않음`,
            m.scrollWidth > m.width + 1 ? `scrollWidth ${m.scrollWidth} > ${m.width}` : '')
          check(m.count === 0, `[${scale.label}] 월 정산 탭 — 잘려서 못 보는 요소 없음`,
            m.count ? `${m.count}개: ${m.stuck.join(' / ')}` : '')
        }
        await svc(`/profiles?email=eq.${encodeURIComponent(`office@${DOMAIN}`)}`, {
          method: 'PATCH', body: JSON.stringify({ font_scale: 'normal' }),
        })
        await ctx.close()
      }
    }

    // ── 폰에서 글자 크기를 바꿀 수 있는가 ────────────────────────────────
    //  글자 크기를 바꾸는 곳이 설정 화면 한 군데뿐이었는데 그 화면은 관리자
    //  전용이라, 폰으로만 일하는 현장 담당자는 글자를 키울 방법이 없었습니다.
    //  게다가 더보기의 '설정' 카드는 모두에게 보여서 누르면 권한 없음 화면만
    //  떴습니다. 다시 그렇게 되지 않도록 확인합니다.
    section('폰에서 글자 크기를 바꿀 수 있는가')
    for (const [who, password] of [['field', process.env.TEST_FIELD_PW], ['office', process.env.TEST_OFFICE_PW]]) {
      const ctx = await browser.newContext({ viewport: PHONE, isMobile: true, hasTouch: true })
      const page = await ctx.newPage()
      await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
      await page.fill('#login-email', `${who}@${DOMAIN}`)
      await page.fill('#login-password', password)
      await Promise.all([
        page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 }),
        page.click('button[type="submit"]'),
      ])
      await page.waitForTimeout(1500)
      await page.locator('button', { hasText: '더보기' }).last().click()
      await page.waitForTimeout(1200)

      const deadEnd = await page.evaluate(() =>
        [...document.querySelectorAll('p')].some((e) => e.textContent.trim() === '설정'))
      check(!deadEnd, `${who} — 열리지 않는 '설정' 카드가 더보기에 없음`)

      const before = await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)
      const bigger = page.locator('button[aria-pressed]', { hasText: '매우 크게' }).first()
      const found = (await bigger.count()) > 0
      check(found, `${who} — 더보기에서 글자 크기를 바꿀 수 있음`)
      if (found) {
        await bigger.click()
        await page.waitForTimeout(1200)
        const after = await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)
        check(parseFloat(after) > parseFloat(before), `${who} — 누르면 글자가 실제로 커짐`, `${before} → ${after}`)
        //  검사 전 크기로 되돌립니다.
        await page.locator('button[aria-pressed]', { hasText: '기본' }).first().click()
        await page.waitForTimeout(1000)
      }
      await ctx.close()
    }

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
