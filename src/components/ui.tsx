import { useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, ChevronRight, Inbox, Lock, Minus, Plus, type LucideIcon } from 'lucide-react'
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
  /**
   * 대영역(AreaHeader) 안에 들어가는 소제목이면 'sub' 입니다.
   * 같은 크기로 두면 "①오늘 처리할 업무"와 그 안의 "오늘 챙길 일"이 같은 무게로
   * 보여서, 네 덩어리로 나눈 의미가 사라집니다. 한 단계 낮춰 둡니다.
   */
  size = 'default',
}: {
  children: ReactNode
  action?: ReactNode
  hint?: string
  size?: 'default' | 'sub'
}) {
  return (
    <div className={`px-1 ${hint ? 'mb-3.5' : 'mb-3'}`}>
      {/* 좁은 폭에서 제목이 뭉개지지 않도록, 자리가 부족하면 액션이 아래 줄로 내려갑니다. */}
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
        {/* min-w-0 만 두면 제목이 0 까지 줄어듭니다. 옆 배지가 넓은 화면(폰)에서
            「B. 자동화」가 폭 17px 로 눌려 한 글자씩 세로로 떨어졌습니다.
            최소 폭을 주면 대신 배지가 아랫줄로 내려갑니다 — 그게 맞는 동작입니다. */}
        <h2 className={`min-w-[7.5rem] flex-1 break-keep text-navy-800 ${size === 'sub' ? 't-card' : 't-section'}`}>
          {children}
        </h2>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {hint && <p className="t-muted mt-1.5 break-keep leading-snug">{hint}</p>}
    </div>
  )
}

/**
 * 대영역 머리글 — 대시보드를 네 덩어리로 읽히게 하는 유일한 장치입니다.
 *
 * 카드마다 번호를 붙이면 다시 "다 중요해" 보입니다. 그래서 번호는 이 자리에만
 * 네 개 씁니다. 구분은 색이 아니라 번호·아이콘·여백·가는 선으로 냅니다 —
 * 영역마다 색을 칠하면 정작 색으로 표시해야 할 긴급·완료가 묻힙니다.
 *
 * 설명 한 줄은 "이 정보를 왜 보는지"입니다. 기능 이름을 다시 적지 않습니다.
 */
export function AreaHeader({
  n,
  icon: Icon,
  title,
  desc,
  action,
}: {
  n: number
  icon: LucideIcon
  title: string
  desc: string
  action?: ReactNode
}) {
  return (
    <div className="mb-3 flex items-start gap-3 px-1 pt-1 lg:mb-4 lg:gap-3.5">
      <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-navy-900 text-white lg:h-10 lg:w-10">
        <Icon size={18} strokeWidth={2.3} />
        {/* 번호는 아이콘 위에 작게 — 제목 줄의 글자 흐름을 끊지 않습니다 */}
        <span /*  ⚠ 0080 — 흰 글자를 teal-500 위에 올리면 3.7:1 입니다. 큰 글자면 기준(3:1)을
              넘지만 이건 12px 짜리 숫자라 4.5:1 이 필요합니다. 이 작은 알림 숫자만
              한 단계 진한 파랑으로 둡니다 — 저장 단추의 브랜드 파랑은 그대로입니다. */
        className="absolute -right-1 -top-1 flex h-[1.35rem] min-w-[1.35rem] items-center justify-center rounded-full bg-teal-600 px-1 text-[0.9rem] font-black text-white ring-2 ring-app">
          {n}
        </span>
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="t-section break-keep text-navy-900">{title}</h2>
        <p className="t-muted mt-0.5 break-keep leading-snug">{desc}</p>
      </div>
      {action && <div className="shrink-0 pt-0.5">{action}</div>}
    </div>
  )
}

/** 대영역 사이 구분선 — 색 대신 여백과 가는 선으로만 끊습니다 */
export function AreaDivider() {
  return <div className="h-px bg-navy-200/70" />
}

type NumberTone = 'navy' | 'teal' | 'amber' | 'rose' | 'emerald'
const numberTone: Record<NumberTone, string> = {
  navy: 'text-navy-900',
  teal: 'text-teal-600',
  amber: 'text-amber-700',
  rose: 'text-rose-500',
  emerald: 'text-emerald-500',
}

/**
 * 수량 입력 — 현장에서 가장 많이 만지는 컨트롤
 *
 *  이전에는 숫자 input 하나에 단위(개)를 안쪽 오른쪽에 겹쳐 두었습니다.
 *  그러면 브라우저 기본 증감 화살표와 단위 글자가 같은 자리에 놓여
 *  읽기도 누르기도 어려웠습니다. 특히 장갑 낀 손으로는 거의 못 누릅니다.
 *
 *  그래서 셋을 분리했습니다.
 *
 *      [ − ]   180   [ + ]   개
 *       누름   숫자   누름   단위
 *
 *  · 증감 버튼은 44px 이상 — 엄지로 눌리는 크기
 *  · 단위는 입력칸 밖 오른쪽 — 숫자와 겹치지 않습니다
 *  · 직접 타이핑도 그대로 됩니다 (많은 수량은 치는 게 빠릅니다)
 *  · inputMode="numeric" 으로 폰에서 숫자 키패드가 열립니다
 */
export function QtyField({
  label,
  value,
  onChange,
  unit = '개',
  step = 1,
  max,
  hint,
  danger,
  badge,
  quick,
  row,
}: {
  label?: string
  value: number
  onChange: (n: number) => void
  unit?: string
  step?: number
  max?: number
  hint?: string
  danger?: boolean
  /** 라벨 옆 작은 배지 (예: 유상 / 무상) */
  badge?: ReactNode
  /** 한 번에 채우는 값 — 직전 공급량처럼 근거가 있을 때만 씁니다 */
  quick?: { label: string; value: number }
  /**
   * 한 줄 배치 — 라벨 왼쪽, 컨트롤 오른쪽.
   * 품목이 여러 개일 때 씁니다. 좁은 칸에 2열로 늘어놓으면 라벨이 두 줄로
   * 접히고 입력칸이 눌러 붙어서, 한 줄씩 내려 쓰는 편이 훨씬 잘 읽힙니다.
   */
  row?: boolean
}) {
  const set = (n: number) => onChange(Math.max(0, max != null ? Math.min(max, n) : n))
  // 44px — 손가락으로 확실히 눌리는 최소 크기입니다. 이보다 줄이지 않습니다.
  //
  // h-11 은 rem 이라 글자 크기 기준선을 낮추면 같이 줄어듭니다. 실제로
  // 노트북 기준을 다시 맞췄더니 43px 이 되어 이 약속이 깨졌습니다.
  // 손가락 크기는 글자 설정과 무관하므로 px 하한을 따로 겁니다.
  const btn =
    'flex h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl bg-navy-100 text-navy-600 transition hover:bg-navy-200 active:scale-95 disabled:opacity-35 disabled:hover:bg-navy-100'

  const control = (
    <>
      <div className={`flex items-center ${row ? 'gap-1.5' : 'gap-2'}`}>
        <button type="button" aria-label={`${label ?? ''} 빼기`} className={btn} onClick={() => set(value - step)} disabled={value <= 0}>
          <Minus size={20} strokeWidth={3} />
        </button>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={max}
          aria-label={label}
          className={`field-input no-spinner px-1 py-3 text-center text-[1.24rem] font-extrabold tabular-nums ${
            row ? 'w-[3.9rem] shrink-0' : 'min-w-0 flex-1'
          } ${danger ? 'bg-rose-50 ring-1 ring-rose-300' : ''}`}
          value={value === 0 ? '' : value}
          onChange={(e) => set(Math.round(Number(e.target.value) || 0))}
          onFocus={(e) => e.currentTarget.select()}
          placeholder="0"
        />
        <button type="button" aria-label={`${label ?? ''} 더하기`} className={btn} onClick={() => set(value + step)}>
          <Plus size={20} strokeWidth={3} />
        </button>
        <span className={`shrink-0 text-[1.05rem] font-bold text-navy-400 ${row ? 'ml-0.5' : 'w-6'}`}>{unit}</span>
      </div>
      {(hint || (quick && quick.value > 0 && quick.value !== value)) && (
        <div className="mt-1 flex items-center gap-2">
          {hint && (
            <p className={`text-[0.95rem] ${danger ? 'font-bold text-rose-500' : 'text-navy-400'}`}>{hint}</p>
          )}
          {quick && quick.value > 0 && quick.value !== value && (
            <button
              type="button"
              onClick={() => set(quick.value)}
              className="ml-auto shrink-0 rounded-full bg-teal-50 px-2.5 py-1 text-[0.92rem] font-bold text-teal-700 transition hover:bg-teal-100"
            >
              {quick.label} {quick.value}
            </button>
          )}
        </div>
      )}
    </>
  )

  if (row) {
    //  ⚠ 「큰 글씨」로 켜면 이름이 **세로로 한 글자씩** 늘어졌습니다
    //     (「골판지 전용박스」가 27px 폭 · 238px 높이). 오른쪽 −／＋ 칸이
    //     글자와 같이 커지면서 자리를 다 가져가고, 이름 칸은 min-w-0 이라
    //     0 까지 줄어들 수 있었기 때문입니다.
    //     이름에 최소 폭을 주고 줄을 넘길 수 있게 했습니다 — 자리가 모자라면
    //     −／＋ 가 아랫줄로 내려갑니다. 기사님 화면이라 읽히는 쪽이 먼저입니다.
    //
    //  ⚠ 최소 폭을 7.5rem 으로 잡았다가 **보통 글씨에서도** 줄이 넘어가
    //     수거 입력 화면이 2,932 → 3,072px 로 길어졌습니다(회귀 2건).
    //     실제로 잰 값으로 다시 잡았습니다.
    //
    //       보통 글씨  줄 310px = 이름 + 12(사이) + −／＋ 208  → 이름이 90px
    //                  이하여야 한 줄로 남습니다
    //       큰 글씨    줄 294px = 이름 + 12 + −／＋ 250        → 이름이 32px
    //                  을 넘으면 넘어갑니다(그게 우리가 원하는 것)
    //
    //     rem 은 글자 크기를 따라 커집니다 — 4rem 이면 보통 71px(안 넘어감) ·
    //     큰 글씨 86px(넘어감). 두 조건을 다 만족하는 값입니다.
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-1.5">
        <div className="flex min-w-[4rem] flex-1 flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span className="break-keep text-[1.06rem] font-bold text-navy-800">{label}</span>
          {badge}
        </div>
        <div className="ml-auto shrink-0">{control}</div>
      </div>
    )
  }

  return (
    <div>
      {label && (
        <div className="mb-1.5 flex items-center gap-1.5">
          <label className="text-[1.03rem] font-semibold text-navy-500">{label}</label>
          {badge}
        </div>
      )}
      {control}
    </div>
  )
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
      <span className={`order-2 mt-2 hyphens-none break-keep font-semibold text-navy-400 ${size === 'lg' ? 'text-[1.08rem]' : 'text-[1.03rem]'}`}>{label}</span>
      <span className={`order-1 font-extrabold leading-none tracking-tight ${numberSize} ${nowrap ? 'whitespace-nowrap' : ''} ${numberTone[tone]}`}>
        {value}
        {unit && <span className="ml-1 text-[max(0.9rem,0.7em)] font-bold text-navy-400">{unit}</span>}
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
      aria-pressed={active}
      whileTap={{ scale: 0.95 }}
      transition={{ duration: 0.15, ease: EASE }}
      className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-2 text-[1.03rem] font-bold transition-colors ${
        //  ⚠ 0069 — 켜진 칩의 흰 글자가 teal-500 위에서 대비 3.7:1 이었습니다
        //    (18px 굵게는 큰 글자 기준을 못 넘습니다). 바탕을 한 단계 내립니다.
        //  ⚠ 0099 — 꺼진 칩은 마우스를 올려도 아무 티가 안 났습니다(check_hover).
        //    흰 바탕을 한 단계만 내리고 글자를 조금 진하게 — 「누를 수 있다」만 알립니다.
        active ? 'bg-teal-600 text-white shadow-sm' : 'bg-white text-navy-500 shadow-card hover:bg-navy-50 hover:text-navy-700'
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
  amber: 'bg-amber-50 text-amber-700',
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

/**
 * 비어있는 상태
 *
 * 아이콘은 이모지 대신 제품 전체와 같은 선 아이콘을 씁니다.
 * (화면마다 그림체가 달라지면 완성도가 떨어져 보입니다)
 */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  subtitle,
  action,
}: {
  icon?: LucideIcon
  title: string
  subtitle?: string
  /**
   * 다음에 할 일. 신규 고객사는 모든 화면이 0건에서 시작하므로,
   * "없다"만 말하고 끝내면 무엇을 해야 할지 알 수 없습니다.
   * 사용자가 지금 할 수 있는 행동이 있을 때만 넣습니다.
   */
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div className="card flex flex-col items-center justify-center px-6 py-12 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-navy-50 text-navy-400">
        <Icon size={26} strokeWidth={2.2} />
      </span>
      <p className="t-card mt-3.5 break-keep text-navy-700">{title}</p>
      {subtitle && <p className="t-body mt-1.5 max-w-md break-keep text-navy-400">{subtitle}</p>}
      {action && (
        <button onClick={action.onClick} className="btn-primary mt-5">
          {action.label}
        </button>
      )}
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
      <ChevronRight size={18} className="shrink-0 text-navy-400" />
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
  amber: 'bg-amber-50 text-amber-700',
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
          <span className="ml-0.5 text-[max(0.9rem,0.52em)] font-bold text-navy-400">
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
    amber: 'text-amber-700',
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
