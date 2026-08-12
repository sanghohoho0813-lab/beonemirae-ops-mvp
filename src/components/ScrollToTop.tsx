import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

// ─────────────────────────────────────────────────────────────────────────────
// 라우트 변경 시 항상 화면 최상단으로 이동
//  데스크톱 웹 / 모바일 앱 레이아웃 모두 윈도우(문서) 스크롤을 사용하므로
//  window 와 문서 스크롤 요소를 함께 초기화한다.
//  (모바일 미리보기는 iframe 내부의 동일 로직이 iframe 윈도우 기준으로 동작)
// ─────────────────────────────────────────────────────────────────────────────

export function ScrollToTop() {
  const { pathname, hash } = useLocation()

  useEffect(() => {
    //  주소에 #이름 이 붙어 있으면 그 자리로 갑니다.
    //
    //  설정 화면은 스크롤이 3,000px 을 넘습니다. 「시작하기」의 "운행 차량
    //  등록"을 눌러 /settings 로 보내 봐야 맨 위에 떨어지고, 정작 차량 칸은
    //  한참 아래에 있어 찾지 못합니다 — 실제로 "등록하는 곳이 없다"는
    //  이야기를 들었습니다. 그래서 /settings#vehicles 처럼 자리까지 지정해
    //  보내고, 여기서 그 자리로 스크롤합니다.
    //
    //  화면이 그려진 뒤에 찾아야 하므로 다음 프레임에서 한 번 더 봅니다.
    if (hash) {
      const go = () => {
        const el = document.querySelector(hash)
        if (el) el.scrollIntoView({ block: 'start', behavior: 'auto' })
      }
      go()
      const id = window.requestAnimationFrame(go)
      return () => window.cancelAnimationFrame(id)
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    if (document.scrollingElement) document.scrollingElement.scrollTop = 0
  }, [pathname, hash])

  return null
}
