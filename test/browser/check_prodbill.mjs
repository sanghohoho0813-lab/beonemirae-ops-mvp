import { execFileSync } from 'node:child_process'

//  전달완료한 소모품이 그 달 청구에 실리는가 (0057).
//
//   여기가 틀리면 **물건은 나갔는데 받을 돈이 장부에 없습니다.** 반대로
//   너무 많이 잡으면 병원에 안 판 물건 값이 청구됩니다. 둘 다 실제 돈이라
//   1원 단위로 확인합니다.
//
//   확인하는 것
//    · 전달완료만 매출 — 요청·확인·준비·전달예정·취소는 아님
//    · 어느 달인지는 **전달한 날** 기준
//    · 단가는 **주문 시점에 굳어 둔 값** (오늘 상품가가 바뀌어도 안 흔들림)
//    · 명세서 합계 = 청구 금액 (1원까지)
//    · 단가가 비어 있으면 청구에 안 실리고, 그 사실이 목록으로 나옴
//    · 확정한 뒤에는 같은 주문이 다시 안 잡힘

const SRC = '/home/user/beonemirae-ops-mvp/src/lib/billing.ts'
const OUT = `${process.env.TEST_OUT ?? '/tmp'}/.billing.mjs`
execFileSync('/home/user/beonemirae-ops-mvp/node_modules/.bin/esbuild',
  [SRC, '--bundle', '--format=esm', '--platform=neutral', `--outfile=${OUT}`], { stdio: 'pipe' })
const B = await import(`${OUT}?v=${process.pid}`)

const out = []
const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  out.push(c)
  if (!c) process.exitCode = 1
}

const C1 = 'c1'
const MONTH = '2026-07'

const client = {
  id: C1, name: '가나요양병원', type: '병원', address: '', manager: '', phone: '',
  collectionCycle: '주 1회', collectsMedicalWaste: true, collectsDiaper: false,
  storageSize: '보통', note: '', active: true,
  //  수거 단가만 있는 곳입니다 — 소모품 단가는 상품표에 있습니다.
  pricing: { medical: { sale: 1000, cost: 600 } },
  paymentDueDay: 20, paymentTerms: '', vatMode: '별도', bizNo: '',
  contractStart: null, contractEnd: null,
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
}

const sched = (id, day, kg) => ({
  id, date: `${MONTH}-${day}`, clientId: C1, wasteType: '의료폐기물', vehicleId: 'v1',
  scheduledTime: '09:00', status: '완료', expectedAmount: kg, actualAmount: kg,
  actualTime: '10:00', driverName: '김준기', completedAt: `${MONTH}-${day}T10:00:00Z`,
  memo: '', origin: 'field', createdAt: '', updatedAt: '',
})

//  주문 — items 의 단가는 **주문 시점 값**입니다.
const order = (id, status, deliveredAt, items) => ({
  id, clientId: C1, status, requesterName: '홍길동', source: 'portal', note: '',
  deliverScheduleId: null, deliverOn: null, requestedAt: `${MONTH}-01T00:00:00Z`,
  confirmedAt: null, deliveredAt, canceledAt: null, cancelReason: '',
  items: items.map((it, i) => ({
    id: i + 1, orderId: id, productId: `p${i}`, name: it.name, spec: it.spec ?? '',
    unit: it.unit ?? '개', qty: it.qty, unitPrice: it.price, unitCost: it.cost ?? 0,
    stockKey: null,
  })),
})

const base = {
  clients: [client], vehicles: [], schedules: [sched('s1', '10', 100)], materials: [],
  payments: [], officeStock: {}, notes: [], requests: [], events: [],
}

// ── 1. 전달완료만 매출 ──────────────────────────────────────────────────────
{
  const data = {
    ...base,
    productOrders: [
      order('o1', '전달완료', `${MONTH}-12T09:00:00Z`, [{ name: '멸균장갑', qty: 10, price: 3000, cost: 1800 }]),
      order('o2', '준비', null, [{ name: '손소독제', qty: 5, price: 9000, cost: 5000 }]),
      order('o3', '전달예정', null, [{ name: '마스크', qty: 20, price: 500, cost: 300 }]),
      order('o4', '취소', null, [{ name: '거즈', qty: 30, price: 700, cost: 400 }]),
    ],
  }
  const s = B.settlementFor(data, C1, MONTH)
  ok(s.productOrders === 1, '**전달완료한 주문만 셈**', `${s.productOrders}건`)
  ok(s.productRevenue === 30000, '소모품 매출 = 10개 × 3,000원', `${s.productRevenue}원`)
  ok(s.productCost === 18000, '원가도 주문 시점 값', `${s.productCost}원`)
  //  수거 100kg × 1,000원 = 100,000원 + 소모품 30,000원
  ok(s.revenue === 130000, '**청구액에 소모품이 더해짐**', `${s.revenue}원`)
  ok(s.cost === 60000 + 18000, '원가도 합쳐짐', `${s.cost}원`)
  ok(s.profit === 130000 - 78000, '이익 = 매출 - 원가', `${s.profit}원`)

  //  ⚠ 준비·전달예정·취소가 하나라도 새면 「허위 매출」입니다.
  ok(!s.productLines.some((l) => /손소독제|마스크|거즈/.test(l.label)),
    '**아직 전달 안 한 물건은 매출이 아님**', s.productLines.map((l) => l.label).join(','))
}

// ── 2. 어느 달인지는 전달한 날 ──────────────────────────────────────────────
//   지난달에 요청받아 이번 달에 실어다 준 물건은 이번 달 매출입니다.
{
  const data = {
    ...base,
    productOrders: [
      { ...order('o1', '전달완료', `${MONTH}-03T09:00:00Z`, [{ name: '장갑', qty: 1, price: 1000 }]),
        requestedAt: '2026-06-20T00:00:00Z' },
      order('o2', '전달완료', '2026-06-30T09:00:00Z', [{ name: '지난달것', qty: 1, price: 5000 }]),
    ],
  }
  const s = B.settlementFor(data, C1, MONTH)
  ok(s.productOrders === 1 && s.productRevenue === 1000,
    '**전달한 날로 달을 가름** (주문한 날이 아님)', `${s.productOrders}건 · ${s.productRevenue}원`)
  const prev = B.settlementFor(data, C1, '2026-06')
  ok(prev.productRevenue === 5000, '지난달 전달분은 지난달 매출', `${prev.productRevenue}원`)
}

// ── 3. 단가는 주문 시점 값 ──────────────────────────────────────────────────
//   상품표의 오늘 단가를 다시 읽으면, 값을 올린 순간 지난달 청구가 바뀝니다.
{
  const data = {
    ...base,
    products: [{ id: 'p0', name: '멸균장갑', spec: '', unit: '개', salePrice: 99999, costPrice: 50000,
                 stockKey: null, available: true, imageUrl: '', description: '', active: true, category: '', sort: 0 }],
    productOrders: [order('o1', '전달완료', `${MONTH}-12T09:00:00Z`, [{ name: '멸균장갑', qty: 2, price: 3000, cost: 1800 }])],
  }
  const s = B.settlementFor(data, C1, MONTH)
  ok(s.productRevenue === 6000, '**주문 시점 단가로 계산** (오늘 상품가 99,999원을 안 씀)', `${s.productRevenue}원`)
}

// ── 4. 명세서 합계 = 청구 금액 (1원까지) ────────────────────────────────────
{
  const data = {
    ...base,
    productOrders: [
      order('o1', '전달완료', `${MONTH}-12T09:00:00Z`, [
        { name: '멸균장갑', spec: 'M', qty: 7, price: 3300, cost: 2000 },
        { name: '손소독제', spec: '500ml', qty: 3, price: 8800, cost: 5500 },
      ]),
      order('o2', '전달완료', `${MONTH}-20T09:00:00Z`, [{ name: '멸균장갑', spec: 'M', qty: 5, price: 3300, cost: 2000 }]),
    ],
  }
  const s = B.settlementFor(data, C1, MONTH)
  const inv = B.invoiceFor(data, C1, MONTH)
  ok(inv.total === s.revenue, '**명세서 합계와 청구 금액이 1원까지 같음**', `${inv.total} vs ${s.revenue}`)
  ok(inv.productSubtotal === 7 * 3300 + 3 * 8800 + 5 * 3300, '소모품 소계', `${inv.productSubtotal}원`)
  ok(inv.productLines.length === 3, '명세서에 소모품 줄이 날짜별로', `${inv.productLines.length}줄`)
  //  수거 줄과 섞이면 병원이 무슨 돈인지 못 알아봅니다.
  ok(!inv.medicalLines.some((l) => /장갑|소독제/.test(l.label)), '소모품이 수거 줄에 섞이지 않음')
  ok(inv.medicalKg === 100, 'kg 합계에 소모품 수량이 안 섞임', `${inv.medicalKg}kg`)
}

// ── 5. 단가가 비어 있으면 — 조용히 사라지면 안 됩니다 ───────────────────────
{
  const data = {
    ...base,
    productOrders: [order('o1', '전달완료', `${MONTH}-12T09:00:00Z`, [
      { name: '단가없는물건', qty: 4, price: 0, cost: 0 },
      { name: '멸균장갑', qty: 1, price: 3000, cost: 1800 },
    ])],
  }
  const s = B.settlementFor(data, C1, MONTH)
  ok(s.productRevenue === 3000, '단가 없는 품목은 0원 — 청구에 안 실림', `${s.productRevenue}원`)
  ok(s.productNoPrice.includes('단가없는물건'),
    '**단가가 없어 못 실은 품목을 이름으로 알려 줌** — 조용히 넘기면 그대로 손해입니다',
    s.productNoPrice.join(','))
  const inv = B.invoiceFor(data, C1, MONTH)
  ok(!inv.productLines.some((l) => l.label === '단가없는물건'), '0원짜리 줄은 명세서에 안 올림')
  ok(inv.total === s.revenue, '그래도 명세서와 청구액은 같음', `${inv.total} vs ${s.revenue}`)
}

// ── 6. 확정한 뒤에는 다시 안 잡힌다 ─────────────────────────────────────────
{
  const data = {
    ...base,
    productOrders: [order('o1', '전달완료', `${MONTH}-12T09:00:00Z`, [{ name: '장갑', qty: 10, price: 3000, cost: 1800 }])],
  }
  const built = B.buildBillingSnapshot(data, C1, MONTH, '2026-07-31T00:00:00Z')
  ok(!!built, '확정할 것이 있음')
  ok(built.snapshot.orderIds.includes('o1'), '**스냅샷이 어떤 주문을 덮었는지 적어 둠**',
    JSON.stringify(built.snapshot.orderIds))
  ok(built.amount === 130000, '확정 금액', `${built.amount}원`)

  //  확정했다고 치고 — 남은 것이 없어야 합니다.
  const after = {
    ...data,
    payments: [{
      id: 'pay1', clientId: C1, billingMonth: MONTH, amount: built.amount, status: '미수금',
      method: '무통장', paidAt: null, memo: '', snapshot: built.snapshot,
    }],
  }
  const st = B.billingStateFor(after, C1, MONTH)
  ok(st.pending.productOrders === 0, '**같은 주문이 다시 안 잡힘** (두 번 청구 방지)',
    `${st.pending.productOrders}건`)
  ok(st.canConfirm === false, '더 확정할 것이 없음')

  //  확정 뒤에 새 주문을 전달하면 그것만 추가 청구가 됩니다.
  const more = {
    ...after,
    productOrders: [
      ...data.productOrders,
      order('o2', '전달완료', `${MONTH}-25T09:00:00Z`, [{ name: '마스크', qty: 2, price: 500, cost: 300 }]),
    ],
  }
  const st2 = B.billingStateFor(more, C1, MONTH)
  ok(st2.canConfirm && st2.pendingAmount === 1000, '**뒤늦게 전달한 것만 추가 청구**', `${st2.pendingAmount}원`)
  ok(st2.nextKind === '추가', '추가 청구로 표시')
}

// ── 7. 소모품만 있는 달도 청구할 수 있다 ────────────────────────────────────
//   수거가 없는 달에 물건만 판 경우입니다. 지금까지는 청구가 아예 안 만들어졌습니다.
{
  const data = {
    ...base,
    schedules: [],
    productOrders: [order('o1', '전달완료', `${MONTH}-12T09:00:00Z`, [{ name: '장갑', qty: 10, price: 3000, cost: 1800 }])],
  }
  const st = B.billingStateFor(data, C1, MONTH)
  ok(st.canConfirm && st.pendingAmount === 30000, '**수거가 없어도 판 물건은 청구할 수 있음**', `${st.pendingAmount}원`)
  const built = B.buildBillingSnapshot(data, C1, MONTH, '2026-07-31T00:00:00Z')
  ok(built && built.snapshot.scheduleIds.length === 0 && built.snapshot.orderIds.length === 1,
    '수거는 0건, 소모품 1건으로 확정')
}

// ── 8. 다른 거래처 것이 섞이지 않는다 ───────────────────────────────────────
{
  const data = {
    ...base,
    productOrders: [
      order('o1', '전달완료', `${MONTH}-12T09:00:00Z`, [{ name: '장갑', qty: 1, price: 3000 }]),
      { ...order('o2', '전달완료', `${MONTH}-13T09:00:00Z`, [{ name: '남의것', qty: 99, price: 90000 }]), clientId: 'other' },
    ],
  }
  const s = B.settlementFor(data, C1, MONTH)
  ok(s.productOrders === 1 && s.productRevenue === 3000, '**다른 병원 주문은 안 섞임**', `${s.productRevenue}원`)
}

// ── 9. 소모품이 없으면 아무것도 안 바뀐다 ───────────────────────────────────
//   기존 거래처는 이 판을 올려도 금액이 1원도 달라지면 안 됩니다.
{
  const s = B.settlementFor(base, C1, MONTH)
  ok(s.revenue === 100000, '소모품이 없으면 예전 금액 그대로', `${s.revenue}원`)
  ok(s.productLines.length === 0 && s.productOrders === 0, '소모품 줄도 없음')
  const inv = B.invoiceFor(base, C1, MONTH)
  ok(inv.total === 100000 && (inv.productLines?.length ?? 0) === 0, '명세서도 그대로', `${inv.total}원`)
  //  productOrders 자체가 없는(옛) 자료여도 터지지 않아야 합니다.
  const legacy = { ...base }
  delete legacy.productOrders
  ok(B.settlementFor(legacy, C1, MONTH).revenue === 100000, '소모품 자료가 아예 없어도 동작')
}

console.log('')
console.log(`총 ${out.length}건 · 실패 ${out.filter((v) => !v).length}건`)
