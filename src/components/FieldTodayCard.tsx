import { Link } from 'react-router-dom'
import { ArrowRight, ClipboardCheck } from 'lucide-react'
import { useData } from '../context/DataContext'
import { useAuth } from '../context/AuthContext'
import { fieldDay, lastCollectionLine, lastCollectionOf } from '../lib/fieldActivity'

// ─────────────────────────────────────────────────────────────────────────────
// 오늘 현장에서 들어온 입력 — 대표·사무실 화면
//
//  이사님이 사무실에 앉아 「오늘 현장에서 뭐가 들어왔나」를 알 방법이
//  없었습니다. 수거이력을 열어 날짜로 걸러야 했습니다.
//
//  ⚠ 「잘했다」를 시스템이 매기지 않습니다 — 언제·누가·얼마만 적습니다.
//  ⚠ 금액은 한 칸도 없습니다. kg 까지입니다.
//  ⚠ 아직 아무것도 안 들어왔으면 **아무것도 그리지 않습니다.** 아침마다
//    「0건」이 떠 있으면 곧 안 보게 됩니다.
// ─────────────────────────────────────────────────────────────────────────────

export function FieldTodayCard() {
  const { data } = useData()
  const { role } = useAuth()
  //  현장 담당자에게는 안 띄웁니다 — 자기가 방금 넣은 것을 다시 보여 줄
  //  이유가 없고, 남이 넣은 것까지 볼 자리도 아닙니다.
  if (role === 'field' || role === 'client') return null

  const day = fieldDay(data)
  if (day.inputs.length === 0) return null

  const FIRST = 5
  const shown = day.inputs.slice(0, FIRST)
  const rest = day.inputs.length - shown.length

  return (
    <section data-field-today className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-600">
          <ClipboardCheck size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <p data-field-today-headline className="break-keep text-[1.12rem] font-extrabold leading-snug text-navy-900">
            오늘 현장에서 {day.inputs.length}건 들어왔습니다
          </p>
          <p className="t-caption mt-0.5 break-keep text-navy-500">
            {day.clients}곳 · 모두 {day.totalKg.toLocaleString('ko-KR')}kg
            {day.adHoc > 0 && ` · 예정에 없던 수거 ${day.adHoc}건`}
          </p>
        </div>
      </div>

      <ul className="mt-3 flex flex-col gap-1.5">
        {shown.map((i) => (
          <li
            key={i.scheduleId}
            data-field-input={i.clientId}
            className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-navy-50/60 px-3.5 py-2.5"
          >
            {i.atTime && (
              <span className="t-caption shrink-0 tabular-nums font-bold text-navy-400">{i.atTime}</span>
            )}
            <Link
              to={`/clients/${i.clientId}`}
              className="min-w-0 break-keep text-[1.03rem] font-bold text-navy-900 underline-offset-4 hover:underline"
            >
              {i.clientName}
            </Link>
            <span className="t-caption shrink-0 tabular-nums font-bold text-teal-700">
              {i.amountKg.toLocaleString('ko-KR')}kg
            </span>
            {/*  이름이 안 적혀 있으면 지어내지 않고 그 자리를 비웁니다. */}
            {i.who && <span className="t-caption shrink-0 text-navy-500">{i.who}</span>}
            {i.adHoc && <span className="pill shrink-0 bg-amber-100 text-amber-700">예정 외</span>}
          </li>
        ))}
      </ul>

      {rest > 0 && (
        <Link
          to="/history"
          data-field-today-more
          className="mt-2 inline-flex items-center gap-1 text-[0.98rem] font-bold text-teal-700 underline-offset-2 hover:underline"
        >
          나머지 {rest}건 보기
          <ArrowRight size={13} strokeWidth={2.6} />
        </Link>
      )}

      {day.noName > 0 && (
        <p data-field-noname className="t-caption mt-2 break-keep text-navy-400">
          {day.noName}건은 기사 이름이 안 적혀 있습니다 — 수거 입력의 「기사」 칸을 채우면 여기에 함께 보입니다.
        </p>
      )}
    </section>
  )
}

/**
 * 거래처에 붙는 마지막 수거 한 줄.
 *
 *  「8월 16일 · 김준기 · 120kg」. **사실만** 적습니다 — 잘했다/못했다를
 *  매기지 않습니다. 기록이 없으면 그렇게 말합니다.
 */
export function LastCollectionLine({ clientId, className = '' }: { clientId: string; className?: string }) {
  const { data } = useData()
  const last = lastCollectionOf(data, clientId)
  if (!last) {
    return (
      <span data-last-collection={clientId} className={`t-caption text-navy-300 ${className}`}>
        수거 기록 없음
      </span>
    )
  }
  return (
    <span data-last-collection={clientId} className={`t-caption text-navy-500 ${className}`}>
      마지막 수거 {lastCollectionLine(last)}
    </span>
  )
}
