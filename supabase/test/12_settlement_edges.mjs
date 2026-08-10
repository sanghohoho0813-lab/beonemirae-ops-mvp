// ─────────────────────────────────────────────────────────────────────────────
// 정산 경계값 검증 (실제 Supabase + 화면이 쓰는 계산)
//
//  07 은 "보통의 한 달"을 봅니다. 정산이 틀리는 자리는 보통이 아닌 곳입니다.
//
//   · 말일 밤에 넣은 수거가 다음 달로 넘어가지 않는가
//   · 규격을 기록하지 않던 시절의 공급이 정산에서 통째로 빠지지 않는가
//   · 단가를 안 정한 품목, 무료로 주기로 한 품목(단가 0)이 섞이면
//   · 수량이 커졌을 때 금액이 어긋나지 않는가
//   · 되돌린 수거가 매출에 남아 있지 않은가
//
//  월 마감 금액이 틀리면 거래처와 다투게 되고, 그때는 이미 늦습니다.
//  계산은 화면이 쓰는 그 함수(src/lib/billing.ts)를 그대로 불러 씁니다.
//
//  실행 (Node 22 이상)
//    export SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=...
//    node --experimental-strip-types supabase/test/12_settlement_edges.mjs
//
//  · 만드는 행은 전부 '[검증]' 표시가 붙고 끝나면 지웁니다.
//  · 거래처 단가를 잠시 바꾸는 항목이 있고, 끝나기 전에 원래대로 되돌립니다.
// ─────────────────────────────────────────────────────────────────────────────

import { settlementFor, invoiceFor, DEFAULT_PRICES, itemsOf, isLegacySupply } from '../../src/lib/billing.ts'

const U = process.env.SUPABASE_URL
const S = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!U || !S) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.')
  process.exit(1)
}
const MARK = '[검증]'

let pass = 0
let fail = 0
const ok = (t, e = '') => { pass++; console.log(`  PASS  ${t}${e ? '  ' + e : ''}`) }
const no = (t, e = '') => { fail++; console.log(`  FAIL  ${t}${e ? '  ' + e : ''}`) }
const check = (c, t, e = '') => (c ? ok(t, e) : no(t, e))
const section = (t) => console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 54 - t.length))}`)
const won = (n) => n.toLocaleString('ko-KR') + '원'

const json = async (r) => {
  const t = await r.text()
  let body = null
  try { body = t ? JSON.parse(t) : null } catch { body = t }
  return { status: r.status, body }
}
const svc = (path, init = {}) =>
  fetch(`${U}/rest/v1${path}`, {
    ...init,
    headers: { apikey: S, Authorization: `Bearer ${S}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers || {}) },
  }).then(json)

// repo.ts 의 매핑과 같은 모양 (화면이 보는 것과 같은 데이터)
const toClient = (r) => ({
  id: r.id, name: r.name, type: r.type, manager: r.manager ?? '',
  pricing: r.pricing ?? undefined, paymentDueDay: r.payment_due_day ?? undefined,
  paymentTerms: r.payment_terms ?? '',
})
const toSchedule = (r) => ({
  id: r.id, date: r.date, clientId: r.client_id, wasteType: r.waste_type,
  status: r.status, actualAmount: r.actual_amount ?? null,
})
const toMaterial = (r) => ({
  id: r.id, date: r.date, clientId: r.client_id,
  boxCount: r.box_count ?? 0, vinylCount: r.vinyl_count ?? 0,
  needleBoxCount: r.needle_box_count ?? 0,
  isAdditionalRequest: r.is_additional_request ?? false,
  items: r.items ?? undefined,
})

/** 그 달의 마지막 날 — 11월에 -31 을 쓰면 PostgREST 가 오류를 냅니다 */
const lastDay = (month) => {
  const [y, m] = month.split('-').map(Number)
  return `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`
}
async function loadFor(clientId, month) {
  const [c, s, m] = await Promise.all([
    svc(`/clients?select=*&id=eq.${clientId}`),
    svc(`/schedules?select=*&client_id=eq.${clientId}&date=gte.${month}-01&date=lte.${lastDay(month)}`),
    svc(`/materials?select=*&client_id=eq.${clientId}&date=gte.${month}-01&date=lte.${lastDay(month)}`),
  ])
  return {
    clients: (c.body || []).map(toClient),
    schedules: (s.body || []).map(toSchedule),
    materials: (m.body || []).map(toMaterial),
  }
}

/** 이 검사가 만든 행만 지웁니다 */
const trash = { schedules: [], materials: [] }
async function cleanup() {
  for (const id of trash.materials) await svc(`/materials?id=eq.${id}`, { method: 'DELETE' })
  for (const id of trash.schedules) await svc(`/schedules?id=eq.${id}`, { method: 'DELETE' })
}

async function addSchedule(clientId, vehicleId, date, kg, wasteType) {
  const r = await svc('/schedules', {
    method: 'POST',
    body: JSON.stringify({
      date, client_id: clientId, waste_type: wasteType, vehicle_id: vehicleId,
      scheduled_time: '10:00', expected_amount: kg, actual_amount: kg, actual_time: '10:00',
      status: '완료', is_additional: true, origin: 'seed', memo: `${MARK}정산경계`,
      event_id: crypto.randomUUID(),
    }),
  })
  const id = r.body?.[0]?.id
  if (id) trash.schedules.push(id)
  return id
}
async function addMaterial(clientId, date, body) {
  const r = await svc('/materials', {
    method: 'POST',
    body: JSON.stringify({ date, client_id: clientId, memo: `${MARK}정산경계`, origin: 'seed', ...body }),
  })
  const id = r.body?.[0]?.id
  if (id) trash.materials.push(id)
  return id
}

async function main() {
  console.log('\n════ 정산 경계값 검증 ════')

  const client = (await svc(`/clients?select=*&name=like.${encodeURIComponent(MARK + '*')}&order=name`)).body?.[0]
  const vehicle = (await svc(`/vehicles?select=id,waste_type&name=like.${encodeURIComponent(MARK + '*')}`)).body?.[0]
  if (!client || !vehicle) {
    console.error('검증용 거래처·차량이 없습니다. 05_live.mjs --setup 을 먼저 실행하세요.')
    process.exit(1)
  }
  const pricing0 = client.pricing ?? null
  const restorePricing = () => svc(`/clients?id=eq.${client.id}`, { method: 'PATCH', body: JSON.stringify({ pricing: pricing0 }) })

  // 실제 데이터와 섞이지 않도록 지난 과거의 두 달을 씁니다
  const M1 = '2019-11'
  const M2 = '2019-12'
  const P = (k) => DEFAULT_PRICES[k]
  const wasteKey = vehicle.waste_type === '의료폐기물' ? 'medical' : 'diaper'

  try {
    // ── 1. 월 경계 ────────────────────────────────────────────────────────
    section('1. 말일과 익월 1일')
    await addSchedule(client.id, vehicle.id, `${M1}-30`, 100, vehicle.waste_type)  // 11월 말일
    await addSchedule(client.id, vehicle.id, `${M2}-01`, 200, vehicle.waste_type)  // 12월 1일
    await addMaterial(client.id, `${M1}-30`, { box_count: 0, vinyl_count: 0, needle_box_count: 3, items: { plastic20: 3 } })
    await addMaterial(client.id, `${M2}-01`, { box_count: 0, vinyl_count: 0, needle_box_count: 5, items: { plastic20: 5 } })

    const s1 = settlementFor(await loadFor(client.id, M1), client.id, M1)
    const s2 = settlementFor(await loadFor(client.id, M2), client.id, M2)

    check(s1.wasteRevenue === 100 * P(wasteKey).sale,
      `말일(${M1}-30) 수거가 그 달에 잡힘`, `${won(s1.wasteRevenue)} (기대 ${won(100 * P(wasteKey).sale)})`)
    check(s2.wasteRevenue === 200 * P(wasteKey).sale,
      `익월 1일(${M2}-01) 수거가 다음 달에 잡힘`, `${won(s2.wasteRevenue)} (기대 ${won(200 * P(wasteKey).sale)})`)
    check(s1.supplyRevenue === 3 * P('plastic20').sale && s2.supplyRevenue === 5 * P('plastic20').sale,
      '공급도 각각 그 달에만', `${won(s1.supplyRevenue)} / ${won(s2.supplyRevenue)}`)
    check(s1.collections === 1 && s2.collections === 1, '두 달이 서로 섞이지 않음',
      `${M1} ${s1.collections}건 · ${M2} ${s2.collections}건`)

    // 거래명세서의 거래기간도 그 달로 닫혀야 합니다
    const inv1 = invoiceFor(await loadFor(client.id, M1), client.id, M1)
    check(inv1.from === `${M1}-01` && inv1.to === `${M1}-30`,
      '명세서 거래기간이 그 달로 닫힘', `${inv1.from} ~ ${inv1.to}`)
    check(inv1.medicalLines.every((l) => l.date.startsWith(M1)) &&
          inv1.diaperLines.every((l) => l.date.startsWith(M1)),
      '명세서 줄이 전부 그 달 날짜')

    // ── 2. 규격 미상 (예전 방식으로 저장된 공급) ──────────────────────────
    section('2. 규격을 기록하지 않던 시절의 공급')
    await addMaterial(client.id, `${M1}-15`, { box_count: 4, vinyl_count: 2, needle_box_count: 1, items: null })
    const d1 = await loadFor(client.id, M1)
    const s1b = settlementFor(d1, client.id, M1)
    const legacy = d1.materials.find((m) => isLegacySupply(m))
    check(!!legacy, '규격 미상 공급이 데이터에 있음')
    check(s1b.hasLegacySupply === true, '정산이 「규격 미상 포함」으로 표시')
    const mapped = itemsOf(legacy)
    check(mapped.box63 === 4 && mapped.diaperBag40 === 2 && mapped.plastic2 === 1,
      '옛 3칸이 대표 규격으로 읽힘 (정산에서 빠지지 않음)', JSON.stringify(mapped))
    check(s1b.materialCost > s1.materialCost,
      '규격 미상 공급도 원가에 반영', `${won(s1.materialCost)} → ${won(s1b.materialCost)}`)

    // ── 3. 단가가 없거나 0일 때 ───────────────────────────────────────────
    section('3. 단가를 안 정했거나 0원으로 정했을 때')
    await svc(`/clients?id=eq.${client.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ pricing: { [wasteKey]: { sale: 0, cost: 0 }, plastic20: { sale: null, cost: 3399 } } }),
    })
    const zero = settlementFor(await loadFor(client.id, M1), client.id, M1)
    check(zero.wasteRevenue === 0, '수거 단가 0원 → 매출 0 (오류가 아니라 0)', won(zero.wasteRevenue))
    // 총액으로 보면 안 됩니다. 앞 단계에서 넣은 규격 미상 공급이 plastic2 로
    // 읽혀 그쪽 매출이 함께 잡히기 때문입니다. 단가를 지운 그 품목 줄로 봅니다.
    const p20 = zero.supplyLines.find((l) => l.key === 'plastic20')
    check(p20 && p20.revenue === 0, '판매단가 없음(null) → 그 품목만 매출 0',
      p20 ? `${p20.qty}개 · 매출 ${won(p20.revenue)} · 원가 ${won(p20.cost)}` : '줄 없음')
    check(p20 && p20.salePrice === null, '화면에도 판매단가가 「없음」으로 내려감')
    check(p20 && p20.cost > 0, '단가가 없어도 원가는 계산됨')
    check(zero.margin === null || Number.isFinite(zero.margin),
      '매출 0일 때 영업이익률이 NaN 이 되지 않음', String(zero.margin))
    await restorePricing()

    // ── 4. 수량이 클 때 ───────────────────────────────────────────────────
    section('4. 수량이 커졌을 때')
    await addSchedule(client.id, vehicle.id, `${M1}-20`, 999999, vehicle.waste_type)
    const big = settlementFor(await loadFor(client.id, M1), client.id, M1)
    const expected = big.wasteLines.reduce((a, l) => a + l.qty * (l.salePrice ?? 0), 0)
    check(big.wasteRevenue === expected, '큰 수에서도 매출이 수량×단가와 일치', won(big.wasteRevenue))
    check(Number.isSafeInteger(big.revenue) && Number.isSafeInteger(big.cost),
      '금액이 안전한 정수 범위 안', `매출 ${won(big.revenue)} · 원가 ${won(big.cost)}`)
    check(big.profit === big.revenue - big.cost, '영업이익 = 매출 − 원가')

    // ── 5. 완료되지 않은 일정 ─────────────────────────────────────────────
    section('5. 아직 안 끝난 일정은 매출이 아니다')
    const pending = (await svc('/schedules', {
      method: 'POST',
      body: JSON.stringify({
        date: `${M1}-25`, client_id: client.id, waste_type: vehicle.waste_type,
        vehicle_id: vehicle.id, scheduled_time: '10:00', expected_amount: 500,
        status: '예정', origin: 'seed', memo: `${MARK}정산경계`,
      }),
    })).body?.[0]
    if (pending) trash.schedules.push(pending.id)
    const withPending = settlementFor(await loadFor(client.id, M1), client.id, M1)
    check(withPending.wasteRevenue === big.wasteRevenue,
      '예정 일정은 매출에 안 잡힘', `${won(big.wasteRevenue)} → ${won(withPending.wasteRevenue)}`)
    check(withPending.collections === big.collections,
      '집계 건수도 그대로', `${big.collections}건`)

    // ── 6. 저장 날짜가 한국 날짜인가 ──────────────────────────────────────
    section('6. 저장된 날짜가 한국 기준인가')
    //  DB 함수는 (now() at time zone 'Asia/Seoul')::date 를 씁니다.
    //  UTC 로 기록됐다면 15시(KST 자정) 이후 저장분이 하루 앞당겨집니다.
    //  월말 밤에 넣은 수거가 통째로 지난 달로 넘어가는 사고가 여기서 납니다.
    const recent = (await svc('/schedules?select=date,created_at&origin=eq.field&order=created_at.desc&limit=50')).body ?? []
    const mismatched = recent.filter((r) => {
      const kst = new Date(r.created_at).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
      const utc = new Date(r.created_at).toISOString().slice(0, 10)
      return r.date !== kst && r.date === utc   // UTC 로 찍힌 것만 문제
    })
    check(mismatched.length === 0, '실사용 저장분의 날짜가 한국 날짜와 일치',
      `${recent.length}건 확인 · 어긋남 ${mismatched.length}건`)
    const crossing = recent.filter((r) => {
      const kst = new Date(r.created_at).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
      return kst !== new Date(r.created_at).toISOString().slice(0, 10)
    })
    console.log(`        (그중 UTC 와 날짜가 갈리는 시간대 표본 ${crossing.length}건 — 0이면 이 검사는 아직 약합니다)`)

    // ── 7. 되돌린 수거 ────────────────────────────────────────────────────
    section('7. 되돌린 수거는 매출에서 빠지는가')
    const revertedRows = (await svc(`/collection_events?select=schedule_id&reverted=is.true&client_id=eq.${client.id}&limit=20`)).body ?? []
    const ids = new Set(revertedRows.map((r) => r.schedule_id).filter(Boolean))
    const live = (await svc(`/schedules?select=id,status&client_id=eq.${client.id}`)).body ?? []
    const stillCounted = live.filter((s) => ids.has(s.id) && s.status === '완료')
    check(stillCounted.length === 0, '되돌린 건이 완료 상태로 남아 있지 않음', `${stillCounted.length}건`)
  } catch (e) {
    //  중간에 터지면 여기서 붙잡아 실패로 남깁니다. 예전에는 catch 가 없어서,
    //  터진 뒤 finally 의 process.exit(0) 이 그대로 실행되며 '통과' 로 끝났습니다.
    //  (관리자 로그인이 막혔을 때 이 검사가 4건만 하고 YES 를 찍었습니다)
    no('검사 도중 오류가 났습니다', String(e?.message ?? e).slice(0, 200))
  } finally {
    section('정리')
    await restorePricing()
    await cleanup()
    const left = (await svc(`/schedules?select=id&memo=like.*${encodeURIComponent('정산경계')}*`)).body ?? []
    const leftM = (await svc(`/materials?select=id&memo=like.*${encodeURIComponent('정산경계')}*`)).body ?? []
    check(left.length === 0 && leftM.length === 0, '검사가 만든 행을 모두 지움',
      `일정 ${left.length}건 · 자재 ${leftM.length}건`)
    const c = (await svc(`/clients?select=pricing&id=eq.${client.id}`)).body?.[0]
    check(JSON.stringify(c?.pricing ?? null) === JSON.stringify(pricing0), '거래처 단가 원복')
  }

  console.log(`\n════ ${pass} PASS / ${fail} FAIL ════`)
  console.log(`정산 경계값: ${fail === 0 ? 'YES' : 'NO'}`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch(async (e) => { console.error(e); await cleanup(); process.exit(1) })
