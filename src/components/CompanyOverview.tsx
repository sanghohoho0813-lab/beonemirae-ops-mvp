import { Truck, Building2, Boxes, Recycle } from 'lucide-react'
import { useData } from '../context/DataContext'
import { IconChip, RatioBar } from './ui'

// ─────────────────────────────────────────────────────────────────────────────
// 회사 운영 규모 — 인포그래픽형 요약 (대표자·심사관 시연용)
//  월평균 수거량 / 거래처 구성 / 차량 구성 / 자재 추가공급
//  거래처·차량은 실제 데이터 기반, 월 수거량은 회사 월평균(목표) 기준
// ─────────────────────────────────────────────────────────────────────────────

// 거래처 유형 그룹핑 (의원·장례식장·요양원은 한 그룹으로 표기)
const TYPE_GROUPS: { label: string; types: string[] }[] = [
  { label: '병원', types: ['병원'] },
  { label: '요양병원', types: ['요양병원'] },
  { label: '의원·장례식장·요양원', types: ['의원', '장례식장', '요양원'] },
  { label: '치과', types: ['치과'] },
  { label: '한의원·한방병원', types: ['한의원', '한방병원'] },
]

// 월평균 수거량 (톤) — 회사 운영 기준 수치
const MEDICAL_TON = 40
const DIAPER_TON = 65

export function CompanyOverview() {
  const { data } = useData()

  const typeCount = (types: string[]) => data.clients.filter((c) => types.includes(c.type)).length
  const medicalVehicles = data.vehicles.filter((v) => v.wasteType === '의료폐기물').length
  const diaperVehicles = data.vehicles.filter((v) => v.wasteType === '일회용기저귀').length

  return (
    <div className="card divide-y divide-navy-100 p-1">
      {/* 월평균 수거량 */}
      <div className="p-4">
        <div className="flex items-center gap-3">
          <IconChip icon={Recycle} tone="teal" />
          <div>
            <p className="text-[0.8125rem] font-semibold text-navy-400">월평균 수거량</p>
            <p className="text-xl font-extrabold tracking-tight text-navy-900">총 105톤</p>
          </div>
        </div>
        <div className="mt-3">
          <RatioBar
            segments={[
              { value: MEDICAL_TON, className: 'bg-navy-400', label: 'medical' },
              { value: DIAPER_TON, className: 'bg-teal-500', label: 'diaper' },
            ]}
          />
          <div className="mt-2 flex justify-between text-xs font-medium">
            <span className="flex items-center gap-1.5 text-navy-500">
              <span className="h-2 w-2 rounded-full bg-navy-400" /> 의료폐기물 {MEDICAL_TON}톤
            </span>
            <span className="flex items-center gap-1.5 text-navy-500">
              <span className="h-2 w-2 rounded-full bg-teal-500" /> 일회용기저귀 {DIAPER_TON}톤
            </span>
          </div>
        </div>
      </div>

      {/* 거래처 구성 */}
      <div className="p-4">
        <div className="flex items-center gap-3">
          <IconChip icon={Building2} tone="navy" />
          <div>
            <p className="text-[0.8125rem] font-semibold text-navy-400">거래처 구성</p>
            <p className="text-xl font-extrabold tracking-tight text-navy-900">총 {data.clients.length}곳</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {TYPE_GROUPS.map((g) => (
            <span key={g.label} className="rounded-full bg-navy-50 px-2.5 py-1 text-xs font-bold text-navy-600">
              {g.label} {typeCount(g.types)}
            </span>
          ))}
        </div>
      </div>

      {/* 차량 구성 */}
      <div className="p-4">
        <div className="flex items-center gap-3">
          <IconChip icon={Truck} tone="navy" />
          <div>
            <p className="text-[0.8125rem] font-semibold text-navy-400">차량 구성</p>
            <p className="text-xl font-extrabold tracking-tight text-navy-900">총 {data.vehicles.length}대</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-500">
            의료폐기물 {medicalVehicles}대
          </span>
          <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-600">
            일회용기저귀 {diaperVehicles}대
          </span>
        </div>
      </div>

      {/* 자재 추가공급 */}
      <div className="flex items-center gap-3 p-4">
        <IconChip icon={Boxes} tone="amber" />
        <div>
          <p className="text-[0.8125rem] font-semibold text-navy-400">자재 추가공급</p>
          <p className="text-xl font-extrabold tracking-tight text-navy-900">월 4~5회 발생</p>
        </div>
      </div>
    </div>
  )
}
