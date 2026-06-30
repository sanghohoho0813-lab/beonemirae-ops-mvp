import type { ReactNode } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// 대시보드/통계용 지표 카드
// ─────────────────────────────────────────────────────────────────────────────

type Tone = 'navy' | 'teal' | 'amber' | 'red' | 'emerald'

const toneStyles: Record<Tone, { value: string; label: string }> = {
  navy: { value: 'text-navy-800', label: 'text-navy-500' },
  teal: { value: 'text-teal-700', label: 'text-teal-600' },
  amber: { value: 'text-amber-600', label: 'text-amber-500' },
  red: { value: 'text-red-600', label: 'text-red-500' },
  emerald: { value: 'text-emerald-600', label: 'text-emerald-500' },
}

interface StatCardProps {
  label: string
  value: ReactNode
  unit?: string
  hint?: string
  tone?: Tone
  icon?: ReactNode
}

export function StatCard({ label, value, unit, hint, tone = 'navy', icon }: StatCardProps) {
  const t = toneStyles[tone]
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between">
        <p className={`text-xs font-medium ${t.label}`}>{label}</p>
        {icon && <span className="text-navy-300">{icon}</span>}
      </div>
      <p className={`mt-2 text-2xl font-bold tracking-tight ${t.value}`}>
        {value}
        {unit && <span className="ml-1 text-sm font-medium text-navy-400">{unit}</span>}
      </p>
      {hint && <p className="mt-1 text-xs text-navy-400">{hint}</p>}
    </div>
  )
}
