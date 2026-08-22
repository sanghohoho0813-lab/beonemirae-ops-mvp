import { execFileSync } from 'node:child_process'

//  AX 증거 계산 (lib/axEvidence.ts).
//
//   여기서 틀리면 **없는 성과가 있는 것처럼 보입니다.** 화면은 멀쩡해 보이고,
//   심사 자리에서야 드러납니다. 그래서 화면이 아니라 규칙을 직접 두들깁니다.
//
//   이 검사가 지키려는 네 가지
//    ① 주문요청 ≠ 매출 — 주문만 들어온 건은 매출에 안 들어간다
//    ② 전달 ≠ 입금   — 전달 완료와 입금 완료가 다른 숫자로 남는다
//    ③ 못 세는 것은 0 이 아니라 null 이다
//    ④ 추천은 **그 주문일 시점으로 되돌려** 다시 계산한다
//       (오늘 자료로 과거를 판정하면 그날은 몰랐던 것을 알았던 것처럼 셉니다)

const SRC = '/home/user/beonemirae-ops-mvp/src/lib/axEvidence.ts'
const OUT = `${process.env.TEST_OUT ?? '/tmp'}/.axev.mjs`
execFileSync('/home/user/beonemirae-ops-mvp/node_modules/.bin/esbuild',
  [SRC, '--bundle', '--format=esm', '--platform=neutral', `--outfile=${OUT}`], { stdio: 'pipe' })
const A = await import(`${OUT}?v=${process.pid}`)

const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  if (!c) process.exitCode = 1
}
const get = (ns, k) => ns.find((n) => n.key === k)
const val = (ns, k) => get(ns, k)?.value

const C1 = 'c1'
const C2 = 'c2'
const PERIOD = { from: '2026-05-01', to: '2026-08-31' }

//  ── 자료 ──────────────────────────────────────────────────────────────────
//   병원 두 곳. c1 은 골판지를 규칙적으로 받아 갑니다(→ 추천이 뜹니다).
//   c2 는 한 번밖에 안 받아 갔습니다(→ 추천이 안 뜹니다 — 한 번은 주기가
//   아닙니다). 이 차이가 「추천 → 주문」을 가르는 자리입니다.
const materials = [
  { id: 'm1', clientId: C1, date: '2026-05-05', boxCount: 20, vinylCount: 0, needleBoxCount: 0, isAdditionalRequest: false, memo: '' },
  { id: 'm2', clientId: C1, date: '2026-06-04', boxCount: 20, vinylCount: 0, needleBoxCount: 0, isAdditionalRequest: false, memo: '' },
  { id: 'm3', clientId: C1, date: '2026-07-05', boxCount: 20, vinylCount: 0, needleBoxCount: 0, isAdditionalRequest: false, memo: '' },
  //  ⚠ c2 는 **한 번뿐**입니다.
  { id: 'm4', clientId: C2, date: '2026-06-10', boxCount: 10, vinylCount: 0, needleBoxCount: 0, isAdditionalRequest: true, memo: '' },
]

const item = (n, qty, price, cost, stockKey) => ({
  id: n, orderId: '', productId: `p${n}`, name: '전용박스', spec: '63L', unit: '개',
  qty, unitPrice: price, unitCost: cost, stockKey,
})

const orders = [
  //  ① 전달 + 청구 + 입금까지 끝난 주문 (c1, 골판지 → 그때 추천이 떠 있었습니다)
  { id: 'o1', clientId: C1, status: '전달완료', requesterName: '', source: 'portal', note: '',
    deliverScheduleId: null, deliverOn: '2026-08-03', requestedAt: '2026-08-01T01:00:00Z',
    confirmedAt: null, deliveredAt: '2026-08-03T01:00:00Z', canceledAt: null, cancelReason: '',
    items: [item(1, 10, 9000, 5000, 'corrugated_box')] },
  //  ② 전달·청구까지 됐지만 **입금은 아직** (c1)
  { id: 'o2', clientId: C1, status: '전달완료', requesterName: '', source: 'portal', note: '',
    deliverScheduleId: null, deliverOn: '2026-08-10', requestedAt: '2026-08-08T01:00:00Z',
    confirmedAt: null, deliveredAt: '2026-08-10T01:00:00Z', canceledAt: null, cancelReason: '',
    items: [item(2, 5, 9000, 5000, 'corrugated_box')] },
  //  ③ **주문만** 들어온 건 (c2). 매출이 아닙니다.
  { id: 'o3', clientId: C2, status: '요청', requesterName: '', source: 'portal', note: '',
    deliverScheduleId: null, deliverOn: null, requestedAt: '2026-08-20T01:00:00Z',
    confirmedAt: null, deliveredAt: null, canceledAt: null, cancelReason: '',
    items: [item(3, 100, 9000, 5000, 'corrugated_box')] },
  //  ④ 취소된 주문 — 어디에도 안 들어갑니다
  { id: 'o4', clientId: C2, status: '취소', requesterName: '', source: 'staff', note: '',
    deliverScheduleId: null, deliverOn: null, requestedAt: '2026-08-21T01:00:00Z',
    confirmedAt: null, deliveredAt: null, canceledAt: '2026-08-21T02:00:00Z', cancelReason: '오발주',
    items: [item(4, 999, 9000, 5000, 'corrugated_box')] },
]

const payments = [
  //  o1 을 담은 확정 청구 — 입금 완료
  { id: 'pay1', clientId: C1, billingMonth: '2026-08', amount: 500000, status: '입금완료',
    method: '무통장', paidAt: '2026-08-31T01:00:00Z', memo: '',
    snapshot: { orderIds: ['o1'] }, canceledAt: null },
  //  o2 를 담은 확정 청구 — 아직 미수금
  { id: 'pay2', clientId: C1, billingMonth: '2026-08', amount: 300000, status: '미수금',
    method: '무통장', paidAt: null, memo: '',
    snapshot: { orderIds: ['o2'] }, canceledAt: null },
]

const schedules = [
  { id: 's1', date: '2026-08-03', clientId: C1, wasteType: '의료폐기물', vehicleId: 'v1', scheduledTime: '09:00',
    status: '완료', expectedAmount: 100, actualAmount: 100, completedAt: '', memo: '', driverName: '김준기',
    origin: 'plan', bookedAt: '2026-07-30T00:00:00Z' },
  { id: 's2', date: '2026-08-03', clientId: C2, wasteType: '의료폐기물', vehicleId: 'v1', scheduledTime: '11:00',
    status: '완료', expectedAmount: 80, actualAmount: 80, completedAt: '', memo: '', driverName: '김준기',
    origin: 'plan', bookedAt: '2026-07-30T00:00:00Z' },
  { id: 's3', date: '2026-08-10', clientId: C1, wasteType: '의료폐기물', vehicleId: 'v1', scheduledTime: '09:00',
    status: '완료', expectedAmount: 100, actualAmount: 90, completedAt: '', memo: '', driverName: '백광호',
    origin: 'plan', bookedAt: '2026-08-07T00:00:00Z' },
  //  예정에 없던 수거 (사람이 날짜를 안 잡았는데 현장에서 완료)
  { id: 's4', date: '2026-08-12', clientId: C2, wasteType: '의료폐기물', vehicleId: 'v1', scheduledTime: '14:00',
    status: '완료', expectedAmount: 0, actualAmount: 40, completedAt: '', memo: '', driverName: '',
    origin: 'field', bookedAt: null },
  //  무른 방문 — 완료가 아니므로 어디에도 안 들어갑니다
  { id: 's5', date: '2026-08-17', clientId: C1, wasteType: '의료폐기물', vehicleId: 'v1', scheduledTime: '09:00',
    status: '완료', expectedAmount: 100, actualAmount: null, completedAt: '', memo: '', driverName: '김준기',
    origin: 'plan', bookedAt: null, canceledAt: '2026-08-16T00:00:00Z' },
]

const requests = [
  { id: 'r1', clientId: C1, clientName: '', kind: '긴급수거', content: '', desiredDate: null, urgent: true,
    status: '접수', source: 'portal', requesterName: '', reply: '', handledBy: null, handledAt: null,
    createdAt: '2026-08-02T01:00:00Z' },
  { id: 'r2', clientId: C1, clientName: '', kind: '소모품', content: '', desiredDate: null, urgent: false,
    status: '접수', source: 'portal', requesterName: '', reply: '', handledBy: null, handledAt: null,
    createdAt: '2026-08-09T01:00:00Z' },
  //  전화로 받아 대신 올린 것 — 포털 이용이 아닙니다
  { id: 'r3', clientId: C2, clientName: '', kind: '추가수거', content: '', desiredDate: null, urgent: false,
    status: '접수', source: 'staff', requesterName: '', reply: '', handledBy: null, handledAt: null,
    createdAt: '2026-08-11T01:00:00Z' },
]

const data = {
  clients: [{ id: C1, name: '가나병원' }, { id: C2, name: '다라의원' }],
  vehicles: [{ id: 'v1', name: '80가 1234', wasteType: '의료폐기물', tonnage: 1, nominalCapacity: 1000, expectedCapacity: 800, driver: '김준기' }],
  schedules, materials, payments, requests,
  productOrders: orders, receipts: [], events: [], notes: [], leads: [], requestOverrides: [],
  officeStock: {}, baseline: {}, experiment: {},
}

// ═══ ④ 추천은 그 주문일 시점으로 되돌려 계산한다 ═══════════════════════════
{
  //  8/1 시점 — c1 은 5/5 · 6/4 · 7/5 세 번 받았으니 추천이 뜹니다.
  const n1 = A.needsAsOf(data, C1, '2026-08-01')
  ok(n1.needs.some((n) => n.stockKey === 'corrugated_box'), '① 주문일(8/1) 시점에 골판지 추천이 떠 있었다',
    n1.needs.map((n) => n.stockKey).join(',') || '없음')

  //  ⚠ 여기가 핵심입니다. **5/10 시점에는 아직 한 번밖에 안 받았습니다.**
  //    그때는 추천이 뜨면 안 됩니다 — 뜨면 「그날은 몰랐던 것」을 알았던
  //    것처럼 세는 것이고, 전환율이 통째로 부풀려집니다.
  const n0 = A.needsAsOf(data, C1, '2026-05-10')
  ok(!n0.needs.some((n) => n.stockKey === 'corrugated_box'),
    '② 5/10 시점에는 아직 추천이 없다 (그때는 한 번뿐) — 미래 자료가 새지 않음',
    n0.needs.map((n) => n.stockKey).join(',') || '없음')

  //  c2 는 끝까지 한 번뿐이라 오늘 기준으로도 추천이 없습니다.
  const n2 = A.needsAsOf(data, C2, '2026-08-20')
  ok(n2.needs.length === 0, '③ 한 번만 받아 간 병원은 추천하지 않는다 (한 번은 주기가 아님)', n2.blocked.slice(0, 40))
}

// ═══ ② 매출 AX ═══════════════════════════════════════════════════════════════
const sales = A.salesAx(data, PERIOD)
{
  ok(sales.funnel.ordered === 3, '④ 취소한 주문은 어디에도 안 들어감', `주문 ${sales.funnel.ordered}건`)
  ok(sales.funnel.delivered === 2, '⑤ 전달 완료는 2건', String(sales.funnel.delivered))
  ok(sales.funnel.billed === 2, '⑥ 청구 확정은 2건', String(sales.funnel.billed))
  ok(sales.funnel.paid === 1, '⑦ **입금 완료는 1건** — 전달 ≠ 입금', String(sales.funnel.paid))

  //  ⚠ o3 은 100개 × 9,000원 = 900,000원짜리 주문입니다. 주문만 들어온 것을
  //    매출에 넣으면 여기서 1,035,000원이 나옵니다. 나오면 안 됩니다.
  ok(val(sales.numbers, 'revenue') === 135000,
    '⑧ **주문요청은 매출이 아니다** — 전달 완료분만 (10+5)×9,000 = 135,000원',
    `${val(sales.numbers, 'revenue')}원`)
  ok(val(sales.numbers, 'cost') === 75000, '⑨ 원가도 전달 완료분만 (10+5)×5,000', `${val(sales.numbers, 'cost')}원`)
  ok(val(sales.numbers, 'profit') === 60000, '⑩ 이익 = 135,000 − 75,000', `${val(sales.numbers, 'profit')}원`)
  ok(val(sales.numbers, 'paidRevenue') === 90000,
    '⑪ **입금까지 끝난 금액은 90,000원** — 전달액(135,000)과 다른 숫자로 남음',
    `${val(sales.numbers, 'paidRevenue')}원`)

  ok(val(sales.numbers, 'buyers') === 1, '⑫ 구매 병원 1곳 (c1)', String(val(sales.numbers, 'buyers')))
  ok(val(sales.numbers, 'repeatBuyers') === 1, '⑬ 재구매 병원 1곳 (c1 의 두 번째 주문 o2)',
    String(val(sales.numbers, 'repeatBuyers')))
  ok(val(sales.numbers, 'perClient') === 135000, '⑭ 병원당 추가매출 = 135,000 ÷ 1',
    String(val(sales.numbers, 'perClient')))
  //  수거 청구액 800,000원 대비 135,000원 = 16.9%
  ok(val(sales.numbers, 'shareOfRevenue') === 16.9, '⑮ 수거 청구액 대비 비중 16.9% (두 매출을 더하지 않음)',
    `${val(sales.numbers, 'shareOfRevenue')}%`)

  //  주문 세 건 모두 골판지 한 품목. o1·o2 는 c1(추천 있음), o3 은 c2(추천 없음).
  ok(val(sales.numbers, 'needHit') === 66.7, '⑯ 주문 품목 중 추천에 있던 비율 2/3 = 66.7%',
    `${val(sales.numbers, 'needHit')}%`)

  const conv = get(sales.numbers, 'needConversion')
  ok(conv.value === 100, '⑰ 추천 → 주문 전환율 — 추천이 떴던 c1×골판지가 실제 주문됨', `${conv.value}%`)
  ok(/일 간격/.test(conv.basis) && /쌍/.test(conv.basis), '⑱ 전환율 분모를 어떻게 세었는지 화면에 적힘',
    conv.basis.slice(0, 50))
}

// ═══ ③ 고객 AX ═══════════════════════════════════════════════════════════════
const cust = A.customerAx(data, PERIOD)
{
  ok(val(cust.numbers, 'portalRequests') === 2, '⑲ 포털 요청 2건 (전화 대행 r3 제외)',
    String(val(cust.numbers, 'portalRequests')))
  ok(val(cust.numbers, 'portalShare') === 66.7, '⑳ 전체 요청 중 포털 비율 2/3 = 66.7%',
    `${val(cust.numbers, 'portalShare')}%`)
  ok(val(cust.numbers, 'portalClients') === 2, '㉑ 포털을 쓴 병원 2곳 (c1 요청·주문 · c2 주문)',
    String(val(cust.numbers, 'portalClients')))
  ok(val(cust.numbers, 'repeatPortalClients') === 1, '㉒ 두 번 이상 쓴 병원은 c1 한 곳',
    String(val(cust.numbers, 'repeatPortalClients')))

  //  ⚠ 계정 수는 이 자료로 못 셉니다. 0 이라고 적으면 「계정이 없다」가 됩니다.
  const acc = get(cust.numbers, 'accounts')
  ok(acc.value === null && acc.state === 'not-countable',
    '㉓ **못 세는 것은 0 이 아니라 null** — 활성 계정 수는 셀 수 없다고 그대로 말함', acc.state)
}

// ═══ ④ 확장 AX ═══════════════════════════════════════════════════════════════
const cap = A.capacityAx(data, PERIOD)
{
  ok(val(cap.numbers, 'visits') === 4, '㉔ 완료 방문 4건 — 무른 방문(s5)은 빠짐', String(val(cap.numbers, 'visits')))
  ok(val(cap.numbers, 'activeDays') === 3, '㉕ 실제 나간 날 3일 (8/3 · 8/10 · 8/12)',
    String(val(cap.numbers, 'activeDays')))
  ok(val(cap.numbers, 'avgPerDay') === 1.3, '㉖ 하루 평균 4 ÷ 3 = 1.3곳 — 안 나간 날로 나누지 않음',
    String(val(cap.numbers, 'avgPerDay')))
  ok(val(cap.numbers, 'maxPerDay') === 2, '㉗ 하루 최대 2곳 (8/3)', String(val(cap.numbers, 'maxPerDay')))
  ok(val(cap.numbers, 'urgentVisits') === 1, '㉘ 예정에 없던 수거 1건 (s4)', String(val(cap.numbers, 'urgentVisits')))
  ok(val(cap.numbers, 'additionalSupply') === 1, '㉙ 추가요청 자재공급 1건',
    String(val(cap.numbers, 'additionalSupply')))

  //  ⚠ s4 는 기사 이름이 비어 있습니다. 차량 기본 기사(김준기)로 채우면
  //    대차로 나간 날이 그대로 틀린 사람 실적이 됩니다. 채우지 않습니다.
  ok(val(cap.numbers, 'drivers') === 2, '㉚ 기사는 2명만 셈 — 이름 없는 건을 차량 기본기사로 채우지 않음',
    cap.byDriver.map((d) => `${d.name} ${d.visits}건`).join(' · '))
  const kj = cap.byDriver.find((d) => d.name === '김준기')
  ok(kj?.visits === 2, '㉛ 김준기 2건 (s1 · s2) — 무른 s5 는 안 셈', String(kj?.visits))

  const head = get(cap.numbers, 'headroom')
  ok(/거리·시간은 계산하지 않습니다/.test(head.basis), '㉜ **거리·시간은 계산하지 않는다고 화면에 적힘**')
  ok(/예전에 이만큼은 해냈다/.test(head.basis), '㉝ 「몇 곳 더 받을 수 있다」로 단정하지 않음')
}

// ═══ 표본이 적으면 성과로 확정하지 않는다 ════════════════════════════════════
{
  ok(get(sales.numbers, 'revenue').state === 'measuring',
    '㉞ 전달 2건짜리 매출은 「측정 중(참고값)」 — 회사 성과로 확정하지 않음',
    get(sales.numbers, 'revenue').state)
  const empty = A.salesAx({ ...data, productOrders: [] }, PERIOD)
  ok(get(empty.numbers, 'revenue').state === 'none' && val(empty.numbers, 'revenue') === 0,
    '㉟ 주문이 하나도 없으면 「아직 없음」 · 0원 (null 이 아님 — 해 봤는데 없는 것)',
    get(empty.numbers, 'revenue').state)
  ok(val(empty.numbers, 'perClient') === null,
    '㊱ 구매 병원이 0곳이면 병원당 매출은 **계산하지 않음** (0으로 나누지 않음)')

  const w = A.weakestEvidence(A.axEvidence(data, PERIOD))
  ok(typeof w.area === 'string' && /AX/.test(w.area), '㊲ 「지금 가장 약한 증거」를 한 줄로 말함',
    `${w.area} — ${w.why}`)
}


// ═══ ① 업무 AX — 당일 입력 ═══════════════════════════════════════════════════
//
//   파일럿 하루 한 줄 기록의 「당일 입력률」과 **같은 정의**를 쓰는지 봅니다.
//   정의가 갈라지면 두 숫자를 나란히 놓을 수 없습니다.
{
const WP = { from: '2026-08-01', to: '2026-08-31' }
const sch = (id, date, completedAt, extra = {}) => ({
  id, date, clientId: 'c1', wasteType: '의료폐기물', vehicleId: 'v1', scheduledTime: '09:00',
  status: '완료', expectedAmount: 100, actualAmount: 100, completedAt, memo: '', ...extra,
})
//  한국 시간 기준입니다. 2026-08-03T14:00:00Z 는 KST 로 8/3 23:00 → 당일.
//  2026-08-03T16:00:00Z 는 KST 로 8/4 01:00 → 하루 늦음.
const data = {
  clients: [], vehicles: [], materials: [], payments: [], requests: [], productOrders: [],
  receipts: [], events: [], notes: [], leads: [], requestOverrides: [], officeStock: {},
  baseline: {}, experiment: {},
  schedules: [
    sch('a', '2026-08-03', '2026-08-03T14:00:00Z'),            // KST 8/3 23:00 → 당일
    sch('b', '2026-08-03', '2026-08-03T16:00:00Z'),            // KST 8/4 01:00 → +1
    sch('c', '2026-08-05', '2026-08-05T01:00:00Z'),            // 당일
    sch('d', '2026-08-06', '2026-08-09T01:00:00Z'),            // +3
    sch('e', '2026-08-07', '2026-08-07T02:00:00Z', { canceledAt: '2026-08-06T00:00:00Z' }), // 무른 방문
    sch('f', '2026-08-10', null),                              // 입력 시각 없음
  ],
}
const w = A.workAx(data, WP)
ok(val(w.numbers, 'entered') === 4, '㊳ 입력이 끝난 건 4건 (무른 방문·시각 없는 건 제외)', String(val(w.numbers, 'entered')))
ok(val(w.numbers, 'sameDayRate') === 50, '㊴ 당일 입력률 2/4 = 50% — **한국 시간 기준**', `${val(w.numbers, 'sameDayRate')}%`)
ok(val(w.numbers, 'nextDayRate') === 75, '㊵ 다음 날까지는 3/4 = 75%', `${val(w.numbers, 'nextDayRate')}%`)
ok(val(w.numbers, 'oddLag') === 0, '㊶ 다녀오기 전 입력 0건')
ok(JSON.stringify(w.lagHistogram) === JSON.stringify([{lagDays:0,count:2},{lagDays:1,count:1},{lagDays:3,count:1}]),
   '㊷ 며칠 만에 넣었는지 분포가 나옴', JSON.stringify(w.lagHistogram))

//  ⚠ 있을 수 없는 값을 0 으로 눌러 당일처럼 세면 안 됩니다.
const bad = { ...data, schedules: [sch('x', '2026-08-20', '2026-08-18T01:00:00Z')] }
const wb = A.workAx(bad, WP)
ok(val(wb.numbers, 'oddLag') === 1, '㊸ 다녀오기 전에 입력된 건을 **그대로 셈** (0 으로 누르지 않음)',
   String(val(wb.numbers, 'oddLag')))
ok(val(wb.numbers, 'sameDayRate') === 0, '㊹ 그리고 그것을 당일 입력으로 세지 않음', `${val(wb.numbers, 'sameDayRate')}%`)

const empty = A.workAx({ ...data, schedules: [] }, WP)
ok(val(empty.numbers, 'sameDayRate') === null, '㊺ 입력이 하나도 없으면 비율은 **계산하지 않음** (0% 아님)')

}


// ═══ 도입 전 → 현재 ══════════════════════════════════════════════════════════
//
//   여기서 제일 위험한 것은 **Before 를 지어내는 것**입니다.
//   「도입 전 포털 비율은 당연히 0%」는 추정이지 측정이 아닙니다.
{
  const START = '2026-08-01'
  const TODAY2 = '2026-08-31'

  //  도입일이 없으면 아예 견주지 않습니다.
  const none = A.axCompare(data, null, TODAY2)
  ok(none.state === 'no-start' && none.rows.length === 0,
    '㊻ 도입일이 없으면 견주지 않음 (0 으로 채우지 않음)', none.state)

  //  도입 전 기간(7/1~7/31)에는 이 자료에 기록이 없습니다.
  const cmp = A.axCompare(data, START, TODAY2)
  ok(cmp.before?.from === '2026-07-01' && cmp.before?.to === '2026-07-31',
    '㊼ 도입 전 기간을 **같은 길이**로 잡음 (31일 ↔ 31일)',
    `${cmp.before?.from} ~ ${cmp.before?.to}`)
  ok(cmp.state === 'no-before', '㊽ 도입 전에 기록이 없으면 「도입 전 기록 없음」', cmp.state)
  ok(/0 이라고 적지 않습니다/.test(cmp.reason), '㊾ 그리고 0 이라고 적지 않는다고 밝힘')

  const rev = cmp.rows.find((r) => r.key === 'sales.revenue')
  ok(rev != null && rev.after === 135000, '㊿ 현재 값은 그대로 135,000원', String(rev?.after))
  ok(rev != null && rev.beforeSamples === 0, '⓵ 도입 전 표본은 0건', String(rev?.beforeSamples))
  //  ⚠ 여기가 제일 중요합니다.
  //    「0원 → 135,000원 (＋135,000원)」이라고 적으면 **우리가 135,000원을
  //    만들었다**로 읽힙니다. 그런데 그 기간은 엑셀·카톡으로 일하던 때라
  //    시스템에 아무것도 안 남았을 뿐이고, 실제로 0 이었는지는 모릅니다.
  ok(rev != null && rev.before === null,
    '⓵-2 **도입 전에 기록이 통째로 없으면 0 이 아니라 null** — ＋135,000원 같은 변화를 만들지 않음',
    String(rev?.before))

  //  포털 비율은 앞 기간에 요청이 하나도 없어 **계산하지 않습니다**(null).
  const ps = cmp.rows.find((r) => r.key === 'customer.portalShare')
  ok(ps != null && ps.before === null,
    '⓶ **도입 전 포털 비율을 0% 라고 적지 않음** — 요청이 없던 기간은 비율을 못 냅니다', String(ps?.before))

  //  앞뒤 다 있는 경우 — 7월에도 주문·요청이 있었다고 두면 견줄 수 있어야 합니다.
  const withPast = {
    ...data,
    productOrders: [
      ...data.productOrders,
      { id: 'p0', clientId: 'c1', status: '전달완료', requesterName: '', source: 'staff', note: '',
        deliverScheduleId: null, deliverOn: '2026-07-10', requestedAt: '2026-07-08T01:00:00Z',
        confirmedAt: null, deliveredAt: '2026-07-10T01:00:00Z', canceledAt: null, cancelReason: '',
        items: [{ id: 9, orderId: 'p0', productId: 'p1', name: '전용박스', spec: '63L', unit: '개',
                  qty: 1, unitPrice: 9000, unitCost: 5000, stockKey: 'corrugated_box' }] },
    ],
  }
  const cmp2 = A.axCompare(withPast, START, TODAY2)
  ok(cmp2.state === 'ok', '⓷ 앞뒤 다 기록이 있으면 견줌', cmp2.state)
  const rev2 = cmp2.rows.find((r) => r.key === 'sales.revenue')
  ok(rev2?.before === 9000 && rev2?.after === 135000,
    '⓸ 도입 전 9,000원 → 현재 135,000원', `${rev2?.before} → ${rev2?.after}`)
  //  ⚠ 그리고 그때의 **진짜 0 은 0 으로 둡니다.** 그 기간에 시스템을 쓴
  //    흔적이 있으면 「재 봤더니 0」이므로 숨기면 안 됩니다.
  //  7월 주문은 source='staff' 였습니다 — 포털을 쓴 병원은 **재 봤더니 0곳**입니다.
  //  (포털 비율은 그달에 요청이 아예 없어 비율 자체를 못 냅니다 → null.
  //   0% 라고 적지 않는 것이 맞습니다. 이 둘의 차이가 이 파일의 핵심입니다.)
  const pc2 = cmp2.rows.find((r) => r.key === 'customer.portalClients')
  ok(pc2?.before === 0,
    '⓸-2 도입 전에 시스템을 쓴 흔적이 있으면 **그때의 0 은 0 으로 둠** (재 봤더니 0곳)',
    String(pc2?.before))
  const ps2 = cmp2.rows.find((r) => r.key === 'customer.portalShare')
  ok(ps2?.before === null,
    '⓸-3 그래도 **요청이 아예 없던 달의 「비율」은 0% 라고 적지 않음** (분모가 없습니다)',
    String(ps2?.before))
}

// ═══ 추천 근거에 「다음 수거일」 ══════════════════════════════════════════════
{
  const withSched = {
    ...data,
    schedules: [
      ...data.schedules,
      { id: 'next1', date: '2026-08-27', clientId: 'c1', wasteType: '의료폐기물', vehicleId: 'v1',
        scheduledTime: '09:00', status: '예정', expectedAmount: 100, actualAmount: null,
        completedAt: null, memo: '' },
    ],
  }
  const n = A.needsAsOf(withSched, 'c1', '2026-08-20')
  //  ⚠ 되짚을 때는 일정을 모르는 것으로 둡니다 — 그날 그 예정이 실제로
  //    잡혀 있었는지 알 방법이 없습니다.
  ok(n.needs[0]?.nextVisitOn == null,
    '⓹ **되짚을 때는 다음 수거일을 모르는 것으로 둠** (몰랐던 것을 안 것처럼 세지 않음)',
    String(n.needs[0]?.nextVisitOn))
}
