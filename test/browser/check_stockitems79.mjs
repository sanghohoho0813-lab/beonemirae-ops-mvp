import { chromium, EXEC } from './_pw.mjs'

//  0079 — 자재 관리에서 규격별 재고가 보이는가
//
//   대표님: 「2L 합성수지 ~ 기저귀비닐 40L 까지도 수량을 실시간으로 확인할 수
//   있게 해줘. 지금은 골판지 전용박스부터 합성수지 바늘통까지 4개밖에 없어서
//   불편해.」
//
//   여기서 제일 중요한 검사
//    · 13 규격이 전부 보인다 (양 끝 — 2L 합성수지 · 기저귀비닐 40L)
//    · **안 세어 본 규격을 0 으로 그리지 않는다** — 「아직 안 세어 봄」
//    · 세어 넣으면 그 수가 서버로 간다 (더하기가 아니라 그 수로)
//    · 판 78 이하에서는 아예 안 그린다 (없는 것을 0 으로 채우지 않음)

const BASE = 'http://localhost:4173'
const AD = '00000000-0000-0000-0000-0000000000a9'
const V3 = '00000000-0000-0000-0000-0000000000v3'
const ok = (c, m, d = '') => { console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`); if (!c) process.exitCode = 1 }
const flat = (t) => (t ?? '').replace(/\s+/g, ' ').trim()

const ITEMS = ['plastic2', 'plastic5', 'plastic10', 'plastic20', 'box63', 'box35', 'box30',
  'box12', 'box4', 'box79', 'diaperBoxM', 'pouch12', 'diaperBag40']

const b = await chromium.launch({ executablePath: EXEC })

async function open({ w = 1280, ver = 79, counted = {} } = {}) {
  const ctx = await b.newContext({ viewport: { width: w, height: 1100 }, isMobile: w < 700, hasTouch: w < 700 })
  const me = { id: AD, email: 'a@b.c', name: '송대표', role: 'admin', font_scale: 'normal',
    active: true, approved_at: '2026-01-01T00:00:00Z', client_id: null, vehicle_id: V3,
    created_at: '2026-01-01T00:00:00Z' }
  const calls = []
  //  서버가 들고 있는 규격별 재고 — 센 것만 숫자, 나머지는 null 입니다.
  const rows = ITEMS.map((k) => ({
    item: k,
    qty: k in counted ? counted[k] : null,
    counted_at: k in counted ? '2026-08-24T00:00:00Z' : null,
  }))
  ctx.route('**/auth/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: AD, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }) }))
  ctx.route('**/rest/v1/**', (r) => {
    const url = r.request().url()
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    if (url.includes('/rpc/app_schema_version')) return json(ver)
    for (const fn of ['count_stock_item', 'receive_stock_items']) {
      if (url.includes(`/rpc/${fn}`)) {
        const p = JSON.parse(r.request().postData() ?? '{}')
        calls.push([fn, p])
        //  ⚠ 저장한 뒤 다시 읽으면 바뀐 값이 와야 합니다 — 안 그러면
        //    「저장했는데 화면이 그대로」인 것을 검사가 못 잡습니다.
        if (fn === 'count_stock_item') {
          const row = rows.find((x) => x.item === p.p_item)
          if (row) { row.qty = p.p_qty; row.counted_at = '2026-08-24T01:00:00Z' }
        }
        return json({ ok: true })
      }
    }
    if (url.includes('/rpc/')) return json(null)
    if (url.includes('/office_stock_items')) return json(rows)
    if (url.includes('/profiles')) return json(single ? me : [me])
    if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
    return json([])
  })
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: AD, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }])
  await p.goto(`${BASE}/materials`, { waitUntil: 'domcontentloaded' })
  await p.waitForFunction(() => {
    const t = document.querySelector('main')?.innerText ?? ''
    return t.length > 20 && !/불러오는 중/.test(t)
  }, null, { timeout: 40000 }).catch(() => {})
  await p.waitForTimeout(1500)
  return { ctx, p, calls }
}

// ── ① 13 규격이 전부 보인다 ───────────────────────────────────────────────
{
  const { ctx, p } = await open()
  ok((await p.locator('[data-spec-stocks]').count()) === 1, '**규격별 재고 칸이 있다**')

  const shown = await p.locator('[data-spec-stock]').count()
  //  ⚠ 대표님이 「4개밖에 없어서 불편해」라고 하신 그 숫자입니다.
  ok(shown === 13, '**4개가 아니라 13 규격이 보인다**', `${shown}개`)

  const t = flat(await p.locator('[data-spec-stocks]').innerText())
  ok(/2L 합성수지/.test(t), '양 끝 ① 2L 합성수지')
  ok(/기저귀비닐 40L/.test(t), '양 끝 ② 기저귀비닐 40L')
  for (const label of ['5L 합성수지', '10L 합성수지', '20L 합성수지', '63L 박스', '35L 박스',
                       '30L 박스', '12L 박스', '4L 박스', '79L 박스', '기저귀박스 (중)', '12L 봉투형용기']) {
    ok(t.includes(label), `사이 규격 「${label}」`)
  }
  //  재고 칸별로 묶여 있는지 — 「이게 어느 칸에서 빠지나」가 보여야 합니다.
  ok(/골판지 전용박스/.test(t) && /합성수지 전용용기/.test(t) && /전용 봉투/.test(t),
    '재고 칸별로 묶여 있다')
  await ctx.close()
}

// ── ② 안 세어 본 것을 0 으로 그리지 않는다 ────────────────────────────────
{
  const { ctx, p } = await open()
  const unknown = await p.locator('[data-spec-unknown]').count()
  ok(unknown === 13, '**13 개 전부 「아직 안 세어 봄」으로 나온다**', `${unknown}개`)

  const qty = await p.locator('[data-spec-qty]').count()
  //  ⚠ 이것이 이 검사의 핵심입니다. 0 개라고 적으면 대표님은 창고에 쌓여
  //    있는 63L 박스를 보고도 또 발주하시게 됩니다.
  ok(qty === 0, '**0 개라고 적힌 규격이 하나도 없다**', `숫자로 적힌 것 ${qty}개`)

  const t = flat(await p.locator('[data-spec-stocks]').innerText())
  ok(!/\b0개\b/.test(t) && !/ 0 개/.test(t), '「0개」라는 글자 자체가 없다')

  const why = flat(await p.locator('[data-spec-notyet]').innerText())
  ok(/13개 규격은 아직 안 세어 봤습니다/.test(why), '**왜 숫자가 없는지 먼저 말해 준다**', why.slice(0, 50))
  ok(/지어내지 않습니다/.test(why), '지어내지 않는다고 적혀 있다')
  await ctx.close()
}

// ── ③ 센 것은 숫자로, 안 센 것은 「모름」으로 — 한 화면에서 갈린다 ────────
{
  const { ctx, p } = await open({ counted: { box63: 120, plastic2: 45 } })
  ok((await p.locator('[data-spec-qty="box63"]').count()) === 1, '**63L 박스는 숫자로 나온다**')
  ok(/120/.test(flat(await p.locator('[data-spec-qty="box63"]').innerText())),
    '센 수 그대로 120', flat(await p.locator('[data-spec-qty="box63"]').innerText()))
  ok((await p.locator('[data-spec-qty="plastic2"]').count()) === 1, '2L 합성수지도 숫자로')
  //  옆 규격은 여전히 모름입니다 — 하나 셌다고 나머지가 0 이 되지 않습니다.
  ok((await p.locator('[data-spec-unknown="box35"]').count()) === 1,
    '**옆 규격(35L)은 여전히 「아직 안 세어 봄」**')
  ok((await p.locator('[data-spec-unknown]').count()) === 11, '나머지 11 개도 그대로',
    String(await p.locator('[data-spec-unknown]').count()))
  await ctx.close()
}

// ── ④ 세어 넣으면 그 수가 서버로 간다 ────────────────────────────────────
{
  const { ctx, p, calls } = await open()
  await p.locator('[data-spec-count="box63"]').click()
  await p.waitForTimeout(700)
  ok((await p.locator('[data-spec-count-qty]').count()) === 1, '세어 넣는 칸이 열린다')

  const t = flat(await p.locator('[role="dialog"]').innerText())
  //  ⚠ 더하기로 오해하면 재고가 두 배가 됩니다.
  ok(/그 수로 정해집니다/.test(t), '**더하는 게 아니라 그 수로 정한다고 적혀 있다**')

  //  ＋ 를 눌러 수를 올립니다
  const up = p.locator('[data-spec-count-qty] [data-qty-plus], [data-spec-count-qty] button').last()
  for (let i = 0; i < 3; i += 1) { await up.click(); await p.waitForTimeout(120) }
  await p.locator('[data-spec-count-why]').fill('월말 창고 실사')
  await p.waitForTimeout(250)
  await p.locator('[data-spec-count-go]').click()
  await p.waitForTimeout(1400)

  const c = calls.find(([k]) => k === 'count_stock_item')
  ok(!!c, '**세어 넣은 수가 서버까지 간다**', JSON.stringify(calls).slice(0, 80))
  ok(c?.[1]?.p_item === 'box63', '그 규격이 맞다', String(c?.[1]?.p_item))
  ok(Number(c?.[1]?.p_qty) > 0, '수량이 실려 간다', String(c?.[1]?.p_qty))
  ok(c?.[1]?.p_reason === '월말 창고 실사', '왜 세었는지도 같이 간다', String(c?.[1]?.p_reason))

  //  저장 뒤 화면이 실제로 바뀌어야 합니다.
  ok((await p.locator('[data-spec-qty="box63"]').count()) === 1,
    '**저장하면 그 자리가 숫자로 바뀐다**')
  await ctx.close()
}

// ── ⑤ 규격으로 입고 ──────────────────────────────────────────────────────
{
  const { ctx, p, calls } = await open({ counted: { box63: 100 } })
  const boxes = await p.locator('[data-spec-add]').count()
  ok(boxes === 13, '**입고도 13 규격으로 적는다** (예전에는 넉 칸뿐이었습니다)', `${boxes}칸`)

  const field = p.locator('[data-spec-add="box63"] button').last()
  for (let i = 0; i < 2; i += 1) { await field.click(); await p.waitForTimeout(120) }
  await p.locator('[data-spec-memo]').fill('8월 발주분')
  await p.waitForTimeout(250)
  await p.locator('[data-spec-receive]').click()
  await p.waitForTimeout(1400)

  const r = calls.find(([k]) => k === 'receive_stock_items')
  ok(!!r, '**입고가 규격으로 서버까지 간다**', JSON.stringify(calls).slice(0, 80))
  ok(r && Object.keys(r[1].p_items ?? {}).includes('box63'), '규격 키가 실려 간다',
    JSON.stringify(r?.[1]?.p_items))
  ok(r?.[1]?.p_memo === '8월 발주분', '어디서 들어왔는지도 같이 간다', String(r?.[1]?.p_memo))
  await ctx.close()
}

// ── ⑥ 판 78 이하 — 아예 안 그린다 ─────────────────────────────────────────
{
  //  ⚠ 서버에 그 표가 없는데 빈 칸을 0 으로 채워 두면 그게 곧 거짓말입니다.
  const { ctx, p } = await open({ ver: 78 })
  ok((await p.locator('[data-spec-stocks]').count()) === 0,
    '**판 78 에서는 규격별 재고를 아예 안 그린다** (없는 것을 0 으로 채우지 않음)')
  //  기존 넉 장 카드는 그대로 있어야 합니다 — 되돌려도 화면이 비지 않습니다.
  const t = flat(await p.locator('main').innerText())
  ok(/골판지 전용박스/.test(t), '기존 넉 장 카드는 그대로 있다')
  await ctx.close()
}

// ── ⑦ 폰에서도 밖으로 안 나간다 ───────────────────────────────────────────
{
  const { ctx, p } = await open({ w: 390, counted: { box63: 1200 } })
  const over = await p.locator('[data-spec-stock]').evaluateAll((els) =>
    els.filter((e) => {
      const r = e.getBoundingClientRect()
      return r.left < -1 || r.right > 391
    }).length)
  ok(over === 0, '**390px 밖으로 나가는 줄이 없다**', `${over}개`)
  const box = await p.locator('[data-spec-count="box63"]').boundingBox()
  ok((box?.height ?? 0) >= 40, '「고치기」가 손가락으로 눌린다', `${Math.round(box?.height ?? 0)}px`)
  await ctx.close()
}

await b.close()
