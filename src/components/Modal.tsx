import { useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useHistoryDismiss } from '../lib/useHistoryDismiss'
import { usePrintIsolate } from '../lib/usePrintIsolate'

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
  /**
   * 이 모달 안에 인쇄 버튼이 있을 때 켭니다.
   * 켜면 인쇄할 때 뒤 화면이 빠지고 모달 내용만 A4 로 흐릅니다.
   * (수거대장 미리보기처럼 표가 길어도 여러 장으로 이어집니다)
   */
  printable?: boolean
}

export function Modal({ open, title, onClose, children, footer, printable = false }: ModalProps) {
  // 뒤로 가기(기기/브라우저)로 모달이 닫힙니다.
  useHistoryDismiss(open, onClose)
  const boxRef = useRef<HTMLDivElement>(null)
  usePrintIsolate(boxRef, open && printable)

  return (
    <AnimatePresence>
      {open && (
        <div
          ref={boxRef}
          className={`fixed inset-0 z-50 flex items-end justify-center sm:items-center${
            printable ? ' print:static print:block' : ''
          }`}
          role="dialog"
          aria-modal="true"
        >
          <motion.div
            className="absolute inset-0 bg-navy-900/40 backdrop-blur-sm print:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.div
            className={`relative z-10 max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:max-w-lg sm:rounded-3xl sm:pb-5${
              printable
                ? ' print:max-h-none print:max-w-none print:overflow-visible print:rounded-none print:p-0 print:shadow-none'
                : ''
            }`}
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
                <X size={19} strokeWidth={2.4} />
              </button>
            </div>
            <div className="space-y-4">{children}</div>
            {footer && <div className="mt-6 flex gap-2 print:hidden">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
