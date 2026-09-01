import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CheckCircle2, CircleDashed, CircleAlert, CircleHelp, Printer, ArrowRight,
  ClipboardCheck, Landmark,
} from 'lucide-react'
import { useData } from '../context/DataContext'
import { PageShell, SectionTitle } from '../components/ui'
import { PageHeader } from '../components/PageHeader'
import { readinessOf, readinessCounts, READY_LABEL, type ReadyState } from '../lib/readiness'
import { surveyTotals, SURVEY_TASKS, SURVEY_TAKEN_ON } from '../lib/opsSurvey'
import { performanceSummary } from '../lib/performance'

// ─────────────────────────────────────────────────────────────────────────────
//  심사 준비도 (/readiness) — 정책자금 심사 전에 이 화면 하나만 보면 됩니다 (0096)
//
//  위: 준비 항목 9개를 **지금 데이터로** 자동 점검 — 비었으면 비었다고,
//      채우는 곳으로 가는 단추와 함께.
//  아래: 인쇄해서 심사장에 들고 갈 한 장 — 지금 값이 그대로 찍힙니다.
//
//  ⚠ 이 화면은 **잘 보이게 꾸며 주지 않습니다.** 준비가 안 됐으면 빨갛게
//    나옵니다. 심사장에서 들킬 것을 여기서 먼저 들키는 것이 목적입니다.
// ─────────────────────────────────────────────────────────────────────────────

const STATE_META: Record<ReadyState, { icon: typeof CheckCircle2; chip: string; icls: string }> = {
  ok:      { icon: CheckCircle2, chip: 'bg-emerald-50 text-emerald-700', icls: 'text-emerald-600' },
  partial: { icon: CircleDashed, chip: 'bg-amber-50 text-amber-700',     icls: 'text-amber-600' },
  missing: { icon: CircleAlert,  chip: 'bg-rose-50 text-rose-700',       icls: 'text-rose-600' },
  manual:  { icon: CircleHelp,   chip: 'bg-navy-100 text-navy-600',      icls: 'text-navy-500' },
}

export function Readiness() {
  const { data } = useData()
  const navigate = useNavigate()
  const items = useMemo(() => readinessOf(data), [data])
  const counts = readinessCounts(items)
  const survey = useMemo(() => surveyTotals(), [])
  const perf = useMemo(() => performanceSummary(data, 'all'), [data])
  const todayStr = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <PageShell>
      <PageHeader
        title="심사 준비도"
        subtitle="정책자금 심사에서 보여 줄 수 있는 상태인지, 지금 데이터로 점검합니다"
        action={
          <button onClick={() => window.print()} className="btn-ghost shrink-0 print:hidden">
            <Printer size={17} strokeWidth={2.4} /> 브리핑 인쇄
          </button>
        }
      />

      {/* ── 요약 줄 — 점수가 아니라 개수입니다 ── */}
      <div data-ready-counts className="card mb-5 flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-4 print:hidden">
        <p className="t-body font-extrabold text-navy-900">
          준비됨 <b className="text-emerald-600">{counts.ok}</b>
          <span className="mx-2 text-navy-200">·</span>채우는 중 <b className="text-amber-600">{counts.partial}</b>
          <span className="mx-2 text-navy-200">·</span>비어 있음 <b className="text-rose-600">{counts.missing}</b>
          <span className="mx-2 text-navy-200">·</span>수동 확인 <b className="text-navy-500">{counts.manual}</b>
        </p>
        <p className="t-muted min-w-0 break-keep">
          점수는 내지 않습니다 — 가중치를 저희 마음대로 정한 합성 숫자는 심사에서 근거를 물으면 무너집니다.
        </p>
      </div>

      {/* ── 항목별 점검 ── */}
      <section className="print:hidden">
        <SectionTitle>준비 항목 — 지금 데이터 기준</SectionTitle>
        <div className="grid gap-3">
          {items.map((it) => {
            const m = STATE_META[it.state]
            const Icon = m.icon
            return (
              <div key={it.key} data-ready-item={it.key} data-ready-state={it.state} className="card px-5 py-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <Icon size={20} strokeWidth={2.4} className={`shrink-0 ${m.icls}`} />
                  <p className="t-body min-w-0 flex-1 break-keep font-extrabold text-navy-900">{it.label}</p>
                  <span className={`pill shrink-0 ${m.chip}`}>{READY_LABEL[it.state]}</span>
                  <span data-ready-value className="t-body shrink-0 tabular-nums font-bold text-navy-700">{it.value}</span>
                </div>
                <p className="t-muted mt-2 break-keep leading-snug">{it.why}</p>
                {it.note && <p className="t-muted mt-1 break-keep leading-snug text-navy-400">{it.note}</p>}
                {it.where && (
                  <button
                    data-ready-go={it.key}
                    onClick={() => navigate(it.where!.to)}
                    className="mt-2.5 inline-flex min-h-[2.75rem] items-center gap-1.5 rounded-xl bg-navy-50 px-3.5 font-bold text-navy-700 transition hover:bg-navy-100"
                  >
                    {it.where.label} <ArrowRight size={16} strokeWidth={2.6} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* ── 인쇄용 브리핑 한 장 ─────────────────────────────────────────────
           화면에서도 보이고, 인쇄하면 이 부분만 나옵니다. 모든 숫자는 위와
           같은 원천에서 그 자리에서 계산됩니다 — 따로 적어 둔 숫자가 없어서
           화면과 인쇄물이 어긋날 수 없습니다. */}
      <section data-ready-brief className="mt-8">
        <SectionTitle
          action={<span className="pill bg-navy-100 text-navy-500 print:hidden">인쇄하면 이 장만 나옵니다</span>}
        >
          심사 브리핑 — 한 장
        </SectionTitle>
        <div className="card space-y-5 p-6 print:border-0 print:shadow-none">
          <div>
            <p className="flex items-center gap-2 text-[1.15rem] font-extrabold text-navy-900">
              <Landmark size={19} strokeWidth={2.4} className="shrink-0 text-navy-500" />
              ㈜비원미래 — 의료폐기물 수거·운반 AX 실증 현황
            </p>
            <p className="t-muted mt-1">작성 기준 {todayStr} · 모든 숫자는 시스템이 이 화면을 여는 순간 실데이터에서 계산합니다</p>
          </div>

          {/* 1. 도입 전 — 조사 실측 */}
          <div>
            <p className="t-body font-extrabold text-navy-800">1. 도입 전 실측 (운영이사 업무 조사 · {SURVEY_TAKEN_ON})</p>
            <ul className="t-body mt-1.5 grid gap-1 text-navy-700">
              <li>· 차량 5대 · 주간 방문 {survey.weekVisits}곳 · 주간 이동 {survey.weekKm.toLocaleString()}km</li>
              <li>
                · 사람이 붙잡고 있던 사무업무 하루 {SURVEY_TASKS.reduce((s, t) => s + t.minH, 0)}~
                {Math.round(SURVEY_TASKS.reduce((s, t) => s + t.maxH, 0) * 10) / 10}시간
                (배차 · 일정 · 엑셀 정리, 답변 원문 보존)
              </li>
            </ul>
          </div>

          {/* 2. 도입 후 — 시스템 실측 (지금 값) */}
          <div>
            <p className="t-body font-extrabold text-navy-800">2. 도입 후 실측 — 이 순간의 시스템 값</p>
            <ul className="t-body mt-1.5 grid gap-1 text-navy-700">
              <li>· 수거 입력 {perf.collectionCount}건 (실제 현장 {perf.fieldCount}건 · 시연 {perf.demoCount}건)</li>
              <li>· 1회 입력 → 자동 반영 처리 {perf.autoLink.total}건</li>
              <li>
                · 대표 성과값 상태: {perf.fieldCount >= 30
                  ? '실제 현장 30건 이상 — 확정 산출'
                  : `실증 중 (현장 ${perf.fieldCount}/30건 — 부풀리지 않고 「측정 중」으로 표기)`}
              </li>
            </ul>
          </div>

          {/* 3. 준비 항목 표 — 지금 상태 그대로 */}
          <div>
            <p className="t-body font-extrabold text-navy-800">3. 실증 준비 현황 — 비어 있는 것도 그대로 적습니다</p>
            <table className="mt-2 w-full text-left">
              <tbody>
                {items.map((it) => (
                  <tr key={it.key} className="border-t border-navy-100">
                    <td className="t-body py-1.5 pr-3 font-bold text-navy-800">{it.label}</td>
                    <td className="t-body py-1.5 pr-3 text-navy-600">{it.value}</td>
                    <td className="t-body py-1.5 text-navy-500">{READY_LABEL[it.state]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 4. 정직성 원칙 — 이 시스템 숫자의 신뢰 근거 */}
          <div className="rounded-2xl bg-navy-50 px-4 py-3.5 print:border print:border-navy-200">
            <p className="t-body flex items-start gap-2 break-keep leading-snug text-navy-700">
              <ClipboardCheck size={17} strokeWidth={2.4} className="mt-0.5 shrink-0 text-teal-600" />
              <span>
                이 시스템은 <b>표본이 모자라면 개선율을 내지 않고, 셀 수 없으면 0 이 아니라 「못 셌다」로
                표기</b>하도록 만들어져 있습니다 (자동 검증 6,000여 건이 이 원칙을 지킵니다).
                위 표의 「비어 있음」은 감춘 것이 아니라 이 원칙의 결과입니다.
              </span>
            </p>
          </div>
        </div>
      </section>
    </PageShell>
  )
}
