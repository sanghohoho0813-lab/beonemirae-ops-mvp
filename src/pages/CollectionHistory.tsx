import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useData } from '../context/DataContext'
import { PageHeader } from '../components/PageHeader'
import { FilterChip } from '../components/ui'
import { facilityByWaste } from '../data/ops'
import { weight, today } from '../lib/format'
import type { WasteType } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// 전체 수거이력 (/history) — 거래처 상세·통계에서 진입하는 파생 조회 화면
//  기존 schedules 에서 파생하여 표시 (localStorage 스키마 변경 없음)
// ─────────────────────────────────────────────────────────────────────────────

type WasteFilter = '전체' | WasteType
type KindFilter = '전체' | '정기' | '추가' | '긴급'
type PeriodFilter = '전체' | '최근 7일' | '이번 달'

function shift(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function CollectionHistory() {
  const { data, clientById } = useData()
  const navigate = useNavigate()
  const [waste, setWaste] = useState<WasteFilter>('전체')
  const [kind, setKind] = useState<KindFilter>('전체')
  const [period, setPeriod] = useState<PeriodFilter>('전체')
  const [query, setQuery] = useState('')

  const rows = useMemo(() => {
    const t = today()
    const weekAgo = shift(-7)
    const month = t.slice(0, 7)
    return data.schedules
      .map((s) => {
        //  그만둔 거래처의 과거 수거도 이름이 남아야 합니다.
        //  활성 목록만 뒤지면 '거래처' 라는 이름으로 뭉개집니다.
        const client = clientById(s.clientId)
        const v = data.vehicles.find((x) => x.id === s.vehicleId)
        const facility = facilityByWaste(s.wasteType)
        const done = s.status === '완료'
        const handoverStatus = s.handoverStatus ?? (done ? '인계 완료' : null)
        const k: KindFilter = s.status === '긴급' ? '긴급' : s.memo.includes('추가') ? '추가' : '정기'
        return {
          id: s.id,
          date: s.date,
          time: s.actualTime ?? s.scheduledTime,
          clientName: client?.name ?? '거래처',
          clientType: client?.type ?? '',
          wasteType: s.wasteType,
          amount: s.actualAmount,
          driver: s.driverName ?? v?.driver ?? '-',
          vehicleName: v?.name ?? '-',
          facility: facility?.name ?? '처리장',
          completed: done,
          handoverStatus,
          handedOver: handoverStatus === '인계 완료',
          fromField: s.origin === 'field',
          kind: k,
          note: s.memo || (done ? '정상수거' : ''),
        }
      })
      .filter((r) => (waste === '전체' ? true : r.wasteType === waste))
      .filter((r) => (kind === '전체' ? true : r.kind === kind))
      .filter((r) => (period === '전체' ? true : period === '이번 달' ? r.date.startsWith(month) : r.date >= weekAgo && r.date <= t))
      //  거래처 검색과 같은 이유로 앞뒤 공백을 떼고 대소문자를 가리지 않습니다.
      .filter((r) => {
        const q = query.trim().toLowerCase()
        return q ? r.clientName.toLowerCase().includes(q) : true
      })
      .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))
  }, [data, clientById, waste, kind, period, query])

  const completedRows = rows.filter((r) => r.completed)
  const totalKg = completedRows.reduce((s, r) => s + (r.amount ?? 0), 0)
  const urgent = rows.filter((r) => r.kind === '긴급').length
  const handoverRate = completedRows.length
    ? Math.round((completedRows.filter((r) => r.handedOver).length / completedRows.length) * 100)
    : 0

  return (
    <div>
      <button onClick={() => navigate(-1)} className="mb-3 flex items-center gap-1.5 text-[1.08rem] font-bold text-navy-500">
        <ArrowLeft size={16} /> 뒤로
      </button>
      <PageHeader title="전체 수거이력" subtitle="거래처·차량·폐기물 구분별 수거 기록" />

      {/* 요약 */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="card kpi-box p-4">
          <p className="text-[1.03rem] font-semibold text-navy-400">전체 수거건수</p>
          <p className="t-stat mt-1.5 text-navy-900">{rows.length}<span className="ml-0.5 text-[0.55em] text-navy-300">건</span></p>
        </div>
        <div className="card kpi-box p-4">
          <p className="text-[1.03rem] font-semibold text-navy-400">총 수거량</p>
          <p className="t-stat mt-1.5 text-teal-600">{weight(totalKg)}</p>
        </div>
        <div className="card kpi-box p-4">
          <p className="text-[1.03rem] font-semibold text-navy-400">긴급수거</p>
          <p className="t-stat mt-1.5 text-rose-500">{urgent}<span className="ml-0.5 text-[0.55em] text-navy-300">건</span></p>
        </div>
        <div className="card kpi-box p-4">
          <p className="text-[1.03rem] font-semibold text-navy-400">인계 완료율</p>
          <p className="t-stat mt-1.5 text-navy-900">{handoverRate}<span className="ml-0.5 text-[0.55em] text-navy-300">%</span></p>
        </div>
      </div>

      {/* 필터 */}
      <input className="field-input mb-3" placeholder="거래처명 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="-mx-4 mb-2 flex gap-2 overflow-x-auto px-4 pb-1">
        {(['전체', '의료폐기물', '일회용기저귀'] as WasteFilter[]).map((w) => (
          <FilterChip key={w} active={waste === w} onClick={() => setWaste(w)}>{w}</FilterChip>
        ))}
      </div>
      <div className="-mx-4 mb-2 flex gap-2 overflow-x-auto px-4 pb-1">
        {(['전체', '정기', '추가', '긴급'] as KindFilter[]).map((k) => (
          <FilterChip key={k} active={kind === k} onClick={() => setKind(k)}>{k}</FilterChip>
        ))}
      </div>
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {(['전체', '최근 7일', '이번 달'] as PeriodFilter[]).map((p) => (
          <FilterChip key={p} active={period === p} onClick={() => setPeriod(p)}>{p}</FilterChip>
        ))}
      </div>

      {/* 테이블 */}
      <div className="card overflow-x-auto p-1">
        <table className="w-full border-collapse text-left text-[0.98rem]">
          <thead>
            <tr className="bg-navy-50 text-navy-500">
              {['날짜', '거래처', '유형', '구분', '수거량', '기사', '차량', '처리장', '인계', '비고'].map((h) => (
                <th key={h} className="whitespace-nowrap px-2.5 py-2 font-bold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 60).map((r) => (
              <tr key={r.id} className="border-t border-navy-100 text-navy-700">
                <td className="whitespace-nowrap px-2.5 py-2 font-semibold">{r.date.slice(5)} {r.time}</td>
                <td className="whitespace-nowrap px-2.5 py-2 font-semibold">
                  {r.clientName}
                  {r.fromField && <span className="ml-1 rounded bg-teal-50 px-1 py-0.5 text-[0.98rem] font-bold text-teal-600">현장입력</span>}
                </td>
                <td className="whitespace-nowrap px-2.5 py-2">{r.clientType}</td>
                <td className="whitespace-nowrap px-2.5 py-2">{r.wasteType === '의료폐기물' ? '의료' : '기저귀'} · {r.kind}</td>
                <td className="whitespace-nowrap px-2.5 py-2 font-bold">{r.amount != null ? `${r.amount}kg` : '-'}</td>
                <td className="whitespace-nowrap px-2.5 py-2">{r.driver}</td>
                <td className="whitespace-nowrap px-2.5 py-2">{r.vehicleName}</td>
                <td className="whitespace-nowrap px-2.5 py-2">{r.facility}</td>
                <td className="whitespace-nowrap px-2.5 py-2">{r.handoverStatus ?? '예정'}</td>
                <td className="whitespace-nowrap px-2.5 py-2">{r.note}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={10} className="px-3 py-4 text-center text-navy-400">
                {data.schedules.length === 0
                  ? '아직 수거 기록이 없습니다. 첫 수거를 입력하면 여기에 쌓입니다.'
                  : '조건에 맞는 이력이 없습니다.'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      {rows.length > 60 && <p className="mt-2 px-1 text-[0.98rem] text-navy-400">최근 60건까지 표시합니다.</p>}
    </div>
  )
}
