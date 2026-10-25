import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertTriangle, Loader2, RotateCw } from 'lucide-react'
import { CUSTOM, LATER, compute, resolveDecision, withRecommended, ym, type Pick } from '../../../lib/bizStrategy'
import { BizPlanError } from '../../../lib/bizPlanApi'
import { strategyOpen, type StrategyOpen } from '../../../lib/bizStrategyApi'
import { usePlan } from '../parts'
import { StrategyContext, type Section, type StrategyCtx, type ViewBasis } from './ctx'
import { Summary } from './Summary'
import { Scenarios } from './Scenarios'
import { Decisions } from './Decisions'
import { Review } from './Review'
import { Apply } from './Apply'
import { ModelEditor } from './ModelEditor'

// ─────────────────────────────────────────────────────────────────────────────
// 사업화전략 · 3개년 매출 검토 (0148) — 사업계획서(/bizplan)의 탭 하나
//
//  ① 핵심 요약 ② 시나리오 비교 ③ 결정 10개 ④ 신보 심사 대응 ⑤ 적용 전 확인 (+ 담당: 자료 편집)
//
//  · 숫자 · 결정안 · 질문은 서버(bizplan_strategy)의 모델 자료에서 옵니다. 이 화면 코드에는 회사
//    숫자가 없습니다. 계산은 src/lib/bizStrategy.ts.
//  · 고르는 것은 대표님 · 이사님(검토 참여자)만, **누른 것만** 저장합니다. 고르지 않은 결정을
//    추천안으로 저장하지 않습니다(화면 미리보기에만 추천안을 씁니다).
//  · 결정이 사업계획서 본문을 바로 고치지 않습니다. 담당이 ⑤에서 초안을 비교하고 수정요청으로
//    남기면, 요청함에서 반영합니다(기존 재확인 규칙 그대로).
// ─────────────────────────────────────────────────────────────────────────────

const SECTIONS: [Section, string, string][] = [
  ['summary', '① 핵심 요약', '요약'],
  ['scenarios', '② 시나리오 비교', '시나리오'],
  ['decisions', '③ 결정 10개', '결정'],
  ['review', '④ 심사 대응', '심사 대응'],
  ['apply', '⑤ 적용 전 확인', '적용 전 확인'],
  ['edit', '자료 편집 · 기록', '자료 편집'],
]

type Load = { kind: 'loading' } | { kind: 'fail'; error: BizPlanError } | { kind: 'ready'; data: StrategyOpen }

export function StrategyTab() {
  const plan = usePlan()
  const [params, setParams] = useSearchParams()
  const [state, setState] = useState<Load>({ kind: 'loading' })
  const [basis, setBasis] = useState<ViewBasis>('agreed')
  const [noteDraft, setNoteDrafts] = useState<Record<string, string>>({})
  const busy = useRef(false)
  const secParam = params.get('sec') as Section | null
  const sec: Section = secParam && SECTIONS.some(([k]) => k === secParam) ? secParam : 'summary'

  //  다른 화면(「확인 · 결정」)에서 결정 하나를 눌러 왔으면 — 자료를 받은 뒤 그 자리로 (?at=d-키)
  const at = params.get('at')
  useEffect(() => {
    if (!at || state.kind !== 'ready') return
    const t = setTimeout(() => document.querySelector(`[data-anchor="${CSS.escape(at)}"]`)?.scrollIntoView({ block: 'start' }), 80)
    return () => clearTimeout(t)
  }, [at, state.kind])

  const reload = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    try {
      const data = await strategyOpen()
      setState({ kind: 'ready', data })
    } catch (e) {
      const err = e instanceof BizPlanError ? e : new BizPlanError('other', '잠시 문제가 생겼습니다.')
      setState((s) => (s.kind === 'ready' ? s : { kind: 'fail', error: err }))
      if (state.kind === 'ready') plan.notify(err.message)
    } finally {
      busy.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    void reload()
    const onVis = () => {
      if (document.visibilityState === 'visible') void reload()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [reload])

  const goSection = useCallback(
    (s: Section, anchor?: string) => {
      const p = new URLSearchParams(params)
      p.set('tab', 'strategy')
      p.delete('at')
      if (s === 'summary') p.delete('sec')
      else p.set('sec', s)
      setParams(p, { replace: true })
      requestAnimationFrame(() => {
        const el = anchor ? document.querySelector(`[data-anchor="${anchor}"]`) : document.querySelector('[data-strategy-nav]')
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    },
    [params, setParams],
  )

  const ctx = useMemo<StrategyCtx | null>(() => {
    if (state.kind !== 'ready' || !state.data.strategy) return null
    const d = state.data
    const s = d.strategy!
    const model = s.model
    const states: StrategyCtx['states'] = {}
    const agreed: Record<string, Pick> = {}
    const mine: Record<string, Pick> = {}
    for (const dec of model.decisions) {
      const res = resolveDecision(dec.key, d.decisions, d.deciders, s.assump_rev)
      states[dec.key] = res.state
      if (res.agreed) agreed[dec.key] = res.agreed
      const my = d.decisions.find((r) => r.key === dec.key && r.profile_id === d.me.id && r.assump_rev === s.assump_rev)
      if (my && my.choice && my.choice !== LATER) mine[dec.key] = { choice: my.choice, custom: my.choice === CUSTOM ? my.custom : undefined }
    }
    const appFallback = ym(d.preflight_month)
    const viewPicks = withRecommended(model, basis === 'mine' ? { ...agreed, ...mine } : agreed)
    const result = compute(model, model.meta.recommended, viewPicks, [], appFallback)
    return {
      open: d,
      model,
      rev: s.rev,
      assumpRev: s.assump_rev,
      deciders: d.deciders,
      rows: d.decisions,
      isEditor: d.me.role === 'editor',
      isDecider: d.is_decider,
      myId: d.me.id,
      appFallback,
      agreed,
      mine,
      states,
      basis,
      setBasis,
      viewPicks,
      result,
      reload,
      notify: plan.notify,
      goSection,
      goTab: (t: string) => {
        const p = new URLSearchParams(params)
        p.delete('sec')
        if (t === 'doc') p.delete('tab')
        else p.set('tab', t)
        setParams(p, { replace: true })
        window.scrollTo({ top: 0 })
      },
      noteDraft,
      setNoteDraft: (key, text) => setNoteDrafts((m) => ({ ...m, [key]: text })),
    }
  }, [state, basis, reload, plan.notify, goSection, noteDraft, params, setParams])

  if (state.kind === 'loading')
    return (
      <p data-strategy-loading className="flex items-center gap-2 px-1 py-8 text-[1.02rem] font-bold text-navy-500">
        <Loader2 size={18} className="animate-spin" /> 사업화전략 자료를 여는 중…
      </p>
    )
  if (state.kind === 'fail')
    return (
      <div data-strategy-fail={state.error.kind} className="space-y-3 rounded-[22px] bg-white p-5 ring-1 ring-navy-100">
        <p className="flex items-start gap-2 break-keep text-[1.02rem] font-bold text-navy-800">
          <AlertTriangle size={19} className="mt-0.5 shrink-0 text-amber-600" />
          {state.error.kind === 'missing' ? '사업화전략 기능이 아직 서버에 준비되지 않았습니다 (PROPOSAL_0148_bizplan_strategy.sql 실행 필요).' : state.error.message}
        </p>
        <button type="button" className="btn-ghost" onClick={() => { setState({ kind: 'loading' }); void reload() }}>
          <RotateCw size={17} /> 다시 시도
        </button>
      </div>
    )

  if (!ctx) {
    //  자료가 아직 없음 — 회사 숫자는 저장소에 없으므로 대표님이 비공개 초기 자료를 넣어야 합니다
    const editorView = state.data.me.role === 'editor'
    return (
      <div className="space-y-4">
        <div data-strategy-empty className="space-y-2 rounded-[22px] bg-white p-5 ring-1 ring-navy-100">
          <h2 className="text-[1.15rem] font-black text-navy-900">사업화전략 자료가 아직 없습니다</h2>
          <p className="break-keep text-[1rem] leading-relaxed text-navy-600">
            시나리오 · 가격 · 고객 목표 · 자금배분 같은 회사 숫자는 공개 저장소에 두지 않고 서버에만 둡니다. 대표님이 Supabase 에서 비공개 초기 자료 SQL 을 실행하면 이 화면에
            나타납니다{editorView ? '. 담당은 아래에서 자료(JSON)를 직접 넣을 수도 있습니다' : ''}.
          </p>
        </div>
        {editorView && <ModelEditor bootstrap={{ rev: 0, reload }} />}
      </div>
    )
  }

  const sections = SECTIONS.filter(([k]) => k !== 'edit' || ctx.isEditor)
  const counts = Object.values(ctx.states)
  const nAgreed = counts.filter((s) => s === '합의').length
  const nConflict = counts.filter((s) => s === '의견 조율 필요').length
  const nStale = ctx.rows.filter((r) => r.profile_id === ctx.myId && r.assump_rev < ctx.assumpRev).length

  return (
    <StrategyContext.Provider value={ctx}>
      <div className="space-y-4" data-strategy data-strategy-rev={ctx.rev} data-assump-rev={ctx.assumpRev}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1">
          <h2 className="break-keep text-[1.15rem] font-black text-navy-900 sm:text-[1.3rem]">{ctx.model.meta.title || '사업화전략 · 3개년 매출 검토'}</h2>
          <span data-strategy-progress className="text-[0.92rem] font-bold text-navy-500">
            결정 {nAgreed}/{ctx.model.decisions.length} 합의{nConflict > 0 ? ` · 의견 조율 ${nConflict}` : ''} · 자료 기준일 {ctx.model.meta.asOf}
          </span>
        </div>
        {nStale > 0 && ctx.isDecider && (
          <button
            type="button"
            data-strategy-restale={nStale}
            onClick={() => goSection('decisions')}
            className="flex min-h-[44px] w-full items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-left text-[0.98rem] font-bold text-amber-900 ring-1 ring-amber-200"
          >
            <span className="min-w-0 flex-1 break-keep">재확인 필요 {nStale}건 — 고른 뒤 숫자 · 결정안이 바뀌었습니다</span>
            <span className="shrink-0 text-[0.9rem]">보기 ›</span>
          </button>
        )}
        <nav data-strategy-nav aria-label="사업화전략 화면" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {sections.map(([k, label, short]) => (
            <button
              key={k}
              type="button"
              data-strategy-sec={k}
              aria-current={sec === k ? 'page' : undefined}
              onClick={() => goSection(k)}
              className={`min-h-[44px] shrink-0 whitespace-nowrap rounded-full px-4 text-[0.95rem] font-extrabold transition ${sec === k ? 'bg-teal-600 text-white shadow-sm' : 'bg-white text-navy-600 ring-1 ring-inset ring-navy-200 hover:bg-navy-50'}`}
            >
              <span className="sm:hidden">{short}</span>
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </nav>
        {sec === 'summary' && <Summary />}
        {sec === 'scenarios' && <Scenarios />}
        {sec === 'decisions' && <Decisions />}
        {sec === 'review' && <Review />}
        {sec === 'apply' && <Apply />}
        {sec === 'edit' && ctx.isEditor && <ModelEditor />}
      </div>
    </StrategyContext.Provider>
  )
}
