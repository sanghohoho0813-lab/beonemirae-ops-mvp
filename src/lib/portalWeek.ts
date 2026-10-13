import type { AppData, Client } from '../types'
import type { PortalSummary } from './portal'
import { clientSchedules } from './ops'
import { isPending } from './scheduleLive'

// ─────────────────────────────────────────────────────────────────────────────
// 앞으로 7일 — 병원 홈 「다음 수거」 칸 아래 한 줄 (포털 2차)
//
//  ⚠ **등록된 일정만** 「수거」로 칠합니다. 수거주기로 계산한 날은 「예상」으로
//    따로 표시합니다(점선) — 확정처럼 보이면 병원이 그날 사람을 대기시킵니다.
//  ⚠ 새 자료를 만들지 않습니다. 홈이 이미 받아 둔 일정에서 고르기만 합니다.
// ─────────────────────────────────────────────────────────────────────────────

export interface WeekDay {
  /** YYYY-MM-DD */
  date: string
  /** 월 · 화 … */
  dow: string
  day: number
  month: number
  isToday: boolean
  /** scheduled 등록된 일정 · done 오늘 이미 다녀감 · estimate 수거주기로 본 예상 */
  mark: 'scheduled' | 'done' | 'estimate' | null
  /** 등록된 시각 (있을 때만) */
  time: string | null
}

const DOW = ['일', '월', '화', '수', '목', '금', '토']

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return t.toISOString().slice(0, 10)
}

export function weekStrip(data: AppData, client: Client, s: PortalSummary, today: string): WeekDay[] {
  const mine = clientSchedules(data, client.id)
  const out: WeekDay[] = []
  for (let i = 0; i < 7; i += 1) {
    const date = addDays(today, i)
    const [y, m, d] = date.split('-').map(Number)
    const dow = DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
    const onDay = mine.filter((x) => x.date === date && !x.canceledAt)
    const pending = onDay
      .filter((x) => isPending(x))
      .sort((a, b) => (a.scheduledTime ?? '').localeCompare(b.scheduledTime ?? ''))
    const done = onDay.some((x) => x.status === '완료')
    let mark: WeekDay['mark'] = null
    if (pending.length > 0) mark = 'scheduled'
    else if (done) mark = 'done'
    else if (s.nextIsEstimate && s.nextDate === date) mark = 'estimate'
    out.push({
      date, dow, day: d, month: m, isToday: i === 0, mark,
      time: pending[0]?.scheduledTime || null,
    })
  }
  return out
}
