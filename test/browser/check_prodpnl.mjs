import { execFileSync } from 'node:child_process'

//  소모품이 **경영 숫자**에 정확히 반영되는가 (0057 다음 판).
//
//   0057 로 소모품 매출은 거래처 정산에 들어갔습니다. 그런데 전사 합계는
//   원가를 「처리비 + 자재비」로만 더하고 있었습니다. 판 값은 이익에
//   들어오고 산 값은 안 빠지니 **기여이익과 이익률이 부풀려졌고**, 그 위에서
//   운영비를 빼는 영업이익까지 같이 틀렸습니다.
//
//   여기서 지키는 것
//    · 전사 합계는 거래처 정산의 **그냥 합**이어야 한다 (불변식)
//    · 소모품 원가가 실제로 이익에서 빠진다
//    · 매입가가 없어 원가 0 으로 잡힌 품목이 **이름으로** 드러난다
//      (무상으로 준 물건까지 재촉하지는 않는다)
//    · 소모품만 전달한 달도 정산·청구가 열린다

const D = '/home/user/beonemirae-ops-mvp/src/lib'
const O = (process.env.TEST_OUT ?? '/tmp')
const bundle = (name) => {
  execFileSync('/home/user/beonemirae-ops-mvp/node_modules/.bin/esbuild',
    [`${D}/${name}.ts`, '--bundle', '--format=esm', '--platform=neutral', `--outfile=${O}/.${name}.mjs`],
    { stdio: 'pipe' })
  return import(`${O}/.${name}.mjs?v=${process.pid}`)
}
const B = await bundle('billing')
const P = await bundle('pnl')
const M = await bundle('monthClose')

const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  if (!c) process.exitCode = 1
}

const MONTH = '2026-07'

const client = (id, name) => ({
  id, name, type: '병원', address: '', manager: '', phone: '',
  collectionCycle: '주 1회', collectsMedicalWaste: true, collectsDiaper: false,
  storageSize: '보통', note: '', active: true,
  pricing: { medical: { sale: 1000, cost: 600 } },
  paymentDueDay: 20, paymentTerms: '', vatMode: '포함', bizNo: '',
  contractStart: null, contractEnd: null,
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
})

const sched = (id, cid, day, kg) => ({
  id, date: `${MONTH}-${day}`, clientId: cid, wasteType: '의료폐기물', vehicleId: 'v1',
  scheduledTime: '09:00', status: '완료', expectedAmount: kg, actualAmount: kg,
  actualTime: '10:00', driverName: '김준기', completedAt: `${MONTH}-${day}T10:00:00Z`,
  memo: '', origin: 'field', createdAt: '', updatedAt: '',
})

const order = (id, cid, day, items) => ({
  id, clientId: cid, status: '전달완료', requesterName: '홍길동', source: 'portal', note: '',
  deliverScheduleId: null, deliverOn: null, requestedAt: `${MONTH}-01T00:00:00Z`,
  confirmedAt: null, deliveredAt: `${MONTH}-${day}T09:00:00Z`, canceledAt: null, cancelReason: '',
  items: items.map((it, i) => ({
    id: i + 1, orderId: id, productId: `p${i}`, name: it.name, spec: it.spec ?? '',
    unit: it.unit ?? '개', qty: it.qty, unitPrice: it.price, unitCost: it.cost ?? 0,
    stockKey: null,
  })),
})

const empty = {
  vehicles: [], materials: [], payments: [], officeStock: {}, notes: [],
  requests: [], events: [], productOrders: [], operatingCosts: [],
}

// ── 1. 전사 합계의 불변식 — 정산을 그냥 더한 값이어야 한다 ──────────────────
//
//   ⚠ 이 검사가 이번 판의 핵심입니다. 원가 항목을 하나씩 골라 더하는 구조가
//   실제로 소모품 원가를 빠뜨렸습니다. 「합계 = 줄의 합」을 못 박아 두면
//   다음에 새 원가가 생겨도 같은 사고가 안 납니다.
{
  const data = {
    ...empty,
    clients: [client('c1', '가나요양병원'), client('c2', '다라의원')],
    schedules: [sched('s1', 'c1', '10', 100), sched('s2', 'c2', '11', 50)],
    productOrders: [
      order('o1', 'c1', '12', [{ name: '멸균장갑', qty: 10, price: 3000, cost: 1800 }]),
      order('o2', 'c2', '13', [{ name: '손소독제', qty: 4, price: 9000, cost: 5500 }]),
    ],
  }
  const r = B.rollupFor(data, MONTH)
  const sum = (f) => r.rows.reduce((a, x) => a + f(x), 0)

  ok(r.rows.length === 2, '두 거래처가 합계에 들어감', `${r.rows.length}곳`)
  ok(r.revenue === sum((x) => x.revenue), '매출 = 거래처 매출의 합', `${r.revenue}원`)
  ok(r.cost === sum((x) => x.cost), '**원가 = 거래처 원가의 합**', `${r.cost}원`)
  ok(r.profit === sum((x) => x.profit), '**기여이익 = 거래처 이익의 합**', `${r.profit}원`)

  //  실제 값으로도 확인합니다 — 합만 맞고 값이 틀릴 수 있습니다.
  //   매출  100×1000 + 50×1000 + 10×3000 + 4×9000 = 216,000
  //   원가  100×600 + 50×600  + 10×1800 + 4×5500  =  40,000
  ok(r.revenue === 216000, '전사 매출 1원까지', `${r.revenue}원`)
  ok(r.productRevenue === 66000, '소모품 매출이 따로도 잡힘', `${r.productRevenue}원`)
  ok(r.productCost === 40000, '소모품 원가가 따로도 잡힘', `${r.productCost}원`)
  ok(r.cost === 90000 + 40000, '전사 원가 = 처리비 + 소모품 원가', `${r.cost}원`)
  ok(r.profit === 216000 - 130000, '전사 기여이익 1원까지', `${r.profit}원`)

  //  ⚠ 되돌리기 확인 — 소모품 원가를 빼면 이익이 부풀려집니다.
  const inflated = r.revenue - (r.disposalCost + r.materialCost)
  ok(inflated > r.profit && inflated - r.profit === 40000,
    '**소모품 원가를 빼먹으면 이익이 40,000원 부풀려짐**', `${inflated} vs ${r.profit}`)
  ok(Math.round(r.margin * 1000) / 1000 === Math.round(((216000 - 130000) / 216000) * 1000) / 1000,
    '이익률도 원가가 빠진 값으로 나옴', `${r.margin}`)
}

// ── 2. 영업이익까지 같은 값을 씁니다 ────────────────────────────────────────
//
//   기여이익이 부풀려지면 거기서 운영비를 뺀 영업이익도 같이 부풀려집니다.
{
  const data = {
    ...empty,
    clients: [client('c1', '가나요양병원')],
    schedules: [sched('s1', 'c1', '10', 100)],
    productOrders: [order('o1', 'c1', '12', [{ name: '멸균장갑', qty: 10, price: 3000, cost: 1800 }])],
    operatingCosts: [
      { id: 'oc1', month: MONTH, category: '인건비', amount: 50000, memo: '', updatedAt: '', updatedBy: '' },
    ],
  }
  const pnl = P.monthlyPnl(data, MONTH)
  //  매출 130,000 − 원가 (60,000 + 18,000) = 52,000
  ok(pnl.rollup.profit === 52000, '기여이익에 소모품 원가가 빠져 있음', `${pnl.rollup.profit}원`)
  ok(pnl.operatingCost === 50000, '운영비는 넣은 값 그대로', `${pnl.operatingCost}원`)
  ok(pnl.operatingProfit === 2000, '**영업이익 = 기여이익 − 운영비**', `${pnl.operatingProfit}원`)
  ok(pnl.operatingProfit === pnl.rollup.profit - pnl.operatingCost,
    '영업이익이 고쳐진 기여이익 위에서 계산됨')
}

// ── 3. 운영비를 안 넣은 달은 영업이익을 만들지 않습니다 (기존 규칙 유지) ────
{
  const data = {
    ...empty,
    clients: [client('c1', '가나요양병원')],
    schedules: [sched('s1', 'c1', '10', 100)],
    productOrders: [order('o1', 'c1', '12', [{ name: '장갑', qty: 1, price: 1000, cost: 400 }])],
  }
  const pnl = P.monthlyPnl(data, MONTH)
  ok(pnl.operatingCost === null, '운영비 미입력이면 null', `${pnl.operatingCost}`)
  ok(pnl.operatingProfit === null, '**0원으로 두어 이익을 부풀리지 않음**', `${pnl.operatingProfit}`)
}

// ── 4. 매입가가 없어 원가 0 으로 잡힌 품목 ──────────────────────────────────
//
//   단가가 없는 것(productNoPrice)과 방향이 반대인 위험입니다.
//   저쪽은 받을 돈이 없어지고, 이쪽은 **안 쓴 돈이 이익으로 잡힙니다.**
{
  const data = {
    ...empty,
    clients: [client('c1', '가나요양병원')],
    schedules: [sched('s1', 'c1', '10', 100)],
    productOrders: [
      order('o1', 'c1', '12', [
        { name: '멸균장갑', qty: 10, price: 3000, cost: 1800 },   // 정상
        { name: '체온계', qty: 2, price: 12000, cost: 0 },        // 판 값은 있는데 산 값이 없음
        { name: '판촉물', qty: 5, price: 0, cost: 0 },            // 무상 — 재촉하지 않음
      ]),
    ],
  }
  const s = B.settlementFor(data, 'c1', MONTH)
  ok(s.productNoCost.includes('체온계'), '**매입가 없는 품목이 이름으로 드러남**', s.productNoCost.join(','))
  ok(!s.productNoCost.includes('멸균장갑'), '매입가가 있는 품목은 안 뜸')
  ok(!s.productNoCost.includes('판촉물'),
    '**무상으로 준 물건까지 재촉하지 않음** (진짜 위험한 줄이 묻힙니다)', s.productNoCost.join(','))
  ok(s.productNoPrice.includes('판촉물'), '무상 물건은 단가 없음 쪽에 잡힘', s.productNoPrice.join(','))
  //  체온계 24,000원이 원가 0 으로 잡혀 그 줄만 보면 이익률 100% 입니다.
  ok(s.productRevenue === 30000 + 24000, '소모품 매출', `${s.productRevenue}원`)
  ok(s.productCost === 18000, '원가는 잡힌 것만', `${s.productCost}원`)

  //  전사 화면도 같은 목록을 볼 수 있어야 합니다.
  const r = B.rollupFor(data, MONTH)
  ok(r.rows[0].productNoCost.length === 1, '전사 합계의 줄에서도 읽힘', `${r.rows[0].productNoCost}`)
}

// ── 5. 소모품만 전달한 달 ───────────────────────────────────────────────────
//
//   수거는 없고 소모품만 가져다준 달이 실제로 있습니다. 그 달의 정산 화면이
//   「집계할 것이 없다」로 닫히면 **판 물건 값을 받을 방법이 화면에 없습니다.**
{
  const data = {
    ...empty,
    clients: [client('c1', '가나요양병원')],
    schedules: [],
    productOrders: [order('o1', 'c1', '12', [{ name: '멸균장갑', qty: 10, price: 3000, cost: 1800 }])],
  }
  const s = B.settlementFor(data, 'c1', MONTH)
  ok(s.collections === 0 && s.supplies === 0, '수거·공급은 0건', `${s.collections}/${s.supplies}`)
  ok(s.productOrders === 1, '소모품은 1건', `${s.productOrders}건`)
  //  화면이 닫히는 조건과 같은 식입니다 — 여기가 참이면 화면이 열립니다.
  ok(!(s.collections === 0 && s.supplies === 0 && s.productOrders === 0),
    '**소모품만 있어도 정산 화면이 열림**')
  ok(s.revenue === 30000, '그 달 청구 대상 금액', `${s.revenue}원`)

  const st = B.billingStateFor(data, 'c1', MONTH)
  ok(st.canConfirm === true, '**소모품만 있는 달도 청구를 확정할 수 있음**')

  const snap = B.buildBillingSnapshot(data, 'c1', MONTH, `${MONTH}-31T00:00:00Z`)
  ok(snap != null && snap.amount === 30000, '확정 금액이 소모품 값과 같음', `${snap?.amount}`)
  ok(snap != null && snap.snapshot.orderIds.length === 1, '주문 id 가 근거로 담김',
    `${snap?.snapshot.orderIds}`)
  //  명세서 합계와 청구액이 1원까지 같아야 합니다.
  ok(snap != null && snap.snapshot.invoice.total === snap.amount,
    '**명세서 합계 = 청구액 (1원까지)**', `${snap?.snapshot.invoice.total} vs ${snap?.amount}`)
}

// ── 6. 월말 청구 화면이 이유를 바르게 적는가 ────────────────────────────────
//
//   전달은 했는데 단가가 없어 0원인 거래처가 「완료된 수거·공급이 없습니다」로
//   뜨면, 물건이 나갔는데 아무 일도 없었던 것처럼 읽혀 그냥 넘어가게 됩니다.
{
  const data = {
    ...empty,
    clients: [client('c1', '가나요양병원')],
    schedules: [],
    productOrders: [order('o1', 'c1', '12', [{ name: '체온계', qty: 2, price: 0, cost: 0 }])],
  }
  const mc = M.monthClose(data, MONTH)
  const row = [...mc.ready, ...mc.skipped, ...mc.needsCheck].find((r) => r.clientId === 'c1')
  ok(row != null, '그 거래처가 월말 청구 목록에 있음')
  ok(row.canConfirm === false, '단가가 0원이라 확정 대상은 아님')
  ok(/소모품/.test(row.reason), '**이유에 소모품이 나옴**', row.reason)
  ok(!/완료된 수거·공급이 없습니다/.test(row.reason),
    '**「아무 일도 없었다」로 적지 않음**', row.reason)
  ok(row.productNoPrice.includes('체온계'), '단가 없는 품목 이름이 실림', row.productNoPrice.join(','))
  ok(row.products === 1, '전달 건수도 실림', `${row.products}건`)
}

// ── 7. 아무것도 없는 달은 지금까지처럼 「없음」 ─────────────────────────────
{
  const data = { ...empty, clients: [client('c1', '가나요양병원')], schedules: [] }
  const mc = M.monthClose(data, MONTH)
  const row = [...mc.ready, ...mc.skipped, ...mc.needsCheck].find((r) => r.clientId === 'c1')
  //  아무 일도 없던 거래처는 설계상 목록에서 빠집니다(화면이 의미 없이
  //  길어지지 않게). 소모품 때문에 이 규칙이 흔들리면 안 됩니다.
  ok(row == null, '아무 일도 없던 달은 목록에 안 올라옴 (기존 규칙 유지)', `${row?.reason ?? '없음'}`)
  const r = B.rollupFor(data, MONTH)
  ok(r.rows.length === 0 && r.profit === 0 && r.margin === null,
    '집계할 것이 없으면 이익률은 null', `${r.margin}`)
  ok(r.productCost === 0 && r.productRevenue === 0, '소모품 칸도 0', `${r.productCost}/${r.productRevenue}`)
}

// ── 8. 이미 청구한 소모품은 합계에서 두 번 안 세는가 ────────────────────────
//
//   전사 합계는 「그 달 실적」이므로 확정 여부와 무관하게 한 번만 세야 합니다.
{
  const data = {
    ...empty,
    clients: [client('c1', '가나요양병원')],
    schedules: [],
    productOrders: [order('o1', 'c1', '12', [{ name: '멸균장갑', qty: 10, price: 3000, cost: 1800 }])],
  }
  const before = B.rollupFor(data, MONTH)
  const snap = B.buildBillingSnapshot(data, 'c1', MONTH, `${MONTH}-31T00:00:00Z`)
  const billed = {
    ...data,
    payments: [{
      id: 'pay1', clientId: 'c1', billingMonth: MONTH, amount: snap.amount, status: '미수금',
      method: '무통장', paidAt: null, memo: '', snapshot: snap.snapshot,
      createdAt: '', updatedAt: '',
    }],
  }
  const after = B.rollupFor(billed, MONTH)
  ok(before.productRevenue === 30000, '확정 전 소모품 매출', `${before.productRevenue}원`)
  ok(after.productRevenue === 30000,
    '**확정한 뒤에도 그 달 실적은 그대로** (두 번도, 0원도 아님)', `${after.productRevenue}원`)
  ok(after.profit === before.profit, '이익도 그대로', `${after.profit}원`)

  //  반대로 「아직 청구 안 한 것」은 0건이어야 합니다 — 여기가 안 줄면
  //  같은 물건이 다음 달에도 계속 청구 대기로 뜹니다.
  const st = B.billingStateFor(billed, 'c1', MONTH)
  ok(st.pending.productOrders === 0, '남은 소모품 주문은 0건', `${st.pending.productOrders}건`)
  ok(st.canConfirm === false, '**같은 주문을 다시 확정하지 못함**')
}

console.log(`\n총 ${process.exitCode ? '실패 있음' : '실패 0건'}`)
