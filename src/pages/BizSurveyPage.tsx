import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, Loader2 } from 'lucide-react'
import { BrandLogo } from '../components/BrandLogo'
import { SurveyRunner, type SaveState } from '../components/bizSurvey/SurveyRunner'
import { BIZ_SURVEY_ENABLED, SURVEY_MENU_NAME, applyDiff, diffAnswers, isEmptyDiff, rebase, type Answers } from '../lib/bizSurvey'
import { SurveyError, myOpen, myPatch, mySave, mySubmit, type OpenResult } from '../lib/bizSurveyApi'

// ─────────────────────────────────────────────────────────────────────────────
// 뉴본펭귄 사전 설문 — 앱 안에서 바로 답하는 화면 (/newborn-survey) · 0145
//
//  더보기(폰) · 사이드바(PC)의 「★ 뉴본펭귄 사전 설문 › 시작하기」로 엽니다.
//  링크를 보낼 필요가 없습니다. 로그인한 대표·관리자 · 사무실(이사님) 계정만
//  열리고(서버가 판단 — biz_survey_my_open), 답지는 **하나**입니다 — 두 분 중
//  한 분만 답하시면 되고, 다른 분이 열면 같은 답지에 이어집니다.
//  다 쓰면 관리자 화면(사용자 피드백 › 뉴본펭귄 사전 설문)에 그대로 나옵니다.
//
//  ── 저장 ──────────────────────────────────────────────────────────────────
//   · 고를 때마다 0.7초 뒤 서버에 저장합니다(자동 저장).
//   · 서버에 닿지 못하면 **이 폰에만** 잠시 보관했다가 다시 저장합니다. 저장되면
//     폰의 보관본은 지웁니다 — 회사 정보가 폰에 오래 남지 않게.
//   · 다시 열면 서버에 있는 답으로 이어집니다. 폰 보관본에 저장 못 한 것이 있으면
//     (저장 못 하고 닫은 경우) 그것만 이어서 다시 저장합니다.
//
//  ── 두 분이 동시에 열어 두면 (0145 · 동시 작성 보호) ─────────────────────────
//   · 답지 전체가 아니라 **바뀐 질문만** 보냅니다(biz_survey_my_patch). 서버가 그 질문만
//     바꿔 끼우고 합친 답지를 돌려주면, 다른 분이 고친 답이 이 화면에도 들어옵니다.
//   · 앱으로 돌아올 때(화면이 다시 보일 때)도 서버 답지를 다시 읽습니다.
//   · 제출도 서버 답지 기준입니다. 같은 질문을 두 분이 동시에 고치면 나중 저장이 남습니다.
//   · 서버에 끼워 넣기 함수가 아직 없으면(예전 0145) 예전처럼 답지 전체를 저장합니다.
// ─────────────────────────────────────────────────────────────────────────────

const BACKUP_KEY = 'beonemirae-ops:biz-survey:shared'

interface Ready {
  answers: Answers
  status: 'draft' | 'submitted'
  updatedAt: string | null
  submittedAt: string | null
  editedBy: string
}

/** 폰 보관본 — 지금 답(answers)과 그때 서버에 있던 답(base). 차이가 「저장 못 한 것」입니다 */
interface Backup {
  answers: Answers
  base?: Answers
  at: number
}
function readBackup(): Backup | null {
  try {
    const raw = localStorage.getItem(BACKUP_KEY)
    return raw ? (JSON.parse(raw) as Backup) : null
  } catch {
    return null
  }
}
function writeBackup(answers: Answers, base: Answers) {
  try {
    localStorage.setItem(BACKUP_KEY, JSON.stringify({ answers, base, at: Date.now() }))
  } catch {
    /* 저장 공간이 막힌 폰 — 서버 저장만 합니다 */
  }
}
function clearBackup() {
  try {
    localStorage.removeItem(BACKUP_KEY)
  } catch {
    /* 무시 */
  }
}

export function BizSurveyPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [ready, setReady] = useState<Ready | null>(null)
  const [fail, setFail] = useState<SurveyError | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const answersRef = useRef<Answers>({})
  /** 마지막으로 서버에서 받은 답지 — 바뀐 질문을 셀 기준 */
  const baseRef = useRef<Answers>({})
  /** 서버에 끼워 넣기 함수가 없으면(예전 0145) 답지 전체 저장으로 */
  const legacy = useRef(false)
  const dirty = useRef(false)
  const inFlight = useRef(false)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    const prev = document.title
    document.title = `${SURVEY_MENU_NAME} · 비원미래`
    return () => {
      document.title = prev
    }
  }, [])

  useEffect(() => {
    if (!BIZ_SURVEY_ENABLED) return
    let alive = true
    myOpen()
      .then((r) => {
        if (!alive) return
        const server = r.answers ?? {}
        let answers = server
        const b = readBackup()
        if (b?.base) {
          //  저장 못 한 것(보관본 − 그때 서버 답)만 지금 서버 답지 위에 얹습니다 — 그사이 다른 분이 쓴 답은 그대로
          const pending = diffAnswers(b.base, b.answers)
          if (!isEmptyDiff(pending)) {
            answers = applyDiff(server, pending)
            dirty.current = !isEmptyDiff(diffAnswers(server, answers))
          }
          if (!dirty.current) clearBackup()
        } else if (b) {
          //  예전 보관본(서버 답 없이 저장된 것) — 서버보다 새것일 때만
          const serverAt = r.updated_at ? Date.parse(r.updated_at) : 0
          if (b.at > serverAt && JSON.stringify(b.answers) !== JSON.stringify(server)) {
            answers = b.answers
            dirty.current = true
          } else clearBackup()
        }
        baseRef.current = server
        answersRef.current = answers
        setReady({
          answers,
          status: r.status,
          updatedAt: r.updated_at,
          submittedAt: r.submitted_at,
          editedBy: r.edited_by ?? '',
        })
      })
      .catch((e) => alive && setFail(e instanceof SurveyError ? e : new SurveyError('other', String(e))))
    return () => {
      alive = false
    }
  }, [])

  /** 서버가 돌려준 답지를 받아들이기 — 보낸 뒤 이 화면에서 또 바꾼 것은 그대로 두고, 다른 분이 고친 것은 들임 */
  const accept = useCallback((r: OpenResult, expected: Answers, sent: Answers) => {
    const server = r.answers ?? {}
    const others = Object.keys(diffAnswers(expected, server).set).length + diffAnswers(expected, server).unset.length
    baseRef.current = server
    const merged = rebase(server, sent, answersRef.current)
    answersRef.current = merged
    dirty.current = !isEmptyDiff(diffAnswers(server, merged))
    if (others > 0) setNotice(`다른 분이 고친 답 ${others}개를 함께 반영했습니다${r.edited_by ? ` (마지막 작성 ${r.edited_by})` : ''}.`)
    setReady((x) =>
      x ? { ...x, answers: merged, status: r.status ?? x.status, updatedAt: r.updated_at, submittedAt: r.submitted_at ?? x.submittedAt, editedBy: r.edited_by ?? x.editedBy } : x,
    )
    return merged
  }, [])

  const flush = useCallback(async () => {
    if (!ready || !dirty.current || inFlight.current) return
    inFlight.current = true
    dirty.current = false
    const sent = answersRef.current
    const base = baseRef.current
    const diff = diffAnswers(base, sent)
    let failed = false
    setSaveState('saving')
    try {
      if (isEmptyDiff(diff)) {
        //  되돌려서 서버와 같아진 경우 — 보낼 것이 없습니다
      } else if (!legacy.current) {
        try {
          accept(await myPatch(diff.set, diff.unset), applyDiff(base, diff), sent)
        } catch (e) {
          if (!(e instanceof SurveyError && e.kind === 'missing')) throw e
          legacy.current = true
        }
      }
      if (legacy.current && !isEmptyDiff(diff)) {
        const r = await mySave(sent)
        baseRef.current = sent
        dirty.current = answersRef.current !== sent
        setReady((x) => (x ? { ...x, updatedAt: r.updated_at } : x))
      }
      setSaveError(null)
      setSaveState('saved')
      if (!dirty.current) clearBackup()
      else writeBackup(answersRef.current, baseRef.current)
    } catch (e) {
      failed = true
      dirty.current = true
      setSaveState('error')
      setSaveError(e instanceof SurveyError ? e.message : '저장하지 못했습니다. 잠시 뒤 다시 저장합니다.')
    } finally {
      inFlight.current = false
      //  저장하는 동안 또 바뀌었으면 곧 한 번 더 · 실패했으면 잠시 뒤 다시(연결이 돌아오면 저장됨)
      if (dirty.current && timer.current == null) {
        timer.current = window.setTimeout(() => {
          timer.current = null
          void flushRef.current()
        }, failed ? 8000 : 700)
      }
    }
  }, [ready, accept])

  const flushRef = useRef(flush)
  flushRef.current = flush

  //  열 때 폰 보관본으로 이어졌으면 바로 저장
  const opened = !!ready
  useEffect(() => {
    if (opened && dirty.current) void flushRef.current()
  }, [opened])

  //  화면을 벗어날 때(앱 전환 · 닫기) 남은 것을 저장 · 다시 보일 때는 서버 답지를 다시 읽기
  //  (다른 분이 그사이 고친 답이 들어오게 — 저장할 것이 남아 있으면 저장하면서 합쳐집니다)
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') {
        void flush()
        return
      }
      if (!ready || legacy.current) return
      if (dirty.current) {
        void flush()
        return
      }
      if (inFlight.current) return
      const before = baseRef.current
      myOpen()
        .then((r) => {
          if (dirty.current || inFlight.current) return
          accept(r, before, answersRef.current)
        })
        .catch(() => {
          /* 못 읽으면 지금 화면 그대로 — 다음 저장 때 합쳐집니다 */
        })
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onHide)
    }
  }, [flush, ready, accept])

  const onChange = (next: Answers) => {
    if (!ready) return
    answersRef.current = next
    dirty.current = true
    writeBackup(next, baseRef.current)
    setReady({ ...ready, answers: next })
    if (timer.current != null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      timer.current = null
      void flushRef.current()
    }, 700)
  }

  const onSubmit = async () => {
    if (!ready) return
    if (timer.current != null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
    const sent = answersRef.current
    const base = baseRef.current
    const diff = diffAnswers(base, sent)
    if (!legacy.current) {
      try {
        //  끼워 넣고 그대로 제출 — 제출되는 것은 서버에 합쳐진 답지 전체
        accept(await myPatch(diff.set, diff.unset, true), applyDiff(base, diff), sent)
      } catch (e) {
        if (!(e instanceof SurveyError && e.kind === 'missing')) throw e
        legacy.current = true
      }
    }
    if (legacy.current) {
      const r = await mySubmit(sent)
      baseRef.current = sent
      dirty.current = answersRef.current !== sent
      setReady((x) => (x ? { ...x, status: 'submitted', submittedAt: r.submitted_at, updatedAt: r.updated_at } : x))
    }
    if (!dirty.current) clearBackup()
    setSaveState('saved')
    setSaveError(null)
  }

  //  앱으로 돌아가기 — 남은 것을 저장하고, 들어온 화면으로 (바로 열었으면 첫 화면)
  const exit = () => {
    void flushRef.current()
    if (location.key !== 'default') navigate(-1)
    else navigate('/', { replace: true })
  }

  if (!BIZ_SURVEY_ENABLED) return <Notice title="지금은 설문을 받지 않습니다" body="설문 기간이 끝났습니다. 궁금하신 점은 담당자에게 말씀해 주세요." onExit={exit} />
  if (fail) return <Notice title="설문을 열 수 없습니다" body={fail.message} hook={fail.kind} onExit={exit} />
  if (!ready)
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-app px-6">
        <p className="flex items-center gap-2.5 text-[1.05rem] font-bold text-navy-500">
          <Loader2 size={20} className="animate-spin" /> 설문을 여는 중…
        </p>
      </div>
    )

  return (
    <SurveyRunner
      who="shared"
      answers={ready.answers}
      status={ready.status}
      updatedAt={ready.updatedAt}
      submittedAt={ready.submittedAt}
      editedBy={ready.editedBy}
      saveState={saveState}
      saveError={saveState === 'error' ? saveError : null}
      notice={notice}
      onNotice={() => setNotice(null)}
      onRetrySave={() => {
        dirty.current = true
        void flush()
      }}
      onChange={onChange}
      onSubmit={onSubmit}
      onExit={exit}
    />
  )
}

function Notice({ title, body, hook, onExit }: { title: string; body: string; hook?: string; onExit: () => void }) {
  return (
    <div data-survey-fail={hook ?? 'off'} className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-app px-6 text-center">
      <BrandLogo size="md" />
      <AlertTriangle size={30} className="text-amber-600" />
      <h1 className="break-keep text-[1.3rem] font-extrabold text-navy-900">{title}</h1>
      <p className="max-w-sm break-keep text-[1.05rem] leading-relaxed text-navy-600">{body}</p>
      <button type="button" data-survey-exit onClick={onExit} className="btn-ghost mt-2">
        <ArrowLeft size={18} strokeWidth={2.4} /> 앱으로 돌아가기
      </button>
    </div>
  )
}
