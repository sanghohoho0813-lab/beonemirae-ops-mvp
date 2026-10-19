import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

// ─────────────────────────────────────────────────────────────────────────────
// 폰 파란 띠 — 화면 제목 자리 (AX 5차)
//
//  대표님: 「레퍼런스 영상(배민 · talabat) 바탕으로 예쁘게」 → 5차 시안 승인.
//  폰 머리띠를 브랜드 색 띠 하나로 두고, **그 화면의 제목(· 검색창)** 을 띠 안에
//  올립니다. 바로 아래 첫 카드가 띠 끝에 살짝 겹쳐 올라옵니다.
//
//   · 띠는 Layout(MobileHeader)이 그리고, 제목 자리(slot)만 여기로 열어 둡니다.
//   · 화면 쪽에서 <PhoneBand> 로 감싸면 그 자리로 옮겨 그립니다(portal).
//   · PC 에서는 아무것도 그리지 않습니다 — 화면이 자기 제목을 그대로 그립니다.
//     ⚠ 같은 제목이 DOM 에 두 번 있으면(하나는 숨김) 검사 · 화면 읽기 프로그램이
//       둘 다 잡습니다. 그래서 CSS 로 숨기지 않고 **폭을 보고 하나만** 그립니다.
// ─────────────────────────────────────────────────────────────────────────────

const SlotCtx = createContext<HTMLElement | null>(null)
export const PhoneBandSlot = SlotCtx.Provider

//  Tailwind lg(1024px) 와 같은 경계 — 「lg 미만 = 폰 화면」
const PC_QUERY = '(min-width: 1024px)'

export function useIsPhone(): boolean {
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && !window.matchMedia(PC_QUERY).matches)
  useEffect(() => {
    const mq = window.matchMedia(PC_QUERY)
    const on = () => setPhone(!mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return phone
}

/**
 * 폰에서만, 파란 띠 안에 그립니다.
 *  overlap — 바로 아래 첫 카드가 띠 끝에 겹쳐 올라오게 띠 아래를 비워 둡니다
 *            (그 카드에는 `BAND_OVERLAP` 을 답니다).
 */
export function PhoneBand({ children, overlap = false }: { children: ReactNode; overlap?: boolean }) {
  const slot = useContext(SlotCtx)
  const phone = useIsPhone()
  if (!slot || !phone) return null
  return createPortal(
    <div data-phone-band-title className={overlap ? 'pb-[2.3rem]' : 'pb-1'}>
      {children}
    </div>,
    slot,
  )
}

/** 띠에 겹쳐 올라오는 첫 카드 — 본문 위 여백(1rem) + 띠 아래 빈자리(2.3rem) 중 1.9rem 만큼 */
export const BAND_OVERLAP = 'max-lg:relative max-lg:-mt-[3.3rem]'

/** 띠 안 제목 · 부제 */
export function BandTitle({ title, sub, right }: { title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mt-3 flex items-end gap-2">
      <div className="min-w-0 flex-1">
        <h1 className="break-keep text-[1.35rem] font-extrabold leading-tight tracking-tight text-white">{title}</h1>
        {sub && <p className="mt-0.5 break-keep text-[0.86rem] font-medium text-white">{sub}</p>}
      </div>
      {right}
    </div>
  )
}
