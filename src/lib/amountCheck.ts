import type { AppData, WasteType } from '../types'
import { today } from './format'
import { addDays } from './performance'

// ─────────────────────────────────────────────────────────────────────────────
// 수거량 자릿수 확인
//
//  현장에서 폰으로 kg 을 칠 때 0 하나가 더 붙으면 그대로 청구액이 열
//  배가 됩니다. 950원/kg 짜리 거래처의 100kg 이 1,000kg 이 되면 9만
//  5천원이 95만원으로 나갑니다. 그리고 그 사실은 **월말 청구까지 아무도
//  모릅니다** — 월말 청구 화면은 금액을 보여 주지만 「평소보다 열 배」라고
//  말해 주지는 않았습니다.
//
//  지금 있는 방어선은 「차량 최대 적재량 초과」 하나뿐입니다. 그건 큰
//  거래처의 오타만 잡습니다. 30kg 거래처가 300kg 이 되어도 1톤 차량
//  적재량 안이라 아무 말이 없습니다.
//
//  ── 짐작하지 않는 것 ──────────────────────────────────────────────────
//
//   근거가 모자라면 판단하지 않습니다. 최근 완료 수거가 4건도 안 되는
//   거래처는 「평소」가 없습니다. 근거 없이 경고하면 곧 아무도 안 봅니다.
//
//   막지 않습니다. 명절 뒤에 몰아서 수거하면 실제로 세 배가 나옵니다.
//   시스템이 현장 사정을 다 알 수 없으니, 물어보고 사람이 정합니다.
// ─────────────────────────────────────────────────────────────────────────────

/** 최근 몇 달치를 「평소」로 볼지 */
const WINDOW_DAYS = 180
/** 이만큼은 있어야 「평소」를 말할 수 있습니다 */
const MIN_HISTORY = 4
/** 중앙값의 몇 배를 넘으면 물어볼지 */
export const HIGH_RATIO = 3
/** 중앙값의 몇 분의 일 아래면 물어볼지 */
export const LOW_RATIO = 1 / 3

function median(xs: number[]): number {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2)
}

export interface AmountCheck {
  /** 판단 근거가 된 최근 수거 건수 */
  count: number
  /** 평소 수거량 (중앙값) */
  median: number
  /** 입력값 ÷ 중앙값 (근거가 없으면 0) */
  ratio: number
  level: 'ok' | 'high' | 'low' | 'unknown'
  /** 화면에 그대로 나가는 문장 (물어볼 필요가 없으면 null) */
  message: string | null
}

const NONE: AmountCheck = { count: 0, median: 0, ratio: 0, level: 'unknown', message: null }

/**
 * 이 거래처·이 구분에서 평소와 크게 다른 값인지.
 *
 *  @param skipScheduleId 다시 입력하는 경우 그 건은 「평소」에서 뺍니다.
 */
export function checkAmount(
  data: AppData,
  clientId: string,
  wasteType: WasteType,
  kg: number,
  skipScheduleId?: string | null,
  from = addDays(today(), -WINDOW_DAYS),
): AmountCheck {
  if (!Number.isFinite(kg) || kg <= 0) return NONE

  const past = data.schedules
    .filter(
      (s) =>
        s.clientId === clientId &&
        s.wasteType === wasteType &&
        s.status === '완료' &&
        s.date >= from &&
        s.id !== skipScheduleId &&
        typeof s.actualAmount === 'number' &&
        (s.actualAmount ?? 0) > 0,
    )
    .map((s) => s.actualAmount as number)

  if (past.length < MIN_HISTORY) return { ...NONE, count: past.length }

  const med = median(past)
  if (med <= 0) return { ...NONE, count: past.length }
  const ratio = kg / med

  const num = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}kg`
  if (ratio > HIGH_RATIO) {
    return {
      count: past.length,
      median: med,
      ratio,
      level: 'high',
      message:
        `평소 이 거래처 ${wasteType} 수거량은 ${num(med)} 정도인데 ${num(kg)} 입니다 ` +
        `(약 ${ratio >= 10 ? Math.round(ratio) : ratio.toFixed(1)}배). 자릿수를 확인해 주세요.`,
    }
  }
  if (ratio < LOW_RATIO) {
    return {
      count: past.length,
      median: med,
      ratio,
      level: 'low',
      message:
        `평소 이 거래처 ${wasteType} 수거량은 ${num(med)} 정도인데 ${num(kg)} 입니다 ` +
        `(약 ${Math.round(1 / ratio)}분의 1). 자릿수를 확인해 주세요.`,
    }
  }
  return { count: past.length, median: med, ratio, level: 'ok', message: null }
}

export interface OddAmount {
  scheduleId: string
  date: string
  wasteType: WasteType
  kg: number
  median: number
  ratio: number
}

/**
 * 그 달에 이미 저장된 수거 중 평소와 크게 다른 것.
 *
 *  입력 시점에 물어보는 것이 첫 번째 방어선이고, 여기가 마지막입니다 —
 *  청구를 확정하면 그 금액이 병원에 나갑니다.
 */
export function oddAmountsIn(data: AppData, clientId: string, month: string): OddAmount[] {
  const out: OddAmount[] = []
  const rows = data.schedules.filter(
    (s) => s.clientId === clientId && s.status === '완료' && s.date.slice(0, 7) === month,
  )
  for (const s of rows) {
    const kg = s.actualAmount ?? 0
    if (kg <= 0) continue
    //  그 수거가 있던 시점을 기준으로 봅니다 — 자기 자신은 「평소」에서 뺍니다.
    const c = checkAmount(data, clientId, s.wasteType, kg, s.id, addDays(s.date, -WINDOW_DAYS))
    if (c.level === 'high' || c.level === 'low') {
      out.push({ scheduleId: s.id, date: s.date, wasteType: s.wasteType, kg, median: c.median, ratio: c.ratio })
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}
