import type { AppData, Client } from '../types'
import { billingStateFor, hasOwnPrice, monthlyFeeOf, type ItemKey, type SettlementLine } from './billing'
import { oddAmountsIn, type OddAmount } from './amountCheck'

// ─────────────────────────────────────────────────────────────────────────────
// 월말 청구
//
//  청구 확정은 지금까지 거래처 화면에서 한 곳씩 눌러야 했습니다. 거래처가
//  열여덟 곳이면 월말마다 열여덟 번 들어갔다 나와야 하고, 한 곳 빠뜨리면
//  그 달 매출이 통째로 미수금에 안 잡힙니다. 그리고 청구가 없으면 통장
//  대사도 붙일 곳이 없습니다 — 돈 흐름의 첫 단추입니다.
//
//  한 화면에서 그 달 전체를 보고 한 번에 확정합니다.
//
//  자동으로 확정하지 않습니다
//
//   청구는 병원에 보내는 금액입니다. 목록을 눈으로 보고 누릅니다. 화면은
//   거래처마다 얼마를, 무엇으로(수거 몇 건·공급 몇 건), 정기인지 추가인지
//   보여 줍니다.
//
//  기본 단가로 계산된 곳은 갈라 둡니다
//
//   거래처에 단가를 넣지 않으면 시스템 기본 단가로 계산됩니다. 그 금액을
//   그대로 확정하면 **추정 금액이 병원에 나가는 청구서가 됩니다.** 그래서
//   기본 단가가 섞인 거래처는 처음부터 체크를 꺼 두고, 어떤 품목이
//   기본값인지 적습니다. 확정하려면 대표님이 직접 켜야 합니다.
// ─────────────────────────────────────────────────────────────────────────────

export interface CloseRow {
  clientId: string
  clientName: string
  /** 이번에 만들 청구의 종류 */
  kind: '정기' | '추가'
  /** 이번에 확정할 금액 */
  amount: number
  collections: number
  supplies: number
  /** 이 달에 이미 확정해 둔 금액 (추가 청구일 때) */
  alreadyBilled: number
  /** 거래처 단가가 없어 기본 단가로 계산된 품목 이름 */
  defaultPriced: string[]
  /**
   * 그 달 수거 중 평소와 크게 다른 것.
   *  현장에서 0 하나를 더 치면 청구액이 열 배가 됩니다. 입력 시점에
   *  물어보는 것이 첫 방어선이고, 여기가 마지막입니다 — 확정하면 그
   *  금액이 병원에 나갑니다.
   */
  oddAmounts: OddAmount[]
  /** 확정할 수 있는가 */
  canConfirm: boolean
  /** 확정하지 못하는 이유 (canConfirm=false 일 때) */
  reason: string
}

export interface MonthClose {
  month: string
  /** 확정할 수 있는 거래처 */
  ready: CloseRow[]
  /** 확정할 것이 없는 거래처 (이유와 함께) */
  skipped: CloseRow[]
  /**
   * 사람이 봐야 하는 거래처 — 월정액 계약인데 그 달 수거가 없는 경우.
   * 자동으로 청구하지 않습니다. 계약서를 시스템이 알 수 없기 때문입니다.
   */
  needsCheck: CloseRow[]
  /** ready 의 금액 합계 */
  total: number
  /** 기본 단가가 섞인 거래처 수 */
  defaultPricedCount: number
  /** 평소와 크게 다른 수거량이 섞인 거래처 수 */
  oddAmountCount: number
}

/** 이 정산에서 기본 단가로 값이 매겨진 품목들 */
function defaultPricedItems(client: Client | undefined, lines: SettlementLine[]): string[] {
  const out: string[] = []
  for (const l of lines) {
    //  매출이 0 인 줄(무상·월정액)은 청구 금액에 영향이 없습니다.
    if (!l.billable || l.revenue <= 0) continue
    if (!hasOwnPrice(client, l.key as ItemKey)) out.push(l.label)
  }
  return [...new Set(out)]
}

/**
 * 그 달에 확정할 것이 있는 거래처를 모읍니다.
 *
 *  그만둔 거래처도 넣습니다 — 거래를 정리한 달의 마지막 수거는 여전히
 *  청구해야 할 돈입니다.
 */
export function monthClose(data: AppData, month: string): MonthClose {
  const all = [...data.clients, ...(data.retiredClients ?? [])]
  const ready: CloseRow[] = []
  const skipped: CloseRow[] = []
  const needsCheck: CloseRow[] = []

  for (const c of all) {
    const st = billingStateFor(data, c.id, month)
    const base = {
      clientId: c.id,
      clientName: c.name,
      kind: st.nextKind,
      amount: st.pendingAmount,
      collections: st.pending.collections,
      supplies: st.pending.supplies,
      alreadyBilled: st.billedAmount,
      defaultPriced: defaultPricedItems(c, [...st.pending.wasteLines, ...st.pending.supplyLines]),
      oddAmounts: oddAmountsIn(data, c.id, month),
    }

    if (st.canConfirm) {
      ready.push({ ...base, canConfirm: true, reason: '' })
      continue
    }

    //  확정할 것이 없는 이유를 나눠 적습니다. 「없음」 한 마디로 뭉뚱그리면
    //  빠뜨린 것인지 원래 없는 것인지 알 수 없습니다.
    const nothingLeft = st.pending.collections + st.pending.supplies === 0
    const reason =
      nothingLeft && st.billedAmount > 0
        ? `이미 확정했습니다 (${st.billedAmount.toLocaleString('ko-KR')}원)`
        : nothingLeft
          ? '이 달에 완료된 수거·공급이 없습니다'
          : '남은 수거·공급이 무상 항목뿐이라 청구 금액이 0원입니다'

    //  월정액 계약인데 그 달 수거가 한 건도 없는 경우
    //
    //   시스템은 수거가 1건이라도 있어야 월정액을 청구합니다. 계약 전·해지
    //   후의 달에 기본요금이 저절로 나가는 사고를 막기 위해서입니다. 실제
    //   거래처 파일 11개를 전수 확인했을 때도 요금이 적힌 달은 모두 수거가
    //   있던 달이었습니다.
    //
    //   그런데 지금까지는 그런 달에 거래처가 **목록에서 통째로 사라졌습니다.**
    //   계약서상 받아야 할 돈이 있어도 대표님이 알아챌 길이 없었습니다.
    //   자동으로 청구하지는 않되(계약서를 시스템이 알 수 없습니다), 화면에
    //   남겨 사람이 확인하게 합니다.
    const flats: string[] = []
    if (monthlyFeeOf(c, 'medical') != null) flats.push('의료폐기물')
    if (monthlyFeeOf(c, 'diaper') != null) flats.push('일회용기저귀')
    if (nothingLeft && st.billedAmount === 0 && flats.length > 0) {
      const fee =
        (monthlyFeeOf(c, 'medical') ?? 0) + (monthlyFeeOf(c, 'diaper') ?? 0)
      needsCheck.push({
        ...base,
        canConfirm: false,
        reason:
          `월정액 계약(${flats.join('·')} 월 ${fee.toLocaleString('ko-KR')}원)인데 ` +
          '이 달 수거 기록이 없습니다 — 계약서상 청구 대상인지 확인해 주세요',
      })
      continue
    }

    //  아무 일도 없던 거래처까지 목록에 올리면 화면이 의미 없이 길어집니다.
    if (nothingLeft && st.billedAmount === 0) continue
    skipped.push({ ...base, canConfirm: false, reason })
  }

  ready.sort((a, b) => b.amount - a.amount)
  skipped.sort((a, b) => a.clientName.localeCompare(b.clientName, 'ko'))
  needsCheck.sort((a, b) => a.clientName.localeCompare(b.clientName, 'ko'))

  return {
    month,
    ready,
    skipped,
    needsCheck,
    total: ready.reduce((s, r) => s + r.amount, 0),
    defaultPricedCount: ready.filter((r) => r.defaultPriced.length > 0).length,
    oddAmountCount: ready.filter((r) => r.oddAmounts.length > 0).length,
  }
}

/** 최근 달 목록 (이번 달 포함, 과거로 n개) */
export function recentMonths(from: string, n = 6): string[] {
  const [y, m] = from.split('-').map(Number)
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(y, m - 1 - i, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
}
