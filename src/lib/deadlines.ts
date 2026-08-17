import type { AppData, MonthCloseStep, Payment } from '../types'
import { today } from './format'
import { outstandingOf } from './selectors'
import { isPending } from './scheduleLive'

// ─────────────────────────────────────────────────────────────────────────────
// 밀린 마감 — 화면을 열지 않아도 보이게
//
//  0054 로 「보냈습니다 / 발행했습니다」를 표시할 수 있게 됐습니다. 그런데
//  그 표시는 **월말 청구 화면을 열어야** 보입니다. 지지난달 세금계산서를
//  빠뜨렸어도 아무도 말해 주지 않습니다 — 그 달을 다시 열어 볼 일이
//  없기 때문입니다.
//
//  여기서는 **지난 몇 달을 거슬러 훑어** 아직 안 끝난 달을 찾습니다.
//
// ── 무엇을 「밀렸다」고 부르는가 ────────────────────────────────────────────
//
//  시스템이 **확실히 아는 것만** 셉니다.
//
//   수거 입력   그날이 지났는데 아직 「완료」가 아닌 일정
//   청구 확정   확정을 기다리는 정산이 남아 있음
//   명세서 발송 청구는 확정됐는데 사람이 「보냈다」고 표시하지 않음
//   세금계산서  청구는 확정됐는데 사람이 「발행했다」고 표시하지 않음
//   입금        결제일이 지났는데 아직 안 들어온 청구
//
//  세지 않는 것 — **법정 기한.** 「다음 달 10일까지」 같은 세법 기한을
//  시스템이 단정하면, 그 판단이 틀렸을 때 책임질 곳이 없습니다. 대신
//  **그 달이 끝난 지 며칠 지났는지**만 사실대로 적습니다. 늦었는지 아닌지는
//  대표님이 정하십니다.
//
//  ⚠ 아무 일도 없던 달은 밀린 것이 아닙니다. 수거도 청구도 없는 달을
//    「청구 확정 안 함」이라고 띄우면, 매달 지워지지 않는 빨간 줄이 생기고
//    사람은 곧 그것을 안 보게 됩니다. 알림이 죽는 가장 흔한 방식입니다.
//
//  ⚠ 이번 달은 훑지 않습니다. 아직 안 끝난 달을 「마감 안 했다」고 하면
//    매달 1일부터 말일까지 계속 울립니다.
//
//  ── 방어가 겹쳐 있습니다 ───────────────────────────────────────────────
//
//   「빈 달은 조용」을 지키는 줄이 세 군데입니다.
//
//     ① 수거도 청구도 없으면 그 달을 건너뜀
//     ② 청구가 없어도 **수거가 있을 때만** 「청구 확정 안 함」이라고 말함
//     ③ 청구가 없으면 그 뒤 단계(명세서·세금계산서·입금)는 아예 안 봄
//
//   하나만 지워도 나머지 둘이 막아 줍니다. 그래서 이빨 확인을 할 때
//   **한 줄씩 되돌리면 「이 방어는 없어도 되네」로 잘못 읽힙니다** —
//   실제로 그렇게 나왔습니다. 셋을 함께 되돌려야 무너집니다(검사 10건 FAIL).
//   일부러 겹쳐 둔 것이니 하나라도 지우지 마십시오.
// ─────────────────────────────────────────────────────────────────────────────

/** 몇 달을 거슬러 보는가 */
export const SCAN_MONTHS = 6

export type OverdueKind = 'collect' | 'confirm' | 'invoice_sent' | 'tax_issued' | 'bank'

export interface OverdueItem {
  month: string
  kind: OverdueKind
  label: string
  /** 실제 숫자 한 줄 — 「3곳 · 1,200,000원」 */
  detail: string
  /** 이 숫자가 어디서 나왔는가 */
  source: string
  /** 그 달이 끝난 지 며칠 */
  daysAfterMonthEnd: number
  to: string
  linkLabel: string
}

export interface DeadlineScan {
  asOf: string
  /** 훑어본 달 (오래된 것부터) */
  months: string[]
  /** 밀린 것 — 오래된 달부터, 같은 달 안에서는 흐름 순서대로 */
  items: OverdueItem[]
  /** 밀린 것이 있는 달 수 */
  monthsBehind: number
}

const pad = (n: number) => String(n).padStart(2, '0')

/** 'YYYY-MM' 에서 n 달 뺀 달 */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const total = y * 12 + (m - 1) + delta
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`
}

/** 그 달의 마지막 날 (YYYY-MM-DD) */
export function monthEnd(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return `${month}-${pad(new Date(y, m, 0).getDate())}`
}

function daysBetweenDates(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime()
  const b = new Date(`${to}T00:00:00Z`).getTime()
  return Math.round((b - a) / 86400000)
}

/**
 * 지난 달들을 훑어 아직 안 끝난 것을 찾습니다.
 *
 *  **읽기만 합니다.** 아무것도 바꾸지 않고, 사람 대신 「끝」으로 표시하지도
 *  않습니다.
 */
export function scanDeadlines(
  data: AppData,
  asOf: string = today(),
  scanMonths: number = SCAN_MONTHS,
): DeadlineScan {
  const thisMonth = asOf.slice(0, 7)
  //  이번 달은 빼고 지난 달부터 거슬러 올라갑니다.
  const months: string[] = []
  for (let i = scanMonths; i >= 1; i--) months.push(shiftMonth(thisMonth, -i))

  const marked = new Set(
    (data.monthCloseMarks ?? []).map((m) => `${m.month}|${m.step}`),
  )
  const hasMark = (month: string, step: MonthCloseStep) => marked.has(`${month}|${step}`)

  const items: OverdueItem[] = []

  for (const month of months) {
    const end = monthEnd(month)
    const days = daysBetweenDates(end, asOf)

    //  ── 그 달에 일이 있었는가 ──────────────────────────────────────────
    //   수거도 청구도 없으면 밀린 것이 아닙니다.
    const inMonth = data.schedules.filter((s) => s.date.startsWith(month))
    const bills: Payment[] = data.payments.filter(
      (p) => p.billingMonth === month && p.status !== '취소' && !p.canceledAt,
    )
    if (inMonth.length === 0 && bills.length === 0) continue

    const base = { month, daysAfterMonthEnd: days }

    // ① 수거 입력 — 그날이 지났는데 아직 완료가 아닌 것
    const late = inMonth.filter((s) => isPending(s) && s.date <= asOf)
    if (late.length > 0) {
      items.push({
        ...base, kind: 'collect', label: '수거 입력',
        detail: `${late.length}건이 예정인 채로 남아 있습니다 (가장 오래된 ${late.map((s) => s.date).sort()[0].slice(5)})`,
        source: '수거 일정 기록',
        to: '/today', linkLabel: '오늘 일정',
      })
    }

    // ② 청구 확정 — 청구가 하나도 없는데 그 달에 수거가 있었음
    //    ⚠ 「확정 대기 몇 곳」은 여기서 세지 않습니다. 그건 단가·월정액
    //      정책까지 봐야 하는 계산이고, 월말 청구 화면이 이미 정확히
    //      보여 줍니다. 여기서는 **한 건도 없다**는 분명한 사실만 말합니다.
    const doneCount = inMonth.filter((s) => s.status === '완료').length
    if (bills.length === 0 && doneCount > 0) {
      items.push({
        ...base, kind: 'confirm', label: '청구 확정',
        detail: `수거 ${doneCount}건이 있는데 확정한 청구가 한 건도 없습니다`,
        source: '수거 기록 · 확정한 청구(payments)',
        to: '/billing', linkLabel: '월말 청구',
      })
      //  청구가 없으면 명세서·세금계산서·입금은 아직 할 수 없는 일입니다.
      continue
    }
    if (bills.length === 0) continue

    const billed = bills.reduce((s, p) => s + p.amount, 0)

    // ③ 거래명세서 발송 — 사람이 표시하지 않음
    if (!hasMark(month, 'invoice_sent')) {
      items.push({
        ...base, kind: 'invoice_sent', label: '거래명세서 발송',
        detail: `청구 ${bills.length}건을 확정했는데 「보냈습니다」 표시가 없습니다`,
        source: '사람이 표시한 기록 (없음)',
        to: '/billing', linkLabel: '월말 청구에서 표시',
      })
    }

    // ④ 세금계산서 발행 — 사람이 표시하지 않음
    if (!hasMark(month, 'tax_issued')) {
      items.push({
        ...base, kind: 'tax_issued', label: '세금계산서 발행',
        detail: `청구 ${bills.length}건을 확정했는데 「발행했습니다」 표시가 없습니다`,
        source: '사람이 표시한 기록 (없음)',
        to: '/billing', linkLabel: '월말 청구에서 표시',
      })
    }

    // ⑤ 입금 — 결제일이 지났는데 안 들어온 것
    const unpaid = bills.filter((p) => outstandingOf(data, p) > 0)
    if (unpaid.length > 0) {
      const left = unpaid.reduce((s, p) => s + outstandingOf(data, p), 0)
      items.push({
        ...base, kind: 'bank', label: '입금',
        detail: `${unpaid.length}곳 · ${left.toLocaleString('ko-KR')}원이 아직 안 들어왔습니다 (확정 ${billed.toLocaleString('ko-KR')}원)`,
        source: '청구액 − 입금 기록(부분입금 포함)',
        to: '/receivables', linkLabel: '미수금 관리',
      })
    }
  }

  //  오래된 달이 먼저입니다 — 3개월 전에 빠뜨린 것이 어제 것보다 급합니다.
  const ORDER: OverdueKind[] = ['collect', 'confirm', 'invoice_sent', 'tax_issued', 'bank']
  items.sort(
    (a, b) => a.month.localeCompare(b.month) || ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind),
  )

  return {
    asOf, months, items,
    monthsBehind: new Set(items.map((i) => i.month)).size,
  }
}
