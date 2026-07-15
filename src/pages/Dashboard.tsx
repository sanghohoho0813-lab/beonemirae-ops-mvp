import { Link, useNavigate } from 'react-router-dom'
import {
  Sparkles,
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
  PlayCircle,
  type LucideIcon,
} from 'lucide-react'
import { useData } from '../context/DataContext'
import { PageShell, SectionTitle, MetricCard, FeatureCard, ExpandableSection } from '../components/ui'
import { todaySummary, additionalMaterialCount, monthlyCollected, outstandingTotal, schedulesOn } from '../lib/selectors'
import { todayChecklist, dispatchPlans, todayProgress, clientRequests, type CheckStatus } from '../lib/ops'
import { prettyDate, today, weight, wonShort } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// 대시보드 — 요약 + 기능 목차(관문). 세부는 각 화면으로 진입.
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

  const summary = todaySummary(data)
  const addMaterials = additionalMaterialCount(data)
  const confirmNeeded = data.payments.filter((p) => p.status === '확인필요').length
  const checklist = todayChecklist(data)
  // 오늘 놓치면 안 되는 현장 운영 항목 — 격리 긴급수거·인증실사·입력대기·자재 동시공급·처리장 인계
  const PRIMARY_KEYS = ['urgent', 'inspection', 'pending', 'sameday', 'handover']
  const primary = PRIMARY_KEYS.map((k) => checklist.find((c) => c.key === k)).filter((c): c is NonNullable<typeof c> => Boolean(c))
  const rest = checklist.filter((c) => !PRIMARY_KEYS.includes(c.key))
  const activePlans = dispatchPlans(data).filter((p) => p.stops.length > 0).length

  // KPI — 오늘 수거량 / 이번 달 수거량 / 미수금
  const todayCollectedKg = schedulesOn(data, t)
    .filter((s) => s.status === '완료' && s.actualAmount != null)
    .reduce((sum, s) => sum + (s.actualAmount ?? 0), 0)
  const monthly = monthlyCollected(data)
  const monthTotalKg = monthly.의료폐기물 + monthly.일회용기저귀
  const outstanding = outstandingTotal(data)
  const progress = todayProgress(data)
  const recentRequests = clientRequests(data).slice(0, 5)

  const features: { icon: LucideIcon; title: string; desc: string; to: string; badge?: string; tone: 'navy' | 'teal' | 'rose' | 'amber' }[] = [
    { icon: Truck, title: '배차·경로', desc: '차량별 배차·경로 추천', to: '/dispatch', badge: `${activePlans}대`, tone: 'teal' },
    { icon: CalendarClock, title: '오늘 일정', desc: '오늘 수거 일정 확인', to: '/today', badge: `${summary.total}건`, tone: 'navy' },
    { icon: Building2, title: '거래처 관리', desc: '병원·요양병원 등', to: '/clients', badge: `${data.clients.length}곳`, tone: 'navy' },
    { icon: PlusCircle, title: '수거 입력', desc: '현장에서 바로 입력', to: '/collection', tone: 'teal' },
    { icon: Boxes, title: '자재 관리', desc: '공급·소진 위험 확인', to: '/materials', badge: `${addMaterials}건`, tone: 'amber' },
    { icon: Wallet, title: '미수금 관리', desc: '청구·입금 현황', to: '/receivables', badge: `${confirmNeeded}건`, tone: 'amber' },
    { icon: PieChart, title: '통계', desc: '수거량·실적 요약', to: '/stats', tone: 'navy' },
    { icon: Sparkles, title: '심사관 시연', desc: '회사·특허·사업계획', to: '/demo', tone: 'teal' },
  ]

  return (
    <PageShell>
      {/* 인사 */}
      <div>
        <p className="text-[0.8125rem] font-medium text-navy-400">{prettyDate(t)} · 오늘의 운영 현황</p>
        <h1 className="mt-1 text-[1.625rem] font-extrabold leading-tight tracking-tight text-navy-900 lg:text-3xl">
          대표님 한눈에 보기
        </h1>
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {[`거래처 ${data.clients.length}곳`, `차량 ${data.vehicles.length}대`, '월 105톤'].map((chip) => (
            <span key={chip} className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-navy-500 shadow-card">
              {chip}
            </span>
          ))}
          {clientSet > 0 && <span className="text-[0.6875rem] font-medium text-navy-400">· 현재 시연 데이터 기준</span>}
        </div>
      </div>

      {/* 대표님 시연 시작 */}
      <button onClick={() => navigate('/presentation')} className="card pressable flex w-full items-center gap-3 p-4 text-left">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-teal-50">
          <PlayCircle size={22} strokeWidth={2.2} className="text-teal-600" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.9375rem] font-bold text-navy-900">대표님 시연 시작</p>
          <p className="truncate text-xs text-navy-400">현황 → 배차 → 거래처 → 수거대장 → 특허·사업계획</p>
        </div>
        <span className="shrink-0 whitespace-nowrap rounded-full bg-teal-500 px-3 py-1.5 text-xs font-bold text-white">3분 시연</span>
      </button>

      {/* 핵심 KPI — 오늘/이번 달 운영 지표 (숫자가 잘리지 않도록 최대 3열로 배치) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <MetricCard label="오늘 수거건수" value={summary.total} unit="건" tone="navy" size="lg" nowrap onClick={() => navigate('/today')} />
        <MetricCard label="오늘 수거량" value={weight(todayCollectedKg)} tone="teal" size="lg" nowrap />
        <MetricCard label="이번 달 수거량" value={weight(monthTotalKg)} tone="navy" size="lg" nowrap hint="목표 105톤" onClick={() => navigate('/stats')} />
        <MetricCard label="미수금" value={wonShort(outstanding)} tone="rose" size="lg" nowrap onClick={() => navigate('/receivables')} />
        <MetricCard label="차량 운행" value={`${activePlans}/${data.vehicles.length}`} unit="대" tone="navy" size="lg" nowrap onClick={() => navigate('/dispatch')} />
      </div>

      {/* 오늘 놓치면 안 되는 운영 항목 + 전체 보기 */}
      <section>
        <SectionTitle>오늘 놓치면 안 되는 운영 항목</SectionTitle>
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
      <section>
        <SectionTitle>오늘 업무 진행 현황</SectionTitle>
        <div className="card p-4 sm:p-5">
          <div className="grid grid-cols-5 gap-1.5 sm:gap-3">
            {[
              { n: '1', label: '일정 확인', v: progress.planned, u: '건' },
              { n: '2', label: '수거 진행', v: progress.inProgress, u: '건' },
              { n: '3', label: '수거 완료', v: progress.done, u: '건' },
              { n: '4', label: '처리장 인계', v: progress.handover, u: '곳' },
              { n: '5', label: '입력·정산', v: progress.pendingInput, u: '건' },
            ].map((step, i) => (
              <div key={step.n} className="relative flex flex-col items-center text-center">
                {i < 4 && <span aria-hidden className="absolute right-[-4px] top-4 hidden h-0.5 w-[calc(100%-2rem)] translate-x-1/2 bg-navy-100 sm:block" />}
                <span className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full bg-teal-50 text-[0.75rem] font-extrabold text-teal-600">{step.n}</span>
                <span className="mt-1.5 text-lg font-extrabold text-navy-900">{step.v}<span className="text-[0.6875rem] font-bold text-navy-300">{step.u}</span></span>
                <span className="text-[0.6875rem] font-semibold leading-tight text-navy-500">{step.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 최근 병원 요청 */}
      {recentRequests.length > 0 && (
        <section>
          <SectionTitle action={<span className="pill bg-navy-50 text-navy-500">MVP 검증 중</span>}>최근 병원 요청</SectionTitle>
          <div className="card divide-y divide-navy-100 p-1">
            {recentRequests.map((r) => (
              <button key={r.id} onClick={() => navigate(`/clients/${r.clientId}`)} className="pressable flex w-full items-center gap-3 p-3 text-left hover:bg-navy-50">
                <span className="shrink-0 rounded-lg bg-teal-50 px-2 py-0.5 text-[0.6875rem] font-bold text-teal-700">{r.type}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-navy-800">{r.clientName}</p>
                  <p className="truncate text-xs text-navy-400">{r.content}</p>
                </div>
                {r.urgent && <span className="shrink-0 rounded-lg bg-rose-50 px-2 py-0.5 text-[0.6875rem] font-bold text-rose-500">긴급</span>}
                <ChevronRight size={16} className="shrink-0 text-navy-300" />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* 기능 목차 */}
      <section>
        <SectionTitle>기능 바로가기</SectionTitle>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {features.map((f) => (
            <FeatureCard key={f.to} icon={f.icon} title={f.title} desc={f.desc} badge={f.badge} tone={f.tone} onClick={() => navigate(f.to)} />
          ))}
        </div>
      </section>

      {/* 기술개발/R&D 요약 (짧게) */}
      <Link
        to="/demo"
        className="pressable flex items-center gap-3 rounded-3xl bg-gradient-to-br from-navy-800 to-navy-900 p-4 text-white shadow-lg"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/10">
          <Lightbulb size={19} className="text-teal-300" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.9375rem] font-bold">기술개발 현황 · 특허출원</p>
          <p className="truncate text-[0.6875rem] text-navy-300">10-2026-0101187 · 데이터 기반 경로 최적화(개발 중)</p>
        </div>
        <span className="shrink-0 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-teal-200">시연용 요약</span>
      </Link>
    </PageShell>
  )
}
