import { useEffect, useRef } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// 오버레이(바텀시트·모달) ↔ 브라우저/기기 "뒤로 가기" 연동 훅
//
//  · 오버레이가 열릴 때 history 에 항목을 하나 쌓습니다.
//  · 뒤로 가기(popstate) 시 라우트를 이동하는 대신 오버레이를 닫습니다.
//    → 스마트폰에서 더보기/설정을 연 상태로 뒤로 가기를 누르면 그 화면이 정확히 닫힙니다.
//  · ✕·배경 탭·스와이프 등으로 닫으면 쌓아둔 항목을 정리(back)해 히스토리가 어긋나지 않게 합니다.
// ─────────────────────────────────────────────────────────────────────────────

export function useHistoryDismiss(open: boolean, onClose: () => void) {
  // onClose 는 매 렌더 새 함수일 수 있으므로 ref 로 담아 effect 재실행을 막습니다.
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!open) return
    let consumedByBack = false

    // 오버레이 전용 history 항목 추가 (URL 은 그대로 — 라우트 변화 없음)
    window.history.pushState({ overlay: true }, '')

    const onPop = () => {
      consumedByBack = true
      closeRef.current()
    }
    window.addEventListener('popstate', onPop)

    return () => {
      window.removeEventListener('popstate', onPop)
      // 뒤로 가기가 아니라 프로그램적으로 닫힌 경우(✕·배경 탭·스와이프) 쌓아둔 항목 정리
      if (!consumedByBack) window.history.back()
    }
  }, [open])
}
