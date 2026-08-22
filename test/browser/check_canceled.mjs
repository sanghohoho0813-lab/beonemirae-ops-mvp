import { execFileSync } from 'node:child_process'

//  무른 방문이 **모든 자리에서** 사라지는가 (0059).
//
//   이번 판의 제일 큰 위험은 함수가 아니라 **빠뜨림**입니다. 지금까지
//   「완료가 아니면 아직 안 간 것」으로 보던 자리가 열두 곳인데, 한 곳만
//   빠뜨리면 —
//
//    · 무른 방문이 배차에 남아 **기사가 나갑니다**
//    · 영원히 지워지지 않는 「수거 입력 밀림」이 됩니다 (알림이 죽습니다)
//    · 「다음 예정 수거」가 안 갈 날짜를 가리킵니다
//
//   그래서 화면별로 세지 않고 **lib 전체를 한 번에** 훑습니다. 같은 자료를
//   무르기 전/후로 두 번 넣어, 무른 뒤에 사라져야 할 곳이 실제로 사라지는지
//   봅니다.

const D = '/home/user/beonemirae-ops-mvp/src/lib'
const O = (process.env.TEST_OUT ?? '/tmp')
const bundle = (name) => {
  execFileSync('/home/user/beonemirae-ops-mvp/node_modules/.bin/esbuild',
    [`${D}/${name}.ts`, '--bundle', '--format=esm', '--platform=neutral', `--outfile=${O}/.${name}.mjs`],
    { stdio: 'pipe' })
  return import(`${O}/.${name}.mjs?v=${process.pid}`)
}
const SEL = await bundle('selectors')
const DL = await bundle('deadlines')
const MP = await bundle('monthProgress')
const OPS = await bundle('ops')
const PORTAL = await bundle('portal')
const GAPS = await bundle('setupGaps')
const UR = await bundle('urgentRisk')
const VP = await bundle('vehiclePlan')
const HOL = await bundle('holidays')
const PLAN = await bundle('schedulePlan')
const LIVE = await bundle('scheduleLive')

const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  if (!c) process.exitCode = 1
}

const TODAY = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
const day = (n) => {
  const t = new Date(`${TODAY}T00:00:00Z`)
  t.setUTCDate(t.getUTCDate() + n)
  return t.toISOString().slice(0, 10)
}
const MONTH = TODAY.slice(0, 7)

const CA = 'c1'
const client = {
  id: CA, name: '가나요양병원', type: '병원', address: '', manager: '', phone: '',
  collectionCycle: '주 1회', collectsMedicalWaste: true, collectsDiaper: false,
  storageSize: '보통', note: '', active: true,
  pricing: { medical: { sale: 1000, cost: 600 } },
  paymentDueDay: 20, paymentTerms: '', vatMode: '포함', bizNo: '',
  contractStart: null, contractEnd: null, createdAt: '', updatedAt: '',
}
const sched = (id, d, over = {}) => ({
  id, date: d, clientId: CA, wasteType: '의료폐기물', vehicleId: '',
  scheduledTime: '09:00', status: '예정', expectedAmount: 100, actualAmount: null,
  completedAt: null, memo: '', origin: 'system', canceledAt: null, cancelReason: '', ...over,
})
const doneOn = (id, d) => sched(id, d, {
  status: '완료', actualAmount: 100, completedAt: `${d}T10:00:00Z`, vehicleId: 'v1', origin: 'field',
})

const vehicles = [{ id: 'v1', name: '5506호', wasteType: '의료폐기물', tonnage: 1,
  nominalCapacity: 1000, expectedCapacity: 660, driver: '오대성', active: true }]
const holidays = [{ day: day(2), name: '테스트 공휴일' }]

//  ── 자료 ──────────────────────────────────────────────────────────────────
//   · 지난 12주 주 1회 완료 (간격 7일)
//   · 지난달 예정 한 건 (= 「수거 입력 밀림」 · 이번 달은 안 훑습니다)
//   · 오늘 예정 한 건
//   · 이틀 뒤(휴무일) 예정 한 건
//   · 열흘 뒤 예정 한 건 (= 다음 예정 수거)
const history = Array.from({ length: 12 }, (_, i) => doneOn(`h${i}`, day(-7 * (12 - i))))
const pending = [
  sched('late', day(-40)),   // 지난달 — 밀린 마감은 이번 달을 안 훑습니다
  sched('today', TODAY),
  sched('hol', day(2), { wasteType: '일회용기저귀' }),
  sched('next', day(10)),
]
const requests = [
  { id: 'r1', clientId: CA, clientName: '', kind: '긴급수거', content: '', desiredDate: null,
    urgent: true, status: '접수', source: 'portal', requesterName: '', reply: '',
    handledBy: null, handledAt: null, createdAt: `${day(-20)}T09:00:00Z` },
  { id: 'r2', clientId: CA, clientName: '', kind: '추가수거', content: '', desiredDate: null,
    urgent: false, status: '접수', source: 'portal', requesterName: '', reply: '',
    handledBy: null, handledAt: null, createdAt: `${day(-5)}T09:00:00Z` },
]

const base = {
  clients: [client], vehicles, materials: [], payments: [], officeStock: {},
  notes: [], events: [], productOrders: [], operatingCosts: [], holidays, requests,
}
const before = { ...base, schedules: [...history, ...pending] }
//  같은 자료에서 **네 건을 전부 무릅니다.**
const after = {
  ...base,
  schedules: [
    ...history,
    ...pending.map((s) => ({ ...s, canceledAt: `${TODAY}T01:00:00Z`, cancelReason: '병원 요청' })),
  ],
}

// ── 0. 판단이 한 곳에 있는가 ────────────────────────────────────────────────
{
  const live = sched('x', TODAY)
  const dead = { ...live, canceledAt: `${TODAY}T01:00:00Z` }
  ok(LIVE.isPending(live) === true, '안 무른 예정은 「아직 안 간 방문」')
  ok(LIVE.isPending(dead) === false, '**무른 것은 「아직 안 간 방문」이 아님**')
  ok(LIVE.isCanceled(dead) === true && LIVE.isCanceled(live) === false, '무름 판단')
  ok(LIVE.isDone(doneOn('d', TODAY)) === true, '완료 판단')
  //  옛 서버·옛 자료에는 이 칸이 없습니다 — 없으면 「안 무른 것」입니다.
  const old = { status: '예정' }
  ok(LIVE.isPending(old) === true, '**칸이 없던 옛 자료는 지금까지처럼 동작**')
}

// ── 1. 오늘 일정 ────────────────────────────────────────────────────────────
{
  ok(SEL.schedulesOn(before, TODAY).length === 1, '무르기 전 — 오늘 일정 1건')
  ok(SEL.schedulesOn(after, TODAY).length === 0,
    '**무른 뒤 — 오늘 일정에서 사라짐** (안 사라지면 기사가 나갑니다)')
}

// ── 2. 밀린 마감 (수거 입력) ────────────────────────────────────────────────
//
//   ⚠ 여기가 제일 조용한 위험입니다. 안 빠지면 **영원히 지워지지 않는
//   빨간 줄**이 되고, 사람은 곧 그 알림을 안 보게 됩니다.
{
  //  ⚠ 「수거」라는 글자로 세면 안 됩니다 — 「청구 확정」 안내에도
  //  「수거 5건이 있는데…」로 들어갑니다. 밀린 **단계 종류**로 셉니다.
  const collect = (d) => d.items.filter((i) => i.kind === 'collect')
  const b = collect(DL.scanDeadlines(before, TODAY))
  const a = collect(DL.scanDeadlines(after, TODAY))
  ok(b.length === 1, '무르기 전 — 수거 입력이 밀린 것으로 잡힘', b[0]?.detail ?? '')
  ok(a.length === 0,
    '**무른 뒤 — 「수거 입력 밀림」에서 빠짐** (안 빠지면 영원히 안 지워집니다)',
    a.map((i) => i.detail).join(' / '))
}

// ── 3. 월 마감 진행상황 ─────────────────────────────────────────────────────
{
  const b = MP.monthProgress(before, MONTH)
  const a = MP.monthProgress(after, MONTH)
  const late = (x) => JSON.stringify(x).match(/"late":(\d+)/)?.[1] ?? '?'
  ok(JSON.stringify(b) !== JSON.stringify(a), '무르기 전후가 다름')
  ok(!/미완료|밀림/.test(JSON.stringify(a).slice(0, 400)) || late(a) === '0',
    '**무른 뒤 — 미수거로 안 셈**', `전 ${late(b)} · 후 ${late(a)}`)
}

// ── 4. 다음 예정 수거 (거래처 화면) ─────────────────────────────────────────
{
  const nb = OPS.nextSchedule(before, CA)
  const na = OPS.nextSchedule(after, CA)
  ok(nb != null, '무르기 전 — 다음 예정 수거가 있음', nb?.date)
  ok(na == null, '**무른 뒤 — 다음 예정 수거가 없음** (안 갈 날짜를 가리키면 안 됩니다)', `${na?.date}`)
}

// ── 5. 병원 포털 (병원이 보는 화면) ─────────────────────────────────────────
{
  const b = PORTAL.portalSummary(before, client)
  const a = PORTAL.portalSummary(after, client)
  //  잡혀 있는 방문이 있으면 그 날짜를 **확정**으로 보여 줍니다.
  ok(b.nextDate === TODAY && b.nextIsEstimate === false,
    '무르기 전 — 병원 화면에 잡힌 방문 날짜', `${b.nextDate}`)
  //  전부 무르면 잡힌 방문이 없으니 수거주기로 **예상**을 보여 줍니다.
  //  ⚠ 무른 날짜를 확정처럼 보여 주면 병원이 그날 기다립니다.
  ok(a.nextIsEstimate === true,
    '**무른 뒤 — 「예상」으로 바뀜** (무른 날짜를 확정처럼 보여 주면 병원이 기다립니다)',
    `${a.nextDate} · 예상=${a.nextIsEstimate}`)
  ok(a.nextTime === null, '무른 방문의 시각도 안 따라옴', `${a.nextTime}`)
}

// ── 6. 채워야 할 값 (앞으로 올 일정) ────────────────────────────────────────
{
  const b = JSON.stringify(GAPS.scanSetupGaps(before, TODAY))
  const a = JSON.stringify(GAPS.scanSetupGaps(after, TODAY))
  ok(b.length > 0 && a.length > 0, '채워야 할 값이 양쪽 다 계산됨')
  ok(!/"upcoming":[1-9]/.test(a) || b !== a,
    '무른 방문을 「앞으로 올 일정」으로 세지 않음', a.slice(0, 80))
}

// ── 7. 긴급 신호 — 「앞으로 잡힌 방문」 ─────────────────────────────────────
//
//   무른 방문을 세면 「다음 방문이 잡혀 있으니 괜찮다」로 잘못 읽습니다.
//   실제로는 아무 방문도 없는데 알림이 안 뜨게 됩니다.
{
  const b = UR.urgentRisks(before, TODAY)
  const a = UR.urgentRisks(after, TODAY)
  ok(b.length === 1 && b[0].noNextVisit === false,
    '무르기 전 — 다음 방문이 잡혀 있음', `${b[0]?.nextVisit}`)
  ok(a.length === 1 && a[0].noNextVisit === true,
    '**무른 뒤 — 「앞으로 잡힌 방문 없음」으로 바뀜**', `${a[0]?.nextVisit}`)
  ok(UR.urgentActionable(b).length === 0 && UR.urgentActionable(a).length === 1,
    '**그래서 지금 손댈 곳으로 올라옴** (이게 안 되면 알림이 죽습니다)')
}

// ── 8. 차량 미배정 (배차) ───────────────────────────────────────────────────
{
  const b = VP.buildAssignment(before, TODAY, day(30))
  const a = VP.buildAssignment(after, TODAY, day(30))
  const rows = (x) => (x?.rows ?? x?.days ?? []).length
  ok(JSON.stringify(b).includes(day(10)), '무르기 전 — 배차 대상에 있음')
  ok(!JSON.stringify(a).includes(day(10)),
    '**무른 뒤 — 배차 대상에서 빠짐** (안 빼면 그 차가 그날 묶입니다)', `${rows(a)}줄`)
}

// ── 9. 휴무일 겹침 ──────────────────────────────────────────────────────────
{
  const b = HOL.holidayClashes(before, TODAY, day(30))
  const a = HOL.holidayClashes(after, TODAY, day(30))
  ok(b.length === 1, '무르기 전 — 휴무일에 잡힌 방문 1건', `${b.length}건`)
  ok(a.length === 0, '**무른 뒤 — 휴무일 경고도 사라짐**', `${a.length}건`)
}

// ── 10. 일정 자동 편성 — 무른 것을 「다녀온 것」으로 세지 않는가 ────────────
{
  const b = PLAN.detectPatterns(before, TODAY)
  const a = PLAN.detectPatterns(after, TODAY)
  //  근거는 **완료된 수거**입니다. 무른 예정은 원래 근거가 아니므로 결과가
  //  같아야 합니다 — 달라지면 예정을 근거로 쓰고 있다는 뜻입니다.
  ok(JSON.stringify(b) === JSON.stringify(a),
    '**편성 근거는 완료 기록뿐** (무른 예정이 근거를 흔들지 않음)')
}

// ── 11. 실적·정산은 한 푼도 안 바뀐다 ───────────────────────────────────────
//
//   무르는 것은 **아직 안 간 방문**입니다. 이미 다녀온 수거의 실적·매출은
//   여기서 한 칸도 움직이면 안 됩니다.
{
  const b = JSON.stringify(SEL.monthlyCollected(before, MONTH))
  const a = JSON.stringify(SEL.monthlyCollected(after, MONTH))
  ok(b === a, '**그 달 수거 실적이 한 칸도 안 바뀜**', a)
  const kg = (x) => x.schedules.filter((s) => s.status === '완료').reduce((t, s) => t + (s.actualAmount ?? 0), 0)
  ok(kg(before) === kg(after) && kg(after) === 1200, '**수거량 합계 그대로**', `${kg(after)}kg`)
}

console.log(`\n총 ${process.exitCode ? '실패 있음' : '실패 0건'}`)
