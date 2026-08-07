import { motion, type Variants } from 'framer-motion'
import type { ReactNode } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// 공용 모션 프리미티브 (framer-motion)
// 과하지 않게 150~250ms 의 짧고 고급스러운 전환만 사용합니다.
// ─────────────────────────────────────────────────────────────────────────────

const EASE = [0.22, 1, 0.36, 1] as const // easeOutQuint 느낌

/** 페이지 등장 — 부드러운 fade + y축 이동 */
export function PageMotion({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: EASE }}
    >
      {children}
    </motion.div>
  )
}

const containerVariants: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.05, delayChildren: 0.02 },
  },
}

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: EASE } },
}

/** 리스트/그리드 컨테이너 — 자식 요소를 순차 등장(stagger) */
export function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" className={className}>
      {children}
    </motion.div>
  )
}

/** Stagger 내부 항목 */
export function StaggerItem({
  children,
  className,
  'data-tour': dataTour,
}: {
  children: ReactNode
  className?: string
  /** 제품 투어 대상 표시 (그대로 DOM 으로 전달) */
  'data-tour'?: string
}) {
  return (
    <motion.div variants={itemVariants} className={className} data-tour={dataTour}>
      {children}
    </motion.div>
  )
}

/** 터치 피드백이 있는 버튼/카드 래퍼 */
export function Tappable({
  children,
  className,
  onClick,
  as = 'button',
}: {
  children: ReactNode
  className?: string
  onClick?: () => void
  as?: 'button' | 'div'
}) {
  const Comp = as === 'button' ? motion.button : motion.div
  return (
    <Comp whileTap={{ scale: 0.98 }} transition={{ duration: 0.15, ease: EASE }} className={className} onClick={onClick}>
      {children}
    </Comp>
  )
}
