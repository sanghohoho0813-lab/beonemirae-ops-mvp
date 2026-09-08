import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowRight, Timer, Repeat, FileText, AlertTriangle, TrendingUp, Info, ChevronDown, ChevronRight,
  Table2, ClipboardCheck, SlidersHorizontal, FlaskConical, ListChecks, Building2, type LucideIcon,
} from 'lucide-react'
import { useData } from '../context/DataContext'
import { useAuth } from '../context/AuthContext'
import { PageShell, SectionTitle } from '../components/ui'
import { RevenueModelCard } from '../components/RevenueModel'
import { PageHeader } from '../components/PageHeader'
import {
  AUTO_LINK_LABEL, PERIOD_PRESETS, SOURCE_LABEL, STATUS_LABEL, performanceSummary, provenanceOf, tierProgress,
  type MetricRow, type PeriodPreset,
} from '../lib/performance'
import { axEvidence } from '../lib/axEvidence'
import { BREADTH_RULE_NOTE, breadthLine } from '../lib/evidenceBase'
import { parseExcelChecks, type ExcelCheck } from '../lib/excelCheck'
import { parseTrials, type Trial } from '../lib/trials'
import { loadDevRequests, missingParts } from '../lib/repo'
import { growthSummary, FACT_STATUS_LABEL } from '../lib/companyFacts'
import { diagnoseData, nextActions, summaryCards, trialSummaries, unmeasured } from '../lib/perfSummary'
import { SalesFunnelPanel } from '../components/SalesFunnel'
import { AxEvidencePanels } from '../components/AxEvidencePanels'
import { LoadGate, useLoadState } from '../components/LoadState'
import { BeforeAfterPanel } from '../components/BeforeAfter'
import { OpsSurveyCard } from '../components/OpsSurveyCard'
import { GrowthChain } from '../components/GrowthChain'
import { OpsChangesCard } from '../components/OpsChangesCard'
import { AfterSurveyCard } from '../components/AfterSurveyCard'
import { TrialCard } from '../components/TrialCard'
import { KindChip } from '../components/KindChip'
import { ProvenanceBadge, TierBadge, TierProgress } from '../components/DataBadge'
import { today } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// AX 도입 성과 (/performance) — 세 영역 (0107)
//
//   요약      기본 화면. 회사 성장 현황 → AX 로 확인된 변화(최대 3) → 다음 할 일(최대 3).
//             5초 안에 회사 현황과 측정 상태가 읽혀야 합니다. PC 1~2화면.
//   측정 근거 계산식 · 원천자료 · 표본 · 제외 내역 · 상세 비교 — 예전 화면 전부.
//   설정      기준값 · 실증 시작일 · 운영 변화 · 도입 후 조사값 · 업무 재현시험.
//
//  숫자의 성격은 넉 자로: 실적 · 초기 측정 · 업무 재현시험 · 예상·목표.
//  값이 없는 항목은 큰 0 으로 늘어놓지 않고 「아직 측정하지 않은 항목 N개」로 묶습니다.
//  회사 실적은 AX 효과가 아닙니다 — 요약 첫 칸에 그렇게 적습니다.
// ─────────────────────────────────────────────────────────────────────────────

type Tab = 'summary' | 'basis' | 'settings'
const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'summary', label: '요약', icon: ListChecks },
  { id: 'basis', label: '측정 근거', icon: ClipboardCheck },
  { id: 'settings', label: '설정', icon: SlidersHorizontal },
]

const METRIC_ICON: Record<string, LucideIcon> = {
  inputTime: Timer, adminTime: Timer, repeatEntry: Repeat, docHours: FileText, rework: AlertTriangle, dailyCount: TrendingUp,
}
const STATUS_STYLE: Record<MetricRow['status'], string> = {
  ok: 'bg-teal-50 text-teal-700',
  'need-baseline': 'bg-amber-50 text-amber-700',
  measuring: 'bg-navy-100 text-navy-500',
  'not-measured': 'bg-navy-100 text-navy-500',
  'no-comparable': 'bg-sky-50 text-sky-700',
}

function fmt(v: number | null, unit: string): string {
  if (v == null) return '—'
  const n = Number.isInteger(v) ? v.toLocaleString('ko-KR') : v.toFixed(1)
  return `${n}${unit}`
}

/** 측정 근거 접기 영역 */
function BasisDetails({ m }: { m: MetricRow }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-4 border-t border-navy-50 pt-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="-mx-2 flex min-h-[2.75rem] w-[calc(100%+1rem)] items-center gap-1.5 rounded-xl px-2 text-left text-[1rem] font-bold text-navy-400 transition hover:bg-navy-50 hover:text-navy-600"
      >
        계산 근거
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div data-metric-basis={m.key} className="mt-2.5 space-y-1.5">
          {m.beforeSource !== 'none' && <p className="t-muted"><span className="font-bold text-navy-500">[{SOURCE_LABEL[m.beforeSource]}]</span> 도입 전</p>}
          {m.afterSource && <p className="t-muted"><span className="font-bold text-navy-500">[{SOURCE_LABEL[m.afterSource]}]</span> 도입 후</p>}
          <p className="t-muted break-keep">{m.basis}</p>
          {m.note && <p className="t-muted break-keep font-bold text-navy-500">{m.note}</p>}
        </div>
      )}
    </div>
  )
}

/** 측정 근거 탭의 지표 카드 — 전부 보여 주되 값이 없으면 「—」 */
function MetricCard({ m }: { m: MetricRow }) {
  const Icon = METRIC_ICON[m.key] ?? Info
  const improved = m.changePct != null && m.changePct > 0
  const worsened = m.changePct != null && m.changePct < 0
  const measuredOnly = m.status === 'no-comparable'
  return (
    <div id={`metric-${m.key}`} data-metric={m.key} data-metric-status={m.status} className="card flex flex-col p-5 sm:p-6">
      <div className="flex items-start gap-2.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-navy-50 text-navy-600">
          <Icon size={20} strokeWidth={2.2} />
        </span>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1.5">
          <p className="t-card min-w-0 break-keep text-navy-900">{m.label}</p>
          <span className={`pill max-w-full ${STATUS_STYLE[m.status]}`}>{STATUS_LABEL[m.status]}</span>
          <ProvenanceBadge kind={m.provenance} compact />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-x-3 gap-y-1.5">
        {!measuredOnly && (
          <>
            <div className="min-w-0">
              <p className="t-muted font-bold">도입 전</p>
              <p className="t-kpi-sm mt-0.5 text-navy-400">{fmt(m.before, m.unit)}</p>
            </div>
            <ArrowRight size={22} className="mb-2 shrink-0 text-navy-400" strokeWidth={2.6} />
          </>
        )}
        <div className="min-w-0">
          <p className="t-muted font-bold">{measuredOnly ? '측정값' : '도입 후'}</p>
          <p data-metric-after={m.key} className={`t-kpi-sm mt-0.5 ${m.after == null ? 'text-navy-400' : 'text-navy-900'}`}>{fmt(m.after, m.unit)}</p>
        </div>
      </div>
      <div className="mt-3">
        {m.status === 'ok' && m.changePct != null ? (
          <>
            <p data-metric-change={m.key} className={`t-body font-extrabold ${improved ? 'text-teal-600' : worsened ? 'text-rose-500' : 'text-navy-500'}`}>
              {improved ? `${m.changePct}% ${m.betterWhen === 'lower' ? '단축' : '증가'}` : worsened ? `${Math.abs(m.changePct)}% ${m.betterWhen === 'lower' ? '증가 (나빠짐)' : '감소 (나빠짐)'}` : '변화 없음'}
            </p>
            {m.confounded && <p data-metric-confounded={m.key} className="t-muted mt-1 break-keep font-bold text-amber-700">복합 개선 — 차량·인력·거점·계약 변화가 겹쳐 AX 단독 효과를 가를 수 없습니다</p>}
            {!m.confounded && !m.emphasis && <p className="t-muted mt-1 break-keep text-navy-400">실제 현장 {m.fieldSamples}건 · 참고값 (기간·병원·기사·커버리지 기준 미달)</p>}
          </>
        ) : m.status === 'no-comparable' ? (
          <p data-metric-nocompare={m.key} className="t-body break-keep font-bold text-sky-700">측정값만 — 같은 범위의 도입 전 값이 없어 개선율을 내지 않습니다</p>
        ) : m.status === 'need-baseline' ? (
          <p className="t-body font-bold text-amber-700">도입 전 기준값 입력 필요</p>
        ) : (
          <p className="t-body break-keep font-bold text-navy-400">{m.status === 'not-measured' ? '같은 범위 조사값이 들어오면 견줍니다' : '측정 중'}</p>
        )}
      </div>
      <BasisDetails m={m} />
    </div>
  )
}

export function Performance() {
  const { data } = useData()
  const { role, mode } = useAuth()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const tabParam = params.get('tab')
  const tab: Tab = tabParam === 'basis' || tabParam === 'settings' ? tabParam : 'summary'
  const setTab = (t: Tab) => setParams((p) => { if (t === 'summary') p.delete('tab'); else p.set('tab', t); return p }, { replace: true })

  const [preset, setPreset] = useState<PeriodPreset>('all')
  const [customFrom, setCustomFrom] = useState(today())
  const [customTo, setCustomTo] = useState(today())
  const [autoOpen, setAutoOpen] = useState(false)
  const [unmeasuredOpen, setUnmeasuredOpen] = useState(false)
  const loadState = useLoadState()
  const isAdmin = role === 'admin'
  const isStaff = role === 'admin' || role === 'office'
  const live = mode === 'live'

  //  엑셀 확인 응답 · 재현시험 — 사용자 피드백 표에서 (관리자는 전부, 사무실은 본인 것)
  const [devRows, setDevRows] = useState<{ excel: ExcelCheck[] | undefined; trials: Trial[] }>({ excel: undefined, trials: [] })
  const [devTick, setDevTick] = useState(0)
  useEffect(() => {
    if (!isStaff || !live) { setDevRows({ excel: undefined, trials: [] }); return }
    let alive = true
    loadDevRequests()
      .then((rows) => alive && setDevRows({ excel: isAdmin ? parseExcelChecks(rows) : undefined, trials: parseTrials(rows) }))
      .catch(() => alive && setDevRows({ excel: undefined, trials: [] }))
    return () => { alive = false }
  }, [isStaff, isAdmin, live, devTick])

  const summary = useMemo(
    () => performanceSummary(data, preset, { from: customFrom, to: customTo }, { excelChecks: devRows.excel, changes: data.opsChanges, afterSurvey: data.afterSurvey ?? null }),
    [data, preset, customFrom, customTo, devRows.excel],
  )
  const period = useMemo(() => ({ from: summary.period.from, to: summary.period.to }), [summary.period.from, summary.period.to])
  const ev = useMemo(() => axEvidence(data, period), [data, period])
  const prov = useMemo(() => provenanceOf(data, summary.events), [data, summary.events])
  const tier = useMemo(() => tierProgress(summary.fieldCount), [summary.fieldCount])
  const unreadable = useMemo(() => missingParts.filter((m) => /수거|이벤트|기준값|baseline|events/i.test(m)), [loadState])
  const cards = useMemo(() => summaryCards(summary, ev), [summary, ev])
  const missing = useMemo(() => unmeasured(summary, ev, cards), [summary, ev, cards])
  const next = useMemo(
    () => nextActions(data, summary, { trials: devRows.trials, excel: summary.excel, isAdmin, unreadable }),
    [data, summary, devRows.trials, isAdmin, unreadable],
  )
  const diagnosis = useMemo(() => diagnoseData(data, summary, unreadable), [data, summary, unreadable])
  const trialSum = useMemo(() => trialSummaries(devRows.trials), [devRows.trials])
  const growth = useMemo(() => growthSummary(), [])
  const realClients = data.clients.filter((c) => !c.isDemoGenerated).length
  const baselineFilled = summary.metrics.filter((m) => m.before != null).length

  const efficiency = ['inputTime', 'adminTime', 'repeatEntry', 'rework', 'dailyCount', 'docHours']
    .map((k) => summary.metrics.find((m) => m.key === k))
    .filter((m): m is MetricRow => !!m)
  const autoRows = (Object.keys(AUTO_LINK_LABEL) as (keyof typeof AUTO_LINK_LABEL)[])
    .map((k) => ({ key: k, label: AUTO_LINK_LABEL[k], value: summary.autoLink[k] }))
    .filter((r) => r.value > 0)

  if (loadState !== 'ready') {
    return (
      <PageShell>
        <PageHeader title="AX 도입 성과" subtitle="회사 현황 · AX 로 확인된 변화 · 다음 할 일" />
        <LoadGate loadingTitle="성과 자료를 불러오는 중입니다" loadingSubtitle="다 읽은 뒤에 숫자를 보여 드립니다." empty={<span />} />
      </PageShell>
    )
  }

  const goTab = (t: Tab, anchor?: string) => {
    setTab(t)
    if (anchor) window.setTimeout(() => document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
  }

  return (
    <PageShell>
      <PageHeader title="AX 도입 성과" subtitle="회사 현황 · AX 로 확인된 변화 · 다음 할 일" />

      {/* ── 탭 ─────────────────────────────────────────────────────────────── */}
      <div role="tablist" className="grid grid-cols-3 gap-1 rounded-2xl bg-navy-50 p-1 print:hidden">
        {TABS.map((t) => {
          const Icon = t.icon
          const on = tab === t.id
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={on}
              data-perf-tab={t.id}
              onClick={() => setTab(t.id)}
              className={`flex min-h-[2.9rem] items-center justify-center gap-1.5 rounded-xl px-2 text-[1.08rem] font-extrabold transition ${on ? 'bg-white text-teal-700 shadow-sm' : 'text-navy-500 hover:text-navy-700'}`}
            >
              <Icon size={17} strokeWidth={2.4} /> {t.label}
            </button>
          )
        })}
      </div>

      {/* ═══ 요약 ═══════════════════════════════════════════════════════════ */}
      {tab === 'summary' && (
        <div data-perf-summary className="space-y-5">
          {/* ① 기업 성장 현황 */}
          <section data-perf-growth className="card p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-2">
              <Building2 size={20} className="shrink-0 text-navy-500" strokeWidth={2.3} />
              <p className="t-card text-navy-900">기업 성장 현황</p>
              <span className="t-muted ml-auto break-keep">회사 실적입니다 — AX 도입 효과가 아닙니다</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {growth.rev2025 && (
                <div data-growth-tile="rev2025" className="rounded-2xl bg-navy-50 px-4 py-3.5">
                  <p className="t-muted font-bold">2025년 매출</p>
                  <p className="t-kpi-sm mt-1 whitespace-nowrap text-navy-900">{growth.rev2025.value}</p>
                  <p className="t-body mt-0.5 font-bold text-teal-700">{growth.yoyPct != null ? `전년 대비 약 ${growth.yoyPct}% 증가` : ''}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5"><KindChip kind="실적" /><span className="t-caption text-navy-500">사업계획서 기재</span></div>
                </div>
              )}
              {growth.rev2026h1 && (
                <div data-growth-tile="rev2026h1" className="rounded-2xl bg-navy-50 px-4 py-3.5">
                  <p className="t-muted font-bold">2026년 상반기 매출</p>
                  <p className="t-kpi-sm mt-1 whitespace-nowrap text-navy-900">4.53억원</p>
                  <p className="t-body mt-0.5 font-bold text-navy-500">1기 부가세 신고 기준</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5"><KindChip kind="실적" /><span className="t-caption text-navy-500">대표 전달 · 원본 미확인</span></div>
                </div>
              )}
              {growth.clients && (
                <div data-growth-tile="clients" className="rounded-2xl bg-navy-50 px-4 py-3.5">
                  <p className="t-muted font-bold">거래처</p>
                  <p className="t-kpi-sm mt-1 whitespace-nowrap text-navy-900">{growth.clients.value}</p>
                  <p className="t-body mt-0.5 font-bold text-navy-500">시스템 등록 {realClients}곳 (별도)</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5"><KindChip kind="실적" /><span className="t-caption text-navy-500">대표 전달</span></div>
                </div>
              )}
              {growth.annualized && (
                <div data-growth-tile="annualized" className="rounded-2xl bg-amber-50/60 px-4 py-3.5">
                  <p className="t-muted font-bold">2026년 연환산</p>
                  <p className="t-kpi-sm mt-1 whitespace-nowrap text-navy-900">{growth.annualized.value}</p>
                  <p className="t-body mt-0.5 font-bold text-navy-500">상반기 × 2</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5"><KindChip kind="예상·목표" /><span className="t-caption text-navy-500">{FACT_STATUS_LABEL.forecast}</span></div>
                </div>
              )}
            </div>
          </section>

          {/* ② AX 로 확인된 변화 */}
          <section data-perf-changes>
            <SectionTitle action={<span className="t-muted">{summary.experimentStart ? `실증 시작 ${summary.experimentStart}` : '실증 시작일 미설정'}</span>}>
              AX 로 확인된 변화
            </SectionTitle>
            {cards.length === 0 ? (
              <div data-perf-nochange data-tour="perf-a" className="card p-5 sm:p-6">
                <p className="t-card text-navy-900">아직 측정된 값이 없습니다</p>
                <p className="t-body mt-1.5 break-keep text-navy-600">{diagnosis.headline}</p>
                <p className="t-muted mt-1 break-keep">{diagnosis.lines[0]}</p>
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-3">
                {cards.map((c, i) => (
                  <button
                    key={c.key}
                    type="button"
                    data-perf-change={c.key}
                    data-tour={i === 0 ? 'perf-a' : undefined}
                    onClick={() => goTab('basis', c.anchor)}
                    className="card flex flex-col p-5 text-left transition hover:bg-navy-50 sm:p-6"
                  >
                    <p className="t-card break-keep text-navy-900">{c.label}</p>
                    <p data-perf-change-value={c.key} className={`t-kpi mt-2 ${c.worse ? 'text-rose-600' : 'text-navy-900'}`}>{c.value}</p>
                    <p className="t-body mt-1 break-keep text-navy-600">{c.desc}</p>
                    <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3">
                      <KindChip kind={c.kind} />
                      <span className="t-caption break-keep text-navy-500">{c.source}</span>
                      <span className="t-caption ml-auto flex items-center gap-0.5 text-navy-400">계산 보기 <ChevronRight size={14} /></span>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* 업무 재현시험 — 실제 운영 성과와 따로 */}
            {trialSum.length > 0 && (
              <div data-perf-trials className="card mt-3 p-5 sm:p-6">
                <p className="t-card flex flex-wrap items-center gap-2 text-navy-900"><FlaskConical size={18} className="text-sky-700" /> 업무 재현시험 — 같은 일을 두 방식으로</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {trialSum.map((t) => (
                    <div key={t.task} data-perf-trial={t.task} className="rounded-2xl bg-sky-50/60 px-4 py-3">
                      <p className="t-muted font-bold">{t.label}</p>
                      <p className="t-kpi-sm mt-1 text-navy-900">{t.oldMedianMin}분 → {t.newMedianMin}분</p>
                      <p className="t-caption mt-0.5 break-keep text-navy-600">
                        {t.savedPct != null && (t.savedPct >= 0 ? `${t.savedPct}% 단축` : `${Math.abs(t.savedPct)}% 늘어남`)} · {t.n}회 · 오류 {t.oldErrors}→{t.newErrors}
                      </p>
                      <KindChip kind="업무 재현시험" className="mt-1.5" />
                    </div>
                  ))}
                </div>
                <p className="t-caption mt-2 break-keep text-navy-500">같은 일을 두 방식으로 해 본 실험실 값입니다. 실제 운영 성과와 따로 보며, 회사 전체 절감으로 확대하지 않습니다.</p>
              </div>
            )}

            {/* 아직 측정하지 않은 항목 — 묶어서 */}
            {missing.length > 0 && (
              <div data-perf-unmeasured className="mt-3">
                <button
                  data-perf-unmeasured-toggle
                  onClick={() => setUnmeasuredOpen((v) => !v)}
                  className="flex min-h-[2.75rem] w-full items-center gap-2 rounded-2xl bg-navy-50 px-4 text-left text-[1.02rem] font-bold text-navy-600 transition hover:bg-navy-100"
                >
                  아직 측정하지 않은 항목 {missing.length}개
                  <ChevronDown size={16} className={`ml-auto transition-transform ${unmeasuredOpen ? 'rotate-180' : ''}`} />
                </button>
                {unmeasuredOpen && (
                  <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
                    {missing.map((u) => (
                      <li key={u.key} data-perf-unmeasured-item={u.key} className="rounded-xl bg-white px-3.5 py-2.5 ring-1 ring-navy-50">
                        <b className="t-body text-navy-800">{u.label}</b>
                        <span className="t-caption block break-keep text-navy-500">{u.reason}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>

          {/* ③ 다음 할 일 */}
          {next.length > 0 && (
            <section data-perf-next>
              <SectionTitle>다음 할 일 — 성과를 확인하려면</SectionTitle>
              <ol className="card divide-y divide-navy-50">
                {next.map((a, i) => (
                  <li key={a.key} data-perf-next-item={a.key}>
                    <button
                      type="button"
                      onClick={() => (a.to ? navigate(a.to) : goTab(a.tab ?? 'settings'))}
                      className="flex w-full items-start gap-3 px-5 py-4 text-left transition hover:bg-navy-50"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-navy-900 text-[1rem] font-extrabold text-white">{i + 1}</span>
                      <span className="min-w-0 flex-1">
                        <span className="t-body block break-keep font-extrabold text-navy-900">{a.title}</span>
                        <span className="t-muted block break-keep">{a.why}</span>
                      </span>
                      <ChevronRight size={18} className="mt-1 shrink-0 text-navy-400" />
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      )}

      {/* ═══ 측정 근거 ══════════════════════════════════════════════════════ */}
      {tab === 'basis' && (
        <div data-perf-basis className="space-y-6">
          {/* 왜 지금 이 숫자인가 — 자료 미확인 / 실제 사용 없음 */}
          <section data-perf-diagnosis className="card p-5 sm:p-6">
            <p className="t-card text-navy-900">지금 집계에 들어간 자료</p>
            <p data-perf-diagnosis-head className="t-body mt-1.5 break-keep font-bold text-navy-700">{diagnosis.headline}</p>
            <ul className="t-muted mt-2 grid gap-1 break-keep">
              {diagnosis.lines.map((l, i) => <li key={i}>· {l}</li>)}
            </ul>
            <p data-perf-breadth className="t-body mt-3 break-keep rounded-2xl bg-navy-50 px-4 py-3 font-bold text-navy-700">
              {breadthLine(summary.fieldCount, summary.breadth)}
              <span className="ml-2 inline-flex flex-wrap gap-1.5 align-middle"><ProvenanceBadge kind={prov.kind} /><TierBadge tier={tier.tier} /></span>
            </p>
            {!summary.breadthOk && <p data-perf-gaps className="t-muted mt-2 break-keep">대표 성과값 기준에 모자란 것: {summary.breadthGaps.join(' · ')}. {BREADTH_RULE_NOTE}</p>}
            <p
              data-perf-confounding={summary.confounding.known ? (summary.confounding.overlapping.length > 0 ? 'yes' : 'no') : 'unknown'}
              className={`t-muted mt-2 break-keep rounded-xl px-3 py-2 font-bold ${summary.confounding.overlapping.length > 0 ? 'bg-amber-50 text-amber-800' : 'bg-navy-50 text-navy-500'}`}
            >
              {summary.confounding.note}
            </p>
          </section>

          {/* 기간 */}
          <div className="card p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <p className="t-muted">실증 시작일 <b className="text-navy-800">{summary.experimentStart ?? '미설정'}</b>{summary.experimentDay != null && ` · ${summary.experimentDay}일차`}</p>
              <p className="t-muted">도입 전 기준값 <b className="text-navy-800">{baselineFilled}/5</b></p>
              <p className="t-muted">같은 범위 개선율 <b className="text-navy-800">{summary.ready.confirmed}/{summary.ready.total}</b> · 측정값 있음 <b className="text-navy-800">{summary.ready.measured}</b></p>
              <p className="t-muted">집계 {summary.period.from} ~ {summary.period.to} ({summary.period.days}일)</p>
            </div>
            <div className="mt-3 grid w-full grid-cols-2 gap-1 rounded-2xl bg-navy-50 p-1 sm:flex">
              {PERIOD_PRESETS.map((p) => (
                <button key={p.value} onClick={() => setPreset(p.value)} className={`whitespace-nowrap rounded-xl px-2 py-2 text-center text-[1.02rem] font-extrabold transition sm:flex-1 ${preset === p.value ? 'bg-white text-teal-600 shadow-sm' : 'text-navy-500 hover:text-navy-700'}`}>
                  {p.label}
                </button>
              ))}
            </div>
            {preset === 'custom' && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="field-input max-w-[13rem]" />
                <span className="t-body font-bold text-navy-400">~</span>
                <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="field-input max-w-[13rem]" />
              </div>
            )}
          </div>

          <section>
            <SectionTitle>실증 진행 단계 (내부 표시 기준)</SectionTitle>
            <TierProgress tier={tier.tier} fieldCount={summary.fieldCount} remaining={tier.remaining} nextAt={tier.nextAt} desc={tier.desc} />
          </section>

          <section><SectionTitle>도입 전 실제 업무</SectionTitle><OpsSurveyCard /></section>
          <section><SectionTitle>도입 전 → 도입 후, 일하는 방식</SectionTitle><BeforeAfterPanel /></section>

          <section id="efficiency">
            <SectionTitle action={<span className="pill bg-navy-100 text-navy-500">{summary.period.label}</span>}>A. 업무 효율 — 측정값과 비교값</SectionTitle>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {efficiency.map((m) => <MetricCard key={m.key} m={m} />)}
            </div>
            <div data-perf-excel className="card mt-4 flex flex-wrap items-start gap-3 p-4 sm:p-5">
              <Table2 size={19} className="mt-0.5 shrink-0 text-navy-400" />
              <div className="min-w-0 flex-1">
                <p className="t-body font-extrabold text-navy-900">엑셀·카톡에 다시 적은 것 (하루 한 줄 확인)</p>
                <p className="t-muted mt-1 break-keep">
                  {summary.excel == null
                    ? '응답을 읽지 못했습니다 — 관리자 계정에서만 전부 읽습니다.'
                    : summary.excel.respondedDays === 0
                      ? '이 기간에 응답이 없습니다. 첫 화면의 한 줄에 답하면 여기 쌓입니다.'
                      : `응답 ${summary.excel.respondedDays}일 · 다시 적은 날 ${summary.excel.daysWithReentry}일 · ${summary.excel.reentries}건${summary.excel.reasons.length ? ` · 이유: ${summary.excel.reasons.map((r) => `${r.text} ${r.count}회`).join(', ')}` : ''}`}
                </p>
              </div>
            </div>
          </section>

          <section id="automation">
            <SectionTitle action={<ProvenanceBadge kind={prov.kind} />}>B. 자동화 — 1회 입력이 실제로 바꾼 것</SectionTitle>
            <div className="card p-5 sm:p-6">
              <div className="flex flex-wrap items-end gap-x-3 gap-y-4">
                <div><p className="t-muted font-bold">수거 입력</p><p className="t-kpi mt-1 text-navy-900">{summary.collectionCount}<span className="ml-0.5 text-[max(0.9rem,0.62em)] font-bold text-navy-400">건</span></p></div>
                <ArrowRight size={26} className="mb-3 shrink-0 text-navy-400" strokeWidth={2.8} />
                <div><p className="t-muted font-bold">자동 처리된 업무</p><p className="t-kpi mt-1 text-teal-600">{summary.autoLink.total}<span className="ml-0.5 text-[max(0.9rem,0.62em)] font-bold text-teal-500/70">건</span></p></div>
              </div>
              <p className="t-muted mt-3 break-keep">실제 현장 {summary.fieldCount}건 · 시연 {summary.demoCount}건. 시스템 안에서 세는 값입니다 — 엑셀·카톡 재입력은 A 의 확인 응답으로 따로 셉니다.</p>
              <div className="mt-4 border-t border-navy-50 pt-3">
                <button onClick={() => setAutoOpen((v) => !v)} className="-mx-2 flex min-h-[2.75rem] w-[calc(100%+1rem)] items-center gap-1.5 rounded-xl px-2 text-left text-[1rem] font-bold text-navy-400 transition hover:bg-navy-50 hover:text-navy-600">
                  자동 연결 업무 내역 <ChevronDown size={14} className={`transition-transform ${autoOpen ? 'rotate-180' : ''}`} />
                </button>
                {autoOpen && (autoRows.length > 0 ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 2xl:grid-cols-4">
                    {autoRows.map((r) => (
                      <div key={r.key} className="flex items-center justify-between gap-2 rounded-2xl bg-navy-50 px-4 py-3">
                        <span className="t-body min-w-0 break-keep font-bold text-navy-600">{r.label}</span>
                        <span className="t-body shrink-0 font-extrabold text-navy-900">{r.value}건</span>
                      </div>
                    ))}
                  </div>
                ) : <p className="t-body mt-3 text-navy-400">기간 내 수거 입력이 없어 자동 처리 건수가 없습니다.</p>)}
              </div>
            </div>
          </section>

          <AxEvidencePanels data={data} period={period} experimentStart={summary.experimentStart} today={today()} />

          <section id="sales"><SectionTitle>C. 매출 확장 — 추천 → 제안 → 수락 → 실제 매출</SectionTitle><SalesFunnelPanel data={data} /></section>
          <section id="model"><SectionTitle>D. 사업 확장 — 거래처당 매출 구조</SectionTitle><RevenueModelCard data={data} /></section>

          {devRows.trials.length > 0 && (
            <section id="trials">
              <SectionTitle action={<KindChip kind="업무 재현시험" />}>업무 재현시험 기록</SectionTitle>
              <TrialCard trials={devRows.trials} canWrite={false} onSaved={() => setDevTick((n) => n + 1)} />
            </section>
          )}

          <section id="growth-chain">
            <SectionTitle>성장 → 병목 → AX → 측정 → 투자 → 목표</SectionTitle>
            <div className="card p-5 sm:p-6"><GrowthChain data={data} summary={summary} /></div>
          </section>
        </div>
      )}

      {/* ═══ 설정 ═══════════════════════════════════════════════════════════ */}
      {tab === 'settings' && (
        <div data-perf-settings className="space-y-5">
          <section className="card p-5 sm:p-6">
            <p className="t-card text-navy-900">실증 시작일 · 도입 전 기준값</p>
            <p className="t-body mt-1.5 break-keep text-navy-700">
              시작일 <b>{summary.experimentStart ?? '미설정'}</b> · 기준값 <b>{baselineFilled}/5</b> 입력
              {baselineFilled > 0 && ` (출처 ${data.baseline.source === 'survey' ? '업무 조사 응답' : data.baseline.source === 'demo' ? '시연용' : '직접 입력'})`}
            </p>
            <p className="t-muted mt-1 break-keep">시작일 이전 입력은 연습으로 분류합니다. 기준값은 이사님 8월 조사값으로 한 번에 채울 수 있습니다.</p>
            {isAdmin ? (
              <button data-perf-go-baseline onClick={() => navigate('/settings#baseline')} className="btn-navy mt-3">설정에서 바꾸기 <ArrowRight size={16} /></button>
            ) : (
              <p className="t-caption mt-2 text-navy-500">관리자가 설정 화면에서 바꿉니다.</p>
            )}
          </section>
          {live && isAdmin && <section className="card p-5 sm:p-6"><AfterSurveyCard /></section>}
          {live && isStaff && <TrialCard trials={devRows.trials} canWrite={isStaff} onSaved={() => setDevTick((n) => n + 1)} />}
          {live && <OpsChangesCard />}
          <section className="card p-5 sm:p-6">
            <p className="t-card text-navy-900">엑셀·카톡 다시 적은 것 — 하루 한 줄</p>
            <p className="t-muted mt-1 break-keep">첫 화면 「오늘 처리할 업무」 아래에서 답합니다. {summary.excel ? `지금까지 응답 ${summary.excel.respondedDays}일.` : ''}</p>
            <button onClick={() => navigate('/')} className="btn-ghost mt-3">첫 화면으로 <ArrowRight size={16} /></button>
          </section>
        </div>
      )}
    </PageShell>
  )
}
