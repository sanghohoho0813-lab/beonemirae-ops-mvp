//  ─────────────────────────────────────────────────────────────────────────
//  「눌러서 도는」 전수 점검의 공용 부품
//
//   ⚠ 왜 이걸 따로 만드는가 —
//     지금까지의 검사는 대부분 **주소를 직접 쳐서** 화면을 열었습니다.
//     그런데 0071 에서 찾은 결함(오늘 일정 → 병원 줄 → 수거 입력에서 저장이
//     영영 꺼짐)은 **주소로 열면 멀쩡하고, 눌러 들어가야만** 드러났습니다.
//     자료가 이미 들어와 있느냐 아니냐로 화면 상태가 갈리기 때문입니다.
//
//     그래서 이 부품은 **한 번만 주소를 칩니다(첫 화면).** 그다음부터는
//     사람처럼 눌러서만 돌아다닙니다.
//  ─────────────────────────────────────────────────────────────────────────
import * as F from './perf_fixtures.mjs'

export const BASE = 'http://localhost:4173'

/** 역할별 로그인 계정 — 시늉본 프로필을 역할만 바꿔 씁니다 */
export function profileFor(role) {
  const base = { ...F.profile, role }
  if (role === 'field') return { ...base, name: '김준기', vehicle_id: 'v1', client_id: null }
  if (role === 'client') return { ...base, name: '병원 담당자', client_id: F.clients[0].id, vehicle_id: null }
  if (role === 'office') return { ...base, name: '홍현주', vehicle_id: null, client_id: null }
  return { ...base, name: '대표', vehicle_id: null, client_id: null }
}

/** 서버 흉내 — 쓰기(POST/PATCH/DELETE)는 **성공한 척**만 하고 실제로는 안 바꿉니다 */
export function wire(ctx, state) {
  const me = state.profile
  ctx.route('**/auth/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: F.UID, aud: 'authenticated', email: me.email, app_metadata: {}, user_metadata: {} }) }))
  ctx.route('**/rest/v1/**', (r) => {
    const req = r.request()
    const url = req.url()
    const method = req.method()
    const single = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const q = new URL(url).searchParams
    const off = Number(q.get('offset') ?? 0)
    const lim = Number(q.get('limit') ?? 0)
    state.reqs += 1
    if (method !== 'GET') state.writes.push({ url: url.split('/rest/v1/')[1]?.slice(0, 60), method })
    const page = (rows) => r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify(lim > 0 ? rows.slice(off, off + lim) : rows) })
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    if (url.includes('/rpc/app_schema_version')) return json(state.schemaVersion ?? 72)
    //  읽기 RPC 는 빈 값, 쓰기 RPC 는 성공한 척
    if (url.includes('/rpc/')) return json(state.rpc?.(url, req) ?? null)
    if (method !== 'GET') return json(single ? {} : [])
    if (url.includes('/profiles')) return json(single ? me : [me])
    if (url.includes('/site_notes')) return page(F.notes)
    //  ⚠ 공용 자료는 화·금에만 수거가 있습니다. 오늘이 토·일이면 「오늘 일정」이
    //    비어서, 오늘 흐름을 재는 검사가 **누를 것을 못 찾습니다.**
    //    부르는 쪽에서 오늘치를 끼워 넣을 수 있게 열어 둡니다.
    if (url.includes('/schedules')) return page(state.schedules ?? F.schedules)
    if (url.includes('/materials')) return page(F.materials)
    if (url.includes('/payment_receipts')) return page(F.receipts)
    if (url.includes('/payments')) return page(F.payments)
    if (url.includes('/client_prices')) return page(F.prices)
    if (url.includes('/operating_costs')) return page(F.costs)
    if (url.includes('/vehicles')) return page(F.vehicles)
    if (url.includes('/vehicle_reservations')) return json([])
    if (url.includes('/client_assignments')) return json([])
    if (url.includes('/clients')) return single ? json(F.clients[0]) : page(F.clients)
    if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
    return json([])
  })
}

/** 화면이 잠잠해질 때까지 */
export async function settle(page, state, quietMs = 600, capMs = 20000) {
  let last = state.reqs
  let quiet = Date.now()
  const t0 = Date.now()
  for (;;) {
    await page.waitForTimeout(90)
    if (state.reqs !== last) { last = state.reqs; quiet = Date.now() }
    else if (Date.now() - quiet >= quietMs) return
    if (Date.now() - t0 > capMs) return
  }
}

/**
 *  지금 화면에서 **눌러 볼 만한 것**을 셉니다.
 *   ⚠ 안 보이는 것은 세지 않습니다 (폰용·PC용이 같이 들어 있는 화면이 있습니다).
 *   ⚠ 로그아웃·삭제처럼 되돌리기 어려운 것은 건드리지 않습니다.
 */
export const SKIP = /로그아웃|나가기|삭제|지우기|되돌리|초기화|내보내기|인쇄|다운로드|취소하기/
export async function targets(page, max = 40) {
  return await page.evaluate(({ skipSrc, max }) => {
    const skip = new RegExp(skipSrc)
    const vis = (el) => {
      const r = el.getBoundingClientRect()
      const s = getComputedStyle(el)
      return r.width > 2 && r.height > 2 && s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0'
    }
    const out = []
    const seen = new Set()
    const nodes = [...document.querySelectorAll('button, a[href], [role="button"]')]
    for (const el of nodes) {
      if (!vis(el)) continue
      if (el.disabled) continue
      const label = (el.innerText || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 30)
      if (!label) continue
      if (skip.test(label)) continue
      const key = `${el.tagName}|${label}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ label, tag: el.tagName })
      if (out.length >= max) break
    }
    return out
  }, { skipSrc: SKIP.source, max })
}

/**
 *  ⚠ 누르기 전에 화면을 굴려 놓으면, **굴린 것 자체가** 「달라졌다」로 잡혀
 *    죽은 단추를 못 찾습니다. 그래서 두 걸음으로 나눕니다:
 *      ① focusLabel — 눈에 들어오게 굴려만 놓습니다
 *      ② (여기서 「누르기 전」 지문을 뜹니다)
 *      ③ pressLabel — 굴리지 않고 누르기만 합니다
 */
const FINDER = `(lb) => {
  const vis = (el) => {
    const r = el.getBoundingClientRect(); const s = getComputedStyle(el)
    return r.width > 2 && r.height > 2 && s.display !== 'none' && s.visibility !== 'hidden'
  }
  return [...document.querySelectorAll('button, a[href], [role="button"]')]
    .find((e) => vis(e) && !e.disabled
      && (e.innerText || e.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim().slice(0, 30) === lb)
}`

/** ① 눈에 들어오게 굴려만 놓습니다 (누르지 않습니다) */
export async function focusLabel(page, label) {
  return await page.evaluate(([lb, src]) => {
    const find = eval(src)
    const el = find(lb)
    if (!el) return null
    el.scrollIntoView({ block: 'center' })
    const href = el.getAttribute('href') ?? ''
    let dest = ''
    try { dest = href ? new URL(href, location.origin).pathname : '' } catch { dest = '' }
    //  ⚠ 「어디로 가는지 표에 적혀 있는」 링크는 죽은 단추가 아닙니다.
    //    바깥 주소(올바로 시스템)·전화·메일·새 탭이 그렇습니다.
    //    프로그램이 누르면 브라우저가 새 탭을 팝업으로 막아 버려서, 이 창에서는
    //    아무 일도 안 일어난 것처럼 보입니다. 표시를 보고 넘어갑니다.
    const outward = el.tagName === 'A' && (
      el.getAttribute('target') === '_blank'
      || /^(https?:|tel:|mailto:)/i.test(href)
    )
    return { dest, href, outward, sameHere: dest !== '' && dest === location.pathname }
  }, [label, FINDER])
}

/** ③ 굴리지 않고 누르기만 합니다 */
export async function pressLabel(page, label) {
  return await page.evaluate(([lb, src]) => {
    const find = eval(src)
    const el = find(lb)
    if (!el) return false
    el.click()
    return true
  }, [label, FINDER])
}

/** 굴리고 나서 바로 누릅니다 (경로를 되짚어 갈 때만 씁니다) */
export async function clickLabel(page, label) {
  const f = await focusLabel(page, label)
  if (!f) return null
  await page.waitForTimeout(120)
  const ok = await pressLabel(page, label)
  return ok ? { ok: true, ...f } : null
}

/**
 *  화면 상태 지문 — 눌러서 **무언가 달라졌는지** 판단할 재료
 *
 *  ⚠ 처음에는 `main` 의 글자만 봤습니다. 그러니 「도움말」·「더보기」처럼
 *    **main 밖에 시트를 여는** 단추가 전부 「무반응」으로 잡혔습니다.
 *    실제로는 화면 절반을 덮는 시트가 떴는데도요. 자가 틀리면 그 뒤 숫자는
 *    전부 못 믿습니다. **문서 전체**를 봅니다.
 *
 *  ⚠ 그리고 「길이가 12자 넘게 바뀌었나」로 봤더니, 접힘 한 칸이 열리며
 *    딱 12자 늘어난 것을 「안 바뀌었다」고 셌습니다. 길이 대신 **글자 자체**를
 *    비교합니다.
 */
export async function snap(page) {
  return await page.evaluate(() => {
    const clean = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
    const main = clean(document.querySelector('main')?.innerText)
    const body = clean(document.body?.innerText)
    //  긴 글을 통째로 들고 다니지 않도록 짧은 지문으로 접습니다
    const fp = (s) => { let h = 0; for (let i = 0; i < s.length; i += 1) { h = (h * 31 + s.charCodeAt(i)) | 0 } return `${s.length}:${h}` }
    return {
      path: location.pathname + location.search,
      //  ⚠ 홈페이지의 「서비스」·「문의」 같은 것은 **같은 쪽 안에서 굴러
      //    내려가는** 링크입니다. 글자는 그대로라 「무반응」으로 잡혔습니다.
      //    굴린 자리도 지문에 넣습니다.
      scroll: Math.round(window.scrollY),
      hash: location.hash,
      mainFp: fp(main),
      bodyFp: fp(body),
      head: main.slice(0, 400),
      dialogs: document.querySelectorAll('[role="dialog"], [data-sheet], [data-modal]').length,
      //  ⚠ 「빈 화면」은 **문서 전체**로 봅니다. main 만 보면, Layout 밖에
      //    독립으로 그리는 화면(모바일 미리보기 등)이 전부 빈 화면으로
      //    잡힙니다 — 실제로는 멀쩡히 그려져 있는데도요.
      //  ⚠ 글자가 거의 없어도 그림·틀(iframe)로 채운 화면이 있습니다.
      //    그것도 빈 화면이 아닙니다.
      blank: body.length < 15 && ![...document.querySelectorAll('iframe, canvas, svg, img, video')]
        .some((e) => { const r = e.getBoundingClientRect(); return r.width > 40 && r.height > 40 }),
    }
  })
}

/** 두 지문이 **완전히 같은가** — 같으면 눌러도 아무 일이 없었던 것입니다 */
export function same(a, b) {
  return a.path === b.path && a.mainFp === b.mainFp && a.bodyFp === b.bodyFp
    && a.dialogs === b.dialogs && a.scroll === b.scroll && a.hash === b.hash
}

export const ERR = /오류|실패|에러|다시 시도|권한이 없|불러오지 못|저장할 수 없|문의해|없습니다\.$/
