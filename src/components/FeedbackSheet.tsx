import { useMemo, useRef, useState, type ReactNode } from 'react'
import { CheckCircle2, Loader2, MessageSquarePlus, Send } from 'lucide-react'
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
// 사용자 피드백 — 스크롤하며 눌러 내려가는 설문 (0100)
//
//  ── 예전 화면의 문제 ────────────────────────────────────────────────────
//
//  v1 은 한 장에 서른 줄이 늘어서 있었고, 물어보는 것이 전부 「무엇이
//  불편합니까」였습니다. 열자마자 닫게 되고, 좋아진 것은 답할 자리가
//  없었습니다.
//
//  ── 왜 단계(다음 → 다음)를 걷어냈는가 ───────────────────────────────────
//
//  처음에는 네 단계로 나눠 「다음」으로 넘기게 만들었습니다. 대표님이
//  써 보시고 바로 말씀하셨습니다 — 「그냥 계속 스크롤 내리면서 뚝 쭉쭉쭉
//  이렇게 할 수 있게.」 맞는 말씀입니다. 폰에서 답하다가 다음 단추를 찾아
//  내려가고, 화면이 갈리고, 다시 위로 올라가는 것이 답하는 것보다 오래
//  걸립니다. 손가락은 이미 스크롤 중인데 흐름을 끊는 셈입니다.
//
//  그래서 **한 화면에 전부** 둡니다. 다만 통으로 늘어놓지는 않습니다 —
//  묶음(1/4, 2/4…)마다 제목을 달아 어디쯤인지 보이게 하고, 아래에 붙은
//  띠에 「몇 문항 답했는지」와 제출 단추를 늘 띄워 둡니다.
//
//   ① 관점 고르기 (큰 카드 두 장) — 고르면 아래가 이어서 열립니다
//   ② 얼마나 써 보셨는지 — 직원은 무슨 일을 하시는지 함께
//   ③ 묶음별 질문 — 관리 4묶음 20문항 · 현장 3묶음 15문항
//   ④ 마무리 — 체감된 변화 · 불편한 곳 · 하고 싶은 말(선택)
//
//  ⚠ 답을 강요하지 않습니다. 안 고른 문항이 있어도 낼 수 있습니다. 억지로
//    채우게 하면 「아무거나」가 들어오는데, 그건 없는 것보다 나쁩니다.
//  ⚠ 고르면 화면이 저 혼자 움직이지 않습니다. 스크롤은 손이 합니다.
//  ⚠ 심사·평가 이야기는 화면 어디에도 쓰지 않습니다. 그 말이 보이는 순간
//    답이 「잘 보이려는 답」으로 바뀝니다.
// ─────────────────────────────────────────────────────────────────────────────

export function FeedbackSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { mode } = useAuth()
  const [group, setGroup] = useState<RespondentGroup | null>(null)
  const [work, setWork] = useState<StaffWorkType | null>(null)
  const [usage, setUsage] = useState<UsageDuration | null>(null)
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({})
  const [benefits, setBenefits] = useState<string[]>([])
  const [pains, setPains] = useState<string[]>([])
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const usageRef = useRef<HTMLDivElement>(null)
  //  ⚠ 두 번 보내기 막기 — 단추를 잠그는 것만으로는 모자랍니다. 통신이 느린
  //    현장에서 두 번 눌리면 같은 답이 두 건 쌓이고, 「두 사람이 답했다」로
  //    세어집니다.
  const sending = useRef(false)

  const groups = useMemo(() => (group ? stepsFor(group, work) : []), [group, work])
  const shownQuestions = useMemo(() => groups.flatMap((g) => g.questions), [groups])
  //  ⚠ 지금 화면에 보이는 문항의 답만 셉니다. 관점을 바꾸면 예전 관점의 답이
  //    state 에는 남지만(되돌아오면 그대로 있게), 세지도 보내지도 않습니다.
  const mine = useMemo(
    () => Object.fromEntries(shownQuestions.filter((q) => answers[q.id] !== undefined).map((q) => [q.id, answers[q.id]!])),
    [shownQuestions, answers],
  )
  const done = Object.keys(mine).length

  const reset = () => {
    setGroup(null); setWork(null); setUsage(null)
    setAnswers({}); setBenefits([]); setPains([]); setComment('')
    setError(null); setBusy(false); setSent(false)
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
        topics: encodeResponse({ group, workType: work, usage, answers: mine, benefits, pains }),
        message: comment,
      })
      setSent(true)
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

  const ready = usage !== null && (group !== 'staff' || work !== null)

  return (
    <Modal
      open={open}
      title="사용해 보신 느낌"
      onClose={close}
      layout={group && !sent ? 'sticky' : 'scroll'}
      footer={<Footer />}
    >
      {mode !== 'live' ? (
        <p className="t-body break-keep font-bold text-navy-400">
          피드백 보내기는 실제 운영 모드에서만 쓸 수 있습니다. 시연 모드에는 보낼 서버가 없습니다.
        </p>
      ) : sent ? (
        <div className="py-2 text-center">
          <CheckCircle2 size={44} className="mx-auto text-accent-500" />
          <p className="t-card mt-4 break-keep text-navy-900">피드백이 등록되었습니다</p>
          <p className="t-body mt-2 break-keep font-medium text-navy-500">
            체크해 주신 내용은 다음 사용성 개선과 실제 업무효과 확인에 활용됩니다.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* ── ① 관점 ─────────────────────────────────────────────────── */}
          <section>
            <p className="t-card break-keep text-navy-900">어떤 관점에서 사용해 보셨나요?</p>
            <p className="t-body mt-1.5 break-keep font-medium text-navy-500">
              긴 글을 쓰실 필요 없습니다. 지금 느끼시는 대로 버튼만 눌러 주시면 됩니다.
              1~2분이면 끝납니다.
            </p>
            <div className="mt-3 space-y-2.5">
              {(['management', 'staff'] as RespondentGroup[]).map((g) => (
                <button
                  key={g}
                  data-fb-group={g}
                  aria-pressed={group === g}
                  onClick={() => setGroup(g)}
                  className={`w-full rounded-2xl border-2 p-4 text-left transition ${
                    group === g ? 'border-teal-500 bg-teal-50' : 'border-navy-100 bg-white hover:border-navy-200 hover:bg-navy-50'
                  }`}
                >
                  <span className={`t-card block break-keep ${group === g ? 'text-teal-900' : 'text-navy-900'}`}>
                    {GROUP_LABEL[g]}
                  </span>
                  <span className="t-body mt-1 block break-keep font-medium text-navy-500">{GROUP_DESC[g]}</span>
                </button>
              ))}
            </div>
          </section>

          {group && (
            <>
              {/* ── ② 얼마나 써 보셨는지 ─────────────────────────────────── */}
              <section ref={usageRef} data-fb-usage-block>
                <SectionTitle>이 시스템을 어느 정도 사용해 보셨나요?</SectionTitle>
                {/*  ⚠ 이 답이 없으면 뒤의 점수를 어떻게 읽어야 할지 알 수 없습니다.
                     사흘 써 보고 매긴 4점과 한 달 써 보고 매긴 4점은 다릅니다. */}
                <div className="mt-2.5 space-y-2">
                  {USAGE_OPTIONS.map((o) => (
                    <Choice key={o.value} attr={{ 'data-fb-usage': o.value }} on={usage === o.value} onClick={() => setUsage(o.value)}>
                      {o.label}
                    </Choice>
                  ))}
                </div>

                {group === 'staff' && (
                  <div className="mt-5">
                    <SectionTitle>주로 어떤 업무를 하시나요?</SectionTitle>
                    <div className="mt-2.5 space-y-2">
                      {(['field', 'office', 'both'] as StaffWorkType[]).map((w) => (
                        <Choice key={w} attr={{ 'data-fb-work': w }} on={work === w} onClick={() => setWork(w)}>
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
              </section>

              {/* ── ③ 질문 묶음 — 전부 한 화면에, 제목으로만 나눕니다 ────── */}
              {groups.map((g, i) => (
                <section key={g.key} data-fb-section={g.key}>
                  <div className="flex items-baseline justify-between gap-2 border-t-2 border-navy-100 pt-4">
                    <p className="t-card min-w-0 break-keep text-navy-900">{g.title}</p>
                    <span className="t-muted shrink-0 font-bold tabular-nums text-navy-400">
                      {i + 1} / {groups.length}
                    </span>
                  </div>
                  <div className="mt-3 space-y-3">
                    {g.questions.map((x) => (
                      <QuestionCard key={x.id} q={x} value={answers[x.id]} onPick={(v) => pick(x.id, v)} />
                    ))}
                  </div>
                </section>
              ))}

              {/* ── ④ 마무리 ──────────────────────────────────────────────── */}
              <section className="space-y-5 border-t-2 border-navy-100 pt-4">
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
              </section>
            </>
          )}

          {error && (
            <p className="t-body break-keep rounded-2xl bg-rose-50 px-4 py-3 font-bold text-rose-600">{error}</p>
          )}
        </div>
      )}
    </Modal>
  )

  /**
   * 아래에 붙는 띠.
   *
   *  ⚠ 답한 개수를 늘 보여 드립니다. 한 화면에 스무 문항이 이어지면 「얼마나
   *    남았지」가 안 보이는데, 그게 안 보이면 중간에 그만두게 됩니다.
   */
  function Footer() {
    if (mode !== 'live' || sent) {
      return (
        <button data-fb-done className="btn-primary flex-1" onClick={close}>
          {sent ? '확인' : '닫기'}
        </button>
      )
    }
    if (!group) {
      return <button className="btn-ghost flex-1" onClick={close}>나중에 하기</button>
    }

    const total = shownQuestions.length
    return (
      <div className="w-full">
        <div className="mb-2.5 flex items-center gap-2.5">
          <span data-fb-progress className="t-muted shrink-0 font-bold tabular-nums text-navy-600">
            {done} / {total} 답변
          </span>
          <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-navy-100">
            <div
              className="h-full rounded-full bg-teal-500 transition-[width] duration-300"
              style={{ width: `${total > 0 ? (done / total) * 100 : 0}%` }}
            />
          </div>
        </div>
        {ready ? (
          <button
            data-fb-submit
            className="btn-primary w-full disabled:opacity-40"
            disabled={busy}
            onClick={() => void submit()}
          >
            {busy ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} strokeWidth={2.4} />}
            피드백 제출하기
          </button>
        ) : (
          //  ⚠ 잠긴 단추만 두면 「왜 안 눌리지」가 됩니다. 무엇이 남았는지
          //    적고, 누르면 그 자리로 데려다 줍니다.
          <button
            data-fb-need-usage
            className="btn-ghost w-full"
            onClick={() => usageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          >
            {usage === null ? '먼저 「어느 정도 사용해 보셨는지」를 골라 주세요' : '먼저 「어떤 업무를 하시는지」를 골라 주세요'}
          </button>
        )}
      </div>
    )
  }
}

const omit = (o: Record<string, AnswerValue>, k: string) => {
  const { [k]: _drop, ...rest } = o
  return rest
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <p className="t-card break-keep text-navy-900">{children}</p>
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
        {/*  ⚠ t-muted 에 색(navy-500)이 들어 있어 부모의 text-white 를 덮습니다.
             고른 상태에서 어두운 바탕에 회색 글자가 되어 안 읽혔습니다. */}
        <span className={`t-muted break-keep font-bold ${value === 'na' ? '!text-white' : ''}`}>{NA_LABEL}</span>
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
              <span className={`t-muted break-keep font-bold ${on ? '!text-teal-900' : ''}`}>{o.label}</span>
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
