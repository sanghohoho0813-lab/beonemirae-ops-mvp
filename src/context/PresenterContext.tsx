import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { FULL_ORDER, PRESENTER_STEPS, clearRun, loadRun, saveRun, stepIndex, type PresenterRun } from '../lib/presenter'

// ─────────────────────────────────────────────────────────────────────────────
// 심사 시연 Presenter Mode — 진행 상태 (0139 · 0140)
//
//  「심사 시연 시작」 → 어떤 차례로(전체 흐름 · AI 먼저), 몇 번째인지, 어느 병원 ·
//  어느 시연 요청으로 하는지만 기억합니다. 화면을 옮기거나 새로고침해도 이어지고
//  (sessionStorage), 「발표 가이드 종료」를 누르면 흔적 없이 사라집니다.
//  업무 데이터는 건드리지 않습니다.
//
//  ⚠ 다음 · 이전은 **그 단계 화면으로 데려갑니다.** 대표님이 메뉴를 찾지 않게.
//  ⚠ 0140 — 「AI 먼저」는 같은 단계를 다른 차례로 보여 줄 뿐입니다(AI_ORDER).
// ─────────────────────────────────────────────────────────────────────────────

interface StartOpts {
  clientId?: string | null
  /** 보여 줄 차례 — 기본 전체 흐름 */
  order?: string[]
  /** 그 차례의 몇 번째부터 */
  pos?: number
  demoRequestId?: string | null
}

interface PresenterValue {
  active: boolean
  /** 지금 단계 — PRESENTER_STEPS 의 번호 */
  index: number
  /** 지금 차례에서 몇 번째 */
  pos: number
  order: string[]
  clientId: string | null
  demoRequestId: string | null
  start: (opts?: StartOpts) => void
  /** 지금 차례의 pos 번째로 */
  goTo: (pos: number) => void
  next: () => void
  prev: () => void
  stop: () => void
  setClient: (clientId: string | null) => void
  /** AI 먼저 보여 준 뒤 — 전체 운영 흐름(오늘 운영 화면)으로 이어 가기 */
  continueFull: () => void
}

const Ctx = createContext<PresenterValue | null>(null)

export function PresenterProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [run, setRun] = useState<PresenterRun | null>(() => loadRun())

  //  발표 중(안내 카드가 켜져 있거나 발표 시작 화면)에는 화면에 「발표 중」 표시 —
  //  index.css 가 [data-hide-presenting] 칸(AX 코치 · 설정 안내 · 하루 질문 · 사용 후기 단추)을 숨깁니다.
  //  업무 데이터 · 기능은 그대로입니다. 끝내면 바로 원래대로.
  const presenting = !!run || pathname === '/presentation'
  useEffect(() => {
    const el = document.documentElement
    if (presenting) el.setAttribute('data-presenting', '1')
    else el.removeAttribute('data-presenting')
    return () => el.removeAttribute('data-presenting')
  }, [presenting])

  useEffect(() => {
    if (run) saveRun({ order: run.order, pos: run.pos, clientId: run.clientId, demoRequestId: run.demoRequestId })
    else clearRun()
  }, [run])

  const show = useCallback(
    (r: PresenterRun) => {
      setRun(r)
      const step = PRESENTER_STEPS[stepIndex(r.order[r.pos])]
      navigate(step.go({ clientId: r.clientId, demoRequestId: r.demoRequestId }))
    },
    [navigate],
  )

  const goTo = useCallback(
    (pos: number) => {
      if (!run) return
      const p = Math.max(0, Math.min(run.order.length - 1, pos))
      show({ ...run, pos: p, at: Date.now() })
    },
    [run, show],
  )

  const value = useMemo<PresenterValue>(() => {
    const order = run?.order ?? FULL_ORDER
    const pos = run?.pos ?? 0
    return {
      active: !!run,
      index: stepIndex(order[pos]),
      pos,
      order,
      clientId: run?.clientId ?? null,
      demoRequestId: run?.demoRequestId ?? null,
      start: (opts) => {
        const o = opts?.order?.length ? opts.order : FULL_ORDER
        show({
          order: o,
          pos: Math.max(0, Math.min(o.length - 1, opts?.pos ?? 0)),
          clientId: opts?.clientId ?? null,
          demoRequestId: opts?.demoRequestId ?? null,
          at: Date.now(),
        })
      },
      goTo,
      next: () => goTo(pos + 1),
      prev: () => goTo(pos - 1),
      stop: () => setRun(null),
      setClient: (clientId) => setRun((r) => (r ? { ...r, clientId, at: Date.now() } : r)),
      continueFull: () => {
        const k = order.indexOf('today')
        if (k >= 0) goTo(k)
      },
    }
  }, [run, goTo, show])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function usePresenter(): PresenterValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('usePresenter 는 PresenterProvider 안에서만 씁니다.')
  return v
}
