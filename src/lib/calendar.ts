import type { AppData } from '../types'
import { today } from './format'
import { holidayMap } from './holidays'
import { isDone, isLive, isPending } from './scheduleLive'

// ─────────────────────────────────────────────────────────────────────────────
// 수거 달력 — 한 달을 한눈에 (대표님 요청)
//
//  지금까지 「오늘 일정」은 하루씩 화살표로 넘겨야 했습니다. 다음 주에 어디를
//  가는지, 어느 날이 비어 있는지 보려면 일곱 번을 눌러야 하고, 그래도 머릿속
//  에서 이어 붙여야 합니다. 병원에서 「언제 오실 수 있어요?」 물으면 답할
//  화면이 없습니다.
//
//  달력은 그 답을 한 장에 놓습니다 — 어느 날 몇 곳을 가는지, 어느 날이
//  비었는지, 어느 날이 휴무일인지.
//
// ── 지키는 것 ───────────────────────────────────────────────────────────────
//
//  ⚠ **무른 방문은 안 셉니다** (0059). 취소한 방문이 달력에 남으면 그날
//    차가 찬 것처럼 보여, 실제로는 빈 날에 새 방문을 안 잡게 됩니다.
//
//  ⚠ **지어내지 않습니다.** 「이날쯤 갈 것 같다」 같은 예상은 안 그립니다.
//    실제로 잡혀 있는 일정과 다녀온 기록만 셉니다.
//
//  ⚠ 달을 넘길 때 **앞뒤 달의 날짜도 자리를 채웁니다**(달력 모양이 되려면
//    필요합니다). 그 칸은 `inMonth: false` 로 표시해 화면이 흐리게 그립니다.
// ─────────────────────────────────────────────────────────────────────────────

export interface CalendarDay {
  /** YYYY-MM-DD */
  date: string
  /** 1~31 */
  dayOfMonth: number
  /** 0(일) ~ 6(토) */
  weekday: number
  /** 이 달의 날인가 (앞뒤 달 채움 칸은 false) */
  inMonth: boolean
  isToday: boolean
  isPast: boolean
  /** 휴무일 이름. 없으면 null */
  holiday: string | null
  /** 그날 다녀온 수거 건수 */
  done: number
  /** 그날 아직 안 간 방문 건수 */
  pending: number
  /** done + pending */
  total: number
  /** 그날 가는 거래처 이름 (많으면 화면이 잘라 씁니다) */
  clientNames: string[]
}

export type CalendarWeek = CalendarDay[]

export interface MonthCalendar {
  month: string
  weeks: CalendarWeek[]
  /** 이 달 전체 — 다녀온 건수 */
  done: number
  /** 이 달 전체 — 남은 방문 */
  pending: number
}

const pad = (n: number) => String(n).padStart(2, '0')

/** 'YYYY-MM' → 그 달 1일의 요일(0~6)과 마지막 날 */
function monthInfo(month: string) {
  const [y, m] = month.split('-').map(Number)
  const first = new Date(Date.UTC(y, m - 1, 1))
  const last = new Date(Date.UTC(y, m, 0))
  return { y, m, firstWeekday: first.getUTCDay(), lastDay: last.getUTCDate() }
}

/** 'YYYY-MM' 을 delta 만큼 옮깁니다 */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`
}

/**
 * 한 달치 달력.
 *
 *  주 단위(일요일 시작)로 묶어 돌려줍니다 — 화면이 그대로 격자로 그립니다.
 */
export function monthCalendar(data: AppData, month: string, now = today()): MonthCalendar {
  const { y, m, firstWeekday, lastDay } = monthInfo(month)
  const hol = holidayMap(data)
  const names = new Map(data.clients.map((c) => [c.id, c.name]))
  for (const c of data.retiredClients ?? []) names.set(c.id, c.name)

  //  그날 무엇이 있는지 미리 모아 둡니다 — 칸마다 전체를 훑으면 3년치에서
  //  느려집니다(수거 5,634건 규모로 반응 시간을 재고 있습니다).
  const byDate = new Map<string, { done: number; pending: number; clients: string[] }>()
  for (const s of data.schedules) {
    if (!isLive(s)) continue
    const cur = byDate.get(s.date) ?? { done: 0, pending: 0, clients: [] }
    if (isDone(s)) cur.done += 1
    else if (isPending(s)) cur.pending += 1
    const nm = names.get(s.clientId)
    if (nm && !cur.clients.includes(nm)) cur.clients.push(nm)
    byDate.set(s.date, cur)
  }

  const cell = (date: string, inMonth: boolean): CalendarDay => {
    const [yy, mm, dd] = date.split('-').map(Number)
    const hit = byDate.get(date)
    return {
      date,
      dayOfMonth: dd,
      weekday: new Date(Date.UTC(yy, mm - 1, dd)).getUTCDay(),
      inMonth,
      isToday: date === now,
      isPast: date < now,
      holiday: hol.get(date) ?? null,
      done: hit?.done ?? 0,
      pending: hit?.pending ?? 0,
      total: (hit?.done ?? 0) + (hit?.pending ?? 0),
      clientNames: hit?.clients ?? [],
    }
  }

  const days: CalendarDay[] = []
  //  앞 달 채움 — 1일이 수요일이면 앞에 세 칸이 필요합니다.
  for (let i = firstWeekday; i > 0; i--) {
    const d = new Date(Date.UTC(y, m - 1, 1 - i))
    days.push(cell(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`, false))
  }
  for (let d = 1; d <= lastDay; d++) days.push(cell(`${month}-${pad(d)}`, true))
  //  뒤 달 채움 — 마지막 주를 일곱 칸으로 채웁니다.
  //  날짜를 하나씩 밀어 만듭니다. 계산으로 한 번에 구하려다 달 경계에서
  //  하루씩 어긋나기 쉽습니다.
  let tail = lastDay
  while (days.length % 7 !== 0) {
    tail += 1
    const d = new Date(Date.UTC(y, m - 1, tail))
    days.push(cell(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`, false))
  }

  const weeks: CalendarWeek[] = []
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7))

  const inMonthDays = days.filter((d) => d.inMonth)
  return {
    month,
    weeks,
    done: inMonthDays.reduce((a, d) => a + d.done, 0),
    pending: inMonthDays.reduce((a, d) => a + d.pending, 0),
  }
}

/** 최근·앞으로 달 목록 (달 고르개용) */
export function calendarMonths(from: string, back = 3, forward = 6): string[] {
  const out: string[] = []
  for (let i = -back; i <= forward; i++) out.push(shiftMonth(from, i))
  return out
}
