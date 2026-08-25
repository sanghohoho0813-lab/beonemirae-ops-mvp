import { useState } from 'react'
import { Type, X } from 'lucide-react'
import { FontSizeControl } from './FontSizeControl'

// ─────────────────────────────────────────────────────────────────────────────
// 글자 크기 단추 (0083)
//
//  대표님: 「기존 설정에서 글자크기 조절 기능이 있다면 거래처 포털에도 동일
//  적용한다. 연령대가 높은 병원·요양병원 담당자도 사용할 수 있다는 점을
//  고려한다.」
//
//  ⚠ 실제로 **포털에서는 못 바꾸고 있었습니다.** 글자 크기 조절은 직원
//    「더보기」와 관리자 「설정」에만 있었고, 병원 계정은 그 두 화면을 열지
//    못합니다. 그러니 요양병원 담당자분은 화면이 작아도 방법이 없었습니다.
//
//  ⚠ 「화면 색」 단추와 **같은 모양**으로 둡니다. 나란히 있는 두 단추가 서로
//    다른 방식으로 열리면 그 자체가 배울 것이 됩니다.
// ─────────────────────────────────────────────────────────────────────────────

export function FontSizeButton({ className = '' }: { className?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        data-font-open
        onClick={() => setOpen(true)}
        title="글자 크기 바꾸기"
        aria-label="글자 크기 바꾸기"
        className={
          className ||
          'flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full bg-white px-3 py-2 text-[0.95rem] font-bold text-navy-600 shadow-sm ring-1 ring-navy-100 transition active:bg-navy-50'
        }
      >
        <Type size={17} strokeWidth={2.4} className="shrink-0" />
        <span className="hidden min-[420px]:inline">글자 크기</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy-950/40 p-3 sm:items-center">
          <div data-font-panel className="card w-full max-w-[26rem] p-5" role="dialog" aria-label="글자 크기">
            <div className="mb-3 flex items-center gap-3">
              <p className="t-card min-w-0 flex-1 break-keep text-navy-900">글자 크기</p>
              <button
                data-font-close
                onClick={() => setOpen(false)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-navy-400 hover:bg-navy-50"
                aria-label="닫기"
              >
                <X size={19} />
              </button>
            </div>
            {/*  ⚠ 고르면 **바로** 바뀝니다. 「저장」을 따로 누르게 하지 않습니다 —
                 크기는 눈으로 보고 고르는 것이라 확인 단계가 방해가 됩니다. */}
            <FontSizeControl />
            <p className="t-muted mt-3 break-keep leading-snug">
              고르시면 이 브라우저에 저장되어 다음에 오실 때도 그대로 유지됩니다.
            </p>
          </div>
        </div>
      )}
    </>
  )
}
