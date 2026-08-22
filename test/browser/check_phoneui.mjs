import { chromium, EXEC } from './_pw.mjs'

//  폰 화면 — 「글자가 세로로 늘어지지 않는가」와 「얼마나 밀어야 하는가」.
//
//   대표님이 실제로 겪으신 두 가지입니다.
//
//    ① 오늘 일정에서 병원 이름이 **한 자씩 세로로** 늘어졌습니다. 좁은
//       화면에서 flex 한 줄에 다섯 개를 늘어놓으니 마지막 칸에 글자 한 자
//       폭만 남아서입니다.
//    ② 「더보기」를 열면 매일 안 쓰는 것들이 맨 위에 있어, 목차를 보려면
//       한참 밀어야 했습니다.
//
//   그래서 이 검사는 **재는 것**을 합니다 — 세로 글자 탐지기와 스크롤 길이.
//   눈으로 보고 「괜찮네」 하는 것으로는 다음에 또 생깁니다.

const BASE = 'http://localhost:4173'
const UID = '00000000-0000-0000-0000-0000000000ad'
const TODAY = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
const out = []
const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  out.push(c)
  if (!c) process.exitCode = 1
}
const flat = (s) => (s ?? '').replace(/\s+/g, ' ')

const me = {
  id: UID, email: 'a@b.c', name: '대표', role: 'admin', font_scale: 'normal',
  active: true, approved_at: '2026-01-01T00:00:00Z', client_id: null, created_at: '2026-01-01T00:00:00Z',
}
const CA = '00000000-0000-0000-0000-0000000000a1'
//  실제로 문제가 났던 이름 그대로 — 길고 띄어쓰기가 없습니다.
const clients = [{
  id: CA, name: '[검증]한마음요양병원', type: '요양병원', address: '서울 양천구 목동로 55', manager: '검증담당',
  phone: '', collection_cycle: '주 3회', collects_medical_waste: true, collects_diaper: true,
  storage_size: '보통', note: '', is_demo_generated: false, demo_session_id: null, active: true,
  contract_start: '2025-01-01', contract_end: null, payment_terms: '', payment_due_day: 25, pricing: {},
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  collect_time: '', disposal_site: '', diaper_cycle: '',
}]
const requests = [{
  id: 'r1', client_id: CA, kind: '추가수거', status: '접수', urgent: true, memo: '',
  created_at: `${TODAY}T01:00:00Z`, updated_at: `${TODAY}T01:00:00Z`, requested_date: TODAY,
  clients: { name: '[검증]한마음요양병원' },
}]

const b = await chromium.launch({ executablePath: EXEC })

function wire(ctx, role = 'admin') {
  ctx.route('**/auth/v1/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: UID, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }) }))
  ctx.route('**/rest/v1/**', (r) => {
    const url = r.request().url()
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const pf = { ...me, role }
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    if (url.includes('/rpc/app_schema_version')) return json(64)
    if (url.includes('/profiles')) return json(single ? pf : [pf])
    if (url.includes('/client_requests')) return json(requests)
    if (url.includes('/clients')) return json(single ? clients[0] : clients)
    if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
    return json([])
  })
}
async function open(ctx, path) {
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: UID, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }])
  await p.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(2600)
  return p
}

/**
 * 세로로 늘어진 글자 찾기.
 *
 *  글자가 든 칸이 **한 글자 폭만큼 좁은데 여러 줄 높이**면 세로로 늘어진
 *  것입니다. 「한 자씩 아래로」가 정확히 이 모양입니다.
 */
const findVertical = (p) =>
  p.evaluate(() => {
    const bad = []
    for (const el of document.querySelectorAll('span, p, b, div, td, li, h1, h2, h3, button, a')) {
      //  자식이 또 글자를 들고 있으면 그 자식에서 잽니다 (이중 집계 방지)
      const own = [...el.childNodes]
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent.trim())
        .join('')
      if (own.length < 3) continue
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      const fs = parseFloat(getComputedStyle(el).fontSize) || 16
      //  글자 두 자 폭보다 좁은데 세 줄보다 높으면 세로로 늘어진 것입니다.
      if (r.width < fs * 2.2 && r.height > fs * 3) {
        bad.push(`${own.slice(0, 14)} (${Math.round(r.width)}×${Math.round(r.height)}px, 글자 ${Math.round(fs)}px)`)
      }
    }
    return bad
  })

/**
 * 「몇 화면만큼 밀어야 하는가」.
 *
 *  더보기는 바닥 시트 안에서 **자기 스크롤 통**을 따로 씁니다. 문서 전체를
 *  재면 시트 뒤에 있는 페이지를 재게 되어 아무리 펼쳐도 숫자가 안 바뀝니다.
 *  실제로 미는 그 통을 찾아서 잽니다.
 */
const sheetScrollLen = (p) =>
  p.evaluate(() => {
    const boxes = [...document.querySelectorAll('div')].filter((e) => {
      const st = getComputedStyle(e)
      return (st.overflowY === 'auto' || st.overflowY === 'scroll') && e.clientHeight > 200
    })
    const box = boxes.sort((a, b) => b.scrollHeight - a.scrollHeight)[0]
    if (!box) return null
    return Math.round((box.scrollHeight / box.clientHeight) * 10) / 10
  })

// ── 1. 오늘 일정 — 병원 이름이 세로로 안 늘어진다 ────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
  wire(ctx)
  const p = await open(ctx, '/today')
  ok((await p.locator('[data-request-banner]').count()) >= 1, '병원 요청 줄이 뜸')
  const bad = await findVertical(p)
  ok(bad.length === 0, '**세로로 늘어진 글자가 없음** — 예전에는 병원 이름이 한 자씩 내려갔습니다',
    bad.slice(0, 3).join(' / '))
  //  이름이 길면 세로로 늘어지는 대신 한 줄로 잘려야 합니다
  const line = await p.locator('[data-request-banner]:visible .truncate').first().evaluate((e) => ({
    h: Math.round(e.getBoundingClientRect().height),
    fs: Math.round(parseFloat(getComputedStyle(e).fontSize)),
  }))
  ok(line.h < line.fs * 2, '거래처 이름이 한 줄 — 넘치면 … 로 자름', `${line.h}px / 글자 ${line.fs}px`)
  await ctx.close()
}

// ── 2. 더보기 — 매일 쓰는 목차가 먼저 나온다 ─────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
  wire(ctx)
  const p = await open(ctx, '/')
  await p.locator('nav.fixed.bottom-0 button:has-text("더보기")').click()
  await p.waitForTimeout(1000)

  const topOf = async (sel) =>
    await p.locator(sel).first().evaluate((e) => Math.round(e.getBoundingClientRect().top + window.scrollY))
  const help = await topOf('[data-more-help]')
  const service = await topOf('[data-more-section="more-service"]')
  const showcaseTop = await topOf('[data-more-showcase]')

  ok(service < showcaseTop,
    '**병원 서비스 목차가 「발표·확인용」보다 위** — 매일 쓰는 것이 먼저',
    `서비스 ${service}px · 발표용 ${showcaseTop}px`)
  ok(help < service, '도움말은 맨 위 그대로')

  //  안내·요청 세 가지가 한 묶음, 두 칸 격자 (세 개면 두 줄)
  const helpCards = await p.locator('[data-more-help] .card, [data-more-help] [class*="card"]').evaluateAll(
    (els) => els.map((e) => Math.round(e.getBoundingClientRect().top)))
  ok(helpCards.length === 3, '사용 방법·만든 이유·개발자 요청이 한 묶음', String(helpCards.length))
  ok([...new Set(helpCards)].length === 2, '두 칸 격자 — 세 개가 두 줄', String([...new Set(helpCards)].length))
  ok(helpCards[0] === helpCards[1], '첫 두 개는 같은 줄에 나란히')
  //  「요청」이라는 별도 묶음은 사라졌습니다
  const sheetText = flat(await p.textContent('body'))
  ok(/안내 · 요청/.test(sheetText), '묶음 이름은 「안내 · 요청」')

  //  「PC 화면으로 보기」와 「시연용 핵심 요약」이 아래로 내려갔는가
  const pcTop = await topOf('[data-pc-view-open]')
  ok(pcTop > service, 'PC 화면으로 보기가 목차 아래로 내려감', `${pcTop}px`)
  await ctx.close()
}

// ── 3. 얼마나 밀어야 하는가 ──────────────────────────────────────────────
//   최종 목적은 「스크롤을 덜 내리는 것」입니다. 재서 확인합니다.
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
  wire(ctx)
  const p = await open(ctx, '/')
  await p.locator('nav.fixed.bottom-0 button:has-text("더보기")').click()
  await p.waitForTimeout(1000)
  const len = await sheetScrollLen(p)
  //  고친 뒤 실측 기준. 이 숫자가 커지면 무언가를 또 펼쳐 둔 것입니다.
  ok(len <= 4.2, `더보기 전체 길이가 화면 ${len}개 — 4.2개 이하`, `${len}개`)

  //  운영 도구를 펼치면 길어지는 것이 맞습니다. 대신 **접었을 때** 짧아야
  //  합니다 — 접기가 실제로 효과가 있는지 재서 확인합니다.
  await p.click('[data-more-toggle="more-tools"]')
  await p.waitForTimeout(400)
  const opened = await sheetScrollLen(p)
  ok(opened > len, '펼치면 길어짐 (접기가 실제로 줄이고 있음)', `${len} → ${opened}개`)
  await ctx.close()
}

// ── 4. 다른 폰 화면에도 세로 글자가 없다 ─────────────────────────────────
for (const path of ['/', '/clients', '/requests']) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
  wire(ctx)
  const p = await open(ctx, path)
  const bad = await findVertical(p)
  ok(bad.length === 0, `${path} — 세로로 늘어진 글자 없음`, bad.slice(0, 2).join(' / '))
  await ctx.close()
}

// ── 5. 아주 좁은 폰(320px)에서도 ─────────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 320, height: 720 } })
  wire(ctx)
  const p = await open(ctx, '/today')
  const bad = await findVertical(p)
  ok(bad.length === 0, '320px 에서도 세로 글자 없음', bad.slice(0, 2).join(' / '))
  const body = flat(await p.textContent('body'))
  ok(/병원 요청/.test(body), '좁은 화면에서도 내용은 그대로')
  await ctx.close()
}

// ── 6. 이름이 PC 와 폰에서 같은가 ────────────────────────────────────────
//   같은 문구가 네 군데에 따로 적혀 있어, 하나를 고치면 나머지가 옛 이름으로
//   남았습니다. 한 곳(lib/brand.ts)에서만 정하도록 바꿨는지 실제로 확인합니다.
const TAGLINE = '의료폐기물 수거·운반 · 병원 운영 통합관리'
const MARK = ['BEONEMIRAE', 'BUSINESS AX']
{
  //  PC 사이드바
  const ctx = await b.newContext({ viewport: { width: 1500, height: 1000 } })
  wire(ctx)
  const p = await open(ctx, '/')
  const side = flat(await p.textContent('aside'))
  ok(side.includes(TAGLINE), 'PC 사이드바에 새 이름', side.slice(0, 80))
  const mark = flat(await p.textContent('[data-brand-ax]'))
  ok(MARK.every((m) => mark.includes(m)), 'PC 영문 이름표', mark)
  ok(!/WASTE OPS/i.test(side), '옛 이름이 안 남음')
  await ctx.close()
}
{
  //  폰 — 더보기 맨 아래
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
  wire(ctx)
  const p = await open(ctx, '/')
  await p.locator('nav.fixed.bottom-0 button:has-text("더보기")').click()
  await p.waitForTimeout(1000)
  const foot = flat(await p.textContent('[data-brand-ax-mobile]'))
  ok(foot.includes(TAGLINE), '폰에도 **같은** 이름', foot.slice(0, 90))
  ok(MARK.every((m) => foot.includes(m)), '폰 영문 이름표도 같음', foot)
  await ctx.close()
}
{
  //  로그인 화면 — 계정이 없어도 보이는 자리
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
  const p = await ctx.newPage()
  await p.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(1800)
  ok(flat(await p.textContent('body')).includes(TAGLINE), '로그인 화면에도 같은 이름')
  await ctx.close()
}

// ── 7. 폰 헤더 — 이름표가 잘리지 않는가 ─────────────────────────────────
//   왼쪽 위는 폰에서 이름을 보는 자리입니다. 잘린 이름표는 고장으로 보입니다.
for (const w of [320, 360, 390, 430]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 800 } })
  wire(ctx)
  const p = await open(ctx, '/')
  const r = await p.evaluate(() => {
    const h = document.querySelector('header')
    const ax = h.querySelector('[data-brand-ax-header]')
    const name = [...h.querySelectorAll('p')][0]
    const cut = (e) => (e && e.clientWidth > 0 ? e.scrollWidth > e.clientWidth + 1 : false)
    return {
      ax: ax ? ax.textContent.replace(/\s+/g, ' ').trim() : null,
      axCut: cut(ax), nameCut: cut(name),
      live: !!h.querySelector('span.bg-teal-50'),
    }
  })
  ok(r.ax === 'BEONEMIRAE · BUSINESS AX', `${w}px — 헤더에 영문 이름표`, String(r.ax))
  ok(!r.axCut, `${w}px — 이름표가 안 잘림`)
  ok(!r.nameCut, `${w}px — 상호도 안 잘림`)
  ok(!r.live, `${w}px — 「실제 운영」 딱지 없음`)
  await ctx.close()
}

// ── 8. 「시연용 MVP」는 뗐다 ─────────────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
  wire(ctx)
  const p = await open(ctx, '/')
  await p.locator('nav.fixed.bottom-0 button:has-text("더보기")').click()
  await p.waitForTimeout(1000)
  const foot = flat(await p.textContent('[data-brand-ax-mobile]'))
  ok(!/시연용 MVP/.test(foot), '「시연용 MVP」가 사라짐 — 실제로 쓰는 단계입니다', foot.slice(0, 80))
  ok(/㈜비원미래/.test(foot), '상호는 그대로')
}

// ── 9. 운영 도구 한 묶음 — 쓸 수 있는 것 · 아직 못 쓰는 것 ───────────────
//   목차가 둘로 갈려 있던 것을 하나로 합쳤습니다. 합치면서 **아직 못 쓰는
//   것을 눌러도 아무 일이 없어야** 합니다 — 눌리는데 반응이 없는 것보다
//   애초에 안 눌리는 편이 낫습니다.
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
  wire(ctx)
  const p = await open(ctx, '/')
  await p.locator('nav.fixed.bottom-0 button:has-text("더보기")').click()
  await p.waitForTimeout(1000)
  const sheet = flat(await p.textContent('body'))
  ok(/운영 도구/.test(sheet), '「운영 도구」 한 묶음')
  ok(!/운영 도구 · 추가 고도화 예정/.test(sheet), '옛 묶음 이름이 안 남음')

  await p.click('[data-more-toggle="more-tools"]')
  await p.waitForTimeout(400)
  const planned = await p.locator('[data-more-planned-item]').count()
  ok(planned === 7, '아직 못 쓰는 7가지가 같은 묶음 안에', String(planned))
  const real = await p.locator('[data-more-section="more-tools"] [data-more-item]').count()
  ok(real === 10, '쓸 수 있는 10가지도 그대로', String(real))

  //  자물쇠 항목을 눌러도 화면이 안 바뀌어야 합니다
  const before = p.url()
  //  ⚠ `.click()` 을 쓰면 안 됩니다. Playwright 는 aria-disabled 인 것을
  //    아예 안 누르고 기다리다 시간만 보냅니다 — 앱이 무엇을 하는지는
  //    **한 번도 확인하지 않은 채** 검사가 통과합니다(실제로 그랬습니다).
  //    그래서 진짜 클릭 사건을 직접 쏴서 앱의 반응을 봅니다.
  await p.locator('[data-more-planned-item]').first().dispatchEvent('click')
  await p.waitForTimeout(900)
  ok(p.url() === before, '**아직 못 쓰는 것은 눌러도 아무 일이 없음**', `${before} → ${p.url()}`)
  //  시트가 그대로 열려 있어야 합니다 — 닫혔다면 무언가로 넘어간 것입니다
  ok((await p.locator('[data-more-toggle="more-tools"]').count()) === 1, '시트가 그대로 열려 있음')
  ok((await p.locator('[data-more-planned-item]').first().getAttribute('aria-disabled')) === 'true',
    '읽어 주는 기기에도 「못 씁니다」로 전달')

  //  쓸 수 있는 것은 그대로 열려야 합니다
  await p.locator('[data-more-item="/pricing"]').click()
  await p.waitForTimeout(1400)
  ok(p.url().endsWith('/pricing'), '쓸 수 있는 것은 그대로 열림', p.url())
  await ctx.close()
}

// ── 10. PC 사이드바도 같은 구조 ──────────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 1500, height: 1100 } })
  wire(ctx)
  const p = await open(ctx, '/')
  const side = flat(await p.textContent('aside'))
  ok(/운영 도구/.test(side), 'PC 도 「운영 도구」 한 묶음')
  ok(!/운영 도구 · 추가 고도화 예정/.test(side), 'PC 옛 묶음 이름 없음')
  //  묶음을 펼칩니다
  await p.locator('aside button:has-text("운영 도구")').click()
  await p.waitForTimeout(400)
  const planned = await p.locator('[data-nav-planned]').count()
  ok(planned === 7, 'PC 도 같은 묶음 안에 7가지', String(planned))
  const before = p.url()
  await p.locator('[data-nav-planned]').first().dispatchEvent('click')
  await p.waitForTimeout(900)
  ok(p.url() === before, 'PC 에서도 눌러도 아무 일이 없음', `${before} → ${p.url()}`)
  await ctx.close()
}

// ── 11. 폰 대시보드 — 매출이 첫 화면을 잡아먹지 않는다 ─────────────────
//   대표님이 대시보드를 여는 이유는 「오늘 뭘 하지」가 먼저입니다.
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
  wire(ctx)
  const p = await open(ctx, '/')
  const m = async () =>
    await p.evaluate(() => {
      const kpi = document.querySelector('[data-revenue-kpis]')
      const todo = [...document.querySelectorAll('h2,h3,p')].find((e) => e.textContent.trim() === '오늘 처리할 업무')
      return {
        kpiH: kpi ? Math.round(kpi.getBoundingClientRect().height) : 0,
        todoY: todo ? Math.round(todo.getBoundingClientRect().top + window.scrollY) : null,
        vh: window.innerHeight,
      }
    })
  const shut = await m()
  ok(shut.kpiH < 220, `접었을 때 매출칸 ${shut.kpiH}px — 220px 미만`, `${shut.kpiH}px`)
  ok(shut.todoY != null && shut.todoY < shut.vh * 0.55,
    '**「오늘 처리할 업무」가 첫 화면 위쪽에 옴**', `y=${shut.todoY} / 화면 ${shut.vh}`)

  //  접어도 누적매출은 보여야 합니다 — 감추면 사라진 것으로 보입니다
  const head = flat(await p.textContent('[data-revenue-toggle]'))
  ok(/누적매출/.test(head), '접어도 누적매출 한 줄은 보임', head.slice(0, 50))
  ok((await p.locator('[data-revenue-kpi="avg"]').first().isVisible()) === false, '자세한 네 칸은 접혀 있음')

  await p.click('[data-revenue-toggle]')
  await p.waitForTimeout(400)
  ok(await p.locator('[data-revenue-kpi="avg"]').first().isVisible(), '누르면 펼쳐짐')
  const opened = await m()
  ok(opened.kpiH > shut.kpiH, '펼치면 커짐 (접기가 실제로 줄이고 있음)', `${shut.kpiH} → ${opened.kpiH}px`)
  await ctx.close()
}

// ── 12. PC 는 접지 않는다 ────────────────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 1500, height: 1000 } })
  wire(ctx)
  const p = await open(ctx, '/')
  ok(await p.locator('[data-revenue-kpi="avg"]').first().isVisible(), 'PC 는 네 칸이 늘 보임')
  ok(!(await p.locator('[data-revenue-toggle]').first().isVisible()), 'PC 에는 접기 단추가 없음')
  await ctx.close()
}

// ── 13. 도움말에 개발자 요청까지 세 갈래 ────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
  wire(ctx)
  const p = await open(ctx, '/')
  await p.click('[data-help-open]')
  await p.waitForTimeout(800)
  //  같은 표시가 화면 다른 곳에도 있습니다 — **시트 안**으로 좁혀서 셉니다.
  const inSheet = (sel) => p.locator(`[data-help-sheet] ${sel}`).count()
  ok((await inSheet('[data-tour-start]')) === 1, '사용 방법')
  ok((await inSheet('[data-tour-why]')) === 1, '이 시스템을 만든 이유')
  ok((await inSheet('[data-help-dev-request]')) === 1, '**개발자에게 요청하기도 함께**')
  //  눌러서 실제로 요청 모달이 열리는지
  await p.click('[data-help-dev-request]')
  await p.waitForTimeout(900)
  ok(/개발자에게 요청|어떤 점이/.test(flat(await p.textContent('body'))), '누르면 요청 화면이 열림')
  await ctx.close()
}

// ── 14. 사용 방법(투어)이 지금 기능까지 다룬다 ──────────────────────────
//   투어는 처음 만든 뒤로 그대로였습니다. 그 사이 소모품 판매·AX 성과가
//   생겼는데 투어는 예전 이야기만 했습니다 — 새로 온 직원이 그것을
//   배울 곳이 없다는 뜻입니다.
for (const [w, label] of [[390, '폰'], [1500, 'PC']]) {
  const ctx = await b.newContext({ viewport: { width: w, height: w === 390 ? 844 : 1000 } })
  wire(ctx)
  const p = await open(ctx, '/')
  //  투어를 시작합니다 (폰은 도움말 시트를 거칩니다)
  if (w === 390) {
    await p.click('[data-help-open]')
    await p.waitForTimeout(700)
    await p.click('[data-help-sheet] [data-tour-start]')
  } else {
    await p.click('[data-tour-start]')
  }
  await p.waitForTimeout(1200)

  //  끝까지 넘기면서 **투어 카드 안의 글자만** 모읍니다.
  //   화면 전체를 모으면 옆의 메뉴(「소모품 주문」·「AX 도입 성과」)가 걸려서
  //   투어가 그 이야기를 안 해도 통과합니다 — 실제로 그랬습니다.
  let seen = ''
  let steps = 0
  for (let i = 0; i < 16; i += 1) {
    if ((await p.locator('[data-tour-card]').count()) === 0) break
    seen += ' ' + flat(await p.textContent('[data-tour-card]'))
    steps += 1
    const next = p.getByRole('button', { name: '다음' })
    if ((await next.count()) === 0) break
    await next.click().catch(() => {})
    await p.waitForTimeout(800)
  }
  ok(steps >= 9, `${label} 투어가 끝까지 넘어감`, `${steps}단계`)
  ok(/소모품|전달완료/.test(seen), `${label} 투어가 소모품 판매를 다룸`)
  ok(/전달완료를 누를 때만|요청은 아직 매출이 아닙니다/.test(seen),
    `${label} 투어가 「요청은 매출이 아니다」를 알려 줌`)
  ok(/도입 전 실제 업무|3\.5~4\.7시간/.test(seen), `${label} 투어가 AX 성과를 다룸`)
  await ctx.close()
}

// ── 15. PC 사이드바 정리 · 연락처 ───────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 1500, height: 1100 } })
  wire(ctx)
  const p = await open(ctx, '/')
  const side = flat(await p.textContent('aside'))

  //  회사 연락처 — 직원이 보는 값
  ok(/031-527-4376/.test(side), '대표번호 031-527-4376', side.slice(-160))
  ok(/031-529-4376/.test(side), '팩스 031-529-4376')
  ok(/beonemirae@naver\.com/.test(side), '이메일')
  ok(/평일 09:00 ~ 18:00/.test(side), '근무시간')
  //  **병원 상담번호는 직원 화면에 없어야 합니다**
  ok(!/1533-8876/.test(flat(await p.textContent('body'))),
    '**직원 화면에 병원 상담번호(1533-8876)가 없음**')

  //  왼쪽 목차에서 사용 방법·개발자 요청이 빠지고 오른쪽 위로 갔는가
  ok(!/사용 방법/.test(side), '왼쪽 목차에 「사용 방법」이 없음 — 오른쪽 위에 있습니다')
  ok(!/개발자에게 요청/.test(side), '왼쪽 목차에 「개발자에게 요청하기」도 없음')
  const top = flat(await p.textContent('main'))
  ok(/사용 방법/.test(top) && /개발자에게 요청/.test(top), '둘 다 오른쪽 위에 있음')

  //  바깥으로 나가는 길 — 이름이 함께 붙었는가
  ok(/홈페이지/.test(side) && /모바일 화면/.test(side) && /올바로/.test(side),
    '아이콘 옆에 이름이 붙음')
  await ctx.close()
}

// ── 16. 병원 화면에는 상담번호가 그대로 ─────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
  wire(ctx, 'client')
  const p = await open(ctx, '/portal')
  const bodyTxt = flat(await p.textContent('body'))
  ok(/1533-8876/.test(bodyTxt), '**병원 화면에는 상담번호가 그대로**', `${p.url()} :: ${bodyTxt.slice(0, 90)}`)
  await ctx.close()
}

await b.close()
console.log(`\n총 ${out.length}건 · 실패 ${out.filter((x) => !x).length}건`)
