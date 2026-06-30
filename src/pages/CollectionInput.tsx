import { useMemo, useState } from 'react'
import { useData } from '../context/DataContext'
import { PageHeader } from '../components/PageHeader'
import { today, weight } from '../lib/format'
import type { WasteType } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// 수거 입력 — 현장 담당자가 모바일에서 빠르게 입력하는 단순 화면
// 거래처/폐기물 구분/실제 수거량/완료 시간/메모 → 완료 상태의 수거일정으로 저장
// ─────────────────────────────────────────────────────────────────────────────

function nowTime(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function CollectionInput() {
  const { data, addSchedule } = useData()
  const [clientId, setClientId] = useState('')
  const [wasteType, setWasteType] = useState<WasteType>('의료폐기물')
  const [amount, setAmount] = useState('')
  const [time, setTime] = useState(nowTime())
  const [memo, setMemo] = useState('')
  const [saved, setSaved] = useState(false)

  const client = data.clients.find((c) => c.id === clientId)

  // 선택된 폐기물 구분에 맞는 차량 후보
  const vehicle = useMemo(
    () => data.vehicles.find((v) => v.wasteType === wasteType),
    [data.vehicles, wasteType],
  )

  function submit() {
    if (!clientId || !amount) return
    const t = today()
    addSchedule({
      date: t,
      clientId,
      wasteType,
      vehicleId: vehicle?.id ?? '',
      scheduledTime: time,
      status: '완료',
      expectedAmount: Number(amount),
      actualAmount: Number(amount),
      completedAt: new Date().toISOString(),
      memo,
    })
    // 폼 초기화
    setClientId('')
    setAmount('')
    setMemo('')
    setTime(nowTime())
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const canSubmit = clientId && amount && Number(amount) > 0

  return (
    <div>
      <PageHeader title="수거 입력" subtitle="현장에서 바로 입력하세요" />

      {saved && (
        <div className="mb-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-100">
          ✓ 수거 내역이 저장되었습니다.
        </div>
      )}

      <div className="card space-y-4 p-5">
        <div>
          <label className="field-label">거래처 *</label>
          <select className="field-input" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">거래처를 선택하세요</option>
            {data.clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.type})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="field-label">폐기물 구분 *</label>
          <div className="grid grid-cols-2 gap-2">
            {(['의료폐기물', '일회용기저귀'] as WasteType[]).map((w) => (
              <button
                key={w}
                onClick={() => setWasteType(w)}
                className={`rounded-xl px-4 py-3 text-sm font-semibold transition ${
                  wasteType === w
                    ? w === '의료폐기물'
                      ? 'bg-rose-500 text-white'
                      : 'bg-teal-600 text-white'
                    : 'bg-navy-50 text-navy-500'
                }`}
              >
                {w}
              </button>
            ))}
          </div>
          {vehicle && (
            <p className="mt-1.5 text-xs text-navy-400">
              배정 차량: {vehicle.name} ({vehicle.driver}) · 예상 적재 {weight(vehicle.expectedCapacity)}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">실제 수거량 (kg) *</label>
            <input
              type="number"
              inputMode="numeric"
              className="field-input"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="예: 320"
            />
          </div>
          <div>
            <label className="field-label">수거 완료 시간</label>
            <input type="time" className="field-input" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="field-label">메모</label>
          <textarea
            className="field-input"
            rows={3}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="현장 특이사항을 입력하세요"
          />
        </div>

        {client && (
          <div className="rounded-xl bg-navy-50 p-3 text-xs text-navy-500">
            {client.address} · {client.manager} · {client.phone}
          </div>
        )}

        <button className="btn-primary w-full py-3.5 text-base" disabled={!canSubmit} onClick={submit}>
          저장하기
        </button>
      </div>
    </div>
  )
}
