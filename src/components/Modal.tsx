import { useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useHistoryDismiss } from '../lib/useHistoryDismiss'
import { useEscapeClose } from '../lib/useEscapeClose'
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
  /**
   *  'sticky' — 아래 버튼을 **화면 아래에 붙여** 둡니다 (0100 설문).
   *
   *   기본값 'scroll' 은 지금까지의 모습 그대로입니다: 머리말·내용·버튼이
   *   통째로 스크롤됩니다. 대부분의 창은 내용이 짧아 그것으로 충분합니다.
   *
   *   설문처럼 내용이 긴 창에서는 「다음」이 저 아래에 있어, 답을 다 고르고도
   *   한참 내려야 다음으로 넘어갑니다. 그때만 이 모양을 씁니다 — 버튼은
   *   자리를 차지한 채로 붙어 있어서(자리를 비워 두는 sticky) 마지막 질문이나
   *   글 쓰는 칸을 **가리지 않습니다.**
   */
  layout?: 'scroll' | 'sticky'
}

export function Modal({ open, title, onClose, children, footer, printable = false, layout = 'scroll' }: ModalProps) {
  // 뒤로 가기(기기/브라우저)로 모달이 닫힙니다.
  useHistoryDismiss(open, onClose)
  //  ⚠ 0103 — 병원 화면의 창은 Esc 로 닫히는데 내부 창은 안 닫혔습니다.
  //    PC 에서 제일 빠른 닫기입니다. 맨 위 창 하나만 닫습니다.
  useEscapeClose(open, onClose)
  const boxRef = useRef<HTMLDivElement>(null)
  usePrintIsolate(boxRef, open && printable)

  return (
    <AnimatePresence>
      {open && (
        <div
          ref={boxRef}
          /*  z-[60] — 하단 탭바(z-[55])보다 위입니다.
              전에는 모달이 z-50 이라 탭바가 모달을 덮었습니다. 폰에서 모달은
              화면 아래에 붙어 열리는데(items-end), 하단 버튼이 정확히 탭바
              자리에 놓입니다. 그래서 「보내기」·「저장」 같은 버튼이 눌리지
              않았습니다 — 눌리지 않는 것이 아니라 탭바가 대신 눌렸습니다.
              탭바가 시트보다 위여야 하는 이유(z-[55])는 그대로 두고,
              모달만 그보다 위로 올립니다. 모달은 지금 하는 일 하나에
              집중하는 화면이라 탭바에 가려서는 안 됩니다. */
          className={`fixed inset-0 z-[60] flex items-end justify-center sm:items-center${
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
            className={`relative z-10 flex max-h-[92dvh] w-full flex-col rounded-t-3xl bg-white shadow-2xl sm:max-w-lg sm:rounded-3xl${
              layout === 'sticky' ? '' : ' overflow-y-auto'
            } p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:pb-5${
              printable
                ? ' print:max-h-none print:max-w-none print:overflow-visible print:rounded-none print:p-0 print:shadow-none'
                : ''
            }`}
            initial={{ y: '100%', opacity: 0.6 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0.6 }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
          >
            <div className="mb-4 flex shrink-0 items-center justify-between">
              <h2 className="text-lg font-bold text-navy-900">{title}</h2>
              <button
                onClick={onClose}
                /*  ⚠ 0100 — 36~40px 이었습니다. 손가락 기준(44px)에 못 미쳐서,
                    폰에서 닫으려다 뒤 화면이 눌리는 일이 있었습니다.
                    보이는 동그라미 크기는 그대로 두고 누르는 자리만 넓힙니다. */
                className="-mr-1.5 flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-navy-400 hover:bg-navy-50"
                aria-label="닫기"
              >
                <X size={19} strokeWidth={2.4} />
              </button>
            </div>
            <div className={`space-y-4${layout === 'sticky' ? ' min-h-0 flex-1 overflow-y-auto' : ''}`}>
              {children}
            </div>
            {footer && (
              <div
                data-modal-footer
                className={`mt-6 flex shrink-0 gap-2 print:hidden${
                  //  붙은 버튼은 내용과 사이를 갈라 줘야 「가려진 것이 아니라
                  //  놓인 것」으로 읽힙니다.
                  layout === 'sticky' ? ' -mx-5 -mb-[max(1.25rem,env(safe-area-inset-bottom))] border-t border-navy-100 bg-white px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 sm:-mb-5 sm:pb-5' : ''
                }`}
              >
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
