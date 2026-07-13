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
    <div className="mb-5 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[1.5rem] font-extrabold tracking-tight text-navy-900 sm:text-[1.625rem]">{title}</h1>
        {subtitle && <p className="mt-1.5 text-[0.9375rem] font-medium text-navy-400 sm:text-base">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}
