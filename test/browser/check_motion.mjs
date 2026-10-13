import { chromium, EXEC } from './_pw.mjs'
import * as W from './walk_lib.mjs'

// ─────────────────────────────────────────────────────────────────────────────
//  움직임 — 살아 있되 과하지 않은가 (0103)
//
//  대표님: 「병원 포털도 모션그래픽 효과, 마우스 호버 효과 좀 잘 업그레이드」.
//  넣은 것은 다섯 가지이고, 여기서는 그 다섯이 **실제로 그려지는지**와
//  **과하지 않은지**(시간·크기), 그리고 **움직임 줄이기 설정을 지키는지**를
//  잽니다. 움직임은 넣기는 쉽고 끄는 것을 잊기가 쉽습니다.
//
//   ① (포털 1차 고도화) 병원 홈에는 **계속 움직이는 사진이 없다** — 대표님
//      브리프 「의미 없는 애니메이션 X」. 예전 28초 드리프트를 뺐습니다.
//   ② 「최근 요청 · 최근 수거」 두 칸이 차례로 떠오르고, 0.9초 안에 다 떠 있다
//   ③ 큰 단추에 올리면 바탕·아이콘·화살표가 200ms 안에 살짝 움직인다
//   ④ 위 탭·왼쪽 메뉴의 강조선이 **하나만** 있고, 다른 곳을 누르면 그리로 간다
//   ⑤ 상품 카드에 올리면 사진이 살짝 다가온다
//   ⑥ Esc 는 **맨 위 창 하나만** 닫는다 (내부 창도 이제 Esc 로 닫힌다)
//   ⑦ 로그인 PC 옆 세로 사진 — 12장째 자산이 실제로 실리고, 폰에는 없다
// ─────────────────────────────────────────────────────────────────────────────

let pass = 0
let fail = 0
//  ⚠ 포털 1차 고도화 — 이 자리의 인자 순서가 **부르는 쪽과 반대**였습니다
//    (정의 name, cond / 호출 cond, name). 그래서 조건 자리에 늘 글자(참)가
//    들어가 이 스위트는 **무엇을 재든 통과**했습니다(출력이 「OK | false」).
//    부르는 쪽(cond, name) 에 맞춥니다.
const ok = (cond, name, detail = '') => {
  if (cond) pass += 1
  else fail += 1
  console.log(`${cond ? ' OK ' : 'FAIL'} | ${name}${detail && !cond ? ` — ${detail}` : ''}`)
}
const b = await chromium.launch({ executablePath: EXEC })

async function open(role, width, path, { reduced = false } = {}) {
  const prof = { ...W.profileFor(role), font_scale: 'normal' }
  const state = { profile: prof, reqs: 0, writes: [] }
  const ctx = await b.newContext({
    viewport: { width, height: 900 }, isMobile: width < 640, hasTouch: width < 640,
    reducedMotion: reduced ? 'reduce' : 'no-preference',
  })
  W.wire(ctx, state)
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => {
    window.localStorage.setItem(k, JSON.stringify({ access_token: 't', token_type: 'bearer',
      expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u }))
    window.localStorage.setItem('beonemirae-ops:tour-seen', 'staff,field,client')
  }, ['beonemirae-ops:auth', { id: prof.id, aud: 'authenticated', email: prof.email, app_metadata: {}, user_metadata: {} }])
  await p.goto(`${W.BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await W.settle(p, state)
  return { ctx, p, state }
}

const tf = (p, sel) => p.evaluate((s) => { const el = document.querySelector(s); return el ? getComputedStyle(el).transform : null }, sel)

// ── ① ② ③ ④ 병원 첫 화면 (PC) ──────────────────────────────────────────────
{
  const { ctx, p } = await open('client', 1440, '/portal')

  //  ① 계속 움직이는 사진이 없다
  const drift = await p.evaluate(() => {
    const imgs = [...document.querySelectorAll('main img')]
    return imgs.filter((img) => img.getAnimations().some((a) => a.playState === 'running' && (a.effect?.getTiming?.().duration ?? 0) > 2000)).length
  })
  ok(drift === 0, '① 홈에 계속 움직이는 사진이 없다 (의미 없는 움직임 금지)', `${drift}장`)
  ok((await p.locator('[data-portal-hero] img').count()) === 0, '① 머리 칸에 장식 사진이 없다')

  //  ② 차례로 떠오른 뒤 0.9초 안에 전부 보인다
  await p.waitForTimeout(900)
  const faded = await p.evaluate(() => [...document.querySelectorAll('[data-portal-cards] > div')]
    .filter((el) => Number(getComputedStyle(el).opacity) < 0.99).length)
  const wrappers = await p.locator('[data-portal-cards] > div[style]').count()
  ok(wrappers === 2, '② 두 칸이 차례로 떠오르는 틀 안에 있다', `${wrappers}개`)
  ok(faded === 0, '② 0.9초 안에 두 칸이 전부 떠 있다', `${faded}개 아직 흐림`)
  const heights = await p.evaluate(() => [...document.querySelectorAll('[data-card-tone]')]
    .map((el) => Math.round(el.getBoundingClientRect().height)))
  ok(heights.length === 2 && new Set(heights).size === 1, '② 큰 단추 둘의 높이가 같다', heights.join('·'))

  //  ③ 올리면 살짝 움직인다 — 200ms 안
  const card = '[data-portal-action]'
  const bgOf = () => p.evaluate((s) => getComputedStyle(document.querySelector(s)).backgroundColor, card)
  await p.mouse.move(2, 2)
  await p.waitForTimeout(250)
  const before = {
    card: await tf(p, card), icon: await tf(p, `${card} [data-action-icon]`), arrow: await tf(p, `${card} [data-action-arrow]`),
    bg: await bgOf(),
  }
  const box = await p.locator(card).first().boundingBox()
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await p.waitForTimeout(320)
  const after = {
    card: await tf(p, card), icon: await tf(p, `${card} [data-action-icon]`), arrow: await tf(p, `${card} [data-action-arrow]`),
    bg: await bgOf(),
  }
  ok(before.card !== after.card, '③ 올리면 단추가 살짝 뜬다')
  ok(before.icon !== after.icon, '③ 아이콘이 살짝 커진다', `${before.icon} → ${after.icon}`)
  ok(before.arrow !== after.arrow, '③ 화살표가 오른쪽으로 한 걸음 간다', `${before.arrow} → ${after.arrow}`)
  ok(before.bg !== after.bg, '③ 바탕이 옅게 물든다', `${before.bg} → ${after.bg}`)
  //  과하지 않은가 — 아이콘은 1.1배 미만, 화살표는 8px 미만
  const scale = Number((after.icon ?? '').match(/matrix\(([\d.]+)/)?.[1] ?? 1)
  const dx = Number((after.arrow ?? '').match(/matrix\([^)]*,\s*([-\d.]+),\s*[-\d.]+\)$/)?.[1] ?? 0)
  ok(scale > 1 && scale < 1.1, '③ 아이콘은 1.1배 미만 (과장 금지)', String(scale))
  ok(dx > 0 && dx < 8, '③ 화살표는 8px 미만 (과장 금지)', String(dx))
  const dur = await p.evaluate(() => parseFloat(getComputedStyle(document.querySelector('[data-portal-action] [data-action-icon]')).transitionDuration) * 1000)
  ok(dur >= 140 && dur <= 250, '③ 140~250ms 안에 움직인다', `${dur}ms`)
  await p.mouse.move(2, 2)

  //  ④ 위 탭 강조선 — 하나만, 그리고 옮겨 간다
  const accentIn = (sel) => p.evaluate((s) => {
    const a = document.querySelectorAll('[data-nav-accent]')
    return { n: a.length, inActive: a.length === 1 && !!a[0].closest(s) }
  }, sel)
  const a0 = await accentIn('a[aria-current="page"]')
  ok(a0.n === 1 && a0.inActive, '④ 위 탭에 강조선이 하나, 지금 보는 탭 위에', JSON.stringify(a0))
  const hist = p.locator('nav a[href*="/history"]').first()
  await hist.click()
  await p.waitForTimeout(700)
  const a1 = await accentIn('a[href*="/history"]')
  ok(a1.n === 1 && a1.inActive, '④ 다른 탭을 누르면 강조선이 그리로 옮겨 간다', JSON.stringify(a1))
  await ctx.close()
}

// ── ⑤ 상품 카드 — 사진이 살짝 다가온다 ───────────────────────────────────
//   ⚠ 공용 시험 자료에는 사진 있는 상품이 없습니다. 여기서만 「30L 박스」를 한
//     개 얹습니다 — 규격이 맞는 상품은 대표 사진(offer_03)이 붙습니다(0095).
{
  const { ctx, p } = await open('client', 1440, '/portal/supplies')
  await ctx.route('**/rest/v1/products*', (r) => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify([{ id: 'p-motion', name: '골판지 전용박스', spec: '30L', unit: '개', sale_price: 1800,
      stock_key: null, available: true, image_url: '', description: '', active: true, category: '용기', sort: 1,
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }]) }))
  await p.reload({ waitUntil: 'domcontentloaded' })
  await p.locator('[data-product]').first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {})
  await p.waitForTimeout(400)
  const n = await p.locator('[data-product-img]').count()
  if (n === 0) {
    ok(false, '⑤ 사진 있는 상품이 그려진다', '상품 카드에 사진이 없음')
  } else {
    await p.mouse.move(2, 2)
    await p.waitForTimeout(200)
    const before = await tf(p, '[data-product-img]')
    const box = await p.locator('[data-product]').first().boundingBox()
    await p.mouse.move(box.x + box.width / 2, box.y + 30)
    await p.waitForTimeout(420)
    const after = await tf(p, '[data-product-img]')
    const s = Number((after ?? '').match(/matrix\(([\d.]+)/)?.[1] ?? 1)
    ok(before !== after && s > 1 && s < 1.08, '⑤ 올리면 상품 사진이 살짝(4%) 다가온다', `${before} → ${after}`)
  }
  await ctx.close()
}

// ── ④' 왼쪽 메뉴 강조 막대 (내부 화면) ─────────────────────────────────────
{
  const { ctx, p } = await open('admin', 1440, '/')
  const s0 = await p.evaluate(() => { const a = document.querySelectorAll('[data-sidebar-accent]')
    return { n: a.length, inActive: a.length === 1 && !!a[0].closest('aside a[aria-current="page"]') } })
  ok(s0.n === 1 && s0.inActive, '④ 왼쪽 메뉴 강조 막대가 하나, 지금 보는 메뉴에', JSON.stringify(s0))
  await p.locator('aside a[href="/clients"]').first().click()
  await p.waitForTimeout(700)
  const s1 = await p.evaluate(() => { const a = document.querySelectorAll('[data-sidebar-accent]')
    return { n: a.length, inActive: a.length === 1 && !!a[0].closest('aside a[href="/clients"]') } })
  ok(s1.n === 1 && s1.inActive, '④ 다른 메뉴를 누르면 막대가 그리로 옮겨 간다', JSON.stringify(s1))
  await ctx.close()
}

// ── 움직임 줄이기 설정 — 전부 멈춘다 ───────────────────────────────────────
{
  const { ctx, p } = await open('client', 1440, '/portal', { reduced: true })
  const d = await p.evaluate(() => [...document.querySelectorAll('main img')]
    .filter((img) => img.getAnimations().some((a) => a.playState === 'running' && (a.effect?.getTiming?.().duration ?? 0) > 50)).length)
  ok(d === 0, '줄이기 설정 — 움직이는 사진이 없다', `${d}`)
  const faded = await p.evaluate(() => [...document.querySelectorAll('[data-portal-cards] > div')]
    .filter((el) => Number(getComputedStyle(el).opacity) < 0.99).length)
  ok(faded === 0, '줄이기 설정 — 칸이 기다림 없이 바로 보인다', `${faded}개 흐림`)
  await ctx.close()
}

// ── ⑥ Esc — 맨 위 창 하나만 ────────────────────────────────────────────────
{
  //  PC 내부 창 (피드백 창) — 이제 Esc 로 닫힌다
  const { ctx, p } = await open('admin', 1440, '/')
  await p.locator('main [data-dev-request-open]').first().click()
  await p.locator('[role="dialog"]').first().waitFor({ state: 'visible', timeout: 5000 })
  await p.keyboard.press('Escape')
  //  ⚠ 포털 1차 고도화(검사 바로잡기) — 닫히는 움직임이 0.8초쯤 걸립니다. 0.5초
  //    고정으로 재면 「안 닫혔다」로 잘못 읽습니다. 사라질 때까지 기다립니다.
  await p.locator('[role="dialog"]').first().waitFor({ state: 'detached', timeout: 5000 }).catch(() => {})
  ok((await p.locator('[role="dialog"]').count()) === 0, '⑥ 내부 창이 Esc 로 닫힌다 (P2 였던 것)')
  await ctx.close()
}
{
  //  폰: 더보기 시트 위에 「계획 중」 미리보기 — Esc 한 번에 위 것만
  //  (「계획 중」 항목은 관리자 더보기에 있습니다)
  const { ctx, p } = await open('admin', 390, '/')
  await p.getByRole('button', { name: '더보기' }).first().click()
  await p.locator('[data-dev-request-more]').first().waitFor({ state: 'visible', timeout: 5000 })
  //  ⚠ 0110 부터 「추가 개발 예정」이 든 묶음은 **접혀** 있습니다. 펴고 찾습니다.
  if ((await p.locator('[data-more-planned-item]').count()) === 0) {
    const toggles = p.locator('[data-more-toggle][aria-expanded="false"]')
    for (let i = (await toggles.count()) - 1; i >= 0; i -= 1) {
      await toggles.nth(i).click()
      if ((await p.locator('[data-more-planned-item]').count()) > 0) break
    }
  }
  const planned = p.locator('[data-more-planned-item]').first()
  if ((await planned.count()) === 0) {
    ok(false, '⑥ 관리자 더보기에 「계획 중」 항목이 있다', '없음')
  } else {
    await planned.scrollIntoViewIfNeeded()
    await planned.click()
    await p.locator('[data-planned-preview]').first().waitFor({ state: 'visible', timeout: 5000 })
    await p.keyboard.press('Escape')
    await p.locator('[data-planned-preview]').first().waitFor({ state: 'detached', timeout: 5000 }).catch(() => {})
    ok((await p.locator('[data-planned-preview]').count()) === 0, '⑥ Esc 한 번 — 위의 미리보기만 닫힌다')
    ok(await p.locator('[data-dev-request-more]').first().isVisible(), '⑥ 아래 더보기 시트는 그대로 남아 있다')
    await p.keyboard.press('Escape')
    await p.locator('[data-dev-request-more]').first().waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
    ok(!(await p.locator('[data-dev-request-more]').first().isVisible().catch(() => false)), '⑥ Esc 한 번 더 — 그제야 시트가 닫힌다')
  }
  await ctx.close()
}

// ── ⑦ 로그인 옆 세로 사진 (12장째 자산) ────────────────────────────────────
for (const [w, want] of [[1280, true], [390, false]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 }, isMobile: w < 640 })
  const p = await ctx.newPage()
  await p.goto(`${W.BASE}/login`, { waitUntil: 'domcontentloaded' })
  await p.locator('#login-email').waitFor({ state: 'visible', timeout: 10000 })
  await p.waitForTimeout(600)
  const r = await p.evaluate(() => {
    const a = document.querySelector('[data-login-brand]')
    if (!a) return { visible: false }
    const rect = a.getBoundingClientRect()
    const img = a.querySelector('img')
    const nw = img?.naturalWidth ?? 0, nh = img?.naturalHeight ?? 0
    const boxRatio = rect.width / rect.height, natRatio = nw / nh
    return { visible: rect.width > 0 && rect.height > 0 && getComputedStyle(a).display !== 'none',
      src: img?.getAttribute('src'), loaded: nw > 0,
      crop: boxRatio && natRatio ? Math.max(boxRatio / natRatio, natRatio / boxRatio) : null,
      formVisible: !!document.querySelector('#login-email') }
  })
  ok(r.visible === want, `⑦ ${w}px — 세로 사진 ${want ? '있음' : '없음'}`, JSON.stringify(r))
  if (want) {
    ok(/mobile_card_vertical/.test(r.src ?? '') && r.loaded, '⑦ mobile_card_vertical 이 실제로 실린다', String(r.src))
    ok((r.crop ?? 9) <= 2.4, '⑦ 세로 패널이라 거의 안 잘린다 (≤2.4배)', String(r.crop))
  }
  ok(r.formVisible, `⑦ ${w}px — 로그인 칸은 그대로`)
  await ctx.close()
}

await b.close()
console.log(`\ncheck_motion OK=${pass} FAIL=${fail}`)
process.exit(fail ? 1 : 0)
