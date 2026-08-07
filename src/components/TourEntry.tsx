import { PlayCircle, X } from 'lucide-react'
import { useState } from 'react'
import { useTour } from '../context/TourContext'
import { markTourSeen, tourSeen, TOURS, type TourId } from '../lib/tour'

// ─────────────────────────────────────────────────────────────────────────────
// 투어 진입점
//
//  · TourBanner  — 아직 한 번도 보지 않았을 때만 첫 화면 위에 뜨는 안내.
//                  "사용 방법 보기" / "나중에 보기" 두 가지만 제공합니다.
//                  화면을 막지 않으므로 그냥 무시하고 써도 됩니다.
//  · TourButton  — 사이드바·설정·포털 헤더 등 어디서나 다시 실행하는 버튼.
// ─────────────────────────────────────────────────────────────────────────────

export function TourBanner({ tourId }: { tourId?: TourId }) {
  const { start, myTour } = useTour()
  const tour = tourId ? TOURS[tourId] : myTour
  const [hidden, setHidden] = useState(() => tourSeen(tour.id))
  if (hidden) return null

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4 sm:px-6">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-600">
          <PlayCircle size={24} strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="t-body break-keep font-extrabold text-navy-900">처음이신가요? 사용 방법을 보여드릴게요</p>
          <p className="t-muted mt-1 break-keep">{tour.intro}</p>
        </div>
        <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row">
          <button
            onClick={() => {
              markTourSeen(tour.id)
              setHidden(true)
            }}
            className="btn-ghost order-2 sm:order-1"
          >
            나중에 보기
          </button>
          <button data-tour-start onClick={() => start(tour)} className="btn-primary order-1 sm:order-2">
            <PlayCircle size={18} strokeWidth={2.4} /> 사용 방법 보기
          </button>
        </div>
        <button
          onClick={() => {
            markTourSeen(tour.id)
            setHidden(true)
          }}
          title="닫기"
          className="absolute right-2 top-2 rounded-lg p-1.5 text-navy-300 transition hover:bg-navy-50 sm:hidden"
        >
          <X size={16} />
        </button>
      </div>
    </section>
  )
}

/** 어디서나 다시 실행 — 사이드바 / 설정 / 포털 헤더 / 더보기 */
export function TourButton({
  className = '',
  label = '사용 방법',
  /** 좁은 화면에서는 아이콘만 (헤더처럼 자리가 없는 곳) */
  compact = false,
  /** 특정 투어를 지정 (포털에서는 병원 담당자용) */
  tourId,
}: {
  className?: string
  label?: string
  compact?: boolean
  tourId?: TourId
}) {
  const { start } = useTour()
  return (
    <button
      data-tour-start
      onClick={() => start(tourId ? TOURS[tourId] : undefined)}
      className={className}
      title="사용 방법 다시 보기"
    >
      <PlayCircle size={17} strokeWidth={2.3} className="shrink-0" />
      <span className={compact ? 'hidden whitespace-nowrap sm:inline' : 'whitespace-nowrap'}>{label}</span>
    </button>
  )
}
