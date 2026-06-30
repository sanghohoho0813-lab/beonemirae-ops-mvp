import { Truck, Route, Siren, Package, Target, FlaskConical } from 'lucide-react'
import { useData } from '../context/DataContext'
import { PageHeader } from '../components/PageHeader'
import { WasteBadge } from '../components/Badge'
import { PageShell, SectionTitle } from '../components/ui'
import {
  SeparationNotice,
  VehicleFleetCard,
  FacilityCard,
  IsolationCard,
} from '../components/ops'
import { dispatchPlans } from '../lib/ops'

// ─────────────────────────────────────────────────────────────────────────────
// 배차·경로 추천 (시뮬레이션) — 특허 경로 산출부(150)/배차 추천부(160)
//  ※ 실제 지도 API·최적화 알고리즘 미연동. 운영 데이터 기반 추천 로직 개발 중.
// ─────────────────────────────────────────────────────────────────────────────

export function Dispatch() {
  const { data } = useData()
  const plans = dispatchPlans(data).filter((p) => p.stops.length > 0)

  return (
    <PageShell>
      <PageHeader title="배차·경로 추천" subtitle="오늘 차량별 권장 수거 순서 · 처리장 인계" />

      {/* 개발 중 안내 */}
      <div className="flex items-start gap-2.5 rounded-2xl bg-navy-50 p-4">
        <FlaskConical size={18} strokeWidth={2.2} className="mt-0.5 shrink-0 text-teal-600" />
        <p className="text-sm leading-relaxed text-navy-500">
          수거조건·차량·처리장·이력 데이터를 통합해 <b className="text-navy-700">배차·경로를 추천하는 로직을 개발 중</b>입니다.
          예상 운행거리·운행시간은 <b className="text-navy-700">시뮬레이션 값</b>이며, 실제 운행데이터 축적 후 개선효과를 검증할 예정입니다.
        </p>
      </div>

      {/* 차량별 배차·경로 카드 */}
      <section>
        <SectionTitle>오늘 차량별 배차 추천</SectionTitle>
        <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
          {plans.map((p) => (
            <div key={p.vehicleId} className="card p-5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <WasteBadge type={p.wasteType} />
                  <span className="truncate font-extrabold text-navy-900">{p.vehicleName}</span>
                </div>
                <span className="shrink-0 text-xs font-medium text-navy-400">{p.driver}</span>
              </div>

              {/* 적재율 */}
              <div className="mt-3">
                <div className="flex items-end justify-between">
                  <span className="text-[13px] font-semibold text-navy-400">예상 적재율</span>
                  <span className="text-2xl font-extrabold text-teal-600">{p.loadRate}%</span>
                </div>
                <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-navy-100">
                  <div
                    className={`h-full rounded-full ${p.wasteType === '의료폐기물' ? 'bg-rose-400' : 'bg-teal-500'}`}
                    style={{ width: `${p.loadRate}%` }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-navy-400">
                  실적재 가능량 {p.capacity.toLocaleString('ko-KR')}kg (부피 문제로 명목 적재량의 약 2/3)
                </p>
              </div>

              {/* 권장 경로 */}
              <div className="mt-3">
                <div className="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-navy-500">
                  <Route size={15} /> 권장 수거 순서
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {p.routeLabels.map((label, i) => (
                    <span key={label + i} className="flex items-center gap-1.5">
                      <span
                        className={`rounded-lg px-2.5 py-1 text-xs font-bold ${
                          i === p.routeLabels.length - 1 ? 'bg-navy-800 text-white' : 'bg-navy-50 text-navy-700'
                        }`}
                      >
                        {label}
                      </span>
                      {i < p.routeLabels.length - 1 && <span className="text-navy-300">→</span>}
                    </span>
                  ))}
                </div>
              </div>

              {/* 반영 사항 */}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {p.urgentCount > 0 && (
                  <span className="flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-500">
                    <Siren size={12} /> 긴급 수거 {p.urgentCount}건 반영
                  </span>
                )}
                {p.materialCount > 0 && (
                  <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-600">
                    <Package size={12} /> 자재 동시공급 {p.materialCount}건 반영
                  </span>
                )}
                <span className="flex items-center gap-1 rounded-full bg-navy-50 px-2.5 py-1 text-xs font-bold text-navy-600">
                  <Target size={12} /> {p.facilityName} 인계 {p.handoverTime}
                </span>
              </div>

              {/* 시뮬레이션 값 */}
              <div className="mt-3 flex gap-4 rounded-2xl bg-navy-50 px-3.5 py-2.5 text-xs font-medium text-navy-500">
                <span>예상 운행거리 <b className="text-navy-800">{p.simDistanceKm}km</b> <span className="text-navy-300">(시뮬레이션)</span></span>
                <span>예상 운행시간 <b className="text-navy-800">{p.simMinutes}분</b> <span className="text-navy-300">(시뮬레이션)</span></span>
              </div>
            </div>
          ))}
          {plans.length === 0 && (
            <div className="card flex items-center gap-2.5 p-5 text-sm text-navy-400">
              <Truck size={18} /> 오늘 배정된 차량 일정이 없습니다.
            </div>
          )}
        </div>
      </section>

      {/* 분리 운행 + 격리 */}
      <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
        <SeparationNotice />
        <IsolationCard />
      </div>

      {/* 차량 / 처리장 정보 */}
      <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
        <VehicleFleetCard />
        <FacilityCard />
      </div>
    </PageShell>
  )
}
