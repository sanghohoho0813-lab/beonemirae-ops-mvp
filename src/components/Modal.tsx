import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useHistoryDismiss } from '../lib/useHistoryDismiss'

// ─────────────────────────────────────────────────────────────────────────────
// 바텀시트형 모달 — 모바일은 하단에서, 데스크톱은 중앙 정렬로 표시
//  viewport(fixed) 기준 — 모바일 미리보기 iframe 안에서는 프레임에 자연 contained
// ─────────────────────────────────────────────────────────────────────────────

interface ModalProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}

export function Modal({ open, title, onClose, children, footer }: ModalProps) {
  // 뒤로 가기(기기/브라우저)로 모달이 닫힙니다.
  useHistoryDismiss(open, onClose)

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
          <motion.div
            className="absolute inset-0 bg-navy-900/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.div
            className="relative z-10 max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:max-w-lg sm:rounded-3xl sm:pb-5"
            initial={{ y: '100%', opacity: 0.6 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0.6 }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-navy-900">{title}</h2>
              <button
                onClick={onClose}
                className="flex h-9 w-9 items-center justify-center rounded-full text-navy-400 hover:bg-navy-50"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>
            <div className="space-y-4">{children}</div>
            {footer && <div className="mt-6 flex gap-2">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
