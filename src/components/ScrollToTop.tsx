import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

// ─────────────────────────────────────────────────────────────────────────────
// 라우트 변경 시 항상 화면 최상단으로 이동
//  데스크톱 웹 / 모바일 앱 레이아웃 모두 윈도우(문서) 스크롤을 사용하므로
//  window 와 문서 스크롤 요소를 함께 초기화한다.
//  (모바일 미리보기는 iframe 내부의 동일 로직이 iframe 윈도우 기준으로 동작)
// ─────────────────────────────────────────────────────────────────────────────

export function ScrollToTop() {
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    if (document.scrollingElement) document.scrollingElement.scrollTop = 0
  }, [pathname])

  return null
}
