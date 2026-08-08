import { Lightbulb, PlayCircle } from 'lucide-react'
import { useState } from 'react'
import { useTour } from '../context/TourContext'
import { markTourSeen, shouldShowIntro, snoozeToday, TOURS, type TourId } from '../lib/tour'

// ─────────────────────────────────────────────────────────────────────────────
// 투어 진입점
//
//  · TourBanner  — 처음 들어온 사용자에게 뜨는 시작 안내.
//                  화면을 막지 않습니다. 그냥 무시하고 일해도 됩니다.
//
//                  세 가지를 고를 수 있습니다.
//                    사용 방법 보기      지금 봅니다
//                    바로 시작하기       안 보고 씁니다 (다시 뜨지 않음)
//                    오늘 하루 보지 않기 오늘만 접어 둡니다 (내일 다시)
//
//                  "오늘 하루"를 따로 둔 이유는, 바쁜 날 닫은 것과 필요 없다고
//                  판단한 것은 다르기 때문입니다. 전자를 영구 숨김으로 처리하면
//                  정작 여유 있을 때 다시 볼 기회가 사라집니다.
//
//  · TourButton  — 사이드바·설정·포털 헤더 등 어디서나 다시 실행하는 버튼.
//                  한 번 닫았다고 다시 찾을 수 없으면 안 됩니다.
// ─────────────────────────────────────────────────────────────────────────────

export function TourBanner({ tourId }: { tourId?: TourId }) {
  const { start, myTour } = useTour()
  const tour = tourId ? TOURS[tourId] : myTour
  const [hidden, setHidden] = useState(() => !shouldShowIntro(tour.id))
  if (hidden) return null

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3.5 px-5 py-5 sm:px-6">
        <span className="flex h-[3.25rem] w-[3.25rem] shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-600">
          <PlayCircle size={26} strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="t-card break-keep text-navy-900">비원미래 AX 운영시스템에 오신 것을 환영합니다</p>
          <p className="t-body mt-1.5 break-keep text-navy-400">
            현장에서 한 번 입력한 수거·자재 정보를 사무실 업무, 거래처 관리, 월 정산, 병원 서비스까지
            연결하기 위해 만든 시스템입니다.
          </p>
          <p className="t-muted mt-1.5 break-keep">{tour.minutes} · {tour.intro}</p>
        </div>
        <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row">
          <button
            onClick={() => {
              markTourSeen(tour.id)
              setHidden(true)
            }}
            className="btn-ghost order-2 sm:order-1"
          >
            바로 시작하기
          </button>
          <button data-tour-start onClick={() => start(tour)} className="btn-primary order-1 sm:order-2">
            <PlayCircle size={19} strokeWidth={2.4} /> 사용 방법 보기
          </button>
        </div>
      </div>
      {/* 오늘만 접어 두기 — 내일 다시 뜹니다 */}
      <button
        data-tour-snooze
        onClick={() => {
          snoozeToday(tour.id)
          setHidden(true)
        }}
        className="t-muted w-full border-t border-navy-100 py-3 text-navy-400 transition hover:bg-navy-50 hover:text-navy-600"
      >
        오늘 하루 보지 않기
      </button>
    </section>
  )
}

/**
 * 이 시스템을 만든 이유 — 사업 전환 스토리.
 *
 * 대표·사무실 투어가 곧 그 스토리라(8단계) 같은 것을 실행합니다.
 * 현장·병원 담당자도 궁금하면 여기서 볼 수 있게 역할과 무관하게 열어 둡니다.
 */
export function TourWhyButton({ className = '', label = '이 시스템을 만든 이유' }: { className?: string; label?: string }) {
  const { start } = useTour()
  return (
    <button
      data-tour-why
      onClick={() => start(TOURS.staff)}
      className={className}
      title="기존 업무가 어떻게 바뀌는지 8단계로 봅니다"
    >
      <Lightbulb size={17} strokeWidth={2.3} className="shrink-0" />
      <span className="whitespace-nowrap">{label}</span>
    </button>
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
