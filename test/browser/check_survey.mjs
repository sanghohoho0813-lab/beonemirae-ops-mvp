import { chromium, EXEC } from './_pw.mjs'

//  도입 전 실제 업무 조사 (이사님 답변 2026-08).
//
//   심사 자리에서 「이 숫자 어디서 났습니까」를 물으면 답할 것이 있어야
//   합니다. 그래서 확인하는 것은 「보기 좋은가」가 아니라 **원본과 같은가**
//   입니다. 손으로 더한 값과 1 이라도 다르면 실패입니다.
//
//    · 차량 5대 · 요일별 방문/이동거리가 표 그대로인가
//    · 안 나간 날을 0 이 아니라 「—」로 두는가
//    · 합계·평균이 손계산과 같은가
//    · 기준값을 채울 때 **답변에 없는 칸을 지어내지 않는가**

const BASE = 'http://localhost:4173'
const UID = '00000000-0000-0000-0000-0000000000ad'
const out = []
const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  out.push(c)
  if (!c) process.exitCode = 1
}
const flat = (s) => (s ?? '').replace(/\s+/g, ' ')

//  ── 원본 표 (첨부 엑셀 그대로 손으로 옮긴 것) ──────────────────────────────
//    이 숫자를 앱에서 가져오면 검증이 아니라 복사가 됩니다. 여기 따로 적습니다.
const SRC = {
  9844: { 월: [6, 174], 화: [6, 196], 수: [6, 272], 목: [3, 190], 금: [4, 160] },
  5506: { 월: [14, 210], 화: [4, 169] },
  7432: { 수: [5, 178], 목: [4, 143], 금: [4, 193] },
  6730: { 일: [4, 227], 월: [4, 210], 화: [5, 210], 수: [4, 234], 목: [6, 205] },
  9188: { 월: [6, 268], 수: [4, 197], 금: [5, 258] },
}
const DAYS = ['일', '월', '화', '수', '목', '금']
//  손계산
const visitsOf = (o) => Object.values(o).reduce((s, [v]) => s + v, 0)
const kmOf = (o) => Object.values(o).reduce((s, [, k]) => s + k, 0)
const WEEK_VISITS = Object.values(SRC).reduce((s, o) => s + visitsOf(o), 0) // 94
const WEEK_KM = Object.values(SRC).reduce((s, o) => s + kmOf(o), 0) // 3694
const byDay = Object.fromEntries(
  DAYS.map((d) => [d, Object.values(SRC).reduce((s, o) => s + (o[d]?.[0] ?? 0), 0)]),
)
const WEEKDAY_AVG =
  Math.round((DAYS.filter((d) => d !== '일').reduce((s, d) => s + byDay[d], 0) / 5) * 10) / 10 // 18

const me = {
  id: UID, email: 'a@b.c', name: '대표', role: 'admin', font_scale: 'normal',
  active: true, approved_at: '2026-01-01T00:00:00Z', client_id: null, created_at: '2026-01-01T00:00:00Z',
}

const b = await chromium.launch({ executablePath: EXEC })

function wire(ctx, { calls = [] } = {}) {
  ctx.route('**/auth/v1/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: UID, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }) }))
  ctx.route('**/rest/v1/**', (r) => {
    const url = r.request().url()
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    if (r.request().method() !== 'GET' && url.includes('performance_baselines')) {
      calls.push(r.request().postDataJSON())
      return json({})
    }
    if (url.includes('/rpc/app_schema_version')) return json(64)
    if (url.includes('/profiles')) return json(single ? me : [me])
    if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
    if (url.includes('/performance_baselines')) {
      const bl = { id: 1, admin_minutes_per_collection: null, repeat_entries_per_collection: null,
        monthly_doc_hours: null, monthly_rework_count: null, daily_capacity: null,
        source: 'user', updated_at: null }
      return json(single ? bl : [bl])
    }
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

// ── 1. 표가 원본 그대로인가 ───────────────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 1500, height: 1600 } })
  wire(ctx)
  const p = await open(ctx, '/performance?tab=basis')
  await p.waitForSelector('[data-ops-survey]', { timeout: 20000 })

  for (const [no, days] of Object.entries(SRC)) {
    const row = flat(await p.textContent(`[data-survey-row="${no}"]`))
    for (const [d, [v, km]] of Object.entries(days)) {
      ok(row.includes(`${v}곳`) && row.includes(`${km}km`),
        `${no} ${d} — ${v}곳 ${km}km`, row.slice(0, 60))
    }
    //  안 나간 날은 0 이 아니라 「—」
    const missing = DAYS.filter((d) => !days[d])
    if (missing.length > 0) {
      ok(row.includes('—'), `${no} — 안 나간 날은 0 이 아니라 「—」 (${missing.join('·')})`)
    }
    const sum = visitsOf(days)
    ok(row.includes(`${sum}곳`), `${no} 주간 합 ${sum}곳`)
  }
  await ctx.close()
}

// ── 2. 합계·평균이 손계산과 같은가 ───────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 1500, height: 1600 } })
  wire(ctx)
  const p = await open(ctx, '/performance?tab=basis')
  await p.waitForSelector('[data-ops-survey]', { timeout: 20000 })
  const kpi = flat(await p.textContent('[data-ops-survey]'))
  ok(kpi.includes(`${WEEK_VISITS}곳`), `한 주 방문 ${WEEK_VISITS}곳 — 손으로 더한 값과 같음`)
  ok(kpi.includes(WEEK_KM.toLocaleString('ko-KR')), `한 주 이동 ${WEEK_KM.toLocaleString('ko-KR')}km`)
  const avg = flat(await p.textContent('[data-survey-kpi="평일 하루 방문"]'))
  ok(avg.includes(`${WEEKDAY_AVG}곳`), `평일 하루 평균 ${WEEKDAY_AVG}곳 — 일요일은 뺌`, avg)
  //  일요일을 섞으면 (94/6=15.7) 이 됩니다. 그 값이 나오면 안 됩니다.
  ok(!avg.includes('15.7'), '일요일을 섞어 평균을 낮추지 않음')

  //  하루 사무시간 — 0.5+1+2 = 3.5 ~ 0.667+1+3 = 4.7
  const t = flat(await p.textContent('[data-survey-kpi="하루 사무 시간"]'))
  ok(/3\.5~4\.7h/.test(t), '하루 사무 3.5~4.7시간', t)
  //  월 — 3.5×6×4.345 = 91.2 → 91 · 4.667×6×4.345 = 121.7 → 122
  ok(/월 91~122시간/.test(t), '한 달 91~122시간 (주 6일 × 4.345주)', t)

  ok(/99%/.test(kpi), '당일 소화율 99% 를 그대로')
  ok(/여지는 크지 않습니다/.test(kpi), '**이미 높은 지표는 성과로 내세우지 않는다고 밝힘**')
  await ctx.close()
}

// ── 3. 기준값 채우기 — 없는 칸은 지어내지 않는다 ─────────────────────────
{
  const calls = []
  const ctx = await b.newContext({ viewport: { width: 1500, height: 1600 } })
  wire(ctx, { calls })
  const p = await open(ctx, '/settings')
  await p.waitForSelector('[data-baseline-survey]', { timeout: 20000 })

  const how = flat(await p.textContent('[data-baseline-survey-how]'))
  ok(/210분/.test(how) && /18곳/.test(how), '어떻게 나온 숫자인지 적음 (210분 ÷ 18곳)', how.slice(0, 100))
  ok(/주 6일/.test(how) && /4\.345주/.test(how), '월 환산 근거도 적음')
  ok(/이번 조사에 없어 비워 둡니다/.test(how), '**답변에 없는 칸은 비운다고 밝힘**')

  await p.click('[data-baseline-survey]')
  await p.waitForTimeout(1200)
  const sent = calls.find((c) => c && 'source' in c) ?? calls[calls.length - 1] ?? {}
  ok(sent.source === 'survey', '출처를 「실제 업무 조사」로 보냄 — 시연값이 아님', JSON.stringify(sent).slice(0, 90))
  ok(Number(sent.daily_capacity) === WEEKDAY_AVG, `하루 처리 ${WEEKDAY_AVG}건`, String(sent.daily_capacity))
  ok(Number(sent.monthly_doc_hours) === 91, '월 문서작업 91시간 — 적게 잡은 쪽', String(sent.monthly_doc_hours))
  ok(Number(sent.admin_minutes_per_collection) === 11.7, '수거 1건당 11.7분',
    String(sent.admin_minutes_per_collection))
  ok(sent.repeat_entries_per_collection == null, '**반복 입력 횟수는 비워서 보냄** — 조사에 없었습니다',
    String(sent.repeat_entries_per_collection))
  ok(sent.monthly_rework_count == null, '**월 누락·재확인도 비워서 보냄**', String(sent.monthly_rework_count))
  await ctx.close()
}

await b.close()
console.log(`\n총 ${out.length}건 · 실패 ${out.filter((x) => !x).length}건`)
