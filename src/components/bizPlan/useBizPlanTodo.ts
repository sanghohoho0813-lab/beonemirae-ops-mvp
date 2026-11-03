import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { TODO_KEY, decisionTodo, strategyOpen } from '../../lib/bizStrategyApi'
import { useBizPlanMenu } from './useBizPlanMenu'

/**
 *  「사업계획서 — 결정 n개 남음」 메뉴 알림 (0148 이후)
 *
 *   대표님 · 이사님(결정할 분)이 사업계획서에 들어가지 않아도 고르실 것이 남았는지 보이게 합니다.
 *   · 메뉴에 사업계획서가 보이는 계정만(useBizPlanMenu) · 결정할 분(is_decider)에게만 숫자가 나옵니다.
 *   · 셈은 「확인 · 결정」 화면과 같은 것(decisionTodo)입니다.
 *   · 이 탭에 3분 기억합니다(사이드바 · 더보기 · 아래 탭이 따로 묻지 않게 한 번만). 결정을 남기면 지웁니다.
 *   · 서버가 0148 전이거나 못 읽으면 조용히 안 보입니다 — 지어낸 숫자를 띄우지 않습니다.
 */
export interface BizPlanTodo {
  left: number
  split: number
}
interface Saved extends BizPlanTodo {
  at: number
  uid: string
}
const FRESH_MS = 3 * 60_000
let inflight: { uid: string; p: Promise<BizPlanTodo | null> } | null = null

function readSaved(uid: string): Saved | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(TODO_KEY) ?? 'null') as Saved | null
    return v && v.uid === uid && typeof v.left === 'number' ? v : null
  } catch {
    return null
  }
}

export function useBizPlanTodo(): BizPlanTodo | null {
  const show = useBizPlanMenu()
  const { profile } = useAuth()
  const uid = profile?.id ?? ''
  const [todo, setTodo] = useState<BizPlanTodo | null>(() => (uid ? readSaved(uid) : null))
  useEffect(() => {
    if (!show || !uid) return
    const saved = readSaved(uid)
    if (saved && Date.now() - saved.at < FRESH_MS) {
      setTodo(saved)
      return
    }
    let alive = true
    if (!inflight || inflight.uid !== uid) {
      const p = strategyOpen()
        .then((d) => {
          const t = decisionTodo(d, d?.me?.id ?? uid)
          const r = t && t.isDecider ? { left: t.left.length, split: t.split } : null
          try {
            sessionStorage.setItem(TODO_KEY, JSON.stringify({ ...(r ?? { left: 0, split: 0 }), at: Date.now(), uid }))
          } catch {
            /* 기억 못 해도 이번에는 보입니다 */
          }
          return r
        })
        .catch(() => null)
        .finally(() => {
          if (inflight?.p === p) inflight = null
        })
      inflight = { uid, p }
    }
    void inflight.p.then((r) => alive && setTodo(r))
    return () => {
      alive = false
    }
  }, [show, uid])
  return show && todo && (todo.left > 0 || todo.split > 0) ? todo : null
}
