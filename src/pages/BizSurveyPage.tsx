import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, Loader2 } from 'lucide-react'
import { BrandLogo } from '../components/BrandLogo'
import { SurveyRunner, type SaveState } from '../components/bizSurvey/SurveyRunner'
import { BIZ_SURVEY_ENABLED, SURVEY_MENU_NAME, type Answers } from '../lib/bizSurvey'
import { SurveyError, myOpen, mySave, mySubmit } from '../lib/bizSurveyApi'

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
//   · 다시 열면 서버에 있는 답으로 이어집니다. 폰 보관본이 더 새것이면
//     (저장 못 하고 닫은 경우) 그것으로 이어서 다시 저장합니다.
// ─────────────────────────────────────────────────────────────────────────────

const BACKUP_KEY = 'beonemirae-ops:biz-survey:shared'

interface Ready {
  answers: Answers
  status: 'draft' | 'submitted'
  updatedAt: string | null
  submittedAt: string | null
  editedBy: string
}

function readBackup(): { answers: Answers; at: number } | null {
  try {
    const raw = localStorage.getItem(BACKUP_KEY)
    return raw ? (JSON.parse(raw) as { answers: Answers; at: number }) : null
  } catch {
    return null
  }
}
function writeBackup(answers: Answers) {
  try {
    localStorage.setItem(BACKUP_KEY, JSON.stringify({ answers, at: Date.now() }))
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
  const answersRef = useRef<Answers>({})
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
        let answers = r.answers ?? {}
        const b = readBackup()
        const serverAt = r.updated_at ? Date.parse(r.updated_at) : 0
        if (b && b.at > serverAt && JSON.stringify(b.answers) !== JSON.stringify(answers)) {
          answers = b.answers
          dirty.current = true
        } else if (b) {
          clearBackup()
        }
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

  const flush = useCallback(async () => {
    if (!ready || !dirty.current || inFlight.current) return
    inFlight.current = true
    dirty.current = false
    const sent = answersRef.current
    let failed = false
    setSaveState('saving')
    try {
      const r = await mySave(sent)
      setReady((x) => (x ? { ...x, updatedAt: r.updated_at } : x))
      setSaveError(null)
      setSaveState('saved')
      if (answersRef.current === sent) clearBackup()
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
  }, [ready])

  const flushRef = useRef(flush)
  flushRef.current = flush

  //  열 때 폰 보관본으로 이어졌으면 바로 저장
  const opened = !!ready
  useEffect(() => {
    if (opened && dirty.current) void flushRef.current()
  }, [opened])

  //  화면을 벗어날 때(앱 전환 · 닫기) 남은 것을 저장
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush()
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onHide)
    }
  }, [flush])

  const onChange = (next: Answers) => {
    if (!ready) return
    answersRef.current = next
    dirty.current = true
    writeBackup(next)
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
    const r = await mySubmit(answersRef.current)
    dirty.current = false
    clearBackup()
    setSaveState('saved')
    setSaveError(null)
    setReady((x) => (x ? { ...x, status: 'submitted', submittedAt: r.submitted_at, updatedAt: r.updated_at } : x))
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
