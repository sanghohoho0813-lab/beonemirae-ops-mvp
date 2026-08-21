import { Lightbulb, PlayCircle } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { openGuide, PICK } from '../lib/fieldGuides'
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

  //  폰에서 글자가 세로로 늘어지던 자리입니다.
  //
  //  아이콘과 본문이 한 줄에 나란히 놓여 있어서, 390px 화면에서는 본문이
  //  240px 남짓한 좁은 칸에 갇혔습니다. 그 폭에 1.15rem 글자를 넣으면 한 줄에
  //  열 자 남짓이라, 두 문장이 다섯 줄로 늘어나 카드가 화면 절반을 차지했고
  //  정작 「오늘 일정」은 스크롤해야 나왔습니다.
  //
  //  아이콘 옆에는 제목만 두고, 본문은 카드 폭을 그대로 쓰게 내립니다.
  //  넓은 화면(sm 이상)에서는 원래대로 한 줄에 나란히 놓입니다.
  return (
    <section className="card overflow-hidden">
      <div className="px-5 py-5 sm:px-6">
        <div className="sm:flex sm:flex-wrap sm:items-center sm:gap-x-5 sm:gap-y-3.5">
          <div className="flex items-center gap-3.5 sm:contents">
            <span className="flex h-[3.25rem] w-[3.25rem] shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-600">
              <PlayCircle size={26} strokeWidth={2.2} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="t-card break-keep text-navy-900">비원미래 AX 운영시스템</p>
              <p className="t-body mt-1.5 hidden break-keep text-navy-400 sm:block">
                현장에서 한 번 입력한 수거·자재 정보를 사무실 업무, 거래처 관리, 월 정산, 병원 서비스까지
                연결하기 위해 만든 시스템입니다.
              </p>
              <p className="t-muted mt-1.5 hidden break-keep sm:block">{tour.minutes} · {tour.intro}</p>
            </div>
          </div>

          {/* 폰 — 본문은 카드 폭 전체를 씁니다 */}
          <div className="sm:hidden">
            <p className="t-body mt-3 break-keep text-navy-400">
              현장에서 한 번 입력한 수거·자재 정보가 사무실 업무·거래처 관리·월 정산까지 자동으로 연결됩니다.
            </p>
            <p className="t-muted mt-1.5 break-keep">{tour.minutes} · {tour.intro}</p>
          </div>

          <div className="mt-4 flex w-full shrink-0 flex-col gap-2 sm:mt-0 sm:w-auto sm:flex-row">
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
 * 이 시스템을 만든 이유 — 기획·사업 설명 화면으로 갑니다.
 *
 * 전에는 이 버튼이 대표·사무실 투어를 그대로 실행했습니다. 그래서 「사용 방법」과
 * 눌러 보면 같은 것이 나왔습니다. 두 가지는 목적이 다릅니다.
 *
 *   사용 방법  화면에서 무엇을 누르는지 (투어)
 *   만든 이유  왜 시작했고 회사가 어디로 가려는지 (읽는 글)
 *
 * 대표 내외와 외부 설명 대상이 읽는 글이라 투어처럼 화면을 짚는 형식이 맞지
 * 않습니다. 조용히 읽고 되돌아갈 수 있는 화면으로 뺐습니다.
 */
export function TourWhyButton({
  className = '',
  label = '이 시스템을 만든 이유',
  /** 넘기면 라벨 대신 이 내용을 씁니다 (더보기처럼 설명을 함께 두는 자리) */
  children,
}: {
  className?: string
  label?: string
  children?: ReactNode
}) {
  const navigate = useNavigate()
  return (
    <button
      data-tour-why
      onClick={() => navigate('/why')}
      className={className}
      title="왜 이 시스템을 만들었고 회사가 어디로 가려는지"
    >
      <Lightbulb size={17} strokeWidth={2.3} className="shrink-0" />
      {children ?? <span className="whitespace-nowrap">{label}</span>}
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
  /** 넘기면 라벨 대신 이 내용을 씁니다 */
  children,
}: {
  className?: string
  label?: string
  compact?: boolean
  tourId?: TourId
  children?: ReactNode
}) {
  const { start } = useTour()
  const { role } = useAuth()
  return (
    <button
      data-tour-start
      onClick={() => {
        //  ── 현장 기사에게는 새 안내를 엽니다 (0069) ────────────────────────
        //   ⚠ 「사용 방법」 들어가는 문이 **두 군데**입니다 — 도움말 시트와
        //     더보기 메뉴. 한 곳만 바꿔 두면 기사님이 다른 문으로 들어가
        //     예전 투어를 봅니다. 실제로 그렇게 남아 있었습니다.
        if (role === 'field' && !tourId) {
          openGuide(PICK)
          return
        }
        start(tourId ? TOURS[tourId] : undefined)
      }}
      className={className}
      title="사용 방법 다시 보기"
    >
      <PlayCircle size={17} strokeWidth={2.3} className="shrink-0" />
      {children ?? (
        <span className={compact ? 'hidden whitespace-nowrap sm:inline' : 'whitespace-nowrap'}>{label}</span>
      )}
    </button>
  )
}
