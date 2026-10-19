import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { BrandLogo } from '../components/BrandLogo'
import { SurveyRunner, type SaveState } from '../components/bizSurvey/SurveyRunner'
import { BIZ_SURVEY_ENABLED, SURVEY_TITLE, type Answers, type Respondent } from '../lib/bizSurvey'
import { SurveyError, openSurvey, saveSurvey, submitSurvey } from '../lib/bizSurveyApi'

// ─────────────────────────────────────────────────────────────────────────────
// 사업계획서 사전 설문 — 링크로 여는 화면 (/survey/<열쇠>) · 0144
//
//  로그인 없이 링크 하나로 엽니다. 열쇠가 맞고 · 만료 · 폐기되지 않았을 때만 그
//  사람의 답지 하나가 열립니다(서버가 판단 — biz_survey_open).
//
//  ── 저장 ──────────────────────────────────────────────────────────────────
//   · 고를 때마다 0.7초 뒤 서버에 저장합니다(자동 저장).
//   · 서버에 닿지 못하면 **이 폰에만** 잠시 보관했다가 다시 저장합니다. 저장되면
//     폰의 보관본은 지웁니다 — 회사 정보가 폰에 오래 남지 않게.
//   · 링크를 다시 열면 서버에 있는 답으로 이어집니다. 폰 보관본이 더 새것이면
//     (저장 못 하고 닫은 경우) 그것으로 이어서 다시 저장합니다.
// ─────────────────────────────────────────────────────────────────────────────

const BACKUP_KEY = (who: Respondent) => `beonemirae-ops:biz-survey:${who}`

interface Ready {
  who: Respondent
  answers: Answers
  status: 'draft' | 'submitted'
  updatedAt: string | null
  submittedAt: string | null
  expiresAt: string | null
}

function readBackup(who: Respondent): { answers: Answers; at: number } | null {
  try {
    const raw = localStorage.getItem(BACKUP_KEY(who))
    return raw ? (JSON.parse(raw) as { answers: Answers; at: number }) : null
  } catch {
    return null
  }
}
function writeBackup(who: Respondent, answers: Answers) {
  try {
    localStorage.setItem(BACKUP_KEY(who), JSON.stringify({ answers, at: Date.now() }))
  } catch {
    /* 저장 공간이 막힌 폰 — 서버 저장만 합니다 */
  }
}
function clearBackup(who: Respondent) {
  try {
    localStorage.removeItem(BACKUP_KEY(who))
  } catch {
    /* 무시 */
  }
}

export function BizSurveyPage() {
  const { token = '' } = useParams()
  const [ready, setReady] = useState<Ready | null>(null)
  const [fail, setFail] = useState<SurveyError | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const answersRef = useRef<Answers>({})
  const dirty = useRef(false)
  const inFlight = useRef(false)
  const timer = useRef<number | null>(null)

  //  주소의 열쇠가 다른 사이트로 새지 않게 (이 화면에는 바깥 링크가 없지만 혹시 몰라)
  useEffect(() => {
    document.title = SURVEY_TITLE
    const metas = [
      ['referrer', 'no-referrer'],
      ['robots', 'noindex, nofollow'],
    ].map(([name, content]) => {
      const m = document.createElement('meta')
      m.name = name
      m.content = content
      document.head.appendChild(m)
      return m
    })
    return () => metas.forEach((m) => m.remove())
  }, [])

  useEffect(() => {
    if (!BIZ_SURVEY_ENABLED) return
    let alive = true
    openSurvey(token)
      .then((r) => {
        if (!alive) return
        let answers = r.answers ?? {}
        const b = readBackup(r.respondent)
        const serverAt = r.updated_at ? Date.parse(r.updated_at) : 0
        if (b && b.at > serverAt && JSON.stringify(b.answers) !== JSON.stringify(answers)) {
          answers = b.answers
          dirty.current = true
        } else if (b) {
          clearBackup(r.respondent)
        }
        answersRef.current = answers
        setReady({
          who: r.respondent,
          answers,
          status: r.status,
          updatedAt: r.updated_at,
          submittedAt: r.submitted_at,
          expiresAt: r.expires_at,
        })
      })
      .catch((e) => alive && setFail(e instanceof SurveyError ? e : new SurveyError('other', String(e))))
    return () => {
      alive = false
    }
  }, [token])

  const flush = useCallback(async () => {
    if (!ready || !dirty.current || inFlight.current) return
    inFlight.current = true
    dirty.current = false
    const sent = answersRef.current
    let failed = false
    setSaveState('saving')
    try {
      const r = await saveSurvey(token, sent)
      setReady((x) => (x ? { ...x, updatedAt: r.updated_at } : x))
      setSaveError(null)
      setSaveState('saved')
      if (answersRef.current === sent) clearBackup(ready.who)
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
  }, [ready, token])

  const flushRef = useRef(flush)
  flushRef.current = flush

  //  열 때 폰 보관본으로 이어졌으면 바로 저장
  useEffect(() => {
    if (ready && dirty.current) void flush()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready?.who])

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
    writeBackup(ready.who, next)
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
    const r = await submitSurvey(token, answersRef.current)
    dirty.current = false
    clearBackup(ready.who)
    setSaveState('saved')
    setSaveError(null)
    setReady((x) => (x ? { ...x, status: 'submitted', submittedAt: r.submitted_at, updatedAt: r.updated_at } : x))
  }

  if (!BIZ_SURVEY_ENABLED) return <Notice title="지금은 설문을 받지 않습니다" body="설문 기간이 끝났습니다. 궁금하신 점은 담당자에게 말씀해 주세요." />
  if (fail)
    return (
      <Notice
        title={fail.kind === 'link' ? '링크를 열 수 없습니다' : '설문을 열 수 없습니다'}
        body={fail.message}
        hook={fail.kind}
      />
    )
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
      who={ready.who}
      answers={ready.answers}
      status={ready.status}
      updatedAt={ready.updatedAt}
      submittedAt={ready.submittedAt}
      expiresAt={ready.expiresAt}
      saveState={saveState}
      saveError={saveState === 'error' ? saveError : null}
      onRetrySave={() => {
        dirty.current = true
        void flush()
      }}
      onChange={onChange}
      onSubmit={onSubmit}
    />
  )
}

function Notice({ title, body, hook }: { title: string; body: string; hook?: string }) {
  return (
    <div data-survey-fail={hook ?? 'off'} className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-app px-6 text-center">
      <BrandLogo size="md" />
      <AlertTriangle size={30} className="text-amber-600" />
      <h1 className="break-keep text-[1.3rem] font-extrabold text-navy-900">{title}</h1>
      <p className="max-w-sm break-keep text-[1.05rem] leading-relaxed text-navy-600">{body}</p>
    </div>
  )
}
