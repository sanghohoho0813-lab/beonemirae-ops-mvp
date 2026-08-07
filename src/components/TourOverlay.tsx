import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, Check, ChevronLeft, X } from 'lucide-react'
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
  /** 강조 대상의 높이 — 설명 박스가 커질 수 있는 한도를 여기서 먼저 정합니다 */
  const [anchorH, setAnchorH] = useState<number | null>(null)
  /** 본문이 넘쳐서 스크롤이 필요한 상태인지 (아래쪽 페이드 표시용) */
  const bodyRef = useRef<HTMLDivElement>(null)
  const [more, setMore] = useState(false)

  const step = active?.steps[index]

  // ── 1) 단계가 요구하는 화면으로 이동 ─────────────────────────────────────
  useEffect(() => {
    if (!step) return
    if (pathname !== step.route) navigate(step.route)
  }, [step, pathname, navigate])

  // 단계가 바뀌면 다시 계산합니다 (대상 높이 → 설명 박스 상한 → 설명 박스 크기 순서)
  useEffect(() => {
    setReady(false)
    setCard(null)
    setRect(null)
    setAnchorH(null)
  }, [index, active])

  // ── 2a) 대상 높이 측정 ───────────────────────────────────────────────────
  //  설명 박스를 자연 높이 그대로 두면, 대상이 큰 화면에서는 둘을 세로로 나란히
  //  놓을 수가 없어 결국 대상을 가리게 됩니다. 그래서 대상 높이를 먼저 재고,
  //  "대상 + 간격 + 설명"이 화면에 들어가는 높이로 설명 박스 상한을 정합니다.
  useEffect(() => {
    if (!active || !step || anchorH !== null) return
    if (pathname !== step.route) return
    let cancelled = false
    void (async () => {
      if (!step.anchor) {
        if (!cancelled) setAnchorH(0)
        return
      }
      let el: HTMLElement | null = null
      for (let i = 0; i < 40 && !el; i++) {
        el = document.querySelector<HTMLElement>(`[data-tour="${step.anchor}"]`)
        if (!el) await wait(50)
      }
      if (!cancelled) setAnchorH(el ? el.getBoundingClientRect().height : 0)
    })()
    return () => {
      cancelled = true
    }
  }, [active, step, pathname, anchorH])

  // ── 2b) 설명 박스 크기 측정 ──────────────────────────────────────────────
  useLayoutEffect(() => {
    const el = cardRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    if (!card || Math.abs(r.width - card.w) > 1 || Math.abs(r.height - card.h) > 1) {
      setCard({ w: r.width, h: r.height })
    }
    const b = bodyRef.current
    if (b) {
      const over = b.scrollHeight - b.clientHeight > 2 && b.scrollTop + b.clientHeight < b.scrollHeight - 2
      if (over !== more) setMore(over)
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

      // 대상이 화면 높이의 절반 가까이 되면, 위아래로 나눠 넣어봐야 설명이 눌립니다.
      // 옆에 세울 자리가 있으면 그쪽이 항상 더 읽기 좋습니다.
      const tallTarget = eh > vh * 0.45

      if (stackFits && !(tallTarget && sideFits)) {
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
    if (!active || !step || !card || anchorH === null) return
    if (pathname !== step.route) return
    void layout(step.anchor, card.h, card.w, true)
    // card 크기는 단계마다 한 번만 바뀌므로 재실행 루프가 생기지 않습니다.
  }, [active, step, pathname, card, anchorH, layout])

  // 사용자가 스크롤·리사이즈하면 강조 위치만 따라갑니다 (다시 스크롤하지 않음).
  useEffect(() => {
    if (!active || !step?.anchor || !card) return
    const follow = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.anchor}"]`)
      if (!el) return
      const r = el.getBoundingClientRect()
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
    }
    const onResize = () => setAnchorH(null) // 상한부터 다시 계산 → 이어서 배치가 다시 돕니다
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
      const roomAbove = sTop - GAP - EDGE
      // 아래가 되면 아래, 안 되면 위. 둘 다 모자라면 그나마 넓은 쪽에 둡니다.
      // (모자란 쪽에 억지로 넣으면 가장자리로 밀리면서 대상을 덮게 됩니다)
      if (roomBelow >= ch - 1 || roomBelow >= roomAbove) {
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

  /**
   * 마지막 단계 — 투어를 닫고 끝나지 않고, 역할에 맞는 실제 행동으로 넘깁니다.
   * emit 이 있으면 도착한 화면이 그 동작(예: 요청 작성)을 바로 시작합니다.
   */
  const finish = () => {
    const f = active.finish
    stop()
    navigate(f.to)
    if (f.emit) {
      const name = f.emit
      // 화면이 그려진 다음에 보내야 그 화면이 받을 수 있습니다.
      window.setTimeout(() => window.dispatchEvent(new CustomEvent(name)), 400)
    }
  }

  // 설명 박스 높이 상한 — "대상 전체 + 설명"이 세로로 함께 들어가는 높이.
  // 글자를 키운 만큼 박스가 커졌기 때문에, 대상이 큰 화면에서는 이 상한이
  // 있어야 설명이 대상을 덮지 않습니다. (넘치는 본문만 박스 안에서 스크롤됩니다)
  const MIN_CARD = 300
  const cardMaxH = (() => {
    const hard = vh * (vw < 640 ? 0.84 : 0.9)
    // 옆에 세우는 배치에서는 대상과 세로로 겹칠 일이 없으므로 줄이지 않습니다.
    if (placement === 'right' || placement === 'left') return hard
    // 2px 여유 — 딱 맞게 두면 반올림 한 픽셀 때문에 "아래에 못 넣는다"고 판단해
    // 설명이 대상 위로 올라가 겹칩니다.
    if (rect) {
      // 배치가 끝난 뒤에는 실제로 남은 위/아래 공간이 정답입니다.
      // 페이지 맨 아래처럼 더 스크롤할 수 없는 경우까지 여기서 반영됩니다.
      const roomBelow = vh - (rect.top + rect.height + PAD) - GAP - EDGE
      const roomAbove = rect.top - PAD - GAP - EDGE
      return Math.min(hard, Math.max(MIN_CARD, Math.max(roomBelow, roomAbove) - 2))
    }
    if (!anchorH) return hard
    const room = vh - (anchorH + PAD * 2) - GAP - EDGE * 2 - 2
    return Math.min(hard, Math.max(MIN_CARD, room))
  })()

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="사용 방법 안내">
      {/* 배경 dim + 강조 — 큰 box-shadow 로 대상만 밝게 남깁니다 */}
      {rect ? (
        <div
          data-tour-spot
          className="pointer-events-none absolute rounded-[1.25rem] transition-opacity duration-200"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            // 배경 dim + 대상 주변의 은은한 후광. 딱딱한 테두리 대신 부드럽게 떠 보이게 합니다.
            boxShadow:
              '0 0 0 9999px rgba(8, 15, 28, 0.72), 0 0 0 3px rgba(49, 130, 246, 0.55), 0 0 34px 6px rgba(49, 130, 246, 0.28)',
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
        className="absolute flex w-[min(30rem,calc(100vw-1rem))] flex-col rounded-3xl bg-white p-4 shadow-2xl sm:p-6"
        style={{ top: cardTop, left: cardLeft, maxHeight: cardMaxH, opacity: ready ? 1 : 0 }}
      >
        <div className="flex shrink-0 items-center gap-2">
          <span
            data-tour-step
            className="inline-flex shrink-0 items-center rounded-full bg-teal-500 px-3.5 py-1.5 text-[1.2rem] font-extrabold text-white"
          >
            {index + 1} / {active.steps.length}
          </span>
          <span className="min-w-0 truncate text-[1.14rem] font-bold text-navy-400">{active.label}</span>
          <button
            onClick={stop}
            title="종료"
            className="-mr-1 ml-auto shrink-0 rounded-xl p-2 text-navy-400 transition hover:bg-navy-50 hover:text-navy-700"
          >
            <X size={22} strokeWidth={2.4} />
          </button>
        </div>

        {/* 이 단계에서 무엇을 하는 곳인지 — 실제 화면의 섹션·버튼 이름과 같습니다 */}
        <p className="mt-2 shrink-0 truncate text-[1.18rem] font-extrabold text-teal-600 sm:text-[1.26rem]">
          {step.title}
        </p>

        {/* 지금 하면 되는 일 → 그러면 무엇이 바뀌는가. 문장은 둘뿐입니다.
            (좁은 화면에서는 이 영역만 스크롤됩니다) */}
        <div
          ref={bodyRef}
          onScroll={(e) => {
            const b = e.currentTarget
            setMore(b.scrollTop + b.clientHeight < b.scrollHeight - 2)
          }}
          className="relative mt-0.5 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-0.5"
        >
          <h2 className="break-keep text-[1.72rem] font-extrabold leading-tight tracking-tight text-navy-900 sm:text-[2.1rem]">
            {step.action}
          </h2>
          <p className="mt-2.5 flex items-start gap-2 break-keep text-[1.28rem] leading-snug text-navy-500 sm:text-[1.42rem]">
            <ArrowRight size={20} strokeWidth={2.6} className="mt-1 shrink-0 text-teal-500" />
            <span className="min-w-0">{step.result}</span>
          </p>
          {step.why && (
            <p className="mt-2.5 break-keep border-l-2 border-navy-100 pl-3 text-[1.05rem] leading-snug text-navy-400 sm:text-[1.12rem]">
              {step.why}
            </p>
          )}
        </div>

        {/* 좁은 화면에서 본문이 잘릴 때만 "더 있다"는 신호를 둡니다 */}
        {more && (
          <div className="pointer-events-none relative z-10 -mt-7 h-7 shrink-0 bg-gradient-to-t from-white to-transparent" />
        )}

        <div className="mt-3 flex shrink-0 gap-1.5">
          {active.steps.map((_, i) => (
            <span key={i} className={`h-2 flex-1 rounded-full ${i <= index ? 'bg-teal-500' : 'bg-navy-100'}`} />
          ))}
        </div>

        {/* 마지막 단계의 CTA 는 문장이 길어지므로, 좁은 화면에서는 한 줄을 통째로 씁니다 */}
        <div className="mt-2 flex shrink-0 flex-wrap items-center gap-2">
          <button
            onClick={stop}
            className="shrink-0 rounded-xl px-2 py-2.5 text-[1.2rem] font-bold text-navy-400 transition hover:text-navy-700"
          >
            건너뛰기
          </button>
          <div className={`ml-auto flex gap-2 ${last ? 'w-full sm:w-auto' : 'shrink-0'}`}>
            {index > 0 && (
              <button
                onClick={prev}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-2xl bg-navy-50 px-4 py-3 text-[1.26rem] font-extrabold text-navy-600 transition hover:bg-navy-100"
              >
                <ChevronLeft size={19} strokeWidth={2.5} /> 이전
              </button>
            )}
            <button
              onClick={last ? finish : next}
              className={`inline-flex items-center justify-center gap-1.5 rounded-2xl bg-teal-500 px-5 py-3 text-[1.26rem] font-extrabold text-white shadow-sm transition hover:bg-teal-600 ${
                last ? 'min-w-0 flex-1 sm:flex-none' : ''
              }`}
            >
              {last ? (
                <>
                  <Check size={19} strokeWidth={2.6} className="hidden shrink-0 sm:block" />
                  <span className="truncate">{active.finish.label}</span>
                </>
              ) : (
                <>
                  다음 <ArrowRight size={19} strokeWidth={2.5} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
