import { execFileSync } from 'node:child_process'

//  추천이 **실제로 병원에 들어간 물량 전부**를 보는가
//
//   예전에는 자재공급 기록(materials)만 봤습니다. 그런데 병원이 포털로
//   주문해서 받은 물량은 거기 안 남습니다 — 전달할 때 재고와 원장
//   (material_transactions)만 건드리고 materials 에는 안 씁니다.
//
//   그래서 병원이 박스 20개를 사서 받아도 추천은 그걸 못 보고, 그다음 주에
//   또 「마지막 공급 46일 전 · 이번에 필요」라고 권했습니다.
//   **방금 받은 사람에게 또 사라고 하는 것**입니다.
//
//   여기서 재는 것
//    ① 주문해서 받은 물량이 사용 이력에 들어가는가
//    ② 방금 받았으면 「마지막 공급」이 그날로 바뀌는가
//    ③ 재고를 두지 않는 상품도 반복 구매하면 추천되는가
//    ④ 주문만 하고 아직 못 받은 것은 **안 들어가는가** (받지도 않았는데 셌다고 하면 안 됩니다)
//    ⑤ 취소한 주문도 안 들어가는가

const SRC = '/home/user/beonemirae-ops-mvp/src/lib/supplyNeeds.ts'
const OUT = `${process.env.TEST_OUT ?? '/tmp'}/.sn.mjs`
execFileSync('/home/user/beonemirae-ops-mvp/node_modules/.bin/esbuild',
  [SRC, '--bundle', '--format=esm', '--platform=neutral', `--outfile=${OUT}`], { stdio: 'pipe' })
const S = await import(`${OUT}?v=${process.pid}`)

const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  if (!c) process.exitCode = 1
}
const C = 'c1'
const TODAY = '2026-08-20'

const item = (id, name, spec, qty, stockKey, productId) => ({
  id, orderId: '', productId, name, spec, unit: '개', qty, unitPrice: 9000, unitCost: 5000, stockKey,
})
const order = (id, status, deliveredAt, items) => ({
  id, clientId: C, status, requesterName: '', source: 'portal', note: '',
  deliverScheduleId: null, deliverOn: null,
  requestedAt: `${(deliveredAt ?? '2026-08-01')}T00:00:00Z`,
  confirmedAt: null, deliveredAt: deliveredAt ? `${deliveredAt}T01:00:00Z` : null,
  canceledAt: null, cancelReason: '', items,
})
const mat = (id, date, box) => ({
  id, clientId: C, date, boxCount: box, vinylCount: 0, needleBoxCount: 0,
  isAdditionalRequest: false, memo: '',
})

const base = {
  clients: [{ id: C, name: '가나병원' }], vehicles: [], schedules: [], payments: [], requests: [],
  receipts: [], events: [], notes: [], leads: [], requestOverrides: [], officeStock: {},
  baseline: {}, experiment: {}, products: [],
}

// ── ① ② 주문해서 받은 물량이 사용 이력에 들어가는가 ─────────────────────────
{
  //  자재공급으로 두 번 받았고(6/1 · 7/1), 그다음 **포털로 사서** 8/15 에 받았습니다.
  const data = {
    ...base,
    materials: [mat('m1', '2026-06-01', 20), mat('m2', '2026-07-01', 20)],
    productOrders: [order('o1', '전달완료', '2026-08-15', [item(1, '골판지 전용박스', '63L', 20, 'corrugated_box', 'p1')])],
  }
  const n = S.supplyNeedsFor(data, C, TODAY).needs.find((x) => x.stockKey === 'corrugated_box')
  ok(n != null, '① 골판지가 추천 목록에 있음')
  ok(n?.times === 3, '② 받은 횟수가 3번 (자재 2 + 주문 1)', String(n?.times))
  ok(n?.total === 60, '③ 모두 60개', String(n?.total))
  ok(n?.lastDate === '2026-08-15', '④ **마지막 공급이 주문 전달일로 바뀜** (5일 전)', String(n?.lastDate))
  ok(n?.daysSince === 5, '⑤ 마지막 이후 5일 — 방금 받은 사람에게 또 권하지 않음', String(n?.daysSince))

  //  예전 방식(자재만) 이었으면 마지막이 7/1 · 50일 전이라 「이번에 필요」가 떴을 것입니다.
  const oldWay = S.supplyNeedsFor({ ...data, productOrders: [] }, C, TODAY).needs
    .find((x) => x.stockKey === 'corrugated_box')
  ok(oldWay?.daysSince === 50 && n?.daysSince === 5,
    '⑥ **고치기 전이었다면 50일 전이라고 했을 것** — 그 차이가 이 수정입니다',
    `예전 ${oldWay?.daysSince}일 → 지금 ${n?.daysSince}일`)
}

// ── ③ 재고를 두지 않는 상품도 반복 구매하면 추천되는가 ──────────────────────
{
  const data = {
    ...base,
    materials: [],
    productOrders: [
      order('o1', '전달완료', '2026-06-10', [item(1, '소독티슈', '100매', 5, null, 'pw')]),
      order('o2', '전달완료', '2026-07-10', [item(2, '소독티슈', '100매', 5, null, 'pw')]),
    ],
  }
  const needs = S.supplyNeedsFor(data, C, TODAY).needs
  const n = needs.find((x) => x.productId === 'pw')
  ok(n != null, '⑦ **재고를 두지 않는 상품도 추천됨** (예전에는 재고 네 칸만 봤습니다)')
  ok(n?.key === 'product:pw', '⑧ 키가 상품 id 기준', String(n?.key))
  ok(n?.label === '소독티슈 100매', '⑨ 이름과 규격이 그대로', String(n?.label))
  ok(n?.stockKey === null, '⑩ 재고 칸은 없음 (재고를 안 두는 물건)', String(n?.stockKey))
  ok(n?.times === 2 && n?.total === 10, '⑪ 두 번 · 모두 10개', `${n?.times}번 ${n?.total}개`)

  //  ⚠ 상품 id 도 없으면 무엇인지 알 수 없습니다. 이름만으로 묶으면 규격이
  //    다른 물건이 한 줄로 합쳐집니다 — 세지 않습니다.
  const noId = {
    ...base, materials: [],
    productOrders: [
      order('o1', '전달완료', '2026-06-10', [item(1, '무엇인가', '', 5, null, null)]),
      order('o2', '전달완료', '2026-07-10', [item(2, '무엇인가', '', 5, null, null)]),
    ],
  }
  ok(S.supplyNeedsFor(noId, C, TODAY).needs.length === 0,
    '⑫ 상품 id 도 재고 칸도 없으면 세지 않음 (이름만으로 묶지 않습니다)')
}

// ── ④ ⑤ 아직 못 받은 것 · 취소한 것은 안 들어간다 ──────────────────────────
{
  const data = {
    ...base,
    materials: [mat('m1', '2026-06-01', 20), mat('m2', '2026-07-01', 20)],
    productOrders: [
      //  주문만 했고 아직 전달 전
      order('o1', '요청', null, [item(1, '골판지 전용박스', '63L', 999, 'corrugated_box', 'p1')]),
      //  취소
      { ...order('o2', '취소', '2026-08-15', [item(2, '골판지 전용박스', '63L', 999, 'corrugated_box', 'p1')]),
        canceledAt: '2026-08-16T00:00:00Z' },
    ],
  }
  const n = S.supplyNeedsFor(data, C, TODAY).needs.find((x) => x.stockKey === 'corrugated_box')
  ok(n?.times === 2 && n?.total === 40,
    '⑬ **주문만 하고 못 받은 것 · 취소한 것은 안 셈** (받지도 않은 999개가 안 들어감)',
    `${n?.times}번 ${n?.total}개`)
}

// ── 같은 날 두 줄은 한 번이다 ───────────────────────────────────────────────
{
  //  하루에 두 건 적었다고 주기를 아는 것이 아닙니다.
  const data = {
    ...base, materials: [mat('m1', '2026-07-01', 10), mat('m2', '2026-07-01', 10)],
    productOrders: [],
  }
  const needs = S.supplyNeedsFor(data, C, TODAY).needs
  ok(needs.length === 0, '⑭ 같은 날 두 줄은 **한 번** — 주기를 안다고 하지 않음',
    needs.map((x) => `${x.label} ${x.times}번`).join(',') || '추천 없음')
}
