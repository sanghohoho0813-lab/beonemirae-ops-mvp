import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, CheckCircle2 } from 'lucide-react'
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
  const [error, setError] = useState('')

  const client = data.clients.find((c) => c.id === clientId)

  // 선택된 폐기물 구분에 맞는 차량 후보
  const vehicle = useMemo(
    () => data.vehicles.find((v) => v.wasteType === wasteType),
    [data.vehicles, wasteType],
  )

  function submit() {
    // 필수 입력값 검증 — 부드러운 안내
    if (!clientId) {
      setError('거래처를 선택해 주세요.')
      return
    }
    if (!amount || Number(amount) <= 0) {
      setError('실제 수거량을 입력해 주세요.')
      return
    }
    setError('')
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
    setTimeout(() => setSaved(false), 4000)
  }

  return (
    <div>
      <PageHeader title="수거 입력" subtitle="현장에서 바로 입력하세요" />

      <div className="card space-y-4 p-5">
        <div>
          <label className="field-label">거래처 *</label>
          <select className="field-input" value={clientId} onChange={(e) => { setClientId(e.target.value); setError('') }}>
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
                className={`rounded-2xl px-4 py-3.5 text-[0.9375rem] font-bold transition-transform duration-150 active:scale-[0.97] ${
                  wasteType === w
                    ? w === '의료폐기물'
                      ? 'bg-rose-500 text-white shadow-sm'
                      : 'bg-teal-600 text-white shadow-sm'
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
              onChange={(e) => { setAmount(e.target.value); setError('') }}
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
          <div className="rounded-2xl bg-navy-50 p-3 text-xs text-navy-500">
            {client.address} · {client.manager} · {client.phone}
          </div>
        )}

        <AnimatePresence>
          {error && (
            <motion.p
              className="flex items-center gap-1.5 text-sm font-semibold text-rose-500"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <AlertCircle size={16} strokeWidth={2.3} /> {error}
            </motion.p>
          )}
        </AnimatePresence>

        <button className="btn-primary w-full py-4 text-base" onClick={submit}>
          저장하기
        </button>
      </div>

      {/* 저장 완료 토스트 — 모바일은 하단 탭 위, 데스크톱은 화면 하단 */}
      <AnimatePresence>
        {saved && (
          <motion.div
            className="fixed inset-x-0 bottom-[84px] z-40 flex justify-center px-4 lg:bottom-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ type: 'spring', stiffness: 360, damping: 30 }}
          >
            <div className="flex items-center gap-2.5 rounded-2xl bg-navy-900 px-4 py-3 text-sm font-semibold text-white shadow-xl">
              <CheckCircle2 size={18} className="text-emerald-400" />
              수거 내역이 저장되었습니다
              <Link to="/today" className="ml-1 rounded-lg bg-white/15 px-2.5 py-1 text-xs font-bold text-teal-200">
                오늘 일정 보기
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
