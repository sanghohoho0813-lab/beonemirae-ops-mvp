// ─────────────────────────────────────────────────────────────────────────────
// 청구 화면이 실제로 눌리는가 (실제 브라우저 · 시연 모드 · DB 없이)
//
//  40번은 실제 DB 로 청구 확정을 끝까지 따라갑니다. 다만 0017 migration 이
//  적용되어야 돌아갑니다. 그때까지 화면 쪽이 검증 없이 남아 있으면, 나중에
//  SQL 을 적용하고 나서야 "버튼이 안 눌린다" 를 알게 됩니다.
//
//  이 앱에는 서버 없이 도는 시연 모드가 있습니다(Supabase 미설정 빌드).
//  청구 확정·취소는 시연 모드에서도 같은 코드 경로를 타므로, 화면 쪽은
//  지금 확인할 수 있습니다 — 버튼이 열리고 잠기는지, 확인 창이 무엇을
//  묻는지, 목록에 어떻게 쌓이는지, 취소가 어떻게 남는지.
//
//  확인하는 것
//   1) 정산 화면에 청구 카드가 있고, 청구할 것이 있으면 버튼이 열린다
//   2) 확정 전에 무슨 일이 일어나는지 묻는다
//   3) 확정하면 목록에 쌓이고 「이미 청구한 금액」이 그만큼 늘어난다
//   4) 같은 달을 또 확정하려 하면 버튼이 잠기고 이유가 적힌다
//   5) 취소하면 사유를 묻고, 목록에서 「취소」로 남으며, 다시 청구할 수 있다
//
//  실행
//    VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npx vite build --outDir dist-demo
//    npx vite preview --outDir dist-demo --port 4174
//    node supabase/test/42_billing_ui_demo.mjs
//
//  · 서버도 DB 도 쓰지 않습니다. 브라우저 안에서만 돕니다.
// ─────────────────────────────────────────────────────────────────────────────

const BASE = process.env.DEMO_BASE || 'http://localhost:4174'

let pass = 0
let fail = 0
const ok = (t, e = '') => { pass++; console.log(`  PASS  ${t}${e ? '  ' + e : ''}`) }
const no = (t, e = '') => { fail++; console.log(`  FAIL  ${t}${e ? '  ' + e : ''}`) }
const check = (c, t, e = '') => (c ? ok(t, e) : no(t, e))
const section = (t) => console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 52 - t.length))}`)

/** 화면 글에서 '이미 청구한 금액' / '아직 청구하지 않은 금액' 을 읽습니다 */
const READ_CARD = () => {
  const lines = document.body.innerText.split('\n').map((l) => l.trim())
  const num = (label) => {
    const i = lines.findIndex((l) => l === label)
    if (i < 0) return null
    for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
      const m = lines[j].match(/^([\d,]+)원$/)
      if (m) return Number(m[1].replace(/,/g, ''))
    }
    return null
  }
  return {
    billed: num('이미 청구한 금액'),
    pending: num('아직 청구하지 않은 금액'),
    text: document.body.innerText,
  }
}

async function main() {
  console.log('\n════ 청구 화면이 실제로 눌리는가 (시연 모드) ════')

  const pw = (await import(process.env.PLAYWRIGHT_MODULE || 'playwright')).default
  const browser = await pw.chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: process.env.CHROMIUM_TLS12 ? ['--ssl-version-max=tls1.2'] : [],
  })
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))

  try {
    // ── 0. 시연 모드로 거래처 상세까지 ────────────────────────────────────
    section('0. 시연 모드 · 거래처 상세 열기')
    await page.goto(`${BASE}/clients`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(2500)
    const listText = await page.locator('body').innerText()
    check(!/로그인/.test(listText.slice(0, 200)), '로그인 없이 시연 모드로 열림')

    //  첫 거래처로 들어갑니다. 사이드바 설명글("병원별 이력 · 메모 · 추천")도
    //  '병원' 으로 끝나서 그대로 집으면 엉뚱한 것을 누릅니다 — 거래처 이름만
    //  골라내야 합니다.
    const firstName = await page.evaluate(() => {
      for (const el of document.querySelectorAll('p,h2,h3,span')) {
        const t = (el.textContent || '').trim()
        if (/(병원|의원|요양원|치과|한의원)$/.test(t) && t.length > 3 && t.length < 25) return t
      }
      return ''
    })
    check(!!firstName, '시연 거래처가 있음', firstName)
    await page.locator(`text="${firstName}"`).first().click()
    await page.waitForTimeout(2500)
    check(/거래처 목록/.test(await page.locator('body').innerText()), '거래처 상세로 이동함')

    const tab = page.locator('button', { hasText: '월 정산·명세서' }).first()
    await tab.waitFor({ state: 'attached', timeout: 20000 })
    await tab.click()
    await page.waitForTimeout(2500)

    // ── 1. 청구 카드 ──────────────────────────────────────────────────────
    section('1. 정산 화면의 청구 카드')
    let card = await page.evaluate(READ_CARD)
    check(card.billed !== null && card.pending !== null,
      '「이미 청구한 금액」과 「아직 청구하지 않은 금액」이 보임',
      `${card.billed}원 / ${card.pending}원`)
    const startPending = card.pending
    const btn = page.locator('button', { hasText: '청구 확정' }).first()
    check((await btn.count()) > 0, '「청구 확정」 버튼이 있음')

    if (startPending === 0) {
      //  이 달에 청구할 것이 없는 시연 데이터면 여기까지만 봅니다.
      check(!(await btn.isEnabled()), '청구할 것이 없으면 버튼이 잠김')
      ok('이 달에는 확정할 것이 없어 이후 단계는 넘어갑니다', `${startPending}원`)
      return
    }
    check(await btn.isEnabled(), '청구할 것이 있으면 버튼이 열림', `${startPending.toLocaleString('ko-KR')}원`)
    //  시연 데이터에는 이 기능 이전에 만들어진 청구(스냅샷 없음)가 이미
    //  들어 있습니다. 0 에서 시작한다고 가정하면 안 됩니다 — 시작값을
    //  적어 두고 그만큼 늘고 주는지를 봅니다.
    const startBilled = card.billed
    const startBills = await page.locator('button', { hasText: '취소' }).count()
    check(/이 기능 이전에 만들어진 청구/.test(card.text),
      '스냅샷 없는 옛 청구가 섞여 있으면 그 사실을 알려 줌', `${startBilled.toLocaleString('ko-KR')}원`)

    // ── 2. 확정 ───────────────────────────────────────────────────────────
    section('2. 청구 확정')
    let asked = ''
    page.once('dialog', (d) => { asked = d.message(); d.accept() })
    await btn.click()
    await page.waitForTimeout(2500)
    check(/고정됩니다/.test(asked), '확정 전에 무슨 일이 일어나는지 묻는다',
      asked.replace(/\n/g, ' ').slice(0, 70))
    check(asked.includes(String(startPending.toLocaleString('ko-KR'))),
      '묻는 창에 확정할 금액이 적혀 있다')

    card = await page.evaluate(READ_CARD)
    check(card.billed === startBilled + startPending, '「이미 청구한 금액」이 확정한 만큼 늘어남',
      `${startBilled.toLocaleString('ko-KR')}원 → ${card.billed?.toLocaleString('ko-KR')}원`)
    check(card.pending === 0, '「아직 청구하지 않은 금액」이 0원이 됨')
    check(/확정했습니다/.test(card.text), '확정했다고 알려 준다')
    //  '정기' 라는 낱말은 화면 다른 곳에도 나옵니다('정기 외' 등). 그래서
    //  글 전체에서 찾으면 엉뚱하게 통과합니다 — 물어본 종류와 목록에 쌓인
    //  종류가 같은지를 봅니다. (시연 데이터에 이미 청구가 있으면 「추가」)
    const askedKind = /추가 청구/.test(asked) ? '추가' : '정기'
    const lastRowKind = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('li')].filter((li) => /원$/.test(li.innerText.split('\n')[1] ?? ''))
      const last = rows[rows.length - 1]
      return last ? last.innerText.split('\n')[0].trim() : ''
    })
    check(lastRowKind === askedKind, `목록에 「${askedKind}」 청구로 쌓임`,
      `물어본 종류 ${askedKind} · 목록 ${lastRowKind || '없음'}`)

    // ── 2-1. 그 청구의 명세서 ─────────────────────────────────────────────
    //  청구가 여러 건이면(정기 + 추가) 명세서도 건마다 따로 나갑니다.
    //  위쪽 「거래명세서」 버튼 하나로는 마지막 것만 열리므로, 줄마다 그
    //  청구의 명세서를 열 수 있어야 합니다.
    section('2-1. 방금 확정한 청구의 명세서')
    const invBtns = page.locator('button', { hasText: '명세서' })
    const perBill = page.locator('li button', { hasText: '명세서' })
    check((await perBill.count()) >= 1, '청구 줄에 「명세서」 버튼이 있음',
      `${await perBill.count()}개 / 전체 ${await invBtns.count()}개`)
    if ((await perBill.count()) >= 1) {
      await perBill.last().click()
      await page.waitForTimeout(2000)
      const invText = await page.locator('body').innerText()
      check(/거래명세서/.test(invText), '명세서가 열림')
      check(invText.includes(startPending.toLocaleString('ko-KR')),
        '확정한 금액 그대로 열림', `${startPending.toLocaleString('ko-KR')}원`)
      const close = page.locator('button[aria-label="닫기"]').first()
      if (await close.count()) { await close.click(); await page.waitForTimeout(1200) }
    }

    // ── 3. 중복 차단 ──────────────────────────────────────────────────────
    section('3. 같은 달을 또 확정하려 할 때')
    card = await page.evaluate(READ_CARD)
    const btn2 = page.locator('button', { hasText: '청구 확정' }).first()
    check(!(await btn2.isEnabled()), '버튼이 잠김')
    check(/청구를 마쳤습니다/.test(card.text), '이미 청구했다고 적혀 있음')

    // ── 4. 취소 ───────────────────────────────────────────────────────────
    section('4. 잘못 만든 청구를 취소')
    //  방금 만든 청구를 취소합니다 — 목록의 마지막 줄입니다. 첫 줄을 누르면
    //  시연 데이터에 원래 있던 옛 청구를 취소하게 됩니다.
    const cancelAll = page.locator('button', { hasText: '취소' })
    check((await cancelAll.count()) === startBills + 1, '방금 만든 청구가 목록에 한 줄 늘어남',
      `${startBills} → ${await cancelAll.count()}`)
    const cancelBtn = cancelAll.last()
    let prompted = ''
    page.once('dialog', (d) => { prompted = d.message(); d.accept('검증용 취소') })
    await cancelBtn.click()
    await page.waitForTimeout(2500)
    check(/사유/.test(prompted), '취소 사유를 묻는다', prompted.replace(/\n/g, ' ').slice(0, 60))
    check(/지우지 않고/.test(prompted), '지우는 게 아니라 취소로 남는다고 알려 준다')

    card = await page.evaluate(READ_CARD)
    check(card.billed === startBilled, '취소한 금액이 청구액에서 빠짐',
      `${(startBilled + startPending).toLocaleString('ko-KR')}원 → ${card.billed?.toLocaleString('ko-KR')}원`)
    check(card.pending === startPending, '취소한 만큼 다시 청구할 수 있게 됨',
      `${card.pending?.toLocaleString('ko-KR')}원`)
    const btn3 = page.locator('button', { hasText: '청구 확정' }).first()
    check(await btn3.isEnabled(), '취소 후에는 버튼이 다시 열림')

    // ── 5. 화면 오류 ──────────────────────────────────────────────────────
    section('5. 콘솔 오류')
    const real = errors.filter((e) => !/favicon|jsdelivr|pretendard|Failed to load resource|net::ERR_/.test(e))
    check(real.length === 0, '자바스크립트 오류 없음', real.slice(0, 3).join(' | '))
  } catch (e) {
    no('검사 도중 오류가 났습니다', String(e?.message ?? e).slice(0, 200))
  } finally {
    await browser.close()
    console.log(`\n════ ${pass} PASS / ${fail} FAIL ════`)
    console.log(`청구 화면 동작: ${fail === 0 ? 'YES' : 'NO'}`)
    process.exit(fail === 0 ? 0 : 1)
  }
}

main().catch((e) => {
  console.error('\n실행 오류:', e)
  process.exit(1)
})
