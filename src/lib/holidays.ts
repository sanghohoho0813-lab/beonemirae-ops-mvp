import type { AppData } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// 휴무일
//
//  일정 편성은 실제 수거 이력에서 요일 패턴을 찾습니다. 그래서 일요일에
//  안 가던 거래처는 일요일이 잡히지 않습니다. 그런데 **평일에 떨어지는
//  공휴일**은 그냥 평일로 봅니다 — 한 달치를 편성하면 그 달 공휴일만큼
//  잘못된 예정이 기사에게 나가고, 이사님이 손으로 지웁니다.
//
//  공휴일 목록을 코드에 박아 두지 않습니다. 해마다 바뀌고 대체공휴일·
//  임시공휴일이 생깁니다. 박아 두면 그 해가 지나는 순간 조용히 틀리는데,
//  **일하는 날을 쉬는 날로 착각해 수거를 빠뜨리는 쪽이 더 위험합니다.**
//  그래서 사람이 넣은 날만 휴무일로 봅니다. 아무것도 안 넣으면 지금까지와
//  똑같이 동작합니다.
// ─────────────────────────────────────────────────────────────────────────────

export interface Holiday {
  day: string // YYYY-MM-DD
  name: string
}

export function holidayMap(data: AppData): Map<string, string> {
  const m = new Map<string, string>()
  for (const h of data.holidays ?? []) m.set(h.day, h.name)
  return m
}

/** 그 기간에 넣어 둔 휴무일이 하나라도 있는지 — 없으면 화면이 안내합니다 */
export function hasHolidaysIn(data: AppData, from: string, to: string): boolean {
  return (data.holidays ?? []).some((h) => h.day >= from && h.day <= to)
}

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * 붙여 넣은 목록 읽기.
 *
 *  달력이나 문서에서 긁어 오는 모양이 제각각이라 흔한 것들을 받아 줍니다.
 *
 *    2026-01-01 신정
 *    2026.01.01  신정
 *    2026/1/1,신정
 *    1월 1일 신정        ← 기준 연도를 붙여 씁니다
 *    01-01 신정
 *
 *  읽지 못한 줄은 버리지 않고 그대로 돌려줍니다. 조용히 빠지면 그 날만
 *  휴무일이 안 되고, 그 사실을 아무도 모릅니다.
 */
export interface ParsedHolidays {
  rows: Holiday[]
  /** 읽지 못한 줄 (원문 그대로) */
  bad: string[]
  /** 같은 날이 여러 번 나온 경우 — 뒤에 나온 이름을 씁니다 */
  duplicates: string[]
}

export function parseHolidays(text: string, fallbackYear: number): ParsedHolidays {
  const rows: Holiday[] = []
  const bad: string[] = []
  const duplicates: string[] = []
  const seen = new Map<string, number>()

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue

    let y: number | null = null
    let mo: number | null = null
    let d: number | null = null
    let rest = ''

    //  2026-01-01 / 2026.1.1 / 2026/01/01
    let m = line.match(/^(\d{4})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})\s*(.*)$/)
    if (m) {
      y = Number(m[1]); mo = Number(m[2]); d = Number(m[3]); rest = m[4]
    } else {
      //  2026년 1월 1일
      m = line.match(/^(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일?\s*(.*)$/)
      if (m) {
        y = Number(m[1]); mo = Number(m[2]); d = Number(m[3]); rest = m[4]
      } else {
        //  1월 1일 / 1-1 / 1.1 — 연도가 없으면 기준 연도를 붙입니다
        m = line.match(/^(\d{1,2})\s*월\s*(\d{1,2})\s*일?\s*(.*)$/)
          ?? line.match(/^(\d{1,2})\s*[-./]\s*(\d{1,2})\s*(.*)$/)
        if (m) {
          y = fallbackYear; mo = Number(m[1]); d = Number(m[2]); rest = m[3]
        }
      }
    }

    if (y == null || mo == null || d == null || mo < 1 || mo > 12 || d < 1 || d > 31) {
      bad.push(line)
      continue
    }
    //  2월 30일 같은 값을 걸러 냅니다 — 없는 날짜를 넣으면 서버가 거부합니다.
    const probe = new Date(Date.UTC(y, mo - 1, d))
    if (probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) {
      bad.push(line)
      continue
    }

    const day = `${y}-${pad(mo)}-${pad(d)}`
    const name = rest.replace(/^[,\t·—-]\s*/, '').trim() || '휴무'
    const at = seen.get(day)
    if (at != null) {
      duplicates.push(day)
      rows[at] = { day, name }
    } else {
      seen.set(day, rows.length)
      rows.push({ day, name })
    }
  }

  rows.sort((a, b) => a.day.localeCompare(b.day))
  return { rows, bad, duplicates }
}

/** 이미 만들어 둔 예정 중 휴무일에 걸린 것 — 지울지는 사람이 정합니다 */
export interface HolidayClash {
  scheduleId: string
  date: string
  holidayName: string
  clientName: string
  wasteType: string
}

export function holidayClashes(data: AppData, from: string, to: string): HolidayClash[] {
  const hol = holidayMap(data)
  if (hol.size === 0) return []
  const nameOf = new Map(data.clients.map((c) => [c.id, c.name]))
  return data.schedules
    .filter((s) => s.status === '예정' && s.date >= from && s.date <= to && hol.has(s.date))
    .map((s) => ({
      scheduleId: s.id,
      date: s.date,
      holidayName: hol.get(s.date) ?? '휴무',
      clientName: nameOf.get(s.clientId) ?? '알 수 없음',
      wasteType: s.wasteType,
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.clientName.localeCompare(b.clientName, 'ko'))
}
