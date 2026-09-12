import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// ─────────────────────────────────────────────────────────────────────────────
//  0108 — AX Coach 계산층 (브라우저 없이)
//
//   ① 아무 기록이 없는 상태          ② 업무만 충분           ③ 포털 0건
//   ④ 포털 1건                       ⑤ 수거 완료            ⑥ 당일 입력
//   ⑦ 주문만 · 전달 전               ⑧ 전달 완료            ⑨ 청구 확정
//   ⑩ 입금 완료                      ⑪ 발행만 하고 안 함     ⑫ 발행 뒤 실제 발생
//   ⑬ 같은 일이 되풀이될 때
//
//   ⚠ 기대값은 **규칙에서** 나옵니다 — BREADTH_RULE(30·14·5·2·80) 과
//     AX_MIN_SAMPLES(5). 시스템이 내는 값에 맞추지 않았습니다.
//   ⚠ 여기서 제일 중요한 검사는 **「완료 단추로는 아무것도 안 된다」**입니다.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = '/home/user/beonemirae-ops-mvp'
let pass = 0
let fail = 0
const ok = (name, cond, detail = '') => {
  if (cond) pass += 1
  else fail += 1
  console.log(`${cond ? ' OK ' : 'FAIL'} | ${name}${detail && !cond ? ` — ${detail}` : ''}`)
}

const dir = mkdtempSync(join(tmpdir(), 'coach-'))
const entry = join(dir, 'entry.ts')
writeFileSync(entry, `
export * as K from '${ROOT}/src/lib/axCoach.ts'
export * as A from '${ROOT}/src/lib/axEvidence.ts'
export * as E from '${ROOT}/src/lib/evidenceBase.ts'
`)
const bundle = join(dir, 'coach.mjs')
execFileSync(join(ROOT, 'node_modules/.bin/esbuild'), [
  entry, '--bundle', '--format=esm', '--platform=neutral', `--outfile=${bundle}`,
], { stdio: 'pipe' })
const { K, A, E } = await import(bundle)

const pad = (n) => String(n).padStart(2, '0')
const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return localDate(d) }
const TODAY = daysAgo(0)
const START = daysAgo(60)
const PERIOD = { from: START, to: TODAY }

const ev = (i, over = {}) => ({
  id: `e${i}`, at: `${daysAgo(over.ago ?? 1)}T03:00:00`, role: '현장 담당자', screen: '수거 입력', action: '수거 완료',
  scheduleId: over.scheduleId ?? `s${i}`, createdSchedule: false, clientId: over.clientId ?? 'c1', clientName: '가나요양병원',
  wasteType: '의료폐기물', amountKg: 50, before: { status: '예정', actualAmount: null, handoverStatus: null },
  materialIds: over.materialIds ?? [], stockBefore: { corrugatedBox: 0, plasticContainer: 0, bag: 0, needleBox: 0 },
  requestUpdates: [], note: '', reverted: false, revertedAt: null, demoSessionId: null, inputDurationMs: 90000, ...over,
})
const sched = (i, over = {}) => ({
  id: `s${i}`, date: daysAgo(over.ago ?? 1), clientId: over.clientId ?? 'c1', wasteType: '의료폐기물', vehicleId: 'v1',
  scheduledTime: '09:00', status: over.status ?? '완료', expectedAmount: 50,
  actualAmount: over.actualAmount === undefined ? 50 : over.actualAmount,
  completedAt: over.completedAt === undefined ? `${daysAgo(over.ago ?? 1)}T03:00:00Z` : over.completedAt,
  memo: '', origin: over.origin ?? 'field', driverName: over.driverName ?? '김기사', canceledAt: null, ...over,
})
const order = (i, over = {}) => ({
  id: `o${i}`, clientId: over.clientId ?? 'c1', status: over.status ?? '요청', requesterName: '원무과',
  source: over.source ?? 'portal', note: '', deliverScheduleId: null, deliverOn: null,
  requestedAt: `${daysAgo(over.ago ?? 3)}T01:00:00Z`, confirmedAt: null,
  deliveredAt: over.deliveredAt === undefined ? null : over.deliveredAt, canceledAt: null, cancelReason: '',
  items: [{ id: 1, orderId: `o${i}`, productId: 'p1', name: '전용박스', spec: '63L', unit: '개', qty: 10, unitPrice: 3000, unitCost: 2000, stockKey: 'corrugated_box' }],
  ...over,
})
const req = (i, over = {}) => ({
  id: `q${i}`, clientId: over.clientId ?? 'c1', clientName: '가나요양병원', kind: '추가수거', content: '',
  desiredDate: null, urgent: false, status: '접수', source: over.source ?? 'portal', requesterName: '원무과',
  reply: '', handledBy: null, handledAt: over.handledAt ?? null, createdAt: over.createdAt ?? `${daysAgo(over.ago ?? 2)}T01:00:00Z`,
  ...over,
})
const base = (over = {}) => ({
  clients: [
    { id: 'c1', name: '가나요양병원', isDemoGenerated: false, address: '서울시 ...', phone: '02-000-0000' },
    { id: 'c2', name: '다래의원', isDemoGenerated: false, address: '서울시 ...', phone: '02-111-1111' },
  ],
  vehicles: [{ id: 'v1', name: '1호차', wasteType: '의료폐기물', tonnage: 1, nominalCapacity: 1000, expectedCapacity: 700, driver: '김기사' }],
  vehicleReservations: [], schedules: [], materials: [], payments: [],
  officeStock: { corrugatedBox: 0, plasticContainer: 0, bag: 0, needleBox: 0 },
  events: [], requestOverrides: [], notes: [], leads: [], requests: [], inquiries: [],
  productOrders: [], receipts: [], operatingCosts: [],
  baseline: { adminMinutesPerCollection: 11.7, repeatEntriesPerCollection: 4, monthlyDocHours: 91, monthlyReworkCount: 4, dailyCapacity: 18, source: 'survey', updatedAt: null },
  experiment: { startDate: START },
  ...over,
})
const cov = (d) => K.coverageOf(d, PERIOD)
const areaOf = (c, a) => c.areas.find((x) => x.area === a)
const itemOf = (c, a, k) => areaOf(c, a).items.find((i) => i.key === k)

// ── ① 아무 기록이 없는 상태 ────────────────────────────────────────────────
console.log('── ① 아무 기록이 없는 상태 ──')
{
  const c = cov(base({}))
  ok('① 준비도 0%', c.pct === 0, String(c.pct))
  ok('① 네 갈래 모두 「아직 기록이 없어요」', c.areas.every((a) => a.state === 'none' && a.pct === 0), c.areas.map((a) => `${a.label}=${a.pct}`).join(' '))
  ok('① 갈래마다 무엇이 모자란지 말한다', c.areas.every((a) => /부족해요/.test(a.say)), c.areas[0].say)
  //  ⚠ 할 수 있는 일이 없으면 아무 말도 만들어 내지 않습니다 — 오늘 일정도
  //    주문도 미수금도 없으면 후보는 「포털」 하나뿐입니다.
  const ms = K.missionCandidates(base({}), c, { role: 'admin', today: TODAY })
  ok('① 오늘 대상이 없으면 후보를 지어내지 않는다 (포털 안내 1개만)', ms.length === 1 && ms[0].key === 'portal-request', ms.map((m) => m.key).join(','))
}

// ── ② 업무만 충분한 상태 ───────────────────────────────────────────────────
console.log('── ② 업무 AX 만 충분한 상태 ──')
{
  //  30건 · 14일 · 병원 2곳 · 커버리지 100%
  const events = []
  const schedules = []
  for (let i = 0; i < 30; i += 1) {
    const ago = 1 + (i % 15)
    events.push(ev(i, { ago, clientId: i % 2 ? 'c1' : 'c2', scheduleId: `s${i}` }))
    schedules.push(sched(i, { ago, clientId: i % 2 ? 'c1' : 'c2', driverName: i % 2 ? '김기사' : '박기사' }))
  }
  const d = base({ events, schedules })
  const c = cov(d)
  const w = areaOf(c, 'work')
  ok('② 업무 활용 100%', w.pct === 100 && w.state === 'enough', `${w.pct} ${w.state}`)
  ok('② 「충분히 쌓였어요」', w.say === '충분히 쌓였어요', w.say)
  //  ⚠ 같은 완료 방문 기록은 업무·확장 두 갈래에 함께 들어갑니다 — 따로 만든
  //    숫자가 아니라 같은 기록을 두 질문으로 읽는 것입니다.
  ok('② 같은 기록으로 운영 확장도 함께 찬다 (따로 만든 숫자가 아님)', areaOf(c, 'capacity').pct === 100, String(areaOf(c, 'capacity').pct))
  ok('② 주문·포털 기록이 없는 두 갈래는 그대로 0', areaOf(c, 'sales').pct === 0 && areaOf(c, 'customer').pct === 0)
  //  ⚠ 한 갈래가 다 찼다고 전체가 다 찬 것이 아닙니다 — 네 문장은 같은 무게입니다.
  ok('② 전체 준비도는 네 갈래 평균이라 100 이 아니다', c.pct < 100 && c.pct > 0, String(c.pct))
  //  업무가 다 찬 뒤에는 업무 미션의 우선순위가 뒤로 갑니다.
  const ms = K.missionCandidates(d, c, { role: 'admin', today: TODAY })
  const work = ms.find((m) => m.area === 'work')
  ok('② 다 찬 갈래의 일은 후보에서 빠지거나 뒤로 간다', !work || work.priority < (ms[0]?.priority ?? 0), work ? String(work.priority) : '없음')
}

// ── ③④ 포털 ───────────────────────────────────────────────────────────────
console.log('── ③④ 병원 직접사용 ──')
{
  const none = cov(base({}))
  ok('③ 포털 기록이 하나도 없으면 0% · 「아직 기록이 없어요」', areaOf(none, 'customer').pct === 0 && areaOf(none, 'customer').state === 'none')
  ok('③ 「병원이 직접 올린 요청·주문」 항목은 0 이고 못 센 것이 아니다', itemOf(none, 'customer', 'portalUse').have === 0)

  const one = cov(base({ requests: [req(1)] }))
  ok('④ 포털 1건이면 1/5 가 찬다', itemOf(one, 'customer', 'portalUse').have === 1 && itemOf(one, 'customer', 'portalUse').need === 5)
  ok('④ 포털을 쓴 병원 1곳', itemOf(one, 'customer', 'portalClients').have === 1)
  ok('④ 1건으로는 「기록이 더 필요해요」', areaOf(one, 'customer').state === 'low', areaOf(one, 'customer').state)

  //  ⚠ 직원이 대신 접수한 것은 병원 직접사용이 아닙니다.
  const staff = cov(base({ requests: [req(1, { source: 'staff' }), req(2, { source: 'staff' })] }))
  ok('④ **직원이 대신 접수한 요청은 병원 직접사용으로 세지 않는다**', itemOf(staff, 'customer', 'portalUse').have === 0, String(itemOf(staff, 'customer', 'portalUse').have))
}

// ── ⑤⑥ 수거 완료 · 당일 입력 ─────────────────────────────────────────────
console.log('── ⑤⑥ 수거 완료 · 당일 입력 ──')
{
  const d = base({ events: [ev(1, { ago: 1 })], schedules: [sched(1, { ago: 1 })] })
  const c = cov(d)
  ok('⑤ 현장 입력 1건이 잡힌다', itemOf(c, 'work', 'fieldInputs').have === 1)
  ok('⑤ 입력이 끝난 수거 1건 (당일 입력률의 분모)', itemOf(c, 'work', 'entered').have === 1)
  ok('⑤ 다녀온 일정을 입력한 비율 100%', itemOf(c, 'work', 'enteredRate').have === 100)
  ok('⑤ 완료한 방문 1건 (운영 확장)', itemOf(c, 'capacity', 'visits').have === 1)

  //  시연·연습·취소는 세지 않습니다.
  const dirty = base({
    events: [ev(1, { ago: 1, demoSessionId: 'demo' }), ev(2, { ago: 1, reverted: true }), ev(3, { ago: 70 })],
    schedules: [sched(1, { ago: 1, origin: 'demo' }), sched(3, { ago: 70 })],
  })
  ok('⑤ 시연·취소·실증 시작 전 연습은 현장 입력으로 안 센다', itemOf(cov(dirty), 'work', 'fieldInputs').have === 0, String(itemOf(cov(dirty), 'work', 'fieldInputs').have))

  //  ⑥ 다녀왔는데 입력이 빠진 일정 → 채우기 미션
  const gap = base({ schedules: [sched(9, { ago: 2 })], events: [] })
  const missing = K.schedulesMissingEntry(gap, PERIOD)
  ok('⑥ 완료 표시만 있고 입력이 없는 일정을 찾아낸다', missing.length === 1 && missing[0].id === 's9', JSON.stringify(missing.map((s) => s.id)))
  const ms = K.missionCandidates(gap, cov(gap), { role: 'admin', today: TODAY })
  ok('⑥ 그 일정이 「입력이 빠진 방문」 미션이 된다', ms.some((m) => m.key === 'catch-up-entry' && m.targetId === 's9'), ms.map((m) => m.key).join(','))
  //  이관(엑셀에서 옮긴) 일정은 입력이 없는 것이 정상입니다 — 미션으로 내지 않습니다.
  const migrated = base({ schedules: [sched(9, { ago: 2, origin: 'migrated' })] })
  ok('⑥ **이관된 과거 실적은 「입력이 빠졌다」고 하지 않는다**', K.schedulesMissingEntry(migrated, PERIOD).length === 0)
}

// ── ⑦⑧⑨⑩ 매출 네 단계 ────────────────────────────────────────────────────
console.log('── ⑦⑧⑨⑩ 주문 → 전달 → 청구 → 입금 ──')
{
  const ordered = base({ productOrders: [order(1)] })
  const c1 = cov(ordered)
  ok('⑦ 주문 1건은 「주문」 칸에만 들어간다', itemOf(c1, 'sales', 'orders').have === 1)
  ok('⑦ **주문은 아직 전달이 아니다 (전달 0)**', itemOf(c1, 'sales', 'delivered').have === 0)
  ok('⑦ 청구·입금도 0', itemOf(c1, 'sales', 'billed').have === 0 && itemOf(c1, 'sales', 'paid').have === 0)

  const delivered = base({ productOrders: [order(1, { status: '전달완료', deliveredAt: `${daysAgo(2)}T05:00:00Z` })] })
  const c2 = cov(delivered)
  ok('⑧ 전달 완료가 되면 전달 칸이 1', itemOf(c2, 'sales', 'delivered').have === 1)
  ok('⑧ **전달은 아직 입금이 아니다 (입금 0)**', itemOf(c2, 'sales', 'paid').have === 0)

  const billedOrder = order(1, { status: '전달완료', deliveredAt: `${daysAgo(2)}T05:00:00Z` })
  const billed = base({
    productOrders: [billedOrder],
    payments: [{ id: 'pay1', clientId: 'c1', billingMonth: TODAY.slice(0, 7), amount: 30000, status: '미입금', method: '계좌이체', paidAt: null, memo: '', snapshot: { orderIds: ['o1'] }, canceledAt: null }],
  })
  const c3 = cov(billed)
  ok('⑨ 확정 청구에 담기면 청구 칸이 1', itemOf(c3, 'sales', 'billed').have === 1)
  ok('⑨ **청구 확정은 아직 입금이 아니다**', itemOf(c3, 'sales', 'paid').have === 0)

  const paid = base({
    productOrders: [billedOrder],
    payments: [{ id: 'pay1', clientId: 'c1', billingMonth: TODAY.slice(0, 7), amount: 30000, status: '입금완료', method: '계좌이체', paidAt: `${daysAgo(1)}T02:00:00Z`, memo: '', snapshot: { orderIds: ['o1'] }, canceledAt: null }],
  })
  ok('⑩ 입금까지 끝나야 입금 칸이 1', itemOf(cov(paid), 'sales', 'paid').have === 1)

  //  미션 — 전달 전 주문이 있으면 전달 미션, 미입금 청구가 있으면 입금 미션
  const ms = K.missionCandidates(billed, c3, { role: 'admin', today: TODAY })
  ok('⑦ 전달 안 된 주문이 없으면 전달 미션도 없다', !ms.some((m) => m.key === 'order-deliver'))
  ok('⑨ 미입금 청구가 있으면 입금 맞추기 미션이 뜬다', ms.some((m) => m.key === 'payment-match' && m.targetId === 'pay1'), ms.map((m) => m.key).join(','))
  const ms2 = K.missionCandidates(ordered, c1, { role: 'admin', today: TODAY })
  ok('⑦ 전달 전 주문이 있으면 전달 미션이 뜬다', ms2.some((m) => m.key === 'order-deliver' && m.targetId === 'o1'))
  //  ⚠ 취소한 주문으로 「전달하세요」라고 하면 안 됩니다.
  //    서버는 상태 '취소' 와 취소 시각을 **함께** 적습니다
  //    (RUN_34 set_product_order_status). 둘 다 보고 거릅니다.
  const canceled = base({ productOrders: [order(1, { status: '취소', canceledAt: `${daysAgo(1)}T01:00:00Z` })] })
  ok('⑦ 취소한 주문은 전달 미션이 되지 않는다', !K.missionCandidates(canceled, cov(canceled), { role: 'admin', today: TODAY }).some((m) => m.key === 'order-deliver'))
  ok('⑦ 취소한 주문은 준비도 주문 칸에도 안 들어간다', itemOf(cov(canceled), 'sales', 'orders').have === 0, String(itemOf(cov(canceled), 'sales', 'orders').have))
  //  현장 담당자에게는 돈·주문 미션이 가지 않습니다 (열리지 않는 화면이라 막다른 길입니다).
  ok('⑨ 현장 계정에는 주문·입금 미션이 안 간다', !K.missionCandidates(billed, c3, { role: 'field', today: TODAY }).some((m) => m.area === 'sales'))
}

// ── ⑪⑫ 발행과 확인 — 「완료 단추」는 없습니다 ─────────────────────────────
console.log('── ⑪⑫ 발행 뒤 실제 업무가 있었는가 ──')
{
  const issuedAt = `${TODAY}T01:00:00.000Z`
  //  ⑪ 발행만 하고 아무것도 안 한 경우
  const nothing = base({ schedules: [sched(1, { ago: 0, status: '예정', completedAt: null, actualAmount: null })] })
  const v1 = K.verifyMission({ key: 'collect-today', targetId: null }, nothing, issuedAt, TODAY)
  ok('⑪ **발행만 하고 업무를 안 하면 확인되지 않는다**', v1.verified === false && v1.at === null)

  //  ⑫ 발행 뒤 실제 수거 입력이 생긴 경우 (오늘 다녀오고 오늘 입력)
  const did = base({
    schedules: [sched(1, { ago: 0 })],
    events: [ev(1, { ago: 0, at: `${TODAY}T09:00:00.000Z`, scheduleId: 's1' })],
  })
  const v2 = K.verifyMission({ key: 'collect-today', targetId: null }, did, issuedAt, TODAY)
  ok('⑫ 실제 수거 입력이 생기면 확인된다', v2.verified === true && /수거 완료/.test(v2.what), JSON.stringify(v2))
  ok('⑫ 무엇을 보고 확인했는지 사람 말로 적는다', /가나요양병원/.test(v2.what), v2.what)

  //  ⚠ 발행 **전에** 있던 기록으로는 확인되지 않습니다 — 예전 기록이 오늘 한
  //    일처럼 세면 안 됩니다.
  const older = base({
    schedules: [sched(1, { ago: 0 })],
    events: [ev(1, { ago: 0, at: `${TODAY}T00:30:00.000Z`, scheduleId: 's1' })],
  })
  ok('⑫ **발행 전에 있던 기록으로는 확인되지 않는다**', K.verifyMission({ key: 'collect-today', targetId: null }, older, issuedAt, TODAY).verified === false)

  //  ⚠ 시각은 **글자가 아니라 실제 시각**으로 견줍니다.
  //
  //    한국 자정 = 2026-09-12T00:00:00+09:00 = UTC 2026-09-11T15:00Z
  //    한국 01시에 들어온 입금 = UTC 2026-09-11T16:00Z  ← 자정보다 **한 시간 뒤**
  //
  //    글자끼리 견주면 '2026-09-11T16...' < '2026-09-12T00...' 이라 **어제 것으로
  //    밀려납니다.** 새벽에 일한 것이 통째로 안 세는 것입니다.
  const kstMidnight = '2026-09-12T00:00:00+09:00'
  const paidDawn = base({ payments: [{ id: 'pay1', clientId: 'c1', billingMonth: '2026-09', amount: 30000, status: '입금완료', method: '계좌이체', paidAt: '2026-09-11T16:00:00Z', memo: '', canceledAt: null }] })
  ok('⑫ **한국 새벽 기록도 자정 뒤로 센다 (글자 비교가 아니라 실제 시각)**',
    K.verifyMission({ key: 'payment-match', targetId: 'pay1' }, paidDawn, kstMidnight, TODAY).verified === true)
  //  반대로 자정 **전**(한국 23시 = UTC 14시)은 오늘 것이 아닙니다.
  const paidBefore = base({ payments: [{ id: 'pay1', clientId: 'c1', billingMonth: '2026-09', amount: 30000, status: '입금완료', method: '계좌이체', paidAt: '2026-09-11T14:00:00Z', memo: '', canceledAt: null }] })
  ok('⑫ 자정 전 기록은 오늘 것으로 세지 않는다',
    K.verifyMission({ key: 'payment-match', targetId: 'pay1' }, paidBefore, kstMidnight, TODAY).verified === false)
  //  시각을 읽을 수 없으면 확인하지 않습니다 — 「모르면 안 한 것」입니다.
  const broken = base({ payments: [{ id: 'pay1', clientId: 'c1', billingMonth: '2026-09', amount: 30000, status: '입금완료', method: '계좌이체', paidAt: '알 수 없음', memo: '', canceledAt: null }] })
  ok('⑫ 시각을 읽을 수 없으면 확인하지 않는다', K.verifyMission({ key: 'payment-match', targetId: 'pay1' }, broken, kstMidnight, TODAY).verified === false)

  //  포털 — 직원이 대신 넣은 것으로는 확인되지 않습니다.
  const staffReq = base({ requests: [req(1, { source: 'staff', createdAt: `${TODAY}T05:00:00.000Z` })] })
  ok('⑫ **직원이 대신 접수한 요청으로는 포털 미션이 확인되지 않는다**', K.verifyMission({ key: 'portal-request', targetId: null }, staffReq, issuedAt, TODAY).verified === false)
  const portalReq = base({ requests: [req(1, { source: 'portal', createdAt: `${TODAY}T05:00:00.000Z` })] })
  ok('⑫ 병원이 직접 올리면 확인된다', K.verifyMission({ key: 'portal-request', targetId: null }, portalReq, issuedAt, TODAY).verified === true)

  //  전달·입금
  const deliv = base({ productOrders: [order(1, { status: '전달완료', deliveredAt: `${TODAY}T06:00:00.000Z` })] })
  ok('⑫ 주문 전달이 실제로 기록되면 확인된다', K.verifyMission({ key: 'order-deliver', targetId: 'o1' }, deliv, issuedAt, TODAY).verified === true)
  ok('⑫ 다른 주문이 전달돼도 그 주문이 아니면 확인 안 함', K.verifyMission({ key: 'order-deliver', targetId: 'o-other' }, deliv, issuedAt, TODAY).verified === false)
  const pay = base({ payments: [{ id: 'pay1', clientId: 'c1', billingMonth: TODAY.slice(0, 7), amount: 30000, status: '입금완료', method: '계좌이체', paidAt: `${TODAY}T07:00:00.000Z`, memo: '', canceledAt: null }] })
  ok('⑫ 입금이 실제로 기록되면 확인된다', K.verifyMission({ key: 'payment-match', targetId: 'pay1' }, pay, issuedAt, TODAY).verified === true)

  //  거래처 정보 — 비어 있던 값이 채워졌는가 (기록의 상태 변화)
  const empty = base({ clients: [{ id: 'c1', name: '가나요양병원', isDemoGenerated: false, address: '', phone: '' }] })
  ok('⑫ 주소·전화가 비어 있으면 확인 안 됨', K.verifyMission({ key: 'client-info', targetId: 'c1' }, empty, issuedAt, TODAY).verified === false)
  ok('⑫ 채워지면 확인됨', K.verifyMission({ key: 'client-info', targetId: 'c1' }, base({}), issuedAt, TODAY).verified === true)

  //  ⚠ 오늘 할 일을 **다 하고 나면 후보에서 사라집니다** (오늘 갈 곳이
  //    없어지니까). 그때 카드까지 없어지면 「확인했어요」를 볼 자리가 없습니다.
  //    발행된 일은 남습니다.
  const gone = base({
    schedules: [sched(1, { ago: 0 })], // 오늘 것을 이미 다 다녀옴 → 후보 없음
    events: [ev(1, { ago: 0, at: `${TODAY}T09:00:00.000Z`, scheduleId: 's1' })],
  })
  const issuedToday = [{ id: 'm1', missionKey: 'collect-today', area: 'work', issuedOn: TODAY, issuedAt, issuedName: '대표', issuedRole: 'admin', targetId: null, verifiedAt: null, verifiedWhat: '' }]
  ok('⑫ 다 하고 나면 후보에서는 빠진다', !K.missionCandidates(gone, cov(gone), { role: 'admin', today: TODAY }).some((m) => m.key === 'collect-today'))
  const kept = K.coachMissions(gone, cov(gone), { role: 'admin', today: TODAY, issued: issuedToday })
  ok('⑫ **그래도 발행된 일은 「확인했어요」로 남는다**', kept.done.some((m) => m.key === 'collect-today'), JSON.stringify(kept.done.map((m) => m.key)))
  ok('⑫ 확인된 일은 오늘 할 일 3칸을 차지하지 않는다', !kept.todo.some((m) => m.key === 'collect-today'))

  //  ⚠ 이 검사의 핵심 — 발행 이력에 verified_at 을 적어 두어도 **화면은
  //    실제 기록으로 다시 확인**합니다. 기록이 없으면 확인되지 않습니다.
  const issued = [{ id: 'm1', missionKey: 'collect-today', area: 'work', issuedOn: TODAY, issuedAt, issuedName: '대표', issuedRole: 'admin', targetId: null, verifiedAt: `${TODAY}T10:00:00.000Z`, verifiedWhat: '거짓으로 적어 둔 값' }]
  const r = K.coachMissions(nothing, cov(nothing), { role: 'admin', today: TODAY, issued })
  const card = [...r.todo, ...r.done].find((m) => m.key === 'collect-today')
  ok('⑫ **이력에 확인됨이라고 적혀 있어도 실제 기록이 없으면 확인되지 않는다**', !!card && card.status !== 'verified', card ? card.status : '카드 없음')
}

// ── ⑬ 같은 일이 되풀이될 때 ────────────────────────────────────────────────
console.log('── ⑬ 같은 일만 되풀이되지 않게 ──')
{
  const d = base({
    schedules: [sched(1, { ago: 0, status: '예정', completedAt: null, actualAmount: null })],
    productOrders: [order(1)],
  })
  const c = cov(d)
  const plain = K.coachMissions(d, c, { role: 'admin', today: TODAY, issued: [] })
  const before = plain.todo.find((m) => m.key === 'collect-today')?.priority ?? 0
  const stale = [1, 2, 3].map((n) => ({
    id: `m${n}`, missionKey: 'collect-today', area: 'work', issuedOn: daysAgo(n), issuedAt: `${daysAgo(n)}T01:00:00.000Z`,
    issuedName: '대표', issuedRole: 'admin', targetId: null, verifiedAt: null, verifiedWhat: '',
  }))
  const after = K.coachMissions(d, c, { role: 'admin', today: TODAY, issued: stale }).todo.find((m) => m.key === 'collect-today')?.priority ?? 0
  ok('⑬ 며칠째 못 채운 일은 우선순위가 내려간다', after < before && after > 0, `${before} → ${after}`)
  ok('⑬ 그래도 목록에서 사라지지는 않는다 (해야 할 일이라서)', after > 0)
  ok('⑬ 한 번에 최대 3개', K.coachMissions(d, c, { role: 'admin', today: TODAY, issued: [] }).todo.length <= 3)
  ok('⑬ 발행 이력 표가 없으면 「없다」고 말한다 (0 건이라고 하지 않음)', K.coachMissions(d, c, { role: 'admin', today: TODAY, issued: undefined }).historyAvailable === false)
}

// ── ⑭ 리포트 ───────────────────────────────────────────────────────────────
console.log('── ⑭ 7일 / 14일 리포트 ──')
{
  const events = []
  const schedules = []
  for (let i = 0; i < 10; i += 1) {
    const ago = i < 5 ? 1 + i : 20 + i // 절반은 최근 7일 안, 절반은 훨씬 전
    events.push(ev(i, { ago, scheduleId: `s${i}` }))
    schedules.push(sched(i, { ago }))
  }
  const d = base({ events, schedules, requests: [req(1, { ago: 2 })] })
  const r7 = K.coachReport(d, 7, { today: TODAY, issued: [] })
  ok('⑭ 최근 7일 기간이 오늘까지 7일', r7.period.to === TODAY && r7.period.from === daysAgo(6), `${r7.period.from}~${r7.period.to}`)
  const visits = r7.lines.find((l) => l.label === '수거 완료')
  ok('⑭ 최근 7일 수거 완료는 5건 (그 전 것은 안 셈)', visits.value === 5, String(visits?.value))
  ok('⑭ 병원이 직접 올린 요청 1건', r7.lines.find((l) => l.label === '병원이 직접 올린 요청·주문').value === 1)
  ok('⑭ 준비도 변화가 「전 → 지금」으로 나온다', r7.pctBefore != null && r7.pctNow >= r7.pctBefore, `${r7.pctBefore} → ${r7.pctNow}`)
  ok('⑭ 이번에 새로 확인된 것을 말한다', r7.gained.length > 0, r7.gained.slice(0, 2).join(' / '))
  ok('⑭ 아직 비어 있는 것을 말한다', r7.missing.some((m) => /매출 증거/.test(m)), r7.missing.slice(0, 2).join(' / '))
  ok('⑭ 다음에 먼저 채울 갈래 2개를 짚는다', r7.next.length === 2, r7.next.join(' / '))
  ok('⑭ 발행 이력 표가 없으면 완료 Mission 을 0 이 아니라 「모름」으로', K.coachReport(d, 7, { today: TODAY, issued: undefined }).missionsVerified === null)
  ok('⑭ 이력이 있으면 발행·확인 건수를 센다', K.coachReport(d, 7, { today: TODAY, issued: [] }).missionsIssued === 0)
  //  ⚠ 확인 메모가 적히기 전에도 「위 카드는 ✓ 인데 아래 리포트는 0건」이 되면 안 됩니다.
  const issuedToday = [{ id: 'r1', missionKey: 'collect-today', area: 'work', issuedOn: TODAY, issuedAt: `${TODAY}T01:00:00.000Z`, issuedName: '대표', issuedRole: 'admin', targetId: null, verifiedAt: null, verifiedWhat: '' }]
  ok('⑭ 확인 메모가 아직 없어도 오늘 확인된 일은 리포트에서도 확인으로 센다',
    K.coachReport(d, 7, { today: TODAY, issued: issuedToday, verifiedTodayKeys: ['collect-today'] }).missionsVerified === 1)
  ok('⑭ 화면이 확인하지 않은 일은 그대로 0', K.coachReport(d, 7, { today: TODAY, issued: issuedToday, verifiedTodayKeys: [] }).missionsVerified === 0)

  const r14 = K.coachReport(d, 14, { today: TODAY, issued: [] })
  ok('⑭ 14일은 14일로 센다', r14.days === 14 && r14.period.from === daysAgo(13))

  //  실증 시작일보다 앞이면 「기록 없음」 — 0 이라고 적지 않습니다.
  const future = base({ experiment: { startDate: daysAgo(-5) } })
  const rf = K.coachReport(future, 7, { today: TODAY, issued: [] })
  ok('⑭ **실증 시작 전 기간은 0 이 아니라 기록 없음**', rf.beforeStart === true && rf.lines.length === 0)
}

// ── ⑮ 준비도는 성과가 아니다 / 목표값의 출처 ───────────────────────────────
console.log('── ⑮ 목표값은 지어내지 않는다 ──')
{
  const c = cov(base({}))
  const w = areaOf(c, 'work')
  ok('⑮ 현장 입력 목표는 BREADTH_RULE.samples 그대로', w.items.find((i) => i.key === 'fieldInputs').need === E.BREADTH_RULE.samples)
  ok('⑮ 입력한 날 목표는 BREADTH_RULE.operatingDays 그대로', w.items.find((i) => i.key === 'inputDays').need === E.BREADTH_RULE.operatingDays)
  ok('⑮ 커버리지 목표는 BREADTH_RULE.coveragePct 그대로', w.items.find((i) => i.key === 'enteredRate').need === E.BREADTH_RULE.coveragePct)
  ok('⑮ 기사 목표는 BREADTH_RULE.drivers 그대로', areaOf(c, 'capacity').items.find((i) => i.key === 'drivers').need === E.BREADTH_RULE.drivers)
  ok('⑮ 표본 목표는 AX_MIN_SAMPLES 그대로', areaOf(c, 'customer').items.find((i) => i.key === 'portalUse').need === A.AX_MIN_SAMPLES)
  ok('⑮ 항목마다 어디서 온 숫자인지 적혀 있다', c.areas.every((a) => a.items.every((i) => i.from.length > 0)))
  //  못 센 것과 0 을 가릅니다.
  const noTable = cov(base({ dayCloses: undefined }))
  ok('⑮ 못 센 항목 수를 따로 셉니다', typeof noTable.uncounted === 'number')
}

console.log('── ⑯ 같은 계산을 두 번 하지 않는다 ──')
{
  const d = base({ events: [ev(1)], schedules: [sched(1)] })
  const a = K.coverageOf(d, PERIOD)
  const b = K.coverageOf(d, PERIOD)
  ok('⑯ 같은 자료·같은 기간이면 셈을 다시 하지 않는다', a === b)
  ok('⑯ 기간이 다르면 다시 센다', K.coverageOf(d, { from: START, to: daysAgo(30) }) !== a)
  //  ⚠ 자료를 다시 읽으면 새 객체라 반드시 다시 셉니다 — 묵은 값이 남으면 안 됩니다.
  const d2 = base({ events: [ev(1), ev(2)], schedules: [sched(1), sched(2)] })
  const c = K.coverageOf(d2, PERIOD)
  ok('⑯ 자료가 바뀌면 새로 센다', c !== a && c.areas[0].items[0].have === 2, String(c.areas[0].items[0].have))
  //  증거를 밖에서 넘기면 그대로 씁니다 (기간과 어긋난 값을 담아 두지 않게)
  const evd = A.axEvidence(d, PERIOD)
  ok('⑯ 증거를 넘겨받으면 담아 두지 않고 그대로 센다', K.coverageOf(d, PERIOD, evd) !== K.coverageOf(d, PERIOD, evd))
}

console.log(`\ncheck_axcoach OK=${pass} FAIL=${fail}`)
process.exit(fail ? 1 : 0)
