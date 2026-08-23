import { chromium, EXEC } from './_pw.mjs'

//  0075 — 자재 관리가 **규격별**로 돕니다
//
//   대표님 지적: 「자재관리에 주고 온 자재도 있어야 해. 지금은 4개밖에
//   없잖아? 10개 이상 정리돼야 하고, 클릭 또는 직접 키패드 입력 방법으로
//   손쉽게 수량 이런 것도 수정할 수 있어야 해.」
//
//   ⚠ 이 화면만 옛 3칸(박스·비닐·바늘통)에 멈춰 있었습니다. 여기서 등록하면
//     규격이 안 남아 정산이 대표 규격 단가를 **추정**합니다 — 63L 박스와
//     12L 박스는 매입가가 다릅니다.
//
//   확인하는 것
//    · 공급 등록에 규격이 13가지 나온다 (3가지가 아니라)
//    · ＋ － 로 누를 수 있고 숫자를 **직접 칠 수도** 있다
//    · 어느 재고가 얼마나 주는지 「창고 100 → 이번 공급 4 → 저장 후 96」
//    · 저장하면 **규격 그대로** 서버로 간다
//    · 재고보다 많으면 저장 못 한다
//    · 이번 달 규격별 공급이 화면에 정리돼 있다
//    · 사무실 재고 입고도 ＋ － 와 키패드 둘 다 된다

const BASE = 'http://localhost:4173'
const ME = '00000000-0000-0000-0000-0000000000a9'
const C1 = '00000000-0000-0000-0000-0000000000a1'
const ok = (c, m, d = '') => { console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`); if (!c) process.exitCode = 1 }
const flat = (t) => (t ?? '').replace(/\s+/g, ' ').trim()
const T = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })

const clients = [{ id: C1, name: '더원요양병원', type: '요양병원', address: '경기도', manager: '김',
  phone: '031', collection_cycle: '주 3회', collects_medical_waste: true, collects_diaper: true,
  storage_size: '보통', note: '', is_demo_generated: false, active: true, pricing: {},
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }]
const stockRow = { id: 1, corrugated_box: 100, plastic_container: 6, bag: 80, needle_box: 10 }
//  이번 달 공급 두 건 — 하나는 규격이 있고 하나는 옛 기록입니다.
const materials = [
  { id: 'm1', date: T, client_id: C1, box_count: 12, vinyl_count: 5, needle_box_count: 3,
    is_additional_request: false, memo: '', items: { box63: 4, box12: 8, plastic20: 3, diaperBag40: 5 } },
  { id: 'm2', date: T, client_id: C1, box_count: 7, vinyl_count: 0, needle_box_count: 0,
    is_additional_request: false, memo: '엑셀에서 옮긴 옛 기록', items: null },
]

const b = await chromium.launch({ executablePath: EXEC })

async function open(ver, { w = 1280 } = {}) {
  const ctx = await b.newContext({ viewport: { width: w, height: 1100 }, isMobile: w < 700, hasTouch: w < 700 })
  const me = { id: ME, email: 'a@b.c', name: '관리자', role: 'admin', font_scale: 'normal', active: true,
    approved_at: '2026-01-01T00:00:00Z', client_id: null, vehicle_id: null, created_at: '2026-01-01T00:00:00Z' }
  const state = { calls: [] }
  ctx.route('**/auth/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: ME, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }) }))
  ctx.route('**/rest/v1/**', (r) => {
    const url = r.request().url()
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    if (url.includes('/rpc/app_schema_version')) return json(ver)
    if (url.includes('/rpc/supply_materials_items')) {
      state.calls.push(['items', JSON.parse(r.request().postData() ?? '{}')])
      return json({ id: 'new', alreadySaved: false })
    }
    if (url.includes('/rpc/supply_materials')) {
      state.calls.push(['legacy', JSON.parse(r.request().postData() ?? '{}')])
      return json({ id: 'new', alreadySaved: false })
    }
    if (url.includes('/rpc/')) return json(null)
    if (url.includes('/material_transactions')) return json([])
    if (url.includes('/profiles')) return json(single ? me : [me])
    if (url.includes('/clients')) return json(single ? clients[0] : clients)
    if (url.includes('/materials')) return json(materials)
    if (url.includes('/office_stock')) return json(single ? stockRow : [stockRow])
    return json([])
  })
  const p = await ctx.newPage()
  //  ⚠ 같은 거래처·같은 날짜에 공급이 이미 있으면 화면이 「그래도 하나 더
  //    등록할까요?」를 묻습니다(수거 입력에서 함께 넣은 것과 겹치지 않게).
  //    검사 자료에 오늘 공급이 두 건 있으므로 그 물음에 「예」로 답합니다 —
  //    묻는 것 자체는 그대로 두어야 할 규칙입니다.
  p.on('dialog', (d) => void d.accept())
  await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: ME, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }])
  await p.goto(`${BASE}/materials`, { waitUntil: 'domcontentloaded' })
  await p.waitForFunction(() => {
    const t = document.querySelector('main')?.innerText ?? ''
    return t.length > 20 && !/불러오는 중/.test(t)
  }, null, { timeout: 40000 }).catch(() => {})
  await p.waitForTimeout(1400)
  return { ctx, p, state }
}

// ── ① 이번 달 규격별 공급 ──────────────────────────────────────────────────
{
  const { ctx, p } = await open(75)
  ok((await p.locator('[data-month-items]').count()) === 1, '**이번 달 규격별 공급이 화면에 있다**')
  const n = await p.locator('[data-month-item]').count()
  ok(n >= 10, `**규격이 ${n}가지 정리돼 있다** (예전에는 3가지)`, `${n}가지`)
  const t = flat(await p.locator('[data-month-items]').innerText())
  ok(/63L 박스/.test(t) && /12L 박스/.test(t) && /20L 합성수지/.test(t), '규격 이름이 그대로 보임', t.slice(0, 70))
  //  ⚠ 규격이 없는 옛 기록을 규격 칸에 밀어 넣지 않습니다.
  ok((await p.locator('[data-month-legacy]').count()) === 1, '**규격 없는 옛 기록은 따로 적는다** (지어내지 않음)')
  await ctx.close()
}

// ── ② 공급 내역도 규격으로 ─────────────────────────────────────────────────
{
  const { ctx, p } = await open(75)
  const line = flat(await p.locator('[data-supply-line="m1"]').innerText())
  ok(/63L 박스 4/.test(line) && /12L 박스 8/.test(line),
    '**공급 내역이 규격으로 보인다** (「박스 12」로 뭉개지 않음)', line)
  ok((await p.locator('[data-supply-legacy="m2"]').count()) === 1, '옛 기록에는 「규격 미상」이 붙는다')
  await ctx.close()
}

// ── ③ 공급 등록 — 클릭과 키패드 둘 다 ──────────────────────────────────────
{
  const { ctx, p, state } = await open(75)
  await p.getByRole('button', { name: /공급 등록/ }).first().click()
  await p.waitForTimeout(700)

  const rows = await p.locator('[data-supply-item]').count()
  ok(rows >= 10, `**등록 칸이 ${rows}가지** (예전에는 박스·비닐·바늘통 3가지)`, `${rows}가지`)

  const dlg = p.locator('[role="dialog"]')
  await dlg.locator('select').first().selectOption(C1)
  await p.waitForTimeout(200)

  //  ＋ 로 눌러서
  const plus = p.locator('[data-supply-item="box63"] button[aria-label*="더하기"]')
  const box = await plus.boundingBox()
  ok((box?.height ?? 0) >= 44, '＋ 단추가 손가락 크기', `${Math.round(box?.height ?? 0)}px`)
  await plus.click()
  await plus.click()
  await p.waitForTimeout(300)
  ok((await p.locator('[data-supply-item="box63"] input[type="number"]').inputValue()) === '2',
    '**＋ 를 눌러 셀 수 있다**')

  //  키패드로 직접
  await p.locator('[data-supply-item="box12"] input[type="number"]').fill('40')
  await p.waitForTimeout(300)
  ok((await p.locator('[data-supply-item="box12"] input[type="number"]').inputValue()) === '40',
    '**숫자를 직접 칠 수도 있다**')

  //  어느 재고가 얼마나 주는지
  const g = flat(await p.locator('[data-supply-group-stock="corrugatedBox"]').innerText())
  ok(/100/.test(g) && /42/.test(g) && /58/.test(g),
    '**창고 100 → 이번 공급 42 → 저장 후 58** 이 보인다', g)

  await p.getByRole('button', { name: /^등록|저장/ }).last().click()
  await p.waitForTimeout(1600)
  const sent = state.calls.find(([k]) => k === 'items')
  ok(!!sent, '**규격 그대로 서버로 간다**', JSON.stringify(state.calls).slice(0, 70))
  ok(sent?.[1]?.p_items?.box63 === 2 && sent?.[1]?.p_items?.box12 === 40,
    '규격과 수량이 그대로', JSON.stringify(sent?.[1]?.p_items))
  ok(!state.calls.find(([k]) => k === 'legacy'), '옛 3칸 함수는 안 부른다')
  await ctx.close()
}

// ── ④ 재고보다 많으면 ──────────────────────────────────────────────────────
{
  const { ctx, p, state } = await open(75)
  await p.getByRole('button', { name: /공급 등록/ }).first().click()
  await p.waitForTimeout(700)
  await p.locator('[role="dialog"]').locator('select').first().selectOption(C1)
  //  합성수지 재고는 6개뿐입니다.
  await p.locator('[data-supply-item="plastic20"] input[type="number"]').fill('99')
  await p.waitForTimeout(400)
  const body = flat(await p.locator('[role="dialog"]').innerText())
  ok(/재고보다 많이 공급할 수 없습니다/.test(body), '**화면이 먼저 말해 준다**', body.slice(body.indexOf('재고보다'), body.indexOf('재고보다') + 60))
  //  ⚠ 말만 해 주고 단추를 열어 두면 눌러 보고 나서 서버 오류를 또 읽습니다.
  ok(await p.getByRole('button', { name: /^등록|저장/ }).last().isDisabled(), '**그 상태로는 누를 수도 없다**')
  ok(state.calls.length === 0, '서버로 안 감')
  await ctx.close()
}

// ── ⑤ 사무실 재고 입고도 ＋ － 와 키패드 ───────────────────────────────────
{
  const { ctx, p } = await open(75)
  const plus = p.locator('[data-stock-item="bag"] button[aria-label*="더하기"]')
  ok((await plus.count()) === 1, '입고에도 ＋ 단추가 있다')
  await plus.click()
  await p.waitForTimeout(300)
  //  ⚠ 넣는 즉시 「80 → 81」이 보여야 합니다. 저장하고 나서 확인하게 하지 않습니다.
  ok((await p.locator('[data-stock-after="bag"]').count()) === 1, '**입고하면 저장 후 숫자가 미리 보인다**')
  const t = flat(await p.locator('[data-stock-item="bag"]').innerText())
  ok(/80/.test(t) && /81/.test(t), '80 → 81', t.slice(0, 50))
  await p.locator('[data-stock-item="bag"] input[type="number"]').fill('25')
  await p.waitForTimeout(300)
  const t2 = flat(await p.locator('[data-stock-item="bag"]').innerText())
  ok(/105/.test(t2), '직접 쳐도 됨 (80 + 25 = 105)', t2.slice(0, 50))
  await ctx.close()
}

// ── ⑥ 폰에서도 ─────────────────────────────────────────────────────────────
{
  const { ctx, p } = await open(75, { w: 390 })
  const box = await p.locator('[data-month-items]').boundingBox()
  ok((box?.width ?? 999) <= 390, '이번 달 규격별 공급이 폰에서 안 밀림', `${Math.round(box?.width ?? 0)}px`)
  await ctx.close()
}

// ── ⑦ 판 74 이하 — 옛 길로 ─────────────────────────────────────────────────
//   ⚠ 판 74 서버에는 규격 함수가 없습니다. 그때도 저장은 돼야 합니다.
{
  const { ctx, p, state } = await open(74)
  await p.getByRole('button', { name: /공급 등록/ }).first().click()
  await p.waitForTimeout(700)
  await p.locator('[role="dialog"]').locator('select').first().selectOption(C1)
  await p.locator('[data-supply-item="box63"] input[type="number"]').fill('3')
  await p.waitForTimeout(300)
  await p.getByRole('button', { name: /^등록|저장/ }).last().click()
  await p.waitForTimeout(1600)
  //  화면은 규격을 보내려 하고, 서버가 못 받으면 그건 서버 몫입니다.
  //  여기서 보는 것은 **저장 시도가 실제로 나갔는가** 하나입니다.
  ok(state.calls.length > 0, '판 74 에서도 저장 시도는 나간다', JSON.stringify(state.calls).slice(0, 60))
  await ctx.close()
}

await b.close()
