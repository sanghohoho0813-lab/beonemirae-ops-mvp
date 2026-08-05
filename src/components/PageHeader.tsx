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
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0 flex-1">
        <h1 className="min-w-0 break-keep text-[1.75rem] font-extrabold leading-tight tracking-tight text-navy-900 sm:text-[1.875rem]">{title}</h1>
        {subtitle && <p className="mt-2 break-keep text-[1rem] font-medium leading-snug text-navy-400 sm:text-[1.0625rem]">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}
