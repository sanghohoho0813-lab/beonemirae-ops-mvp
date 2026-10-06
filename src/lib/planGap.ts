import type { AppData } from '../types'
import { today } from './format'
import { addDays } from './performance'
import { isDone, isPending } from './scheduleLive'
import { visitGapOf } from './urgentRisk'

// ─────────────────────────────────────────────────────────────────────────────
// 다음 방문이 안 잡힌 단골 거래처 (0132)
//
//  일정은 「일정 편성」에서 1~4주씩 미리 만듭니다. 그 묶음이 끝나는 날을
//  아무도 알려 주지 않아서, 다음 묶음을 깜빡하면 **그 주 오늘 일정이 그냥
//  비었습니다.** 병원이 「왜 안 오세요」 전화를 해야 알았습니다
//  (의료폐기물은 보관 기한이 있어 하루 이틀 밀려도 문제가 됩니다).
//
//  근거 — 이미 쌓인 기록만 씁니다:
//   · 최근 120일 실제 방문 간격의 중앙값 (urgentRisk 와 같은 계산)
//   · 마지막으로 다녀온 날 + 그 간격 = 「평소라면 다음에 갈 날」
//   · 그날이 7일 안인데, 그때까지 잡힌 예정이 하나도 없으면 표시
//
//  ⚠ 기록이 모자라면(완료 3번 미만) 아무 말도 하지 않습니다 — 지어낸 주기 금지.
//  ⚠ 계약이 끝난 곳은 보지 않습니다.
//  ⚠ 일정을 시스템이 만들지 않습니다. 사람이 「일정 편성」에서 확인하고 만듭니다.
// ─────────────────────────────────────────────────────────────────────────────

/** 이 안에 「평소라면 갈 날」이 오면 봅니다 */
export const PLAN_HORIZON_DAYS = 7
/** 방문 간격을 읽는 기간 */
const LOOKBACK = 120

export interface PlanGap {
  clientId: string
  clientName: string
  /** 마지막으로 다녀온 날 */
  lastDone: string
  /** 실제 방문 간격(중앙값, 일) */
  usualGap: number
  /** 평소라면 다음에 갈 날 */
  dueDate: string
}

export function planGaps(data: AppData, now = today()): PlanGap[] {
  const from = addDays(now, -LOOKBACK)
  const soon = addDays(now, PLAN_HORIZON_DAYS)
  const out: PlanGap[] = []
  for (const c of data.clients) {
    if (c.contractEnd && c.contractEnd < now) continue
    const usualGap = visitGapOf(data.schedules, c.id, from, now)
    if (usualGap == null || usualGap <= 0) continue
    const lastDone = data.schedules
      .filter((s) => s.clientId === c.id && isDone(s) && s.date <= now)
      .reduce((m, s) => (s.date > m ? s.date : m), '')
    if (!lastDone) continue
    const dueDate = addDays(lastDone, usualGap)
    if (dueDate > soon) continue
    //  「평소라면 갈 날」 조금 뒤까지 — 하루 이틀 늦게 잡아 둔 것은 잡힌 것으로 봅니다.
    const until = addDays(dueDate > now ? dueDate : now, Math.max(3, Math.ceil(usualGap / 2)))
    const booked = data.schedules.some((s) => s.clientId === c.id && isPending(s) && s.date >= now && s.date <= until)
    if (booked) continue
    out.push({ clientId: c.id, clientName: c.name, lastDone, usualGap, dueDate })
  }
  return out.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.clientName.localeCompare(b.clientName, 'ko'))
}
