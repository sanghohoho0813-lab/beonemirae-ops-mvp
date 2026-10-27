import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Columns2, Monitor, Smartphone, type LucideIcon } from 'lucide-react'
import { FRAME_ROUTE_MSG, deviceViewStore, framePath, inPhoneFrame, plainPath, type DeviceView } from '../lib/deviceView'

// ─────────────────────────────────────────────────────────────────────────────
// 화면 보기 — PC · 모바일 · PC+모바일 (lib/deviceView.ts)
//
//  내부(AX) 화면 Layout 과 병원(고객) 화면 PortalLayout 이 같은 것을 씁니다.
//
//  왜 틀(iframe)인가 — Tailwind 의 sm: · lg: 는 상자 폭이 아니라 **뷰포트 폭**으로
//  갈립니다. PC 에서 상자만 390px 로 줄여서는 모바일 배치가 안 나옵니다. 그래서
//  폭 390px 짜리 틀 안에 같은 앱을 한 번 더 띄웁니다(PortalViewSwitch · MobilePreview 와 같은 방법).
//  그림이 아니라 실제 화면이라 그대로 눌립니다.
//
//  같은 주소 따라가기
//   PC → 폰  틀 안 주소를 바꾸고(replaceState) popstate 를 보내 틀 안 라우터가 옮겨 가게 합니다.
//            틀을 새로 읽지 않으므로 빠르고, 틀 안 기록이 뒤로가기에 쌓이지 않습니다.
//   폰 → PC  틀 안 앱이 주소가 바뀔 때마다 postMessage 로 알리고(useFrameRouteReport),
//            바깥이 같은 주소로 옮깁니다(replace — 뒤로가기는 틀 안 기록이 맡음).
//   같은 주소면 아무것도 안 합니다 — 서로 끝없이 주고받지 않습니다.
// ─────────────────────────────────────────────────────────────────────────────

function useWideScreen(): boolean {
  const q = '(min-width: 1024px)'
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches)
  useEffect(() => {
    const m = window.matchMedia(q)
    const on = () => setWide(m.matches)
    on()
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return wide
}

/** 지금 보기 — 폰 · 틀 안에서는 언제나 'pc'(원래 화면) */
export function useDeviceView(): DeviceView {
  const v = useSyncExternalStore(deviceViewStore.subscribe, deviceViewStore.get, () => 'pc' as DeviceView)
  const wide = useWideScreen()
  return wide && !inPhoneFrame() ? v : 'pc'
}

const OPTS: [DeviceView, string, LucideIcon][] = [
  ['pc', 'PC', Monitor],
  ['mobile', '모바일', Smartphone],
  ['both', 'PC+모바일', Columns2],
]

/**
 * PC · 모바일 · PC+모바일 고르기 — 넓은 화면(lg)에서만 보입니다.
 *
 *  variant
 *   plain  병원 화면 머리 · 「모바일」 화면 위쪽 — 그림 + 이름
 *   bar    내부 화면 위쪽 도구 줄. 그 줄은 1920px 아래에서 남는 폭이 80~240px 뿐이라 그림 + 이름(282px)을
 *          넣으면 줄이 두 줄로 꺾여 모든 화면이 아래로 밀립니다(실측). 그래서 1366px 부터만 보이고,
 *          1720px 아래 · 「PC+모바일」(본문이 폰 자리만큼 좁아짐)에서는 그림만(이름은 풍선 · 화면 읽기용).
 *   side   내부 화면 왼쪽 메뉴 아래 — 화면 폭과 상관없이 언제나 있는 자리(1280px 화면도). 이름만, 칸을 꽉 채워.
 */
export function DeviceViewToggle({ variant = 'plain', onBrand = false, className = '' }: { variant?: 'plain' | 'bar' | 'side'; onBrand?: boolean; className?: string }) {
  const v = useDeviceView()
  if (inPhoneFrame()) return null
  const bar = variant === 'bar'
  const side = variant === 'side'
  const iconOnly = bar && v === 'both'
  const labelCls = bar ? (iconOnly ? 'sr-only' : 'max-[1719px]:sr-only') : ''
  const iconCls = side ? 'hidden' : bar && !iconOnly ? 'min-[1720px]:hidden' : ''
  const shell = side
    ? 'flex w-full bg-white/5'
    : onBrand
      ? 'hidden lg:flex bg-white/15 ring-1 ring-white/30'
      : `hidden ${bar ? 'min-[1366px]:flex' : 'lg:flex'} bg-white ring-1 ring-navy-100`
  return (
    <div role="group" aria-label="화면 보기" data-device-view-toggle={variant} className={`shrink-0 items-center gap-0.5 rounded-[11px] p-1 ${shell} ${className}`}>
      {OPTS.map(([k, label, Icon]) => {
        const on = v === k
        const tone = side
          ? on ? 'bg-teal-400 text-navy-900' : 'text-navy-200 hover:bg-white/10 hover:text-white'
          : on ? (onBrand ? 'bg-white text-navy-900' : 'bg-navy-900 text-white') : onBrand ? 'text-white/85 hover:bg-white/10' : 'text-navy-600 hover:bg-navy-50'
        return (
          <button
            key={k}
            type="button"
            data-device-view={k}
            aria-pressed={on}
            title={`${label} 화면으로 보기`}
            onClick={() => deviceViewStore.set(k)}
            className={`flex min-h-[32px] items-center justify-center gap-1.5 whitespace-nowrap rounded-[8px] px-2.5 text-[0.899rem] font-bold transition ${side ? 'flex-1 px-1.5 text-[0.843rem]' : ''} ${tone}`}
          >
            <Icon className={`h-[15px] w-[15px] ${iconCls}`} strokeWidth={2.4} aria-hidden="true" />
            <span className={labelCls}>{label}</span>
          </button>
        )
      })}
    </div>
  )
}

/** 틀 안 앱 — 주소가 바뀔 때마다 바깥(PC 화면)에 알립니다. 틀 밖에서는 아무것도 안 합니다 */
export function useFrameRouteReport() {
  const { pathname, search } = useLocation()
  useEffect(() => {
    if (!inPhoneFrame() || window.parent === window) return
    try {
      window.parent.postMessage({ type: FRAME_ROUTE_MSG, path: plainPath(pathname, search) }, window.location.origin)
    } catch {
      /* 바깥이 다른 곳이면 알리지 않습니다 */
    }
  }, [pathname, search])
}

/** 모바일 · PC+모바일일 때의 폰 틀. 「PC」면 아무것도 그리지 않습니다 */
export function DeviceViewPanels({ view, label }: { view: DeviceView; label: string }) {
  const { pathname, search } = useLocation()
  const path = plainPath(pathname, search)

  //  「모바일」은 PC 화면 위를 덮습니다 — 뒤 화면이 같이 굴러가지 않게
  useEffect(() => {
    if (view !== 'mobile') return
    const el = document.documentElement
    const prev = el.style.overflow
    el.style.overflow = 'hidden'
    return () => {
      el.style.overflow = prev
    }
  }, [view])

  if (view === 'pc') return null

  if (view === 'both')
    return (
      <aside
        data-device-side
        aria-label={`${label} — 모바일 화면`}
        className="fixed inset-y-0 right-0 z-[35] flex w-[440px] flex-col border-l border-navy-200 bg-[#e8ecf2]"
      >
        <div className="flex items-center gap-2 px-4 pb-1 pt-3 text-[0.86rem] font-bold text-navy-500">
          <Smartphone size={15} strokeWidth={2.4} aria-hidden="true" />
          <span className="shrink-0">모바일 390</span>
          <span data-device-path className="min-w-0 truncate font-mono text-[0.8rem] text-navy-400">{pathname}</span>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center px-3 py-2">
          <PhoneFrame path={path} label={label} height="min(860px, calc(100dvh - 92px))" />
        </div>
        <p className="break-keep px-4 pb-3 text-center text-[0.82rem] font-semibold leading-snug text-navy-500">
          같은 화면을 따라갑니다 — PC 에서 옮기면 폰도, 폰에서 누르면 PC 도 옮겨 갑니다
        </p>
      </aside>
    )

  return (
    <div
      data-device-mobile
      role="dialog"
      aria-modal="true"
      aria-label={`${label} — 모바일 화면`}
      className="fixed inset-0 z-[45] flex flex-col bg-gradient-to-br from-navy-100 via-[#eef2f8] to-teal-50"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3">
        <Smartphone size={20} strokeWidth={2.4} className="shrink-0 text-navy-600" aria-hidden="true" />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="break-keep text-[1.05rem] font-extrabold text-navy-900">{label} · 모바일 화면</p>
          <p className="break-keep text-[0.9rem] font-semibold text-navy-500">
            휴대전화(폭 390)에서 이렇게 보입니다. 안에서 그대로 눌러 보실 수 있고, PC 로 돌아가면 그 화면이 이어집니다.
          </p>
        </div>
        <DeviceViewToggle />
      </div>
      <div className="flex min-h-0 flex-1 items-start justify-center px-4 pb-5">
        <PhoneFrame path={path} label={label} height="min(880px, calc(100dvh - 96px))" />
      </div>
    </div>
  )
}

function PhoneFrame({ path, label, height }: { path: string; label: string; height: string }) {
  const ref = useRef<HTMLIFrameElement>(null)
  const navigate = useNavigate()
  //  처음 주소로 한 번만 읽습니다 — 그다음부터는 틀을 새로 읽지 않고 옮겨 갑니다
  const [src] = useState(() => framePath(path))
  const latest = useRef(path)
  latest.current = path

  //  PC → 폰
  const sync = useCallback(() => {
    const w = ref.current?.contentWindow
    if (!w) return
    try {
      if (plainPath(w.location.pathname, w.location.search) === latest.current) return
      w.history.replaceState(null, '', framePath(latest.current))
      w.dispatchEvent(new PopStateEvent('popstate'))
    } catch {
      /* 아직 다 열리지 않았습니다 — 다 열리면(onLoad) 다시 맞춥니다 */
    }
  }, [])
  useEffect(() => {
    sync()
  }, [path, sync])

  //  폰 → PC
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== ref.current?.contentWindow) return
      const d = e.data as { type?: string; path?: unknown } | null
      if (!d || d.type !== FRAME_ROUTE_MSG || typeof d.path !== 'string' || !d.path.startsWith('/')) return
      if (d.path !== latest.current) navigate(d.path, { replace: true })
    }
    window.addEventListener('message', on)
    return () => window.removeEventListener('message', on)
  }, [navigate])

  return (
    <div
      data-device-phone
      className="relative flex w-[410px] shrink-0 rounded-[50px] bg-[#0f1115] p-[10px] shadow-[0_24px_60px_-20px_rgba(15,23,42,0.55)] ring-1 ring-black/40"
      style={{ height }}
    >
      <div aria-hidden="true" className="absolute left-1/2 top-[10px] z-10 h-[22px] w-[120px] -translate-x-1/2 rounded-b-[14px] bg-[#0f1115]" />
      <iframe
        ref={ref}
        data-device-iframe
        title={`${label} — 모바일 화면`}
        src={src}
        onLoad={sync}
        className="h-full w-[390px] rounded-[40px] border-0 bg-app"
      />
    </div>
  )
}
