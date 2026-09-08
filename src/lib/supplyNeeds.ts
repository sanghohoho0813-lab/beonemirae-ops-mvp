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
/**
 * 추천 규칙의 판 (0106). 노출 기록에 함께 남깁니다 — 규칙이나 상품 정보가
 * 나중에 바뀌어도 「그때 어떤 규칙으로 떴는지」가 남아, 과거 성과가 달라지지 않습니다.
 * 규칙(창 길이 · 최소 공급 횟수 · 키 만드는 법)을 바꾸면 이 값을 올립니다.
 */
export const NEEDS_RULE_VERSION = 'needs-2026.09-90d-min2'
/** 몇 번은 가져다 드린 적이 있어야 「주기」라고 부를 수 있는가 */
export const MIN_SUPPLIES_FOR_NEED = 2

export interface SupplyNeed {
  /**
   * 사무실 재고 네 칸 중 하나. **재고를 두지 않는 상품**이면 null 입니다.
   *
   *  예전에는 이 네 칸이 추천의 전부였습니다. 그런데 병원이 실제로 반복해서
   *  사는 물건은 그보다 넓습니다(장갑·소독티슈처럼 재고를 안 두는 것도
   *  있습니다). 그런 것은 productId 로 따라갑니다.
   */
  stockKey: StockKey | null
  /** 재고를 두지 않는 상품이면 그 상품 id (재고 품목이면 null) */
  productId: string | null
  /** 화면·데이터에서 쓰는 하나뿐인 키 — stockKey 또는 `product:<id>` */
  key: string
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
  /**
   * 다음에 그 병원에 가는 날 (YYYY-MM-DD). 예정이 없으면 null.
   *
   *  이 사업모델의 핵심은 「어차피 가는 차에 실어 보내는 것」입니다.
   *  그래서 병원이 실제로 궁금한 것은 「언제 떨어지나」가 아니라
   *  **「그때까지 버티나」** 입니다. 그 판단에 필요한 날짜입니다.
   */
  nextVisitOn: string | null
  /**
   * 예상 소진일이 다음 수거일보다 **앞인가** — 즉 다음에 갈 때 실어 보내지
   * 않으면 그 사이에 떨어질 것으로 보이는가.
   *
   *  둘 중 하나라도 모르면 false 입니다. 모르는 것을 「급하다」로 바꾸지
   *  않습니다.
   */
  runsOutBeforeNextVisit: boolean
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

const STOCK_KEYS: StockKey[] = ['corrugated_box', 'plastic_container', 'bag', 'needle_box']

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

  //  다음에 그 병원에 가는 날. 「그때 같이 가져다 드립니다」의 근거입니다.
  //  예전에는 화면(PortalSupplies)이 따로 계산했는데, 추천 문구는 그 날짜를
  //  모른 채 만들어졌습니다. 같은 값을 두 곳에서 세지 않도록 여기로 옮깁니다.
  const nextVisitOn =
    (data.schedules ?? [])
      .filter((s) => s.clientId === clientId && s.status !== '완료' && !s.canceledAt && s.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))[0]?.date ?? null

  // ── 실제로 그 병원에 들어간 물량 ──────────────────────────────────────────
  //
  //  ⚠ 예전에는 **자재공급 기록(materials)만** 봤습니다. 그런데 병원이 포털로
  //    주문해서 받은 물량은 거기 안 남습니다 — 전달할 때 재고와 원장
  //    (material_transactions)만 건드리고 materials 에는 안 씁니다.
  //
  //    그래서 병원이 박스 20개를 사서 받아도 추천은 그걸 못 보고, 그다음 주에
  //    또 「마지막 공급 46일 전 · 이번에 필요」라고 권했습니다. 방금 받은
  //    사람에게 또 사라고 하는 것입니다 — 근거 없는 추천이 됩니다.
  //
  //    두 갈래를 합쳐서 봅니다.
  //      · 자재공급(materials)      우리가 가져다 드린 것
  //      · 전달 완료한 소모품 주문   병원이 사서 받은 것
  //    둘은 같은 표에 안 들어가므로 두 번 세지 않습니다.
  type Ev = { date: string; key: string; stockKey: StockKey | null; productId: string | null; label: string; qty: number }
  const evs: Ev[] = []

  for (const m of (data.materials ?? []).filter(
    (x) => x.clientId === clientId && x.date >= from && x.date <= today,
  )) {
    for (const [k, n] of Object.entries(qtyOf(m)) as [StockKey, number][]) {
      if (!n || n <= 0) continue
      evs.push({ date: m.date, key: k, stockKey: k, productId: null, label: LABEL[k], qty: n })
    }
  }

  for (const o of (data.productOrders ?? []).filter(
    (x) =>
      x.clientId === clientId &&
      x.status === '전달완료' &&
      !!x.deliveredAt &&
      x.deliveredAt.slice(0, 10) >= from &&
      x.deliveredAt.slice(0, 10) <= today,
  )) {
    const on = (o.deliveredAt as string).slice(0, 10)
    for (const it of o.items) {
      if (!it.qty || it.qty <= 0) continue
      const sk = (STOCK_KEYS as string[]).includes(it.stockKey ?? '') ? (it.stockKey as StockKey) : null
      //  재고를 두지 않는 상품은 상품 자체로 따라갑니다. 상품 id 도 없으면
      //  무엇인지 알 수 없으므로 세지 않습니다 — 이름만으로 묶으면 규격이
      //  다른 물건이 한 줄로 합쳐집니다.
      if (!sk && !it.productId) continue
      evs.push({
        date: on,
        key: sk ?? `product:${it.productId}`,
        stockKey: sk,
        productId: sk ? null : it.productId,
        label: sk ? LABEL[sk] : `${it.name}${it.spec ? ` ${it.spec}` : ''}`,
        qty: it.qty,
      })
    }
  }

  const byKey = new Map<string, Ev[]>()
  for (const e of evs) {
    const cur = byKey.get(e.key) ?? []
    cur.push(e)
    byKey.set(e.key, cur)
  }

  const needs: SupplyNeed[] = []
  for (const [key, rowsRaw] of byKey) {
    const rows = [...rowsRaw].sort((a, b) => a.date.localeCompare(b.date))
    //  한 번뿐이면 「주기」가 아닙니다 — 추천하지 않습니다.
    //  ⚠ 같은 날 두 건이 들어온 것도 **한 번**입니다. 하루에 두 줄 적었다고
    //    주기를 아는 것이 아닙니다.
    const days = [...new Set(rows.map((r) => r.date))]
    if (days.length < MIN_SUPPLIES_FOR_NEED) continue
    const total = rows.reduce((s2, r) => s2 + r.qty, 0)
    const times = days.length
    const lastDate = days[days.length - 1]
    const firstDate = days[0]
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
    //  둘 중 하나라도 모르면 false 입니다 — 모르는 것을 「급하다」로 바꾸지 않습니다.
    const runsOutBeforeNextVisit = dueOn != null && nextVisitOn != null && dueOn < nextVisitOn
    const head0 = rows[0]

    needs.push({
      stockKey: head0.stockKey,
      productId: head0.productId,
      key,
      label: head0.label,
      total,
      times,
      perMonth,
      lastDate,
      daysSince,
      cycleDays,
      suggestQty,
      dueOn,
      due,
      nextVisitOn,
      runsOutBeforeNextVisit,
      why:
        `최근 ${Math.round((span / 30) * 10) / 10}개월 동안 ${times}번 · 모두 ${total}개 ` +
        `(한 달 ${perMonth}개꼴) · 마지막 ${lastDate} (${daysSince}일 전)` +
        (cycleDays ? ` · 평균 ${cycleDays}일에 한 번` : '') +
        //  ⚠ 다음 수거일은 **있을 때만** 붙입니다. 예정이 없는데 「다음 수거
        //    때 같이」라고 하면 오지 않는 날을 약속하는 것이 됩니다.
        (nextVisitOn ? ` · 다음 수거 ${nextVisitOn}` : ''),
    })
  }

  //  다음 수거 전에 떨어질 것 먼저 → 지난 것 → 그다음 많이 쓰는 것.
  //
  //   「다음에 갈 때 안 실으면 그 사이에 떨어진다」가 병원이 지금 결정해야
  //   하는 유일한 것입니다. 그것을 맨 위로 올립니다.
  needs.sort((a, b) => {
    if (a.runsOutBeforeNextVisit !== b.runsOutBeforeNextVisit) return a.runsOutBeforeNextVisit ? -1 : 1
    if (a.due !== b.due) return a.due ? -1 : 1
    return b.perMonth - a.perMonth
  })

  const supplyCount = new Set(evs.map((e) => `${e.date}|${e.key}`)).size

  return {
    clientId,
    needs,
    supplyCount,
    blocked:
      needs.length > 0
        ? ''
        : evs.length === 0
          ? `최근 ${NEEDS_WINDOW_DAYS}일 안에 자재를 가져다 드린 기록이 없어 추천할 사용 이력이 아직 충분하지 않습니다.`
          : `추천할 사용 이력이 아직 충분하지 않습니다 — 같은 물품을 ${MIN_SUPPLIES_FOR_NEED}번 이상 받으신 기록이 있어야 사용 주기를 알 수 있습니다.`,
  }
}
