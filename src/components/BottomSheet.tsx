import { AnimatePresence, motion, useDragControls } from 'framer-motion'
import { X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { useHistoryDismiss } from '../lib/useHistoryDismiss'
import { useEscapeClose } from '../lib/useEscapeClose'

// ─────────────────────────────────────────────────────────────────────────────
// 바텀시트 — 모바일에서 아래에서 부드럽게 올라오는 시트
//  · 드래그는 상단 핸들에서만 시작 → 내용 영역은 네이티브 세로 스크롤이 정상 동작
//    (글자 크기를 '매우 크게'로 키워 내용이 길어져도 아래까지 스크롤됩니다.)
//  · 뒤로 가기(기기/브라우저)로 시트가 닫힙니다. (useHistoryDismiss)
// ─────────────────────────────────────────────────────────────────────────────

interface BottomSheetProps {
  open: boolean
  title?: string
  onClose: () => void
  children: ReactNode
}

export function BottomSheet({ open, title, onClose, children }: BottomSheetProps) {
  const dragControls = useDragControls()

  // 뒤로 가기와 연동 (열릴 때 history push, 뒤로 가기 시 닫기)
  useHistoryDismiss(open, onClose)

  // ESC 로도 닫습니다. 닫는 방법이 ✕·배경 탭·스와이프뿐이면
  // 시트가 열린 줄 모르고 다른 곳을 누르다 막히는 일이 생깁니다.
  //  ⚠ 0103 — 공용 쌓기(useEscapeClose)로 옮겼습니다. 이 시트 위에 창이
  //    떠 있을 때 Esc 가 둘 다 닫던 것을 막습니다 — 맨 위 것만 닫힙니다.
  useEscapeClose(open, onClose)

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
        <div className="fixed inset-0 z-50">
          <motion.div
            className="absolute inset-0 bg-navy-900/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.div
            className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[88dvh] max-w-2xl flex-col rounded-t-3xl bg-white shadow-2xl"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            drag="y"
            dragListener={false}
            dragControls={dragControls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120) onClose()
            }}
          >
            {/* 드래그 핸들 + 제목 (여기서만 드래그 시작 — 내용은 자유롭게 스크롤) */}
            <div
              onPointerDown={(e) => dragControls.start(e)}
              style={{ touchAction: 'none' }}
              className="shrink-0 cursor-grab rounded-t-3xl bg-white pt-3 active:cursor-grabbing"
            >
              <div className="mx-auto h-1.5 w-10 rounded-full bg-navy-200" />
              {title && (
                <div className="flex w-full items-center justify-between px-5 pb-2 pt-3">
                  <h2 className="text-lg font-bold text-navy-900">{title}</h2>
                  <button
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={onClose}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-navy-400 hover:bg-navy-50"
                    aria-label="닫기"
                  >
                    <X size={19} strokeWidth={2.4} />
                  </button>
                </div>
              )}
            </div>
            {/* 스크롤 영역 */}
            {/* 하단 탭바는 시트 위에 떠 있습니다(앱의 기본 이동 수단이라 항상 눌려야 합니다).
                그만큼 아래에 자리를 비워 두지 않으면 마지막 항목이 탭바에 가립니다. */}
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[calc(4.9rem+env(safe-area-inset-bottom))] pt-2">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
