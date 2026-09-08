import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Route, Siren, Package, Target, ChevronDown, ChevronRight, Truck, Check, Pencil, X, Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useData } from '../context/DataContext'
import { useAuth } from '../context/AuthContext'
import { PageHeader } from '../components/PageHeader'
import { AiButton } from '../components/AiAction'
import { WasteBadge } from '../components/Badge'
import { PageShell, SectionTitle, ExpandableSection } from '../components/ui'
import { SeparationNotice, VehicleFleetCard, FacilityCard, IsolationCard } from '../components/ops'
import { dispatchPlans, type DispatchPlan } from '../lib/ops'
import { RouteReviewCard } from '../components/RouteReviewCard'
import { today } from '../lib/format'
import { isPending } from '../lib/scheduleLive'
import { useSchemaAtLeast } from '../lib/schemaGate'
import { recordDispatchDecision } from '../lib/evidenceRepo'
import type { DispatchDecision } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// 배차·경로 — 규칙 기반 제안 + 담당자의 결정 기록 (0106)
//
//  규칙이 보는 것: 폐기물 구분 · 예정 수거량 · 차량 적재가능량 · 긴급수거 ·
//  자재 동시공급 · 처리장 인계시간. **AI 가 아니고**, 거래처 좌표가 없어
//  거리·경로 순서·소요시간은 계산하지 않습니다.
//
//  0106 에서 더한 것 — 제안을 담당자가 **적용했는지 · 왜 바꿨는지 · 그날
//  결과가 어땠는지**가 남습니다. 제안만 있고 결정이 없으면 「추천이 쓸모
//  있었나」에 답할 수 없습니다. 결과는 따로 적지 않고 그날 완료 일정에서
//  셉니다 — 같은 값을 두 번 저장하지 않습니다.
//
//  ⚠ 예전에 차량 상태를 배열 순서로 「정비 예정 / 검사 예정」이라고 만들어
//    보여 줬습니다. 지어낸 값이라 지웠습니다. 아는 것은 「오늘 일정이 있다 /
//    없다」뿐입니다.
// ─────────────────────────────────────────────────────────────────────────────

const RULE = '규칙 v1 — 폐기물 구분·적재율·긴급·자재·인계시간 (거리 계산 없음)'

const DECISION_LABEL: Record<DispatchDecision['decision'], string> = {
  applied: '이대로 적용',
  modified: '수정해서 적용',
  rejected: '적용 안 함',
}
const DECISION_STYLE: Record<DispatchDecision['decision'], string> = {
  applied: 'bg-teal-50 text-teal-700',
  modified: 'bg-amber-50 text-amber-700',
  rejected: 'bg-rose-50 text-rose-700',
}

function PlanCard({
  p,
  open,
  onToggle,
  decision,
  result,
  canDecide,
  onDecide,
}: {
  p: DispatchPlan
  open: boolean
  onToggle: () => void
  decision: DispatchDecision | null
  result: { planned: number; done: number }
  canDecide: boolean
  onDecide: (d: DispatchDecision['decision'], reason: string) => Promise<void>
}) {
  const [picking, setPicking] = useState<DispatchDecision['decision'] | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(d: DispatchDecision['decision']) {
    if ((d === 'modified' || d === 'rejected') && !reason.trim()) {
      setError('왜 바꾸는지(또는 안 쓰는지) 한 줄 적어 주세요 — 규칙을 고칠 근거가 됩니다.')
      return
    }
    setBusy(true); setError(null)
    try {
      await onDecide(d, reason)
      setPicking(null); setReason('')
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했습니다.')
    }
    setBusy(false)
  }

  return (
    <div data-dispatch-plan={p.vehicleId} className="card overflow-hidden">
      <button onClick={onToggle} className="flex w-full items-center gap-3 p-4 text-left">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <WasteBadge type={p.wasteType} />
            <span className="min-w-0 break-keep font-bold text-navy-900">{p.vehicleName}</span>
            {decision && (
              <span data-dispatch-decision={p.vehicleId} className={`pill ${DECISION_STYLE[decision.decision]}`}>
                {DECISION_LABEL[decision.decision]}
              </span>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <div className="h-2 w-24 overflow-hidden rounded-full bg-navy-100">
              <div className="h-full rounded-full bg-teal-500" style={{ width: `${p.loadRate}%` }} />
            </div>
            <span className="text-[0.98rem] font-bold text-teal-600">{p.loadRate}%</span>
            <span className="break-keep text-[0.98rem] text-navy-400">· 정차 {p.stops.length}곳 · 인계 {p.handoverTime}</span>
            <span data-dispatch-result={p.vehicleId} className="break-keep text-[0.98rem] font-bold text-navy-600">
              · 오늘 결과 {result.done}/{result.planned}곳 완료
            </span>
          </div>
        </div>
        <ChevronDown size={18} className={`shrink-0 text-navy-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

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
                  <Route size={15} /> 제안 순서 (예정 시간순 — 거리 최적화가 아닙니다)
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {p.routeLabels.map((label, i) => (
                    <span key={label + i} className="flex items-center gap-1.5">
                      <span className={`rounded-lg px-2.5 py-1 text-[0.98rem] font-bold ${i === p.routeLabels.length - 1 ? 'bg-navy-800 text-white' : 'bg-navy-50 text-navy-700'}`}>
                        {label}
                      </span>
                      {i < p.routeLabels.length - 1 && <span className="text-navy-400">→</span>}
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

              <div>
                <p className="mb-1.5 text-[1.03rem] font-semibold text-navy-500">규칙이 본 것</p>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    `${p.wasteType} 전용 차량 분리`,
                    ...(p.urgentCount > 0 ? ['긴급수거 우선'] : []),
                    ...(p.materialCount > 0 ? ['자재 동시공급 필요'] : []),
                    '차량 적재율',
                    '처리장 인계시간',
                  ].map((r) => (
                    <span key={r} className="rounded-lg bg-navy-50 px-2.5 py-1 text-[0.98rem] font-semibold text-navy-600">{r}</span>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-2xl bg-navy-50 px-3.5 py-2.5 text-[0.98rem] font-medium text-navy-500">
                <span>실적재 약 {p.capacity.toLocaleString('ko-KR')}kg</span>
                <span>정차 {p.stops.length}곳</span>
              </div>

              {/* ── 담당자 결정 ─────────────────────────────────────────── */}
              <div data-dispatch-decide={p.vehicleId} className="rounded-2xl border border-navy-100 p-3.5">
                {decision ? (
                  <div>
                    <p className="t-body break-keep font-bold text-navy-800">
                      {decision.decidedName || '담당자'} · {DECISION_LABEL[decision.decision]}
                      {decision.reason && <span className="font-medium text-navy-500"> — {decision.reason}</span>}
                    </p>
                    <p className="t-caption mt-1 break-keep text-navy-500">
                      결과: 예정 {result.planned}곳 중 {result.done}곳 완료 (그날 완료 일정에서 셉니다 · 저녁에 채워집니다)
                    </p>
                    {canDecide && !picking && (
                      <button onClick={() => setPicking('modified')} className="btn-ghost mt-2 min-h-[2.5rem] px-2.5 text-[0.98rem]">
                        결정 바꾸기
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="t-body break-keep font-bold text-navy-800">이 제안을 어떻게 하셨나요?</p>
                )}
                {canDecide && (!decision || picking) && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button data-dispatch-apply={p.vehicleId} onClick={() => void submit('applied')} disabled={busy} className="btn-navy min-h-[2.75rem]">
                      {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} strokeWidth={2.6} />} 이대로 적용
                    </button>
                    <button data-dispatch-modify={p.vehicleId} onClick={() => setPicking('modified')} disabled={busy} className="btn-ghost min-h-[2.75rem]">
                      <Pencil size={16} strokeWidth={2.4} /> 수정해서 적용
                    </button>
                    <button data-dispatch-reject={p.vehicleId} onClick={() => setPicking('rejected')} disabled={busy} className="btn-ghost min-h-[2.75rem]">
                      <X size={16} strokeWidth={2.4} /> 적용 안 함
                    </button>
                  </div>
                )}
                {canDecide && picking && picking !== 'applied' && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input
                      data-dispatch-reason={p.vehicleId}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder={picking === 'rejected' ? '왜 안 쓰나요? 예: 병원 요청시간이 맞지 않음' : '무엇을 바꿨나요? 예: 순서 변경 — 인계시간'}
                      className="input min-w-0 flex-1"
                      maxLength={200}
                    />
                    <button data-dispatch-reason-save={p.vehicleId} onClick={() => void submit(picking)} disabled={busy} className="btn-navy min-h-[2.75rem]">
                      저장
                    </button>
                    <button onClick={() => { setPicking(null); setReason('') }} className="btn-ghost min-h-[2.75rem]">취소</button>
                  </div>
                )}
                {error && <p data-dispatch-error className="t-caption mt-2 font-bold text-rose-600">{error}</p>}
                {!canDecide && !decision && (
                  <p className="t-caption mt-1 break-keep text-navy-500">
                    결정 기록은 사무실·관리자 계정에서, 판 106 이후에 남길 수 있습니다.
                  </p>
                )}
              </div>

              <p className="text-[0.98rem] text-navy-400">
                {RULE} · 관리자 최종 확인 필요
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function Dispatch() {
  const { data, reload } = useData()
  const { role, profile, mode } = useAuth()
  const ready106 = useSchemaAtLeast(106)
  const t = today()
  const canDecide = mode === 'live' && ready106 === true && (role === 'admin' || role === 'office')

  const unassignedToday = data.schedules.filter((s) => s.date === t && isPending(s) && !s.vehicleId).length
  const allPlans = dispatchPlans(data)
  const plans = allPlans.filter((p) => p.stops.length > 0)
  const fleet = data.vehicles.map((v) => {
    const plan = allPlans.find((p) => p.vehicleId === v.id)
    return { v, stops: plan?.stops.length ?? 0, loadRate: plan?.loadRate ?? 0 }
  })
  const stopCount = plans.reduce((s, p) => s + p.stops.length, 0)
  const urgentCount = plans.reduce((s, p) => s + p.urgentCount, 0)
  const materialCount = plans.reduce((s, p) => s + p.materialCount, 0)
  const [open, setOpen] = useState<string | null>(plans[0]?.vehicleId ?? null)

  const decisionOf = (vehicleId: string): DispatchDecision | null =>
    (data.dispatchDecisions ?? []).find((d) => d.date === t && d.vehicleId === vehicleId) ?? null
  const resultOf = (vehicleId: string) => {
    const mine = data.schedules.filter((s) => s.date === t && s.vehicleId === vehicleId && !s.canceledAt)
    return { planned: mine.length, done: mine.filter((s) => s.status === '완료').length }
  }
  const decided = plans.filter((p) => decisionOf(p.vehicleId)).length

  async function decide(p: DispatchPlan, decision: DispatchDecision['decision'], reason: string) {
    await recordDispatchDecision({
      date: t,
      vehicleId: p.vehicleId,
      vehicleName: p.vehicleName,
      proposal: { stops: p.stops.map((s) => s.clientName), loadRate: p.loadRate, urgentCount: p.urgentCount, materialCount: p.materialCount, rule: RULE },
      decision,
      reason,
      decidedName: profile?.name ?? '',
    })
    await reload()
  }

  return (
    <PageShell>
      <PageHeader
        title="배차·경로"
        subtitle="규칙 기반 제안 (AI 아님) · 거리·경로 순서·소요시간은 계산하지 않습니다 (거래처 좌표 없음)"
        action={<AiButton id="route" />}
      />

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
            <b className="text-amber-700">오늘 차량이 정해지지 않은 일정 {unassignedToday}건</b>이 있습니다. 아래 제안에는
            잡히지 않습니다 — 「일정 편성 → ② 차량 배정」에서 붙여 주세요.
          </span>
          <ChevronRight size={18} className="shrink-0 text-amber-700" />
        </Link>
      )}

      {/* 핵심 숫자 */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <div className="card p-4">
          <p className="text-[1.03rem] font-semibold text-navy-400">제안 차량</p>
          <p className="mt-1.5 text-2xl font-extrabold text-navy-900">{plans.length}<span className="ml-0.5 text-base text-navy-400">대</span></p>
        </div>
        <div className="card p-4">
          <p className="text-[1.03rem] font-semibold text-navy-400">반영 거래처</p>
          <p className="mt-1.5 text-2xl font-extrabold text-navy-900">{stopCount}<span className="ml-0.5 text-base text-navy-400">곳</span></p>
        </div>
        <div className="card p-4">
          <p className="text-[1.03rem] font-semibold text-navy-400">긴급</p>
          <p className="mt-1.5 text-2xl font-extrabold text-rose-500">{urgentCount}<span className="ml-0.5 text-base text-navy-400">건</span></p>
        </div>
        <div className="card p-4">
          <p className="text-[1.03rem] font-semibold text-navy-400">결정 기록</p>
          <p data-dispatch-decided className="mt-1.5 text-2xl font-extrabold text-navy-900">{decided}<span className="ml-0.5 text-base text-navy-400">/{plans.length}대</span></p>
        </div>
      </div>

      {/* 차량별 제안 (아코디언) */}
      <section>
        <SectionTitle action={<span className="pill bg-navy-100 text-navy-500">규칙 기반 · AI 아님</span>}>
          차량별 배차 제안 — 담당자가 적용 · 수정 · 거절을 남깁니다
        </SectionTitle>
        <div className="grid gap-3 xl:grid-cols-2 xl:items-start">
          {plans.map((p) => (
            <PlanCard
              key={p.vehicleId}
              p={p}
              open={open === p.vehicleId}
              onToggle={() => setOpen(open === p.vehicleId ? null : p.vehicleId)}
              decision={decisionOf(p.vehicleId)}
              result={resultOf(p.vehicleId)}
              canDecide={canDecide}
              onDecide={(d, r) => decide(p, d, r)}
            />
          ))}
          {plans.length === 0 && <div className="card p-5 text-[1.08rem] text-navy-400">오늘 배정된 차량 일정이 없습니다.</div>}
        </div>
        {materialCount > 0 && (
          <p className="t-muted mt-2 px-1">자재 동시공급 {materialCount}건이 오늘 제안에 반영돼 있습니다.</p>
        )}
        {ready106 === false && mode === 'live' && (
          <p data-dispatch-gate className="t-muted mt-2 break-keep px-1">
            결정 기록 표가 아직 없습니다 — PROPOSAL_0106_evidence.sql 실행 후 「이대로 적용 · 수정 · 적용 안 함」이 남습니다.
          </p>
        )}
      </section>

      <RouteReviewCard data={data} />

      {/* 차량 운영 상태 — 아는 것만: 오늘 일정이 있는가 */}
      <section>
        <SectionTitle>차량 운영 상태</SectionTitle>
        <div className="card p-4 sm:p-5">
          <div className="space-y-2.5">
            {fleet.map(({ v, stops, loadRate }) => (
              <div key={v.id} data-fleet-row={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl bg-navy-50 px-3.5 py-3">
                <WasteBadge type={v.wasteType} />
                <div className="min-w-0 flex-1 basis-[10rem]">
                  <p className="break-keep text-[1.08rem] font-bold text-navy-800">{v.name}</p>
                  <p className="text-[0.98rem] font-medium text-navy-500">
                    {v.driver} · 최대 {v.nominalCapacity.toLocaleString('ko-KR')}kg · 오늘 {stops}곳 · 적재율 {loadRate}%
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[0.98rem] font-bold ${stops > 0 ? 'bg-teal-50 text-teal-700' : 'bg-navy-100 text-navy-500'}`}>
                  {stops > 0 ? '오늘 운행' : '오늘 일정 없음'}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 rounded-xl bg-navy-50 px-3.5 py-2.5 text-[0.98rem] leading-snug text-navy-500">
            의료폐기물 차량은 전용 용기 부피로 인해 실제 적재가 최대 적재량의 <b className="text-navy-700">약 2/3 수준</b>입니다. 이를
            반영해 적재율을 계산합니다. 정비·검사 일정은 시스템에 없습니다 — 있는 것처럼 표시하지 않습니다.
          </p>
        </div>
      </section>

      <div className="grid gap-3 xl:grid-cols-2 xl:items-start">
        <SeparationNotice />
        <IsolationCard />
      </div>

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
