import { chromium, EXEC } from './_pw.mjs'
import * as W from './walk_lib.mjs'
import * as F from './perf_fixtures.mjs'

//  0086 — 병원 화면 시안 맞추기 (분석 칸 · 하단 정보 · 수거이력 기간 고르기)
//
//   대표님: 「실제 AI API가 연결되어 있지 않으면 fake AI 결과를 생성하지
//   않는다 … 실제 분석 방식이 rules 기반이라면 코드상 명확히 구분한다」
//
//   ⚠ 이 파일에서 제일 중요한 검사는 **화면이 스스로를 AI 라고 부르지
//     않는가**입니다. 예뻐 보이려고 「AI 분석」이라고 적는 순간, 병원은
//     저희가 안 가진 능력을 가졌다고 믿습니다.

const ok = (c, m, d = '') => { console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`); if (!c) process.exitCode = 1 }
const flat = (t) => (t ?? '').replace(/\s+/g, ' ').trim()
const b = await chromium.launch({ executablePath: EXEC })

async function open(path, role, w = 1440, schemaVersion = 83) {
  const state = { profile: { ...W.profileFor(role), font_scale: 'normal' }, reqs: 0, writes: [], schemaVersion }
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

// ── ① 분석 칸은 **AI 라고 하지 않는다** ────────────────────────────────────
{
  const { ctx, p } = await open('/portal/c/c1', 'admin')
  const panel = p.locator('[data-portal-insight]')
  ok((await panel.count()) === 1, '병원 첫 화면에 「배출 분석」 칸이 있다')

  const t = flat(await panel.innerText())
  ok(/수거 기록으로 계산/.test(t), '무엇으로 계산했는지 제목 옆에 적혀 있다', t.slice(0, 60))
  //  ⚠ 「AI 아님」은 있어야 하고, 「AI 분석」·「AI 추천」은 없어야 합니다.
  ok(/AI\s*아님/.test(t), '「AI 아님」이라고 못박혀 있다')
  ok(!/AI\s*(분석|추천|예측|가\s*분석)/.test(t), '스스로를 AI 라고 부르지 않는다')

  //  ⚠ 결론마다 **근거 숫자**가 따라붙어야 합니다.
  const items = await p.locator('[data-insight]').count()
  const basis = await p.locator('[data-insight-basis]').count()
  ok(items > 0, `분석 결론이 나온다 (${items}건)`)
  ok(items === basis, '결론 수와 근거 수가 같다 — 근거 없는 문장이 없다', `${items} vs ${basis}`)

  //  ⚠ 근거에는 실제 숫자가 들어 있어야 합니다.
  const bs = (await p.locator('[data-insight-basis]').allInnerTexts()).map(flat)
  ok(bs.every((x) => /\d/.test(x)), '근거가 전부 숫자를 포함한다')
  await ctx.close()
}

// ── ② 자료가 모자라면 **아무 말도 안 한다** ────────────────────────────────
{
  //  수거 기록이 하나도 없는 병원을 만들어 확인합니다.
  //  ⚠ walk_lib 은 state.schedules 로 일정 자료를 갈아 끼울 수 있습니다.
  const state = {
    profile: { ...W.profileFor('admin'), font_scale: 'normal' },
    reqs: 0, writes: [], schemaVersion: 83,
    schedules: [],   // 수거 기록이 하나도 없는 병원
  }
  const ctx = await b.newContext({ viewport: { width: 1440, height: 950 } })
  W.wire(ctx, state)
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: F.UID, aud: 'authenticated', email: 'x@b.c', app_metadata: {}, user_metadata: {} }])
  await p.goto(`${W.BASE}/portal/c/c1`, { waitUntil: 'domcontentloaded' })
  await W.settle(p, state); await p.waitForTimeout(800)

  const items = await p.locator('[data-insight]').count()
  const why = flat(await p.locator('[data-insight-why]').innerText().catch(() => ''))
  ok(items === 0, '기록이 없으면 결론을 지어내지 않는다', `결론 ${items}건`)
  ok(/아직 수거 기록이 없습니다/.test(why), '**왜** 아직 없는지 적어 둔다', why.slice(0, 60))
  await ctx.close()
}

// ── ③ 하단 정보 칸 — **있는 것만** ────────────────────────────────────────
{
  const { ctx, p } = await open('/portal/c/c1', 'admin')
  const f = p.locator('[data-portal-footer]')
  ok((await f.count()) === 1, '화면 맨 아래에 병원 등록 정보 칸이 있다')
  const t = flat(await f.innerText())

  ok(/1533-8876/.test(t), '상담센터 번호가 적혀 있다')
  //  ⚠ 시안에 있던 「공지사항」·「만족도 평가」는 자료가 없습니다.
  //    자리만 만들어 두면 눌러도 아무 일이 없는 단추가 됩니다.
  ok(!/만족도/.test(t), '없는 만족도 설문을 그리지 않는다')
  ok(!/공지사항/.test(t), '없는 공지사항 칸을 그리지 않는다')
  //  ⚠ 담당 컨설턴트 이름을 지어내지 않습니다.
  ok(!/담당\s*컨설턴트/.test(t), '없는 담당 컨설턴트 이름을 지어내지 않는다')

  //  실제 등록값이 그대로 나오는가 — c1 = 가나요양병원
  ok(/서울시 강남구 테헤란로/.test(t), '등록된 수거 주소가 그대로 나온다', t.slice(0, 80))
  ok(/우리 병원 자료만/.test(t), '이 화면이 무엇을 보여 주는지 아래에 적어 둔다')
  await ctx.close()
}

// ── ④ 「고객 포털」 이름표 ────────────────────────────────────────────────
{
  const { ctx, p } = await open('/portal/c/c1', 'admin')
  const badge = p.locator('[data-portal-badge]:visible')
  ok((await badge.count()) === 1, '머리띠에 「고객 포털」 이름표가 있다 (내부 화면과 구분)')
  ok(flat(await badge.innerText()) === '고객 포털', '이름표 글자가 「고객 포털」이다')
  await ctx.close()
}

// ── ⑤ 수거 이력 — 기간을 고를 수 있다 ─────────────────────────────────────
{
  const { ctx, p } = await open('/portal/c/c0/history', 'admin')
  const total = () => p.locator('[data-hist-total]').innerText().then(flat)
  const rows = () => p.locator('table tbody tr').count()

  ok((await p.locator('[data-hist-filter]').count()) === 1, '기간·구분·찾기 칸이 있다')
  const base = await rows()
  ok(base > 0, `기본은 최근 3개월이 나온다 (${base}건)`)

  //  ⚠ 고를 수 있는 해는 **기록이 있는 해**뿐이어야 합니다.
  const years = (await p.locator('[data-hist-period]').allInnerTexts()).map(flat)
  ok(years[0] === '최근 3개월' && years[years.length - 1] === '전체',
    '기간 단추가 「최근 3개월 … 전체」로 놓여 있다', years.join(','))
  const yearBtns = years.filter((x) => /^\d{4}년$/.test(x))
  ok(yearBtns.length > 0, `기록이 있는 해가 단추로 나온다 (${yearBtns.join(',')})`)

  //  ⚠ 「전체」로 넓히면 **줄 수가 늘어야** 합니다. 늘지 않으면 거르기가
  //    실제로는 아무 일도 안 하고 있는 것입니다.
  await p.locator('[data-hist-period="all"]').click(); await p.waitForTimeout(600)
  const allRows = await rows()
  ok(allRows > base, `「전체」가 최근 3개월보다 많다 (${base} → ${allRows})`)

  //  ⚠ 합계는 **화면에 보이는 줄**과 같은 개수여야 합니다. 인증 서류에
  //    옮겨 적는 숫자라 하나라도 다르면 안 됩니다.
  const m = (await total()).match(/^(\d+)건/)
  ok(m && Number(m[1]) === allRows, `합계 건수가 화면의 줄 수와 같다 (${m?.[1]} vs ${allRows})`)

  //  구분으로 거르기
  const typeBtns = await p.locator('[data-hist-type]').count()
  if (typeBtns > 1) {
    const label = flat(await p.locator('[data-hist-type]').nth(1).innerText())
    await p.locator('[data-hist-type]').nth(1).click(); await p.waitForTimeout(600)
    const one = await rows()
    ok(one > 0 && one < allRows, `구분(${label})으로 걸러진다 (${allRows} → ${one})`)
    const kinds = new Set((await p.locator('table tbody tr td:nth-child(2)').allInnerTexts()).map(flat))
    ok(kinds.size === 1 && kinds.has(label), '걸러진 줄은 전부 그 구분이다', [...kinds].join(','))
    await p.locator('[data-hist-type="all"]').click(); await p.waitForTimeout(500)
  }

  //  찾기
  await p.locator('[data-hist-search]').fill('없는말zzz'); await p.waitForTimeout(500)
  const body = flat(await p.locator('main').innerText())
  //  ⚠ 「기록이 없습니다」가 아니라 「고른 조건에 맞는 것이 없습니다」여야
  //    합니다. 자료가 없다고 하면 병원은 저희가 자료를 잃어버린 줄 압니다.
  ok(/고르신 조건에 맞는 기록이 없습니다/.test(body), '거르기로 비었을 때와 자료가 없을 때를 구분해 말한다')
  ok(!/아직 수거 기록이 없습니다/.test(body), '자료를 잃어버린 것처럼 말하지 않는다')
  await ctx.close()
}

// ── ⑥ 폭별 — 넘치지 않고, 분석 칸이 넓은 화면에서는 옆으로 간다 ──────────
for (const w of [1920, 1440, 768, 390, 360]) {
  const { ctx, p } = await open('/portal/c/c1', 'admin', w)
  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  ok(over === 0, `${w}px — 가로로 넘치지 않는다`, `${over}px`)

  const ins = await p.locator('[data-portal-insight]').boundingBox()
  if (w >= 1440) {
    //  ⚠ 시안에서 분석은 **오른쪽 옆**입니다. 위아래로 쌓이면 시안이 아닙니다.
    ok(ins.x > w * 0.5, `${w}px — 분석 칸이 오른쪽 옆에 선다`, `x=${Math.round(ins.x)}`)
  } else {
    ok(ins.x < 40, `${w}px — 분석 칸이 아래로 쌓인다`, `x=${Math.round(ins.x)}`)
  }
  await ctx.close()
}

// ── ⑦ 폰에서 「수거 요청」이 여전히 첫 화면 안에 있다 ──────────────────────
//     ⚠ 새 칸을 넣을 때마다 이것이 밀립니다. 매번 다시 잽니다.
{
  const { ctx, p } = await open('/portal/c/c1', 'admin', 390)
  const box = await p.locator('[data-portal-cta="collect"]').boundingBox()
  ok(box.y < 844, `폰 첫 화면 안에 「수거 요청」이 있다`, `y=${Math.round(box.y)}`)
  const sup = await p.locator('[data-portal-cta="supplies"]').boundingBox()
  ok(sup.y < 844, `폰 첫 화면 안에 「자재·용기 요청」이 있다`, `y=${Math.round(sup.y)}`)

  //  ⚠ 폰에서는 「내 요청 진행 상태」가 분석 칸보다 **위**여야 합니다.
  //    분석은 읽을거리고 요청 상태는 지금 기다리는 것입니다.
  const insY = (await p.locator('[data-portal-insight]').boundingBox()).y
  const reqY = (await p.locator('section:has-text("내 요청 진행 상태")').first().boundingBox()).y
  ok(reqY < insY, '폰에서 「내 요청 진행 상태」가 분석 칸보다 위에 있다', `${Math.round(reqY)} < ${Math.round(insY)}`)
  await ctx.close()
}

// ── ⑧ 폰에서도 기간을 **고를 수 있어야** 한다 ─────────────────────────────
//     ⚠ 처음에는 폰에도 단추를 늘어놓았습니다. 여섯 개가 한 줄에 안 들어가
//       옆으로 48px 이 잘렸고, 잘린 쪽에 있던 것이 하필 「전체」였습니다 —
//       인증·실사에서 제일 많이 쓰는 그 단추를 병원이 못 찾습니다.
{
  const { ctx, p } = await open('/portal/c/c0/history', 'admin', 390)
  const sel = p.locator('[data-hist-period-select]')
  ok((await sel.count()) === 1, '폰에서는 기간을 고르는 칸이 있다')

  const opts = (await sel.locator('option').allInnerTexts()).map(flat)
  ok(opts.includes('전체'), '「전체」가 목록에 있다 (잘려서 사라지지 않는다)', opts.join(','))
  ok(opts.includes('최근 3개월'), '「최근 3개월」이 목록에 있다')

  const cards = () => p.locator('[data-portal-hist-card]').count()
  const base = await cards()
  await sel.selectOption('all'); await p.waitForTimeout(700)
  const allCards = await cards()
  ok(allCards > base, `폰에서도 「전체」로 넓어진다 (${base} → ${allCards})`)

  //  ⚠ **칸 안에서도** 옆으로 밀리면 안 됩니다. 병원이 밀 수 있다는 것을
  //    모르면 거기 있는 것은 없는 것과 같습니다 (check_flow390 과 같은 잣대).
  const inner = await p.evaluate(() => {
    let worst = 0
    for (const el of document.querySelectorAll('main *')) {
      const s = el.scrollWidth - el.clientWidth
      if (s > worst && el.clientWidth > 100) worst = s
    }
    return worst
  })
  ok(inner <= 8, '폰에서 칸 안이 가로로 밀리지 않는다', `${inner}px`)

  //  ⚠ 거르는 칸이 커져서 첫 기록을 화면 밖으로 밀면 안 됩니다.
  const first = await p.locator('[data-portal-hist-card]').first().boundingBox()
  ok(first.y < 844, '거르는 칸 아래로 첫 수거 기록이 첫 화면 안에 있다', `y=${Math.round(first.y)}`)
  await ctx.close()
}

// ── ⑨ 수거 요청에 「무엇을 · 얼마나」 (0087 → 0089 로 고쳐 씀) ────────────
//     ⚠ 배차가 요청을 받고 병원에 **다시 전화해서 묻던** 두 가지입니다.
//
//     ⚠ 0089 에서 요청 창이 **적는 칸에서 고르는 단추로** 바뀌었습니다.
//       지켜야 하는 것은 그대로입니다 —
//         · 고른 것이 실제로 서버까지 간다
//         · 안 고르면 저희가 채우지 않는다
//         · 「청구는 실제 수거량으로 한다」를 반드시 적어 둔다
{
  const { ctx, p } = await open('/portal/c/c1', 'admin', 1440, 87)
  await p.locator('[data-portal-cta="collect"]').click(); await p.waitForTimeout(600)

  const sheet = p.locator('[data-portal-sheet="pickup"]')
  ok((await sheet.count()) === 1, '수거 요청 창이 열린다')

  //  ⚠ 「청구는 실제 수거량으로 한다」를 반드시 적어 둡니다. 안 적으면
  //    병원이 적은 숫자대로 청구될까 봐 아예 안 고르십니다.
  const note = flat(await p.locator('[data-amount-note]').innerText())
  ok(/청구는 실제 수거량/.test(note), '적은 숫자가 청구에 쓰이지 않는다고 적어 둔다', note)

  //  ⚠ 고를 수 있는 유형은 **이 병원이 실제로 맡기는 것**뿐입니다.
  const wastes = (await p.locator('[data-choice="waste"] [data-choice-item]').allInnerTexts()).map(flat)
  ok(!wastes.some((x) => /일반쓰레기|생활폐기물/.test(x)), '없는 유형을 고르게 하지 않는다', wastes.join(','))

  //  고르기만 합니다 — 자판을 한 번도 안 씁니다.
  await p.locator('[data-choice="reason"] [data-choice-item]').first().click(); await p.waitForTimeout(150)
  await p.locator('[data-choice="day"] [data-choice-item]').nth(1).click(); await p.waitForTimeout(150)
  if (wastes.length > 0) {
    await p.locator('[data-choice="waste"] [data-choice-item]').first().click(); await p.waitForTimeout(150)
  }
  await p.locator('[data-choice="amount"] [data-choice-item]').nth(2).click(); await p.waitForTimeout(150)

  const bodies = []
  p.on('request', (r) => {
    if (r.method() === 'POST' && r.url().includes('client_requests')) bodies.push(r.postData() ?? '')
  })
  await p.locator('[data-req-send]').click(); await p.waitForTimeout(1500)

  ok(bodies.length === 1, '요청이 서버로 한 번 나갔다', `${bodies.length}번`)
  const sent = bodies[0] ?? ''
  //  ⚠ 「많음」은 kg 이 아닙니다. 그 병원의 실제 평균에서 환산한 숫자가
  //    나가야 하고, **0 이나 지어낸 기본값이면 안 됩니다.**
  const m = sent.match(/"expected_kg":\s*(\d+)/)
  ok(m != null && Number(m[1]) > 0, '**고른 단계가 kg 으로 환산되어 나간다**', m?.[0] ?? sent.slice(0, 150))
  //  ⚠ 고른 것이 **글로도** 남아야 합니다 — 배차가 읽는 것은 글입니다.
  ok(/예상 배출량 많음/.test(sent), '고른 단계가 요청 글에도 그대로 적힌다', sent.slice(0, 200))
  if (wastes.length > 0) ok(/waste_type/.test(sent), '고른 유형이 칸으로도 나간다')
  ok((await p.locator('[data-toast]').count()) === 1, '접수되었다고 알려 준다')
  await ctx.close()
}

// ── ⑩ 안 고르면 **저희가 채우지 않는다** ──────────────────────────────────
{
  const { ctx, p } = await open('/portal/c/c1', 'admin', 1440, 87)
  await p.locator('[data-portal-cta="collect"]').click(); await p.waitForTimeout(600)
  //  사유 하나만 고르고 나머지는 그대로 둡니다.
  await p.locator('[data-choice="reason"] [data-choice-item]').first().click(); await p.waitForTimeout(200)

  const bodies = []
  p.on('request', (r) => {
    if (r.method() === 'POST' && r.url().includes('client_requests')) bodies.push(r.postData() ?? '')
  })
  await p.locator('[data-req-send]').click(); await p.waitForTimeout(1500)
  const sent = bodies[0] ?? ''
  //  ⚠ 0 도 기본값도 보내지 않습니다. 아예 안 보냅니다 — 「0kg」과
  //    「모름」은 배차에서 완전히 다른 말입니다.
  ok(!/expected_kg/.test(sent), '안 고르면 예상량을 **아예 안 보낸다** (0 으로 채우지 않는다)', sent.slice(0, 160))
  ok(!/waste_type/.test(sent), '안 고르면 유형도 안 보낸다')
  ok(!/"desired_date":"20/.test(sent), '안 고르면 날짜도 안 보낸다')
  await ctx.close()
}

// ── ⑪ 판이 낮아도 **고른 것이 사라지지 않는다** (0089) ────────────────────
//     ⚠ 예전에는 판이 낮으면 이 두 줄을 아예 안 물었습니다. 이제는
//       물어보되, 칸이 없는 서버에는 **글로** 남깁니다. 병원이 고른 것이
//       조용히 사라지는 것이 제일 나쁩니다.
{
  const { ctx, p } = await open('/portal/c/c1', 'admin', 1440, 83)
  await p.locator('[data-portal-cta="collect"]').click(); await p.waitForTimeout(600)
  await p.locator('[data-choice="amount"] [data-choice-item]').nth(2).click(); await p.waitForTimeout(150)

  const bodies = []
  p.on('request', (r) => {
    if (r.method() === 'POST' && r.url().includes('client_requests')) bodies.push(r.postData() ?? '')
  })
  await p.locator('[data-req-send]').click(); await p.waitForTimeout(1500)
  const sent = bodies[0] ?? ''
  ok(!/expected_kg/.test(sent), '판이 낮으면 **없는 칸을 안 보낸다** (요청 자체가 실패하면 안 됩니다)')
  ok(/예상 배출량 많음/.test(sent), '**그래도 고르신 것은 글로 남는다**', sent.slice(0, 180))
  await ctx.close()
}

await b.close()
