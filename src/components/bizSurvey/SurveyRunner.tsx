import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronRight, CircleDashed, ListChecks, Loader2, Plus, Star, Trash2, X } from 'lucide-react'
import { BrandLogo } from '../BrandLogo'
import { Modal } from '../Modal'
import {
  QUESTIONS, RESPONDENTS, SECTIONS, STATE_LABEL, SURVEY_INTRO, SURVEY_MENU_NAME, SURVEY_THANKS, SURVEY_TITLE,
  detailOpen, fmtDateTime, isAnswered, notMineFor, progressOf, questionsFor, stateOf, summaryLines,
  type Answer, type Answers, type Field, type Opt, type Question, type SurveyWho,
} from '../../lib/bizSurvey'

// ─────────────────────────────────────────────────────────────────────────────
// 뉴본펭귄 사전 설문 — 응답 화면 (0144 · 0145)
//
//  대표님 · 이사님 중 한 분이 앱의 「뉴본펭귄 사전 설문 › 시작하기」로 폰에서
//  바로 여십니다(링크 없음 · 답지 하나). 가장 중요한 것은 **폰에서 손가락으로
//  쉽게 끝낼 수 있는가**입니다.
//
//   · 한 화면에 질문 하나. 위에는 진행률 · 남은 질문 수, 아래에는 이전/다음.
//   · 대부분 고르기만 하면 됩니다. 세부 칸은 해당 답을 골랐을 때만 나타납니다.
//   · 답하지 않고 넘어가도 됩니다 — 「추후 확인」으로 남습니다(제출도 됩니다).
//   · 바꿀 때마다 자동 저장. 닫았다가 다시 열면(누가 열어도) 이어서 합니다.
//   · 추천안 · 제안안은 **미리 골라 두지 않습니다.** 보여만 드리고 고르시게 합니다.
//
//  preview — 관리자 미리보기. 서버에 아무것도 저장하지 않습니다.
// ─────────────────────────────────────────────────────────────────────────────

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

interface Props {
  who: SurveyWho
  answers: Answers
  status: 'draft' | 'submitted'
  updatedAt: string | null
  submittedAt: string | null
  /** 공동 답지 — 마지막으로 고친 분 이름 */
  editedBy?: string
  /** 저장 상태는 바깥(페이지)이 관리합니다 — 미리보기에는 없음 */
  saveState?: SaveState
  saveError?: string | null
  onRetrySave?: () => void
  /** 다른 분이 고친 답을 들였을 때 한 줄 알림 */
  notice?: string | null
  onNotice?: () => void
  onChange: (next: Answers) => void
  onSubmit: () => Promise<void>
  preview?: boolean
  /** 앱으로 돌아가기 (미리보기에서는 「닫기」) */
  onExit?: () => void
}

type Screen = { mode: 'intro' } | { mode: 'q'; path: 'core' | 'all'; idx: number; back?: 'review' } | { mode: 'review' } | { mode: 'done' }

const flowOf = (path: 'core' | 'all'): Question[] =>
  path === 'core' ? [...QUESTIONS.filter((q) => q.core), ...QUESTIONS.filter((q) => !q.core)] : QUESTIONS

const sectionOf = (q: Question) => SECTIONS.find((s) => s.id === q.section)!

/** 답을 바꿀 때 — 더는 해당하지 않는 세부 칸은 버립니다(숨은 값이 답으로 남지 않게) */
function normalize(q: Question, a: Answer): Answer {
  const next: Answer = { ...a }
  if (q.detail && !detailOpen(q, next)) {
    delete next.rows
    if (q.kind !== 'fields') delete next.fields
  }
  if (q.kind === 'multi' && !(next.picks ?? []).includes('기타')) delete next.other
  for (const k of Object.keys(next) as (keyof Answer)[]) {
    const v = next[k]
    if (v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) delete next[k]
  }
  return next
}

export function SurveyRunner(p: Props) {
  const { who, answers } = p
  const [screen, setScreen] = useState<Screen>({ mode: 'intro' })
  const [toc, setToc] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const prog = progressOf(who, answers)
  const mine = useMemo(() => new Set(questionsFor(who).map((q) => q.id)), [who])

  //  화면이 바뀌면 맨 위로 — 폰에서 다음 질문이 중간부터 보이지 않게
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [screen])

  const setAnswer = useCallback(
    (q: Question, patch: Partial<Answer>) => {
      const cur = answers[q.id] ?? {}
      const next = normalize(q, { ...cur, ...patch })
      const all = { ...answers }
      if (Object.keys(next).length === 0) delete all[q.id]
      else all[q.id] = next
      p.onChange(all)
    },
    [answers, p],
  )

  //  처음 화면에서 「이어서」 — 고른 길(핵심 먼저)에서 아직 안 한 첫 질문
  const resumeIdx = (path: 'core' | 'all') => {
    const f = flowOf(path)
    const i = f.findIndex((q) => mine.has(q.id) && !isAnswered(q, answers[q.id]))
    return i < 0 ? 0 : i
  }

  const go = (s: Screen) => setScreen(s)

  async function submit() {
    setSubmitting(true)
    setSubmitError(null)
    try {
      await p.onSubmit()
      go({ mode: 'done' })
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : '제출하지 못했습니다. 잠시 뒤 다시 눌러 주세요.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div data-survey data-survey-who={who} className="min-h-[100dvh] bg-app pb-[calc(6.5rem+env(safe-area-inset-bottom))]">
      {p.preview && (
        <div data-survey-preview className="sticky top-0 z-40 flex items-center gap-2 bg-amber-100 px-4 py-2.5 text-[0.98rem] font-bold text-amber-900">
          <span className="min-w-0 flex-1 break-keep">관리자 미리보기 — 대표님 · 이사님 화면 그대로 · 저장되지 않습니다</span>
          {p.onExit && (
            <button type="button" data-survey-preview-close onClick={p.onExit} className="flex h-11 min-w-[44px] items-center justify-center gap-1 rounded-full bg-white/70 px-3">
              <X size={18} strokeWidth={2.6} /> 닫기
            </button>
          )}
        </div>
      )}

      <Header
        prog={prog}
        saveState={p.preview ? undefined : p.saveState}
        onRetry={p.onRetrySave}
        onToc={screen.mode === 'q' ? () => setToc(true) : undefined}
        onExit={p.preview ? undefined : p.onExit}
        sticky={!p.preview}
      />

      <main className="mx-auto w-full max-w-xl px-4 pt-4">
        {p.notice && !p.preview && (
          <p data-survey-notice role="status" className="mb-3 flex items-start gap-2 break-keep rounded-2xl bg-teal-50 px-4 py-3 text-[1rem] font-bold text-teal-800">
            <span className="min-w-0 flex-1">{p.notice}</span>
            {p.onNotice && (
              <button type="button" onClick={p.onNotice} aria-label="알림 닫기" className="-my-1.5 -mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-teal-700">
                <X size={18} strokeWidth={2.6} />
              </button>
            )}
          </p>
        )}
        {p.saveError && !p.preview && (
          <p data-survey-save-error className="mb-3 break-keep rounded-2xl bg-amber-50 px-4 py-3 text-[1rem] font-bold text-amber-800">
            {p.saveError}
          </p>
        )}

        {screen.mode === 'intro' && (
          <Intro
            who={who}
            prog={prog}
            status={p.status}
            updatedAt={p.updatedAt}
            submittedAt={p.submittedAt}
            editedBy={p.editedBy ?? ''}
            onCore={() => go({ mode: 'q', path: 'core', idx: resumeIdx('core') })}
            onAll={() => go({ mode: 'q', path: 'all', idx: prog.answered > 0 ? resumeIdx('all') : 0 })}
            onReview={() => go({ mode: 'review' })}
          />
        )}

        {screen.mode === 'q' && (
          <QuestionScreen
            key={`${screen.path}-${screen.idx}`}
            who={who}
            q={flowOf(screen.path)[screen.idx]}
            a={answers[flowOf(screen.path)[screen.idx].id]}
            onPatch={(patch) => setAnswer(flowOf(screen.path)[screen.idx], patch)}
            onClear={() => {
              const all = { ...answers }
              delete all[flowOf(screen.path)[screen.idx].id]
              p.onChange(all)
            }}
          />
        )}

        {screen.mode === 'review' && (
          <Review
            who={who}
            answers={answers}
            status={p.status}
            submitting={submitting}
            error={submitError}
            onEdit={(qid) => go({ mode: 'q', path: 'all', idx: QUESTIONS.findIndex((q) => q.id === qid), back: 'review' })}
            onSubmit={() => void submit()}
            preview={!!p.preview}
          />
        )}

        {screen.mode === 'done' && (
          <Done preview={!!p.preview} onReview={() => go({ mode: 'review' })} updatedAt={p.updatedAt} onExit={p.preview ? undefined : p.onExit} />
        )}
      </main>

      {screen.mode === 'q' && (
        <NavBar
          isFirst={screen.idx === 0}
          isLast={screen.idx === flowOf(screen.path).length - 1}
          backToReview={screen.back === 'review'}
          onPrev={() => (screen.idx === 0 ? go({ mode: 'intro' }) : go({ ...screen, idx: screen.idx - 1 }))}
          onNext={() =>
            screen.back === 'review' || screen.idx === flowOf(screen.path).length - 1
              ? go({ mode: 'review' })
              : go({ ...screen, idx: screen.idx + 1 })
          }
        />
      )}

      <Modal open={toc} title="질문 목록" onClose={() => setToc(false)}>
        <Toc
          who={who}
          answers={answers}
          onPick={(qid) => {
            setToc(false)
            go({ mode: 'q', path: 'all', idx: QUESTIONS.findIndex((q) => q.id === qid) })
          }}
          onReview={() => {
            setToc(false)
            go({ mode: 'review' })
          }}
        />
      </Modal>
    </div>
  )
}

// ── 위 띠 — 제목 · 진행률 · 남은 질문 · 저장 상태 ────────────────────────────

function Header({
  prog,
  saveState,
  onRetry,
  onToc,
  onExit,
  sticky,
}: {
  prog: ReturnType<typeof progressOf>
  saveState?: SaveState
  onRetry?: () => void
  onToc?: () => void
  onExit?: () => void
  sticky: boolean
}) {
  const pct = Math.round((prog.answered / Math.max(prog.total, 1)) * 100)
  return (
    <header data-survey-header className={`${sticky ? 'sticky top-0' : ''} z-30 border-b border-navy-100 bg-white/95 backdrop-blur`}>
      <div className="mx-auto flex w-full max-w-xl items-center gap-2.5 px-4 pb-2 pt-3">
        {onExit ? (
          <button
            type="button"
            data-survey-exit
            onClick={onExit}
            aria-label="앱으로 돌아가기"
            className="-ml-1 flex h-11 min-w-[44px] shrink-0 items-center justify-center rounded-full text-navy-700 hover:bg-navy-50"
          >
            <ArrowLeft size={21} strokeWidth={2.4} />
          </button>
        ) : (
          <BrandLogo size="sm" />
        )}
        <p className="min-w-0 flex-1 truncate text-[0.98rem] font-extrabold text-navy-900">{SURVEY_MENU_NAME}</p>
        <SaveChip state={saveState} onRetry={onRetry} />
        {onToc && (
          <button
            type="button"
            data-survey-toc
            onClick={onToc}
            aria-label="질문 목록"
            className="flex h-11 min-w-[44px] items-center justify-center gap-1 rounded-full bg-navy-50 px-3 text-[0.95rem] font-bold text-navy-700"
          >
            <ListChecks size={18} strokeWidth={2.4} /> 목록
          </button>
        )}
      </div>
      <div className="mx-auto w-full max-w-xl px-4 pb-3">
        <div className="h-2 overflow-hidden rounded-full bg-navy-100" aria-hidden="true">
          <div className="h-full rounded-full bg-teal-600 transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p data-survey-progress className="mt-1.5 flex flex-wrap justify-between gap-x-3 text-[0.95rem] font-bold text-navy-600">
          <span>
            {prog.answered} / {prog.total} 답함
          </span>
          <span>남은 질문 {prog.left}개</span>
        </p>
      </div>
    </header>
  )
}

function SaveChip({ state, onRetry }: { state?: SaveState; onRetry?: () => void }) {
  if (!state || state === 'idle') return null
  if (state === 'error')
    return (
      <button type="button" data-survey-save="error" onClick={onRetry} className="shrink-0 rounded-full bg-amber-100 px-3 py-2 text-[0.9rem] font-bold text-amber-900">
        저장 안 됨 · 다시
      </button>
    )
  return (
    <span data-survey-save={state} className="flex shrink-0 items-center gap-1 text-[0.9rem] font-bold text-navy-500">
      {state === 'saving' ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} strokeWidth={2.8} className="text-teal-600" />}
      {state === 'saving' ? '저장 중' : '저장됨'}
    </span>
  )
}

// ── 첫 화면 ─────────────────────────────────────────────────────────────────

function Intro({
  who,
  prog,
  status,
  updatedAt,
  submittedAt,
  editedBy,
  onCore,
  onAll,
  onReview,
}: {
  who: SurveyWho
  prog: ReturnType<typeof progressOf>
  status: 'draft' | 'submitted'
  updatedAt: string | null
  submittedAt: string | null
  editedBy: string
  onCore: () => void
  onAll: () => void
  onReview: () => void
}) {
  const coreTotal = questionsFor(who).filter((q) => q.core).length
  const started = prog.answered > 0
  return (
    <section data-survey-intro className="space-y-4">
      <div>
        <p className="text-[0.98rem] font-extrabold text-amber-700">★ {SURVEY_MENU_NAME}</p>
        <h1 className="mt-1 break-keep text-[1.45rem] font-extrabold leading-snug text-navy-900">{SURVEY_TITLE}</h1>
      </div>
      <div className="card space-y-2.5 p-5">
        {SURVEY_INTRO.map((l, i) => (
          <p key={i} className={`break-keep text-[1.05rem] leading-relaxed ${i === 0 ? 'font-bold text-navy-900' : 'text-navy-700'}`}>
            {l}
          </p>
        ))}
      </div>

      <div data-survey-me className="card flex flex-wrap items-center gap-x-3 gap-y-2 p-4">
        <span className="min-w-0 flex-1 break-keep text-[1.1rem] font-extrabold text-navy-900">{RESPONDENTS[who].label}</span>
        <span
          data-survey-status={status === 'submitted' ? 'submitted' : started ? 'progress' : 'new'}
          className={`pill ${status === 'submitted' ? 'bg-teal-600 text-white' : started ? 'bg-amber-50 text-amber-800' : 'bg-navy-100 text-navy-600'}`}
        >
          {status === 'submitted' ? '제출 완료' : started ? '작성 중' : '작성 전'}
        </span>
        <p className="w-full break-keep text-[0.98rem] text-navy-600">
          {prog.answered} / {prog.total} 답함
          {prog.unsure > 0 ? ` · 미정 ${prog.unsure}` : ''}
          {status === 'submitted' && submittedAt ? ` · 제출 ${fmtDateTime(submittedAt)}` : ''}
          {updatedAt && started ? ` · 최종 저장 ${fmtDateTime(updatedAt)}` : ''}
          {editedBy && started ? ` · 마지막 작성 ${editedBy}` : ''}
        </p>
      </div>

      <div className="space-y-2.5">
        {status === 'submitted' ? (
          <button type="button" data-survey-start="review" onClick={onReview} className="btn-primary w-full">
            답변 확인 · 수정하기 <ArrowRight size={18} strokeWidth={2.4} />
          </button>
        ) : (
          <button type="button" data-survey-start="core" onClick={onCore} className="btn-primary w-full">
            <Star size={18} strokeWidth={2.4} />
            {started ? (prog.coreLeft === 0 ? '이어서 답하기' : `이어서 — 핵심 질문 ${prog.coreLeft}개 남음`) : `시작하기 · 핵심 질문 ${coreTotal}개부터`}
          </button>
        )}
        <button type="button" data-survey-start="all" onClick={onAll} className="btn-ghost w-full">
          {started ? '처음부터 차례대로 보기' : '처음부터 차례대로'}
        </button>
        {started && status !== 'submitted' && (
          <button type="button" data-survey-start="review" onClick={onReview} className="btn-ghost w-full">
            지금까지 답변 확인 · 제출
          </button>
        )}
      </div>

      <ul className="space-y-1.5 px-1 text-[0.98rem] text-navy-600">
        <li className="break-keep">· 고르는 즉시 자동 저장됩니다. 중간에 닫아도 「{SURVEY_MENU_NAME}」에서 이어서 하실 수 있습니다.</li>
        <li className="break-keep">· ★ 표시는 먼저 여쭙는 핵심 질문입니다. 답하지 않고 넘어가셔도 됩니다.</li>
        <li className="break-keep">· 추천안 · 제안안은 검토안일 뿐 확정이 아닙니다.</li>
      </ul>
    </section>
  )
}

// ── 질문 한 화면 ────────────────────────────────────────────────────────────

function QuestionScreen({
  who,
  q,
  a,
  onPatch,
  onClear,
}: {
  who: SurveyWho
  q: Question
  a: Answer | undefined
  onPatch: (patch: Partial<Answer>) => void
  onClear: () => void
}) {
  const s = sectionOf(q)
  const notMine = notMineFor(q, who)
  const [noteOpen, setNoteOpen] = useState(() => !!a?.note)
  return (
    <section data-survey-q={q.id} className="space-y-4">
      <div>
        <p className="text-[0.92rem] font-bold text-teal-700">
          SECTION {s.no} · {s.title}
        </p>
        <p className="mt-1 flex items-center gap-2 text-[0.98rem] font-extrabold text-navy-500">
          Q{q.no}
          {q.core && (
            <span data-survey-core className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[0.85rem] text-amber-800">
              <Star size={13} strokeWidth={2.6} /> 핵심
            </span>
          )}
          <span className="font-bold text-navy-400">· {q.title}</span>
        </p>
        <h2 className="mt-2 break-keep text-[1.28rem] font-extrabold leading-snug text-navy-900">{q.prompt}</h2>
      </div>

      {q.info && <InfoBox info={q.info} />}
      {who === 'shared' && q.sharedNote && (
        <p data-survey-shared-note className="break-keep rounded-2xl bg-amber-50 px-4 py-3 text-[1rem] font-bold text-amber-800">
          {q.sharedNote}
        </p>
      )}

      {notMine ? (
        <div data-survey-notmine className="card space-y-2 p-5">
          <p className="break-keep text-[1.08rem] font-bold text-navy-800">이사님 확인 항목입니다.</p>
          <p className="break-keep text-[1rem] text-navy-600">
            이사님 경력 내용은 이사님 링크로 따로 여쭙습니다. 아래 「다음」을 눌러 넘어가 주세요.
          </p>
        </div>
      ) : (
        <>
          {q.kind === 'single' && q.options && (
            <Choices options={q.options} value={a?.choice} onPick={(v) => onPatch({ choice: a?.choice === v ? undefined : v, skip: undefined })} />
          )}

          {q.kind === 'multi' && q.options && (
            <MultiChoices
              options={q.options}
              values={a?.picks ?? []}
              maxPick={q.maxPick}
              onToggle={(v) => {
                const cur = a?.picks ?? []
                onPatch({ picks: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v], skip: undefined })
              }}
            />
          )}
          {q.otherText && (a?.picks ?? []).includes('기타') && (
            <TextField label="기타 — 적어 주세요" value={a?.other ?? ''} onChange={(v) => onPatch({ other: v })} hook="other" />
          )}
          {q.extra && (
            <div className="space-y-2.5 pt-1">
              <p className="break-keep text-[1.1rem] font-extrabold text-navy-900">{q.extra.prompt}</p>
              <Choices options={q.extra.options} value={a?.extra} onPick={(v) => onPatch({ extra: a?.extra === v ? undefined : v, skip: undefined })} hook="extra" />
            </div>
          )}

          {q.kind === 'grid' && q.rows && q.rowOptions && (
            <GridChoices
              rows={q.rows}
              options={q.rowOptions}
              value={a?.grid ?? {}}
              onPick={(row, v) => {
                const g = { ...(a?.grid ?? {}) }
                if (g[row] === v) delete g[row]
                else g[row] = v
                onPatch({ grid: g, skip: undefined })
              }}
            />
          )}

          {q.kind === 'fields' && q.fields && (
            <div className="space-y-3">
              {q.fields.map((f) => (
                <FieldInput key={f.key} f={f} value={a?.fields?.[f.key] ?? ''} onChange={(v) => onPatch({ fields: { ...(a?.fields ?? {}), [f.key]: v }, skip: undefined })} />
              ))}
            </div>
          )}

          {q.detail && detailOpen(q, a) && (
            <div data-survey-detail className="space-y-3 rounded-2xl bg-teal-50/60 p-4 ring-1 ring-inset ring-teal-100">
              {q.detail.title && <p className="break-keep text-[1.02rem] font-extrabold text-navy-800">{q.detail.title}</p>}
              {q.detail.repeat ? (
                <RepeatRows
                  fields={q.detail.fields}
                  rows={a?.rows ?? []}
                  addLabel={q.detail.repeat.addLabel}
                  max={q.detail.repeat.max}
                  onChange={(rows) => onPatch({ rows })}
                />
              ) : (
                q.detail.fields.map((f) => (
                  <FieldInput key={f.key} f={f} value={a?.fields?.[f.key] ?? ''} onChange={(v) => onPatch({ fields: { ...(a?.fields ?? {}), [f.key]: v } })} />
                ))
              )}
            </div>
          )}

          {q.list && (
            <div className="space-y-2.5 pt-1">
              <p className="break-keep text-[1.02rem] font-extrabold text-navy-800">{q.list.title}</p>
              <RepeatRows fields={q.list.fields} rows={a?.list ?? []} addLabel={q.list.addLabel} max={q.list.max} onChange={(list) => onPatch({ list })} startEmpty />
            </div>
          )}

          {q.note &&
            (noteOpen ? (
              <TextField label={q.note} value={a?.note ?? ''} onChange={(v) => onPatch({ note: v })} long hook="note" />
            ) : (
              <button type="button" data-survey-note-open onClick={() => setNoteOpen(true)} className="flex min-h-[44px] items-center gap-1.5 text-[1rem] font-bold text-teal-700">
                <Plus size={17} strokeWidth={2.6} /> {q.note}
              </button>
            ))}

          {q.caution && <p className="break-keep rounded-2xl bg-navy-50 px-4 py-3 text-[0.98rem] font-medium text-navy-600">{q.caution}</p>}

          {/*  고르는 선택지에 「미정」이 없는 질문(복수선택 · 표 · 입력)만 — 단일선택은 선택지 안에 있습니다 */}
          {q.kind !== 'single' && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                data-survey-skip
                aria-pressed={!!a?.skip}
                onClick={() => (a?.skip ? onPatch({ skip: undefined }) : onPatch({ skip: true }))}
                className={`flex min-h-[44px] items-center gap-1.5 rounded-full px-4 text-[0.98rem] font-bold ${
                  a?.skip ? 'bg-amber-100 text-amber-900' : 'bg-navy-50 text-navy-600'
                }`}
              >
                <CircleDashed size={17} strokeWidth={2.4} /> {a?.skip ? '미정으로 표시함' : '미정 · 나중에 답할게요'}
              </button>
              {isAnswered(q, a) && !a?.skip && (
                <button type="button" data-survey-clear onClick={onClear} className="min-h-[44px] px-2 text-[0.95rem] font-bold text-navy-400 underline-offset-2 hover:underline">
                  이 질문 답 지우기
                </button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  )
}

function InfoBox({ info }: { info: NonNullable<Question['info']> }) {
  const tone =
    info.tone === 'proposal' ? 'bg-teal-50 ring-teal-100' : info.tone === 'fact' ? 'bg-sky-50 ring-sky-100' : 'bg-navy-50 ring-navy-100'
  return (
    <div data-survey-info className={`rounded-2xl px-4 py-3.5 ring-1 ring-inset ${tone}`}>
      <p className="text-[0.92rem] font-extrabold text-navy-600">{info.title}</p>
      <ul className="mt-1.5 space-y-1">
        {info.lines.map((l, i) => (
          <li key={i} className="break-keep text-[1.05rem] font-bold leading-snug text-navy-900">
            {l}
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── 고르는 칸들 (손가락 기준 52px 이상) ─────────────────────────────────────

function Choices({ options, value, onPick, hook }: { options: Opt[]; value?: string; onPick: (v: string) => void; hook?: string }) {
  return (
    <div role="radiogroup" className="space-y-2" data-survey-choices={hook ?? 'main'}>
      {options.map((o) => {
        const on = value === o.v
        return (
          <button
            key={o.v}
            type="button"
            role="radio"
            aria-checked={on}
            data-survey-opt={o.v}
            onClick={() => onPick(o.v)}
            className={`flex min-h-[3.4rem] w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition active:scale-[0.99] ${
              on ? 'bg-teal-50 ring-2 ring-inset ring-teal-600' : 'bg-white ring-1 ring-inset ring-navy-200'
            }`}
          >
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${on ? 'bg-teal-600 text-white' : 'ring-2 ring-inset ring-navy-300'}`}>
              {on && <Check size={15} strokeWidth={3} />}
            </span>
            <span className={`min-w-0 flex-1 break-keep text-[1.08rem] ${on ? 'font-extrabold text-navy-900' : 'font-semibold text-navy-800'}`}>{o.v}</span>
          </button>
        )
      })}
    </div>
  )
}

function MultiChoices({ options, values, maxPick, onToggle }: { options: Opt[]; values: string[]; maxPick?: number; onToggle: (v: string) => void }) {
  return (
    <div className="space-y-2" data-survey-choices="multi">
      <p className="text-[0.98rem] font-bold text-navy-500">
        여러 개 고를 수 있습니다{maxPick ? ` · 최대 ${maxPick}개 권장` : ''}
        {values.length > 0 ? ` · ${values.length}개 고름` : ''}
      </p>
      {maxPick && values.length > maxPick && (
        <p data-survey-overpick className="break-keep text-[0.95rem] font-bold text-amber-700">
          {maxPick}개 이내로 고르시면 우선순위를 정리하기 쉽습니다. (그대로 두셔도 저장됩니다)
        </p>
      )}
      {options.map((o) => {
        const on = values.includes(o.v)
        return (
          <button
            key={o.v}
            type="button"
            role="checkbox"
            aria-checked={on}
            data-survey-opt={o.v}
            onClick={() => onToggle(o.v)}
            className={`flex min-h-[3.4rem] w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition active:scale-[0.99] ${
              on ? 'bg-teal-50 ring-2 ring-inset ring-teal-600' : 'bg-white ring-1 ring-inset ring-navy-200'
            }`}
          >
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${on ? 'bg-teal-600 text-white' : 'ring-2 ring-inset ring-navy-300'}`}>
              {on && <Check size={15} strokeWidth={3} />}
            </span>
            <span className={`min-w-0 flex-1 break-keep text-[1.08rem] ${on ? 'font-extrabold text-navy-900' : 'font-semibold text-navy-800'}`}>{o.v}</span>
          </button>
        )
      })}
    </div>
  )
}

function GridChoices({
  rows,
  options,
  value,
  onPick,
}: {
  rows: string[]
  options: Opt[]
  value: Record<string, string>
  onPick: (row: string, v: string) => void
}) {
  return (
    <div className="space-y-2.5" data-survey-grid>
      {rows.map((r) => (
        <div key={r} data-survey-row={r} className="rounded-2xl bg-white p-3 ring-1 ring-inset ring-navy-200">
          <p className="mb-2 break-keep px-1 text-[1.05rem] font-extrabold text-navy-900">{r}</p>
          <div className="grid grid-cols-2 gap-1.5">
            {options.map((o) => {
              const on = value[r] === o.v
              return (
                <button
                  key={o.v}
                  type="button"
                  aria-pressed={on}
                  data-survey-cell={o.v}
                  onClick={() => onPick(r, o.v)}
                  className={`min-h-[2.9rem] break-keep rounded-xl px-2 py-2 text-[0.98rem] leading-tight transition ${
                    on ? 'bg-teal-600 font-extrabold text-white' : 'bg-navy-50 font-bold text-navy-700'
                  }`}
                >
                  {o.v}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

/** 숫자는 숫자 자판으로 — 쉼표 · 공백은 지우고 숫자 · 소수점만 */
function FieldInput({ f, value, onChange }: { f: Field; value: string; onChange: (v: string) => void }) {
  if (f.kind === 'select')
    return (
      <label className="block">
        <span className="field-label">{f.label}</span>
        <select data-survey-field={f.key} value={value} onChange={(e) => onChange(e.target.value)} className="field-input">
          <option value="">선택 안 함</option>
          {(f.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </label>
    )
  if (f.kind === 'number')
    return (
      <label className="block">
        <span className="field-label">{f.label}</span>
        <span className="relative block">
          <input
            data-survey-field={f.key}
            inputMode="decimal"
            autoComplete="off"
            value={value}
            placeholder={f.placeholder ? `예: ${f.placeholder}` : ''}
            onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, '').slice(0, 12))}
            className={`field-input ${f.unit ? 'pr-16' : ''}`}
          />
          {f.unit && <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-[1rem] font-bold text-navy-500">{f.unit}</span>}
        </span>
      </label>
    )
  return <TextField label={f.label} value={value} onChange={onChange} long={f.kind === 'long'} placeholder={f.placeholder} hook={f.key} />
}

function TextField({
  label,
  value,
  onChange,
  long,
  placeholder,
  hook,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  long?: boolean
  placeholder?: string
  hook?: string
}) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      {long ? (
        <textarea data-survey-field={hook} rows={3} maxLength={600} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="field-input resize-none" />
      ) : (
        <input data-survey-field={hook} maxLength={200} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="field-input" />
      )}
    </label>
  )
}

function RepeatRows({
  fields,
  rows,
  addLabel,
  max,
  onChange,
  startEmpty = false,
}: {
  fields: Field[]
  rows: Record<string, string>[]
  addLabel: string
  max: number
  onChange: (rows: Record<string, string>[]) => void
  startEmpty?: boolean
}) {
  //  세부 칸이 열리면 빈 줄 하나는 바로 보이게 (목록형은 「적기」를 눌렀을 때만)
  const shown = rows.length === 0 && !startEmpty ? [{}] : rows
  return (
    <div className="space-y-2.5" data-survey-repeat>
      {shown.map((r, i) => (
        <div key={i} className="space-y-2.5 rounded-2xl bg-white p-3.5 ring-1 ring-inset ring-navy-200">
          <div className="flex items-center justify-between">
            <span className="text-[0.95rem] font-extrabold text-navy-500">{i + 1}</span>
            {(rows.length > 0 || startEmpty) && (
              <button
                type="button"
                aria-label={`${i + 1}번 지우기`}
                onClick={() => onChange(rows.filter((_, j) => j !== i))}
                className="flex h-10 min-w-[44px] items-center justify-center rounded-full text-navy-400"
              >
                <Trash2 size={17} />
              </button>
            )}
          </div>
          {fields.map((f) => (
            <FieldInput
              key={f.key}
              f={f}
              value={r[f.key] ?? ''}
              onChange={(v) => {
                const base = rows.length === 0 ? [{}] : rows
                onChange(base.map((x, j) => (j === i ? { ...x, [f.key]: v } : x)))
              }}
            />
          ))}
        </div>
      ))}
      {(rows.length > 0 || startEmpty) && rows.length < max && (
        <button type="button" data-survey-add onClick={() => onChange([...(rows.length ? rows : []), {}])} className="flex min-h-[44px] items-center gap-1.5 text-[1rem] font-bold text-teal-700">
          <Plus size={17} strokeWidth={2.6} /> {addLabel}
        </button>
      )}
    </div>
  )
}

// ── 아래 띠 — 이전 · 다음 ───────────────────────────────────────────────────

function NavBar({
  isFirst,
  isLast,
  backToReview,
  onPrev,
  onNext,
}: {
  isFirst: boolean
  isLast: boolean
  backToReview: boolean
  onPrev: () => void
  onNext: () => void
}) {
  return (
    <nav
      data-survey-nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-navy-100 bg-white/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto flex w-full max-w-xl gap-2.5 px-4 py-3">
        <button type="button" data-survey-prev onClick={onPrev} className="btn-ghost min-h-[3.3rem] min-w-0 flex-1 whitespace-nowrap">
          <ArrowLeft size={18} strokeWidth={2.4} /> {isFirst ? '처음' : '이전'}
        </button>
        {/*  ⚠ 320px · 가장 큰 글씨에서 「답변 확인하기」가 화면 밖으로 나갔습니다 — 자리가 모자라면 낱말 단위로 두 줄 */}
        <button type="button" data-survey-next onClick={onNext} className="btn-primary min-h-[3.3rem] min-w-0 flex-[1.6] break-keep leading-tight">
          {backToReview ? '확인 화면으로' : isLast ? '답변 확인하기' : '다음'} <ArrowRight size={18} strokeWidth={2.4} />
        </button>
      </div>
    </nav>
  )
}

// ── 목록 ────────────────────────────────────────────────────────────────────

function StateChip({ q, a, who }: { q: Question; a: Answer | undefined; who: SurveyWho }) {
  if (notMineFor(q, who)) return <span className="pill bg-navy-50 text-navy-400">해당 없음</span>
  const st = stateOf(q, a)
  return (
    <span
      data-survey-state={st}
      className={`pill ${st === 'done' ? 'bg-teal-50 text-teal-700' : st === 'unsure' ? 'bg-amber-50 text-amber-800' : 'bg-navy-100 text-navy-500'}`}
    >
      {st === 'done' ? <CheckCircle2 size={14} strokeWidth={2.6} /> : null}
      {STATE_LABEL[st]}
    </span>
  )
}

function Toc({ who, answers, onPick, onReview }: { who: SurveyWho; answers: Answers; onPick: (qid: string) => void; onReview: () => void }) {
  return (
    <div data-survey-toc-list className="space-y-4">
      {SECTIONS.map((s) => (
        <div key={s.id}>
          <p className="mb-1.5 text-[0.92rem] font-extrabold text-teal-700">
            SECTION {s.no} · {s.title}
          </p>
          <ul className="divide-y divide-navy-100 rounded-2xl ring-1 ring-inset ring-navy-100">
            {QUESTIONS.filter((q) => q.section === s.id).map((q) => (
              <li key={q.id}>
                <button type="button" onClick={() => onPick(q.id)} className="flex min-h-[3.1rem] w-full items-center gap-2 px-3 py-2 text-left">
                  <span className="w-9 shrink-0 text-[0.95rem] font-extrabold text-navy-500">Q{q.no}</span>
                  <span className="min-w-0 flex-1 break-keep text-[1rem] font-bold text-navy-800">
                    {q.title}
                    {q.core ? ' ★' : ''}
                  </span>
                  <StateChip q={q} a={answers[q.id]} who={who} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <button type="button" onClick={onReview} className="btn-primary w-full">
        답변 확인 · 제출로 <ArrowRight size={18} strokeWidth={2.4} />
      </button>
    </div>
  )
}

// ── 답변 확인 · 제출 ────────────────────────────────────────────────────────

function Review({
  who,
  answers,
  status,
  submitting,
  error,
  onEdit,
  onSubmit,
  preview,
}: {
  who: SurveyWho
  answers: Answers
  status: 'draft' | 'submitted'
  submitting: boolean
  error: string | null
  onEdit: (qid: string) => void
  onSubmit: () => void
  preview: boolean
}) {
  const prog = progressOf(who, answers)
  return (
    <section data-survey-review className="space-y-4">
      <h1 className="break-keep text-[1.35rem] font-extrabold text-navy-900">답변 확인</h1>
      <div className="card flex flex-wrap gap-x-4 gap-y-1 p-4 text-[1.02rem] font-bold text-navy-700">
        <span>답함 {prog.answered - prog.unsure}</span>
        <span className="text-amber-700">미정 · 논의 {prog.unsure}</span>
        <span className="text-navy-500">추후 확인 {prog.left}</span>
      </div>
      {SECTIONS.map((s) => (
        <div key={s.id} className="card p-4">
          <p className="mb-2 text-[0.92rem] font-extrabold text-teal-700">
            SECTION {s.no} · {s.title}
          </p>
          <ul className="divide-y divide-navy-100">
            {QUESTIONS.filter((q) => q.section === s.id).map((q) => {
              const lines = notMineFor(q, who) ? ['이사님 확인 항목 (해당 없음)'] : summaryLines(q, answers[q.id])
              return (
                <li key={q.id} data-survey-review-q={q.id} className="py-3">
                  <div className="flex items-start gap-2">
                    <p className="min-w-0 flex-1 break-keep text-[1.02rem] font-extrabold text-navy-900">
                      Q{q.no}. {q.title}
                      {q.core ? ' ★' : ''}
                    </p>
                    <StateChip q={q} a={answers[q.id]} who={who} />
                  </div>
                  {lines.length ? (
                    <ul className="mt-1 space-y-0.5">
                      {lines.map((l, i) => (
                        <li key={i} className="break-keep text-[1rem] text-navy-700">
                          {l}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-[1rem] text-navy-400">추후 확인 (아직 고르지 않음)</p>
                  )}
                  {!notMineFor(q, who) && (
                    <button type="button" data-survey-edit={q.id} onClick={() => onEdit(q.id)} className="mt-1 flex min-h-[44px] items-center gap-1 text-[0.98rem] font-bold text-teal-700">
                      수정 <ChevronRight size={16} strokeWidth={2.6} />
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      ))}

      <div className="space-y-2.5 pb-2">
        {prog.left > 0 && (
          <p className="break-keep px-1 text-[0.98rem] text-navy-600">
            아직 고르지 않은 {prog.left}개는 「추후 확인」으로 제출됩니다. 제출한 뒤에도 「{SURVEY_MENU_NAME}」에서 언제든 고칠 수 있습니다.
          </p>
        )}
        {error && <p className="break-keep rounded-2xl bg-rose-50 px-4 py-3 font-bold text-rose-700">{error}</p>}
        <button type="button" data-survey-submit onClick={onSubmit} disabled={submitting} className="btn-primary min-h-[3.4rem] w-full disabled:opacity-60">
          {submitting ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} strokeWidth={2.6} />}
          {status === 'submitted' ? '수정한 내용으로 다시 제출' : '제출하기'}
        </button>
        {preview && <p className="text-center text-[0.95rem] text-navy-500">미리보기에서는 제출해도 저장되지 않습니다.</p>}
      </div>
    </section>
  )
}

function Done({
  preview,
  onReview,
  updatedAt,
  onExit,
}: {
  preview: boolean
  onReview: () => void
  updatedAt: string | null
  onExit?: () => void
}): ReactNode {
  return (
    <section data-survey-done className="space-y-4 pt-4">
      <div className="flex justify-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-teal-600 text-white">
          <Check size={34} strokeWidth={3} />
        </span>
      </div>
      <div className="card space-y-2.5 p-5">
        {SURVEY_THANKS.map((l, i) => (
          <p key={i} className={`break-keep text-[1.08rem] leading-relaxed ${i === 0 ? 'font-extrabold text-navy-900' : 'text-navy-700'}`}>
            {l}
          </p>
        ))}
      </div>
      {!preview && updatedAt && <p className="text-center text-[0.98rem] text-navy-500">제출 시각 {fmtDateTime(updatedAt)}</p>}
      <button type="button" data-survey-again onClick={onReview} className="btn-ghost w-full">
        답변 다시 보기 · 수정
      </button>
      {onExit && (
        <button type="button" data-survey-home onClick={onExit} className="btn-primary w-full">
          앱으로 돌아가기
        </button>
      )}
    </section>
  )
}
