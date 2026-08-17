import { useMemo, useState } from 'react'
import { CalendarClock, AlertTriangle, Undo2 } from 'lucide-react'
import { useData } from '../context/DataContext'
import { Modal } from './Modal'
import { TimeField } from './TimeField'
import { today, prettyDate } from '../lib/format'
import { addDays } from '../lib/performance'
import { holidayMap } from '../lib/holidays'
import type { Schedule } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// 방문 옮기기 · 무르기 (0059)
//
//  0058 로 방문을 잡을 수 있게 됐는데 그다음이 없었습니다. 병원이 「그날 말고
//  다음 주로」 하면 화면에서 할 수 있는 것이 없었고, 잘못 잡은 방문도 지우는
//  길이 없어 그대로 남아 그날 기사가 나갔습니다.
//
//  ⚠ **무르기는 지우기가 아닙니다.** 이유와 함께 남깁니다 — 나중에 「왜 그
//    주에 안 갔냐」는 말이 나왔을 때 답할 근거입니다. 그래서 이유 없이는
//    무를 수 없습니다(서버가 막습니다).
//
//  ⚠ **완료된 수거는 여기서 못 건드립니다.** 실제로 다녀온 기록이고 정산·
//    청구·매출로 이어집니다. 단추 자체를 안 띄웁니다.
// ─────────────────────────────────────────────────────────────────────────────

export function MoveVisitModal({
  open,
  onClose,
  schedule,
  clientName,
}: {
  open: boolean
  onClose: () => void
  schedule: Schedule
  clientName: string
}) {
  const { moveVisit, cancelVisit, data } = useData()
  const [tab, setTab] = useState<'move' | 'cancel'>('move')
  const [date, setDate] = useState(schedule.date)
  const [time, setTime] = useState(schedule.scheduledTime ?? '')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const holidays = useMemo(() => holidayMap(data), [data])
  const holidayName = date ? holidays.get(date) : undefined
  const min = today()
  const max = addDays(min, 180)
  const changed = date !== schedule.date || time !== (schedule.scheduledTime ?? '')

  async function submit() {
    setBusy(true)
    setError('')
    const r =
      tab === 'move'
        ? await moveVisit({ scheduleId: schedule.id, date, time })
        : await cancelVisit(schedule.id, reason.trim())
    setBusy(false)
    if (!r.ok) {
      //  서버가 거절한 이유를 그대로 적습니다.
      setError(r.error ?? '처리하지 못했습니다.')
      return
    }
    onClose()
  }

  return (
    <Modal
      open={open}
      title={`${clientName} 방문`}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <button onClick={onClose} className="btn-ghost flex-1">
            닫기
          </button>
          <button
            data-move-submit
            onClick={submit}
            disabled={busy || (tab === 'move' ? !date || !changed : !reason.trim())}
            className={`flex-[2] disabled:opacity-40 ${tab === 'move' ? 'btn-primary' : 'btn-danger'}`}
          >
            {tab === 'move' ? (
              <>
                <CalendarClock size={17} strokeWidth={2.4} /> {busy ? '옮기는 중…' : '이 날짜로 옮기기'}
              </>
            ) : (
              <>
                <Undo2 size={17} strokeWidth={2.4} /> {busy ? '무르는 중…' : '이 방문 무르기'}
              </>
            )}
          </button>
        </div>
      }
    >
      <div className="space-y-4" data-move-modal>
        <p className="t-body break-keep text-navy-600">
          지금 <b>{prettyDate(schedule.date)}</b>
          {schedule.scheduledTime ? ` ${schedule.scheduledTime}` : ''} · {schedule.wasteType}
        </p>

        <div className="flex gap-2">
          {(['move', 'cancel'] as const).map((t) => (
            <button
              key={t}
              type="button"
              data-move-tab={t}
              onClick={() => {
                setTab(t)
                setError('')
              }}
              className={`flex-1 rounded-2xl px-3 py-2.5 text-[1.02rem] font-bold transition ${
                tab === t ? 'bg-navy-800 text-white' : 'bg-navy-50 text-navy-600 hover:bg-navy-100'
              }`}
            >
              {t === 'move' ? '날짜 옮기기' : '방문 무르기'}
            </button>
          ))}
        </div>

        {tab === 'move' ? (
          <>
            <label className="block">
              <span className="t-label mb-1 block text-navy-500">옮길 날짜</span>
              <input
                data-move-date
                type="date"
                value={date}
                min={min}
                max={max}
                onChange={(e) => setDate(e.target.value)}
                className="field-input"
              />
              {date && <span className="t-muted mt-1 block text-navy-400">{prettyDate(date)}</span>}
            </label>

            {holidayName && (
              <p
                data-move-holiday
                className="t-body flex items-start gap-2 break-keep rounded-2xl bg-amber-50 px-4 py-3 text-amber-800"
              >
                <AlertTriangle size={16} strokeWidth={2.5} className="mt-0.5 shrink-0" />
                <span>
                  그날은 <b>{holidayName}</b> 로 등록돼 있습니다. 그래도 가기로 하셨으면 그대로 옮기시면 됩니다.
                </span>
              </p>
            )}

            <div>
              <p className="t-label mb-1 text-navy-500">
                방문 시각 <span className="font-normal text-navy-300">(안 정해도 됩니다)</span>
              </p>
              <TimeField value={time} onChange={setTime} />
            </div>

            <p className="t-muted break-keep text-navy-400">
              차량은 지금 배정 그대로 따라갑니다. 바꾸시려면 배차 화면에서 정하시면 됩니다.
            </p>
          </>
        ) : (
          <>
            {/*  이유를 반드시 받습니다. 「취소됨」만 남으면 나중에 「왜 그
                 주에 안 갔냐」에 답할 근거가 없습니다. */}
            <label className="block">
              <span className="t-label mb-1 block text-navy-500">무르는 이유</span>
              <input
                data-move-reason
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="예: 병원 요청으로 다음 주로 미룸 / 잘못 잡음"
                className="field-input"
              />
            </label>
            <p data-move-keep className="t-body break-keep rounded-2xl bg-navy-50 px-4 py-3 text-navy-600">
              <b>기록은 지우지 않고 남깁니다.</b> 나중에 「그 주에 왜 안 갔나」를 물으실 때 이유가 그대로
              보입니다. 무른 방문은 오늘 일정·배차·미수거에서 빠집니다.
            </p>
          </>
        )}

        {error && (
          <p data-move-error className="t-body break-keep rounded-2xl bg-rose-50 px-4 py-3 font-bold text-rose-600">
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}
