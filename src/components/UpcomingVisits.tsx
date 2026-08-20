import { useMemo, useState } from 'react'
import { CalendarRange, ChevronDown } from 'lucide-react'
import { useData } from '../context/DataContext'
import { upcomingSchedules } from '../lib/selectors'
import { prettyDate, today } from '../lib/format'
import { WasteBadge } from './Badge'

// ─────────────────────────────────────────────────────────────────────────────
// 앞으로 갈 곳 (0067)
//
//  대표님 말씀: "기사님들이 몇 주~한 달치 스케줄을 미리 전달받고, 본인 일정
//  안에서 방문 순서나 동선을 스스로 조정해 다니는 것으로 보인다."
//
//  그동안 그 스케줄은 종이나 카톡에 있었습니다. 목표는 **앱 하나로** 앞으로
//  갈 곳을 보는 것입니다.
//
//  ⚠ 새 표도 새 화면도 만들지 않습니다. 이미 읽어 둔 일정을 「오늘 일정」
//    화면 안에서 날짜·주차로 묶어 보여 줄 뿐입니다.
//
//  ⚠ **누구 일정을 보여 줄지 화면이 고르지 않습니다.** 현장 계정에는 담당
//    거래처의 일정만 서버가 내려보냅니다(0056). 화면에서 거르면 「화면에는
//    안 보이는데 서버는 주더라」가 되고, 그건 막은 것이 아닙니다.
// ─────────────────────────────────────────────────────────────────────────────

/** 오늘로부터 며칠 뒤인지 → 「이번 주 / 다음 주 / 그 뒤」 */
function bucketOf(dateStr: string, from: string): string {
  const a = new Date(`${from}T00:00:00`)
  const b = new Date(`${dateStr}T00:00:00`)
  const days = Math.round((b.getTime() - a.getTime()) / 86400000)
  //  월요일 시작으로 이번 주의 남은 날 수를 셉니다 (일=0 → 6)
  const dow = (a.getDay() + 6) % 7
  const restOfWeek = 6 - dow
  if (days <= restOfWeek) return '이번 주'
  if (days <= restOfWeek + 7) return '다음 주'
  if (days <= restOfWeek + 14) return '2주 뒤'
  return '3주 뒤부터'
}

export function UpcomingVisits({ days = 28 }: { days?: number }) {
  const { data, clientById } = useData()
  const [open, setOpen] = useState(false)
  const from = today()

  const rows = useMemo(() => upcomingSchedules(data, from, days), [data, from, days])

  //  ⚠ 0건일 때도 **접힘 줄은 남깁니다.** 아무것도 안 그리면 기사님은
  //    「이 앱은 앞일을 안 보여 주는구나」로 읽습니다. 없으면 없다고 말합니다.
  const groups = useMemo(() => {
    const m = new Map<string, typeof rows>()
    for (const s of rows) {
      const k = bucketOf(s.date, from)
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(s)
    }
    return [...m.entries()]
  }, [rows, from])

  return (
    <div data-upcoming className="mt-4">
      <button
        type="button"
        data-upcoming-toggle
        onClick={() => setOpen((v) => !v)}
        className="card flex min-h-[3.25rem] w-full items-center gap-2.5 px-4 py-3 text-left transition active:scale-[0.99]"
      >
        <CalendarRange size={18} strokeWidth={2.3} className="shrink-0 text-teal-600" />
        <span className="text-[1.07rem] font-extrabold text-navy-800">앞으로 갈 곳</span>
        <span data-upcoming-count className="pill bg-teal-50 text-teal-700">
          {rows.length === 0 ? `${days}일 내 없음` : `${rows.length}곳`}
        </span>
        <ChevronDown
          size={17}
          strokeWidth={2.4}
          className={`ml-auto shrink-0 text-navy-400 transition ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div data-upcoming-body className="mt-2 space-y-3">
          {rows.length === 0 && (
            <p className="card break-keep p-4 text-[1.05rem] text-navy-400">
              앞으로 {days}일 안에 잡힌 방문이 없습니다. 달력에서 <b className="text-navy-600">＋</b> 로 잡을
              수 있습니다.
            </p>
          )}
          {groups.map(([bucket, list]) => (
            <div key={bucket}>
              <p className="mb-1.5 px-1 text-[1.02rem] font-extrabold text-navy-500">
                {bucket} · {list.length}곳
              </p>
              <div className="card divide-y divide-navy-50">
                {list.map((s) => (
                  <div key={s.id} data-upcoming-row={s.id} className="flex items-center gap-3 p-3.5">
                    <div className="min-w-0 flex-1">
                      <p className="break-keep text-[1.08rem] font-bold text-navy-900">
                        {clientById(s.clientId)?.name ?? '알 수 없는 거래처'}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.98rem] text-navy-400">
                        <span className="tabular-nums font-bold text-navy-600">{prettyDate(s.date)}</span>
                        {s.scheduledTime && <span className="tabular-nums">{s.scheduledTime}</span>}
                        <WasteBadge type={s.wasteType} />
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
