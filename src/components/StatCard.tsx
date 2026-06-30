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
  /** 'lg' 는 대표자 시연용으로 핵심 숫자를 더 크게 표시 */
  size?: 'md' | 'lg'
}

export function StatCard({ label, value, unit, hint, tone = 'navy', icon, size = 'md' }: StatCardProps) {
  const t = toneStyles[tone]
  const valueSize = size === 'lg' ? 'text-3xl sm:text-4xl' : 'text-2xl'
  const labelSize = size === 'lg' ? 'text-sm' : 'text-xs'
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between">
        <p className={`font-semibold ${labelSize} ${t.label}`}>{label}</p>
        {icon && <span className="text-navy-300">{icon}</span>}
      </div>
      <p className={`mt-2 font-bold tracking-tight ${valueSize} ${t.value}`}>
        {value}
        {unit && <span className="ml-1 text-base font-medium text-navy-400">{unit}</span>}
      </p>
      {hint && <p className="mt-1 text-xs text-navy-400">{hint}</p>}
    </div>
  )
}
