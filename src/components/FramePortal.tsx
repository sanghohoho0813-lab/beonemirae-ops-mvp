import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

// ─────────────────────────────────────────────────────────────────────────────
// 폰 프레임(#app-frame) 내부로 오버레이를 포탈 렌더링
//  모달·토스트가 데스크톱에서도 프레임 안에 머물도록(absolute 기준점 확보).
//  프레임이 없으면 body 로 폴백.
// ─────────────────────────────────────────────────────────────────────────────

export function FramePortal({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null)

  useEffect(() => {
    setTarget(document.getElementById('app-frame') ?? document.body)
  }, [])

  if (!target) return null
  return createPortal(children, target)
}
