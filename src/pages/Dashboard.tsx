import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  ChevronRight,
  AlertTriangle,
  AlertCircle,
  Circle,
  CheckCircle2,
  type LucideIcon,
} from 'lucide-react'
import { useData } from '../context/DataContext'
import { PageShell, SectionTitle } from '../components/ui'
import { OpportunityPanel } from '../components/Opportunities'
import { ReportHighlight } from '../components/ReportHighlight'
import { TodayClients } from '../components/TodayClients'
import { AxSummaryCard } from '../components/AxSummary'
import { AxStoryStrip } from '../components/AxStory'
import { CustomerServiceCard } from '../components/CustomerService'
import { StartHere } from '../components/StartHere'
import { TodayFocus } from '../components/TodayFocus'
import { TodayBoard } from '../components/TodayBoard'
import { TourBanner } from '../components/TourEntry'
import { useAuth } from '../context/AuthContext'
import { monthlyCollected, outstandingTotal } from '../lib/selectors'
import { todayChecklist, dispatchPlans, type CheckStatus } from '../lib/ops'
import { revenueOpportunities, clientMonthlyReport } from '../lib/insights'
import { prettyDate, today, weight, wonShort, thisMonth } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// 대시보드 — 핵심 3가지가 먼저 보이도록 구성
//  1) 한 번 입력, 여러 업무 자동 연결
//  2) 이번 달 추가 매출 기회 (데이터 기반 추천)
//  3) 병원 운영 리포트
//  4) 병원 고객이 직접 쓰는 서비스 (요청 → 처리 → 제안 → 수락)
//  그 외 운영 항목은 우선순위를 낮춰 하단에 배치합니다.
// ─────────────────────────────────────────────────────────────────────────────

const statusMeta: Record<CheckStatus, { icon: LucideIcon; color: string; chip: string }> = {
  긴급: { icon: AlertTriangle, color: 'text-rose-500', chip: 'bg-rose-50 text-rose-500' },
  주의: { icon: AlertCircle, color: 'text-amber-600', chip: 'bg-amber-50 text-amber-600' },
  정보: { icon: Circle, color: 'text-navy-500', chip: 'bg-navy-50 text-navy-500' },
  완료: { icon: CheckCircle2, color: 'text-emerald-600', chip: 'bg-emerald-50 text-emerald-600' },
}

export function Dashboard() {
  const { data } = useData()
  const { profile, mode } = useAuth()
  const t = today()
  const month = thisMonth()

  const activePlans = dispatchPlans(data).filter((p) => p.stops.length > 0).length
  const outstanding = outstandingTotal(data)

  // 오늘 챙길 일 — 중요한 3건만 노출
  const checklist = todayChecklist(data)
  // 0건인 항목은 빼고 보여 줍니다 — 화면에 남은 줄이 곧 할 일입니다.
  const topChecks = ['urgent', 'inspection', 'pending']
    .map((k) => checklist.find((c) => c.key === k))
    .filter((c): c is NonNullable<typeof c> => Boolean(c) && c!.count > 0)

  const monthly = monthlyCollected(data)
  const monthTotalKg = monthly.의료폐기물 + monthly.일회용기저귀

  const opportunities = useMemo(() => revenueOpportunities(data, month), [data, month])
  const reports = useMemo(() => data.clients.map((c) => clientMonthlyReport(data, c, month)), [data, month])

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

      {/* ── 모바일 첫 화면 — 오늘 처리할 일만 남깁니다 ─────────────────────── */}
      <TodayFocus data={data} />

      {/* ══ 아래는 넓은 화면 전용 ══════════════════════════════════════════
          폰에서는 사업 구조·매출 퍼널·통계를 첫 화면에 두지 않습니다.
          필요하면 위 「병원 서비스 · 추가 매출 · AX 성과」 링크로 들어갑니다. */}
      {/* ── 첫 화면 — 오늘 할 일과 처리할 것만 (PC) ─────────────────────── */}
      <TodayBoard data={data} />

      {/* 사용법 안내는 오늘 할 일 다음입니다.
          처음 오신 분께도 오늘 처리할 일이 먼저 보여야 합니다. */}
      <TourBanner />

      <div className="hidden lg:contents">
      {/* 실제 운영 전환 직후 — 무엇부터 해야 하는지 (다 끝나면 사라집니다) */}
      <StartHere data={data} />

      {/* 오늘 거래처 + 챙길 일 — 나란히 두어 화면 길이를 줄였습니다 */}
      <div className="grid gap-4 lg:grid-cols-2 lg:gap-5">
        <section className="flex min-w-0 flex-col">
          <SectionTitle
            action={
              <Link to="/stats" className="pill bg-navy-100 text-navy-500 transition hover:bg-navy-200">
                이번 달 {weight(monthTotalKg)}
              </Link>
            }
          >
            오늘 거래처 운영 현황
          </SectionTitle>
          <TodayClients data={data} />
        </section>

        <section className="flex min-w-0 flex-col">
          <SectionTitle>오늘 챙길 일</SectionTitle>
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
            <div className="mt-auto grid grid-cols-2 divide-x divide-navy-50 border-t border-navy-50">
              <Link
                to="/receivables"
                className="flex items-center justify-center gap-1.5 py-4 text-[1.08rem] font-bold text-navy-600 transition hover:bg-navy-50"
              >
                미수금 {wonShort(outstanding)}
              </Link>
              <Link
                to="/dispatch"
                className="flex items-center justify-center gap-1.5 py-4 text-[1.08rem] font-bold text-navy-600 transition hover:bg-navy-50"
              >
                차량 가동 {vehiclePct}%
              </Link>
            </div>
          </div>
        </section>
      </div>

      {/* ── 핵심 2 · 병원 고객 서비스 → 추가 매출 (이번 확장의 중심) ── */}
      <section>
        <SectionTitle action={<span className="pill bg-violet-50 text-violet-700">고객 서비스</span>}>
          병원 요청이 추가 매출이 되기까지
        </SectionTitle>
        <CustomerServiceCard data={data} demo={mode !== 'live'} />
      </section>

      {/* ── 핵심 3·4 · 추가 매출 기회 / 병원 운영 리포트 ── */}
      {/* 두 카드가 같은 높이로 정렬되도록 섹션을 flex 컬럼으로 두고 카드가 남는 높이를 흡수 */}
      <div className="grid gap-4 lg:grid-cols-2 lg:gap-5">
        <section className="flex min-w-0 flex-col">
          <SectionTitle action={<span className="pill bg-accent-50 text-accent-700">데이터 기반</span>}>
            데이터 기반 다음 행동 추천
          </SectionTitle>
          <div className="flex min-h-0 flex-1 flex-col">
            <OpportunityPanel summary={opportunities} />
          </div>
        </section>

        <section className="flex min-w-0 flex-col">
          <SectionTitle action={<span className="pill bg-sky-50 text-sky-700">병원 제공</span>}>
            병원에 매달 제공하는 운영 리포트
          </SectionTitle>
          <div className="flex min-h-0 flex-1 flex-col">
            <ReportHighlight reports={reports} />
          </div>
        </section>
      </div>

      {/* ══ 여기부터는 사업 구조와 성과 ═══════════════════════════════════
          매일 쓰는 정보가 아니라 "이 시스템이 무엇을 하는가"입니다.
          매일 보는 화면 위쪽을 차지하지 않도록 아래로 내렸습니다. */}
      <div className="flex items-center gap-3 pt-3">
        <span className="t-label whitespace-nowrap text-navy-400">사업 구조 · 도입 성과</span>
        <span className="h-px flex-1 bg-navy-200" />
      </div>

      {/* ── 이 시스템이 무엇을 하는지 — 데이터가 없어도 항상 읽히는 한 줄 흐름 ── */}
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
