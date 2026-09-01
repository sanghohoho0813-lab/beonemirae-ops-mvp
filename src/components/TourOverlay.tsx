import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { keepPortalClient } from '../lib/portalClient'
import { ArrowRight, Check, ChevronLeft, Link2, X } from 'lucide-react'
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
/**
 * 폰에는 하단 탭바가 떠 있습니다. 설명 박스도, 강조 대상도 그 아래로 들어가면
 * 가려지므로 아래쪽 여백만 따로 크게 잡습니다.
 */
const NAV_H = 78
const bottomInset = (vw: number) => (vw <= 1023 ? NAV_H : EDGE)

type Placement = 'below' | 'above' | 'right' | 'left' | 'center'

const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()))
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export function TourOverlay() {
  const { active, steps, index, next, prev, stop } = useTour()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const cardRef = useRef<HTMLDivElement>(null)

  const [rect, setRect] = useState<Rect | null>(null)
  const [placement, setPlacement] = useState<Placement>('center')
  const [ready, setReady] = useState(false)
  /**
   * 설명 박스 크기 — 배치 계산의 입력값이라 먼저 재야 합니다.
   *
   * h 는 지금 그려진 높이, natural 은 상한이 없었다면 됐을 높이입니다.
   * 배치는 natural 로 판단해야 합니다. 잘린 높이로 판단하면 "아래에 들어간다"고
   * 착각하고 그 자리에 밀어 넣은 뒤, 정작 본문은 상자 안에서 잘립니다.
   * (거래처 목록처럼 화면보다 짧아 더 스크롤할 수 없는 페이지에서 그랬습니다.
   *  옆에 500px 가 비어 있는데도 아래에 끼워 넣고 본문 227px 를 감췄습니다)
   */
  const [card, setCard] = useState<{ w: number; h: number; natural: number } | null>(null)
  /** 강조 대상의 높이 — 설명 박스가 커질 수 있는 한도를 여기서 먼저 정합니다 */
  const [anchorH, setAnchorH] = useState<number | null>(null)
  /** 본문이 넘쳐서 스크롤이 필요한 상태인지 (아래쪽 페이드 표시용) */
  const bodyRef = useRef<HTMLDivElement>(null)
  const [more, setMore] = useState(false)
  /**
   * 배치 계산은 스크롤·재측정을 기다리느라 수백 ms 걸립니다. 그 사이에 사용자가
   * 「다음」을 누르면 이전 단계의 계산이 아직 돌고 있고, 그 계산이 붙잡고 있던
   * 대상은 화면이 바뀌면서 이미 사라진 상태입니다. 사라진 요소를 재면 전부 0이
   * 나오고, 그 0 이 새 단계가 맞게 잡아 둔 위치를 나중에 덮어씁니다.
   * (강조 테두리가 화면 왼쪽 위에 한 줄로 굳는 증상이 이것이었습니다)
   * 그래서 계산마다 번호를 붙이고, 최신 번호가 아니면 결과를 버립니다.
   */
  const runRef = useRef(0)
  /**
   * 이 단계의 배치를 이미 잡았는지.
   *
   * 배치는 페이지를 스크롤합니다 → 스크롤을 따라가는 핸들러가 강조 위치를 고칩니다
   * → 그 위치로 설명 박스 상한이 다시 계산됩니다 → 박스 크기가 바뀝니다
   * → 크기가 바뀌었으니 배치를 다시 잡습니다 → ... 이렇게 서로를 물고 돌았습니다.
   *
   * 매번 새 계산이 직전 계산을 무효로 만드는 바람에 어떤 계산도 끝나지 못했고,
   * 그 단계의 배치는 이전 단계 값이 그대로 남았습니다. 거래처 목록 단계에서
   * 설명이 엉뚱한 자리에 서고 본문이 잘려 보이던 원인입니다.
   *
   * 스크롤을 동반한 배치는 한 단계에 한 번이면 충분합니다.
   */
  const laidOutRef = useRef('')

  const step = steps[index]

  // ── 1) 단계가 요구하는 화면으로 이동 ─────────────────────────────────────
  //
  //  active 를 반드시 함께 봅니다. 아래 return null 은 '그리지 않는다'일 뿐,
  //  훅은 규칙상 그보다 위에 있어야 해서 투어가 꺼져 있어도 계속 돕니다.
  //  step 만 보고 판단하면, 투어를 한 번 열었던 사용자는 그 뒤로 메뉴를 누를
  //  때마다 이 effect 가 1단계 화면(대시보드)으로 도로 끌고 갔습니다.
  //  ⚠ 0088 — 투어 단계에는 `/portal/support` 처럼 **완성된 주소**가 적혀
  //    있습니다. 직원이 미리보기로 보는 중이면 그대로 옮겨 가는 순간 병원이
  //    지워지고 「어느 병원을 보시겠습니까」로 튕깁니다.
  //    보고 있던 병원에 맞춰 고쳐서 갑니다.
  const wantRoute = step ? keepPortalClient(step.route, pathname) : ''
  useEffect(() => {
    if (!active || !step) return
    if (pathname !== wantRoute) navigate(wantRoute)
  }, [active, step, pathname, wantRoute, navigate])

  // 단계가 바뀌면 다시 계산합니다 (대상 높이 → 설명 박스 상한 → 설명 박스 크기 순서)
  useEffect(() => {
    runRef.current += 1 // 이전 단계의 배치 계산을 무효로 만듭니다
    laidOutRef.current = ''
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
    if (pathname !== wantRoute) return
    let cancelled = false
    void (async () => {
      if (!step.anchor) {
        if (!cancelled) setAnchorH(0)
        return
      }
      // 존재만 확인하고 재면 아직 그려지기 전이라 0 이 나옵니다.
      // 그 0 이 설명 박스 상한과 배치 계산에 그대로 흘러들어갑니다.
      let h = 0
      for (let i = 0; i < 40 && h <= 0; i++) {
        const el = document.querySelector<HTMLElement>(`[data-tour="${step.anchor}"]`)
        h = el ? el.getBoundingClientRect().height : 0
        if (h <= 0) await wait(50)
      }
      if (!cancelled) setAnchorH(h)
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
    const b = bodyRef.current
    // 상한 때문에 감춰진 높이를 되돌려 "원래 필요했던 높이"를 구합니다.
    const hiddenH = b ? Math.max(0, b.scrollHeight - b.clientHeight) : 0
    const natural = r.height + hiddenH
    if (
      !card ||
      Math.abs(r.width - card.w) > 1 ||
      Math.abs(r.height - card.h) > 1 ||
      Math.abs(natural - card.natural) > 1
    ) {
      setCard({ w: r.width, h: r.height, natural })
    }
    if (b) {
      const over = hiddenH > 2 && b.scrollTop + b.clientHeight < b.scrollHeight - 2
      if (over !== more) setMore(over)
    }
  })

  // ── 3) 배치 계산 + 스크롤 ────────────────────────────────────────────────
  const layout = useCallback(
    async (anchor: string | undefined, ch: number, cw: number, doScroll: boolean, run: number) => {
      const vw = window.innerWidth
      const vh = window.innerHeight
      /** 계산 도중 단계가 넘어갔는가 — 그러면 이 계산의 결과는 버립니다 */
      const stale = () => runRef.current !== run

      if (!anchor) {
        setRect(null)
        setPlacement('center')
        setReady(true)
        return
      }

      // 라우트 전환 직후에는 대상이 아직 없거나, 있어도 아직 그려지지 않았습니다.
      // 높이가 0인 상태로 재면 강조 테두리가 한 줄로 찌그러지므로
      // "존재하고 + 크기가 잡힐 때까지" 기다립니다.
      let el: HTMLElement | null = null
      for (let i = 0; i < 40; i++) {
        if (stale()) return
        const found = document.querySelector<HTMLElement>(`[data-tour="${anchor}"]`)
        if (found && found.getBoundingClientRect().height > 0) {
          el = found
          break
        }
        await wait(50)
      }
      if (stale()) return
      if (!el) {
        setRect(null)
        setPlacement('center')
        setReady(true)
        return
      }

      const r0 = el.getBoundingClientRect()
      const eh = r0.height + PAD * 2
      const BOT = bottomInset(vw)

      // 세로로 대상 + 설명을 함께 담을 수 있는가?
      const stackFits = eh + GAP + ch + EDGE + BOT <= vh
      // 옆에 세울 수 있는가? — 가로 스크롤은 하지 않으므로 '지금 이 위치 기준'으로
      // 실제 남는 좌/우 공간을 재야 합니다. (요소 폭만 보면 사이드바 때문에 틀립니다)
      const roomRight0 = vw - (r0.right + PAD) - GAP - EDGE
      const roomLeft0 = r0.left - PAD - GAP - EDGE
      const sideFits = vw >= 640 && Math.max(roomRight0, roomLeft0) >= cw && eh + EDGE + BOT <= vh

      let want: Placement
      let wantTop: number // 대상(강조 영역)의 목표 viewport top

      // 대상이 화면 높이의 절반 가까이 되면, 위아래로 나눠 넣어봐야 설명이 눌립니다.
      // 옆에 세울 자리가 있으면 그쪽이 항상 더 읽기 좋습니다.
      const tallTarget = eh > vh * 0.45

      if (stackFits && !(tallTarget && sideFits)) {
        want = 'below'
        const groupH = eh + GAP + ch
        wantTop = Math.max(EDGE, (vh - BOT - groupH) / 2)
      } else if (sideFits) {
        want = 'right'
        wantTop = Math.max(EDGE, (vh - BOT - eh) / 2)
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
        const visible = sT >= -1 && sB <= vh - BOT + 1
        const room = vh - sB - GAP - BOT >= ch || sT - GAP - EDGE >= ch
        return visible && room
      }

      if (doScroll && want === 'below') {
        // 페이지 맨 위/아래라 원하는 만큼 스크롤하지 못할 수 있으므로,
        // 가능한 배치 후보를 순서대로 시도하고 처음으로 조건을 만족하는 곳에 멈춥니다.
        const candidates = [
          wantTop, // ① 대상+설명을 한 덩어리로 세로 가운데
          vh - ch - GAP - BOT - eh, // ② 아래에 설명 자리를 확보
          ch + GAP + EDGE, // ③ 위에 설명 자리를 확보
          vh - BOT - eh, // ④ 화면 아래 끝(탭바 위)에 붙임
          EDGE, // ⑤ 화면 위 끝에 붙임
        ]
        for (const c of candidates) {
          await scrollTo(Math.max(EDGE, c))
          if (stale()) return
          if (ok()) break
        }
        if (!ok() && sideFits) want = 'right'
      } else if (doScroll) {
        // 아래 배치와 마찬가지로 화면 위 끝을 넘지 않게 막습니다.
        // 넘기면 강조 테두리 윗변이 화면 밖으로 잘립니다.
        await scrollTo(Math.max(EDGE, wantTop))
      }

      // 스크롤·대기 사이에 화면이 다시 그려지면서 노드가 교체되거나 잠깐 크기가
      // 0 이 되는 순간이 있습니다. 그때 재면 강조 테두리가 화면 왼쪽 위에 한 줄로
      // 찌그러진 채 굳습니다 — 스크롤이 없으면 다시 잴 기회도 없습니다.
      // 그래서 크기가 잡힐 때까지 잠깐 더 기다렸다가 잽니다.
      let r = el.getBoundingClientRect()
      for (let i = 0; i < 12 && r.height <= 0; i++) {
        await wait(50)
        if (stale()) return
        const again = document.querySelector<HTMLElement>(`[data-tour="${anchor}"]`)
        if (again) r = again.getBoundingClientRect()
      }
      // 끝까지 크기가 잡히지 않으면 0 을 쓰지 않고 강조 없이 둡니다.
      // 0 을 쓰면 화면 왼쪽 위에 얇은 띠가 남습니다.
      if (r.height <= 0 || r.width <= 0) {
        setRect(null)
        setPlacement('center')
        setReady(true)
        return
      }
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
      setPlacement(want)
      setReady(true)
    },
    [],
  )

  useEffect(() => {
    if (!active || !step || !card || anchorH === null) return
    if (pathname !== wantRoute) return
    // 첫 측정값(상한이 넉넉할 때 잰 자연 높이)으로 한 번만 잡습니다.
    const sig = `${active.id}:${index}:${window.innerWidth}x${window.innerHeight}`
    if (laidOutRef.current === sig) return
    laidOutRef.current = sig
    const run = (runRef.current += 1)
    void layout(step.anchor, card.natural, card.w, true, run)
  }, [active, index, step, pathname, card, anchorH, layout])

  // 사용자가 스크롤·리사이즈하면 강조 위치만 따라갑니다 (다시 스크롤하지 않음).
  useEffect(() => {
    if (!active || !step?.anchor || !card) return
    const follow = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.anchor}"]`)
      if (!el) return
      const r = el.getBoundingClientRect()
      // 다시 그려지는 도중에는 크기가 잠깐 0 이 됩니다.
      // 그 값으로 덮어쓰면 강조 테두리가 왼쪽 위에 한 줄로 굳어 버리므로 무시합니다.
      if (r.height <= 0 || r.width <= 0) return
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
    }
    const onResize = () => {
      // 화면 크기가 바뀌면 처음부터 다시 — 이때는 다시 잡는 것이 맞습니다
      laidOutRef.current = ''
      setAnchorH(null)
    }
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
  const BOT = bottomInset(vw)
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
      const roomBelow = vh - sBottom - GAP - BOT
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
    cardTop = Math.min(Math.max(EDGE, cardTop), Math.max(EDGE, vh - ch - BOT))
    cardLeft = Math.min(Math.max(EDGE, cardLeft), Math.max(EDGE, vw - cw - EDGE))
  }

  const last = index === steps.length - 1

  /**
   * 마지막 단계 — 투어를 닫고 끝나지 않고, 역할에 맞는 실제 행동으로 넘깁니다.
   * emit 이 있으면 도착한 화면이 그 동작(예: 요청 작성)을 바로 시작합니다.
   */
  const finish = () => {
    const f = active.finish
    stop()
    //  ⚠ 0088 — 마무리 이동도 보고 있던 병원을 달고 갑니다.
    navigate(keepPortalClient(f.to, pathname))
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
  /**
   * 남는 자리가 이보다도 좁으면 상자를 더 줄입니다.
   *
   * 폰에서 「다음 방문」처럼 화면을 거의 채우는 카드를 짚을 때, 아래에 남는 자리가
   * 243px 뿐인데 상자를 300px 로 우기면 그 차이만큼 대상을 덮습니다.
   * 상자가 조금 작아지는 것보다 설명이 대상을 가리는 쪽이 훨씬 나쁩니다 —
   * 넘치는 본문은 상자 안에서 스크롤되지만, 가려진 대상은 볼 방법이 없습니다.
   */
  const FLOOR_CARD = 170
  const cardMaxH = (() => {
    const hard = vh * (vw < 640 ? 0.84 : 0.9)
    // 옆에 세우는 배치에서는 대상과 세로로 겹칠 일이 없으므로 줄이지 않습니다.
    if (placement === 'right' || placement === 'left') return hard
    // 2px 여유 — 딱 맞게 두면 반올림 한 픽셀 때문에 "아래에 못 넣는다"고 판단해
    // 설명이 대상 위로 올라가 겹칩니다.
    if (rect) {
      // 배치가 끝난 뒤에는 실제로 남은 위/아래 공간이 정답입니다.
      // 페이지 맨 아래처럼 더 스크롤할 수 없는 경우까지 여기서 반영됩니다.
      const roomBelow = vh - (rect.top + rect.height + PAD) - GAP - BOT
      const roomAbove = rect.top - PAD - GAP - EDGE
      const room = Math.max(roomBelow, roomAbove) - 2
      return Math.min(hard, Math.max(room >= MIN_CARD ? MIN_CARD : FLOOR_CARD, room))
    }
    if (!anchorH) return hard
    const room = vh - (anchorH + PAD * 2) - GAP - EDGE - BOT - 2
    return Math.min(hard, Math.max(room >= MIN_CARD ? MIN_CARD : FLOOR_CARD, room))
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
            {index + 1} / {steps.length}
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
        <p
          data-tour-title
          className="mt-2 shrink-0 truncate text-[1.18rem] font-extrabold text-teal-600 sm:text-[1.26rem]"
        >
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
          {/* 어떻게 사용하는가 */}
          <h2
            data-tour-action
            // 폰은 카드 폭이 370px 뿐이라 같은 rem 이라도 줄 수가 훨씬 많아집니다.
            // PC 크기 그대로 두면 본문이 상자를 넘겨 스크롤해야 읽힙니다.
            className="break-keep text-[1.5rem] font-extrabold leading-tight tracking-tight text-navy-900 sm:text-[2.1rem]"
          >
            {step.action}
          </h2>
          {/* 무엇과 연결되는가 — 이 화면에서 한 일이 어디로 가는지.
              "한 번 입력하면 나머지가 따라온다"는 이 제품의 전부라,
              단계마다 그 자리를 눈에 보이게 따로 뒀습니다. */}
          {step.linked && (
            <p
              data-tour-linked
              className="mt-2 flex items-start gap-2 break-keep rounded-xl bg-teal-50 px-2.5 py-1.5 text-[1.04rem] leading-snug text-teal-800 sm:mt-2.5 sm:px-3 sm:py-2 sm:text-[1.2rem]"
            >
              <Link2 size={18} strokeWidth={2.5} className="mt-0.5 shrink-0 text-teal-600" />
              <span className="min-w-0">{step.linked}</span>
            </p>
          )}
          {/* 그래서 무엇이 좋아지는가 */}
          <p
            data-tour-result
            className="mt-2 flex items-start gap-2 break-keep text-[1.16rem] leading-snug text-navy-500 sm:mt-2.5 sm:text-[1.42rem]"
          >
            <ArrowRight size={20} strokeWidth={2.6} className="mt-1 shrink-0 text-teal-500" />
            <span className="min-w-0">{step.result}</span>
          </p>
          {step.why && (
            <p
              data-tour-why
              className="mt-2 break-keep border-l-2 border-navy-100 pl-2.5 text-[0.98rem] leading-snug text-navy-400 sm:mt-2.5 sm:pl-3 sm:text-[1.12rem]"
            >
              {step.why}
            </p>
          )}
        </div>

        {/* 좁은 화면에서 본문이 잘릴 때만 "더 있다"는 신호를 둡니다 */}
        {more && (
          <div className="pointer-events-none relative z-10 -mt-7 h-7 shrink-0 bg-gradient-to-t from-white to-transparent" />
        )}

        <div className="mt-3 flex shrink-0 gap-1.5">
          {steps.map((_, i) => (
            <span key={i} className={`h-2 flex-1 rounded-full ${i <= index ? 'bg-teal-500' : 'bg-navy-100'}`} />
          ))}
        </div>

        {/* 마지막 단계에서는 「건너뛰기」를 두지 않습니다.
            이미 끝난 자리라 의미가 없고, 좁은 화면에서 버튼 줄이 접히면서
            설명이 들어갈 자리를 한 줄만큼 잡아먹습니다. */}
        <div className="mt-2 flex shrink-0 items-center gap-2">
          {!last && (
            <button
              onClick={stop}
              className="shrink-0 rounded-xl px-2 py-2.5 text-[1.2rem] font-bold text-navy-400 transition hover:text-navy-700"
            >
              건너뛰기
            </button>
          )}
          <div className={`ml-auto flex gap-2 ${last ? 'min-w-0 flex-1 sm:flex-none' : 'shrink-0'}`}>
            {index > 0 && (
              <button
                onClick={prev}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-2xl bg-navy-50 px-4 py-3 text-[1.26rem] font-extrabold text-navy-600 transition hover:bg-navy-100"
              >
                <ChevronLeft size={19} strokeWidth={2.5} /> 이전
              </button>
            )}
            <button
              data-tour-next
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
