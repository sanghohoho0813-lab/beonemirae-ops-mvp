import { chromium, EXEC } from './_pw.mjs'
import * as W from './walk_lib.mjs'
import * as F from './perf_fixtures.mjs'

//  0088 — 병원을 한 번 고르면 **끝까지 그 병원** (대표님 신고)
//
//   대표님: 「비원종합병원 선택 → 필요한 물품 → **다시 병원 선택 화면** →
//   다시 선택 → **대시보드로 원점 복귀**」
//
//   원인은 한 줄이었습니다. 병원을 `?client=<id>` 로 달았는데 메뉴 단추들이
//   `/portal/supplies` 처럼 **물음표 뒤를 안 달고** 있었습니다.
//
//   ⚠ 이 검사 파일이 지키는 것은 딱 하나입니다 —
//     **어느 메뉴를 눌러도 병원 이름이 안 바뀐다.**
//     그래서 「고르는 화면이 안 뜬다」만 보지 않고, 화면마다 **그 병원
//     이름이 실제로 적혀 있는지**까지 봅니다. 안 뜨기만 하고 엉뚱한 병원
//     자료가 나오면 더 나쁩니다.

const ok = (c, m, d = '') => { console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`); if (!c) process.exitCode = 1 }
const flat = (t) => (t ?? '').replace(/\s+/g, ' ').trim()
const b = await chromium.launch({ executablePath: EXEC })

async function open(path, role, w = 1440) {
  const state = { profile: { ...W.profileFor(role), font_scale: 'normal' }, reqs: 0, writes: [], schemaVersion: 87 }
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

//  ⚠ **두 번째** 거래처를 씁니다. 첫 거래처를 쓰면 「목록의 첫 병원을
//    슬쩍 보여 주는」 예전 결함이 이 검사를 그냥 통과합니다.
const T = F.clients[3]
const OTHER = F.clients[5]

const path = (id, page = '') => (page ? `/portal/c/${id}/${page}` : `/portal/c/${id}`)
const MENUS = [
  ['필요한 물품', 'supplies'],
  ['월간 리포트', 'report'],
  ['수거 이력', 'history'],
  ['정산 내역', 'billing'],
  ['문의하기', 'support'],
  ['우리 병원 현황', ''],
]

// ── ① 대표님 시나리오 그대로 — 거래처 상세에서 들어가 여섯 메뉴를 돈다 ────
{
  const { ctx, p } = await open(`/clients/${T.id}`, 'admin')
  await p.locator('[data-client-portal-link] [data-portal-switch]').click()
  await p.waitForTimeout(1200)
  ok(new URL(p.url()).pathname === path(T.id), '거래처 상세 → 그 병원 화면', new URL(p.url()).pathname)

  for (const [label, page] of MENUS) {
    await p.locator(`nav a:has-text("${label}")`).first().click()
    await p.waitForTimeout(900)
    const u = new URL(p.url()).pathname

    //  ⚠ 제일 중요한 세 가지
    ok((await p.locator('[data-portal-picker]').count()) === 0,
      `${label} — **병원 선택 화면이 다시 뜨지 않는다**`)
    ok(u === path(T.id, page), `${label} — 주소에 병원이 그대로 있다`, u)
    const name = flat(await p.locator('[data-preview-name]').innerText())
    ok(name === T.name, `${label} — **여전히 ${T.name}**`, name)
  }
  await ctx.close()
}

// ── ② 새로고침해도 그 자리 (브리프 30) ────────────────────────────────────
{
  const { ctx, p, state } = await open(path(T.id, 'report'), 'admin')
  const before = flat(await p.locator('h1').first().innerText())
  await p.reload({ waitUntil: 'domcontentloaded' })
  await W.settle(p, state); await p.waitForTimeout(1000)

  ok(new URL(p.url()).pathname === path(T.id, 'report'),
    '**새로고침해도 같은 주소**', new URL(p.url()).pathname)
  ok((await p.locator('[data-portal-picker]').count()) === 0,
    '**새로고침해도 병원을 다시 안 묻는다**')
  ok(flat(await p.locator('h1').first().innerText()) === before, '같은 화면이 그대로', before)
  ok(flat(await p.locator('[data-preview-name]').innerText()) === T.name, `같은 병원 그대로`, T.name)
  await ctx.close()
}

// ── ③ 뒤로 / 앞으로 (브리프 6) ────────────────────────────────────────────
{
  const { ctx, p } = await open(path(T.id), 'admin')
  await p.locator('nav a:has-text("월간 리포트")').first().click(); await p.waitForTimeout(800)
  await p.locator('nav a:has-text("수거 이력")').first().click(); await p.waitForTimeout(800)

  await p.goBack(); await p.waitForTimeout(1000)
  ok(new URL(p.url()).pathname === path(T.id, 'report'), '뒤로가기 — 리포트로', new URL(p.url()).pathname)
  ok(flat(await p.locator('[data-preview-name]').innerText()) === T.name, '뒤로가기 — 병원 그대로')

  await p.goForward(); await p.waitForTimeout(1000)
  ok(new URL(p.url()).pathname === path(T.id, 'history'), '앞으로 — 이력으로', new URL(p.url()).pathname)
  ok(flat(await p.locator('[data-preview-name]').innerText()) === T.name, '앞으로 — 병원 그대로')
  await ctx.close()
}

// ── ④ 병원 계정 — 고를 것이 아예 없다 (브리프 8 · 31) ─────────────────────
{
  const { ctx, p } = await open('/portal', 'client')
  ok((await p.locator('[data-portal-picker]').count()) === 0, '**병원 담당자에게는 고르는 화면이 없다**')
  ok((await p.locator('[data-portal-change]').count()) === 0, '「병원 변경」이 없다')
  ok((await p.locator('[data-portal-preview]').count()) === 0, '관리자 미리보기 띠가 없다')
  ok((await p.locator('[data-portal-back]').count()) === 0, 'BUSINESS AX 복귀 단추가 없다')

  for (const [label, page] of MENUS) {
    await p.locator(`nav a:has-text("${label}")`).first().click(); await p.waitForTimeout(800)
    const u = new URL(p.url()).pathname
    ok(u === (page ? `/portal/${page}` : '/portal'), `병원 계정 ${label} — 주소에 병원 id 가 안 붙는다`, u)
    ok((await p.locator('[data-portal-picker]').count()) === 0, `병원 계정 ${label} — 고르라고 안 한다`)
  }
  await ctx.close()
}

// ── ⑤ 병원 계정이 **남의 병원 주소**를 직접 쳤다 (브리프 26) ──────────────
{
  const { ctx, p } = await open(path(OTHER.id, 'report'), 'client')
  //  ⚠ 서버(RLS)가 이미 남의 자료를 안 줍니다. 그래도 **주소를 그대로 두면**
  //    주소창에 남의 병원 id 가 박힌 채로 자기 자료가 보입니다.
  ok(new URL(p.url()).pathname === '/portal/report', '**자기 주소로 되돌려진다**', new URL(p.url()).pathname)
  ok((await p.locator('[data-portal-preview]').count()) === 0, '미리보기 띠가 생기지 않는다')
  const body = flat(await p.locator('main').innerText())
  ok(!body.includes(OTHER.name), `**${OTHER.name} 자료가 한 글자도 안 보인다**`, body.slice(0, 60))
  await ctx.close()
}

// ── ⑥ 병원 변경 — **누를 때만**, 그리고 보던 화면 그대로 (브리프 7) ───────
{
  const { ctx, p } = await open(path(T.id, 'report'), 'admin')
  const change = p.locator('[data-portal-change]')
  ok((await change.count()) === 1, '「병원 변경」 단추가 있다')
  const box = await change.boundingBox()
  ok((box?.height ?? 0) >= 44, '누를 만한 크기', `${Math.round(box?.height ?? 0)}px`)

  await change.click(); await p.waitForTimeout(900)
  ok((await p.locator('[data-portal-picker]').count()) === 1, '눌렀을 때만 고르는 화면이 열린다')

  await p.locator(`[data-portal-pick="${OTHER.id}"]`).click(); await p.waitForTimeout(1100)
  //  ⚠ 리포트를 보다 병원을 바꿨으면 **새 병원의 리포트**여야 합니다.
  //    첫 화면으로 돌아가면 고르고 또 눌러야 합니다 — 대표님이 신고하신
  //    「원점 복귀」가 그것입니다.
  ok(new URL(p.url()).pathname === path(OTHER.id, 'report'),
    '**보던 화면 그대로 새 병원으로 간다** (첫 화면으로 안 돌아간다)', new URL(p.url()).pathname)
  ok(flat(await p.locator('[data-preview-name]').innerText()) === OTHER.name, `${OTHER.name} 으로 바뀌었다`)
  await ctx.close()
}

// ── ⑦ BUSINESS AX 복귀 단추가 **모든 화면**에 있다 (브리프 10) ────────────
{
  for (const [label, page] of MENUS) {
    const { ctx, p } = await open(path(T.id, page), 'admin')
    const back = p.locator('[data-portal-back]:visible')
    ok((await back.count()) === 1, `${label} — 「BUSINESS AX로 돌아가기」가 보인다`)
    await ctx.close()
  }
  //  실제로 한 번에 나가지는지
  const { ctx, p } = await open(path(T.id, 'billing'), 'admin')
  await p.locator('[data-portal-back]').click(); await p.waitForTimeout(1200)
  ok(new URL(p.url()).pathname === '/', '**한 번 눌러 내부 화면으로 나온다**', new URL(p.url()).pathname)
  await ctx.close()
}

// ── ⑧ 지금 어느 병원의 무슨 화면인가가 적혀 있다 (브리프 11) ──────────────
{
  for (const [label, page] of MENUS.filter(([, pg]) => pg)) {
    const { ctx, p } = await open(path(T.id, page), 'admin')
    const crumb = flat(await p.locator('[data-portal-crumb]').innerText())
    ok(crumb.includes(T.name), `${label} — 화면 위에 병원 이름이 적혀 있다`, crumb)
    await ctx.close()
  }
}

// ── ⑨ 자료를 읽는 중에 **고르는 화면으로 튀지 않는다** (브리프 22 · 23) ───
{
  //  ⚠ 실제로 겪은 결함입니다. 첫 렌더에서 거래처 목록이 비어 있어
  //    「못 찾았다 → 고르세요」로 한 번 깜빡였습니다.
  const state = { profile: { ...W.profileFor('admin'), font_scale: 'normal' }, reqs: 0, writes: [], schemaVersion: 87 }
  const ctx = await b.newContext({ viewport: { width: 1440, height: 950 } })
  W.wire(ctx, state)
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: F.UID, aud: 'authenticated', email: 'x@b.c', app_metadata: {}, user_metadata: {} }])

  //  자료가 오는 동안 주소가 고르는 화면으로 바뀌는지 계속 지켜봅니다.
  const seen = []
  await p.goto(`${W.BASE}${path(T.id)}`, { waitUntil: 'domcontentloaded' })
  for (let i = 0; i < 40; i += 1) {
    seen.push(new URL(p.url()).pathname)
    await p.waitForTimeout(50)
  }
  await W.settle(p, state); await p.waitForTimeout(600)
  seen.push(new URL(p.url()).pathname)

  ok(!seen.includes('/portal/select'),
    '**읽는 중에 고르는 화면으로 튀지 않는다**', [...new Set(seen)].join(' → '))
  ok(new URL(p.url()).pathname === path(T.id), '끝까지 그 병원 화면', new URL(p.url()).pathname)
  await ctx.close()
}

// ── ⑩ 폰에서도 같다 (브리프 27) ───────────────────────────────────────────
{
  const { ctx, p } = await open(path(T.id), 'admin', 390)
  for (const short of ['물품', '리포트', '이력']) {
    await p.locator(`nav a:has-text("${short}")`).last().click(); await p.waitForTimeout(900)
    ok((await p.locator('[data-portal-picker]').count()) === 0, `폰 ${short} — 병원을 다시 안 묻는다`)
    ok(flat(await p.locator('[data-preview-name]').innerText()) === T.name, `폰 ${short} — ${T.name} 그대로`)
  }
  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  ok(over === 0, '폰에서 가로로 넘치지 않는다', `${over}px`)

  //  ⚠ 미리보기 띠가 커지면 정작 「수거 요청」이 화면 밖으로 밀립니다.
  //    실제로 그렇게 됐던 적이 있습니다(979px).
  await p.locator('nav a:has-text("현황")').last().click(); await p.waitForTimeout(900)
  const bar = await p.locator('[data-portal-preview]').boundingBox()
  ok(bar.height < 260, '미리보기 띠가 폰에서 두 줄을 안 넘는다', `${Math.round(bar.height)}px`)
  const cta = await p.locator('[data-portal-cta="collect"]').boundingBox()
  ok(cta.y < 844, '폰 첫 화면 안에 「수거 요청」이 남아 있다', `y=${Math.round(cta.y)}`)
  await ctx.close()
}

// ── ⑪ 알림을 눌러도 병원이 안 지워진다 ────────────────────────────────────
{
  const { ctx, p } = await open(path(T.id), 'admin')
  const bell = p.locator('header [aria-label*="알림"], header button[title*="알림"]').first()
  if ((await bell.count()) === 1) {
    await bell.click(); await p.waitForTimeout(500)
    const link = p.locator('[data-portal-notice] a').first()
    if ((await link.count()) === 1) {
      const href = await link.getAttribute('href')
      ok(String(href).startsWith(`/portal/c/${T.id}`), '**알림 링크가 그 병원을 달고 있다**', String(href))
      await link.click(); await p.waitForTimeout(1000)
      ok((await p.locator('[data-portal-picker]').count()) === 0, '알림을 눌러도 고르는 화면이 안 뜬다')
      ok(flat(await p.locator('[data-preview-name]').innerText()) === T.name, '알림을 눌러도 병원 그대로')
    }
  }
  await ctx.close()
}

await b.close()
