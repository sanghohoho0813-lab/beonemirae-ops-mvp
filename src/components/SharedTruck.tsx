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
//  ⚠ 잡은 사람 **이름**은 서버가 안 줍니다 — 현장 계정은 남의 프로필을 못
//    읽습니다. 그래서 「내가 잡음 / 다른 분이 잡음」으로만 적습니다.
//    모르는 것을 아는 척하지 않습니다.
// ─────────────────────────────────────────────────────────────────────────────

/** 이름에 톤수가 들어간 공용차를 찾습니다 (3.5톤) */
function sharedTrucks(vehicles: { id: string; name: string; tonnage: number }[]) {
  return vehicles.filter((v) => v.tonnage >= 2)
}

export function SharedTruck({ date }: { date: string }) {
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
        <span
          data-truck-state
          className={`ml-auto pill ${held ? (isMine ? 'bg-teal-600 text-white' : 'bg-amber-50 text-amber-800') : 'bg-navy-100 text-navy-600'}`}
        >
          {held ? (isMine ? '내가 씁니다' : '다른 분이 씁니다') : '비어 있음'}
        </span>
      </div>

      <p className="mt-1.5 break-keep text-[1.02rem] text-navy-500">
        {prettyDate(date)} · 본사 앞에 있습니다
      </p>

      {error && (
        <p data-truck-error className="mt-3 flex items-start gap-2 break-keep rounded-2xl bg-rose-50 px-4 py-3 text-[1.02rem] font-bold text-rose-700">
          <AlertCircle size={18} className="mt-0.5 shrink-0" strokeWidth={2.3} /> {error}
        </p>
      )}

      {/*  ⚠ 남이 잡은 것은 **누를 수 없게** 합니다. 눌러 봐야 서버가 거절합니다.
           사무실·관리자는 뺄 수 있어야 해서 열어 둡니다 (휴가 간 사람 차가
           계속 잡혀 있으면 아무도 못 씁니다). */}
      {!isPast && (held == null || isMine || role === 'admin' || role === 'office') && (
        <button
          data-truck-toggle
          onClick={() => void go()}
          disabled={busy}
          className={`mt-3 flex w-full items-center justify-center gap-2 rounded-2xl text-[1.1rem] font-extrabold transition active:scale-[0.98] disabled:opacity-50 ${
            held ? 'bg-navy-50 text-navy-600' : 'bg-navy-900 text-white'
          }`}
          style={{ minHeight: 52 }}
        >
          {busy && <Loader2 size={18} className="animate-spin" />}
          {held ? (isMine ? '예약 무르기' : '예약 빼기 (사무실)') : '이 날 예약하기'}
        </button>
      )}

      {isPast && <p className="mt-3 text-[1.02rem] text-navy-500">지난 날짜는 예약할 수 없습니다.</p>}
    </div>
  )
}
