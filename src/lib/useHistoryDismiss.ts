import { useEffect, useRef } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// 오버레이(바텀시트·모달) ↔ 브라우저/기기 "뒤로 가기" 연동 훅
//
//  · 오버레이가 열릴 때 history 에 항목을 하나 쌓습니다.
//  · 뒤로 가기(popstate) 시 라우트를 이동하는 대신 오버레이를 닫습니다.
//    → 스마트폰에서 더보기/설정을 연 상태로 뒤로 가기를 누르면 그 화면이 정확히 닫힙니다.
//  · ✕·배경 탭·스와이프 등으로 닫으면 쌓아둔 항목을 정리(back)해 히스토리가 어긋나지 않게 합니다.
// ─────────────────────────────────────────────────────────────────────────────

//  ⚠ 0095 — 항목마다 **자기 번호**를 붙입니다.
//    전에는 모든 오버레이가 똑같이 { overlay: true } 를 쌓았습니다. 창 위에
//    창이 열리는 일이 없을 때는 문제가 없었는데, 더보기 시트 위에서
//    「계획 중」 미리보기를 닫자 **더보기 시트까지 같이 닫혔습니다** —
//    미리보기가 자기 항목을 걷어 갈 때(back) 시트의 popstate 가 그것을
//    「내가 닫혀야 한다」로 읽은 것입니다. 번호를 붙이면 각자 자기 항목만
//    책임집니다.
let overlaySeq = 0

export function useHistoryDismiss(open: boolean, onClose: () => void) {
  // onClose 는 매 렌더 새 함수일 수 있으므로 ref 로 담아 effect 재실행을 막습니다.
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!open) return
    let consumedByBack = false
    overlaySeq += 1
    const myId = overlaySeq

    // 오버레이 전용 history 항목 추가 (URL 은 그대로 — 라우트 변화 없음)
    window.history.pushState({ overlay: myId }, '')

    const onPop = () => {
      //  걷힌 항목이 **내 위에 얹혀 있던 다른 창**의 것이면 — 최상단이 바로
      //  나입니다. 나는 그대로 열려 있어야 합니다.
      const top = (window.history.state as { overlay?: number } | null)?.overlay
      if (top === myId) return
      consumedByBack = true
      closeRef.current()
    }
    window.addEventListener('popstate', onPop)

    return () => {
      window.removeEventListener('popstate', onPop)
      // 뒤로 가기로 닫힌 경우: 이미 항목이 소비됨 → 아무것도 안 함.
      // 화면 이동(navigate)으로 닫힌 경우: 새 라우트가 위에 쌓여 우리 항목이 최상단이 아님
      //   → history.state.overlay 가 사라짐 → back() 하면 방금 이동을 취소하므로 하지 않음.
      // ✕·배경 탭·스와이프로 닫힌 경우: 우리 항목이 그대로 최상단 → 정리 목적으로 back().
      const stillTop = (window.history.state as { overlay?: number } | null)?.overlay === myId
      if (!consumedByBack && stillTop) window.history.back()
    }
  }, [open])
}
