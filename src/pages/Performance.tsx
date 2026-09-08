import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Timer,
  Repeat,
  FileText,
  AlertTriangle,
  TrendingUp,
  Info,
  SlidersHorizontal,
  ClipboardCheck,
  Zap,
  ChevronDown,
  Table2,
  type LucideIcon,
} from 'lucide-react'
import { useData } from '../context/DataContext'
import { useAuth } from '../context/AuthContext'
import { PageShell, SectionTitle } from '../components/ui'
import { RevenueModelCard } from '../components/RevenueModel'
import { PageHeader } from '../components/PageHeader'
import {
  AUTO_LINK_LABEL,
  PERIOD_PRESETS,
  SOURCE_LABEL,
  STATUS_LABEL,
  performanceSummary,
  provenanceOf,
  tierProgress,
  type MetricRow,
  type PeriodPreset,
} from '../lib/performance'
import { BREADTH_RULE_NOTE, breadthLine } from '../lib/evidenceBase'
import { parseExcelChecks, type ExcelCheck } from '../lib/excelCheck'
import { loadDevRequests } from '../lib/repo'
import { SalesFunnelPanel } from '../components/SalesFunnel'
import { AxEvidencePanels } from '../components/AxEvidencePanels'
import { LoadGate, useLoadState } from '../components/LoadState'
import { BeforeAfterPanel } from '../components/BeforeAfter'
import { OpsSurveyCard } from '../components/OpsSurveyCard'
import { GrowthChain } from '../components/GrowthChain'
import { ProvenanceBadge, TierBadge, TierProgress } from '../components/DataBadge'
import { today } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// AX 도입 성과 (/performance)
//
//  정책자금·신용보증기금 심사용. 구성:
//    A. 업무 효율 — 측정값과 비교값을 **가릅니다** (같은 범위끼리만 개선율)
//    B. 자동화   — 수거 입력 → 자동 처리 건수
//    업무·매출·고객·확장 AX — 이미 저장돼 있는 기록으로 셈
//    C. 매출 확장 — 추천 → 제안 → 수락 → 실제 매출 (담당자 기록)
//    D. 사업 확장 — 거래처당 매출 구조 (구현됨 / 실증 중 / 개발 예정)
//    성장 → 병목 → AX → 측정 → 투자 → 목표 — 심사 자리에서 읽는 순서
//
//  원칙: 근거가 없으면 숫자를 만들지 않고 '측정 중 / 비교 기준 없음'으로 둡니다.
//        30건은 내부 표시 기준입니다 — 기간·병원·기사·커버리지까지 넘어야 대표값입니다.
// ─────────────────────────────────────────────────────────────────────────────

const METRIC_ICON: Record<string, LucideIcon> = {
  inputTime: Timer,
  adminTime: Timer,
  repeatEntry: Repeat,
  docHours: FileText,
  rework: AlertTriangle,
  dailyCount: TrendingUp,
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

/** 측정 근거 접기 영역 — 숫자가 먼저 보이도록 기본은 접힌 상태 */
function BasisDetails({ m }: { m: MetricRow }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-4 border-t border-navy-50 pt-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="-mx-2 flex min-h-[2.75rem] w-[calc(100%+1rem)] items-center gap-1.5 rounded-xl px-2 text-left text-[1rem] font-bold text-navy-400 transition hover:bg-navy-50 hover:text-navy-600"
      >
        측정 근거
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div data-metric-basis={m.key} className="mt-2.5 space-y-1.5">
          {m.beforeSource !== 'none' && (
            <p className="t-muted">
              <span className="font-bold text-navy-500">[{SOURCE_LABEL[m.beforeSource]}]</span> 도입 전
            </p>
          )}
          {m.afterSource && (
            <p className="t-muted">
              <span className="font-bold text-navy-500">[{SOURCE_LABEL[m.afterSource]}]</span> 도입 후
            </p>
          )}
          <p className="t-muted break-keep">{m.basis}</p>
          {m.note && <p className="t-muted break-keep font-bold text-navy-500">{m.note}</p>}
        </div>
      )}
    </div>
  )
}

/** Before → After 비교 카드 (숫자 중심) */
function MetricCard({ m, onSetBaseline, canSetBaseline }: { m: MetricRow; onSetBaseline: () => void; canSetBaseline: boolean }) {
  const Icon = METRIC_ICON[m.key] ?? Info
  const improved = m.changePct != null && m.changePct > 0
  const worsened = m.changePct != null && m.changePct < 0
  const measuredOnly = m.status === 'no-comparable'
  return (
    <div data-metric={m.key} data-metric-status={m.status} className="card flex flex-col p-5 sm:p-6">
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
          <p className="t-muted font-bold">{measuredOnly ? '도입 후 측정값' : '도입 후'}</p>
          <p data-metric-after={m.key} className={`t-kpi-sm mt-0.5 ${m.after == null ? 'text-navy-400' : 'text-navy-900'}`}>
            {fmt(m.after, m.unit)}
          </p>
        </div>
      </div>

      <div className="mt-3">
        {m.status === 'ok' && m.changePct != null ? (
          <>
            <p
              data-metric-change={m.key}
              className={
                m.emphasis
                  ? `t-section ${improved ? 'text-teal-600' : worsened ? 'text-rose-500' : 'text-navy-500'}`
                  : `t-body font-extrabold ${worsened ? 'text-rose-500' : 'text-navy-500'}`
              }
            >
              {improved ? `${m.changePct}% ` : worsened ? `${Math.abs(m.changePct)}% ` : '변화 없음'}
              {improved ? (m.betterWhen === 'lower' ? '단축' : '증가') : worsened ? (m.betterWhen === 'lower' ? '증가 (나빠짐)' : '감소 (나빠짐)') : ''}
            </p>
            {m.confounded ? (
              <p data-metric-confounded={m.key} className="t-muted mt-1 break-keep font-bold text-amber-700">
                복합 개선 — 이 구간에 차량·인력·거점·계약 변화가 겹쳐 AX 단독 효과를 가를 수 없습니다
              </p>
            ) : m.emphasis ? (
              <p className="t-muted mt-1 font-bold text-teal-600">실제 현장 {m.fieldSamples}건 · 기간·병원·기사·커버리지 기준 충족 (내부 기준)</p>
            ) : (
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                <TierBadge tier={m.tier} />
                <p className="t-muted break-keep font-bold text-navy-400">
                  {m.provenance === 'demo'
                    ? '시연 데이터 기준 참고값 — 실제 현장 데이터 축적 후 확정'
                    : m.tier === 'field'
                      ? '건수는 넘었지만 기간·병원·기사·커버리지 또는 시연 분리가 아직입니다 — 참고값'
                      : `실제 현장 ${m.fieldSamples}건 · 참고값`}
                </p>
              </div>
            )}
          </>
        ) : m.status === 'need-baseline' ? (
          canSetBaseline ? (
            <button
              onClick={onSetBaseline}
              className="-mx-2 inline-flex min-h-[2.75rem] items-center rounded-xl px-2 text-left font-bold text-amber-700 underline underline-offset-4 transition hover:bg-amber-50"
            >
              도입 전 기준값 입력하기
            </button>
          ) : (
            <p className="t-body font-bold text-amber-700">도입 전 기준값 입력 필요 (관리자가 설정에서 넣습니다)</p>
          )
        ) : m.status === 'no-comparable' ? (
          <p data-metric-nocompare={m.key} className="t-body break-keep font-bold text-sky-700">
            측정값만 보여 드립니다 — 같은 범위의 도입 전 값이 없어 개선율을 내지 않습니다
          </p>
        ) : (
          <p className="t-body break-keep font-bold text-navy-400">
            {m.status === 'not-measured' ? '자동 측정 항목 없음 — 같은 범위 조사값이 들어오면 견줍니다' : '측정 중 — 아직 견줄 만큼 쌓이지 않았습니다'}
          </p>
        )}
      </div>

      <BasisDetails m={m} />
    </div>
  )
}

export function Performance() {
  const { data } = useData()
  const { role } = useAuth()
  const navigate = useNavigate()
  const [preset, setPreset] = useState<PeriodPreset>('all')
  const [customFrom, setCustomFrom] = useState(today())
  const [customTo, setCustomTo] = useState(today())
  const [autoOpen, setAutoOpen] = useState(false)
  const loadState = useLoadState()
  const isAdmin = role === 'admin'

  //  엑셀 병행 확인 응답 — 관리자만 전부 읽을 수 있습니다. 못 읽으면 넘기지 않습니다(null 로 표시).
  const [excelChecks, setExcelChecks] = useState<ExcelCheck[] | undefined>(undefined)
  useEffect(() => {
    if (!isAdmin) { setExcelChecks(undefined); return }
    let alive = true
    loadDevRequests()
      .then((rows) => alive && setExcelChecks(parseExcelChecks(rows)))
      .catch(() => alive && setExcelChecks(undefined))
    return () => { alive = false }
  }, [isAdmin])

  const summary = useMemo(
    () =>
      performanceSummary(data, preset, { from: customFrom, to: customTo }, {
        excelChecks,
        changes: data.opsChanges,
        afterSurvey: data.afterSurvey ?? null,
      }),
    [data, preset, customFrom, customTo, excelChecks],
  )
  const prov = useMemo(() => provenanceOf(data, summary.events), [data, summary.events])
  const tier = useMemo(() => tierProgress(summary.fieldCount), [summary.fieldCount])

  const goSettings = () => navigate('/settings#baseline')
  const hasBaseline = summary.metrics.some((m) => m.before != null)
  const baselineSource =
    data.baseline.source === 'demo' ? '시연 기준값' : data.baseline.source === 'survey' ? '업무 조사 응답' : '직접 입력(추정)'

  // A. 업무 효율 — 측정값만 있는 것과 같은 범위로 견주는 것을 한 자리에
  const efficiency = ['inputTime', 'adminTime', 'repeatEntry', 'rework', 'dailyCount', 'docHours']
    .map((k) => summary.metrics.find((m) => m.key === k))
    .filter((m): m is MetricRow => !!m)

  const autoRows = (Object.keys(AUTO_LINK_LABEL) as (keyof typeof AUTO_LINK_LABEL)[])
    .map((k) => ({ key: k, label: AUTO_LINK_LABEL[k], value: summary.autoLink[k] }))
    .filter((r) => r.value > 0)
  const autoAvg =
    summary.collectionCount > 0 ? Math.round((summary.autoLink.total / summary.collectionCount) * 10) / 10 : null

  if (loadState !== 'ready') {
    return (
      <PageShell>
        <PageHeader title="AX 도입 성과" subtitle="측정값과 비교값을 가릅니다 — 근거가 없으면 숫자를 만들지 않습니다" />
        <LoadGate
          loadingTitle="성과 자료를 불러오는 중입니다"
          loadingSubtitle="다 읽은 뒤에 숫자를 보여 드립니다 — 읽는 중에 0 을 보여 주면 「성과가 없다」로 읽힙니다."
          empty={<span />}
        />
      </PageShell>
    )
  }

  return (
    <PageShell>
      <PageHeader
        title="AX 도입 성과"
        subtitle="AX = 업무 전환(자동화). 측정값과 비교값을 가르고, 근거가 없으면 숫자를 만들지 않습니다"
        action={
          isAdmin ? (
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => navigate('/readiness')} className="btn-ghost shrink-0">
                <ClipboardCheck size={17} strokeWidth={2.4} /> 실증 준비 상태
              </button>
              <button onClick={goSettings} className="btn-ghost shrink-0">
                <SlidersHorizontal size={17} strokeWidth={2.4} /> 기준값 설정
              </button>
            </div>
          ) : undefined
        }
      />

      {/* 표본의 폭 한 줄 + 데이터 출처 — 홍보 문장 대신 사실 */}
      <div data-perf-breadth className="card flex flex-wrap items-center gap-x-3 gap-y-2 bg-navy-900 px-5 py-4 sm:px-6">
        <Zap size={20} className="shrink-0 text-teal-300" strokeWidth={2.6} />
        <p className="t-body w-full min-w-0 break-keep font-bold text-white sm:w-auto sm:flex-1">
          {breadthLine(summary.fieldCount, summary.breadth)}
          {summary.practiceCount > 0 && ` · 연습 입력 ${summary.practiceCount}건 제외`}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <ProvenanceBadge kind={prov.kind} />
          <TierBadge tier={tier.tier} />
        </div>
      </div>

      {!summary.breadthOk && (
        <p data-perf-gaps className="t-body break-keep rounded-3xl bg-navy-50 px-5 py-3.5 font-bold text-navy-500">
          대표 성과값으로 부르기엔 아직 모자란 것: {summary.breadthGaps.join(' · ')}. {BREADTH_RULE_NOTE}
        </p>
      )}

      {/* 복합 개선 — 비교 구간에 차량·인력·거점 변화가 겹쳤는가 */}
      <p
        data-perf-confounding={summary.confounding.known ? (summary.confounding.overlapping.length > 0 ? 'yes' : 'no') : 'unknown'}
        className={`t-body break-keep rounded-3xl px-5 py-3.5 font-bold ${
          summary.confounding.overlapping.length > 0 ? 'bg-amber-50 text-amber-800' : 'bg-navy-50 text-navy-500'
        }`}
      >
        {summary.confounding.note}
        {isAdmin && (
          <button onClick={() => navigate('/settings#ops-changes')} className="ml-2 underline underline-offset-4">
            운영 변화 기록
          </button>
        )}
      </p>

      {/* 실증 상태 + 기간 선택 */}
      <div className="card p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div>
            <p className="t-muted font-bold">실증 시작일</p>
            <p className="t-body mt-0.5 font-extrabold text-navy-900">
              {summary.experimentStart ?? '미설정 (전체 기간 집계)'}
              {summary.experimentDay != null && <span className="ml-2 font-bold text-teal-600">실증 {summary.experimentDay}일차</span>}
            </p>
          </div>
          <div>
            <p className="t-muted font-bold">도입 전 기준값</p>
            <p className="t-body mt-0.5 font-extrabold text-navy-900">
              {hasBaseline ? `${baselineSource} · 5개 중 ${summary.metrics.filter((m) => m.before != null).length}개 입력` : '미입력'}
            </p>
          </div>
          <div>
            <p className="t-muted font-bold">같은 범위로 견준 지표</p>
            <p className="t-body mt-0.5 font-extrabold text-navy-900">
              {summary.ready.confirmed} / {summary.ready.total}개 · 측정값 있음 {summary.ready.measured}개
            </p>
          </div>
          <div>
            <p className="t-muted font-bold">집계 데이터</p>
            <p className="t-body mt-0.5 font-extrabold text-navy-900">
              실제 현장 {summary.fieldCount}건 · 시연 {summary.demoCount}건
            </p>
          </div>
          <div>
            <p className="t-muted font-bold">대표 성과값</p>
            <p className="t-body mt-0.5 font-extrabold text-navy-900">
              {summary.emphasized > 0 ? `${summary.emphasized}개` : '없음 (실증 중)'}
            </p>
          </div>
        </div>

        <div className="mt-4 grid w-full grid-cols-2 gap-1 rounded-2xl bg-navy-50 p-1 sm:flex">
          {PERIOD_PRESETS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPreset(p.value)}
              className={`whitespace-nowrap rounded-xl px-2 py-2.5 text-center text-[1.08rem] font-extrabold transition sm:flex-1 ${
                preset === p.value ? 'bg-white text-teal-600 shadow-sm' : 'text-navy-500 hover:text-navy-700'
              }`}
            >
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
        <p className="t-muted mt-3">
          집계 기간 {summary.period.from} ~ {summary.period.to} ({summary.period.days}일)
          {summary.experimentStart && ' · 실증 시작일 이전 입력은 연습으로 분류해 제외합니다'}
        </p>
      </div>

      {!hasBaseline && (
        <div className="flex flex-wrap items-center gap-3 rounded-3xl bg-amber-50 px-5 py-4">
          <AlertTriangle size={22} className="shrink-0 text-amber-700" />
          <p className="t-body w-full min-w-0 font-bold text-amber-700 sm:w-auto sm:flex-1">
            도입 전 기준값이 입력되지 않아 개선율을 계산할 수 없습니다. 측정값은 그대로 보입니다.
          </p>
          {isAdmin && (
            <button onClick={goSettings} className="btn-navy shrink-0">
              기준값 입력
            </button>
          )}
        </div>
      )}

      {/* ── 실증 단계 ── */}
      <section>
        <SectionTitle>실증 진행 단계 (내부 표시 기준)</SectionTitle>
        <TierProgress tier={tier.tier} fieldCount={summary.fieldCount} remaining={tier.remaining} nextAt={tier.nextAt} desc={tier.desc} />
      </section>

      {/* ── 도입 전 실제 업무 조사 ── */}
      <section>
        <SectionTitle>도입 전 실제 업무</SectionTitle>
        <OpsSurveyCard />
      </section>

      <section>
        <SectionTitle>도입 전 → 도입 후, 일하는 방식</SectionTitle>
        <BeforeAfterPanel />
      </section>

      {/* ── A. 업무 효율 ── */}
      <section id="efficiency">
        <SectionTitle action={<span className="pill bg-navy-100 text-navy-500">{summary.period.label}</span>}>
          A. 업무 효율 — 측정값과 비교값을 가릅니다
        </SectionTitle>
        <p className="t-muted mb-3 break-keep px-1 text-navy-500">
          「측정값만」은 시스템이 잰 값이지만 같은 범위의 도입 전 값이 없어 개선율을 내지 않는 것입니다.
          「측정 완료」만 같은 범위끼리 견준 개선율입니다.
        </p>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {efficiency.map((m, mi) => (
            <div key={m.key} data-tour={mi === 0 ? 'perf-a' : undefined}>
              <MetricCard m={m} onSetBaseline={goSettings} canSetBaseline={isAdmin} />
            </div>
          ))}
        </div>
        {/* 엑셀 병행 확인 — 외부 재입력의 유일한 근거 */}
        <div data-perf-excel className="card mt-4 flex flex-wrap items-start gap-3 p-4 sm:p-5">
          <Table2 size={19} className="mt-0.5 shrink-0 text-navy-400" />
          <div className="min-w-0 flex-1">
            <p className="t-body font-extrabold text-navy-900">엑셀·카톡에 다시 적은 것 (하루 한 줄 확인)</p>
            <p className="t-muted mt-1 break-keep">
              {summary.excel == null
                ? '응답을 읽지 못했습니다 — 관리자 계정에서만 전부 읽습니다.'
                : summary.excel.respondedDays === 0
                  ? '이 기간에 응답이 없습니다. 첫 화면의 「오늘 엑셀·카톡에 다시 적은 것」에 답하면 여기 쌓입니다.'
                  : `응답 ${summary.excel.respondedDays}일 · 다시 적은 날 ${summary.excel.daysWithReentry}일 · ${summary.excel.reentries}건${
                      summary.excel.reasons.length ? ` · 이유: ${summary.excel.reasons.map((r) => `${r.text} ${r.count}회`).join(', ')}` : ''
                    }`}
            </p>
          </div>
        </div>
      </section>

      {/* ── B. 자동화 ── */}
      <section id="automation">
        <SectionTitle
          action={
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="pill bg-teal-50 text-teal-700">시스템 자동 측정</span>
              <ProvenanceBadge kind={prov.kind} />
            </div>
          }
        >
          B. 자동화 — 1회 입력이 실제로 바꾼 것
        </SectionTitle>
        <div className="card p-5 sm:p-6">
          <div className="flex flex-wrap items-end gap-x-3 gap-y-4">
            <div className="min-w-0">
              <p className="t-muted font-bold">수거 입력</p>
              <p className="t-kpi mt-1 text-navy-900">
                {summary.collectionCount}
                <span className="ml-0.5 text-[max(0.9rem,0.62em)] font-bold text-navy-400">건</span>
              </p>
            </div>
            <ArrowRight size={26} className="mb-3 shrink-0 text-navy-400" strokeWidth={2.8} />
            <div className="min-w-0">
              <p className="t-muted font-bold">자동 처리된 업무</p>
              <p className="t-kpi mt-1 text-teal-600">
                {summary.autoLink.total}
                <span className="ml-0.5 text-[max(0.9rem,0.62em)] font-bold text-teal-500/70">건</span>
              </p>
            </div>
            <div className="min-w-0 sm:ml-6">
              <p className="t-muted font-bold">1건 입력당 자동 연결</p>
              <p className="t-kpi-sm mt-1 text-navy-900">
                {autoAvg == null ? <span className="text-navy-400">측정 중</span> : `${autoAvg}건`}
              </p>
            </div>
          </div>
          <p className="t-muted mt-3 break-keep font-bold text-navy-500">
            수거 입력 {summary.collectionCount}건 중 실제 현장 {summary.fieldCount}건 · 시연 {summary.demoCount}건.
            자동 연결 건수는 입력 1건이 실제로 바꾼 대상만 세는 **시스템 안** 건수입니다 — 엑셀·카톡 재입력이 사라졌다는 뜻은 아닙니다(그건 A 의 확인 응답으로 셉니다).
          </p>

          <div className="mt-4 border-t border-navy-50 pt-3">
            <button
              onClick={() => setAutoOpen((v) => !v)}
              className="-mx-2 flex min-h-[2.75rem] w-[calc(100%+1rem)] items-center gap-1.5 rounded-xl px-2 text-left text-[1rem] font-bold text-navy-400 transition hover:bg-navy-50 hover:text-navy-600"
            >
              자동 연결 업무 내역
              <ChevronDown size={14} className={`transition-transform ${autoOpen ? 'rotate-180' : ''}`} />
            </button>
            {autoOpen &&
              (autoRows.length > 0 ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-2 2xl:grid-cols-4">
                  {autoRows.map((r) => (
                    <div key={r.key} className="flex items-center justify-between gap-2 rounded-2xl bg-navy-50 px-4 py-3">
                      <span className="t-body min-w-0 break-keep font-bold text-navy-600">{r.label}</span>
                      <span className="t-body shrink-0 font-extrabold text-navy-900">{r.value}건</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="t-body mt-3 text-navy-400">기간 내 수거 입력이 없어 자동 처리 건수가 없습니다.</p>
              ))}
            {autoOpen && (
              <p className="t-muted mt-3">각 항목은 실제 수거 입력 기록(감사기록)이 변경한 대상만 집계합니다. 추정치가 아닙니다.</p>
            )}
          </div>
        </div>
      </section>

      <AxEvidencePanels
        data={data}
        period={{ from: summary.period.from, to: summary.period.to }}
        experimentStart={summary.experimentStart}
        today={today()}
      />

      {/* ── C. 매출 확장 ── */}
      <section id="sales">
        <SectionTitle action={<span className="pill bg-teal-50 text-teal-700">담당자 기록 기준</span>}>
          C. 매출 확장 — 추천 → 제안 → 수락 → 실제 매출
        </SectionTitle>
        <SalesFunnelPanel data={data} />
      </section>

      {/* ── D. 사업 확장 ── */}
      <section id="model">
        <SectionTitle action={<span className="pill bg-navy-100 text-navy-500">구현 상태 구분</span>}>
          D. 사업 확장 — 거래처당 매출 구조
        </SectionTitle>
        <RevenueModelCard data={data} />
      </section>

      {/* ── 성장 → 병목 → AX → 측정 → 투자 → 목표 ── */}
      <section id="growth-chain">
        <SectionTitle action={<span className="pill bg-navy-100 text-navy-500">줄마다 출처 · 확인 상태</span>}>
          성장 → 병목 → AX 로 바뀐 업무 → 측정 → 투자 필요 → 다음 목표
        </SectionTitle>
        <div className="card p-5 sm:p-6">
          <GrowthChain data={data} summary={summary} />
          <p className="t-muted mt-4 break-keep">
            집계 대상: 수거 입력 {summary.collectionCount}건 (실제 현장 {summary.fieldCount}건 · 시연 {summary.demoCount}건) ·
            자동 처리 {summary.autoLink.total}건 · 입력시간 표본 {summary.duration.samples}건
            {summary.revertedCount > 0 && ` · 취소 후 재입력 ${summary.revertedCount}건`} · 데이터 출처 {prov.label}.
            매출 성장 전체를 AX 효과로 적지 않습니다 — AX 가 바꾼 것은 4번 칸의 측정값만큼입니다.
          </p>
        </div>
      </section>
    </PageShell>
  )
}
