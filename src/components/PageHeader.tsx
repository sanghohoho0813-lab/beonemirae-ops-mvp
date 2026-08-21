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
    //  ⚠ 0071 — 폰에서 아래 여백이 24px 이었습니다. 첫 화면에서 업무가
    //    시작되는 자리를 그만큼 늦춥니다. 폰만 12px 로 줄입니다 (넓은
    //    화면은 그대로 — 자리가 남으니까요).
    <div className="mb-3 flex flex-wrap items-end justify-between gap-3 sm:mb-6">
      <div className="min-w-0 flex-1">
        {/*  폰에서 33px 제목은 한 줄을 통째로 씁니다. 화면 이름은 아래
             메뉴에도 있으니, 폰에서는 한 단계 줄입니다. */}
        <h1 className="t-page min-w-0 max-sm:text-[1.5rem] text-navy-900">{title}</h1>
        {/*  ⚠ 0069 — navy-400 은 대비 3.4:1 로 읽기 기준에 못 미칩니다.
             화면마다 맨 위에 하나씩 있는 줄이라 눈에 제일 먼저 닿습니다. */}
        {subtitle && <p className="t-body mt-2.5 font-medium text-navy-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}
