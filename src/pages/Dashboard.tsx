import { Link, useNavigate } from 'react-router-dom'
import { Sparkles, ChevronRight, AlertTriangle, AlertCircle, Circle, CheckCircle2, type LucideIcon } from 'lucide-react'
import { useData } from '../context/DataContext'
import { StatusBadge, WasteBadge } from '../components/Badge'
import { InfoBanner } from '../components/InfoBanner'
import { CompanyOverview } from '../components/CompanyOverview'
import { RnDCard } from '../components/RnDCard'
import { SeparationNotice, IsolationCard, MaterialRiskCard } from '../components/ops'
import { Stagger, StaggerItem } from '../components/motion'
import { PageShell, SectionTitle, MetricCard } from '../components/ui'
import { monthlyCollected, outstandingTotal, todaySummary, additionalMaterialCount, vehicleTodaySummary } from '../lib/selectors'
import { todayChecklist, type CheckStatus } from '../lib/ops'
import { prettyDate, today, weight, won } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// 대시보드 — 모바일 앱 / 데스크톱 웹 대시보드 반응형
// ─────────────────────────────────────────────────────────────────────────────

const statusMeta: Record<CheckStatus, { icon: LucideIcon; color: string; chip: string }> = {
  긴급: { icon: AlertTriangle, color: 'text-rose-500', chip: 'bg-rose-50 text-rose-500' },
  주의: { icon: AlertCircle, color: 'text-amber-600', chip: 'bg-amber-50 text-amber-600' },
  정보: { icon: Circle, color: 'text-navy-500', chip: 'bg-navy-50 text-navy-500' },
  완료: { icon: CheckCircle2, color: 'text-emerald-600', chip: 'bg-emerald-50 text-emerald-600' },
}

export function Dashboard() {
  const { data, clientById } = useData()
  const navigate = useNavigate()
  const t = today()

  const summary = todaySummary(data)
  const monthly = monthlyCollected(data)
  const totalMonthly = monthly.의료폐기물 + monthly.일회용기저귀
  const outstanding = outstandingTotal(data)
  const addMaterials = additionalMaterialCount(data)
  const vehicles = vehicleTodaySummary(data)
  const checklist = todayChecklist(data)

  return (
    <PageShell>
      {/* 인사 + 시연용 요약 진입 */}
      <div className="lg:flex lg:items-end lg:justify-between lg:gap-4">
        <div>
          <p className="flex items-center gap-1 text-[13px] font-medium text-navy-400">
            📍 {prettyDate(t)} · 오늘의 운영 현황
          </p>
          <h1 className="mt-1 text-[26px] font-extrabold leading-tight tracking-tight text-navy-900 lg:text-3xl">
            대표님 한눈에 보기
          </h1>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {[`거래처 ${data.clients.length}곳`, `차량 ${data.vehicles.length}대`, '월평균 105톤'].map((chip) => (
              <span key={chip} className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-navy-500 shadow-card">
                {chip}
              </span>
            ))}
          </div>
        </div>

        <Link
          to="/demo"
          className="pressable mt-4 flex items-center gap-3 rounded-2xl bg-gradient-to-br from-navy-800 to-navy-900 px-4 py-3.5 text-white shadow-lg lg:mt-0 lg:w-80 lg:shrink-0"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10">
            <Sparkles size={18} className="text-teal-300" />
          </span>
          <div className="min-w-0">
            <p className="text-[15px] font-bold">시연용 핵심 요약</p>
            <p className="text-[11px] text-navy-300">회사 규모 · 수거 실적 · 기술개발/특허</p>
          </div>
          <ChevronRight size={18} className="ml-auto shrink-0 text-white/60" />
        </Link>
      </div>

      {/* 오늘 할 일 체크리스트 + 오늘 수거 현황 */}
      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        <section>
          <SectionTitle>오늘 할 일</SectionTitle>
          <div className="card p-2">
            {checklist.map((item) => {
              const m = statusMeta[item.status]
              const Icon = m.icon
              return (
                <Link key={item.key} to={item.to} className="pressable flex items-center gap-3 rounded-2xl px-3 py-2.5 hover:bg-navy-50">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${m.chip}`}>
                    <Icon size={16} strokeWidth={2.4} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-navy-700">{item.label}</span>
                  <span className={`shrink-0 whitespace-nowrap text-sm font-extrabold ${m.color}`}>{item.count}건</span>
                  <ChevronRight size={16} className="shrink-0 text-navy-300" />
                </Link>
              )
            })}
          </div>
        </section>

        <section>
          <SectionTitle>오늘 수거 현황</SectionTitle>
          <Stagger className="grid grid-cols-2 gap-3">
            <StaggerItem><MetricCard label="오늘 예정" value={summary.total} unit="건" tone="navy" size="lg" /></StaggerItem>
            <StaggerItem><MetricCard label="완료" value={summary.완료} unit="건" tone="emerald" size="lg" /></StaggerItem>
            <StaggerItem><MetricCard label="지연" value={summary.지연} unit="건" tone="amber" size="lg" /></StaggerItem>
            <StaggerItem><MetricCard label="긴급" value={summary.긴급} unit="건" tone="rose" size="lg" /></StaggerItem>
          </Stagger>
        </section>
      </div>

      {/* 이번 달 수거량 */}
      <section>
        <SectionTitle>이번 달 수거량</SectionTitle>
        <Stagger className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <StaggerItem><MetricCard label="의료폐기물" value={weight(monthly.의료폐기물)} tone="rose" size="lg" hint="누적 실수거량" /></StaggerItem>
          <StaggerItem><MetricCard label="일회용기저귀" value={weight(monthly.일회용기저귀)} tone="teal" size="lg" hint="누적 실수거량" /></StaggerItem>
          <StaggerItem><MetricCard label="총 수거량" value={weight(totalMonthly)} tone="navy" size="lg" hint="월평균 목표 105톤" /></StaggerItem>
        </Stagger>
      </section>

      {/* 분리 운행 + 격리/긴급 */}
      <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
        <section>
          <SectionTitle>분리 운행 필요</SectionTitle>
          <SeparationNotice />
        </section>
        <section>
          <SectionTitle>격리 / 긴급 수거</SectionTitle>
          <IsolationCard />
        </section>
      </div>

      {/* 정산·자재 + 자재 소진 위험 */}
      <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
        <section>
          <SectionTitle>정산 · 자재</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <MetricCard label="미수금 합계" value={won(outstanding)} tone="amber" hint="미수금 관리 →" onClick={() => navigate('/receivables')} />
            <MetricCard label="자재 추가요청" value={addMaterials} unit="건" tone="navy" hint="자재 관리 →" onClick={() => navigate('/materials')} />
          </div>
        </section>
        <section>
          <SectionTitle>자재 소진 위험</SectionTitle>
          <MaterialRiskCard />
        </section>
      </div>

      {/* 차량별 오늘 일정 */}
      <section>
        <SectionTitle action={<Link to="/dispatch" className="text-[13px] font-bold text-teal-600">배차·경로 →</Link>}>
          차량별 오늘 일정
        </SectionTitle>
        <Stagger className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:items-start">
          {vehicles.map(({ vehicle, total, done, items }) => (
            <StaggerItem key={vehicle.id}>
              <div className="card p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <WasteBadge type={vehicle.wasteType} />
                    <span className="truncate font-bold text-navy-800">{vehicle.name}</span>
                  </div>
                  <span className="shrink-0 whitespace-nowrap text-sm font-bold text-navy-500">{done}/{total}건</span>
                </div>
                {items.length === 0 ? (
                  <p className="mt-2 text-sm text-navy-300">오늘 배정된 일정이 없습니다.</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {items.map((s) => (
                      <li key={s.id} className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 font-medium text-navy-600">
                          <span className="tabular-nums text-navy-400">{s.scheduledTime}</span>
                          {clientById(s.clientId)?.name ?? '알 수 없음'}
                        </span>
                        <StatusBadge status={s.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* 회사 운영 규모 + 기술개발 현황 */}
      <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
        <section>
          <SectionTitle>회사 운영 규모</SectionTitle>
          <CompanyOverview />
        </section>
        <section>
          <SectionTitle>기술개발 현황</SectionTitle>
          <RnDCard />
        </section>
      </div>

      <InfoBanner />
    </PageShell>
  )
}
