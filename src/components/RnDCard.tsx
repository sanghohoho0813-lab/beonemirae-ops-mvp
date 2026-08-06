import { Lightbulb, FileBadge, Check } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// 기술개발 현황 카드 — 벤처기업확인 심사관 시연용
//  연구개발전담부서 / 경로 최적화 시스템 / 특허출원 / 데이터 기반 고도화
// ─────────────────────────────────────────────────────────────────────────────

const ITEMS = [
  '연구개발전담부서 운영',
  '의료폐기물 수거·운반 경로 최적화 시스템 개발',
  '데이터 기반 배차·수거이력·자재관리 고도화 예정',
]

export function RnDCard() {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2.5 bg-gradient-to-br from-navy-800 to-navy-900 px-5 py-4 text-white">
        <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-white/10">
          <Lightbulb size={18} strokeWidth={2.2} className="text-teal-300" />
        </span>
        <div className="leading-tight">
          <p className="text-[1.07rem] font-bold">기술개발 현황</p>
          <p className="text-[0.95rem] font-medium text-navy-300">R&amp;D · 데이터 기반 운영 시스템</p>
        </div>
      </div>

      <div className="p-5">
        <ul className="space-y-2.5">
          {ITEMS.map((t) => (
            <li key={t} className="flex items-start gap-2.5">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-50">
                <Check size={13} strokeWidth={3} className="text-teal-600" />
              </span>
              <span className="text-[1.08rem] font-medium leading-snug text-navy-700">{t}</span>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex items-center gap-2.5 rounded-2xl bg-navy-50 px-4 py-3">
          <FileBadge size={20} strokeWidth={2.2} className="shrink-0 text-navy-500" />
          <div className="leading-tight">
            <p className="text-[0.95rem] font-semibold text-navy-400">특허출원번호</p>
            <p className="text-[1.08rem] font-extrabold tracking-tight text-navy-900">10-2026-0101187</p>
          </div>
        </div>
      </div>
    </div>
  )
}
