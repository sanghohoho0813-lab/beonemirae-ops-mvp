import { useEffect, useState } from 'react'
import { Monitor, Smartphone, X } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { usePcViewport, PcViewBar } from './PcViewBar'

// ─────────────────────────────────────────────────────────────────────────────
// 병원 화면 — 폰에서 PC 화면 보기 / PC 에서 폰 화면 보기 (0090)
//
//  대표님: 「병원화면도 모바일에서 pc화면 볼 수 있게, 반대 상황도 가능하게」
//
//  ── 두 방향은 방법이 다릅니다 ───────────────────────────────────────────
//
//   폰 → PC   meta viewport 를 width=1440 으로 바꿉니다.
//             Tailwind 의 sm:·lg: 는 **상자 폭이 아니라 뷰포트 폭**으로
//             판단합니다. 그래서 안쪽 상자만 1440px 로 넓혀 봐야 PC 배치가
//             안 나옵니다. 폰 브라우저의 「데스크톱 사이트 요청」과 같은
//             방식이라, 축소된 그림이 아니라 **진짜 PC 화면**이 그려지고
//             단추도 그대로 눌립니다.
//             (내부 화면이 이미 쓰는 방법 그대로입니다 — PcViewBar.tsx)
//
//   PC → 폰   같은 이유로 **반대는 안 됩니다.** PC 에서 뷰포트를 390 으로
//             줄일 방법이 없습니다(meta viewport 는 폰 브라우저만 봅니다).
//             그래서 폰 크기의 틀 안에 이 화면을 **한 번 더 띄웁니다**.
//             틀 안은 폭이 390px 이므로 그 안에서는 모바일 배치가 그대로
//             켜집니다.
//
//  ⚠ **주소를 그대로** 씁니다. 그래서 지금 보고 계신 병원이 틀 안에서도
//    같습니다 — 0088 에서 병원 id 를 경로에 넣어 둔 덕입니다.
//
//  ⚠ 저장하지 않습니다. 새로고침하면 원래 보기로 돌아옵니다. 잠깐 확인하는
//    기능이지, 계속 그 상태로 쓰시라는 것이 아닙니다.
//
//  ⚠ 틀 **안에서는** 이 단추가 안 나옵니다(`frame=1`). 틀 안에서 또 틀을
//    열면 끝이 없습니다.
//
//  ── 단추를 어디에 두었나 ────────────────────────────────────────────────
//
//   PC → 폰   머리띠. 넓은 화면에는 자리가 있습니다.
//   폰 → PC   **화면 맨 아래**(PortalFooter). 처음에는 머리띠에 뒀는데,
//             단추가 다섯이 되면서 병원 이름이 긴 곳에서 머리띠가 두 줄
//             (140 → 196px)이 되고 「수거 요청」이 y=845px 로 첫 화면 밖에
//             나갔습니다(check_flow390 이 잡았습니다).
//             폰에서 「PC 화면으로 보기」는 **가끔 한 번** 쓰는 것이고,
//             매일 쓰는 「수거 요청」이 먼저입니다.
//             (내부 화면도 이 단추를 머리띠가 아니라 「더보기」에 둡니다)
//
//   그래서 상태는 여기 한 곳이 가지고, 아래쪽 단추는 **신호만 보냅니다** —
//   같은 상태를 두 군데 두면 언젠가 어긋납니다.
// ─────────────────────────────────────────────────────────────────────────────

const OPEN_PC = 'beonemirae:portal-pc-view'

/** 화면 맨 아래 단추가 부릅니다 */
export function openPortalPcView() {
  window.dispatchEvent(new CustomEvent(OPEN_PC))
}

/** 지금 이 화면이 「폰 틀 안」인가 */
export function useInPhoneFrame(): boolean {
  const { search } = useLocation()
  return new URLSearchParams(search).get('frame') === '1'
}

export function PortalViewSwitch({ className = '' }: { className?: string }) {
  const { pathname, search } = useLocation()
  const inFrame = useInPhoneFrame()

  //  폰 → PC. 저장하지 않습니다.
  const [pcView, setPcView] = useState(false)
  usePcViewport(pcView)

  //  아래쪽 단추(PortalFooter)에서 오는 신호를 받습니다.
  useEffect(() => {
    const on = () => setPcView(true)
    window.addEventListener(OPEN_PC, on)
    return () => window.removeEventListener(OPEN_PC, on)
  }, [])

  //  PC → 폰.
  const [phoneView, setPhoneView] = useState(false)

  //  ⚠ 화면을 옮기면 보기 모드를 끕니다. 켜 둔 채로 다른 화면에 가면
  //    「왜 이렇게 보이지」가 됩니다.
  useEffect(() => {
    setPcView(false)
    setPhoneView(false)
  }, [pathname])

  //  ⚠ 폰 틀이 열려 있는 동안 뒤 화면이 같이 스크롤되면 닫았을 때
  //    엉뚱한 자리에 와 있습니다.
  useEffect(() => {
    if (!phoneView) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPhoneView(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [phoneView])

  if (inFrame) return null

  //  틀 안에 띄울 주소 — 지금 주소 그대로에 표시만 하나 더 답니다.
  const params = new URLSearchParams(search)
  params.set('frame', '1')
  const frameSrc = `${pathname}?${params.toString()}`

  return (
    <>
      {/*  넓은 화면에서만 — 「모바일 화면으로 보기」
           ⚠ 폰용 단추는 여기 없습니다. 화면 맨 아래에 있습니다 —
             위 주석의 「단추를 어디에 두었나」 참고. */}
      <button
        data-portal-phone-view
        onClick={() => setPhoneView(true)}
        title="모바일 화면으로 보기"
        aria-label="모바일 화면으로 보기"
        className={`hidden min-h-[2.75rem] shrink-0 items-center gap-1.5 rounded-xl bg-white/10 px-2.5 py-2 text-white transition hover:bg-white/20 lg:flex lg:px-3.5 lg:py-2.5 ${className}`}
      >
        <Smartphone size={17} strokeWidth={2.3} />
        <span className="t-btn">모바일 화면</span>
      </button>

      {/*  폰에서 PC 화면을 보는 중 — 돌아가는 길을 항상 띄워 둡니다 */}
      {pcView && <PcViewBar onExit={() => setPcView(false)} />}

      {/*  PC 에서 폰 화면을 보는 중 */}
      {phoneView && (
        <div
          data-portal-phone-frame
          role="dialog"
          aria-modal="true"
          aria-label="모바일 화면으로 보기"
          className="fixed inset-0 z-[75] flex flex-col items-center bg-navy-950/70 backdrop-blur-sm"
        >
          <div className="flex w-full max-w-[1240px] flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
            <p className="t-body min-w-0 flex-1 break-keep font-bold text-white">
              병원 담당자분 휴대전화에서 이렇게 보입니다. 안에서 그대로 눌러 보실 수 있습니다.
            </p>
            <button
              data-portal-phone-exit
              onClick={() => setPhoneView(false)}
              className="flex min-h-[2.75rem] shrink-0 items-center gap-2 rounded-2xl bg-white px-4 text-[1.05rem] font-extrabold text-navy-900 transition hover:bg-navy-50"
            >
              <X size={18} strokeWidth={2.6} /> 닫기
            </button>
          </div>

          {/*  폰 틀 — 안쪽 폭이 390px 이라야 모바일 배치가 켜집니다 */}
          <div className="flex min-h-0 flex-1 items-start justify-center px-4 pb-8">
            <div className="relative h-[800px] max-h-[calc(100dvh-8rem)] w-[406px] max-w-full overflow-hidden rounded-[44px] bg-black p-2 shadow-2xl">
              <div className="absolute left-1/2 top-2 z-10 h-5 w-28 -translate-x-1/2 rounded-b-2xl bg-black" />
              <iframe
                data-portal-phone-iframe
                title="병원 화면 — 모바일 보기"
                src={frameSrc}
                className="h-full w-full rounded-[36px] border-0 bg-app"
              />
            </div>
          </div>
        </div>
      )}
    </>
  )
}


// ─────────────────────────────────────────────────────────────────────────────
// 화면 맨 아래의 「PC 화면으로 보기」 (0090)
//
//  ⚠ 폰에서만 보입니다. PC 에서는 이미 PC 화면이라 뜻이 없습니다.
//  ⚠ 여기서는 **신호만 보냅니다.** 실제 전환은 PortalViewSwitch 가 합니다 —
//    같은 상태를 두 군데 두면 언젠가 어긋납니다.
// ─────────────────────────────────────────────────────────────────────────────

export function PortalPcViewButton() {
  const inFrame = useInPhoneFrame()
  if (inFrame) return null
  return (
    <button
      data-portal-pc-view
      onClick={openPortalPcView}
      className="flex min-h-[3rem] w-full items-center gap-2.5 rounded-2xl bg-white px-4 text-left ring-1 ring-navy-200 transition hover:ring-navy-400 lg:hidden"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-navy-100 text-navy-600">
        <Monitor size={18} strokeWidth={2.4} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="t-body block break-keep font-extrabold text-navy-900">PC 화면으로 보기</span>
        <span className="t-muted block break-keep leading-snug">
          컴퓨터에서 보이는 전체 화면을 그대로 확인하실 수 있습니다
        </span>
      </span>
    </button>
  )
}
