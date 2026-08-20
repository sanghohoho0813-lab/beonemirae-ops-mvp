import type { AppData, Payment, Schedule, WasteType } from '../types'
import { thisMonth, today } from './format'
import { isLive, isDone } from './scheduleLive'

// ─────────────────────────────────────────────────────────────────────────────
// 데이터 파생(집계) 셀렉터 모음
// 화면 로직을 단순하게 유지하기 위해 집계는 이곳에 모읍니다.
// ─────────────────────────────────────────────────────────────────────────────

/** 특정 날짜의 일정 */
/**
 * 그날의 일정.
 *
 *  ⚠ **무른 방문은 여기서부터 빠집니다** (0059). 이 함수가 오늘 일정·배차·
 *  미배정·지연의 근원이라, 여기서 한 번 걸러야 열두 곳에 같은 조건을
 *  적지 않아도 됩니다. 한 곳만 빠뜨리면 무른 방문에 기사가 나갑니다.
 */
export function schedulesOn(data: AppData, date: string): Schedule[] {
  return data.schedules
    .filter((s) => s.date === date && isLive(s))
    .sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime))
}

/**
 *  앞으로 갈 곳 — 오늘 다음 날부터 `days` 일까지의 살아 있는 일정 (0067).
 *
 *  대표님 말씀: 기사님들이 몇 주치 일정을 미리 받아서 본인 동선을 스스로
 *  짭니다. 그동안은 종이나 카톡으로 봤습니다.
 *
 *  ⚠ **새로 저장하는 것은 없습니다.** 이미 읽어 둔 일정을 날짜순으로
 *    묶기만 합니다. 누구 일정을 주는지는 서버가 정합니다 — 현장 계정은
 *    담당 거래처의 일정만 내려옵니다(0056). 화면에서 거르지 않습니다.
 *
 *  ⚠ 오늘은 넣지 않습니다. 오늘은 위 「오늘 일정」이 이미 보여 줍니다 —
 *    두 군데에 같은 것이 뜨면 「어느 쪽이 맞나」가 생깁니다.
 */
export function upcomingSchedules(data: AppData, from = today(), days = 28): Schedule[] {
  const start = new Date(`${from}T00:00:00`)
  const end = new Date(start)
  end.setDate(end.getDate() + days)
  const endStr = end.toLocaleDateString('sv-SE')
  return data.schedules
    .filter((s) => isLive(s) && s.date > from && s.date <= endStr)
    .sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date)
      //  같은 날은 기사님이 정한 방문 순서 → 없으면 시간순 (0067)
      const ao = a.visitOrder ?? 99
      const bo = b.visitOrder ?? 99
      if (ao !== bo) return ao - bo
      return a.scheduledTime.localeCompare(b.scheduledTime)
    })
}

/** 이번 달 완료 일정의 폐기물 구분별 실제 수거량 합계 (kg) */
export function monthlyCollected(data: AppData, month = thisMonth()): Record<WasteType, number> {
  const result: Record<WasteType, number> = { 의료폐기물: 0, 일회용기저귀: 0 }
  for (const s of data.schedules) {
    if (!s.date.startsWith(month)) continue
    if (!isDone(s) || s.actualAmount == null) continue
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
    예정: list.filter((s) => s.status === '예정' && isLive(s)).length,
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
