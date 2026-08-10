// ─────────────────────────────────────────────────────────────────────────────
// 거래명세서를 뽑아서 병원에 보낼 수 있는가 (실제 브라우저 · 실제 PDF)
//
//  사무실 담당자가 월말에 하는 일입니다. 거래처 → 월 정산·명세서 →
//  「인쇄 · PDF 저장」. 그 파일을 그대로 병원에 보냅니다.
//
//  화면에서 잘 보이는 것과 종이에 잘 나오는 것은 다릅니다. 실제로 뽑아
//  보니 A4 5장이 나왔고 앞의 3장이 거래처 상세 화면이었습니다. 명세서는
//  4장째부터 시작했습니다. 그대로는 보낼 수 없는 파일입니다.
//  (명세서는 화면 위에 덮여 있을 뿐, 문서 안에서는 여전히 그 화면 '다음'
//   에 있어서 인쇄하면 순서대로 다 찍혔던 것입니다.)
//
//  확인하는 것
//   1) 첫 장이 명세서로 시작하는가
//   2) 뒤에 있던 화면(사이드바·거래처 상세)이 섞여 나오지 않는가
//   3) 내용이 끝난 뒤 빈 종이가 더 나오지 않는가
//   4) 수거대장 미리보기의 인쇄도 같은가
//   5) 닫고 나면 화면이 원래대로 돌아오는가 (인쇄용 표시가 남지 않음)
//
//  실행
//    npm run build && npx vite preview --port 4173
//    export SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=...
//    export TEST_OFFICE_PW=...
//    node supabase/test/36_print_invoice.mjs
//
//  · 아무것도 만들지 않고 아무것도 바꾸지 않습니다 (읽기·인쇄만 합니다).
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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

/** PDF 안의 장수 (/Count) */
const pdfPages = (file) => {
  const m = readFileSync(file).toString('latin1').match(/\/Count (\d+)/)
  return m ? Number(m[1]) : -1
}

/** 인쇄 모드에서 실제로 종이에 나오는 글자만 (숨겨진 조상 아래는 뺍니다) */
const PRINTED = () => {
  const shown = (e) => {
    let n = e
    while (n && n !== document.body) {
      if (getComputedStyle(n).display === 'none') return false
      n = n.parentElement
    }
    return true
  }
  let text = ''
  let bottom = 0
  for (const e of document.querySelectorAll('body *')) {
    if (!shown(e)) continue
    const r = e.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) bottom = Math.max(bottom, r.bottom + window.scrollY)
    if (e.children.length === 0 && e.textContent.trim()) text += e.textContent.trim() + ' | '
  }
  return { text, bottom: Math.round(bottom) }
}

async function main() {
  console.log('\n════ 거래명세서를 뽑아서 병원에 보낼 수 있는가 ════')

  const client = (await fetch(`${U}/rest/v1/clients?select=id,name&active=eq.true&limit=1`, {
    headers: { apikey: S, Authorization: `Bearer ${S}` },
  }).then((r) => r.json()))?.[0]
  if (!client) {
    no('명세서를 뽑을 거래처가 없습니다')
    console.log(`\n════ ${pass} PASS / ${fail} FAIL ════`)
    process.exit(1)
  }
  console.log(`검증 대상 거래처: ${client.name}`)

  const dir = mkdtempSync(join(tmpdir(), 'print-'))
  const pw = (await import(process.env.PLAYWRIGHT_MODULE || 'playwright')).default
  const browser = await pw.chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: process.env.CHROMIUM_TLS12 ? ['--ssl-version-max=tls1.2'] : [],
  })
  //  A4 에서 여백(12mm)을 뺀 크기 — 종이에 실제로 담기는 만큼입니다.
  const PAPER = { width: 703, height: 1032 }
  const ctx = await browser.newContext({ viewport: PAPER })
  const page = await ctx.newPage()

  try {
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
    await page.fill('#login-email', `office@${DOMAIN}`)
    await page.fill('#login-password', process.env.TEST_OFFICE_PW)
    await Promise.all([
      page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 }),
      page.click('button[type="submit"]'),
    ])
    await page.goto(`${BASE}/clients/${client.id}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(2500)

    /** 지금 화면을 인쇄해 보고, 종이에 뭐가 나오는지 돌려줍니다. */
    const printNow = async (tag) => {
      await page.emulateMedia({ media: 'print' })
      await page.waitForTimeout(800)
      const seen = await page.evaluate(PRINTED)
      const file = join(dir, `${tag}.pdf`)
      await page.pdf({ path: file, printBackground: true, preferCSSPageSize: true })
      await page.emulateMedia({ media: 'screen' })
      return { ...seen, pages: pdfPages(file) }
    }

    // ── 1. 거래명세서 ──────────────────────────────────────────────────
    section('1. 거래명세서를 열고 인쇄')
    await page.locator('button', { hasText: '월 정산·명세서' }).first().click()
    await page.waitForTimeout(1800)
    const openBtn = page.locator('button', { hasText: '거래명세서' }).first()
    const canOpen = (await openBtn.count()) > 0 && (await openBtn.isEnabled())
    check(canOpen, '거래명세서를 열 수 있음')
    if (!canOpen) return
    await openBtn.click()
    await page.waitForTimeout(2000)

    const inv = await printNow('invoice')
    const head = inv.text.slice(0, 40)
    check(/거래명세서/.test(head), '첫 장이 명세서로 시작함', head)
    check(!/대시보드|오늘 일정|거래처 목록|운영조건/.test(inv.text),
      '뒤에 있던 화면이 섞여 나오지 않음',
      (inv.text.match(/대시보드|오늘 일정|거래처 목록|운영조건/) ?? [''])[0])
    check(!/인쇄 · PDF 저장/.test(inv.text), '조작 버튼은 인쇄되지 않음')

    //  내용 높이로 계산한 장수와 실제 장수가 같아야 합니다. 크면 빈 종이입니다.
    const need = Math.max(1, Math.ceil(inv.bottom / PAPER.height))
    check(inv.pages === need, '내용이 끝난 뒤 빈 종이가 나오지 않음',
      `실제 ${inv.pages}장 · 내용 기준 ${need}장 (높이 ${inv.bottom})`)

    //  달이 끝나기 전에 뽑는 일이 있습니다. 그때 월말 날짜를 그대로 적으면
    //  아직 오지 않은 날짜가 병원에 가는 문서에 발행일자로 찍힙니다.
    const d = new Date()
    const p2 = (n) => String(n).padStart(2, '0')
    const todayLabel = `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`
    const thisMonth = `${d.getFullYear()}-${p2(d.getMonth() + 1)}`
    const issued = (inv.text.match(/발행일자 : ([^|]+?) \|/) ?? [])[1]?.trim() ?? ''
    const isThisMonth = new RegExp(`${d.getFullYear()}년 ${d.getMonth() + 1}월 거래명세서`).test(inv.text)
    if (isThisMonth) {
      check(issued === todayLabel, '이번 달 명세서의 발행일자가 오늘을 넘지 않음',
        `발행일자 "${issued}" · 오늘 ${todayLabel}`)
    } else {
      ok('지난 달 명세서라 발행일자는 월말 그대로', issued)
    }
    void thisMonth

    // ── 2. 닫으면 화면이 원래대로 ──────────────────────────────────────
    section('2. 닫은 뒤')
    await page.locator('button[aria-label="닫기"]').first().click()
    await page.waitForTimeout(1200)
    const left = await page.evaluate(() =>
      document.querySelectorAll('.print-drop, .print-keep').length)
    check(left === 0, '인쇄용 표시가 화면에 남지 않음', left ? `${left}개 남음` : '')

    const after = await printNow('after')
    check(/대시보드|거래처 목록|운영조건/.test(after.text),
      '명세서를 닫으면 일반 화면은 정상적으로 인쇄됨')

    // ── 3. 수거대장 미리보기 ───────────────────────────────────────────
    section('3. 수거대장 미리보기 인쇄')
    const logBtn = page.locator('button', { hasText: '수거대장' }).first()
    if ((await logBtn.count()) === 0) {
      no('수거대장 보기 버튼을 찾지 못했습니다')
    } else {
      await logBtn.click()
      await page.waitForTimeout(2000)
      const log = await printNow('log')
      check(/수거대장/.test(log.text.slice(0, 40)), '첫 장이 수거대장으로 시작함', log.text.slice(0, 30))
      check(!/대시보드|거래처 목록|운영조건/.test(log.text), '뒤에 있던 화면이 섞여 나오지 않음')
      const needLog = Math.max(1, Math.ceil(log.bottom / PAPER.height))
      check(log.pages === needLog, '내용이 끝난 뒤 빈 종이가 나오지 않음',
        `실제 ${log.pages}장 · 내용 기준 ${needLog}장`)
    }
    // ── 4. 폰에서 뒤로 가기 ────────────────────────────────────────────
    //  폰에서 명세서를 열고 뒤로 가기를 하면 명세서만 닫혀야 합니다.
    //  거래처 화면까지 통째로 벗어나면 보던 자리를 다시 찾아 들어가야 합니다.
    section('4. 폰에서 뒤로 가기')
    const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    const mp = await mob.newPage()
    await mp.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
    await mp.fill('#login-email', `office@${DOMAIN}`)
    await mp.fill('#login-password', process.env.TEST_OFFICE_PW)
    await Promise.all([
      mp.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 }),
      mp.click('button[type="submit"]'),
    ])
    await mp.goto(`${BASE}/clients/${client.id}`, { waitUntil: 'networkidle' })
    await mp.waitForTimeout(2500)
    await mp.locator('button', { hasText: '월 정산·명세서' }).first().click()
    await mp.waitForTimeout(1800)
    const mOpen = mp.locator('button', { hasText: '거래명세서' }).first()
    if ((await mOpen.count()) > 0 && (await mOpen.isEnabled())) {
      await mOpen.click()
      await mp.waitForTimeout(2000)
      check(await mp.locator('button[aria-label="닫기"]').count() > 0, '폰에서 명세서가 열림')
      await mp.goBack()
      await mp.waitForTimeout(1800)
      const stillHere = new URL(mp.url()).pathname
      const closed = (await mp.locator('button[aria-label="닫기"]').count()) === 0
      check(closed, '뒤로 가기로 명세서만 닫힘')
      check(stillHere.includes(client.id), '거래처 화면에 그대로 남아 있음', stillHere)
    } else {
      no('폰에서 명세서를 열 수 없었습니다')
    }
    await mob.close()
  } catch (e) {
    no('검사 도중 오류가 났습니다', String(e?.message ?? e).slice(0, 200))
  } finally {
    await browser.close()
    rmSync(dir, { recursive: true, force: true })
    console.log(`\n════ ${pass} PASS / ${fail} FAIL ════`)
    console.log(`명세서 인쇄: ${fail === 0 ? 'YES' : 'NO'}`)
    process.exit(fail === 0 ? 0 : 1)
  }
}

main().catch((e) => {
  console.error('\n실행 오류:', e)
  process.exit(1)
})
