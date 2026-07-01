import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Sparkles, Smartphone, Route, Target, AlertTriangle, Layers, Building2, FileText, ChevronRight } from 'lucide-react'
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
import { PageShell, SectionTitle, MetricCard, ExpandableSection } from '../components/ui'
import { dispatchPlans } from '../lib/ops'
import { monthlyCollected } from '../lib/selectors'
import { weight } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// 심사관 시연 요약 (/demo) — 짧은 5단계 흐름 + 접히는 상세 검토 자료
// ─────────────────────────────────────────────────────────────────────────────

const FIELD_PROBLEMS = [
  '병원·요양병원별 수거주기 차이',
  '자재 추가요청 수시 발생',
  '격리의료폐기물 보관기한·긴급수거',
  '의료폐기물 / 일회용기저귀 분리 운행',
]
const SYSTEM_SCOPE = [
  '거래처·수거조건·차량·처리장·이력 통합관리',
  '권역·수거량·보관기한 기반 경로 추천(개발 중)',
  '수거대장·자재·미수금 운영관리 통합',
]

const FLOW = [
  { n: 1, title: '회사 운영 규모', line: '거래처 49곳 · 차량 5대 · 월 105톤', id: 'd-1' },
  { n: 2, title: '현장 문제', line: '수거주기 차이 · 격리 · 분리 운행', id: 'd-2' },
  { n: 3, title: '배차·경로 추천', line: '적재율·긴급·처리장 인계 시뮬레이션', id: 'd-3' },
  { n: 4, title: '거래처·수거대장 관리', line: '거래처 상세 · 수거대장 통합 출력', id: 'd-4' },
  { n: 5, title: '특허·사업계획 정합성', line: '특허 구성요소 · 사업계획 매핑', id: 'd-5' },
]

export function DemoSummary() {
  const navigate = useNavigate()
  const { data } = useData()
  const monthly = monthlyCollected(data)
  const total = monthly.의료폐기물 + monthly.일회용기저귀
  const plans = dispatchPlans(data).filter((p) => p.stops.length > 0).slice(0, 2)
  const firstClient = data.clients[0]

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <PageShell>
      {/* 상단 바 */}
      <div className="flex items-center gap-2">
        <button onClick={() => navigate('/')} className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-navy-500 shadow-card transition active:scale-95" aria-label="뒤로">
          <ArrowLeft size={18} />
        </button>
        <span className="text-sm font-bold text-navy-500">심사관 시연 요약</span>
        <button onClick={() => navigate('/mobile-preview')} className="ml-auto hidden items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-sm font-bold text-navy-600 shadow-card transition hover:bg-navy-50 lg:inline-flex">
          <Smartphone size={16} /> 모바일 프레임으로 보기
        </button>
      </div>

      {/* 히어로 */}
      <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-navy-800 to-navy-900 p-6 text-white shadow-lg">
        <div className="flex items-center gap-1.5 text-teal-300">
          <Sparkles size={16} />
          <span className="text-xs font-bold">beonemirae ops</span>
        </div>
        <h1 className="mt-3 text-2xl font-extrabold leading-tight tracking-tight">
          데이터 기반 의료폐기물
          <br />
          수거·운반 통합 운영관리
        </h1>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {[`거래처 ${data.clients.length}곳`, `차량 ${data.vehicles.length}대`, '월 105톤'].map((c) => (
            <span key={c} className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white">{c}</span>
          ))}
        </div>
      </div>

      {/* 5단계 핵심 흐름 */}
      <section>
        <SectionTitle>핵심 시연 흐름</SectionTitle>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {FLOW.map((f) => (
            <button key={f.id} onClick={() => scrollTo(f.id)} className="card pressable flex items-center gap-3 p-4 text-left">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-sm font-extrabold text-teal-600">{f.n}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-bold text-navy-900">{f.title}</p>
                <p className="truncate text-xs text-navy-400">{f.line}</p>
              </div>
              <ChevronRight size={16} className="shrink-0 text-navy-300" />
            </button>
          ))}
        </div>
      </section>

      <div className="border-t border-navy-100 pt-1">
        <SectionTitle>상세 검토 자료</SectionTitle>
      </div>

      {/* 1. 회사 운영 규모 */}
      <section id="d-1" className="scroll-mt-4">
        <SectionTitle>1. 회사 운영 규모</SectionTitle>
        <CompanyOverview />
      </section>

      {/* 2. 현장 문제 + 개발 중 */}
      <div id="d-2" className="grid scroll-mt-4 gap-3 lg:grid-cols-2 lg:items-start">
        <section>
          <SectionTitle>2. 현장 문제</SectionTitle>
          <div className="card p-5">
            <div className="flex items-center gap-2">
              <AlertTriangle size={18} className="text-amber-500" />
              <p className="text-[15px] font-bold text-navy-800">의료기관 폐기물 운영 과제</p>
            </div>
            <ul className="mt-3 space-y-1.5">
              {FIELD_PROBLEMS.map((p) => (
                <li key={p} className="flex gap-2 text-sm leading-snug text-navy-600">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-navy-300" />{p}
                </li>
              ))}
            </ul>
          </div>
        </section>
        <section>
          <SectionTitle>개발 중인 시스템</SectionTitle>
          <div className="card p-5">
            <div className="flex items-center gap-2">
              <Layers size={18} className="text-teal-600" />
              <p className="text-[15px] font-bold text-navy-800">통합 운영관리 시스템 (개발 중)</p>
            </div>
            <ul className="mt-3 space-y-1.5">
              {SYSTEM_SCOPE.map((p) => (
                <li key={p} className="flex gap-2 text-sm leading-snug text-navy-600">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-navy-300" />{p}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>

      {/* 3. 배차·경로 추천 */}
      <section id="d-3" className="scroll-mt-4">
        <SectionTitle action={<button onClick={() => navigate('/dispatch')} className="text-[13px] font-bold text-teal-600">자세히 →</button>}>
          3. 배차·경로 추천 시뮬레이션
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
              <p className="mt-2 flex items-center gap-1.5 text-[13px] font-semibold text-navy-500"><Route size={14} /> 권장 순서</p>
              <p className="mt-1 text-sm font-medium text-navy-600">{p.routeLabels.join(' → ')}</p>
              <p className="mt-2 flex items-center gap-1.5 text-xs font-bold text-navy-500"><Target size={13} /> {p.facilityName} 인계 {p.handoverTime} · 운행 {p.simDistanceKm}km (시뮬)</p>
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

      {/* 4. 거래처·수거대장 관리 */}
      <section id="d-4" className="scroll-mt-4">
        <SectionTitle>4. 거래처·수거대장 관리</SectionTitle>
        <div className="card p-5">
          <p className="text-sm leading-relaxed text-navy-600">
            거래처별 수거조건·이력·자재·미수금을 통합 관리하고, 수거이력과 자재공급을 합쳐 월간 수거대장으로 출력(예정)합니다.
          </p>
          <p className="mt-2 rounded-2xl bg-navy-50 px-3.5 py-2.5 text-xs leading-snug text-navy-500">
            기본 데이터는 <b className="text-navy-700">사업계획서 주요거래처 5곳</b> 기준이며, 시연용 확장으로 거래처가
            15·25·35곳으로 늘어난 관리 화면도 확인할 수 있습니다. 운영 데이터 누적 시 배차·경로 추천 고도화 예정.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <MetricCard label="관리 거래처" value={data.clients.length} unit="곳" tone="navy" />
            <MetricCard label="이번 달 수거" value={weight(total)} tone="navy" />
            <MetricCard label="수거대장" value="PDF 예정" tone="teal" />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={() => navigate(firstClient ? `/clients/${firstClient.id}` : '/clients')} className="flex items-center gap-1.5 rounded-full bg-teal-500 px-4 py-2 text-sm font-bold text-white shadow-sm transition active:scale-95">
              <Building2 size={15} /> 거래처 상세 보기
            </button>
            <button onClick={() => navigate(firstClient ? `/clients/${firstClient.id}` : '/clients')} className="flex items-center gap-1.5 rounded-full bg-navy-50 px-4 py-2 text-sm font-bold text-navy-600 transition active:scale-95">
              <FileText size={15} /> 수거대장 보기
            </button>
          </div>
        </div>
      </section>

      {/* 5. 특허·사업계획 정합성 */}
      <section id="d-5" className="scroll-mt-4">
        <SectionTitle>5. 특허·사업계획 정합성</SectionTitle>
        <p className="mb-2 px-1 text-sm text-navy-500">의료폐기물 수거·운반 경로 최적화 시스템 · 10-2026-0101187</p>
        <div className="space-y-2.5">
          <ExpandableSection label="특허 구성요소 ↔ 앱 기능 매핑 보기">
            <PatentMappingCard />
          </ExpandableSection>
          <ExpandableSection label="사업계획 방향 ↔ 앱 기능 보기">
            <BusinessPlanCard />
          </ExpandableSection>
          <ExpandableSection label="사무업무 개선 · 향후 고도화 · 셀프체크 보기">
            <div className="space-y-3">
              <OfficeSavingsCard />
              <FuturePlanCard />
              <SelfCheckCard />
            </div>
          </ExpandableSection>
        </div>
      </section>

      <p className="pb-2 text-center text-xs text-navy-300">데이터 기반 의료폐기물 운영관리 시스템 · ㈜비원미래</p>
    </PageShell>
  )
}
