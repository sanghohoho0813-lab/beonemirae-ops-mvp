import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  ChevronRight,
  AlertTriangle,
  AlertCircle,
  Building2,
  Circle,
  CheckCircle2,
  ListChecks,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { useData } from '../context/DataContext'
import { PageShell, SectionTitle, AreaHeader, AreaDivider } from '../components/ui'
import { OpportunityPanel } from '../components/Opportunities'
import { ReportHighlight } from '../components/ReportHighlight'
import { TodayClients } from '../components/TodayClients'
import { AxSummaryCard } from '../components/AxSummary'
import { AxStoryStrip } from '../components/AxStory'
import { CustomerServiceCard } from '../components/CustomerService'
import { MonthGlance } from '../components/MonthGlance'
import { StartHere } from '../components/StartHere'
import { TodayFocus } from '../components/TodayFocus'
import { TodayBoard } from '../components/TodayBoard'
import { TourBanner } from '../components/TourEntry'
import { useAuth } from '../context/AuthContext'
import { canSeeDashboard } from '../lib/access'
import { RevenueKpis } from '../components/RevenueKpis'
import { todayChecklist, dispatchPlans, todayProgress, type CheckStatus } from '../lib/ops'
import { revenueOpportunities, clientMonthlyReport } from '../lib/insights'
import { prettyDate, today, wonShort, thisMonth } from '../lib/format'

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
  주의: { icon: AlertCircle, color: 'text-amber-600', chip: 'bg-amber-50 text-amber-600' },
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
      <ChevronRight size={18} className="shrink-0 text-navy-300" />
    </Link>
  )
}

export function Dashboard() {
  const { data } = useData()
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
  const progress = todayProgress(data)

  const vehiclePct = data.vehicles.length ? Math.round((activePlans / data.vehicles.length) * 100) : 0

  return (
    <PageShell>
      {/* 인사 — 넓은 화면에서는 제목과 날짜를 한 줄에 둡니다.
          인사말이 화면 위쪽을 크게 차지하면 정작 오늘 할 일이 아래로 밀립니다. */}
      <div className="lg:flex lg:flex-wrap lg:items-baseline lg:gap-3">
        <h1 className="t-page break-keep text-navy-900 lg:min-w-0 lg:flex-1 lg:text-[1.9rem]">
          <span className="lg:hidden">{profile ? `${profile.name}님, 오늘 할 일` : '오늘 할 일'}</span>
          <span className="hidden lg:inline">
            {profile ? `${profile.name}님, 오늘 운영 현황입니다` : '대표님 한눈에 보기'}
          </span>
        </h1>
        <p className="t-body mt-2.5 font-medium text-navy-400 lg:mt-0 lg:shrink-0">
          {prettyDate(t)} · 의료폐기물 운영관리
        </p>
      </div>

      {/*
        경영 매출 — 대표가 화면을 열자마자 보는 네 숫자.

         올해 누적 · 월평균 · 예상 연매출 · 미수금. 예전에는 이 숫자가
         어디에도 없어서 대표님이 엑셀을 다시 열어야 했습니다.
         현장 담당자에게는 열리지 않습니다(access.ts).
      */}
      {canSeeMoney && <RevenueKpis />}

      {/* ══ ① 오늘 처리할 업무 ═══════════════════════════════════════════════ */}
      <section>
        <AreaHeader
          n={1}
          icon={ListChecks}
          title="오늘 처리할 업무"
          desc="오늘 안에 확인하거나 처리해야 할 일을 먼저 보여드립니다."
        />
        {/* 실제 운영 전환 직후 — 무엇부터 해야 하는지 (다 끝나면 사라집니다) */}
        <div className="hidden lg:block">
          <StartHere data={data} />
        </div>
        <TodayFocus data={data} />
        <TodayBoard data={data} />
      </section>

      {/* 사용법 안내는 오늘 할 일 다음입니다.
          처음 오신 분께도 오늘 처리할 일이 먼저 보여야 합니다. */}
      <TourBanner />

      <AreaDivider />

      {/* ══ ② 거래처 운영상태 ════════════════════════════════════════════════ */}
      <section>
        <AreaHeader
          n={2}
          icon={Building2}
          title="거래처 운영상태"
          desc="요청·계약·자재·특이사항 등 거래처 쪽에서 지금 벌어지는 일입니다."
        />

        {/* 폰 — 숫자 두 줄과 「전체보기」로 끝냅니다 */}
        <div className="card divide-y divide-navy-50 lg:hidden">
          <PhoneRow
            to="/today"
            label="오늘 방문 거래처"
            detail="일정과 현장 메모를 함께 봅니다"
            value={`${progress.planned}곳`}
          />
          <PhoneRow
            to="/clients"
            label="거래처 전체"
            detail="계약·단가·수거 이력·월 정산"
            value={`${data.clients.length}곳`}
          />
        </div>

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
                  오늘 따로 챙길 일이 없습니다.
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
                    <ChevronRight size={18} className="shrink-0 text-navy-300" />
                  </Link>
                )
              })}
              <Link
                to="/dispatch"
                className="mt-auto flex items-center justify-center gap-1.5 border-t border-navy-50 py-4 text-[1.08rem] font-bold text-navy-600 transition hover:bg-navy-50"
              >
                차량 가동 {vehiclePct}%
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

      <AreaDivider />

      {/* ══ ③ 이번 달 경영현황 ═══════════════════════════════════════════════ */}
      <section>
        <AreaHeader
          n={3}
          icon={Wallet}
          title="이번 달 경영현황"
          desc="매출과 비용, 미수금까지 이번 달 돈의 흐름입니다."
        />
        <MonthGlance data={data} />
      </section>

      <AreaDivider />

      {/* ══ ④ 성장기회 ═══════════════════════════════════════════════════════ */}
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
          <CustomerServiceCard data={data} demo={mode !== 'live'} />
          <div className="mt-4 lg:mt-5">
            <SectionTitle size="sub" action={<span className="pill bg-accent-50 text-accent-700">데이터 기반</span>}>
              데이터 기반 다음 행동 추천
            </SectionTitle>
            <OpportunityPanel summary={opportunities} />
          </div>
        </div>
      </section>

      {/* ══ 여기부터는 사업 구조와 성과 ═══════════════════════════════════
          매일 쓰는 정보가 아니라 "이 시스템이 무엇을 하는가"입니다.
          매일 보는 화면 위쪽을 차지하지 않도록 아래로 내렸습니다. */}
      <div className="hidden lg:contents">
        <div className="flex items-center gap-3 pt-3">
          <span className="t-label whitespace-nowrap text-navy-400">사업 구조 · 도입 성과</span>
          <span className="h-px flex-1 bg-navy-200" />
        </div>

        {/* 이 시스템이 무엇을 하는지 — 데이터가 없어도 항상 읽히는 한 줄 흐름 */}
        <AxStoryStrip data={data} />

        {/* AX 도입 성과 — 자세한 측정은 성과 화면에 있으므로 여기서는 요약만 */}
        <section>
          <SectionTitle action={<span className="pill bg-accent-50 text-accent-700">실증</span>}>
            AX 도입 성과
          </SectionTitle>
          <AxSummaryCard data={data} compact />
        </section>
      </div>
    </PageShell>
  )
}
