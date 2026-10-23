import { useEffect, useState } from 'react'
import { History, Loader2, MessageSquarePlus, PenLine } from 'lucide-react'
import {
  CHECK_MARKS, FIELD_BY_KEY, OPEN_REQ, isEditable,
  type CheckMark, type HistoryData, type RequestRow,
} from '../../lib/bizPlan'
import { BizPlanError, history, setCheck, updateRequest } from '../../lib/bizPlanApi'
import { BasisLine, ChecksLine, DiffView, Pill, REQ_TONE, StatusBadge, usePlan, when, who } from './parts'

// ─────────────────────────────────────────────────────────────────────────────
// 항목 하나의 검토 칸 — 확인 표시 · 수정요청 · 기록 (0146)
//  PC 는 오른쪽 칸, 폰은 아래에서 올라오는 창으로 씁니다.
// ─────────────────────────────────────────────────────────────────────────────

export function FieldPanel({ fieldKey }: { fieldKey: string }) {
  const { fields, requestsByKey, checksByKey, isEditor, openRequest, openEditor } = usePlan()
  const ref = FIELD_BY_KEY.get(fieldKey)
  if (!ref) return null
  const row = fields.get(fieldKey)
  const reqs = requestsByKey.get(fieldKey) ?? []
  const open = reqs.filter((r) => OPEN_REQ.includes(r.status))
  const done = reqs.filter((r) => !OPEN_REQ.includes(r.status))
  const checks = checksByKey.get(fieldKey) ?? []

  return (
    <div className="space-y-4" data-field-panel={fieldKey}>
      <div className="space-y-1.5">
        <p className="break-keep text-[0.9rem] font-bold text-navy-500">{ref.path}</p>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={row?.status ?? '작성 전'} />
          {open.length > 0 && <Pill tone="orange">수정 요청 {open.length}건</Pill>}
        </div>
        {row?.updated_at && <p className="text-[0.88rem] text-navy-400">마지막 수정 · {row.updated_by} {when(row.updated_at)}</p>}
        <BasisLine basis={row?.basis} />
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" data-panel-request className="btn-primary min-h-[44px] flex-1" onClick={() => openRequest(fieldKey)}>
          <MessageSquarePlus size={17} /> 수정 요청
        </button>
        {isEditor && isEditable(ref.def) && (
          <button type="button" data-panel-edit className="btn-ghost min-h-[44px] flex-1" onClick={() => openEditor(fieldKey)}>
            <PenLine size={17} /> 편집
          </button>
        )}
      </div>

      <MyCheck fieldKey={fieldKey} />
      <ChecksLine checks={checks} />

      <section className="space-y-2">
        <h3 className="text-[1.02rem] font-extrabold text-navy-900">수정요청 {reqs.length > 0 ? `${reqs.length}건` : ''}</h3>
        {reqs.length === 0 && <p className="text-[0.95rem] text-navy-400">아직 요청이 없습니다.</p>}
        {[...open, ...done].map((r) => (
          <RequestCard key={r.id} r={r} />
        ))}
      </section>

      <FieldHistory fieldKey={fieldKey} />
    </div>
  )
}

// ── 내 확인 표시 ────────────────────────────────────────────────────────────────
export function MyCheck({ fieldKey }: { fieldKey: string }) {
  const { data, checksByKey, reload, notify } = usePlan()
  const mine = (checksByKey.get(fieldKey) ?? []).find((c) => c.profile_id === data.me.id)
  const [busy, setBusy] = useState<CheckMark | 'clear' | null>(null)

  async function pick(m: CheckMark) {
    const next = mine?.mark === m ? null : m
    setBusy(next ?? 'clear')
    try {
      await setCheck(fieldKey, next)
      await reload()
      notify(next ? `「${next}」로 표시했습니다 · 누가 언제 확인했는지 남습니다.` : '내 표시를 지웠습니다 (기록은 남습니다).')
    } catch (e) {
      notify(e instanceof BizPlanError ? e.message : '표시하지 못했습니다.')
    } finally {
      setBusy(null)
    }
  }
  return (
    <div data-my-check={mine?.mark ?? ''}>
      <p className="mb-1 text-[0.9rem] font-bold text-navy-500">내 확인 · {who(data.me.name, data.me.title)}</p>
      <div className="grid grid-cols-2 gap-1.5">
        {CHECK_MARKS.map((m) => (
          <button
            key={m}
            type="button"
            data-check-pick={m}
            aria-pressed={mine?.mark === m}
            disabled={busy != null}
            onClick={() => void pick(m)}
            className={`flex min-h-[44px] items-center justify-center gap-1 break-keep rounded-xl px-2 text-[0.95rem] font-bold transition ${
              mine?.mark === m ? (m === '동의' ? 'bg-teal-600 text-white' : 'bg-navy-900 text-white') : 'bg-navy-50 text-navy-700'
            }`}
          >
            {busy === m ? <Loader2 size={15} className="animate-spin" /> : null}
            {m}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── 요청 한 건 ─────────────────────────────────────────────────────────────────
export function RequestCard({ r, showTarget = false, onGo }: { r: RequestRow; showTarget?: boolean; onGo?: () => void }) {
  const { fields, isEditor, reload, notify, openEditor } = usePlan()
  const ref = FIELD_BY_KEY.get(r.key)
  const [note, setNote] = useState('')
  const [mode, setMode] = useState<null | '보류' | '반려' | '반영 완료'>(null)
  const [busy, setBusy] = useState(false)
  const [showDiff, setShowDiff] = useState(false)
  const open = OPEN_REQ.includes(r.status)
  const current = fields.get(r.key)?.value ?? null

  async function change(status: '검토 중' | '반영 완료' | '보류' | '반려', n: string) {
    setBusy(true)
    try {
      await updateRequest(r.id, status, n)
      await reload()
      setMode(null)
      setNote('')
      notify(`요청을 「${status}」로 바꿨습니다 · 요청자에게 결과가 보입니다.`)
    } catch (e) {
      notify(e instanceof BizPlanError ? e.message : '바꾸지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <article data-request-card={r.id} data-request-status={r.status} className={`space-y-2 rounded-xl px-3.5 py-3 ring-1 ${open ? 'bg-orange-50/50 ring-orange-200' : 'bg-white ring-navy-100'}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Pill tone={REQ_TONE[r.status]}>{r.status}</Pill>
        <Pill>{r.req_type}</Pill>
        <span className="text-[0.88rem] font-semibold text-navy-500">
          {who(r.requester_name, r.requester_title)} · {when(r.created_at)}
        </span>
      </div>
      {showTarget && (
        <button type="button" data-request-go={r.key} onClick={onGo} className="block min-h-[40px] w-full break-keep text-left text-[0.95rem] font-extrabold text-teal-700 underline-offset-2 hover:underline">
          {ref?.path ?? r.key_label} ›
        </button>
      )}
      <p className="whitespace-pre-wrap break-keep text-[1rem] leading-snug text-navy-900">{r.body}</p>
      {r.suggestion && (
        <div className="rounded-lg bg-white px-3 py-2 ring-1 ring-navy-100">
          <p className="text-[0.85rem] font-bold text-navy-500">제안하는 수정문장</p>
          <p data-request-suggestion className="whitespace-pre-wrap break-keep text-[0.98rem] text-navy-800">{r.suggestion}</p>
        </div>
      )}
      {ref && (
        <button type="button" className="min-h-[36px] text-[0.9rem] font-bold text-navy-500 underline-offset-2 hover:underline" onClick={() => setShowDiff((v) => !v)}>
          {showDiff ? '비교 닫기' : '요청 당시 내용 ↔ 지금 내용 비교'}
        </button>
      )}
      {showDiff && ref && <DiffView def={ref.def} before={r.snapshot} after={current} labels={['요청 당시', '지금']} />}
      {!open && (r.resolution || r.handler_name) && (
        <p data-request-result className="break-keep rounded-lg bg-navy-50 px-3 py-2 text-[0.95rem] text-navy-700">
          <b>처리 결과</b> · {r.handler_name} {when(r.handled_at)}{r.resolution ? ` — ${r.resolution}` : ''}
        </p>
      )}
      {open && r.status === '검토 중' && r.handler_name && <p className="text-[0.88rem] text-navy-500">검토 중 · {r.handler_name}</p>}

      {isEditor && open && (
        <div className="space-y-2 border-t border-orange-100 pt-2">
          <div className="flex flex-wrap gap-1.5">
            {r.status === '접수' && (
              <button type="button" data-req-act="검토 중" disabled={busy} onClick={() => void change('검토 중', '')} className="min-h-[40px] rounded-full bg-amber-100 px-3.5 text-[0.92rem] font-bold text-amber-900">
                검토 시작
              </button>
            )}
            {ref && ref.def.kind !== 'notice' && ref.def.kind !== 'offline' && (
              <button
                type="button"
                data-req-act="apply"
                disabled={busy}
                onClick={() => openEditor(r.key, { requestId: r.id, suggestion: r.suggestion || undefined })}
                className="min-h-[40px] rounded-full bg-teal-600 px-3.5 text-[0.92rem] font-bold text-white"
              >
                {r.suggestion ? '제안 반영 · 편집' : '편집해서 반영'}
              </button>
            )}
            {(['반영 완료', '보류', '반려'] as const).map((m) => (
              <button key={m} type="button" data-req-act={m} disabled={busy} onClick={() => setMode(mode === m ? null : m)} className={`min-h-[40px] rounded-full px-3.5 text-[0.92rem] font-bold ${mode === m ? 'bg-navy-900 text-white' : 'bg-navy-50 text-navy-700'}`}>
                {m === '반영 완료' ? '반영 완료(내용 그대로)' : m}
              </button>
            ))}
          </div>
          {mode && (
            <div className="space-y-1.5">
              <input
                data-req-note
                className="field-input w-full"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={mode === '반영 완료' ? '처리 결과 (예: 이미 반영돼 있음 · 질문 답변)' : `${mode} 까닭 (필수)`}
              />
              <button
                type="button"
                data-req-confirm
                disabled={busy || (mode !== '반영 완료' && note.trim().length < 2)}
                onClick={() => void change(mode, note.trim())}
                className="btn-primary min-h-[44px] w-full"
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : null} 「{mode}」로 처리
              </button>
            </div>
          )}
        </div>
      )}
    </article>
  )
}

// ── 항목 기록 ──────────────────────────────────────────────────────────────────
function FieldHistory({ fieldKey }: { fieldKey: string }) {
  const ref = FIELD_BY_KEY.get(fieldKey)
  const { fields } = usePlan()
  const [data, setData] = useState<HistoryData | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const rev = fields.get(fieldKey)?.rev ?? 0
  useEffect(() => {
    setData(null)
  }, [fieldKey, rev])
  async function load() {
    setBusy(true)
    setErr(null)
    try {
      setData(await history(fieldKey))
    } catch (e) {
      setErr(e instanceof BizPlanError ? e.message : '기록을 불러오지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }
  if (!ref) return null
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="flex-1 text-[1.02rem] font-extrabold text-navy-900">이 항목의 변경 기록</h3>
        {!data && (
          <button type="button" data-history-load onClick={() => void load()} disabled={busy} className="btn-ghost min-h-[40px] px-3 text-[0.92rem]">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <History size={15} />} 기록 보기
          </button>
        )}
      </div>
      {err && <p className="text-[0.92rem] font-bold text-rose-600">{err}</p>}
      {data && data.revisions.length === 0 && <p className="text-[0.95rem] text-navy-400">아직 바뀐 적이 없습니다.</p>}
      {data?.revisions.map((h) => (
        <details key={h.id} data-history-row={h.id} className="rounded-xl bg-white px-3 py-2 ring-1 ring-navy-100">
          <summary className="flex min-h-[40px] cursor-pointer list-none flex-wrap items-center gap-1.5 text-[0.92rem]">
            <span className="font-extrabold text-navy-800">{who(h.actor_name, h.actor_title)}</span>
            <span className="text-navy-500">{when(h.at)}</span>
            {h.before_status !== h.after_status && <span className="text-navy-600">{h.before_status || '—'} → {h.after_status}</span>}
            {h.version_label && <Pill>{h.version_label}</Pill>}
            {h.request_id && <Pill tone="orange">요청 연결</Pill>}
          </summary>
          <div className="mt-1.5 space-y-1.5">
            {h.reason && <p className="break-keep text-[0.92rem] text-navy-700">사유 · {h.reason}</p>}
            <DiffView def={ref.def} before={h.before_value} after={h.after_value} />
          </div>
        </details>
      ))}
      {data && data.check_log.length > 0 && (
        <div className="space-y-1">
          <p className="text-[0.9rem] font-bold text-navy-500">확인 표시 기록</p>
          {data.check_log.map((c) => (
            <p key={c.id} className="text-[0.9rem] text-navy-600">
              {c.name} · {c.mark ?? '표시 지움'} · {when(c.at)}
            </p>
          ))}
        </div>
      )}
    </section>
  )
}
