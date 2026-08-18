import { useMemo, useState } from 'react'
import { CalendarClock, AlertTriangle, Undo2, Pencil, MessageSquare } from 'lucide-react'
import { useData } from '../context/DataContext'
import { useAuth } from '../context/AuthContext'
import { Modal } from './Modal'
import { TimeField } from './TimeField'
import { today, prettyDate } from '../lib/format'
import { addDays } from '../lib/performance'
import { holidayMap } from '../lib/holidays'
import { FEEDBACK_KINDS, type FeedbackKind, type Schedule } from '../types'

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
  const { moveVisit, cancelVisit, updateVisit, submitScheduleFeedback, data } = useData()
  const { role, mode } = useAuth()
  //  ⚠ 현장 담당자는 일정을 **못 지우고 못 고칩니다.** 서버도 막습니다.
  //    대신 의견을 냅니다 — 「이 날짜보다 화요일이 낫습니다」 같은 것.
  //    눌리는데 안 되는 단추를 두면 사람이 한 번은 누릅니다.
  const canEdit = mode !== 'live' || role === 'admin' || role === 'office'
  const [tab, setTab] = useState<'move' | 'edit' | 'cancel' | 'say'>(canEdit ? 'move' : 'say')
  const [date, setDate] = useState(schedule.date)
  const [time, setTime] = useState(schedule.scheduledTime ?? '')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  //  상세 고치기
  const [vehicleId, setVehicleId] = useState(schedule.vehicleId ?? '')
  const [expected, setExpected] = useState(String(schedule.expectedAmount ?? ''))
  const [memo, setMemo] = useState(schedule.memo ?? '')
  //  의견
  const [kind, setKind] = useState<FeedbackKind>('요일변경')
  const [body, setBody] = useState('')
  const [sent, setSent] = useState(false)
  //  한 번의 「보내기」에 하나 — 실패해도 바뀌지 않습니다 (0055 방식).
  const [reqId, setReqId] = useState(() => crypto.randomUUID())

  const holidays = useMemo(() => holidayMap(data), [data])
  const holidayName = date ? holidays.get(date) : undefined
  const min = today()
  const max = addDays(min, 180)
  const changed = date !== schedule.date || time !== (schedule.scheduledTime ?? '')
  const editChanged =
    time !== (schedule.scheduledTime ?? '') ||
    vehicleId !== (schedule.vehicleId ?? '') ||
    expected !== String(schedule.expectedAmount ?? '') ||
    memo !== (schedule.memo ?? '')
  const vehicles = useMemo(
    () => data.vehicles.filter((v) => v.wasteType === schedule.wasteType),
    [data.vehicles, schedule.wasteType],
  )

  async function submit() {
    setBusy(true)
    setError('')
    const r =
      tab === 'move'
        ? await moveVisit({ scheduleId: schedule.id, date, time })
        : tab === 'edit'
          ? await updateVisit({
              scheduleId: schedule.id,
              time,
              vehicleId: vehicleId || null,
              keepVehicle: false,
              //  빈 칸이면 **안 보냅니다** — 지금 값을 그대로 둡니다.
              expected: expected.trim() === '' ? null : Number(expected),
              memo,
            })
          : tab === 'say'
            ? await submitScheduleFeedback({
                scheduleId: schedule.id,
                kind,
                body: body.trim(),
                requestId: reqId,
              })
            : await cancelVisit(schedule.id, reason.trim())
    setBusy(false)
    if (!r.ok) {
      //  서버가 거절한 이유를 그대로 적습니다.
      setError(r.error ?? '처리하지 못했습니다.')
      return
    }
    if (tab === 'say') {
      //  보낸 뒤에는 다음 의견을 위해 새 표를 만듭니다.
      setReqId(crypto.randomUUID())
      setSent(true)
      setBody('')
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
            disabled={
              busy ||
              (tab === 'move'
                ? !date || !changed
                : tab === 'edit'
                  ? !editChanged
                  : tab === 'say'
                    ? !body.trim()
                    : !reason.trim())
            }
            className={`flex-[2] disabled:opacity-40 ${tab === 'cancel' ? 'btn-danger' : 'btn-primary'}`}
          >
            {tab === 'move' ? (
              <>
                <CalendarClock size={17} strokeWidth={2.4} /> {busy ? '옮기는 중…' : '이 날짜로 옮기기'}
              </>
            ) : tab === 'edit' ? (
              <>
                <Pencil size={17} strokeWidth={2.4} /> {busy ? '저장 중…' : '이대로 고치기'}
              </>
            ) : tab === 'say' ? (
              <>
                <MessageSquare size={17} strokeWidth={2.4} /> {busy ? '보내는 중…' : '의견 보내기'}
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

        {/*  현장 담당자에게는 탭이 하나뿐입니다 — 의견 내기.
             고치기·무르기 단추는 아예 안 그립니다. */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(canEdit ? (['move', 'edit', 'cancel', 'say'] as const) : (['say'] as const)).map((t) => (
            <button
              key={t}
              type="button"
              data-move-tab={t}
              onClick={() => {
                setTab(t)
                setError('')
                setSent(false)
              }}
              className={`min-h-[2.75rem] rounded-2xl px-3 py-2.5 text-[1.02rem] font-bold transition ${
                tab === t ? 'bg-navy-800 text-white' : 'bg-navy-50 text-navy-600 hover:bg-navy-100'
              }`}
            >
              {t === 'move' ? '날짜 옮기기' : t === 'edit' ? '상세 고치기' : t === 'cancel' ? '방문 무르기' : '의견 내기'}
            </button>
          ))}
        </div>

        {tab === 'edit' && (
          <div className="space-y-3" data-visit-edit>
            <label className="block">
              <span className="t-label mb-1 block text-navy-500">차량</span>
              <select
                data-visit-vehicle
                value={vehicleId}
                onChange={(e) => setVehicleId(e.target.value)}
                className="field-input w-full"
              >
                <option value="">정하지 않음</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.driver || '기사 미지정'})
                  </option>
                ))}
              </select>
              {/*  폐기물 종류가 같은 차만 보여 줍니다 — 서버도 다른 종류를 막습니다. */}
              <span className="t-muted mt-1 block text-navy-400">{schedule.wasteType} 차량만 보입니다</span>
            </label>
            <label className="block">
              <span className="t-label mb-1 block text-navy-500">예상 배출량 (kg)</span>
              <input
                data-visit-expected
                type="number"
                inputMode="numeric"
                min={0}
                max={100000}
                value={expected}
                onChange={(e) => setExpected(e.target.value)}
                className="field-input w-full"
              />
            </label>
            <label className="block">
              <span className="t-label mb-1 block text-navy-500">메모</span>
              <input
                data-visit-memo
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="예: 지하 1층 화물엘리베이터 이용"
                className="field-input w-full"
              />
            </label>
            <p className="t-muted break-keep leading-snug text-navy-400">
              날짜는 여기서 안 바뀝니다 — 「날짜 옮기기」에서 합니다. 그 달 매출이 통째로 옮겨 가는 일을 막기
              위해서입니다.
            </p>
          </div>
        )}

        {tab === 'say' && (
          <div className="space-y-3" data-visit-say>
            {sent ? (
              <p data-say-sent className="rounded-2xl bg-emerald-50 px-4 py-3.5 text-[1.05rem] font-bold leading-snug text-emerald-800">
                의견을 보냈습니다. 대표님·사무실 화면에 뜹니다.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {FEEDBACK_KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  data-say-kind={k}
                  onClick={() => setKind(k)}
                  className={`min-h-[2.75rem] rounded-full px-4 text-[1.02rem] font-bold transition ${
                    kind === k ? 'bg-navy-900 text-white' : 'bg-navy-50 text-navy-600 hover:bg-navy-100'
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>
            <textarea
              data-say-body
              rows={3}
              value={body}
              onChange={(e) => {
                setBody(e.target.value)
                setSent(false)
              }}
              placeholder="예: 이 병원은 화요일에 가는 것이 낫습니다. 월요일엔 주차가 어렵습니다."
              className="field-input w-full resize-none"
            />
            <p className="t-muted break-keep leading-snug text-navy-400">
              일정은 대표님·사무실에서 바꿉니다. 여기 적으신 의견은 그대로 남고, 처리되면 상태가 바뀝니다.
            </p>
          </div>
        )}

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
        ) : tab === 'cancel' ? (
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
        ) : null}

        {error && (
          <p data-move-error className="t-body break-keep rounded-2xl bg-rose-50 px-4 py-3 font-bold text-rose-600">
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}
