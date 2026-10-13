import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePortalClient } from '../../lib/portalClient'
import { usePortalSheet } from '../../lib/portalSheet'
import type { SheetDone } from '../PortalSheet'

// ─────────────────────────────────────────────────────────────────────────────
// 보낸 뒤 「접수되었습니다」 화면과 그 다음 갈 곳 (포털 1차 고도화)
//
//  ⚠ 다음 갈 곳도 **지금 병원을 달고** 갑니다(target.path). 직원이 미리보기로
//    보는 중에 「요청 내역 보기」를 눌렀는데 병원이 지워지면 0088 의 결함이
//    되살아납니다.
//  ⚠ 주소를 옮기면 물음표 뒤(?do=)가 떨어지므로 창은 저절로 닫힙니다.
//
//  포털 3차 — 큰 단추는 「확인」(창만 닫기)입니다. 대표님 브리프의 흐름 그대로
//    「요청하기 → 완료 → 창 닫힘 → 홈 최근 요청에 바로 표시」. 보던 화면을
//    떠나지 않고, 방금 보낸 요청이 그 화면 「최근 요청」 맨 위에 보입니다.
//    요청 내역 화면은 작은 단추로 남겨 둡니다.
// ─────────────────────────────────────────────────────────────────────────────

export function useSheetDone(open: boolean) {
  const navigate = useNavigate()
  const target = usePortalClient()
  const { close } = usePortalSheet()
  const [done, setDone] = useState<SheetDone | null>(null)

  //  창이 닫히고 사라지는 움직임(약 0.3초)이 끝난 뒤에 지웁니다. 바로 지우면
  //  닫히는 동안 빈 입력 화면이 한 번 비칩니다.
  useEffect(() => {
    if (open || !done) return
    const t = window.setTimeout(() => setDone(null), 400)
    return () => window.clearTimeout(t)
  }, [open, done])

  const toPath = target.path
  const finish = useCallback(
    (d: { title?: string; message?: string; lines: string[]; to?: 'requests' | 'support' }) => {
      const to = d.to ?? 'requests'
      setDone({
        title: d.title ?? '요청이 접수되었습니다',
        message: d.message ?? '비원미래에서 확인 후 처리 상태를 안내드립니다.',
        lines: d.lines,
        primary: {
          label: '확인',
          onClick: () => {
            close()
            //  홈이면 방금 보낸 요청이 보이는 「최근 요청」으로 데려다 드립니다.
            //  (그 칸이 없는 화면에서는 아무 일도 없습니다)
            if (to !== 'requests') return
            window.setTimeout(() => {
              const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
              document
                .querySelector('[data-portal-requests]')
                ?.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' })
            }, 350)
          },
        },
        secondary: {
          label: to === 'support' ? '문의 내역 보기' : '요청 내역 보기',
          onClick: () => navigate(toPath(to)),
        },
        //  요청이면 진행 단계를 보여 줍니다(문의는 단계가 다릅니다).
        steps: to === 'requests',
      })
    },
    [navigate, toPath, close],
  )

  return { done, finish }
}
