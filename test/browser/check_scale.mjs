import { chromium, EXEC } from './_pw.mjs'
import * as W from './walk_lib.mjs'
import { measure } from './a11y_measure.mjs'

// ─────────────────────────────────────────────────────────────────────────────
//  글자 크기 × 화면 폭 (0080)
//
//  두 자리를 지킵니다. 둘 다 「재 본 적이 없던」 자리라 그동안 조용히 나빴습니다.
//
//   ① 「큰 글씨」로 켠 폰 — 50~60대가 실제로 켜는 설정입니다. 여기서 글자가
//      잘리거나 화면이 가로로 밀리면, 정작 글씨를 키운 사람만 더 못 씁니다.
//   ② 접는 폰을 편 폭(673px)·작은 태블릿(768px) — Tailwind 의 sm:(640px)을
//      넘는 순간 「노트북」 취급을 받아 root 글자가 17.8px → 15.8px 로
//      **작아져** 있었습니다.
//
//  ⚠ 이 검사는 **통과시키려고 기준을 낮추지 않습니다.** 작은 글자 기준 16px,
//    대비 기준은 WCAG 그대로(보통 4.5:1 · 큰 글자 3:1), 손가락 기준 44px 입니다.
// ─────────────────────────────────────────────────────────────────────────────

let pass = 0
let fail = 0
//  ⚠ 통과한 줄도 찍습니다. run.sh 는 「 OK 」/「FAIL」 줄 수로 검사 건수를 세고,
//    한 건도 못 세면 **터진 스위트**로 봅니다 — 조용히 0/0 통과하지 않게.
const ok = (name, cond, detail = '') => {
  if (cond) pass += 1
  else fail += 1
  console.log(`${cond ? ' OK ' : 'FAIL'} | ${name}${detail && !cond ? ` — ${detail}` : ''}`)
}

const b = await chromium.launch({ executablePath: EXEC })

//  현장 담당자가 실제로 도는 화면 + 병원 담당자 첫 화면
const SCREENS = [
  ['field', '오늘 일정', '/today'],
  ['field', '수거 입력', '/collection'],
  ['field', '향후 일정', '/schedule'],
  ['field', '거래처', '/clients'],
  ['client', '병원 첫 화면', '/portal'],
]
//  [폭, 글자크기, 이름]
const CASES = [
  [390, 'normal', '폰 · 기본'],
  [390, 'lg', '폰 · 크게'],
  [390, 'xl', '폰 · 매우 크게'],
  [673, 'normal', '접는 폰 · 기본'],
  [768, 'normal', '태블릿 · 기본'],
  [768, 'xl', '태블릿 · 매우 크게'],
]

/** 가로로 삐져나갔는가 · 글자가 잘렸는가 */
async function layout(p) {
  return await p.evaluate(() => {
    const docW = document.documentElement.clientWidth
    //  ⚠ 가로로 미는 띠(overflow-x:auto) 안의 칸은 원래 화면 밖에 있습니다.
    //    그걸 「삐졌다」고 세면 날짜 띠 전체가 잡힙니다 — 자가 틀린 것입니다.
    const inScroller = (el) => {
      let n = el.parentElement
      while (n && n !== document.documentElement) {
        const ox = getComputedStyle(n).overflowX
        if (ox === 'auto' || ox === 'scroll') return true
        n = n.parentElement
      }
      return false
    }
    const out = []
    const clipped = []
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect()
      const s = getComputedStyle(el)
      if (r.width === 0 || r.height === 0 || s.visibility === 'hidden' || s.display === 'none') continue
      const label = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 24)
      if ((r.right > docW + 1 || r.left < -1) && !inScroller(el)) {
        out.push(`${el.tagName} [${Math.round(r.left)}..${Math.round(r.right)}] "${label}"`)
      }
      const hid = s.overflowX === 'hidden' || s.overflow === 'hidden' || s.textOverflow === 'ellipsis'
      const has = [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? '').trim())
      if (hid && has && el.scrollWidth > el.clientWidth + 1) clipped.push(`${el.scrollWidth}>${el.clientWidth} "${label}"`)
    }
    return {
      push: document.documentElement.scrollWidth - docW,
      out: [...new Set(out)].slice(0, 4),
      clipped: [...new Set(clipped)].slice(0, 4),
      rootPx: Math.round(parseFloat(getComputedStyle(document.documentElement).fontSize) * 10) / 10,
    }
  })
}

for (const [width, scale, caseName] of CASES) {
  for (const [role, screen, path] of SCREENS) {
    //  병원 담당자는 /portal 만, 현장 담당자는 나머지만 봅니다
    if ((role === 'client') !== path.startsWith('/portal')) continue
    const prof = { ...W.profileFor(role), font_scale: scale }
    const state = { profile: prof, reqs: 0, writes: [] }
    const ctx = await b.newContext({ viewport: { width, height: 880 }, isMobile: width < 640, hasTouch: true })
    W.wire(ctx, state)
    const p = await ctx.newPage()
    await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
      access_token: 't', token_type: 'bearer', expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
    })), ['beonemirae-ops:auth', { id: prof.id, aud: 'authenticated', email: prof.email, app_metadata: {}, user_metadata: {} }])
    await p.goto(`${W.BASE}${path}`, { waitUntil: 'domcontentloaded' })
    await W.settle(p, state)
    await p.waitForTimeout(400)

    const tag = `${caseName} · ${screen}`
    const L = await layout(p)
    const m = await measure(p)

    ok(`${tag} — 가로로 밀리지 않음`, L.push <= 0, `${L.push}px`)
    ok(`${tag} — 화면 밖으로 나간 칸 없음`, L.out.length === 0, L.out.join(' | '))
    ok(`${tag} — 잘린 글자 없음`, L.clipped.length === 0, L.clipped.join(' | '))
    ok(`${tag} — 16px 미만 글자 없음`, m.small === 0, m.smallList.join(' | '))
    ok(`${tag} — 대비 기준 미달 없음`, m.gray === 0, m.grayList.slice(0, 4).join(' | '))
    ok(`${tag} — 44px 미만 누를 것 없음`, m.tooSmall === 0, m.tooSmallList.join(' | '))
    //  ⚠ 크기만 크면 되는 것이 아닙니다. 두 단추가 8px 도 안 떨어져 있으면
    //    손가락이 굵은 분은 **옆 것을 누릅니다.** 「저장」 옆에 「취소」가
    //    붙어 있는 화면이 그래서 위험합니다.
    ok(`${tag} — 누를 것끼리 8px 이상 떨어져 있음`, m.tight === 0, `붙은 쌍 ${m.tight}개`)

    //  ⚠ 640~1023px 에서 **폰과 같은 root** 를 쓰는지 못 박아 둡니다. 이 값이
    //    다시 15.8px 로 내려가면 위 여섯 줄이 한꺼번에 무너집니다 — 그때
    //    「왜 무너졌는지」를 다시 찾지 않도록 원인 자체를 검사합니다.
    if (width >= 640 && width < 1024) {
      const want = { normal: 17.8, lg: 19.6, xl: 21.4 }[scale]
      ok(`${tag} — 접는 폰 폭에서 폰과 같은 글자 크기(${want}px)`, Math.abs(L.rootPx - want) < 0.2, `root ${L.rootPx}px`)
    }
    await ctx.close()
  }
}

//  ── 시계 한 줄이 화면을 밀지 않는가 (0078 회귀) ──────────────────────────
//   병원 포털을 「매우 크게」로 켠 폰에서 시계 한 줄이 nowrap 이라 페이지
//   전체가 가로로 밀렸습니다. 아래 탭까지 밀려 「이력」이 화면 밖으로 나갔습니다.
{
  const prof = { ...W.profileFor('client'), font_scale: 'xl' }
  const state = { profile: prof, reqs: 0, writes: [] }
  const ctx = await b.newContext({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true })
  W.wire(ctx, state)
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: prof.id, aud: 'authenticated', email: prof.email, app_metadata: {}, user_metadata: {} }])
  await p.goto(`${W.BASE}/portal`, { waitUntil: 'domcontentloaded' })
  await W.settle(p, state)
  await p.waitForTimeout(400)
  const r = await p.evaluate(() => {
    const el = document.querySelector('[data-live-clock]')
    if (!el) return null
    return {
      push: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      right: Math.round(el.getBoundingClientRect().right),
      docW: document.documentElement.clientWidth,
      text: (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
    }
  })
  ok('360px 매우 크게 · 병원 포털 — 시계가 있음', r !== null)
  if (r) {
    ok('360px 매우 크게 · 병원 포털 — 시계가 화면을 밀지 않음', r.push <= 0, `${r.push}px 밀림`)
    ok('360px 매우 크게 · 병원 포털 — 시계가 화면 안에 있음', r.right <= r.docW + 1, `${r.right} > ${r.docW}`)
    //  접혀도 **분·초까지** 다 보여야 합니다 — 줄바꿈은 글자를 지우는 것이 아닙니다
    ok('360px 매우 크게 · 병원 포털 — 접혀도 초까지 보임', /\d{1,2}:\d{2}:\d{2}/.test(r.text), r.text)
  }
  await ctx.close()
}

//  ── 가로로 든 폰 (0080) ──────────────────────────────────────────────────
//   트럭 안에서는 폰을 가로로 듭니다. 그러면 화면 높이가 390px 뿐인데,
//   위·아래 붙박이 띠가 그대로면 일할 자리가 거의 안 남습니다.
//   재 보니 붙박이가 화면의 41%(「매우 크게」는 46%)를 먹고 있었습니다.
//   ⚠ 「줄였다」가 아니라 **얼마나 남는지**를 못 박습니다. 남는 높이는
//     세로로 든 폰의 값이 아니라 **일할 수 있는 최소치**로 잡습니다.
for (const [scale, want] of [['normal', 0.34], ['xl', 0.38]]) {
  const prof = { ...W.profileFor('field'), font_scale: scale }
  const state = { profile: prof, reqs: 0, writes: [] }
  const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true })
  W.wire(ctx, state)
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: prof.id, aud: 'authenticated', email: prof.email, app_metadata: {}, user_metadata: {} }])
  await p.goto(`${W.BASE}/today`, { waitUntil: 'domcontentloaded' })
  await W.settle(p, state)
  await p.waitForTimeout(400)
  const r = await p.evaluate(() => {
    const bits = []
    let stuck = 0
    for (const el of document.querySelectorAll('body *')) {
      const st = getComputedStyle(el)
      if (st.position !== 'fixed' && st.position !== 'sticky') continue
      const bb = el.getBoundingClientRect()
      if (bb.height === 0 || bb.width === 0) continue
      if (bb.top > 4 && bb.bottom < window.innerHeight - 4) continue
      if (bits.some((x) => x.el.contains(el))) continue
      bits.push({ el, h: Math.round(bb.height) })
      stuck += bb.height
    }
    //  ⚠ 시계는 화면에 **두 벌** 있습니다(세로용 한 줄 / 가로용 머리줄 안).
    //    첫 번째를 집으면 지금 숨어 있는 쪽을 집을 수 있습니다 —
    //    「보이는 것」을 찾아야 합니다.
    const clock = [...document.querySelectorAll('[data-live-clock]')].find((el) => {
      const q = el.getBoundingClientRect()
      const st = getComputedStyle(el)
      return q.width > 0 && q.height > 0 && st.visibility !== 'hidden' && st.display !== 'none'
    })
    const cb = clock?.getBoundingClientRect()
    return {
      vh: window.innerHeight,
      stuck: Math.round(stuck),
      //  ⚠ 시계는 가로 화면에서도 **보여야** 합니다. 자리가 좁다고 뺄 것이
      //    아닙니다 — 「어느 계정이든 오늘 날짜와 지금 시각」이 요구사항입니다.
      clockShown: !!(cb && cb.width > 0 && cb.height > 0),
      clockText: (clock?.textContent ?? '').replace(/\s+/g, ' ').trim(),
      //  누를 것이 손가락 기준 아래로 내려가지 않았는지
      minTap: Math.min(...[...document.querySelectorAll('[data-nav-tab]')]
        .map((el) => Math.round(el.getBoundingClientRect().height))),
    }
  })
  const tag = `가로로 든 폰 844×390 · ${scale}`
  const pct = r.stuck / r.vh
  ok(`${tag} — 붙박이 띠가 화면의 ${Math.round(want * 100)}% 를 넘지 않음`,
    pct <= want, `${r.stuck}px / ${r.vh}px = ${Math.round(pct * 100)}%`)
  ok(`${tag} — 일할 자리가 250px 이상 남음`, r.vh - r.stuck >= 250, `${r.vh - r.stuck}px`)
  ok(`${tag} — 시계가 그대로 보임`, r.clockShown, '가로에서는 머리줄 안으로 옮겨 답니다')
  ok(`${tag} — 시계에 초까지 나옴`, /\d{1,2}:\d{2}:\d{2}/.test(r.clockText), r.clockText)
  ok(`${tag} — 아래 탭이 손가락 기준(44px) 이상`, r.minTap >= 44, `${r.minTap}px`)
  await ctx.close()
}

await b.close()
console.log(`check_scale :: 검사 ${pass + fail} · 실패 ${fail}`)
process.exit(fail ? 1 : 0)
