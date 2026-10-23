import { useState } from 'react'
import { History, Loader2, Lock, Save } from 'lucide-react'
import { Modal } from '../Modal'
import {
  DOC_STATUSES, FIELD_BY_KEY, OPEN_REQ, SECTIONS, isEditable, nextLabel, plainText,
  type DocStatus, type HistoryData,
} from '../../lib/bizPlan'
import { BizPlanError, createVersion, getVersion, history, setDocStatus, submitPlan, type VersionFull } from '../../lib/bizPlanApi'
import { PreflightView, usePreflight } from './PreflightView'
import { DiffView, Pill, usePlan, when, who } from './parts'
import { PlanDocument } from './ExportTab'

// ─────────────────────────────────────────────────────────────────────────────
// 기록 · 버전 (0146)
//
//  · 문서 상태 — 초안 작성 중 → 공동 검토 중 → 수정 중 → 최종 검토 → 제출본 확정
//    (「제출본 확정」은 버전을 제출본으로 저장할 때만 — 처리 전 수정요청이 있으면 서버가 막습니다)
//  · 버전 — V0.1 · V0.2 … 그 순간 전체를 통째로 저장. **저장한 버전은 덮어쓰지 않습니다.**
//    제출본(V1.0) 뒤에 고치면 문서가 「수정 중」이 되고 다음 버전으로 저장합니다.
//  · 문서 전체 기록 — 누가 언제 무엇을 왜 바꿨는지 (최근 200줄)
// ─────────────────────────────────────────────────────────────────────────────

export function VersionsTab({ onGo }: { onGo: (key: string) => void }) {
  const { data, isEditor } = usePlan()
  return (
    <div className="space-y-4" data-bizplan-versions>
      <DocStatusCard />
      {isEditor && <SaveVersion onGo={onGo} />}
      <section className="space-y-2">
        <h3 className="text-[1.05rem] font-extrabold text-navy-900">저장한 버전 {data.versions.length}개</h3>
        {data.versions.length === 0 && <p className="text-[0.95rem] text-navy-400">아직 저장한 버전이 없습니다.</p>}
        <div className="grid gap-2 lg:grid-cols-2">
          {data.versions.map((v) => (
            <VersionRow key={v.id} id={v.id} />
          ))}
        </div>
      </section>
      <DocHistory onGo={onGo} />
    </div>
  )
}

function DocStatusCard() {
  const { data, isEditor, reload, notify } = usePlan()
  const cur = data.doc.status
  const [pick, setPick] = useState<DocStatus | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  async function save() {
    if (!pick || pick === '제출본 확정') return
    setBusy(true)
    try {
      await setDocStatus(pick, note.trim())
      await reload()
      notify(`문서 상태를 「${pick}」로 바꿨습니다.`)
      setPick(null)
      setNote('')
    } catch (e) {
      notify(e instanceof BizPlanError ? e.message : '바꾸지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-navy-100" data-doc-status-card={cur}>
      <h3 className="text-[1.05rem] font-extrabold text-navy-900">문서 상태</h3>
      <ol className="grid grid-cols-5 gap-1">
        {DOC_STATUSES.map((s, i) => {
          const at = DOC_STATUSES.indexOf(cur)
          const on = s === cur
          return (
            <li key={s} className="min-w-0">
              <button
                type="button"
                data-doc-status-pick={s}
                disabled={!isEditor || s === '제출본 확정' || on || busy}
                onClick={() => setPick(pick === s ? null : s)}
                className={`flex min-h-[56px] w-full flex-col items-center justify-center rounded-xl px-1 text-center text-[0.85rem] font-extrabold leading-tight transition sm:text-[0.92rem] ${
                  on ? 'bg-navy-900 text-white' : pick === s ? 'bg-teal-600 text-white' : i < at ? 'bg-navy-100 text-navy-600' : 'bg-navy-50 text-navy-400'
                } ${isEditor && s !== '제출본 확정' && !on ? 'hover:ring-2 hover:ring-teal-300' : ''}`}
              >
                <span className="text-[0.75rem] opacity-70">{i + 1}</span>
                <span className="break-keep">{s}</span>
              </button>
            </li>
          )
        })}
      </ol>
      <p className="break-keep text-[0.9rem] text-navy-500">
        {isEditor ? '바꿀 단계를 누르세요. 「제출본 확정」은 아래에서 버전을 제출본으로 저장할 때만 됩니다.' : '문서 상태는 사업계획 담당이 바꿉니다.'}
        {data.doc.locked_label && ` · 확정된 제출본: ${data.doc.locked_label}`}
      </p>
      {pick && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <input className="field-input flex-1" data-doc-status-note value={note} onChange={(e) => setNote(e.target.value)} placeholder="메모 (선택) — 예: 대표님 · 이사님 1차 검토 시작" />
          <button type="button" data-doc-status-save className="btn-primary min-h-[48px]" disabled={busy} onClick={() => void save()}>
            {busy && <Loader2 size={16} className="animate-spin" />} 「{pick}」로 바꾸기
          </button>
        </div>
      )}
    </section>
  )
}

function SaveVersion({ onGo }: { onGo: (key: string) => void }) {
  const { data, fields, reload, notify } = usePlan()
  const [submission, setSubmission] = useState(false)
  const [note, setNote] = useState('')
  const [ack, setAck] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const pfState = usePreflight()
  const v2 = pfState.on
  const pf = pfState.pf
  const label = nextLabel(data.versions, submission)
  const openReq = data.requests.filter((r) => OPEN_REQ.includes(r.status)).length
  const editable = SECTIONS.flatMap((s) => s.groups.flatMap((g) => g.fields)).filter(isEditable)
  const notFinal = editable.filter((d) => fields.get(d.key)?.status !== '최종 확인 완료').length
  //  0147 — 제출본은 점검을 거쳐서만: 차단 0 · 확인 항목이 있으면 예외 승인(확인 + 까닭 10자 이상)
  const needAck = v2 && !!pf && pf.warns > 0
  const blocked = submission && (v2 ? !pf || pf.blocks > 0 || (needAck && (!ack || reason.trim().length < 10)) : openReq > 0)

  async function save() {
    setBusy(true)
    setErr(null)
    try {
      const r = submission && v2 ? await submitPlan(label, note.trim(), needAck ? reason.trim() : '') : await createVersion(label, note.trim(), submission)
      await reload()
      notify(submission ? `${r.label} 제출본으로 확정했습니다 · 이후 고치면 새 버전이 됩니다.` : `${r.label} 버전을 저장했습니다.`)
      setNote('')
      setReason('')
      setAck(false)
      setSubmission(false)
    } catch (e) {
      setErr(e instanceof BizPlanError ? e.message : '저장하지 못했습니다.')
      void pfState.load()
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-navy-100" data-save-version>
      <h3 className="flex items-center gap-2 text-[1.05rem] font-extrabold text-navy-900">
        <Save size={18} /> 지금 상태를 버전으로 저장 <Pill tone="teal">{label}</Pill>
      </h3>
      <label className="flex min-h-[44px] items-start gap-2.5 rounded-xl bg-navy-50 px-3 py-2.5">
        <input type="checkbox" data-version-submission className="mt-0.5 h-5 w-5 shrink-0 accent-navy-900" checked={submission} onChange={(e) => setSubmission(e.target.checked)} />
        <span className="break-keep text-[0.98rem] font-semibold text-navy-800">
          제출본으로 확정 — 문서가 「제출본 확정」이 되고, 이 버전은 다시 고칠 수 없습니다(이후 수정은 새 버전).
        </span>
      </label>
      {submission && !v2 && (
        <ul data-version-warn className="space-y-1 rounded-xl bg-amber-50 px-3.5 py-2.5 text-[0.95rem] text-amber-900 ring-1 ring-amber-200">
          <li>처리 전 수정요청 <b>{openReq}건</b>{openReq > 0 ? ' — 먼저 처리해야 확정됩니다(서버가 막습니다)' : ''}</li>
          <li>최종 확인 전 항목 <b>{notFinal}개</b>{notFinal > 0 ? ' — 그대로 확정할 수는 있지만, 대표님 · 이사님 확인을 먼저 받는 것이 좋습니다' : ''}</li>
        </ul>
      )}
      {submission && v2 && (
        <div className="space-y-2" data-submit-check>
          <PreflightView state={pfState} onGo={onGo} />
          {pf && pf.blocks > 0 && (
            <p data-submit-blocked className="break-keep rounded-xl bg-rose-50 px-3.5 py-2.5 text-[0.95rem] font-bold text-rose-800 ring-1 ring-rose-200">
              차단 항목 {pf.blocks}개를 먼저 고쳐야 제출본으로 확정할 수 있습니다 (예외 승인으로도 넘길 수 없음).
            </p>
          )}
          {pf && pf.blocks === 0 && needAck && (
            <div data-submit-override className="space-y-2 rounded-xl bg-amber-50 px-3.5 py-3 ring-1 ring-amber-200">
              <label className="flex min-h-[44px] items-start gap-2.5">
                <input type="checkbox" data-submit-ack className="mt-0.5 h-5 w-5 shrink-0 accent-navy-900" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                <span className="break-keep text-[0.98rem] font-bold text-amber-900">
                  위 확인 항목 {pf.warns}개를 검토했고, 이 상태로 제출본을 확정합니다 (예외 승인).
                </span>
              </label>
              <textarea
                data-submit-reason
                className="field-input w-full resize-y"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="확인한 내용과 예외로 확정하는 까닭 (10자 이상) — 예: 재확인 남은 2항목은 대표님 구두 확인, 별첨은 이번 보증 대상 아님"
              />
              <p className="text-[0.85rem] text-amber-900">이 까닭 · 점검 결과 · 승인자({data.me.name})가 제출본 버전에 함께 남습니다.</p>
            </div>
          )}
        </div>
      )}
      <input className="field-input w-full" data-version-note value={note} onChange={(e) => setNote(e.target.value)} placeholder={submission ? '예: 신용보증기금 스타트업지점 제출본' : '예: 대표님 1차 검토 반영'} />
      {err && <p data-version-error className="break-keep text-[0.95rem] font-bold text-rose-600">{err}</p>}
      <button type="button" data-version-save className="btn-primary min-h-[48px] w-full sm:w-auto" disabled={busy || blocked} onClick={() => void save()}>
        {busy ? <Loader2 size={16} className="animate-spin" /> : submission ? <Lock size={16} /> : <Save size={16} />} {label} {submission ? (needAck ? '예외 승인하고 제출본으로 확정' : '제출본으로 확정') : '저장'}
      </button>
    </section>
  )
}

function VersionRow({ id }: { id: number }) {
  const { data, fields, notify } = usePlan()
  const v = data.versions.find((x) => x.id === id)!
  const [full, setFull] = useState<VersionFull | null>(null)
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<'doc' | 'diff' | null>(null)

  async function open(m: 'doc' | 'diff') {
    if (full) return setMode(m)
    setBusy(true)
    try {
      setFull(await getVersion(id))
      setMode(m)
    } catch (e) {
      notify(e instanceof BizPlanError ? e.message : '버전을 불러오지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }
  const changed = full
    ? SECTIONS.flatMap((s) => s.groups.flatMap((g) => g.fields))
        .filter(isEditable)
        .filter((d) => plainText(d, full.snapshot?.[d.key]?.value ?? null) !== plainText(d, fields.get(d.key)?.value ?? null))
    : []

  return (
    <article data-version-row={v.label} className="space-y-2 rounded-xl bg-white px-3.5 py-3 ring-1 ring-navy-100">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[1.1rem] font-black text-navy-900">{v.label}</span>
        {v.is_submission && <Pill tone="teal">제출본</Pill>}
        <Pill>{v.doc_status}</Pill>
        <span className="text-[0.9rem] text-navy-500">{v.created_by} · {when(v.created_at)}</span>
      </div>
      {v.note && <p className="break-keep text-[0.95rem] text-navy-700">{v.note}</p>}
      {v.override_reason && (
        <p data-version-override className="break-keep rounded-lg bg-amber-50 px-3 py-2 text-[0.92rem] text-amber-900">
          <b>예외 승인</b> · {v.approved_by} — {v.override_reason}
        </p>
      )}
      <div className="flex flex-wrap gap-1.5">
        <button type="button" data-version-open={v.label} disabled={busy} onClick={() => void open('doc')} className="min-h-[40px] rounded-full bg-navy-50 px-3.5 text-[0.92rem] font-bold text-navy-700">
          {busy && <Loader2 size={14} className="mr-1 inline animate-spin" />}미리 보기
        </button>
        <button type="button" data-version-diff={v.label} disabled={busy} onClick={() => void open('diff')} className="min-h-[40px] rounded-full bg-navy-50 px-3.5 text-[0.92rem] font-bold text-navy-700">
          지금과 비교
        </button>
      </div>
      {full && mode && (
        <Modal open title={`${v.label}${mode === 'diff' ? ' ↔ 지금' : ' 미리 보기'}`} onClose={() => setMode(null)} wide layout="sticky" printable={mode === 'doc'}>
          {mode === 'doc' ? (
            <PlanDocument sections={SECTIONS.filter((s) => s.part !== '참고')} valueOf={(k) => full.snapshot?.[k]?.value ?? null} label={`${v.label}${v.is_submission ? ' · 제출본' : ''}`} />
          ) : (
            <div className="space-y-2" data-version-changes={changed.length}>
              <p className="text-[0.98rem] font-bold text-navy-700">{changed.length === 0 ? '이 버전 뒤로 바뀐 항목이 없습니다.' : `이 버전 뒤로 바뀐 항목 ${changed.length}개`}</p>
              {changed.map((d) => (
                <details key={d.key} className="rounded-xl bg-white px-3 py-2 ring-1 ring-navy-100">
                  <summary className="min-h-[40px] cursor-pointer py-2 text-[0.95rem] font-bold text-navy-800">{FIELD_BY_KEY.get(d.key)?.path}</summary>
                  <DiffView def={d} before={full.snapshot?.[d.key]?.value ?? null} after={fields.get(d.key)?.value ?? null} labels={[v.label, '지금']} />
                </details>
              ))}
            </div>
          )}
        </Modal>
      )}
    </article>
  )
}

const SPECIAL: Record<string, string> = { _doc: '문서 상태', _version: '버전 저장', _member: '참여자' }

function DocHistory({ onGo }: { onGo: (key: string) => void }) {
  const [h, setH] = useState<HistoryData | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  async function load() {
    setBusy(true)
    setErr(null)
    try {
      setH(await history(null))
    } catch (e) {
      setErr(e instanceof BizPlanError ? e.message : '기록을 불러오지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="space-y-2" data-doc-history>
      <div className="flex items-center gap-2">
        <h3 className="flex-1 text-[1.05rem] font-extrabold text-navy-900">문서 전체 기록</h3>
        <button type="button" data-doc-history-load onClick={() => void load()} disabled={busy} className="btn-ghost min-h-[44px] px-3.5">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <History size={16} />} {h ? '새로 보기' : '기록 보기'}
        </button>
      </div>
      {err && <p className="text-[0.95rem] font-bold text-rose-600">{err}</p>}
      {h && h.revisions.length === 0 && <p className="text-[0.95rem] text-navy-400">아직 기록이 없습니다.</p>}
      {h && (
        <ul className="divide-y divide-navy-50 overflow-hidden rounded-2xl bg-white ring-1 ring-navy-100">
          {h.revisions.map((r) => {
            const ref = FIELD_BY_KEY.get(r.key)
            return (
              <li key={r.id} data-doc-history-row={r.key} className="space-y-0.5 px-3.5 py-2.5">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.92rem]">
                  <span className="font-extrabold text-navy-800">{who(r.actor_name, r.actor_title)}</span>
                  <span className="text-navy-500">{when(r.at)}</span>
                  {r.version_label && <Pill>{r.version_label}</Pill>}
                  {r.request_id && <Pill tone="orange">요청 반영</Pill>}
                </p>
                {ref ? (
                  <button type="button" onClick={() => onGo(r.key)} className="block min-h-[36px] break-keep text-left text-[0.95rem] font-bold text-teal-700 underline-offset-2 hover:underline">
                    {ref.path} ›
                  </button>
                ) : (
                  <p className="text-[0.95rem] font-bold text-navy-700">{SPECIAL[r.key] ?? r.key}</p>
                )}
                <p className="break-keep text-[0.92rem] text-navy-600">
                  {r.before_status !== r.after_status && `${r.before_status || '—'} → ${r.after_status}`}
                  {r.reason && `${r.before_status !== r.after_status ? ' · ' : ''}${r.reason}`}
                </p>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
