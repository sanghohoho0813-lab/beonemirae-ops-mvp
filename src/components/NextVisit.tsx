import { useNavigate } from 'react-router-dom'
import { CheckCircle2, ChevronRight, Clock, MapPin, Phone, PlusCircle, Truck } from 'lucide-react'
import type { AppData, Schedule } from '../types'
import { NoteChips } from './SiteNotes'
import type { SiteNote } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// 다음 방문 (모바일 전용)
//
//  현장 담당자가 폰을 열었을 때 알아야 하는 것은 하나뿐입니다 — 다음에 어디로 가는가.
//  그래서 목록보다 먼저, 화면 맨 위에 한 장만 둡니다.
//
//    지금 몇 건 남았는가  ·  다음 병원 · 예정 시간 · 위치 · 특이사항  ·  수거 입력 시작
//
//  목록을 훑어 다음 순서를 찾아내는 일을 사람이 하지 않게 하는 것이 목적입니다.
//  (넓은 화면에서는 일정 목록이 한눈에 들어오므로 이 카드를 쓰지 않습니다)
// ─────────────────────────────────────────────────────────────────────────────

export function NextVisitCard({
  data,
  list,
  notesFor,
}: {
  data: AppData
  /** 이 날짜의 일정 (이미 시간순으로 정렬되어 들어옵니다) */
  list: Schedule[]
  notesFor: (clientId: string) => SiteNote[]
}) {
  const navigate = useNavigate()
  const done = list.filter((s) => s.status === '완료').length
  const next = list.find((s) => s.status !== '완료')
  const client = next ? data.clients.find((c) => c.id === next.clientId) : null
  const vehicle = next ? data.vehicles.find((v) => v.id === next.vehicleId) : null
  const pct = list.length ? Math.round((done / list.length) * 100) : 0

  if (list.length === 0) return null

  // 오늘 갈 곳을 다 돈 상태 — 남은 일이 없다는 사실 자체가 정보입니다.
  if (!next) {
    return (
      <section className="card flex items-center gap-3.5 px-5 py-5 lg:hidden">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
          <CheckCircle2 size={26} strokeWidth={2.3} />
        </span>
        <div className="min-w-0">
          <p className="t-card break-keep text-navy-900">오늘 방문을 모두 마쳤습니다</p>
          <p className="t-muted mt-1 break-keep">{list.length}건 완료 · 입력까지 끝났습니다</p>
        </div>
      </section>
    )
  }

  return (
    <section data-tour="next-visit" className="card overflow-hidden lg:hidden">
      {/* 남은 건수 — 숫자를 크게, 문장은 짧게 */}
      <div className="flex items-center gap-3 border-b border-navy-100 px-5 py-3.5">
        <span className="t-label whitespace-nowrap text-navy-500">오늘 방문</span>
        <span className="t-card whitespace-nowrap text-navy-900">
          {list.length - done}
          {/*  ⚠ 0071 — navy-400 은 흰 바탕에서 3.5:1 로 기준에 못 미칩니다.
               「몇 건 남았나」는 기사님이 첫 화면에서 가장 먼저 보는 숫자입니다. */}
          <span className="t-label text-navy-500"> / {list.length}건 남음</span>
        </span>
        <span className="ml-auto flex h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-navy-100">
          <span className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
        </span>
      </div>

      <div className="px-5 py-4">
        <p className="t-label text-teal-600">다음 방문</p>

        <div className="mt-1.5 flex items-baseline gap-2.5">
          <span className="t-kpi-sm shrink-0 tabular-nums text-navy-900">{next.scheduledTime}</span>
          <span className="t-label whitespace-nowrap text-navy-500">{next.wasteType}</span>
        </div>

        <p className="mt-1.5 break-keep text-[1.55rem] font-extrabold leading-tight tracking-tight text-navy-900">
          {client?.name ?? '알 수 없는 거래처'}
        </p>

        <div className="mt-2.5 space-y-1.5">
          <p className="t-body flex items-start gap-2 break-keep text-navy-500">
            <MapPin size={17} strokeWidth={2.3} className="mt-1 shrink-0 text-navy-300" />
            <span className="min-w-0">{client?.address ?? '주소 없음'}</span>
          </p>
          {/*  ⚠ 0074 — 주소는 있는데 **전화는 누를 수 없었습니다.** 기사님이
               「문 앞인데 아무도 안 나온다」 할 때 여기서 바로 걸어야 하는데,
               수거 입력 화면까지 들어가야 전화 링크가 나왔습니다.
               같은 자료를 한 화면 앞으로 당깁니다 — 새로 만드는 것이 아닙니다.
               ⚠ 번호가 없으면 「전화번호 미등록」이라고 **그대로** 말합니다.
                 없는 번호를 지어내지 않습니다. */}
          {client?.phone ? (
            <a
              data-next-tel
              href={`tel:${client.phone}`}
              className="t-body -my-1 flex min-h-[2.75rem] items-center gap-2 break-keep font-bold text-teal-700"
            >
              <Phone size={17} strokeWidth={2.4} className="shrink-0 text-teal-600" />
              <span className="min-w-0">{client.phone}</span>
            </a>
          ) : (
            <p className="t-body flex items-center gap-2 break-keep text-navy-400">
              <Phone size={17} strokeWidth={2.3} className="shrink-0 text-navy-300" />
              <span className="min-w-0">전화번호 미등록</span>
            </p>
          )}
          <p className="t-body flex items-center gap-2 break-keep text-navy-500">
            <Truck size={17} strokeWidth={2.3} className="shrink-0 text-navy-300" />
            <span className="min-w-0">
              {vehicle?.name ?? '차량 미배정'}
              {next.expectedAmount > 0 && ` · 예상 ${next.expectedAmount}kg`}
            </span>
          </p>
        </div>

        {/* 특이사항 — 현장에서 가장 자주 놓치는 것이라 CTA 바로 위에 둡니다 */}
        {next.memo && (
          <p className="t-body mt-3 flex items-start gap-2 break-keep rounded-2xl bg-amber-50 px-3.5 py-2.5 font-bold text-amber-700">
            <Clock size={16} strokeWidth={2.4} className="mt-1 shrink-0" />
            <span className="min-w-0">{next.memo}</span>
          </p>
        )}
        {client && <NoteChips notes={notesFor(client.id)} max={2} />}

        <button
          onClick={() => navigate(`/collection?schedule=${next.id}`)}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-teal-500 px-5 py-4 text-[1.28rem] font-extrabold text-white shadow-sm transition active:scale-[0.98]"
        >
          <PlusCircle size={22} strokeWidth={2.5} /> 수거 입력 시작
        </button>
        <button
          onClick={() => client && navigate(`/clients/${client.id}`)}
          //  0071 — 41px 이라 손가락 기준(44px)에 못 미쳤습니다
          className="mt-2 flex min-h-[2.75rem] w-full items-center justify-center gap-1 py-2 text-[1.08rem] font-bold text-navy-500"
        >
          이 병원 정보 보기 <ChevronRight size={17} />
        </button>
      </div>
    </section>
  )
}
