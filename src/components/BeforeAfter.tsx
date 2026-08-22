import { ArrowRight, Phone, PenLine, Table2, CalendarX, PlusCircle, Workflow, Lightbulb, Coins } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// 도입 전 / 도입 후 업무 방식 비교 — 화면 캡처 한 장으로 이해되도록 2열 + 큰 화살표
//  숫자가 아니라 '일하는 방식'이 어떻게 바뀌었는지만 보여줍니다.
// ─────────────────────────────────────────────────────────────────────────────

const BEFORE: { icon: LucideIcon; text: string }[] = [
  { icon: Phone, text: '전화·카톡으로 요청 확인' },
  { icon: PenLine, text: '현장에서 수기 기록' },
  { icon: Table2, text: '엑셀·장부에 같은 정보 반복 입력' },
  { icon: CalendarX, text: '월말에 몰아서 재정리' },
]

const AFTER: { icon: LucideIcon; text: string }[] = [
  { icon: PlusCircle, text: '현장에서 수거정보 1회 입력' },
  { icon: Workflow, text: '일정·이력·자재·통계·문서 자동 연결' },
  { icon: Lightbulb, text: '축적 데이터로 다음 행동 추천 생성' },
  { icon: Coins, text: '제안 → 수락 → 실제 매출까지 추적' },
]

function Column({
  title,
  items,
  tone,
}: {
  title: string
  items: { icon: LucideIcon; text: string }[]
  tone: 'before' | 'after'
}) {
  const after = tone === 'after'
  return (
    <div
      className={`min-w-0 flex-1 rounded-3xl p-5 sm:p-6 ${
        after ? 'bg-teal-50 ring-2 ring-teal-200' : 'bg-navy-50'
      }`}
    >
      <p className={`t-card ${after ? 'text-teal-800' : 'text-navy-500'}`}>{title}</p>
      <ul className="mt-4 space-y-2.5">
        {items.map((it) => {
          const Icon = it.icon
          return (
            <li key={it.text} className="flex items-start gap-3">
              <span
                className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                  after ? 'bg-teal-500 text-white' : 'bg-white text-navy-400'
                }`}
              >
                <Icon size={18} strokeWidth={2.3} />
              </span>
              <span
                className={`t-body min-w-0 break-keep font-bold leading-snug ${
                  after ? 'text-teal-900' : 'text-navy-500'
                }`}
              >
                {it.text}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function BeforeAfterPanel() {
  return (
    <div className="flex flex-col items-stretch gap-3 lg:flex-row lg:items-center lg:gap-4">
      <Column title="도입 전 — 사람이 매번 반복" items={BEFORE} tone="before" />
      <ArrowRight
        size={34}
        strokeWidth={2.8}
        className="mx-auto shrink-0 rotate-90 text-teal-500 lg:rotate-0"
      />
      <Column title="도입 후 — 1회 입력 후 자동 연결" items={AFTER} tone="after" />
    </div>
  )
}
