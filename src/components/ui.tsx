import { useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, ChevronRight, Lock, type LucideIcon } from 'lucide-react'
import { TONE, type Tone } from '../lib/tone'

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

/**
 * 섹션 제목 (+ 우측 액션 + 한 줄 설명)
 *
 * hint 는 "이 섹션이 왜 있는지"를 한 줄로 적는 자리입니다.
 * 투어를 보지 않은 사람도 화면만 보고 흐름을 따라갈 수 있게 하는 용도라,
 * 기능 이름을 반복하지 말고 목적을 씁니다.
 */
export function SectionTitle({
  children,
  action,
  hint,
}: {
  children: ReactNode
  action?: ReactNode
  hint?: string
}) {
  return (
    <div className={`px-1 ${hint ? 'mb-3.5' : 'mb-3'}`}>
      {/* 좁은 폭에서 제목이 뭉개지지 않도록, 자리가 부족하면 액션이 아래 줄로 내려갑니다. */}
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
        <h2 className="t-section min-w-0 flex-1 text-navy-800">{children}</h2>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {hint && <p className="t-muted mt-1.5 break-keep leading-snug">{hint}</p>}
    </div>
  )
}

type NumberTone = 'navy' | 'teal' | 'amber' | 'rose' | 'emerald'
const numberTone: Record<NumberTone, string> = {
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
  nowrap = false,
  onClick,
}: {
  label: string
  value: ReactNode
  unit?: string
  hint?: string
  tone?: NumberTone
  size?: 'md' | 'lg'
  nowrap?: boolean
  onClick?: () => void
}) {
  const numberSize = size === 'lg' ? 'text-[1.375rem] sm:text-[1.75rem] xl:text-[1.875rem]' : 'text-[1.75rem]'
  return (
    <motion.div
      onClick={onClick}
      whileTap={onClick ? { scale: 0.98 } : undefined}
      transition={{ duration: 0.15, ease: EASE }}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={`card flex w-full flex-col p-4 text-left transition sm:p-5 ${
        onClick
          ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-lg hover:ring-1 hover:ring-teal-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400'
          : ''
      }`}
    >
      <span className={`order-2 mt-2 break-keep font-semibold text-navy-400 ${size === 'lg' ? 'text-[1.08rem]' : 'text-[1.03rem]'}`}>{label}</span>
      <span className={`order-1 font-extrabold leading-none tracking-tight ${numberSize} ${nowrap ? 'whitespace-nowrap' : ''} ${numberTone[tone]}`}>
        {value}
        {unit && <span className="ml-1 text-[0.7em] font-bold text-navy-300">{unit}</span>}
      </span>
      {hint && <span className="order-3 mt-1.5 text-[0.98rem] text-navy-400 sm:text-[1.03rem]">{hint}</span>}
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
      className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-2 text-[1.03rem] font-bold transition-colors ${
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

/**
 * 색 아이콘 타일 — 목록·메뉴에서 항목을 빠르게 구분하기 위한 최소 단위.
 * 색은 여기(작은 배경)와 칩·점에만 쓰고 카드 전체에는 쓰지 않습니다.
 */
export function IconTile({
  icon: Icon,
  tone = 'navy',
  size = 42,
}: {
  icon: LucideIcon
  tone?: Tone
  size?: number
}) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-2xl ${TONE[tone].tile}`}
      style={{ width: size, height: size }}
    >
      <Icon size={Math.round(size * 0.5)} strokeWidth={2.2} />
    </span>
  )
}

/** 작은 라벨 칩 (요청 유형 · 상태 · 단계 등) */
export function ToneChip({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`pill ${TONE[tone].chip}`}>{children}</span>
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
      {subtitle && <p className="mt-1 text-[1.08rem] text-navy-400">{subtitle}</p>}
    </div>
  )
}

const featureTone: Record<IconTone, string> = iconToneStyle

/** 기능 목차 카드 — 아이콘 + 기능명 + 한 줄 설명 + 작은 상태 숫자 */
export function FeatureCard({
  icon: Icon,
  title,
  desc,
  badge,
  tone = 'navy',
  onClick,
}: {
  icon: LucideIcon
  title: string
  desc: string
  badge?: string
  tone?: IconTone
  onClick: () => void
}) {
  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.15 }}
      className="card flex w-full items-center gap-3 p-4 text-left"
    >
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${featureTone[tone]}`}>
        <Icon size={19} strokeWidth={2.2} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="t-card text-navy-900">{title}</p>
        <p className="t-muted">{desc}</p>
      </div>
      {badge && (
        <span className="shrink-0 rounded-full bg-navy-50 px-2.5 py-1 text-[1.03rem] font-bold text-navy-500">
          {badge}
        </span>
      )}
      <ChevronRight size={18} className="shrink-0 text-navy-300" />
    </motion.button>
  )
}

/** 접기/펼치기 섹션 */
export function ExpandableSection({
  label,
  openLabel,
  children,
  defaultOpen = false,
}: {
  label: string
  openLabel?: string
  children: ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-center gap-1 rounded-2xl bg-navy-50 px-4 py-2.5 text-[1.08rem] font-bold text-navy-600 transition active:scale-[0.99]"
      >
        {open ? openLabel ?? '접기' : label}
        <ChevronDown size={16} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="pt-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// B2B 운영 콘솔용 프리미티브 (아이콘 KPI 카드 · 진행률 지표 · 개발예정 배지)
// ─────────────────────────────────────────────────────────────────────────────

const kpiToneStyle: Record<IconTone, string> = {
  navy: 'bg-navy-50 text-navy-600',
  teal: 'bg-teal-50 text-teal-600',
  rose: 'bg-rose-50 text-rose-500',
  amber: 'bg-amber-50 text-amber-600',
  emerald: 'bg-emerald-50 text-emerald-600',
}

/** '622kg' → ['622','kg'] · '+190만원' → ['+190','만원'] · '완료' → ['완료',''] */
function splitAmountUnit(s: string): [string, string] {
  const m = s.match(/^([+\-]?[\d.,]+)(.*)$/)
  return m ? [m[1], m[2]] : [s, '']
}

/** 대시보드 상단 KPI 카드 — 아이콘 + 라벨 + 큰 숫자 + 증감/보조 문구 */
export function KpiCard({
  icon: Icon,
  label,
  value,
  unit,
  delta,
  deltaTone = 'navy',
  hint,
  tone = 'navy',
  onClick,
}: {
  icon: LucideIcon
  label: string
  value: ReactNode
  unit?: string
  delta?: string
  deltaTone?: 'up' | 'down' | 'navy'
  hint?: string
  tone?: IconTone
  onClick?: () => void
}) {
  const deltaClass =
    deltaTone === 'up' ? 'text-teal-600' : deltaTone === 'down' ? 'text-rose-500' : 'text-navy-400'
  // '622kg' · '+190만원' 처럼 숫자 뒤에 단위가 붙은 값은 단위를 작게 분리해
  // 숫자 자체를 최대한 크게 보여줍니다(좁은 카드에서도 잘리지 않음).
  const [num, tail] =
    typeof value === 'string' ? splitAmountUnit(value) : [value, '']
  return (
    <motion.div
      onClick={onClick}
      whileTap={onClick ? { scale: 0.985 } : undefined}
      transition={{ duration: 0.15, ease: EASE }}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={`card kpi-box p-4 sm:p-5 ${
        onClick ? 'cursor-pointer transition hover:-translate-y-0.5 hover:shadow-lg' : ''
      }`}
    >
      {/* 글자가 커진 뒤에도 라벨이 두 줄로 접히지 않도록 아이콘을 위로 올리고
          라벨이 카드 가로폭 전체를 쓰게 합니다. 숫자는 그 아래 전체 폭 사용. */}
      <div className="flex min-w-0 items-center gap-2 sm:block sm:gap-0">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:mb-2.5 sm:h-11 sm:w-11 sm:rounded-2xl ${kpiToneStyle[tone]}`}
        >
          <Icon size={20} strokeWidth={2.2} className="sm:hidden" />
          <Icon size={23} strokeWidth={2.2} className="hidden sm:block" />
        </span>
        <p className="t-label min-w-0 text-navy-500">{label}</p>
      </div>
      <p className="t-kpi mt-3.5 text-navy-900">
        {num}
        {(tail || unit) && (
          <span className="ml-0.5 text-[0.52em] font-bold text-navy-400">
            {tail}
            {unit}
          </span>
        )}
      </p>
      {delta && <p className={`t-muted mt-2.5 font-bold ${deltaClass}`}>{delta}</p>}
      {hint && !delta && (
        <p className="t-muted mt-2.5">{hint}</p>
      )}
    </motion.div>
  )
}

/** 진행률 지표 행 — 라벨 + 퍼센트 + 진행 바 + 원본 수치 */
export function ProgressStat({
  icon: Icon,
  label,
  percent,
  detail,
  tone = 'teal',
}: {
  icon?: LucideIcon
  label: string
  percent: number
  detail?: string
  tone?: 'teal' | 'rose' | 'amber' | 'navy'
}) {
  const barTone = {
    teal: 'bg-teal-500',
    rose: 'bg-rose-400',
    amber: 'bg-amber-400',
    navy: 'bg-navy-500',
  }[tone]
  const textTone = {
    teal: 'text-teal-600',
    rose: 'text-rose-500',
    amber: 'text-amber-600',
    navy: 'text-navy-700',
  }[tone]
  const pct = Math.max(0, Math.min(100, percent))
  return (
    <div className="flex items-center gap-3">
      {Icon && (
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${kpiToneStyle[tone === 'rose' ? 'rose' : tone === 'amber' ? 'amber' : tone === 'navy' ? 'navy' : 'teal']}`}>
          <Icon size={17} strokeWidth={2.2} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="t-label min-w-0 text-navy-700">{label}</p>
          <p className={`t-card shrink-0 font-extrabold ${textTone}`}>{pct}%</p>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-navy-100">
          <div className={`h-full rounded-full ${barTone}`} style={{ width: `${pct}%` }} />
        </div>
        {detail && <p className="t-muted mt-1.5 text-right">{detail}</p>}
      </div>
    </div>
  )
}

/** '개발 예정' 표시 배지 — 미구현 기능을 명확히 구분 */
export function PlannedBadge({ label = '개발 예정' }: { label?: string }) {
  return (
    <span className="pill shrink-0 bg-navy-100 text-navy-500">
      <Lock size={11} strokeWidth={2.6} /> {label}
    </span>
  )
}

/** 섹션 탭/스텝퍼 — 클릭 시 해당 섹션으로 스크롤 (가로 스크롤) */
export function SectionTabs({ items }: { items: { id: string; label: string }[] }) {
  const go = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      {items.map((it, i) => (
        <button
          key={it.id}
          onClick={() => go(it.id)}
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-[1.03rem] font-bold text-navy-600 shadow-card"
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-50 text-[0.95rem] font-extrabold text-teal-600">
            {i + 1}
          </span>
          {it.label}
        </button>
      ))}
    </div>
  )
}
