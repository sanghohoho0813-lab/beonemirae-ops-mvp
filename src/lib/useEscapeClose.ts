import { useEffect, useRef } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// Esc 로 닫기 — **맨 위 창 하나만** (0103)
//
//  창마다 제각기 keydown 을 듣게 두면, 더보기 시트 위에 「계획 중」 미리보기가
//  떠 있을 때 Esc 한 번에 **둘 다** 닫힙니다. 사람은 위의 것 하나만 닫으려고
//  눌렀는데 뒤의 시트까지 사라지니 「어? 어디 갔지」가 됩니다.
//
//  그래서 열린 창을 쌓아 두고(stack), Esc 는 마지막에 열린 것만 닫습니다.
//  창은 열릴 때 올라가고 닫힐 때 내려옵니다 — 순서가 곧 위아래입니다.
//
//  ⚠ 한글 입력 중(IME 조합 중) Esc 는 조합을 취소하는 키입니다. 그때는 창을
//    닫지 않습니다 — 글을 쓰다 창이 사라지면 쓴 것이 날아갑니다.
// ─────────────────────────────────────────────────────────────────────────────

const stack: number[] = []
const closers = new Map<number, () => void>()
let seq = 0
let listening = false

function listen() {
  if (listening || typeof window === 'undefined') return
  listening = true
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.isComposing || stack.length === 0) return
    const top = stack[stack.length - 1]
    closers.get(top)?.()
  })
}

export function useEscapeClose(open: boolean, onClose: () => void) {
  //  onClose 는 매 렌더 새 함수일 수 있으므로 ref 로 담아 effect 재실행을 막습니다.
  const ref = useRef(onClose)
  ref.current = onClose

  useEffect(() => {
    if (!open) return
    listen()
    seq += 1
    const id = seq
    stack.push(id)
    closers.set(id, () => ref.current())
    return () => {
      const i = stack.indexOf(id)
      if (i >= 0) stack.splice(i, 1)
      closers.delete(id)
    }
  }, [open])
}
