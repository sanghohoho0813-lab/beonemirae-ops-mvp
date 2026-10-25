import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Check, Loader2, RotateCcw, Star } from 'lucide-react'
import {
  CUSTOM, LATER, MIN_DECIDERS, basisOf, eok, impactOf, resolveDecision, type Decision, type Impact, type Pick,
} from '../../../lib/bizStrategy'
import { FIELD_BY_KEY } from '../../../lib/bizPlan'
import { BizPlanError } from '../../../lib/bizPlanApi'
import { decide } from '../../../lib/bizStrategyApi'
import { usePlan, when } from '../parts'
import { Delta, Lines, More, StateChip, useStrategy } from './ctx'

// ③ 결정 10개 — 대표님 · 이사님이 직접 고릅니다
//
//  · 안을 누르면 「고를 안」으로 표시만 됩니다. 아래 「이 안으로 결정」을 눌러야 저장됩니다(두 번).
//  · 고르지 않은 것은 저장하지 않습니다. 「추후 결정」도 사람이 누른 것만.
//  · 고른 뒤 숫자가 바뀌면 「재확인 필요」 — 고를 때 본 숫자와 지금 숫자를 나란히 보여 줍니다.

export function Decisions() {
  const s = useStrategy()
  const ds = [...s.model.decisions].sort((a, b) => a.no - b.no)
  return (
    <div className="space-y-4" data-strategy-decisions>
      <p className="break-keep px-1 text-[0.95rem] text-navy-600">
        {s.isDecider
          ? '안을 누르면 계산 근거 · 조건 · 위험이 펼쳐집니다. 「이 안으로 결정」을 눌러야 저장되고, 두 분이 같은 안을 고르면 「합의」가 됩니다. 결정만으로 사업계획서 본문이 바뀌지는 않습니다.'
          : '결정은 사업계획서 「검토」 참여자(대표님 · 이사님)만 남길 수 있습니다. 여기서는 두 분의 선택과 근거를 볼 수 있습니다.'}
      </p>
      {s.deciders.length < MIN_DECIDERS && (
        <p data-no-deciders={s.deciders.length} className="break-keep rounded-xl bg-amber-50 px-3 py-2 text-[0.95rem] font-bold text-amber-900">
          결정할 분(사업계획서 「검토」 참여자)이 {s.deciders.length}명입니다. 두 분 이상이어야 합의로 셉니다 — 참여자 탭에서 대표님 · 이사님을 「검토」로 등록해 주세요.
        </p>
      )}
      {ds.map((d) => <DecisionCard key={d.key} d={d} />)}
    </div>
  )
}

function pickLabel(d: Decision, choice: string | null | undefined, custom: unknown): string {
  if (!choice) return '미선택'
  if (choice === LATER) return '추후 결정'
  if (choice === CUSTOM) return `직접 입력 ${customText(d, custom)}`
  return d.options.find((o) => o.id === choice)?.label ?? choice
}
function customText(d: Decision, v: unknown): string {
  const c = d.custom
  if (!c) return ''
  if (c.kind === 'number') return `${v ?? ''}${c.unit ?? ''}`
  if (c.kind === 'numbers') return (c.fields ?? []).map((f) => `${f.label} ${(v as Record<string, unknown>)?.[f.id] ?? '—'}${f.unit ?? ''}`).join(' · ')
  if (c.kind === 'multi') return (c.choices ?? []).filter((x) => Array.isArray(v) && (v as string[]).includes(x.id)).map((x) => x.label).join(' · ') || '없음'
  return String(v ?? '')
}

function DecisionCard({ d }: { d: Decision }) {
  const s = useStrategy()
  const plan = usePlan()
  const res = resolveDecision(d.key, s.rows, s.deciders, s.assumpRev)
  const myRow = s.rows.find((r) => r.key === d.key && r.profile_id === s.myId && r.choice) ?? null
  const myStale = !!myRow && myRow.assump_rev < s.assumpRev
  const [sel, setSel] = useState<string | null>(null)
  const [custom, setCustom] = useState<unknown>(() => (myRow?.choice === CUSTOM ? myRow.custom : d.custom?.kind === 'multi' ? [] : d.custom?.kind === 'numbers' ? {} : ''))
  const [note, setNote] = useState(myRow?.note ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const draft = s.noteDraft[d.key]
  useEffect(() => {
    if (draft) setNote((n) => (n ? `${n}\n${draft}` : draft))
  }, [draft])

  //  안마다 영향 — 지금 보기 기준에서 이 결정만 그 안으로 바꾸면
  const impacts = useMemo(() => {
    const out: Record<string, Impact> = {}
    for (const o of d.options) out[o.id] = impactOf(s.model, s.viewPicks, { key: d.key, pick: { choice: o.id } }, s.appFallback)
    return out
  }, [d, s.model, s.viewPicks, s.appFallback])
  const customPick: Pick = { choice: CUSTOM, custom }
  const customImpact = useMemo(() => (d.custom ? impactOf(s.model, s.viewPicks, { key: d.key, pick: customPick }, s.appFallback) : null), [d, s.model, s.viewPicks, s.appFallback, JSON.stringify(custom)]) // eslint-disable-line react-hooks/exhaustive-deps
  const ref = impacts[d.recommended ?? d.options[0]?.id] ?? Object.values(impacts)[0]
  const vary = (k: keyof Impact) => new Set(Object.values(impacts).map((i) => Math.round(i[k] / 1e6))).size > 1
  const showC = vary('contribution')
  const showG = vary('guarantee')

  async function save(choice: string) {
    setBusy(true)
    setErr(null)
    try {
      const pick: Pick = { choice, custom: choice === CUSTOM ? custom : undefined }
      const basis = choice === LATER ? {} : basisOf(s.model, d, pick, s.viewPicks, s.appFallback)
      const r = await decide({ key: d.key, choice, custom: choice === CUSTOM ? custom : null, note: note.trim(), assumpRev: s.assumpRev, basis })
      await s.reload()
      setSel(null)
      if (draft) s.setNoteDraft(d.key, '')
      s.notify(choice === LATER ? '「추후 결정」으로 남겼습니다.' : r.agreed ? '결정을 남겼습니다 — 두 분이 같은 안이라 「합의」입니다.' : '결정을 남겼습니다. 다른 분의 선택을 기다립니다.')
    } catch (e) {
      const m = e instanceof BizPlanError ? e.message : '저장하지 못했습니다.'
      setErr(m)
      if (e instanceof BizPlanError && e.kind === 'conflict') await s.reload()
    } finally {
      setBusy(false)
    }
  }

  const people = res.people
  const pending = sel != null && (sel !== myRow?.choice || myStale || (sel === CUSTOM && JSON.stringify(custom) !== JSON.stringify(myRow?.custom ?? null)))
  return (
    <section data-anchor={`d-${d.key}`} data-decision={d.key} className="scroll-mt-20 space-y-3 rounded-[22px] bg-white p-4 ring-1 ring-navy-100 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="min-w-0 break-keep text-[1.12rem] font-black text-navy-900 sm:text-[1.2rem]">
          <span className="mr-1.5 text-teal-700">{d.no}.</span>{d.title}
        </h3>
        <StateChip state={res.state} />
      </div>
      <p className="break-keep text-[1rem] text-navy-700">{d.question}</p>

      <ul className="flex flex-wrap gap-1.5" aria-label="두 분의 선택">
        {people.map((p) => (
          <li key={p.decider.profile_id} data-person={p.decider.name} data-person-stale={p.stale ? 'y' : undefined}
            className={`rounded-full px-3 py-1.5 text-[0.9rem] font-bold ${p.stale ? 'bg-amber-50 text-amber-900 ring-1 ring-amber-200' : p.row ? 'bg-navy-900 text-white' : 'bg-navy-50 text-navy-500'}`}>
            {p.decider.title || p.decider.name}: {pickLabel(d, p.row?.choice, p.row?.custom)}{p.stale ? ' (재확인 필요)' : ''}
          </li>
        ))}
      </ul>

      {myStale && myRow && (
        <div data-my-restale className="space-y-2 rounded-xl bg-amber-50 px-3 py-2.5 ring-1 ring-amber-200">
          <p className="break-keep text-[0.95rem] font-extrabold text-amber-900">고른 뒤 숫자 · 결정안이 바뀌었습니다 — 「{pickLabel(d, myRow.choice, myRow.custom)}」을 지금 숫자로 다시 확인해 주세요.</p>
          <BasisCompare d={d} row={myRow} />
          {myRow.choice !== LATER && (
            <button type="button" data-reconfirm className="btn-ghost w-full" disabled={busy} onClick={() => { setSel(myRow.choice); if (myRow.choice === CUSTOM) setCustom(myRow.custom) }}>
              <RotateCcw size={16} /> 같은 안을 지금 숫자로 다시 고르기
            </button>
          )}
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {d.options.map((o) => {
          const im = impacts[o.id]
          const mine = myRow?.choice === o.id && !myStale
          const chosen = sel === o.id
          const others = people.filter((p) => p.row?.choice === o.id && !p.stale && p.decider.profile_id !== s.myId)
          return (
            <button
              key={o.id}
              type="button"
              data-option={o.id}
              aria-pressed={chosen}
              disabled={!s.isDecider}
              onClick={() => setSel(chosen ? null : o.id)}
              className={`flex min-h-[64px] flex-col gap-1 rounded-2xl px-3.5 py-3 text-left ring-1 ring-inset transition disabled:cursor-default ${chosen ? 'bg-teal-50 ring-2 ring-teal-500' : mine ? 'bg-navy-50 ring-navy-300' : 'bg-white ring-navy-200 hover:bg-navy-50/60'}`}
            >
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="break-keep text-[1.05rem] font-black text-navy-900">{o.label}</span>
                {d.recommended === o.id && <span data-rec className="inline-flex items-center gap-0.5 rounded-full bg-teal-600 px-2 py-0.5 text-[0.78rem] font-extrabold text-white"><Star size={11} /> 추천</span>}
                {mine && <span className="inline-flex items-center gap-0.5 rounded-full bg-navy-900 px-2 py-0.5 text-[0.78rem] font-extrabold text-white"><Check size={11} /> 내 선택</span>}
                {others.map((p) => <span key={p.decider.profile_id} className="rounded-full bg-violet-50 px-2 py-0.5 text-[0.78rem] font-extrabold text-violet-800">{p.decider.title || p.decider.name}</span>)}
              </span>
              {o.summary && <span className="break-keep text-[0.92rem] text-navy-600">{o.summary}</span>}
              {im && (
                <span data-impact className="text-[0.85rem] font-semibold tabular-nums text-navy-500">
                  마지막 해 {eok(im.total)} ({ref ? <Delta v={im.total - ref.total} /> : null})
                  {showC && <> · B2B 기여 {eok(im.contribution)}</>}
                  {showG && <> · 보증 검토 {eok(im.guarantee)}</>}
                </span>
              )}
            </button>
          )
        })}
        {d.custom && (
          <div data-option="custom" className={`space-y-2 rounded-2xl px-3.5 py-3 ring-1 ring-inset ${sel === CUSTOM ? 'bg-teal-50 ring-2 ring-teal-500' : 'bg-white ring-navy-200'}`}>
            <button type="button" disabled={!s.isDecider} aria-pressed={sel === CUSTOM} data-option-custom onClick={() => setSel(sel === CUSTOM ? null : CUSTOM)} className="min-h-[44px] w-full text-left text-[1.05rem] font-black text-navy-900 disabled:cursor-default">
              {d.custom.label ?? '직접 입력'}
            </button>
            {s.isDecider && <CustomInput d={d} value={custom} onChange={(v) => { setCustom(v); setSel(CUSTOM) }} />}
            {customImpact && sel === CUSTOM && (
              <p className="text-[0.85rem] font-semibold tabular-nums text-navy-500">마지막 해 {eok(customImpact.total)} ({ref ? <Delta v={customImpact.total - ref.total} /> : null})</p>
            )}
            {d.custom.kind === 'number' && !d.custom.path && <p className="text-[0.82rem] text-navy-400">이 숫자는 목표 의견으로 남고, 시나리오 계산을 바꾸지는 않습니다.</p>}
          </div>
        )}
      </div>

      <More label="선택 근거 · 계산 · 조건 · 위험 자세히" hook={`detail-${d.key}`}>
        {d.reason && <Block title="추천 이유">{d.reason}</Block>}
        {d.calc && <Block title="계산 근거">{d.calc}</Block>}
        {(d.prerequisites?.length ?? 0) > 0 && <Block title="필요한 선행조건"><Lines items={d.prerequisites} /></Block>}
        {d.risk && <Block title="가장 큰 위험요인">{d.risk}</Block>}
        {(d.evidence?.length ?? 0) > 0 && <Block title="추가로 확인할 자료"><Lines items={d.evidence} /></Block>}
        {(d.fields?.length ?? 0) > 0 && (
          <Block title="영향을 받는 사업계획서 칸">
            <div className="flex flex-wrap gap-1.5">
              {d.fields!.map((k) => (
                <button key={k} type="button" data-field-link={k} onClick={() => plan.openField(k)} className="rounded-full bg-navy-50 px-2.5 py-1 text-[0.85rem] font-bold text-navy-700 hover:bg-navy-100">
                  {FIELD_BY_KEY.get(k)?.def.label?.replace(/\s+/g, ' ').slice(0, 28) ?? k}
                </button>
              ))}
            </div>
          </Block>
        )}
        {(d.qa?.length ?? 0) > 0 && (
          <Block title="관련 심사 질문">
            <div className="flex flex-wrap gap-1.5">
              {d.qa!.map((q) => (
                <button key={q} type="button" onClick={() => s.goSection('review', `q-${q}`)} className="rounded-full bg-violet-50 px-2.5 py-1 text-[0.85rem] font-bold text-violet-800">
                  {s.model.qa.find((x) => x.id === q)?.question.slice(0, 26) ?? q}
                </button>
              ))}
            </div>
          </Block>
        )}
      </More>

      {people.some((p) => p.row?.note) && (
        <div className="space-y-1">
          {people.filter((p) => p.row?.note).map((p) => (
            <p key={p.decider.profile_id} data-note-of={p.decider.name} className="whitespace-pre-wrap break-keep rounded-xl bg-navy-50/60 px-3 py-2 text-[0.93rem] text-navy-700">
              <b>{p.decider.title || p.decider.name} 의견</b> · {when(p.row!.at)}{'\n'}{p.row!.note}
            </p>
          ))}
        </div>
      )}

      {s.isDecider && (
        <div className="space-y-2">
          <label className="block">
            <span className="mb-1 block text-[0.9rem] font-bold text-navy-600">내 의견 (선택)</span>
            <textarea data-decision-note className="field-input min-h-[3.2rem] resize-y py-2.5 text-[1rem]" rows={note ? Math.min(6, note.split('\n').length + 1) : 2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="왜 이 안인지, 조건이 있으면 적어 주세요" />
          </label>
          {err && <p data-decision-error className="break-keep text-[0.92rem] font-bold text-rose-600">{err}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" data-decide className="btn-primary flex-[2]" disabled={busy || !pending || (sel === CUSTOM && !hasCustom(d, custom))} onClick={() => sel && void save(sel)}>
              {busy && <Loader2 size={16} className="animate-spin" />}
              {sel ? `「${pickLabel(d, sel, custom)}」으로 결정` : '안을 먼저 고르세요'}
            </button>
            <button type="button" data-decide-later className="btn-ghost flex-1 whitespace-nowrap px-3" disabled={busy || (myRow?.choice === LATER && !myStale)} onClick={() => void save(LATER)}>
              추후 결정
            </button>
          </div>
          {myRow && !myStale && myRow.note !== note.trim() && !pending && (
            <button type="button" data-note-only className="text-[0.88rem] font-bold text-teal-700 underline" disabled={busy} onClick={() => void save(myRow.choice!)}>
              선택은 그대로 · 의견만 고쳐 저장
            </button>
          )}
        </div>
      )}
    </section>
  )
}

function hasCustom(d: Decision, v: unknown): boolean {
  const c = d.custom
  if (!c) return false
  if (c.kind === 'number') return v !== '' && v != null && Number.isFinite(Number(v))
  if (c.kind === 'numbers') return Object.values((v ?? {}) as Record<string, unknown>).some((x) => x !== '' && x != null)
  if (c.kind === 'multi') return Array.isArray(v)
  return String(v ?? '').trim() !== ''
}

function CustomInput({ d, value, onChange }: { d: Decision; value: unknown; onChange: (v: unknown) => void }) {
  const c = d.custom!
  if (c.kind === 'number')
    return (
      <span className="flex items-center gap-1.5">
        <input data-custom-input inputMode="decimal" className="input min-h-[44px] tabular-nums" value={String(value ?? '')} onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="숫자" />
        <span className="shrink-0 text-[0.9rem] text-navy-500">{c.unit}</span>
      </span>
    )
  if (c.kind === 'numbers') {
    const v = (value ?? {}) as Record<string, string>
    return (
      <div className="grid grid-cols-1 gap-1.5">
        {(c.fields ?? []).map((f) => (
          <label key={f.id} className="flex items-center gap-1.5">
            <span className="w-24 shrink-0 break-keep text-[0.88rem] font-bold text-navy-600">{f.label}</span>
            <input data-custom-field={f.id} inputMode="decimal" className="input min-h-[44px] tabular-nums" value={v[f.id] ?? ''} onChange={(e) => onChange({ ...v, [f.id]: e.target.value.replace(/[^0-9.]/g, '') })} />
            <span className="shrink-0 text-[0.85rem] text-navy-500">{f.unit}</span>
          </label>
        ))}
      </div>
    )
  }
  if (c.kind === 'multi') {
    const on = new Set(Array.isArray(value) ? (value as string[]) : [])
    return (
      <div className="flex flex-wrap gap-1.5">
        {(c.choices ?? []).map((x) => (
          <label key={x.id} className={`flex min-h-[44px] items-center gap-1.5 rounded-xl px-3 text-[0.95rem] font-bold ring-1 ring-inset ${on.has(x.id) ? 'bg-teal-50 text-teal-800 ring-teal-300' : 'bg-white text-navy-600 ring-navy-200'}`}>
            <input type="checkbox" data-custom-multi={x.id} checked={on.has(x.id)} onChange={(e) => { const n = new Set(on); if (e.target.checked) n.add(x.id); else n.delete(x.id); onChange([...n]) }} />
            {x.label}
          </label>
        ))}
      </div>
    )
  }
  return <textarea data-custom-text className="field-input min-h-[3rem] py-2 text-[1rem]" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl bg-navy-50/50 px-3 py-2">
      <p className="text-[0.88rem] font-extrabold text-navy-500">{title}</p>
      <div className="mt-0.5 whitespace-pre-wrap break-keep text-[0.96rem] text-navy-800">{children}</div>
    </div>
  )
}

/** 고를 때 본 숫자 ↔ 지금 숫자 */
function BasisCompare({ d, row }: { d: Decision; row: { choice: string | null; custom: unknown; basis?: Record<string, string> } }) {
  const s = useStrategy()
  const now = row.choice && row.choice !== LATER ? basisOf(s.model, d, { choice: row.choice, custom: row.custom }, s.viewPicks, s.appFallback) : {}
  const then = row.basis ?? {}
  const keys = [...new Set([...Object.keys(then), ...Object.keys(now)])]
  if (keys.length === 0) return null
  return (
    <table data-basis-compare className="w-full text-[0.9rem] tabular-nums">
      <thead><tr className="text-left text-amber-800"><th className="py-0.5 pr-2"></th><th className="px-1 text-right">고를 때</th><th className="px-1 text-right">지금</th></tr></thead>
      <tbody>
        {keys.map((k) => (
          <tr key={k} className={then[k] !== now[k] ? 'font-extrabold text-amber-900' : 'text-amber-800'}>
            <td className="py-0.5 pr-2">{k.replace('마지막해매출', '마지막 해 매출').replace('삼년합', '3년 합').replace('B2B기여이익', 'B2B 기여이익').replace('보증검토액', '보증 검토액')}</td>
            <td className="px-1 text-right">{then[k] ?? '—'}</td>
            <td className="px-1 text-right">{now[k] ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
