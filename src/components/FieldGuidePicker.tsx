import { ChevronRight, HelpCircle } from 'lucide-react'
import { FIELD_GUIDES } from '../lib/fieldGuides'

// ─────────────────────────────────────────────────────────────────────────────
// 사용 안내 고르기 (0069)
//
//  ⚠ 한 번에 열 단계짜리 긴 안내를 주지 않습니다. 「지금 알고 싶은 것」
//    하나만 고르게 합니다 — 각 3~4단계, 1분 안에 끝납니다.
//  ⚠ 이름을 기능이 아니라 **하는 일**로 씁니다. 「오늘 일정 화면 소개」가
//    아니라 「오늘 갈 곳 보기」입니다.
// ─────────────────────────────────────────────────────────────────────────────

export function FieldGuidePicker({ onPick }: { onPick: (id: string) => void }) {
  return (
    <div data-guide-picker className="space-y-3">
      <div className="flex items-center gap-2">
        <HelpCircle size={22} strokeWidth={2.3} className="shrink-0 text-teal-600" />
        <p className="text-[1.3rem] font-extrabold text-navy-900">사용 방법</p>
      </div>
      <p className="break-keep text-[1.1rem] text-navy-500">알고 싶은 것을 하나 고르세요.</p>

      {/*  ⚠ 0071 — 호차 안내를 여기에도 둡니다. 첫 화면에서는 한 번 닫으면
           다시 안 뜨는데, 나중에 「내가 왜 3호차지?」가 궁금해지면 찾을 곳이
           없었습니다. 매일 보는 자리에서 내리고, 궁금할 때 찾는 자리에 둡니다. */}
      <p data-car-help className="break-keep rounded-2xl bg-navy-50 px-4 py-3 text-[1.02rem] leading-snug text-navy-600">
        담당 호차는 <b className="text-navy-800">출생연도 순</b>으로 배정했습니다. 바꾸실 수 있으니 필요하면
        사무실에 말씀해 주세요.
      </p>

      {FIELD_GUIDES.map((g) => (
        <button
          key={g.id}
          data-guide-pick={g.id}
          onClick={() => onPick(g.id)}
          className="card flex w-full items-center gap-3 p-5 text-left transition active:scale-[0.99]"
          style={{ minHeight: 76 }}
        >
          <span className="min-w-0 flex-1">
            <span className="block break-keep text-[1.22rem] font-extrabold text-navy-900">{g.title}</span>
            <span className="mt-1 block break-keep text-[1.05rem] text-navy-500">{g.sub}</span>
          </span>
          <ChevronRight size={22} strokeWidth={2.5} className="shrink-0 text-navy-300" />
        </button>
      ))}
    </div>
  )
}
