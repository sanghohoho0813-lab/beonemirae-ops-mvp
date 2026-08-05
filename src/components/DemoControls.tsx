import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { RotateCcw, CheckCircle2, Settings2, ChevronDown, CalendarClock, PlayCircle } from 'lucide-react'
import { useData } from '../context/DataContext'
import { Modal } from './Modal'

// ─────────────────────────────────────────────────────────────────────────────
// 시연 안정화 컨트롤 (3.5단계)
//  · DemoResetButton  — /demo 상단 등 눈에 띄지 않는 위치의 "시연 상태 초기화"
//  · DemoSettingsPanel — 사이드바 하단 접이식 "시연 설정" (초기화·오늘복원·새 세션)
//  둘 다 시연용 변경만 기준 상태로 되돌리며, 실제 거래처 기본정보는 유지합니다.
// ─────────────────────────────────────────────────────────────────────────────

function Toast({ show, text }: { show: boolean; text: string }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-x-0 bottom-[84px] z-[60] flex justify-center px-4 lg:bottom-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ type: 'spring', stiffness: 360, damping: 30 }}
        >
          <div className="flex items-center gap-2.5 rounded-2xl bg-navy-900 px-4 py-3 text-[0.95rem] font-semibold text-white shadow-xl">
            <CheckCircle2 size={18} className="text-emerald-400" /> {text}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** /demo 상단 등에 두는 단독 초기화 버튼 (확인 모달 + 완료 토스트 포함) */
export function DemoResetButton({ className = '' }: { className?: string }) {
  const { resetDemo } = useData()
  const [open, setOpen] = useState(false)
  const [toast, setToast] = useState(false)

  function confirm() {
    resetDemo()
    setOpen(false)
    setToast(true)
    setTimeout(() => setToast(false), 3200)
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-[0.95rem] font-bold text-navy-500 shadow-card transition hover:bg-navy-50 ${className}`}
      >
        <RotateCcw size={15} strokeWidth={2.4} /> 시연 상태 초기화
      </button>

      <Modal
        open={open}
        title="시연 상태 초기화"
        onClose={() => setOpen(false)}
        footer={
          <>
            <button className="btn-ghost flex-1" onClick={() => setOpen(false)}>
              취소
            </button>
            <button className="btn-primary flex-1" onClick={confirm}>
              초기화
            </button>
          </>
        }
      >
        <p className="text-[0.95rem] leading-relaxed text-navy-700">
          시연용 데이터만 기본 상태로 되돌립니다. 실제 거래처 기본정보는 유지됩니다.
        </p>
        <ul className="mt-3 space-y-1 rounded-2xl bg-navy-50 p-3 text-[0.9rem] text-navy-500">
          <li>· 오늘 일정 · 수거이력 · 자재 · 재고 · 통계 기준값 복원</li>
          <li>· 병원 요청 · 처리장 인계 · 수거대장 초안 원복</li>
          <li>· 거래처 세트(5/15/35)와 실사용 입력 기록은 유지</li>
        </ul>
      </Modal>

      <Toast show={toast} text="시연 상태가 기본값으로 복원되었습니다." />
    </>
  )
}

/** 사이드바 하단 접이식 "시연 설정" — 눈에 띄지 않게 배치 */
export function DemoSettingsPanel() {
  const { resetDemo, restoreToday, startDemo } = useData()
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState<null | 'reset' | 'start'>(null)
  const [toast, setToast] = useState('')

  function fire(text: string, fn: () => void) {
    fn()
    setConfirm(null)
    setToast(text)
    setTimeout(() => setToast(''), 3200)
  }

  return (
    <div className="rounded-2xl bg-navy-50/70">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-[0.9rem] font-bold text-navy-500 transition hover:bg-navy-100"
      >
        <Settings2 size={15} strokeWidth={2.2} /> 시연 설정
        <ChevronDown size={14} className={`ml-auto transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="space-y-1.5 px-2 pb-2.5">
          <button
            onClick={() => setConfirm('reset')}
            className="flex w-full items-center gap-2 rounded-xl bg-white px-2.5 py-2 text-[0.9rem] font-semibold text-navy-600 transition hover:bg-navy-50"
          >
            <RotateCcw size={14} /> 시연 상태 초기화
          </button>
          <button
            onClick={() => fire('오늘 일정이 기준값으로 복원되었습니다.', restoreToday)}
            className="flex w-full items-center gap-2 rounded-xl bg-white px-2.5 py-2 text-[0.9rem] font-semibold text-navy-600 transition hover:bg-navy-50"
          >
            <CalendarClock size={14} /> 오늘 일정만 복원
          </button>
          <button
            onClick={() => setConfirm('start')}
            className="flex w-full items-center gap-2 rounded-xl bg-white px-2.5 py-2 text-[0.9rem] font-semibold text-navy-600 transition hover:bg-navy-50"
          >
            <PlayCircle size={14} /> 시연 시작 (새 세션)
          </button>
          <p className="px-1 pt-0.5 text-[0.78rem] leading-snug text-navy-400">
            시연용 변경만 되돌립니다. 실제 거래처 기본정보는 유지됩니다.
          </p>
        </div>
      )}

      <Modal
        open={confirm !== null}
        title={confirm === 'start' ? '시연 시작' : '시연 상태 초기화'}
        onClose={() => setConfirm(null)}
        footer={
          <>
            <button className="btn-ghost flex-1" onClick={() => setConfirm(null)}>
              취소
            </button>
            <button
              className="btn-primary flex-1"
              onClick={() =>
                confirm === 'start'
                  ? fire('새 시연 세션이 시작되었습니다.', startDemo)
                  : fire('시연 상태가 기본값으로 복원되었습니다.', resetDemo)
              }
            >
              {confirm === 'start' ? '시작' : '초기화'}
            </button>
          </>
        }
      >
        <p className="text-[0.95rem] leading-relaxed text-navy-700">
          {confirm === 'start'
            ? '현재 상태를 기준으로 새 시연 세션을 시작합니다. 이후 입력은 이 세션의 시연 기록으로 관리됩니다.'
            : '시연용 데이터만 기본 상태로 되돌립니다. 실제 거래처 기본정보는 유지됩니다.'}
        </p>
      </Modal>

      <Toast show={!!toast} text={toast} />
    </div>
  )
}
