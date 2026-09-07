import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { CheckCircle2, ChevronLeft, ChevronRight, Loader2, MessageSquarePlus, Send } from 'lucide-react'
import { Modal } from './Modal'
import { useAuth } from '../context/AuthContext'
import { createDevRequest } from '../lib/repo'
import { canSendDevRequest } from '../lib/devRequests'
import {
  GROUP_DESC, GROUP_LABEL, MANAGEMENT_BENEFITS, MANAGEMENT_PAINS, NA_LABEL, SCALES,
  STAFF_PAINS, USAGE_OPTIONS, WORK_LABEL, answerLabel, encodeResponse, stepsFor,
  type AnswerValue, type FeedbackQuestion, type PickOption, type RespondentGroup,
  type StaffWorkType, type UsageDuration,
} from '../lib/feedbackV2'
import { friendlyError } from '../lib/supabase'

// ─────────────────────────────────────────────────────────────────────────────
// 사용자 피드백 — 눌러서 끝내는 설문 (0100)
//
//  ── 예전 화면의 문제 ────────────────────────────────────────────────────
//
//  한 장에 서른 줄이 늘어서 있었습니다. 열자마자 「이걸 다 봐야 하나」가
//  되고, 대부분은 그대로 닫습니다. 게다가 물어보는 것이 전부 「무엇이
//  불편합니까」라, 좋아진 것은 답할 자리가 없었습니다.
//
//  ── 이번 모양 ───────────────────────────────────────────────────────────
//
//   ① 관점 고르기 (큰 카드 두 장)
//   ② 얼마나 써 보셨는지 — 직원은 무슨 일을 하시는지 함께
//   ③ 질문 단계 (한 단계에 다섯 문항, 관리 4단계 · 직원 3단계)
//   ④ 마무리 — 체감된 변화 · 불편한 곳 · 하고 싶은 말(선택)
//
//  ⚠ 답을 강요하지 않습니다. 안 고른 문항이 있어도 낼 수 있습니다. 억지로
//    채우게 하면 「아무거나」가 들어오는데, 그건 없는 것보다 나쁩니다.
//  ⚠ 고르면 자동으로 다음으로 넘기지 않습니다. 잘못 눌렀을 때 되돌릴 틈이
//    없고, 화면이 저 혼자 움직이면 나이 드신 분들이 특히 당황하십니다.
//  ⚠ 심사·평가 이야기는 화면 어디에도 쓰지 않습니다. 그 말이 보이는 순간
//    답이 「잘 보이려는 답」으로 바뀝니다.
// ─────────────────────────────────────────────────────────────────────────────

type Stage = 'group' | 'start' | 'questions' | 'wrapup' | 'sent'

export function FeedbackSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { mode } = useAuth()
  const [stage, setStage] = useState<Stage>('group')
  const [group, setGroup] = useState<RespondentGroup | null>(null)
  const [work, setWork] = useState<StaffWorkType | null>(null)
  const [usage, setUsage] = useState<UsageDuration | null>(null)
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({})
  const [benefits, setBenefits] = useState<string[]>([])
  const [pains, setPains] = useState<string[]>([])
  const [comment, setComment] = useState('')
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const topRef = useRef<HTMLDivElement>(null)
  //  ⚠ 두 번 보내기 막기 — 단추를 잠그는 것만으로는 모자랍니다. 통신이 느린
  //    현장에서 두 번 눌리면 같은 답이 두 건 쌓이고, 그러면 「두 사람이
  //    답했다」로 세어집니다.
  const sending = useRef(false)

  const steps = useMemo(() => (group ? stepsFor(group, work) : []), [group, work])

  //  단계가 바뀌면 맨 위부터 보여 드립니다 — 안 그러면 새 질문이 화면
  //  중간부터 시작해 첫 문항을 못 보고 지나칩니다.
  useEffect(() => {
    topRef.current?.scrollIntoView({ block: 'start' })
  }, [stage, step])

  const reset = () => {
    setStage('group'); setGroup(null); setWork(null); setUsage(null)
    setAnswers({}); setBenefits([]); setPains([]); setComment('')
    setStep(0); setError(null); setBusy(false)
    sending.current = false
  }

  const close = () => {
    onClose()
    //  닫히는 동안 내용이 사라지는 것이 보이지 않게, 애니메이션 뒤에 비웁니다.
    window.setTimeout(reset, 320)
  }

  const pick = (id: string, v: AnswerValue) =>
    //  같은 것을 다시 누르면 답이 지워집니다 — 잘못 눌렀을 때 되돌릴 길.
    setAnswers((prev) => (prev[id] === v ? omit(prev, id) : { ...prev, [id]: v }))

  const submit = async () => {
    if (sending.current || !group || !usage) return
    sending.current = true
    setBusy(true)
    setError(null)
    try {
      await createDevRequest({
        topics: encodeResponse({ group, workType: work, usage, answers, benefits, pains }),
        message: comment,
      })
      setStage('sent')
    } catch (e) {
      sending.current = false
      const raw = e instanceof Error ? e.message : String(e ?? '')
      setError(
        /dev_requests|schema cache|Could not find the table/i.test(raw)
          ? '피드백을 받아 둘 자리가 서버에 아직 없습니다. Supabase SQL Editor 에서 ' +
            'supabase/bundles/RUN_8_dev_requests.sql 을 한 번 실행하면 바로 됩니다.'
          : friendlyError(e),
      )
    } finally {
      setBusy(false)
    }
  }

  const cur = steps[step]
  const lastStep = step >= steps.length - 1
  const answeredHere = cur ? cur.questions.filter((x) => answers[x.id] !== undefined).length : 0

  return (
    <Modal
      open={open}
      title="사용해 보신 느낌"
      onClose={close}
      layout={stage === 'questions' || stage === 'wrapup' ? 'sticky' : 'scroll'}
      footer={<Footer />}
    >
      <div ref={topRef} />
      {mode !== 'live' ? (
        <p className="t-body break-keep font-bold text-navy-400">
          피드백 보내기는 실제 운영 모드에서만 쓸 수 있습니다. 시연 모드에는 보낼 서버가 없습니다.
        </p>
      ) : stage === 'group' ? (
        <GroupPick />
      ) : stage === 'start' ? (
        <StartPick />
      ) : stage === 'questions' && cur ? (
        <QuestionStep />
      ) : stage === 'wrapup' ? (
        <WrapUp />
      ) : (
        <Done />
      )}
      {error && stage !== 'sent' && (
        <p className="t-body break-keep rounded-2xl bg-rose-50 px-4 py-3 font-bold text-rose-600">{error}</p>
      )}
    </Modal>
  )

  // ── 화면들 ───────────────────────────────────────────────────────────────

  function GroupPick() {
    return (
      <div className="space-y-3">
        <div>
          <p className="t-card break-keep text-navy-900">어떤 관점에서 사용해 보셨나요?</p>
          <p className="t-body mt-1.5 break-keep font-medium text-navy-500">
            긴 글을 쓰실 필요 없습니다. 지금 느끼시는 대로 버튼만 눌러 주시면 됩니다.
            1~2분이면 끝납니다.
          </p>
        </div>
        {(['management', 'staff'] as RespondentGroup[]).map((g) => (
          <button
            key={g}
            data-fb-group={g}
            onClick={() => { setGroup(g); setStage('start') }}
            className="card pressable w-full p-4 text-left transition sm:p-5"
          >
            <span className="t-card block break-keep text-navy-900">{GROUP_LABEL[g]}</span>
            <span className="t-body mt-1.5 block break-keep font-medium text-navy-500">{GROUP_DESC[g]}</span>
          </button>
        ))}
      </div>
    )
  }

  function StartPick() {
    return (
      <div className="space-y-5">
        <div>
          <p className="t-card break-keep text-navy-900">이 시스템을 어느 정도 사용해 보셨나요?</p>
          {/*  ⚠ 이 답이 없으면 뒤의 점수를 어떻게 읽어야 할지 알 수 없습니다.
               사흘 써 보고 매긴 4점과 한 달 써 보고 매긴 4점은 다릅니다. */}
          <div className="mt-2.5 space-y-2">
            {USAGE_OPTIONS.map((o) => (
              <Choice
                key={o.value}
                attr={{ 'data-fb-usage': o.value }}
                on={usage === o.value}
                onClick={() => setUsage(o.value)}
              >
                {o.label}
              </Choice>
            ))}
          </div>
        </div>

        {group === 'staff' && (
          <div>
            <p className="t-card break-keep text-navy-900">주로 어떤 업무를 하시나요?</p>
            <div className="mt-2.5 space-y-2">
              {(['field', 'office', 'both'] as StaffWorkType[]).map((w) => (
                <Choice
                  key={w}
                  attr={{ 'data-fb-work': w }}
                  on={work === w}
                  onClick={() => setWork(w)}
                >
                  {WORK_LABEL[w]}
                </Choice>
              ))}
            </div>
            {work === 'both' && (
              <p className="t-muted mt-2 break-keep text-navy-500">
                두 가지를 다 하시는 분께는 현장 쪽 질문을 보여 드립니다. 짧게 끝내시라고요.
              </p>
            )}
          </div>
        )}
      </div>
    )
  }

  function QuestionStep() {
    if (!cur) return null
    return (
      <div className="space-y-3">
        <div>
          <div className="flex items-baseline justify-between gap-2">
            <p className="t-card min-w-0 break-keep text-navy-900">{cur.title}</p>
            <span data-fb-progress className="t-muted shrink-0 font-bold text-navy-500">
              {step + 1} / {steps.length}
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-navy-100">
            <div
              className="h-full rounded-full bg-teal-500 transition-[width] duration-300"
              style={{ width: `${((step + 1) / steps.length) * 100}%` }}
            />
          </div>
          <p className="t-muted mt-2 break-keep text-navy-500">
            {answeredHere} / {cur.questions.length} 답하셨습니다. 잘 모르겠는 것은 「{NA_LABEL}」를 눌러 주세요.
          </p>
        </div>

        {cur.questions.map((x) => (
          <QuestionCard key={x.id} q={x} value={answers[x.id]} onPick={(v) => pick(x.id, v)} />
        ))}
      </div>
    )
  }

  function WrapUp() {
    return (
      <div className="space-y-5">
        <div className="rounded-2xl bg-teal-50 px-4 py-3.5">
          <p className="t-body break-keep font-extrabold text-teal-900">거의 다 됐습니다.</p>
          <p className="t-body mt-1 break-keep font-medium text-teal-800">
            정답은 없습니다. 지금 느끼시는 그대로 골라 주시면 다음 개선에 반영하겠습니다.
          </p>
        </div>

        {group === 'management' && (
          <PickList
            label="가장 체감되는 변화가 있다면 골라 주세요"
            attr="data-fb-benefit"
            options={MANAGEMENT_BENEFITS}
            picked={benefits}
            onChange={setBenefits}
          />
        )}

        <PickList
          label={group === 'management' ? '아직 불편한 부분이 있다면 골라 주세요' : '사용하면서 불편했던 부분이 있다면 골라 주세요'}
          attr="data-fb-pain"
          options={group === 'management' ? MANAGEMENT_PAINS : STAFF_PAINS}
          picked={pains}
          onChange={setPains}
        />

        <div>
          <label htmlFor="feedback-comment" className="t-label mb-2 block text-navy-600">
            따로 알려 주실 내용이 있으면 적어 주세요 (선택)
          </label>
          <textarea
            id="feedback-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            placeholder="없으면 작성하지 않고 바로 제출하셔도 됩니다."
            className="field-input w-full resize-none"
          />
        </div>
      </div>
    )
  }

  function Done() {
    return (
      <div className="py-2 text-center">
        <CheckCircle2 size={44} className="mx-auto text-accent-500" />
        <p className="t-card mt-4 break-keep text-navy-900">피드백이 등록되었습니다</p>
        <p className="t-body mt-2 break-keep font-medium text-navy-500">
          체크해 주신 내용은 다음 사용성 개선과 실제 업무효과 확인에 활용됩니다.
        </p>
      </div>
    )
  }

  // ── 아래 단추 ────────────────────────────────────────────────────────────

  function Footer() {
    if (mode !== 'live') {
      return <button className="btn-primary flex-1" onClick={close}>닫기</button>
    }
    if (stage === 'sent') {
      return <button data-fb-done className="btn-primary flex-1" onClick={close}>확인</button>
    }
    if (stage === 'group') {
      return <button className="btn-ghost flex-1" onClick={close}>나중에 하기</button>
    }

    const back = () => {
      setError(null)
      if (stage === 'start') { setStage('group'); return }
      if (stage === 'questions') {
        if (step === 0) { setStage('start'); return }
        setStep(step - 1); return
      }
      //  마무리 → 마지막 질문 단계
      setStage('questions'); setStep(Math.max(0, steps.length - 1))
    }

    const next = () => {
      setError(null)
      if (stage === 'start') { setStage('questions'); setStep(0); return }
      if (!lastStep) { setStep(step + 1); return }
      setStage('wrapup')
    }

    //  시작 화면에서만 막습니다 — 사용 정도(와 직원의 업무)는 뒤의 답을
    //  읽는 기준이라, 이것이 비면 답 전체를 어떻게 봐야 할지 알 수 없습니다.
    const startReady = usage !== null && (group !== 'staff' || work !== null)

    return (
      <>
        <button data-fb-back className="btn-ghost flex-1" onClick={back} disabled={busy}>
          <ChevronLeft size={17} strokeWidth={2.4} /> 이전
        </button>
        {stage === 'wrapup' ? (
          <button
            data-fb-submit
            className="btn-primary flex-[1.4] disabled:opacity-40"
            disabled={busy}
            onClick={() => void submit()}
          >
            {busy ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} strokeWidth={2.4} />}
            피드백 제출하기
          </button>
        ) : (
          <button
            data-fb-next
            className="btn-primary flex-[1.4] disabled:opacity-40"
            disabled={stage === 'start' && !startReady}
            onClick={next}
          >
            다음 <ChevronRight size={17} strokeWidth={2.4} />
          </button>
        )}
      </>
    )
  }
}

const omit = (o: Record<string, AnswerValue>, k: string) => {
  const { [k]: _drop, ...rest } = o
  return rest
}

/** 한 줄짜리 고르기 단추 (사용 정도·업무 종류) */
function Choice({
  on, onClick, children, attr,
}: {
  on: boolean
  onClick: () => void
  children: ReactNode
  attr?: Record<string, string>
}) {
  return (
    <button
      type="button"
      {...attr}
      aria-pressed={on}
      onClick={onClick}
      className={`flex min-h-[3.25rem] w-full items-center gap-2.5 rounded-2xl border-2 px-4 py-3 text-left transition ${
        on ? 'border-teal-500 bg-teal-50' : 'border-navy-100 bg-white hover:border-navy-200 hover:bg-navy-50'
      }`}
    >
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
          on ? 'border-teal-500 bg-teal-500 text-white' : 'border-navy-200 bg-white'
        }`}
      >
        {on && <CheckCircle2 size={13} strokeWidth={3} />}
      </span>
      <span className={`t-body min-w-0 break-keep font-bold ${on ? 'text-teal-900' : 'text-navy-700'}`}>
        {children}
      </span>
    </button>
  )
}

/**
 * 문항 하나 — 다섯 칸 + 「아직 판단하기 어려워요」.
 *
 *  ⚠ 숫자만 두지 않습니다. 아래에 양 끝의 뜻을 적어 두고, 고르면 그 자리에
 *    **고른 말**이 나옵니다. 「4」만 남으면 다음 날 본인도 무슨 뜻이었는지
 *    모릅니다.
 *  ⚠ 폰(360px)에서 한 칸이 57px 입니다 — 손가락 기준 44px 을 넘고, 칸 사이도
 *    8px 이라 옆 것을 잘못 누르지 않습니다.
 */
function QuestionCard({
  q, value, onPick,
}: {
  q: FeedbackQuestion
  value: AnswerValue | undefined
  onPick: (v: AnswerValue) => void
}) {
  const s = SCALES[q.scale]
  return (
    <div data-fb-question={q.id} className="card p-4">
      <p className="t-body break-keep font-bold text-navy-900">{q.text}</p>

      <div className="mt-3 flex gap-2">
        {([1, 2, 3, 4, 5] as const).map((n) => {
          const on = value === n
          return (
            <button
              key={n}
              type="button"
              data-fb-choice={`${q.id}:${n}`}
              aria-pressed={on}
              aria-label={`${n} — ${s.labels[n - 1]}`}
              onClick={() => onPick(n)}
              className={`flex min-h-[3.25rem] flex-1 items-center justify-center rounded-2xl border-2 text-[1.15rem] font-extrabold tabular-nums transition ${
                on ? 'border-teal-500 bg-teal-500 text-white' : 'border-navy-100 bg-white text-navy-500 hover:border-navy-200 hover:bg-navy-50'
              }`}
            >
              {n}
            </button>
          )
        })}
      </div>

      {value === undefined || value === 'na' ? (
        <div className="mt-1.5 flex items-baseline justify-between gap-2">
          <span className="t-muted shrink-0 text-navy-400">← {s.low}</span>
          <span className="t-muted shrink-0 text-navy-400">{s.high} →</span>
        </div>
      ) : (
        <p data-fb-picked className="t-muted mt-1.5 break-keep font-bold text-teal-700">
          고르신 답 — {answerLabel(q.scale, value)}
        </p>
      )}

      <button
        type="button"
        data-fb-choice={`${q.id}:na`}
        aria-pressed={value === 'na'}
        onClick={() => onPick('na')}
        className={`mt-2.5 flex min-h-[2.75rem] w-full items-center justify-center rounded-2xl border-2 px-3 py-2 text-center transition ${
          value === 'na' ? 'border-navy-700 bg-navy-700 text-white' : 'border-navy-100 bg-navy-50 text-navy-500 hover:border-navy-200'
        }`}
      >
        <span className="t-muted break-keep font-bold">{NA_LABEL}</span>
      </button>
    </div>
  )
}

/**
 * 여러 개 고르는 목록.
 *
 *  ⚠ 「특별히 불편한 점 없음」 같은 것을 고르면 나머지가 풀립니다. 둘 다
 *    켜져 있으면 읽는 사람이 어느 쪽을 믿어야 할지 알 수 없습니다.
 */
function PickList({
  label, options, picked, onChange, attr,
}: {
  label: string
  options: PickOption[]
  picked: string[]
  onChange: (v: string[]) => void
  attr: string
}) {
  const exclusives = new Set(options.filter((x) => x.exclusive).map((x) => x.label))
  const toggle = (o: PickOption) => {
    if (picked.includes(o.label)) { onChange(picked.filter((x) => x !== o.label)); return }
    if (o.exclusive) { onChange([o.label]); return }
    onChange([...picked.filter((x) => !exclusives.has(x)), o.label])
  }

  return (
    <div>
      <p className="t-label mb-2.5 block text-navy-600">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = picked.includes(o.label)
          return (
            <button
              key={o.label}
              type="button"
              {...{ [attr]: o.label }}
              aria-pressed={on}
              onClick={() => toggle(o)}
              className={`min-h-[2.75rem] rounded-2xl border-2 px-3.5 py-2 text-left transition ${
                on ? 'border-teal-500 bg-teal-50 text-teal-900' : 'border-navy-100 bg-white text-navy-600 hover:border-navy-200'
              }`}
            >
              <span className="t-muted break-keep font-bold">{o.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * 피드백을 여는 단추 — 사이드바·더보기 어디에 놓아도 같은 모습이 되도록
 * 단추와 창을 함께 둡니다. 놓는 쪽은 className 만 정하면 됩니다.
 */
export function FeedbackButton({
  className = '',
  label = '사용 후기 남기기',
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
      <FeedbackSheet open={open} onClose={() => setOpen(false)} />
    </>
  )
}
