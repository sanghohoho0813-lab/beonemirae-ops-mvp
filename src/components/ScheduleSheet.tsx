import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, CalendarX2, Clock, Loader2, MapPin, Phone, UserRound } from 'lucide-react'
import { Modal } from './Modal'
import { TimeField } from './TimeField'
import { useData } from '../context/DataContext'
import { useAuth } from '../context/AuthContext'
import { useSchemaAtLeast } from '../lib/schemaGate'
import { cancelMyVisit, retimeMyVisit } from '../lib/repo'
import { prettyDate, weight } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// 일정 상세 — 「이 일정 누가 넣었지?」에 답하고, 본인 것은 여기서 정리합니다
//
//  대표님: 「남양주백병원 09:00 같은 일정처럼 "이게 누가 넣은 일정인지
//  모르겠다"는 상황이 다시 생기지 않게 해줘.」
//
//  ⚠ **지우지 않습니다.** 「무름」으로 남깁니다 — 「그 주에 왜 안 갔나」에
//    답할 근거입니다. 누가·언제·왜가 감사기록에 남습니다.
//  ⚠ 무엇을 막을지는 **서버가 정합니다**(cancel_my_visit). 화면은 그 대답을
//    그대로 보여 줄 뿐입니다 — 화면에서 따로 지어내 막으면 두 벌이 됩니다.
//  ⚠ 날짜를 옮기는 것은 사무실 일입니다. 다른 날 배차·동선이 함께 바뀝니다.
// ─────────────────────────────────────────────────────────────────────────────

/** 경로에 붙는 색 — 「누가 넣었나」가 한눈에 갈리게 */
const VIA_TONE: Record<string, string> = {
  '사무실 배정': 'bg-sky-50 text-sky-700',
  '기사 직접 추가': 'bg-teal-50 text-teal-700',
  '병원 요청': 'bg-violet-50 text-violet-700',
  '자동 편성': 'bg-navy-100 text-navy-600',
  '엑셀·초기 자료': 'bg-amber-50 text-amber-800',
  '시연 자료': 'bg-navy-100 text-navy-500',
  '알 수 없음': 'bg-navy-100 text-navy-500',
}

export function ScheduleSheet({
  scheduleId,
  onClose,
  onOpenRecord,
}: {
  scheduleId: string | null
  onClose: () => void
  /**
   * 이 일정에 붙은 수거기록을 열어 달라고 부르는 자리 (0077).
   *
   *  ⚠ 「그 수거기록에서 고치세요」라고 **말만 하면** 기사님은 그 기록을
   *    다시 찾아야 합니다. 말한 김에 데려다줍니다.
   */
  onOpenRecord?: (eventId: string) => void
}) {
  const { data, clientById, reload } = useData()
  const { profile, role, mode } = useAuth()
  const ready = useSchemaAtLeast(77) === true

  const [step, setStep] = useState<'view' | 'cancel' | 'retime'>('view')
  const [reason, setReason] = useState('')
  const [time, setTime] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const s = useMemo(
    () => (scheduleId ? data.schedules.find((x) => x.id === scheduleId) ?? null : null),
    [data.schedules, scheduleId],
  )
  const client = s ? clientById(s.clientId) : null

  useEffect(() => {
    setStep('view')
    setError('')
    setReason('')
    setTime(s?.scheduledTime ?? '')
  }, [scheduleId, s?.scheduledTime])

  if (!scheduleId) return null

  const done = s?.status === '완료'
  const canceled = !!s?.canceledAt
  const linked = !!s?.eventId
  const staff = role === 'admin' || role === 'office'
  const mine = !!s?.createdBy && s.createdBy === profile?.id
  //  ⚠ 「고칠 수 있나」의 최종 판단은 서버입니다. 화면은 **눌러도 안 되는
  //    단추를 만들지 않으려고** 같은 조건을 한 번 더 볼 뿐입니다.
  const canTouch = ready && mode === 'live' && !done && !linked && !canceled && (staff || mine)

  async function doCancel() {
    if (!s || reason.trim().length === 0) return
    setBusy(true); setError('')
    try {
      await cancelMyVisit(s.id, reason.trim())
      await reload()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : '무르지 못했습니다.')
    }
    setBusy(false)
  }

  async function doRetime() {
    if (!s || !time) return
    setBusy(true); setError('')
    try {
      await retimeMyVisit(s.id, time)
      await reload()
      setStep('view')
    } catch (e) {
      setError(e instanceof Error ? e.message : '시간을 바꾸지 못했습니다.')
    }
    setBusy(false)
  }

  const via = s?.createdVia || '알 수 없음'

  return (
    <Modal
      open={scheduleId !== null}
      title={step === 'cancel' ? '이 방문 안 가기' : step === 'retime' ? '시간 바꾸기' : '일정'}
      onClose={onClose}
      footer={
        step === 'cancel' ? (
          <>
            <button className="btn-ghost flex-1" onClick={() => setStep('view')} disabled={busy}>
              되돌아가기
            </button>
            <button
              data-sched-cancel-go
              className="btn-primary flex-1 disabled:opacity-50"
              disabled={reason.trim().length === 0 || busy}
              onClick={() => void doCancel()}
            >
              {busy ? <Loader2 size={18} className="animate-spin" /> : <CalendarX2 size={17} strokeWidth={2.5} />}
              안 가는 것으로
            </button>
          </>
        ) : step === 'retime' ? (
          <>
            <button className="btn-ghost flex-1" onClick={() => setStep('view')} disabled={busy}>
              되돌아가기
            </button>
            <button
              data-sched-retime-go
              className="btn-primary flex-1 disabled:opacity-50"
              disabled={!time || time === s?.scheduledTime || busy}
              onClick={() => void doRetime()}
            >
              {busy ? <Loader2 size={18} className="animate-spin" /> : <Clock size={17} strokeWidth={2.5} />}
              이 시간으로
            </button>
          </>
        ) : linked && s?.eventId && onOpenRecord ? (
          //  ⚠ 막다른 길을 만들지 않습니다 — 말한 곳으로 데려다줍니다.
          <>
            <button className="btn-ghost flex-1" onClick={onClose}>
              닫기
            </button>
            <button
              data-sched-go-record
              className="btn-primary flex-1"
              onClick={() => { const id = s.eventId!; onClose(); onOpenRecord(id) }}
            >
              수거기록 열기
            </button>
          </>
        ) : canTouch ? (
          <>
            <button
              data-sched-cancel
              className="btn-ghost flex-1 !text-rose-600"
              onClick={() => { setReason(''); setError(''); setStep('cancel') }}
            >
              <CalendarX2 size={17} strokeWidth={2.5} /> 일정 취소
            </button>
            <button data-sched-retime className="btn-primary flex-1" onClick={() => { setError(''); setStep('retime') }}>
              <Clock size={17} strokeWidth={2.5} /> 시간 바꾸기
            </button>
          </>
        ) : (
          <button className="btn-ghost flex-1" onClick={onClose}>
            닫기
          </button>
        )
      }
    >
      {!s ? (
        <p data-sched-gone className="t-body break-keep text-navy-500">
          이 일정을 찾을 수 없습니다. 화면을 새로 고쳐 보세요.
        </p>
      ) : (
        <div data-sched={s.id}>
          <div className="rounded-2xl bg-navy-50 px-4 py-3">
            <Link
              to={`/clients/${s.clientId}`}
              data-sched-client
              className="break-keep text-[1.25rem] font-extrabold text-navy-900 underline-offset-4 hover:underline"
            >
              {client?.name ?? '알 수 없는 거래처'}
            </Link>
            <p className="t-body mt-0.5 break-keep text-navy-600">
              {prettyDate(s.date)} · {s.scheduledTime || '시간 미정'} · {s.wasteType} ·{' '}
              {weight(s.actualAmount ?? s.expectedAmount)}
            </p>
            {canceled && (
              <p data-sched-canceled className="mt-1.5 inline-flex rounded-lg bg-rose-100 px-2 py-0.5 text-[1rem] font-extrabold text-rose-700">
                안 가기로 한 방문{s.cancelReason ? ` — ${s.cancelReason}` : ''}
              </p>
            )}
          </div>

          {/*  ── 누가 · 언제 · 어떻게 (0077) ──────────────────────────────
               ⚠ 이 세 줄이 이번 작업의 전부입니다. 「이게 누가 넣은 일정인지
                 모르겠다」가 다시 나오지 않게. */}
          <div data-sched-origin className="mt-3 rounded-2xl border border-navy-100 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`pill ${VIA_TONE[via] ?? 'bg-navy-100 text-navy-600'}`}>{via}</span>
              {s.createdByName ? (
                <span className="flex items-center gap-1 break-keep text-[1.08rem] font-extrabold text-navy-900">
                  <UserRound size={15} strokeWidth={2.5} className="shrink-0 text-navy-400" />
                  {s.createdByName} 님이 넣었습니다
                </span>
              ) : (
                //  ⚠ 모르면 모른다고 적습니다. 그럴듯한 이름을 넣으면 그 줄을
                //    보고 엉뚱한 사람에게 물어보게 됩니다.
                <span data-sched-noname className="break-keep text-[1.05rem] font-bold text-navy-500">
                  넣은 사람이 안 적혀 있습니다
                </span>
              )}
            </div>
            {s.createdAt && (
              <p className="t-caption mt-1 tabular-nums text-navy-500">
                {prettyDate(s.createdAt.slice(0, 10))}{' '}
                {new Date(s.createdAt).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' })}에 들어옴
              </p>
            )}
            {mine && !staff && (
              <p className="t-caption mt-1 font-bold text-teal-700">내가 넣은 일정입니다</p>
            )}
          </div>

          {step === 'view' && (
            <>
              {/*  병원 정보 — 여기서 바로 봅니다. 「다른 메뉴로 가야 하나」를
                   없애는 것이 이번 마감의 목적입니다. */}
              {(client?.address || client?.phone) && (
                <div className="mt-3 flex flex-col gap-1.5">
                  {client?.address && (
                    <p className="flex items-start gap-2 break-keep text-[1.05rem] text-navy-700">
                      <MapPin size={15} strokeWidth={2.3} className="mt-1 shrink-0 text-navy-400" />
                      {client.address}
                    </p>
                  )}
                  {client?.phone && (
                    <a
                      href={`tel:${client.phone}`}
                      className="flex items-center gap-2 break-keep text-[1.05rem] font-bold text-teal-700"
                    >
                      <Phone size={15} strokeWidth={2.4} className="shrink-0" />
                      {client.phone}
                    </a>
                  )}
                </div>
              )}
              {s.memo && (
                <p className="mt-2 break-keep rounded-2xl bg-amber-50 px-3.5 py-2.5 text-[1.03rem] text-navy-700">
                  {s.memo}
                </p>
              )}

              {/*  ⚠ 왜 못 고치는지 **그 자리에서** 말해 줍니다. 단추만 없으면
                   「어디 있지?」가 되고, 결국 사무실에 전화합니다. */}
              {!canTouch && (
                <p data-sched-why className="t-body mt-3 break-keep rounded-2xl bg-navy-50 px-4 py-3 leading-snug text-navy-600">
                  {done || linked
                    ? '이미 수거를 입력한 일정입니다. 잘못 넣으셨으면 그 수거기록에서 고치거나 지워 주세요.'
                    : canceled
                      ? '이미 안 가기로 한 방문입니다.'
                      : !ready
                        ? '서버 준비가 끝나면 여기서 바로 고칠 수 있습니다.'
                        : mode !== 'live'
                          //  ⚠ 시연 화면에서 「내가 넣은 일정이 아닙니다」라고
                          //    적으면 거짓말입니다 — 시연 자료에는 넣은 사람이
                          //    없습니다. 무엇 때문에 막혔는지 그대로 말합니다.
                          ? '시연 화면입니다. 실제 일정은 「실사용」에서 고칩니다.'
                          : '내가 넣은 일정이 아닙니다. 못 가시게 되면 사무실에 말씀해 주세요.'}
                </p>
              )}
            </>
          )}

          {step === 'cancel' && (
            <div className="mt-3 flex flex-col gap-3">
              <p className="break-keep text-[1.05rem] leading-relaxed text-navy-600">
                이 방문을 <b className="text-navy-800">안 가는 것으로</b> 표시합니다.
                기록은 지우지 않고 남습니다 — 나중에 「그날 왜 안 갔나」에 답할 근거입니다.
              </p>
              <div>
                <label className="field-label">
                  왜 안 가시나요? <span className="text-rose-600">*</span>
                </label>
                <div className="mb-2 flex flex-wrap gap-2">
                  {['병원이 쉰다고 합니다', '병원 요청으로 다음에', '잘못 넣었습니다', '오늘 못 갑니다'].map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => setReason(q)}
                      className={`min-h-[2.5rem] rounded-xl px-3 text-[1rem] font-bold transition active:scale-95 ${
                        reason === q ? 'bg-navy-900 text-white' : 'bg-navy-50 text-navy-700'
                      }`}
                    >
                      {q}
                    </button>
                  ))}
                </div>
                <input
                  data-sched-reason
                  className="input"
                  maxLength={300}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="직접 적으셔도 됩니다"
                />
              </div>
            </div>
          )}

          {step === 'retime' && (
            <div className="mt-3">
              <TimeField label="바꿀 시간" value={time} onChange={setTime} />
              <p className="t-caption mt-1.5 break-keep leading-snug text-navy-500">
                날짜를 옮기시려면 사무실에 말씀해 주세요 — 그날 배차와 다니는 순서가 함께 바뀝니다.
              </p>
            </div>
          )}

          {error && (
            <p data-sched-error className="mt-3 flex items-start gap-2 break-keep rounded-2xl bg-rose-50 px-4 py-3 text-[1.02rem] font-bold text-rose-700">
              <AlertCircle size={18} className="mt-0.5 shrink-0" strokeWidth={2.3} /> {error}
            </p>
          )}
        </div>
      )}
    </Modal>
  )
}
