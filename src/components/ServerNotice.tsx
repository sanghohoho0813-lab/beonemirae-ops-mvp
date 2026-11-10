import { useSyncExternalStore, type ReactNode } from 'react'
import { CloudOff, PauseCircle, RotateCw, ServerCrash } from 'lucide-react'
import { serverStateStore, type ServerState } from '../lib/supabase'
import { COMPANY_TEL } from '../lib/brand'

// ─────────────────────────────────────────────────────────────────────────────
// 서버가 멈췄을 때의 안내 — 일시정지(540) · 응답 없음(502~504) · 통신 끊김
//
//  Supabase 무료 프로젝트는 1주일 동안 사용이 없으면 일시정지됩니다. 그때 계정도 자료도 그대로인데,
//  예전 화면은 「계정 정보를 찾지 못했습니다 — 계정을 다시 만들어야 합니다」라고 말했습니다.
//  틀린 안내는 없는 안내보다 나쁩니다 — 무슨 일이고, 누가 무엇을 하면 풀리는지 그대로 적습니다.
//
//   · 직원(대표 · 담당자) — Supabase 대시보드에서 「Restore project」
//   · 병원 담당자 — 비원미래로 전화 (서버 이름은 몰라도 됩니다)
//  서버가 다시 답하기 시작하면(정상 응답 하나) 저절로 사라집니다.
// ─────────────────────────────────────────────────────────────────────────────

export function useServerState(): ServerState {
  return useSyncExternalStore(serverStateStore.subscribe, serverStateStore.get, () => 'ok' as ServerState)
}

/** 로그인은 돼 있는데 화면을 못 여는 경우의 안내 (가운데 카드 안) */
export function ServerStuckBody({ state, offlineHint }: { state: ServerState; offlineHint: ReactNode }) {
  if (state === 'paused')
    return (
      <div data-server-notice="paused" className="space-y-3">
        <PauseCircle size={40} className="mx-auto text-amber-600" strokeWidth={1.9} />
        <p className="break-keep text-[1.32rem] font-extrabold text-navy-900">서버가 일시정지 상태입니다</p>
        <p className="break-keep text-[1.05rem] leading-relaxed text-navy-600">
          <b className="text-navy-900">로그아웃된 것도, 계정이 없어진 것도 아닙니다.</b> 서버가 1주일 동안 사용이 없어 자동으로
          멈췄습니다. <b className="text-navy-900">자료는 그대로 있습니다.</b>
        </p>
        <ol data-server-steps className="space-y-1 rounded-2xl bg-navy-50 px-4 py-3 text-left text-[1rem] font-semibold leading-relaxed text-navy-700">
          <li className="break-keep">① 관리자가 supabase.com 대시보드에 로그인</li>
          <li className="break-keep">② 이 프로젝트를 열고 「Restore project」 누르기</li>
          <li className="break-keep">③ 몇 분 뒤 아래 「다시 시도」</li>
        </ol>
        <p className="break-keep text-[0.98rem] text-navy-500">병원 담당자분은 비원미래({COMPANY_TEL})로 알려 주세요.</p>
      </div>
    )
  if (state === 'down')
    return (
      <div data-server-notice="down" className="space-y-3">
        <ServerCrash size={40} className="mx-auto text-navy-400" strokeWidth={1.9} />
        <p className="break-keep text-[1.32rem] font-extrabold text-navy-900">서버가 잠시 응답하지 않습니다</p>
        <p className="break-keep text-[1.05rem] leading-relaxed text-navy-600">
          <b className="text-navy-900">로그아웃된 것도, 계정 문제도 아닙니다.</b> 서버가 다시 켜지는 중이거나 잠시 바쁩니다.
          1~2분 뒤 아래를 눌러 주세요.
        </p>
      </div>
    )
  return (
    <div data-server-notice="offline" className="space-y-3">
      <CloudOff size={40} className="mx-auto text-navy-400" strokeWidth={1.9} />
      <p className="break-keep text-[1.32rem] font-extrabold text-navy-900">지금 통신이 안 됩니다</p>
      <p className="break-keep text-[1.05rem] leading-relaxed text-navy-600">{offlineHint}</p>
    </div>
  )
}

/** 앱을 쓰는 중에 서버가 멈춘 경우 — 화면 위 띠. `portal` 이면 병원 담당자용 문구 */
export function ServerBar({ portal = false, onRetry }: { portal?: boolean; onRetry?: () => void }) {
  const state = useServerState()
  if (state === 'ok') return null
  const paused = state === 'paused'
  return (
    <div
      data-server-bar={state}
      role="alert"
      className={`sticky top-0 z-40 flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 text-white sm:px-6 ${paused ? 'bg-amber-700' : 'bg-navy-800'}`}
    >
      {paused ? <PauseCircle size={19} className="shrink-0" strokeWidth={2.6} /> : <ServerCrash size={19} className="shrink-0" strokeWidth={2.6} />}
      <p className="t-body min-w-0 flex-1 break-keep font-bold">
        {paused
          ? portal
            ? `서비스가 잠시 멈춰 있습니다 — 지금은 요청이 접수되지 않습니다. 비원미래(${COMPANY_TEL})로 알려 주세요.`
            : '서버가 일시정지 상태입니다 — 지금은 저장되지 않습니다(자료는 그대로). 관리자가 Supabase 대시보드에서 「Restore project」를 눌러야 합니다.'
          : '서버가 잠시 응답하지 않습니다 — 1~2분 뒤 다시 시도해 주세요. 입력한 내용은 지우지 마세요.'}
      </p>
      {onRetry && (
        <button data-server-retry onClick={onRetry} className="shrink-0 rounded-full bg-white/20 px-3.5 py-1.5 text-[1rem] font-extrabold transition hover:bg-white/30">
          <RotateCw size={14} className="mr-1 inline -translate-y-px" />
          다시 확인
        </button>
      )}
    </div>
  )
}
