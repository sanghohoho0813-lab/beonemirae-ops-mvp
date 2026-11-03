import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Columns2, Monitor, RotateCw, Smartphone, type LucideIcon } from 'lucide-react'
import {
  FRAME_ROUTE_MSG, clientIdOf, deviceViewStore, framePath, inPhoneFrame, phoneClientStore, phoneSourceStore, plainPath, type DeviceView, type PhoneSource,
} from '../lib/deviceView'
import { portalPath } from '../lib/portalClient'

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

/** 화면 폭 조건(media query)이 지금 맞는가 — 창 크기를 바꾸면 따라 바뀝니다 */
export function useMedia(q: string): boolean {
  const [hit, setHit] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches)
  useEffect(() => {
    const m = window.matchMedia(q)
    const on = () => setHit(m.matches)
    on()
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [q])
  return hit
}
const useWideScreen = () => useMedia('(min-width: 1024px)')

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
 *   rail   PC+모바일에서 접힌 왼쪽 메뉴(아이콘 줄) — 세로로 그림만.
 */
export function DeviceViewToggle({ variant = 'plain', onBrand = false, className = '' }: { variant?: 'plain' | 'bar' | 'side' | 'rail'; onBrand?: boolean; className?: string }) {
  const v = useDeviceView()
  if (inPhoneFrame()) return null
  const bar = variant === 'bar'
  const side = variant === 'side' || variant === 'rail'
  const rail = variant === 'rail'
  const iconOnly = (bar && v === 'both') || rail
  const labelCls = bar || rail ? (iconOnly ? 'sr-only' : 'max-[1719px]:sr-only') : ''
  const iconCls = rail ? '' : side ? 'hidden' : bar && !iconOnly ? 'min-[1720px]:hidden' : ''
  const shell = rail
    ? 'flex flex-col bg-white/5'
    : side
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
            className={`flex min-h-[32px] items-center justify-center gap-1.5 whitespace-nowrap rounded-[8px] px-2.5 text-[0.899rem] font-bold transition ${rail ? 'h-9 w-11' : side ? 'flex-1 px-1.5 text-[0.843rem]' : ''} ${tone}`}
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

/**
 * 모바일 · PC+모바일일 때의 폰 틀. 「PC」면 아무것도 그리지 않습니다.
 *
 *  alt — 폰에 「같은 화면」 대신 띄울 수 있는 다른 쪽 화면 (PC+모바일 2차)
 *   portal  내부 화면 → 폰에 병원이 보는 화면. 거래처 상세를 보고 있으면 그 병원, 아니면 마지막으로 본 병원
 *           (없으면 병원 고르는 화면). 병원 화면을 열 수 있는 계정에게만 줍니다.
 *   staff   병원 화면(직원이 미리보기 중) → 폰에 직원 앱 첫 화면.
 *  다른 쪽 화면은 PC 를 따라가지 않습니다. 대신 한쪽에서 저장하면 다른 쪽이 곧바로 새로 읽습니다
 *  (DataContext · deviceView.announceDataChanged) — 병원 폰에서 보낸 요청이 PC 요청함에 바로 뜹니다.
 */
export function DeviceViewPanels({ view, label, alt, staffHome = '/' }: { view: DeviceView; label: string; alt?: 'portal' | 'staff'; staffHome?: string }) {
  const { pathname, search } = useLocation()
  const path = plainPath(pathname, search)
  const stored = useSyncExternalStore(phoneSourceStore.subscribe, phoneSourceStore.get, () => 'same' as PhoneSource)
  const source: PhoneSource = alt && stored === alt ? alt : 'same'
  const lastClient = useSyncExternalStore(phoneClientStore.subscribe, phoneClientStore.get, () => '')
  //  마지막으로 본 병원을 기억합니다 (거래처 상세 · 병원 화면)
  useEffect(() => {
    const id = clientIdOf(pathname)
    if (id) phoneClientStore.set(id)
  }, [pathname])
  const target = source === 'same' ? path : source === 'portal' ? portalPath(clientIdOf(pathname) ?? (lastClient || null)) : staffHome
  //  폰이 지금 보고 있는 주소 (틀 안 앱이 알려 줌)
  const [phonePath, setPhonePath] = useState(target)
  const [reloads, setReloads] = useState(0)

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

  const phone = (height: string) => (
    <PhoneFrame key={`${source}:${reloads}`} path={target} follow={source === 'same'} onRoute={setPhonePath} label={label} height={height} />
  )
  const controls = (
    <>
      {alt && <SourceSwitch alt={alt} value={source} />}
      <button
        type="button"
        data-device-reload
        title="폰 화면 새로 고침"
        aria-label="폰 화면 새로 고침"
        onClick={() => setReloads((n) => n + 1)}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-white text-navy-600 ring-1 ring-navy-200 transition hover:bg-navy-50"
      >
        <RotateCw size={16} strokeWidth={2.4} aria-hidden="true" />
      </button>
    </>
  )
  const note =
    source === 'same'
      ? '같은 화면을 따라갑니다 — PC 에서 옮기면 폰도, 폰에서 누르면 PC 도 옮겨 갑니다'
      : source === 'portal'
        ? '병원 담당자 휴대전화 화면 — PC 와 따로 움직이고, 한쪽에서 저장하면 다른 쪽도 바로 새로 읽습니다'
        : '직원 휴대전화 화면 — 병원 화면과 따로 움직이고, 한쪽에서 저장하면 다른 쪽도 바로 새로 읽습니다'

  if (view === 'both')
    return (
      <aside
        data-device-side
        data-phone-source={source}
        aria-label={`${label} — 모바일 화면`}
        className="fixed inset-y-0 right-0 z-[35] flex w-[440px] flex-col border-l border-navy-200 bg-[#e8ecf2]"
      >
        <div className="flex items-center gap-2 px-4 pb-1 pt-3 text-[0.86rem] font-bold text-navy-500">
          <Smartphone size={15} strokeWidth={2.4} aria-hidden="true" />
          <span className="shrink-0">모바일 390</span>
          <span data-device-path className="min-w-0 flex-1 truncate font-mono text-[0.8rem] text-navy-400">{source === 'same' ? pathname : phonePath.split('?')[0]}</span>
        </div>
        <div className="flex items-center justify-end gap-1.5 px-4 pb-1">{controls}</div>
        <div className="flex min-h-0 flex-1 items-center justify-center px-3 py-1">{phone('min(860px, calc(100dvh - 136px))')}</div>
        <p className="break-keep px-4 pb-3 text-center text-[0.82rem] font-semibold leading-snug text-navy-500">{note}</p>
      </aside>
    )

  return (
    <div
      data-device-mobile
      data-phone-source={source}
      role="dialog"
      aria-modal="true"
      aria-label={`${label} — 모바일 화면`}
      className="fixed inset-0 z-[45] flex flex-col bg-gradient-to-br from-navy-100 via-[#eef2f8] to-teal-50"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3">
        <Smartphone size={20} strokeWidth={2.4} className="shrink-0 text-navy-600" aria-hidden="true" />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="break-keep text-[1.05rem] font-extrabold text-navy-900">{source === 'portal' ? '병원이 보는 화면' : source === 'staff' ? '직원 앱' : label} · 모바일 화면</p>
          <p className="break-keep text-[0.9rem] font-semibold text-navy-500">
            휴대전화(폭 390)에서 이렇게 보입니다. 안에서 그대로 눌러 보실 수 있고, PC 로 돌아가면 그 화면이 이어집니다.
          </p>
        </div>
        <div className="flex items-center gap-1.5">{controls}</div>
        <DeviceViewToggle />
      </div>
      <div className="flex min-h-0 flex-1 items-start justify-center px-4 pb-5">{phone('min(880px, calc(100dvh - 96px))')}</div>
    </div>
  )
}

/** 폰에 띄울 화면 — 같은 화면 · 병원 화면(또는 직원 화면) */
function SourceSwitch({ alt, value }: { alt: 'portal' | 'staff'; value: PhoneSource }) {
  const opts: [PhoneSource, string][] = [
    ['same', '같은 화면'],
    [alt, alt === 'portal' ? '병원 화면' : '직원 화면'],
  ]
  return (
    <div role="group" aria-label="폰에 띄울 화면" data-phone-source-toggle className="flex shrink-0 items-center gap-0.5 rounded-[11px] bg-white p-1 ring-1 ring-navy-200">
      {opts.map(([k, lb]) => (
        <button
          key={k}
          type="button"
          data-phone-source-pick={k}
          aria-pressed={value === k}
          onClick={() => phoneSourceStore.set(k)}
          className={`min-h-[30px] whitespace-nowrap rounded-[8px] px-2.5 text-[0.86rem] font-bold transition ${value === k ? 'bg-navy-900 text-white' : 'text-navy-600 hover:bg-navy-50'}`}
        >
          {lb}
        </button>
      ))}
    </div>
  )
}

function PhoneFrame({ path, follow, onRoute, label, height }: { path: string; follow: boolean; onRoute: (p: string) => void; label: string; height: string }) {
  const ref = useRef<HTMLIFrameElement>(null)
  const navigate = useNavigate()
  //  처음 주소로 한 번만 읽습니다 — 그다음부터는 틀을 새로 읽지 않고 옮겨 갑니다
  const [src] = useState(() => framePath(path))
  const latest = useRef(path)
  latest.current = path
  const followRef = useRef(follow)
  followRef.current = follow
  const routeRef = useRef(onRoute)
  routeRef.current = onRoute

  //  PC → 폰 (같은 화면이면 PC 주소, 다른 쪽 화면이면 그 첫 화면 · 병원이 바뀔 때만)
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

  //  폰 → PC (같은 화면일 때만 따라감)
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== ref.current?.contentWindow) return
      const d = e.data as { type?: string; path?: unknown } | null
      if (!d || d.type !== FRAME_ROUTE_MSG || typeof d.path !== 'string' || !d.path.startsWith('/')) return
      routeRef.current(d.path)
      if (followRef.current && d.path !== latest.current) navigate(d.path, { replace: true })
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
