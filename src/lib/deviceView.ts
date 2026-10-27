// ─────────────────────────────────────────────────────────────────────────────
// 화면 보기 — PC · 모바일 · PC+모바일 (대표님: 「AX 화면도 고객용 화면도 셋 다 가능하게」)
//
//  PC         그대로.
//  모바일      PC 화면 위에 폰 틀 하나만 크게 — 휴대전화에서 어떻게 보이는지.
//  PC+모바일   PC 화면 오른쪽에 폰 틀을 붙여 두고 **같은 주소를 따라갑니다.**
//             PC 에서 화면을 옮기면 폰도, 폰에서 누르면 PC 도 같은 화면으로 갑니다.
//
//  ⚠ 넓은 화면(lg, 1024px 이상)에서만 켜집니다. 폰에서는 언제나 「PC」(= 원래 화면)입니다.
//  ⚠ 폰 틀(iframe) **안에서는** 언제나 「PC」입니다 — 틀 안에서 또 틀을 열면 끝이 없습니다.
//  ⚠ 이 기기에만 기억합니다(localStorage). 단추는 세 모드 어디서나 보이므로 갇히지 않습니다.
//  ⚠ 자료 · 권한은 그대로입니다. 틀 안은 같은 앱 · 같은 로그인으로 실제 화면을 그립니다.
// ─────────────────────────────────────────────────────────────────────────────

export type DeviceView = 'pc' | 'mobile' | 'both'
export const DEVICE_VIEWS: DeviceView[] = ['pc', 'mobile', 'both']
export const DEVICE_VIEW_KEY = 'beonemirae-ops:device-view'
/** 틀 안 앱이 「지금 이 주소」를 바깥에 알릴 때 쓰는 이름 */
export const FRAME_ROUTE_MSG = 'beonemirae:frame-route'

function load(): DeviceView {
  try {
    const v = localStorage.getItem(DEVICE_VIEW_KEY)
    return DEVICE_VIEWS.includes(v as DeviceView) ? (v as DeviceView) : 'pc'
  } catch {
    return 'pc'
  }
}

let current: DeviceView | null = null
const subs = new Set<() => void>()
export const deviceViewStore = {
  get: (): DeviceView => (current ??= load()),
  set: (v: DeviceView) => {
    current = v
    try {
      localStorage.setItem(DEVICE_VIEW_KEY, v)
    } catch {
      /* 기억 못 해도 지금 화면은 바뀝니다 */
    }
    subs.forEach((f) => f())
  },
  subscribe: (f: () => void) => {
    subs.add(f)
    return () => {
      subs.delete(f)
    }
  },
}

/** 이 화면이 다른 화면의 폰 틀(iframe) 안인가 — 틀 안에서 메뉴를 눌러 `frame=1` 이 떨어져도 틀 안입니다 */
export function inPhoneFrame(): boolean {
  if (typeof window === 'undefined') return false
  try {
    if (window.self !== window.top) return true
  } catch {
    return true
  }
  return new URLSearchParams(window.location.search).get('frame') === '1'
}

/** 「틀 안」 표시를 뺀 주소 — PC 와 폰이 같은 화면인지 견줄 때 */
export function plainPath(pathname: string, search: string): string {
  const p = new URLSearchParams(search)
  p.delete('frame')
  const s = p.toString()
  return pathname + (s ? `?${s}` : '')
}

/** 폰 틀에 띄울 주소 — 같은 주소 + `frame=1` */
export function framePath(path: string): string {
  const u = new URL(path, 'http://frame.local')
  u.searchParams.set('frame', '1')
  return u.pathname + u.search
}
