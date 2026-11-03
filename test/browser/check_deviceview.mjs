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
  ok((await p.locator('[data-device-side]').count()) === 1 && (await pressed(p, '[data-app-sidebar]')) === 'both', '1 새로고침해도 PC+모바일 (이 기기에 기억)')
  ok(await waitFor(async () => (await framePath(p)) === '/today'), '1 새로고침 뒤에도 같은 화면', await framePath(p))

  //  모바일 — PC 화면 위에 폰 하나
  //  1440 PC+모바일은 메뉴가 아이콘 줄로 접혀 있어 보기 단추도 그쪽에 있습니다
  await p.click('[data-app-sidebar] [data-device-view="mobile"]')
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
  ok((await p.locator('[data-sidebar-rail]').count()) === 0, '2 1920 — 자리가 넉넉해 왼쪽 메뉴는 그대로 (접지 않음)')
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

// ═══ 6. PC+모바일 2차 — 1440 접힌 메뉴 · 폰에 병원 화면 · 저장하면 곧바로 서로 새로 읽음 ═══════
const trackReads = (p) => {
  const t = { main: [], frame: [] }
  p.on('request', (r) => {
    if (r.method() !== 'GET' || !r.url().includes('/rest/v1/clients')) return
    ;(r.frame() === p.mainFrame() ? t.main : t.frame).push(Date.now())
  })
  return t
}
const after = (arr, t0) => arr.filter((x) => x >= t0).length
{
  const T = F.clients[3]
  const { ctx, p } = await open('admin', `/clients/${T.id}`, 1440, 900, 'both')
  const rail = p.locator('[data-sidebar-rail]')
  ok((await rail.count()) === 1 && Math.round((await rail.boundingBox()).width) === 76, '6 1440 PC+모바일 — 왼쪽 메뉴가 아이콘 줄(76px)로 접힘')
  const mainW = await p.locator('main').evaluate((e) => Math.round(e.getBoundingClientRect().width))
  ok(mainW >= 900, '6 본문 폭이 넓어짐 (메뉴 펼침이면 712px)', `${mainW}px`)
  ok((await rail.locator('a[aria-label]').count()) >= 10 && (await rail.locator('[data-device-view]').count()) === 3, '6 접힌 메뉴에도 메뉴 · 화면 보기 단추')
  const tb = await p.evaluate(() => [document.querySelector('[data-topbar] [data-clock-top]'), document.querySelector('[data-topbar] [data-portal-switch]')].map((e) => Math.round(e.getBoundingClientRect().top + e.getBoundingClientRect().height / 2)))
  ok((await p.locator('[data-topbar] [data-device-view-toggle]').count()) === 0 && Math.abs(tb[0] - tb[1]) <= 4, '6 접힌 메뉴일 때 위쪽 줄은 한 줄 (보기 단추는 메뉴 쪽에)', tb.join(' / '))
  await shot(p, 'dv2_rail_1440')

  //  폰 폭 360(갤럭시) — 틀만 좁아지고 안의 화면도 가로로 안 밀림
  const frameOverflow = () => p.locator('[data-device-iframe]').evaluate((el) => { const d = el.contentWindow.document.documentElement; return d.scrollWidth - d.clientWidth })
  await p.click('[data-phone-width="360"]'); await p.waitForTimeout(1500)
  const w360 = Math.round((await p.locator('[data-device-iframe]').boundingBox()).width)
  ok(w360 === 360 && (await p.locator('[data-device-side]').innerText()).includes('모바일 360'), '6 폰 폭 360 (갤럭시)', `${w360}px`)
  ok((await frameOverflow()) <= 1, '6 360 폭에서 거래처 상세가 가로로 안 밀림', `${await frameOverflow()}px`)
  await shot(p, 'dv2_width360')
  await p.click('[data-phone-width="390"]'); await p.waitForTimeout(800)
  ok(Math.round((await p.locator('[data-device-iframe]').boundingBox()).width) === 390, '6 다시 390')

  //  폰에 병원 화면 — 거래처 상세를 보고 있으면 그 병원
  ok((await p.locator('[data-phone-source-toggle] [data-phone-source-pick]').count()) === 2, '6 폰 위에 「같은 화면 · 병원 화면」')
  await p.click('[data-phone-source-pick="portal"]')
  ok(await waitFor(async () => (await framePath(p)) === `/portal/c/${T.id}`, 9000), '6 폰 → 지금 보던 거래처의 병원 화면', await framePath(p))
  const fr = p.frameLocator('[data-device-iframe]')
  const hero = (await fr.locator('[data-portal-hero] h1').innerText().catch(() => '')).replace(/\s+/g, ' ')
  ok(hero.includes(T.name), `6 폰 안이 ${T.name} 병원 화면`, hero.slice(0, 30))
  await p.click('[data-phone-width="360"]'); await p.waitForTimeout(1200)
  ok((await frameOverflow()) <= 1, '6 360 폭에서 병원 첫 화면도 가로로 안 밀림', `${await frameOverflow()}px`)
  await p.click('[data-phone-width="390"]'); await p.waitForTimeout(600)
  ok((await p.getAttribute('[data-device-side]', 'data-phone-source')) === 'portal' && /\/portal\/c\//.test(await p.locator('[data-device-path]').innerText()), '6 위쪽 주소줄이 폰 주소')
  //  PC 를 옮겨도 폰은 병원 화면 그대로 (따라가지 않음)
  await p.locator('[data-app-sidebar] a[href="/today"]').first().click()
  await p.waitForTimeout(1500)
  ok((await pcPath(p)) === '/today' && (await framePath(p)) === `/portal/c/${T.id}`, '6 PC 는 오늘 일정 · 폰은 병원 화면 그대로', `${await pcPath(p)} · ${await framePath(p)}`)

  //  병원 폰에서 긴급수거 요청 → PC 가 곧바로 새로 읽음
  const reads = trackReads(p)
  await fr.locator('[data-portal-cta="urgent"]').click()
  await fr.locator('[data-portal-sheet="urgent"]').waitFor({ state: 'visible', timeout: 6000 })
  await fr.locator('[data-choice="reason"] [data-choice-item]').first().click()
  const t0 = Date.now()
  await fr.locator('[data-req-send]').click()
  ok(await waitFor(async () => after(reads.main, t0) > 0, 4000), '6 병원 폰에서 보낸 요청 → PC 가 곧바로 새로 읽음 (45초 기다리지 않음)', `${after(reads.main, t0)}번 · ${reads.main.length ? reads.main.at(-1) - t0 : '-'}ms`)
  await shot(p, 'dv2_portal_phone_sent')

  //  새로 고침 — 틀만 다시 읽음 · 병원 화면 그대로
  await p.locator('[data-device-iframe]').evaluate((el) => { el.contentWindow.__kept = 1 })
  await p.click('[data-device-reload]')
  await p.waitForTimeout(2600)
  ok((await p.locator('[data-device-iframe]').evaluate((el) => el.contentWindow.__kept ?? 0)) === 0 && (await framePath(p)).startsWith(`/portal/c/${T.id}`), '6 폰 새로 고침 — 틀을 다시 읽고 병원 화면 그대로')

  //  모바일 보기에서도 병원 화면 그대로
  await p.click('[data-app-sidebar] [data-device-view="mobile"]')
  await p.waitForTimeout(2400)
  ok((await p.getAttribute('[data-device-mobile]', 'data-phone-source')) === 'portal' && (await p.locator('[data-device-mobile]').innerText()).includes('병원이 보는 화면'), '6 모바일 보기 — 「병원이 보는 화면 · 모바일 화면」')
  ok(await waitFor(async () => (await framePath(p) ?? '').startsWith(`/portal/c/${T.id}`), 9000), '6 모바일 보기도 그 병원', await framePath(p))
  await p.click('[data-device-mobile] [data-device-view="both"]')
  await p.waitForTimeout(2400)

  //  같은 화면으로 돌아오면 다시 따라감
  await p.click('[data-phone-source-pick="same"]')
  ok(await waitFor(async () => (await framePath(p)) === '/today', 9000), '6 「같은 화면」 → 폰도 PC 처럼 오늘 일정', await framePath(p))
  await ctx.close()
}

// ═══ 7. 병원 화면(직원이 보는 중) → 폰에 직원 앱 · PC 에서 보낸 요청이 폰에 곧바로 ════════
{
  const T = F.clients[3]
  const { ctx, p } = await open('admin', `/portal/c/${T.id}`, 1440, 900, 'both')
  ok((await p.locator('[data-phone-source-pick="staff"]').count()) === 1, '7 병원 화면 폰 위에 「같은 화면 · 직원 화면」')
  await p.click('[data-phone-source-pick="staff"]')
  ok(await waitFor(async () => (await framePath(p)) === '/', 9000), '7 폰 → 직원 앱 첫 화면(대시보드)', await framePath(p))
  const fr = p.frameLocator('[data-device-iframe]')
  ok((await fr.locator('nav.fixed.bottom-0').count()) > 0 && (await fr.locator('[data-portal-app]').count()) === 0, '7 폰 안은 직원 앱(모바일 배치)')
  const reads = trackReads(p)
  await p.locator('[data-portal-cta="urgent"]').click()
  await p.locator('[data-portal-sheet="urgent"]').waitFor({ state: 'visible', timeout: 6000 })
  await p.locator('[data-choice="reason"] [data-choice-item]').first().click()
  const t0 = Date.now()
  await p.locator('[data-req-send]').click()
  ok(await waitFor(async () => after(reads.frame, t0) > 0, 4000), '7 PC 병원 화면에서 보낸 요청 → 직원 폰이 곧바로 새로 읽음', `${after(reads.frame, t0)}번`)
  await p.waitForTimeout(1500)
  const mine = reads.main.filter((x) => x >= t0)
  const bursts = mine.filter((x, i) => i === 0 || x - mine[i - 1] > 200).length
  ok(bursts === 1, '7 보낸 쪽(PC)은 한 번만 다시 읽음 — 제가 보낸 알림으로 또 읽지 않음', `${mine.length}건 · ${bursts}번`)
  await shot(p, 'dv2_staff_phone')
  await ctx.close()
}
{
  const { ctx, p } = await open('client', '/portal', 1440, 900, 'both')
  ok((await p.locator('[data-phone-source-toggle]').count()) === 0, '7 병원 계정 본인 — 「직원 화면」 고르기 없음 (같은 화면만)')
  await ctx.close()
}
{
  const { ctx, p } = await open('office', '/', 1440, 900, 'both')
  ok((await p.locator('[data-device-side]').count()) === 1, '7 사무실 계정 PC+모바일')
  const can = await p.locator('[data-phone-source-pick="portal"]').count()
  ok(can === 1, '7 사무실 계정도 병원 화면을 열 수 있어 「병원 화면」 고르기 있음 (access.ts: 포털은 병원 · 대표 · 사무실)')
  await ctx.close()
}
{
  const { ctx, p } = await open('field', '/today', 1440, 900, 'both')
  ok((await p.locator('[data-phone-source-toggle]').count()) === 0, '7 현장 계정 — 병원 화면을 못 여므로 고르기 없음')
  await ctx.close()
}

await b.close()
