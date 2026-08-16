import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CalendarClock, ChevronDown } from 'lucide-react'
import { useData } from '../context/DataContext'
import { useAuth } from '../context/AuthContext'
import { scanDeadlines, SCAN_MONTHS, type OverdueItem } from '../lib/deadlines'

// ─────────────────────────────────────────────────────────────────────────────
// 밀린 마감 — 화면을 열지 않아도 보이게
//
//  0054 로 「보냈습니다」를 표시할 수 있게 됐지만, 그 표시는 월말 청구
//  화면을 열어야 보입니다. 지지난달을 빠뜨렸어도 그 달을 다시 열 일이
//  없어서 아무도 모릅니다.
//
//  ── 알림을 죽이지 않는 법 ──────────────────────────────────────────────
//
//   매일 뜨는 빨간 줄은 곧 안 보게 됩니다. 그러면 진짜 빠뜨린 달도 같이
//   안 보입니다. 그래서
//
//    · **일이 있던 달만** 셉니다 (수거도 청구도 없는 달은 조용)
//    · **이번 달은 안 셉니다** (아직 안 끝난 달)
//    · 사람이 표시하면 **그 자리에서 사라집니다**
//    · 밀린 것이 없으면 **아무것도 그리지 않습니다** — 「이상 없음」 띠도
//      안 만듭니다. 늘 있는 것은 결국 배경이 됩니다.
//
//  ── 누가 보는가 ────────────────────────────────────────────────────────
//
//   마감은 사무실 일입니다. 현장 담당자에게는 띄우지 않습니다 — 자기가
//   할 수 없는 일이 매일 빨갛게 떠 있으면 화면 전체를 안 믿게 됩니다.
// ─────────────────────────────────────────────────────────────────────────────

function monthLabel(month: string): string {
  const [, m] = month.split('-')
  return `${Number(m)}월`
}

function Row({ item }: { item: OverdueItem }) {
  return (
    <li data-overdue={`${item.month}|${item.kind}`} className="rounded-2xl bg-white/70 px-3.5 py-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="shrink-0 rounded-lg bg-navy-800 px-2 py-0.5 text-[0.95rem] font-bold text-white">
          {monthLabel(item.month)}
        </span>
        <b className="min-w-0 break-keep text-[1.05rem] text-navy-900">{item.label}</b>
        {/*  법정 기한이 아니라 **사실**입니다 — 며칠 지났는가.
             늦었는지 아닌지는 대표님이 정하십니다. */}
        <span data-overdue-days className="t-caption shrink-0 text-navy-400">
          그 달이 끝난 지 {item.daysAfterMonthEnd}일
        </span>
      </div>
      <p className="t-caption mt-1 break-keep leading-snug text-navy-600">{item.detail}</p>
      <Link
        to={item.to}
        className="mt-1.5 inline-flex items-center gap-1 text-[0.98rem] font-bold text-teal-700 underline-offset-2 hover:underline"
      >
        {item.linkLabel}
        <ArrowRight size={13} strokeWidth={2.6} />
      </Link>
    </li>
  )
}

export function DeadlineBanner({ className = '' }: { className?: string } = {}) {
  const { data } = useData()
  const { role } = useAuth()
  const [open, setOpen] = useState(false)

  //  현장 담당자에게는 띄우지 않습니다 — 자기가 할 수 없는 일입니다.
  if (role === 'field' || role === 'client') return null

  const scan = scanDeadlines(data)
  //  밀린 것이 없으면 **아무것도 그리지 않습니다.** 「이상 없음」 띠를
  //  늘 띄우면 그것도 곧 배경이 됩니다.
  if (scan.items.length === 0) return null

  const FIRST = 3
  const shown = open ? scan.items : scan.items.slice(0, FIRST)
  const rest = scan.items.length - shown.length

  return (
    <section data-deadlines className={`card border-amber-200 bg-amber-50/70 p-4 sm:p-5 ${className}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
          <CalendarClock size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <p data-deadlines-headline className="break-keep text-[1.12rem] font-extrabold leading-snug text-navy-900">
            아직 안 끝난 달이 {scan.monthsBehind}개 있습니다
          </p>
          <p className="t-caption mt-0.5 break-keep text-navy-500">
            지난 {SCAN_MONTHS}달을 훑었습니다 · 이번 달은 아직 안 끝나서 빼고 봅니다
          </p>
        </div>
      </div>

      <ul className="mt-3 flex flex-col gap-2">
        {shown.map((i) => (
          <Row key={`${i.month}|${i.kind}`} item={i} />
        ))}
      </ul>

      {(rest > 0 || open) && (
        <button
          data-deadlines-more
          onClick={() => setOpen((v) => !v)}
          className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-2xl bg-white/70 px-3.5 py-2.5 text-[1rem] font-bold text-navy-600 transition hover:bg-white"
        >
          {open ? '접기' : `나머지 ${rest}건 보기`}
          <ChevronDown size={16} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      )}

      {/*  이 띠가 무엇을 근거로 떴는지 — 추정이 아니라는 것을 밝힙니다. */}
      <p className="t-caption mt-2.5 break-keep leading-snug text-navy-500">
        수거 기록·확정한 청구·사람이 표시한 기록에서 나온 것만 적었습니다. 세법 기한은 판단하지 않고, 그 달이
        끝난 지 며칠인지만 적습니다.
      </p>
    </section>
  )
}
