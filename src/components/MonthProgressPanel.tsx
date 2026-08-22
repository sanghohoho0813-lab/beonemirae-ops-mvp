import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, Check, CircleDashed, Clock } from 'lucide-react'
import { monthProgress, type ProgressStep, type StepState } from '../lib/monthProgress'
import { useData } from '../context/DataContext'
import { useAuth } from '../context/AuthContext'
import { setMonthCloseMark } from '../lib/repo'
import { won } from '../lib/format'
import { ExpandableSection } from './ui'
import type { MonthCloseStep } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// 월 마감 진행상황 — 「이번 달 어디까지 했지」
//
//  여섯 단계가 세 화면에 흩어져 있어서, 어디서 멈췄는지 알려면 화면을
//  돌아다녀야 했습니다. 한 자리에서 봅니다.
//
//  스스로 칠하지 않는 것
//
//   명세서를 보냈는지, 홈택스에 발행했는지는 시스템이 알 수 없습니다.
//   그것을 시스템이 초록색 「끝」으로 칠하면 안 한 일을 했다고 믿게 됩니다.
//
//   그래서 **사람이 눌러 기록한 것만** 끝으로 봅니다(0054). 누르기 전에는
//   「준비됨」에 머물고, 누른 뒤에는 누가 언제 눌렀는지가 함께 남습니다.
//   시스템이 대신 판단하는 자리가 아니라, 사람이 한 일을 적어 두는 자리입니다.
// ─────────────────────────────────────────────────────────────────────────────

const STYLE: Record<StepState, { chip: string; ring: string; icon: typeof Check }> = {
  남음: { chip: 'bg-navy-800 text-white', ring: 'border-navy-200', icon: Clock },
  확인: { chip: 'bg-amber-100 text-amber-700', ring: 'border-amber-200', icon: AlertTriangle },
  준비됨: { chip: 'bg-sky-100 text-sky-700', ring: 'border-sky-200', icon: Check },
  끝: { chip: 'bg-teal-100 text-teal-700', ring: 'border-teal-200', icon: Check },
  '해당 없음': { chip: 'bg-navy-50 text-navy-400', ring: 'border-navy-100', icon: CircleDashed },
}

function StepCard({ step, order }: { step: ProgressStep; order: number }) {
  const s = STYLE[step.state]
  const Icon = s.icon
  const faded = step.state === '해당 없음'
  return (
    <div
      data-progress-step={step.key}
      className={`card flex flex-col gap-2 border p-4 ${s.ring} ${faded ? 'opacity-70' : ''}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-navy-50 text-[0.92rem] font-black text-navy-400">
          {order}
        </span>
        <span className="min-w-0 flex-1 break-keep font-bold text-navy-900">{step.label}</span>
        <span
          data-progress-state={step.key}
          className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[0.95rem] font-bold ${s.chip}`}
        >
          <Icon size={13} strokeWidth={2.6} />
          {step.state}
        </span>
      </div>

      <p className="break-keep text-[1.05rem] font-bold leading-snug text-navy-800">{step.detail}</p>

      {step.todo && (
        <p className="break-keep text-[0.98rem] leading-snug text-navy-500">{step.todo}</p>
      )}

      {/*  숫자가 어디서 온 값인지 — 추정과 실제를 섞지 않기 위해 늘 적습니다 */}
      <p data-progress-source={step.key} className="break-keep text-[0.94rem] leading-snug text-navy-300">
        출처 · {step.source}
      </p>

      <Link
        to={step.to}
        data-progress-link={step.key}
        className="mt-auto inline-flex min-h-[2.75rem] items-center gap-1 self-start rounded-full bg-navy-50 px-4 py-2.5 text-[0.98rem] font-bold text-navy-600 transition hover:bg-navy-100"
      >
        {step.linkLabel}
        <ArrowRight size={14} strokeWidth={2.6} />
      </Link>
    </div>
  )
}

/**
 * 「보냈습니다 / 발행했습니다」 표시.
 *
 *  관리자만 누를 수 있습니다(서버도 같은 규칙). 다른 역할에게는 누가
 *  표시해 뒀는지만 읽기로 보입니다 — 사무실도 「이사님이 보냈나」를
 *  알아야 하기 때문입니다.
 */
function MarkBox({ month }: { month: string }) {
  const { data, reload } = useData()
  const { role } = useAuth()
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const canMark = role === 'admin'

  const STEPS: Array<{ step: MonthCloseStep; label: string; hint: string }> = [
    { step: 'invoice_sent', label: '거래명세서를 병원에 보냈습니다', hint: '우편·이메일·직접 전달 — 방법은 상관없습니다' },
    { step: 'tax_issued', label: '홈택스에 세금계산서를 발행했습니다', hint: '실제 발행까지 끝난 뒤에 눌러 주세요' },
  ]

  async function toggle(step: MonthCloseStep, done: boolean) {
    setBusy(step)
    setErr('')
    try {
      await setMonthCloseMark(month, step, done)
      await reload()
    } catch (e) {
      setErr(e instanceof Error ? e.message : '표시하지 못했습니다.')
    }
    setBusy('')
  }

  //  폰에서 접었다 폈다 — 넓은 화면에서는 이 값과 무관하게 늘 보입니다.
  const [marksOpen, setMarksOpen] = useState(false)

  //  몇 개나 표시해 뒀는지 — 접었을 때 이 숫자만은 보여야 합니다.
  const markedCount = STEPS.filter(({ step }) =>
    (data.monthCloseMarks ?? []).some((m) => m.month === month && m.step === step),
  ).length

  const rows = (
    <div className="mt-3 flex flex-col gap-2.5">
        {STEPS.map(({ step, label, hint }) => {
          const mark = (data.monthCloseMarks ?? []).find((m) => m.month === month && m.step === step)
          const on = Boolean(mark)
          return (
            <div
              key={step}
              data-mark-row={step}
              className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl px-3.5 py-3 ${
                on ? 'bg-teal-50 ring-1 ring-teal-200' : 'bg-navy-50'
              }`}
            >
              <span className="min-w-0 flex-1 basis-[12rem]">
                <b className="block break-keep text-[1.05rem] text-navy-900">{label}</b>
                <span data-mark-detail={step} className="block break-keep text-[0.96rem] text-navy-500">
                  {mark
                    ? `${mark.markedName || '누군가'}님이 ${mark.markedAt.slice(0, 10)} 표시`
                    : hint}
                </span>
              </span>
              {canMark ? (
                <button
                  data-mark-toggle={step}
                  disabled={busy === step}
                  onClick={() => toggle(step, !on)}
                  className={`shrink-0 rounded-full px-3.5 py-2 text-[1rem] font-bold transition disabled:opacity-50 ${
                    on
                      ? 'bg-white text-navy-500 ring-1 ring-navy-200 hover:text-navy-800'
                      : 'bg-teal-500 text-white hover:bg-teal-600'
                  }`}
                >
                  {busy === step ? '…' : on ? '표시 해제' : '했습니다'}
                </button>
              ) : (
                <span data-mark-readonly={step} className="shrink-0 pill bg-white text-navy-400">
                  {on ? '표시됨' : '대표님이 표시'}
                </span>
              )}
            </div>
          )
        })}
    </div>
  )

  return (
    <div data-mark-box className="card mt-3 p-4 sm:p-5">
      <p className="break-keep text-[1.08rem] font-extrabold text-navy-900">
        사람만 아는 두 가지
        {/*  ⚠ 접었을 때도 **몇 개를 표시해 뒀는지**는 보여야 합니다.
             안 보이면 「나중에 하지」가 아니라 「한 줄이 사라졌다」가 됩니다. */}
        <span data-mark-count className="ml-2 font-bold text-navy-400">{markedCount} / {STEPS.length} 표시함</span>
      </p>
      <p className="mt-1 break-keep text-[0.98rem] leading-snug text-navy-500">
        시스템은 명세서를 뽑을 수 있다는 것까지만 압니다. 실제로 보내고 발행하신 뒤에 여기서 표시해 주시면 그때
        마감이 끝난 것으로 봅니다. 잘못 누르면 다시 눌러 되돌릴 수 있습니다.
      </p>

      {/*  ⚠ 이 두 가지는 **청구를 확정한 뒤에** 하는 일입니다. 그런데 폰에서
           530px 을 차지하고 있어, 정작 지금 눌러야 할 「확정하기」를 y=3,004px
           까지 밀어냈습니다. 폰에서만 접습니다 — 넓은 화면은 그대로입니다.
           지운 것이 아니라 한 번 누르면 그대로 나옵니다. */}
      {/*  ⚠ 두 벌로 그리면 `data-mark-row` 가 DOM 에 **두 번** 생깁니다.
           검사가 늘 숨은 쪽을 집어 「접혀 있다」가 항상 통과했습니다.
           한 벌만 그리고 폰에서만 감춥니다 — 넓은 화면은 늘 보입니다. */}
      <button
        type="button"
        data-mark-open
        onClick={() => setMarksOpen((v) => !v)}
        className="mt-2 flex w-full items-center justify-center gap-1 rounded-2xl bg-navy-50 px-4 py-2.5 text-[1.08rem] font-bold text-navy-600 transition active:scale-[0.99] sm:hidden"
      >
        {marksOpen ? '접기' : '명세서·세금계산서 표시하기'}
      </button>
      <div className={marksOpen ? '' : 'hidden sm:block'}>{rows}</div>

      {err && (
        <p data-mark-error className="mt-2.5 break-keep rounded-xl bg-rose-50 px-3.5 py-2.5 text-[1rem] font-bold text-rose-600">
          {err}
        </p>
      )}
    </div>
  )
}

export function MonthProgressPanel({ month }: { month: string }) {
  const { data } = useData()
  const p = monthProgress(data, month)

  return (
    <section data-progress-panel>
      <div className="card p-4 sm:p-5">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
          <div className="min-w-0 flex-1">
            <p className="break-keep text-[1.03rem] font-semibold text-navy-400">
              {month.replace('-', '년 ')}월 마감 진행상황
            </p>
            <p data-progress-headline className="mt-1 break-keep text-[1.25rem] font-extrabold leading-snug text-navy-900">
              {p.next
                ? `다음 할 일 — ${p.next.label}`
                : '이 달에 시스템이 확인할 수 있는 일은 모두 끝났습니다'}
            </p>
            {p.next && <p className="mt-0.5 break-keep text-[1.02rem] text-navy-500">{p.next.detail}</p>}
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[1.03rem] font-semibold text-navy-400">남은 단계 없음</p>
            <p data-progress-count className="mt-0.5 text-2xl font-extrabold tabular-nums text-navy-900">
              {p.done}
              <span className="text-base text-navy-300"> / {p.steps.length}</span>
            </p>
          </div>
        </div>

        {/*  돈 세 줄 — 확정한 금액과 실제로 받은 돈은 다른 숫자입니다 */}
        <div className="mt-3.5 grid grid-cols-3 gap-2.5 border-t border-navy-100 pt-3.5" data-progress-money>
          <div>
            <p className="text-[0.98rem] font-semibold text-navy-400">확정 청구</p>
            <p className="mt-0.5 break-all text-[1.1rem] font-extrabold tabular-nums text-navy-900">{won(p.billed)}</p>
          </div>
          <div>
            <p className="text-[0.98rem] font-semibold text-navy-400">받은 돈</p>
            <p className="mt-0.5 break-all text-[1.1rem] font-extrabold tabular-nums text-emerald-600">{won(p.collected)}</p>
          </div>
          <div>
            <p className="text-[0.98rem] font-semibold text-navy-400">못 받은 돈</p>
            <p className="mt-0.5 break-all text-[1.1rem] font-extrabold tabular-nums text-rose-500">{won(p.outstanding)}</p>
          </div>
        </div>
      </div>

      {/*
        폰에서는 여섯 장이 세로로 쌓여 화면 세 개가 됩니다. 지금 해야 할
        한 단계만 펼쳐 두고 나머지는 접습니다 — 없애지 않습니다.
        넓은 화면은 여섯 장을 한눈에 봅니다.
      */}
      <div data-progress-grid className="mt-3 hidden gap-3 sm:grid sm:grid-cols-2 xl:grid-cols-3">
        {p.steps.map((s, i) => (
          <StepCard key={s.key} step={s} order={i + 1} />
        ))}
      </div>
      <div className="mt-3 space-y-3 sm:hidden" data-progress-phone>
        {p.next && <StepCard step={p.next} order={p.steps.indexOf(p.next) + 1} />}
        <ExpandableSection label={`나머지 ${p.steps.length - (p.next ? 1 : 0)}단계 보기`}>
          <div className="space-y-3 pt-3">
            {p.steps
              .filter((s) => s !== p.next)
              .map((s) => (
                <StepCard key={s.key} step={s} order={p.steps.indexOf(s) + 1} />
              ))}
          </div>
        </ExpandableSection>
      </div>

      <MarkBox month={month} />

      {/*  바로 위 「사람만 아는 두 가지」 카드가 같은 말을 이미 합니다.
           폰에서는 그 118px 이 정작 눌러야 할 「확정하기」를 밀어냅니다.
           넓은 화면에서는 그대로 둡니다. */}
      <p className="mt-2 hidden break-keep px-1 text-[0.96rem] leading-snug text-navy-400 sm:block">
        명세서를 병원에 보냈는지, 홈택스에 세금계산서를 발행했는지는 시스템이 알 수 없습니다. 시스템이 스스로
        「끝」으로 칠하지 않고, 위에서 표시하신 것만 끝으로 봅니다.
      </p>
    </section>
  )
}
