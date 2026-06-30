import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// 토스 스타일 공용 UI 키트
//  PageShell · SectionTitle · MetricCard · AppCard · FilterChip ·
//  PrimaryButton · SecondaryButton · EmptyState
//  - rounded-3xl, 은은한 그림자, 넉넉한 여백, active:scale 터치 피드백
//  - 텍스트 위계: title / subtitle / number / caption
// ─────────────────────────────────────────────────────────────────────────────

const EASE = [0.22, 1, 0.36, 1] as const

/** 페이지 콘텐츠 컨테이너 — 섹션 간 일관된 세로 간격 */
export function PageShell({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`space-y-6 ${className}`}>{children}</div>
}

/** 섹션 제목 (+ 우측 액션) */
export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2.5 flex items-center justify-between px-1">
      <h2 className="text-[15px] font-bold text-navy-700">{children}</h2>
      {action}
    </div>
  )
}

type Tone = 'navy' | 'teal' | 'amber' | 'rose' | 'emerald'
const numberTone: Record<Tone, string> = {
  navy: 'text-navy-900',
  teal: 'text-teal-600',
  amber: 'text-amber-500',
  rose: 'text-rose-500',
  emerald: 'text-emerald-500',
}

/** 지표 카드 — 큰 숫자 중심 */
export function MetricCard({
  label,
  value,
  unit,
  hint,
  tone = 'navy',
  size = 'md',
  onClick,
}: {
  label: string
  value: ReactNode
  unit?: string
  hint?: string
  tone?: Tone
  size?: 'md' | 'lg'
  onClick?: () => void
}) {
  const numberSize = size === 'lg' ? 'text-[30px] sm:text-[34px]' : 'text-[26px]'
  return (
    <motion.div
      onClick={onClick}
      whileTap={onClick ? { scale: 0.98 } : undefined}
      transition={{ duration: 0.15, ease: EASE }}
      role={onClick ? 'button' : undefined}
      className={`card flex w-full flex-col p-4 text-left ${onClick ? 'cursor-pointer' : ''}`}
    >
      <span className="text-[13px] font-semibold text-navy-400">{label}</span>
      <span className={`mt-1.5 font-extrabold leading-none tracking-tight ${numberSize} ${numberTone[tone]}`}>
        {value}
        {unit && <span className="ml-1 text-base font-bold text-navy-300">{unit}</span>}
      </span>
      {hint && <span className="mt-1.5 text-xs text-navy-400">{hint}</span>}
    </motion.div>
  )
}

/** 일반 카드 래퍼 (옵션: 터치 시 눌림) */
export function AppCard({
  children,
  className = '',
  onClick,
  pressable,
}: {
  children: ReactNode
  className?: string
  onClick?: () => void
  pressable?: boolean
}) {
  if (onClick || pressable) {
    return (
      <motion.div
        onClick={onClick}
        whileTap={{ scale: 0.98 }}
        transition={{ duration: 0.15, ease: EASE }}
        className={`card ${onClick ? 'cursor-pointer' : ''} ${className}`}
      >
        {children}
      </motion.div>
    )
  }
  return <div className={`card ${className}`}>{children}</div>
}

/** 필터 칩 */
export function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.95 }}
      transition={{ duration: 0.15, ease: EASE }}
      className={`rounded-full px-3.5 py-2 text-[13px] font-bold transition-colors ${
        active ? 'bg-teal-500 text-white shadow-sm' : 'bg-white text-navy-500 shadow-card'
      }`}
    >
      {children}
    </motion.button>
  )
}

/** 주요 액션 버튼 */
export function PrimaryButton({
  children,
  onClick,
  disabled,
  className = '',
  type = 'button',
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  className?: string
  type?: 'button' | 'submit'
}) {
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`btn-primary ${className}`}>
      {children}
    </button>
  )
}

/** 보조 액션 버튼 */
export function SecondaryButton({
  children,
  onClick,
  disabled,
  className = '',
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  className?: string
}) {
  return (
    <button onClick={onClick} disabled={disabled} className={`btn-ghost ${className}`}>
      {children}
    </button>
  )
}

type IconTone = 'navy' | 'teal' | 'rose' | 'amber' | 'emerald'
const iconToneStyle: Record<IconTone, string> = {
  navy: 'bg-navy-50 text-navy-600',
  teal: 'bg-teal-50 text-teal-600',
  rose: 'bg-rose-50 text-rose-500',
  amber: 'bg-amber-50 text-amber-600',
  emerald: 'bg-emerald-50 text-emerald-600',
}

/** 둥근 사각형 아이콘 칩 */
export function IconChip({ icon: Icon, tone = 'navy', size = 44 }: { icon: LucideIcon; tone?: IconTone; size?: number }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-2xl ${iconToneStyle[tone]}`}
      style={{ width: size, height: size }}
    >
      <Icon size={size * 0.5} strokeWidth={2.2} />
    </span>
  )
}

/** 두 구간 비율 바 (예: 의료폐기물 vs 일회용기저귀) */
export function RatioBar({ segments }: { segments: { value: number; className: string; label: string }[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1
  return (
    <div className="flex h-2.5 overflow-hidden rounded-full bg-navy-100">
      {segments.map((s) => (
        <div key={s.label} className={s.className} style={{ width: `${(s.value / total) * 100}%` }} />
      ))}
    </div>
  )
}

/** 비어있는 상태 */
export function EmptyState({ icon = '🗂️', title, subtitle }: { icon?: string; title: string; subtitle?: string }) {
  return (
    <div className="card flex flex-col items-center justify-center px-6 py-12 text-center">
      <span className="text-3xl">{icon}</span>
      <p className="mt-3 font-bold text-navy-700">{title}</p>
      {subtitle && <p className="mt-1 text-sm text-navy-400">{subtitle}</p>}
    </div>
  )
}
