import { chromium, EXEC } from './_pw.mjs'
import * as W from './walk_lib.mjs'
import * as F from './perf_fixtures.mjs'

//  화면 보기 — PC · 모바일 · PC+모바일 (대표님: 「AX 화면도 고객용 화면도 셋 다 가능하게」)
//
//   잽니다: 세 단추 · 폰 틀이 **실제 모바일 배치**인지 · 같은 주소 따라가기(PC → 폰, 폰 → PC)
//           · 틀을 새로 읽지 않고 옮겨 감 · 기억 · 폰 · 틀 안에서는 안 켜짐 · 가로 밀림.

const ok = (c, m, d = '') => { console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`); if (!c) process.exitCode = 1 }
const b = await chromium.launch({ executablePath: EXEC })
const SHOTS = process.env.SHOTS

async function open(role, path, w, h = 900, view = null) {
  const state = { reqs: 0, writes: [], profile: { ...W.profileFor(role), font_scale: 'normal' }, schemaVersion: 87 }
  const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: w < 700, hasTouch: w < 700 })
  W.wire(ctx, state)
  const p = await ctx.newPage()
  p.on('pageerror', (e) => ok(false, `화면 오류 없음 (${role} ${path})`, e.message))
  await p.addInitScript(([k, u, v]) => {
    window.localStorage.setItem(k, JSON.stringify({
      access_token: 't', token_type: 'bearer', expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
    }))
    window.localStorage.setItem('beonemirae-ops:tour-seen', 'staff,field,client,demo')
    if (v && window.self === window.top && !sessionStorage.getItem('dv-set')) {
      window.localStorage.setItem('beonemirae-ops:device-view', v)
      sessionStorage.setItem('dv-set', '1')
    }
  }, ['beonemirae-ops:auth', { id: F.UID, aud: 'authenticated', email: state.profile.email, app_metadata: {}, user_metadata: {} }, view])
  await p.goto(`${W.BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await W.settle(p, state, 800, 30000)
  await p.waitForTimeout(700)
  return { ctx, p, state }
}
const shot = async (p, n) => SHOTS && p.screenshot({ path: `${SHOTS}/${n}.png` })
const framePath = (p) => p.locator('[data-device-iframe]').evaluate((el) => el.contentWindow.location.pathname).catch(() => null)
const pcPath = (p) => p.evaluate(() => location.pathname)
const overflowX = (p) => p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
const pressed = (p, scope = '') => p.locator(`${scope} [data-device-view][aria-pressed="true"]`).first().getAttribute('data-device-view')
async function waitFor(fn, ms = 6000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (await fn()) return true
    await new Promise((r) => setTimeout(r, 150))
  }
  return false
}

// ═══ 1. AX(내부) · 대표 · PC 1440 ═══════════════════════════════════════════
{
  const { ctx, p } = await open('admin', '/', 1440, 900)
  const t = p.locator('[data-topbar] [data-device-view-toggle]')
  ok((await t.count()) === 1 && (await t.locator('[data-device-view]').count()) === 3, '1 AX 위쪽 줄에 「PC · 모바일 · PC+모바일」 세 단추 (1366px 부터)')
  ok((await pressed(p, '[data-topbar]')) === 'pc' && (await p.locator('[data-device-side], [data-device-mobile]').count()) === 0, '1 처음은 PC — 폰 틀 없음')
  const tops = await p.evaluate(() => [document.querySelector('[data-topbar] [data-device-view-toggle]'), document.querySelector('[data-clock-top]')].map((e) => Math.round(e.getBoundingClientRect().top + e.getBoundingClientRect().height / 2)))
  ok(Math.abs(tops[0] - tops[1]) <= 4, '1 위쪽 줄이 두 줄로 꺾이지 않음 (보기 단추가 시계와 같은 줄)', tops.join(' / '))
  ok((await p.locator('[data-app-sidebar] [data-device-view-toggle="side"] [data-device-view]').count()) === 3, '1 왼쪽 메뉴 아래에도 「화면 보기」 (언제나 있는 자리)')

  //  PC+모바일
  await p.click('[data-topbar] [data-device-view="both"]')
  await p.waitForTimeout(2600)
  ok((await p.locator('[data-device-side]').count()) === 1 && (await p.locator('[data-app-sidebar]').isVisible()), '1 PC+모바일 — PC 화면(왼쪽 메뉴 그대로) + 오른쪽 폰 틀')
  const src = await p.locator('[data-device-iframe]').getAttribute('src')
  ok(src === '/?frame=1', '1 폰 틀은 지금 주소 그대로 + 틀 표시', src)
  const box = await p.locator('[data-device-iframe]').boundingBox()
  ok(Math.round(box.width) === 390, '1 폰 틀 안 폭 390px', String(box?.width))
  const fr = p.frameLocator('[data-device-iframe]')
  ok((await fr.locator('[data-app-sidebar]').isVisible().catch(() => false)) === false && (await fr.locator('nav.fixed.bottom-0').count()) > 0, '1 틀 안은 **모바일 배치** (왼쪽 메뉴 없음 · 아래 탭)')
  ok((await fr.locator('[data-device-view-toggle]').count()) === 0, '1 틀 안에는 보기 단추 없음 (틀 안의 틀 없음)')
  const side = await p.locator('[data-device-side]').boundingBox()
  const mainRight = await p.locator('main').evaluate((e) => e.getBoundingClientRect().right)
  ok(mainRight <= side.x + 1, '1 PC 본문이 폰 틀 밑으로 들어가지 않음', `${Math.round(mainRight)} ≤ ${Math.round(side.x)}`)
  ok(!(await overflowX(p)), '1 가로 밀림 없음')
  await shot(p, 'dv_ax_both_1440')

  //  PC → 폰 — 틀을 새로 읽지 않고 옮겨 감
  await p.locator('[data-device-iframe]').evaluate((el) => { el.contentWindow.__kept = 1 })
  await p.locator('[data-app-sidebar] a[href="/clients"]').first().click()
  ok(await waitFor(async () => (await framePath(p)) === '/clients'), '1 PC 에서 거래처로 → 폰도 거래처', await framePath(p))
  ok((await p.locator('[data-device-iframe]').evaluate((el) => el.contentWindow.__kept)) === 1, '1 폰 틀을 새로 읽지 않음 (빠르게 옮겨 감)')

  //  폰 → PC
  await fr.locator('nav.fixed.bottom-0 a[href="/today"], nav.fixed.bottom-0 button:has-text("오늘")').first().click()
  ok(await waitFor(async () => (await pcPath(p)) === '/today'), '1 폰에서 「오늘」 → PC 도 오늘 일정', await pcPath(p))
  ok((await framePath(p)) === '/today', '1 폰은 그대로 오늘 일정')

  //  기억 — 새로고침해도 PC+모바일
  await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2500)
  ok((await p.locator('[data-device-side]').count()) === 1 && (await pressed(p, '[data-topbar]')) === 'both', '1 새로고침해도 PC+모바일 (이 기기에 기억)')
  ok(await waitFor(async () => (await framePath(p)) === '/today'), '1 새로고침 뒤에도 같은 화면', await framePath(p))

  //  모바일 — PC 화면 위에 폰 하나
  await p.click('[data-topbar] [data-device-view="mobile"]')
  await p.waitForTimeout(2400)
  ok((await p.locator('[data-device-mobile]').count()) === 1 && (await p.locator('[data-device-side]').count()) === 0, '1 모바일 — 폰 틀 하나만 크게')
  ok((await p.evaluate(() => getComputedStyle(document.documentElement).overflow)) === 'hidden', '1 모바일 — 뒤 PC 화면은 안 굴러감')
  ok((await pressed(p, '[data-device-mobile]')) === 'mobile', '1 모바일 화면 안에도 보기 단추 (갇히지 않음)')
  ok(await waitFor(async () => (await framePath(p)) === '/today'), '1 모바일 — 보던 화면 그대로', await framePath(p))
  ok(!(await overflowX(p)), '1 모바일 — 가로 밀림 없음')
  await shot(p, 'dv_ax_mobile_1440')
  await p.click('[data-device-mobile] [data-device-view="pc"]')
  await p.waitForTimeout(600)
  ok((await p.locator('[data-device-mobile], [data-device-side]').count()) === 0 && (await p.evaluate(() => getComputedStyle(document.documentElement).overflow)) !== 'hidden', '1 PC 로 돌아옴 — 틀 없음 · 스크롤 그대로')
  ok((await pcPath(p)) === '/today', '1 돌아와도 보던 화면 그대로')
  await ctx.close()
}

// ═══ 2. AX · 넓은 화면 1920 · 현장 계정 ══════════════════════════════════════
{
  const { ctx, p } = await open('admin', '/', 1920, 1080, 'both')
  ok((await p.locator('[data-device-side]').count()) === 1, '2 1920 — PC+모바일')
  ok(!(await overflowX(p)), '2 1920 — 가로 밀림 없음')
  await p.waitForTimeout(1800)
  await shot(p, 'dv_ax_both_1920')
  await ctx.close()
}
{
  const { ctx, p } = await open('field', '/today', 1440, 900, 'both')
  ok((await p.locator('[data-device-side]').count()) === 1, '2 현장 계정도 PC+모바일')
  ok(await waitFor(async () => (await framePath(p)) === '/today'), '2 현장 — 틀 안도 오늘 일정 (막힌 화면 아님)', await framePath(p))
  const txt = await p.frameLocator('[data-device-iframe]').locator('body').innerText().catch(() => '')
  ok(!/접근 권한이 없는/.test(txt), '2 현장 — 틀 안이 막히지 않음')
  await ctx.close()
}

// ═══ 2b. 1280 — 위쪽 줄에는 자리가 없어 왼쪽 메뉴 아래 단추로 ════════════════════
{
  const { ctx, p } = await open('admin', '/', 1280, 800)
  ok((await p.locator('[data-topbar] [data-device-view-toggle]:visible').count()) === 0, '2b 1280 — 위쪽 줄에는 안 넣음 (줄이 꺾이지 않게)')
  await p.locator('[data-app-sidebar] [data-device-view-toggle="side"] [data-device-view="both"]').click()
  await p.waitForTimeout(2200)
  ok((await p.locator('[data-device-side]').count()) === 1 && (await p.getAttribute('[data-app-sidebar] [data-device-view="both"]', 'aria-pressed')) === 'true', '2b 1280 — 왼쪽 메뉴 아래 단추로 PC+모바일')
  ok(!(await overflowX(p)), '2b 1280 PC+모바일 — 가로 밀림 없음')
  await p.locator('[data-app-sidebar] [data-device-view="pc"]').click(); await p.waitForTimeout(400)
  ok((await p.locator('[data-device-side]').count()) === 0, '2b 다시 PC')
  await ctx.close()
}

// ═══ 3. 폰에서는 언제나 원래 화면 ═══════════════════════════════════════════
{
  const { ctx, p } = await open('admin', '/', 390, 844, 'both')
  ok((await p.locator('[data-device-side], [data-device-mobile]').count()) === 0, '3 폰 — 기억된 PC+모바일이 있어도 폰 틀 안 띄움')
  ok((await p.locator('[data-device-view-toggle]:visible').count()) === 0, '3 폰 — 보기 단추 안 보임')
  ok(!(await overflowX(p)), '3 폰 — 가로 밀림 없음')
  await ctx.close()
}

// ═══ 4. 병원(고객) 화면 — 직원이 병원 화면을 볼 때 · PC 1440 ═════════════════
{
  const T = F.clients[3]
  const { ctx, p } = await open('admin', `/portal/c/${T.id}`, 1440, 900)
  const t = p.locator('[data-portal-app] header [data-device-view-toggle]')
  ok((await t.count()) === 1 && (await t.locator('[data-device-view]').count()) === 3, '4 병원 화면 머리에도 세 단추')
  await t.locator('[data-device-view="both"]').click()
  await p.waitForTimeout(2800)
  ok((await p.locator('[data-device-side]').count()) === 1, '4 병원 화면 PC+모바일')
  const src = String(await p.locator('[data-device-iframe]').getAttribute('src'))
  ok(src.startsWith(`/portal/c/${T.id}`) && /frame=1/.test(src), '4 틀 안 주소 = 지금 병원 그대로', src)
  const fr = p.frameLocator('[data-device-iframe]')
  const hero = (await fr.locator('[data-portal-hero] h1').innerText().catch(() => '')).replace(/\s+/g, ' ')
  ok(hero.includes(T.name), `4 틀 안이 ${T.name}`, hero.slice(0, 40))
  ok((await fr.locator('nav.fixed.bottom-0 a').count()) > 0, '4 틀 안은 모바일 배치 (아래 탭)')
  ok(!(await overflowX(p)), '4 가로 밀림 없음')
  await shot(p, 'dv_portal_both_1440')
  //  PC → 폰
  await p.locator('[data-portal-app] header nav a[href$="/history"]').first().click()
  ok(await waitFor(async () => (await framePath(p)) === `/portal/c/${T.id}/history`), '4 PC 에서 이용 내역 → 폰도 이용 내역', await framePath(p))
  //  폰 → PC
  await fr.locator(`nav.fixed.bottom-0 a[href="/portal/c/${T.id}"]`).first().click()
  ok(await waitFor(async () => (await pcPath(p)) === `/portal/c/${T.id}`), '4 폰에서 홈 → PC 도 병원 첫 화면', await pcPath(p))
  //  모바일
  await t.locator('[data-device-view="mobile"]').click()
  await p.waitForTimeout(2400)
  ok((await p.locator('[data-device-mobile]').count()) === 1, '4 병원 화면 모바일 — 폰 틀 하나만')
  await shot(p, 'dv_portal_mobile_1440')
  await p.click('[data-device-mobile] [data-device-view="pc"]')
  await p.waitForTimeout(500)
  ok((await p.locator('[data-device-mobile], [data-device-side]').count()) === 0, '4 PC 로 돌아옴')
  await ctx.close()
}

// ═══ 5. 병원 계정 본인 · PC ═══════════════════════════════════════════════
{
  const { ctx, p } = await open('client', '/portal', 1440, 900, 'both')
  ok((await p.locator('[data-device-side]').count()) === 1, '5 병원 계정도 PC+모바일')
  ok(await waitFor(async () => (await framePath(p)) === '/portal'), '5 틀 안도 /portal', await framePath(p))
  ok((await p.locator('[data-portal-app] header [data-device-view-toggle]').count()) === 1, '5 머리에 세 단추')
  await ctx.close()
}

await b.close()
