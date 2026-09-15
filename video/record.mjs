import { mkdirSync, writeFileSync, readFileSync, renameSync, rmSync, readdirSync, existsSync } from 'node:fs'
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
//    · **음성을 만들지 않습니다.** video/say.mjs 가 미리 만들어 둔 것을
//      읽기만 합니다 — 그래서 이 파일은 어느 회사 음성인지 모릅니다.
//
//   영상에만 더한 것 — 넷입니다
//    ① 「예시 데이터 · 기능 시연용」 구석 표시  ← 대표님 지시
//    ② 부드러운 커서 하나 (누르는 자리를 눈으로 따라갈 수 있게)
//    ③ 하단 가운데 자막
//    ④ 왼쪽 아래 아주 작은 「1/5 · AX 코치」 표시
//
//   ⚠ 0116 — **투어 설명 상자를 감춥니다.** 단계 진행은 제품의 그 투어
//     그대로 쓰되, 큰 설명 박스가 계속 떠 있으면 「AX 소개영상」이 아니라
//     「튜토리얼 기능 녹화」로 보입니다. 설명은 음성과 자막이 맡습니다.
//     강조도 훨씬 약하게 — 「여기를 보세요」 정도이지 나머지를 안 보이게
//     만드는 것이 아닙니다. 화면의 거의 전부가 실제 AX 여야 합니다.
//   둘 다 **제품 코드가 아니라** 이 파일이 브라우저에 끼워 넣습니다.
//   `src/` 는 한 줄도 바뀌지 않습니다.
//
//   ⚠ 0114 — 장면이 머무는 시간은 **음성 길이가 정합니다.** 고정된 초가
//     아닙니다(video/out/voice/timing.json). 말이 끝나면 0.5초 쉬고 넘어가며,
//     화면에서 할 일이 남아 있으면 그것까지 끝난 뒤에 넘어갑니다 —
//     다음 장면의 말이 화면보다 앞서 나가지 않게 하려는 것입니다.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = resolve(new URL('..', import.meta.url).pathname)
const cfgPath = process.argv.slice(2).find((a) => a.endsWith('.json')) ?? join(ROOT, 'video/config.beonemirae.json')
const CFG = JSON.parse(readFileSync(cfgPath, 'utf8'))
const OUT = join(ROOT, CFG.out.dir)
const H = CFG.hold
const SUB = CFG.subtitle ?? {}
//  0117 — 화면 크기가 바뀌면 얹는 것들도 같이 커져야 합니다. 값은 전부
//  config 의 stage 에 있습니다 (1920×1080 기준으로 적어 두었습니다).
const ST = CFG.stage ?? {}

//  음성 — 먼저 video/say.mjs 를 돌려 두어야 합니다.
const voicePath = join(OUT, 'voice/timing.json')
if (!existsSync(voicePath)) {
  throw new Error(`음성이 아직 없습니다: ${voicePath}\n  먼저 node video/say.mjs 를 돌려 주세요.`)
}
const VOICE = JSON.parse(readFileSync(voicePath, 'utf8'))
//  직접 녹음한 파일 하나를 쓰는 경우 — 장면 시각이 **녹음에 박혀 있습니다.**
//  그러면 화면이 음성을 따라가야 합니다 (반대가 아닙니다).
const VO = VOICE.provider === 'voiceover' ? VOICE : null

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
const OVERLAY = (watermark, sub, st) => `
(() => {
  const CUR = ${st.cursorPx ?? 26}
  const put = () => {
    if (document.getElementById('vid-layer')) return
    const layer = document.createElement('div')
    layer.id = 'vid-layer'
    layer.style.cssText = 'position:fixed;inset:0;z-index:2147483000;pointer-events:none'

    const mark = document.createElement('div')
    mark.id = 'vid-mark'
    mark.textContent = ${JSON.stringify(watermark)}
    mark.style.cssText = [
      'position:absolute','right:' + ${st.edgePx ?? 14} + 'px','bottom:' + ${st.edgePx ?? 12} + 'px',
      'padding:7px 14px','border-radius:999px',
      'background:rgba(8,15,28,.62)','color:#fff',
      'font:600 ' + ${st.markFontPx ?? 13} + 'px/1.2 system-ui,sans-serif','letter-spacing:.01em',
      'box-shadow:0 1px 6px rgba(0,0,0,.25)',
    ].join(';')

    const cur = document.createElement('div')
    cur.id = 'vid-cursor'
    cur.style.cssText = [
      'position:absolute','left:0','top:0',
      'width:' + CUR + 'px','height:' + CUR + 'px',
      'margin:' + (-CUR / 2) + 'px 0 0 ' + (-CUR / 2) + 'px','border-radius:999px',
      'background:rgba(255,255,255,.92)','border:2px solid rgba(20,30,50,.55)',
      'box-shadow:0 2px 10px rgba(0,0,0,.35)','opacity:0',
      'transition:transform .8s cubic-bezier(.22,1,.36,1),opacity .25s',
    ].join(';')

    const ring = document.createElement('div')
    ring.id = 'vid-ring'
    ring.style.cssText = [
      'position:absolute','left:0','top:0',
      'width:' + CUR + 'px','height:' + CUR + 'px',
      'margin:' + (-CUR / 2) + 'px 0 0 ' + (-CUR / 2) + 'px','border-radius:999px',
      'border:2px solid rgba(49,130,246,.9)','opacity:0',
    ].join(';')

    const cap = document.createElement('div')
    cap.id = 'vid-cap'
    cap.style.cssText = [
      'position:absolute','left:50%','transform:translateX(-50%)',
      'bottom:' + ${sub.bottomPx ?? 58} + 'px',
      'max-width:' + ${sub.maxWidthPct ?? 64} + '%',
      'padding:8px 16px','border-radius:12px',
      //  읽을 만큼만 어둡게 — 뒤 화면이 비쳐 보이는 정도입니다.
      'background:rgba(8,15,28,.68)','color:#fff',
      'font:600 ' + ${sub.fontPx ?? 21} + 'px/1.45 system-ui,sans-serif',
      'text-align:center','white-space:pre-line','word-break:keep-all',
      'opacity:0','transition:opacity .16s linear',
    ].join(';')

    //  왼쪽 아래 아주 작은 단계 표시 — 「1/5 · AX 코치」. 큰 설명 박스 대신입니다.
    const chip = document.createElement('div')
    chip.id = 'vid-chip'
    chip.style.cssText = [
      'position:absolute', 'left:' + ${st.edgePx ?? 16} + 'px', 'bottom:' + ${st.edgePx ?? 14} + 'px',
      'padding:6px 13px', 'border-radius:999px',
      'background:rgba(8,15,28,.55)', 'color:rgba(255,255,255,.92)',
      'font:600 ' + ${st.chipFontPx ?? 12} + 'px/1.2 system-ui,sans-serif', 'letter-spacing:.01em',
      'opacity:0', 'transition:opacity .2s linear',
    ].join(';')

    //  ── 무대 (0116) ────────────────────────────────────────────────────
    //   **처음부터** 켭니다. 중간에 목차가 사라지면 그 자체가 눈에 띄는
    //   장면이 되고, 그걸 감추려고 화면을 어둡게 덮으면 더 정신없습니다.
    const css = document.createElement('style')
    css.textContent = [
      //  오른쪽 위 도구 줄 — 시연 화면의 「투어 시작」 카드는 건드리지 않습니다.
      'main > div.justify-end:has(> [data-tour-start]){display:none !important}',
      //  ── 1920×1080 으로 찍습니다 (0117) ────────────────────────────
      //   ⚠ 1600×900 으로 찍어 1280×720 으로 줄이던 것을 그만둡니다.
      //     줄이면 글자 획이 뭉개집니다. 1080 으로 찍어 1080 으로 냅니다.
      //
      //   다만 창만 키우면 **같은 내용이 넓게 퍼져** 글자와 강조가 상대적으로
      //   작아집니다. 그래서 이 앱의 기준 글자 크기를 화면 비율만큼 같이
      //   키웁니다 — 1600 기준 17.8px × (1920/1600) = 21.4px.
      //   배치 비율은 900 높이에서 맞춰 둔 그대로이고, 픽셀만 진짜 1080 입니다.
      //   (제품에는 손대지 않습니다. 녹화하는 창에서만 덮어씁니다.)
      'html,html.scale-normal,html.scale-lg,html.scale-xl{font-size:'
        + ${st.rootFontPx ?? 17.8} + 'px !important}',
      //  왼쪽 목차를 접고, 본문이 **화면 가로를 그대로** 씁니다.
      //  ⚠ 오른쪽에 설명 상자 자리를 비워 두던 것을 없앴습니다 — 상자를
      //    감추니 비워 둘 이유가 없고, 비워 두면 AX 가 그만큼 작아집니다.
      'aside.sticky{display:none !important}',
      'main{padding-left:' + ${st.mainPadPx ?? 34} + 'px !important;'
        + 'padding-right:' + ${st.mainPadPx ?? 34} + 'px !important}',
      //  ⚠ **설명 상자를 감춥니다.** 설명은 음성과 자막이 맡습니다.
      //    display:none 이라 자리도 안 차지합니다 — 그래서 강조 대상이
      //    화면 가운데에 크게 놓입니다.
      '[data-tour-card]{display:none !important}',
      //  ⚠ 강조는 **얇은 테두리와 은은한 빛**까지만. 예전에는 나머지 화면을
      //    72% 어둡게 덮어 실제 내용이 잘 안 읽혔습니다.
      '[data-tour-spot]{box-shadow:0 0 0 9999px rgba(8,15,28,.16),'
        + '0 0 0 2px rgba(49,130,246,.85),0 0 26px 6px rgba(49,130,246,.22) !important;'
        + 'transition:opacity .16s linear,box-shadow .16s linear !important}',
      //  강조가 아직 없을 때 쓰는 덮개도 아주 옅게 — 화면이 컴컴해지지 않게.
      '[role="dialog"] > div[class*="bg-navy-950"]{background:rgba(8,15,28,.16) !important;'
        + 'transition:background .16s linear !important}',
    ].join('')
    document.head.appendChild(css)

    layer.append(mark, chip, cap, ring, cur)
    document.body.appendChild(layer)

    window.__vid = {
      move(x, y, ms) {
        cur.style.transition = 'transform ' + ms + 'ms cubic-bezier(.22,1,.36,1),opacity ' + ms + 'ms linear'
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

      /**
       * 읽는 동안 커서를 **오른쪽 여백**으로 미끄러뜨려 둡니다.
       *
       *  ⚠ 0116 — 본문이 화면 가로를 다 쓰게 되면서 예전 자리(오른쪽 아래)가
       *    카드 위가 됐습니다. 본문 바깥 여백으로 물러나고, 쉬는 동안에는
       *    옅어집니다 — 사라지거나 순간이동하지는 않습니다.
       */
      park(ms) {
        const x = window.innerWidth - 18
        const y = Math.round(window.innerHeight * 0.52)
        cur.style.transition = 'transform ' + ms + 'ms cubic-bezier(.22,1,.36,1),opacity ' + ms + 'ms linear'
        cur.style.transform = 'translate(' + x + 'px,' + y + 'px)'
        cur.style.opacity = '.35'
        ring.style.transform = 'translate(' + x + 'px,' + y + 'px)'
      },

      /** 왼쪽 아래 작은 단계 표시 — 없으면 감춥니다 */
      chip(text) {
        if (!text) { chip.style.opacity = '0'; return }
        chip.textContent = text
        chip.style.opacity = '1'
      },

      say(lines) { cap.textContent = lines.join(String.fromCharCode(10)); cap.style.opacity = '1' },
      sayOff() { cap.style.opacity = '0' },
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
await page.addInitScript(OVERLAY(CFG.watermark, SUB, ST))

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

/**
 * 화면을 그 자리까지 부드럽게 굴립니다.
 *
 *  ⚠ 0117 — ③단계(수거 입력)에서 투어가 「수거 완료 저장」을 화면 가운데로
 *    끌어오는데, 그러면 정작 **채워 넣는 칸들(거래처·수거량)이 위로 밀려**
 *    보이지 않았습니다. 말로는 「거래처와 차량, 수거량을 입력합니다」라고
 *    하면서 화면에는 그 칸이 없는 셈입니다. 그래서 채우는 동안에는 칸이
 *    보이는 자리로 올렸다가, 누를 때 다시 단추로 내려갑니다.
 *    강조 테두리는 스크롤을 따라다니므로(TourOverlay) 어긋나지 않습니다.
 */
async function bring(sel, block = 'center') {
  await page.evaluate(([s, b]) => {
    document.querySelector(s)?.scrollIntoView({ behavior: 'smooth', block: b })
  }, [sel, block])
  await page.waitForTimeout(H.scroll ?? 420)
}

/** 커서를 그 자리로 옮기고, 눌리는 시늉을 낸 뒤, 실제로 누릅니다 */
async function point(sel, { click = true } = {}) {
  const el = page.locator(sel).first()
  await el.waitFor({ state: 'visible', timeout: 15000 })
  //  화면 밖에 있으면 커서가 엉뚱한 자리로 갑니다 — 먼저 굴려 놓습니다.
  const seen = await el.evaluate((n) => {
    const r = n.getBoundingClientRect()
    return r.top >= 8 && r.bottom <= window.innerHeight - 8
  })
  if (!seen) await bring(sel, 'center')
  const box = await el.boundingBox()
  if (!box) throw new Error(`자리를 못 찾았습니다: ${sel}`)
  const x = Math.round(box.x + box.width / 2)
  const y = Math.round(box.y + box.height / 2)
  await page.evaluate(([x, y, ms]) => window.__vid?.move(x, y, ms), [x, y, H.cursorMove])
  await page.waitForTimeout(H.cursorMove + 60)
  await page.evaluate(() => window.__vid?.tap())
  await page.waitForTimeout(H.beforeClick ?? 130)
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
 * 강조가 화면 어디에 잡혔는지 — 찍는 동안 재서 timeline.json 에 남깁니다.
 *
 *  ⚠ 0116 — 설명 상자를 감췄으므로 「상자가 강조를 덮는가」는 더 이상 잴 것이
 *    없습니다. 대신 **강조 대상이 화면에서 얼마나 큰지**를 적습니다 —
 *    영상의 주인공이 실제 AX 인지 숫자로 남기려는 것입니다.
 */
const spots = []
async function checkSpot(label) {
  const r = await page.evaluate(() => {
    const s = document.querySelector('[data-tour-spot]')?.getBoundingClientRect()
    if (!s) return null
    return {
      w: Math.round(s.width), h: Math.round(s.height),
      pct: Math.round((s.width * s.height) / (window.innerWidth * window.innerHeight) * 100),
    }
  })
  spots.push({ label, ...(r ?? { w: 0, h: 0, pct: 0 }) })
}

/**
 * 다음 단계로 — **설명 상자를 감췄으므로 단추를 눈에 보이게 누르지 않습니다.**
 *
 *  읽는 단계는 투어의 「다음」이 진행시킵니다. 그 단추는 지금 화면에 없으니
 *  커서를 굳이 그리로 옮기지 않고 제품 쪽에 바로 알립니다 — 보는 사람에게는
 *  **화면이 저절로 다음으로 넘어가는 것**으로 보입니다.
 *  ⚠ 실제 AX 단추(「수거 입력으로」·「수거 완료 저장」)는 화면에 보이므로
 *    그때만 커서가 움직입니다.
 */
async function advance() {
  await page.evaluate(() => document.querySelector('[data-tour-next]')?.click())
}

/**
 * 한 장면 — **음성이 시간을 정합니다** (0114).
 *
 *   · 장면이 시작되는 순간을 적어 둡니다 (mux 가 그 자리에 음성을 붙입니다).
 *   · 자막은 음성 길이를 글자 수로 나눠 조각마다 띄웁니다.
 *   · `during` 에 넘긴 화면 동작은 자막 조각 사이사이에 끼워 넣습니다.
 *     동작이 말보다 오래 걸리면 **끝날 때까지 기다린 뒤** 넘어갑니다 —
 *     다음 장면의 말이 화면보다 앞서 나가지 않게 하려는 것입니다.
 *   · 말이 끝나면 0.5초 쉬고 자막을 내립니다.
 */
const audio = []
/** 다섯 단계 중 몇 번째인가 — 마무리는 번호가 없습니다 */
const STEP_NO = { s1: 1, s2: 2, s3: 3, s4: 4, s5: 5 }
/**
 * 직접 녹음한 음성일 때, 화면이 음성보다 늦은 장면들.
 *  ⚠ 늦으면 말이 화면보다 앞서 나갑니다 — 조용히 넘어가지 않고 적어 둡니다.
 *    고치는 법은 둘뿐입니다: marks 의 그 장면을 뒤로 미루거나, 녹음할 때
 *    장면 사이를 조금 더 쉬거나.
 */
const lags = []
/** 첫 장면이 영상 몇 초에 시작했는가 — 뒤 장면은 전부 여기에 더해 맞춥니다 */
let voBase = null
async function scene(id, { during = [] } = {}) {
  const sc = VOICE.scenes.find((x) => x.id === id)
  if (!sc) throw new Error(`대사가 없습니다: ${id}`)

  //  ── 화면이 여기까지 오는 데 실제로 걸린 시간 ───────────────────────────
  //   앞 장면의 말이 끝난 순간부터 이 장면 화면이 준비될 때까지입니다.
  //   **녹음하실 때 여기서 이만큼은 쉬셔야** 말이 화면을 앞지르지 않습니다.
  //   (기다리기 **전에** 재야 진짜 필요한 시간이 나옵니다.)
  const prev = audio[audio.length - 1]
  const need = prev ? Number((at() - (prev.at + prev.sec)).toFixed(2)) : null

  //  ── 직접 녹음: 시작 시각을 맞춥니다 (0117) ─────────────────────────────
  //   녹음은 이미 끝나 있고 그 안의 시각은 못 바꿉니다. 그러니 **화면이
  //   기다립니다.** 일찍 준비됐으면 그 자리에서 멈춰 서고, 늦었으면 적어 둡니다.
  if (VO) {
    if (voBase === null) voBase = at()
    const want = voBase + sc.startSec
    const late = at() - want
    if (late > 0.08) lags.push({ id, sec: Number(late.toFixed(2)) })
    else if (late < -0.02) await page.waitForTimeout(Math.round(-late * 1000))
  }
  //  읽는 동안 커서가 자막이나 본문 위에 얹혀 있지 않게 옆으로 비켜 둡니다.
  await page.evaluate(() => window.__vid?.park(700))
  //  큰 설명 박스 대신 왼쪽 아래에 아주 작게 — 「1/5 · AX 코치」
  const no = STEP_NO[id]
  await page.evaluate((t) => window.__vid?.chip(t), no ? `${no}/5 · ${sc.label}` : sc.label)
  audio.push({ id, label: sc.label, at: Number(at().toFixed(2)), sec: sc.sec, needGapSec: need })
  mark(`${sc.label} — 음성 ${sc.sec.toFixed(1)}초`)

  const t0 = Date.now()
  let acc = 0
  let ai = 0
  for (const cue of sc.cues) {
    await page.evaluate((l) => window.__vid?.say(l), cue.lines)
    acc += cue.ms
    if (during[ai]) { await during[ai](); ai += 1 }
    const left = t0 + acc - Date.now()
    if (left > 0) await page.waitForTimeout(left)
  }
  //  남은 동작이 있으면 말이 끝난 뒤에라도 마저 합니다.
  while (during[ai]) { await during[ai](); ai += 1 }
  //  ⚠ 직접 녹음일 때는 여기서 더 쉬지 않습니다 — 다음 장면 시작 시각이
  //    녹음에 이미 박혀 있어서, 남는 시간은 그 앞에서 알아서 기다립니다.
  if (!VO) await page.waitForTimeout(H.padAfterVoice)
  await page.evaluate(() => window.__vid?.sayOff())
}

console.log('── 녹화 ──')
mark('시작 화면 (심사 시연 안내)')
await page.waitForTimeout(H.intro)

//  투어 켜기
//  투어 켜기 — 화면에 보이는 단추이므로 커서가 움직입니다.
await point('[data-demo-tour] [data-tour-start]')
await page.locator('[data-tour-title]:has-text("무엇이 비어 있는가")').waitFor({ state: 'attached', timeout: 15000 })
await page.waitForTimeout(H.afterRoute)
await expect(1, '①')
await checkSpot('①')
await scene('s1')

//  ① → ②  (읽는 단계이므로 「다음」)
await advance()
await page.locator('[data-tour-title]:has-text("바로 업무로")').waitFor({ state: 'attached', timeout: 15000 })
await page.waitForTimeout(H.afterRoute)
await expect(2, '②')
await checkSpot('②')
await scene('s2')

//  ② → ③  **실제 미션 단추**를 누릅니다 — 투어가 따라옵니다
await point('[data-coach-go="collect-today"]')
await page.locator('[data-collect-save]').waitFor({ state: 'visible', timeout: 15000 })
await page.waitForTimeout(H.afterClick)
await expect(3, '③')
await checkSpot('③')

//  거래처 · 차량 · 수거량 — **말하는 동안** 한 칸씩 채웁니다.
//  ⚠ 채우는 칸이 화면에 보이도록 먼저 올려 둡니다 (bring 설명 참고).
await scene('s3', {
  during: [
    async () => {
      await bring('[data-guide="guide-client"]', 'start')
      await page.locator('select').first().selectOption(C0)
    },
    async () => {
      //  수거량 칸을 화면 가운데로 — 숫자가 채워지는 것이 보여야 합니다.
      await bring('[data-guide="guide-amount"]', 'center')
      await page.locator('[data-actual-amount]').fill('70')
      await page.locator('select').nth(1).selectOption('v1')
    },
  ],
})

//  ③ → ④  저장. **흉내 서버가 받습니다 — 실제 저장이 아닙니다.**
await point('[data-collect-save]')
await page.locator('[data-tour="collect-done"]').waitFor({ state: 'visible', timeout: 15000 })
await page.waitForTimeout(H.afterSave ?? H.afterClick)
await expect(4, '④')
await checkSpot('④')
await scene('s4')

//  ④ → ⑤
await advance()
await page.locator('[data-tour-title]:has-text("실제 기록을 확인")').waitFor({ state: 'attached', timeout: 15000 })
await page.waitForTimeout(H.afterRoute)
await expect(5, '⑤')
await checkSpot('⑤')
await scene('s5')

//  마무리 — 투어가 성과 화면으로 넘겨 줍니다.
//  ⚠ 강조가 옅어진 덕에 투어가 끝나도 화면이 확 밝아지지 않습니다 —
//    덮개 자체가 16% 뿐이라 걷혀도 눈에 띄는 계단이 안 생깁니다.
await advance()
await page.waitForURL('**/performance', { timeout: 15000 })
await page.waitForTimeout(H.afterRoute)
await scene('outro')
//  직접 녹음이면 마지막 말이 끝나는 시각(endSec)까지 화면을 붙잡아 둡니다.
if (VO && voBase !== null) {
  const left = (voBase + VO.totalSec) - at()
  if (left > 0) await page.waitForTimeout(Math.round(left * 1000))
}
await page.waitForTimeout(H.outroTail)

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
  //  ── 음성을 어디에 붙일지 ────────────────────────────────────────────
  //   장면마다 「영상 몇 초 자리에서 시작하는가」입니다. mux 가 이 값으로
  //   wav 를 제자리에 놓습니다. 화면과 말이 어긋날 수 없는 이유가 이것입니다.
  voice: {
    provider: VOICE.provider, dir: 'voice', scenes: audio,
    ...(VO ? { file: VO.file, offsetSec: VO.offsetSec, endSec: VO.endSec, totalSec: VO.totalSec } : {}),
  },
  marks,
  //  ⚠ 실제 서버에 나간 것이 없다는 증거를 같이 남깁니다.
  proof: {
    supabaseWrites: state.writes,
    rpcCalls: state.rpcCalls,
    escapedRequests: escaped,
    spotSize: spots,
    pageErrors: errors,
    //  직접 녹음일 때, 화면이 음성보다 늦은 장면 (없어야 정상)
    voiceLag: lags,
  },
}
writeFileSync(join(OUT, CFG.out.timeline), JSON.stringify(timeline, null, 2))

console.log('')
console.log(`  webm      ${webm}`)
console.log(`  본문 길이 ${timeline.bodySec}초 (말 ${VOICE.totalSec.toFixed(1)}초)`)
console.log(`  화면      ${CFG.viewport.width}x${CFG.viewport.height} → ${(CFG.output ?? CFG.viewport).width}x${(CFG.output ?? CFG.viewport).height}`)
console.log(`  바깥으로 나간 요청 ${escaped.length}건 · 화면 오류 ${errors.length}건`)
if (lags.length) {
  console.log('  ⚠ 화면이 음성보다 늦은 장면 — ' + lags.map((l) => `${l.id} ${l.sec}초`).join(' · '))
  console.log('    voiceover.marks 에서 그 장면을 뒤로 미루거나, 녹음할 때 장면 사이를 더 쉬어 주세요.')
}
//  녹음하실 때 참고 — 장면 사이에 **최소 이만큼**은 쉬어야 화면이 따라옵니다.
console.log('')
console.log('  녹음할 때 장면 사이에 필요한 최소 간격')
for (const a of audio) {
  if (a.needGapSec === null) continue
  console.log(`    ${a.id.padEnd(6)} 앞에서 ${a.needGapSec.toFixed(1)}초`)
}
if (escaped.length) console.log('  ⚠ ' + escaped.slice(0, 3).join(' | '))
if (errors.length) { console.log('  ⚠ ' + errors.slice(0, 2).join(' | ')); process.exitCode = 1 }
