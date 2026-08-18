import { useState } from 'react'
import { MessageSquare, Check, X } from 'lucide-react'
import { useData } from '../context/DataContext'
import { useAuth } from '../context/AuthContext'
import { prettyDate } from '../lib/format'
import type { FeedbackStatus } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// 현장에서 온 일정 의견 (0062)
//
//  현장 담당자는 배정받은 일정을 **직접 지우지 못합니다.** 대신 의견을 냅니다.
//  그 의견이 여기에 뜹니다 — 전화로 하면 기록이 안 남고, 나중에 「누가 언제
//  뭐라고 했나」를 못 찾습니다.
//
//  ⚠ **안 온 날에는 아무것도 그리지 않습니다.** 「0건」이 매일 떠 있으면
//    곧 배경이 되고, 진짜 의견이 왔을 때도 같이 안 보입니다.
//  ⚠ 현장 담당자에게는 안 띄웁니다 — 자기가 낸 것은 보낸 자리에서 봅니다.
// ─────────────────────────────────────────────────────────────────────────────

const TONE: Record<FeedbackStatus, string> = {
  접수: 'bg-amber-50 text-amber-700',
  확인: 'bg-sky-50 text-sky-700',
  반영: 'bg-emerald-50 text-emerald-700',
  반려: 'bg-navy-100 text-navy-500',
}

export function ScheduleFeedbackCard() {
  const { data, handleScheduleFeedback } = useData()
  const { role } = useAuth()
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [replyFor, setReplyFor] = useState('')
  const [reply, setReply] = useState('')

  if (role === 'field' || role === 'client') return null

  const all = data.scheduleFeedback ?? []
  const open = all.filter((f) => f.status === '접수' || f.status === '확인')
  //  안 온 날에는 자리 자체가 없습니다.
  if (open.length === 0) return null

  const clientName = (id: string) => data.clients.find((c) => c.id === id)?.name ?? '(거래처)'
  const dateOf = (scheduleId: string) => data.schedules.find((s) => s.id === scheduleId)?.date ?? null

  async function act(id: string, status: FeedbackStatus) {
    setBusy(id)
    setError('')
    const r = await handleScheduleFeedback(id, status, replyFor === id ? reply.trim() : '')
    setBusy('')
    if (!r.ok) {
      setError(r.error ?? '처리하지 못했습니다.')
      return
    }
    setReplyFor('')
    setReply('')
  }

  return (
    <section data-schedule-feedback className="card border-sky-200 bg-sky-50/60 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
          <MessageSquare size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <p data-feedback-headline className="break-keep text-[1.12rem] font-extrabold leading-snug text-navy-900">
            현장에서 일정 의견 {open.length}건이 왔습니다
          </p>
          <p className="t-caption mt-0.5 break-keep text-navy-500">
            기사님은 일정을 직접 못 바꿉니다 — 여기서 확인하고 옮겨 주세요.
          </p>
        </div>
      </div>

      <ul className="mt-3 flex flex-col gap-2">
        {open.map((f) => {
          const d = dateOf(f.scheduleId)
          return (
            <li key={f.id} data-feedback={f.id} className="rounded-2xl bg-white/80 px-3.5 py-3">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className={`pill ${TONE[f.status]}`}>{f.kind}</span>
                <b className="min-w-0 break-keep text-[1.05rem] text-navy-900">{clientName(f.clientId)}</b>
                {d && <span className="t-caption shrink-0 text-navy-400">{prettyDate(d)} 방문</span>}
              </div>
              <p className="t-body mt-1 break-keep leading-snug text-navy-700">{f.body}</p>

              {replyFor === f.id && (
                <input
                  data-feedback-reply={f.id}
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="회신 (선택) — 예: 화요일로 옮겼습니다"
                  className="field-input mt-2 w-full"
                />
              )}

              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  data-feedback-done={f.id}
                  disabled={busy === f.id}
                  onClick={() => void act(f.id, '반영')}
                  className="pressable flex min-h-[2.75rem] items-center gap-1.5 rounded-xl bg-navy-900 px-4 text-[1.03rem] font-bold text-white disabled:opacity-40"
                >
                  <Check size={16} strokeWidth={2.6} /> 반영함
                </button>
                <button
                  data-feedback-reject={f.id}
                  disabled={busy === f.id}
                  onClick={() => void act(f.id, '반려')}
                  className="flex min-h-[2.75rem] items-center gap-1.5 rounded-xl bg-navy-50 px-4 text-[1.03rem] font-bold text-navy-500 disabled:opacity-40"
                >
                  <X size={16} strokeWidth={2.6} /> 이번엔 아님
                </button>
                <button
                  data-feedback-replybtn={f.id}
                  onClick={() => {
                    setReplyFor(replyFor === f.id ? '' : f.id)
                    setReply('')
                  }}
                  className="min-h-[2.75rem] rounded-xl px-3 text-[1.03rem] font-bold text-navy-400"
                >
                  {replyFor === f.id ? '회신 접기' : '회신 남기기'}
                </button>
              </div>
            </li>
          )
        })}
      </ul>

      {error && (
        <p data-feedback-error className="t-body mt-2 break-keep rounded-2xl bg-rose-50 px-4 py-3 font-bold text-rose-600">
          {error}
        </p>
      )}
    </section>
  )
}
