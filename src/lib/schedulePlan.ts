import type { AppData, WasteType } from '../types'
import { today } from './format'
import { holidayMap } from './holidays'
import { addDays } from './performance'

// ─────────────────────────────────────────────────────────────────────────────
// 수거 일정 자동 편성
//
//  왜 필요한가
//
//   지금은 매일 아침 어느 병원을 도는지 사람이 정합니다. 거래처가 늘어날수록
//   이 일이 하루 한 시간 반 가까이 걸리고, 빠뜨리면 그대로 미수거가 됩니다.
//   엑셀 가져오기로 실제 수거 기록이 2천 건 넘게 쌓였으니, 그 기록에서
//   「이 병원은 화·금에 간다」를 읽어 다음 4주치 예정을 만들 수 있습니다.
//
//  무엇을 근거로 삼는가 — 지어내지 않습니다
//
//   거래처 카드의 「수거주기(주 1회)」 같은 글자는 쓰지 않습니다. 그 값은
//   평균 간격일 뿐이라 무슨 요일에 가는지를 말해 주지 않고, 계약서에 적힌
//   말이 실제 운행과 다른 곳도 있습니다. 대신 **실제로 완료된 수거 기록의
//   요일**만 셉니다.
//
//    · 기준 기간   편성 시작일 직전 12주
//    · 반복 요일   그 요일에 3회 이상 갔고, 수거가 있었던 주의 절반 이상을
//                  차지할 때만 인정합니다
//    · 예상 수거량 같은 요일 실제 수거량의 중앙값 (평균이 아니라 중앙값 —
//                  명절 직후 한 번 몰린 값에 끌려가지 않습니다)
//
//   근거가 이에 못 미치면 **제안하지 않고 이유를 남깁니다.** 「주 1회니까
//   대충 월요일」 같은 추정은 만들지 않습니다.
//
//  만들어지는 것은 「예정」이지 「이력」이 아닙니다
//
//   여기서 생기는 일정은 status='예정' 이고, 실제 수거량은 비어 있습니다.
//   수거이력·정산·매출에는 잡히지 않습니다. 현장에서 수거 입력을 해야
//   비로소 완료가 되고 그때부터 실적이 됩니다.
// ─────────────────────────────────────────────────────────────────────────────

/** 근거로 삼는 과거 기간 (일) */
export const WINDOW_DAYS = 84 // 12주

/** 한 요일을 「반복 요일」로 인정하는 최소 횟수 */
export const MIN_HITS = 3

/** 수거가 있었던 주 대비 그 요일이 차지해야 하는 최소 비율 */
export const MIN_SHARE = 0.5

/**
 * 최근 수거가 이보다 오래됐으면 편성하지 않습니다.
 * (계약이 끝났거나 쉬고 있는 곳에 예정을 만들면 매일 미수거로 뜹니다)
 */
export const STALE_DAYS = 35

export const WEEKDAY_LABEL = ['일', '월', '화', '수', '목', '금', '토']

/** YYYY-MM-DD → 0(일)~6(토). 로컬 시간대에 흔들리지 않게 문자열로 계산합니다. */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)).getUTCDay()
}

/** 그 날짜가 속한 주의 월요일 (주 단위로 묶어 세기 위한 값) */
function weekKey(date: string): string {
  const wd = weekdayOf(date)
  return addDays(date, wd === 0 ? -6 : 1 - wd)
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2)
}

/** 인정된 반복 요일 하나 */
export interface PlanWeekday {
  /** 0(일)~6(토) */
  weekday: number
  /** 기준 기간 안에서 이 요일에 실제로 수거한 횟수 */
  hits: number
  /** 예상 수거량 (같은 요일 실제 수거량의 중앙값, kg) */
  medianKg: number
}

/** 거래처 × 폐기물 구분 하나에 대한 판단 결과 */
export interface ClientPattern {
  clientId: string
  clientName: string
  wasteType: WasteType
  /** 인정된 반복 요일 (요일 순) */
  weekdays: PlanWeekday[]
  /** 기준 기간 안에서 수거가 한 번이라도 있었던 주의 수 */
  activeWeeks: number
  /** 기준 기간 안의 완료 수거 건수 */
  records: number
  /** 마지막 수거일 */
  lastDate: string | null
  /** 편성할 수 있는가 */
  usable: boolean
  /** 편성하지 못하는 이유 (usable=false 일 때만) */
  reason: string
}

/** 만들 예정 일정 한 줄 */
export interface PlanRow {
  clientId: string
  clientName: string
  date: string
  weekday: number
  wasteType: WasteType
  expectedAmount: number
  /** 이 줄의 근거 (화면에 그대로 보여 줍니다) */
  basis: string
}

/** 만들지 않고 건너뛴 날짜 */
export interface SkipRow {
  clientId: string
  clientName: string
  date: string
  wasteType: WasteType
  /** 왜 건너뛰었는지 — 화면이 문구를 뜯어보지 않고 구분할 수 있게 */
  kind: 'exists' | 'holiday'
  reason: string
}

export interface PlanResult {
  from: string
  to: string
  rows: PlanRow[]
  skipped: SkipRow[]
  /** 휴무일이라 빼 놓은 날 수 (같은 날 여러 거래처면 여러 건) */
  holidaySkips: number
  /** 근거가 모자라 아예 편성하지 못한 거래처 */
  unusable: ClientPattern[]
  /** 편성에 쓰인 거래처 */
  usable: ClientPattern[]
}

/**
 * 거래처별 반복 요일을 실제 수거 기록에서 읽습니다.
 *
 *  @param before 이 날짜 직전 12주를 봅니다 (보통 편성 시작일)
 */
export function detectPatterns(data: AppData, before: string): ClientPattern[] {
  const windowStart = addDays(before, -WINDOW_DAYS)
  const t = today()

  //  (거래처, 구분) 별로 완료 수거를 모읍니다. 같은 날 두 번 간 기록(추가
  //  수거)은 아래에서 날짜로 묶어 한 번의 방문으로 셉니다.
  const bucket = new Map<string, { date: string; kg: number | null }[]>()
  for (const s of data.schedules) {
    if (s.status !== '완료') continue
    if (s.date < windowStart || s.date >= before) continue
    const key = `${s.clientId}|${s.wasteType}`
    const list = bucket.get(key) ?? []
    list.push({ date: s.date, kg: s.actualAmount })
    bucket.set(key, list)
  }

  const out: ClientPattern[] = []

  //  data.clients 에는 거래 중인 곳만 들어 있습니다 (그만둔 곳은 repo 가
  //  retiredClients 로 갈라 둡니다) — 여기서 다시 거를 것이 없습니다.
  for (const client of data.clients) {
    const types: WasteType[] = []
    if (client.collectsMedicalWaste) types.push('의료폐기물')
    if (client.collectsDiaper) types.push('일회용기저귀')

    for (const wasteType of types) {
      const rows = bucket.get(`${client.id}|${wasteType}`) ?? []
      //  같은 날 여러 건이면 한 번의 방문으로 셉니다.
      const byDate = new Map<string, number[]>()
      for (const r of rows) {
        const list = byDate.get(r.date) ?? []
        if (r.kg != null) list.push(r.kg)
        byDate.set(r.date, list)
      }
      const dates = [...byDate.keys()].sort()
      const lastDate = dates.length ? dates[dates.length - 1] : null

      const base: ClientPattern = {
        clientId: client.id,
        clientName: client.name,
        wasteType,
        weekdays: [],
        activeWeeks: new Set(dates.map(weekKey)).size,
        records: dates.length,
        lastDate,
        usable: false,
        reason: '',
      }

      if (dates.length === 0) {
        out.push({ ...base, reason: `최근 12주 안에 ${wasteType} 수거 기록이 없습니다` })
        continue
      }
      if (lastDate && addDays(lastDate, STALE_DAYS) < t) {
        out.push({ ...base, reason: `마지막 수거가 ${lastDate} — ${STALE_DAYS}일 넘게 없습니다` })
        continue
      }

      const need = Math.max(MIN_HITS, Math.ceil(base.activeWeeks * MIN_SHARE))
      const weekdays: PlanWeekday[] = []
      for (let wd = 0; wd < 7; wd++) {
        const hitDates = dates.filter((d) => weekdayOf(d) === wd)
        if (hitDates.length < need) continue
        const kgs = hitDates.flatMap((d) => byDate.get(d) ?? [])
        weekdays.push({ weekday: wd, hits: hitDates.length, medianKg: median(kgs) })
      }

      if (weekdays.length === 0) {
        out.push({
          ...base,
          reason:
            `반복되는 요일을 찾지 못했습니다 (최근 12주 ${dates.length}회 · ` +
            `한 요일에 ${need}회 이상 필요)`,
        })
        continue
      }
      out.push({ ...base, weekdays, usable: true })
    }
  }

  return out.sort((a, b) => a.clientName.localeCompare(b.clientName, 'ko'))
}

/**
 * 반복 요일을 기간에 펼쳐 「만들 예정 일정」 목록을 만듭니다.
 *
 *  이미 같은 (거래처·날짜·구분) 일정이 있으면 만들지 않고 건너뜁니다 —
 *  덮어쓰지 않습니다. 지난 날짜에도 만들지 않습니다.
 */
export function buildPlan(
  data: AppData,
  from: string,
  to: string,
  onlyClientIds?: Set<string>,
  /** 휴무일에도 만들지 — 명절에도 가야 하는 병원이 실제로 있어 사람이 정합니다 */
  includeHolidays = false,
): PlanResult {
  const t = today()
  const start = from < t ? t : from
  const patterns = detectPatterns(data, start)
  //  넣어 둔 휴무일만 뺍니다. 아무것도 안 넣었으면 지금까지와 똑같습니다.
  const hol = includeHolidays ? new Map<string, string>() : holidayMap(data)

  //  이미 있는 일정 — 상태와 관계없이 하나라도 있으면 그 날은 손대지 않습니다.
  const taken = new Set(data.schedules.map((s) => `${s.clientId}|${s.date}|${s.wasteType}`))

  const rows: PlanRow[] = []
  const skipped: SkipRow[] = []
  let holidaySkips = 0
  const usable: ClientPattern[] = []
  const unusable: ClientPattern[] = []

  for (const p of patterns) {
    if (onlyClientIds && !onlyClientIds.has(p.clientId)) continue
    if (!p.usable) {
      unusable.push(p)
      continue
    }
    usable.push(p)

    for (const w of p.weekdays) {
      for (let d = start; d <= to; d = addDays(d, 1)) {
        if (weekdayOf(d) !== w.weekday) continue
        //  휴무일은 아예 만들지 않습니다 — 만들어 두고 지우게 하면
        //  지우는 것을 잊은 만큼 기사가 헛걸음합니다.
        if (hol.has(d)) {
          holidaySkips += 1
          skipped.push({
            clientId: p.clientId,
            clientName: p.clientName,
            date: d,
            wasteType: p.wasteType,
            kind: 'holiday',
            reason: `휴무일입니다 (${hol.get(d)})`,
          })
          continue
        }
        const key = `${p.clientId}|${d}|${p.wasteType}`
        if (taken.has(key)) {
          skipped.push({
            clientId: p.clientId,
            clientName: p.clientName,
            date: d,
            wasteType: p.wasteType,
            kind: 'exists',
            reason: '이미 일정이 있습니다',
          })
          continue
        }
        taken.add(key) // 같은 날 두 번 만들지 않습니다
        rows.push({
          clientId: p.clientId,
          clientName: p.clientName,
          date: d,
          weekday: w.weekday,
          wasteType: p.wasteType,
          expectedAmount: w.medianKg,
          basis: `최근 12주 ${WEEKDAY_LABEL[w.weekday]}요일 ${w.hits}회`,
        })
      }
    }
  }

  rows.sort((a, b) => a.date.localeCompare(b.date) || a.clientName.localeCompare(b.clientName, 'ko'))
  skipped.sort((a, b) => a.date.localeCompare(b.date) || a.clientName.localeCompare(b.clientName, 'ko'))
  return { from: start, to, rows, skipped, holidaySkips, usable, unusable }
}
