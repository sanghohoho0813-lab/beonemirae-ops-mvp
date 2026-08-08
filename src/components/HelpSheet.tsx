import { useNavigate } from 'react-router-dom'
import { ChevronRight, Lightbulb, PlayCircle } from 'lucide-react'
import { BottomSheet } from './BottomSheet'
import { useTour } from '../context/TourContext'

// ─────────────────────────────────────────────────────────────────────────────
// 도움말 (폰 전용)
//
//  PC 는 화면이 넓어 「사용 방법」과 「이 시스템을 만든 이유」를 나란히 둘 수
//  있습니다. 폰 헤더에는 그럴 자리가 없어서 하나만 내놓았더니, 나머지 하나는
//  더보기를 뒤져야 나오는 상태가 됐습니다. 있다는 사실 자체를 알 수 없었습니다.
//
//  그래서 헤더 버튼을 「도움말」 하나로 두고, 누르면 이 시트가 열려
//  두 갈래를 같은 크기로 보여줍니다. 홈에서 두 번이면 원하는 쪽에 닿습니다.
//
//    도움말 누름 → 두 선택지가 함께 보임 → 원하는 쪽 누름
//
//  둘의 성격이 달라서 설명을 함께 적었습니다. 제목만 나란히 두면 폰에서는
//  둘이 같은 것으로 보입니다 — 실제로 그랬습니다.
// ─────────────────────────────────────────────────────────────────────────────

export function HelpSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { start } = useTour()
  const navigate = useNavigate()

  return (
    <BottomSheet open={open} title="도움말" onClose={onClose}>
      <div data-help-sheet className="space-y-3 pb-2">
        <button
          data-tour-start
          onClick={() => {
            onClose()
            // 시트가 닫히고 나서 시작해야 투어 강조가 시트 뒤에 가리지 않습니다.
            window.setTimeout(() => start(), 260)
          }}
          className="card flex w-full items-start gap-3.5 p-4 text-left transition active:bg-navy-50"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-600">
            <PlayCircle size={22} strokeWidth={2.2} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="t-card block break-keep text-navy-900">사용 방법</span>
            <span className="t-muted mt-1 block break-keep">
              화면을 짚어가며 어디에 무엇을 입력하는지 안내합니다.
            </span>
          </span>
          <ChevronRight size={20} className="mt-2 shrink-0 text-navy-300" />
        </button>

        <button
          data-tour-why
          onClick={() => {
            onClose()
            navigate('/why')
          }}
          className="card flex w-full items-start gap-3.5 p-4 text-left transition active:bg-navy-50"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
            <Lightbulb size={22} strokeWidth={2.2} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="t-card block break-keep text-navy-900">이 시스템을 만든 이유</span>
            <span className="t-muted mt-1 block break-keep">
              AX 전환 · 정책자금 · 사업고도화 · 추가 매출 · 향후 개발 방향
            </span>
          </span>
          <ChevronRight size={20} className="mt-2 shrink-0 text-navy-300" />
        </button>

        <p className="t-muted break-keep px-1">
          「사용 방법」은 어떻게 쓰는가, 「만든 이유」는 왜 만들었는가입니다. 둘은 다른 내용입니다.
        </p>
      </div>
    </BottomSheet>
  )
}
