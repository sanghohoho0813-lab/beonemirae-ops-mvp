import { Lightbulb, FileBadge, Check, CircleDashed } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// 기술개발 현황 카드 — 벤처기업확인 심사관 시연용
//  연구개발전담부서 / 경로 최적화 시스템 / 특허출원 / 데이터 기반 고도화
// ─────────────────────────────────────────────────────────────────────────────

const ITEMS: { text: string; planned?: boolean }[] = [
  { text: '연구개발전담부서 운영 (인정서 원본은 대표 확인)' },
  { text: '의료폐기물 수거·운반 경로 최적화 시스템 개발 — 특허 출원 (등록 아님)' },
  { text: '데이터 기반 배차·수거이력·자재관리 고도화', planned: true },
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
            <li key={t.text} className="flex items-start gap-2.5">
              <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${t.planned ? 'bg-navy-100' : 'bg-teal-50'}`}>
                {t.planned ? <CircleDashed size={13} strokeWidth={3} className="text-navy-500" /> : <Check size={13} strokeWidth={3} className="text-teal-600" />}
              </span>
              <span className={`text-[1.08rem] font-medium leading-snug ${t.planned ? 'text-navy-500' : 'text-navy-700'}`}>
                {t.text}{t.planned && <span className="ml-1.5 rounded-full bg-navy-100 px-2 py-0.5 text-[0.85rem] font-bold text-navy-500">예정</span>}
              </span>
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
