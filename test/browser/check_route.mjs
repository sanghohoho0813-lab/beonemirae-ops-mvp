import { execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

//  동선 점검 — 요일 쏠림과 「같은 날 묶을 수 있는 곳」 (routeEfficiency.ts)
//
//   이 검사가 지키려는 것은 **아무 근거 없는 제안이 나오지 않는 것**입니다.
//   화면이 「이 병원 목요일로 옮기세요」라고 말하면 이사님이 실제로 옮기고,
//   그 병원에는 폐기물이 하루 더 쌓입니다. 그래서 확인하는 것은
//
//    · 조건 하나라도 못 맞추면 **제안하지 않는가** (그리고 왜 뺐는지 남기는가)
//    · 근거 문장에 **실제 숫자**가 들어가는가
//    · 거리(km)·소요시간을 **지어내지 않는가**
//    · 주소를 못 읽으면 「아마 같은 동네」로 밀어 넣지 않는가

const ROOT = '/home/user/beonemirae-ops-mvp'
const out = []
const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  out.push(c)
  if (!c) process.exitCode = 1
}

//  TS 를 그대로 못 읽으니 번들해서 부릅니다. 화면을 거치지 않고 규칙만
//  직접 찌를 수 있어, 「어느 조건이 막았는지」가 분명해집니다.
const dir = mkdtempSync(join(tmpdir(), 'route-'))
const bundle = join(dir, 'route.mjs')
execFileSync(join(ROOT, 'node_modules/.bin/esbuild'), [
  join(ROOT, 'src/lib/routeEfficiency.ts'),
  '--bundle', '--format=esm', '--platform=neutral', `--outfile=${bundle}`,
], { stdio: 'pipe' })
const R = await import(bundle)

// ── 1. 주소에서 시군구 읽기 ─────────────────────────────────────────────────
{
  const cases = [
    ['경기도 남양주시 오남읍 양지로 47-35', '남양주시', '오남읍'],
    ['서울특별시 강남구 역삼동 123-4', '강남구', '역삼동'],
    ['경기도 성남시 분당구 정자동 1', '성남시 분당구', '정자동'],
    ['남양주시 진접읍 해밀예당1로', '남양주시', '진접읍'],
    ['서울시 송파구 문정동', '송파구', '문정동'],
    //  「광주시」는 두 곳입니다 — 구가 뒤에 오면 광역시, 아니면 경기도 광주시.
    ['광주시 남구 봉선동', '남구', '봉선동'],
    ['경기도 광주시 오포읍', '광주시', '오포읍'],
    ['광주시 오포읍 능평리', '광주시', '오포읍'],
    //  번지만 있고 읍면동이 없으면 시군구까지만.
    ['경기도 남양주시 다산순환로 20', '남양주시', ''],
  ]
  for (const [addr, key, detail] of cases) {
    const r = R.regionOf(addr)
    ok(r?.key === key && r?.detail === detail, `주소를 읽음 — ${addr}`, `${r?.key} · ${r?.detail}`)
  }
  //  「경기도」로 묶으면 남양주와 평택이 한 덩어리가 됩니다.
  ok(R.regionOf('경기도')?.key !== '경기도', '**시도만 있으면 안 묶음** — 경기도 하나로 묶으면 남양주와 평택이 같은 동네가 됩니다',
    JSON.stringify(R.regionOf('경기도')))
  for (const bad of ['', '   ', '주소 없음', '3층 301호']) {
    ok(R.regionOf(bad) === null, `못 읽는 주소는 null — 「${bad}」`, JSON.stringify(R.regionOf(bad)))
  }
}

// ── 시나리오 만들기 ─────────────────────────────────────────────────────────
//   이사님 조사표의 5506호 모양을 씁니다 — 월요일에 몰리고 화요일이 빕니다.
const ASOF = '2026-08-14' // 금요일
const mondays = ['2026-06-01', '2026-06-08', '2026-06-15', '2026-06-22', '2026-06-29', '2026-07-06']
const tuesdays = ['2026-06-02', '2026-06-09', '2026-06-16', '2026-06-23', '2026-06-30', '2026-07-07']

const V = { id: 'v1', name: '5506호', wasteType: '의료폐기물', tonnage: 1, nominalCapacity: 1000, expectedCapacity: 660, driver: '오대성' }
const V2 = { id: 'v2', name: '9188호', wasteType: '사업장기저귀폐기물', tonnage: 1, nominalCapacity: 1000, expectedCapacity: 660, driver: '백광호' }

const mkClient = (id, name, address, storageSize = '보통') => ({
  id, name, type: '병원', address, manager: '', phone: '', collectionCycle: '주 1회',
  collectsMedicalWaste: true, collectsDiaper: false, storageSize, note: '',
  isDemoGenerated: false, active: true,
})
const mkSched = (id, date, clientId, vehicleId, status = '완료') => ({
  id, date, clientId, wasteType: '의료폐기물', vehicleId, scheduledTime: '',
  status, expectedAmount: 50, actualAmount: 50, completedAt: `${date}T09:00:00Z`, memo: '',
})

//  월요일 — 남양주 4곳 + 구리 1곳 = 5곳
//  화요일 — 남양주 1곳                = 1곳
const CLIENTS = [
  mkClient('c1', '가나요양병원', '경기도 남양주시 오남읍 양지로 47-35'),
  mkClient('c2', '다라의원', '경기도 남양주시 진접읍 해밀예당1로 10'),
  mkClient('c3', '마바병원', '경기도 남양주시 화도읍 경춘로 20'),
  mkClient('c4', '사아의원', '경기도 남양주시 별내동 30'),
  mkClient('c5', '자차병원', '경기도 구리시 인창동 40'),
  mkClient('c6', '카타의원', '경기도 남양주시 다산동 50'), // 화요일에 이미 가는 남양주
]
const base = []
let n = 0
for (const d of mondays) for (const c of ['c1', 'c2', 'c3', 'c4', 'c5']) base.push(mkSched(`s${n++}`, d, c, 'v1'))
for (const d of tuesdays) base.push(mkSched(`s${n++}`, d, 'c6', 'v1'))

const mkData = (over = {}) => ({
  clients: CLIENTS, schedules: base, vehicles: [V, V2],
  materials: [], productOrders: [], products: [], ...over,
})

// ── 2. 요일 쏠림을 실제 기록에서 셈 ─────────────────────────────────────────
{
  const sk = R.vehicleSkews(mkData(), ASOF).find((s) => s.vehicleId === 'v1')
  ok(sk.peak?.label === '월', '몰린 요일을 찾음', `${sk.peak?.label} ${sk.peak?.perDay}곳`)
  ok(sk.light?.label === '화', '비어 있는 요일을 찾음', `${sk.light?.label} ${sk.light?.perDay}곳`)
  //  월 5곳 × 6주 = 30건 ÷ 6일 = 5곳/일. **연인원 30 이 아니라 하루 5곳**입니다.
  ok(sk.peak?.perDay === 5, '연인원이 아니라 「하루 몇 곳」으로 셈', `방문 ${sk.peak?.visits}건 · ${sk.peak?.weeks}주 · ${sk.peak?.perDay}곳/일`)
  ok(sk.light?.perDay === 1, '빈 날도 하루 기준', `${sk.light?.perDay}곳/일`)
  ok(sk.gap === 4, '쏠린 정도 = 5 − 1', String(sk.gap))

  //  기록이 없는 차는 「없다」고 말합니다 — 0 으로 두면 「한가하다」로 읽힙니다.
  const empty = R.vehicleSkews(mkData(), ASOF).find((s) => s.vehicleId === 'v2')
  ok(empty.peak === null && /기록이 최근 12주에 없습니다/.test(empty.blocked),
    '**기록 없는 차는 0곳이 아니라 「기록 없음」**', empty.blocked)
}

// ── 3. 제안은 조건을 다 통과한 것만 ─────────────────────────────────────────
{
  const rv = R.reviewRoutes(mkData(), ASOF)
  const s = rv.suggestions
  ok(s.length > 0, '옮길 수 있는 곳을 찾음', `${s.length}곳`)
  //  화요일에 5506호가 가는 남양주는 c6 한 곳. 그래서 남양주 병원만 후보이고
  //  구리시(c5)는 안 됩니다.
  ok(s.every((x) => x.region === '남양주시'), '**옮길 요일에 그 차가 가는 시군구만** 제안', s.map((x) => `${x.clientName}(${x.region})`).join(' · '))
  ok(!s.some((x) => x.clientName === '자차병원'), '구리시는 제안하지 않음 — 화요일에 5506호가 구리에 안 갑니다')
  ok(rv.skipped.some((x) => x.clientName === '자차병원' && /구리시에 안 갑니다/.test(x.reason)),
    '왜 뺐는지 남김', rv.skipped.find((x) => x.clientName === '자차병원')?.reason)

  //  ⑥ 평균까지만 — 월 5 · 화 1 → 평균 3. 두 곳까지만 덜어냅니다.
  ok(s.length <= 2, '**평균 밑으로는 깎지 않음** (월5·화1 → 평균3이라 최대 2곳)', `${s.length}곳 제안`)

  const b = s[0].basis
  for (const piece of ['5506호', '월요일', '화요일', '남양주시', '최근 12주 실제 기록']) {
    ok(b.includes(piece), `근거 문장에 「${piece}」`, b.slice(0, 40))
  }
  ok(/\d/.test(b), '근거에 실제 숫자가 들어감')
  //  거리는 계산할 수 없습니다 — 좌표가 없습니다.
  ok(!/km|분 절감|시간 절감/.test(JSON.stringify(rv)),
    '**km·소요시간을 지어내지 않음** — 거래처 좌표가 없습니다')
}

// ── 4. 보관창고가 작은 곳은 안 옮김 ─────────────────────────────────────────
{
  const small = CLIENTS.map((c) => (c.id === 'c1' ? { ...c, storageSize: '작음' } : c))
  const rv = R.reviewRoutes(mkData({ clients: small }), ASOF)
  ok(!rv.suggestions.some((x) => x.clientId === 'c1'), '**보관창고 작은 곳은 제안하지 않음** — 하루도 더 못 쌓습니다')
  ok(rv.skipped.some((x) => x.clientName === '가나요양병원' && /보관창고가 작아/.test(x.reason)), '이유를 남김')
}

// ── 5. 앞으로 당기는 방향은 제안하지 않음 ───────────────────────────────────
//   목→월로 옮기면 전환되는 주에 간격이 한 번 **길어집니다**. 보관기한이
//   걸리는 쪽이라 자동으로 권하면 안 됩니다.
{
  const thursdays = ['2026-06-04', '2026-06-11', '2026-06-18', '2026-06-25', '2026-07-02', '2026-07-09']
  const flip = []
  let k = 0
  //  목요일에 몰리고 월요일이 빈 모양
  for (const d of thursdays) for (const c of ['c1', 'c2', 'c3', 'c4']) flip.push(mkSched(`f${k++}`, d, c, 'v1'))
  for (const d of mondays) flip.push(mkSched(`f${k++}`, d, 'c6', 'v1'))
  const rv = R.reviewRoutes(mkData({ schedules: flip }), ASOF)
  const sk = R.vehicleSkews(mkData({ schedules: flip }), ASOF).find((s) => s.vehicleId === 'v1')
  ok(sk.peak?.label === '목' && sk.light?.label === '월', '목요일에 몰린 모양을 만듦', `${sk.peak?.label}${sk.peak?.perDay} · ${sk.light?.label}${sk.light?.perDay}`)
  ok(rv.suggestions.length === 0,
    '**앞으로 당기는 이동은 제안하지 않음** — 전환되는 주에 간격이 길어집니다', `${rv.suggestions.length}곳`)
}

// ── 6. 기록이 모자라면 말하지 않음 ──────────────────────────────────────────
{
  //  각 거래처를 두 번씩만 간 기록 — 요일이라고 부를 수 없습니다.
  const thin = []
  let k = 0
  for (const d of mondays.slice(0, 2)) for (const c of ['c1', 'c2', 'c3', 'c4', 'c5']) thin.push(mkSched(`t${k++}`, d, c, 'v1'))
  for (const d of tuesdays.slice(0, 2)) thin.push(mkSched(`t${k++}`, d, 'c6', 'v1'))
  const rv = R.reviewRoutes(mkData({ schedules: thin }), ASOF)
  ok(rv.suggestions.length === 0, '**2번 간 곳은 제안하지 않음** — 그게 그 병원의 요일인지 알 수 없습니다',
    rv.suggestions.map((s) => s.clientName).join(' · '))
  ok(rv.skipped.some((x) => /번밖에 안 가서/.test(x.reason)), '왜 뺐는지 남김',
    rv.skipped[0]?.reason)
}

// ── 7. 주소가 없으면 짐작하지 않음 ──────────────────────────────────────────
{
  const blank = CLIENTS.map((c) => (c.id === 'c1' ? { ...c, address: '' } : c))
  const rv = R.reviewRoutes(mkData({ clients: blank }), ASOF)
  ok(!rv.suggestions.some((x) => x.clientId === 'c1'),
    '**주소를 못 읽으면 제안하지 않음** — 「모르니까 아마 같은 동네」로 밀어 넣으면 엉뚱한 곳을 옮깁니다')
  ok(rv.noAddress === 1, '주소를 못 읽은 곳이 몇 곳인지 셈', String(rv.noAddress))
}

// ── 8. 예정은 아직 간 것이 아님 ─────────────────────────────────────────────
{
  const notYet = base.map((s) => ({ ...s, status: '예정', actualAmount: null, completedAt: null }))
  const rv = R.reviewRoutes(mkData({ schedules: notYet }), ASOF)
  ok(rv.suggestions.length === 0 && rv.company.length === 0,
    '**완료된 수거만 셈** — 예정은 아직 안 간 것입니다')
}

// ── 9. 쏠림이 작으면 건드리지 않음 ──────────────────────────────────────────
{
  //  월 2곳 · 화 1곳 — 이 정도로 사람을 움직이게 하면 안 됩니다.
  const flat = []
  let k = 0
  for (const d of mondays) for (const c of ['c1', 'c2']) flat.push(mkSched(`e${k++}`, d, c, 'v1'))
  for (const d of tuesdays) flat.push(mkSched(`e${k++}`, d, 'c6', 'v1'))
  const rv = R.reviewRoutes(mkData({ schedules: flat }), ASOF)
  ok(rv.suggestions.length === 0, '**차이가 작으면 제안하지 않음** — 월2·화1 정도로 사람을 움직이게 하지 않습니다')
}

// ── 9-b. 자리가 차서 뺀 것도 이유를 남김 ────────────────────────────────────
//   조용히 지우면 「검토했는데 뺀 것」과 「아예 안 본 것」을 구분할 수 없습니다.
{
  const rv = R.reviewRoutes(mkData(), ASOF)
  //  월5·화1 → 평균 3 이라 2곳까지. 후보는 남양주 4곳(c1~c4)이므로 2곳이 남습니다.
  const later = rv.skipped.filter((x) => /이번에는 뺐습니다/.test(x.reason))
  ok(later.length === 2, '**자리가 차서 못 올린 것도 이유를 남김**', later.map((x) => x.clientName).join(' · '))
  ok(/평균이 3곳/.test(later[0]?.reason ?? ''), '이유에 실제 평균이 들어감', later[0]?.reason)
  //  구리시는 「자리」가 아니라 「그날 그 동네를 안 감」으로 빠져야 합니다.
  const guri = rv.skipped.find((x) => x.clientName === '자차병원')
  ok(/구리시에 안 갑니다/.test(guri?.reason ?? ''), '자리와 조건 미달을 구분해서 말함', guri?.reason)
}

// ── 10. 새 봉우리를 만들지 않음 ─────────────────────────────────────────────
//    한쪽을 풀자고 다른 쪽을 지금 최대치보다 높이면 문제를 옮긴 것뿐입니다.
{
  const rv = R.reviewRoutes(mkData(), ASOF)
  const sk = R.vehicleSkews(mkData(), ASOF).find((s) => s.vehicleId === 'v1')
  const ceiling = Math.max(...sk.days.map((d) => d.perDay))
  const worst = Math.max(...rv.suggestions.map((s) => s.afterTo), 0)
  ok(worst <= ceiling, '옮긴 뒤에도 지금 가장 많은 날을 넘지 않음', `옮긴 뒤 ${worst}곳 · 지금 최대 ${ceiling}곳`)
}

console.log('')
console.log(`총 ${out.length}건 · 실패 ${out.filter((v) => !v).length}건`)
