import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, CalendarPlus, Loader2, X } from 'lucide-react'
import { useData } from '../context/DataContext'
import { useAuth } from '../context/AuthContext'
import { prettyDate, today } from '../lib/format'
import { VISIT_PURPOSES, type VisitPurpose, type WasteType } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// 일정 추가 시트 (0068) — 기사님이 본인 일정을 직접 잡습니다
//
//  대표님 말씀: "날짜 터치 시 하단 시트나 모달로 ＋ 일정 추가",
//  "병원 선택 / 날짜 / 대략적인 시간 / 방문 목적 / 간단 메모".
//
//  ⚠ **본인 일정만** 만들 수 있습니다. 그 판단을 화면이 하지 않습니다 —
//    서버가 합니다(0067: can_see_client). 화면에서 거르면 「화면에는 안
//    보이는데 서버는 받아 주더라」가 되고, 그건 막은 것이 아닙니다.
//    여기 목록에 뜨는 거래처는 **서버가 이 계정에 내려 준 것**뿐입니다.
//
//  ⚠ 시간은 **대략**입니다. 오전/오후 + 시(時) 만 고릅니다. 분까지 맞추게
//    하면 손이 두 번 더 갑니다 — 예정 시각은 순서를 잡기 위한 것이지
//    약속 시각이 아닙니다.
// ─────────────────────────────────────────────────────────────────────────────

/** 대략적인 시간 — 손가락 하나로 고를 수 있는 만큼만 */
const HOURS = ['06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20']

export function AddVisitSheet({
  date,
  open,
  onClose,
  onDone,
}: {
  date: string
  open: boolean
  onClose: () => void
  onDone?: (date: string) => void
}) {
  const { data, bookVisit } = useData()
  const { profile } = useAuth()

  const [clientId, setClientId] = useState('')
  const [hour, setHour] = useState('09')
  const [purpose, setPurpose] = useState<VisitPurpose>('정기수거')
  const [memo, setMemo] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  //  열 때마다 처음부터 — 지난번 값이 남아 있으면 엉뚱한 병원에 잡힙니다.
  useEffect(() => {
    if (!open) return
    setClientId('')
    setHour('09')
    setPurpose('정기수거')
    setMemo('')
    setError(null)
  }, [open, date])

  //  ⚠ 여기서 거래처를 거르지 않습니다. `data.clients` 는 이미
  //    ① 서버가 이 계정에 내려 준 것(현장은 담당 거래처만 · 0056)이고
  //    ② 거래 중인 곳만 담겨 옵니다(거래 종료·검증용은 빠집니다).
  //    화면에서 한 번 더 거르면 두 곳에 규칙이 생기고 언젠가 서로 달라집니다.
  const clients = useMemo(
    () => [...data.clients].sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    [data.clients],
  )
  const client = clients.find((c) => c.id === clientId)

  //  그 병원이 실제로 배출하는 구분으로 잡습니다. 서버도 같은 기준으로
  //  막지만, 여기서 고르게 하면 거절당하는 화면을 안 봅니다.
  const wasteType: WasteType | null = client
    ? client.collectsMedicalWaste
      ? '의료폐기물'
      : client.collectsDiaper
        ? '일회용기저귀'
        : null
    : null

  //  ⚠ 지난 날짜에는 못 잡습니다 (서버도 막습니다). 이미 다녀온 것은
  //    「수거 입력」이 할 일입니다 — 두 자리를 섞으면 실적이 어긋납니다.
  const isPast = date < today()

  async function save() {
    if (!clientId || !wasteType) return
    setBusy(true)
    setError(null)
    const r = await bookVisit({
      clientId,
      date,
      wasteType,
      time: `${hour}:00`,
      memo: memo.trim(),
      purpose,
    })
    setBusy(false)
    if (!r.ok) {
      setError(r.error ?? '잡지 못했습니다.')
      return
    }
    onDone?.(date)
    onClose()
  }

  if (!open) return null

  return (
    <div data-add-visit className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      {/*  뒤쪽을 눌러도 닫힙니다 — 폰에서 ✕ 만 있으면 손이 위로 올라갑니다 */}
      <button
        aria-label="닫기"
        onClick={onClose}
        className="absolute inset-0 bg-navy-900/40 backdrop-blur-[1px]"
      />
      <div className="relative max-h-[90vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-[30rem] sm:rounded-3xl">
        <div className="mb-4 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[1.3rem] font-extrabold text-navy-900">일정 추가</p>
            <p data-add-visit-date className="mt-0.5 text-[1.05rem] font-bold text-teal-700">
              {prettyDate(date)}
            </p>
          </div>
          <button
            data-add-visit-close
            onClick={onClose}
            aria-label="닫기"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-navy-50 text-navy-500 transition active:scale-95"
          >
            <X size={20} strokeWidth={2.4} />
          </button>
        </div>

        {isPast && (
          <div className="mb-4 flex items-start gap-2.5 rounded-2xl bg-amber-50 px-4 py-3.5">
            <AlertCircle size={19} className="mt-0.5 shrink-0 text-amber-600" strokeWidth={2.2} />
            <p className="t-body min-w-0 break-keep font-bold text-amber-800">
              지난 날짜에는 방문을 잡을 수 없습니다. 이미 다녀오셨으면 「수거 입력」에 기록해 주세요.
            </p>
          </div>
        )}

        {/* 병원 */}
        <label className="field-label" htmlFor="add-visit-client">어느 병원</label>
        <select
          id="add-visit-client"
          data-add-visit-client
          className="field-input"
          value={clientId}
          onChange={(e) => {
            setClientId(e.target.value)
            setError(null)
          }}
        >
          <option value="">병원을 고르세요</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {client && !wasteType && (
          <p className="mt-1.5 break-keep text-[1rem] font-bold text-amber-700">
            {client.name}은 배출하는 폐기물 구분이 등록돼 있지 않습니다. 사무실에 문의해 주세요.
          </p>
        )}

        {/* 대략 시간 */}
        <p className="field-label mt-4">몇 시쯤</p>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" style={{ scrollbarWidth: 'none' }}>
          {HOURS.map((h) => (
            <button
              key={h}
              data-add-visit-hour={h}
              onClick={() => setHour(h)}
              className={`min-h-[2.75rem] w-[3.4rem] shrink-0 rounded-2xl text-[1.08rem] font-extrabold tabular-nums transition active:scale-[0.96] ${
                hour === h ? 'bg-navy-900 text-white' : 'bg-navy-50 text-navy-600'
              }`}
            >
              {h}시
            </button>
          ))}
        </div>

        {/* 목적 */}
        <p className="field-label mt-4">무슨 방문</p>
        <div className="grid grid-cols-2 gap-2">
          {VISIT_PURPOSES.map((v) => (
            <button
              key={v}
              data-add-visit-purpose={v}
              onClick={() => setPurpose(v)}
              className={`min-h-[2.75rem] whitespace-nowrap rounded-2xl px-2 text-[1.05rem] font-bold transition active:scale-[0.97] ${
                purpose === v
                  ? v === '긴급수거'
                    ? 'bg-rose-500 text-white'
                    : 'bg-teal-600 text-white'
                  : 'bg-navy-50 text-navy-600'
              }`}
            >
              {v}
            </button>
          ))}
        </div>

        {/* 메모 */}
        <label className="field-label mt-4" htmlFor="add-visit-memo">메모 (선택)</label>
        <textarea
          id="add-visit-memo"
          data-add-visit-memo
          className="field-input"
          rows={2}
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="예: 3층 처치실 앞"
        />

        {error && (
          <p data-add-visit-error className="mt-3 break-keep rounded-2xl bg-rose-50 px-4 py-3 text-[1.02rem] font-bold text-rose-700">
            {error}
          </p>
        )}

        <button
          data-add-visit-save
          onClick={() => void save()}
          disabled={!clientId || !wasteType || busy || isPast}
          className="btn-primary mt-5 w-full py-4 !text-[1.12rem] disabled:opacity-50"
          style={{ minHeight: 52 }}
        >
          {busy ? <Loader2 size={18} className="animate-spin" /> : <CalendarPlus size={18} strokeWidth={2.4} />}
          {busy ? '잡는 중…' : '이 날로 잡기'}
        </button>
        {profile?.name && (
          <p className="mt-2 text-center text-[0.98rem] text-navy-400">{profile.name} 님 일정으로 저장됩니다</p>
        )}
      </div>
    </div>
  )
}
