import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Smartphone } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// 모바일 미리보기 (시연 전용) — 데스크톱에서 앱을 폰 프레임 안에 띄워 보여줌
//  실제 앱(/)을 iframe 으로 로드하므로 프레임 폭(≈390px)에서 모바일 레이아웃이 적용됨.
//  ※ 이 화면은 Layout 바깥의 독립 라우트로, 기본 웹 화면에는 폰 프레임이 적용되지 않음.
// ─────────────────────────────────────────────────────────────────────────────

export function MobilePreview() {
  const navigate = useNavigate()

  return (
    <div className="flex min-h-[100dvh] flex-col bg-gradient-to-br from-navy-100 via-[#eef2f8] to-teal-50">
      {/* 상단 바 */}
      <div className="flex items-center gap-3 px-5 py-4">
        <button
          onClick={() => navigate('/')}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-navy-600 shadow-card transition active:scale-95"
          aria-label="대시보드로"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex items-center gap-2">
          <Smartphone size={18} className="text-navy-500" />
          <div className="leading-tight">
            <p className="text-sm font-extrabold text-navy-900">모바일 미리보기</p>
            <p className="text-[11px] font-medium text-navy-400">대표자·심사관 시연용 · ㈜비원미래</p>
          </div>
        </div>
        <a
          href="/"
          className="ml-auto hidden rounded-full bg-white px-4 py-2 text-sm font-bold text-navy-600 shadow-card transition hover:bg-navy-50 sm:inline-block"
        >
          웹 화면으로 보기
        </a>
      </div>

      {/* 폰 프레임 */}
      <div className="flex flex-1 items-center justify-center px-4 pb-8">
        <div className="relative h-[780px] max-h-[86vh] w-[380px] max-w-full overflow-hidden rounded-[44px] bg-black p-2.5 shadow-2xl ring-1 ring-navy-900/10">
          <div className="absolute left-1/2 top-2.5 z-10 h-5 w-28 -translate-x-1/2 rounded-b-2xl bg-black" />
          <iframe
            title="비원미래 운영관리 모바일 미리보기"
            src="/"
            className="h-full w-full rounded-[34px] border-0 bg-[#f5f7fa]"
          />
        </div>
      </div>
    </div>
  )
}
