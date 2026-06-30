import type { ReactNode } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// 각 페이지 상단 제목 영역
// ─────────────────────────────────────────────────────────────────────────────

interface PageHeaderProps {
  title: string
  subtitle?: string
  action?: ReactNode
}

export function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-navy-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-navy-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}
