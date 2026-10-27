import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronDown, Copy, Check, Megaphone, MousePointerClick, Smartphone, Sparkles, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { usePresenter } from '../context/PresenterContext'
import { useTour } from '../context/TourContext'
import { LOOK_STEPS, PRESENTER_STEPS, SAMPLE_MEMO, SAMPLE_REQUEST, onStepRoute, stepLabel } from '../lib/presenter'
import { openPortalPhoneView } from './PortalViewSwitch'
import { inPhoneFrame } from '../lib/deviceView'

// ─────────────────────────────────────────────────────────────────────────────
// 발표 안내판 (0139 → 0140 집중 화면)
//
//   대표님: 「시연이 시작되면 왼쪽 메뉴는 다 안 보이게 — 시연에만 집중할 수 있게.
//            뭐가 뭔지, 뭘 읽어야 하는지 엄청 직관적으로.」
//
//   넓은 화면  왼쪽 메뉴 자리를 **남색 안내판 하나**가 차지합니다(메뉴 · 위쪽 도구는 숨김).
//             안내판에는 세 가지뿐 — 「설명」(읽을 문장) · 「누를 곳」 · 이전/다음.
//             화면 본문은 안내판 폭만큼 오른쪽으로 비켜 서서(body padding) 가려지는 곳이 없습니다.
//             눌러야 할 버튼 위에는 「여기를 누르세요」 말풍선이 뜹니다.
//   좁은 화면  위쪽 한 줄 막대(단계 · 누를 곳 · 다음). 펼치면 아래에서 시트.
//
//  ⚠ 안내만 합니다. 누르는 것은 실제 화면의 실제 버튼이고, 저장되는 것은 실제 기록입니다.
//  ⚠ 강조는 지금 단계 요소 **하나**에 테두리 + 말풍선(data-presenter-spot · data-presenter-bubble).
//    대상이 없으면 아무것도 안 합니다 — 화면 구조를 바꾸지 않습니다.
//  ⚠ 일반 업무 중에는 나타나지 않습니다 — 발표 시작 단추를 누른 탭에서만.
// ─────────────────────────────────────────────────────────────────────────────

/** 화면에 실제로 보이는가 (크기 0 · 숨김 제외) */
const visible = (el: Element | null): el is HTMLElement => {
  if (!el) return false
  const r = (el as HTMLElement).getBoundingClientRect()
  if (r.width <= 0 || r.height <= 0) return false
  const st = getComputedStyle(el as HTMLElement)
  return st.visibility !== 'hidden' && st.display !== 'none'
}

type Bubble = { x: number; top: number; bottom: number; right: number; mid: number; side: boolean; press: boolean }

export function PresenterCard() {
  const { active, index, pos, order, clientId, demoRequestId, next, prev, stop, goTo } = usePresenter()
  const { role } = useAuth()
  const tour = useTour()
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  const reduce = useReducedMotion()
  const [sheet, setSheet] = useState(false)
  const [copied, setCopied] = useState<'' | 'ok' | 'fail'>('')
  //  ✕ 는 바로 끝내지 않고 한 번 더 묻습니다 — 긴장한 손이 잘못 눌러도 시연이 날아가지 않게
  const [askStop, setAskStop] = useState(false)
  const [bubble, setBubble] = useState<Bubble | null>(null)
  const lastSpot = useRef<HTMLElement | null>(null)
  const scrolledFor = useRef<string>('')
  //  0143 안정화 — 강조한 단추로 화면을 옮긴 시각 · 그 뒤 사람이 직접 움직였는지
  const scrolledAt = useRef(0)
  const userMoved = useRef(false)

  const inFrame = new URLSearchParams(search).get('frame') === '1' || inPhoneFrame()
  const staff = role === 'admin' || role === 'office'
  const show = active && staff && !inFrame && !tour.active && pathname !== '/login'
  const step = PRESENTER_STEPS[index]
  const ctx = useMemo(() => ({ clientId, demoRequestId }), [clientId, demoRequestId])
  const here = show && onStepRoute(step, pathname, ctx)
  const last = pos === order.length - 1
  const label = stepLabel(order, pos)
  const look = LOOK_STEPS.has(step.key)

  //  단계가 바뀌면 처음 상태로
  useEffect(() => { setCopied(''); setSheet(false); setAskStop(false) }, [index])

  //  ── 강조 · 말풍선 — 짧게 자주 확인합니다(창 · 시트가 열리고 닫히므로) ──────
  useEffect(() => {
    const clear = () => {
      lastSpot.current?.removeAttribute('data-presenter-spot')
      lastSpot.current = null
    }
    if (!show || !here) { clear(); setBubble(null); return }
    const tick = () => {
      let target: HTMLElement | null = null
      for (const sel of step.targets) {
        const found = [...document.querySelectorAll(sel)].find((el) => visible(el) && !el.closest('[data-presenter-card]'))
        if (found) { target = found as HTMLElement; break }
      }
      if (target !== lastSpot.current) {
        clear()
        if (target) {
          target.setAttribute('data-presenter-spot', '1')
          lastSpot.current = target
          //  처음 보일 때 한 번만 화면 안으로 — 대표님이 스크롤한 것과 싸우지 않게
          const key = `${index}:${step.targets.find((s) => target!.matches(s)) ?? ''}`
          if (scrolledFor.current !== key) {
            scrolledFor.current = key
            scrolledAt.current = Date.now()
            userMoved.current = false
            const r = target.getBoundingClientRect()
            //  0143 — 창 안에서는 필요한 만큼만(nearest) — 가운데로 끌어오면 창 위쪽 제목(「AI 제안 → 담당자 최종 확인」)이 밀려 올라감
            if (r.top < 90 || r.bottom > window.innerHeight - 40) target.scrollIntoView({ block: target.closest('[role="dialog"]') ? 'nearest' : 'center', behavior: reduce ? 'auto' : 'smooth' })
          }
        }
      }
      //  ⚠ 0143 — 옮긴 직후(2.5초 안) 위에 결과가 끼어들어 단추가 다시 화면 밖으로 밀리면 한 번 더 따라갑니다.
      //    사람이 직접 스크롤 · 휠 · 터치 · 키를 썼으면 따라가지 않습니다(대표님이 움직인 것과 싸우지 않게).
      if (target && !userMoved.current && Date.now() - scrolledAt.current < 2500) {
        const r = target.getBoundingClientRect()
        if (r.bottom > window.innerHeight - 20 || r.top < 60) target.scrollIntoView({ block: target.closest('[role="dialog"]') ? 'nearest' : 'center', behavior: 'auto' })
      }
      if (target) {
        const r = target.getBoundingClientRect()
        //  창 안의 작은 단추는 **오른쪽 옆**에 (위에 두면 바로 위 글 — 예: 회신 초안 — 을 가림)
        const side = !!target.closest('[role="dialog"]') && r.width < 420 && r.right + 250 < window.innerWidth
        //  단추면 「여기를 누르세요」, 결과 · 칸이면 「여기를 보세요」 (0141)
        const press = target.matches('button, a, [role="button"], input, select, textarea, summary')
        //  화면 큰 덩어리(흐름 띠 · 고도화 계획 칸 등)는 테두리만 — 말풍선이 그 위 제목 글을 가리지 않게
        //  0143 — 화면 높이의 절반이 넘는 칸(성과 화면 세로 칸 등)도 테두리만 — 말풍선이 화면 밖으로 나가던 것
        if (!press && ((r.width > 640 && r.height > 220) || r.height > window.innerHeight * 0.45)) { setBubble(null); return }
        setBubble((b) => {
          const n = { x: Math.round(r.left + Math.min(r.width, 360) / 2), top: Math.round(r.top), bottom: Math.round(r.bottom), right: Math.round(r.right), mid: Math.round(r.top + r.height / 2), side, press }
          return b && b.x === n.x && b.top === n.top && b.bottom === n.bottom && b.right === n.right && b.side === n.side && b.press === n.press ? b : n
        })
      } else setBubble(null)
    }
    const moved = () => { userMoved.current = true }
    tick()
    const t = window.setInterval(tick, 300)
    window.addEventListener('scroll', tick, true)
    window.addEventListener('resize', tick)
    window.addEventListener('wheel', moved, { passive: true })
    window.addEventListener('touchmove', moved, { passive: true })
    window.addEventListener('keydown', moved)
    //  누르기(마우스 · 손가락)도 사람이 움직인 것 — 예: 「초안 사용」이 회신 칸으로 화면을 옮김
    window.addEventListener('pointerdown', moved, { passive: true })
    return () => {
      window.clearInterval(t)
      window.removeEventListener('scroll', tick, true)
      window.removeEventListener('resize', tick)
      window.removeEventListener('wheel', moved)
      window.removeEventListener('touchmove', moved)
      window.removeEventListener('keydown', moved)
      window.removeEventListener('pointerdown', moved)
      clear()
    }
  }, [show, here, step, index, reduce])

  //  말풍선이 단추를 바로 따라가게 — 창 안 스크롤 · 부드러운 이동 중에도 (매 화면 그리기마다 위치만 다시 읽음)
  useEffect(() => {
    if (!show || !here) return
    let raf = 0
    const follow = () => {
      const el = lastSpot.current
      if (el && el.isConnected) {
        const r = el.getBoundingClientRect()
        setBubble((b) => {
          if (!b) return b
          const x = Math.round(r.left + Math.min(r.width, 360) / 2), top = Math.round(r.top), bottom = Math.round(r.bottom), right = Math.round(r.right)
          return b.x === x && b.top === top && b.bottom === bottom && b.right === right ? b : { ...b, x, top, bottom, right, mid: Math.round(r.top + r.height / 2) }
        })
      }
      raf = requestAnimationFrame(follow)
    }
    raf = requestAnimationFrame(follow)
    return () => cancelAnimationFrame(raf)
  }, [show, here])

  //  0143 — 안내 카드가 떠 있는 동안 창(모달)은 카드 오른쪽 자리에 뜨게 (index.css · 1024 폭에서 카드가 창을 가리던 것)
  //  ⚠ 훅은 아래 `if (!show) return null` 보다 위에 있어야 합니다.
  useEffect(() => {
    if (!show) return
    const el = document.documentElement
    el.setAttribute('data-presenter-card-on', '1')
    return () => el.removeAttribute('data-presenter-card-on')
  }, [show])

  if (!show) return null

  const copySample = async (text = SAMPLE_REQUEST) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied('ok')
    } catch {
      setCopied('fail')   //  복사가 막힌 브라우저 — 문장은 아래에 그대로 보입니다
    }
  }

  const needsClient = (step.key === 'portal' || step.key === 'reply') && !clientId
  const onPortalStep = step.key === 'portal' && here
  const onRequests = pathname === '/requests'

  // ── 조각 — dark: 넓은 화면 안내판(남색) · light: 폰 시트 ────────────────────
  const stopAsk = (dark: boolean) => askStop && (
    <div data-presenter-stop-ask role="alert" className={`mt-3 flex flex-wrap items-center gap-2 rounded-[14px] px-3.5 py-2.5 ${dark ? 'bg-white/10' : 'bg-navy-50'}`}>
      <p className={`min-w-0 flex-1 break-keep text-[1.02rem] font-extrabold ${dark ? 'text-white' : 'text-navy-900'}`}>발표 안내를 끝낼까요?</p>
      <button type="button" data-presenter-stop-yes onClick={stop} className="min-h-[2.75rem] rounded-full bg-rose-500 px-4 text-[1rem] font-extrabold text-white">
        끝내기
      </button>
      <button type="button" data-presenter-stop-no onClick={() => setAskStop(false)} className={`min-h-[2.75rem] rounded-full px-4 text-[1rem] font-extrabold ${dark ? 'bg-white text-navy-900' : 'bg-white text-navy-800 ring-1 ring-navy-200'}`}>
        계속
      </button>
    </div>
  )

  const progress = (dark: boolean) => (
    <div aria-hidden="true" className="mt-3 flex gap-1">
      {order.map((k, i) => (
        <span key={k} className={`h-1.5 flex-1 rounded-full ${i <= pos ? (dark ? 'bg-teal-400' : 'bg-teal-500') : dark ? 'bg-white/15' : 'bg-navy-100'}`} />
      ))}
    </div>
  )

  const offroute = !here && (
    <button
      type="button"
      data-presenter-offroute
      data-presenter-go
      onClick={() => (needsClient ? navigate('/presentation') : goTo(pos))}
      className="flex min-h-[3rem] w-full items-center justify-center gap-1.5 rounded-[14px] bg-amber-400 px-4 text-[1.05rem] font-extrabold text-navy-950 transition hover:bg-amber-300"
    >
      {needsClient ? '병원을 먼저 고르기' : '이 단계 화면으로 돌아가기'} <ArrowRight size={17} strokeWidth={2.6} />
    </button>
  )

  //  누를 곳 안의 보조 단추 (예시 문장 복사 · 병원 화면에서 확인 · 휴대폰 화면)
  const extras = (
    <>
      {step.key === 'portal' && (
        <div className="mt-3 rounded-xl bg-white px-3 py-2.5">
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
      {step.key === 'collect' && (
        <div className="mt-3 rounded-xl bg-white px-3 py-2.5">
          <button
            type="button"
            data-presenter-copy-memo
            onClick={() => void copySample(SAMPLE_MEMO)}
            className="inline-flex min-h-[2.75rem] items-center gap-1.5 rounded-full bg-navy-900 px-4 text-[0.98rem] font-extrabold text-white transition hover:bg-navy-800"
          >
            {copied === 'ok' ? <Check size={16} strokeWidth={2.8} /> : <Copy size={16} strokeWidth={2.4} />}{' '}
            {copied === 'ok' ? '복사됨 — 특이사항에 붙여 넣으세요' : copied === 'fail' ? '복사가 막혔습니다 — 아래 메모를 직접 입력' : '예시 메모 복사'}
          </button>
          <p data-presenter-sample-memo className="mt-1.5 break-keep text-[0.98rem] leading-snug text-navy-700">{SAMPLE_MEMO}</p>
        </div>
      )}
      {step.key === 'reply' && clientId && (
        <button
          type="button"
          data-presenter-portal-check={onRequests ? 'portal' : 'staff'}
          onClick={() => navigate(onRequests ? `/portal/c/${clientId}/requests` : demoRequestId ? `/requests?focus=${demoRequestId}` : '/requests')}
          className="mt-3 inline-flex min-h-[2.75rem] items-center gap-1.5 rounded-full bg-navy-900 px-4 text-[1.02rem] font-extrabold text-white transition hover:bg-navy-800"
        >
          {onRequests ? '병원 화면에서 확인' : '직원 요청함으로'} <ArrowRight size={17} strokeWidth={2.6} />
        </button>
      )}
      {onPortalStep && (
        <button
          type="button"
          data-presenter-phone
          onClick={() => openPortalPhoneView()}
          className="mt-3 hidden min-h-[2.75rem] items-center gap-1.5 rounded-full bg-white px-3.5 text-[0.98rem] font-extrabold text-navy-800 transition hover:bg-navy-50 lg:inline-flex"
        >
          <Smartphone size={16} strokeWidth={2.4} /> 휴대폰 화면으로 보기
        </button>
      )}
    </>
  )

  //  이 단계의 실제 AI 기능 (0141) — 「AI · 오늘 브리핑」처럼 한눈에
  const aiChip = step.ai ? (
    <p data-presenter-ai-feature className="inline-flex items-center gap-1.5 rounded-full bg-violet-500 px-3.5 py-1.5 text-[1rem] font-black text-white shadow">
      <Sparkles size={17} strokeWidth={2.6} aria-hidden="true" /> {step.ai}
    </p>
  ) : null

  //  이 영역의 개발 예정 AI (0141) — 아직 없는 것, 「개발 예정」으로만
  const planned = (dark: boolean) =>
    step.planned?.length ? (
      <section data-presenter-planned className={`rounded-[14px] px-4 py-3 ${dark ? 'bg-white/5 ring-1 ring-white/10' : 'bg-violet-50'}`}>
        <p className={`text-[0.95rem] font-extrabold ${dark ? 'text-violet-200' : 'text-violet-800'}`}>개발 예정</p>
        <ul className="mt-1 space-y-0.5">
          {step.planned.map((x) => (
            <li key={x} className={`break-keep text-[1rem] font-bold ${dark ? 'text-white/85' : 'text-navy-800'}`}>· {x}</li>
          ))}
        </ul>
      </section>
    ) : null

  const say = (dark: boolean) => (
    <section data-presenter-say>
      <p className={`flex items-center gap-1.5 text-[1rem] font-extrabold ${dark ? 'text-navy-200' : 'text-navy-500'}`}>
        <Megaphone size={17} strokeWidth={2.4} aria-hidden="true" /> 설명
      </p>
      <p data-presenter-show className={`mt-1.5 break-keep font-semibold leading-relaxed ${dark ? 'text-[1.12rem] text-white' : 'text-[1.12rem] text-navy-900'}`}>
        {step.note}
      </p>
    </section>
  )

  const todo = (dark: boolean) => (
    <section data-presenter-todo className={`rounded-[16px] px-4 py-3.5 ${dark ? 'bg-teal-400 text-navy-950' : 'bg-teal-50 text-navy-900'}`}>
      <p className={`flex items-center gap-1.5 text-[1rem] font-black ${dark ? '' : 'text-teal-800'}`}>
        <MousePointerClick size={18} strokeWidth={2.6} aria-hidden="true" /> 누를 곳
      </p>
      <p className="mt-1 break-keep text-[1.1rem] font-extrabold leading-snug">{step.todo}</p>
      {extras}
    </section>
  )

  const nav = (dark: boolean) => (
    <div>
      <div className="flex gap-2">
        <button
          type="button"
          data-presenter-prev
          onClick={prev}
          disabled={pos === 0}
          className={`flex min-h-[3.5rem] flex-1 items-center justify-center gap-1.5 rounded-[14px] px-3 text-[1.08rem] font-extrabold transition disabled:opacity-35 ${
            dark ? 'bg-white/10 text-white hover:bg-white/15' : 'bg-navy-50 text-navy-800 hover:bg-navy-100'
          }`}
        >
          <ArrowLeft size={19} strokeWidth={2.6} /> 이전
        </button>
        {last ? (
          <button
            type="button"
            data-presenter-finish
            onClick={stop}
            className={`flex min-h-[3.5rem] flex-[1.8] items-center justify-center gap-1.5 rounded-[14px] px-3 text-[1.15rem] font-black transition ${
              dark ? 'bg-white text-navy-950 hover:bg-navy-50' : 'bg-navy-900 text-white hover:bg-navy-800'
            }`}
          >
            발표 안내 끝내기
          </button>
        ) : (
          <button
            type="button"
            data-presenter-next
            onClick={next}
            className={`flex min-h-[3.5rem] flex-[1.8] items-center justify-center gap-1.5 rounded-[14px] px-3 text-[1.15rem] font-black transition ${
              dark ? 'bg-white text-navy-950 hover:bg-navy-50' : 'bg-navy-900 text-white hover:bg-navy-800'
            }`}
          >
            {pos === 0 && order[0] === 'intro' ? '시연 시작' : '다음'} <ArrowRight size={20} strokeWidth={2.8} />
          </button>
        )}
      </div>
    </div>
  )

  const stopBtn = (dark: boolean) => (
    <button
      type="button"
      data-presenter-stop
      onClick={() => setAskStop(true)}
      aria-label="발표 안내 끝내기"
      title="발표 안내 끝내기"
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition ${dark ? 'text-navy-300 hover:bg-white/10 hover:text-white' : 'text-navy-500 hover:bg-navy-50'}`}
    >
      <X size={20} strokeWidth={2.6} />
    </button>
  )

  //  말풍선 — 왼쪽 메뉴(안내 카드가 그 위에 있음) 위로는 가지 않게, 화면 위쪽에 붙은 대상이면 아래에
  const panelW = typeof window !== 'undefined' && window.innerWidth >= 1280 ? 392 : 336
  const bubbleBelow = !!bubble && !bubble.side && bubble.top < 96
  const bubbleX = bubble ? Math.min(Math.max(bubble.x, panelW + 110), (typeof window !== 'undefined' ? window.innerWidth : 1440) - 110) : 0
  //  0143 — 말풍선은 늘 화면 안 (위 · 아래로 넘치면 화면 끝에 붙임 · 낮은 프로젝터 1280×720 · 1024×768)
  const BUBBLE_H = 48
  const vh = typeof window !== 'undefined' ? window.innerHeight : 900
  const bubbleTop = bubble
    ? Math.max(8, Math.min(vh - BUBBLE_H - 8, bubble.side ? bubble.mid - BUBBLE_H / 2 : bubbleBelow ? bubble.bottom + 12 : bubble.top - 12 - BUBBLE_H))
    : 0

  return (
    <>
      {/* ── 넓은 화면 — 왼쪽 메뉴 아래쪽 위에 뜨는 안내 카드 (0141 · 원래 AX 화면 그대로, 본문을 가리지 않음) ── */}
      <aside
        data-presenter-card
        data-presenter-panel
        data-presenter-side="left"
        aria-label="발표 진행 안내"
        className="fixed bottom-3 left-3 z-[80] hidden max-h-[calc(100dvh-8.5rem)] w-[312px] flex-col rounded-[20px] bg-navy-900 text-white shadow-2xl ring-2 ring-teal-400/40 lg:flex xl:w-[368px]"
      >
        <div className="shrink-0 px-5 pt-5">
          <div className="flex items-center gap-2">
            <p data-presenter-stepno className="min-w-0 flex-1 text-[1.05rem] font-extrabold tracking-wide text-teal-300">
              {label}
            </p>
            {stopBtn(true)}
          </div>
          {stopAsk(true)}
          {progress(true)}
          <h2 data-presenter-title className="mt-3 break-keep text-[1.4rem] font-black leading-tight tracking-tight text-white">
            {step.title}
          </h2>
          {aiChip && <div className="mt-2.5">{aiChip}</div>}
        </div>
        <div data-presenter-body className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-3 pt-4">
          {offroute}
          {say(true)}
          {todo(true)}
          {planned(true)}
        </div>
        <div className="shrink-0 border-t border-white/10 px-5 pb-5 pt-3.5">{nav(true)}</div>
      </aside>

      {/* ── 「여기를 누르세요」 말풍선 (넓은 화면) ── */}
      {bubble && here && (
        <div
          data-presenter-bubble={look || !bubble.press ? 'look' : 'press'}
          aria-hidden="true"
          className="pointer-events-none fixed z-[95] hidden lg:block"
          style={
            bubble.side
              ? { left: bubble.right + 14, top: bubbleTop }
              : { left: bubbleX, top: bubbleTop, transform: 'translate(-50%, 0)' }
          }
        >
          <div className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-teal-500 px-4 py-2 text-[1.05rem] font-black text-white shadow-xl ring-4 ring-white">
            {bubble.side ? <ArrowLeft size={18} strokeWidth={3} /> : bubbleBelow ? <ArrowUp size={18} strokeWidth={3} /> : <ArrowDown size={18} strokeWidth={3} />}
            {look || !bubble.press ? '여기를 보세요' : '여기를 누르세요'}
          </div>
        </div>
      )}

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
              <button type="button" data-presenter-next onClick={next} aria-label="다음" className="flex h-11 min-w-[2.75rem] shrink-0 items-center justify-center rounded-xl bg-teal-500 px-3 font-extrabold">
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
                aria-label="발표 진행 안내"
                initial={reduce ? false : { y: '100%' }}
                animate={{ y: 0 }}
                exit={reduce ? undefined : { y: '100%' }}
                transition={{ duration: 0.22 }}
                className="fixed inset-x-0 bottom-0 z-[81] max-h-[85dvh] overflow-y-auto rounded-t-[20px] bg-white px-5 pb-5 pt-3 shadow-2xl"
                style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
              >
                <button type="button" onClick={() => setSheet(false)} aria-label="안내 접기" className="mx-auto mb-2 block h-1.5 w-12 rounded-full bg-navy-200" />
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p data-presenter-stepno className="text-[1rem] font-extrabold tracking-wide text-teal-700">{label}</p>
                    <h2 data-presenter-title className="mt-0.5 break-keep text-[1.4rem] font-black leading-tight tracking-tight text-navy-900">{step.title}</h2>
                  </div>
                  {stopBtn(false)}
                </div>
                {stopAsk(false)}
                {progress(false)}
                {aiChip && <div className="mt-2.5">{aiChip}</div>}
                <div className="mt-4 space-y-3">
                  {offroute}
                  {say(false)}
                  {todo(false)}
                  {planned(false)}
                </div>
                <div className="pt-4">{nav(false)}</div>
              </motion.aside>
            </>
          )}
        </AnimatePresence>
      </div>
    </>
  )
}
