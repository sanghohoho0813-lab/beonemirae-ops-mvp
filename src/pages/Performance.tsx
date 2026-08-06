import { useMemo, useState } from 'react'
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
  Zap,
  ChevronDown,
  type LucideIcon,
} from 'lucide-react'
import { useData } from '../context/DataContext'
import { PageShell, SectionTitle } from '../components/ui'
import { PageHeader } from '../components/PageHeader'
import {
  AUTO_LINK_LABEL,
  PERIOD_PRESETS,
  SOURCE_LABEL,
  STATUS_LABEL,
  performanceSummary,
  provenanceOf,
  type MetricRow,
  type PeriodPreset,
} from '../lib/performance'
import { SalesFunnelPanel } from '../components/SalesFunnel'
import { BeforeAfterPanel } from '../components/BeforeAfter'
import { today } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// AX 도입 성과 (/performance)
//
//  정책자금·신용보증기금 심사용. 세 섹션으로만 구성합니다.
//    A. 업무 효율 — 행정업무 시간 / 반복 입력 / 누락·재확인
//    B. 자동화   — 수거 입력 → 자동 처리 건수
//    C. 매출 확장 — 추천 → 제안 → 수락 → 실제 매출
//
//  원칙: 근거가 없으면 숫자를 만들지 않고 '측정 중 / 기준값 입력 필요'로 둡니다.
//        긴 측정 근거는 접기 영역으로 보내 숫자가 먼저 보이게 합니다.
// ─────────────────────────────────────────────────────────────────────────────

const METRIC_ICON: Record<string, LucideIcon> = {
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
}

const PROVENANCE_STYLE: Record<string, string> = {
  field: 'bg-teal-50 text-teal-700',
  mixed: 'bg-amber-50 text-amber-700',
  demo: 'bg-amber-50 text-amber-700',
  none: 'bg-navy-100 text-navy-500',
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
        className="flex w-full items-center gap-1.5 text-left text-[0.87rem] font-bold text-navy-400 transition hover:text-navy-600"
      >
        측정 근거
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-2.5 space-y-1.5">
          <p className="t-muted">
            <span className="font-bold text-navy-500">[{SOURCE_LABEL[m.beforeSource]}]</span> 도입 전 {m.label}
          </p>
          {m.afterSource && (
            <p className="t-muted">
              <span className="font-bold text-navy-500">[{SOURCE_LABEL[m.afterSource]}]</span> 도입 후 {m.label}
            </p>
          )}
          <p className="t-muted">{m.basis}</p>
          {m.note && <p className="t-muted font-bold text-navy-500">{m.note}</p>}
        </div>
      )}
    </div>
  )
}

/** Before → After 비교 카드 (숫자 중심) */
function MetricCard({ m, onSetBaseline }: { m: MetricRow; onSetBaseline: () => void }) {
  const Icon = METRIC_ICON[m.key] ?? Info
  const improved = m.changePct != null && m.changePct > 0
  const worsened = m.changePct != null && m.changePct < 0
  return (
    <div className="card flex flex-col p-5 sm:p-6">
      <div className="flex items-start gap-2.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-navy-50 text-navy-600">
          <Icon size={20} strokeWidth={2.2} />
        </span>
        {/* 좁은 폭(1024px 3열)에서는 상태 배지가 아래 줄로 내려가도록 wrap 처리 */}
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <p className="t-card min-w-0 break-keep text-navy-900">{m.label}</p>
          <span className={`pill max-w-full ${STATUS_STYLE[m.status]}`}>{STATUS_LABEL[m.status]}</span>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-x-3 gap-y-1.5">
        <div className="min-w-0">
          <p className="t-muted font-bold">도입 전</p>
          <p className="t-kpi-sm mt-0.5 text-navy-400">{fmt(m.before, m.unit)}</p>
        </div>
        <ArrowRight size={22} className="mb-2 shrink-0 text-navy-300" strokeWidth={2.6} />
        <div className="min-w-0">
          <p className="t-muted font-bold">도입 후</p>
          <p className={`t-kpi-sm mt-0.5 ${m.after == null ? 'text-navy-300' : 'text-navy-900'}`}>
            {fmt(m.after, m.unit)}
          </p>
        </div>
      </div>

      {/* 개선율 — 근거가 모두 있을 때만 */}
      <div className="mt-3">
        {m.status === 'ok' && m.changePct != null ? (
          <p className={`t-section ${improved ? 'text-teal-600' : worsened ? 'text-rose-500' : 'text-navy-500'}`}>
            {improved ? `${m.changePct}% ` : worsened ? `${Math.abs(m.changePct)}% ` : '변화 없음'}
            {improved
              ? m.betterWhen === 'lower'
                ? '단축'
                : '증가'
              : worsened
                ? m.betterWhen === 'lower'
                  ? '증가'
                  : '감소'
                : ''}
          </p>
        ) : m.status === 'need-baseline' ? (
          <button onClick={onSetBaseline} className="t-body font-bold text-amber-600 underline underline-offset-4">
            도입 전 기준값 입력하기
          </button>
        ) : (
          <p className="t-body font-bold text-navy-400">
            {m.status === 'not-measured' ? '자동 측정 항목 준비 중' : '실증 중 — 데이터 수집 중'}
          </p>
        )}
      </div>

      <BasisDetails m={m} />
    </div>
  )
}

export function Performance() {
  const { data } = useData()
  const navigate = useNavigate()
  const [preset, setPreset] = useState<PeriodPreset>('all')
  const [customFrom, setCustomFrom] = useState(today())
  const [customTo, setCustomTo] = useState(today())
  const [autoOpen, setAutoOpen] = useState(false)

  const summary = useMemo(
    () => performanceSummary(data, preset, { from: customFrom, to: customTo }),
    [data, preset, customFrom, customTo],
  )
  const prov = useMemo(() => provenanceOf(data, summary.events), [data, summary.events])

  const goSettings = () => navigate('/settings#baseline')
  const hasBaseline = summary.metrics.some((m) => m.before != null)
  const baselineSource = data.baseline.source === 'demo' ? '시연 기준값' : '사용자 입력값'

  // A. 업무 효율 — 3개만
  const efficiency = ['adminTime', 'repeatEntry', 'rework']
    .map((k) => summary.metrics.find((m) => m.key === k))
    .filter((m): m is MetricRow => !!m)

  const autoRows = (Object.keys(AUTO_LINK_LABEL) as (keyof typeof AUTO_LINK_LABEL)[])
    .map((k) => ({ key: k, label: AUTO_LINK_LABEL[k], value: summary.autoLink[k] }))
    .filter((r) => r.value > 0)
  const autoAvg =
    summary.collectionCount > 0
      ? Math.round((summary.autoLink.total / summary.collectionCount) * 10) / 10
      : null

  return (
    <PageShell>
      <PageHeader
        title="AX 도입 성과"
        subtitle="업무 자동화 → 데이터 축적 → 추천 → 제안 → 수락 → 추가 매출"
        action={
          <button onClick={goSettings} className="btn-ghost shrink-0">
            <SlidersHorizontal size={17} strokeWidth={2.4} /> 기준값 설정
          </button>
        }
      />

      {/* 심사용 한 줄 + 데이터 출처 */}
      <div className="card flex flex-wrap items-center gap-x-3 gap-y-2 bg-navy-900 px-5 py-4 sm:px-6">
        <Zap size={20} className="shrink-0 text-teal-300" strokeWidth={2.6} />
        <p className="t-body w-full min-w-0 break-keep font-bold text-white sm:w-auto sm:flex-1">
          현장 업무를 자동화하고, 축적된 병원 데이터로 추가 수거·소모품·교육 기회를 발굴해 실제 매출 전환까지
          추적합니다
        </p>
        <span className={`pill shrink-0 ${PROVENANCE_STYLE[prov.kind]}`}>{prov.label}</span>
      </div>

      {/* 실증 상태 + 기간 선택 */}
      <div className="card p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div>
            <p className="t-muted font-bold">실증 시작일</p>
            <p className="t-body mt-0.5 font-extrabold text-navy-900">
              {summary.experimentStart ?? '미설정 (전체 기간 집계)'}
              {summary.experimentDay != null && (
                <span className="ml-2 font-bold text-teal-600">실증 {summary.experimentDay}일차</span>
              )}
            </p>
          </div>
          <div>
            <p className="t-muted font-bold">도입 전 기준값</p>
            <p className="t-body mt-0.5 font-extrabold text-navy-900">
              {hasBaseline
                ? `${baselineSource} · 5개 중 ${summary.metrics.filter((m) => m.before != null).length}개 입력`
                : '미입력'}
            </p>
          </div>
          <div>
            <p className="t-muted font-bold">확보된 지표</p>
            <p className="t-body mt-0.5 font-extrabold text-navy-900">
              {summary.ready.confirmed} / {summary.ready.total}개
            </p>
          </div>
          <div>
            <p className="t-muted font-bold">집계 데이터</p>
            <p className="t-body mt-0.5 font-extrabold text-navy-900">
              실제 현장 {prov.fieldEvents}건 · 시연 {prov.demoEvents}건
            </p>
          </div>
        </div>

        <div className="mt-4 grid w-full grid-cols-2 gap-1 rounded-2xl bg-navy-50 p-1 sm:flex">
          {PERIOD_PRESETS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPreset(p.value)}
              className={`whitespace-nowrap rounded-xl px-2 py-2.5 text-center text-[0.95rem] font-extrabold transition sm:flex-1 ${
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
          {summary.experimentStart && ' · 실증 시작일 이전 데이터는 제외됩니다'}
        </p>
      </div>

      {!hasBaseline && (
        <div className="flex flex-wrap items-center gap-3 rounded-3xl bg-amber-50 px-5 py-4">
          <AlertTriangle size={22} className="shrink-0 text-amber-600" />
          <p className="t-body w-full min-w-0 font-bold text-amber-700 sm:w-auto sm:flex-1">
            도입 전 기준값이 입력되지 않아 개선율을 계산할 수 없습니다. 설정에서 실제 업무 기준값을 입력해 주세요.
          </p>
          <button onClick={goSettings} className="btn-navy shrink-0">
            기준값 입력
          </button>
        </div>
      )}

      {/* ── 일하는 방식 Before / After ── */}
      <section>
        <SectionTitle>도입 전 → 도입 후, 일하는 방식</SectionTitle>
        <BeforeAfterPanel />
      </section>

      {/* ── A. 업무 효율 ── */}
      <section id="efficiency">
        <SectionTitle action={<span className="pill bg-navy-100 text-navy-500">{summary.period.label}</span>}>
          A. 업무 효율
        </SectionTitle>
        {/* 1024px에서는 사이드바(344px) 때문에 3열이 지나치게 좁아져 2열로 둡니다 */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {efficiency.map((m) => (
            <MetricCard key={m.key} m={m} onSetBaseline={goSettings} />
          ))}
        </div>
      </section>

      {/* ── B. 자동화 ── */}
      <section id="automation">
        <SectionTitle action={<span className="pill bg-teal-50 text-teal-700">시스템 자동 측정</span>}>
          B. 자동화
        </SectionTitle>
        <div className="card p-5 sm:p-6">
          <div className="flex flex-wrap items-end gap-x-3 gap-y-4">
            <div className="min-w-0">
              <p className="t-muted font-bold">수거 입력</p>
              <p className="t-kpi mt-1 text-navy-900">
                {summary.collectionCount}
                <span className="ml-0.5 text-[0.62em] font-bold text-navy-400">건</span>
              </p>
            </div>
            <ArrowRight size={26} className="mb-3 shrink-0 text-navy-300" strokeWidth={2.8} />
            <div className="min-w-0">
              <p className="t-muted font-bold">자동 처리된 업무</p>
              <p className="t-kpi mt-1 text-teal-600">
                {summary.autoLink.total}
                <span className="ml-0.5 text-[0.62em] font-bold text-teal-500/70">건</span>
              </p>
            </div>
            <div className="min-w-0 sm:ml-6">
              <p className="t-muted font-bold">1건 입력당 자동 연결</p>
              <p className="t-kpi-sm mt-1 text-navy-900">
                {autoAvg == null ? <span className="text-navy-400">측정 중</span> : `${autoAvg}건`}
              </p>
            </div>
          </div>

          <div className="mt-4 border-t border-navy-50 pt-3">
            <button
              onClick={() => setAutoOpen((v) => !v)}
              className="flex w-full items-center gap-1.5 text-left text-[0.87rem] font-bold text-navy-400 transition hover:text-navy-600"
            >
              자동 연결 업무 내역
              <ChevronDown size={14} className={`transition-transform ${autoOpen ? 'rotate-180' : ''}`} />
            </button>
            {autoOpen &&
              (autoRows.length > 0 ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
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
              <p className="t-muted mt-3">
                각 항목은 실제 수거 입력 기록(감사기록)이 변경한 대상만 집계합니다. 추정치가 아닙니다.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ── C. 매출 확장 ── */}
      <section id="sales">
        <SectionTitle action={<span className="pill bg-teal-50 text-teal-700">담당자 기록 기준</span>}>
          C. 매출 확장 — 추천 → 제안 → 수락 → 실제 매출
        </SectionTitle>
        <SalesFunnelPanel data={data} />
      </section>

      {/* ── 심사용 요약 ── */}
      <section>
        <SectionTitle>정책자금 심사용 요약</SectionTitle>
        <div className="card p-5 sm:p-6">
          <div className="space-y-3">
            <p className="t-body leading-relaxed text-navy-700">
              <Zap size={17} className="mr-1.5 inline -translate-y-px text-teal-500" strokeWidth={2.6} />
              현장 수거정보를 한 번 입력하면 일정·수거이력·거래처·자재·통계·문서 초안에 자동 반영되어 반복 행정업무를
              줄입니다.
            </p>
            <p className="t-body leading-relaxed text-navy-700">
              <Zap size={17} className="mr-1.5 inline -translate-y-px text-teal-500" strokeWidth={2.6} />
              축적된 수거·자재·청구 데이터로 추가 수거·소모품·교육 필요를 <b>먼저 추천</b>하고, 실제 제안·수락·추가
              매출까지 기록해 데이터 기반 영업활동의 성과를 검증합니다.
            </p>
            <p className="t-body leading-relaxed text-navy-700">
              <Zap size={17} className="mr-1.5 inline -translate-y-px text-teal-500" strokeWidth={2.6} />
              도입 전 값은 운영 담당자가 입력한 기준값이며, 도입 후 값은 시스템이 실제 입력 기록에서 자동 측정합니다.
            </p>
          </div>
          <div className="mt-4 rounded-2xl bg-navy-50 px-4 py-3.5">
            <p className="t-body font-bold text-navy-700">
              {summary.ready.confirmed === summary.ready.total
                ? `측정지표 ${summary.ready.total}개 모두 확보 — 도입 전후 비교가 가능합니다.`
                : `현재 실증 중 — 측정지표 ${summary.ready.confirmed}/${summary.ready.total}개 확보. 나머지 지표는 기준값 입력 또는 사용 데이터 축적이 더 필요합니다.`}
            </p>
            <p className="t-muted mt-1.5">
              집계 대상: 수거 입력 {summary.collectionCount}건 · 자동 처리 {summary.autoLink.total}건 · 입력시간 표본{' '}
              {summary.duration.samples}건
              {summary.revertedCount > 0 && ` · 재입력 ${summary.revertedCount}건`} · 데이터 출처 {prov.label}
            </p>
          </div>
        </div>
      </section>
    </PageShell>
  )
}
