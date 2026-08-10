import { useEffect } from 'react'
import type { RefObject } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// 인쇄할 때 이 화면만 남기기
//
//  거래명세서를 열고 「인쇄 · PDF 저장」을 누르면 명세서만 나와야 합니다.
//  그런데 실제로 뽑아 보니 A4 5장이 나왔고, 앞의 3장은 거래처 상세 화면
//  이었습니다. 명세서는 4장째부터 시작합니다. 병원에 그대로 보낼 수 없는
//  파일입니다.
//
//  이유는 간단합니다. 명세서는 화면 위에 덮여 있을 뿐 문서 안에서는 여전히
//  거래처 화면 '다음' 에 있는 요소라, 인쇄하면 순서대로 다 찍힙니다.
//
//  그래서 명세서에서 위로 올라가면서, 지나온 길 옆에 있는 것들에 표시를
//  붙입니다(.print-drop). 인쇄할 때는 그 표시가 붙은 것만 빠집니다.
//  화면에는 아무 영향이 없고, 닫으면 표시도 지웁니다.
//
//  덮개를 document.body 로 옮기는 방법(portal)도 있지만, 이 앱에는
//  '모바일 프레임으로 보기' 가 있어서 덮개가 프레임 밖으로 튀어나갑니다.
//  그래서 있던 자리에 그대로 두고 인쇄에서만 갈라냅니다.
// ─────────────────────────────────────────────────────────────────────────────

export function usePrintIsolate(ref: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    if (!active) return
    const el = ref.current
    if (!el) return

    const dropped = new Set<Element>()
    const kept = new Set<Element>()

    const mark = () => {
      let node: Element = el
      while (node !== document.body && node.parentElement) {
        const parent = node.parentElement
        for (const sib of Array.from(parent.children)) {
          if (sib !== node) {
            sib.classList.add('print-drop')
            dropped.add(sib)
          }
        }
        //  지나온 칸들은 남지만, 화면용 여백(하단 탭바 자리 등)과 높이는
        //  인쇄에서 그대로 두면 안 됩니다. 그냥 두면 내용은 1.5장인데
        //  빈 종이 한 장이 더 나옵니다(실제로 3장이 나왔습니다).
        parent.classList.add('print-keep')
        kept.add(parent)
        node = parent
      }
    }

    mark()
    //  화면이 다시 그려지면 리액트가 className 을 되돌려 표시가 지워집니다.
    //  인쇄 직전에 한 번 더 붙여 두면 그런 경우에도 안전합니다.
    window.addEventListener('beforeprint', mark)

    return () => {
      window.removeEventListener('beforeprint', mark)
      for (const m of dropped) m.classList.remove('print-drop')
      for (const m of kept) m.classList.remove('print-keep')
    }
  }, [ref, active])
}
