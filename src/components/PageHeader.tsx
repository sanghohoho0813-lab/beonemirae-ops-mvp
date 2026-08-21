import type { ReactNode } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// 각 페이지 상단 제목 영역
// ─────────────────────────────────────────────────────────────────────────────

interface PageHeaderProps {
  title: string
  subtitle?: ReactNode
  action?: ReactNode
}

export function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0 flex-1">
        <h1 className="t-page min-w-0 text-navy-900">{title}</h1>
        {/*  ⚠ 0069 — navy-400 은 대비 3.4:1 로 읽기 기준에 못 미칩니다.
             화면마다 맨 위에 하나씩 있는 줄이라 눈에 제일 먼저 닿습니다. */}
        {subtitle && <p className="t-body mt-2.5 font-medium text-navy-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}
