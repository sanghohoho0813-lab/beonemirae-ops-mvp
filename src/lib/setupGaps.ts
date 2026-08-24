import type { AppData, Client, Payment } from '../types'
import { today } from './format'
import { addDays } from './performance'
import { shiftMonth } from './deadlines'
import { isPending } from './scheduleLive'
import { hideSupplies } from './pilotMode'

// ─────────────────────────────────────────────────────────────────────────────
// 아직 값이 비어서 못 쓰는 기능
//
//  지금 시스템에서 「안 되는 것」은 대부분 기능이 없어서가 아닙니다.
//  **도구는 만들어져 있는데 넣어야 할 값이 비어 있어서**입니다.
//
//    휴무일을 안 넣으면      → 일정 편성이 공휴일에도 수거를 잡습니다
//    소모품 단가를 안 넣으면 → 병원 화면에 물건이 하나도 안 뜹니다
//    사업자정보가 없으면     → 세금계산서 자료에서 그 병원이 빠집니다
//    운영비를 안 넣으면      → 영업이익을 계산할 수 없습니다
//
//  이것들이 지금은 서로 다른 화면에 흩어져 있어서, 「무엇부터 넣어야
//  이 시스템이 온전히 도는가」에 답할 데가 없었습니다.
//
// ── 이 목록이 지키는 규칙 ───────────────────────────────────────────────────
//
//  ① **비어 있는 것만** 올립니다. 다 채운 항목은 사라집니다 —
//     늘 떠 있는 목록은 곧 배경이 됩니다.
//  ② 「채워 주세요」로 끝내지 않습니다. **지금 무슨 일이 벌어지고 있는지**를
//     실제 숫자로 적습니다. 「사업자정보 없음」이 아니라
//     「청구가 있는 3곳이 세금계산서 자료에서 빠집니다」.
//  ③ 숫자를 **지어내지 않습니다.** 셀 수 없는 것은 항목 자체를 안 만듭니다.
//  ④ 순서는 **실제 피해 크기**입니다 — 돈이 틀리는 쪽이 위입니다.
// ─────────────────────────────────────────────────────────────────────────────

export type GapKey =
  | 'holidays'
  | 'productPrice'
  | 'bizInfo'
  | 'vatMode'
  | 'clientPrice'
  | 'operatingCost'
  | 'staff'

/** 얼마나 급한가 — 돈이 틀리는 쪽이 위 */
export type GapWeight = '돈' | '운영' | '보조'

export interface SetupGap {
  key: GapKey
  label: string
  weight: GapWeight
  /** 지금 실제로 무슨 일이 벌어지고 있는가 — 숫자를 포함합니다 */
  effect: string
  /** 어디서 채우는가 */
  to: string
  linkLabel: string
  /** 몇 개가 비어 있는가 (화면 정렬·요약용) */
  count: number
}

export interface SetupScan {
  gaps: SetupGap[]
  /** 돈이 틀릴 수 있는 것이 몇 가지인가 */
  moneyCount: number
}

/** 앞으로 이만큼은 봅니다 — 공휴일이 편성에 영향을 주는 구간 */
const HOLIDAY_WINDOW_DAYS = 90

/** 운영비를 확인할 지난 달 수 */
const COST_MONTHS = 3

export function scanSetupGaps(data: AppData, asOf: string = today()): SetupScan {
  const gaps: SetupGap[] = []
  const clients = data.clients ?? []

  // ── 휴무일 ────────────────────────────────────────────────────────────────
  //  앞으로 편성돼 있는 예정이 있는데 그 구간에 휴무일이 하나도 없으면,
  //  공휴일에도 수거를 나가는 예정이 섞여 있을 수 있습니다.
  //
  //  ⚠ 「공휴일이 며칠 있다」고 시스템이 말하지 않습니다 — 넣어 둔 것이
  //    없으니 알 수가 없습니다. 대신 **위험에 노출된 예정 건수**를 셉니다.
  {
    const to = addDays(asOf, HOLIDAY_WINDOW_DAYS)
    const planned = (data.schedules ?? []).filter(
      (s) => s.date >= asOf && s.date <= to && isPending(s),
    ).length
    const has = (data.holidays ?? []).some((h) => h.day >= asOf && h.day <= to)
    if (!has && planned > 0) {
      gaps.push({
        key: 'holidays', label: '휴무일 (공휴일·회사 휴무)', weight: '운영',
        effect:
          `앞으로 ${HOLIDAY_WINDOW_DAYS}일 안에 예정이 ${planned}건 잡혀 있는데 휴무일이 하나도 없습니다. ` +
          '공휴일에도 수거 예정이 만들어지고, 그날 기사님이 헛걸음합니다.',
        to: '/settings', linkLabel: '휴무일 넣기', count: planned,
      })
    }
  }

  // ── 소모품 판매가 ─────────────────────────────────────────────────────────
  //  단가가 없으면 병원 화면에 **하나도 안 뜹니다.** 병원 눈에는 고장입니다.
  {
    //  Pilot 동안 소모품 판매는 안 씁니다 — 「단가를 넣으세요」라고
    //  재촉할 이유가 없습니다. 갈 화면 자체가 내려가 있습니다 (0080).
    const products = hideSupplies() ? [] : (data.products ?? []).filter((p) => p.active)
    const noPrice = products.filter((p) => (p.salePrice ?? 0) <= 0)
    const visible = products.filter((p) => p.available && (p.salePrice ?? 0) > 0).length
    if (noPrice.length > 0) {
      gaps.push({
        key: 'productPrice', label: '소모품 판매가', weight: '돈',
        effect:
          `${products.length}가지 중 ${noPrice.length}가지에 단가가 없습니다. ` +
          (visible === 0
            ? '병원 화면에는 물건이 하나도 안 보입니다 — 병원 눈에는 고장으로 보입니다.'
            : `병원 화면에는 ${visible}가지만 뜹니다.`),
        to: '/supplies', linkLabel: '상품에서 단가 넣기', count: noPrice.length,
      })
    }
  }

  //  확정된 청구가 있는 거래처만 셉니다 — 청구가 없으면 세금계산서도
  //  아직 만들 일이 없습니다. 「언젠가 필요할지도」로 재촉하지 않습니다.
  const billedIds = new Set(
    (data.payments ?? [])
      .filter((p: Payment) => p.status !== '취소' && !p.canceledAt)
      .map((p) => p.clientId),
  )
  const billedClients: Client[] = clients.filter((c) => billedIds.has(c.id))

  // ── 사업자등록번호 ────────────────────────────────────────────────────────
  {
    const missing = billedClients.filter((c) => !(c.bizNo ?? '').trim())
    if (missing.length > 0) {
      gaps.push({
        key: 'bizInfo', label: '사업자등록번호', weight: '돈',
        effect:
          `청구가 있는 ${billedClients.length}곳 중 ${missing.length}곳에 사업자등록번호가 없습니다. ` +
          '그 병원은 세금계산서 발행 자료에서 「확인 필요」로 빠집니다 — 결국 홈택스에 손으로 넣게 됩니다.',
        to: '/pricing', linkLabel: '거래처 점검에서 채우기', count: missing.length,
      })
    }
  }

  // ── 부가세 처리 방식 ──────────────────────────────────────────────────────
  //  지금 저장된 청구액이 공급가액인지 부가세 포함인지 계약마다 다릅니다.
  //  사람이 정할 때까지 **세액을 계산하지 않습니다**(taxInvoice.ts).
  {
    const missing = billedClients.filter((c) => !c.vatMode)
    if (missing.length > 0) {
      gaps.push({
        key: 'vatMode', label: '부가세 처리 방식', weight: '돈',
        effect:
          `청구가 있는 ${missing.length}곳에 부가세 처리 방식이 정해져 있지 않습니다. ` +
          '청구액이 공급가액인지 부가세가 든 값인지 계약마다 달라, 시스템이 임의로 정하지 않고 세액을 비워 둡니다.',
        to: '/pricing', linkLabel: '거래처 점검에서 정하기', count: missing.length,
      })
    }
  }

  // ── 거래처 단가 ───────────────────────────────────────────────────────────
  //  단가가 없으면 기본 단가로 계산됩니다 — 실제 계약과 다를 수 있고,
  //  그대로 확정하면 병원에 틀린 금액이 나갑니다.
  {
    const missing = clients.filter((c) => {
      if (c.monthlyFlatFee && c.monthlyFlatFee > 0) return false // 월정액은 단가가 필요 없습니다
      const pricing = c.pricing ?? {}
      return Object.keys(pricing).length === 0
    })
    if (missing.length > 0) {
      gaps.push({
        key: 'clientPrice', label: '거래처 단가', weight: '돈',
        effect:
          `${missing.length}곳에 단가가 정해져 있지 않습니다. 그 거래처의 정산은 기본 단가로 계산되고, ` +
          '실제 계약과 다르면 병원에 틀린 금액이 나갑니다.',
        to: '/pricing', linkLabel: '거래처 점검', count: missing.length,
      })
    }
  }

  // ── 월 운영비 ─────────────────────────────────────────────────────────────
  //  없으면 매출만 보이고 **영업이익을 계산할 수 없습니다.**
  {
    const thisMonth = asOf.slice(0, 7)
    const months: string[] = []
    for (let i = COST_MONTHS; i >= 1; i--) months.push(shiftMonth(thisMonth, -i))
    const have = new Set((data.operatingCosts ?? []).map((c) => c.month))
    const missing = months.filter((m) => !have.has(m))
    if (missing.length > 0) {
      gaps.push({
        key: 'operatingCost', label: '월 운영비', weight: '운영',
        effect:
          `지난 ${COST_MONTHS}달 중 ${missing.length}달(${missing.map((m) => `${Number(m.slice(5))}월`).join('·')})에 ` +
          '운영비가 안 들어가 있습니다. 그 달은 매출만 보이고 영업이익이 안 나옵니다.',
        to: '/reports', linkLabel: '경영 요약에서 넣기', count: missing.length,
      })
    }
  }

  // ── 직원 명부 ─────────────────────────────────────────────────────────────
  {
    const staff = (data.staff ?? []).filter((s) => s.active !== false)
    if (staff.length === 0) {
      gaps.push({
        key: 'staff', label: '직원 명부', weight: '보조',
        effect:
          '현장에 누가 있는지 시스템이 모릅니다. 「이건 누가 가지?」를 계속 카톡으로 물어야 합니다.',
        to: '/settings', linkLabel: '직원 넣기', count: 1,
      })
    }
  }

  //  돈이 틀릴 수 있는 것이 위입니다.
  const ORDER: GapWeight[] = ['돈', '운영', '보조']
  gaps.sort((a, b) => ORDER.indexOf(a.weight) - ORDER.indexOf(b.weight) || b.count - a.count)

  return { gaps, moneyCount: gaps.filter((g) => g.weight === '돈').length }
}
