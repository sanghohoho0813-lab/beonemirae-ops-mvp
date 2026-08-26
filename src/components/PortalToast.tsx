import { useEffect, useState } from 'react'
import { CheckCircle2, AlertTriangle } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'

// ─────────────────────────────────────────────────────────────────────────────
// 짧은 확인 문구 (0089)
//
//  대표님: 「Modal action 완료 후 짧고 명확한 feedback … 과도한 animation 금지」
//
//  ⚠ 창이 닫히면 병원 담당자는 「보내진 게 맞나」를 확인할 데가 없습니다.
//    화면 아래에서 한 줄 올라왔다 사라집니다.
//  ⚠ **성공했을 때만** 띄웁니다. 실패는 창 안에서 적은 내용을 남겨 둔 채
//    말해야 합니다 — 사라지는 문구로 알리면 다시 적을 방법이 없습니다.
// ─────────────────────────────────────────────────────────────────────────────

const EVENT = 'beonemirae:toast'

export function toast(text: string, tone: 'ok' | 'warn' = 'ok') {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { text, tone } }))
}

export function PortalToaster() {
  const [msg, setMsg] = useState<{ text: string; tone: 'ok' | 'warn' } | null>(null)

  useEffect(() => {
    let timer = 0
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ text: string; tone: 'ok' | 'warn' }>).detail
      setMsg(d)
      window.clearTimeout(timer)
      //  ⚠ 4초. 짧게 두면 요양병원 담당자분이 다 읽기 전에 사라집니다.
      timer = window.setTimeout(() => setMsg(null), 4000)
    }
    window.addEventListener(EVENT, on)
    return () => {
      window.removeEventListener(EVENT, on)
      window.clearTimeout(timer)
    }
  }, [])

  return (
    <AnimatePresence>
      {msg && (
        <motion.div
          data-toast
          role="status"
          aria-live="polite"
          //  ⚠ z 는 창(70)보다 위입니다 — 창이 닫히는 사이에도 보여야 합니다.
          //  ⚠ 폰 하단 탭띠를 피해 위로 띄웁니다.
          className="pointer-events-none fixed inset-x-0 bottom-[5.5rem] z-[80] flex justify-center px-4 sm:bottom-8"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.18 }}
        >
          <span
            className={`flex max-w-[32rem] items-center gap-2.5 rounded-2xl px-4 py-3 shadow-2xl ${
              msg.tone === 'ok' ? 'bg-navy-900 text-white' : 'bg-rose-600 text-white'
            }`}
          >
            {msg.tone === 'ok' ? (
              <CheckCircle2 size={20} strokeWidth={2.5} className="shrink-0 text-teal-300" />
            ) : (
              <AlertTriangle size={20} strokeWidth={2.5} className="shrink-0" />
            )}
            <span className="t-body min-w-0 break-keep font-bold">{msg.text}</span>
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
