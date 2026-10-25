import { useMemo, useState } from 'react'
import { Loader2, Send } from 'lucide-react'
import { CUSTOM, LATER, compute, drafts, type Decision, type Draft } from '../../../lib/bizStrategy'
import { FIELD_BY_KEY, isBlank, isStaleCheck, plainText, type Value } from '../../../lib/bizPlan'
import { BizPlanError } from '../../../lib/bizPlanApi'
import { propose, type ProposeItem } from '../../../lib/bizStrategyApi'
import { DiffView, Pill, REQ_TONE, usePlan, when } from '../parts'
import { Card, More, StateChip, WarningList, useStrategy } from './ctx'

// ⑤ 최종 적용 전 확인
//   대표님 · 이사님 선택 → 합의 → 계산 검증 → 변경 초안 → 담당 비교 · 검토 → 수정요청(기존) →
//   요청함에서 반영 → 필요한 재확인 → 제출 전 점검. 각 단계는 서버 기록에 남습니다.
//   합의되지 않은 결정에 기대는 칸은 반영 요청을 만들 수 없습니다(서버도 막음).

export function Apply() {
  const s = useStrategy()
  const plan = usePlan()
  const m = s.model
  const ds = [...m.decisions].sort((a, b) => a.no - b.no)

  //  합의된 결정만으로 계산 — 반영 요청에 쓰는 숫자
  const rAgreed = useMemo(() => compute(m, m.meta.recommended, s.agreed, [], s.appFallback), [m, s.agreed, s.appFallback])
  const list = useMemo(() => {
    const preview = new Map(drafts(s.result).map((x) => [x.key, x]))
    return drafts(rAgreed).map((x) => {
      const allowed = x.decisions.every((k) => s.states[k] === '합의')
      return { draft: allowed ? x : preview.get(x.key) ?? x, allowed }
    })
  }, [rAgreed, s.result, s.states])

  const agreedN = ds.filter((d) => s.states[d.key] === '합의').length
  const strategyReqs = plan.data.requests.filter((r) => r.source === 'strategy')
  const applied = strategyReqs.filter((r) => r.status === '반영 완료')
  const recheck = applied.reduce((n, r) => {
    const f = plan.fields.get(r.key)
    return n + (plan.checksByKey.get(r.key) ?? []).filter((c) => isStaleCheck(c, f)).length
  }, 0)

  return (
    <div className="space-y-4" data-strategy-apply>
      <Card hook="steps" title="반영까지 남은 단계" sub="결정만으로 사업계획서가 바뀌지 않습니다 — 담당이 비교하고 수정요청으로 반영합니다">
        <ol className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4" data-steps>
          <Step n={1} label="대표님 · 이사님 선택" value={`${s.rows.filter((r) => r.assump_rev === s.assumpRev && r.choice !== LATER).length}개 선택`} done={agreedN > 0} />
          <Step n={2} label="합의 (두 분 같은 안)" value={`${agreedN}/${ds.length}`} done={agreedN === ds.length} />
          <Step n={3} label="계산 검증" value={`확인 ${rAgreed.warnings.filter((w) => w.level !== 'info').length}개`} done={rAgreed.warnings.every((w) => w.level === 'info')} />
          <Step n={4} label="변경 초안 · 반영 요청" value={`요청 ${strategyReqs.length}건`} done={strategyReqs.length > 0} />
          <Step n={5} label="담당 비교 · 반영" value={`반영 ${applied.length}/${strategyReqs.length}`} done={strategyReqs.length > 0 && applied.length === strategyReqs.length} />
          <Step n={6} label="필요한 재확인" value={`재확인 필요 ${recheck}`} done={applied.length > 0 && recheck === 0} />
          <Step n={7} label="제출 전 점검" value="기록·버전 탭" done={false} onClick={() => s.goTab('versions')} />
        </ol>
      </Card>

      <Card hook="opinions" title="두 분의 선택 · 의견" sub="다르면 「의견 조율 필요」 — 합의로 세지 않습니다">
        <ul className="divide-y divide-navy-100">
          {ds.map((d) => <OpinionRow key={d.key} d={d} />)}
        </ul>
      </Card>

      <Card hook="verify" title="계산 검증 (합의된 결정 기준)">
        <WarningList items={rAgreed.warnings.filter((w) => w.level !== 'info')} />
        {rAgreed.warnings.every((w) => w.level === 'info') && <p className="text-[0.95rem] font-bold text-teal-700">위험 · 확인 항목이 없습니다.</p>}
      </Card>

      <DraftList list={list} />

      {strategyReqs.length > 0 && (
        <Card hook="strategy-requests" title={`사업화전략에서 만든 수정요청 ${strategyReqs.length}건`} sub="요청함에서 담당이 비교 후 반영 · 보류 · 반려합니다">
          <ul className="space-y-1.5">
            {strategyReqs.map((r) => (
              <li key={r.id}>
                <button type="button" data-strategy-req={r.status} onClick={() => plan.openField(r.key)} className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-xl bg-navy-50/60 px-3 py-2 text-left hover:bg-navy-100">
                  <span className="min-w-0 break-keep text-[0.95rem] font-bold text-navy-800">{r.key_label || r.key}<span className="block text-[0.82rem] font-semibold text-navy-400">{when(r.created_at)} · {r.requester_name}</span></span>
                  <Pill tone={REQ_TONE[r.status]}>{r.status}</Pill>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Timeline />
    </div>
  )
}

function Step({ n, label, value, done, onClick }: { n: number; label: string; value: string; done: boolean; onClick?: () => void }) {
  const body = (
    <>
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[0.85rem] font-black ${done ? 'bg-teal-600 text-white' : 'bg-navy-100 text-navy-600'}`}>{n}</span>
      <span className="min-w-0">
        <span className="block break-keep text-[0.92rem] font-extrabold text-navy-800">{label}</span>
        <span className="block text-[0.85rem] font-semibold text-navy-500">{value}{done ? ' · 완료' : ''}</span>
      </span>
    </>
  )
  const cls = 'flex items-center gap-2 rounded-xl bg-navy-50/60 px-3 py-2 text-left'
  return <li data-step={n} data-step-done={done ? 'y' : 'n'}>{onClick ? <button type="button" className={`${cls} w-full hover:bg-navy-100`} onClick={onClick}>{body}</button> : <div className={cls}>{body}</div>}</li>
}

function OpinionRow({ d }: { d: Decision }) {
  const s = useStrategy()
  return (
    <li data-opinion={d.key} className="space-y-1.5 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={() => s.goSection('decisions', `d-${d.key}`)} className="min-h-[44px] min-w-0 break-keep text-left text-[0.98rem] font-extrabold text-navy-800 hover:underline">{d.no}. {d.title}</button>
        <StateChip state={s.states[d.key]} />
      </div>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {s.deciders.map((p) => {
          const r = s.rows.find((x) => x.key === d.key && x.profile_id === p.profile_id && x.choice)
          const stale = !!r && r.assump_rev < s.assumpRev
          const label = !r ? '미선택' : r.choice === LATER ? '추후 결정' : r.choice === CUSTOM ? `직접 입력 ${JSON.stringify(r.custom)}` : d.options.find((o) => o.id === r.choice)?.label ?? r.choice
          return (
            <div key={p.profile_id} className={`rounded-xl px-3 py-2 text-[0.92rem] ${stale ? 'bg-amber-50 text-amber-900' : 'bg-navy-50/60 text-navy-700'}`}>
              <b>{p.title || p.name}</b> · {label}{stale ? ' (재확인 필요)' : ''}
              {r?.note && <span className="block whitespace-pre-wrap break-keep text-navy-600">{r.note}</span>}
            </div>
          )
        })}
      </div>
    </li>
  )
}

function DraftList({ list }: { list: { draft: Draft; allowed: boolean }[] }) {
  const s = useStrategy()
  const plan = usePlan()
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const rows = list.map(({ draft, allowed }) => {
    const ref = FIELD_BY_KEY.get(draft.key)
    const cur = plan.fields.get(draft.key)?.value ?? null
    const changed = ref ? plainText(ref.def, cur) !== plainText(ref.def, draft.value as Value) : false
    const openReq = (plan.requestsByKey.get(draft.key) ?? []).filter((r) => r.source === 'strategy' && (r.status === '접수' || r.status === '검토 중'))
    //  같은 칸에 처리 전 사업화전략 요청이 있으면 또 만들지 않습니다(요청함에서 먼저 처리)
    const ok = !!ref && allowed && changed && draft.missing.length === 0 && openReq.length === 0
    return { draft, allowed, ref, cur, changed, openReq, ok }
  })
  const sendable = rows.filter((r) => r.ok)

  async function send() {
    const items: ProposeItem[] = rows.filter((r) => r.ok && picked.has(r.draft.key)).map((r) => ({
      key: r.draft.key,
      label: r.ref!.path,
      req_type: isBlank(r.cur) ? '내용 추가' : r.draft.kind === 'text' ? '문장 수정' : '숫자 변경',
      body: `결정 ${r.draft.decisions.map((k) => s.model.decisions.find((d) => d.key === k)?.no).filter(Boolean).join(' · ') || '없음(기간만)'} 합의 기준 계산${r.draft.note ? ` — ${r.draft.note}` : ''}`,
      suggestion: r.draft.text,
      value: r.draft.value,
      decisions: r.draft.decisions,
    }))
    if (items.length === 0) return
    setBusy(true)
    setErr(null)
    try {
      const res = await propose(s.assumpRev, items, note.trim())
      await Promise.all([s.reload(), plan.reload()])
      setPicked(new Set())
      s.notify(`수정요청 ${res.requests.length}건을 만들었습니다 — 본문은 그대로이며, 요청함에서 비교해 반영합니다.`)
    } catch (e) {
      setErr(e instanceof BizPlanError ? e.message : '만들지 못했습니다.')
      if (e instanceof BizPlanError && e.kind === 'conflict') await s.reload()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card hook="drafts" title="사업계획서 칸 변경 초안" sub="지금 본문과 나란히 봅니다 · 합의 전 결정에 기대는 칸은 미리보기만 됩니다">
      <ul className="space-y-3">
        {rows.map(({ draft, allowed, ref, cur, changed, openReq, ok }) => (
          <li key={draft.key} data-draft={draft.key} data-draft-ok={ok ? 'y' : 'n'} className="space-y-2 rounded-2xl bg-navy-50/40 p-3 ring-1 ring-navy-100">
            <div className="flex flex-wrap items-start gap-2">
              {s.isEditor && (
                <input type="checkbox" aria-label="반영 요청에 넣기" data-draft-pick={draft.key} disabled={!ok} checked={picked.has(draft.key)}
                  onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(draft.key); else n.delete(draft.key); return n })}
                  className="mt-1 h-5 w-5 shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className="break-keep text-[0.98rem] font-extrabold text-navy-800">{ref?.path ?? draft.key}</p>
                <p className="mt-0.5 flex flex-wrap gap-1 text-[0.82rem]">
                  {draft.decisions.length === 0 ? <span className="rounded-full bg-navy-100 px-2 py-0.5 font-bold text-navy-600">결정과 무관 (접수월 기준 기간)</span>
                    : draft.decisions.map((k) => {
                      const d = s.model.decisions.find((x) => x.key === k)
                      return <span key={k} className={`rounded-full px-2 py-0.5 font-bold ${s.states[k] === '합의' ? 'bg-teal-50 text-teal-800' : 'bg-amber-50 text-amber-800'}`}>결정 {d?.no} {s.states[k]}</span>
                    })}
                </p>
              </div>
              {!allowed && <span data-draft-preview className="rounded-full bg-amber-50 px-2.5 py-1 text-[0.82rem] font-extrabold text-amber-800">합의 전 · 미리보기</span>}
              {allowed && !changed && <span className="rounded-full bg-navy-100 px-2.5 py-1 text-[0.82rem] font-extrabold text-navy-600">본문과 같음</span>}
              {openReq.length > 0 && <span data-draft-open-req className="rounded-full bg-orange-50 px-2.5 py-1 text-[0.82rem] font-extrabold text-orange-800">처리 전 요청 {openReq.length} — 요청함에서 먼저 처리</span>}
            </div>
            {!ref && <p className="text-[0.9rem] font-bold text-rose-600">사업계획서에 없는 칸입니다 — 모델 자료의 초안 칸 이름을 확인해 주세요.</p>}
            {draft.missing.length > 0 && <p data-draft-missing className="text-[0.9rem] font-bold text-rose-600">계산값을 찾지 못한 자리: {draft.missing.join(', ')} — 반영 요청을 만들 수 없습니다</p>}
            {draft.note && <p className="text-[0.85rem] text-navy-500">※ {draft.note}</p>}
            {ref && changed && (
              <More label="지금 본문 ↔ 초안 비교" hook={`diff-${draft.key}`}>
                <DiffView def={ref.def} before={cur} after={draft.value as Value} labels={['지금 본문', '초안']} />
              </More>
            )}
          </li>
        ))}
      </ul>
      {s.isEditor ? (
        <div className="space-y-2 border-t border-navy-100 pt-3">
          <label className="block">
            <span className="mb-1 block text-[0.9rem] font-bold text-navy-600">담당 메모 (선택)</span>
            <input data-propose-note className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="예: 대표님 · 이사님 합의(10/30 회의) 반영" />
          </label>
          {err && <p data-propose-error className="break-keep text-[0.92rem] font-bold text-rose-600">{err}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-ghost" data-pick-all disabled={sendable.length === 0} onClick={() => setPicked(new Set(sendable.map((r) => r.draft.key)))}>반영 가능한 칸 모두 고르기 ({sendable.length})</button>
            <button type="button" className="btn-primary flex-1" data-propose disabled={busy || picked.size === 0} onClick={() => void send()}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} 고른 {picked.size}칸 수정요청 만들기
            </button>
          </div>
          <p className="text-[0.85rem] text-navy-500">수정요청만 만듭니다. 본문은 요청함에서 「제안 반영 · 편집」으로 비교해 저장할 때 바뀌고, 그 칸의 확인 표시는 「재확인 필요」가 됩니다.</p>
        </div>
      ) : (
        <p className="text-[0.9rem] text-navy-500">반영 요청은 사업계획 담당이 만듭니다.</p>
      )}
    </Card>
  )
}

function Timeline() {
  const s = useStrategy()
  const items = [
    ...s.open.log.map((l) => ({ at: l.at, who: l.actor_name, text: `${l.step}${l.step === '반영 요청' ? ` — ${(l.detail.items as unknown[] | undefined)?.length ?? 0}칸` : l.detail.reason ? ` — ${String(l.detail.reason)}` : ''}${l.assump_rev != null ? ` (숫자 판 ${l.assump_rev})` : ''}`, kind: 'step' })),
    ...s.open.decision_log.map((l) => {
      const d = s.model.decisions.find((x) => x.key === l.key)
      const label = l.choice === LATER ? '추후 결정' : l.choice === CUSTOM ? '직접 입력' : d?.options.find((o) => o.id === l.choice)?.label ?? l.choice
      return { at: l.at, who: `${l.name}${l.title ? ` ${l.title}` : ''}`, text: `결정 ${d?.no ?? ''}. ${d?.title ?? l.key} → ${label}${l.assump_rev != null ? ` (숫자 판 ${l.assump_rev})` : ''}`, kind: 'decision' }
    }),
  ].sort((a, b) => (a.at < b.at ? 1 : -1))
  return (
    <Card hook="timeline" title="기록" sub="모델 저장 · 결정 · 반영 요청 — 지울 수 없습니다">
      {items.length === 0 ? <p className="text-[0.92rem] text-navy-400">아직 기록이 없습니다.</p> : (
        <More label={`기록 ${items.length}줄 보기`} hook="timeline">
          <ul className="space-y-1">
            {items.slice(0, 200).map((x, i) => (
              <li key={i} data-log={x.kind} className="flex gap-2 text-[0.9rem] text-navy-700">
                <span className="w-28 shrink-0 tabular-nums text-navy-400">{when(x.at)}</span>
                <span className="min-w-0 break-keep"><b>{x.who}</b> · {x.text}</span>
              </li>
            ))}
          </ul>
        </More>
      )}
    </Card>
  )
}
