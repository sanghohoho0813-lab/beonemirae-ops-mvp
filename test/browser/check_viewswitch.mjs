import { chromium, EXEC } from './_pw.mjs'
import * as W from './walk_lib.mjs'
import * as F from './perf_fixtures.mjs'

//  0074 — PC 화면 ↔ 모바일 화면 전환이 **현장 계정에서도** 되는가
//
//   대표님 보고: 「field 계정에서 PC 버전 → 모바일 버전 전환이 안 된다.
//   admin 에서는 된다.」
//
//   원인: /mobile-preview 가 admin·office 전용이었는데, 왼쪽 아래 「모바일
//   화면」 단추는 현장에게도 보였습니다. **보이는데 누르면 막히는 단추**.
//   게다가 틀 안이 `/` 였습니다 — 대시보드는 현장에게 안 열리므로, 권한만
//   열었다면 이번엔 **틀 안이** 「접근 권한이 없는 화면입니다」로 찼을 겁니다.
//
//   여기서 재는 것: 전환 · 되돌아오기 · 새로고침 · 뒤로가기 · 재로그인.

const ok = (c, m, d = '') => { console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`); if (!c) process.exitCode = 1 }
const b = await chromium.launch({ executablePath: EXEC })

async function open(role, w, h = 900) {
  const state = { reqs: 0, writes: [], profile: W.profileFor(role) }
  const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: w < 700, hasTouch: w < 700 })
  W.wire(ctx, state)
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: F.UID, aud: 'authenticated', email: state.profile.email, app_metadata: {}, user_metadata: {} }])
  await p.goto(`${W.BASE}/`, { waitUntil: 'domcontentloaded' })
  await W.settle(p, state, 800, 30000)
  return { ctx, p, state }
}

const frameText = async (p) => {
  const fr = p.frames().find((f) => f !== p.mainFrame())
  if (!fr) return null
  await fr.waitForTimeout(2200)
  try { return await fr.evaluate(() => ({ path: location.pathname, text: (document.body.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 120) })) } catch { return null }
}

// ── ① PC 폭에서 「모바일 화면」 — 두 역할 모두 열려야 합니다 ────────────────
for (const [role, home] of [['admin', '/'], ['field', '/today']]) {
  const s = await open(role, 1440)
  ok((await s.p.locator('[data-go-mobile-preview]').count()) === 1, `${role} — PC 왼쪽에 「모바일 화면」이 있음`)
  await W.clickLabel(s.p, '모바일 화면')
  await s.p.waitForTimeout(2600)
  const path = new URL(s.p.url()).pathname
  ok(path === '/mobile-preview', `${role} — 눌러서 모바일 미리보기로 감`, path)
  const body = (await s.p.evaluate(() => (document.body.innerText ?? '').replace(/\s+/g, ' ').trim()))
  ok(!/접근 권한이 없는/.test(body), `${role} — **막히지 않음**`, body.slice(0, 50))
  const fr = await frameText(s.p)
  ok(fr !== null, `${role} — 폰 틀이 그려짐`)
  ok(fr?.path === home, `${role} — **틀 안이 본인 첫 화면**`, `${fr?.path} (기대 ${home})`)
  ok(!/접근 권한이 없는/.test(fr?.text ?? ''), `${role} — 틀 **안**도 막히지 않음`, (fr?.text ?? '').slice(0, 46))
  await s.ctx.close()
}

// ── ② 현장 — 모바일 미리보기에서 되돌아가기 · 새로고침 · 뒤로가기 ──────────
{
  const s = await open('field', 1440)
  await W.clickLabel(s.p, '모바일 화면')
  await s.p.waitForTimeout(2400)

  //  새로고침해도 그 자리에 남아야 합니다 (주소로 들어와도 열려야 하니까)
  await s.p.reload({ waitUntil: 'domcontentloaded' })
  await s.p.waitForTimeout(2600)
  const afterReload = (await s.p.evaluate(() => ({ path: location.pathname,
    body: (document.body.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 60) })))
  ok(afterReload.path === '/mobile-preview', '현장 — 새로고침해도 그 화면', afterReload.path)
  ok(!/접근 권한이 없는/.test(afterReload.body), '현장 — **새로고침 뒤에도 안 막힘**', afterReload.body.slice(0, 46))

  //  뒤로가기 — 원래 보던 화면으로
  await s.p.goBack({ waitUntil: 'domcontentloaded' })
  await s.p.waitForTimeout(2200)
  const back = new URL(s.p.url()).pathname
  ok(back === '/today', '현장 — 뒤로가기로 오늘 일정에 돌아옴', back)

  //  다시 들어가고 나오기 (왕복이 한 번만 되는 것이 아님)
  await W.clickLabel(s.p, '모바일 화면')
  await s.p.waitForTimeout(2200)
  ok(new URL(s.p.url()).pathname === '/mobile-preview', '현장 — 두 번째도 들어가짐')
  await W.clickLabel(s.p, '웹 화면으로 보기')
  await s.p.waitForTimeout(2200)
  ok(new URL(s.p.url()).pathname === '/today', '현장 — **「웹 화면으로 보기」로 되돌아옴**', new URL(s.p.url()).pathname)
  await s.ctx.close()
}

// ── ③ 폰에서 PC 화면으로 → 다시 모바일로 (왕복) ────────────────────────────
for (const role of ['admin', 'field']) {
  const s = await open(role, 390, 844)
  await W.clickLabel(s.p, '더보기')
  await s.p.waitForTimeout(900)
  const hit = await s.p.evaluate(() => {
    const el = document.querySelector('[data-pc-view-open]')
    if (!el) return false
    const t = el.closest('[class*=cursor-pointer]') ?? el.parentElement ?? el
    t.click(); return true
  })
  ok(hit, `${role} — 폰 「더보기」에 「PC 화면으로 보기」가 있음`)
  await s.p.waitForTimeout(1800)
  const on = await s.p.evaluate(() => ({
    vp: document.querySelector('meta[name=viewport]')?.content ?? '',
    bar: !!document.querySelector('[data-pc-view-bar]'),
  }))
  ok(/width=1440/.test(on.vp), `${role} — **PC 폭으로 바뀜**`, on.vp.slice(0, 30))
  ok(on.bar, `${role} — 돌아가는 띠가 떠 있음`)

  //  ⚠ 돌아가는 길이 없으면 기사님은 PC 화면에 갇힙니다
  const off = await s.p.evaluate(() => {
    const bar = document.querySelector('[data-pc-view-bar]')
    const btn = [...(bar?.querySelectorAll('button') ?? [])][0]
    if (!btn) return false
    btn.click(); return true
  })
  ok(off, `${role} — 띠에 되돌아가는 단추가 있음`)
  await s.p.waitForTimeout(1400)
  const back = await s.p.evaluate(() => ({
    vp: document.querySelector('meta[name=viewport]')?.content ?? '',
    bar: !!document.querySelector('[data-pc-view-bar]'),
  }))
  ok(/device-width/.test(back.vp), `${role} — **모바일 폭으로 돌아옴**`, back.vp.slice(0, 34))
  ok(!back.bar, `${role} — 띠가 사라짐`)
  await s.ctx.close()
}

// ── ④ 재로그인 — 새로 들어와도 처음부터 모바일 ─────────────────────────────
{
  const s = await open('field', 390, 844)
  await W.clickLabel(s.p, '더보기')
  await s.p.waitForTimeout(800)
  await s.p.evaluate(() => {
    const el = document.querySelector('[data-pc-view-open]')
    const t = el?.closest('[class*=cursor-pointer]') ?? el?.parentElement
    t?.click()
  })
  await s.p.waitForTimeout(1500)
  //  다시 들어온 것처럼 — 새로고침이 곧 새 세션 시작입니다
  await s.p.reload({ waitUntil: 'domcontentloaded' })
  await s.p.waitForTimeout(2600)
  const fresh = await s.p.evaluate(() => ({
    vp: document.querySelector('meta[name=viewport]')?.content ?? '',
    bar: !!document.querySelector('[data-pc-view-bar]'),
    path: location.pathname,
  }))
  ok(/device-width/.test(fresh.vp), '현장 — **다시 들어오면 모바일로 시작**', fresh.vp.slice(0, 34))
  ok(!fresh.bar, '현장 — PC 화면에 갇혀 있지 않음')
  ok(fresh.path === '/today', '현장 — 첫 화면은 오늘 일정', fresh.path)
}

// ═══ 0090 — 병원 화면에서도 양쪽으로 볼 수 있는가 ═══════════════════════════
//
//   대표님: 「병원화면도 모바일에서 pc화면 볼 수 있게, 반대 상황도 가능하게」
//
//   ⚠ 두 방향은 **방법이 다릅니다.**
//     폰 → PC   meta viewport 를 1440 으로 바꿔 진짜 PC 배치를 그립니다.
//     PC → 폰   반대는 안 됩니다(meta viewport 는 폰 브라우저만 봅니다).
//               폰 크기 틀 안에 이 화면을 한 번 더 띄웁니다.
//
//   ⚠ 그림만 바뀌면 소용없습니다. **배치가 실제로 바뀌었는지**를 잽니다 —
//     PC 로 바꾸면 위 메뉴가 나오고 아래 탭띠가 사라져야 합니다.

async function openPortal(role, path, w, h = 844) {
  const state = { reqs: 0, writes: [], profile: { ...W.profileFor(role), font_scale: 'normal' }, schemaVersion: 87 }
  const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: w < 700, hasTouch: w < 700 })
  W.wire(ctx, state)
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: F.UID, aud: 'authenticated', email: 'x@b.c', app_metadata: {}, user_metadata: {} }])
  await p.goto(`${W.BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await W.settle(p, state, 800, 30000)
  await p.waitForTimeout(700)
  return { ctx, p, state }
}

const vpOf = (p) => p.evaluate(() => document.querySelector('meta[name=viewport]')?.content ?? '')

// ── 병원 계정 · 폰(390) → PC 화면 ─────────────────────────────────────────
{
  const { ctx, p } = await openPortal('client', '/portal', 390)
  ok((await p.locator('[data-portal-pc-view]:visible').count()) === 1,
    '병원 폰 — 「PC 화면으로 보기」가 있다')
  //  ⚠ 폰에서 「모바일 화면으로 보기」는 뜻이 없습니다 — 이미 모바일입니다.
  ok((await p.locator('[data-portal-phone-view]:visible').count()) === 0,
    '병원 폰 — 「모바일 화면」 단추는 안 보인다 (이미 모바일입니다)')

  const before = {
    vp: await vpOf(p),
    top: await p.locator('header nav a:visible').count(),
    bottom: await p.locator('nav.fixed.bottom-0 a:visible').count(),
  }
  ok(/device-width/.test(before.vp), '처음은 모바일 폭', before.vp.slice(0, 30))
  ok(before.bottom > 0, '처음에는 아래 탭띠가 있다', `${before.bottom}개`)

  await p.locator('[data-portal-pc-view]').click()
  await p.waitForTimeout(900)

  const after = {
    vp: await vpOf(p),
    top: await p.locator('header nav a:visible').count(),
    bottom: await p.locator('nav.fixed.bottom-0 a:visible').count(),
  }
  ok(/width=1440/.test(after.vp), '**PC 폭으로 바뀐다**', after.vp.slice(0, 34))
  //  ⚠ 그림만 커진 것이 아니라 **배치가 바뀌어야** 합니다.
  ok(after.top > 0, '위 메뉴가 나온다 (PC 배치가 실제로 켜졌다)', `${after.top}개`)
  ok(after.bottom === 0, '폰 아래 탭띠가 사라진다', `${after.bottom}개`)

  ok((await p.locator('[data-pc-view-bar]').count()) === 1, '돌아가는 띠가 떠 있다')
  const exit = p.locator('[data-pc-view-exit]')
  ok((await exit.count()) === 1, '띠에 되돌아가는 단추가 있다')
  await exit.click()
  await p.waitForTimeout(800)
  ok(/device-width/.test(await vpOf(p)), '**모바일 폭으로 돌아온다**')
  ok((await p.locator('[data-pc-view-bar]').count()) === 0, '띠가 사라진다')
  ok((await p.locator('nav.fixed.bottom-0 a:visible').count()) > 0, '아래 탭띠가 돌아온다')
  await ctx.close()
}

// ── 병원 계정 · 새로고침하면 모바일로 돌아온다 ────────────────────────────
//    ⚠ 저장하지 않습니다. 잠깐 확인하는 기능이지 그 상태로 쓰시라는 것이
//      아닙니다. PC 폭에 갇히면 병원 담당자는 빠져나올 방법을 못 찾습니다.
{
  const { ctx, p, state } = await openPortal('client', '/portal', 390)
  await p.locator('[data-portal-pc-view]').click(); await p.waitForTimeout(800)
  await p.reload({ waitUntil: 'domcontentloaded' })
  await W.settle(p, state, 800, 30000); await p.waitForTimeout(900)
  ok(/device-width/.test(await vpOf(p)), '**다시 들어오면 모바일로 시작**')
  ok((await p.locator('[data-pc-view-bar]').count()) === 0, 'PC 폭에 갇혀 있지 않다')
  await ctx.close()
}

// ── 관리자 · PC(1440) → 모바일 화면 ───────────────────────────────────────
{
  const T = F.clients[3]
  const { ctx, p } = await openPortal('admin', `/portal/c/${T.id}`, 1440, 950)
  ok((await p.locator('[data-portal-phone-view]:visible').count()) === 1,
    'PC — 「모바일 화면으로 보기」가 있다')
  ok((await p.locator('[data-portal-pc-view]:visible').count()) === 0,
    'PC — 「PC 화면」 단추는 안 보인다 (이미 PC 입니다)')

  await p.locator('[data-portal-phone-view]').click()
  await p.waitForTimeout(1800)
  ok((await p.locator('[data-portal-phone-frame]').count()) === 1, '**폰 틀이 열린다**')

  const src = await p.locator('[data-portal-phone-iframe]').getAttribute('src')
  //  ⚠ **지금 보고 있는 병원 그대로**여야 합니다. 틀 안에서 다른 병원이
  //    나오면 대표님은 그것을 이 병원 자료로 읽으십니다.
  ok(String(src).startsWith(`/portal/c/${T.id}`), '틀 안 주소가 지금 병원 그대로다', String(src))
  //  ⚠ 틀 안에서 또 틀을 열 수 있으면 끝이 없습니다.
  ok(/frame=1/.test(String(src)), '틀 안이라는 표시가 붙는다', String(src))

  const fr = p.frameLocator('[data-portal-phone-iframe]')
  await p.waitForTimeout(2600)
  const hero = (await fr.locator('[data-portal-hero] h1').innerText().catch(() => '')).replace(/\s+/g, ' ')
  ok(hero.includes(T.name), `**틀 안이 ${T.name} 이다**`, hero.slice(0, 40))
  //  ⚠ 틀 안은 폭이 390px 이므로 **모바일 배치**가 켜져야 합니다.
  ok((await fr.locator('nav.fixed.bottom-0 a').count()) > 0, '틀 안에 폰 아래 탭띠가 있다 (모바일 배치가 켜졌다)')
  ok((await fr.locator('[data-portal-pc-view]').count()) === 0, '틀 안에는 보기 전환 단추가 없다')
  ok((await fr.locator('[data-portal-phone-view]').count()) === 0, '틀 안에는 폰 보기 단추도 없다')

  await p.locator('[data-portal-phone-exit]').click()
  await p.waitForTimeout(700)
  ok((await p.locator('[data-portal-phone-frame]').count()) === 0, '닫으면 틀이 사라진다')
  ok(new URL(p.url()).pathname === `/portal/c/${T.id}`, '닫아도 보던 자리 그대로', new URL(p.url()).pathname)
  await ctx.close()
}

// ── 화면을 옮기면 보기 모드가 꺼진다 ──────────────────────────────────────
//    ⚠ 켜 둔 채로 다른 화면에 가면 「왜 이렇게 보이지」가 됩니다.
{
  const { ctx, p } = await openPortal('client', '/portal', 390)
  await p.locator('[data-portal-pc-view]').click(); await p.waitForTimeout(800)
  ok((await p.locator('[data-pc-view-bar]').count()) === 1, 'PC 보기 켬')
  await p.locator('header nav a:has-text("고객지원")').first().click()
  await p.waitForTimeout(1000)
  ok((await p.locator('[data-pc-view-bar]').count()) === 0, '**다른 화면으로 가면 보기 모드가 꺼진다**')
  ok(/device-width/.test(await vpOf(p)), '모바일 폭으로 돌아와 있다')
  await ctx.close()
}

await b.close()
