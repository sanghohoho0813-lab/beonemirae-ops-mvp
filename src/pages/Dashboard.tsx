import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  ChevronRight,
  AlertTriangle,
  AlertCircle,
  Building2,
  CalendarClock,
  Truck,
  Circle,
  CheckCircle2,
  ListChecks,
  TrendingUp,
  Wallet,
  PlusCircle,
  History,
  Inbox,
  Boxes,
  type LucideIcon,
} from 'lucide-react'
import { useData } from '../context/DataContext'
import { PageShell, SectionTitle, AreaHeader, AreaDivider, ExpandableSection } from '../components/ui'
import { DEADLINE_BANNER_ON, DeadlineBanner } from '../components/DeadlineBanner'
import { AiBriefingCard } from '../components/AiAssist'
import { ScheduleFeedbackCard } from '../components/ScheduleFeedbackCard'
import { SetupGapsLine } from '../components/SetupGapsCard'
import { ExcelCheckLine } from '../components/ExcelCheckLine'
import { CoachLine } from '../components/axCoach/CoachLine'
import { UrgentRiskBanner } from '../components/UrgentRisk'
import { FieldTodayCard } from '../components/FieldTodayCard'
import { OpportunityPanel } from '../components/Opportunities'
import { ReportHighlight } from '../components/ReportHighlight'
import { TodayClients } from '../components/TodayClients'
import { AxSummaryCard } from '../components/AxSummary'
import { AxStoryStrip } from '../components/AxStory'
import { CustomerServiceCard } from '../components/CustomerService'
import { MonthGlance } from '../components/MonthGlance'
import { StartHere } from '../components/StartHere'
import { PendingApprovals } from '../components/PendingApprovals'
import { useLoadState } from '../components/LoadState'
import { TodayFocus } from '../components/TodayFocus'
import { TodayBoard, useTodayTasks } from '../components/TodayBoard'
import { PhoneBand, BandTitle, BAND_OVERLAP, useIsPhone } from '../components/PhoneBand'
import { canAccess } from '../lib/access'
import { TONE, type Tone } from '../lib/tone'
import { TourBanner } from '../components/TourEntry'
import { useAuth } from '../context/AuthContext'
import { canSeeDashboard } from '../lib/access'
import { PortalSwitchButton } from '../components/PortalSwitch'
import { hideRequests } from '../lib/pilotMode'
import { RevenueKpis } from '../components/RevenueKpis'
import { todayChecklist, dispatchPlans, todayProgress, type CheckStatus } from '../lib/ops'
import { planGaps } from '../lib/planGap'
import { rollupFor } from '../lib/billing'
import { dunningSummary } from '../lib/dunning'
import { outstandingTotal } from '../lib/selectors'
import { shiftMonth } from '../lib/revenue'
import { revenueOpportunities, clientMonthlyReport } from '../lib/insights'
import { prettyDate, today, won, wonShort, thisMonth } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// 대시보드
//
//  위에서 아래로 읽으면 "오늘 일 → 고객 → 돈 → 성장" 네 덩어리입니다.
//
//    ① 오늘 처리할 업무   지금 손대야 하는 것
//    ② 거래처 운영상태     고객 쪽에서 벌어지는 것
//    ③ 이번 달 경영현황     그래서 이번 달 장사는 어떤가
//    ④ 성장기회            다음에 무엇을 더 할 수 있는가
//
//  번호는 이 네 개에만 붙입니다. 카드마다 번호와 배지를 달면 결국 전부
//  같은 무게로 보여서, 처음 보는 사람이 어디부터 볼지 정하지 못합니다.
//
//  PC 와 폰은 같은 순서를 쓰되 담는 양이 다릅니다.
//    PC   가로가 넓으므로 ②③④ 를 펼쳐서 비교까지 하게 둡니다.
//    폰   ① 만 펼치고 ②③④ 는 핵심 숫자 한두 개 + 「전체보기」로 넘깁니다.
//         폰을 켰을 때 첫 화면은 "오늘 무엇을 해야 하는가"여야 합니다.
// ─────────────────────────────────────────────────────────────────────────────

const statusMeta: Record<CheckStatus, { icon: LucideIcon; color: string; chip: string }> = {
  긴급: { icon: AlertTriangle, color: 'text-rose-500', chip: 'bg-rose-50 text-rose-500' },
  주의: { icon: AlertCircle, color: 'text-amber-700', chip: 'bg-amber-50 text-amber-700' },
  정보: { icon: Circle, color: 'text-navy-500', chip: 'bg-navy-50 text-navy-500' },
  완료: { icon: CheckCircle2, color: 'text-emerald-600', chip: 'bg-emerald-50 text-emerald-600' },
}

/** 폰 전용 — 영역 안에서 「핵심 숫자 한 줄 + 전체보기」 */
function PhoneRow({
  to,
  label,
  detail,
  value,
}: {
  to: string
  label: string
  detail: string
  value: string
}) {
  return (
    <Link to={to} className="flex items-center gap-3 px-5 py-4 transition active:bg-navy-50">
      <span className="min-w-0 flex-1">
        <span className="t-body block break-keep font-extrabold text-navy-900">{label}</span>
        <span className="t-muted block break-keep">{detail}</span>
      </span>
      <span className="t-label shrink-0 whitespace-nowrap tabular-nums text-navy-700">{value}</span>
      <ChevronRight size={18} className="shrink-0 text-navy-400" />
    </Link>
  )
}

/**
 * PC 맨 위 숫자 카드 4칸 (AX 3차 · 흔한 ERP 첫 줄).
 *
 *  ⚠ 새로 계산하는 숫자가 없습니다. 아래 카드들이 쓰는 **같은 함수**를 그대로 부릅니다 —
 *    오늘 수거(todayProgress) · 다음 방문 안 잡힘(planGaps, 「오늘 처리할 업무」와 같음) ·
 *    미수금(outstandingTotal · dunningSummary, 「이번 달 경영현황」과 같음) ·
 *    이번 달 매출(rollupFor, 같은 곳). 숫자가 화면 두 군데에서 다르면 둘 다 못 믿게 됩니다.
 *  ⚠ 돈 두 칸은 돈을 볼 수 있는 계정에만 (canSeeMoney).
 *  ⚠ 폰에는 없습니다 — 폰 첫 화면은 「오늘 무엇을 해야 하는가」(0084).
 */
function DashKpis({ canSeeMoney }: { canSeeMoney: boolean }) {
  const { data } = useData()
  //  AX 5차 — 폰에도 둡니다. 흰 카드 한 장에 2×2 로, 파란 띠 끝에 겹쳐 올라옵니다
  //  (배민 첫 화면의 「주소 · 검색」 카드 자리). 숫자는 PC 와 같은 함수 그대로.
  const phone = useIsPhone()
  const month = thisMonth()
  const progress = todayProgress(data)
  const gaps = useMemo(() => planGaps(data), [data])
  const unpaid = outstandingTotal(data)
  const dunning = useMemo(() => dunningSummary(data), [data])
  const cur = useMemo(() => rollupFor(data, month), [data, month])
  const prevMonth = shiftMonth(month, -1)
  const prev = useMemo(() => rollupFor(data, prevMonth), [data, prevMonth])
  const m = (ym: string) => `${Number(ym.slice(5, 7))}월`

  const cells: { key: string; icon: LucideIcon; label: string; value: string; unit: string; tone: string; sub: string; to: string }[] = [
    {
      key: 'today',
      icon: Truck,
      label: '오늘 수거',
      value: String(progress.done),
      unit: `/ ${progress.planned}건`,
      tone: 'text-navy-900',
      sub: progress.planned === 0 ? (phone ? '잡힌 일정 없음' : '오늘 잡힌 일정 없음') : progress.pendingInput > 0 ? `입력 대기 ${progress.pendingInput}건` : '완료 / 오늘 일정',
      to: '/today',
    },
    {
      key: 'gap',
      icon: CalendarClock,
      label: phone ? '방문 안 잡힘' : '다음 방문 안 잡힘',
      value: String(gaps.length),
      unit: '곳',
      tone: gaps.length > 0 ? 'text-amber-700' : 'text-navy-900',
      sub: gaps.length > 0 ? (phone ? '이번 주 갈 곳' : '평소 간격이면 이번 주 갈 곳') : '빠진 곳 없음',
      to: '/plan',
    },
  ]
  if (canSeeMoney) {
    cells.push(
      {
        key: 'unpaid',
        icon: Wallet,
        label: '미수금',
        //  폰 칸은 170px 남짓이라 「118,714,572원」이 안 들어갑니다 — 억 · 만 단위로 줄이고,
        //  1원 단위 금액은 바로 아래 「독촉 대상」 카드와 미수금 화면에 그대로 있습니다.
        value: phone ? wonShort(unpaid) : won(unpaid).replace(/원$/, ''),
        unit: phone ? '' : '원',
        tone: unpaid > 0 ? 'text-rose-700' : 'text-navy-900',
        sub:
          dunning.rows.length > 0
            ? `독촉 대상 ${dunning.rows.length}곳${phone ? '' : ' · 지난달 이전 청구'}`
            : phone ? '미입금액' : '확정 청구 중 미입금액',
        to: '/receivables',
      },
      {
        key: 'rev',
        icon: TrendingUp,
        label: phone ? `${m(month)} 매출` : `${m(month)} 매출 (진행 중)`,
        value: wonShort(cur.revenue),
        //  폰은 칸이 좁아 「(진행 중)」을 이름표 대신 숫자 옆에 작게 붙입니다 — 이 달이 아직 안 끝났다는 표시는 꼭 남깁니다.
        unit: phone ? '진행 중' : '',
        tone: 'text-navy-900',
        sub: phone ? `${m(prevMonth)} ${wonShort(prev.revenue)}` : `${m(prevMonth)} ${wonShort(prev.revenue)} · 확정 청구 + 미확정 정산`,
        to: '/revenue',
      },
    )
  }
  return (
    <div
      data-dash-kpis
      className={
        phone
          ? `card grid grid-cols-2 gap-1 p-1.5 ${BAND_OVERLAP}`
          : `grid gap-3 ${cells.length === 4 ? 'grid-cols-4' : 'grid-cols-2'}`
      }
    >
      {cells.map((c) => {
        const Icon = c.icon
        return (
          <Link
            key={c.key}
            to={c.to}
            data-dash-kpi={c.key}
            className={
              phone
                ? 'flex min-w-0 flex-col gap-0.5 rounded-[14px] px-3 py-2.5 transition active:bg-navy-50'
                : 'kpi-card group flex min-w-0 flex-col gap-1 transition hover:ring-teal-300'
            }
          >
            <span className="flex items-center gap-1.5 text-[0.899rem] font-bold text-navy-500">
              <Icon size={16} strokeWidth={2.4} aria-hidden="true" className="shrink-0" />
              <span className="truncate">{c.label}</span>
              {!phone && <ChevronRight size={16} aria-hidden="true" className="ms-auto shrink-0 text-navy-300 transition group-hover:text-navy-600" />}
            </span>
            <span className={`whitespace-nowrap text-[1.348rem] font-extrabold 2xl:text-[1.573rem] leading-tight tracking-tight tabular-nums ${c.tone}`} title={c.key === 'unpaid' ? won(unpaid) : undefined}>
              {c.value}
              {c.unit && <small className="ms-1 text-[0.899rem] font-bold text-navy-500">{c.unit}</small>}
            </span>
            <span className="truncate text-[0.843rem] font-medium text-navy-500">{c.sub}</span>
          </Link>
        )
      })}
    </div>
  )
}

/**
 *  폰 첫 화면 「자주 쓰는 8개」 (AX 5차 · 배민 첫 화면의 카테고리 칸).
 *   색은 사이드바 목차 색과 같습니다 — 현장 = 하늘 · 돈 = 초록 · 병원 서비스 = 보라.
 *   ⚠ 이 계정이 못 여는 화면은 칸째 뺍니다(사이드바와 같은 규칙).
 */
const QUICK: { to: string; label: string; icon: LucideIcon; tone: Tone }[] = [
  { to: '/collection', label: '수거 입력', icon: PlusCircle, tone: 'emerald' },
  { to: '/today', label: '오늘 일정', icon: CalendarClock, tone: 'sky' },
  { to: '/clients', label: '거래처', icon: Building2, tone: 'blue' },
  { to: '/history', label: '수거이력', icon: History, tone: 'sky' },
  { to: '/requests', label: '고객 요청', icon: Inbox, tone: 'violet' },
  { to: '/receivables', label: '미수금', icon: Wallet, tone: 'emerald' },
  { to: '/revenue', label: '매출 현황', icon: TrendingUp, tone: 'emerald' },
  { to: '/materials', label: '자재 관리', icon: Boxes, tone: 'sky' },
]

function QuickGrid() {
  const { configured, role } = useAuth()
  const items = configured ? QUICK.filter((q) => canAccess(role, q.to)) : QUICK
  if (items.length === 0) return null
  return (
    <nav aria-label="자주 쓰는 화면" data-quick-grid className="card grid grid-cols-4 gap-x-1 gap-y-3 px-2 py-4 lg:hidden">
      {items.map((q) => {
        const Icon = q.icon
        return (
          <Link key={q.to} to={q.to} data-quick={q.to} className="flex min-w-0 flex-col items-center gap-1.5 rounded-xl py-0.5 transition active:scale-95">
            <span className={`flex h-[2.8rem] w-[2.8rem] items-center justify-center rounded-[16px] ${TONE[q.tone].tile}`}>
              <Icon size={22} strokeWidth={2.2} aria-hidden="true" />
            </span>
            <span className="max-w-full truncate text-[0.76rem] font-bold text-navy-700">{q.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

export function Dashboard() {
  const { data } = useData()
  const loadState = useLoadState()
  const { profile, mode } = useAuth()
  //  매출은 돈입니다 — 현장 담당자에게는 대시보드 자체가 열리지 않지만,
  //  시연 모드(로그인 없음)에서는 그대로 보여 줍니다.
  const canSeeMoney = mode !== 'live' || canSeeDashboard(profile?.role ?? null)
  const t = today()
  const month = thisMonth()

  const activePlans = dispatchPlans(data).filter((p) => p.stops.length > 0).length

  // 오늘 챙길 일 — 중요한 3건만 노출
  const checklist = todayChecklist(data)
  // 0건인 항목은 빼고 보여 줍니다 — 화면에 남은 줄이 곧 할 일입니다.
  const topChecks = ['urgent', 'inspection', 'pending']
    .map((k) => checklist.find((c) => c.key === k))
    .filter((c): c is NonNullable<typeof c> => Boolean(c) && c!.count > 0)

  const opportunities = useMemo(() => revenueOpportunities(data, month), [data, month])
  const reports = useMemo(() => data.clients.map((c) => clientMonthlyReport(data, c, month)), [data, month])
  const phone = useIsPhone()
  const taskCount = useTodayTasks(data).tasks.length


  return (
    <PageShell className="max-lg:space-y-3">
      {/*  AX 5차 — 폰에서는 인사 · 날짜가 파란 띠 안으로 올라갑니다(PhoneBand). */}
      <PhoneBand overlap>
        <BandTitle
          title={profile ? `${profile.name}님, 오늘 할 일` : '오늘 할 일'}
          sub={`${prettyDate(t)} · 의료폐기물 운영관리`}
        />
      </PhoneBand>
      {/* 인사 — 넓은 화면에서는 제목과 날짜를 한 줄에 둡니다.
          인사말이 화면 위쪽을 크게 차지하면 정작 오늘 할 일이 아래로 밀립니다. */}
      {/*  ⚠ 0084 — 폰에서는 이 줄이 **가로**가 됩니다. 「병원 화면」 단추를
           제목 옆에 두려고요.
           처음에는 인사 아래 한 줄로 뒀는데, 그러면 68px 이 더 들어가
           「오늘 처리할 업무」가 y=531px 까지 밀립니다(기준 464px).
           위에는 밀린 마감(401px)이 이미 있어서 세로 자리가 없습니다.
           그렇다고 오늘 할 일 아래로 내리면 y=1,458px — 2화면 아래라
           있으나 마나입니다.
           그래서 **줄을 늘리지 않고 옆에** 두었습니다. 세로로 0px 입니다. */}
      {!phone && (
      <div className="lg:flex lg:flex-wrap lg:items-baseline lg:gap-3">
        <h1 className="t-page break-keep text-navy-900 lg:min-w-0 lg:flex-1">
          {profile ? `${profile.name}님, 오늘 운영 현황입니다` : '대표님 한눈에 보기'}
        </h1>
        {/*  ⚠ 0084 — 폰에서는 이 자리에 **안 둡니다.**
             세 자리를 다 재 봤습니다 —
               오늘 할 일 아래 : y=1,458px (2화면 아래, 있으나 마나)
               인사 아래 한 줄 : 오늘 처리할 업무가 y=531px (기준 464px)
               제목·날짜 줄 옆 : y=474~501px (여전히 넘음)
             위에는 밀린 마감(401px)이 이미 있어 폰에는 남는 세로가 없습니다.
             이 앱에서 폰의 부차 화면은 전부 「더보기」에 있습니다 —
             거기에 눈에 띄게 두었습니다(MoreMenu). 자리를 뺏지 않으면서
             한 번만 누르면 닿습니다. 넓은 화면에서는 이 줄 오른쪽 그대로. */}
        <p className="t-body mt-2.5 font-medium text-navy-400 lg:mt-0 lg:shrink-0">
          {prettyDate(t)} · 의료폐기물 운영관리
        </p>
        {/*  0083 — 「병원이 보는 화면」. PC 에서는 인사 줄 **오른쪽**에 나란히
             둡니다. 아래에 한 줄을 더 두면 그만큼 오늘 할 일이 밀립니다.
             ⚠ 실제로 열리는 사람에게만 보입니다(안에서 스스로 판단합니다). */}
        {/*  AX 3차 — 왼쪽 메뉴 맨 위 · 위쪽 흰 줄에도 있어 여기서는 한 줄짜리(작은) 단추로 */}
        <div className="hidden lg:mt-0 lg:block lg:shrink-0">
          <PortalSwitchButton compact label="병원이 보는 화면" />
        </div>
      </div>
      )}




      {/*  AX 3차 — PC 첫 줄 숫자 카드 4칸 */}
      <DashKpis canSeeMoney={canSeeMoney} />
      {/*  AX 5차 — 폰 「자주 쓰는 8개」 */}
      <QuickGrid />

      {/*  밀린 마감 — 인사 바로 아래. 오늘 할 일보다 위입니다.
           지지난달 세금계산서를 빠뜨린 것이 오늘 수거보다 급합니다.
           밀린 것이 없으면 이 자리는 아예 없습니다. */}
      {/*  0141 — 잠시 숨김 (DEADLINE_BANNER_ON) */}
      {DEADLINE_BANNER_ON && <DeadlineBanner />}

      {/*  급한 요청이 반복되는데 앞이 비어 있는 곳 — **긴급 전화가 오기 전에**
           보여 주는 자리입니다. 지금 손댈 곳이 없으면 이 자리는 아예 없습니다.
           밀린 마감 아래에 둡니다: 지난달 세금계산서가 더 급합니다. */}
      {/*  ⚠ 0087 — 「오늘 현장 현황」을 **맨 위**로 올렸습니다.
           대표님·이사님이 이 화면을 여는 첫 번째 이유가 「지금 현장에서
           무슨 일이 일어나고 있나」입니다. 매출도, 밀린 청구도 그다음입니다.
           카톡 보고를 없애려면 그 답이 **열자마자** 있어야 합니다.
           아직 아무것도 안 들어왔고 예정도 없으면 이 자리는 아예 없습니다. */}
      <FieldTodayCard />

      <UrgentRiskBanner />

      {/*  현장에서 온 일정 의견 (0062) — 안 온 날에는 자리가 아예 없습니다. */}
      <ScheduleFeedbackCard />


      {/*
        가입 승인 대기.

         직원이 신청해도 관리자가 사용자 관리 화면을 열어 봐야 알 수 있었습니다.
         신청한 사람은 로그인해도 아무것도 안 보여 「고장 났나」 하고 기다립니다.
         기다리는 사람이 있을 때만 뜹니다 — 없으면 아무것도 그리지 않습니다.
      */}
      <PendingApprovals />

      {/* ══ ① 오늘 처리할 업무 ═══════════════════════════════════════════════ */}
      {/*  AX 5차 — 폰에서는 순서를 시안대로: 오늘 수거 · 할 일 카드 → 빈 설정 → AI 브리핑 → AX 코치 → 엑셀 질문.
           PC 는 예전 순서 그대로입니다(order 는 폰에서만). */}
      <section className="max-lg:flex max-lg:flex-col max-lg:gap-3">
        <AreaHeader
          n={1}
          icon={ListChecks}
          title="오늘 처리할 업무"
          desc="오늘 안에 확인하거나 처리해야 할 일을 먼저 보여드립니다."
          phoneTitle="지금 처리할 것"
          phoneRight={taskCount > 0 ? `${taskCount}건` : undefined}
        />
        {/*  ⚠ 0121 — 오늘 무엇을 하면 자료가 쌓이는지 알려 주는 줄입니다.
             0108 에는 이 구역 맨 아래에 두었는데 페이지 절반 아래라 아무도
             못 봤습니다. 오늘 할 일 목록보다 뒤에 있을 이유가 없어 맨 위로
             올립니다 — 여전히 한 줄이라 아래 일정을 크게 밀지 않습니다. */}
        {/*  0140 — 발표 중에는 숨김(준비용 안내 · data-hide-presenting) */}
        <div data-hide-presenting className="max-lg:order-4 lg:contents">
          <CoachLine className="lg:mb-2.5" />
        </div>
        {/* 실제 운영 전환 직후 — 무엇부터 해야 하는지 (다 끝나면 사라집니다) */}
        <div data-hide-presenting className="hidden lg:block">
          <StartHere data={data} />
        </div>
        {/*  0141 — AI 오늘 브리핑 (실제 AI · 숫자만 보냄 · 관리자 · 사무실 · 운영 연결에서만) */}
        <div className="max-lg:order-3 lg:contents">
          <AiBriefingCard />
        </div>
        <div className="max-lg:order-1 lg:contents">
          <TodayFocus data={data} />
        </div>
        <TodayBoard data={data} />
        {/*  한 줄만 — 비어 있는 것이 없으면 이 자리도 없습니다.
             띠를 하나 더 두면 둘 다 안 보게 됩니다.

             ⚠ 「오늘 처리할 업무」보다 **아래**입니다. 위에 뒀더니 폰에서
               오늘 할 일이 y=497 까지 밀려(검사가 잡았습니다) 첫 화면에서
               사라졌습니다 — 대표님이 이 화면을 여는 이유가 그것입니다.
               채워야 할 값은 오늘 나갈 차보다 급하지 않습니다. */}
        <div data-hide-presenting className="max-lg:order-2 lg:contents">
          <SetupGapsLine />
        </div>
        {/*  0106 — 하루 한 줄: 「오늘 엑셀·카톡에 다시 적은 것이 있었나」.
             답하지 않아도 아무것도 막지 않고, 답하면 그날은 사라집니다. */}
        <div data-hide-presenting className="max-lg:order-5 lg:contents">
          <ExcelCheckLine />
        </div>
        {/*  0108 — AX 코치 한 줄. 오늘 할 일이 없으면 이 줄도 없습니다.
             자세한 것은 /ax-coach 에 있고, 여기서는 「몇 개인지」만 알립니다. */}
      </section>

      {/* 사용법 안내는 오늘 할 일 다음입니다.
          처음 오신 분께도 오늘 처리할 일이 먼저 보여야 합니다. */}
      <div data-hide-presenting className="contents">
        <TourBanner />
      </div>

      <AreaDivider className="max-lg:hidden" />

      {/* ══ ② 이번 달 경영현황 ═══════════════════════════════════════════════
          대표가 스크롤 없이 봐야 하는 숫자입니다. 예전에는 거래처 운영상태
          (1,100px) 아래에 있어서 화면을 한 번 내려야 나왔습니다. */}
      <section>
        <AreaHeader
          n={2}
          icon={Wallet}
          title="이번 달 경영현황"
          desc="매출과 비용, 미수금까지 이번 달 돈의 흐름입니다."
          phoneTitle="이번 달 돈 흐름"
          phoneRight={`${Number(month.slice(5, 7))}월`}
        />
        <MonthGlance data={data} />
      </section>

      <AreaDivider className="max-lg:hidden" />

      {/* ══ ③ 거래처 운영상태 ════════════════════════════════════════════════
           AX 5차 — 폰에서는 뺍니다. 「오늘 방문 거래처 · 거래처 전체」 두 줄은 맨 위 숫자 카드(오늘 수거)와
           아래 탭 「거래처」에 이미 있어, 같은 숫자를 세 번째로 보여 주는 자리였습니다. */}
      <section className="max-lg:hidden">
        <AreaHeader
          n={3}
          icon={Building2}
          title="거래처 운영상태"
          desc="요청·계약·자재·특이사항 등 거래처 쪽에서 지금 벌어지는 일입니다."
        />

        {/* PC — 가로가 넓으므로 오늘 현황과 챙길 일을 나란히 비교합니다 */}
        <div className="hidden gap-4 lg:grid lg:grid-cols-2 lg:gap-5">
          <div className="flex min-w-0 flex-col">
            <SectionTitle size="sub">오늘 거래처 운영 현황</SectionTitle>
            <TodayClients data={data} />
          </div>

          <div className="flex min-w-0 flex-col">
            <SectionTitle size="sub">오늘 챙길 일</SectionTitle>
            <div className="card flex min-h-0 flex-1 flex-col divide-y divide-navy-50">
              {topChecks.length === 0 && (
                <p className="t-body break-keep px-4 py-6 text-center font-bold text-navy-400">
                  {/*  자료가 오기 전에는 「없습니다」가 아니라 「불러오는 중」입니다 —
                       밀린 일이 있는데도 없다고 읽히면 그날 그대로 지나갑니다. */}
                  {loadState === 'ready' ? '오늘 따로 챙길 일이 없습니다.' : '불러오는 중입니다…'}
                </p>
              )}
              {topChecks.map((item) => {
                const m = statusMeta[item.status]
                const Icon = m.icon
                return (
                  <Link
                    key={item.key}
                    to={item.to}
                    className="flex items-center gap-3.5 px-4 py-4 transition hover:bg-navy-50"
                  >
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${m.chip}`}>
                      <Icon size={19} strokeWidth={2.4} />
                    </span>
                    <span className="min-w-0 flex-1 break-keep text-[1.15rem] font-bold leading-snug text-navy-700">
                      {item.label}
                    </span>
                    <span className={`shrink-0 whitespace-nowrap text-[1.15rem] font-extrabold ${m.color}`}>
                      {item.count}건
                    </span>
                    <ChevronRight size={18} className="shrink-0 text-navy-400" />
                  </Link>
                )
              })}
              <Link
                to="/dispatch"
                className="mt-auto flex items-center justify-center gap-1.5 border-t border-navy-50 py-4 text-[1.08rem] font-bold text-navy-600 transition hover:bg-navy-50"
              >
                오늘 운행 차량 {activePlans}/{data.vehicles.length}대 · 배차·경로 보기
              </Link>
            </div>
          </div>
        </div>

        {/* 병원에 매달 내보내는 리포트 — 거래처 쪽으로 나가는 결과물이라 여기 둡니다 */}
        <div className="mt-4 hidden lg:block lg:mt-5">
          <SectionTitle size="sub" action={<span className="pill bg-sky-50 text-sky-700">병원 제공</span>}>
            병원에 매달 제공하는 운영 리포트
          </SectionTitle>
          <ReportHighlight reports={reports} />
        </div>
      </section>

      {/*
        경영 매출 — 올해 누적 · 월평균 · 예상 연매출 · 미수금.
         ⚠ 0141 — 대표님: 「제일 중요한 건 오늘 현장 · 오늘 처리할 업무 · 이번 달 경영현황 ·
           거래처 운영상태를 쭉 보여 주는 것」 → 맨 위에서 거래처 운영상태 **아래**로 내렸습니다.
         현장 담당자에게는 열리지 않습니다(access.ts).
      */}
      {canSeeMoney && (
        <div data-revenue-kpis-below className="mt-6">
          <RevenueKpis />
        </div>
      )}

      <AreaDivider className="max-lg:hidden" />

      {/* ══ ④ 성장기회 ═══════════════════════════════════════════════════════
          매일 처리하는 일이 아니라 「더 할 수 있는 일」입니다. 오늘 업무와
          이번 달 숫자를 먼저 보시도록 접어 둡니다 — 없애지 않습니다. */}
      <ExpandableSection label="성장기회 보기 — 추가 수거 · 소모품 · 교육 기회">
      <section>
        <AreaHeader
          n={4}
          icon={TrendingUp}
          title="성장기회"
          desc="쌓인 기록에서 추가 수거·소모품·교육처럼 더 할 수 있는 일을 찾습니다."
        />

        {/* 폰 — 건수 한 줄 + 「전체보기」 */}
        <div className="card divide-y divide-navy-50 lg:hidden">
          <PhoneRow
            to="/reports"
            label="다음 행동 추천"
            detail={
              opportunities.totalValue > 0
                ? `추가 수거·소모품·교육 · 예상 ${wonShort(opportunities.totalValue)}`
                : '추가 수거·소모품·교육'
            }
            value={`${opportunities.totalCount}건`}
          />
          <PhoneRow
            to="/performance"
            label="병원 서비스 · AX 성과"
            detail="요청에서 추가 매출까지 어디까지 왔는지"
            value="보기"
          />
        </div>

        {/* PC — 병원 요청이 매출이 되기까지의 흐름과 추천을 함께 봅니다 */}
        <div className="hidden lg:block">
          {/*  ⚠ 이 카드는 통째로 「병원 요청 → 처리 → 제안 → 수락 → 매출」
              흐름입니다. Pilot 동안 요청을 안 쓰므로 전부 0 건으로 뜨고,
              「내가 뭘 안 한 건가」로 읽힙니다 (0080). */}
          {!hideRequests() && <CustomerServiceCard data={data} demo={mode !== 'live'} />}
          <div className="mt-4 lg:mt-5">
            <SectionTitle size="sub" action={<span className="pill bg-accent-50 text-accent-700">데이터 기반</span>}>
              데이터 기반 다음 행동 추천
            </SectionTitle>
            <OpportunityPanel summary={opportunities} />
          </div>
        </div>
      </section>

      </ExpandableSection>

      {/* ══ 여기부터는 사업 구조와 성과 ═══════════════════════════════════
          매일 쓰는 정보가 아니라 "이 시스템이 무엇을 하는가"입니다.
          매일 보는 화면 위쪽을 차지하지 않도록 아래로 내렸습니다. */}
      <div className="hidden lg:block">
        <ExpandableSection label="사업 구조 · 도입 성과 보기">

        {/* 이 시스템이 무엇을 하는지 — 데이터가 없어도 항상 읽히는 한 줄 흐름 */}
        <AxStoryStrip data={data} />

        {/* AX 도입 성과 — 자세한 측정은 성과 화면에 있으므로 여기서는 요약만 */}
        <section>
          <SectionTitle action={<span className="pill bg-accent-50 text-accent-700">실증</span>}>
            AX 도입 성과
          </SectionTitle>
          <AxSummaryCard data={data} compact />
        </section>
        </ExpandableSection>
      </div>
    </PageShell>
  )
}
