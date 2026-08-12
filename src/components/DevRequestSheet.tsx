import { useState } from 'react'
import { CheckCircle2, Loader2, MessageSquarePlus, Send, Wrench } from 'lucide-react'
import { Modal } from './Modal'
import { useAuth } from '../context/AuthContext'
import { createDevRequest } from '../lib/repo'
import { DEV_REQUEST_TOPICS, canSendDevRequest } from '../lib/devRequests'
import { friendlyError } from '../lib/supabase'

// ─────────────────────────────────────────────────────────────────────────────
// 개발자에게 요청하기
//
//  지금까지는 쓰다가 불편한 것이 있어도 말할 자리가 없었습니다. 현장에서
//  대표님께 전화하고, 대표님이 모아 두었다가 개발자에게 전달합니다. 중간에서
//  빠지는 것이 생기고 언제 말한 것인지도 남지 않습니다.
//
//  ── 왜 고르는 항목을 먼저 두는가 ────────────────────────────────────────
//
//  빈 칸만 주면 대부분 아무것도 쓰지 않습니다. 쓰더라도 "불편해요"가 남아
//  무엇을 고쳐야 하는지 알 수 없습니다. 역할마다 다섯 가지를 미리 적어 두고
//  고르게 하면, 누르기만 해도 무엇이 문제인지 전달됩니다. 자유 의견은 그
//  아래에 따로 받습니다 — 목록에 없는 것이 늘 있습니다.
//
//  ── 보내는 사람 이름은 넘기지 않습니다 ──────────────────────────────────
//
//  서버가 로그인한 사람으로 채웁니다(0022). 화면에서 실어 보내면 남의 이름으로
//  요청을 넣을 수 있고, 요청함은 "누가 무엇을 필요로 하는가"가 전부인 자료라
//  그 이름이 틀리면 자료 자체가 쓸모없어집니다.
// ─────────────────────────────────────────────────────────────────────────────

export function DevRequestSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { role, mode } = useAuth()
  const [picked, setPicked] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const topics = role ? DEV_REQUEST_TOPICS[role] : []
  //  아무것도 고르지 않고 아무것도 쓰지 않은 요청은 서버가 거절합니다(0022).
  //  누르기 전에 알려 주는 편이 낫습니다.
  const canSend = (picked.length > 0 || message.trim().length > 0) && !busy

  const toggle = (t: string) =>
    setPicked((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))

  const close = () => {
    onClose()
    //  닫히는 애니메이션이 끝난 뒤에 비웁니다. 바로 지우면 사라지는 모습이 보입니다.
    window.setTimeout(() => {
      setPicked([])
      setMessage('')
      setError(null)
      setSent(false)
    }, 300)
  }

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      await createDevRequest({ topics: picked, message })
      setSent(true)
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      title="개발자에게 요청하기"
      onClose={close}
      footer={
        sent ? (
          <button className="btn-primary flex-1" onClick={close}>
            닫기
          </button>
        ) : (
          <>
            <button className="btn-ghost flex-1" onClick={close}>
              취소
            </button>
            <button className="btn-primary flex-1 disabled:opacity-40" disabled={!canSend} onClick={() => void submit()}>
              {busy ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} strokeWidth={2.4} />}
              보내기
            </button>
          </>
        )
      }
    >
      {mode !== 'live' ? (
        <p className="t-body break-keep font-bold text-navy-400">
          요청 보내기는 실제 운영 모드에서만 쓸 수 있습니다. 시연 모드에는 보낼 서버가 없습니다.
        </p>
      ) : sent ? (
        <div className="py-2 text-center">
          <CheckCircle2 size={44} className="mx-auto text-accent-500" />
          <p className="t-card mt-4 break-keep text-navy-900">요청을 보냈습니다</p>
          <p className="t-body mt-2 break-keep font-medium text-navy-500">
            대표님이 요청함에서 확인합니다. 처리 상태가 바뀌면 여기서 다시 열어 보실 수 있습니다.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-start gap-2.5 rounded-2xl bg-teal-50 px-4 py-3.5">
            <Wrench size={19} className="mt-0.5 shrink-0 text-teal-600" strokeWidth={2.2} />
            <p className="t-body min-w-0 break-keep font-medium text-teal-800">
              쓰면서 불편한 것, 실제와 다른 것을 알려 주세요. 해당하는 것을 모두 고르시면 됩니다.
            </p>
          </div>

          <div>
            <p className="t-label mb-2 block text-navy-600">해당하는 항목 (여러 개 고를 수 있습니다)</p>
            <div className="space-y-2">
              {topics.map((t) => {
                const on = picked.includes(t)
                return (
                  <button
                    key={t}
                    type="button"
                    data-dev-topic
                    aria-pressed={on}
                    onClick={() => toggle(t)}
                    className={`flex w-full items-start gap-3 rounded-2xl border-2 px-4 py-3.5 text-left transition ${
                      on ? 'border-teal-500 bg-teal-50' : 'border-navy-100 bg-white hover:border-navy-200'
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 ${
                        on ? 'border-teal-500 bg-teal-500 text-white' : 'border-navy-200 bg-white'
                      }`}
                    >
                      {on && <CheckCircle2 size={15} strokeWidth={3} />}
                    </span>
                    <span
                      className={`t-body min-w-0 flex-1 break-keep font-bold ${
                        on ? 'text-teal-900' : 'text-navy-700'
                      }`}
                    >
                      {t}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label htmlFor="dev-request-message" className="t-label mb-2 block text-navy-600">
              그 밖에 하고 싶은 말 (선택)
            </label>
            <textarea
              id="dev-request-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder="예) 아침에 일정이 많은 날은 목록에서 완료한 곳이 위로 올라가면 좋겠습니다."
              className="field-input w-full resize-none"
            />
          </div>

          {error && (
            <p className="t-body break-keep rounded-2xl bg-rose-50 px-4 py-3 font-bold text-rose-600">{error}</p>
          )}
        </div>
      )}
    </Modal>
  )
}

/**
 * 요청함을 여는 버튼 — 더보기·사이드바 어디에 놓아도 같은 모습이 되도록
 * 버튼과 시트를 함께 둡니다. 놓는 쪽은 className 만 정하면 됩니다.
 */
export function DevRequestButton({
  className = '',
  label = '개발자에게 요청하기',
  onOpen,
}: {
  className?: string
  label?: string
  /** 폰의 더보기 시트처럼, 열기 전에 닫아야 하는 것이 있을 때 */
  onOpen?: () => void
}) {
  const { role } = useAuth()
  const [open, setOpen] = useState(false)
  if (!canSendDevRequest(role)) return null

  return (
    <>
      <button
        data-dev-request-open
        onClick={() => {
          onOpen?.()
          setOpen(true)
        }}
        className={className}
      >
        <MessageSquarePlus size={17} strokeWidth={2.4} /> {label}
      </button>
      <DevRequestSheet open={open} onClose={() => setOpen(false)} />
    </>
  )
}
