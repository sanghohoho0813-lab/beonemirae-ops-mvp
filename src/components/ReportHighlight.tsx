import { useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import type { MonthlyReport } from '../lib/insights'
import { weight } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// 병원 운영 리포트 — 대시보드 대표 카드
//  수거업을 넘어 병원 운영지원으로 확장되는 축을 한 문장으로 보여주고,
//  대표 거래처 리포트 2건만 미리 노출합니다.
// ─────────────────────────────────────────────────────────────────────────────

export function ReportHighlight({ reports }: { reports: MonthlyReport[] }) {
  const navigate = useNavigate()
  const top = [...reports].sort((a, b) => b.totalKg - a.totalKg).slice(0, 3)

  return (
    <div className="card flex h-full flex-col overflow-hidden">
      <div className="border-b border-navy-100 px-5 py-5">
        <p className="text-[1rem] font-bold text-navy-500">병원 운영 리포트</p>
        <p className="mt-2 break-keep text-[1.375rem] font-extrabold leading-snug tracking-tight text-navy-900">
          병원별 수거·자재·교육 이력을
          <br className="hidden sm:block" /> 한눈에 관리
        </p>
      </div>

      <div className="flex-1 divide-y divide-navy-50">
        {top.map((r) => (
          <button
            key={r.client.id}
            onClick={() => navigate(`/reports?client=${r.client.id}`)}
            className="flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-navy-50"
          >
            <div className="min-w-0 flex-1">
              <p className="break-keep text-[1.0625rem] font-bold leading-snug text-navy-900">{r.client.name}</p>
              <p className="mt-1 break-keep text-[0.9375rem] leading-snug text-navy-500">
                이번 달 {weight(r.totalKg)} · {r.visits}회 수거
              </p>
            </div>
            <ChevronRight size={20} className="shrink-0 text-navy-300" />
          </button>
        ))}
        {top.length === 0 && (
          <p className="px-5 py-8 text-center text-[1rem] text-navy-400">아직 생성된 리포트가 없습니다.</p>
        )}
      </div>

      <button
        onClick={() => navigate('/reports')}
        className="pressable m-4 rounded-xl bg-navy-900 py-3.5 text-[1rem] font-bold text-white transition hover:bg-navy-800"
      >
        운영 리포트 보기
      </button>
    </div>
  )
}
