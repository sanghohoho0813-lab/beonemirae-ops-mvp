import { chromium, EXEC } from './_pw.mjs'

//  0063 뒤 **청구 금액이 1원도 안 달라졌는가.**
//
//  ── 왜 이 검사가 따로 필요한가 ─────────────────────────────────────────────
//
//   0063 은 거래처의 단가·월정액을 `clients` 행에서 **떼어 냈습니다.**
//   앱은 이제 `client_billing_terms()` 로 따로 받아 붙입니다(`applyTerms`).
//
//   그런데 지금까지의 돈 검사들은 전부 **0063 이전 모양**을 씁니다 —
//   거래처 행에 `pricing` 을 얹어 놓습니다. 실서버는 더 이상 그 칸을
//   주지 않습니다. 즉 **붙이는 과정이 깨져도 검사가 못 잡습니다.**
//   단가를 못 받으면 그 거래처 청구는 **조용히 기본 단가로** 계산되고,
//   그 금액이 그대로 병원에 나갑니다.
//
//   그래서 픽스처 60여 개를 고치는 대신, **같은 자료를 두 모양으로** 돌려
//   화면에 뜬 금액이 **글자 그대로 같은지**를 봅니다.
//
//     옛 모양  거래처 행에 pricing 있음   · RPC 는 빈 배열
//     새 모양  거래처 행에 pricing 없음   · RPC 가 단가를 줌   ← 실서버
//
//   ⚠ 마지막에 **일부러 RPC 를 비워** 금액이 실제로 달라지는지도 봅니다.
//     안 달라지면 이 검사는 아무것도 증명하지 못하는 것입니다.

const BASE = 'http://localhost:4173'
const UID = '00000000-0000-0000-0000-0000000000ad'
const CA = '00000000-0000-0000-0000-0000000000a1'
const CF = '00000000-0000-0000-0000-0000000000f1'
const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  if (!c) process.exitCode = 1
}
const flat = (s) => (s ?? '').replace(/\s+/g, ' ').trim()

const now = new Date()
const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
const MONTH = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`
const day = (n) => `${MONTH}-${String(n).padStart(2, '0')}`

const profile = {
  id: UID, email: 'admin@beonemirae.test', name: '대표', role: 'admin', font_scale: 'normal',
  active: true, approved_at: '2026-01-01T00:00:00Z', client_id: null, created_at: '2026-01-01T00:00:00Z',
}

//  ⚠ 돈 칸은 여기 **넣지 않습니다.** 모양에 따라 아래에서 붙입니다.
const mkClient = (id, name) => ({
  id, name, type: '병원', address: '', manager: '', phone: '', collection_cycle: '주 1회',
  collects_medical_waste: true, collects_diaper: false, storage_size: '보통', note: '',
  is_demo_generated: false, demo_session_id: null, active: true,
  contract_start: null, contract_end: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
})

//  A병원 — 자기 단가 1,000원/kg (기본 950원과 **다른** 값이어야 합니다.
//  같으면 단가를 못 받아도 금액이 같아서 검사가 헛돕니다.)
const A_PRICING = { medical: { sale: 1000, cost: 400 } }
//  F한양병원 — 월정액 900만원. 월정액도 같은 통로로 옵니다.
const F_PRICING = { medicalMonthly: { sale: 9000000 }, medical: { sale: null, cost: 450 } }

const clients = [mkClient(CA, 'A병원'), mkClient(CF, 'F한양병원')]

const sched = []
let n = 0
const done = (clientId, d, kg) => {
  sched.push({
    id: `s${n++}`, date: d, client_id: clientId, waste_type: '의료폐기물', vehicle_id: null,
    scheduled_time: '', status: '완료', expected_amount: kg, actual_amount: kg,
    completed_at: `${d}T09:00:00Z`, memo: '', origin: 'migrated', is_additional: false,
    demo_session_id: null, plan_batch: null, canceled_at: null,
    created_at: `${d}T00:00:00Z`, updated_at: `${d}T00:00:00Z`,
  })
}
//  A병원 1,000kg × 1,000원 = 100만원  (기본 950원이면 95만원 — 5만원 차이)
done(CA, day(5), 400)
done(CA, day(12), 300)
done(CA, day(19), 300)
//  F한양병원 — 수거가 있어야 월정액이 청구됩니다
done(CF, day(6), 100)

const b = await chromium.launch({ executablePath: EXEC })

/**
 * mode: 'old'   거래처 행에 pricing 을 얹습니다 (0063 이전 서버)
 *       'new'   거래처 행에는 없고 RPC 가 줍니다 (지금 서버)
 *       'lost'  거래처 행에도 없고 RPC 도 빈 배열 (단가를 못 받은 상태)
 */
async function amounts(mode) {
  const ctx = await b.newContext({ viewport: { width: 1500, height: 1200 } })
  const withMoney = (c) => ({
    ...c,
    pricing: c.id === CA ? A_PRICING : F_PRICING,
    monthly_flat_fee: null, payment_terms: '', payment_due_day: null,
  })
  const terms = [
    { id: CA, pricing: A_PRICING, monthlyFlatFee: null, paymentTerms: '', paymentDueDay: null },
    { id: CF, pricing: F_PRICING, monthlyFlatFee: null, paymentTerms: '', paymentDueDay: null },
  ]
  await ctx.route('**/auth/v1/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: UID, aud: 'authenticated', email: profile.email, app_metadata: {}, user_metadata: {} }) }))
  await ctx.route('**/rest/v1/**', (r) => {
    const url = r.request().url()
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    if (url.includes('/rpc/app_schema_version')) return json(64)
    if (url.includes('/rpc/client_billing_terms')) return json(mode === 'new' ? terms : [])
    if (url.includes('/rpc/')) return json(null)
    if (url.includes('/profiles')) return json(single ? profile : [profile])
    if (url.includes('/clients')) {
      const rows = mode === 'old' ? clients.map(withMoney) : clients
      return json(single ? rows[0] : rows)
    }
    if (url.includes('/schedules')) return json(sched)
    if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
    return json([])
  })
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: UID, aud: 'authenticated', email: profile.email, app_metadata: {}, user_metadata: {} }])
  await p.goto(`${BASE}/billing`, { waitUntil: 'domcontentloaded' })
  await p.waitForSelector('[data-close-summary]', { timeout: 20000 })
  await p.waitForTimeout(800)

  //  ⚠ 금액을 **글자 그대로** 집습니다. 숫자로 바꿔서 견주면 1,000,000 과
  //    1000000 이 같아 보여 표기가 깨진 것을 못 잡습니다.
  const rowA = flat(await p.textContent(`[data-close-row="${CA}"]`).catch(() => ''))
  const summary = flat(await p.textContent('[data-close-summary]'))
  const money = (t) => (t.match(/[\d,]+원/g) ?? []).join(' · ')
  //  단가를 못 받은 줄은 화면이 어떻게 다루는가 — 경고가 뜨는지,
  //  체크가 꺼진 채로 시작하는지. 이게 실제 안전장치입니다.
  const warned = (await p.locator('[data-close-warn]').count()) === 1
  const checked = await p.locator(`[data-close-row="${CA}"] input`).isChecked().catch(() => null)

  //  ⚠ 월말 청구 한 곳만 맞아서는 부족합니다. **같은 단가가 흐르는 다른
  //    자리**도 봐야 합니다 — 거래처 상세의 「월 정산·명세서」가 실제로
  //    병원에 나가는 금액이고, 미수금은 그 뒤를 잇습니다.
  await p.goto(`${BASE}/clients/${CA}`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(2200)
  let settle = ''
  const tab = p.locator('[data-client-tab="settlement"]')
  if (process.env.DBG) console.log('DBG tabs=', (await p.locator('[data-client-tab]').allTextContents()).join(','), 'url=', p.url())
  if ((await tab.count()) > 0) {
    await tab.click()
    await p.waitForTimeout(900)
    //  ⚠ 정산 탭은 **이번 달**부터 엽니다. 이 검사의 수거는 지난달에
    //    있으므로 달을 옮기지 않으면 「집계할 것이 없다」만 나오고,
    //    금액이 빈 채로 「같다」가 됩니다 — 실제로 그렇게 공허하게
    //    통과할 뻔했습니다.
    await p.getByLabel('정산 월').selectOption(MONTH).catch(() => {})
    await p.waitForTimeout(900)
    settle = money(flat(await p.textContent('main')))
    if (process.env.DBG) console.log('DBG settleText=', flat(await p.textContent('main')).slice(-400))
  }

  const out = {
    rowA: money(rowA), summary: money(summary), rawA: rowA.slice(0, 80),
    warned, checked, settle,
  }
  await ctx.close()
  return out
}

const oldWay = await amounts('old')
const newWay = await amounts('new')
const lost = await amounts('lost')

console.log('── 1. 옛 모양에서 금액이 실제로 나오는가 ──')
ok(/1,000,000원/.test(oldWay.rowA), '옛 모양 — A병원 100만원 (자기 단가 1,000원 × 1,000kg)', oldWay.rawA)
ok(oldWay.summary.length > 0, '옛 모양 — 합계도 나옴', oldWay.summary)

console.log('── 2. 새 모양(지금 서버)에서 **똑같이** 나오는가 ──')
ok(newWay.rowA === oldWay.rowA, '**거래처 줄 금액이 글자까지 같음**', `${oldWay.rowA} vs ${newWay.rowA}`)
ok(newWay.summary === oldWay.summary, '**합계도 글자까지 같음**', `${oldWay.summary} vs ${newWay.summary}`)
ok(/1,000,000원/.test(newWay.rowA), '새 모양도 A병원 100만원', newWay.rawA)
//  ⚠ 월정액 900만원도 같은 통로로 옵니다. kg 단가만 보면 이걸 놓칩니다.
//    합계 10,000,000원 = A병원 100만 + F한양병원 월정액 900만 입니다.
//    (앞서 `false === false` 로 공허하게 통과하던 자리였습니다 — 두 쪽 다
//     「없음」이어도 참이 됐습니다. 값을 직접 못 박습니다.)
ok(/10,000,000원/.test(newWay.summary),
  '**월정액 900만원도 새 통로로 옴** (합계 = 100만 + 900만)', newWay.summary)
ok(/10,000,000원/.test(oldWay.summary), '옛 모양에서도 같은 합계', oldWay.summary)

console.log('── 2-b. 같은 단가가 흐르는 다른 자리 (정산·명세서) ──')
//   ⚠ 월말 청구 한 곳만 맞아서는 부족합니다. 실제로 병원에 나가는 금액은
//     거래처 상세의 「월 정산·명세서」입니다.
ok(oldWay.settle.length > 0, '옛 모양 — 정산 탭에 금액이 나옴', oldWay.settle.slice(0, 70))
ok(newWay.settle === oldWay.settle, '**정산·명세서 금액도 글자까지 같음**',
  `옛 ${oldWay.settle.slice(0, 50)} · 새 ${newWay.settle.slice(0, 50)}`)
ok(lost.settle !== oldWay.settle, '여기서도 단가를 못 받으면 달라짐 (검사가 헛돌지 않음)',
  `정상 ${oldWay.settle.slice(0, 40)} · 못 받음 ${lost.settle.slice(0, 40)}`)

console.log('── 3. ⚠ 이 검사가 실제로 무는가 (일부러 단가를 못 받게) ──')
//   단가를 못 받으면 **기본 단가 950원**으로 떨어져 95만원이 됩니다.
//   여기서 금액이 안 달라지면 위 두 검사는 아무것도 증명하지 못한 것입니다.
ok(lost.rowA !== oldWay.rowA, '단가를 못 받으면 금액이 **달라짐** (검사가 헛돌지 않음)',
  `정상 ${oldWay.rowA} · 못 받음 ${lost.rowA}`)
ok(/950,000원/.test(lost.rowA), '못 받으면 기본 단가 950원으로 떨어짐', lost.rawA)

console.log('── 4. 그래도 조용히 청구되지는 않는가 (실제 안전장치) ──')
//   ⚠ 여기가 마지막 방패입니다. 단가를 못 받아도 화면이 **말해 주고**,
//     체크를 **꺼 둔 채로** 시작해야 합니다. 그래야 이사님이 「전체 선택」을
//     누르지 않는 한 추정 금액이 병원에 나가지 않습니다.
ok(lost.warned, '단가를 못 받으면 **기본 단가 경고가 뜸**')
ok(lost.checked === false, '그 거래처는 **체크가 꺼진 채로** 시작 (자동 확정 안 됨)', String(lost.checked))
ok(/기본 단가/.test(lost.rawA), '거래처 줄에도 「기본 단가」라고 적힘', lost.rawA)
ok(oldWay.warned === false, '정상일 때는 그 경고가 안 뜸 (늘 뜨면 배경이 됩니다)')
ok(newWay.warned === false, '새 통로로 제대로 받으면 경고 없음')
ok(newWay.checked === true, '정상일 때는 체크가 켜진 채로 시작', String(newWay.checked))

await b.close()
