import type { AppData, Payment, Schedule, WasteType } from '../types'
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

/**
 * 이 청구에 실제로 들어온 돈 (0026).
 *
 *  입금 기록이 있으면 그 합계입니다. 기록이 없는데 상태가 「입금완료」면
 *  0026 이전에 만들어진 청구이므로 전액 받은 것으로 봅니다 — 과거 기록을
 *  고치지 않으면서 새 방식이 함께 동작하게 하는 유일한 지점입니다.
 */
export function paidTotalOf(data: AppData, payment: Payment): number {
  const rs = (data.receipts ?? []).filter((r) => r.paymentId === payment.id)
  if (rs.length > 0) return rs.reduce((s, r) => s + r.amount, 0)
  return payment.status === '입금완료' ? payment.amount : 0
}

/**
 * 이 청구에서 아직 못 받은 돈.
 *
 *  **부분입금을 뺍니다.** 예전에는 「상태가 입금완료가 아니면 청구액 전부」로
 *  셌습니다. 100만원 청구에 30만원이 들어와도 미수금이 100만원으로 잡혀,
 *  받은 돈이 장부에서 사라졌습니다. 거래처 화면은 뺀 값(70만원)을 쓰고
 *  대시보드·미수금 화면은 안 뺀 값(100만원)을 써서 같은 시스템 안에서
 *  숫자가 갈렸습니다.
 */
export function outstandingOf(data: AppData, payment: Payment): number {
  if (payment.status === '취소') return 0
  return Math.max(0, payment.amount - paidTotalOf(data, payment))
}

/** 미수금 합계 — 부분입금을 뺀 실제 못 받은 돈 */
export function outstandingTotal(data: AppData): number {
  //  취소한 청구는 없던 것으로 봅니다. 기록은 남기지만 받을 돈은 아닙니다.
  return data.payments.reduce((sum, p) => sum + outstandingOf(data, p), 0)
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
