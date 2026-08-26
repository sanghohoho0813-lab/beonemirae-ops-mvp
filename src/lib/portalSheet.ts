import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

// ─────────────────────────────────────────────────────────────────────────────
// 「지금 무엇을 하고 있는가」를 주소에 담습니다 (0089)
//
//  대표님: 「홈 화면에서 대부분의 업무가 끝나는 작업형 Customer Platform」
//
//  ⚠ 창(Modal·Drawer)을 여는 것을 **화면 이동으로 만들지 않습니다.** 카드를
//    누르면 있던 자리에 그대로 있고 위에 창만 뜹니다. 병원 담당자가
//    「어디로 가야 하지」를 생각하지 않게 하는 것이 이번 작업의 목적입니다.
//
//  ⚠ 그런데 창을 화면 안 상태로만 두면 **새로고침에 사라집니다.** 병원
//    담당자가 요청을 적다가 실수로 새로고침하면 처음부터입니다.
//    그래서 「무슨 창이 열려 있는지」만 주소 뒤(?do=)에 적어 둡니다.
//
//  ⚠ 병원 id 는 여기 안 넣습니다 — 그건 **경로**에 있습니다(0088).
//    물음표 뒤는 지워져도 병원은 안 지워집니다. 이 둘을 섞으면 0088 에서
//    겪은 일이 되돌아옵니다.
// ─────────────────────────────────────────────────────────────────────────────

/** 열 수 있는 창 */
export const SHEETS = [
  'pickup',   // 수거 요청
  'urgent',   // 긴급 수거
  'supply',   // 용기·봉투 주문
  'ask',      // 상담·문의
  'history',  // 수거 이력 (서랍)
  'report',   // 월간 리포트
  'billing',  // 정산 (서랍)
  'docs',     // 증빙자료 (서랍)
] as const
export type SheetName = (typeof SHEETS)[number]

export interface SheetState {
  /** 지금 열려 있는 창. 없으면 null */
  sheet: SheetName | null
  open: (name: SheetName) => void
  close: () => void
}

export function usePortalSheet(): SheetState {
  const [params, setParams] = useSearchParams()
  const raw = params.get('do') ?? ''
  const sheet = (SHEETS as readonly string[]).includes(raw) ? (raw as SheetName) : null

  const open = useCallback(
    (name: SheetName) => {
      const next = new URLSearchParams(params)
      next.set('do', name)
      //  ⚠ replace 가 아니라 **쌓습니다.** 그래야 폰의 뒤로가기가
      //    「창 닫기」로 동작합니다 — 병원 담당자가 제일 많이 쓰는 단추입니다.
      setParams(next)
    },
    [params, setParams],
  )

  const close = useCallback(() => {
    const next = new URLSearchParams(params)
    next.delete('do')
    //  ⚠ 닫을 때는 **되돌리기 기록을 남기지 않습니다.** 남기면 창을 닫고
    //    뒤로가기를 눌렀을 때 창이 다시 열립니다.
    setParams(next, { replace: true })
  }, [params, setParams])

  return { sheet, open, close }
}
