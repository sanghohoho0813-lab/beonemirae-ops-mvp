import { useEffect } from 'react'
import { Smartphone } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// PC 화면으로 보기 (폰 전용 보기 모드)
//
//  스크린샷을 보여 주는 것이 아니라 진짜 데스크톱 화면을 그립니다.
//
//  Tailwind 의 lg: 는 컨테이너가 아니라 '뷰포트' 폭으로 판단합니다. 그래서
//  안쪽 상자만 1440px 로 넓혀 봐야 사이드바는 나타나지 않습니다. 대신
//  meta viewport 를 width=1440 으로 바꾸면 브라우저가 레이아웃 폭 자체를
//  1440 으로 잡아, 데스크톱 breakpoint 가 그대로 켜집니다.
//  (폰 브라우저의 「데스크톱 사이트 요청」과 같은 방식입니다)
//
//  덕분에 축소된 모바일 화면이 아니라 실제 PC 레이아웃이 나오고,
//  버튼도 그대로 눌립니다 — 데이터도 기능도 같은 것을 씁니다.
//
//  배율은 따로 지정하지 않습니다. 그러면 브라우저가 폭에 맞춰 줄여서
//  1440 짜리 화면 전체가 한 번에 들어옵니다 — "PC 에서 전체가 어떻게
//  구성되는지" 보는 것이 목적이므로 이쪽이 맞습니다.
//  글씨가 작으니 손가락으로 확대하면 그때부터 좌우로 밀어 가며 봅니다.
//
//  기본값은 언제나 모바일입니다. 저장하지 않으므로 새로고침하면 돌아옵니다.
// ─────────────────────────────────────────────────────────────────────────────

const MOBILE_VIEWPORT = 'width=device-width, initial-scale=1.0, maximum-scale=5.0, viewport-fit=cover'
const PC_VIEWPORT = 'width=1440, minimum-scale=0.2, maximum-scale=3, user-scalable=yes'

/** 보기 모드에 맞춰 meta viewport 를 바꿉니다 */
export function usePcViewport(on: boolean) {
  useEffect(() => {
    const meta = document.querySelector('meta[name="viewport"]')
    if (!meta) return
    meta.setAttribute('content', on ? PC_VIEWPORT : MOBILE_VIEWPORT)
    if (on) window.scrollTo(0, 0)
    return () => {
      // 화면을 떠날 때 폰 화면이 1440 인 채로 남으면 안 됩니다
      meta.setAttribute('content', MOBILE_VIEWPORT)
    }
  }, [on])
}

/**
 * 돌아가는 길 — 항상 화면 아래에 붙어 있습니다.
 *
 * 0.5 배로 축소되어 보이므로 일부러 크게 만들었습니다.
 * 여기서 작게 만들면 실제 손가락으로는 누를 수 없는 크기가 됩니다.
 */
export function PcViewBar({ onExit }: { onExit: () => void }) {
  return (
    <div
      data-pc-view-bar
      className="fixed inset-x-0 bottom-0 z-[60] flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t-2 border-teal-400 bg-navy-950/95 px-6 py-4 backdrop-blur"
    >
      <p className="break-keep text-[1.15rem] font-medium text-navy-200">
        PC 에서 보이는 전체 화면 구성을 확인하는 보기 모드입니다. 손가락으로 확대하면 좌우로 밀어 가며 자세히
        보실 수 있습니다.
      </p>
      <button
        data-pc-view-exit
        onClick={onExit}
        className="inline-flex shrink-0 items-center gap-2.5 rounded-2xl bg-teal-500 px-7 py-4 text-[1.3rem] font-extrabold text-white shadow-lg transition hover:bg-teal-600 active:scale-[0.99]"
      >
        <Smartphone size={22} strokeWidth={2.5} />
        모바일 화면으로 돌아가기
      </button>
    </div>
  )
}
