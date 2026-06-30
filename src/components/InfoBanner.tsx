import { Info } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// 시연용 안내 배너 — localStorage 기반 한계 안내
// ─────────────────────────────────────────────────────────────────────────────

export function InfoBanner() {
  return (
    <div className="rounded-2xl bg-navy-50 p-4">
      <div className="flex items-start gap-2.5">
        <Info size={18} strokeWidth={2.2} className="mt-0.5 shrink-0 text-navy-400" />
        <p className="text-sm leading-relaxed text-navy-500">
          현재 버전은 <b className="text-navy-700">시연용 MVP</b>입니다. 입력 데이터는 사용하는 기기에 저장되며,
          실제 운영용 버전에서는 <b className="text-navy-700">Supabase DB 연동</b>으로 PC·모바일 간 실시간 공유가
          가능하도록 확장 예정입니다.
        </p>
      </div>
    </div>
  )
}
