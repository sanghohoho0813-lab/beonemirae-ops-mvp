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
  type LucideIcon,
} from 'lucide-react'
import { useData } from '../context/DataContext'
import { PageShell, SectionTitle, MetricCard, FeatureCard, ExpandableSection } from '../components/ui'
import { todaySummary, additionalMaterialCount } from '../lib/selectors'
import { todayChecklist, dispatchPlans, type CheckStatus } from '../lib/ops'
import { prettyDate, today } from '../lib/format'

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
  const { data } = useData()
  const navigate = useNavigate()
  const t = today()

  const summary = todaySummary(data)
  const addMaterials = additionalMaterialCount(data)
  const confirmNeeded = data.payments.filter((p) => p.status === '확인필요').length
  const checklist = todayChecklist(data)
  const primary = checklist.filter((c) => ['urgent', 'delay', 'unpaid'].includes(c.key))
  const rest = checklist.filter((c) => !['urgent', 'delay', 'unpaid'].includes(c.key))
  const activePlans = dispatchPlans(data).filter((p) => p.stops.length > 0).length

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
        <p className="text-[13px] font-medium text-navy-400">{prettyDate(t)} · 오늘의 운영 현황</p>
        <h1 className="mt-1 text-[26px] font-extrabold leading-tight tracking-tight text-navy-900 lg:text-3xl">
          대표님 한눈에 보기
        </h1>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {[`거래처 ${data.clients.length}곳`, `차량 ${data.vehicles.length}대`, '월 105톤'].map((chip) => (
            <span key={chip} className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-navy-500 shadow-card">
              {chip}
            </span>
          ))}
        </div>
      </div>

      {/* 핵심 요약 3 */}
      <div className="grid grid-cols-3 gap-3">
        <MetricCard label="오늘 수거 예정" value={summary.total} unit="건" tone="navy" size="lg" />
        <MetricCard label="확인 필요" value={confirmNeeded} unit="건" tone="amber" size="lg" />
        <MetricCard label="긴급·지연" value={summary.긴급 + summary.지연} unit="건" tone="rose" size="lg" />
      </div>

      {/* 오늘 먼저 확인할 일 (3) + 전체 보기 */}
      <section>
        <SectionTitle>오늘 먼저 확인할 일</SectionTitle>
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
          <p className="text-[15px] font-bold">기술개발 현황 · 특허출원</p>
          <p className="truncate text-[11px] text-navy-300">10-2026-0101187 · 데이터 기반 경로 최적화(개발 중)</p>
        </div>
        <span className="shrink-0 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-teal-200">시연용 요약</span>
      </Link>
    </PageShell>
  )
}
