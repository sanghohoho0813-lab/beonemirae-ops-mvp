import type { AppData, MonthCloseStep, Payment } from '../types'
import { monthClose } from './monthClose'
import { taxInvoiceList } from './taxInvoice'
import { outstandingOf, paidTotalOf } from './selectors'
import { today } from './format'
import { isPending } from './scheduleLive'

// ─────────────────────────────────────────────────────────────────────────────
// 월 마감 진행상황
//
//  한 달을 마감하는 일은 여섯 단계입니다.
//
//   수거 입력 → 정산 확인 → 청구 확정 → 거래명세서 → 세금계산서 → 입금 대사
//
//  그런데 이 여섯이 세 화면(월말 청구 · 통장 대사 · 미수금 관리)에 흩어져
//  있어서, 「이번 달 어디까지 했지」를 알려면 화면을 돌아다녀야 했습니다.
//  중간에 다른 일이 끼면 어디서 멈췄는지 기억에 의존하게 되고, 한 단계를
//  통째로 빠뜨려도 아무도 알려 주지 않습니다.
//
//  한 화면에서 각 단계가 지금 어떤 상태인지, 남은 것이 몇 건인지, 무엇을
//  하면 되는지를 봅니다.
//
//  ── 없는 것을 안다고 말하지 않습니다 ──────────────────────────────────
//
//   시스템이 아는 것과 모르는 것을 구분합니다.
//
//    아는 것   수거가 몇 건 들어왔는지 · 청구를 확정했는지 · 입금이 붙었는지
//    모르는 것 명세서를 실제로 인쇄해 병원에 보냈는지 ·
//              홈택스에 실제로 세금계산서를 발행했는지
//
//   모르는 것을 「끝」으로 칠하면 대표님이 안 한 일을 했다고 믿게 됩니다.
//   그래서 그 두 단계는 「준비됨」까지만 말하고, 보냈는지는 시스템이
//   모른다고 화면에 적습니다.
//
//   숫자에는 출처를 함께 답니다 — 어느 기록에서 나온 값인지.
// ─────────────────────────────────────────────────────────────────────────────

export type StepState =
  /** 해야 할 것이 남아 있음 */
  | '남음'
  /** 사람이 눈으로 봐야 함 (이상치 · 기본 단가 · 부가세 미지정) */
  | '확인'
  /** 시스템이 할 수 있는 데까지 했음. 실제로 보냈는지는 사람만 앎 */
  | '준비됨'
  /** 남은 것이 없음 */
  | '끝'
  /** 이 달에는 해당하지 않음 */
  | '해당 없음'

export interface ProgressStep {
  key: 'collect' | 'settle' | 'confirm' | 'invoice' | 'tax' | 'bank'
  label: string
  state: StepState
  /** 지금 상태 한 줄 */
  detail: string
  /** 이 숫자가 어디서 나온 값인지 */
  source: string
  /** 남은 것이 있으면 무엇을 하면 되는지 (없으면 빈 문자열) */
  todo: string
  /** 그 일을 하는 화면 */
  to: string
  linkLabel: string
}

export interface MonthProgress {
  month: string
  steps: ProgressStep[]
  /** 남은 것이 없는 단계 수 (준비됨·끝·해당 없음) */
  done: number
  /** 지금 손대야 할 첫 단계 (없으면 undefined) */
  next?: ProgressStep
  /** 그 달 확정한 청구 합계 */
  billed: number
  /** 그 달 청구 중 실제로 받은 돈 */
  collected: number
  /** 그 달 청구 중 아직 못 받은 돈 (부분입금 반영) */
  outstanding: number
}

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`

/** 남은 일이 있는 단계인가 */
function pending(s: StepState): boolean {
  return s === '남음' || s === '확인'
}

export function monthProgress(data: AppData, month: string): MonthProgress {
  const t = today()
  const close = monthClose(data, month)
  const tax = taxInvoiceList(data, month)

  //  사람이 「보냈다 / 발행했다」고 눌러 둔 기록 (0054).
  //  시스템이 스스로 채우는 값이 아닙니다 — 없으면 「준비됨」 그대로입니다.
  const markOf = (step: MonthCloseStep) =>
    (data.monthCloseMarks ?? []).find((m) => m.month === month && m.step === step)
  const sentMark = markOf('invoice_sent')
  const taxMark = markOf('tax_issued')
  const markedBy = (m: { markedName: string; markedAt: string }) =>
    `${m.markedName || '누군가'}님이 ${m.markedAt.slice(0, 10)} 표시`

  //  그 달 청구 — 취소한 것은 청구한 적 없는 것으로 셉니다(0037 과 같은 규칙).
  const bills: Payment[] = data.payments.filter((p) => p.billingMonth === month && p.status !== '취소')
  const billed = bills.reduce((s, p) => s + p.amount, 0)
  const collected = bills.reduce((s, p) => s + paidTotalOf(data, p), 0)
  const outstanding = bills.reduce((s, p) => s + outstandingOf(data, p), 0)
  const unpaid = bills.filter((p) => outstandingOf(data, p) > 0)
  const invoices = bills.filter((p) => p.snapshot?.invoice).length

  // ── 1. 수거 입력 ──────────────────────────────────────────────────────────
  //  아직 오지 않은 예정은 할 일이 아닙니다. 오늘까지 지났는데 완료로
  //  바뀌지 않은 것만 셉니다.
  const inMonth = data.schedules.filter((s) => s.date.startsWith(month))
  const doneCount = inMonth.filter((s) => s.status === '완료').length
  const late = inMonth.filter((s) => isPending(s) && s.date <= t)
  const future = inMonth.filter((s) => isPending(s) && s.date > t).length

  const collect: ProgressStep =
    late.length > 0
      ? {
          key: 'collect', label: '수거 입력', state: '남음',
          detail: `입력 대기 ${late.length}건 (완료 ${doneCount}건)`,
          source: '수거 일정 기록',
          todo: `${late[0].date.slice(5)} 부터 ${late.length}건이 예정인 채로 남아 있습니다`,
          to: '/today', linkLabel: '오늘 일정에서 입력',
        }
      : doneCount + future === 0
        ? {
            key: 'collect', label: '수거 입력', state: '해당 없음',
            detail: '이 달에는 수거 기록이 없습니다', source: '수거 일정 기록',
            todo: '', to: '/today', linkLabel: '오늘 일정',
          }
        : {
            key: 'collect', label: '수거 입력', state: future > 0 ? '남음' : '끝',
            detail: future > 0 ? `완료 ${doneCount}건 · 남은 예정 ${future}건` : `수거 ${doneCount}건 완료`,
            source: '수거 일정 기록',
            todo: future > 0 ? '아직 오지 않은 예정이 남아 있습니다 — 그 날이 지나면 입력합니다' : '',
            to: '/today', linkLabel: '오늘 일정',
          }

  // ── 2. 정산 확인 ──────────────────────────────────────────────────────────
  //  확정하기 전에 사람이 봐야 하는 것 — 기본 단가로 계산된 곳과 평소와
  //  크게 다른 수량. 그대로 확정하면 병원에 잘못된 금액이 나갑니다.
  const flags: string[] = []
  if (close.defaultPricedCount > 0) flags.push(`기본 단가 ${close.defaultPricedCount}곳`)
  if (close.oddAmountCount > 0) flags.push(`평소와 다른 수량 ${close.oddAmountCount}곳`)

  const settle: ProgressStep =
    flags.length > 0
      ? {
          key: 'settle', label: '정산 확인', state: '확인',
          detail: flags.join(' · '),
          source: '거래처 단가 · 최근 6개월 수거 기록',
          todo: '그대로 확정하면 추정 금액이나 잘못 입력된 수량이 병원에 나갑니다',
          to: '/pricing', linkLabel: '거래처 점검',
        }
      : close.ready.length > 0
        ? {
            key: 'settle', label: '정산 확인', state: '끝',
            detail: `${close.ready.length}곳 · 확인할 것 없음`,
            source: '거래처 단가 · 최근 6개월 수거 기록',
            todo: '', to: '/pricing', linkLabel: '거래처 점검',
          }
        : {
            key: 'settle', label: '정산 확인', state: '해당 없음',
            detail: '확정을 기다리는 정산이 없습니다',
            source: '거래처 단가 · 최근 6개월 수거 기록',
            todo: '', to: '/pricing', linkLabel: '거래처 점검',
          }

  // ── 3. 청구 확정 ──────────────────────────────────────────────────────────
  const checkNote =
    close.needsCheck.length > 0 ? ` · 확인 필요 ${close.needsCheck.length}곳(월정액인데 수거 없음)` : ''
  const confirm: ProgressStep =
    close.ready.length > 0
      ? {
          key: 'confirm', label: '청구 확정', state: '남음',
          detail: `확정 대기 ${close.ready.length}곳 · ${won(close.total)}${checkNote}`,
          source: '확정하지 않은 수거 · 공급 기록',
          todo: '청구가 있어야 명세서 · 세금계산서 · 통장 대사가 붙을 곳이 생깁니다',
          to: '/billing', linkLabel: '월말 청구',
        }
      : bills.length > 0
        ? {
            key: 'confirm', label: '청구 확정', state: close.needsCheck.length > 0 ? '확인' : '끝',
            detail: `청구 ${bills.length}건 · ${won(billed)} 확정${checkNote}`,
            source: '확정한 청구 (payments)',
            todo: close.needsCheck.length > 0 ? '월정액 계약인데 그 달 수거 기록이 없는 곳이 있습니다' : '',
            to: '/billing', linkLabel: '월말 청구',
          }
        : {
            key: 'confirm', label: '청구 확정', state: '해당 없음',
            detail: '이 달에 확정할 청구가 없습니다',
            source: '확정한 청구 (payments)',
            todo: '', to: '/billing', linkLabel: '월말 청구',
          }

  // ── 4. 거래명세서 ─────────────────────────────────────────────────────────
  //  뽑을 수 있다는 것까지만 압니다. 실제로 인쇄해 병원에 보냈는지는
  //  시스템에 남지 않습니다 — 「끝」이라고 말하지 않습니다.
  const invoice: ProgressStep =
    invoices > 0
      ? sentMark
        ? {
            //  사람이 눌렀을 때만 「끝」입니다. 시스템이 스스로 이 상태로
            //  가지 않습니다 — 안 보낸 명세서를 보냈다고 믿게 하면
            //  병원에 청구서가 안 간 채 한 달이 지나갑니다.
            key: 'invoice', label: '거래명세서', state: '끝',
            detail: `${invoices}장 · ${markedBy(sentMark)}${sentMark.note ? ` (${sentMark.note})` : ''}`,
            source: '사람이 표시한 기록 (0054)',
            todo: '', to: '/billing', linkLabel: '한 번에 인쇄',
          }
        : {
            key: 'invoice', label: '거래명세서', state: '준비됨',
            detail: `${invoices}장 뽑을 수 있음`,
            source: '확정 순간 굳혀 둔 명세서',
            todo: '병원에 보냈는지는 시스템이 알지 못합니다 — 보내셨으면 아래에서 표시해 주세요',
            to: '/billing', linkLabel: '한 번에 인쇄',
          }
      : {
          key: 'invoice', label: '거래명세서', state: '해당 없음',
          detail: '청구를 확정하면 그때 굳힌 명세서가 생깁니다',
          source: '확정 순간 굳혀 둔 명세서',
          todo: '', to: '/billing', linkLabel: '월말 청구',
        }

  // ── 5. 세금계산서 자료 ────────────────────────────────────────────────────
  const taxStep: ProgressStep =
    tax.needsCheck.length > 0
      ? {
          key: 'tax', label: '세금계산서 자료', state: '확인',
          detail: `발행 가능 ${tax.ready.length}건 · 확인 필요 ${tax.needsCheck.length}건`,
          source: '확정한 청구 + 거래처 사업자정보',
          todo: '사업자등록번호나 부가세 처리 방식이 비어 있으면 세액을 계산하지 않습니다',
          to: '/pricing', linkLabel: '거래처 점검에서 채우기',
        }
      : tax.ready.length > 0
        ? taxMark
          ? {
              key: 'tax', label: '세금계산서 자료', state: '끝',
              detail:
                `${tax.ready.length}건 · ${markedBy(taxMark)}` +
                `${taxMark.note ? ` (${taxMark.note})` : ''}`,
              source: '사람이 표시한 기록 (0054)',
              todo: '', to: '/billing', linkLabel: '발행 자료 보기',
            }
          : {
              key: 'tax', label: '세금계산서 자료', state: '준비됨',
              detail: `${tax.ready.length}건 · 공급가액 ${won(tax.supplyTotal)} · 세액 ${won(tax.vatTotal)}`,
              source: '확정한 청구 + 거래처 사업자정보',
              todo: '홈택스에 실제로 발행했는지는 시스템이 알지 못합니다 — 발행하셨으면 아래에서 표시해 주세요',
              to: '/billing', linkLabel: '발행 자료 보기',
            }
        : {
            key: 'tax', label: '세금계산서 자료', state: '해당 없음',
            detail: '확정한 청구가 있어야 발행 자료가 생깁니다',
            source: '확정한 청구 + 거래처 사업자정보',
            todo: '', to: '/billing', linkLabel: '월말 청구',
          }

  // ── 6. 입금 대사 ──────────────────────────────────────────────────────────
  const bank: ProgressStep =
    unpaid.length > 0
      ? {
          key: 'bank', label: '입금 대사', state: '남음',
          detail: `입금 대기 ${unpaid.length}곳 · 남은 ${won(outstanding)}`,
          source: '청구액 − 입금 기록(부분입금 포함)',
          todo: '통장 파일을 올리면 이름과 금액이 맞는 건은 자동으로 붙습니다',
          to: '/bank', linkLabel: '통장 대사',
        }
      : bills.length > 0
        ? {
            key: 'bank', label: '입금 대사', state: '끝',
            detail: `${won(collected)} 전액 입금`,
            source: '청구액 − 입금 기록(부분입금 포함)',
            todo: '', to: '/receivables', linkLabel: '미수금 관리',
          }
        : {
            key: 'bank', label: '입금 대사', state: '해당 없음',
            detail: '청구가 있어야 입금을 붙일 수 있습니다',
            source: '청구액 − 입금 기록(부분입금 포함)',
            todo: '', to: '/bank', linkLabel: '통장 대사',
          }

  const steps = [collect, settle, confirm, invoice, taxStep, bank]
  return {
    month,
    steps,
    done: steps.filter((s) => !pending(s.state)).length,
    next: steps.find((s) => pending(s.state)),
    billed,
    collected,
    outstanding,
  }
}
