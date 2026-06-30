import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Sparkles, Smartphone, Route, Target, AlertTriangle, Layers } from 'lucide-react'
import { useData } from '../context/DataContext'
import { WasteBadge } from '../components/Badge'
import { CompanyOverview } from '../components/CompanyOverview'
import {
  SeparationNotice,
  VehicleFleetCard,
  FacilityCard,
  PatentMappingCard,
  BusinessPlanCard,
  OfficeSavingsCard,
  SelfCheckCard,
  FuturePlanCard,
} from '../components/ops'
import { PageShell, SectionTitle, MetricCard, SectionTabs, ExpandableSection } from '../components/ui'
import { dispatchPlans } from '../lib/ops'
import { monthlyCollected } from '../lib/selectors'
import { weight } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// 시연용 핵심 요약 (/demo) — 벤처기업확인 현장실사 시연 순서
//  회사규모 → 현장문제 → 개발중 시스템 → 배차시뮬 → 특허매핑 → 사업계획정합성
//  → 사무업무 개선 → 향후 고도화 → 현장실사 셀프체크
// ─────────────────────────────────────────────────────────────────────────────

const FIELD_PROBLEMS = [
  '병원·요양병원별 수거주기 차이',
  '자재(박스·비닐·바늘통) 추가요청 수시 발생',
  '격리의료폐기물 보관기한(1주일) 및 긴급수거 대응',
  '의료폐기물 / 일회용기저귀 분리 운행 (차량·처리장·지자체 분리)',
]

const SYSTEM_SCOPE = [
  '거래처·수거조건·차량·처리장·수거이력 통합관리',
  '권역·수거량·보관기한 기반 배차·경로 추천 시뮬레이션 (개발 중)',
  '수거대장·자재공급·미수금을 운영관리 보조기능으로 통합',
]

export function DemoSummary() {
  const navigate = useNavigate()
  const { data } = useData()
  const monthly = monthlyCollected(data)
  const total = monthly.의료폐기물 + monthly.일회용기저귀
  const plans = dispatchPlans(data).filter((p) => p.stops.length > 0).slice(0, 2)

  return (
    <PageShell>
      {/* 상단 바 */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => navigate('/')}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-navy-500 shadow-card transition active:scale-95"
          aria-label="뒤로"
        >
          <ArrowLeft size={18} />
        </button>
        <span className="text-sm font-bold text-navy-500">시연용 핵심 요약</span>
        <button
          onClick={() => navigate('/mobile-preview')}
          className="ml-auto hidden items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-sm font-bold text-navy-600 shadow-card transition hover:bg-navy-50 lg:inline-flex"
        >
          <Smartphone size={16} /> 모바일 프레임으로 보기
        </button>
      </div>

      {/* 심사관 시연 흐름 stepper */}
      <SectionTabs
        items={[
          { id: 'step-1', label: '회사 규모' },
          { id: 'step-2', label: '현장 문제' },
          { id: 'step-3', label: '개발 중 시스템' },
          { id: 'step-4', label: '배차 시뮬' },
          { id: 'step-5', label: '특허 매핑' },
          { id: 'step-6', label: '사업계획 정합성' },
          { id: 'step-7', label: '향후 고도화' },
        ]}
      />

      {/* 1. 회사 운영 규모 (히어로) */}
      <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-navy-800 to-navy-900 p-6 text-white shadow-lg">
        <div className="flex items-center gap-1.5 text-teal-300">
          <Sparkles size={16} />
          <span className="text-xs font-bold">beonemirae ops</span>
        </div>
        <h1 className="mt-3 text-2xl font-extrabold leading-tight tracking-tight">
          데이터 기반 의료폐기물
          <br />
          수거·운반 경로 최적화 및
          <br />
          통합 운영관리 시스템
        </h1>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {[`거래처 ${data.clients.length}곳`, `차량 ${data.vehicles.length}대`, '월평균 105톤'].map((c) => (
            <span key={c} className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white backdrop-blur">
              {c}
            </span>
          ))}
        </div>
      </div>

      <section id="step-1" className="scroll-mt-4">
        <SectionTitle>1. 회사 운영 규모</SectionTitle>
        <CompanyOverview />
      </section>

      {/* 2. 현장 문제 + 3. 개발 중인 시스템 */}
      <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
        <section id="step-2" className="scroll-mt-4">
          <SectionTitle>2. 현장 문제</SectionTitle>
          <div className="card p-5">
            <div className="flex items-center gap-2">
              <AlertTriangle size={18} className="text-amber-500" />
              <p className="text-[15px] font-bold text-navy-800">의료기관 폐기물 운영의 현장 과제</p>
            </div>
            <ul className="mt-3 space-y-1.5">
              {FIELD_PROBLEMS.map((p) => (
                <li key={p} className="flex gap-2 text-sm leading-snug text-navy-600">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-navy-300" />
                  {p}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="step-3" className="scroll-mt-4">
          <SectionTitle>3. 개발 중인 시스템</SectionTitle>
          <div className="card p-5">
            <div className="flex items-center gap-2">
              <Layers size={18} className="text-teal-600" />
              <p className="text-[15px] font-bold text-navy-800">통합 운영관리 시스템 (개발 중)</p>
            </div>
            <ul className="mt-3 space-y-1.5">
              {SYSTEM_SCOPE.map((p) => (
                <li key={p} className="flex gap-2 text-sm leading-snug text-navy-600">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-navy-300" />
                  {p}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>

      {/* 4. 배차·경로 추천 시뮬레이션 */}
      <section id="step-4" className="scroll-mt-4">
        <SectionTitle action={<button onClick={() => navigate('/dispatch')} className="text-[13px] font-bold text-teal-600">자세히 →</button>}>
          4. 배차·경로 추천 시뮬레이션
        </SectionTitle>
        <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
          {plans.map((p) => (
            <div key={p.vehicleId} className="card p-5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <WasteBadge type={p.wasteType} />
                  <span className="truncate font-bold text-navy-900">{p.vehicleName}</span>
                </div>
                <span className="shrink-0 text-lg font-extrabold text-teal-600">{p.loadRate}%</span>
              </div>
              <p className="mt-2 flex items-center gap-1.5 text-[13px] font-semibold text-navy-500">
                <Route size={14} /> 권장 순서
              </p>
              <p className="mt-1 text-sm font-medium text-navy-600">{p.routeLabels.join(' → ')}</p>
              <p className="mt-2 flex items-center gap-1.5 text-xs font-bold text-navy-500">
                <Target size={13} /> {p.facilityName} 인계 {p.handoverTime} · 예상 운행 {p.simDistanceKm}km (시뮬레이션)
              </p>
            </div>
          ))}
        </div>
        <div className="mt-3">
          <SeparationNotice />
        </div>
        <div className="mt-3">
          <ExpandableSection label="차량·처리장 정보 자세히 보기">
            <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
              <VehicleFleetCard />
              <FacilityCard />
            </div>
          </ExpandableSection>
        </div>
      </section>

      {/* 5. 특허 구성요소 매핑 */}
      <section id="step-5" className="scroll-mt-4">
        <SectionTitle>5. 특허 구성요소 매핑</SectionTitle>
        <p className="mb-2 px-1 text-sm text-navy-500">의료폐기물 수거·운반 경로 최적화 시스템 · 10-2026-0101187</p>
        <ExpandableSection label="구성요소 ↔ 앱 기능 매핑 보기">
          <PatentMappingCard />
        </ExpandableSection>
      </section>

      {/* 6. 사업계획서 정합성 */}
      <section id="step-6" className="scroll-mt-4">
        <SectionTitle>6. 사업계획서와 MVP 정합성</SectionTitle>
        <ExpandableSection label="사업계획 방향 ↔ 앱 기능 보기">
          <BusinessPlanCard />
        </ExpandableSection>
      </section>

      {/* 7. 사무업무 개선 + 이번 달 실적 */}
      <section>
        <SectionTitle>7. 실제 사무업무 개선 포인트</SectionTitle>
        <div className="grid grid-cols-3 gap-3">
          <MetricCard label="의료폐기물" value={weight(monthly.의료폐기물)} tone="rose" />
          <MetricCard label="일회용기저귀" value={weight(monthly.일회용기저귀)} tone="teal" />
          <MetricCard label="총 수거량" value={weight(total)} tone="navy" />
        </div>
        <div className="mt-3">
          <OfficeSavingsCard />
        </div>
      </section>

      {/* 8. 향후 고도화 + 현장실사 셀프체크 */}
      <section id="step-7" className="scroll-mt-4">
        <SectionTitle>8. 향후 고도화</SectionTitle>
        <FuturePlanCard />
      </section>

      <section>
        <SectionTitle>현장실사 셀프 체크</SectionTitle>
        <SelfCheckCard />
      </section>

      <p className="pb-2 text-center text-xs text-navy-300">
        데이터 기반 의료폐기물 수거·운반 운영관리 시스템 · ㈜비원미래
      </p>
    </PageShell>
  )
}
