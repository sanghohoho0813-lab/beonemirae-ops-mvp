import { useMemo, useState } from 'react'
import { CalendarPlus, AlertTriangle } from 'lucide-react'
import { useData } from '../context/DataContext'
import { Modal } from './Modal'
import { TimeField } from './TimeField'
import { today, prettyDate } from '../lib/format'
import { addDays } from '../lib/performance'
import { holidayMap } from '../lib/holidays'
import type { Client, WasteType } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// 방문 예약 — 날짜를 정해 한 건 잡기 (0058)
//
//  병원에서 전화가 옵니다. 「다음 주 목요일에 와 주세요.」
//  지금까지 그 약속을 넣을 데가 없어 수첩·카톡에 적어 두었다가 그날 아침에
//  기억해 내야 했습니다. 잊으면 그대로 미수거 → 병원에서 긴급 전화입니다.
//
// ── 화면이 지키는 것 ────────────────────────────────────────────────────────
//
//  ⚠ **판단은 서버가 합니다.** 지난 날짜·먼 미래·안 하는 구분·중복은 전부
//    book_visit 안에 있습니다. 여기서 같은 검사를 다시 쓰면 언젠가 둘이
//    달라지고, 그때 어느 쪽이 맞는지 아무도 모릅니다. 화면은 **고르기 쉽게**
//    하고(달력 min/max, 그 거래처가 하는 구분만), 서버가 거절하면 그 말을
//    그대로 보여 줍니다.
//
//  ⚠ **휴무일은 막지 않고 알려만 줍니다.** 병원과 한 약속이면 공휴일에도
//    갑니다. 시스템이 막아 버리면 그날 방문을 넣을 방법이 없어집니다.
//
//  ⚠ 금액을 한 칸도 다루지 않습니다. 여기서 만드는 것은 '예정'이고,
//    현장에서 수거 입력을 해야 비로소 실적이 됩니다.
// ─────────────────────────────────────────────────────────────────────────────

export function BookVisitModal({
  open,
  onClose,
  client,
  clients,
  /** 요청에서 열었을 때 — 그 요청이 같은 트랜잭션에서 「일정 반영」으로 넘어갑니다 */
  requestId,
  /** 병원이 적어 낸 희망일 — 있으면 그 날짜로 열어 둡니다 */
  desiredDate,
  /** 왜 잡는지 (요청 내용 등) — 기사님 화면에 그대로 보입니다 */
  defaultMemo,
  onDone,
}: {
  open: boolean
  onClose: () => void
  client?: Client
  clients?: Client[]
  requestId?: string | null
  desiredDate?: string | null
  defaultMemo?: string
  onDone?: () => void
}) {
  const { bookVisit, data } = useData()
  const pool = useMemo(
    () => (client ? [client] : [...(clients ?? data.clients)].sort((a, b) => a.name.localeCompare(b.name, 'ko'))),
    [client, clients, data.clients],
  )

  const [clientId, setClientId] = useState(client?.id ?? '')
  const [date, setDate] = useState(desiredDate ?? '')
  const [wasteType, setWasteType] = useState<WasteType>('의료폐기물')
  const [time, setTime] = useState('')
  const [vehicleId, setVehicleId] = useState('')
  const [memo, setMemo] = useState(defaultMemo ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const picked = pool.find((c) => c.id === clientId)

  //  그 거래처가 실제로 배출하는 구분만 고르게 합니다. 서버도 막지만,
  //  고를 수 없게 해 두면 애초에 실수가 안 납니다.
  const kinds = useMemo<WasteType[]>(() => {
    if (!picked) return ['의료폐기물', '일회용기저귀']
    const out: WasteType[] = []
    if (picked.collectsMedicalWaste) out.push('의료폐기물')
    if (picked.collectsDiaper) out.push('일회용기저귀')
    return out
  }, [picked])

  const kind: WasteType = kinds.includes(wasteType) ? wasteType : (kinds[0] ?? '의료폐기물')

  const vehicles = useMemo(
    () => data.vehicles.filter((v) => v.wasteType === kind),
    [data.vehicles, kind],
  )

  const holidays = useMemo(() => holidayMap(data), [data])
  const holidayName = date ? holidays.get(date) : undefined

  const min = today()
  const max = addDays(min, 180)

  const canSubmit = !!clientId && !!date && kinds.length > 0 && !busy

  async function submit() {
    if (!canSubmit) return
    setBusy(true)
    setError('')
    const r = await bookVisit({
      clientId,
      date,
      wasteType: kind,
      time,
      vehicleId: vehicleId || null,
      memo: memo.trim(),
      requestId: requestId ?? null,
    })
    setBusy(false)
    if (!r.ok) {
      //  서버가 거절한 이유를 그대로 적습니다. 「저장에 실패했습니다」로
      //  바꿔 쓰면 대표님이 무엇을 고쳐야 하는지 알 수 없습니다.
      setError(r.error ?? '방문을 잡지 못했습니다.')
      return
    }
    onDone?.()
    onClose()
    setDate('')
    setTime('')
    setVehicleId('')
    setMemo('')
  }

  return (
    <Modal
      open={open}
      title="방문 예약"
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <button onClick={onClose} className="btn-ghost flex-1">
            취소
          </button>
          <button
            data-book-submit
            onClick={submit}
            disabled={!canSubmit}
            className="btn-primary flex-[2] disabled:opacity-40"
          >
            <CalendarPlus size={17} strokeWidth={2.4} />
            {busy ? '잡는 중…' : '이 날짜로 잡기'}
          </button>
        </div>
      }
    >
      <div className="space-y-4" data-book-modal>
        <p className="t-muted break-keep text-navy-500">
          병원에서 받은 날짜를 그대로 넣으시면 됩니다. 그날 「오늘 일정」에 뜨고 기사님 화면에도 보입니다.
          <b className="text-navy-600"> 수거량·금액은 현장에서 입력할 때 잡힙니다.</b>
        </p>

        {/* 거래처 — 한 곳에서 열었으면 이름만 보여 줍니다 */}
        {client ? (
          <div>
            <p className="t-label mb-1 text-navy-500">거래처</p>
            <p data-book-client className="t-card text-navy-900">
              {client.name}
            </p>
          </div>
        ) : (
          <label className="block">
            <span className="t-label mb-1 block text-navy-500">거래처</span>
            <select
              data-book-client
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="field-input"
            >
              <option value="">— 고르기 —</option>
              {pool.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {/* 날짜 */}
        <label className="block">
          <span className="t-label mb-1 block text-navy-500">방문 날짜</span>
          <input
            data-book-date
            type="date"
            value={date}
            min={min}
            max={max}
            onChange={(e) => setDate(e.target.value)}
            className="field-input"
          />
          {date && (
            <span className="t-muted mt-1 block text-navy-400">{prettyDate(date)}</span>
          )}
        </label>

        {/*  휴무일 — 막지 않고 알려만 줍니다. 병원과 한 약속이면 갑니다. */}
        {holidayName && (
          <p
            data-book-holiday
            className="t-body flex items-start gap-2 break-keep rounded-2xl bg-amber-50 px-4 py-3 text-amber-800"
          >
            <AlertTriangle size={16} strokeWidth={2.5} className="mt-0.5 shrink-0" />
            <span>
              그날은 <b>{holidayName}</b> 로 등록돼 있습니다. 그래도 가기로 하셨으면 그대로 잡으시면 됩니다.
            </span>
          </p>
        )}

        {/* 폐기물 구분 — 그 거래처가 하는 것만 */}
        {kinds.length === 0 ? (
          <p data-book-nokind className="t-body break-keep rounded-2xl bg-amber-50 px-4 py-3 text-amber-800">
            이 거래처는 의료폐기물·일회용기저귀 둘 다 배출하지 않는 것으로 되어 있습니다. 거래처 정보를
            먼저 고쳐 주세요.
          </p>
        ) : kinds.length > 1 ? (
          <div>
            <p className="t-label mb-1 text-navy-500">폐기물 구분</p>
            <div className="flex gap-2">
              {kinds.map((k) => (
                <button
                  key={k}
                  type="button"
                  data-book-kind={k}
                  onClick={() => setWasteType(k)}
                  className={`flex-1 rounded-2xl px-3 py-2.5 text-[1.02rem] font-bold transition ${
                    kind === k ? 'bg-navy-800 text-white' : 'bg-navy-50 text-navy-600 hover:bg-navy-100'
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <p className="t-label mb-1 text-navy-500">폐기물 구분</p>
            <p data-book-kind={kind} className="t-card text-navy-900">
              {kind}
            </p>
          </div>
        )}

        {/* 시각 — 안 정해도 됩니다 */}
        <div>
          <p className="t-label mb-1 text-navy-500">
            방문 시각 <span className="font-normal text-navy-300">(안 정해도 됩니다)</span>
          </p>
          <TimeField value={time} onChange={setTime} />
        </div>

        {/* 차량 — 미리 정해 두면 배차에 반영됩니다 */}
        <label className="block">
          <span className="t-label mb-1 block text-navy-500">
            차량 <span className="font-normal text-navy-300">(나중에 배차에서 정해도 됩니다)</span>
          </span>
          <select
            data-book-vehicle
            value={vehicleId}
            onChange={(e) => setVehicleId(e.target.value)}
            className="field-input"
          >
            <option value="">— 나중에 —</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} · {v.driver || '기사 미정'}
              </option>
            ))}
          </select>
        </label>

        {/* 메모 — 기사님이 보는 말 */}
        <label className="block">
          <span className="t-label mb-1 block text-navy-500">
            메모 <span className="font-normal text-navy-300">(기사님 화면에 그대로 보입니다)</span>
          </span>
          <input
            data-book-memo
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="예: 병원 요청 — 3층 처치실 앞에 모아 둔다고 하심"
            className="field-input"
          />
        </label>

        {error && (
          <p data-book-error className="t-body break-keep rounded-2xl bg-rose-50 px-4 py-3 font-bold text-rose-600">
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}
