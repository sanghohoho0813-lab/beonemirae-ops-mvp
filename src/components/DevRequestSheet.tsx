import { useState } from 'react'
import { CheckCircle2, Loader2, MessageSquarePlus, Send, Wrench } from 'lucide-react'
import { Modal } from './Modal'
import { useAuth } from '../context/AuthContext'
import { createDevRequest } from '../lib/repo'
import { DEV_REQUEST_TOPICS, canSendDevRequest, devTopicLabel } from '../lib/devRequests'
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
//  무엇을 고쳐야 하는지 알 수 없습니다.
//
//  주제를 다섯 개로 나누고 주제마다 실제로 일어나는 일을 네댓 가지 적어
//  둡니다. 고르는 사람은 자기 주제를 먼저 찾고 그 안에서 고릅니다. 평면으로
//  다섯 개만 늘어놓으면 "내 얘기가 이 중에 없는데" 가 되는데, 실제로 불편한
//  것은 「수거 입력」 안의 어느 대목이지 "수거 입력이 불편하다" 가 아닙니다.
//  자유 의견은 그 아래에 따로 받습니다 — 목록에 없는 것이 늘 있습니다.
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

  const groups = role ? DEV_REQUEST_TOPICS[role] : []
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
      //  요청함 테이블이 아직 없는 경우입니다(0022 미적용). 일반 문구는
      //  「관리자에게 DB 업데이트를 요청하세요」인데, 이 화면은 대표님도
      //  씁니다 — 본인이 관리자인데 관리자에게 요청하라는 말이 됩니다.
      //  무엇을 해야 하는지 그대로 적어 둡니다.
      const raw = e instanceof Error ? e.message : String(e ?? '')
      setError(
        /dev_requests|schema cache|Could not find the table/i.test(raw)
          ? '요청함이 서버에 아직 만들어지지 않았습니다. Supabase SQL Editor 에서 ' +
            'supabase/bundles/RUN_8_dev_requests.sql 을 한 번 실행하면 바로 됩니다.'
          : friendlyError(e),
      )
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

          <div className="space-y-4">
            <p className="t-label block text-navy-600">
              해당하는 항목을 골라 주세요 (주제마다 여러 개 고를 수 있습니다)
            </p>
            {groups.map((g) => {
              const chosen = g.options.filter((o) => picked.includes(devTopicLabel(g.subject, o))).length
              return (
                <div key={g.subject} data-dev-group={g.subject}>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="h-4 w-1 shrink-0 rounded-full bg-teal-500" />
                    <p className="t-body min-w-0 break-keep font-extrabold text-navy-900">{g.subject}</p>
                    {chosen > 0 && (
                      <span className="pill shrink-0 bg-teal-50 text-teal-700">{chosen}개 선택</span>
                    )}
                  </div>
                  <div className="space-y-1.5 pl-3">
                    {g.options.map((o) => {
                      const label = devTopicLabel(g.subject, o)
                      const on = picked.includes(label)
                      return (
                        <button
                          key={o}
                          type="button"
                          data-dev-topic
                          aria-pressed={on}
                          onClick={() => toggle(label)}
                          className={`flex w-full items-start gap-2.5 rounded-2xl border-2 px-3.5 py-3 text-left transition ${
                            on ? 'border-teal-500 bg-teal-50' : 'border-navy-100 bg-white hover:border-navy-200'
                          }`}
                        >
                          <span
                            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 ${
                              on ? 'border-teal-500 bg-teal-500 text-white' : 'border-navy-200 bg-white'
                            }`}
                          >
                            {on && <CheckCircle2 size={13} strokeWidth={3} />}
                          </span>
                          <span
                            className={`t-body min-w-0 flex-1 break-keep font-bold ${
                              on ? 'text-teal-900' : 'text-navy-700'
                            }`}
                          >
                            {o}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
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
