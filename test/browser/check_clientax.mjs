import { execFileSync } from 'node:child_process'

//  거래처 한 곳의 「지금 아는 것」 (lib/clientAx.ts)
//
//   ⚠ 이 화면이 **하지 않아야 할 것**을 먼저 잽니다.
//     「이 병원에 이것을 파세요」식 근거 없는 영업추천은 한 번만 틀려도
//     그다음부터 화면의 모든 숫자를 안 믿게 만듭니다.
//
//   재는 것
//    · 전달 완료만 「사 갔다」로 세는가 (주문만 한 건은 아님)
//    · 전달 ≠ 입금이 여기서도 갈리는가
//    · 포털을 쓰는지 · 전화로 오는지 갈리는가
//    · 예정에 없던 방문을 세는가

const SRC = '/home/user/beonemirae-ops-mvp/src/lib/clientAx.ts'
const OUT = `${process.env.TEST_OUT ?? '/tmp'}/.clientax.mjs`
execFileSync('/home/user/beonemirae-ops-mvp/node_modules/.bin/esbuild',
  [SRC, '--bundle', '--format=esm', '--platform=neutral', `--outfile=${OUT}`], { stdio: 'pipe' })
const A = await import(`${OUT}?v=${process.pid}`)

const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  if (!c) process.exitCode = 1
}
const C = 'c1'
const TODAY = '2026-08-20'
const it = (id, name, spec, qty, productId, price = 9000) => ({
  id, orderId: '', productId, name, spec, unit: '개', qty, unitPrice: price, unitCost: 5000, stockKey: null,
})
const ord = (id, status, deliveredAt, items, source = 'portal') => ({
  id, clientId: C, status, requesterName: '', source, note: '',
  deliverScheduleId: null, deliverOn: null, requestedAt: `${deliveredAt ?? '2026-08-01'}T00:00:00Z`,
  confirmedAt: null, deliveredAt: deliveredAt ? `${deliveredAt}T01:00:00Z` : null,
  canceledAt: null, cancelReason: '', items,
})

const data = {
  clients: [{ id: C, name: '가나병원' }],
  vehicles: [], materials: [
    { id: 'm1', clientId: C, date: '2026-07-01', boxCount: 20, vinylCount: 0, needleBoxCount: 0, isAdditionalRequest: true, memo: '' },
  ],
  schedules: [
    { id: 's1', date: '2026-08-05', clientId: C, wasteType: '의료폐기물', vehicleId: 'v1', scheduledTime: '09:00',
      status: '완료', expectedAmount: 100, actualAmount: 100, completedAt: '2026-08-05T01:00:00Z', memo: '',
      origin: 'plan', bookedAt: '2026-08-01T00:00:00Z' },
    //  예정에 없던 방문
    { id: 's2', date: '2026-08-12', clientId: C, wasteType: '의료폐기물', vehicleId: 'v1', scheduledTime: '14:00',
      status: '완료', expectedAmount: 0, actualAmount: 40, completedAt: '2026-08-12T05:00:00Z', memo: '',
      origin: 'field', bookedAt: null },
    //  앞으로 갈 날
    { id: 's3', date: '2026-08-27', clientId: C, wasteType: '의료폐기물', vehicleId: 'v1', scheduledTime: '09:00',
      status: '예정', expectedAmount: 100, actualAmount: null, completedAt: null, memo: '' },
  ],
  payments: [
    { id: 'pay1', clientId: C, billingMonth: '2026-08', amount: 100000, status: '입금완료', method: '무통장',
      paidAt: '2026-08-31T00:00:00Z', memo: '', snapshot: { orderIds: ['o1'] }, canceledAt: null },
    { id: 'pay2', clientId: C, billingMonth: '2026-08', amount: 100000, status: '미수금', method: '무통장',
      paidAt: null, memo: '', snapshot: { orderIds: ['o2'] }, canceledAt: null },
  ],
  requests: [
    { id: 'r1', clientId: C, kind: '긴급수거', content: '급합니다', desiredDate: null, urgent: true, status: '접수',
      source: 'portal', requesterName: '', reply: '', handledBy: null, handledAt: null, createdAt: '2026-08-02T01:00:00Z' },
    { id: 'r2', clientId: C, kind: '추가수거', content: '전화로', desiredDate: null, urgent: false, status: '접수',
      source: 'staff', requesterName: '', reply: '', handledBy: null, handledAt: null, createdAt: '2026-08-11T01:00:00Z' },
  ],
  productOrders: [
    ord('o1', '전달완료', '2026-07-05', [it(1, '소독티슈', '100매', 5, 'pw')]),
    ord('o2', '전달완료', '2026-08-05', [it(2, '소독티슈', '100매', 5, 'pw')]),
    //  ⚠ **주문만** 한 900,000원짜리. 「사 갔다」로 세면 안 됩니다.
    ord('o3', '요청', null, [it(3, '고급장갑', 'M', 100, 'pg')]),
  ],
  receipts: [], events: [], notes: [], leads: [], requestOverrides: [], officeStock: {},
  baseline: {}, experiment: {}, products: [],
}

const r = A.clientAx(data, C, TODAY)

// ── 무엇을 사 갔는가 ────────────────────────────────────────────────────────
ok(r.bought.length === 1, '① **전달 완료만** 「사 갔다」로 셈 — 주문만 한 건은 안 셈',
  r.bought.map((b) => `${b.label} ${b.times}번`).join(', ') || '없음')
ok(r.bought[0]?.label === '소독티슈 100매' && r.bought[0]?.qty === 10, '② 소독티슈 모두 10개',
  `${r.bought[0]?.label} ${r.bought[0]?.qty}개`)
ok(r.repeat.length === 1, '③ 두 번 이상 사 간 것이 「자주 사는 품목」', String(r.repeat.length))
ok(r.bought[0]?.lastOn === '2026-08-05', '④ 마지막으로 받은 날', String(r.bought[0]?.lastOn))

// ── 전달 ≠ 입금 ─────────────────────────────────────────────────────────────
ok(r.productRevenue === 90000, '⑤ 전달까지 끝난 판매 90,000원 (5+5)×9,000', String(r.productRevenue))
ok(r.paidRevenue === 45000, '⑥ **입금까지 끝난 것은 45,000원** — 전달 ≠ 입금', String(r.paidRevenue))

// ── 포털을 쓰는가 ───────────────────────────────────────────────────────────
ok(r.usesPortal === true, '⑦ 이 병원은 포털을 씀')
ok(r.portalRequests === 1 && r.phoneRequests === 1,
  '⑧ 포털 요청 1건 · 전화 접수 1건으로 갈림', `포털 ${r.portalRequests} · 전화 ${r.phoneRequests}`)
ok(r.portalOrders === 3, '⑨ 포털로 올린 주문 3건 (취소 제외)', String(r.portalOrders))

// ── 운영 ────────────────────────────────────────────────────────────────────
ok(r.unplannedVisits === 1, '⑩ 예정에 없던 방문 1건', String(r.unplannedVisits))
ok(r.additionalSupplies === 1, '⑪ 추가요청 자재공급 1건', String(r.additionalSupplies))
ok(r.nextVisitOn === '2026-08-27', '⑫ 다음 방문 예정', String(r.nextVisitOn))

// ── 추천 ────────────────────────────────────────────────────────────────────
//   소독티슈를 7/5 · 8/5 두 번 받았으니 주기를 압니다.
ok(r.needs.some((n) => n.productId === 'pw'), '⑬ 두 번 이상 받은 상품은 추천에 뜸',
  r.needs.map((n) => n.label).join(', ') || '없음')
//  ⚠ 날짜를 손으로 세어 둡니다 — 시스템이 낸 값에 기대값을 맞추면 검사가
//    아무것도 증명하지 못합니다.
//      7월 5일 → 8월 5일 = 31일 (7월은 31일까지)  → 평균 주기 31일
//      마지막 8월 5일 + 31일 = **9월 5일**
ok(r.nextNeedOn === '2026-09-05', '⑭ 다음에 필요할 것으로 보는 날 = 8/5 + 31일', String(r.nextNeedOn))

// ── 아무것도 없는 거래처 ────────────────────────────────────────────────────
{
  const empty = A.clientAx({ ...data, productOrders: [], materials: [], requests: [] }, C, TODAY)
  ok(empty.bought.length === 0 && empty.repeat.length === 0, '⑮ 산 적 없으면 빈 목록')
  ok(empty.needs.length === 0 && empty.needsBlocked !== '',
    '⑯ 추천할 이력이 없으면 **왜 못 하는지** 적음', empty.needsBlocked.slice(0, 40))
  ok(empty.usesPortal === false, '⑰ 포털을 안 쓰면 안 쓴다고 함')
  ok(empty.productRevenue === 0 && empty.paidRevenue === 0, '⑱ 판매 0원')
}
