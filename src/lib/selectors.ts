import type { AppData, Schedule, WasteType } from '../types'
import { thisMonth, today } from './format'

// ─────────────────────────────────────────────────────────────────────────────
// 데이터 파생(집계) 셀렉터 모음
// 화면 로직을 단순하게 유지하기 위해 집계는 이곳에 모읍니다.
// ─────────────────────────────────────────────────────────────────────────────

/** 특정 날짜의 일정 */
export function schedulesOn(data: AppData, date: string): Schedule[] {
  return data.schedules
    .filter((s) => s.date === date)
    .sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime))
}

/** 이번 달 완료 일정의 폐기물 구분별 실제 수거량 합계 (kg) */
export function monthlyCollected(data: AppData, month = thisMonth()): Record<WasteType, number> {
  const result: Record<WasteType, number> = { 의료폐기물: 0, 일회용기저귀: 0 }
  for (const s of data.schedules) {
    if (!s.date.startsWith(month)) continue
    if (s.status !== '완료' || s.actualAmount == null) continue
    result[s.wasteType] += s.actualAmount
  }
  return result
}

/** 오늘 일정 요약 카운트 */
export function todaySummary(data: AppData, date = today()) {
  const list = schedulesOn(data, date)
  return {
    total: list.length,
    완료: list.filter((s) => s.status === '완료').length,
    예정: list.filter((s) => s.status === '예정').length,
    지연: list.filter((s) => s.status === '지연').length,
    긴급: list.filter((s) => s.status === '긴급').length,
  }
}

/** 미수금 합계 (입금완료가 아닌 모든 청구) */
export function outstandingTotal(data: AppData): number {
  return data.payments
    .filter((p) => p.status !== '입금완료')
    .reduce((sum, p) => sum + p.amount, 0)
}

/** 이번 달 자재 추가요청 건수 */
export function additionalMaterialCount(data: AppData, month = thisMonth()): number {
  return data.materials.filter((m) => m.isAdditionalRequest && m.date.startsWith(month)).length
}

/** 차량별 오늘 일정 요약 */
export function vehicleTodaySummary(data: AppData, date = today()) {
  const list = schedulesOn(data, date)
  return data.vehicles.map((v) => {
    const items = list.filter((s) => s.vehicleId === v.id)
    return {
      vehicle: v,
      total: items.length,
      done: items.filter((s) => s.status === '완료').length,
      items,
    }
  })
}
