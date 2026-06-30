import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Sparkles, Smartphone } from 'lucide-react'
import { useData } from '../context/DataContext'
import { CompanyOverview } from '../components/CompanyOverview'
import { RnDCard } from '../components/RnDCard'
import { PageShell, SectionTitle, MetricCard } from '../components/ui'
import { monthlyCollected } from '../lib/selectors'
import { weight } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// 시연용 핵심 요약 — 벤처기업확인 심사관 대상 한 화면 흐름
//  회사 규모 → 수거 실적 → 기술개발·특허 순으로 배치
// ─────────────────────────────────────────────────────────────────────────────

export function DemoSummary() {
  const navigate = useNavigate()
  const { data } = useData()
  const monthly = monthlyCollected(data)
  const total = monthly.의료폐기물 + monthly.일회용기저귀

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

      {/* 히어로 */}
      <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-navy-800 to-navy-900 p-6 text-white shadow-lg">
        <div className="flex items-center gap-1.5 text-teal-300">
          <Sparkles size={16} />
          <span className="text-xs font-bold">beonemirae ops</span>
        </div>
        <h1 className="mt-3 text-2xl font-extrabold leading-tight tracking-tight">
          ㈜비원미래
          <br />
          의료폐기물 수거·운반
          <br />
          통합 운영관리
        </h1>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {[`거래처 ${data.clients.length}곳`, `차량 ${data.vehicles.length}대`, '월평균 105톤'].map((c) => (
            <span key={c} className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white backdrop-blur">
              {c}
            </span>
          ))}
        </div>
      </div>

      {/* 이번 달 수거 실적 */}
      <section>
        <SectionTitle>이번 달 수거 실적</SectionTitle>
        <div className="grid grid-cols-3 gap-3">
          <MetricCard label="의료폐기물" value={weight(monthly.의료폐기물)} tone="rose" />
          <MetricCard label="일회용기저귀" value={weight(monthly.일회용기저귀)} tone="teal" />
          <MetricCard label="총 수거량" value={weight(total)} tone="navy" />
        </div>
      </section>

      {/* 회사 운영 규모 + 기술개발 현황 */}
      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        <section>
          <SectionTitle>회사 운영 규모</SectionTitle>
          <CompanyOverview />
        </section>
        <section>
          <SectionTitle>기술개발 현황 · 특허</SectionTitle>
          <RnDCard />
        </section>
      </div>

      <p className="pb-2 text-center text-xs text-navy-300">
        데이터 기반 의료폐기물 수거·운반 운영관리 시스템 · ㈜비원미래
      </p>
    </PageShell>
  )
}
