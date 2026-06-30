import { Link } from 'react-router-dom'
import { useData } from '../context/DataContext'
import { StatCard } from '../components/StatCard'
import { StatusBadge, WasteBadge } from '../components/Badge'
import { InfoBanner } from '../components/InfoBanner'
import {
  additionalMaterialCount,
  monthlyCollected,
  outstandingTotal,
  todaySummary,
  vehicleTodaySummary,
} from '../lib/selectors'
import { prettyDate, today, weight, won } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// 대시보드 — "대표님이 휴대폰으로 한눈에 보는 화면"
// ─────────────────────────────────────────────────────────────────────────────

export function Dashboard() {
  const { data, clientById } = useData()
  const t = today()

  const summary = todaySummary(data)
  const monthly = monthlyCollected(data)
  const totalMonthly = monthly.의료폐기물 + monthly.일회용기저귀
  const outstanding = outstandingTotal(data)
  const addMaterials = additionalMaterialCount(data)
  const vehicles = vehicleTodaySummary(data)

  return (
    <div>
      <div className="mb-4">
        <p className="text-sm text-navy-400">{prettyDate(t)} · 오늘의 운영 현황</p>
        <h1 className="text-2xl font-extrabold tracking-tight text-navy-900 sm:text-3xl">
          대표님 한눈에 보기
        </h1>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[`거래처 ${data.clients.length}곳`, `차량 ${data.vehicles.length}대`, '월평균 105톤'].map((chip) => (
            <span key={chip} className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-navy-500 ring-1 ring-navy-100">
              {chip}
            </span>
          ))}
        </div>
      </div>

      {/* 오늘 수거 현황 — 핵심 숫자를 크게 */}
      <section className="mb-5">
        <h2 className="mb-2 text-sm font-semibold text-navy-500">오늘 수거 현황</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="오늘 예정" value={summary.total} unit="건" tone="navy" size="lg" />
          <StatCard label="완료" value={summary.완료} unit="건" tone="emerald" size="lg" />
          <StatCard label="지연" value={summary.지연} unit="건" tone="amber" size="lg" />
          <StatCard label="긴급" value={summary.긴급} unit="건" tone="red" size="lg" />
        </div>
      </section>

      {/* 이번 달 수거량 */}
      <section className="mb-5">
        <h2 className="mb-2 text-sm font-semibold text-navy-500">이번 달 수거량</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard label="의료폐기물" value={weight(monthly.의료폐기물)} tone="red" size="lg" hint="이번 달 누적 실수거량" />
          <StatCard label="일회용기저귀" value={weight(monthly.일회용기저귀)} tone="teal" size="lg" hint="이번 달 누적 실수거량" />
          <StatCard label="총 수거량" value={weight(totalMonthly)} tone="navy" size="lg" hint="월평균 목표 105톤" />
        </div>
      </section>

      {/* 정산/자재 현황 */}
      <section className="mb-5">
        <h2 className="mb-2 text-sm font-semibold text-navy-500">정산 · 자재</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Link to="/receivables" className="block">
            <StatCard label="미수금 합계" value={won(outstanding)} tone="amber" hint="미수금 관리 바로가기 →" />
          </Link>
          <Link to="/materials" className="block">
            <StatCard label="이번 달 자재 추가요청" value={addMaterials} unit="건" tone="navy" hint="자재 관리 바로가기 →" />
          </Link>
        </div>
      </section>

      {/* 차량별 오늘 일정 요약 */}
      <section className="mb-5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-navy-500">차량별 오늘 일정</h2>
          <Link to="/today" className="text-xs font-semibold text-teal-600">
            전체 일정 →
          </Link>
        </div>
        <div className="space-y-3">
          {vehicles.map(({ vehicle, total, done, items }) => (
            <div key={vehicle.id} className="card p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <WasteBadge type={vehicle.wasteType} />
                  <span className="font-semibold text-navy-800">{vehicle.name}</span>
                  <span className="text-xs text-navy-400">· {vehicle.driver}</span>
                </div>
                <span className="text-sm font-semibold text-navy-600">
                  {done}/{total}건 완료
                </span>
              </div>
              {items.length === 0 ? (
                <p className="mt-2 text-sm text-navy-300">오늘 배정된 일정이 없습니다.</p>
              ) : (
                <ul className="mt-3 space-y-1.5">
                  {items.map((s) => (
                    <li key={s.id} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 text-navy-600">
                        <span className="tabular-nums text-navy-400">{s.scheduledTime}</span>
                        {clientById(s.clientId)?.name ?? '알 수 없음'}
                      </span>
                      <StatusBadge status={s.status} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* 시연용 안내 */}
      <section className="mb-2">
        <InfoBanner />
      </section>
    </div>
  )
}
