import { useState } from 'react'
import { History, Loader2, Plus } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useData } from '../context/DataContext'
import { useSchemaAtLeast } from '../lib/schemaGate'
import { createOpsChange, updateOpsChange } from '../lib/evidenceRepo'
import {
  OPS_CHANGE_KINDS,
  OPS_CHANGE_KIND_LABEL,
  OPS_CHANGE_STATUS_LABEL,
  CONFOUNDING_KINDS,
  type OpsChangeKind,
  type OpsChangeStatus,
} from '../lib/opsChanges'
import { today } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// 운영 변화 기록 — 설정 화면 카드 (0106)
//
//  AX 사용 시작 · 주요 기능 적용 · 차량 추가·교체 · 기사·인력 변화 · 거점
//  이전 · 거래처·계약·단가 변화. 적용일이 있어야 성과 비교 구간과 겹치는지
//  압니다. 계획은 계획으로 남깁니다 — 저장해도 운영 데이터는 바뀌지 않습니다.
//
//  ⚠ 판 106 이전이면 「SQL 실행 후」라고만 말하고 단추를 그리지 않습니다.
// ─────────────────────────────────────────────────────────────────────────────

export function OpsChangesCard() {
  const { profile, role } = useAuth()
  const { data, reload } = useData()
  const ready = useSchemaAtLeast(106)
  const canWrite = role === 'admin' || role === 'office'
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<OpsChangeKind>('vehicle')
  const [title, setTitle] = useState('')
  const [status, setStatus] = useState<OpsChangeStatus>('planned')
  const [on, setOn] = useState(today())
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const rows = data.opsChanges

  async function save() {
    if (!title.trim()) { setError('무엇이 바뀌는지 한 줄 적어 주세요.'); return }
    setBusy(true); setError(null)
    try {
      await createOpsChange({ kind, title, status, effectiveOn: on || null, note, createdName: profile?.name ?? '' })
      await reload()
      setOpen(false); setTitle(''); setNote('')
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했습니다.')
    }
    setBusy(false)
  }

  async function markApplied(id: string) {
    setBusy(true); setError(null)
    try {
      await updateOpsChange(id, { status: 'applied', effectiveOn: today() })
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : '바꾸지 못했습니다.')
    }
    setBusy(false)
  }

  return (
    <section data-ops-changes className="card p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-navy-50 text-navy-500">
          <History size={22} strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="t-card text-navy-900">운영 변화 기록</p>
          <p className="t-muted mt-1 break-keep">
            차량 추가 · 기사 변화 · 거점 이전 · 계약·단가 변화의 <b className="text-navy-600">적용일</b>을 적습니다.
            성과 비교 구간에 겹치면 화면이 「AX 단독 효과 분리 불가 · 복합 개선」이라고 스스로 말합니다.
            계획은 계획으로 남고, 저장해도 운영 데이터는 바뀌지 않습니다.
          </p>
        </div>
      </div>

      {ready === false && (
        <p data-ops-changes-gate className="t-body mt-3 break-keep rounded-2xl bg-amber-50 px-4 py-3 font-bold text-amber-800">
          기록 표가 아직 없습니다 — supabase/proposals/PROPOSAL_0106_evidence.sql 을 실행하면 여기서 적을 수 있습니다.
          그전까지 성과 화면은 「변화 기록 없음(모름)」으로 표시합니다.
        </p>
      )}

      {ready && (
        <>
          <ul data-ops-changes-list className="mt-3 flex flex-col gap-1.5">
            {(rows ?? []).length === 0 && (
              <li className="t-body rounded-2xl bg-navy-50 px-4 py-3 text-navy-500">아직 기록이 없습니다. AX 사용 시작일부터 적어 두세요.</li>
            )}
            {(rows ?? []).map((c) => (
              <li key={c.id} data-ops-change={c.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl bg-navy-50 px-4 py-2.5">
                <span className={`pill ${CONFOUNDING_KINDS.includes(c.kind) ? 'bg-amber-100 text-amber-800' : 'bg-navy-100 text-navy-600'}`}>
                  {OPS_CHANGE_KIND_LABEL[c.kind]}
                </span>
                <b className="t-body min-w-0 flex-1 break-keep text-navy-900">{c.title}</b>
                <span className={`pill ${c.status === 'applied' ? 'bg-teal-50 text-teal-700' : 'bg-navy-100 text-navy-500'}`}>
                  {OPS_CHANGE_STATUS_LABEL[c.status]}
                </span>
                <span className="t-caption tabular-nums text-navy-500">{c.effectiveOn ?? '날짜 미정'}</span>
                {c.status === 'planned' && canWrite && (
                  <button data-ops-change-apply={c.id} onClick={() => void markApplied(c.id)} disabled={busy} className="btn-ghost min-h-[2.5rem] px-2.5 text-[0.98rem]">
                    오늘 적용됨으로
                  </button>
                )}
                {c.note && <p className="t-caption w-full break-keep text-navy-500">{c.note}</p>}
              </li>
            ))}
          </ul>

          {canWrite && !open && (
            <button data-ops-change-new onClick={() => setOpen(true)} className="btn-ghost mt-3">
              <Plus size={17} strokeWidth={2.4} /> 변화 적기
            </button>
          )}
          {canWrite && open && (
            <div data-ops-change-form className="mt-3 grid gap-2.5 rounded-2xl bg-navy-50 p-4 sm:grid-cols-2">
              <label className="field-label sm:col-span-2">종류
                <select value={kind} onChange={(e) => setKind(e.target.value as OpsChangeKind)} className="field-input mt-1">
                  {OPS_CHANGE_KINDS.map((k) => <option key={k.kind} value={k.kind}>{k.label}{k.hint ? ` — ${k.hint}` : ''}</option>)}
                </select>
              </label>
              <label className="field-label sm:col-span-2">무엇이 바뀌나 (한 줄)
                <input data-ops-change-title value={title} onChange={(e) => setTitle(e.target.value)} className="field-input mt-1" placeholder="예: 3.5톤 차량 1대 추가" maxLength={120} />
              </label>
              <label className="field-label">상태
                <select value={status} onChange={(e) => setStatus(e.target.value as OpsChangeStatus)} className="field-input mt-1">
                  <option value="planned">계획 (아직 아님)</option>
                  <option value="applied">적용됨</option>
                </select>
              </label>
              <label className="field-label">{status === 'applied' ? '적용일' : '예정일 (없으면 비움)'}
                <input type="date" value={on} onChange={(e) => setOn(e.target.value)} className="field-input mt-1" />
              </label>
              <label className="field-label sm:col-span-2">메모 (선택)
                <input value={note} onChange={(e) => setNote(e.target.value)} className="field-input mt-1" maxLength={300} />
              </label>
              {error && <p className="t-caption font-bold text-rose-600 sm:col-span-2">{error}</p>}
              <div className="flex gap-2 sm:col-span-2">
                <button data-ops-change-save onClick={() => void save()} disabled={busy} className="btn-navy">
                  {busy ? <Loader2 size={16} className="animate-spin" /> : '저장'}
                </button>
                <button onClick={() => setOpen(false)} className="btn-ghost">닫기</button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  )
}
