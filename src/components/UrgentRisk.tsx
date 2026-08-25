import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CalendarPlus, ChevronRight } from 'lucide-react'
import { useData } from '../context/DataContext'
import { useAuth } from '../context/AuthContext'
import { BookVisitModal } from './BookVisit'
import { urgentRisks, urgentActionable, type UrgentRisk } from '../lib/urgentRisk'
import { hideRequests } from '../lib/pilotMode'

// ─────────────────────────────────────────────────────────────────────────────
// 긴급 전화가 오기 전에 (0058 다음)
//
//  지금까지 시스템은 긴급수거를 **세기만** 했습니다 — 「긴급수거 3건」.
//  그 숫자만으로는 무엇을 해야 하는지 알 수 없어, 다음 달에도 같은 전화가
//  옵니다.
//
//  여기서는 근거를 그대로 적고 **잡을 자리를 옆에 둡니다.**
//
//  ⚠ 시스템이 주기를 바꾸지 않습니다. 「긴급이 두 번 왔으니 주 2회로」를
//    자동으로 하면 계약에 없는 방문이 매주 나갑니다. 사실을 적고, 누르는
//    것은 대표님입니다.
//
//  ⚠ 잘했다/못했다를 매기지 않습니다. 긴급이 잦은 것은 병원 사정일 수도
//    있습니다. 점수를 매기면 그 숫자로 사람을 평가하게 됩니다.
//
//  ⚠ **지금 할 일이 없으면 아무것도 안 그립니다.** 요청이 잦았어도 다음
//    방문이 제때 잡혀 있으면 오늘 손댈 것이 없습니다. 매일 같은 줄이 떠
//    있으면 사람은 곧 그것을 안 봅니다.
// ─────────────────────────────────────────────────────────────────────────────

function useCanBook() {
  const { role, mode } = useAuth()
  return role === 'admin' || role === 'office' || !mode
}

function RiskLine({ r, onBook }: { r: UrgentRisk; onBook: () => void }) {
  const canBook = useCanBook()
  return (
    <div data-urgent-row={r.clientId} className="flex flex-wrap items-start gap-x-3 gap-y-1.5 px-5 py-3.5">
      <div className="min-w-0 flex-1">
        <p className="t-card break-keep text-navy-900">
          <Link to={`/clients/${r.clientId}`} className="hover:underline">
            {r.clientName}
          </Link>
          <span
            className={`ml-2 rounded-lg px-2 py-0.5 text-[0.94rem] font-extrabold ${
              r.noNextVisit ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-700'
            }`}
          >
            {r.noNextVisit ? '앞으로 잡힌 방문 없음' : '다음 방문이 평소보다 멂'}
          </span>
        </p>
        {/*  근거는 lib 이 만든 문장을 그대로 씁니다 — 화면마다 다르게 풀어
             쓰면 같은 사실이 다른 말로 보입니다. */}
        <p data-urgent-reason={r.clientId} className="t-muted mt-1 break-keep text-navy-500">
          {r.reason}
        </p>
      </div>
      {canBook && (
        <button
          data-urgent-book={r.clientId}
          onClick={onBook}
          className="t-btn flex shrink-0 items-center gap-1 rounded-full bg-navy-800 px-3.5 py-2 font-extrabold text-white"
        >
          <CalendarPlus size={15} strokeWidth={2.5} /> 방문 잡기
        </button>
      )}
    </div>
  )
}

/**
 * 대시보드·오늘 일정에 띄우는 띠.
 *
 *  지금 손대야 하는 곳만 나옵니다. 없으면 **아무것도 그리지 않습니다** —
 *  「이상 없음」 띠조차 그리지 않습니다(0053 의 밀린 마감과 같은 규칙).
 */
export function UrgentRiskBanner({ limit = 3 }: { limit?: number }) {
  const { data } = useData()
  //  Pilot 동안 병원 요청은 안 씁니다 (0080). 이 띠는 요청만 보고 만드는
  //  것이라, 요청을 내려 두면 이 띠도 같이 내려갑니다.
  const rows = useMemo(() => (hideRequests() ? [] : urgentActionable(urgentRisks(data))), [data])
  const [bookFor, setBookFor] = useState<UrgentRisk | null>(null)
  if (rows.length === 0) return null

  const shown = rows.slice(0, limit)
  return (
    <section data-urgent-banner className="card mb-3 overflow-hidden border-amber-200">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-amber-100 bg-amber-50 px-5 py-3">
        <AlertTriangle size={17} strokeWidth={2.5} className="shrink-0 text-amber-700" />
        <p className="t-card min-w-0 flex-1 break-keep text-navy-900">
          급한 요청이 반복되는데 앞이 비어 있는 곳 {rows.length}곳
        </p>
        <Link to="/requests" className="t-btn flex shrink-0 items-center gap-0.5 text-teal-700 hover:underline">
          요청 보기 <ChevronRight size={15} />
        </Link>
      </div>
      <div className="divide-y divide-navy-50">
        {shown.map((r) => (
          <RiskLine key={r.clientId} r={r} onBook={() => setBookFor(r)} />
        ))}
      </div>
      {rows.length > shown.length && (
        <p className="t-muted border-t border-navy-50 px-5 py-2.5 text-navy-400">
          외 {rows.length - shown.length}곳
        </p>
      )}
      <p className="t-muted break-keep border-t border-navy-50 bg-navy-50 px-5 py-2.5 text-navy-500">
        수거 주기는 <b className="text-navy-600">시스템이 바꾸지 않습니다</b> — 계약이기 때문입니다. 위 사실을 보고
        방문을 잡으실지 대표님이 정하시면 됩니다.
      </p>
      {bookFor && (
        <BookVisitModal
          open
          onClose={() => setBookFor(null)}
          client={data.clients.find((c) => c.id === bookFor.clientId)}
          defaultMemo="급한 요청이 반복돼 추가로 잡은 방문"
        />
      )}
    </section>
  )
}

/**
 * 거래처 한 곳의 신호.
 *
 *  거래처 화면에서는 「지금 손댈 것」이 아니어도 보여 줍니다 — 그 병원을
 *  들여다보고 있는 사람에게는 「최근 90일에 급한 요청이 세 번 있었다」가
 *  그 자체로 알아야 할 사실입니다. 대신 어조를 나눕니다.
 */
export function UrgentRiskCard({ clientId }: { clientId: string }) {
  const { data } = useData()
  const risk = useMemo(
    () => (hideRequests() ? undefined : urgentRisks(data).find((r) => r.clientId === clientId)),
    [data, clientId],
  )
  const [open, setOpen] = useState(false)
  const canBook = useCanBook()
  if (!risk) return null

  const act = risk.noNextVisit || risk.gapAhead
  return (
    <section
      data-urgent-client={clientId}
      className={`card overflow-hidden ${act ? 'border-amber-200' : ''}`}
    >
      <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 px-5 py-3.5 ${act ? 'bg-amber-50' : ''}`}>
        <AlertTriangle
          size={17}
          strokeWidth={2.5}
          className={`shrink-0 ${act ? 'text-amber-700' : 'text-navy-400'}`}
        />
        <p className="t-card min-w-0 flex-1 break-keep text-navy-900">
          {act
            ? '급한 요청이 반복되는데 앞이 비어 있습니다'
            : '급한 요청이 반복되고 있습니다 (다음 방문은 잡혀 있습니다)'}
        </p>
        {act && canBook && (
          <button
            data-urgent-book={clientId}
            onClick={() => setOpen(true)}
            className="t-btn flex shrink-0 items-center gap-1 rounded-full bg-navy-800 px-3.5 py-2 font-extrabold text-white"
          >
            <CalendarPlus size={15} strokeWidth={2.5} /> 방문 잡기
          </button>
        )}
      </div>
      <p data-urgent-reason={clientId} className="t-body break-keep border-t border-navy-50 px-5 py-3 text-navy-600">
        {risk.reason}
      </p>
      <p className="t-muted break-keep border-t border-navy-50 bg-navy-50 px-5 py-2.5 text-navy-500">
        수거 주기는 <b className="text-navy-600">시스템이 바꾸지 않습니다</b>. 위 사실만 적습니다 — 주기를 늘릴지는
        계약이라 대표님이 정하십니다.
      </p>
      {open && (
        <BookVisitModal
          open
          onClose={() => setOpen(false)}
          client={data.clients.find((c) => c.id === clientId)}
          defaultMemo="급한 요청이 반복돼 추가로 잡은 방문"
        />
      )}
    </section>
  )
}
