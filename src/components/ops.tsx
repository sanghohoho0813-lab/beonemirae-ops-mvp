import {
  Truck,
  Recycle,
  ShieldAlert,
  Package,
  Check,
  AlertTriangle,
  Clock,
  Factory,
  FileBadge,
  ClipboardList,
  Target,
} from 'lucide-react'
import { useData } from '../context/DataContext'
import { WasteBadge } from './Badge'
import { IconChip } from './ui'
import { dispatchPlans, materialRisks, isolationAlerts, type RiskLevel } from '../lib/ops'
import {
  FACILITIES,
  SEPARATION_NOTICE,
  ISOLATION_NOTICE,
  PATENT,
  BUSINESS_PLAN,
  OFFICE_SAVINGS,
  SELF_CHECK,
  FUTURE_PLAN,
} from '../data/ops'
import { weight } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// 운영/특허 정합성 카드 모음 (배차·경로 / 시연용 요약 / 대시보드 공용)
// ─────────────────────────────────────────────────────────────────────────────

const riskStyle: Record<RiskLevel, string> = {
  긴급: 'bg-rose-50 text-rose-500',
  주의: 'bg-amber-50 text-amber-600',
  낮음: 'bg-navy-100 text-navy-500',
}
export function RiskBadge({ level }: { level: RiskLevel }) {
  return <span className={`pill ${riskStyle[level]}`}>{level}</span>
}

// ── 분리 운행 필요 안내 ──────────────────────────────────────────────────────
export function SeparationNotice() {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2">
        <IconChip icon={Recycle} tone="teal" size={36} />
        <p className="text-[15px] font-bold text-navy-800">{SEPARATION_NOTICE.title}</p>
      </div>
      <div className="mt-3 flex gap-2">
        <WasteBadge type="의료폐기물" />
        <WasteBadge type="일회용기저귀" />
      </div>
      <ul className="mt-3 space-y-1.5">
        {SEPARATION_NOTICE.points.map((p) => (
          <li key={p} className="flex gap-2 text-sm leading-snug text-navy-600">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-navy-300" />
            {p}
          </li>
        ))}
      </ul>
      <p className="mt-3 rounded-2xl bg-navy-50 px-3.5 py-2.5 text-xs font-semibold text-navy-600">
        {SEPARATION_NOTICE.point}
      </p>
    </div>
  )
}

// ── 차량 정보 관리 (특허 130) ────────────────────────────────────────────────
export function VehicleFleetCard() {
  const { data } = useData()
  const plans = dispatchPlans(data)
  const byId = new Map(plans.map((p) => [p.vehicleId, p]))

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2">
        <IconChip icon={Truck} tone="navy" size={36} />
        <div>
          <p className="text-[15px] font-bold text-navy-800">차량 정보 관리</p>
          <p className="text-[11px] font-medium text-navy-400">특허 구성요소 130 · 폐기물 종류별 차량 분리</p>
        </div>
      </div>
      <div className="mt-3 space-y-2.5">
        {data.vehicles.map((v) => {
          const p = byId.get(v.id)
          return (
            <div key={v.id} className="rounded-2xl bg-navy-50 p-3.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <WasteBadge type={v.wasteType} />
                  <span className="truncate font-bold text-navy-800">{v.name}</span>
                </div>
                <span className="shrink-0 whitespace-nowrap text-sm font-bold text-teal-600">
                  적재율 {p?.loadRate ?? 0}%
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-navy-500">
                <span>적재 가능량 {weight(v.nominalCapacity)}</span>
                <span>실적재(약 2/3) {weight(v.expectedCapacity)}</span>
                <span>오늘 배정 {p?.stops.length ?? 0}건</span>
              </div>
            </div>
          )
        })}
      </div>
      <p className="mt-3 text-xs leading-snug text-navy-400">
        법적으로 차량·처리장·지자체 관리가 분리되어, 차량도 종류별로 분리 운영합니다.
      </p>
    </div>
  )
}

// ── 처리장/소각장 정보 관리 (특허 140) ──────────────────────────────────────
export function FacilityCard() {
  const { data } = useData()
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2">
        <IconChip icon={Factory} tone="navy" size={36} />
        <div>
          <p className="text-[15px] font-bold text-navy-800">처리장 / 소각장 정보</p>
          <p className="text-[11px] font-medium text-navy-400">특허 구성요소 140 · 인계 가능 시간</p>
        </div>
      </div>
      <div className="mt-3 space-y-2.5">
        {FACILITIES.map((f) => {
          const names = f.vehicleIds.map((id) => data.vehicles.find((v) => v.id === id)?.name).filter(Boolean)
          return (
            <div key={f.id} className="rounded-2xl bg-navy-50 p-3.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <WasteBadge type={f.wasteType} />
                  <span className="font-bold text-navy-800">{f.name}</span>
                </div>
                <span className="flex shrink-0 items-center gap-1 text-sm font-bold text-navy-600">
                  <Target size={14} /> {f.targetTime}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-navy-500">
                <span className="flex items-center gap-1"><Clock size={12} /> 인계 {f.handoverWindow}</span>
                <span>{f.region}</span>
              </div>
              <p className="mt-1.5 text-xs text-navy-400">오늘 인계 예정: {names.join(', ') || '-'}</p>
            </div>
          )
        })}
      </div>
      <p className="mt-3 text-xs leading-snug text-navy-400">
        실제 버전에서는 처리장 위치·인계시간을 연동해 경로 산출에 활용 예정.
      </p>
    </div>
  )
}

// ── 자재 소진 위험 알림 ──────────────────────────────────────────────────────
const materialColor: Record<string, string> = {
  비닐: 'text-teal-600',
  박스: 'text-navy-600',
  바늘통: 'text-rose-500',
}
export function MaterialRiskCard() {
  const { data } = useData()
  const risks = materialRisks(data)
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2">
        <IconChip icon={Package} tone="amber" size={36} />
        <div>
          <p className="text-[15px] font-bold text-navy-800">자재 소진 위험</p>
          <p className="text-[11px] font-medium text-navy-400">입고·출고·추가요청 기반 시뮬레이션</p>
        </div>
      </div>
      {risks.length === 0 ? (
        <p className="mt-3 text-sm text-navy-400">현재 소진 위험으로 표시된 거래처가 없습니다.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {risks.map((r) => (
            <li key={r.clientId} className="rounded-2xl bg-navy-50 p-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-bold text-navy-800">{r.clientName}</span>
                <RiskBadge level={r.level} />
              </div>
              <p className="mt-1 text-sm text-navy-500">
                <span className={`font-bold ${materialColor[r.material] ?? 'text-navy-600'}`}>{r.material}</span> · {r.message}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── 격리 / 긴급 수거 대응 ────────────────────────────────────────────────────
const kindIcon = { 격리: ShieldAlert, 추가수거: AlertTriangle, 자재동시공급: Package } as const
export function IsolationCard() {
  const { data } = useData()
  const alerts = isolationAlerts(data)
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2">
        <IconChip icon={ShieldAlert} tone="rose" size={36} />
        <div>
          <p className="text-[15px] font-bold text-navy-800">격리 / 긴급 수거 확인</p>
          <p className="text-[11px] font-medium text-navy-400">격리의료폐기물 보관기한 대응</p>
        </div>
      </div>
      <ul className="mt-3 space-y-2">
        {alerts.map((a) => {
          const Icon = kindIcon[a.kind]
          return (
            <li key={a.clientId} className="flex items-start gap-2.5 rounded-2xl bg-navy-50 p-3.5">
              <Icon size={18} strokeWidth={2.2} className="mt-0.5 shrink-0 text-rose-500" />
              <div className="min-w-0">
                <p className="font-bold text-navy-800">
                  {a.clientName} <span className="ml-1 text-xs font-bold text-rose-500">{a.kind}</span>
                </p>
                <p className="text-sm text-navy-500">{a.message}</p>
              </div>
            </li>
          )
        })}
      </ul>
      <div className="mt-3 space-y-1">
        {ISOLATION_NOTICE.map((n) => (
          <p key={n} className="text-xs leading-snug text-navy-400">· {n}</p>
        ))}
      </div>
    </div>
  )
}

// ── 특허 구성요소 ↔ 앱 기능 매핑 ────────────────────────────────────────────
export function PatentMappingCard() {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2">
        <IconChip icon={FileBadge} tone="navy" size={36} />
        <div>
          <p className="text-[15px] font-bold text-navy-800">특허 구성요소 매핑</p>
          <p className="text-[11px] font-medium text-navy-400">
            {PATENT.title} · {PATENT.number}
          </p>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        {PATENT.components.map((c) => (
          <div key={c.code} className="flex flex-col gap-1 rounded-2xl bg-navy-50 p-3.5 sm:flex-row sm:items-center sm:gap-3">
            <div className="flex shrink-0 items-center gap-2 sm:w-52">
              <span className="rounded-lg bg-white px-2 py-0.5 text-[11px] font-extrabold text-navy-400">{c.code}</span>
              <span className="text-sm font-bold text-navy-800">{c.name}</span>
            </div>
            <span className="text-sm text-navy-500">{c.feature}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── 사업계획서 정합성 ────────────────────────────────────────────────────────
export function BusinessPlanCard() {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2">
        <IconChip icon={ClipboardList} tone="teal" size={36} />
        <div>
          <p className="text-[15px] font-bold text-navy-800">사업계획서와 MVP 정합성</p>
          <p className="text-[11px] font-medium text-navy-400">사업계획서 방향 ↔ 앱 기능</p>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        {BUSINESS_PLAN.map((b) => (
          <div key={b.goal} className="flex items-center gap-2 rounded-2xl bg-navy-50 px-3.5 py-2.5">
            <span className="min-w-0 flex-1 text-sm font-semibold text-navy-700">{b.goal}</span>
            <span className="shrink-0 text-navy-300">→</span>
            <span className="min-w-0 flex-1 text-right text-sm font-bold text-teal-700">{b.feature}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── 사무업무 절감(기대효과) ──────────────────────────────────────────────────
export function OfficeSavingsCard() {
  return (
    <div className="card p-5">
      <p className="text-[15px] font-bold text-navy-800">이 프로그램이 줄여주는 사무업무</p>
      <p className="mt-0.5 text-[11px] font-medium text-navy-400">관리 부담 완화 · 효과는 실증 후 검증 예정</p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {OFFICE_SAVINGS.map((t) => (
          <li key={t} className="flex items-start gap-2 text-sm font-medium text-navy-600">
            <Check size={16} strokeWidth={3} className="mt-0.5 shrink-0 text-teal-600" />
            {t}
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── 현장실사 셀프 체크 ───────────────────────────────────────────────────────
export function SelfCheckCard() {
  return (
    <div className="card p-5">
      <p className="text-[15px] font-bold text-navy-800">현장실사 셀프 체크</p>
      <p className="mt-0.5 text-[11px] font-medium text-navy-400">사업계획서·특허·MVP 정합성 점검</p>
      <ul className="mt-3 space-y-2">
        {SELF_CHECK.map((t) => (
          <li key={t} className="flex items-start gap-2.5">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-50">
              <Check size={13} strokeWidth={3} className="text-teal-600" />
            </span>
            <span className="text-sm font-medium leading-snug text-navy-700">{t}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── 향후 고도화 ──────────────────────────────────────────────────────────────
export function FuturePlanCard() {
  return (
    <div className="card p-5">
      <p className="text-[15px] font-bold text-navy-800">향후 고도화</p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {FUTURE_PLAN.map((t) => (
          <li key={t} className="rounded-full bg-navy-50 px-3 py-1.5 text-xs font-bold text-navy-600">
            {t}
          </li>
        ))}
      </ul>
    </div>
  )
}
