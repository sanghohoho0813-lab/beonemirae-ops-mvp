import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

// ─────────────────────────────────────────────────────────────────────────────
// 라우트 변경 시 항상 화면 최상단으로 이동
// 하단 메뉴/링크 이동, 뒤로가기 등 모든 경로 변경에서 새 화면을 맨 위에서 시작.
// ─────────────────────────────────────────────────────────────────────────────

export function ScrollToTop() {
  const { pathname } = useLocation()

  useEffect(() => {
    // 즉시 상단으로 (스크롤 점프 없이 새 화면을 위에서 시작)
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior })
  }, [pathname])

  return null
}
