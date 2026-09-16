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
//  0119 — 무엇을 어떤 순서로 누르고 짚을지는 **흐름 파일**에 있습니다.
//  이 파일(엔진)은 무대·커서·강조·자막·흉내 서버까지만 맡습니다.
const FLOW = CFG.flow ?? 'video/flows/short-demo.mjs'
const { flow: runFlow, start: FLOW_START } = await import(new URL('../' + FLOW, import.meta.url).href)

//  음성 — 먼저 video/say.mjs 를 돌려 두어야 합니다.
const VOICE_DIR = CFG.out.voice ?? 'voice'
const voicePath = join(OUT, VOICE_DIR, 'timing.json')
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
  //  목차를 얼마나 줄일지 · 덮개를 얼마나 어둡게 할지 — config 의 stage
  const Z = ${st.sidebarZoom ?? 1}
  const D = ${st.dim ?? 0.16}
  //  강조 테두리와 빛의 진하기 — 덮개(D)와 따로 둡니다. 0118-b 에서
  //  덮개는 그대로 두고 이 둘만 낮췄습니다 (「선택된 칸」처럼 보이지 않게).
  const B = ${st.spotBorder ?? 0.8}
  const G = ${st.spotGlow ?? 0.16}
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
      'font:600 ' + ${sub.fontPx ?? 21} + 'px/' + ${sub.lineHeight ?? 1.35} + ' system-ui,sans-serif',
      'text-align:center','white-space:pre-line','word-break:keep-all',
      'opacity:0','transition:opacity .16s linear',
    ].join(';')

    //  ── 0119 · Evidence Guide 에서 쓰는 셋 ────────────────────────────
    //   ① 강조 틀  — 제품 투어를 켜지 않고도 「여기를 보세요」를 그립니다.
    //      모양은 투어가 그리던 것과 **똑같은 값**을 씁니다(덮개 D · 테두리 B ·
    //      빛 G). 한 화면 안에서 자리를 옮길 때는 미끄러지듯 움직입니다.
    const box = document.createElement('div')
    box.id = 'vid-spot'
    box.style.cssText = [
      'position:fixed', 'left:0', 'top:0', 'width:0', 'height:0',
      'border-radius:14px', 'opacity:0',
      'box-shadow:0 0 0 9999px rgba(8,15,28,' + D + '),'
        + '0 0 0 2px rgba(49,130,246,' + B + '),'
        + '0 0 16px 4px rgba(49,130,246,' + G + ')',
      'transition:opacity .2s linear,transform .28s cubic-bezier(.22,1,.36,1),'
        + 'width .28s cubic-bezier(.22,1,.36,1),height .28s cubic-bezier(.22,1,.36,1)',
    ].join(';')

    //   ② 글자 화면 — 여는 말·닫는 말. 앱 화면이 아니라 이 레이어가 그립니다.
    const cardEl = document.createElement('div')
    cardEl.id = 'vid-card'
    cardEl.style.cssText = [
      'position:fixed', 'inset:0', 'display:flex', 'flex-direction:column',
      'align-items:center', 'justify-content:center', 'gap:26px',
      'padding:0 12%', 'background:#0b1220', 'color:#fff',
      'text-align:center', 'word-break:keep-all',
      'opacity:0', 'transition:opacity .25s linear',
    ].join(';')
    //  ⚠ 0120 — 여는 말에서 사례 카드를 **여러 장 갈아 끼웁니다.** 판은 그대로
    //    두고 글만 바뀌어야 깜빡이지 않으므로, 글을 담는 칸을 따로 둡니다.
    const cardBody = document.createElement('div')
    cardBody.style.cssText = [
      'display:flex', 'flex-direction:column', 'align-items:center', 'gap:26px',
      'width:100%', 'transition:opacity .22s linear',
    ].join(';')
    cardEl.appendChild(cardBody)

    //   ③ 얇은 덮개 + 가운데 글 — 실제 화면을 배경으로 남기고 한마디만.
    //  ⚠ 0119-b — 덮개는 **.62 까지만** 어둡게 합니다. 성과 화면이 배경으로
    //    남아 있어야 하기 때문입니다. 그 정도로는 흰 글씨가 흰 카드 위에서
    //    잘 안 읽혀서, **글 뒤에만** 반투명 판을 따로 깝니다 (veilPanel).
    //    화면 전체를 더 어둡게 하는 것과 글만 띄우는 것은 다릅니다.
    const veilEl = document.createElement('div')
    veilEl.id = 'vid-veil'
    veilEl.style.cssText = [
      'position:fixed', 'inset:0', 'display:flex',
      'align-items:center', 'justify-content:center',
      'padding:0 12%', 'background:rgba(8,15,28,.62)', 'color:#fff',
      'text-align:center', 'word-break:keep-all',
      'opacity:0', 'transition:opacity .3s linear',
    ].join(';')
    const veilPanel = document.createElement('div')
    veilPanel.style.cssText = [
      'display:flex', 'flex-direction:column', 'align-items:center', 'gap:18px',
      'padding:38px 58px', 'border-radius:26px',
      'background:rgba(8,15,28,.66)',
    ].join(';')
    veilEl.appendChild(veilPanel)

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
      //   기준 글자 크기를 화면 비율만큼 같이 키워야 배치가 넓게 퍼지지
      //   않습니다. 0118 에서는 거기서 한 번 더 줄였습니다 — 본문만 꽉 차
      //   있으면 「시스템 화면」이 아니라 「확대한 웹페이지」로 보입니다.
      'html,html.scale-normal,html.scale-lg,html.scale-xl{font-size:'
        + ${st.rootFontPx ?? 17.8} + 'px !important}',
      //  ── 왼쪽 목차를 **얇게 되살립니다** (0118) ──────────────────────
      //   0116~0117 에서는 아예 감췄습니다. 그랬더니 본문이 화면을 꽉 채워
      //   실제 시스템을 보는 느낌이 사라졌습니다. 다시 보이되 **제 폭으로
      //   두지는 않습니다** — 392px 짜리를 zoom 으로 줄여 1920 화면의 10%
      //   안쪽만 차지하게 합니다. 「오늘 업무」만 펼친 기본 상태 그대로입니다.
      //   ⚠ zoom 은 높이도 같이 줄이므로 h-[100dvh] 를 그만큼 되돌려 줘야
      //     목차가 화면 중간에서 끊기지 않습니다.
      'aside.sticky{zoom:' + Z + ' !important;height:calc(100dvh / ' + Z + ') !important}',
      //  본문은 화면 끝에 붙지 않게 — 좌우·위아래로 숨 쉴 자리를 둡니다.
      'main{padding-left:' + ${st.mainPadPx ?? 34} + 'px !important;'
        + 'padding-right:' + ${st.mainPadPx ?? 34} + 'px !important;'
        + 'padding-top:' + ${st.mainTopPx ?? 28} + 'px !important;'
        + 'padding-bottom:' + ${st.mainBottomPx ?? 96} + 'px !important}',
      //  ⚠ **설명 상자를 감춥니다.** 설명은 음성과 자막이 맡습니다.
      //    display:none 이라 자리도 안 차지합니다 — 그래서 강조 대상이
      //    화면 가운데에 크게 놓입니다.
      '[data-tour-card]{display:none !important}',
      //  ⚠ 강조는 **얇은 테두리와 은은한 빛**까지만. 예전에는 나머지 화면을
      //    72% 어둡게 덮어 실제 내용이 잘 안 읽혔습니다. 0118 에서 16% → 9%.
      //    「나머지를 감추는 것」이 아니라 「여기를 한번 보세요」입니다 —
      //    덮인 자리의 글씨와 카드가 계속 읽혀야 합니다.
      '[data-tour-spot]{box-shadow:0 0 0 9999px rgba(8,15,28,' + D + '),'
        + '0 0 0 2px rgba(49,130,246,' + B + '),'
        + '0 0 16px 4px rgba(49,130,246,' + G + ') !important;'
        + 'transition:opacity .16s linear,box-shadow .16s linear !important}',
      //  강조가 아직 없을 때 쓰는 덮개도 같은 농도로 — 계단이 안 생기게.
      '[role="dialog"] > div[class*="bg-navy-950"]{background:rgba(8,15,28,' + D + ') !important;'
        + 'transition:background .16s linear !important}',
    ].join('')
    document.head.appendChild(css)

    //  ⚠ 쌓는 순서가 곧 위아래입니다. 강조 틀이 가장 아래, 그 위에 구석
    //    표시·자막·커서, 맨 위가 덮개와 글자 화면입니다.
    layer.append(box, mark, chip, cap, ring, cur, veilEl, cardEl)
    document.body.appendChild(layer)

    //  강조 틀은 **화면을 굴려도 따라다녀야** 합니다. 굴리는 동안 자리가
    //  어긋나면 엉뚱한 곳을 가리키게 됩니다.
    let spotSel = null
    let spotPad = 8
    const followSpot = () => {
      if (!spotSel) return
      const el = document.querySelector(spotSel)
      if (!el) return
      const r = el.getBoundingClientRect()
      box.style.transform = 'translate(' + Math.round(r.left - spotPad) + 'px,' + Math.round(r.top - spotPad) + 'px)'
      box.style.width = Math.round(r.width + spotPad * 2) + 'px'
      box.style.height = Math.round(r.height + spotPad * 2) + 'px'
    }
    window.addEventListener('scroll', followSpot, true)
    window.addEventListener('resize', followSpot)
    setInterval(followSpot, 100)

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

      /** 잰 자리를 그대로 강조합니다 (부르는 쪽이 Playwright 로 잽니다). */
      spotRect(r, pad) {
        if (!r) return
        const p = pad == null ? 10 : pad
        const first = box.style.opacity !== '1'
        if (first) box.style.transition = 'opacity .2s linear'
        spotSel = null
        box.style.transform = 'translate(' + Math.round(r.x - p) + 'px,' + Math.round(r.y - p) + 'px)'
        box.style.width = Math.round(r.width + p * 2) + 'px'
        box.style.height = Math.round(r.height + p * 2) + 'px'
        if (first) {
          void box.offsetWidth
          box.style.transition = 'opacity .2s linear,transform .28s cubic-bezier(.22,1,.36,1),'
            + 'width .28s cubic-bezier(.22,1,.36,1),height .28s cubic-bezier(.22,1,.36,1)'
        }
        box.style.opacity = '1'
      },

      /** 선택자로 강조 — 화면을 굴려도 따라다닙니다 */
      spot(sel, pad) {
        spotPad = pad == null ? 8 : pad
        const first = !spotSel
        spotSel = sel
        //  처음 켤 때는 미끄러지지 않게 — 화면 밖에서 날아오면 산만합니다.
        if (first) box.style.transition = 'opacity .2s linear'
        followSpot()
        if (first) {
          void box.offsetWidth
          box.style.transition = 'opacity .2s linear,transform .28s cubic-bezier(.22,1,.36,1),'
            + 'width .28s cubic-bezier(.22,1,.36,1),height .28s cubic-bezier(.22,1,.36,1)'
        }
        box.style.opacity = '1'
      },
      spotOff() { box.style.opacity = '0'; spotSel = null },

      /**
       * 글자 화면 (여는 말·닫는 말·사례 카드).
       *
       *  이미 떠 있는 상태에서 다시 부르면 **글만 갈아 끼웁니다** — 판은
       *  그대로 있으므로 화면이 깜빡이지 않습니다. 바꾸는 동안(0.22초)을
       *  기다릴 수 있게 약속(Promise)을 돌려줍니다.
       */
      card(lines, foot) {
        const fill = () => {
          cardBody.textContent = ''
          for (const l of lines) {
            const el = document.createElement('p')
            el.textContent = l.text
            el.style.cssText = 'margin:0;font:' + (l.weight || 800) + ' ' + l.size + 'px/1.5 system-ui,sans-serif;'
              + 'white-space:pre-line;word-break:keep-all;'
              + 'color:' + (l.dim ? 'rgba(255,255,255,.62)' : '#fff') + ';max-width:' + (l.narrow ? '70%' : '100%')
            cardBody.appendChild(el)
          }
          if (foot) {
            const f = document.createElement('p')
            f.textContent = foot
            f.style.cssText = 'margin:18px 0 0;font:700 20px/1.4 system-ui,sans-serif;'
              + 'color:rgba(255,255,255,.5);letter-spacing:.03em'
            cardBody.appendChild(f)
          }
          cardBody.style.opacity = '1'
        }
        const swapping = cardEl.style.opacity === '1' && cardBody.childElementCount > 0
        cardEl.style.opacity = '1'
        if (!swapping) { fill(); return Promise.resolve() }
        cardBody.style.opacity = '0'
        return new Promise((done) => setTimeout(() => { fill(); done() }, 220))
      },
      cardOff(ms) {
        cardEl.style.transition = 'opacity ' + (ms || 250) + 'ms linear'
        cardEl.style.opacity = '0'
      },

      /** 실제 화면을 배경으로 남기고 한마디만 — 성과 화면 위에 씁니다. */
      veil(lines) {
        veilPanel.textContent = ''
        for (const l of lines) {
          const el = document.createElement('p')
          el.textContent = l.text
          el.style.cssText = 'margin:0;font:' + (l.weight || 800) + ' ' + l.size + 'px/1.5 system-ui,sans-serif;'
            + 'white-space:pre-line;word-break:keep-all;'
            + 'text-shadow:0 2px 12px rgba(0,0,0,.45);'
            + 'color:' + (l.dim ? 'rgba(255,255,255,.82)' : '#fff')
          veilPanel.appendChild(el)
        }
        veilEl.style.opacity = '1'
      },
      veilOff() { veilEl.style.opacity = '0' },
    }
  }
  if (document.body) put()
  else document.addEventListener('DOMContentLoaded', put)
  //  ⚠ Evidence Guide 는 **글자 화면으로 시작**합니다. 그래야 앱이 뜨는
  //    동안의 빈 화면과 깜빡임이 보이지 않습니다 (앞부분은 어차피 잘라
  //    내지만, 자르는 자리가 조금 어긋나도 안전합니다).
  if (${st.coverAtStart ? 'true' : 'false'}) {
    const cover = () => {
      const el = document.getElementById('vid-card')
      if (el) { el.style.transition = 'none'; el.style.opacity = '1' }
      else setTimeout(cover, 30)
    }
    cover()
  }
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

//  사무실 자재 재고 — 흉내 서버는 빈 값(0)만 돌려줍니다. 창고가 비어 있으면
//  병원에 용기를 드릴 수 없어(저장이 막힙니다) 「재고 차감」 줄이 영영 안
//  나옵니다. 촬영용 최소 수량으로 덮어씁니다 (video/fixture.mjs 참고).
await ctx.route('**/rest/v1/office_stock*', (r) => {
  if (r.request().method() !== 'GET') {
    state.writes.push({ url: 'office_stock', method: r.request().method() })
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  }
  const one = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
  return r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify(one ? FIX.officeStock : [FIX.officeStock]),
  })
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
//  녹화가 시작되는 순간 — Playwright 는 페이지가 생길 때부터 찍습니다.
//  이 시각이 있어야 「영상 파일의 시간이 실제 시간과 얼마나 어긋났는지」를
//  잴 수 있습니다 (아래 timeline 의 videoWallSec 설명).
const tVideo = Date.now()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
//  ⚠ 확인 물음은 브라우저가 그리는 것이라 **영상에는 찍히지 않습니다.**
//    손대지 않으면 Playwright 가 취소를 눌러 저장이 조용히 없던 일이 됩니다.
const dialogs = []
page.on('dialog', (d) => { dialogs.push(d.message().split('\n')[0]); void d.accept() })

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

/**
 * 얇게 되살린 왼쪽 목차가 실제로 몇 px 인지 재고, 왼쪽 아래 단계 표시를
 * 그 오른쪽으로 비켜 둡니다 — 목차는 짙은 남색이라 그 위에 얹으면 안 읽힙니다.
 */
let stageInfo = { asideW: 0, asidePct: 0, mainW: 0 }
async function measureStage() {
  stageInfo = await page.evaluate((edge) => {
    const a = document.querySelector('aside.sticky')
    const w = a ? Math.round(a.getBoundingClientRect().width) : 0
    const chip = document.getElementById('vid-chip')
    if (chip) chip.style.left = (w + edge) + 'px'
    const m = document.querySelector('main')
    const cap = document.getElementById('vid-cap')
    const cs = cap ? getComputedStyle(cap) : null
    return {
      asideW: w,
      asidePct: Number((w / window.innerWidth * 100).toFixed(1)),
      mainW: m ? Math.round(m.getBoundingClientRect().width) : 0,
      rootFontPx: Number(getComputedStyle(document.documentElement).fontSize.replace('px', '')),
      //  자막이 실제로 몇 px 로 그려지는지 — 설정값이 아니라 그려진 값입니다
      capFontPx: cs ? Number(cs.fontSize.replace('px', '')) : 0,
      //  maxWidth 는 % 로 적어 두므로 화면 폭을 곱해 px 로 적어 둡니다
      capMaxW: cs ? Math.round(window.innerWidth * parseFloat(cs.maxWidth) / 100) : 0,
    }
  }, ST.edgePx ?? 16)
}

const tPage = Date.now()
await page.goto(`${CFG.baseUrl}${FLOW_START.url}`, { waitUntil: 'domcontentloaded' })
await W.settle(page, state)
await page.locator(FLOW_START.ready).waitFor({ state: 'visible', timeout: 15000 })
await measureStage()
await page.waitForTimeout(FLOW_START.settle ?? 300)

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
  //  ⚠ Playwright 쪽 선택자(:has-text · >> nth=0 …)를 그대로 쓰려면 화면
  //    안에서 querySelector 로 찾으면 안 됩니다 — 그쪽 문법을 모릅니다.
  //    찾는 일은 Playwright 에 맡기고, 굴리는 일만 화면에 시킵니다.
  const el = page.locator(sel).first()
  await el.waitFor({ state: 'attached', timeout: 15000 })
  await el.evaluate((n, b) => n.scrollIntoView({ behavior: 'smooth', block: b }), block)
  await page.waitForTimeout(H.scroll ?? 420)
}

/** 커서를 그 자리로 옮기고, 눌리는 시늉을 낸 뒤, 실제로 누릅니다 */
async function point(sel, { click = true, fast = false } = {}) {
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
  //  ⚠ 첫 단추(투어 시작)만 빠르게 — 영상 첫 1초 안에 실제 AX 가 나와야
  //    합니다. 그 뒤 실제 AX 단추들은 눈으로 따라올 수 있는 속도로.
  const move = fast ? (H.introCursor ?? 110) : H.cursorMove
  const hold = fast ? 60 : (H.beforeClick ?? 130)
  await page.evaluate(([x, y, ms]) => window.__vid?.move(x, y, ms), [x, y, move])
  await page.waitForTimeout(move + (fast ? 20 : 60))
  await page.evaluate(() => window.__vid?.tap())
  await page.waitForTimeout(hold)
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
/**
 * 다섯 단계 중 몇 번째인가 — 마무리는 번호가 없습니다.
 *  ⚠ 0120 — **짧은 Demo 에서만** 씁니다(config 의 stepChips). 다른 영상은
 *    장면 이름이 s1·s2… 여도 「1/5」가 아니라 장면 이름만 답니다.
 */
const STEP_NO = CFG.stepChips === true ? { s1: 1, s2: 2, s3: 3, s4: 4, s5: 5 } : {}
/**
 * 직접 녹음한 음성일 때, 화면이 음성보다 늦은 장면들.
 *  ⚠ 늦으면 말이 화면보다 앞서 나갑니다 — 조용히 넘어가지 않고 적어 둡니다.
 *    고치는 법은 둘뿐입니다: marks 의 그 장면을 뒤로 미루거나, 녹음할 때
 *    장면 사이를 조금 더 쉬거나.
 */
const lags = []
/** 첫 장면이 영상 몇 초에 시작했는가 — 뒤 장면은 전부 여기에 더해 맞춥니다 */
let voBase = null
async function scene(id, { during = [], pad = H.padAfterVoice, spread = false, caption = true } = {}) {
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
  if (spread) {
    //  ── 짚을 곳이 자막 조각보다 많을 때 (0119) ───────────────────────────
    //   자막은 제 시각에 바뀌고, 짚는 동작은 **장면 길이에 고르게** 나눠
    //   놓습니다. 둘을 시각순으로 섞어 차례로 실행합니다.
    const evts = []
    let acc0 = 0
    for (const cue of sc.cues) { evts.push({ ms: acc0, run: () => page.evaluate((l) => window.__vid?.say(l), cue.lines) }); acc0 += cue.ms }
    const span = sc.sec * 1000
    during.forEach((fn, i) => evts.push({ ms: Math.round((i * span) / during.length), run: fn, act: true }))
    //  같은 시각이면 자막이 먼저 — 말과 화면이 어긋나 보이지 않게.
    evts.sort((a, b) => (a.ms - b.ms) || ((a.act ? 1 : 0) - (b.act ? 1 : 0)))
    for (const e of evts) {
      const left = t0 + e.ms - Date.now()
      if (left > 0) await page.waitForTimeout(left)
      if (e.act || caption) await e.run()
    }
    const left = t0 + span - Date.now()
    if (left > 0) await page.waitForTimeout(left)
  } else {
    let acc = 0
    let ai = 0
    for (const cue of sc.cues) {
      if (caption) await page.evaluate((l) => window.__vid?.say(l), cue.lines)
      acc += cue.ms
      if (during[ai]) { await during[ai](); ai += 1 }
      const left = t0 + acc - Date.now()
      if (left > 0) await page.waitForTimeout(left)
    }
    //  남은 동작이 있으면 말이 끝난 뒤에라도 마저 합니다.
    while (during[ai]) { await during[ai](); ai += 1 }
  }
  //  ⚠ 직접 녹음일 때는 여기서 더 쉬지 않습니다 — 다음 장면 시작 시각이
  //    녹음에 이미 박혀 있어서, 남는 시간은 그 앞에서 알아서 기다립니다.
  if (!VO && pad) await page.waitForTimeout(pad)
  await page.evaluate(() => window.__vid?.sayOff())
}

console.log('── 녹화 ──')

// ── 흐름 ────────────────────────────────────────────────────────────────────
//   무엇을 어떤 순서로 누르고 짚을지는 **흐름 파일**에 있습니다.
//   이 파일(엔진)은 무대·커서·강조·자막·흉내 서버까지만 맡습니다.
//
//     flows/short-demo.mjs      50초 심사 시연 — 제품의 그 투어를 그대로 녹화
//     flows/evidence-guide.mjs  경영진용 — 투어 없이 화면을 직접 돕니다
//
//   config 의 flow 에 적힌 파일을 불러옵니다.
await runFlow({
  page, CFG, H, ST, F, FIX, C0, VO, VOICE,
  at, mark, scene, point, bring, advance, expect, stepNo, checkSpot,
  sleep: (ms) => page.waitForTimeout(ms),
  spot: async (sel, opt = {}) => {
    const el = page.locator(sel).first()
    await el.waitFor({ state: 'visible', timeout: 15000 })
    //  화면 밖이면 먼저 굴려 놓습니다 — 안 보이는 곳을 강조할 수는 없습니다.
    const seen = await el.evaluate((n) => {
      const r = n.getBoundingClientRect()
      return r.top >= 6 && r.bottom <= window.innerHeight - 6
    })
    if (!seen && opt.bring !== false) {
      await el.evaluate((n, b) => n.scrollIntoView({ behavior: 'smooth', block: b }), opt.block ?? 'center')
      await page.waitForTimeout(H.scroll ?? 320)
    }
    const r = await el.boundingBox()
    await page.evaluate(([rect, p]) => window.__vid?.spotRect(rect, p), [r, opt.pad ?? 10])
  },
  spotOff: () => page.evaluate(() => window.__vid?.spotOff()),
  card: (lines, foot) => page.evaluate(([l, f]) => window.__vid?.card(l, f), [lines, foot ?? null]),
  cardOff: (ms) => page.evaluate((m) => window.__vid?.cardOff(m), ms ?? 250),
  veil: (lines) => page.evaluate((l) => window.__vid?.veil(l), lines),
  veilOff: () => page.evaluate(() => window.__vid?.veilOff()),
  chip: (t) => page.evaluate((x) => window.__vid?.chip(x), t ?? null),
  voiceSec: (id) => VOICE.scenes.find((x) => x.id === id)?.sec ?? 0,
})

//  ── 꼬리 ────────────────────────────────────────────────────────────────
//   직접 녹음이면 마지막 말이 끝나는 시각(endSec)까지 화면을 붙잡아 둔 뒤,
//   **말이 끝난 자리에서** outroTail 만큼 더 보여 줍니다. 고정된 몇 초가
//   아닙니다 — 녹음이 길든 짧든 꼬리는 같습니다.
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
//  ⚠ 0118 — **여기서 시각을 찍습니다.**
//    녹화는 페이지가 실제로 닫히는 순간 멈춥니다. 그 순간은 ctx.close() 가
//    끝나는 때입니다 — 닫으라고 이르기 **전**에 찍으면 뒷정리 시간(0.5초쯤)만큼
//    모자라고, 브라우저까지 다 닫은 **뒤**에 찍으면 그만큼 남습니다.
//    앞의 것으로 쟀더니 앞부분을 0.5초 더 잘라 내 시작 화면이 통째로
//    사라졌습니다. 둘 사이의 이 자리가 맞습니다.
const tClose = Date.now()
await b.close()

const raw = await video.path()
const webm = join(OUT, CFG.out.webm)
try { rmSync(webm) } catch { /* 처음이면 없습니다 */ }
renameSync(raw, webm)
//  녹화 파일이 두 개 남지 않게 (앞선 실행이 남긴 무작위 이름)
for (const f of readdirSync(OUT)) {
  if (f.endsWith('.webm') && f !== CFG.out.webm) rmSync(join(OUT, f))
}

const timeline = {
  tenant: CFG.tenant,
  flow: FLOW,
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
  //  ── 영상 파일의 시간이 실제 시간과 어긋나는 문제 (0118) ──────────────
  //   Playwright 가 남기는 webm 은 **실제로 흐른 시간과 길이가 다릅니다.**
  //   화면이 멈춰 있으면 프레임을 덜 만들고, 그것을 되살리면서 길이가
  //   1~2% 씩 늘어납니다. 54초 영상에서 1초쯤 어긋났습니다.
  //
  //   그래서 「끝에서 되짚기」도 「앞에서 세기」도 어긋났습니다. 대신
  //   **실제로 흐른 시간**을 여기에 남기고, 합칠 때(mux) 영상 시간을 그
  //   비율로 되돌린 뒤 자릅니다. 그러면 자르는 자리도 장면 시각도 맞습니다.
  videoWallSec: Number(((tClose - tVideo) / 1000).toFixed(2)),
  readyOffsetSec: Number(((tReady - tVideo) / 1000).toFixed(2)),
  bodySec: Number(((tEnd - tReady) / 1000).toFixed(2)),
  //  ── 음성을 어디에 붙일지 ────────────────────────────────────────────
  //   장면마다 「영상 몇 초 자리에서 시작하는가」입니다. mux 가 이 값으로
  //   wav 를 제자리에 놓습니다. 화면과 말이 어긋날 수 없는 이유가 이것입니다.
  voice: {
    provider: VOICE.provider, dir: VOICE_DIR, scenes: audio,
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
    //  화면 구성 — 목차 폭·본문 폭·기준 글자 크기 (숫자로 남겨 둡니다)
    stage: stageInfo,
    //  직접 녹음일 때, 화면이 음성보다 늦은 장면 (없어야 정상)
    voiceLag: lags,
    //  화면이 물어본 확인 (자재 수량 등) — 받아 넘긴 것을 남겨 둡니다
    dialogs,
  },
}
writeFileSync(join(OUT, CFG.out.timeline), JSON.stringify(timeline, null, 2))

console.log('')
console.log(`  webm      ${webm}`)
console.log(`  본문 길이 ${timeline.bodySec}초 (말 ${VOICE.totalSec.toFixed(1)}초)`)
console.log(`  화면      ${CFG.viewport.width}x${CFG.viewport.height} → ${(CFG.output ?? CFG.viewport).width}x${(CFG.output ?? CFG.viewport).height}`)
console.log(`  목차      ${stageInfo.asideW}px (화면의 ${stageInfo.asidePct}%) · 본문 ${stageInfo.mainW}px · 기준 글자 ${stageInfo.rootFontPx}px`)
console.log(`  자막      ${stageInfo.capFontPx}px · 최대 폭 ${stageInfo.capMaxW}px`)
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
