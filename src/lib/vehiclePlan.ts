import type { AppData, Schedule, Vehicle, WasteType } from '../types'
import { today } from './format'
import { addDays } from './performance'
import { WEEKDAY_LABEL, weekdayOf, WINDOW_DAYS } from './schedulePlan'
import { isPending, isDone } from './scheduleLive'

// ─────────────────────────────────────────────────────────────────────────────
// 차량 배정
//
//  일정 편성(schedulePlan)은 「언제 어디를」까지만 정합니다. 남은 것은
//  「어느 차가」입니다. 지금은 그 배정이 비어 있어서, 만들어진 예정이
//  오늘 일정에 「기사 미지정」으로 뜨고 배차 화면에서도 0곳으로 잡힙니다.
//
//  무엇을 근거로 배정하는가
//
//   1. 폐기물 구분   의료폐기물 차량과 기저귀 차량은 섞이지 않습니다.
//                    법으로 분리 운행이라 이건 규칙이지 추천이 아닙니다.
//   2. 담당 이력     최근 12주 동안 그 거래처를 실제로 가장 많이 담당한
//                    차량이 있으면 그 차를 먼저 씁니다. (엑셀로 가져온
//                    과거 기록에는 차량이 없어, 초기에는 대부분 이력이
//                    없습니다 — 그 경우 아래 3번으로 갑니다)
//   3. 적재 여유     그날 이미 실린 양이 가장 적은 차. 적재량은 명목
//                    적재량이 아니라 **실적재 가능량**(의료폐기물 용기
//                    부피 때문에 2/3 수준)을 씁니다.
//
//   여유가 모자라면 **억지로 넣지 않고 「배정 못 함」으로 남깁니다.**
//   차가 모자라는 날을 미리 알아야 용차를 부르든 날짜를 옮기든 합니다.
//
//  하지 않는 것
//
//   · 경로 순서·운행거리·도착시간은 만들지 않습니다. 거래처 좌표가 없어
//     실제로 계산할 수 없습니다. 지어낸 순서를 저장하면 그 순서대로
//     돌게 됩니다.
//   · 하루에 몇 곳까지 도는지의 상한도 두지 않습니다. 실제 기록이 없어
//     기준을 만들 수 없습니다. 대신 차량마다 정차 수를 함께 보여 줍니다.
// ─────────────────────────────────────────────────────────────────────────────

/** 차량 한 대에 붙는 일정 한 건 */
export interface AssignRow {
  scheduleId: string
  date: string
  weekday: number
  clientId: string
  clientName: string
  wasteType: WasteType
  expectedAmount: number
  vehicleId: string
  vehicleName: string
  driver: string
  /** 왜 이 차인지 */
  basis: string
}

/** 배정하지 못한 일정 */
export interface UnassignedRow {
  scheduleId: string
  date: string
  clientId: string
  clientName: string
  wasteType: WasteType
  expectedAmount: number
  reason: string
}

/** 차량 × 날짜 하나의 결과 */
export interface VehicleDayLoad {
  vehicleId: string
  vehicleName: string
  driver: string
  wasteType: WasteType
  date: string
  /** 그날 이 차에 실릴 예상량 (이미 배정돼 있던 것 + 이번에 붙일 것) */
  kg: number
  capacity: number
  loadPct: number
  /** 정차 수 (이미 배정돼 있던 것 + 이번에 붙일 것) */
  stops: number
  /** 이번에 새로 붙는 건수 */
  added: number
}

export interface AssignResult {
  from: string
  to: string
  rows: AssignRow[]
  unassigned: UnassignedRow[]
  loads: VehicleDayLoad[]
  /** 배정 대상이었던 예정 건수 (배정 + 미배정) */
  targets: number
}

/** 최근 12주 동안 그 거래처를 실제로 담당한 횟수 (차량별) */
function historyByClient(data: AppData, before: string): Map<string, Map<string, number>> {
  const windowStart = addDays(before, -WINDOW_DAYS)
  const out = new Map<string, Map<string, number>>()
  for (const s of data.schedules) {
    if (!isDone(s) || !s.vehicleId) continue
    if (s.date < windowStart || s.date > before) continue
    const key = `${s.clientId}|${s.wasteType}`
    const inner = out.get(key) ?? new Map<string, number>()
    inner.set(s.vehicleId, (inner.get(s.vehicleId) ?? 0) + 1)
    out.set(key, inner)
  }
  return out
}

/**
 * 기간 안의 「차량이 비어 있는 예정」에 차를 붙일 계획을 세웁니다.
 *
 *  이미 차량이 정해진 일정은 손대지 않고, 그날 적재량 계산에만 넣습니다.
 */
export function buildAssignment(data: AppData, from: string, to: string): AssignResult {
  const t = today()
  const start = from < t ? t : from
  const hist = historyByClient(data, start)
  const clientName = new Map(data.clients.map((c) => [c.id, c.name]))

  //  그날 각 차량에 이미 실려 있는 양·정차 수 (예정·지연·긴급 모두 셉니다 —
  //  어차피 그날 그 차가 가야 하는 곳입니다)
  const load = new Map<string, { kg: number; stops: number }>()
  const bump = (vehicleId: string, date: string, kg: number) => {
    const k = `${vehicleId}|${date}`
    const cur = load.get(k) ?? { kg: 0, stops: 0 }
    load.set(k, { kg: cur.kg + kg, stops: cur.stops + 1 })
  }
  const loadOf = (vehicleId: string, date: string) => load.get(`${vehicleId}|${date}`) ?? { kg: 0, stops: 0 }

  const inRange = (s: Schedule) => s.date >= start && s.date <= to
  for (const s of data.schedules) {
    if (!inRange(s) || s.status === '완료') continue
    if (s.vehicleId) bump(s.vehicleId, s.date, s.expectedAmount)
  }

  //  배정 대상 — 차량이 비어 있는 예정. 큰 것부터 채워야 남는 자리가
  //  잘게 쪼개지지 않습니다.
  const targets = data.schedules
    .filter((s) => inRange(s) && isPending(s) && !s.vehicleId)
    .sort((a, b) => a.date.localeCompare(b.date) || b.expectedAmount - a.expectedAmount)

  const rows: AssignRow[] = []
  const unassigned: UnassignedRow[] = []
  const touched = new Set<string>() // 이번에 건드린 차량·날짜

  for (const s of targets) {
    const name = clientName.get(s.clientId) ?? '거래처'
    const fleet: Vehicle[] = data.vehicles.filter((v) => v.wasteType === s.wasteType)
    if (fleet.length === 0) {
      unassigned.push({
        scheduleId: s.id, date: s.date, clientId: s.clientId, clientName: name,
        wasteType: s.wasteType, expectedAmount: s.expectedAmount,
        reason: `${s.wasteType} 차량이 등록돼 있지 않습니다`,
      })
      continue
    }

    const room = (v: Vehicle) => v.expectedCapacity - loadOf(v.id, s.date).kg
    const fits = fleet.filter((v) => room(v) >= s.expectedAmount)
    if (fits.length === 0) {
      const best = fleet.reduce((a, b) => (room(a) >= room(b) ? a : b))
      unassigned.push({
        scheduleId: s.id, date: s.date, clientId: s.clientId, clientName: name,
        wasteType: s.wasteType, expectedAmount: s.expectedAmount,
        reason:
          `그날 적재 여유가 모자랍니다 (필요 ${s.expectedAmount.toLocaleString('ko-KR')}kg · ` +
          `가장 여유 있는 ${best.name} 남은 ${Math.max(0, room(best)).toLocaleString('ko-KR')}kg)`,
      })
      continue
    }

    //  1) 담당 이력이 있는 차 (여유가 되는 차 중에서만)
    const counts = hist.get(`${s.clientId}|${s.wasteType}`)
    let picked: Vehicle | null = null
    let basis = ''
    if (counts) {
      const ranked = fits
        .map((v) => ({ v, n: counts.get(v.id) ?? 0 }))
        .filter((x) => x.n > 0)
        .sort((a, b) => b.n - a.n)
      if (ranked.length > 0) {
        picked = ranked[0].v
        basis = `최근 12주 이 거래처를 ${ranked[0].n}번 담당한 차량`
      }
    }
    //  2) 이력이 없으면 그날 가장 덜 실린 차 (같으면 정차가 적은 쪽)
    if (!picked) {
      picked = fits.reduce((a, b) => {
        const la = loadOf(a.id, s.date)
        const lb = loadOf(b.id, s.date)
        const pa = a.expectedCapacity > 0 ? la.kg / a.expectedCapacity : 1
        const pb = b.expectedCapacity > 0 ? lb.kg / b.expectedCapacity : 1
        if (pa !== pb) return pa < pb ? a : b
        return la.stops <= lb.stops ? a : b
      })
      basis = '담당 이력이 없어 적재 여유가 가장 많은 차량'
    }

    bump(picked.id, s.date, s.expectedAmount)
    touched.add(`${picked.id}|${s.date}`)
    rows.push({
      scheduleId: s.id, date: s.date, weekday: weekdayOf(s.date),
      clientId: s.clientId, clientName: name, wasteType: s.wasteType,
      expectedAmount: s.expectedAmount,
      vehicleId: picked.id, vehicleName: picked.name, driver: picked.driver,
      basis,
    })
  }

  //  건드린 차량·날짜의 최종 적재 상태
  const loads: VehicleDayLoad[] = []
  for (const k of touched) {
    const [vehicleId, date] = k.split('|')
    const v = data.vehicles.find((x) => x.id === vehicleId)
    if (!v) continue
    const l = loadOf(vehicleId, date)
    loads.push({
      vehicleId, vehicleName: v.name, driver: v.driver, wasteType: v.wasteType, date,
      kg: l.kg, capacity: v.expectedCapacity,
      loadPct: v.expectedCapacity > 0 ? Math.round((l.kg / v.expectedCapacity) * 100) : 0,
      stops: l.stops,
      added: rows.filter((r) => r.vehicleId === vehicleId && r.date === date).length,
    })
  }
  loads.sort((a, b) => a.date.localeCompare(b.date) || a.vehicleName.localeCompare(b.vehicleName, 'ko'))

  return { from: start, to, rows, unassigned, loads, targets: targets.length }
}

/** 「8월 14일 (금)」 — 배정 목록에서 날짜를 읽기 쉽게 */
export function dayLabel(date: string): string {
  const [, m, d] = date.split('-').map(Number)
  return `${m}월 ${d}일 (${WEEKDAY_LABEL[weekdayOf(date)]})`
}
