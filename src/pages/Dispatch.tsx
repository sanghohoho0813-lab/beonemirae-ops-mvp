import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Route, Siren, Package, Target, FlaskConical, ChevronDown, ChevronRight, Truck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useData } from '../context/DataContext'
import { PageHeader } from '../components/PageHeader'
import { RouteAiButton } from '../components/RouteAiPreview'
import { WasteBadge } from '../components/Badge'
import { PageShell, SectionTitle, ExpandableSection } from '../components/ui'
import { SeparationNotice, VehicleFleetCard, FacilityCard, IsolationCard } from '../components/ops'
import { dispatchPlans, type DispatchPlan } from '../lib/ops'
import { RouteReviewCard } from '../components/RouteReviewCard'
import { today } from '../lib/format'
import { isPending } from '../lib/scheduleLive'

// ─────────────────────────────────────────────────────────────────────────────
// 배차·경로 추천 (시뮬레이션) — 특허 경로 산출부(150)/배차 추천부(160)
//  요약 → 차량별 핵심 → (펼치면) 상세. 블루/그레이 톤.
// ─────────────────────────────────────────────────────────────────────────────

function PlanCard({ p, open, onToggle }: { p: DispatchPlan; open: boolean; onToggle: () => void }) {
  return (
    <div className="card overflow-hidden">
      {/* 핵심 (항상 표시) */}
      <button onClick={onToggle} className="flex w-full items-center gap-3 p-4 text-left">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <WasteBadge type={p.wasteType} />
            <span className="min-w-0 break-keep font-bold text-navy-900">{p.vehicleName}</span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <div className="h-2 w-24 overflow-hidden rounded-full bg-navy-100">
              <div className="h-full rounded-full bg-teal-500" style={{ width: `${p.loadRate}%` }} />
            </div>
            <span className="text-[0.98rem] font-bold text-teal-600">{p.loadRate}%</span>
            <span className="break-keep text-[0.98rem] text-navy-400">· 경로 {p.stops.length}곳 · 인계 {p.handoverTime}</span>
          </div>
        </div>
        <ChevronDown size={18} className={`shrink-0 text-navy-300 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* 상세 (펼침) */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="space-y-3 border-t border-navy-100 p-4">
              <div>
                <div className="mb-1.5 flex items-center gap-1.5 text-[1.03rem] font-semibold text-navy-500">
                  <Route size={15} /> 권장 수거 순서
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {p.routeLabels.map((label, i) => (
                    <span key={label + i} className="flex items-center gap-1.5">
                      <span className={`rounded-lg px-2.5 py-1 text-[0.98rem] font-bold ${i === p.routeLabels.length - 1 ? 'bg-navy-800 text-white' : 'bg-navy-50 text-navy-700'}`}>
                        {label}
                      </span>
                      {i < p.routeLabels.length - 1 && <span className="text-navy-300">→</span>}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {p.urgentCount > 0 && (
                  <span className="flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-[0.98rem] font-bold text-rose-500">
                    <Siren size={12} /> 긴급 {p.urgentCount}건 반영
                  </span>
                )}
                {p.materialCount > 0 && (
                  <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[0.98rem] font-bold text-amber-700">
                    <Package size={12} /> 자재 동시공급 {p.materialCount}건
                  </span>
                )}
                <span className="flex items-center gap-1 rounded-full bg-teal-50 px-2.5 py-1 text-[0.98rem] font-bold text-teal-700">
                  <Target size={12} /> {p.facilityName} 인계 {p.handoverTime}
                </span>
              </div>

              {/* 추천 이유 */}
              <div>
                <p className="mb-1.5 text-[1.03rem] font-semibold text-navy-500">추천 이유</p>
                <div className="flex flex-wrap gap-1.5">
                  {/*  적혀 있던 것 중 **실제로 하지 않는 것**을 뺐습니다 —
                       「같은 권역 거래처 우선 묶음」·「수거 가능시간 반영」·
                       「기사 근무시간 고려」. 코드가 그 셋을 보지 않는데
                       화면은 봤다고 말하고 있었습니다. 권역은 아래
                       「동선 점검」이 실제 주소로 봅니다. */}
                  {[
                    `${p.wasteType} 전용 차량 분리`,
                    ...(p.urgentCount > 0 ? ['긴급수거 우선'] : []),
                    ...(p.materialCount > 0 ? ['자재 동시공급 필요'] : []),
                    '차량 적재율 고려',
                    '처리장 인계시간 고려',
                  ].map((r) => (
                    <span key={r} className="rounded-lg bg-navy-50 px-2.5 py-1 text-[0.98rem] font-semibold text-navy-600">{r}</span>
                  ))}
                </div>
              </div>

              {/*  운행거리·운행시간을 여기에 적었었습니다. 좌표가 없어 계산할 수
                   없는 값을 식으로 만들어 낸 것이었습니다 — 지웠습니다.
                   실제로 아는 것은 적재량뿐입니다. */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-2xl bg-navy-50 px-3.5 py-2.5 text-[0.98rem] font-medium text-navy-500">
                <span>실적재 약 {p.capacity.toLocaleString('ko-KR')}kg</span>
                <span>정차 {p.stops.length}곳</span>
              </div>
              <p className="text-[0.98rem] text-navy-400">
                업무보조 추천 · 관리자 최종 확인 필요 · 운행거리·소요시간은 계산하지 않습니다(거래처 좌표 없음)
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

const fleetStatusStyle: Record<string, string> = {
  '운행 중': 'bg-teal-50 text-teal-700',
  대기: 'bg-navy-100 text-navy-500',
  '정비 예정': 'bg-amber-50 text-amber-700',
  '검사 예정': 'bg-amber-50 text-amber-700',
}

export function Dispatch() {
  const { data } = useData()
  //  차가 정해지지 않은 오늘 일정은 아래 배차 추천에 아예 잡히지 않습니다.
  //  「추천 차량 0대」만 보이면 일정이 없는 것인지 배정이 안 된 것인지
  //  알 수 없어, 몇 건이 남았는지와 어디서 붙이는지를 먼저 알려 줍니다.
  const unassignedToday = data.schedules.filter(
    (s) => s.date === today() && isPending(s) && !s.vehicleId,
  ).length
  const allPlans = dispatchPlans(data)
  const plans = allPlans.filter((p) => p.stops.length > 0)
  const fleet = data.vehicles.map((v, i) => {
    const plan = allPlans.find((p) => p.vehicleId === v.id)
    const stops = plan?.stops.length ?? 0
    const loadRate = plan?.loadRate ?? 0
    const status = stops > 0 ? '운행 중' : i % 5 === 4 ? '정비 예정' : i % 5 === 3 ? '검사 예정' : '대기'
    return { v, stops, loadRate, status }
  })
  const stopCount = plans.reduce((s, p) => s + p.stops.length, 0)
  const urgentCount = plans.reduce((s, p) => s + p.urgentCount, 0)
  const materialCount = plans.reduce((s, p) => s + p.materialCount, 0)
  const [open, setOpen] = useState<string | null>(plans[0]?.vehicleId ?? null)

  return (
    <PageShell>
      <PageHeader
        title="배차·경로 추천"
        subtitle="차량 적재율·긴급수거·처리장 인계 고려"
        action={<RouteAiButton />}
      />

      {/* 히어로 */}
      <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-navy-800 to-navy-900 p-5 text-white shadow-lg">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-white/10">
            <FlaskConical size={18} className="text-teal-300" />
          </span>
          <p className="text-[1.07rem] font-bold">오늘 배차 추천 시뮬레이션</p>
        </div>
        <p className="mt-2.5 text-[1.08rem] leading-relaxed text-navy-200">
          경기 남양주시 출발 · 서울·경기권 배차. 지금 실제로 보고 있는 것은 <b className="text-white">폐기물 구분 · 예정
          수거량 · 차량 적재가능량 · 긴급수거 · 자재 동시공급 · 처리장 인계시간</b>입니다. 거래처 좌표가 없어
          거리·경로 순서·소요시간은 계산하지 않습니다.
        </p>
        <p className="mt-2 rounded-xl bg-white/10 px-3.5 py-2.5 text-[0.98rem] leading-snug text-teal-100">
          현재는 현장 규칙을 반영한 추천 시뮬레이션 단계이며, 실제 운행데이터를 축적하여 추천 로직을 고도화할 예정입니다.
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {['남양주 출발', '규칙 기반', '거리 계산 없음', '실증 예정'].map((b) => (
            <span key={b} className="rounded-full bg-white/10 px-2.5 py-1 text-[0.95rem] font-bold text-teal-200">{b}</span>
          ))}
        </div>
      </div>

      {unassignedToday > 0 && (
        <Link
          to="/plan"
          data-dispatch-unassigned
          className="card flex items-center gap-3 border-amber-200 bg-amber-50 p-4 transition hover:bg-amber-50 sm:p-5"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
            <Truck size={20} />
          </span>
          <span className="min-w-0 flex-1 text-[1.05rem] leading-relaxed text-navy-700">
            <b className="text-amber-700">오늘 차량이 정해지지 않은 일정 {unassignedToday}건</b>이 있습니다. 아래 배차 추천에는
            잡히지 않습니다 — 「일정 편성 → ② 차량 배정」에서 붙여 주세요.
          </span>
          <ChevronRight size={18} className="shrink-0 text-amber-500" />
        </Link>
      )}

      {/* 핵심 숫자 */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <div className="card p-4">
          <p className="text-[1.03rem] font-semibold text-navy-400">추천 차량</p>
          <p className="mt-1.5 text-2xl font-extrabold text-navy-900">{plans.length}<span className="ml-0.5 text-base text-navy-300">대</span></p>
        </div>
        <div className="card p-4">
          <p className="text-[1.03rem] font-semibold text-navy-400">반영 거래처</p>
          <p className="mt-1.5 text-2xl font-extrabold text-navy-900">{stopCount}<span className="ml-0.5 text-base text-navy-300">곳</span></p>
        </div>
        <div className="card p-4">
          <p className="text-[1.03rem] font-semibold text-navy-400">긴급</p>
          <p className="mt-1.5 text-2xl font-extrabold text-rose-500">{urgentCount}<span className="ml-0.5 text-base text-navy-300">건</span></p>
        </div>
        <div className="card p-4">
          <p className="text-[1.03rem] font-semibold text-navy-400">자재 동시공급</p>
          <p className="mt-1.5 text-2xl font-extrabold text-amber-700">{materialCount}<span className="ml-0.5 text-base text-navy-300">건</span></p>
        </div>
      </div>

      {/* 차량별 추천 (아코디언) */}
      <section>
        <SectionTitle>차량별 배차 추천</SectionTitle>
        <div className="grid gap-3 xl:grid-cols-2 xl:items-start">
          {plans.map((p) => (
            <PlanCard key={p.vehicleId} p={p} open={open === p.vehicleId} onToggle={() => setOpen(open === p.vehicleId ? null : p.vehicleId)} />
          ))}
          {plans.length === 0 && <div className="card p-5 text-[1.08rem] text-navy-400">오늘 배정된 차량 일정이 없습니다.</div>}
        </div>
      </section>

      {/* 동선 점검 — 실제 수거 기록의 요일 쏠림 */}
      <RouteReviewCard data={data} />

      {/* 차량 운영 상태 */}
      <section>
        <SectionTitle>차량 운영 상태</SectionTitle>
        <div className="card p-4 sm:p-5">
          <div className="space-y-2.5">
            {fleet.map(({ v, stops, loadRate, status }) => (
              <div key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl bg-navy-50 px-3.5 py-3">
                <WasteBadge type={v.wasteType} />
                <div className="min-w-0 flex-1 basis-[10rem]">
                  <p className="break-keep text-[1.08rem] font-bold text-navy-800">{v.name}</p>
                  <p className="text-[0.98rem] font-medium text-navy-500">
                    {v.driver} · 최대 {v.nominalCapacity.toLocaleString('ko-KR')}kg · 오늘 {stops}곳 · 적재율 {loadRate}%
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[0.98rem] font-bold ${fleetStatusStyle[status]}`}>{status}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 rounded-xl bg-navy-50 px-3.5 py-2.5 text-[0.98rem] leading-snug text-navy-500">
            의료폐기물 차량은 전용 용기 부피로 인해 실제 적재가 최대 적재량의 <b className="text-navy-700">약 2/3 수준</b>입니다. 이를
            반영해 배차·적재율을 계산합니다. (차량 검사·정비 일정 알림은 향후 고도화 예정)
          </p>
        </div>
      </section>

      {/* 분리 운행 + 격리 */}
      <div className="grid gap-3 xl:grid-cols-2 xl:items-start">
        <SeparationNotice />
        <IsolationCard />
      </div>

      {/* 차량/처리장 정보 (펼치기) */}
      <section>
        <SectionTitle>차량 · 처리장 정보</SectionTitle>
        <ExpandableSection label="차량·처리장 정보 자세히 보기">
          <div className="grid gap-3 xl:grid-cols-2 xl:items-start">
            <VehicleFleetCard />
            <FacilityCard />
          </div>
        </ExpandableSection>
      </section>
    </PageShell>
  )
}
