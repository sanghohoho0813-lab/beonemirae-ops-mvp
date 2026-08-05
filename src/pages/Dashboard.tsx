import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ChevronRight,
  AlertTriangle,
  AlertCircle,
  Circle,
  CheckCircle2,
  Truck,
  CalendarClock,
  Building2,
  PlusCircle,
  Boxes,
  Wallet,
  PieChart,
  Lightbulb,
  Package,
  Scale,
  Target,
  ShieldCheck,
  FileBarChart,
  type LucideIcon,
} from 'lucide-react'
import { useData } from '../context/DataContext'
import { PageShell, SectionTitle, KpiCard, ProgressStat, FeatureCard, ExpandableSection } from '../components/ui'
import { AutoLinkFlow } from '../components/AutoLinkFlow'
import { OpportunityPanel } from '../components/Opportunities'
import { todaySummary, additionalMaterialCount, monthlyCollected, outstandingTotal, schedulesOn } from '../lib/selectors'
import { todayChecklist, dispatchPlans, todayProgress, clientRequests, type CheckStatus } from '../lib/ops'
import { revenueOpportunities } from '../lib/insights'
import { prettyDate, today, weight, wonShort, thisMonth } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// 대시보드 — 대표가 한눈에 보는 운영 현황
//  1) 오늘 핵심 KPI
//  2) 한 번 입력 → 여러 업무 자동 연결 (제품 대표 기능)
//  3) 데이터 기반 추가 매출 기회 (다음 행동 추천)
//  4) 오늘 운영 항목 · 진행 현황 · 주요 지표
// ─────────────────────────────────────────────────────────────────────────────

const statusMeta: Record<CheckStatus, { icon: LucideIcon; color: string; chip: string }> = {
  긴급: { icon: AlertTriangle, color: 'text-rose-500', chip: 'bg-rose-50 text-rose-500' },
  주의: { icon: AlertCircle, color: 'text-amber-600', chip: 'bg-amber-50 text-amber-600' },
  정보: { icon: Circle, color: 'text-navy-500', chip: 'bg-navy-50 text-navy-500' },
  완료: { icon: CheckCircle2, color: 'text-emerald-600', chip: 'bg-emerald-50 text-emerald-600' },
}

function ChecklistRow({ item }: { item: ReturnType<typeof todayChecklist>[number] }) {
  const m = statusMeta[item.status]
  const Icon = m.icon
  return (
    <Link to={item.to} className="pressable flex items-center gap-3 rounded-2xl px-3 py-2.5 hover:bg-navy-50">
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${m.chip}`}>
        <Icon size={16} strokeWidth={2.4} />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-bold text-navy-700">{item.label}</span>
      <span className={`shrink-0 whitespace-nowrap text-sm font-extrabold ${m.color}`}>{item.count}건</span>
      <ChevronRight size={16} className="shrink-0 text-navy-300" />
    </Link>
  )
}

export function Dashboard() {
  const { data, clientSet } = useData()
  const navigate = useNavigate()
  const t = today()
  const month = thisMonth()

  const summary = todaySummary(data)
  const addMaterials = additionalMaterialCount(data)
  const confirmNeeded = data.payments.filter((p) => p.status === '확인필요').length
  const checklist = todayChecklist(data)
  const PRIMARY_KEYS = ['urgent', 'inspection', 'pending', 'sameday', 'handover']
  const primary = PRIMARY_KEYS.map((k) => checklist.find((c) => c.key === k)).filter(
    (c): c is NonNullable<typeof c> => Boolean(c),
  )
  const rest = checklist.filter((c) => !PRIMARY_KEYS.includes(c.key))
  const activePlans = dispatchPlans(data).filter((p) => p.stops.length > 0).length

  // KPI
  const todayCollectedKg = schedulesOn(data, t)
    .filter((s) => s.status === '완료' && s.actualAmount != null)
    .reduce((sum, s) => sum + (s.actualAmount ?? 0), 0)
  const monthly = monthlyCollected(data)
  const monthTotalKg = monthly.의료폐기물 + monthly.일회용기저귀
  const outstanding = outstandingTotal(data)
  const progress = todayProgress(data)
  const recentRequests = clientRequests(data).slice(0, 5)

  // 데이터 기반 추천 (거래처가 많아도 렌더마다 재계산하지 않도록 메모)
  const opportunities = useMemo(() => revenueOpportunities(data, month), [data, month])

  // 주요 운영 지표 (이번 달)
  const MONTH_TARGET_KG = 105_000
  const MONTH_TARGET_COUNT = 300
  const monthCount = data.schedules.filter((s) => s.date.startsWith(month) && s.status === '완료').length
  const billedTotal = data.payments.filter((p) => p.billingMonth === month).reduce((s, p) => s + p.amount, 0)
  const kgPct = Math.round((monthTotalKg / MONTH_TARGET_KG) * 100)
  const countPct = Math.round((monthCount / MONTH_TARGET_COUNT) * 100)
  const unpaidPct = billedTotal > 0 ? Math.round((outstanding / billedTotal) * 100) : 0
  const vehiclePct = data.vehicles.length ? Math.round((activePlans / data.vehicles.length) * 100) : 0

  const features: { icon: LucideIcon; title: string; desc: string; to: string; badge?: string; tone: 'navy' | 'teal' | 'rose' | 'amber' }[] = [
    { icon: CalendarClock, title: '오늘 일정', desc: '오늘 수거 일정 확인', to: '/today', badge: `${summary.total}건`, tone: 'navy' },
    { icon: PlusCircle, title: '수거 입력', desc: '현장에서 바로 입력', to: '/collection', tone: 'teal' },
    { icon: Building2, title: '거래처 관리', desc: '병원별 추천·이력', to: '/clients', badge: `${data.clients.length}곳`, tone: 'navy' },
    { icon: FileBarChart, title: '운영 리포트', desc: '병원별 월간 리포트', to: '/reports', tone: 'teal' },
    { icon: Truck, title: '배차·경로', desc: '차량별 배차 추천', to: '/dispatch', badge: `${activePlans}대`, tone: 'navy' },
    { icon: Boxes, title: '자재 관리', desc: '공급·소진 위험 확인', to: '/materials', badge: `${addMaterials}건`, tone: 'amber' },
    { icon: Wallet, title: '미수금 관리', desc: '청구·입금 현황', to: '/receivables', badge: `${confirmNeeded}건`, tone: 'amber' },
    { icon: PieChart, title: '통계', desc: '수거량·실적 요약', to: '/stats', tone: 'navy' },
  ]

  return (
    <PageShell>
      {/* 인사 */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[1.625rem] font-extrabold leading-tight tracking-tight text-navy-900 lg:text-3xl">
            대표님 한눈에 보기
          </h1>
          <p className="mt-1.5 text-[0.9375rem] font-medium text-navy-400">{prettyDate(t)} · 오늘의 운영 현황</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {[`거래처 ${data.clients.length}곳`, `차량 ${data.vehicles.length}대`, '월 105톤'].map((chip) => (
            <span key={chip} className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-navy-500 shadow-card">
              {chip}
            </span>
          ))}
          {clientSet > 0 && <span className="text-[0.6875rem] font-medium text-navy-400">· 현재 시연 데이터 기준</span>}
        </div>
      </div>

      {/* 핵심 KPI */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiCard
          icon={Package}
          label="오늘 수거건수"
          value={summary.total}
          unit="건"
          tone="navy"
          hint={`완료 ${summary.완료}건 · 예정 ${summary.예정}건`}
          onClick={() => navigate('/today')}
        />
        <KpiCard icon={Scale} label="오늘 수거량" value={weight(todayCollectedKg)} tone="teal" hint="현장 입력 기준" />
        <KpiCard
          icon={Target}
          label="이번 달 수거량"
          value={weight(monthTotalKg)}
          tone="navy"
          hint={`목표 105톤의 ${kgPct}%`}
          onClick={() => navigate('/stats')}
        />
        <KpiCard
          icon={Wallet}
          label="미수금"
          value={wonShort(outstanding)}
          tone="rose"
          hint={`확인 필요 ${confirmNeeded}건`}
          onClick={() => navigate('/receivables')}
        />
        <KpiCard
          icon={Truck}
          label="차량 운행"
          value={`${activePlans}/${data.vehicles.length}`}
          unit="대"
          tone="navy"
          hint={`운행률 ${vehiclePct}%`}
          onClick={() => navigate('/dispatch')}
        />
      </div>

      {/* 한 번 입력 → 여러 업무 자동 연결 (대표 기능) */}
      <section>
        <SectionTitle action={<span className="pill bg-teal-50 text-teal-700">현재 운영 중</span>}>
          한 번 입력, 여러 업무 자동 연결
        </SectionTitle>
        <AutoLinkFlow />
      </section>

      {/* 데이터 기반 추가 매출 기회 */}
      <section>
        <SectionTitle
          action={
            <span className="pill bg-navy-50 text-navy-500">
              {opportunities.watchCount > 0 ? `관리 필요 ${opportunities.watchCount}건` : '데이터 기반 추천'}
            </span>
          }
        >
          이번 달 추가 매출 기회
        </SectionTitle>
        <OpportunityPanel summary={opportunities} />
        <p className="mt-2 px-1 text-xs leading-snug text-navy-400">
          축적된 수거·자재·청구 데이터를 규칙에 대입해 도출한 추천입니다. 금액은 실제 청구 단가 기준의 예상 값이며 확정
          매출이 아닙니다.
        </p>
      </section>

      {/* 오늘 운영 3분할 */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* 오늘 놓치면 안 되는 항목 */}
        <section className="min-w-0">
          <SectionTitle>오늘 놓치면 안 되는 항목</SectionTitle>
          <div className="card space-y-1 p-2">
            {primary.map((item) => (
              <ChecklistRow key={item.key} item={item} />
            ))}
            <div className="px-1 pt-1">
              <ExpandableSection label="전체 할 일 보기" openLabel="접기">
                <div className="space-y-1">
                  {rest.map((item) => (
                    <ChecklistRow key={item.key} item={item} />
                  ))}
                </div>
              </ExpandableSection>
            </div>
          </div>
        </section>

        {/* 오늘 업무 진행 현황 */}
        <section className="min-w-0">
          <SectionTitle>오늘 업무 진행 현황</SectionTitle>
          <div className="card p-4 sm:p-5">
            <div className="grid grid-cols-5 gap-1.5">
              {[
                { n: '1', label: '일정 확인', v: progress.planned, u: '건' },
                { n: '2', label: '수거 진행', v: progress.inProgress, u: '건' },
                { n: '3', label: '수거 완료', v: progress.done, u: '건' },
                { n: '4', label: '처리장 인계', v: progress.handover, u: '곳' },
                { n: '5', label: '입력·정산', v: progress.pendingInput, u: '건' },
              ].map((step, i) => (
                <div key={step.n} className="relative flex flex-col items-center text-center">
                  {i < 4 && (
                    <span
                      aria-hidden
                      className="absolute right-[-4px] top-4 hidden h-0.5 w-[calc(100%-2rem)] translate-x-1/2 bg-navy-100 sm:block"
                    />
                  )}
                  <span className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full bg-teal-50 text-[0.75rem] font-extrabold text-teal-600">
                    {step.n}
                  </span>
                  <span className="mt-1.5 text-lg font-extrabold text-navy-900">
                    {step.v}
                    <span className="text-[0.6875rem] font-bold text-navy-300">{step.u}</span>
                  </span>
                  <span className="text-[0.6875rem] font-semibold leading-tight text-navy-500">{step.label}</span>
                </div>
              ))}
            </div>
            <button onClick={() => navigate('/collection')} className="btn-primary mt-4 w-full">
              <PlusCircle size={17} strokeWidth={2.4} /> 수거 완료 입력하기
            </button>
          </div>
        </section>

        {/* 주요 운영 지표 */}
        <section className="min-w-0">
          <SectionTitle action={<span className="pill bg-navy-50 text-navy-500">이번 달</span>}>주요 운영 지표</SectionTitle>
          <div className="card space-y-4 p-4 sm:p-5">
            <ProgressStat
              icon={Scale}
              label="수거량 달성률"
              percent={kgPct}
              detail={`${(monthTotalKg / 1000).toFixed(1)} / 105톤`}
              tone="teal"
            />
            <ProgressStat
              icon={Package}
              label="수거건수 달성률"
              percent={countPct}
              detail={`${monthCount} / ${MONTH_TARGET_COUNT}건`}
              tone="navy"
            />
            <ProgressStat
              icon={Wallet}
              label="미수금 비율"
              percent={unpaidPct}
              detail={`${wonShort(outstanding)} / ${wonShort(billedTotal)}`}
              tone="rose"
            />
            <ProgressStat
              icon={Truck}
              label="차량 가동률"
              percent={vehiclePct}
              detail={`${activePlans} / ${data.vehicles.length}대`}
              tone="navy"
            />
            <div className="flex items-center gap-2.5 rounded-2xl bg-emerald-50 px-3.5 py-3">
              <ShieldCheck size={18} className="shrink-0 text-emerald-600" strokeWidth={2.3} />
              <div className="min-w-0 flex-1">
                <p className="text-[0.8125rem] font-bold text-emerald-700">컴플라이언스 점검</p>
                <p className="truncate text-[0.6875rem] text-emerald-600">보관기한·인계 상태 정상</p>
              </div>
              <span className="pill shrink-0 bg-white text-emerald-600">정상</span>
            </div>
          </div>
        </section>
      </div>

      {/* 최근 병원 요청 */}
      {recentRequests.length > 0 && (
        <section>
          <SectionTitle action={<span className="pill bg-navy-50 text-navy-500">전화·카톡 접수 기록</span>}>
            최근 병원 요청 현황
          </SectionTitle>
          <div className="card divide-y divide-navy-100 p-1">
            {recentRequests.map((r) => (
              <button
                key={r.id}
                onClick={() => navigate(`/clients/${r.clientId}`)}
                className="pressable flex w-full items-center gap-3 p-3 text-left hover:bg-navy-50"
              >
                <span className="shrink-0 rounded-lg bg-teal-50 px-2 py-0.5 text-[0.6875rem] font-bold text-teal-700">
                  {r.type}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-navy-800">{r.clientName}</p>
                  <p className="truncate text-xs text-navy-400">{r.content}</p>
                </div>
                {r.urgent && (
                  <span className="shrink-0 rounded-lg bg-rose-50 px-2 py-0.5 text-[0.6875rem] font-bold text-rose-500">
                    긴급
                  </span>
                )}
                <ChevronRight size={16} className="shrink-0 text-navy-300" />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* 기능 바로가기 */}
      <section>
        <SectionTitle>기능 바로가기</SectionTitle>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {features.map((f) => (
            <FeatureCard
              key={f.to}
              icon={f.icon}
              title={f.title}
              desc={f.desc}
              badge={f.badge}
              tone={f.tone}
              onClick={() => navigate(f.to)}
            />
          ))}
        </div>
      </section>

      {/* 확장 방향 */}
      <Link
        to="/roadmap"
        className="pressable flex items-center gap-3 rounded-3xl bg-gradient-to-br from-navy-800 to-navy-900 p-4 text-white shadow-lg"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/10">
          <Lightbulb size={19} className="text-teal-300" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.9375rem] font-bold">데이터 기반 병원 운영지원으로 확장</p>
          <p className="truncate text-[0.6875rem] text-navy-300">
            수거 데이터 축적 → 다음 행동 추천 → 병원 운영지원 서비스 · 특허출원 10-2026-0101187
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-teal-200">활용 계획</span>
      </Link>
    </PageShell>
  )
}
