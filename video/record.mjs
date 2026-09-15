import { mkdirSync, writeFileSync, readFileSync, renameSync, rmSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { chromium, EXEC } from '../test/browser/_pw.mjs'
import * as W from '../test/browser/walk_lib.mjs'
import * as F from '../test/browser/perf_fixtures.mjs'
import { captureFixture } from './fixture.mjs'

// ─────────────────────────────────────────────────────────────────────────────
//  0111 — 심사 시연 영상 ①  「사람 없이 화면이 스스로 도는 것을 녹화」
//
//   무엇을 하는가
//    · **지금 제품에 있는 그 심사 시연 투어**(demo · 다섯 단계)를 그대로 켜고,
//      Playwright 가 사람 대신 눌러 가며 처음부터 끝까지 진행합니다.
//    · 그 화면을 Playwright 의 녹화 기능으로 webm 하나에 담습니다.
//
//   무엇을 하지 않는가
//    · **투어를 복제하지 않습니다.** 단계 순서·문장·강조·덮개는 전부 제품의
//      TourOverlay 가 그리는 그대로입니다. 이 파일은 「누르는 손」일 뿐입니다.
//    · **실제 서버에 아무것도 보내지 않습니다.** 검사들이 쓰는 흉내 서버
//      (test/browser/walk_lib.mjs)를 그대로 씁니다. 저장 RPC 도 흉내만 냅니다.
//    · 음성·자막·전환 효과는 여기서 하지 않습니다 (다음 단계).
//
//   영상에만 더한 것 — 딱 둘입니다
//    ① 「예시 데이터 · 기능 시연용」 구석 표시  ← 대표님 지시
//    ② 부드러운 커서 하나 (누르는 자리를 눈으로 따라갈 수 있게)
//   둘 다 **제품 코드가 아니라** 이 파일이 브라우저에 끼워 넣습니다.
//   `src/` 는 한 줄도 바뀌지 않습니다.
//
//   ⚠ 자막은 일부러 넣지 않았습니다. 투어 설명 상자가 이미 같은 문장을 크게
//     보여 주고 있어서, 한 화면에 같은 말이 두 번 적히면 지저분해집니다.
//     아래쪽 자막 자리는 **AI 음성을 붙일 때** 그 음성이 읽는 문장으로 씁니다.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = resolve(new URL('..', import.meta.url).pathname)
const cfgPath = process.argv[2] ?? join(ROOT, 'video/config.beonemirae.json')
const CFG = JSON.parse(readFileSync(cfgPath, 'utf8'))
const OUT = join(ROOT, CFG.out.dir)
const H = CFG.hold

mkdirSync(OUT, { recursive: true })

const TODAY = F.TODAY
const C0 = F.clients[0].id

//  촬영용 기록 — 지난 방문 12건 · 그중 현장 입력 1건 · 포털 요청 3건 ·
//  오늘 예정 1건. 무엇을 왜 넣었는지는 video/fixture.mjs 맨 위에 있습니다.
const FIX = captureFixture(TODAY)

// ── 영상에만 얹는 것 ─────────────────────────────────────────────────────────
//   투어 덮개(z-100)보다 위에 뜨되, **클릭은 전부 통과**시킵니다.
//   통과시키지 않으면 자동 진행이 자기가 얹은 것에 막힙니다.
//
//   ⚠ 0112 — 오른쪽 위 도구 줄(화면 색 · 만든 이유 · 사용 방법 · 사용 후기)을
//     **영상 내내** 감춥니다. 제품은 투어가 끝나면 이 줄을 되돌려 놓는데,
//     영상에서는 마지막 4초에 갑자기 나타나 산만합니다. 제품 동작은 그대로
//     두고 **녹화하는 창에서만** 가립니다.
//     `.justify-end` 로 좁힌 이유는 시연 화면의 「투어 시작」 카드도 같은
//     단추를 품고 있어서입니다 — 그건 눌러야 하므로 가리면 안 됩니다.
const OVERLAY = (watermark) => `
(() => {
  const put = () => {
    if (document.getElementById('vid-layer')) return
    const layer = document.createElement('div')
    layer.id = 'vid-layer'
    layer.style.cssText = 'position:fixed;inset:0;z-index:2147483000;pointer-events:none'

    const mark = document.createElement('div')
    mark.id = 'vid-mark'
    mark.textContent = ${JSON.stringify(watermark)}
    mark.style.cssText = [
      'position:absolute','right:14px','bottom:12px',
      'padding:6px 12px','border-radius:999px',
      'background:rgba(8,15,28,.62)','color:#fff',
      'font:600 13px/1.2 system-ui,sans-serif','letter-spacing:.01em',
      'box-shadow:0 1px 6px rgba(0,0,0,.25)',
    ].join(';')

    const cur = document.createElement('div')
    cur.id = 'vid-cursor'
    cur.style.cssText = [
      'position:absolute','left:0','top:0','width:26px','height:26px',
      'margin:-13px 0 0 -13px','border-radius:999px',
      'background:rgba(255,255,255,.92)','border:2px solid rgba(20,30,50,.55)',
      'box-shadow:0 2px 10px rgba(0,0,0,.35)','opacity:0',
      'transition:transform .8s cubic-bezier(.22,1,.36,1),opacity .25s',
    ].join(';')

    const ring = document.createElement('div')
    ring.id = 'vid-ring'
    ring.style.cssText = [
      'position:absolute','left:0','top:0','width:26px','height:26px',
      'margin:-13px 0 0 -13px','border-radius:999px',
      'border:2px solid rgba(49,130,246,.9)','opacity:0',
    ].join(';')

    const css = document.createElement('style')
    css.textContent = 'main > div.justify-end:has(> [data-tour-start]){display:none !important}'
    document.head.appendChild(css)

    layer.append(mark, ring, cur)
    document.body.appendChild(layer)

    window.__vid = {
      move(x, y, ms) {
        cur.style.transition = 'transform ' + ms + 'ms cubic-bezier(.22,1,.36,1),opacity .25s'
        cur.style.opacity = '1'
        cur.style.transform = 'translate(' + x + 'px,' + y + 'px)'
        ring.style.transform = 'translate(' + x + 'px,' + y + 'px)'
      },
      tap() {
        ring.style.transition = 'none'
        ring.style.opacity = '1'
        ring.animate(
          [{ transform: ring.style.transform + ' scale(1)', opacity: .9 },
           { transform: ring.style.transform + ' scale(2.4)', opacity: 0 }],
          { duration: 520, easing: 'cubic-bezier(.22,1,.36,1)' })
      },
      hide() { cur.style.opacity = '0'; ring.style.opacity = '0' },
    }
  }
  if (document.body) put()
  else document.addEventListener('DOMContentLoaded', put)
})()
`

const b = await chromium.launch({ executablePath: EXEC })
const prof = { ...W.profileFor('admin'), font_scale: 'normal' }

/**
 * 흉내 서버가 받은 것을 전부 적어 둡니다.
 *  · writes  — 표에 쓰려 한 요청 (실제로는 아무 데도 안 갑니다)
 *  · rpcCalls — 저장 RPC 호출 (흉내로 성공만 돌려줍니다)
 * 끝나고 timeline.json 에 남겨서, **무엇이 어디로 갔는지** 눈으로 보게 합니다.
 */
const state = { profile: prof, reqs: 0, writes: [], schemaVersion: 108, schedules: FIX.schedules, rpcCalls: [] }

/**
 * 촬영용 기록 — **흉내 서버 안에만 있습니다.**
 *
 *  ⑤단계가 보여 줘야 하는 것은 「단추를 눌러서가 아니라 기록이 생겨서
 *  확인됐다」입니다. 그러려면 저장 뒤에 **실제로 확인할 기록이 있어야**
 *  합니다. 없으면 AX 코치가 확인할 것을 못 찾고, 투어가 짚을 자리도 없어
 *  화면이 5초 넘게 비어 있었습니다(첫 촬영에서 실제로 그랬습니다).
 *
 *  그래서 저장 요청을 받으면 흉내 서버가 그 자리에서
 *   · 오늘 예정 1건을 **완료**로 바꾸고
 *   · **수거 완료 기록(collection_events)** 한 줄을 만듭니다.
 *  AX 코치는 그 기록을 제 눈으로 읽고 확인 표시를 띄웁니다 — 판정 로직은
 *  제품 것 그대로입니다. 여기서 확인 결과를 지어내지 않습니다.
 */
const events = [...FIX.events]
state.rpc = (url) => {
  if (url.includes('/rpc/complete_collection')) {
    state.rpcCalls.push('complete_collection')
    const at = new Date().toISOString()
    const sc = state.schedules.find((s) => s.id === 'sx')
    sc.status = '완료'
    sc.actual_amount = 70
    sc.completed_at = at
    sc.handover_status = '인계 완료'
    events.unshift({
      id: 'ev-video', at, actor_role: 'admin', screen: '수거 입력', action: '수거 완료',
      schedule_id: sc.id, created_schedule: false, client_id: sc.client_id,
      client_name: F.clients[0].name, waste_type: sc.waste_type, amount_kg: 70,
      before_state: { status: '예정', actualAmount: null, handoverStatus: null },
      material_ids: [], stock_before: null, request_updates: [], note: '',
      reverted: false, reverted_at: null, demo_session_id: null, input_duration_ms: null,
    })
    return { eventId: 'ev-video', scheduleId: sc.id, createdSchedule: false }
  }
  return null
}

/** 실증 시작일 — 없으면 화면이 「설정에서 시작일을 먼저 정해 주세요」만 띄웁니다 */
const startedOn = FIX.startedOn

const ctx = await b.newContext({
  viewport: CFG.viewport,
  recordVideo: { dir: OUT, size: CFG.viewport },
})

//  ⚠ **이 그물을 먼저 칩니다.** Playwright 는 나중에 건 route 가 이깁니다.
//    흉내 서버(W.wire)보다 뒤에 걸면 흉내 서버가 잡아야 할 것까지
//    여기서 막아 버립니다 — 화면이 아무것도 못 읽습니다.
//    먼저 걸어 두면 「아무도 안 잡은 바깥 요청」만 여기로 떨어집니다.
const escaped = []
await ctx.route('**/*', (r) => {
  const u = r.request().url()
  if (u.startsWith(CFG.baseUrl) || u.startsWith('data:') || u.startsWith('blob:')) return r.continue()
  escaped.push(u)
  return r.abort()
})

//  흉내 서버 — 검사들이 쓰는 그것 그대로입니다.
W.wire(ctx, state)

//  ax_coach_missions — 「오늘 이 일을 받았다」 발행 기록.
//  ⚠ 받아만 두고 버리면 다음에 읽을 때 없던 일이 됩니다. 흉내 서버 안에
//    담아 두었다가 그대로 돌려줍니다 — 그래야 ⑤단계가 성립합니다.
const issued = []
await ctx.route('**/rest/v1/ax_coach_missions*', (r) => {
  const req = r.request()
  const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
  if (req.method() !== 'GET') {
    state.writes.push({ url: 'ax_coach_missions', method: req.method() })
    let body = {}
    try { body = JSON.parse(req.postData() ?? '{}') } catch { /* 형태가 달라도 흐름은 이어집니다 */ }
    const row = {
      id: `cm-${issued.length + 1}`, issued_at: new Date().toISOString(), verified_at: null,
      verified_what: '', target_id: null, ...(Array.isArray(body) ? body[0] : body),
    }
    issued.push(row)
    return json(row)
  }
  return json(issued)
})

//  실증 시작일 · 수거 완료 기록 — 둘 다 흉내 서버가 돌려줍니다.
await ctx.route('**/rest/v1/experiment_settings*', (r) => r.fulfill({
  status: 200, contentType: 'application/json',
  body: JSON.stringify((r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    ? { id: 1, start_date: startedOn }
    : [{ id: 1, start_date: startedOn }]),
}))
//  청구 · 입금 — 코치가 말하는 「입금 확인이 안 된 청구 N건」이 여기서 나옵니다.
//  ⚠ 검사용 기본 자료(3년치)를 그대로 쓰면 648건이 됩니다 — 심사 영상에서는
//    밀린 더미로 읽히므로 촬영용 최소한(미수 5건)으로 덮어씁니다.
for (const [table, rows] of [['payments', FIX.payments], ['payment_receipts', FIX.receipts]]) {
  await ctx.route(`**/rest/v1/${table}*`, (r) => {
    if (r.request().method() !== 'GET') {
      state.writes.push({ url: table, method: r.request().method() })
      return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) })
  })
}

//  병원이 포털로 직접 올린 요청 — 「병원 직접사용」 영역의 근거입니다.
await ctx.route('**/rest/v1/client_requests*', (r) => {
  if (r.request().method() !== 'GET') {
    state.writes.push({ url: 'client_requests', method: r.request().method() })
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  }
  return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FIX.requests) })
})

await ctx.route('**/rest/v1/collection_events*', (r) => {
  if (r.request().method() !== 'GET') {
    state.writes.push({ url: 'collection_events', method: r.request().method() })
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  }
  return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(events) })
})

const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

await page.addInitScript(([k, u]) => {
  window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  }))
  window.localStorage.setItem('beonemirae-ops:tour-seen', 'staff,field,client,demo')
  //  묶음은 접힌 기본 상태로 — 화면을 깔끔하게 시작합니다 (0110 메뉴 구조)
  window.sessionStorage.removeItem('beonemirae-ops:tour-run')
}, ['beonemirae-ops:auth', { id: prof.id, aud: 'authenticated', email: prof.email, app_metadata: {}, user_metadata: {} }])
await page.addInitScript(OVERLAY(CFG.watermark))

const tPage = Date.now()
await page.goto(`${CFG.baseUrl}/presentation`, { waitUntil: 'domcontentloaded' })
await W.settle(page, state)
await page.locator('[data-demo-tour] [data-tour-start]').waitFor({ state: 'visible', timeout: 15000 })
await page.waitForTimeout(500)

// ── 여기서부터가 영상 본문 ───────────────────────────────────────────────────
const tReady = Date.now()
const at = () => (Date.now() - tReady) / 1000
const marks = []
const mark = (label) => {
  marks.push({ label, sec: Number(at().toFixed(2)) })
  console.log(`  ${String(marks.length).padStart(2)} · ${at().toFixed(1).padStart(5)}s  ${label}`)
}

/** 커서를 그 자리로 옮기고, 눌리는 시늉을 낸 뒤, 실제로 누릅니다 */
async function point(sel, { click = true } = {}) {
  const el = page.locator(sel).first()
  await el.waitFor({ state: 'visible', timeout: 15000 })
  const box = await el.boundingBox()
  if (!box) throw new Error(`자리를 못 찾았습니다: ${sel}`)
  const x = Math.round(box.x + box.width / 2)
  const y = Math.round(box.y + box.height / 2)
  await page.evaluate(([x, y, ms]) => window.__vid?.move(x, y, ms), [x, y, H.cursorMove])
  await page.waitForTimeout(H.cursorMove + 120)
  await page.evaluate(() => window.__vid?.tap())
  await page.waitForTimeout(220)
  if (click) await el.click()
}

/** 지금 몇 단계인지 — 영상이 제 순서대로 도는지 스스로 확인합니다 */
async function stepNo() {
  const t = (await page.textContent('[data-tour-step]')) ?? ''
  return Number((t.match(/(\d+)\s*\/\s*5/) ?? [])[1] ?? 0)
}
const expect = async (n, label) => {
  const got = await stepNo()
  if (got !== n) throw new Error(`${label}: ${n}단계여야 하는데 ${got}단계입니다`)
}

/**
 * 설명 상자가 강조한 자리를 덮고 있지 않은지 — 그 단계에서 바로 잽니다.
 *
 *  ⚠ 영상은 한 번 찍고 나면 눈으로 다시 훑어야 알 수 있습니다. 그런데
 *    브라우저 높이가 조금만 달라져도 상자가 내용을 덮습니다(720 에서 실제로
 *    ④단계가 그랬습니다). 찍는 동안 재서 timeline.json 에 남깁니다.
 */
const overlaps = []
async function checkOverlap(label) {
  const px = await page.evaluate(() => {
    const c = document.querySelector('[data-tour-card]')?.getBoundingClientRect()
    const s = document.querySelector('[data-tour-spot]')?.getBoundingClientRect()
    if (!c || !s) return 0
    const w = Math.min(c.right, s.right) - Math.max(c.left, s.left)
    const h = Math.min(c.bottom, s.bottom) - Math.max(c.top, s.top)
    return w > 0 && h > 0 ? Math.round(w * h) : 0
  })
  overlaps.push({ label, px })
  if (px > 0) console.log(`  ⚠ ${label} — 설명 상자가 강조한 자리를 ${px}px² 덮고 있습니다`)
}

console.log('── 녹화 ──')
mark('시작 화면 (심사 시연 안내)')
await page.waitForTimeout(H.intro)

//  투어 켜기
await point('[data-demo-tour] [data-tour-start]')
await page.locator('[data-tour-title]:has-text("무엇이 비어 있는가")').waitFor({ state: 'visible', timeout: 15000 })
await page.evaluate(() => window.__vid?.hide())
await expect(1, '①')
await checkOverlap('①')
mark('① AX 코치 — 무엇이 비어 있는가')
await page.waitForTimeout(H.step1)

//  ① → ②  (읽는 단계이므로 「다음」)
await point('[data-tour-next]')
await page.locator('[data-tour-title]:has-text("바로 업무로")').waitFor({ state: 'visible', timeout: 15000 })
await page.evaluate(() => window.__vid?.hide())
await expect(2, '②')
await checkOverlap('②')
mark('② 추천에서 바로 업무로 (직접 누르는 단계)')
await page.waitForTimeout(H.step2)

//  ② → ③  **실제 미션 단추**를 누릅니다 — 투어가 따라옵니다
await point('[data-coach-go="collect-today"]')
await page.locator('[data-collect-save]').waitFor({ state: 'visible', timeout: 15000 })
await page.waitForTimeout(H.afterClick)
await page.evaluate(() => window.__vid?.hide())
await expect(3, '③')
await checkOverlap('③')
mark('③ 수거 1건 입력 (거래처 · 차량 · 수거량)')

//  거래처 · 차량 · 수거량 — 사람이 채우는 속도로 하나씩
const third = Math.round(H.step3 / 3)
await page.locator('select').first().selectOption(C0)
await page.waitForTimeout(third)
await page.locator('select').nth(1).selectOption('v1')
await page.waitForTimeout(third)
await page.locator('[data-actual-amount]').fill('70')
await page.waitForTimeout(third)

//  ③ → ④  저장. **흉내 서버가 받습니다 — 실제 저장이 아닙니다.**
await point('[data-collect-save]')
await page.locator('[data-tour="collect-done"]').waitFor({ state: 'visible', timeout: 15000 })
await page.waitForTimeout(H.afterClick)
await page.evaluate(() => window.__vid?.hide())
await expect(4, '④')
await checkOverlap('④')
mark('④ 한 번 입력이 여러 곳으로')
await page.waitForTimeout(H.step4)

//  ④ → ⑤
await point('[data-tour-next]')
await page.locator('[data-tour-title]:has-text("실제 기록을 확인")').waitFor({ state: 'visible', timeout: 15000 })
await page.evaluate(() => window.__vid?.hide())
await expect(5, '⑤')
await checkOverlap('⑤')
mark('⑤ AX 가 실제 기록을 확인합니다')
await page.waitForTimeout(H.step5)

//  마무리 — 투어가 성과 화면으로 넘겨 줍니다
await point('[data-tour-next]')
await page.waitForURL('**/performance', { timeout: 15000 })
await page.waitForTimeout(600)
await page.evaluate(() => window.__vid?.hide())
mark('마무리 — AX 도입 성과')
await page.waitForTimeout(H.outro)

const tEnd = Date.now()
mark('끝')

// ── 정리 ────────────────────────────────────────────────────────────────────
const video = page.video()
await ctx.close()
await b.close()

const raw = await video.path()
//  브라우저를 닫은 시각 — **영상 시작점을 되짚는 기준**입니다 (아래 설명).
const tClose = Date.now()
const webm = join(OUT, CFG.out.webm)
try { rmSync(webm) } catch { /* 처음이면 없습니다 */ }
renameSync(raw, webm)
//  녹화 파일이 두 개 남지 않게 (앞선 실행이 남긴 무작위 이름)
for (const f of readdirSync(OUT)) {
  if (f.endsWith('.webm') && f !== CFG.out.webm) rmSync(join(OUT, f))
}

const timeline = {
  tenant: CFG.tenant,
  recordedAt: new Date().toISOString(),
  viewport: CFG.viewport,
  //  ── 어디를 잘라야 하는가 ────────────────────────────────────────────
  //   시계로 「페이지를 연 시각부터 준비된 시각까지」를 잘라 봤더니 2초쯤
  //   어긋났습니다. **녹화가 언제 시작되는지는 우리가 정하는 것이 아니기**
  //   때문입니다(브라우저가 첫 프레임을 만드는 순간).
  //
  //   그래서 끝에서부터 되짚습니다. 녹화가 끝나는 시점은 확실합니다 —
  //   브라우저를 닫는 순간입니다.
  //
  //     녹화 시작 = 닫은 시각 − 영상 길이
  //     잘라 낼 앞부분 = 영상 길이 − (닫은 시각 − 본문 시작)
  //
  //   영상 길이는 mux 가 파일에서 직접 읽습니다. 여기서는 「본문 시작부터
  //   닫을 때까지」만 넘겨 주면 됩니다.
  closeOffsetSec: Number(((tClose - tReady) / 1000).toFixed(2)),
  bodySec: Number(((tEnd - tReady) / 1000).toFixed(2)),
  marks,
  //  ⚠ 실제 서버에 나간 것이 없다는 증거를 같이 남깁니다.
  proof: {
    supabaseWrites: state.writes,
    rpcCalls: state.rpcCalls,
    escapedRequests: escaped,
    cardCoversSpot: overlaps,
    pageErrors: errors,
  },
}
writeFileSync(join(OUT, CFG.out.timeline), JSON.stringify(timeline, null, 2))

console.log('')
console.log(`  webm      ${webm}`)
console.log(`  본문 길이 ${timeline.bodySec}초`)
console.log(`  바깥으로 나간 요청 ${escaped.length}건 · 화면 오류 ${errors.length}건`)
if (escaped.length) console.log('  ⚠ ' + escaped.slice(0, 3).join(' | '))
if (errors.length) { console.log('  ⚠ ' + errors.slice(0, 2).join(' | ')); process.exitCode = 1 }
