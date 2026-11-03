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

/** 이 기기에 기억하는 작은 값 하나 — 읽기 · 바꾸기 · 바뀌면 알리기 */
function memo<T extends string>(key: string, ok: (v: string) => boolean, fallback: T) {
  let current: T | null = null
  const subs = new Set<() => void>()
  return {
    get: (): T => {
      if (current === null) {
        try {
          const v = localStorage.getItem(key)
          current = v !== null && ok(v) ? (v as T) : fallback
        } catch {
          current = fallback
        }
      }
      return current
    },
    set: (v: T) => {
      if (v === current) return
      current = v
      try {
        localStorage.setItem(key, v)
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
}

export const deviceViewStore = memo<DeviceView>(DEVICE_VIEW_KEY, (v) => DEVICE_VIEWS.includes(v as DeviceView), 'pc')

/**
 * 폰 틀에 무엇을 띄울까 (PC+모바일 2차 — 참고 화면의 「같은 화면 · 직원 앱 · 고객 화면」)
 *
 *  same    PC 와 같은 화면 — 서로 따라갑니다
 *  portal  내부 화면을 보면서 폰에는 **병원이 보는 화면** (거래처 상세를 보고 있으면 그 병원)
 *  staff   병원 화면을 보면서 폰에는 **직원 앱**(내 첫 화면)
 *  portal · staff 는 따라가지 않습니다 — 서로 다른 화면을 나란히 두고 시연하는 용도입니다.
 */
export type PhoneSource = 'same' | 'portal' | 'staff'
export const phoneSourceStore = memo<PhoneSource>('beonemirae-ops:device-phone', (v) => ['same', 'portal', 'staff'].includes(v), 'same')
/** 폰의 병원 화면에 띄울 병원 — 마지막으로 본 병원(거래처 상세 · 병원 화면) */
export const phoneClientStore = memo<string>('beonemirae-ops:device-client', (v) => /^[\w-]{1,80}$/.test(v), '')

/**
 * 자료가 바뀌었다고 다른 화면(폰 틀 ↔ PC)에 알리기.
 *
 *  틀 안 앱은 서버 자료를 따로 읽습니다. 병원 폰에서 수거 요청을 보내면 PC 요청함은 45초 배경 갱신까지
 *  모르던 것을, 저장이 끝나는 순간 서로 새로 읽게 합니다. 같은 브라우저 · 같은 출처끼리만 닿습니다.
 *  ⚠ 폰 틀이 있을 때(틀 안이거나 「PC」가 아닌 보기)만 보내고 받습니다 — 평소 여러 탭을 열어 둔 분의
 *    탭마다 저장할 때마다 전체를 다시 읽는 일은 없습니다.
 */
export const DATA_CHANNEL = 'beonemirae-ops:data'
export const pairedView = () => inPhoneFrame() || deviceViewStore.get() !== 'pc'
export function announceDataChanged() {
  if (typeof BroadcastChannel === 'undefined' || !pairedView()) return
  try {
    const ch = new BroadcastChannel(DATA_CHANNEL)
    ch.postMessage({ type: 'changed', at: Date.now() })
    ch.close()
  } catch {
    /* 못 알려도 45초 배경 갱신이 맞춥니다 */
  }
}

/** 주소에서 병원 id — /portal/c/<id>… · /clients/<id> */
export function clientIdOf(pathname: string): string | null {
  const m = pathname.match(/^\/portal\/c\/([^/?#]+)/) ?? pathname.match(/^\/clients\/([^/?#]+)/)
  return m ? decodeURIComponent(m[1]) : null
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
