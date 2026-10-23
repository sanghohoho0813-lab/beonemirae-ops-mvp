import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Loader2, Minus, Plus } from 'lucide-react'
import { Modal } from '../Modal'
import {
  BASIS_KINDS, FIELD_BY_KEY, FIELD_STATUSES, emptyValue, isStaleCheck, plainText,
  type Basis, type FieldDef, type FieldRow, type FieldStatus, type GridValue, type TableRow, type Value,
} from '../../lib/bizPlan'
import { BizPlanError, saveField } from '../../lib/bizPlanApi'
import { DiffView, StatusBadge, usePlan, when } from './parts'

// ─────────────────────────────────────────────────────────────────────────────
// 항목 편집 — 사업계획 담당만 (0146)
//
//  · 고칠 때마다 「바꾸기 전 · 후 · 누가 · 언제 · 왜 · 어느 요청」이 서버에 한 줄 남습니다.
//  · 저장은 판 번호(rev)를 들고 갑니다. 그사이 다른 분이 고쳤으면 서버가 저장하지 않고
//    그분 내용을 돌려줍니다 → 이 창이 두 내용을 나란히 보여 주고, 고르게 합니다
//    (조용히 덮어쓰지 않음).
//  · 수정요청에서 열면(「제안 반영」) 그 요청과 이어 저장하고, 요청은 「반영 완료」가 됩니다.
// ─────────────────────────────────────────────────────────────────────────────

export function FieldEditor({ fieldKey, requestId, suggestion, onClose }: { fieldKey: string; requestId?: string; suggestion?: string; onClose: () => void }) {
  const { fields, reload, notify, requestsByKey, checksByKey } = usePlan()
  const ref = FIELD_BY_KEY.get(fieldKey)
  const row = fields.get(fieldKey)
  const def = ref?.def
  const request = requestId ? requestsByKey.get(fieldKey)?.find((r) => r.id === requestId) : undefined

  const startValue = (): Value => {
    if (!def) return ''
    if (suggestion != null && (def.kind === 'text' || def.kind === 'long')) return suggestion
    return clone(row?.value ?? emptyValue(def))
  }
  const [value, setValue] = useState<Value>(startValue)
  const [status, setStatus] = useState<FieldStatus>(row?.status === '작성 전' || !row ? '초안 입력 완료' : row.status === '수정 요청 있음' && requestId ? '수정 반영 완료' : row.status)
  const [basis, setBasis] = useState<Basis>({ ...(row?.basis ?? {}) })
  const [reason, setReason] = useState(request ? `${request.requester_name} 요청 반영 — ${request.req_type}` : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState<FieldRow | null>(null)
  const [baseRev, setBaseRev] = useState(row?.rev ?? 0)

  useEffect(() => {
    setValue(startValue())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldKey])

  const before = row?.value ?? (def ? emptyValue(def) : '')
  const changed = useMemo(() => def && plainText(def, before) !== plainText(def, value), [def, before, value])
  //  지금 문장에 대한 확인 표시 — 내용을 고쳐 저장하면 「재확인 필요」가 됩니다
  const liveChecks = (checksByKey.get(fieldKey) ?? []).filter((c) => !isStaleCheck(c, row))
  const staleAfter = liveChecks.length
  const staleNames = liveChecks.map((c) => `${c.name} ${c.mark}`).join(' · ')
  useEffect(() => {
    if (changed && status === '최종 확인 완료') setStatus('수정 반영 완료')
  }, [changed, status])

  if (!ref || !def) return null

  async function save(overrideRev?: number) {
    if (!def) return
    setBusy(true)
    setError(null)
    try {
      const res = await saveField({
        key: fieldKey,
        value: normalize(def, value),
        status,
        basis: cleanBasis(basis),
        reason: reason.trim(),
        expectedRev: overrideRev ?? baseRev,
        requestId: requestId ?? null,
      })
      if (!res.ok && res.conflict) {
        setConflict(res.field)
        setBusy(false)
        return
      }
      await reload()
      const re = res.stale_checks ? ` 확인 표시 ${res.stale_checks}개는 「재확인 필요」가 되었습니다.` : ''
      notify((res.unchanged ? '바뀐 것이 없어 그대로 두었습니다.' : requestId ? '저장했습니다 · 수정요청은 「반영 완료」로 닫혔습니다.' : '저장했습니다 · 기록이 남았습니다.') + re)
      onClose()
    } catch (e) {
      setError(e instanceof BizPlanError ? e.message : '저장하지 못했습니다. 적던 내용은 그대로 있습니다.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      title={request ? '수정요청 반영' : '항목 편집'}
      onClose={() => !busy && onClose()}
      layout="sticky"
      wide
      footer={
        <div className="flex w-full flex-col gap-2">
          {error && <p data-edit-error className="break-keep text-[0.95rem] font-bold text-rose-600">{error}</p>}
          <div className="flex gap-2">
            <button type="button" className="btn-ghost flex-1" disabled={busy} onClick={onClose}>
              닫기
            </button>
            <button type="button" data-edit-save className="btn-primary flex-[2]" disabled={busy || !!conflict} onClick={() => void save()}>
              {busy ? <Loader2 size={17} className="animate-spin" /> : null} {requestId ? '반영하고 요청 닫기' : '저장'}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4" data-field-editor={fieldKey}>
        <div>
          <p className="break-keep text-[0.9rem] font-bold text-navy-500">{ref.path}</p>
          {def.hint && <p className="mt-1 break-keep text-[0.9rem] text-navy-500">원본 안내 · {def.hint}</p>}
        </div>

        {request && (
          <div className="rounded-xl bg-orange-50 px-3.5 py-3 ring-1 ring-orange-200">
            <p className="text-[0.92rem] font-extrabold text-orange-800">
              {request.requester_name} {request.requester_title} · {request.req_type} · {when(request.created_at)}
            </p>
            <p className="mt-1 whitespace-pre-wrap break-keep text-[0.98rem] text-navy-800">{request.body}</p>
            {request.suggestion && def.kind !== 'text' && def.kind !== 'long' && (
              <p className="mt-1.5 whitespace-pre-wrap break-keep text-[0.95rem] text-navy-700">
                <b>제안</b> · {request.suggestion}
              </p>
            )}
          </div>
        )}

        {conflict && (
          <div data-edit-conflict className="space-y-2 rounded-xl bg-rose-50 px-3.5 py-3 ring-1 ring-rose-200">
            <p className="flex items-start gap-2 break-keep text-[0.98rem] font-extrabold text-rose-800">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              {conflict.updated_by || '다른 분'}님이 방금 이 항목을 고쳤습니다({when(conflict.updated_at)}). 저장하지 않았습니다 — 덮어쓰지 않습니다.
            </p>
            <DiffView def={def} before={conflict.value} after={value} labels={['서버(그분) 내용', '내가 고친 내용']} />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                data-conflict-take-server
                className="btn-ghost min-h-[44px] flex-1"
                onClick={() => {
                  setValue(clone(conflict.value))
                  setStatus(conflict.status)
                  setBasis({ ...(conflict.basis ?? {}) })
                  setBaseRev(conflict.rev)
                  setConflict(null)
                }}
              >
                그분 내용으로 다시 고치기
              </button>
              <button
                type="button"
                data-conflict-keep-mine
                className="btn-primary min-h-[44px] flex-1"
                onClick={() => {
                  const rev = conflict.rev
                  setBaseRev(rev)
                  setConflict(null)
                  void save(rev)
                }}
              >
                그분 내용을 확인했고, 내 내용으로 저장
              </button>
            </div>
          </div>
        )}

        <ValueEditor def={def} value={value} onChange={setValue} />

        {changed && !conflict && (
          <div>
            <p className="mb-1 text-[0.9rem] font-bold text-navy-500">바꾸기 전 · 후</p>
            <DiffView def={def} before={before} after={value} />
          </div>
        )}

        <fieldset>
          <legend className="field-label">검토 상태</legend>
          <div className="flex flex-wrap gap-1.5">
            {FIELD_STATUSES.map((s) => {
              //  0147 — 내용을 고치면서 「최종 확인 완료」로 둘 수 없습니다(서버도 「수정 반영 완료」로 바꿈)
              const off = s === '최종 확인 완료' && !!changed
              return (
                <button key={s} type="button" data-edit-status={s} aria-pressed={status === s} disabled={off} onClick={() => setStatus(s)} className={`rounded-full ${status === s ? 'ring-2 ring-navy-900 ring-offset-1' : 'opacity-70'} disabled:opacity-30`}>
                  <StatusBadge status={s} />
                </button>
              )
            })}
          </div>
          {changed && staleAfter > 0 && (
            <p data-edit-stale-warn className="mt-1.5 break-keep rounded-lg bg-amber-50 px-3 py-2 text-[0.92rem] font-bold text-amber-900 ring-1 ring-amber-200">
              이 문장에 붙은 확인 표시 {staleAfter}개({staleNames})는 저장하면 「변경 전 문장에 대한 표시」로 남고, 지금 문장은 「재확인 필요」가 됩니다.
            </p>
          )}
          <p className="mt-1.5 break-keep text-[0.88rem] text-navy-500">「초안 입력 완료」와 「최종 확인 완료」는 다릅니다 — 최종 확인은 대표님 · 이사님 확인이 끝난 뒤에.</p>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="field-label">근거 — 정보 출처 · 기준일 · 확인 여부</legend>
          <div className="flex flex-wrap gap-1.5">
            {BASIS_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                data-edit-basis-kind={k}
                aria-pressed={basis.kind === k}
                onClick={() => setBasis((b) => ({ ...b, kind: b.kind === k ? undefined : k }))}
                className={`min-h-[40px] rounded-full px-3.5 text-[0.95rem] font-bold ${basis.kind === k ? 'bg-navy-900 text-white' : 'bg-navy-50 text-navy-600'}`}
              >
                {k}
              </button>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_10rem]">
            <input className="field-input" placeholder="출처 (예: 법인등기부 · 2026-10-22 미팅)" value={basis.source ?? ''} onChange={(e) => setBasis((b) => ({ ...b, source: e.target.value }))} />
            <input className="field-input" placeholder="기준일" value={basis.asOf ?? ''} onChange={(e) => setBasis((b) => ({ ...b, asOf: e.target.value }))} />
          </div>
          <input className="field-input w-full" placeholder="확인할 것 (없으면 비움)" value={basis.note ?? ''} onChange={(e) => setBasis((b) => ({ ...b, note: e.target.value }))} />
        </fieldset>

        <label className="block">
          <span className="field-label">수정 사유 (기록에 남습니다)</span>
          <input data-edit-reason className="field-input w-full" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="예: 이사님 요청 — 매출 숫자 정정" />
        </label>
        {row?.updated_at && (
          <p className="text-[0.88rem] text-navy-400">
            마지막 수정 · {row.updated_by} {when(row.updated_at)} (판 {row.rev})
          </p>
        )}
      </div>
    </Modal>
  )
}

// ── 값 편집 ──────────────────────────────────────────────────────────────────
function ValueEditor({ def, value, onChange }: { def: FieldDef; value: Value; onChange: (v: Value) => void }) {
  if (def.kind === 'text') {
    return (
      <label className="block">
        <span className="field-label">{def.label}{def.unit ? ` (${def.unit})` : ''}</span>
        <input data-edit-value className="field-input w-full" value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} placeholder={def.hint} />
      </label>
    )
  }
  if (def.kind === 'long') {
    const s = typeof value === 'string' ? value : ''
    return (
      <label className="block">
        <span className="field-label">{def.label}</span>
        <textarea
          data-edit-value
          className="field-input w-full resize-y leading-relaxed"
          rows={Math.min(18, Math.max(6, s.split('\n').length + 2))}
          value={s}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    )
  }
  if (def.kind === 'choice') {
    const s = typeof value === 'string' ? value : ''
    return (
      <fieldset>
        <legend className="field-label">{def.label}</legend>
        <div className="flex flex-wrap gap-1.5">
          {def.options.map((o) => (
            <button key={o} type="button" data-edit-choice={o} aria-pressed={s === o} onClick={() => onChange(s === o ? '' : o)} className={`min-h-[44px] rounded-full px-4 text-[0.98rem] font-bold ${s === o ? 'bg-navy-900 text-white' : 'bg-navy-50 text-navy-700'}`}>
              {o}
            </button>
          ))}
        </div>
      </fieldset>
    )
  }
  if (def.kind === 'grid') {
    const g = (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as GridValue
    return (
      <fieldset>
        <legend className="field-label">{def.label}{def.unit ? ` (단위 ${def.unit})` : ''}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {def.cells.map((c) => (
            <label key={c.key} className={`block ${c.wide ? 'sm:col-span-2' : ''}`}>
              <span className="mb-1 block break-keep text-[0.9rem] font-bold text-navy-600">{c.label}</span>
              <input data-edit-cell={c.key} className="field-input w-full" inputMode={c.num ? 'decimal' : undefined} placeholder={c.placeholder} value={g[c.key] ?? ''} onChange={(e) => onChange({ ...g, [c.key]: e.target.value })} />
            </label>
          ))}
        </div>
      </fieldset>
    )
  }
  if (def.kind === 'table') {
    const rows = (Array.isArray(value) ? value : []) as TableRow[]
    const fixed = !!def.rowLabels
    const count = fixed ? def.rowLabels!.length : rows.length
    const setCell = (i: number, k: string, v: string) => {
      const next = Array.from({ length: Math.max(count, i + 1) }, (_, j) => ({ ...(rows[j] ?? {}) }))
      next[i][k] = v
      onChange(next)
    }
    return (
      <fieldset>
        <legend className="field-label">{def.label}{def.unit ? ` (단위 ${def.unit})` : ''}</legend>
        <div className="space-y-2.5">
          {Array.from({ length: count }, (_, i) => (
            <div key={i} data-edit-row={i} className="rounded-xl bg-navy-50/60 p-2.5 ring-1 ring-navy-100">
              <div className="mb-1.5 flex items-center gap-2">
                <p className="min-w-0 flex-1 break-keep text-[0.92rem] font-extrabold text-navy-700">{fixed ? def.rowLabels![i] : `${i + 1}줄`}</p>
                {!fixed && (
                  <button type="button" aria-label={`${i + 1}줄 지우기`} className="flex h-10 w-10 items-center justify-center rounded-lg text-navy-500 hover:bg-white" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
                    <Minus size={18} />
                  </button>
                )}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {def.columns.map((c) => (
                  <label key={c.key} className={`block ${c.wide ? 'sm:col-span-2' : ''}`}>
                    <span className="mb-0.5 block break-keep text-[0.85rem] font-bold text-navy-500">{c.label}</span>
                    {c.wide ? (
                      <textarea className="field-input w-full resize-y" rows={2} placeholder={c.placeholder} value={rows[i]?.[c.key] ?? ''} onChange={(e) => setCell(i, c.key, e.target.value)} />
                    ) : (
                      <input className="field-input w-full" inputMode={c.num ? 'decimal' : undefined} placeholder={c.placeholder} value={rows[i]?.[c.key] ?? ''} onChange={(e) => setCell(i, c.key, e.target.value)} />
                    )}
                  </label>
                ))}
              </div>
            </div>
          ))}
          {!fixed && (
            <button type="button" data-edit-add-row className="btn-ghost min-h-[44px] w-full" onClick={() => onChange([...rows, {}])}>
              <Plus size={17} /> 줄 더하기
            </button>
          )}
          {!fixed && rows.length > def.rows && (
            <p className="break-keep text-[0.9rem] font-semibold text-amber-800">
              원본 표는 {def.rows}줄입니다 — {def.extendable ? '제출할 때 줄을 늘리거나 별지로 붙입니다.' : '원본 칸 수에 맞게 줄여 주세요.'}
            </p>
          )}
        </div>
      </fieldset>
    )
  }
  return null
}

function clone<T>(v: T): T {
  return v == null ? v : (JSON.parse(JSON.stringify(v)) as T)
}

/** 빈 줄 · 빈 칸 정리 (고정 줄 표는 줄 수 유지) */
function normalize(def: FieldDef, v: Value): Value {
  if (def.kind === 'table') {
    const rows = (Array.isArray(v) ? v : []).map((r) => Object.fromEntries(Object.entries(r ?? {}).filter(([, x]) => String(x ?? '').trim() !== '')))
    if (def.rowLabels) return def.rowLabels.map((_, i) => rows[i] ?? {})
    return rows.filter((r) => Object.keys(r).length > 0)
  }
  if (def.kind === 'grid') {
    return Object.fromEntries(Object.entries((v ?? {}) as GridValue).filter(([, x]) => String(x ?? '').trim() !== ''))
  }
  return typeof v === 'string' ? v.replace(/\s+$/, '') : ''
}

function cleanBasis(b: Basis): Basis {
  const out: Basis = {}
  if (b.kind) out.kind = b.kind
  if (b.source?.trim()) out.source = b.source.trim()
  if (b.asOf?.trim()) out.asOf = b.asOf.trim()
  if (b.note?.trim()) out.note = b.note.trim()
  return out
}
