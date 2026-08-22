import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, ChevronLeft, ChevronRight, AlertTriangle, ClipboardEdit, Zap, AlertCircle, Inbox, CalendarX2, Pin, CalendarPlus, CalendarClock, CalendarDays, ChevronDown } from 'lucide-react'
import { useData } from '../context/DataContext'
import { useAuth } from '../context/AuthContext'
import { canAccess } from '../lib/access'
import { NoteChips } from '../components/SiteNotes'
import { PageHeader } from '../components/PageHeader'
import { handlersOf } from '../components/StaffCard'
import { NextVisitCard } from '../components/NextVisit'
import { StatusBadge, WasteBadge } from '../components/Badge'
import { Modal } from '../components/Modal'
import { Stagger, StaggerItem } from '../components/motion'

import { LoadGate } from '../components/LoadState'
import { DeadlineBanner } from '../components/DeadlineBanner'
import { ScheduleFeedbackCard } from '../components/ScheduleFeedbackCard'
import { BookVisitModal } from '../components/BookVisit'
import { MoveVisitModal } from '../components/MoveVisit'
import { ScheduleCalendar } from '../components/ScheduleCalendar'
import { UpcomingVisits } from '../components/UpcomingVisits'
import { FieldDayStrip } from '../components/FieldDayStrip'
import { AddVisitSheet } from '../components/AddVisitSheet'
import { SharedTruck } from '../components/SharedTruck'
import { CarNotice } from '../components/CarNotice'
import { useSchemaAtLeast } from '../lib/schemaGate'
import { UrgentRiskBanner } from '../components/UrgentRisk'
import { schedulesOn } from '../lib/selectors'
import { openRequests } from '../lib/ops'
import { EMPTY_SUPPLIED } from '../lib/collection'
import { prettyDate, today, weight } from '../lib/format'
import { holidayMap } from '../lib/holidays'
import type { AppData, ContainerBreakdown, Schedule, WasteType } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// 오늘 일정 — 날짜별 수거 일정 + 완료 처리
//  · 수거정보 입력: 프리필된 수거 입력 화면으로 이동 (용기·자재까지 상세 입력)
//  · 빠른 완료: 기본값으로 통합 커맨드 실행 (일정·이력·자재·통계 자동 연결)
// ─────────────────────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0')
function shiftDate(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d + days)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// 빠른 완료 시 용기별 배출 수량 기본값 (결정적)
function defaultContainers(wasteType: WasteType, amount: number): ContainerBreakdown {
  if (wasteType === '일회용기저귀') return { corrugated: 0, plastic: 0, bag: Math.max(2, Math.round(amount / 30)), etc: 0 }
  return { corrugated: Math.max(1, Math.round(amount / 45)), plastic: 1, bag: 0, etc: 0 }
}

/**
 *  저장된 일정에서 **방문 목적**을 되읽습니다 (0068).
 *
 *  ⚠ 목적을 따로 저장하는 칸은 없습니다. 넣을 때 두 칸으로 나눠 담았으니
 *    (status '긴급' · is_additional true) 여기서도 그 두 칸으로 읽습니다.
 *    「표시를 위해 한 번 더 저장」하지 않습니다.
 *  ⚠ 정기수거는 `null` — 대부분이 정기라, 적으면 모든 줄에 같은 글자가
 *    붙어 아무 뜻이 없어집니다.
 */
function purposeOf(s: Schedule): '추가수거' | '긴급수거' | null {
  if (s.status === '긴급') return '긴급수거'
  if ((s as { isAdditional?: boolean }).isAdditional) return '추가수거'
  return null
}

export function TodaySchedule() {
  const { data, clientById, completeSchedule, completeCollection, notesFor } = useData()
  const { configured, role } = useAuth()
  //  시연 모드(설정 없음)에서는 기존과 동일하게 전부 보입니다.
  const canGoHistory = !configured || canAccess(role, '/history')
  //  방문 예약은 사무실·관리자만입니다 (서버도 같은 기준으로 막습니다).
  const canBook = !configured || role === 'admin' || role === 'office'
  const [bookOpen, setBookOpen] = useState(false)
  const [moveTarget, setMoveTarget] = useState<Schedule | null>(null)
  const canGoMaterials = !configured || canAccess(role, '/materials')
  const navigate = useNavigate()
  const [date, setDate] = useState(today())
  //  일정 추가 시트 (0068)
  const [addOpen, setAddOpen] = useState(false)
  //  월간 일정 — 폰에서는 접어 둡니다 (0071)
  const [monthOpen, setMonthOpen] = useState(false)
  //  ⚠ 기사님에게 ＋ 를 열어 주려면 **서버 판이 67 이상**이어야 합니다.
  //    66 이하에서는 book_visit 이 사무실·관리자 전용이라, 눌러도 거절당합니다.
  //    사무실·관리자는 지금까지처럼 판과 상관없이 잡습니다.
  const fieldCanAdd = useSchemaAtLeast(67) === true && role === 'field'
  const canAddVisit = canBook || fieldCanAdd

  // 완료된 건 수정 (기존 동작 유지)
  const [editTarget, setEditTarget] = useState<Schedule | null>(null)
  const [editAmount, setEditAmount] = useState('')
  const [editMemo, setEditMemo] = useState('')

  // 빠른 완료
  const [quick, setQuick] = useState<Schedule | null>(null)
  // 성과측정: 빠른 완료 모달을 연 시각 (저장 시 경과시간 기록)
  const quickStartRef = useRef<number | null>(null)
  const [quickAmount, setQuickAmount] = useState('')
  const [quickMemo, setQuickMemo] = useState('')
  const [quickError, setQuickError] = useState('')
  // null = 입력 단계, 값 = 완료 성공 단계(같은 모달 안에서 전환)
  const [quickResult, setQuickResult] = useState<{ clientId: string; name: string; amount: number } | null>(null)
  //  빠른 완료도 경고를 받아 둡니다. 예전에는 result.warnings 를 아예 읽지
  //  않아서, 자릿수를 잘못 쳐도 이 화면에서는 아무 표시가 없었습니다.
  const [quickWarnings, setQuickWarnings] = useState<string[]>([])
  const [flash, setFlash] = useState(false)

  const list = useMemo(() => schedulesOn(data, date), [data, date])
  //  이 날이 휴무일인지 — 넣어 둔 휴무일만 봅니다.
  const holidayName = useMemo(() => holidayMap(data).get(date), [data, date])

  function openEdit(s: Schedule) {
    setEditTarget(s)
    setEditAmount(s.actualAmount != null ? String(s.actualAmount) : String(s.expectedAmount))
    setEditMemo(s.memo)
  }
  function submitEdit() {
    if (!editTarget) return
    completeSchedule(editTarget.id, Number(editAmount) || 0, editMemo)
    setEditTarget(null)
  }

  function openQuick(s: Schedule) {
    quickStartRef.current = Date.now()
    setQuick(s)
    setQuickAmount(String(s.expectedAmount))
    setQuickMemo(s.memo)
    setQuickError('')
    setQuickResult(null)
    setQuickWarnings([])
  }
  function closeQuick() {
    quickStartRef.current = null
    setQuick(null)
    setQuickResult(null)
    setQuickWarnings([])
  }
  async function submitQuick() {
    if (!quick) return
    const amt = Number(quickAmount) || quick.expectedAmount
    const vehicle = data.vehicles.find((v) => v.id === quick.vehicleId)
    const result = await completeCollection({
      scheduleId: quick.id,
      clientId: quick.clientId,
      wasteType: quick.wasteType,
      vehicleId: quick.vehicleId,
      driverName: vehicle?.driver ?? '',
      actualAmount: amt,
      actualTime: quick.scheduledTime,
      containers: defaultContainers(quick.wasteType, amt),
      handoverStatus: '수거 완료',
      supplied: { ...EMPTY_SUPPLIED },
      isAdditional: false,
      memo: quickMemo,
      role: '현장 담당자',
      screen: '오늘 일정 · 빠른 완료',
      // 성과측정: 빠른 완료 모달 진입 → 저장까지의 실제 경과시간
      inputDurationMs: quickStartRef.current ? Date.now() - quickStartRef.current : null,
    })
    setQuickWarnings(result.warnings)
    if (!result.ok) {
      setQuickError(result.errors.join(' '))
      return
    }
    const name = clientById(quick.clientId)?.name ?? '거래처'
    // 같은 모달을 성공 단계로 전환 (모달 중첩으로 인한 히스토리 경합 방지)
    setQuickResult({ clientId: quick.clientId, name, amount: amt })
    setFlash(true)
    setTimeout(() => setFlash(false), 1600)
  }

  const doneCount = list.filter((s) => s.status === '완료').length
  const pendingRequests = openRequests(data)

  return (
    <div>
      <div className={flash ? 'rounded-2xl bg-teal-50/70 transition-colors duration-700' : 'transition-colors duration-700'}>
        {/*
          안내물은 이 화면에 두지 않습니다.

           실측(390×844 · 오늘 일정 15건): 첫 화면에 **일정 카드가 하나도
           보이지 않았습니다.** 「시작하기」 체크리스트와 소개 배너가 화면을
           통째로 채우고, 기사가 오늘 첫 방문지를 보려면 스크롤해야 했습니다.
           PC(1440)에서도 첫 일정 카드가 900px 아래에 있었습니다.

           오늘 일정은 **매일 아침 여는 화면**입니다. 어제 본 안내를 오늘 또
           지나가게 하면 안 됩니다. 둘 다 대시보드에 그대로 있습니다 —
           없앤 게 아니라 자리를 옮겼습니다.
        */}
        {/* 진행 건수는 아래 「다음 방문」 카드가 크게 보여 주므로 폰에서는 반복하지 않습니다 */}
        <PageHeader
          title="오늘 일정"
          subtitle={<span className="hidden lg:inline">{`완료 ${doneCount} / 전체 ${list.length}건`}</span>}
        />
        {/*  매일 아침 여는 화면입니다. 병원 전화는 대개 이 화면을 보고 있을
             때 옵니다 — 「다음 주 목요일에 와 주세요」. 그 자리에서 바로
             넣을 수 있어야 수첩으로 가지 않습니다. 기사님에게는 안 띄웁니다
             (남의 일정을 만드는 자리가 아닙니다). */}
        {canBook && (
          <button data-book-open onClick={() => setBookOpen(true)} className="btn-ghost shrink-0">
            <CalendarPlus size={17} strokeWidth={2.4} /> 다른 날 방문 잡기
          </button>
        )}
      </div>

      {canBook && <BookVisitModal open={bookOpen} onClose={() => setBookOpen(false)} />}

      {/*  ⚠ 현장 담당자도 이 창을 엽니다 — 다만 안에서 보이는 것은
           「의견 내기」 하나뿐입니다(고치기·무르기는 안 그립니다).
           창 자체를 막으면 기사님이 의견을 낼 길이 없어집니다. */}
      {moveTarget && (
        <MoveVisitModal
          open
          onClose={() => setMoveTarget(null)}
          schedule={moveTarget}
          clientName={clientById(moveTarget.clientId)?.name ?? '알 수 없는 거래처'}
        />
      )}

      {/*
        휴무일 표시 — 편성에서는 그 날을 빼 주지만, 이미 만들어 둔 예정이
        남아 있거나 급히 넣은 일정이 있으면 현장은 그날이 쉬는 날인지
        모릅니다. 지우지는 않습니다 — 명절에도 가야 하는 곳이 있습니다.
      */}
      {holidayName && (
        <div data-holiday-today className="card border-amber-200 bg-amber-50/60 p-4 sm:p-5">
          <p className="t-body font-extrabold text-navy-900">
            {prettyDate(date)}은 휴무일입니다 — {holidayName}
          </p>
          <p className="t-caption mt-1 break-keep">
            {list.length > 0
              ? `그런데 이 날 일정이 ${list.length}건 잡혀 있습니다. 실제로 가는 곳인지 확인해 주세요.`
              : '이 날은 편성에서 빠집니다.'}
          </p>
        </div>
      )}

      {/*
        오늘 나가는 일이 폐기물 구분마다 몇 곳이고 **누구 담당인지**.

         지금까지 「이건 누가 가지?」는 매번 카톡으로 정했습니다. 시스템이
         사람을 모르니 화면이 말해 줄 수가 없었습니다(0047 에서 명부가 생겼습니다).

         「누가 갔다」가 아니라 「이 구분을 맡는 사람」입니다 — 실제로 누가
         갔는지는 수거 입력에 남습니다. 둘을 섞지 않습니다.
      */}
      <TodayHandlers data={data} list={list} />

      {/*
        오늘 방문하는 병원에 **가져다 줄 물품**이 있으면 현장이 알아야 합니다.
        모르면 빈손으로 갔다가 다시 가야 하고, 그 순간 이 사업모델의 장점
        (어차피 가는 차)이 사라집니다.

        금액은 안 적습니다 — 현장 화면에 금액을 두지 않는 규칙 그대로입니다.
      */}
      <TodayDeliveries data={data} list={list} />

      {/* 모바일 — 폰을 열면 가장 먼저 "다음에 어디로 가는가" */}
      <NextVisitCard data={data} list={list} notesFor={notesFor} />

      {/*  밀린 마감 — 사무실이 하루에 제일 많이 여는 화면입니다.
           밀린 것이 없으면 이 자리는 아예 없습니다(현장에는 안 뜹니다). */}
      <DeadlineBanner className="mb-4" />

      {/*  현장에서 온 일정 의견 (0062) — 사무실이 하루에 제일 많이 여는
           화면입니다. 안 온 날에는 자리가 아예 없습니다. */}
      <ScheduleFeedbackCard />

      {/*  긴급 전화가 오기 전에 — 여기가 사무실이 아침에 여는 화면입니다.
           지금 손댈 곳이 없으면 이 자리는 아예 없습니다. */}
      {canBook && <UrgentRiskBanner limit={2} />}

      {/* 병원에서 올라온 요청 — 오늘 방문 전에 확인해야 하는 것 */}
      {pendingRequests.length > 0 && (
        <RequestBanner requests={pendingRequests} onGo={() => navigate('/requests')} className="mb-4 hidden lg:grid" />
      )}

      {/*
        ── 날짜 띠 (0068) — 폰에서 날짜 네비 대신 ──────────────────────────
        예전에는 화살표 두 개와 「오늘로 이동」뿐이라, 며칠 뒤에 무엇이
        있는지 보려면 하루씩 눌러야 했습니다. 띠는 한 번 밀면 2~4주가
        지나가고, **일정이 있는 날에는 건수가 숫자로** 붙습니다.
        넓은 화면은 예전 네비를 그대로 씁니다 — 마우스로는 화살표가 편합니다.
      */}
      <div className="mb-3 sm:hidden">
        <div className="mb-2 flex items-center gap-2">
          <p data-day-title className="text-[1.15rem] font-extrabold text-navy-900">{prettyDate(date)}</p>
          {date !== today() && (
            <button
              data-go-today
              onClick={() => setDate(today())}
              className="ml-auto min-h-[2.5rem] rounded-xl bg-teal-50 px-3 text-[1rem] font-extrabold text-teal-700 transition active:scale-95"
            >
              오늘로
            </button>
          )}
        </div>
        <div data-guide="guide-day-strip">
          <FieldDayStrip data={data} selected={date} onPick={setDate} />
        </div>
      </div>

      {/* 날짜 네비게이션 (넓은 화면) */}
      <div className="card mb-4 hidden items-center justify-between p-2 sm:flex">
        <button
          className="flex h-11 w-11 items-center justify-center rounded-2xl bg-navy-50 text-navy-500 transition active:scale-95"
          onClick={() => setDate((d) => shiftDate(d, -1))}
          aria-label="이전 날짜"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="text-center">
          <p className="text-[1.07rem] font-extrabold text-navy-900">{prettyDate(date)}</p>
          {/*  누르는 자리를 글자 크기가 아니라 **손가락 크기**로 잡습니다.
               글자만 있으면 높이가 26px 이라 폰에서 빗나갑니다. */}
          <button
            className="-mx-2 min-h-[2.75rem] px-2 text-[0.98rem] font-bold text-teal-600"
            onClick={() => setDate(today())}
          >
            오늘로 이동
          </button>
        </div>
        <button
          className="flex h-11 w-11 items-center justify-center rounded-2xl bg-navy-50 text-navy-500 transition active:scale-95"
          onClick={() => setDate((d) => shiftDate(d, 1))}
          aria-label="다음 날짜"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {list.length === 0 ? (
        <LoadGate
          loadingTitle="오늘 일정을 불러오는 중입니다"
          empty={
            //  ⚠ 빈 화면에 「없어요」만 띄우면 기사님은 **거기서 멈춥니다.**
            //    없으면 다음에 무엇을 할 수 있는지 같이 줍니다 (대표님 요청).
            <div data-empty-day className="card p-6 text-center">
              <CalendarX2 size={34} className="mx-auto text-navy-200" strokeWidth={1.8} />
              <p className="mt-3 text-[1.15rem] font-extrabold text-navy-900">
                {date === today() ? '오늘은 잡힌 일정이 없어요' : `${prettyDate(date)}에 잡힌 일정이 없어요`}
              </p>
              {canAddVisit ? (
                <button
                  data-empty-add
                  data-guide="guide-add"
                  onClick={() => setAddOpen(true)}
                  className="btn-primary mx-auto mt-4 !text-[1.08rem]"
                  style={{ minHeight: 48 }}
                >
                  <CalendarPlus size={18} strokeWidth={2.4} /> 이 날 일정 추가
                </button>
              ) : (
                <p className="mt-2 break-keep text-[1.02rem] text-navy-400">
                  다른 날짜를 확인하거나 수거 입력에서 등록하세요.
                </p>
              )}
            </div>
          }
        />
      ) : (
        <Stagger className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:items-start">
          {list.map((s, si) => {
            const client = clientById(s.clientId)
            const vehicle = data.vehicles.find((v) => v.id === s.vehicleId)
            const done = s.status === '완료'
            const urgent = s.status === '긴급'
            return (
              <StaggerItem key={s.id} className="card overflow-hidden">
                {/* 폰 — 한 줄 요약. 상세와 조작은 위 「다음 방문」 카드와 상세 화면에서 합니다 */}
                {/*  폰에서 줄을 훑을 때 「끝난 곳 / 아직 갈 곳」이 한눈에 갈리도록
                     왼쪽에 색 띠를 둡니다. 완료는 청록(accent), 남은 곳은 파랑 —
                     완료 뱃지까지 같은 청록으로 맞춰 초록이 여러 가지로 갈리지
                     않게 했습니다. 시간도 같은 색 옅은 칩에 넣어 먼저 눈에 닿게 합니다. */}
                <button
                  data-guide={si === 0 ? 'guide-today-list' : undefined}
                  onClick={() => (done ? openEdit(s) : navigate(`/collection?schedule=${s.id}`))}
                  className={`flex w-full items-center gap-3 border-l-[5px] py-3.5 pl-3 pr-4 text-left transition active:bg-navy-50 lg:hidden ${
                    done ? 'border-accent-400 bg-accent-50/30' : 'border-teal-500'
                  }`}
                >
                  <span
                    className={`w-[3.6rem] shrink-0 rounded-lg py-1 text-center tabular-nums text-[1.15rem] font-extrabold ${
                      done ? 'bg-accent-50 text-accent-700' : 'bg-teal-50 text-teal-700'
                    }`}
                  >
                    {s.scheduledTime}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block break-keep text-[1.15rem] font-extrabold leading-snug ${
                        done ? 'text-navy-400' : 'text-navy-900'
                      }`}
                    >
                      {client?.name ?? '알 수 없는 거래처'}
                    </span>
                    {/*
                      ── 둘째 줄은 **방문 목적**부터 (0068) ─────────────────
                      대표님 말씀: "병원명, 예정시간, 방문목적 정도만 우선
                      노출". 예전에는 구분·예상량이 먼저였는데, 기사님이
                      줄을 훑을 때 알아야 하는 건 「이건 무슨 방문인가」입니다.
                      ⚠ 정기수거는 **적지 않습니다.** 대부분이 정기라, 적으면
                        모든 줄에 같은 글자가 붙어 아무 뜻이 없어집니다.
                        평소와 다른 것만 눈에 띄게 합니다.
                    */}
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                      {purposeOf(s) && (
                        <span
                          data-visit-purpose={s.id}
                          className={`pill ${
                            purposeOf(s) === '긴급수거' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-700'
                          }`}
                        >
                          {purposeOf(s)}
                        </span>
                      )}
                      <span className="t-muted break-keep">
                        {s.wasteType} · {weight(s.actualAmount ?? s.expectedAmount)}
                        {s.memo ? ' · 특이사항 있음' : ''}
                      </span>
                    </span>
                  </span>
                  {done ? (
                    <span className="pill shrink-0 bg-accent-100 text-accent-800">완료</span>
                  ) : urgent ? (
                    <span className="pill shrink-0 bg-rose-50 text-rose-600">긴급</span>
                  ) : (
                    <ChevronRight size={18} className="shrink-0 text-navy-300" />
                  )}
                </button>

                <div className="hidden lg:block">
                {urgent && (
                  <div className="flex items-center gap-1.5 bg-rose-50 px-4 py-2 text-[0.98rem] font-bold text-rose-500">
                    <AlertTriangle size={13} strokeWidth={2.6} /> 우선 방문 요청
                  </div>
                )}
                <div className="p-4">
                  <div
                    data-tour={si === 0 ? 'today-list' : undefined}
                    data-guide={si === 0 ? 'guide-today-list' : undefined}
                    className="flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="tabular-nums text-lg font-extrabold text-navy-900">{s.scheduledTime}</span>
                        <WasteBadge type={s.wasteType} />
                        {!done && <StatusBadge status={s.status} />}
                        {/*  사람이 날짜를 정해 잡은 방문 (0058). 자동으로 생긴
                             예정과 무게가 다릅니다 — 이건 병원과 한 약속이라
                             놓치면 그 병원이 전화기를 듭니다. */}
                        {s.bookedAt && (
                          <span
                            data-booked={s.id}
                            className="rounded-full bg-teal-50 px-2 py-0.5 text-[0.9rem] font-extrabold text-teal-700"
                          >
                            예약
                          </span>
                        )}
                        {done && s.handoverStatus && (
                          <span className="rounded-full bg-navy-100 px-2 py-0.5 text-[0.9rem] font-bold text-navy-500">
                            {s.handoverStatus}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => client && navigate(`/clients/${client.id}`)}
                        className="mt-1.5 flex min-w-0 max-w-full items-center gap-1 text-left"
                      >
                        <span className="min-w-0 text-xl font-extrabold text-navy-900 [overflow-wrap:anywhere] [word-break:keep-all]">
                          {client?.name ?? '알 수 없는 거래처'}
                        </span>
                        <ChevronRight size={16} className="shrink-0 text-navy-300" />
                      </button>
                      <p className="mt-0.5 break-keep t-caption">
                        {client?.address} · {vehicle?.name ?? '미배정'}
                      </p>
                      {s.memo && (
                          <p className="mt-1.5 flex items-start gap-1.5 text-[1.08rem] font-medium text-amber-700">
                            <Pin size={14} strokeWidth={2.4} className="mt-1 shrink-0" />
                            <span className="break-keep">{s.memo}</span>
                          </p>
                        )}
                      {/* 현장 메모 — 거래처 상세에 기록해둔 특이사항을 방문 전에 함께 확인 */}
                      {client && (
                        <span data-tour={si === 0 ? 'today-notes' : undefined} className="block">
                          <NoteChips notes={notesFor(client.id)} max={2} />
                        </span>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      {s.actualAmount != null ? (
                        <>
                          <p className="t-caption">실수거</p>
                          <p className="text-lg font-extrabold text-teal-600">{weight(s.actualAmount)}</p>
                        </>
                      ) : (
                        <>
                          <p className="t-caption">예상</p>
                          <p className="text-base font-bold text-navy-500">{weight(s.expectedAmount)}</p>
                        </>
                      )}
                      {done && (
                        <button
                          className="mt-1.5 rounded-full bg-navy-50 px-3 py-1 text-[0.98rem] font-bold text-navy-500 transition active:scale-95"
                          onClick={() => openEdit(s)}
                        >
                          수정
                        </button>
                      )}
                    </div>
                  </div>

                  {!done && (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        className="flex items-center justify-center gap-1.5 rounded-xl bg-navy-50 px-3 py-2.5 text-[1.08rem] font-bold text-navy-700 transition active:scale-95"
                        onClick={() => navigate(`/collection?schedule=${s.id}`)}
                      >
                        <ClipboardEdit size={15} strokeWidth={2.4} /> 수거정보 입력
                      </button>
                      <button
                        className="flex items-center justify-center gap-1.5 rounded-xl bg-teal-500 px-3 py-2.5 text-[1.08rem] font-bold text-white shadow-sm transition active:scale-95"
                        onClick={() => openQuick(s)}
                      >
                        <Zap size={15} strokeWidth={2.6} /> 빠른 완료
                      </button>
                    </div>
                  )}

                  {/*  옮기기·무르기 (0059) — 병원이 「그날 말고 다음 주로」
                       하면 여기서 바로 합니다. 지금까지는 화면에서 할 수 있는
                       것이 없어 잘못 잡은 방문에도 기사가 나갔습니다.
                       완료된 수거에는 안 띄웁니다 — 실제로 다녀온 기록이고
                       정산·청구로 이어집니다(서버도 막습니다). */}
                  {!done && (
                    <button
                      data-move-open={s.id}
                      onClick={() => setMoveTarget(s)}
                      className="t-btn mt-2 flex min-h-[2.75rem] w-full items-center justify-center gap-1 rounded-xl py-2 font-bold text-navy-400 transition hover:bg-navy-50 hover:text-navy-700"
                    >
                      <CalendarClock size={14} strokeWidth={2.4} />{' '}
                      {canBook ? '날짜 옮기기 · 고치기 · 무르기' : '이 일정에 의견 내기'}
                    </button>
                  )}
                </div>
                </div>
              </StaggerItem>
            )
          })}
        </Stagger>
      )}

      {/*  달력 — 하루씩 화살표로 넘기지 않아도 한 달이 보입니다 (대표님 요청).
           날짜를 누르면 위 목록이 그날로 바뀌고, 앞으로 올 날의 ＋ 로 그
           자리에서 방문을 잡습니다. */}
      {/*  일정 추가 시트 — 빈 날 CTA·떠 있는 ＋ 둘 다 이것을 엽니다 */}
      {canAddVisit && (
        <AddVisitSheet
          date={date}
          open={addOpen}
          onClose={() => setAddOpen(false)}
          onDone={(d) => setDate(d)}
        />
      )}

      {/*
        떠 있는 ＋ (폰) — 어느 날을 보고 있든 한 번에 잡습니다.
        ⚠ 아래 메뉴(약 64px)를 피해 앉힙니다. 겹치면 ＋ 를 누를 수 없습니다.
      */}
      {canAddVisit && list.length > 0 && (
        <button
          data-add-fab
          data-guide="guide-add"
          onClick={() => setAddOpen(true)}
          aria-label="일정 추가"
          className="fixed bottom-[5.5rem] right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-navy-900 text-white shadow-lg transition active:scale-95 sm:hidden"
        >
          <CalendarPlus size={24} strokeWidth={2.4} />
        </button>
      )}

      {/*  호차 안내 — 오늘 할 일을 다 본 **뒤에** 옵니다 (0071) */}
      <CarNotice />

      {/*  3.5톤 공용차 — 본사 앞에 있고, 필요한 분이 잡아서 씁니다 (0070).
           누가 잡았는지 병원 빼고 다 보입니다. */}
      <SharedTruck date={date} />

      {/*  앞으로 갈 곳 (0067) — 종이·카톡 없이 앞일을 앱에서 봅니다.
           달력보다 위에 둡니다: 기사님이 알고 싶은 것은 「며칠에 어디」이지
           「8월 달력」이 아닙니다. */}
      <UpcomingVisits />

      {/*
        ── 폰에서는 달력을 접습니다 (0065) ────────────────────────────────────
        한 달 달력은 620px 에 누를 수 있는 칸이 42개입니다. 기사님이 첫 화면에서
        알고 싶은 것은 「오늘 어디를 가나」 하나인데, 오늘 일정이 없는 날에는
        화면의 대부분이 달력이었습니다. 날짜를 옮기는 것은 위 화살표로 되고,
        달력이 필요한 날에는 한 번 눌러서 폅니다. 넓은 화면은 그대로 둡니다.
      */}
      {/*
        ── 월간 일정 — 폰에서도 열립니다 (0071) ───────────────────────────────

        ⚠ 0068 에서 폰의 한 달 달력을 **아예 없앴습니다.** 날짜 띠가 4주를
          보여 주니 충분하다고 봤는데, 그건 제 판단이 지나쳤습니다.
          「이번 달에 몇 번이나 가나」, 「지난주 화요일이 며칠이었나」는
          띠로는 안 됩니다. 게다가 640px 이 넘는 화면(폴드폰을 편 상태)에만
          달력이 떠서, **보통 폰에서는 아예 월간을 볼 길이 없었습니다.**

        그래서 되살리되 **접어 둡니다.** 첫 화면은 지금처럼 오늘 중심이고,
        한 번 누르면 그 자리에서 한 달이 펼쳐집니다. 다시 누르면 접힙니다.
        넓은 화면은 지금까지처럼 늘 펼친 채로 둡니다 — 자리가 남으니까요.
      */}
      <div className="mt-4" data-guide="guide-month">
        <button
          type="button"
          data-month-toggle
          onClick={() => setMonthOpen((v) => !v)}
          className="card flex min-h-[3.5rem] w-full items-center gap-2.5 px-4 py-3 text-left transition active:scale-[0.99] sm:hidden"
        >
          <CalendarDays size={20} strokeWidth={2.3} className="shrink-0 text-navy-500" />
          <span className="text-[1.12rem] font-extrabold text-navy-900">월간 일정 보기</span>
          <ChevronDown
            size={19}
            strokeWidth={2.5}
            className={`ml-auto shrink-0 text-navy-400 transition ${monthOpen ? 'rotate-180' : ''}`}
          />
        </button>
        <div data-calendar-body className={`${monthOpen ? 'mt-3' : 'hidden'} sm:mt-0 sm:block`}>
          <ScheduleCalendar selected={date} onPick={setDate} />
        </div>
      </div>

      {/* 병원 요청은 사무실 업무라, 좁은 화면에서는 일정 아래로 내립니다 */}
      {pendingRequests.length > 0 && (
        <RequestBanner requests={pendingRequests} onGo={() => navigate('/requests')} className="mt-4 grid lg:hidden" />
      )}


      {/* 빠른 완료 모달 — 입력 → 성공을 한 모달 안에서 전환 (통합 커맨드 사용) */}
      <Modal
        open={quick !== null}
        title={quickResult ? '수거 완료 반영됨' : '빠른 완료'}
        onClose={closeQuick}
        footer={
          quickResult ? (
            <button className="btn-ghost w-full" onClick={closeQuick}>
              시연 계속하기
            </button>
          ) : (
            <>
              <button className="btn-ghost flex-1" onClick={closeQuick}>
                취소
              </button>
              <button className="btn-primary flex-1" onClick={submitQuick}>
                <Check size={16} strokeWidth={2.6} /> 완료 처리
              </button>
            </>
          )
        }
      >
        {quick && !quickResult && (
          <>
            <div className="rounded-xl bg-navy-50 p-3 text-[1.08rem]">
              <p className="font-semibold text-navy-900">{clientById(quick.clientId)?.name}</p>
              <p className="text-navy-400">
                {quick.scheduledTime} · {quick.wasteType} ·{' '}
                {data.vehicles.find((v) => v.id === quick.vehicleId)?.driver ?? '기사 미지정'}
              </p>
            </div>
            <div>
              <label className="field-label">실제 수거량 (kg)</label>
              <input
                type="number"
                inputMode="numeric"
                className="field-input"
                value={quickAmount}
                onChange={(e) => {
                  setQuickAmount(e.target.value)
                  setQuickError('')
                }}
                placeholder="예: 320"
              />
            </div>
            <div>
              <label className="field-label">메모</label>
              <textarea
                className="field-input"
                rows={2}
                value={quickMemo}
                onChange={(e) => setQuickMemo(e.target.value)}
                placeholder="현장 특이사항 (선택)"
              />
            </div>
            <div className="rounded-xl bg-navy-50 p-3">
              <p className="text-[0.95rem] font-bold text-navy-400">완료 시 자동 반영</p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {['오늘 일정 완료', '수거이력', '거래처 최근 활동', '대시보드 KPI', '통계', '수거대장 초안', '월간 명세 초안'].map(
                  (t) => (
                    <span key={t} className="rounded-full bg-white px-2 py-0.5 text-[0.9rem] font-semibold text-navy-500">
                      {t}
                    </span>
                  ),
                )}
              </div>
            </div>
            <p className="text-[0.95rem] text-navy-400">
              용기·자재까지 상세 입력하려면 <b>수거정보 입력</b>을 사용하세요. 빠른 완료도 동일하게 일정·이력·통계에
              연결됩니다.
            </p>
            {quickError && (
              <p className="flex items-start gap-1.5 text-[1.08rem] font-semibold text-rose-500">
                <AlertCircle size={15} className="mt-0.5 shrink-0" /> {quickError}
              </p>
            )}
          </>
        )}
        {quickResult && (
          <>
            <div className="rounded-xl bg-emerald-50 p-3.5 text-center">
              <Check size={22} className="mx-auto text-emerald-500" strokeWidth={2.6} />
              <p className="mt-1.5 text-[1.08rem] font-bold text-navy-900">
                {quickResult.name} · {weight(quickResult.amount)}
              </p>
              <p className="text-[0.98rem] text-navy-500">수거정보가 여러 운영 화면에 자동 반영되었습니다.</p>
            </div>
            {quickWarnings.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5">
                {quickWarnings.map((w) => (
                  <p key={w} className="flex items-start gap-1.5 text-[1.02rem] font-semibold text-amber-700">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {w}
                  </p>
                ))}
              </div>
            )}
            <div className="grid grid-cols-1 gap-2">
              <button
                className="flex items-center justify-between rounded-xl bg-navy-50 px-3.5 py-3 text-[1.08rem] font-bold text-navy-700 transition active:scale-[0.98]"
                onClick={() => navigate(`/clients/${quickResult.clientId}`)}
              >
                거래처 상세에서 확인 <ChevronRight size={16} className="text-navy-300" />
              </button>
              {/*  현장 담당자에게는 두 화면이 막혀 있습니다(access.ts).
                   눌러도 차단 안내만 뜨는 버튼은 두지 않습니다. */}
              {canGoMaterials && (
                <button
                  className="flex items-center justify-between rounded-xl bg-navy-50 px-3.5 py-3 text-[1.08rem] font-bold text-navy-700 transition active:scale-[0.98]"
                  onClick={() => navigate('/materials')}
                >
                  자재관리에서 확인 <ChevronRight size={16} className="text-navy-300" />
                </button>
              )}
              {canGoHistory && (
                <button
                  className="flex items-center justify-between rounded-xl bg-navy-50 px-3.5 py-3 text-[1.08rem] font-bold text-navy-700 transition active:scale-[0.98]"
                  onClick={() => navigate('/history')}
                >
                  전체 수거이력에서 확인 <ChevronRight size={16} className="text-navy-300" />
                </button>
              )}
            </div>
          </>
        )}
      </Modal>

      {/* 완료 건 수정 모달 */}
      <Modal
        open={editTarget !== null}
        title="수거 내역 수정"
        onClose={() => setEditTarget(null)}
        footer={
          <>
            <button className="btn-ghost flex-1" onClick={() => setEditTarget(null)}>
              취소
            </button>
            <button className="btn-primary flex-1" onClick={submitEdit}>
              저장
            </button>
          </>
        }
      >
        {editTarget && (
          <>
            <div className="rounded-xl bg-navy-50 p-3 text-[1.08rem]">
              <p className="font-semibold text-navy-900">{clientById(editTarget.clientId)?.name}</p>
              <p className="text-navy-400">
                {editTarget.scheduledTime} · {editTarget.wasteType}
              </p>
            </div>
            <div>
              <label className="field-label">실제 수거량 (kg)</label>
              <input
                type="number"
                inputMode="numeric"
                className="field-input"
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
                placeholder="예: 320"
              />
            </div>
            <div>
              <label className="field-label">메모</label>
              <textarea
                className="field-input"
                rows={2}
                value={editMemo}
                onChange={(e) => setEditMemo(e.target.value)}
                placeholder="현장 특이사항을 입력하세요"
              />
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}

/**
 * 오늘 · 구분별 몇 곳 · 담당 누구.
 *
 *  명부에 사람이 없으면 아무것도 그리지 않습니다 — 없는 담당을 지어내
 *  「담당 없음」이라고 겁주지 않습니다.
 */
/**
 * 병원 요청 알림 줄.
 *
 *  예전에는 `flex flex-wrap` 한 줄에 아이콘·제목·긴급 딱지·거래처 이름·화살표를
 *  전부 늘어놓았습니다. 폰처럼 좁은 화면에서는 앞의 것들이 줄을 다 쓰고,
 *  마지막 거래처 이름 칸에 **글자 한 자 폭**만 남습니다. 그래서 병원 이름이
 *  세로로 한 자씩 늘어졌습니다(실측).
 *
 *  격자로 바꿉니다 — 아이콘 | 글자 | 화살표 세 칸을 고정하고, 글자 칸이 남은
 *  자리를 전부 가져갑니다. 이름이 길면 세로로 늘어지는 대신 **한 줄로 잘립니다.**
 */
function RequestBanner({
  requests,
  onGo,
  className = '',
}: {
  requests: Array<{ clientName: string; type: string; urgent?: boolean }>
  onGo: () => void
  className?: string
}) {
  const urgent = requests.some((r) => r.urgent)
  return (
    <button
      data-request-banner
      onClick={onGo}
      className={`card w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 px-4 py-3.5 text-left transition hover:bg-navy-50 ${className}`}
    >
      <Inbox size={19} className="row-span-2 shrink-0 text-teal-600" strokeWidth={2.4} />
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <span className="t-body break-keep font-extrabold text-navy-900">
          병원 요청 {requests.length}건 처리 대기
        </span>
        {urgent && <span className="pill shrink-0 bg-rose-50 text-rose-600">긴급 포함</span>}
      </span>
      <ChevronRight size={18} className="row-span-2 shrink-0 text-navy-300" />
      {/*  이름이 아무리 길어도 **한 줄**입니다. 넘치면 … 로 자릅니다 —
          세로로 늘어지는 것보다 잘리는 편이 읽힙니다. */}
      <span className="t-muted col-start-2 min-w-0 truncate">
        {requests[0].clientName} · {requests[0].type}
      </span>
    </button>
  )
}

function TodayHandlers({ data, list }: { data: AppData; list: Schedule[] }) {
  const rows = (['의료폐기물', '일회용기저귀'] as const)
    .map((w) => ({
      waste: w,
      count: list.filter((s) => s.wasteType === w).length,
      names: handlersOf(data.staff, w),
    }))
    .filter((r) => r.count > 0 && r.names.length > 0)

  if (rows.length === 0) return null
  return (
    <div data-today-handlers className="card flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      {rows.map((r) => (
        <span key={r.waste} data-today-handler={r.waste} className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="t-caption text-navy-500">{r.waste}</span>
          <b className="t-cell tabular-nums text-navy-900">{r.count}곳</b>
          <span className="t-caption text-navy-600">{r.names.join(' · ')}</span>
        </span>
      ))}
    </div>
  )
}

/**
 * 오늘 가져다 줄 물품.
 *
 *  「확인·준비·전달예정」인 주문만 봅니다. 아직 확인 안 한 요청을 현장에
 *  보내면 사무실이 거절할 것을 싣고 가게 됩니다.
 */
function TodayDeliveries({ data, list }: { data: AppData; list: Schedule[] }) {
  const ids = new Set(list.map((s) => s.id))
  const clientIds = new Set(list.map((s) => s.clientId))
  const rows = (data.productOrders ?? []).filter(
    (o) =>
      ['확인', '준비', '전달예정'].includes(o.status) &&
      (o.deliverScheduleId ? ids.has(o.deliverScheduleId) : clientIds.has(o.clientId)),
  )
  if (rows.length === 0) return null

  const nameOf = (id: string) => data.clients.find((c) => c.id === id)?.name ?? '거래처'
  return (
    <div data-today-deliveries className="card border-teal-200 bg-teal-50/50 p-4 sm:p-5">
      <p className="t-body font-extrabold text-navy-900">오늘 전달할 물품이 있습니다 — {rows.length}건</p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {rows.map((o) => (
          <li key={o.id} data-today-delivery={o.id} className="t-body break-keep text-navy-800">
            <b>{nameOf(o.clientId)}</b>{' '}
            <span className="text-navy-600">
              {o.items.map((i) => `${i.name} ${i.spec} ${i.qty}${i.unit}`).join(' · ')}
            </span>
          </li>
        ))}
      </ul>
      <p className="t-muted mt-2 break-keep">
        차에 실으셨는지 확인해 주세요. 전달을 마치면 사무실에서 「전달완료」로 바꿉니다.
      </p>
    </div>
  )
}
