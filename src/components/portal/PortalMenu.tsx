import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { ChevronDown, Headset, LogOut, Smartphone, UserRound } from 'lucide-react'
import { CLIENT_TEL, COMPANY_HOURS } from '../../lib/brand'
import { useEscapeClose } from '../../lib/useEscapeClose'
import { TourButton } from '../TourEntry'
import { FontSizeButton } from '../FontSizeButton'
import { ThemeButton } from '../ThemePicker'
import { PortalPcViewButton, openPortalPhoneView, useInPhoneFrame } from '../PortalViewSwitch'

// ─────────────────────────────────────────────────────────────────────────────
// 내 정보 · 설정 (포털 3차)
//
//  대표님 브리프: 「사용 방법 · 글자 크기 · 모바일 화면 · 로그아웃 · 화면 설정은
//  프로필 또는 설정 메뉴 안으로」 · 「설정 기능이 시각적으로 강해지지 않게」.
//
//  예전에는 PC 머리띠에 단추 여섯이 늘 떠 있었고, 화면 맨 아래에 「도움·설정」
//  네 줄이 모든 화면마다 반복됐습니다. 병원 직원이 매일 하는 것은 수거 일정
//  확인 · 요청 · 이력 확인인데, 정작 그보다 설정이 더 많이 보였습니다.
//  이제 한 단추(내 정보) 안에 모읍니다 — 폰에서는 아래에서 올라오는 시트,
//  넓은 화면에서는 단추 아래로 펼쳐지는 메뉴입니다.
//
//  ⚠ 글자 크기 · 화면 색은 **자기 창을 엽니다.** 그 창들이 이 메뉴보다 위
//    (z-50 · z-60)라 메뉴는 z-40 에 둡니다(아래 탭 z-30 보다는 위).
//  ⚠ 사용 방법 · 화면 보기 전환은 누르면 메뉴를 닫습니다 — 안내와 전환은
//    화면 전체를 씁니다.
// ─────────────────────────────────────────────────────────────────────────────

const ROW =
  'flex min-h-[3.5rem] w-full items-center gap-3.5 px-5 py-3 text-left text-[1.05rem] font-bold text-navy-800 transition hover:bg-navy-50 focus-visible:bg-navy-50 focus-visible:outline-none [&>svg]:shrink-0 [&>svg]:text-navy-500'

export function PortalMenu({
  clientName,
  profileName,
  onLogout,
}: {
  clientName: string
  profileName?: string
  onLogout: () => void
}) {
  const [open, setOpen] = useState(false)
  const inFrame = useInPhoneFrame()
  const { pathname } = useLocation()
  const close = () => setOpen(false)
  useEscapeClose(open, close)
  //  화면을 옮기면 닫습니다.
  useEffect(() => setOpen(false), [pathname])
  //  나중에 닫기 — 누른 단추의 일이 먼저 시작되게.
  const closeAfter = () => window.setTimeout(close, 0)

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        data-portal-more
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="내 정보 · 설정"
        onClick={() => setOpen((v) => !v)}
        className="flex h-11 min-w-[2.75rem] items-center justify-center gap-1.5 rounded-xl bg-navy-50 px-2.5 text-navy-700 transition hover:bg-navy-100 sm:px-3.5"
      >
        <UserRound size={20} strokeWidth={2.3} aria-hidden="true" />
        <span className="t-btn hidden whitespace-nowrap sm:inline">내 정보</span>
        <ChevronDown size={16} strokeWidth={2.6} aria-hidden="true" className={`hidden transition-transform sm:block ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div aria-hidden="true" onClick={close} className="fixed inset-0 z-40 bg-navy-950/35 sm:bg-transparent" />
          <div
            role="dialog"
            aria-label="내 정보 · 설정"
            data-portal-more-panel
            className="fixed inset-x-0 bottom-0 z-40 max-h-[88dvh] overflow-y-auto rounded-t-[20px] bg-white shadow-2xl sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[23rem] sm:rounded-[18px] sm:ring-1 sm:ring-navy-100"
            style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
          >
            <div aria-hidden="true" className="mx-auto mt-2.5 h-1.5 w-12 rounded-full bg-navy-200 sm:hidden" />
            <div className="border-b border-navy-100 px-5 pb-4 pt-4">
              <p className="p-body font-extrabold">{clientName || '우리 병원'}</p>
              {profileName && (
                <p data-portal-who className="p-sub mt-0.5">
                  {profileName} 님 · 비원미래 고객 포털
                </p>
              )}
            </div>

            {/*  전화는 맨 위 — 급할 때 찾는 것입니다 */}
            <a href={`tel:${CLIENT_TEL}`} data-portal-call className={ROW}>
              <Headset size={21} strokeWidth={2.3} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block">전화 상담</span>
                <span className="p-sub block font-medium">{COMPANY_HOURS}</span>
              </span>
              <span className="shrink-0 font-extrabold tabular-nums text-teal-700">{CLIENT_TEL}</span>
            </a>

            <div className="border-t border-navy-100">
              <div onClickCapture={closeAfter}>
                <TourButton tourId="client" className={ROW}>
                  <span className="min-w-0 flex-1">사용 방법 보기</span>
                </TourButton>
              </div>
              <FontSizeButton showLabel className={ROW} />
              <ThemeButton showLabel className={ROW} />
              {!inFrame && (
                <>
                  <div onClickCapture={closeAfter} className="lg:hidden">
                    <PortalPcViewButton row />
                  </div>
                  <button
                    type="button"
                    data-portal-phone-view
                    onClick={() => {
                      openPortalPhoneView()
                      closeAfter()
                    }}
                    className={`${ROW} hidden lg:flex`}
                  >
                    <Smartphone size={21} strokeWidth={2.3} aria-hidden="true" />
                    <span className="min-w-0 flex-1">모바일 화면으로 보기</span>
                  </button>
                </>
              )}
            </div>

            <div className="border-t border-navy-100">
              {/*  ⚠ 0073 — 단추에는 **하는 일**을 적습니다(이름이 아니라). */}
              <button type="button" aria-label="로그아웃" title="로그아웃" onClick={onLogout} className={ROW}>
                <LogOut size={21} strokeWidth={2.3} aria-hidden="true" />
                <span className="min-w-0 flex-1">로그아웃</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
