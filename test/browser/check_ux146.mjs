import { chromium, EXEC } from './_pw.mjs'
import * as W from './walk_lib.mjs'
import * as F from './perf_fixtures.mjs'

//  0146 — 앱 켤 때 자료 한꺼번에 받기 · 큰 표 나눠 받기 · 정의 없던 입력 칸 · 폰 손가락 크기
//
//   ① 앱을 켤 때 서로 기다릴 필요 없는 표들을 **동시에** 받는가 (예전: 22개를 하나씩 차례로)
//   ② 1000줄이 넘는 표(수거 일정 5천여 건)를 나눠 받을 때 **빠지거나 겹치는 줄이 없는가**
//   ③ 아직 없는 표가 있어도(옛 서버) 앱이 그대로 열리는가
//   ④ `input` 칸 — 정의가 없어 테두리 없는 회색 글자처럼 보이던 15곳이 이제 입력 칸 모양인가
//   ⑤ 폰에서 누르는 곳이 손가락 크기(44px)인가 — 홈 · 인사이트 · 통계 · 사용자 · 자재 · 오늘 메모
//   ⑥ (0147) 수거 입력 「오늘 일정 선택」 — 폰은 앞 6곳 + 「나머지 N곳 더 보기」
//   ⑦ (0147) 숫자 · 낱말이 한가운데서 끊기지 않음 — 월말 청구 금액 · 달 단추 · 매출 그래프(폰은 한 달 한 줄)
//
//   ⚠ 흉내 서버는 즉시 답합니다 — 자료 요청마다 일부러 지연을 얹어 「차례로 vs 동시」를 잽니다.

const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  if (!c) process.exitCode = 1
}
const b = await chromium.launch({ executablePath: EXEC })

async function open(role, path, { w = 390, scale = 'lg', delay = 0, missing = [] } = {}) {
  const phone = w < 1024
  const state = { profile: { ...W.profileFor(role), font_scale: scale }, reqs: 0, writes: [], schemaVersion: 123 }
  const ctx = await b.newContext({ viewport: { width: w, height: phone ? 844 : 900 }, isMobile: phone, hasTouch: phone, timezoneId: 'Asia/Seoul' })
  W.wire(ctx, state)
  const log = []
  await ctx.route('**/rest/v1/**', async (r) => {
    const u = new URL(r.request().url())
    const table = u.pathname.split('/rest/v1/')[1]
    const at = Date.now()
    if (delay) await new Promise((z) => setTimeout(z, delay))
    if (missing.includes(table))
      return r.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST205', message: `Could not find the table 'public.${table}' in the schema cache` }) })
    log.push({ table, at, offset: Number(u.searchParams.get('offset') ?? 0), limit: Number(u.searchParams.get('limit') ?? 0) })
    return r.fallback()
  })
  const p = await ctx.newPage()
  const errors = []
  p.on('pageerror', (e) => errors.push(String(e)))
  await p.addInitScript(([k, u]) => {
    localStorage.setItem(k, JSON.stringify({ access_token: 't', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u }))
    localStorage.setItem('beonemirae-ops:tour-seen', 'staff,field,client,demo')
  }, ['beonemirae-ops:auth', { id: F.UID, aud: 'authenticated', email: 'x@b.c', app_metadata: {}, user_metadata: {} }])
  await p.goto(`${W.BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await W.settle(p, state)
  await p.waitForTimeout(600)
  return { ctx, p, log, errors }
}

// ── ① · ② 앱 켤 때 — 동시에 · 빠짐없이 ─────────────────────────────────────
{
  const DELAY = 250
  const { ctx, p, log, errors } = await open('admin', '/', { delay: DELAY })
  const first = (t) => log.filter((x) => x.table === t).map((x) => x.at).sort((a, b) => a - b)[0]
  const SOFT = ['client_monthly_actuals', 'client_inquiries', 'schedule_feedback', 'revenue_overrides', 'products', 'product_orders', 'holidays', 'month_close_marks', 'client_prices', 'operating_costs', 'payment_receipts', 'payments', 'sales_leads', 'experiment_settings']
  const starts = SOFT.map(first).filter(Boolean)
  const spread = Math.max(...starts) - Math.min(...starts)
  ok(starts.length === SOFT.length, '① 추가 표들을 모두 받음', `${starts.length}/${SOFT.length}`)
  //  예전에는 하나씩 차례로 — 14개면 14 × 250ms = 3.5초에 걸쳐 시작했습니다
  ok(spread < DELAY * 2, '① 추가 표들을 **한꺼번에** 받기 시작 (차례로 기다리지 않음)', `처음~마지막 시작 간격 ${spread}ms (요청 하나 ${DELAY}ms)`)
  const core = first('schedules')
  ok(Math.abs(first('holidays') - core) < DELAY * 2, '① 기본 표(수거 일정)와 추가 표도 함께 시작', `${Math.abs(first('holidays') - core)}ms 차이`)
  //  ② 수거 일정 — 장마다 1000줄, 빠짐 · 겹침 없이
  const sch = log.filter((x) => x.table === 'schedules' && x.limit > 0)
  const offsets = [...new Set(sch.map((x) => x.offset))].sort((a, b) => a - b)
  const need = Math.ceil((F.schedules.length + 1) / 1000)
  ok(offsets.slice(0, need).every((o, i) => o === i * 1000), '② 수거 일정 — 0 · 1000 · 2000 … 장을 하나도 안 빼고 받음', offsets.join(','))
  ok(offsets.length <= need + 2, '② 다 받은 뒤 쓸데없이 더 묻는 장은 많아야 둘', `${offsets.length}장 (필요 ${need}장)`)
  const loaded = await p.evaluate(() => document.body.innerText.length)
  ok(loaded > 500 && errors.length === 0, '① 화면이 그려지고 스크립트 오류 없음', errors.join(' | '))
  await ctx.close()
}
// ── ③ 옛 서버 — 표 몇 개가 없어도 앱이 열림 ──────────────────────────────────
{
  const { ctx, p, errors } = await open('admin', '/', { missing: ['holidays', 'sales_leads', 'tax_filings'] })
  const main = (await p.textContent('main')) ?? ''
  ok(main.length > 200 && errors.length === 0, '③ 없는 표가 있어도 홈이 그려짐 · 오류 없음', errors.join(' | '))
  ok((await p.locator('[data-error-boundary]').count()) === 0, '③ 「화면을 여는 중 문제」가 뜨지 않음')
  await ctx.close()
}

// ── ④ 입력 칸 모양 ───────────────────────────────────────────────────────────
{
  const { ctx, p } = await open('field', '/today')
  const r = await p.locator('[data-day-close-note]').evaluate((e) => {
    const s = getComputedStyle(e)
    return { h: e.getBoundingClientRect().height, ring: s.boxShadow, bg: s.backgroundColor, radius: parseFloat(s.borderTopLeftRadius) }
  })
  ok(r.h >= 44, '④ 오늘 업무 마감 「남길 말」 칸 — 손가락 높이', `${Math.round(r.h)}px`)
  //  ring-1 = 안쪽 1px 테두리 (box-shadow 0 0 0 1px)
  ok(/0px 0px 0px 1px/.test(r.ring) && r.radius >= 8, '④ 테두리(링) · 둥근 모서리가 있는 입력 칸 모양 (예전: 맨 글자)', `${r.ring.slice(0, 80)} · r${r.radius}`)
  await ctx.close()
}

// ── ⑤ 폰 손가락 크기 ─────────────────────────────────────────────────────────
for (const [role, path, sel, what] of [
  ['admin', '/insight', '[data-insight-row] a[href^="/clients/"]', '거래처 인사이트 — 거래처 이름'],
  ['admin', '/stats', 'table a[href^="/clients/"]', '통계 표 — 거래처 · 정산 꺾쇠'],
  ['admin', '/users', '[data-user-rename]', '사용자 관리 — 이름 바꾸기'],
  ['office', '/materials', '[data-supply-delete]', '자재 — 공급 기록 삭제'],
  ['admin', '/', '[data-field-pending-row] a', '홈 — 아직 입력 없는 곳 이름'],
]) {
  const { ctx, p } = await open(role, path, { w: 360 })
  const hs = await p.locator(sel).evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().width > 0).map((e) => Math.round(e.getBoundingClientRect().height)))
  ok(hs.length > 0 && Math.min(...hs) >= 44, `⑤ ${what} — 44px 이상`, hs.length ? `가장 작은 것 ${Math.min(...hs)}px · ${hs.length}개` : '못 찾음')
  await ctx.close()
}

// ── ⑥ 수거 입력 — 앞 6곳 + 더 보기 ──────────────────────────────────────────
{
  const { ctx, p } = await open('field', '/collection')
  const chips = () => p.locator('[data-pick-mode]').locator('xpath=preceding-sibling::div[1]').locator('button:not([data-pick-more])')
  const before = await chips().count()
  const more = p.locator('[data-pick-more]')
  ok((await more.count()) === 1 && /나머지 \d+곳 더 보기/.test((await more.textContent()) ?? ''), '⑥ 폰 — 「나머지 N곳 더 보기」', (await more.textContent().catch(() => '')) ?? '')
  ok(before === 7, '⑥ 처음엔 「직접 입력」 + 앞 6곳만', `${before}개`)
  await more.click()
  await p.waitForTimeout(300)
  const after = await chips().count()
  const pending = F.schedules.filter((x) => x.date === F.TODAY && x.status !== '완료' && x.status !== '취소').length
  ok(after === pending + 1, '⑥ 누르면 남은 곳이 모두 보임', `${after - 1}곳 / 남은 ${pending}곳`)
  await ctx.close()
}

// ── ⑦ 끊기지 않는 숫자 · 낱말 ────────────────────────────────────────────────
const brokenIn = (p, sel) =>
  p.evaluate((sel) => {
    const out = []
    for (const el of document.querySelectorAll(sel)) {
      const lh = parseFloat(getComputedStyle(el).lineHeight) || parseFloat(getComputedStyle(el).fontSize) * 1.4
      if (el.getBoundingClientRect().height > lh * 1.6) out.push((el.textContent ?? '').trim())
    }
    return out
  }, sel)
for (const [w, scale] of [[390, 'lg'], [360, 'xl']]) {
  const { ctx, p } = await open('office', '/billing', { w, scale })
  const money = await brokenIn(p, '[data-progress-money] p.tabular-nums')
  ok(money.length === 0, `⑦ ${w}·${scale} 월말 청구 — 금액이 두 줄로 끊기지 않음`, money.join(' / '))
  const months = await p.locator('[data-close-month] span').evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().height > parseFloat(getComputedStyle(e).fontSize) * 2).map((e) => e.textContent))
  ok(months.length === 0, `⑦ ${w}·${scale} 청구할 달 — 「2026년」 · 「10월」이 각각 한 줄`, months.join(' / '))
  await ctx.close()
}
{
  const { ctx, p } = await open('admin', '/revenue', { w: 360, scale: 'xl' })
  ok((await p.locator('[data-revenue-rows] [data-revenue-bar]').count()) === 12, '⑦ 폰 매출 — 한 달에 한 줄 (12줄)')
  const rows = await brokenIn(p, '[data-revenue-rows] [data-revenue-bar] span.whitespace-nowrap')
  ok(rows.length === 0, '⑦ 폰 매출 — 달 · 금액이 겹치거나 세로로 쌓이지 않음', rows.join(' / '))
  const hs = await p.locator('[data-revenue-rows] [data-revenue-bar]').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)))
  ok(Math.min(...hs) >= 44, '⑦ 폰 매출 — 줄마다 손가락 높이', `${Math.min(...hs)}px`)
  await ctx.close()
}

await b.close()
