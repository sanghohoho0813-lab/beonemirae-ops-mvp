import { useMemo, useState } from 'react'
import { AlertCircle, Loader2, Truck } from 'lucide-react'
import { useData } from '../context/DataContext'
import { useAuth } from '../context/AuthContext'
import { prettyDate, today } from '../lib/format'
import { useSchemaAtLeast } from '../lib/schemaGate'

// ─────────────────────────────────────────────────────────────────────────────
// 3.5톤 공용차 예약 (0070)
//
//  대표님 말씀: "3.5톤 트럭은 항상 본사 앞에 대기 중이고 필요할 때만 필요한
//  직원 분이 가셔서 운행하는 방식", "1~4호차 직원 분들이 원할 때 3.5톤 트럭도
//  예약하는 방식으로 활용할 수 있어야 하고, 누군가 예약을 하면 병원 관계자를
//  제외한 모든 사람이 다 알 수 있어야 한다."
//
//  ⚠ **하루 한 사람**입니다. 시간까지 쪼개지 않습니다 — 겹침을 따지는 규칙이
//    필요해지는데 현장에서 그렇게까지 정밀하게 쓰지 않습니다.
//  ⚠ 병원에게 안 보이는 것은 **서버가** 합니다(RLS). 화면에서 거르지 않습니다.
//  ⚠ 잡은 사람 **이름**은 0076 부터 나옵니다. 예약하는 순간 서버가 그 줄에
//    적어 둔 값입니다 — 화면이 프로필을 다시 읽지 않습니다. 그 권한을 열면
//    기사님이 남의 개인정보를 전부 읽게 됩니다.
//    판 75 이하 서버에서는 이름이 빈 값으로 오므로 예전처럼 「다른 분이
//    씁니다」로만 적습니다. 모르는 것을 아는 척하지 않습니다.
// ─────────────────────────────────────────────────────────────────────────────

/** 이름에 톤수가 들어간 공용차를 찾습니다 (3.5톤) */
function sharedTrucks(vehicles: { id: string; name: string; tonnage: number }[]) {
  return vehicles.filter((v) => v.tonnage >= 2)
}

export function SharedTruck({ date, onPick }: { date: string; onPick?: (d: string) => void }) {
  const { data, reserveVehicle, releaseVehicle } = useData()
  const { profile, role } = useAuth()
  const ready = useSchemaAtLeast(70) === true
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const trucks = useMemo(() => sharedTrucks(data.vehicles), [data.vehicles])
  const truck = trucks[0] ?? null

  const mine = profile?.id ?? ''
  const held = useMemo(
    () => (data.vehicleReservations ?? []).find((r) => r.vehicleId === truck?.id && r.date === date) ?? null,
    [data.vehicleReservations, truck, date],
  )

  //  ⚠ 판 69 이하이거나 공용차가 등록돼 있지 않으면 **아무것도 안 그립니다.**
  //    눌러도 안 되는 단추를 만들지 않습니다.
  if (!ready || !truck || role === 'client') return null

  const isPast = date < today()
  const isMine = held?.profileId === mine
  //  ⚠ 0076 — 누가 잡았는지. 대표님: 「예약 누르면 누가 눌렀는지도 같이 뜨게」.
  //    예전에는 「다른 분이 씁니다」뿐이라, 급하면 결국 전화를 걸어야 했습니다.
  const who = (held?.who ?? '').trim()

  //  ── 반납 지연 (0088) ──────────────────────────────────────────────────
  //   예약을 무르는 것이 곧 반납입니다(줄이 지워집니다). 그러니 **지난
  //   날짜에 줄이 남아 있다** = 아직 안 놓은 것입니다.
  //   ⚠ 예전에는 지난 날짜에서 단추를 통째로 숨겼습니다. 그래서 한 번
  //     밀린 예약은 **무를 방법이 화면에 아예 없었습니다** — 차가 영원히
  //     잡혀 있는 것으로 보입니다. 여기서 놓을 수 있게 엽니다.
  //   ⚠ 강한 빨강은 **여기에만** 씁니다. 평소 예약까지 빨갛게 하면
  //     빨강이 아무 뜻도 없어집니다.
  const overdue = (data.vehicleReservations ?? []).filter(
    (r) => r.vehicleId === truck.id && r.date < today(),
  )

  async function go() {
    if (!truck) return
    setBusy(true)
    setError(null)
    const r = held ? await releaseVehicle(held.id) : await reserveVehicle(truck.id, date, '')
    setBusy(false)
    if (!r.ok) setError(r.error ?? '바꾸지 못했습니다.')
  }

  return (
    <div data-shared-truck className="card mt-4 p-4">
      <div className="flex items-center gap-2.5">
        <Truck size={20} strokeWidth={2.3} className="shrink-0 text-navy-500" />
        <p className="text-[1.12rem] font-extrabold text-navy-900">{truck.name}</p>
        {/*  다섯 가지 — 사용 가능 / 예약 / 사용 중 / 반납 완료 / 반납 지연.
             ⚠ 「반납 지연」에만 강한 빨강을 씁니다. */}
        <span
          data-truck-state
          data-truck-overdue={held && isPast ? 'yes' : undefined}
          className={`ml-auto pill ${
            held && isPast
              ? 'bg-rose-600 text-white'
              : held
                ? isMine
                  ? 'bg-teal-600 text-white'
                  : 'bg-amber-50 text-amber-800'
                : 'bg-navy-100 text-navy-600'
          }`}
        >
          {held
            ? isPast
              ? '반납 지연'
              : date === today()
                ? isMine
                  ? '내가 씁니다'
                  : who
                    ? `${who} 님이 씁니다`
                    : '다른 분이 씁니다'
                : isMine
                  ? '내가 예약함'
                  : who
                    ? `${who} 님 예약`
                    : '다른 분 예약'
            : isPast
              ? '반납 완료'
              : '사용 가능'}
        </span>
      </div>

      <p className="mt-1.5 break-keep text-[1.02rem] text-navy-500">
        {prettyDate(date)} · 본사 앞에 있습니다
      </p>
      {/*  ⚠ 딱지에만 이름을 넣으면 폰에서 잘립니다. 한 줄로 다시 적습니다.
           ⚠ 이름이 없는 옛 예약(판 75 이전)에는 이 줄을 안 그립니다 —
             「알 수 없음」이라고 적으면 고장으로 보입니다. */}
      {held && who && (
        <p data-truck-who className="mt-1 break-keep text-[1.08rem] font-extrabold text-navy-800">
          {isMine ? `${who} 님(나)이 잡으셨습니다` : `${who} 님이 잡으셨습니다`}
          {held.note ? <span className="font-bold text-navy-500"> · {held.note}</span> : null}
        </p>
      )}

      {error && (
        <p data-truck-error className="mt-3 flex items-start gap-2 break-keep rounded-2xl bg-rose-50 px-4 py-3 text-[1.02rem] font-bold text-rose-700">
          <AlertCircle size={18} className="mt-0.5 shrink-0" strokeWidth={2.3} /> {error}
        </p>
      )}

      {/*  ⚠ 남이 잡은 것은 **누를 수 없게** 합니다. 눌러 봐야 서버가 거절합니다.
           사무실·관리자는 뺄 수 있어야 해서 열어 둡니다 (휴가 간 사람 차가
           계속 잡혀 있으면 아무도 못 씁니다). */}
      {(!isPast || held != null) && (held == null || isMine || role === 'admin' || role === 'office') && (
        <button
          data-truck-toggle
          onClick={() => void go()}
          disabled={busy}
          className={`mt-3 flex w-full items-center justify-center gap-2 rounded-2xl text-[1.1rem] font-extrabold transition active:scale-[0.98] disabled:opacity-50 ${
            held ? (isPast ? 'bg-rose-600 text-white' : 'bg-navy-50 text-navy-600') : 'bg-navy-900 text-white'
          }`}
          style={{ minHeight: 52 }}
        >
          {busy && <Loader2 size={18} className="animate-spin" />}
          {held
            ? isPast
              ? isMine
                ? '지금 반납 처리'
                : '반납 처리 (사무실)'
              : isMine
                ? '예약 무르기'
                : '예약 빼기 (사무실)'
            : '이 날 예약하기'}
        </button>
      )}

      {isPast && held == null && (
        <p className="mt-3 text-[1.02rem] text-navy-500">지난 날짜는 예약할 수 없습니다.</p>
      )}

      {/*  다른 날에 밀려 있는 것 — 오늘 화면을 보고 있어도 알아야 합니다. */}
      {overdue.length > 0 && !(held && isPast) && (
        <div data-truck-overdue-list className="mt-3 rounded-2xl bg-rose-50 px-4 py-3">
          <p className="flex items-start gap-2 break-keep text-[1.05rem] font-extrabold text-rose-700">
            <AlertCircle size={18} className="mt-0.5 shrink-0" strokeWidth={2.4} />
            아직 반납 처리가 안 된 날이 {overdue.length}일 있습니다
          </p>
          <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
            {overdue.slice(0, 6).map((r) => (
              <li key={r.id} data-truck-overdue-day={r.date}>
                <button
                  onClick={() => onPick?.(r.date)}
                  className="text-[1.02rem] font-bold text-rose-700 underline underline-offset-4"
                >
                  {prettyDate(r.date)}
                  {r.who ? ` · ${r.who} 님` : ''}
                </button>
              </li>
            ))}
          </ul>
          <p className="t-caption mt-1.5 break-keep leading-snug text-rose-700">
            날짜를 누르면 그 날로 가서 반납 처리를 할 수 있습니다.
          </p>
        </div>
      )}
    </div>
  )
}
