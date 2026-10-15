import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowLeft, ArrowRight, ChevronDown, ChevronUp, Copy, Check, Minus, Smartphone, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { usePresenter } from '../context/PresenterContext'
import { useTour } from '../context/TourContext'
import { PRESENTER_STEPS, SAMPLE_REQUEST, onStepRoute, stepLabel } from '../lib/presenter'
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

/** 화면에 실제로 보이는가 (크기 0 · 숨김 제외) */
const visible = (el: Element | null): el is HTMLElement => {
  if (!el) return false
  const r = (el as HTMLElement).getBoundingClientRect()
  if (r.width <= 0 || r.height <= 0) return false
  const st = getComputedStyle(el as HTMLElement)
  return st.visibility !== 'hidden' && st.display !== 'none'
}

export function PresenterCard() {
  const { active, index, pos, order, clientId, demoRequestId, next, prev, stop, goTo, continueFull } = usePresenter()
  const { role } = useAuth()
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
  const ctx = useMemo(() => ({ clientId, demoRequestId }), [clientId, demoRequestId])
  const here = show && onStepRoute(step, pathname, ctx)
  const last = pos === order.length - 1
  const label = stepLabel(order, pos)
  //  AI 먼저 보여 주는 중 — AI · 회신 단계에서 「전체 운영 흐름 계속 보기」 (0140)
  const aiFirst = order[0] === 'triage'
  const canContinue = aiFirst && (step.key === 'triage' || step.key === 'reply')

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
          {label}
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
      {order.map((k, i) => (
        <span key={k} className={`h-1.5 flex-1 rounded-full ${i <= pos ? 'bg-teal-500' : 'bg-navy-100'}`} />
      ))}
    </div>
  )

  //  ⚠ 카드는 프로젝터에 같이 보입니다 — 「설명(읽을 것)」과 「누를 곳」 두 칸만. (0140 정리)
  const body = (
    <div className="mt-4 space-y-3">
      {/*  이 단계 화면이 아니면 — 돌아가는 단추 하나 */}
      {!here && (
        <button
          type="button"
          data-presenter-offroute
          data-presenter-go
          onClick={() => (needsClient ? navigate('/presentation') : goTo(pos))}
          className="flex min-h-[3rem] w-full items-center justify-center gap-1.5 rounded-[14px] bg-amber-50 px-4 text-[1.05rem] font-extrabold text-amber-900 ring-1 ring-amber-200 transition hover:bg-amber-100"
        >
          {needsClient ? '병원을 먼저 고르기' : '이 단계 화면으로 돌아가기'} <ArrowRight size={17} strokeWidth={2.6} />
        </button>
      )}

      {/*  ① 설명 — 대표님이 읽을 문장 */}
      {!compact && (
        <section data-presenter-say>
          <p className="text-[0.98rem] font-extrabold text-navy-500">설명</p>
          <p data-presenter-show className="mt-1 break-keep text-[1.2rem] font-bold leading-relaxed text-navy-900">{step.note}</p>
        </section>
      )}

      {/*  ② 누를 곳 */}
      <section data-presenter-todo className="rounded-[14px] bg-teal-50 px-4 py-3">
        <p className="text-[0.98rem] font-extrabold text-teal-800">▶ 누를 곳</p>
        <p className="mt-1 break-keep text-[1.12rem] font-extrabold leading-snug text-navy-900">{step.todo}</p>

        {step.key === 'portal' && (
          <div className="mt-2.5 rounded-xl bg-white px-3 py-2.5">
            <button
              type="button"
              data-presenter-copy
              onClick={() => void copySample()}
              className="inline-flex min-h-[2.75rem] items-center gap-1.5 rounded-full bg-navy-900 px-4 text-[0.98rem] font-extrabold text-white transition hover:bg-navy-800"
            >
              {copied === 'ok' ? <Check size={16} strokeWidth={2.8} /> : <Copy size={16} strokeWidth={2.4} />}{' '}
              {copied === 'ok' ? '복사됨 — 붙여 넣으세요' : copied === 'fail' ? '복사가 막혔습니다 — 아래 문장을 직접 입력' : '예시 문장 복사'}
            </button>
            <p data-presenter-sample className="mt-1.5 break-keep text-[0.98rem] leading-snug text-navy-700">{SAMPLE_REQUEST}</p>
          </div>
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
    </div>
  )

  const nav = (
    <div className="pt-4">
      {canContinue && (
        <button
          type="button"
          data-presenter-continue
          onClick={continueFull}
          className="mb-2 flex min-h-[3rem] w-full items-center justify-center gap-1.5 rounded-[14px] bg-teal-50 px-3 text-[1.05rem] font-extrabold text-teal-800 ring-1 ring-teal-200 transition hover:bg-teal-100"
        >
          전체 운영 흐름 계속 보기 <ArrowRight size={18} strokeWidth={2.6} />
        </button>
      )}
    <div className="flex gap-2">
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
          {pos === 0 && order[0] === 'intro' ? '시연 시작' : '다음'} <ArrowRight size={18} strokeWidth={2.6} />
        </button>
      )}
    </div>
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
              {label} · {step.title} <ChevronUp size={18} strokeWidth={2.6} />
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
                {label} · {step.title}
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
