import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

// ─────────────────────────────────────────────────────────────────────────────
// 라우트 변경 시 항상 화면 최상단으로 이동
//  폰 프레임 구조에서는 본문(main)이 스크롤 컨테이너이므로 해당 요소의
//  scrollTop 을 0 으로 초기화하고, 윈도우 스크롤도 폴백으로 함께 초기화.
// ─────────────────────────────────────────────────────────────────────────────

export function ScrollToTop() {
  const { pathname } = useLocation()

  useEffect(() => {
    // 본문 스크롤 컨테이너 초기화 (폰 프레임)
    const main = document.querySelector('#app-frame main')
    if (main) main.scrollTop = 0
    // 윈도우 스크롤 폴백
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [pathname])

  return null
}
