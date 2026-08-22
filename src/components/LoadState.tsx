import type { ReactNode } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { useData } from '../context/DataContext'

// ─────────────────────────────────────────────────────────────────────────────
// 「아직 안 읽었다」와 「정말로 없다」를 구분합니다
//
//  실사용 검증에서 병원 담당자 계정으로 로그인한 직후 몇 초 동안
//
//     「연결된 병원 정보를 찾을 수 없습니다 —
//       비원미래 담당자에게 계정 연결을 요청해 주세요. (1533-8876)」
//
//  가 떴습니다. 실제로는 연결돼 있었고, 자료가 도착하자 정상 화면이 됐습니다.
//  하지만 파일럿 첫날 병원 담당자가 이 문장을 보면 화면을 더 기다리지 않고
//  전화를 겁니다. 「없다」는 확인된 뒤에만 할 수 있는 말입니다.
//
//  세 가지 상태를 나눕니다.
//
//    loading  첫 읽기 전       → 「불러오는 중입니다」
//    failed   첫 읽기가 실패    → 「자료를 불러오지 못했습니다」 + 위의 다시 시도
//    ready    읽기가 끝났다     → 그때만 「없습니다」
//
//  화면을 깜빡이지 않도록, 배경 갱신(refreshQuiet)은 여기에 영향을 주지
//  않습니다 — 이미 보여 주고 있는 자료는 그대로 둡니다.
// ─────────────────────────────────────────────────────────────────────────────

export type LoadState = 'loading' | 'failed' | 'ready'

/**
 * 지금 화면이 「없습니다」라고 말해도 되는 상태인지 알려줍니다.
 * `ready` 일 때만 빈 상태 문구를 보여 주세요.
 */
export function useLoadState(): LoadState {
  const { sync } = useData()
  if (!sync.ready) return sync.error ? 'failed' : 'loading'
  //  첫 읽기가 실패로 끝난 경우에도 자료는 비어 있습니다.
  //  이때 「없습니다」라고 하면 사실과 다릅니다.
  if (sync.error) return 'failed'
  return 'ready'
}

/** 아직 자료가 오지 않았습니다 — 빈 상태 대신 이걸 보여 줍니다. */
export function LoadingState({
  title = '불러오는 중입니다',
  subtitle = '잠시만 기다려 주세요.',
}: {
  title?: string
  subtitle?: string
}) {
  return (
    <div
      data-load-state="loading"
      className="card flex flex-col items-center justify-center px-6 py-12 text-center"
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-navy-50 text-navy-300">
        <Loader2 size={26} strokeWidth={2.2} className="animate-spin" />
      </span>
      <p className="t-card mt-3.5 break-keep text-navy-700">{title}</p>
      <p className="t-body mt-1.5 max-w-md break-keep text-navy-400">{subtitle}</p>
    </div>
  )
}

/** 첫 읽기가 실패했습니다 — 위쪽 빨간 띠의 「다시 시도」로 안내합니다. */
export function LoadFailedState({
  subtitle = '화면 위의 「다시 시도」를 눌러 주세요. 계속 안 되면 잠시 후 다시 열어 주세요.',
}: {
  subtitle?: string
}) {
  return (
    <div
      data-load-state="failed"
      className="card flex flex-col items-center justify-center px-6 py-12 text-center"
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
        <AlertTriangle size={26} strokeWidth={2.2} />
      </span>
      <p className="t-card mt-3.5 break-keep text-navy-700">자료를 불러오지 못했습니다</p>
      <p className="t-body mt-1.5 max-w-md break-keep text-navy-400">{subtitle}</p>
    </div>
  )
}

/**
 * 「불러오는 중 / 실패 / 없음」을 한 줄로 처리합니다.
 * 준비가 끝났을 때만 `empty` (진짜 빈 상태) 를 보여 줍니다.
 */
export function LoadGate({
  empty,
  loadingTitle,
  loadingSubtitle,
  failedSubtitle,
}: {
  empty: ReactNode
  loadingTitle?: string
  loadingSubtitle?: string
  failedSubtitle?: string
}) {
  const state = useLoadState()
  if (state === 'loading') return <LoadingState title={loadingTitle} subtitle={loadingSubtitle} />
  if (state === 'failed') return <LoadFailedState subtitle={failedSubtitle} />
  return <>{empty}</>
}
