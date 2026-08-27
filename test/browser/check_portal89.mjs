import { chromium, EXEC } from './_pw.mjs'
import * as W from './walk_lib.mjs'
import * as F from './perf_fixtures.mjs'

//  0089 — 「돌아다니는 화면」에서 「한 자리에서 끝나는 화면」으로
//
//   대표님: 「페이지 이동형 고객 포털 → 홈 화면에서 대부분의 업무가 끝나는
//   작업형 Customer Platform 으로 전환한다」 ·
//   「사용자가 가능한 한 글자를 직접 입력하지 않고, 선택 → 선택 →
//   수량/일정 선택 → 완료 만으로 대부분의 업무를 끝낼 수 있도록 한다」
//
//   ⚠ 이 파일이 지키는 것 —
//     ① 카드를 눌러도 **화면이 안 바뀐다** (경로 그대로, 창만 뜬다)
//     ② 창 안에서 **글자를 안 적고도** 보낼 수 있다
//     ③ 보내면 창이 닫히고 **첫 화면이 바로 갱신된다**
//     ④ 안 되는 단추·지어낸 숫자가 없다

const ok = (c, m, d = '') => { console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`); if (!c) process.exitCode = 1 }
const flat = (t) => (t ?? '').replace(/\s+/g, ' ').trim()
const b = await chromium.launch({ executablePath: EXEC })

const T = F.clients[3]
const HOME = `/portal/c/${T.id}`

async function open(path, role, w = 1440, extra = {}) {
  const state = {
    profile: { ...W.profileFor(role), font_scale: 'normal' },
    reqs: 0, writes: [], schemaVersion: 87, ...extra,
  }
  const ctx = await b.newContext({ viewport: { width: w, height: w < 700 ? 844 : 950 }, isMobile: w < 700, hasTouch: w < 700 })
  W.wire(ctx, state)
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: F.UID, aud: 'authenticated', email: 'x@b.c', app_metadata: {}, user_metadata: {} }])
  await p.goto(`${W.BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await W.settle(p, state); await p.waitForTimeout(800)
  return { ctx, p, state }
}

// ── ① 위 메뉴가 줄었다 ────────────────────────────────────────────────────
{
  const { ctx, p } = await open(HOME, 'admin')
  const nav = (await p.locator('header nav a').allInnerTexts()).map(flat)
  //  ⚠ 대표님: 「상단 메뉴 최소화」. 여섯이면 병원 담당자는 어디를 눌러야
  //    할지 고르는 데 시간을 씁니다.
  ok(nav.length <= 3, `위 메뉴가 세 개 이하다 (${nav.length}개)`, nav.join(' | '))
  ok(nav[0].includes('홈'), '첫 메뉴는 홈이다', nav[0])

  //  ⚠ 자주 쓰는 일은 **메뉴가 아니라 카드**입니다.
  const joined = nav.join(' ')
  for (const gone of ['필요한 물품', '월간 리포트', '정산 내역']) {
    ok(!joined.includes(gone), `「${gone}」은 위 메뉴에 없다 (카드에서 창으로 엽니다)`)
  }
  await ctx.close()
}

// ── ② 여덟 칸이 있고, 색이 서로 다르다 ────────────────────────────────────
{
  const { ctx, p } = await open(HOME, 'admin')
  const cards = p.locator('[data-portal-action]')
  ok((await cards.count()) === 8, `주요 카드가 여덟 장이다 (${await cards.count()}장)`)

  //  ⚠ 대표님: 「모든 카드가 거의 같은 흰색 카드로 보여 지나치게 단조로운
  //    느낌이 들지 않도록 개선한다」 — 다만 「카드 전체를 강한 색으로
  //    칠하지 않는다」.
  const tones = await p.locator('[data-card-tone]').evaluateAll((els) => els.map((e) => e.dataset.cardTone))
  ok(new Set(tones).size === 8, `여덟 장의 색이 서로 다르다 (${new Set(tones).size}가지)`, tones.join(','))

  //  ⚠ 카드 바탕은 여전히 흰색이어야 합니다 — 색은 아이콘 자리와 위 선에만.
  const bg = await cards.first().evaluate((el) => getComputedStyle(el).backgroundColor)
  const m = bg.match(/\d+/g).map(Number)
  ok(m[0] > 240 && m[1] > 240 && m[2] > 240, '카드 바탕은 그대로 흰색이다 (색을 칠하지 않았다)', bg)
  await ctx.close()
}

// ── ③ 카드를 눌러도 **화면이 안 바뀐다** (브리프 25 · 35) ──────────────────
{
  const { ctx, p } = await open(HOME, 'admin')
  for (const [label, sheet] of [
    ['수거 요청', 'pickup'], ['긴급 수거 요청', 'urgent'],
    ['용기 · 봉투 주문', 'supply'], ['상담 · 문의', 'ask'],
  ]) {
    await p.locator(`[data-portal-action="${label}"]`).click(); await p.waitForTimeout(600)
    ok(new URL(p.url()).pathname === HOME, `${label} — 경로가 그대로다`, new URL(p.url()).pathname)
    ok((await p.locator(`[data-portal-sheet="${sheet}"]`).count()) === 1, `${label} — 창이 뜬다`)
    //  ⚠ 뒤 화면을 어둡게 — 지금 하는 일에 집중하도록
    ok((await p.locator('[data-sheet-dim]').count()) === 1, `${label} — 뒤가 어두워진다`)
    await p.keyboard.press('Escape'); await p.waitForTimeout(900)
    ok((await p.locator('[data-portal-sheet]').count()) === 0, `${label} — Esc 로 닫힌다`)
  }
  await ctx.close()
}

// ── ④ 새로고침해도 창이 살아 있다 (브리프 29) ─────────────────────────────
{
  const { ctx, p, state } = await open(`${HOME}?do=pickup`, 'admin')
  ok((await p.locator('[data-portal-sheet="pickup"]').count()) === 1, '**주소로 바로 그 창이 열린다**')
  await p.reload({ waitUntil: 'domcontentloaded' })
  await W.settle(p, state); await p.waitForTimeout(1000)
  ok((await p.locator('[data-portal-sheet="pickup"]').count()) === 1, '**새로고침해도 창이 남아 있다**')
  ok(flat(await p.locator('[data-preview-name]').innerText()) === T.name, '병원도 그대로', T.name)
  await ctx.close()
}

// ── ⑤ **글자를 안 적고도** 요청이 나간다 (브리프 10 · 35) ──────────────────
{
  const { ctx, p, state } = await open(HOME, 'admin')
  await p.locator('[data-portal-cta="collect"]').click(); await p.waitForTimeout(600)

  const steps = await p.locator('[data-sheet-step]').count()
  ok(steps >= 4, `고르는 단계가 나뉘어 있다 (${steps}단계)`)

  //  ⚠ 처음에는 못 보냅니다 — 아무것도 안 고르셨으니까요.
  ok(await p.locator('[data-req-send]').isDisabled(), '아무것도 안 고르면 못 보낸다')

  //  고르기만 합니다. 자판을 한 번도 안 씁니다.
  await p.locator('[data-choice="reason"] [data-choice-item]').first().click(); await p.waitForTimeout(150)
  await p.locator('[data-choice="day"] [data-choice-item]').nth(1).click(); await p.waitForTimeout(150)
  const wc = await p.locator('[data-choice="waste"] [data-choice-item]').count()
  if (wc > 0) { await p.locator('[data-choice="waste"] [data-choice-item]').first().click(); await p.waitForTimeout(150) }
  await p.locator('[data-choice="amount"] [data-choice-item]').nth(1).click(); await p.waitForTimeout(150)

  ok(!(await p.locator('[data-req-send]').isDisabled()), '**고르기만 해도 보낼 수 있다**')
  //  ⚠ 무엇이 나가는지 단추 옆에 적혀 있어야 합니다.
  const sum = flat(await p.locator('[data-req-summary]').innerText())
  ok(sum.length > 4 && !sum.includes('하나만'), '무엇이 보내지는지 적혀 있다', sum)

  const bodies = []
  p.on('request', (r) => {
    if (r.method() === 'POST' && r.url().includes('client_requests')) bodies.push(r.postData() ?? '')
  })
  await p.locator('[data-req-send]').click(); await p.waitForTimeout(1500)

  ok(bodies.length === 1, '요청이 서버로 한 번 나갔다', `${bodies.length}번`)
  const body = bodies[0] ?? ''
  //  ⚠ 고른 것이 **글로 그대로** 들어가야 합니다 — 배차가 읽는 글입니다.
  ok(/정기 일정 외 추가 수거/.test(body), '**고른 것이 요청 글에 그대로 들어간다**', body.slice(0, 180))
  ok(/"desired_date"\s*:\s*"20\d\d-\d\d-\d\d"/.test(body), '고른 날짜가 날짜 칸에 들어간다')

  //  ⚠ 창이 닫히고, 알려 주고, 첫 화면이 바로 갱신됩니다 (브리프 26 · 27)
  ok((await p.locator('[data-portal-sheet]').count()) === 0, '보내면 창이 닫힌다')
  ok((await p.locator('[data-toast]').count()) === 1, '**접수되었다고 알려 준다**')
  ok(new URL(p.url()).pathname === HOME, '첫 화면 그대로', new URL(p.url()).pathname)
  ok((await p.locator('[data-portal-picker]').count()) === 0, '**병원을 다시 묻지 않는다**')
  await ctx.close()
}

// ── ⑥ 「소량·보통·많음」을 **지어내지 않는다** ────────────────────────────
{
  const { ctx, p } = await open(HOME, 'admin')
  await p.locator('[data-portal-cta="collect"]').click(); await p.waitForTimeout(600)
  const amount = flat(await p.locator('[data-choice="amount"]').innerText())
  //  ⚠ kg 을 적었으면 **그 병원의 실제 평균**이 근거로 함께 적혀 있어야
  //    합니다. 근거 없이 숫자만 적으면 병원이 그 숫자를 믿습니다.
  if (/kg/.test(amount)) {
    const step = flat(await p.locator('[data-sheet-step]').filter({ hasText: '예상 배출량' }).innerText())
    ok(/최근 \d+회 평균 \d+kg 기준/.test(step), '**kg 을 적었으면 무엇을 기준으로 냈는지 적혀 있다**', step.slice(0, 90))
    ok(/평소 수준/.test(amount), '「보통」이 평소 수준이라고 적혀 있다')
  } else {
    ok(/기록이 아직 적어/.test(flat(await p.locator('[data-sheet-step]').filter({ hasText: '예상 배출량' }).innerText())),
      '기록이 적으면 kg 으로 환산하지 않는다고 적는다')
  }
  await ctx.close()
}

// ── ⑦ 물품 주문 — 수량을 **누르기만** 하면 된다 ──────────────────────────
{
  const { ctx, p } = await open(HOME, 'admin')
  await p.locator('[data-portal-action="용기 · 봉투 주문"]').click(); await p.waitForTimeout(700)
  ok((await p.locator('[data-portal-sheet="supply"]').count()) === 1, '주문 창이 열린다')
  const sheet = flat(await p.locator('[data-portal-sheet="supply"]').innerText())
  ok(sheet.includes(T.name), `창 안에 ${T.name} 이라고 적혀 있다`)

  const items = await p.locator('[data-supply-item]').count()
  if (items > 0) {
    ok((await p.locator('[data-qty-quick]').count()) > 0, '**빠른 수량 단추가 있다** (＋를 열 번 안 눌러도 됩니다)')
    ok(await p.locator('[data-supply-send]').isDisabled(), '아무것도 안 고르면 못 보낸다')
  } else {
    //  ⚠ 팔 물건이 등록되어 있지 않으면 **왜 없는지** 적어야 합니다.
    ok((await p.locator('[data-supply-empty]').count()) === 1, '팔 물건이 없으면 왜 없는지 적는다')
  }
  await ctx.close()
}

// ── ⑧ 문의 — 고르면 그대로 접수된다 ───────────────────────────────────────
{
  const { ctx, p } = await open(HOME, 'admin')
  await p.locator('[data-portal-action="상담 · 문의"]').click(); await p.waitForTimeout(700)
  ok(await p.locator('[data-ask-send]').isDisabled(), '주제를 안 고르면 못 보낸다')

  await p.locator('[data-choice="topic"] [data-choice-item="정산"]').click(); await p.waitForTimeout(400)
  const quick = p.locator('[data-choice="quick"] [data-choice-item]')
  ok((await quick.count()) > 0, '**자주 묻는 것이 나온다** (직접 적지 않아도 됩니다)')
  const first = flat(await quick.first().innerText())
  await quick.first().click(); await p.waitForTimeout(300)
  ok(!(await p.locator('[data-ask-send]').isDisabled()), '고르기만 해도 보낼 수 있다')
  const sum = flat(await p.locator('[data-ask-summary]').innerText())
  ok(sum.includes(first), '고른 것이 그대로 제목이 된다', sum)
  await ctx.close()
}

// ── ⑨ 정산 창에 **없는 결제 단추를 만들지 않았다** ────────────────────────
{
  const { ctx, p } = await open(HOME, 'admin')
  await p.locator('[data-portal-action="정산 현황"]').click(); await p.waitForTimeout(700)
  const t = flat(await p.locator('[data-portal-sheet="billing"]').innerText())
  ok(/결제하실 수 없습니다/.test(t), '**지금은 결제할 수 없다고 적어 둔다**')
  ok(!/결제하기|카드 결제|지금 결제/.test(t), '없는 결제 단추를 만들지 않았다')
  await ctx.close()
}

// ── ⑩ 증빙자료 — 되는 것만 답니다 ────────────────────────────────────────
{
  const { ctx, p } = await open(HOME, 'admin')
  await p.locator('[data-portal-action="증빙자료"]').click(); await p.waitForTimeout(700)
  const t = flat(await p.locator('[data-portal-sheet="docs"]').innerText())
  ok(/아직 준비되지 않은 자료/.test(t), '**아직 없는 자료를 없다고 적는다**')
  ok(!/다운로드|내려받기/.test(t), '되지 않는 다운로드 단추를 만들지 않았다')

  //  ⚠ 증빙에서 이력으로 넘어가도 **화면을 옮기지 않습니다.**
  await p.locator('[data-docs-open="history"]').click(); await p.waitForTimeout(800)
  ok((await p.locator('[data-portal-sheet="history"]').count()) === 1, '증빙 → 이력으로 창이 바뀐다')
  ok(new URL(p.url()).pathname === HOME, '그래도 화면은 안 옮긴다', new URL(p.url()).pathname)
  ok((await p.locator('[data-drawer-print]').count()) === 1, '인쇄·PDF 저장은 **진짜로 되는** 단추라 답니다')
  await ctx.close()
}

// ── ⑪ 최근 활동 · 지금 확인이 필요한 항목 ─────────────────────────────────
{
  const { ctx, p } = await open(HOME, 'admin')
  ok((await p.locator('[data-portal-activity]').count()) === 1, '최근 활동 칸이 있다')
  const acts = await p.locator('[data-activity]').count()
  ok(acts > 0 && acts <= 5, `최근 활동이 다섯 줄 이하로 나온다 (${acts}줄)`)

  //  ⚠ 할 말이 없으면 이 칸은 **아예 없습니다.** 대표님: 「0건이면 영역을
  //    과도하게 크게 보여주지 않는다」.
  const todos = await p.locator('[data-portal-todos]').count()
  const items = await p.locator('[data-todo]').count()
  ok(todos === 0 || items > 0, '「지금 확인이 필요한 항목」은 있을 때만 뜬다', `칸 ${todos} · 줄 ${items}`)
  await ctx.close()
}

// ── ⑫ 병원 계정도 똑같이 창으로 끝난다 (브리프 31) ────────────────────────
{
  const { ctx, p } = await open('/portal', 'client')
  ok((await p.locator('[data-portal-picker]').count()) === 0, '병원 계정은 고르는 화면을 안 본다')
  await p.locator('[data-portal-cta="collect"]').click(); await p.waitForTimeout(700)
  ok((await p.locator('[data-portal-sheet="pickup"]').count()) === 1, '병원 계정도 창이 열린다')
  ok(new URL(p.url()).pathname === '/portal', '화면을 안 옮긴다', new URL(p.url()).pathname)
  //  ⚠ 병원 계정에는 관리자용 단추가 창 뒤에서도 안 보여야 합니다.
  ok((await p.locator('[data-portal-back]').count()) === 0, '병원 계정에는 AX 복귀 단추가 없다')
  ok((await p.locator('[data-portal-change]').count()) === 0, '병원 계정에는 병원 변경이 없다')
  await ctx.close()
}

// ── ⑬ 폰 — 창이 아래에서 올라와 화면을 거의 채운다 (브리프 30 · 40) ───────
for (const w of [390, 360]) {
  const { ctx, p } = await open(HOME, 'admin', w)
  await p.locator('[data-portal-action="긴급 수거 요청"]').click(); await p.waitForTimeout(800)

  const box = await p.locator('[data-portal-sheet="urgent"] > div:nth-child(2)').boundingBox()
  ok(Math.round(box.width) === w, `${w}px — 창이 화면 폭을 다 쓴다`, `${Math.round(box.width)}px`)
  ok(box.height > 500, `${w}px — 작은 팝업이 아니라 거의 전체 화면이다`, `${Math.round(box.height)}px`)

  //  ⚠ **보내기 단추가 화면 안에** 있어야 합니다. 고르는 항목이 길어지면
  //    아래로 밀려 나가는데, 그러면 다 골라 놓고 보낼 방법을 못 찾습니다.
  const send = await p.locator('[data-req-send]').boundingBox()
  ok(send.y + send.height <= 844, `${w}px — 보내기 단추가 화면 안에 있다`, `아래 ${Math.round(send.y + send.height)}px`)
  ok(send.height >= 44, `${w}px — 보내기 단추가 44px 이상이다`, `${Math.round(send.height)}px`)

  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  ok(over === 0, `${w}px — 가로로 넘치지 않는다`, `${over}px`)

  //  고르는 단추도 손가락이 닿아야 합니다.
  const small = await p.locator('[data-choice-item]').evaluateAll((els) =>
    els.map((e) => e.getBoundingClientRect()).filter((r) => r.height < 44).length)
  ok(small === 0, `${w}px — 고르는 단추가 전부 44px 이상이다`, `${small}개 미달`)
  await ctx.close()
}

// ── ⑭ 홈에서 가로로 넘치지 않는다 (여덟 칸 · 최근 활동까지) ───────────────
for (const w of [1920, 1440, 768, 390, 360]) {
  const { ctx, p } = await open(HOME, 'admin', w)
  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  ok(over === 0, `${w}px — 첫 화면이 가로로 안 넘친다`, `${over}px`)
  if (w <= 390) {
    //  ⚠ 첫 화면 안에 「수거 요청」이 남아 있어야 합니다.
    const cta = await p.locator('[data-portal-cta="collect"]').boundingBox()
    ok(cta.y < 844, `${w}px — 첫 화면 안에 「수거 요청」이 있다`, `y=${Math.round(cta.y)}`)
  }
  await ctx.close()
}

// ── ⑮ PC 에서 좌우 여백이 너무 넓지 않다 (0091) ───────────────────────────
//
//   대표님: 「PC에서 주로 볼 확률이 훨씬 높으니까 … 좌우에 여백이 좀 많이
//   남아, 너무 많이 남기진 않았으면 좋겠어」
//
//   ⚠ 1,240px 로 묶여 있었습니다. 1920px 화면에서 **양쪽 340px 씩** —
//     화면의 1/3 이 빈 자리였습니다.
//   ⚠ 그렇다고 무한정 늘리지 않습니다. 다 늘리면 2560px 에서 카드 한 장이
//     600px 이 되고 요청 글 한 줄이 화면을 가로질러 눈이 줄을 잃습니다.
//     그래서 **위아래 양쪽**을 잽니다 — 너무 좁지도, 너무 넓지도 않게.
for (const [w, maxPad, minCard, maxCard] of [
  [1920, 120, 380, 520],
  [1680, 60, 350, 480],
  [1440, 40, 300, 430],
]) {
  const { ctx, p } = await open(HOME, 'admin', w)
  const main = await p.locator('main').boundingBox()
  //  ⚠ 한쪽 여백 = 본문 상자가 왼쪽에서 떨어진 만큼.
  ok(main.x <= maxPad, `${w}px — 좌우 여백이 ${maxPad}px 이하다`, `${Math.round(main.x)}px`)
  //  ⚠ 가운데 있어야 합니다. 한쪽으로 쏠리면 눈이 어색합니다.
  const right = w - (main.x + main.width)
  ok(Math.abs(right - main.x) <= 20, `${w}px — 가운데에 놓여 있다`, `왼 ${Math.round(main.x)} · 오른 ${Math.round(right)}`)

  //  ⚠ 카드가 너무 커지지 않았는지 — 넉 장이 한 줄에 편한 폭인지.
  const card = await p.locator('[data-portal-action]').first().boundingBox()
  ok(card.width >= minCard && card.width <= maxCard,
    `${w}px — 카드 한 장이 ${minCard}~${maxCard}px 사이다`, `${Math.round(card.width)}px`)

  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  ok(over === 0, `${w}px — 넓혀도 가로로 안 넘친다`, `${over}px`)
  await ctx.close()
}

// ── ⑯ 넓히면서 **폰은 안 건드렸다** ───────────────────────────────────────
//     ⚠ 대표님: 「모바일 그 화면은 건드리지 말고」.
//       xl(1280px)부터만 넓혔으므로 아래쪽은 그대로여야 합니다.
for (const w of [390, 360, 768]) {
  const { ctx, p } = await open(HOME, 'admin', w)
  const main = await p.locator('main').boundingBox()
  //  ⚠ 폰·태블릿에서는 본문이 화면 폭을 그대로 씁니다(여백 0).
  ok(Math.round(main.x) === 0 && Math.round(main.width) === w,
    `${w}px — 본문이 화면 폭 그대로다 (안 건드렸다)`, `x=${Math.round(main.x)} w=${Math.round(main.width)}`)
  await ctx.close()
}

// ── ⑰ 머리띠 · 미리보기 띠 · 본문이 **같은 선**에 놓인다 ──────────────────
//     ⚠ 넓히는 값을 한 군데라도 빠뜨리면 머리띠만 좁게 남아 어긋납니다.
for (const w of [1920, 1440]) {
  const { ctx, p } = await open(HOME, 'admin', w)
  const main = await p.locator('main').boundingBox()
  const head = await p.locator('header > div').first().boundingBox()
  const bar = await p.locator('[data-portal-preview] > div').boundingBox()
  ok(Math.abs(head.width - main.width) <= 2, `${w}px — 머리띠가 본문과 같은 폭`, `${Math.round(head.width)} vs ${Math.round(main.width)}`)
  //  미리보기 띠는 바깥 여백을 스스로 가지므로 **글자 시작점**을 견줍니다.
  ok(Math.abs(bar.x - (main.x + 32)) <= 40, `${w}px — 미리보기 띠도 같은 선에서 시작`, `${Math.round(bar.x)} vs ${Math.round(main.x + 32)}`)
  await ctx.close()
}

await b.close()
