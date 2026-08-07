import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ChevronRight,
  AlertTriangle,
  AlertCircle,
  Circle,
  CheckCircle2,
  CalendarClock,
  ClipboardEdit,
  PlusCircle,
  Scale,
  type LucideIcon,
} from 'lucide-react'
import { useData } from '../context/DataContext'
import { PageShell, SectionTitle, KpiCard } from '../components/ui'
import { AutoLinkFlow } from '../components/AutoLinkFlow'
import { OpportunityPanel } from '../components/Opportunities'
import { ReportHighlight } from '../components/ReportHighlight'
import { TodayClients } from '../components/TodayClients'
import { AxSummaryCard } from '../components/AxSummary'
import { AxStoryStrip } from '../components/AxStory'
import { CustomerServiceCard } from '../components/CustomerService'
import { StartHere } from '../components/StartHere'
import { TourBanner } from '../components/TourEntry'
import { useAuth } from '../context/AuthContext'
import { monthlyCollected, outstandingTotal, schedulesOn } from '../lib/selectors'
import { todayChecklist, dispatchPlans, todayProgress, type CheckStatus } from '../lib/ops'
import { revenueOpportunities, clientMonthlyReport } from '../lib/insights'
import { prettyDate, today, weight, wonShort, thisMonth } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// 대시보드 — 핵심 3가지가 먼저 보이도록 구성
//  1) 한 번 입력, 여러 업무 자동 연결
//  2) 이번 달 추가 매출 기회 (데이터 기반 추천)
//  3) 병원 운영 리포트
//  4) 병원 고객이 직접 쓰는 서비스 (요청 → 처리 → 제안 → 수락)
//  그 외 운영 항목은 우선순위를 낮춰 하단에 배치합니다.
// ─────────────────────────────────────────────────────────────────────────────

const statusMeta: Record<CheckStatus, { icon: LucideIcon; color: string; chip: string }> = {
  긴급: { icon: AlertTriangle, color: 'text-rose-500', chip: 'bg-rose-50 text-rose-500' },
  주의: { icon: AlertCircle, color: 'text-amber-600', chip: 'bg-amber-50 text-amber-600' },
  정보: { icon: Circle, color: 'text-navy-500', chip: 'bg-navy-50 text-navy-500' },
  완료: { icon: CheckCircle2, color: 'text-emerald-600', chip: 'bg-emerald-50 text-emerald-600' },
}

export function Dashboard() {
  const { data } = useData()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const t = today()
  const month = thisMonth()

  const activePlans = dispatchPlans(data).filter((p) => p.stops.length > 0).length
  const progress = todayProgress(data)
  const outstanding = outstandingTotal(data)

  // 오늘 챙길 일 — 중요한 3건만 노출
  const checklist = todayChecklist(data)
  const topChecks = ['urgent', 'inspection', 'pending']
    .map((k) => checklist.find((c) => c.key === k))
    .filter((c): c is NonNullable<typeof c> => Boolean(c))

  const todayCollectedKg = schedulesOn(data, t)
    .filter((s) => s.status === '완료' && s.actualAmount != null)
    .reduce((sum, s) => sum + (s.actualAmount ?? 0), 0)
  const monthly = monthlyCollected(data)
  const monthTotalKg = monthly.의료폐기물 + monthly.일회용기저귀

  const opportunities = useMemo(() => revenueOpportunities(data, month), [data, month])
  const reports = useMemo(() => data.clients.map((c) => clientMonthlyReport(data, c, month)), [data, month])

  const vehiclePct = data.vehicles.length ? Math.round((activePlans / data.vehicles.length) * 100) : 0

  return (
    <PageShell>
      {/* 인사 */}
      <div>
        <h1 className="t-page text-navy-900">
          {profile ? `${profile.name}님, 오늘 운영 현황입니다` : '대표님 한눈에 보기'}
        </h1>
        <p className="t-body mt-2.5 font-medium text-navy-400">{prettyDate(t)} · 의료폐기물 운영관리</p>
      </div>

      {/* 처음 들어온 사용자에게만 보이는 안내 — 화면을 막지 않습니다 */}
      <TourBanner />

      {/* ── 이 시스템이 무엇을 하는지 — 데이터가 없어도 항상 읽히는 한 줄 흐름 ── */}
      <AxStoryStrip data={data} />

      {/* 실제 운영 전환 직후 — 무엇부터 해야 하는지 (다 끝나면 사라집니다) */}
      <StartHere data={data} />

      {/* ── 핵심 1 · 한 번 입력, 여러 업무 자동 연결 (내부 효율) ── */}
      <section>
        <SectionTitle
          action={<span className="pill bg-teal-50 text-teal-700">핵심 1 · 내부 효율</span>}
          hint="현장에서 수거 완료를 한 번만 입력하면 오른쪽 업무가 함께 처리됩니다. 옮겨 적을 필요가 없습니다."
        >
          한 번 입력, 여러 업무 자동 연결
        </SectionTitle>
        <AutoLinkFlow />
      </section>

      {/* ── 핵심 2 · 병원 고객 서비스 → 추가 매출 (이번 확장의 중심) ── */}
      <section>
        <SectionTitle
          action={<span className="pill bg-violet-50 text-violet-700">핵심 2 · 고객 서비스</span>}
          hint="병원이 포털에서 올린 요청이 여기로 들어오고, 처리 결과와 제안이 다시 병원 화면으로 갑니다."
        >
          병원이 직접 확인하고 요청합니다
        </SectionTitle>
        <CustomerServiceCard data={data} />
      </section>

      {/* ── 핵심 3·4 · 추가 매출 기회 / 병원 운영 리포트 ── */}
      {/* 두 카드가 같은 높이로 정렬되도록 섹션을 flex 컬럼으로 두고 카드가 남는 높이를 흡수 */}
      <div className="grid gap-4 lg:grid-cols-2 lg:gap-5">
        <section className="flex min-w-0 flex-col">
          <SectionTitle
            action={<span className="pill bg-accent-50 text-accent-700">핵심 3</span>}
            hint="쌓인 수거·자재 기록에서 다음에 제안할 것을 뽑습니다. 근거도 함께 보입니다."
          >
            데이터 기반 다음 행동 추천
          </SectionTitle>
          <div className="flex min-h-0 flex-1 flex-col">
            <OpportunityPanel summary={opportunities} />
          </div>
        </section>

        <section className="flex min-w-0 flex-col">
          <SectionTitle
            action={<span className="pill bg-sky-50 text-sky-700">핵심 4</span>}
            hint="병원에 매달 제공하는 운영 리포트입니다. 병원도 포털에서 같은 내용을 봅니다."
          >
            수거를 넘어 병원 운영지원으로
          </SectionTitle>
          <div className="flex min-h-0 flex-1 flex-col">
            <ReportHighlight reports={reports} />
          </div>
        </section>
      </div>

      {/* ══ 여기부터는 오늘 운영 — 핵심 3기능보다 시각적으로 한 단계 낮춥니다 ══ */}
      <div className="flex items-center gap-3 pt-2">
        <span className="t-label whitespace-nowrap text-navy-400">오늘 운영</span>
        <span className="h-px flex-1 bg-navy-200" />
        <button
          onClick={() => navigate('/collection')}
          className="t-btn flex shrink-0 items-center gap-1.5 rounded-xl bg-teal-500 px-4 py-2.5 text-white transition hover:bg-teal-600"
        >
          <PlusCircle size={18} strokeWidth={2.5} /> 수거 완료 입력
        </button>
      </div>

      {/* 오늘 한 줄 요약 — 예정/완료/입력 대기/이번 달 (중복 KPI 를 하나로 합쳤습니다) */}
      <div className="grid grid-cols-2 gap-3 lg:gap-4 xl:grid-cols-4">
        <KpiCard
          icon={CalendarClock}
          label="오늘 수거 예정"
          value={progress.planned}
          unit="건"
          tone="navy"
          onClick={() => navigate('/today')}
        />
        <KpiCard icon={CheckCircle2} label="수거 완료" value={progress.done} unit="건" tone="emerald" />
        <KpiCard
          icon={ClipboardEdit}
          label="입력 대기"
          value={progress.pendingInput}
          unit="건"
          tone={progress.pendingInput > 0 ? 'amber' : 'navy'}
          onClick={() => navigate('/today')}
        />
        <KpiCard
          icon={Scale}
          label="이번 달 수거량"
          value={weight(monthTotalKg)}
          tone="teal"
          hint={`오늘 ${weight(todayCollectedKg)}`}
          onClick={() => navigate('/stats')}
        />
      </div>

      {/* 오늘 거래처 + 챙길 일 — 나란히 두어 화면 길이를 줄였습니다 */}
      <div className="grid gap-4 lg:grid-cols-2 lg:gap-5">
        <section className="flex min-w-0 flex-col">
          <SectionTitle action={<span className="pill bg-navy-100 text-navy-500">오늘 일정 기준</span>}>
            오늘 거래처 운영 현황
          </SectionTitle>
          <TodayClients data={data} />
        </section>

        <section className="flex min-w-0 flex-col">
          <SectionTitle>오늘 챙길 일</SectionTitle>
          <div className="card flex min-h-0 flex-1 flex-col divide-y divide-navy-50">
            {topChecks.map((item) => {
              const m = statusMeta[item.status]
              const Icon = m.icon
              return (
                <Link
                  key={item.key}
                  to={item.to}
                  className="flex items-center gap-3.5 px-4 py-4 transition hover:bg-navy-50"
                >
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${m.chip}`}>
                    <Icon size={19} strokeWidth={2.4} />
                  </span>
                  <span className="min-w-0 flex-1 break-keep text-[1.15rem] font-bold leading-snug text-navy-700">
                    {item.label}
                  </span>
                  <span className={`shrink-0 whitespace-nowrap text-[1.15rem] font-extrabold ${m.color}`}>
                    {item.count}건
                  </span>
                  <ChevronRight size={18} className="shrink-0 text-navy-300" />
                </Link>
              )
            })}
            <div className="mt-auto grid grid-cols-2 divide-x divide-navy-50 border-t border-navy-50">
              <Link
                to="/receivables"
                className="flex items-center justify-center gap-1.5 py-4 text-[1.08rem] font-bold text-navy-600 transition hover:bg-navy-50"
              >
                미수금 {wonShort(outstanding)}
              </Link>
              <Link
                to="/dispatch"
                className="flex items-center justify-center gap-1.5 py-4 text-[1.08rem] font-bold text-navy-600 transition hover:bg-navy-50"
              >
                차량 가동 {vehiclePct}%
              </Link>
            </div>
          </div>
        </section>
      </div>

      {/* AX 도입 성과 — 자세한 측정은 성과 화면에 있으므로 여기서는 요약만 */}
      <section>
        <SectionTitle action={<span className="pill bg-accent-50 text-accent-700">실증</span>}>
          AX 도입 성과
        </SectionTitle>
        <AxSummaryCard data={data} compact />
      </section>

    </PageShell>
  )
}
