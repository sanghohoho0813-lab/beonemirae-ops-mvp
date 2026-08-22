import { execFileSync } from 'node:child_process'

//  수거 달력 (대표님 요청).
//
//   달력은 **하루씩 어긋나기 제일 쉬운 계산**입니다. 월초가 일요일인 달,
//   31일인 달, 2월, 윤년, 앞뒤 달 채움 — 어느 하나가 틀리면 방문이 엉뚱한
//   칸에 그려지고, 그 화면을 보고 병원에 날짜를 말하게 됩니다.
//
//   확인하는 것
//    · 모든 주가 정확히 7칸 · 첫 칸은 일요일 · 마지막 칸은 토요일
//    · 그 달 날짜가 하나도 빠지지 않고 한 번씩만
//    · 앞뒤 달 채움 칸이 실제로 그 앞뒤 날짜
//    · 윤년 2월 29일
//    · **무른 방문은 안 셈** (그날이 찬 것처럼 보이면 안 됩니다)
//    · 완료/남은 방문을 나눠 셈
//    · 휴무일 이름이 그날에만

const SRC = '/home/user/beonemirae-ops-mvp/src/lib/calendar.ts'
const OUT = `${process.env.TEST_OUT ?? '/tmp'}/.calendar.mjs`
execFileSync('/home/user/beonemirae-ops-mvp/node_modules/.bin/esbuild',
  [SRC, '--bundle', '--format=esm', '--platform=neutral', `--outfile=${OUT}`], { stdio: 'pipe' })
const C = await import(`${OUT}?v=${process.pid}`)

const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  if (!c) process.exitCode = 1
}

const client = (id, name) => ({
  id, name, type: '병원', address: '', manager: '', phone: '',
  collectionCycle: '주 1회', collectsMedicalWaste: true, collectsDiaper: false,
  storageSize: '보통', note: '', active: true, pricing: {},
  paymentDueDay: 20, paymentTerms: '', vatMode: '포함', bizNo: '',
  contractStart: null, contractEnd: null, createdAt: '', updatedAt: '',
})
const sched = (id, cid, date, over = {}) => ({
  id, date, clientId: cid, wasteType: '의료폐기물', vehicleId: '',
  scheduledTime: '09:00', status: '예정', expectedAmount: 100, actualAmount: null,
  completedAt: null, memo: '', origin: 'system', canceledAt: null, cancelReason: '', ...over,
})
const empty = {
  clients: [], vehicles: [], materials: [], payments: [], officeStock: {},
  notes: [], events: [], schedules: [], holidays: [], requests: [],
}

// ── 1. 격자 모양 — 여러 달을 한꺼번에 ───────────────────────────────────────
//
//   월초 요일이 제각각인 달들을 골랐습니다. 2026-02 는 일요일 시작,
//   2026-08 은 토요일 시작, 2024-02 는 윤년입니다.
{
  const months = ['2026-01', '2026-02', '2026-03', '2026-08', '2026-11', '2024-02', '2025-02']
  let bad = 0
  for (const mo of months) {
    const cal = C.monthCalendar(empty, mo, '2026-08-17')
    const flat = cal.weeks.flat()
    if (!cal.weeks.every((w) => w.length === 7)) bad++
    if (flat[0].weekday !== 0) bad++
    if (flat[flat.length - 1].weekday !== 6) bad++
  }
  ok(bad === 0, '**모든 달이 7칸씩 · 일요일 시작 · 토요일 끝**', `어긋난 곳 ${bad}`)

  //  그 달 날짜가 하나도 안 빠지고 한 번씩만
  let miss = 0
  for (const mo of months) {
    const cal = C.monthCalendar(empty, mo, '2026-08-17')
    const own = cal.weeks.flat().filter((d) => d.inMonth).map((d) => d.date)
    const uniq = new Set(own)
    const [y, m] = mo.split('-').map(Number)
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
    if (own.length !== lastDay || uniq.size !== lastDay) miss++
    if (own[0] !== `${mo}-01`) miss++
  }
  ok(miss === 0, '**그 달 날짜가 빠짐없이 한 번씩만**', `어긋난 곳 ${miss}`)
}

// ── 2. 윤년 ────────────────────────────────────────────────────────────────
{
  const leap = C.monthCalendar(empty, '2024-02', '2026-08-17')
  const own = leap.weeks.flat().filter((d) => d.inMonth)
  ok(own.length === 29 && own[own.length - 1].date === '2024-02-29',
    '**윤년 2월은 29일까지**', `${own.length}일 · 마지막 ${own[own.length - 1].date}`)
  const plain = C.monthCalendar(empty, '2025-02', '2026-08-17')
  ok(plain.weeks.flat().filter((d) => d.inMonth).length === 28, '평년 2월은 28일')
}

// ── 3. 앞뒤 달 채움이 진짜 그 날짜인가 ──────────────────────────────────────
//
//   여기가 하루씩 어긋나기 제일 쉬운 자리입니다.
{
  //  2026-08-01 은 토요일 → 앞에 6칸(7/26~7/31)이 붙습니다.
  const cal = C.monthCalendar(empty, '2026-08', '2026-08-17')
  const flat = cal.weeks.flat()
  const lead = flat.filter((d) => !d.inMonth && d.date < '2026-08-01').map((d) => d.date)
  ok(lead.join(',') === '2026-07-26,2026-07-27,2026-07-28,2026-07-29,2026-07-30,2026-07-31',
    '**앞 채움이 실제 7월 말 날짜**', lead.join(','))

  const tailD = flat.filter((d) => !d.inMonth && d.date > '2026-08-31').map((d) => d.date)
  ok(tailD.every((d, i) => d === `2026-09-${String(i + 1).padStart(2, '0')}`),
    '**뒤 채움이 실제 9월 초 날짜**', tailD.join(','))

  //  달 경계 — 1월 앞은 지난해 12월이어야 합니다.
  const jan = C.monthCalendar(empty, '2026-01', '2026-08-17').weeks.flat()
  const janLead = jan.filter((d) => !d.inMonth && d.date < '2026-01-01').map((d) => d.date)
  ok(janLead.every((d) => d.startsWith('2025-12')), '**해가 바뀌는 자리도 맞음**', janLead.join(','))
  //  12월 뒤는 다음 해 1월
  const dec = C.monthCalendar(empty, '2026-12', '2026-08-17').weeks.flat()
  const decTail = dec.filter((d) => !d.inMonth && d.date > '2026-12-31').map((d) => d.date)
  ok(decTail.every((d) => d.startsWith('2027-01')), '12월 뒤는 다음 해 1월', decTail.join(','))
}

// ── 4. 무엇을 세는가 ────────────────────────────────────────────────────────
{
  const data = {
    ...empty,
    clients: [client('c1', '가나요양병원'), client('c2', '다라요양원')],
    schedules: [
      //  8월 10일 — 다녀온 것 둘
      sched('a', 'c1', '2026-08-10', { status: '완료', actualAmount: 100, completedAt: '2026-08-10T10:00:00Z' }),
      sched('b', 'c2', '2026-08-10', { status: '완료', actualAmount: 80, completedAt: '2026-08-10T11:00:00Z' }),
      //  8월 20일 — 남은 방문 하나 + **무른 것 하나**
      sched('c', 'c1', '2026-08-20'),
      sched('d', 'c2', '2026-08-20', { canceledAt: '2026-08-15T01:00:00Z', cancelReason: '병원 휴진' }),
      //  다음 달 — 이 달 합계에 안 들어가야 합니다
      sched('e', 'c1', '2026-09-03'),
    ],
  }
  const cal = C.monthCalendar(data, '2026-08', '2026-08-17')
  const at = (d) => cal.weeks.flat().find((x) => x.date === d)

  ok(at('2026-08-10').done === 2 && at('2026-08-10').pending === 0,
    '다녀온 날은 완료 2건', `완료 ${at('2026-08-10').done} · 남은 ${at('2026-08-10').pending}`)
  ok(at('2026-08-20').pending === 1,
    '**무른 방문은 안 셈** (그날이 찬 것처럼 보이면 안 됩니다)', `남은 ${at('2026-08-20').pending}건`)
  ok(at('2026-08-20').clientNames.join(',') === '가나요양병원',
    '무른 거래처 이름도 안 나옴', at('2026-08-20').clientNames.join(','))
  ok(at('2026-08-10').clientNames.length === 2, '가는 곳 이름이 나옴', at('2026-08-10').clientNames.join(','))

  ok(cal.done === 2 && cal.pending === 1,
    '**이 달 합계는 이 달 것만**', `완료 ${cal.done} · 남은 ${cal.pending}`)
  //  9월 3일은 8월 달력의 뒤 채움 칸에 보이지만 합계에는 안 들어갑니다.
  const sep = at('2026-09-03')
  ok(sep != null && sep.inMonth === false && sep.pending === 1,
    '뒤 채움 칸에도 일정은 보임 (합계에는 안 들어감)', `${sep?.pending}건`)
}

// ── 5. 오늘·지난날 표시 ─────────────────────────────────────────────────────
{
  const cal = C.monthCalendar(empty, '2026-08', '2026-08-17')
  const flat = cal.weeks.flat()
  const t = flat.filter((d) => d.isToday)
  ok(t.length === 1 && t[0].date === '2026-08-17', '**오늘이 정확히 한 칸**', t.map((d) => d.date).join(','))
  ok(flat.find((d) => d.date === '2026-08-16').isPast === true, '어제는 지난날')
  ok(flat.find((d) => d.date === '2026-08-17').isPast === false, '**오늘은 지난날이 아님** (오늘도 잡을 수 있어야 합니다)')
  ok(flat.find((d) => d.date === '2026-08-18').isPast === false, '내일도 아님')
}

// ── 6. 휴무일 ──────────────────────────────────────────────────────────────
{
  const data = { ...empty, holidays: [{ day: '2026-08-15', name: '광복절' }] }
  const cal = C.monthCalendar(data, '2026-08', '2026-08-17')
  const flat = cal.weeks.flat()
  ok(flat.find((d) => d.date === '2026-08-15').holiday === '광복절', '휴무일 이름이 그날에', '광복절')
  ok(flat.filter((d) => d.holiday != null).length === 1, '**다른 날에는 안 붙음**')
}

// ── 7. 달 옮기기 ────────────────────────────────────────────────────────────
{
  ok(C.shiftMonth('2026-08', 1) === '2026-09', '다음 달')
  ok(C.shiftMonth('2026-12', 1) === '2027-01', '**해를 넘김**')
  ok(C.shiftMonth('2026-01', -1) === '2025-12', '해를 거슬러 감')
  ok(C.shiftMonth('2026-08', -3) === '2026-05', '석 달 전')
  const ms = C.calendarMonths('2026-08')
  ok(ms[0] === '2026-05' && ms[ms.length - 1] === '2027-02' && ms.length === 10,
    '고를 수 있는 달 목록', `${ms[0]} ~ ${ms[ms.length - 1]} (${ms.length}개)`)
}

// ── 8. 그만둔 거래처 이름도 나온다 ─────────────────────────────────────────
//
//   거래를 정리한 곳의 지난 수거는 여전히 있었던 일입니다.
{
  const data = {
    ...empty,
    clients: [],
    retiredClients: [client('c9', '문닫은의원')],
    schedules: [sched('z', 'c9', '2026-08-05', { status: '완료', actualAmount: 50, completedAt: '2026-08-05T10:00:00Z' })],
  }
  const cal = C.monthCalendar(data, '2026-08', '2026-08-17')
  const at = cal.weeks.flat().find((d) => d.date === '2026-08-05')
  ok(at.done === 1 && at.clientNames.join(',') === '문닫은의원',
    '그만둔 거래처의 지난 수거도 그대로', at.clientNames.join(','))
}

console.log(`\n총 ${process.exitCode ? '실패 있음' : '실패 0건'}`)
