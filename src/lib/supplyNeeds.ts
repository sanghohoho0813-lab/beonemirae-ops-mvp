import type { AppData, MaterialSupply } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// 이번에 필요한 물품 — 추천
//
//  「AI 처럼 보이는 것」이 목적이 아닙니다. **설명할 수 있는 계산**만 합니다.
//
//   지금까지 병원은 박스가 떨어질 때쯤 전화를 겁니다. 떨어지고 나서 거는
//   일도 많습니다 — 그때는 이미 늦어서 긴급 요청이 되고, 사무실은 일정에
//   없던 방문을 만들어야 합니다.
//
//   그런데 **얼마나 쓰는지는 이미 우리가 알고 있습니다.** 자재 공급 기록이
//   그것입니다. 최근 몇 달 실제로 가져다 드린 수량을 보면 한 달에 몇 개
//   쓰는지, 마지막이 언제였는지, 다음에 언제 떨어질지가 나옵니다.
//
//  ── 규칙 ──────────────────────────────────────────────────────────────────
//
//   · 최근 **90일** 실제 공급 기록만 씁니다 (그보다 오래된 것은 지금 사용량이
//     아닙니다)
//   · 최소 **2번**은 가져다 드린 적이 있어야 합니다. 한 번은 「주기」가 아니라
//     그냥 한 번입니다
//   · 자료가 모자라면 **추천하지 않습니다** — 「추천할 사용 이력이 아직
//     충분하지 않습니다」라고 그대로 적습니다
//   · 모든 추천에는 **왜 그렇게 봤는지**가 함께 붙습니다. 근거 없는 숫자는
//     내지 않습니다
// ─────────────────────────────────────────────────────────────────────────────

/** 자재 공급 기록의 수량 칸 → 사무실 재고 칸 (0048 products.stock_key 와 같은 이름) */
export type StockKey = 'corrugated_box' | 'plastic_container' | 'bag' | 'needle_box'

/** 최근 며칠을 「지금 사용량」으로 볼 것인가 */
export const NEEDS_WINDOW_DAYS = 90
/** 몇 번은 가져다 드린 적이 있어야 「주기」라고 부를 수 있는가 */
export const MIN_SUPPLIES_FOR_NEED = 2

export interface SupplyNeed {
  stockKey: StockKey
  /** '골판지 전용박스' */
  label: string
  /** 창 안에서 실제로 가져다 드린 총 수량 */
  total: number
  /** 몇 번에 나눠서 */
  times: number
  /** 한 달에 몇 개꼴 (소수 첫째자리) */
  perMonth: number
  /** 마지막으로 가져다 드린 날 (YYYY-MM-DD) */
  lastDate: string
  /** 마지막 이후 며칠 지났는가 */
  daysSince: number
  /** 평균 며칠에 한 번 가져다 드렸는가 (한 번뿐이면 null) */
  cycleDays: number | null
  /** 이번에 필요할 것으로 보는 수량 — 지난번들의 평균 1회 공급량 */
  suggestQty: number
  /** 다음에 필요할 것으로 보는 날 (cycleDays 를 모르면 null) */
  dueOn: string | null
  /** 이미 지났거나 곧 다가온 것 */
  due: boolean
  /** 화면에 그대로 나가는 근거 한 줄 */
  why: string
}

export interface SupplyNeeds {
  clientId: string
  /** 추천 가능한 물품 (급한 것부터) */
  needs: SupplyNeed[]
  /** 창 안에 공급 기록이 몇 건이나 있었는가 */
  supplyCount: number
  /** 추천을 못 하는 이유 (추천이 있으면 빈 문자열) */
  blocked: string
}

const LABEL: Record<StockKey, string> = {
  corrugated_box: '골판지 전용박스',
  plastic_container: '합성수지 전용용기',
  bag: '전용 봉투',
  needle_box: '합성수지 바늘통',
}

/**
 * 자재 공급 한 건에서 재고 칸별 수량을 꺼냅니다.
 *
 *  `boxCount` 는 규격 합계(기존 화면 호환용)이고, 규격별 상세는 `items` 에
 *  있습니다. 합성수지(plastic)는 규격별 상세에만 있어서, 상세가 있으면
 *  그쪽을 먼저 봅니다 — 안 그러면 합성수지가 통째로 0 이 됩니다.
 */
function qtyOf(m: MaterialSupply): Partial<Record<StockKey, number>> {
  const items = (m as { items?: Record<string, number> }).items
  if (items && Object.keys(items).length > 0) {
    let box = 0
    let plastic = 0
    for (const [k, v] of Object.entries(items)) {
      const n = Number(v ?? 0)
      if (!Number.isFinite(n) || n <= 0) continue
      if (k.startsWith('box')) box += n
      else if (k.startsWith('plastic')) plastic += n
    }
    return {
      corrugated_box: box || m.boxCount || 0,
      plastic_container: plastic,
      bag: m.vinylCount || 0,
      needle_box: m.needleBoxCount || 0,
    }
  }
  return {
    corrugated_box: m.boxCount || 0,
    bag: m.vinylCount || 0,
    needle_box: m.needleBoxCount || 0,
  }
}

const dayDiff = (a: string, b: string) =>
  Math.round((new Date(`${a}T00:00:00Z`).getTime() - new Date(`${b}T00:00:00Z`).getTime()) / 86400000)

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/**
 * 이 병원이 이번에 필요할 물품.
 *
 *  `today` 는 오늘 날짜(YYYY-MM-DD). 시간을 함수 안에서 읽지 않습니다 —
 *  그래야 같은 자료로 언제 돌려도 같은 답이 나옵니다.
 */
export function supplyNeedsFor(data: AppData, clientId: string, today: string): SupplyNeeds {
  const from = addDays(today, -NEEDS_WINDOW_DAYS)
  const mine = (data.materials ?? [])
    .filter((m) => m.clientId === clientId && m.date >= from && m.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date))

  const byKey = new Map<StockKey, { dates: string[]; qty: number[] }>()
  for (const m of mine) {
    for (const [k, n] of Object.entries(qtyOf(m)) as [StockKey, number][]) {
      if (!n || n <= 0) continue
      const cur = byKey.get(k) ?? { dates: [], qty: [] }
      cur.dates.push(m.date)
      cur.qty.push(n)
      byKey.set(k, cur)
    }
  }

  const needs: SupplyNeed[] = []
  for (const [stockKey, v] of byKey) {
    //  한 번뿐이면 「주기」가 아닙니다 — 추천하지 않습니다.
    if (v.dates.length < MIN_SUPPLIES_FOR_NEED) continue
    const total = v.qty.reduce((s, n) => s + n, 0)
    const times = v.dates.length
    const lastDate = v.dates[v.dates.length - 1]
    const firstDate = v.dates[0]
    const daysSince = dayDiff(today, lastDate)
    //  실제로 자료가 있는 기간으로 나눕니다. 창(90일) 전체로 나누면
    //  두 달 전에 시작한 병원의 사용량이 3분의 2로 줄어 보입니다.
    const span = Math.max(dayDiff(lastDate, firstDate), 1)
    const perMonth = Math.round((total / span) * 30 * 10) / 10
    //  평균 며칠에 한 번 — 처음과 마지막 사이를 (횟수 − 1) 로 나눕니다.
    const cycleDays = times >= 2 ? Math.max(Math.round(span / (times - 1)), 1) : null
    const suggestQty = Math.max(Math.round(total / times), 1)
    const dueOn = cycleDays ? addDays(lastDate, cycleDays) : null
    //  「곧」은 일주일입니다. 다음 수거가 보통 그 안에 있습니다.
    const due = dueOn != null && dayDiff(dueOn, today) <= 7

    needs.push({
      stockKey,
      label: LABEL[stockKey],
      total,
      times,
      perMonth,
      lastDate,
      daysSince,
      cycleDays,
      suggestQty,
      dueOn,
      due,
      why:
        `최근 ${Math.round(span / 30 * 10) / 10}개월 동안 ${times}번 · 모두 ${total}개 ` +
        `(한 달 ${perMonth}개꼴) · 마지막 ${lastDate} (${daysSince}일 전)` +
        (cycleDays ? ` · 평균 ${cycleDays}일에 한 번` : ''),
    })
  }

  //  지난 것 먼저, 그다음 많이 쓰는 것 먼저.
  needs.sort((a, b) => {
    if (a.due !== b.due) return a.due ? -1 : 1
    return b.perMonth - a.perMonth
  })

  return {
    clientId,
    needs,
    supplyCount: mine.length,
    blocked:
      needs.length > 0
        ? ''
        : mine.length === 0
          ? `최근 ${NEEDS_WINDOW_DAYS}일 안에 자재를 가져다 드린 기록이 없어 추천할 사용 이력이 아직 충분하지 않습니다.`
          : `추천할 사용 이력이 아직 충분하지 않습니다 — 같은 물품을 ${MIN_SUPPLIES_FOR_NEED}번 이상 받으신 기록이 있어야 사용 주기를 알 수 있습니다.`,
  }
}
