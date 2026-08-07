import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, Check, ChevronLeft, HelpCircle, Lightbulb, Target, X } from 'lucide-react'
import { useTour } from '../context/TourContext'

// ─────────────────────────────────────────────────────────────────────────────
// 제품 투어 오버레이
//
//  까다로운 요구가 두 가지라, 배치를 "먼저 계산하고 그 자리로 스크롤하는" 방식으로
//  풀었습니다. 스크롤한 뒤에 남는 자리에 설명을 끼워 넣으면 반드시 겹칩니다.
//
//  1) 강조 대상의 '전체'가 화면 안에 보여야 한다
//  2) 설명 박스가 대상을 가리면 안 된다
//
//  → 대상 높이(eh)와 설명 박스 높이(ch)를 먼저 잰 뒤,
//     eh + 간격 + ch 가 화면에 들어가면 둘을 한 덩어리로 세로 가운데 정렬하고,
//     대상이 정확히 그 위치에 오도록 페이지를 스크롤합니다.
//     세로로 안 들어가면(대상이 큰 경우) 넓은 화면에서는 옆에 세우고,
//     그것도 안 되면 대상을 위쪽에 붙인 뒤 남는 아래 공간에 설명을 둡니다.
//
//  위치는 전부 getBoundingClientRect 로 계산합니다. 픽셀 하드코딩은 없습니다.
// ─────────────────────────────────────────────────────────────────────────────

interface Rect {
  top: number
  left: number
  width: number
  height: number
}

/** 강조 테두리 여백 */
const PAD = 8
/** 설명 박스와 대상 사이 간격 */
const GAP = 14
/** 화면 가장자리 최소 여백 */
const EDGE = 12

type Placement = 'below' | 'above' | 'right' | 'left' | 'center'

const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()))
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export function TourOverlay() {
  const { active, index, next, prev, stop } = useTour()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const cardRef = useRef<HTMLDivElement>(null)

  const [rect, setRect] = useState<Rect | null>(null)
  const [placement, setPlacement] = useState<Placement>('center')
  const [ready, setReady] = useState(false)
  /** 설명 박스 실제 크기 — 배치 계산의 입력값이라 먼저 재야 합니다 */
  const [card, setCard] = useState<{ w: number; h: number } | null>(null)

  const step = active?.steps[index]

  // ── 1) 단계가 요구하는 화면으로 이동 ─────────────────────────────────────
  useEffect(() => {
    if (!step) return
    if (pathname !== step.route) navigate(step.route)
  }, [step, pathname, navigate])

  // 단계가 바뀌면 다시 계산합니다 (설명 박스 크기부터)
  useEffect(() => {
    setReady(false)
    setCard(null)
    setRect(null)
  }, [index, active])

  // ── 2) 설명 박스 크기 측정 ───────────────────────────────────────────────
  useLayoutEffect(() => {
    const el = cardRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    if (!card || Math.abs(r.width - card.w) > 1 || Math.abs(r.height - card.h) > 1) {
      setCard({ w: r.width, h: r.height })
    }
  })

  // ── 3) 배치 계산 + 스크롤 ────────────────────────────────────────────────
  const layout = useCallback(
    async (anchor: string | undefined, ch: number, cw: number, doScroll: boolean) => {
      const vw = window.innerWidth
      const vh = window.innerHeight

      if (!anchor) {
        setRect(null)
        setPlacement('center')
        setReady(true)
        return
      }

      // 라우트 전환 직후에는 대상이 아직 없을 수 있습니다.
      let el: HTMLElement | null = null
      for (let i = 0; i < 40 && !el; i++) {
        el = document.querySelector<HTMLElement>(`[data-tour="${anchor}"]`)
        if (!el) await wait(50)
      }
      if (!el) {
        setRect(null)
        setPlacement('center')
        setReady(true)
        return
      }

      const r0 = el.getBoundingClientRect()
      const eh = r0.height + PAD * 2

      // 세로로 대상 + 설명을 함께 담을 수 있는가?
      const stackFits = eh + GAP + ch + EDGE * 2 <= vh
      // 옆에 세울 수 있는가? — 가로 스크롤은 하지 않으므로 '지금 이 위치 기준'으로
      // 실제 남는 좌/우 공간을 재야 합니다. (요소 폭만 보면 사이드바 때문에 틀립니다)
      const roomRight0 = vw - (r0.right + PAD) - GAP - EDGE
      const roomLeft0 = r0.left - PAD - GAP - EDGE
      const sideFits = vw >= 640 && Math.max(roomRight0, roomLeft0) >= cw && eh + EDGE * 2 <= vh

      let want: Placement
      let wantTop: number // 대상(강조 영역)의 목표 viewport top

      if (stackFits) {
        want = 'below'
        const groupH = eh + GAP + ch
        wantTop = Math.max(EDGE, (vh - groupH) / 2)
      } else if (sideFits) {
        want = 'right'
        wantTop = Math.max(EDGE, (vh - eh) / 2)
      } else {
        // 대상이 화면보다 큰 예외 상황 — 위에 붙이고 남는 아래 공간에 설명을 둡니다.
        want = 'below'
        wantTop = EDGE
      }

      /** 강조 영역(대상 + 여백)의 top 이 화면에서 targetTop 이 되도록 스크롤 */
      const scrollTo = async (targetTop: number) => {
        const cur = el!.getBoundingClientRect().top - PAD
        const delta = cur - targetTop
        if (Math.abs(delta) > 1) window.scrollBy({ top: delta, behavior: 'auto' })
        await raf()
        await raf()
        await wait(40)
      }

      /** 지금 위치가 "대상 전체가 보이고 + 설명이 들어갈 자리가 있는" 상태인가 */
      const ok = () => {
        const b = el!.getBoundingClientRect()
        const sT = b.top - PAD
        const sB = b.bottom + PAD
        const visible = sT >= -1 && sB <= vh + 1
        const room = vh - sB - GAP - EDGE >= ch || sT - GAP - EDGE >= ch
        return visible && room
      }

      if (doScroll && want === 'below') {
        // 페이지 맨 위/아래라 원하는 만큼 스크롤하지 못할 수 있으므로,
        // 가능한 배치 후보를 순서대로 시도하고 처음으로 조건을 만족하는 곳에 멈춥니다.
        const candidates = [
          wantTop, // ① 대상+설명을 한 덩어리로 세로 가운데
          vh - ch - GAP - EDGE - eh, // ② 아래에 설명 자리를 확보
          ch + GAP + EDGE, // ③ 위에 설명 자리를 확보
          vh - EDGE - eh, // ④ 화면 아래 끝에 붙임
          EDGE, // ⑤ 화면 위 끝에 붙임
        ]
        for (const c of candidates) {
          await scrollTo(Math.max(EDGE, c))
          if (ok()) break
        }
        if (!ok() && sideFits) want = 'right'
      } else if (doScroll) {
        await scrollTo(wantTop)
      }

      const r = el.getBoundingClientRect()
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
      setPlacement(want)
      setReady(true)
    },
    [],
  )

  useEffect(() => {
    if (!active || !step || !card) return
    if (pathname !== step.route) return
    void layout(step.anchor, card.h, card.w, true)
    // card 크기는 단계마다 한 번만 바뀌므로 재실행 루프가 생기지 않습니다.
  }, [active, step, pathname, card, layout])

  // 사용자가 스크롤·리사이즈하면 강조 위치만 따라갑니다 (다시 스크롤하지 않음).
  useEffect(() => {
    if (!active || !step?.anchor || !card) return
    const follow = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.anchor}"]`)
      if (!el) return
      const r = el.getBoundingClientRect()
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
    }
    const onResize = () => void layout(step.anchor, card.h, card.w, true)
    window.addEventListener('scroll', follow, true)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('scroll', follow, true)
      window.removeEventListener('resize', onResize)
    }
  }, [active, step, card, layout])

  // 키보드 조작
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') stop()
      else if (e.key === 'ArrowRight') next()
      else if (e.key === 'ArrowLeft') prev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, next, prev, stop])

  if (!active || !step) return null

  const vw = window.innerWidth
  const vh = window.innerHeight
  const cw = card?.w ?? 360
  const ch = card?.h ?? 300

  // ── 4) 계산된 배치대로 설명 박스 좌표 확정 ───────────────────────────────
  let cardTop = Math.max(EDGE, (vh - ch) / 2)
  let cardLeft = Math.max(EDGE, (vw - cw) / 2)

  if (rect) {
    const sTop = rect.top - PAD
    const sBottom = rect.top + rect.height + PAD
    const sLeft = rect.left - PAD
    const sRight = rect.left + rect.width + PAD

    if (placement === 'right' || placement === 'left') {
      const roomRight = vw - sRight - GAP - EDGE
      cardLeft = roomRight >= cw ? sRight + GAP : sLeft - GAP - cw
      cardTop = rect.top + rect.height / 2 - ch / 2
    } else {
      const roomBelow = vh - sBottom - GAP - EDGE
      if (roomBelow >= ch) {
        cardTop = sBottom + GAP
      } else {
        cardTop = sTop - GAP - ch // 위쪽
      }
      cardLeft = rect.left + rect.width / 2 - cw / 2
    }
    cardTop = Math.min(Math.max(EDGE, cardTop), Math.max(EDGE, vh - ch - EDGE))
    cardLeft = Math.min(Math.max(EDGE, cardLeft), Math.max(EDGE, vw - cw - EDGE))
  }

  const last = index === active.steps.length - 1

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="사용 방법 안내">
      {/* 배경 dim + 강조 — 큰 box-shadow 로 대상만 밝게 남깁니다 */}
      {rect ? (
        <div
          data-tour-spot
          className="pointer-events-none absolute rounded-2xl ring-2 ring-teal-400"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: '0 0 0 9999px rgba(8, 15, 28, 0.66)',
            opacity: ready ? 1 : 0,
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-navy-950/70" />
      )}

      {/* 투어 중 실수로 화면이 조작되지 않게 막습니다 (설명 박스는 이 위에 있습니다) */}
      <div className="absolute inset-0" />

      {/* 설명 박스 */}
      <div
        ref={cardRef}
        data-tour-card
        // 모바일에서는 설명이 길어져도 화면 절반을 넘지 않게 합니다.
        // 헤더와 버튼은 고정하고 본문만 스크롤되게 해, 좁은 화면에서도 '다음'이 항상 보입니다.
        className="absolute flex max-h-[46vh] w-[min(23rem,calc(100vw-1.5rem))] flex-col rounded-3xl bg-white p-4 shadow-2xl sm:max-h-[82vh] sm:p-5"
        style={{ top: cardTop, left: cardLeft, opacity: ready ? 1 : 0 }}
      >
        <div className="flex shrink-0 items-center gap-2">
          <span className="pill bg-teal-50 text-teal-700">
            {index + 1} / {active.steps.length}
          </span>
          <span className="t-muted min-w-0 truncate font-bold text-navy-400">{active.label}</span>
          <button
            onClick={stop}
            title="종료"
            className="-mr-1 ml-auto shrink-0 rounded-lg p-1.5 text-navy-400 transition hover:bg-navy-50 hover:text-navy-700"
          >
            <X size={18} strokeWidth={2.4} />
          </button>
        </div>

        <h2 className="mt-2.5 shrink-0 break-keep text-[1.22rem] font-extrabold leading-snug text-navy-900">
          {step.title}
        </h2>

        {/* 왜 → 어떻게 → 결과. 기능 설명이 아니라 이해의 순서입니다.
            (좁은 화면에서는 이 영역만 스크롤됩니다) */}
        <div className="mt-2.5 min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain pr-0.5">
          {[
            { icon: HelpCircle, label: '왜', text: step.why, tone: 'bg-rose-50 text-rose-600' },
            { icon: Target, label: '어떻게', text: step.how, tone: 'bg-sky-50 text-sky-600' },
            { icon: Lightbulb, label: '결과', text: step.result, tone: 'bg-emerald-50 text-emerald-600' },
          ].map((x) => {
            const Icon = x.icon
            return (
              <div key={x.label} className="flex items-start gap-2">
                <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${x.tone}`}>
                  <Icon size={13} strokeWidth={2.6} />
                </span>
                <p className="min-w-0 flex-1 break-keep text-[0.95rem] leading-snug text-navy-600">
                  <span className="font-extrabold text-navy-800">{x.label}</span>
                  <span className="mx-1 text-navy-300">·</span>
                  {x.text}
                </p>
              </div>
            )
          })}
        </div>

        <div className="mt-3 flex shrink-0 gap-1">
          {active.steps.map((_, i) => (
            <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= index ? 'bg-teal-500' : 'bg-navy-100'}`} />
          ))}
        </div>

        <div className="mt-3 flex shrink-0 items-center gap-2">
          <button
            onClick={stop}
            className="shrink-0 px-1.5 py-2 text-[1rem] font-bold text-navy-400 transition hover:text-navy-700"
          >
            건너뛰기
          </button>
          <div className="ml-auto flex shrink-0 gap-2">
            {index > 0 && (
              <button
                onClick={prev}
                className="inline-flex items-center gap-1 rounded-xl bg-navy-50 px-3.5 py-2.5 text-[1rem] font-bold text-navy-600 transition hover:bg-navy-100"
              >
                <ChevronLeft size={16} strokeWidth={2.5} /> 이전
              </button>
            )}
            <button
              onClick={next}
              className="inline-flex items-center gap-1 rounded-xl bg-teal-500 px-4 py-2.5 text-[1rem] font-bold text-white transition hover:bg-teal-600"
            >
              {last ? (
                <>
                  <Check size={16} strokeWidth={2.6} /> 시작하기
                </>
              ) : (
                <>
                  다음 <ArrowRight size={16} strokeWidth={2.5} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
