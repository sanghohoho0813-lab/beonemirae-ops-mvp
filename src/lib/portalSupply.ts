import { SUPPLY_ITEMS, type ItemDef, type ItemKey } from './billing'
import type { AppData, Client } from '../types'
import { today } from './format'

// ─────────────────────────────────────────────────────────────────────────────
// 병원이 주문하는 용기·봉투 — **내부에서 쓰는 규격 그대로** (0092)
//
//  대표님: 「용기 봉투 주문 눌렀을 때 모두 등록이 안 돼 있거든. 이거 비원미래
//  에서 주기적으로 갖다 줘야 되는 그 용기들, 그 정보 그대로 해 가지고 요청할
//  때 다 연동되게 만들어 주면 되거든?」
//
//  ── 왜 비어 있었나 ──────────────────────────────────────────────────────
//
//   주문 창이 `products` 표를 봤습니다. 그 표는 **따로 파는 상품**을 넣는
//   자리이고, 아직 한 줄도 없습니다. 그런데 병원이 정작 필요한 것은
//   「63L 박스」·「20L 합성수지」처럼 **저희가 매주 갖다 드리는 용기**입니다.
//   그건 다른 표(item_buckets / lib/billing.ts ITEMS)에 13 규격으로 이미
//   있고, 기사님이 자재 공급을 입력할 때 쓰는 것과 **같은 목록**입니다.
//
//   그래서 `products` 에 13 줄을 새로 만들어 넣지 않았습니다. 같은 뜻의
//   목록이 둘이 되면 언젠가 갈라집니다. **있는 목록을 그대로 씁니다.**
//
//  ⚠ **판매가를 지어내지 않았습니다.** `products` 에 넣으려면 판매가가
//    있어야 하는데(0원이면 서버가 공급 가능으로 안 켭니다), 이 용기들의
//    병원별 단가는 거래처마다 다르고 계약서에 있습니다. 화면에서 값을
//    만들어 붙이면 그 값이 그대로 청구서에 박힙니다.
//    그래서 주문은 **금액 없이** 나갑니다 — 「무엇을 몇 개」만 적습니다.
//    금액은 지금까지처럼 실제 공급한 수량으로 정산에서 계산됩니다.
//
//  ⚠ 어디로 가는가 — `client_requests` 의 `소모품` 요청입니다.
//    병원이 「용기가 모자란다」고 할 때 쓰던 바로 그 자리이고, 내부
//    요청함에 그대로 뜹니다. 새 표를 만들지 않았습니다.
// ─────────────────────────────────────────────────────────────────────────────

export interface SupplyChoice {
  key: ItemKey
  label: string
  unit: string
  /** 어느 재고 칸에서 나가는가 — 화면에서 묶어 보여 주려고 */
  bucket: string
  /**
   * 월 정산에 반영되는 품목인가.
   *
   *  ⚠ **단가는 안 보여 줍니다.** 거래처별 단가는 계약 자료입니다.
   *    다만 「정산에 반영되는지」는 그 병원 자신의 계약 사실이라 알려
   *    드리는 편이 맞습니다 — 모르고 많이 주문하면 청구서를 보고 놀랍니다.
   */
  billable: boolean
  /** 최근에 실제로 받으신 적이 있는가 (없으면 아래로 내립니다) */
  used: boolean
  /** 마지막으로 받으신 수량 — 실제 공급 기록에서만 */
  lastQty: number | null
  /** 마지막으로 받으신 날 */
  lastOn: string | null
}

const GROUP_ORDER = ['plasticContainer', 'corrugatedBox', 'bag', 'needleBox'] as const
export const GROUP_LABEL: Record<string, string> = {
  plasticContainer: '합성수지 용기',
  corrugatedBox: '골판지 박스',
  bag: '봉투 · 비닐',
  needleBox: '바늘통',
}

/**
 * 이 병원이 고를 수 있는 용기·봉투.
 *
 *  ⚠ 13 규격을 **전부** 보여 줍니다. 「최근에 받은 것만」으로 줄이면,
 *    처음 필요해진 규격을 주문할 방법이 없어집니다.
 *  ⚠ 다만 **받아 보신 것을 위로** 올립니다. 매번 쓰시는 것이 먼저 보여야
 *    합니다.
 *  ⚠ 기저귀를 안 맡기는 병원에는 기저귀 품목을 안 보여 줍니다.
 */
export function supplyChoicesFor(data: AppData, client: Client, now = today()): SupplyChoice[] {
  //  최근 1년의 실제 공급 기록에서 「받아 보신 것」을 봅니다.
  const from = new Date(now)
  from.setFullYear(from.getFullYear() - 1)
  const cut = from.toISOString().slice(0, 10)

  const mine = data.materials
    .filter((m) => m.clientId === client.id && m.date >= cut)
    .sort((a, b) => b.date.localeCompare(a.date))

  const last = new Map<string, { qty: number; on: string }>()
  for (const m of mine) {
    //  ⚠ 규격별 내역(items)이 있는 기록만 봅니다. 예전 네 칸 합계만 있는
    //    기록으로는 「63L 을 몇 개 받으셨는지」를 알 수 없습니다 —
    //    모르는 것을 아는 척하지 않습니다.
    for (const [k, n] of Object.entries(m.items ?? {})) {
      if (!n || n <= 0) continue
      if (!last.has(k)) last.set(k, { qty: n, on: m.date })
    }
  }

  const usable = (i: ItemDef) => {
    const isDiaper = i.key === 'diaperBoxM' || i.key === 'diaperBag40'
    if (isDiaper && !client.collectsDiaper) return false
    //  의료폐기물을 안 맡기는 곳에 용기를 권할 이유가 없습니다.
    if (!isDiaper && !client.collectsMedicalWaste) return false
    return true
  }

  const rows: SupplyChoice[] = SUPPLY_ITEMS.filter(usable).map((i) => {
    const l = last.get(i.key)
    return {
      key: i.key,
      label: i.label,
      unit: i.unit,
      bucket: i.bucket ?? 'corrugatedBox',
      billable: i.billable,
      used: l != null,
      lastQty: l?.qty ?? null,
      lastOn: l?.on ?? null,
    }
  })

  //  받아 보신 것 먼저, 그 안에서는 최근 순. 나머지는 원래 순서대로.
  return rows.sort((a, b) => {
    if (a.used !== b.used) return a.used ? -1 : 1
    if (a.used && b.used) return (b.lastOn ?? '').localeCompare(a.lastOn ?? '')
    return GROUP_ORDER.indexOf(a.bucket as never) - GROUP_ORDER.indexOf(b.bucket as never)
  })
}

/**
 * 고른 것을 요청 한 줄로.
 *
 *  ⚠ 배차·자재 담당이 읽고 그대로 실으면 되는 모양이어야 합니다.
 *    저희가 살을 붙이지 않습니다.
 */
export function buildSupplyContent(
  picked: { label: string; unit: string; qty: number }[],
  why: string,
  note: string,
): string {
  const lines: string[] = []
  lines.push(picked.map((p) => `${p.label} ${p.qty}${p.unit}`).join(' · '))
  if (why) lines.push(why)
  if (note.trim()) lines.push(note.trim())
  return lines.join('\n')
}
