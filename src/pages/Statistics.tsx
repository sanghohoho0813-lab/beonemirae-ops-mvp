import { useMemo } from 'react'
import { useData } from '../context/DataContext'
import { PageHeader } from '../components/PageHeader'
import { MetricCard } from '../components/ui'
import { WasteBadge } from '../components/Badge'
import { additionalMaterialCount, monthlyCollected } from '../lib/selectors'
import { num, weight } from '../lib/format'
import type { ClientType } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// 통계 — 월별 수거량 / 폐기물 비중 / 거래처 유형별 / 차량별 수거 건수 / 자재 추가공급
// ─────────────────────────────────────────────────────────────────────────────

const CLIENT_TYPES: ClientType[] = [
  '병원',
  '요양병원',
  '의원',
  '장례식장',
  '요양원',
  '치과',
  '한의원',
  '한방병원',
]

export function Statistics() {
  const { data } = useData()

  const monthly = monthlyCollected(data)
  const total = monthly.의료폐기물 + monthly.일회용기저귀
  const medicalPct = total > 0 ? Math.round((monthly.의료폐기물 / total) * 100) : 0
  const diaperPct = total > 0 ? 100 - medicalPct : 0

  const typeCounts = useMemo(() => {
    const map: Record<string, number> = {}
    for (const c of data.clients) map[c.type] = (map[c.type] ?? 0) + 1
    return map
  }, [data.clients])

  // 차량별 완료 수거 건수 (전체 기간)
  const vehicleStats = useMemo(() => {
    return data.vehicles.map((v) => {
      const items = data.schedules.filter((s) => s.vehicleId === v.id && s.status === '완료')
      const amount = items.reduce((sum, s) => sum + (s.actualAmount ?? 0), 0)
      return { vehicle: v, count: items.length, amount }
    })
  }, [data.vehicles, data.schedules])

  const maxVehicleCount = Math.max(1, ...vehicleStats.map((v) => v.count))
  const addMaterials = additionalMaterialCount(data)

  return (
    <div>
      <PageHeader title="통계" subtitle="이번 달 운영 지표" />

      {/* 월별 수거량 요약 */}
      <section className="mb-5">
        <h2 className="mb-2 text-sm font-semibold text-navy-500">이번 달 수거량</h2>
        <div className="grid grid-cols-3 gap-3">
          <MetricCard label="의료폐기물" value={weight(monthly.의료폐기물)} tone="rose" />
          <MetricCard label="일회용기저귀" value={weight(monthly.일회용기저귀)} tone="teal" />
          <MetricCard label="총 수거량" value={weight(total)} tone="navy" hint="월평균 목표 105톤" />
        </div>
      </section>

      {/* 폐기물 비중 */}
      <section className="mb-5">
        <h2 className="mb-2 text-sm font-semibold text-navy-500">폐기물 구분 비중</h2>
        <div className="card p-4">
          <div className="mb-2 flex h-5 overflow-hidden rounded-full bg-navy-50">
            <div className="flex items-center justify-center bg-rose-500 text-[10px] font-bold text-white" style={{ width: `${medicalPct}%` }}>
              {medicalPct >= 12 ? `${medicalPct}%` : ''}
            </div>
            <div className="flex items-center justify-center bg-teal-600 text-[10px] font-bold text-white" style={{ width: `${diaperPct}%` }}>
              {diaperPct >= 12 ? `${diaperPct}%` : ''}
            </div>
          </div>
          <div className="flex justify-between text-xs">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> 의료폐기물 {medicalPct}%
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-teal-600" /> 일회용기저귀 {diaperPct}%
            </span>
          </div>
        </div>
      </section>

      {/* 거래처 유형별 개수 */}
      <section className="mb-5">
        <h2 className="mb-2 text-sm font-semibold text-navy-500">거래처 유형별 ({data.clients.length}곳)</h2>
        <div className="grid grid-cols-2 gap-2">
          {CLIENT_TYPES.map((t) => (
            <div key={t} className="card flex items-center justify-between p-3">
              <span className="text-sm text-navy-500">{t}</span>
              <span className="font-bold text-navy-900">{typeCounts[t] ?? 0}</span>
            </div>
          ))}
        </div>
      </section>

      {/* 차량별 수거 건수 */}
      <section className="mb-5">
        <h2 className="mb-2 text-sm font-semibold text-navy-500">차량별 수거 실적 (누적)</h2>
        <div className="card space-y-3 p-4">
          {vehicleStats.map(({ vehicle, count, amount }) => (
            <div key={vehicle.id}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <WasteBadge type={vehicle.wasteType} />
                  <span className="font-medium text-navy-700">{vehicle.name}</span>
                </span>
                <span className="text-navy-500">
                  {count}건 · {weight(amount)}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-navy-50">
                <div
                  className={`h-full rounded-full ${vehicle.wasteType === '의료폐기물' ? 'bg-rose-400' : 'bg-teal-500'}`}
                  style={{ width: `${(count / maxVehicleCount) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 자재 추가공급 */}
      <section className="mb-5">
        <h2 className="mb-2 text-sm font-semibold text-navy-500">자재 추가공급</h2>
        <div className="grid grid-cols-2 gap-3">
          <MetricCard label="이번 달 추가공급" value={addMaterials} unit="건" tone="amber" hint="월평균 4~5회" />
          <MetricCard label="전체 공급 내역" value={num(data.materials.length)} unit="건" tone="navy" />
        </div>
      </section>

      <p className="pb-2 text-center text-xs text-navy-300">
        데이터 백업·초기화는 <b className="text-navy-400">더보기</b> 메뉴에서 할 수 있습니다.
      </p>
    </div>
  )
}
