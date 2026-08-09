// ─────────────────────────────────────────────────────────────────────────────
// 유상/무상 공급 구분 + 월 정산 연결 검증 (실제 Supabase)
//
//  "계산 함수만 따로 돌려 보는" 검증이 아닙니다.
//  실제 계정으로 로그인 → 실제 complete_collection 으로 수거를 완료 →
//  DB 에 남은 행을 다시 읽어 → 화면이 쓰는 그 계산(src/lib/billing.ts)에
//  그대로 물립니다. 현장에서 한 번 입력한 것이 재입력 없이 정산·거래명세서까지
//  이어지는지를 봅니다.
//
//  확인하는 것
//   1) 규격(63L / 12L / 20L …)이 DB 에 남는가 — 안 남으면 단가를 못 붙입니다
//   2) 유상 물품만 매출에 잡히고, 무상 물품은 원가에만 잡히는가
//   3) 수거량 → 수거매출 · 처리비 → 비용 · 영업이익까지 합이 맞는가
//   4) 거래명세서에 무상 물품이 청구로 올라가지 않는가
//   5) 거래처 단가·결제조건이 그대로 따라오는가
//   6) 되돌리면 정산도 같이 되돌아가는가
//
//  실행 (Node 22 이상 — billing.ts 를 그대로 읽습니다)
//    export SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=...
//    export TEST_OFFICE_PW=...
//    node --experimental-strip-types supabase/test/07_settlement.mjs
//
//  검증 중에 바꾼 단가·결제조건은 끝나기 전에 원래대로 되돌립니다.
// ─────────────────────────────────────────────────────────────────────────────

import { settlementFor, invoiceFor, DEFAULT_PRICES } from '../../src/lib/billing.ts'

const URL = process.env.SUPABASE_URL
const ANON = process.env.SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !ANON || !SERVICE) {
  console.error('환경변수(SUPABASE_URL / ANON / SERVICE)가 필요합니다.')
  process.exit(1)
}

const DOMAIN = process.env.TEST_EMAIL_DOMAIN || 'beonemirae.test'
const MARK = '[검증]'

let pass = 0
let fail = 0
const ok = (t, extra = '') => { pass++; console.log(`  PASS  ${t}${extra ? '  ' + extra : ''}`) }
const no = (t, extra = '') => { fail++; console.log(`  FAIL  ${t}${extra ? '  ' + extra : ''}`) }
const check = (cond, t, extra = '') => (cond ? ok(t, extra) : no(t, extra))
const section = (t) => console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 60 - t.length))}`)

const rest = async (token, path, init = {}, key = ANON) => {
  const r = await fetch(`${URL}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: init.prefer ?? 'return=representation',
      ...(init.headers || {}),
    },
  })
  const text = await r.text()
  let body = null
  try { body = text ? JSON.parse(text) : null } catch { body = text }
  return { status: r.status, body }
}
const truth = (path, init) => rest(SERVICE, path, init, SERVICE)

async function login(email, pw) {
  const r = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: pw }),
  })
  const b = await r.json()
  if (!b.access_token) throw new Error(`로그인 실패 ${email}: ${JSON.stringify(b)}`)
  return b.access_token
}

async function rpc(token, name, args) {
  const r = await fetch(`${URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  const text = await r.text()
  let body = null
  try { body = text ? JSON.parse(text) : null } catch { body = text }
  return { status: r.status, body }
}

// repo.ts 의 매핑과 같은 모양으로 옮깁니다 (화면이 보는 것과 같은 데이터).
const toClient = (r) => ({
  id: r.id, name: r.name, type: r.type, manager: r.manager ?? '',
  pricing: r.pricing ?? undefined,
  paymentDueDay: r.payment_due_day ?? undefined,
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

const won = (n) => n.toLocaleString('ko-KR') + '원'

async function main() {
  console.log('\n════ 유상/무상 공급 구분 · 월 정산 연결 실검증 ════')

  const office = await login(`office@${DOMAIN}`, process.env.TEST_OFFICE_PW)

  // ── 대상 거래처 ────────────────────────────────────────────────────────────
  const cs = await truth(`/clients?select=*&name=like.${encodeURIComponent(MARK + '*')}&order=name`)
  if (!Array.isArray(cs.body) || !cs.body.length) {
    console.error('검증용 거래처가 없습니다. `node supabase/test/05_live.mjs --setup` 을 먼저 실행하세요.')
    process.exit(1)
  }
  const clientId = cs.body[0].id
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
  const month = today.slice(0, 7)
  console.log(`거래처 ${cs.body[0].name} · ${month}`)

  // ── 0. 이번 달 기존 데이터 (증분으로 비교하기 위해 먼저 읽습니다) ─────────
  const before = await loadData(clientId, month)
  const s0 = settlementFor(before, clientId, month)

  // ── 1. 재고 충분한지 확인하고 부족하면 보충 ───────────────────────────────
  section('1. 준비 — 사무실 재고')
  const st = await truth('/office_stock?select=*&id=eq.1')
  const stock = st.body[0]
  const NEED = { corrugated_box: 50, plastic_container: 50, bag: 50, needle_box: 20 }
  const short = Object.entries(NEED).filter(([k, v]) => (stock[k] ?? 0) < v)
  if (short.length) {
    await truth('/office_stock?id=eq.1', {
      method: 'PATCH',
      body: JSON.stringify(Object.fromEntries(short.map(([k]) => [k, NEED[k] + 100]))),
    })
    console.log(`  재고 보충: ${short.map(([k]) => k).join(', ')}`)
  }
  const st2 = await truth('/office_stock?select=*&id=eq.1')
  const stockBefore = st2.body[0]
  check(stockBefore.plastic_container >= 50 && stockBefore.corrugated_box >= 50,
    '검증에 필요한 재고 확보',
    `골판지 ${stockBefore.corrugated_box} · 합성수지 ${stockBefore.plastic_container}`)

  // ── 2. 실제 수거 완료 (유상 + 무상 동시 공급) ─────────────────────────────
  section('2. 수거 완료 — 유상·무상 물품을 함께 공급')

  const veh = await truth(`/vehicles?select=id,waste_type&name=like.${encodeURIComponent(MARK + '*')}`)
  if (!veh.body?.length) { console.error('검증용 차량이 없습니다. 05_live.mjs --setup 을 먼저 실행하세요.'); process.exit(1) }
  const vehicle = veh.body[0]

  // 유상: 20L 합성수지 3개 (판매 7,000 / 매입 3,399)
  // 무상: 63L 박스 4개 (판매 없음 / 매입 1,045), 12L 박스 6개 (판매 없음 / 매입 341)
  const KG = 40
  const SUPPLIED_ITEMS = { plastic20: 3, box63: 4, box12: 6 }
  const supplied = { corrugatedBox: 10, plasticContainer: 3, bag: 0, needleBox: 0 }

  const res = await rpc(office, 'complete_collection', {
    p: {
      scheduleId: '',
      clientId,
      wasteType: vehicle.waste_type,
      vehicleId: vehicle.id,
      driverName: '검증기사',
      actualAmount: KG,
      actualTime: '10:30',
      containers: { box: 1, vinyl: 0, needleBox: 0 },
      handoverStatus: '인계 완료',
      supplied,
      suppliedItems: SUPPLIED_ITEMS,
      isAdditional: true,   // 오늘 이미 정규 수거가 있으므로 재방문(추가 수거)으로 저장
      memo: `${MARK}정산연결검증`,
      screen: 'collection-input',
      inputDurationMs: 42000,
      demoSessionId: null,
    },
  })
  check(res.status === 200 && res.body?.eventId, '수거 완료 트랜잭션 성공', `(${res.status})`)
  if (res.status !== 200) { console.log(JSON.stringify(res.body)); process.exit(1) }
  const eventId = res.body.eventId

  // ── 3. 규격별 공급이 DB 에 그대로 남았는지 ────────────────────────────────
  section('3. 규격이 DB 에 남았는가 — 재입력 없이 정산이 되려면 필수')
  const mats = await truth(`/materials?select=*&client_id=eq.${clientId}&order=created_at.desc&limit=1`)
  const m = mats.body[0]
  check(!!m?.items, 'materials.items 에 규격별 수량 저장')
  check(m?.items?.plastic20 === 3 && m?.items?.box63 === 4 && m?.items?.box12 === 6,
    '규격별 수량이 입력한 그대로', JSON.stringify(m?.items))
  check(m?.box_count === 10 && m?.needle_box_count === 3 && m?.is_additional_request === true,
    '기존 3칸 합계 · 추가 수거 표시 유지', `박스 ${m?.box_count} · 용기 ${m?.needle_box_count} · 추가 ${m?.is_additional_request}`)

  // 재고 차감
  const st3 = await truth('/office_stock?select=*&id=eq.1')
  const sa = st3.body[0]
  check(sa.corrugated_box === stockBefore.corrugated_box - 10 &&
        sa.plastic_container === stockBefore.plastic_container - 3,
    '무상·유상 구분 없이 재고는 실제 나간 만큼 차감',
    `골판지 ${stockBefore.corrugated_box}→${sa.corrugated_box} · 합성수지 ${stockBefore.plastic_container}→${sa.plastic_container}`)

  const led = await truth(`/material_transactions?select=item,qty,kind&event_id=eq.${eventId}`)
  const ledger = Object.fromEntries((led.body || []).map((r) => [r.item, r.qty]))
  check(ledger.corrugatedBox === -10 && ledger.plasticContainer === -3,
    '자재 원장에 공급 기록', JSON.stringify(ledger))

  // ── 4. 월 정산 — 재입력 없이 계산되는가 ──────────────────────────────────
  section('4. 월 정산 — 같은 데이터로 매출·원가·영업이익까지')
  const after = await loadData(clientId, month)
  const s1 = settlementFor(after, clientId, month)

  const P = (k) => DEFAULT_PRICES[k]
  const wasteKey = vehicle.waste_type === '의료폐기물' ? 'medical' : 'diaper'

  const dWasteRev = s1.wasteRevenue - s0.wasteRevenue
  const dSupRev = s1.supplyRevenue - s0.supplyRevenue
  const dDisposal = s1.disposalCost - s0.disposalCost
  const dMaterial = s1.materialCost - s0.materialCost

  check(dWasteRev === KG * P(wasteKey).sale,
    `수거량 → 수거매출 (${KG}kg × ${P(wasteKey).sale})`,
    `${won(dWasteRev)} (기대 ${won(KG * P(wasteKey).sale)})`)

  check(dSupRev === 3 * P('plastic20').sale,
    '유상 물품만 매출에 반영 (20L 합성수지 3개)',
    `${won(dSupRev)} (기대 ${won(3 * P('plastic20').sale)})`)

  const freeCost = 4 * P('box63').cost + 6 * P('box12').cost
  const paidCost = 3 * P('plastic20').cost
  check(dMaterial === freeCost + paidCost,
    '무상 물품은 매출 0 · 원가에는 그대로',
    `자재원가 ${won(dMaterial)} = 무상 ${won(freeCost)} + 유상 ${won(paidCost)}`)

  check(dDisposal === KG * P(wasteKey).cost,
    `처리비 → 비용 (${KG}kg × ${P(wasteKey).cost})`, won(dDisposal))

  const box63Line = s1.supplyLines.find((l) => l.key === 'box63')
  const p20Line = s1.supplyLines.find((l) => l.key === 'plastic20')
  check(box63Line && box63Line.billable === false && box63Line.revenue === 0 && box63Line.cost > 0,
    '63L 박스: 매출 0 · 원가만 (무상)',
    box63Line ? `${box63Line.qty}개 · 매출 ${won(box63Line.revenue)} · 원가 ${won(box63Line.cost)}` : '없음')
  check(p20Line && p20Line.billable === true && p20Line.revenue > 0 && p20Line.cost > 0,
    '20L 합성수지: 매출·원가 양쪽 (유상)',
    p20Line ? `${p20Line.qty}개 · 매출 ${won(p20Line.revenue)} · 원가 ${won(p20Line.cost)}` : '없음')

  const expProfit = s1.revenue - s1.cost
  check(s1.profit === expProfit && s1.revenue === s1.wasteRevenue + s1.supplyRevenue &&
        s1.cost === s1.disposalCost + s1.materialCost,
    '예상 영업이익 = 매출 − 원가 (합이 맞는가)',
    `매출 ${won(s1.revenue)} − 원가 ${won(s1.cost)} = ${won(s1.profit)} (${s1.margin != null ? (s1.margin * 100).toFixed(1) + '%' : '—'})`)

  check(s1.hasLegacySupply === false || before.materials.some((x) => !x.items),
    '이번에 넣은 공급은 「규격 미상」이 아님',
    `규격미상 포함 여부 ${s1.hasLegacySupply}`)

  // ── 5. 거래명세서 ────────────────────────────────────────────────────────
  section('5. 거래명세서 — 무상은 명세서에 올리지 않는다')
  const inv = invoiceFor(after, clientId, month)
  const invBefore = invoiceFor(before, clientId, month)

  const hasFreeLine = [...inv.medicalLines, ...inv.diaperLines].some((l) =>
    l.itemKey === 'box63' || l.itemKey === 'box12' || l.itemKey === 'diaperBag40')
  check(!hasFreeLine, '무상 물품은 명세서 청구 줄에 없음')

  const free63 = inv.freeSupplies.find((f) => f.label.includes('63L'))
  check(!!free63, '무상 공급은 참고 표기로 남음',
    inv.freeSupplies.map((f) => `${f.label} ${f.qty}${f.unit}`).join(' · ') || '없음')

  const paidLine = inv.medicalLines.find((l) => l.itemKey === 'plastic20')
  check(!!paidLine && paidLine.amount === paidLine.qty * paidLine.price,
    '유상 물품은 공급일자로 명세서에 청구',
    paidLine ? `${paidLine.date} ${paidLine.label} ${paidLine.qty}개 × ${won(paidLine.price)} = ${won(paidLine.amount)}` : '없음')

  check(inv.total - invBefore.total === dWasteRev + dSupRev,
    '명세서 합계와 정산 매출이 서로 맞음',
    `명세서 +${won(inv.total - invBefore.total)} · 정산 +${won(dWasteRev + dSupRev)}`)

  check(inv.total === inv.medicalSubtotal + inv.diaperSubtotal,
    '명세서 소계 합이 총액과 일치', won(inv.total))

  // ── 6. 거래처 단가를 바꾸면 정산이 따라오는가 ─────────────────────────────
  section('6. 거래처 단가 적용 — 기본값이 아니라 그 거래처 단가로')
  const custom = { [wasteKey]: { sale: 1200, cost: 400 }, plastic20: { sale: 9000, cost: 3399 } }
  await truth(`/clients?id=eq.${clientId}`, { method: 'PATCH', body: JSON.stringify({ pricing: custom }) })
  const withPricing = await loadData(clientId, month)
  const s2 = settlementFor(withPricing, clientId, month)
  const kgTotal = s2.wasteLines.reduce((a, l) => a + (l.key === wasteKey ? l.qty : 0), 0)
  check(s2.wasteRevenue === kgTotal * 1200,
    '거래처 단가가 수거매출에 반영', `${kgTotal}kg × 1,200 = ${won(s2.wasteRevenue)}`)
  const p20b = s2.supplyLines.find((l) => l.key === 'plastic20')
  check(p20b && p20b.salePrice === 9000, '거래처 단가가 물품 매출에 반영',
    p20b ? `${p20b.qty}개 × ${won(9000)} = ${won(p20b.revenue)}` : '없음')

  // 원래대로 되돌립니다 (검증이 데이터를 바꿔 두고 끝나지 않게)
  await truth(`/clients?id=eq.${clientId}`, {
    method: 'PATCH',
    body: JSON.stringify({ pricing: cs.body[0].pricing ?? null }),
  })
  const restored = await truth(`/clients?select=pricing&id=eq.${clientId}`)
  check(JSON.stringify(restored.body[0].pricing ?? null) === JSON.stringify(cs.body[0].pricing ?? null),
    '검증에서 바꾼 단가 원복')

  // ── 7. 결제기한 ──────────────────────────────────────────────────────────
  section('7. 결제조건 — 매달 손으로 적지 않는가')
  await truth(`/clients?id=eq.${clientId}`, {
    method: 'PATCH', body: JSON.stringify({ payment_due_day: 20, payment_terms: '익월 20일 계좌이체' }),
  })
  const withTerms = await loadData(clientId, month)
  const inv2 = invoiceFor(withTerms, clientId, month)
  const [y, mm] = month.split('-').map(Number)
  const nextY = mm === 12 ? y + 1 : y
  const nextM = mm === 12 ? 1 : mm + 1
  const expDue = `${nextY}-${String(nextM).padStart(2, '0')}-20`
  check(inv2.dueDate === expDue, '결제기한 자동 계산 (익월 20일)', `${inv2.dueDate} (기대 ${expDue})`)
  check(inv2.paymentTerms === '익월 20일 계좌이체', '결제조건이 명세서에 따라옴', inv2.paymentTerms)
  await truth(`/clients?id=eq.${clientId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      payment_due_day: cs.body[0].payment_due_day ?? null,
      payment_terms: cs.body[0].payment_terms ?? '',
    }),
  })

  // ── 8. 되돌리기 ─────────────────────────────────────────────────────────
  section('8. 되돌리기 — 잘못 넣었을 때 정산도 같이 되돌아가는가')
  const rev = await rpc(office, 'revert_collection', { p_event_id: eventId })
  check(rev.status === 200, '수거 완료 되돌리기', `(${rev.status})`)
  const afterRevert = await loadData(clientId, month)
  const s3 = settlementFor(afterRevert, clientId, month)
  check(s3.revenue === s0.revenue && s3.cost === s0.cost,
    '되돌리면 정산도 원래 값으로',
    `매출 ${won(s3.revenue)} (원래 ${won(s0.revenue)}) · 원가 ${won(s3.cost)} (원래 ${won(s0.cost)})`)
  const st4 = await truth('/office_stock?select=*&id=eq.1')
  check(st4.body[0].corrugated_box === stockBefore.corrugated_box &&
        st4.body[0].plastic_container === stockBefore.plastic_container,
    '재고도 원래대로 복구',
    `골판지 ${st4.body[0].corrugated_box} · 합성수지 ${st4.body[0].plastic_container}`)

  console.log(`\n════ ${pass} PASS / ${fail} FAIL ════`)
  console.log(`유상/무상 공급 구분: ${fail === 0 ? 'YES' : 'NO'}`)
  console.log(`월 정산 연결(재입력 없음): ${fail === 0 ? 'YES' : 'NO'}`)
  process.exit(fail === 0 ? 0 : 1)
}

/** 그 달의 마지막 날 — 11월에 -31 을 쓰면 PostgREST 가 오류를 냅니다 */
const lastDay = (month) => {
  const [y, m] = month.split('-').map(Number)
  return `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`
}
async function loadData(clientId, month) {
  const [c, s, m] = await Promise.all([
    truth(`/clients?select=*&id=eq.${clientId}`),
    truth(`/schedules?select=*&client_id=eq.${clientId}&date=gte.${month}-01&date=lte.${lastDay(month)}`),
    truth(`/materials?select=*&client_id=eq.${clientId}&date=gte.${month}-01&date=lte.${lastDay(month)}`),
  ])
  return {
    clients: (c.body || []).map(toClient),
    schedules: (s.body || []).map(toSchedule),
    materials: (m.body || []).map(toMaterial),
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
