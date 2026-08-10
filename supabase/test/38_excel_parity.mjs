// ─────────────────────────────────────────────────────────────────────────────
// 이사님이 쓰시던 엑셀과 시스템이 같은 답을 내는가 (계산 대조)
//
//  「202602_더원요양병원_거래처관리.xlsx」의 '2026년 정산금 세부내역' 과
//  '2026 거래명세서' 에 적힌 실제 숫자를, 시스템의 정산 계산(lib/billing.ts)에
//  그대로 물려서 한 줄씩 맞춰 봅니다.
//
//  이 검사가 하는 말은 하나입니다 — 이사님이 월말에 엑셀을 다시 만드시지
//  않아도 되려면, 시스템이 내는 숫자가 엑셀과 **원 단위까지 같아야** 합니다.
//  하나라도 다르면 결국 손으로 다시 맞춰 보게 되고, 그러면 아무것도 줄지
//  않습니다.
//
//  맞춰 보는 것 (더원요양병원 · 2026년 2월 — 엑셀에 검산까지 되어 있는 달)
//    · 품목별 수량 × 단가 = 금액        (의료폐기물·합성수지·기저귀)
//    · 의료폐기물 합계 / 지정폐기물 합계 / 전체매출
//    · 소각비용·기저귀 부가세·물품비용    (원가)
//    · 영업이익
//  그리고 8월(거래명세서가 있는 달)로 거래명세서 줄까지 맞춰 봅니다.
//
//  실행
//    node --experimental-strip-types supabase/test/38_excel_parity.mjs
//    (저장소 최상위에서 실행해야 src/lib/billing.ts 를 읽습니다)
//
//  · DB 도 브라우저도 쓰지 않습니다. 순수 계산만 대조합니다.
// ─────────────────────────────────────────────────────────────────────────────

import { settlementFor, invoiceFor } from '../../src/lib/billing.ts'

let pass = 0
let fail = 0
const ok = (t, e = '') => { pass++; console.log(`  PASS  ${t}${e ? '  ' + e : ''}`) }
const no = (t, e = '') => { fail++; console.log(`  FAIL  ${t}${e ? '  ' + e : ''}`) }
const won = (n) => `${Math.round(n).toLocaleString('ko-KR')}원`
const eq = (got, want, label) =>
  got === want ? ok(label, won(want)) : no(label, `시스템 ${won(got)} · 엑셀 ${won(want)} (차이 ${won(got - want)})`)
const section = (t) => console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 52 - t.length))}`)

// ── 엑셀에 적혀 있는 값 (그대로 옮긴 것입니다) ────────────────────────────
//  '2026년 정산금 세부내역' 시트, 더원요양병원, 2월 열(I·J).
const EXCEL_FEB = {
  medicalKg: 1644,       // I3
  plastic2: 100,         // I4
  plastic5: 0,           // I5
  plastic20: 30,         // I6
  diaperKg: 7010,        // I7
  box63: 180,            // I16
  box30: 20,             // I17
  box12: 400,            // I18
  box4: 0,               // I19
  diaperBag40: 800,      // I23
  // 금액
  medicalAmount: 1561800,     // J3  = 1644 × 950
  plastic2Amount: 300000,     // J4  = 100 × 3000
  plastic20Amount: 210000,    // J6  = 30 × 7000
  diaperAmount: 4626600,      // J7  = 7010 × 660
  medicalSubtotal: 2071800,   // J9  의료폐기물 합계
  diaperSubtotal: 4626600,    // J10 지정폐기물 합계
  totalRevenue: 6698400,      // J11 전체매출
  medicalBurn: 575400,        // J12 의료폐기물 소각비용 (1644 × 350)
  diaperBurn: 1402000,        // J13 기저귀 소각비용 (7010 × 200)
  diaperVat: 140200,          // J14 기저귀 부가세 (7010 × 20)
  materialCost: 656050,       // J15 물품사용
  profit: 3924750,            // J24 영업이익
}

//  '2026 거래명세서' 시트 (8월) + 세부내역 8월 열(U·V).
const EXCEL_AUG = {
  medicalKg: 472,        // U3 / 명세서 D17
  plastic20: 50,         // U6 / 명세서 D20
  diaperKg: 2270,        // U7 / 명세서 D48
  medicalAmount: 448400, // V3 / 명세서 G17
  plastic20Amount: 350000,   // V6 / 명세서 G20
  medicalSubtotal: 798400,   // V9 / 명세서 G37
  diaperSubtotal: 1498200,   // V10 / 명세서 G48
  totalRevenue: 2296600,     // V11 / 명세서 G49 · C14 합계금액
  // 명세서에 나뉘어 적힌 기저귀 두 줄
  diaperLines: [
    { date: '2026-08-02', qty: 1000, amount: 660000 },
    { date: '2026-08-05', qty: 1270, amount: 838200 },
  ],
}

// ── 엑셀 숫자를 시스템이 쓰는 모양(AppData)으로 옮깁니다 ──────────────────
//  일부러 '엑셀에 적힌 그 수량' 만 넣습니다. 단가는 넣지 않습니다 —
//  시스템의 기본 단가가 엑셀 단가와 같아야 하기 때문입니다. 단가까지
//  넣어 버리면 "단가를 맞춰 줬으니 금액이 맞는" 당연한 결과가 됩니다.
const CLIENT = {
  id: 'c-theone',
  name: '더원요양병원',
  type: '요양병원',
  address: '',
  manager: '박용재 총무부장',
  phone: '',
  collectionCycle: '',
  collectsMedicalWaste: true,
  collectsDiaper: true,
  storageSize: '보통',
  note: '',
  isDemoGenerated: false,
  paymentDueDay: 20, // 엑셀 F2 '익월20일'
}

const sched = (id, date, wasteType, kg) => ({
  id, clientId: CLIENT.id, clientName: CLIENT.name, wasteType,
  date, time: '09:00', vehicleId: 'v1', vehicleName: '1호차', driver: '',
  status: '완료', expectedAmount: kg, actualAmount: kg,
  actualTime: '09:30', completedAt: `${date}T00:30:00.000Z`, memo: '',
  containers: {}, supplied: {}, isAdditionalRequest: false,
})
const supply = (id, date, items) => ({
  id, clientId: CLIENT.id, date, items,
  boxCount: 0, vinylCount: 0, needleBoxCount: 0,
  isAdditionalRequest: false, memo: '',
})
const appData = (schedules, materials) => ({
  clients: [CLIENT], retiredClients: [], schedules, materials,
  payments: [], vehicles: [], notes: [], events: [], requests: [],
  officeStock: {}, baseline: {}, experiment: {},
})

console.log('\n════ 엑셀과 시스템이 같은 답을 내는가 (더원요양병원) ════')

// ── 1. 2026년 2월 — 엑셀에 검산까지 되어 있는 달 ──────────────────────────
section('1. 2026년 2월 정산 (엑셀 J열)')
//  한 달치 수거·공급을 여러 번에 나눠 넣습니다. 합계만 맞추는 게 아니라
//  '여러 건을 합쳐도 같은가' 를 함께 봅니다(실제로도 여러 번 수거합니다).
const febSched = [
  sched('s1', '2026-02-05', '의료폐기물', 800),
  sched('s2', '2026-02-12', '의료폐기물', 500),
  sched('s3', '2026-02-25', '의료폐기물', 344),
  sched('s4', '2026-02-03', '일회용기저귀', 3000),
  sched('s5', '2026-02-17', '일회용기저귀', 2500),
  sched('s6', '2026-02-26', '일회용기저귀', 1510),
]
const febMat = [
  supply('m1', '2026-02-05', { plastic2: 60, plastic20: 20, box63: 100, box12: 250, diaperBag40: 500 }),
  supply('m2', '2026-02-19', { plastic2: 40, plastic20: 10, box63: 80, box30: 20, box12: 150, diaperBag40: 300 }),
]
const feb = settlementFor(appData(febSched, febMat), CLIENT.id, '2026-02')

const qtyOf = (s, key) =>
  [...s.wasteLines, ...s.supplyLines].find((l) => l.key === key)?.qty ?? 0
const revOf = (s, key) =>
  [...s.wasteLines, ...s.supplyLines].find((l) => l.key === key)?.revenue ?? 0
const costOf = (s, key) =>
  [...s.wasteLines, ...s.supplyLines].find((l) => l.key === key)?.cost ?? 0

// 수량이 먼저 맞아야 금액을 볼 의미가 있습니다
const qtyCheck = (key, want, label) => {
  const got = qtyOf(feb, key)
  got === want ? ok(`${label} 수량`, `${want.toLocaleString('ko-KR')}`)
    : no(`${label} 수량`, `시스템 ${got} · 엑셀 ${want}`)
}
qtyCheck('medical', EXCEL_FEB.medicalKg, '의료폐기물')
qtyCheck('diaper', EXCEL_FEB.diaperKg, '일회용기저귀')
qtyCheck('plastic2', EXCEL_FEB.plastic2, '2L 합성수지')
qtyCheck('plastic20', EXCEL_FEB.plastic20, '20L 합성수지')
qtyCheck('box63', EXCEL_FEB.box63, '63L 박스')
qtyCheck('box12', EXCEL_FEB.box12, '12L 박스')
qtyCheck('diaperBag40', EXCEL_FEB.diaperBag40, '기저귀비닐 40L')

eq(revOf(feb, 'medical'), EXCEL_FEB.medicalAmount, '의료폐기물 매출 (1,644kg × 950)')
eq(revOf(feb, 'plastic2'), EXCEL_FEB.plastic2Amount, '2L 합성수지 매출 (100개 × 3,000)')
eq(revOf(feb, 'plastic20'), EXCEL_FEB.plastic20Amount, '20L 합성수지 매출 (30개 × 7,000)')
eq(revOf(feb, 'diaper'), EXCEL_FEB.diaperAmount, '일회용기저귀 매출 (7,010kg × 660)')

//  엑셀의 '의료폐기물 합계' 는 의료폐기물 + 합성수지(유상 물품)입니다.
const sysMedicalSubtotal = revOf(feb, 'medical') + revOf(feb, 'plastic2') + revOf(feb, 'plastic5') + revOf(feb, 'plastic20')
eq(sysMedicalSubtotal, EXCEL_FEB.medicalSubtotal, '의료폐기물 합계 (J9)')
eq(revOf(feb, 'diaper'), EXCEL_FEB.diaperSubtotal, '지정폐기물 합계 (J10)')
eq(feb.revenue, EXCEL_FEB.totalRevenue, '전체매출 (J11)')

eq(costOf(feb, 'medical'), EXCEL_FEB.medicalBurn, '의료폐기물 소각비용 (J12)')
//  엑셀은 기저귀 소각비(200)와 부가세(20)를 두 줄로 나눠 적었습니다.
//  시스템은 660 매출에 대응해 220 원가 한 줄로 둡니다 — 합계가 같아야 합니다.
eq(costOf(feb, 'diaper'), EXCEL_FEB.diaperBurn + EXCEL_FEB.diaperVat,
  '기저귀 소각비 + 부가세 (J13+J14)')
eq(feb.materialCost, EXCEL_FEB.materialCost, '물품비용 (J15)')
eq(feb.cost, EXCEL_FEB.medicalBurn + EXCEL_FEB.diaperBurn + EXCEL_FEB.diaperVat + EXCEL_FEB.materialCost,
  '원가 합계')
eq(feb.profit, EXCEL_FEB.profit, '영업이익 (J24)')

// ── 2. 2026년 8월 — 거래명세서가 있는 달 ──────────────────────────────────
section('2. 2026년 8월 거래명세서 (명세서 시트)')
const augSched = [
  sched('a1', '2026-08-05', '의료폐기물', EXCEL_AUG.medicalKg),
  ...EXCEL_AUG.diaperLines.map((l, i) => sched(`a${i + 2}`, l.date, '일회용기저귀', l.qty)),
]
const augMat = [supply('am1', '2026-08-05', { plastic20: EXCEL_AUG.plastic20 })]
const augData = appData(augSched, augMat)
const aug = settlementFor(augData, CLIENT.id, '2026-08')
const inv = invoiceFor(augData, CLIENT.id, '2026-08')

eq(aug.revenue, EXCEL_AUG.totalRevenue, '전체매출 (V11 · 명세서 합계금액)')
eq(inv.total, EXCEL_AUG.totalRevenue, '거래명세서 합계금액 (C14 · G49)')
eq(inv.medicalSubtotal, EXCEL_AUG.medicalSubtotal, '의료폐기물 수집운반비용 합계 (G37)')
eq(inv.diaperSubtotal, EXCEL_AUG.diaperSubtotal, '일회용기저귀 수집운반비용 합계 (G48)')

const mKg = inv.medicalKg
mKg === EXCEL_AUG.medicalKg ? ok('명세서 의료폐기물 수량', `${mKg}kg`)
  : no('명세서 의료폐기물 수량', `시스템 ${mKg} · 엑셀 ${EXCEL_AUG.medicalKg}`)
const dKg = inv.diaperKg
dKg === EXCEL_AUG.diaperKg ? ok('명세서 기저귀 수량', `${dKg}kg`)
  : no('명세서 기저귀 수량', `시스템 ${dKg} · 엑셀 ${EXCEL_AUG.diaperKg}`)

//  명세서는 날짜별로 줄이 갈립니다 — 엑셀도 8/02·8/05 두 줄입니다.
for (const l of EXCEL_AUG.diaperLines) {
  const got = inv.diaperLines.find((x) => x.date === l.date)
  got && got.qty === l.qty && got.amount === l.amount
    ? ok(`명세서 기저귀 ${l.date} 줄`, `${l.qty}kg · ${won(l.amount)}`)
    : no(`명세서 기저귀 ${l.date} 줄`,
        got ? `시스템 ${got.qty}kg ${won(got.amount)} · 엑셀 ${l.qty}kg ${won(l.amount)}` : '줄이 없음')
}

//  무상 물품(박스·기저귀비닐)은 명세서 매출에 올라가면 안 됩니다.
//  엑셀 명세서에도 합성수지만 있고 박스는 없습니다.
const freeInBill = [...inv.medicalLines, ...inv.diaperLines].filter((l) =>
  /박스|비닐/.test(l.label))
freeInBill.length === 0
  ? ok('무상 물품(박스·기저귀비닐)은 명세서 매출에 없음')
  : no('무상 물품이 명세서 매출에 올라감', freeInBill.map((l) => l.label).join(', '))

// ── 3. 결제기한 ───────────────────────────────────────────────────────────
section('3. 결제기한 (엑셀 F2 「익월20일」)')
//  엑셀 명세서에는 「결제기한 : 2026년 9월 20일」 이라고 적혀 있습니다.
inv.dueDate === '2026-09-20'
  ? ok('8월 명세서 결제기한이 익월 20일', inv.dueDate)
  : no('결제기한이 다름', `시스템 ${inv.dueDate ?? '없음'} · 엑셀 2026-09-20`)

console.log(`\n════ ${pass} PASS / ${fail} FAIL ════`)
console.log(`엑셀 ↔ 시스템 정산 일치: ${fail === 0 ? 'YES' : 'NO'}`)
process.exit(fail === 0 ? 0 : 1)
