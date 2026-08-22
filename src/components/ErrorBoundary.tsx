import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, Home, RotateCcw } from 'lucide-react'
import { recordAppError } from '../lib/repo'

// ─────────────────────────────────────────────────────────────────────────────
// 화면이 터져도 앱은 남아 있게
//
//  실측입니다. 목록 화면 하나가 오류를 던지자 본문은 물론 **왼쪽 메뉴까지
//  사라져** 글자 수 0인 흰 화면이 남았습니다. 쓰던 사람은 무엇이 잘못됐는지도,
//  어디로 가야 하는지도 알 수 없습니다. 폰에서는 앱이 죽은 것처럼 보입니다.
//
//  React 는 그리다 난 오류를 위로 던지고, 아무도 안 받으면 **트리 전체를
//  버립니다.** 그래서 받는 자리를 둡니다.
//
//   · 바깥 한 겹 — 껍데기(메뉴·머리말)까지 터진 경우
//   · 안쪽 한 겹 — 본문만 터진 경우. 이때 메뉴는 살아 있어 다른 화면으로
//     그냥 넘어갈 수 있습니다
//
//  그리고 **남깁니다**. 안 남기면 「어제 하얗게 됐었다」는 말만 남고 원인을
//  찾을 자료가 없습니다.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  children: ReactNode
  /** 'page' = 본문만 (메뉴는 살아 있음) · 'app' = 앱 전체 */
  scope?: 'page' | 'app'
}
interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    //  기록이 실패해도 화면은 그대로 떠 있어야 합니다 — 기록 때문에
    //  사용자가 보던 오류가 가려지면 안 됩니다.
    void recordAppError({
      kind: 'render',
      screen: typeof window === 'undefined' ? '' : window.location.pathname,
      action: this.props.scope === 'app' ? '앱 전체' : '화면 그리기',
      message: error?.message ?? String(error),
      detail: {
        //  스택은 앞부분만 — 원인을 찾는 데 필요한 것은 어디서 터졌는지입니다.
        stack: (error?.stack ?? '').split('\n').slice(0, 6).join('\n'),
        component: (info?.componentStack ?? '').split('\n').slice(0, 6).join('\n'),
      },
    })
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    const whole = this.props.scope === 'app'
    return (
      <div data-error-boundary={whole ? 'app' : 'page'} className={whole ? 'p-6' : ''}>
        <div className="card mx-auto max-w-2xl border-rose-200 bg-rose-50 p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle size={22} className="mt-0.5 shrink-0 text-rose-500" strokeWidth={2.6} />
            <div className="min-w-0 flex-1">
              <p className="t-body font-extrabold text-navy-900">이 화면을 여는 중에 문제가 생겼습니다</p>
              <p className="t-caption mt-1.5 break-keep">
                저장하신 자료는 그대로 있습니다. 이 화면만 못 그린 것이라 다른 화면은 정상입니다. 관리자에게 이
                기록이 자동으로 남았으니, 급하시면 아래 문구를 그대로 알려 주세요.
              </p>
              <p data-error-message className="t-caption mt-2.5 break-all rounded-xl bg-white px-3 py-2 text-navy-600">
                {error.message || '알 수 없는 오류'}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  data-error-retry
                  className="btn-primary"
                  onClick={() => this.setState({ error: null })}
                >
                  <RotateCcw size={16} strokeWidth={2.4} /> 다시 열기
                </button>
                {/*
                  라우터를 못 믿는 자리입니다 — 껍데기가 터졌으면 링크도 안 됩니다.
                  주소를 직접 바꿔 처음부터 다시 켭니다.
                */}
                <button
                  data-error-home
                  className="btn-ghost"
                  onClick={() => { window.location.href = '/' }}
                >
                  <Home size={16} strokeWidth={2.4} /> 홈으로
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }
}
