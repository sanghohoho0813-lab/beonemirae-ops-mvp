import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { PRESENTER_STEPS, clearRun, loadRun, saveRun } from '../lib/presenter'

// ─────────────────────────────────────────────────────────────────────────────
// 심사 시연 Presenter Mode — 진행 상태 (0139)
//
//  「심사 시연 시작」 → 몇 단계인지 · 어느 병원으로 시연하는지만 기억합니다.
//  화면을 옮기거나 새로고침해도 이어지고(sessionStorage), 「발표 가이드 종료」를
//  누르면 흔적 없이 사라집니다. 업무 데이터는 건드리지 않습니다.
//
//  ⚠ 다음 · 이전은 **그 단계 화면으로 데려갑니다.** 대표님이 메뉴를 찾지 않게.
// ─────────────────────────────────────────────────────────────────────────────

interface PresenterValue {
  active: boolean
  index: number
  clientId: string | null
  start: (opts?: { clientId?: string | null; index?: number }) => void
  goTo: (index: number) => void
  next: () => void
  prev: () => void
  stop: () => void
  setClient: (clientId: string | null) => void
}

const Ctx = createContext<PresenterValue | null>(null)

export function PresenterProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [run, setRun] = useState(() => loadRun())

  useEffect(() => {
    if (run) saveRun({ index: run.index, clientId: run.clientId })
    else clearRun()
  }, [run])

  const goTo = useCallback(
    (index: number) => {
      const i = Math.max(0, Math.min(PRESENTER_STEPS.length - 1, index))
      const clientId = run?.clientId ?? null
      setRun({ index: i, clientId, at: Date.now() })
      navigate(PRESENTER_STEPS[i].go({ clientId }))
    },
    [navigate, run],
  )

  const value = useMemo<PresenterValue>(
    () => ({
      active: !!run,
      index: run?.index ?? 0,
      clientId: run?.clientId ?? null,
      start: (opts) => {
        const i = opts?.index ?? 0
        const clientId = opts?.clientId ?? null
        setRun({ index: i, clientId, at: Date.now() })
        navigate(PRESENTER_STEPS[i].go({ clientId }))
      },
      goTo,
      next: () => goTo((run?.index ?? 0) + 1),
      prev: () => goTo((run?.index ?? 0) - 1),
      stop: () => setRun(null),
      setClient: (clientId) => setRun((r) => (r ? { ...r, clientId, at: Date.now() } : r)),
    }),
    [run, goTo, navigate],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function usePresenter(): PresenterValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('usePresenter 는 PresenterProvider 안에서만 씁니다.')
  return v
}
