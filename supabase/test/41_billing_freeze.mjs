// ─────────────────────────────────────────────────────────────────────────────
// 청구를 확정하면 정말 굳는가 (계산 검증 · DB 없이)
//
//  대표님이 정하신 방침 그대로인지 확인합니다.
//
//   · 청구 생성 시 그 달의 금액·단가·정산 결과를 고정한다
//   · 이후 단가 변경이나 추가 수거가 기존 청구를 바꾸지 않는다
//   · 같은 거래처·같은 청구월 중복 생성은 차단한다
//   · 청구 뒤 추가 수거는 기존 청구를 유지한 채 추가청구로 분리된다
//   · 취소한 청구는 없는 것으로 보되 기록은 남는다
//
//  더원요양병원 엑셀의 실제 숫자(2026년 2월)로 확인합니다. 여기서 쓰는
//  단가는 시스템 기본값이고, 그 값이 엑셀 단가와 같다는 것은 38번이
//  따로 확인합니다.
//
//  실행
//    node --experimental-strip-types supabase/test/41_billing_freeze.mjs
//    (저장소 최상위에서 실행해야 src/lib/billing.ts 를 읽습니다)
//
//  · DB 도 브라우저도 쓰지 않습니다. 마이그레이션 적용 전에도 돌아갑니다.
// ─────────────────────────────────────────────────────────────────────────────

import {
  billingStateFor,
  buildBillingSnapshot,
  invoiceForBilled,
  settlementFor,
} from '../../src/lib/billing.ts'

let pass = 0
let fail = 0
const ok = (t, e = '') => { pass++; console.log(`  PASS  ${t}${e ? '  ' + e : ''}`) }
const no = (t, e = '') => { fail++; console.log(`  FAIL  ${t}${e ? '  ' + e : ''}`) }
const check = (c, t, e = '') => (c ? ok(t, e) : no(t, e))
const won = (n) => `${Math.round(n).toLocaleString('ko-KR')}원`
const section = (t) => console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 52 - t.length))}`)

const CID = 'c-theone'
const MONTH = '2026-02'
const NOW = '2026-03-02T01:00:00.000Z'

const CLIENT = {
  id: CID, name: '더원요양병원', type: '요양병원', address: '', manager: '박용재 총무부장',
  phone: '', collectionCycle: '', collectsMedicalWaste: true, collectsDiaper: true,
  storageSize: '보통', note: '', isDemoGenerated: false, paymentDueDay: 20,
}
const sched = (id, date, wasteType, kg) => ({
  id, clientId: CID, clientName: CLIENT.name, wasteType, date, time: '09:00',
  vehicleId: 'v1', vehicleName: '1호차', driver: '', status: '완료',
  expectedAmount: kg, actualAmount: kg, actualTime: '09:30',
  completedAt: `${date}T00:30:00.000Z`, memo: '', containers: {}, supplied: {},
  isAdditionalRequest: false,
})
const supply = (id, date, items) => ({
  id, clientId: CID, date, items, boxCount: 0, vinylCount: 0, needleBoxCount: 0,
  isAdditionalRequest: false, memo: '',
})
const appData = (schedules, materials, payments = [], pricing) => ({
  clients: [{ ...CLIENT, ...(pricing ? { pricing } : {}) }],
  retiredClients: [], schedules, materials, payments,
  vehicles: [], notes: [], events: [], requests: [],
  officeStock: {}, baseline: {}, experiment: {},
})

//  엑셀 2월 실적 (38번과 같은 값)
const BASE_SCHED = [
  sched('s1', '2026-02-05', '의료폐기물', 800),
  sched('s2', '2026-02-12', '의료폐기물', 500),
  sched('s3', '2026-02-25', '의료폐기물', 344),
  sched('s4', '2026-02-03', '일회용기저귀', 3000),
  sched('s5', '2026-02-17', '일회용기저귀', 2500),
  sched('s6', '2026-02-26', '일회용기저귀', 1510),
]
const BASE_MAT = [
  supply('m1', '2026-02-05', { plastic2: 60, plastic20: 20, box63: 100, box12: 250, diaperBag40: 500 }),
  supply('m2', '2026-02-19', { plastic2: 40, plastic20: 10, box63: 80, box30: 20, box12: 150, diaperBag40: 300 }),
]
const EXCEL_FEB_REVENUE = 6698400 // 엑셀 J11

console.log('\n════ 청구를 확정하면 정말 굳는가 ════')

// ── 1. 확정 전 ───────────────────────────────────────────────────────────────
section('1. 확정 전 — 청구할 것이 얼마나 남아 있는가')
const before = appData(BASE_SCHED, BASE_MAT)
const st0 = billingStateFor(before, CID, MONTH)
check(st0.bills.length === 0, '아직 확정한 청구가 없음')
check(st0.billedAmount === 0, '이미 청구한 금액 0원')
check(st0.pendingAmount === EXCEL_FEB_REVENUE, '청구할 금액이 엑셀 전체매출과 같음', won(st0.pendingAmount))
check(st0.canConfirm === true, '청구 확정을 누를 수 있음')
check(st0.nextKind === '정기', '첫 청구는 「정기」')

// ── 2. 확정 ──────────────────────────────────────────────────────────────────
section('2. 청구 확정')
const built = buildBillingSnapshot(before, CID, MONTH, NOW)
check(!!built, '청구를 만들 수 있음')
check(built.amount === EXCEL_FEB_REVENUE, '확정 금액이 정산 금액과 같음', won(built.amount))
check(built.snapshot.scheduleIds.length === 6, '이 청구가 덮은 수거 6건을 기록', `${built.snapshot.scheduleIds.length}건`)
check(built.snapshot.materialIds.length === 2, '이 청구가 덮은 공급 2건을 기록', `${built.snapshot.materialIds.length}건`)
check(built.snapshot.invoice.total === EXCEL_FEB_REVENUE, '명세서도 함께 굳음', won(built.snapshot.invoice.total))
check(built.snapshot.invoice.dueDate === '2026-03-20', '결제기한도 굳음 (익월 20일)', built.snapshot.invoice.dueDate)

const bill1 = {
  id: 'p1', clientId: CID, billingMonth: MONTH, amount: built.amount,
  status: '미수금', method: '무통장', paidAt: null, memo: '정기 청구',
  snapshot: built.snapshot,
}
const afterConfirm = appData(BASE_SCHED, BASE_MAT, [bill1])

// ── 3. 중복 차단 ─────────────────────────────────────────────────────────────
section('3. 같은 달을 또 청구하려 할 때')
const st1 = billingStateFor(afterConfirm, CID, MONTH)
check(st1.billedAmount === EXCEL_FEB_REVENUE, '이미 청구한 금액이 잡힘', won(st1.billedAmount))
check(st1.pendingAmount === 0, '남은 청구 금액 0원', won(st1.pendingAmount))
check(st1.canConfirm === false, '청구 확정 버튼이 잠김 (중복 차단)')
check(buildBillingSnapshot(afterConfirm, CID, MONTH, NOW) === null, '중복 청구를 만들 수 없음')

// ── 4. 단가를 바꿔도 흔들리지 않는가 ─────────────────────────────────────────
section('4. 확정 뒤에 단가를 바꿨을 때')
//  지금까지는 단가를 바꾸면 지난달 명세서 금액까지 같이 바뀌었습니다.
//  (실측: 7월 100kg 수거가 95,000원 → 단가 1,500원으로 바꾸자 150,000원)
const priced = appData(BASE_SCHED, BASE_MAT, [bill1], { medical: { sale: 1500, cost: 350 } })
const liveNow = settlementFor(priced, CID, MONTH)
check(liveNow.revenue !== EXCEL_FEB_REVENUE, '지금 값으로 다시 계산하면 금액이 달라짐 (단가를 올렸으므로)',
  `${won(EXCEL_FEB_REVENUE)} → ${won(liveNow.revenue)}`)
const frozen = billingStateFor(priced, CID, MONTH)
check(frozen.billedAmount === EXCEL_FEB_REVENUE, '이미 확정한 청구 금액은 그대로', won(frozen.billedAmount))
const frozenInv = invoiceForBilled(priced, CID, MONTH)
check(frozenInv.total === EXCEL_FEB_REVENUE, '확정한 달의 거래명세서도 그대로', won(frozenInv.total))
check(frozen.pendingAmount === 0, '단가를 바꿨다고 청구할 것이 새로 생기지는 않음')

// ── 5. 확정 뒤 추가 수거 ─────────────────────────────────────────────────────
section('5. 확정 뒤에 그 달 수거가 더 들어왔을 때')
const extraKg = 200
const withExtra = appData(
  [...BASE_SCHED, sched('s7', '2026-02-27', '의료폐기물', extraKg)],
  [...BASE_MAT, supply('m3', '2026-02-27', { plastic20: 5 })],
  [bill1],
)
const st2 = billingStateFor(withExtra, CID, MONTH)
const expectExtra = extraKg * 950 + 5 * 7000 // 190,000 + 35,000
check(st2.billedAmount === EXCEL_FEB_REVENUE, '기존 청구는 그대로 유지됨', won(st2.billedAmount))
check(st2.pendingAmount === expectExtra, '추가분만 새로 잡힘', won(st2.pendingAmount))
check(st2.canConfirm === true, '추가 청구를 만들 수 있음')
check(st2.nextKind === '추가', '이번 청구는 「추가」')

const built2 = buildBillingSnapshot(withExtra, CID, MONTH, NOW)
check(built2.amount === expectExtra, '추가 청구 금액이 추가분과 같음', won(built2.amount))
check(built2.snapshot.scheduleIds.length === 1 && built2.snapshot.scheduleIds[0] === 's7',
  '추가 청구는 새 수거만 덮음', built2.snapshot.scheduleIds.join(','))
check(!built2.snapshot.scheduleIds.some((id) => built.snapshot.scheduleIds.includes(id)),
  '기존 청구가 덮은 수거는 다시 청구되지 않음')

const bill2 = {
  id: 'p2', clientId: CID, billingMonth: MONTH, amount: built2.amount,
  status: '미수금', method: '무통장', paidAt: null, memo: '추가 청구',
  snapshot: built2.snapshot,
}
const both = appData(withExtra.schedules, withExtra.materials, [bill1, bill2])
const st3 = billingStateFor(both, CID, MONTH)
check(st3.billedAmount === EXCEL_FEB_REVENUE + expectExtra, '두 청구를 합치면 그 달 전체 금액',
  `${won(st3.billedAmount)} = ${won(EXCEL_FEB_REVENUE)} + ${won(expectExtra)}`)
check(st3.canConfirm === false, '더 청구할 것이 없으면 다시 잠김')

// ── 6. 취소 ──────────────────────────────────────────────────────────────────
section('6. 잘못 만든 청구를 취소했을 때')
const canceled = appData(withExtra.schedules, withExtra.materials, [
  { ...bill1, status: '취소', canceledAt: NOW },
  bill2,
])
const st4 = billingStateFor(canceled, CID, MONTH)
check(st4.bills.length === 1, '취소한 청구는 살아 있는 청구에서 빠짐', `${st4.bills.length}건`)
check(st4.billedAmount === expectExtra, '취소한 금액은 청구액에서 빠짐', won(st4.billedAmount))
check(st4.pendingAmount === EXCEL_FEB_REVENUE, '취소한 만큼 다시 청구할 수 있게 됨', won(st4.pendingAmount))
check(st4.canConfirm === true, '취소 후에는 다시 확정할 수 있음')
//  기록 자체는 남아 있어야 합니다 — 지운 것이 아니라 취소한 것입니다.
check(canceled.payments.length === 2, '취소해도 기록은 지워지지 않음', `${canceled.payments.length}건`)

// ── 7. 옛 청구(스냅샷 없음)가 섞여 있을 때 ───────────────────────────────────
section('7. 이 기능 이전에 만들어진 청구가 섞여 있을 때')
const legacy = appData(BASE_SCHED, BASE_MAT, [
  { id: 'old', clientId: CID, billingMonth: MONTH, amount: 1000000, status: '미수금', method: '무통장', paidAt: null, memo: '' },
])
const st5 = billingStateFor(legacy, CID, MONTH)
check(st5.hasLegacyBill === true, '옛 청구가 섞여 있다는 것을 알려 줌')
check(st5.billedAmount === 1000000, '그 금액은 청구액에 잡힘', won(st5.billedAmount))

// ── 8. 무상 물품만 나간 달 ───────────────────────────────────────────────────
section('8. 그 달에 무상 물품만 나갔을 때')
//  박스·기저귀비닐은 매출에 잡히지 않습니다(엑셀도 명세서에 넣지 않습니다).
//  그런 달에 0원짜리 청구를 만들면 미수금 목록에 뜻 없는 줄만 늘어납니다.
const freeOnly = appData([], [supply('mf', '2026-02-10', { box63: 50, diaperBag40: 200 })])
const st6 = billingStateFor(freeOnly, CID, MONTH)
check(st6.pending.supplies === 1, '공급 기록은 잡힘', `${st6.pending.supplies}건`)
check(st6.pendingAmount === 0, '청구할 금액은 0원', won(st6.pendingAmount))
check(st6.canConfirm === false, '0원짜리 청구는 만들지 않음')
check(buildBillingSnapshot(freeOnly, CID, MONTH, NOW) === null, '눌러도 만들어지지 않음')

console.log(`\n════ ${pass} PASS / ${fail} FAIL ════`)
console.log(`청구 확정·고정: ${fail === 0 ? 'YES' : 'NO'}`)
process.exit(fail === 0 ? 0 : 1)
