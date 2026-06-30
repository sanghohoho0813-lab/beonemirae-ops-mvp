import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Route, Siren, Package, Target, FlaskConical, ChevronDown, Factory } from 'lucide-react'
import { useData } from '../context/DataContext'
import { PageHeader } from '../components/PageHeader'
import { WasteBadge } from '../components/Badge'
import { PageShell, SectionTitle, ExpandableSection } from '../components/ui'
import { SeparationNotice, VehicleFleetCard, FacilityCard, IsolationCard } from '../components/ops'
import { dispatchPlans, type DispatchPlan } from '../lib/ops'

// ─────────────────────────────────────────────────────────────────────────────
// 배차·경로 추천 (시뮬레이션) — 특허 경로 산출부(150)/배차 추천부(160)
//  요약 → 차량별 핵심 → (펼치면) 상세. 블루/그레이 톤.
// ─────────────────────────────────────────────────────────────────────────────

function PlanCard({ p, open, onToggle }: { p: DispatchPlan; open: boolean; onToggle: () => void }) {
  return (
    <div className="card overflow-hidden">
      {/* 핵심 (항상 표시) */}
      <button onClick={onToggle} className="flex w-full items-center gap-3 p-4 text-left">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <WasteBadge type={p.wasteType} />
            <span className="truncate font-bold text-navy-900">{p.vehicleName}</span>
          </div>
          <div className="mt-1.5 flex items-center gap-1.5">
            <div className="h-2 w-24 overflow-hidden rounded-full bg-navy-100">
              <div className="h-full rounded-full bg-teal-500" style={{ width: `${p.loadRate}%` }} />
            </div>
            <span className="text-xs font-bold text-teal-600">{p.loadRate}%</span>
            <span className="text-xs text-navy-400">· 경로 {p.stops.length}곳 · 인계 {p.handoverTime}</span>
          </div>
        </div>
        <ChevronDown size={18} className={`shrink-0 text-navy-300 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* 상세 (펼침) */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="space-y-3 border-t border-navy-100 p-4">
              <div>
                <div className="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-navy-500">
                  <Route size={15} /> 권장 수거 순서
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {p.routeLabels.map((label, i) => (
                    <span key={label + i} className="flex items-center gap-1.5">
                      <span className={`rounded-lg px-2.5 py-1 text-xs font-bold ${i === p.routeLabels.length - 1 ? 'bg-navy-800 text-white' : 'bg-navy-50 text-navy-700'}`}>
                        {label}
                      </span>
                      {i < p.routeLabels.length - 1 && <span className="text-navy-300">→</span>}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {p.urgentCount > 0 && (
                  <span className="flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-500">
                    <Siren size={12} /> 긴급 {p.urgentCount}건 반영
                  </span>
                )}
                {p.materialCount > 0 && (
                  <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-600">
                    <Package size={12} /> 자재 동시공급 {p.materialCount}건
                  </span>
                )}
                <span className="flex items-center gap-1 rounded-full bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-700">
                  <Target size={12} /> {p.facilityName} 인계 {p.handoverTime}
                </span>
              </div>

              <div className="flex gap-4 rounded-2xl bg-navy-50 px-3.5 py-2.5 text-xs font-medium text-navy-500">
                <span>실적재 약 {p.capacity.toLocaleString('ko-KR')}kg</span>
                <span>운행거리 <b className="text-navy-700">{p.simDistanceKm}km</b> <span className="text-navy-300">(시뮬레이션)</span></span>
                <span>운행시간 <b className="text-navy-700">{p.simMinutes}분</b> <span className="text-navy-300">(시뮬레이션)</span></span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function Dispatch() {
  const { data } = useData()
  const plans = dispatchPlans(data).filter((p) => p.stops.length > 0)
  const medCount = plans.filter((p) => p.wasteType === '의료폐기물').length
  const diaperCount = plans.filter((p) => p.wasteType === '일회용기저귀').length
  const [open, setOpen] = useState<string | null>(plans[0]?.vehicleId ?? null)

  return (
    <PageShell>
      <PageHeader title="배차·경로 추천" subtitle="오늘 차량별 권장 수거 순서 · 처리장 인계" />

      {/* 요약 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card p-4">
          <p className="text-[13px] font-semibold text-navy-400">의료폐기물 차량</p>
          <p className="mt-1.5 text-2xl font-extrabold text-navy-900">{medCount}<span className="ml-0.5 text-base text-navy-300">대</span></p>
        </div>
        <div className="card p-4">
          <p className="text-[13px] font-semibold text-navy-400">일회용기저귀 차량</p>
          <p className="mt-1.5 text-2xl font-extrabold text-navy-900">{diaperCount}<span className="ml-0.5 text-base text-navy-300">대</span></p>
        </div>
        <div className="card p-4">
          <p className="text-[13px] font-semibold text-navy-400">처리장 인계</p>
          <p className="mt-1.5 flex items-center gap-1 text-2xl font-extrabold text-navy-900"><Factory size={18} className="text-navy-400" />2<span className="ml-0.5 text-base text-navy-300">곳</span></p>
        </div>
      </div>

      {/* 개발 중 안내 */}
      <div className="flex items-start gap-2.5 rounded-2xl bg-navy-50 p-4">
        <FlaskConical size={18} strokeWidth={2.2} className="mt-0.5 shrink-0 text-teal-600" />
        <p className="text-sm leading-relaxed text-navy-500">
          수거조건·차량·처리장·이력 데이터를 통합한 <b className="text-navy-700">배차·경로 추천 로직을 개발 중</b>입니다.
          운행거리·시간은 <b className="text-navy-700">시뮬레이션 값</b>이며 실증 데이터로 검증 예정입니다.
        </p>
      </div>

      {/* 차량별 추천 (아코디언) */}
      <section>
        <SectionTitle>차량별 배차 추천</SectionTitle>
        <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
          {plans.map((p) => (
            <PlanCard key={p.vehicleId} p={p} open={open === p.vehicleId} onToggle={() => setOpen(open === p.vehicleId ? null : p.vehicleId)} />
          ))}
          {plans.length === 0 && <div className="card p-5 text-sm text-navy-400">오늘 배정된 차량 일정이 없습니다.</div>}
        </div>
      </section>

      {/* 분리 운행 + 격리 */}
      <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
        <SeparationNotice />
        <IsolationCard />
      </div>

      {/* 차량/처리장 정보 (펼치기) */}
      <section>
        <SectionTitle>차량 · 처리장 정보</SectionTitle>
        <ExpandableSection label="차량·처리장 정보 자세히 보기">
          <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
            <VehicleFleetCard />
            <FacilityCard />
          </div>
        </ExpandableSection>
      </section>
    </PageShell>
  )
}
