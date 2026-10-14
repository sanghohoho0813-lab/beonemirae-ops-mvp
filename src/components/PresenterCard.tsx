import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowLeft, ArrowRight, ChevronDown, ChevronUp, Copy, Check, Minus, Smartphone, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useData } from '../context/DataContext'
import { usePresenter } from '../context/PresenterContext'
import { useTour } from '../context/TourContext'
import { PRESENTER_STEPS, SAMPLE_REQUEST, kstStamp, onStepRoute, type PresenterStatus } from '../lib/presenter'
import { openPortalPhoneView } from './PortalViewSwitch'

// ─────────────────────────────────────────────────────────────────────────────
// 심사 시연 안내 카드 (0139) — 화면을 옮겨도 따라다니는 작은 발표 가이드
//
//   넓은 화면  직원 화면은 **왼쪽 메뉴 자리 위**(시연 중엔 메뉴 대신 카드로 이동),
//             병원 화면은 강조한 버튼을 **가리지 않는 쪽**에. 창(회신 · 요청 시트)이
//             열리면 짧은 카드(단계 · 지금 할 일 · 이전/다음)로 줄어 왼쪽에 붙습니다.
//             「이전 · 다음」은 늘 카드 맨 아래에 보입니다. 「접기」로 한 줄까지.
//   좁은 화면  위쪽 한 줄 막대(단계 · 지금 할 일 · 다음). 펼치면 아래에서 시트.
//
//  ⚠ 안내만 합니다. 누르는 것은 실제 화면의 실제 버튼이고, 저장되는 것은 실제 기록입니다.
//  ⚠ 강조는 지금 단계에서 눌러야 할 요소 **하나**에 테두리만 씌웁니다(data-presenter-spot).
//    대상이 없으면 아무것도 안 합니다 — 화면 구조를 바꾸지 않습니다.
//  ⚠ 일반 업무 중에는 나타나지 않습니다 — 「심사 시연 시작」을 누른 탭에서만.
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_TONE: Record<PresenterStatus, string> = {
  구현됨: 'bg-teal-50 text-teal-800',
  '실증 단계': 'bg-amber-50 text-amber-800',
  '측정 중': 'bg-navy-100 text-navy-700',
}

/** 화면에 실제로 보이는가 (크기 0 · 숨김 제외) */
const visible = (el: Element | null): el is HTMLElement => {
  if (!el) return false
  const r = (el as HTMLElement).getBoundingClientRect()
  if (r.width <= 0 || r.height <= 0) return false
  const st = getComputedStyle(el as HTMLElement)
  return st.visibility !== 'hidden' && st.display !== 'none'
}

export function PresenterCard() {
  const { active, index, clientId, next, prev, stop, goTo } = usePresenter()
  const { role } = useAuth()
  const { data } = useData()
  const tour = useTour()
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  const reduce = useReducedMotion()
  const [min, setMin] = useState(false)
  const [sheet, setSheet] = useState(false)
  const [side, setSide] = useState<'right' | 'left'>('left')
  const [compact, setCompact] = useState(false)
  const cardRef = useRef<HTMLElement | null>(null)
  const [copied, setCopied] = useState<'' | 'ok' | 'fail'>('')
  //  ✕ 는 바로 끝내지 않고 한 번 더 묻습니다 — 긴장한 손이 「접기」 옆을 잘못 눌러도 시연이 날아가지 않게
  const [askStop, setAskStop] = useState(false)
  const lastSpot = useRef<HTMLElement | null>(null)
  const scrolledFor = useRef<string>('')

  const inFrame = new URLSearchParams(search).get('frame') === '1'
  const staff = role === 'admin' || role === 'office'
  const show = active && staff && !inFrame && !tour.active && pathname !== '/login'
  const step = PRESENTER_STEPS[index]
  const ctx = useMemo(() => ({ clientId }), [clientId])
  const here = show && onStepRoute(step, pathname, ctx)
  const total = PRESENTER_STEPS.length - 1
  const last = index === PRESENTER_STEPS.length - 1

  //  AI 실제 호출이 한 번이라도 성공했는가 — 화면이 알 수 있는 유일한 근거(ai_calls)
  const aiOk = useMemo(() => {
    const ok = (data.aiCalls ?? []).filter((c) => c.ok)
    return ok.length ? ok.reduce((a, c) => (c.createdAt > a.createdAt ? c : a)) : null
  }, [data.aiCalls])

  //  단계가 바뀌면 펼쳐서 보여 줍니다
  useEffect(() => { setMin(false); setCopied(''); setSheet(false); setAskStop(false) }, [index])

  //  ── 강조 · 창 피하기 — 짧게 자주 확인합니다(창 · 시트가 열리고 닫히므로) ──────
  useEffect(() => {
    const clear = () => {
      lastSpot.current?.removeAttribute('data-presenter-spot')
      lastSpot.current = null
    }
    if (!show) { clear(); return }
    const portal = pathname.startsWith('/portal')
    const tick = () => {
      const dialogOpen = [...document.querySelectorAll('[role="dialog"], [data-portal-sheet]')].some((d) => visible(d) && !d.closest('[data-presenter-card]'))
      setCompact(dialogOpen)
      let target: HTMLElement | null = null
      if (here) {
        for (const sel of step.targets) {
          const found = [...document.querySelectorAll(sel)].find((el) => visible(el) && !el.closest('[data-presenter-card]'))
          if (found) { target = found as HTMLElement; break }
        }
      }
      //  자리 — 창이 열리면 왼쪽(창은 가운데). 직원 화면은 왼쪽 메뉴 자리.
      //  병원 화면은 오른쪽이 기본이되, 강조한 버튼과 더 많이 겹치면 반대쪽으로.
      if (dialogOpen || !portal) setSide('left')
      else {
        const w = (cardRef.current?.getBoundingClientRect().width ?? 400) + 24
        const r = target?.getBoundingClientRect()
        const overlap = (x0: number, x1: number) => (r ? Math.max(0, Math.min(r.right, x1) - Math.max(r.left, x0)) : 0)
        const right = overlap(window.innerWidth - w, window.innerWidth)
        const left = overlap(0, w)
        setSide(right > left ? 'left' : 'right')
      }
      if (!here) { clear(); return }
      if (target !== lastSpot.current) {
        clear()
        if (target) {
          target.setAttribute('data-presenter-spot', '1')
          lastSpot.current = target
          //  처음 보일 때 한 번만 화면 안으로 — 대표님이 스크롤한 것과 싸우지 않게
          const key = `${index}:${step.targets.find((s) => target!.matches(s)) ?? ''}`
          if (scrolledFor.current !== key) {
            scrolledFor.current = key
            const r = target.getBoundingClientRect()
            if (r.top < 70 || r.bottom > window.innerHeight - 40) target.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' })
          }
        }
      }
    }
    tick()
    const t = window.setInterval(tick, 350)
    return () => { window.clearInterval(t); clear() }
  }, [show, here, step, index, reduce, pathname])

  if (!show) return null

  const copySample = async () => {
    try {
      await navigator.clipboard.writeText(SAMPLE_REQUEST)
      setCopied('ok')
    } catch {
      setCopied('fail')   //  복사가 막힌 브라우저 — 문장은 아래에 그대로 보입니다
    }
  }

  const needsClient = (step.key === 'portal' || step.key === 'reply') && !clientId
  const onPortalStep = step.key === 'portal' && here
  const onRequests = pathname === '/requests'

  // ── 공통 조각 ──────────────────────────────────────────────────────────────
  const head = (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <p data-presenter-stepno className="text-[1rem] font-extrabold tracking-wide text-teal-700">
          {index === 0 ? '시작' : `STEP ${index} / ${total}`}
        </p>
        <h2 data-presenter-title className="mt-0.5 break-keep text-[1.4rem] font-black leading-tight tracking-tight text-navy-900">
          {step.title}
        </h2>
      </div>
      <button
        type="button"
        data-presenter-min
        onClick={() => setMin(true)}
        aria-label="안내 카드 접기"
        className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full text-navy-500 transition hover:bg-navy-50 lg:flex"
      >
        <Minus size={20} strokeWidth={2.6} />
      </button>
      <button
        type="button"
        data-presenter-stop
        onClick={() => setAskStop(true)}
        aria-label="발표 가이드 종료"
        title="발표 가이드 종료"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-navy-500 transition hover:bg-navy-50"
      >
        <X size={20} strokeWidth={2.6} />
      </button>
    </div>
  )

  const stopAsk = askStop && (
    <div data-presenter-stop-ask role="alert" className="mt-3 flex flex-wrap items-center gap-2 rounded-[14px] bg-navy-50 px-3.5 py-2.5">
      <p className="min-w-0 flex-1 break-keep text-[1.02rem] font-extrabold text-navy-900">발표 가이드를 끝낼까요?</p>
      <button type="button" data-presenter-stop-yes onClick={stop} className="min-h-[2.75rem] rounded-full bg-navy-900 px-4 text-[1rem] font-extrabold text-white">
        끝내기
      </button>
      <button type="button" data-presenter-stop-no onClick={() => setAskStop(false)} className="min-h-[2.75rem] rounded-full bg-white px-4 text-[1rem] font-extrabold text-navy-800 ring-1 ring-navy-200">
        계속
      </button>
    </div>
  )

  const progress = (
    <div aria-hidden="true" className="mt-3 flex gap-1">
      {PRESENTER_STEPS.map((s, i) => (
        <span key={s.key} className={`h-1.5 flex-1 rounded-full ${i <= index ? 'bg-teal-500' : 'bg-navy-100'}`} />
      ))}
    </div>
  )

  const body = (
    <div className="mt-4 space-y-3">
      {/*  이 단계 화면이 아니면 — 돌아가는 길을 먼저 */}
      {!here && (
        <div data-presenter-offroute role="status" className="rounded-[14px] bg-amber-50 px-4 py-3">
          <p className="break-keep text-[1.02rem] font-bold text-amber-900">
            {needsClient ? '시연 거래처를 먼저 고르세요.' : '지금 화면은 이 단계 화면이 아닙니다.'}
          </p>
          <button
            type="button"
            data-presenter-go
            onClick={() => (needsClient ? navigate('/presentation') : goTo(index))}
            className="mt-2 inline-flex min-h-[2.75rem] items-center gap-1.5 rounded-full bg-navy-900 px-4 text-[1.02rem] font-extrabold text-white transition hover:bg-navy-800"
          >
            {needsClient ? '시연 준비 화면으로' : `「${step.title}」 화면으로`} <ArrowRight size={17} strokeWidth={2.6} />
          </button>
        </div>
      )}

      {!compact && (<>
      <section>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[0.98rem] font-extrabold text-navy-500">지금 보여드리는 것</p>
          {step.status && <span data-presenter-status className={`pill ${STATUS_TONE[step.status]}`}>{step.status}</span>}
        </div>
        <p data-presenter-show className="mt-1 break-keep text-[1.12rem] font-bold leading-snug text-navy-900">{step.show}</p>
      </section>

      {(step.before || step.now) && (
        <section className="space-y-2">
          {step.before && (
            <p data-presenter-before className="break-keep text-[1.02rem] leading-snug text-navy-600">
              <b className="mr-1.5 text-navy-500">기존</b>{step.before}
            </p>
          )}
          {step.now && (
            <p data-presenter-now className="break-keep text-[1.02rem] leading-snug text-navy-800">
              <b className="mr-1.5 text-teal-700">바뀐 방식</b>{step.now}
            </p>
          )}
        </section>
      )}

      {step.effects && step.effects.length > 0 && (
        <section>
          <p className="text-[0.98rem] font-extrabold text-navy-500">기대 효과</p>
          <ul data-presenter-effects className="mt-0.5 break-keep text-[1.02rem] font-bold leading-snug text-navy-800">
            {step.effects.map((e, i) => (
              <li key={e} className="inline">{i > 0 && <span aria-hidden="true" className="mx-1.5 text-teal-500">·</span>}{e}</li>
            ))}
          </ul>
        </section>
      )}
      </>)}

      {/*  ▶ 지금 할 일 — 이 카드의 주인공 */}
      <section data-presenter-todo className="rounded-[14px] bg-teal-50 px-4 py-3">
        <p className="text-[0.98rem] font-extrabold text-teal-800">▶ 지금 할 일</p>
        <p className="mt-1 break-keep text-[1.08rem] font-extrabold leading-snug text-navy-900">{step.todo}</p>

        {step.key === 'portal' && (
          <div className="mt-2.5 rounded-xl bg-white px-3 py-2.5">
            <button
              type="button"
              data-presenter-copy
              onClick={() => void copySample()}
              className="inline-flex min-h-[2.75rem] items-center gap-1.5 rounded-full bg-navy-900 px-4 text-[0.98rem] font-extrabold text-white transition hover:bg-navy-800"
            >
              {copied === 'ok' ? <Check size={16} strokeWidth={2.8} /> : <Copy size={16} strokeWidth={2.4} />}{' '}
              {copied === 'ok' ? '복사됨 — 특이사항 칸에 붙여 넣기' : copied === 'fail' ? '복사가 막혔습니다 — 아래 문장을 직접 입력' : '예시 문장 복사'}
            </button>
            <p data-presenter-sample className="mt-1.5 break-keep text-[0.98rem] leading-snug text-navy-700">{SAMPLE_REQUEST}</p>
          </div>
        )}

        {step.key === 'triage' && (
          <p data-presenter-ai={aiOk ? 'ok' : 'unverified'} className={`mt-2 break-keep text-[0.98rem] font-bold leading-snug ${aiOk ? 'text-teal-800' : 'text-amber-800'}`}>
            {aiOk
              ? `AI 실제 호출 확인됨 · 최근 성공 ${kstStamp(aiOk.createdAt)}`
              : 'AI 실제 호출 확인 필요 — 시연 전에 한 번 실행해 보세요. 안 되면 화면에 실패로 나오고, 가짜 결과는 만들지 않습니다.'}
          </p>
        )}

        {step.key === 'reply' && clientId && (
          <button
            type="button"
            data-presenter-portal-check={onRequests ? 'portal' : 'staff'}
            onClick={() => navigate(onRequests ? `/portal/c/${clientId}/requests` : '/requests')}
            className="mt-2.5 inline-flex min-h-[2.75rem] items-center gap-1.5 rounded-full bg-navy-900 px-4 text-[1.02rem] font-extrabold text-white transition hover:bg-navy-800"
          >
            {onRequests ? '병원 화면에서 확인' : '직원 요청함으로'} <ArrowRight size={17} strokeWidth={2.6} />
          </button>
        )}

        {onPortalStep && (
          <button
            type="button"
            data-presenter-phone
            onClick={() => openPortalPhoneView()}
            className="mt-2.5 hidden min-h-[2.75rem] items-center gap-1.5 rounded-full bg-white px-3.5 text-[0.98rem] font-extrabold text-navy-800 transition hover:bg-navy-50 lg:inline-flex"
          >
            <Smartphone size={16} strokeWidth={2.4} /> 휴대폰 화면으로 보기
          </button>
        )}
      </section>

      {step.aside && !compact && <p data-presenter-aside className="break-keep text-[0.98rem] leading-snug text-navy-500">{step.aside}</p>}

      {/*  발표자 메모 — 기본은 접힘. 두세 문장. */}
      <details data-presenter-note className="group rounded-[14px] bg-navy-50 px-4 py-2.5">
        <summary className="flex min-h-[2.5rem] cursor-pointer list-none items-center justify-between gap-2 text-[1rem] font-extrabold text-navy-700">
          발표자 메모 — 이렇게 설명하세요
          <ChevronDown size={18} strokeWidth={2.6} className="shrink-0 transition-transform group-open:rotate-180" />
        </summary>
        <p className="mt-1 break-keep pb-1 text-[1.04rem] leading-relaxed text-navy-800">{step.note}</p>
      </details>
    </div>
  )

  const nav = (
    <div className="flex gap-2 pt-4">
      <button
        type="button"
        data-presenter-prev
        onClick={prev}
        disabled={index === 0}
        className="flex min-h-[3rem] flex-1 items-center justify-center gap-1.5 rounded-[14px] bg-navy-50 px-3 text-[1.05rem] font-extrabold text-navy-800 transition hover:bg-navy-100 disabled:opacity-40"
      >
        <ArrowLeft size={18} strokeWidth={2.6} /> 이전
      </button>
      {last ? (
        <button
          type="button"
          data-presenter-finish
          onClick={stop}
          className="flex min-h-[3rem] flex-[1.6] items-center justify-center gap-1.5 rounded-[14px] bg-navy-900 px-3 text-[1.05rem] font-extrabold text-white transition hover:bg-navy-800"
        >
          발표 가이드 종료
        </button>
      ) : (
        <button
          type="button"
          data-presenter-next
          onClick={next}
          className="flex min-h-[3rem] flex-[1.6] items-center justify-center gap-1.5 rounded-[14px] bg-navy-900 px-3 text-[1.05rem] font-extrabold text-white transition hover:bg-navy-800"
        >
          {index === 0 ? '시연 시작' : '다음 단계'} <ArrowRight size={18} strokeWidth={2.6} />
        </button>
      )}
    </div>
  )

  const fade = reduce ? {} : { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: 12 }, transition: { duration: 0.2 } }

  return (
    <>
      {/* ── 넓은 화면 ── */}
      <div className="pointer-events-none fixed inset-0 z-[80] hidden lg:block">
        <AnimatePresence mode="wait">
          {min ? (
            <motion.button
              key="pill"
              type="button"
              data-presenter-card
              data-presenter-pill
              onClick={() => setMin(false)}
              {...fade}
              className={`pointer-events-auto absolute bottom-3 flex min-h-[3.25rem] items-center gap-2.5 rounded-full bg-navy-900 px-5 text-[1.05rem] font-extrabold text-white shadow-2xl ${side === 'left' ? 'left-3' : 'right-3'}`}
            >
              {index === 0 ? '시작' : `STEP ${index}/${total}`} · {step.title} <ChevronUp size={18} strokeWidth={2.6} />
            </motion.button>
          ) : (
            <motion.aside
              key={`card-${index}`}
              ref={cardRef}
              data-presenter-card
              data-presenter-side={side}
              data-presenter-compact={compact ? '1' : undefined}
              aria-label="심사 시연 안내"
              {...fade}
              className={`pointer-events-auto absolute bottom-3 flex max-h-[calc(100dvh-1.5rem)] flex-col rounded-[20px] bg-white p-5 shadow-2xl ring-1 ring-navy-100 ${
                compact ? 'w-[min(20rem,calc(100vw-1.5rem))]' : 'w-[min(19.5rem,calc(100vw-1.5rem))] xl:w-[min(23rem,calc(100vw-1.5rem))]'
              } ${side === 'left' ? 'left-3' : 'right-3'}`}
            >
              <div className="shrink-0">
                {head}
                {stopAsk}
                {progress}
              </div>
              <div data-presenter-body className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">{body}</div>
              <div className="shrink-0">{nav}</div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      {/* ── 좁은 화면 — 위 한 줄 막대 + 펼치면 아래 시트 ── */}
      <div className="lg:hidden">
        {!sheet && (
          <div
            data-presenter-card
            data-presenter-bar
            className="fixed inset-x-2 top-2 z-[80] flex items-center gap-2 rounded-2xl bg-navy-900 py-2 pl-4 pr-2 text-white shadow-2xl"
            style={{ top: 'max(0.5rem, env(safe-area-inset-top))' }}
          >
            <button type="button" onClick={() => setSheet(true)} className="min-w-0 flex-1 text-left">
              <span className="block truncate text-[0.98rem] font-extrabold text-teal-300">
                {index === 0 ? '시작' : `STEP ${index}/${total}`} · {step.title}
              </span>
              <span className="block truncate text-[1rem] font-bold">{here ? step.todo : '이 단계 화면이 아닙니다 — 눌러서 이동'}</span>
            </button>
            <button type="button" data-presenter-open onClick={() => setSheet(true)} aria-label="안내 펼치기" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10">
              <ChevronDown size={20} strokeWidth={2.6} />
            </button>
            {!last && (
              <button type="button" data-presenter-next onClick={next} aria-label="다음 단계" className="flex h-11 min-w-[2.75rem] shrink-0 items-center justify-center rounded-xl bg-teal-500 px-3 font-extrabold">
                <ArrowRight size={20} strokeWidth={2.6} />
              </button>
            )}
          </div>
        )}
        <AnimatePresence>
          {sheet && (
            <>
              <motion.div key="dim" className="fixed inset-0 z-[80] bg-navy-950/40" onClick={() => setSheet(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
              <motion.aside
                key="sheet"
                data-presenter-card
                data-presenter-sheet
                aria-label="심사 시연 안내"
                initial={reduce ? false : { y: '100%' }}
                animate={{ y: 0 }}
                exit={reduce ? undefined : { y: '100%' }}
                transition={{ duration: 0.22 }}
                className="fixed inset-x-0 bottom-0 z-[81] max-h-[85dvh] overflow-y-auto rounded-t-[20px] bg-white px-5 pb-5 pt-3 shadow-2xl"
                style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
              >
                <button type="button" onClick={() => setSheet(false)} aria-label="안내 접기" className="mx-auto mb-2 block h-1.5 w-12 rounded-full bg-navy-200" />
                {head}
                {stopAsk}
                {progress}
                {body}
                {nav}
              </motion.aside>
            </>
          )}
        </AnimatePresence>
      </div>
    </>
  )
}
