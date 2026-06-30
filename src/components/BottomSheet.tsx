import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, type ReactNode } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// 바텀시트 — 모바일에서 아래에서 부드럽게 올라오는 시트
// ─────────────────────────────────────────────────────────────────────────────

interface BottomSheetProps {
  open: boolean
  title?: string
  onClose: () => void
  children: ReactNode
}

export function BottomSheet({ open, title, onClose, children }: BottomSheetProps) {
  // 열려 있을 때 배경 스크롤 잠금
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  return (
    <AnimatePresence>
      {open && (
        <div className="absolute inset-0 z-50">
          <motion.div
            className="absolute inset-0 bg-navy-900/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.div
            className="absolute inset-x-0 bottom-0 max-h-[88%] overflow-y-auto rounded-t-3xl bg-white pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120) onClose()
            }}
          >
            {/* 드래그 핸들 */}
            <div className="sticky top-0 z-10 flex flex-col items-center rounded-t-3xl bg-white pt-3">
              <div className="h-1.5 w-10 rounded-full bg-navy-200" />
              {title && (
                <div className="flex w-full items-center justify-between px-5 pb-2 pt-3">
                  <h2 className="text-lg font-bold text-navy-900">{title}</h2>
                  <button
                    onClick={onClose}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-navy-400 hover:bg-navy-50"
                    aria-label="닫기"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
            <div className="px-5 pt-2">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
