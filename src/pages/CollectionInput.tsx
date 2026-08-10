import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Package,
  RotateCcw,
  Truck,
  ArrowRight,
} from 'lucide-react'
import { useData } from '../context/DataContext'
import { NoteChips } from '../components/SiteNotes'
import { SUPPLY_ITEMS, stockDeltaOf, itemsOf, type ItemCounts, type ItemKey } from '../lib/billing'
import { PageHeader } from '../components/PageHeader'
import { Modal } from '../components/Modal'
import { QtyField } from '../components/ui'
import { schedulesOn } from '../lib/selectors'
import { prettyDate, today, weight } from '../lib/format'
import {
  EMPTY_CONTAINERS,
  EMPTY_SUPPLIED,
  containerTotal,
  suppliedTotal,
  type CollectionCompletionInput,
} from '../lib/collection'
import type { ContainerBreakdown, HandoverStatus, OfficeStock, WasteType } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// 수거 입력 (3단계) — 현장 담당자가 한 번 입력하면 일정·이력·자재·통계로 자동 연결
//   오늘 일정 선택 → 거래처·폐기물 자동 → 실제시간·수거량 → 용기별 배출 →
//   자재 동시공급(재고 차감) → 차량·기사 → 처리장 인계 → 특이사항 → 요약 → 완료
// ─────────────────────────────────────────────────────────────────────────────

function nowTime(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const HANDOVERS: HandoverStatus[] = ['수거 완료', '인계 대기', '인계 완료']

const SUPPLY_KEYS: { key: keyof OfficeStock; label: string }[] = [
  { key: 'corrugatedBox', label: '골판지 전용박스' },
  { key: 'plasticContainer', label: '합성수지 전용용기' },
  { key: 'bag', label: '전용 봉투' },
  { key: 'needleBox', label: '합성수지 바늘통' },
]

const CONTAINER_KEYS: { key: keyof ContainerBreakdown; label: string }[] = [
  { key: 'corrugated', label: '골판지 전용박스' },
  { key: 'plastic', label: '합성수지 전용용기' },
  { key: 'bag', label: '전용 봉투' },
  { key: 'etc', label: '기타' },
]

function Section({
  n,
  title,
  desc,
  tour,
  children,
}: {
  n: number
  title: string
  desc?: string
  /** 제품 투어 대상 표시 */
  tour?: string
  children: React.ReactNode
}) {
  return (
    <div data-tour={tour} className="card p-5">
      <div className="mb-3 flex items-start gap-2.5">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-[0.98rem] font-extrabold text-teal-600">
          {n}
        </span>
        <div>
          <h2 className="text-[1.15rem] font-extrabold text-navy-900">{title}</h2>
          {desc && <p className="mt-0.5 text-[0.98rem] text-navy-400">{desc}</p>}
        </div>
      </div>
      {children}
    </div>
  )
}

export function CollectionInput() {
  const { data, completeCollection, revertCollection, notesFor, sync } = useData()
  const [params] = useSearchParams()
  // 성과측정: 이 화면에 들어온 시각. 저장 시 경과시간을 '시스템 측정값'으로 남깁니다.
  const sessionStartRef = useRef<number>(Date.now())

  // 오늘 미완료 일정 (선택 대상)
  const todayPending = useMemo(
    () => schedulesOn(data, today()).filter((s) => s.status !== '완료'),
    [data],
  )

  const [scheduleId, setScheduleId] = useState<string>('') // '' = 직접 입력
  const [clientId, setClientId] = useState('')
  const [wasteType, setWasteType] = useState<WasteType>('의료폐기물')
  const [vehicleId, setVehicleId] = useState('')
  const [driverName, setDriverName] = useState('')
  const [amount, setAmount] = useState('')
  const [time, setTime] = useState(nowTime())
  const [containers, setContainers] = useState<ContainerBreakdown>({ ...EMPTY_CONTAINERS })
  // 규격별 공급 수량. 단가가 규격마다 다르므로 여기서부터 규격으로 받습니다.
  // 재고(4칸) 차감량은 이 값에서 계산합니다 — 현장이 두 번 적지 않게.
  const [suppliedItems, setSuppliedItems] = useState<ItemCounts>({})
  const [isAdditional, setIsAdditional] = useState(false)
  const [handover, setHandover] = useState<HandoverStatus>('수거 완료')
  const [memo, setMemo] = useState('')

  const [errors, setErrors] = useState<string[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [confirmRevert, setConfirmRevert] = useState<string | null>(null)
  const [success, setSuccess] = useState<null | { client: string; amount: number; supplied: number; created: boolean }>(
    null,
  )

  const client = data.clients.find((c) => c.id === clientId)
  const vehicles = useMemo(() => data.vehicles.filter((v) => v.wasteType === wasteType), [data.vehicles, wasteType])

  // 일정 선택 시 거래처/폐기물/차량/기사/시간/수거량 자동 채움
  function applySchedule(id: string) {
    setScheduleId(id)
    setErrors([])
    setWarnings([])
    if (!id) return
    const s = data.schedules.find((x) => x.id === id)
    if (!s) return
    setClientId(s.clientId)
    setWasteType(s.wasteType)
    setVehicleId(s.vehicleId)
    const v = data.vehicles.find((x) => x.id === s.vehicleId)
    setDriverName(v?.driver ?? '')
    setTime(s.scheduledTime || nowTime())
    setAmount(String(s.expectedAmount))
  }

  // 최초 진입 시 ?schedule= 프리필 (오늘 일정 '수거 완료'에서 넘어옴)
  //
  // 실제 운영에서는 일정이 서버에서 오므로, 화면이 뜬 순간에는 아직 목록이
  // 비어 있습니다. 그때 한 번만 확인하고 끝내면 링크로 바로 들어오거나
  // 새로고침했을 때 프리필이 조용히 사라져, 현장에서 거래처·차량·시간을
  // 다시 고르게 됩니다. 그래서 일정이 도착할 때까지 기다렸다가 한 번만 채웁니다.
  const prefilledRef = useRef(false)
  useEffect(() => {
    if (prefilledRef.current) return
    const pre = params.get('schedule')
    if (!pre) {
      prefilledRef.current = true
      return
    }
    if (!data.schedules.some((s) => s.id === pre && s.status !== '완료')) return
    prefilledRef.current = true
    applySchedule(pre)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.schedules])

  // 폐기물 구분이 바뀌면 해당 구분 차량으로 기본 배차
  useEffect(() => {
    if (vehicles.length && !vehicles.some((v) => v.id === vehicleId)) {
      setVehicleId(vehicles[0].id)
      setDriverName(vehicles[0].driver)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wasteType])

  // 이 거래처에 직전에 공급한 규격별 수량.
  // 현장은 대체로 비슷한 양을 다시 채워 주므로, 한 번 눌러 채울 수 있게 합니다.
  // 근거가 있을 때만(실제 직전 기록이 있을 때만) 표시합니다.
  const lastSupply = useMemo<ItemCounts>(() => {
    if (!clientId) return {}
    const prev = data.materials
      .filter((m) => m.clientId === clientId)
      .sort((a, b) => b.date.localeCompare(a.date))[0]
    return prev ? itemsOf(prev) : {}
  }, [data.materials, clientId])

  const stock = data.officeStock
  // 규격별 입력 → 재고 4칸 차감량
  const supplied = { ...EMPTY_SUPPLIED, ...stockDeltaOf(suppliedItems) }
  const overStock = SUPPLY_KEYS.some(({ key }) => supplied[key] > stock[key])
  const suppliedSum = suppliedTotal(supplied)

  //  오늘 이 거래처의 같은 구분 수거가 이미 저장돼 있으면, 두 번째 방문은
  //  '추가 수거'로만 저장할 수 있습니다. 그런데 그 선택칸이 자재를 공급할 때만
  //  보여서, 자재 없이 다시 방문한 경우에는 화면이 시키는 대로 할 방법이
  //  없었습니다 — 저장은 막히는데 푸는 길이 화면에 없는 상태였습니다.
  const alreadyToday = useMemo(
    () =>
      data.schedules.some(
        (s) =>
          s.clientId === clientId &&
          s.wasteType === wasteType &&
          s.date === today() &&
          s.status === '완료',
      ),
    [data.schedules, clientId, wasteType],
  )
  const containerSum = containerTotal(containers)

  function buildInput(): CollectionCompletionInput {
    return {
      scheduleId: scheduleId || null,
      clientId,
      wasteType,
      vehicleId,
      driverName,
      actualAmount: Number(amount) || 0,
      actualTime: time,
      containers,
      handoverStatus: handover,
      supplied,
      suppliedItems,
      isAdditional,
      memo,
      role: '현장 담당자',
      screen: '수거 입력',
      // 성과측정(시스템 측정값): 이 화면 진입 → 저장까지의 실제 경과시간
      inputDurationMs: Date.now() - sessionStartRef.current,
    }
  }

  async function submit() {
    // 서버가 실제로 저장했는지 확인한 뒤에만 성공 화면으로 넘어갑니다.
    // (통신이 끊긴 채로 성공 화면을 보여 주면 그 수거는 사라집니다)
    const result = await completeCollection(buildInput())
    setWarnings(result.warnings)
    if (!result.ok) {
      setErrors(result.errors)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    setErrors([])
    setSuccess({
      client: client?.name ?? '거래처',
      amount: Number(amount) || 0,
      supplied: suppliedSum,
      created: !scheduleId,
    })
    // 폼 초기화
    setScheduleId('')
    setClientId('')
    setAmount('')
    setContainers({ ...EMPTY_CONTAINERS })
    setSuppliedItems({})
    setIsAdditional(false)
    setHandover('수거 완료')
    setMemo('')
    setTime(nowTime())
  }

  const canSubmit = !!clientId && Number(amount) > 0 && !!vehicleId && !overStock

  const recentEvents = data.events.slice(0, 4)

  // ── 성공 화면 ──
  // 저장 직후 기준으로 다시 계산 — 방금 저장한 건은 이미 완료로 빠집니다
  const nextPending = todayPending[0] ?? null
  const nextPendingClient = nextPending ? data.clients.find((c) => c.id === nextPending.clientId) : null

  if (success) {
    return (
      <div className="mx-auto max-w-lg">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="card mt-6 p-7 text-center"
        >
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
            <CheckCircle2 size={34} className="text-emerald-500" strokeWidth={2.2} />
          </span>
          <h2 className="mt-4 text-2xl font-extrabold text-navy-900">수거 완료가 반영되었습니다</h2>
          <p className="mt-1.5 text-[1.07rem] text-navy-500">
            {success.client} · {weight(success.amount)}
            {success.supplied > 0 && ` · 자재 ${success.supplied}점 동시공급`}
          </p>

          {/* 경고 — 저장은 됐지만 확인이 필요한 것.
              이 화면은 폼을 통째로 대신하므로, 여기에 다시 그리지 않으면
              저장에 성공한 경우 경고를 아무도 보지 못합니다. */}
          {warnings.length > 0 && (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left">
              {warnings.map((w) => (
                <p key={w} className="t-body flex items-start gap-1.5 font-semibold text-amber-700">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" /> {w}
                </p>
              ))}
            </div>
          )}

          <div className="mt-5 space-y-2 rounded-2xl bg-navy-50 p-4 text-left text-[1.08rem]">
            <p className="mb-1 text-[0.98rem] font-bold text-navy-400">한 번 입력으로 자동 연결됨</p>
            {[
              '오늘 일정 완료 처리 · 수거이력 생성',
              '거래처 최근 활동 · 월간 수거량 반영',
              success.supplied > 0 ? '자재 공급 이력 기록 · 사무실 재고 차감' : '대시보드·통계 수거량 반영',
              '처리장 인계 상태 · 수거대장/월간 명세 초안 반영',
            ].map((t) => (
              <p key={t} className="flex items-center gap-2 text-navy-700">
                <CheckCircle2 size={15} className="shrink-0 text-teal-500" /> {t}
              </p>
            ))}
          </div>

          {/* 현장에서는 저장 다음에 할 일이 하나뿐입니다 — 다음 병원으로.
              그래서 남은 일정이 있으면 그 병원을 미리 채운 버튼을 가장 크게 둡니다. */}
          {nextPending ? (
            <button
              onClick={() => {
                setSuccess(null)
                applySchedule(nextPending.id)
                window.scrollTo({ top: 0 })
              }}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-teal-500 px-5 py-4 text-[1.2rem] font-extrabold text-white shadow-sm transition active:scale-[0.98]"
            >
              다음 방문 · {nextPendingClient?.name ?? '수거 입력'}
              <ArrowRight size={20} strokeWidth={2.5} />
            </button>
          ) : (
            <p className="mt-5 rounded-2xl bg-emerald-50 px-4 py-3.5 text-[1.12rem] font-bold text-emerald-700">
              오늘 방문을 모두 마쳤습니다
            </p>
          )}

          <div className="mt-2.5 grid grid-cols-2 gap-2.5">
            <Link to="/today" className="btn-ghost">
              오늘 일정
            </Link>
            <Link to="/history" className="btn-ghost">
              수거이력
            </Link>
          </div>
          <button className="mt-3 text-[1.08rem] font-bold text-navy-500" onClick={() => setSuccess(null)}>
            + 직접 골라서 입력
          </button>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="pb-4">
      <PageHeader title="수거 입력" subtitle="한 번 입력하면 일정·이력·자재·통계에 자동 연결됩니다" />

      {/* 검증 오류 */}
      <AnimatePresence>
        {errors.length > 0 && (
          <motion.div
            className="card mb-4 border border-rose-200 bg-rose-50 p-4"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            {errors.map((e) => (
              <p key={e} className="t-body flex items-start gap-1.5 font-semibold text-rose-600">
                <AlertCircle size={16} strokeWidth={2.3} className="mt-0.5 shrink-0" /> {e}
              </p>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* PC 는 좌(입력 대상·수거량) / 우(현장 정보·저장) 2열, 모바일은 1열로 자연스럽게 내려감 */}
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start lg:gap-6">
        <div className="space-y-4">
        {/* 1. 오늘 일정 선택 */}
        <Section n={1} title="오늘 일정 선택" desc="예정된 수거를 고르면 거래처·차량이 자동 입력됩니다">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                setScheduleId('')
                setErrors([])
              }}
              className={`rounded-xl px-4 py-3 text-[1.08rem] font-bold transition active:scale-[0.97] ${
                scheduleId === '' ? 'bg-navy-900 text-white' : 'bg-navy-50 text-navy-500'
              }`}
            >
              직접 입력
            </button>
            {todayPending.map((s) => {
              const c = data.clients.find((x) => x.id === s.clientId)
              const active = scheduleId === s.id
              return (
                <button
                  key={s.id}
                  onClick={() => applySchedule(s.id)}
                  className={`rounded-xl px-3.5 py-2.5 text-left text-[1.08rem] font-bold transition active:scale-[0.97] ${
                    active ? 'bg-teal-500 text-white' : 'bg-navy-50 text-navy-700'
                  }`}
                >
                  <span className="tabular-nums">{s.scheduledTime}</span> · {c?.name ?? '거래처'}
                  {s.status === '긴급' && <span className="ml-1 text-[0.9rem] font-extrabold text-rose-400">긴급</span>}
                </button>
              )
            })}
            {todayPending.length === 0 && (
              <p className="text-[1.08rem] text-navy-400">오늘 남은 예정 수거가 없습니다. 직접 입력으로 등록하세요.</p>
            )}
          </div>
        </Section>

        {/* 2. 거래처 · 폐기물 구분 */}
        <Section n={2} title="거래처 · 폐기물 구분">
          <div className="space-y-3">
            <div>
              <label className="field-label">거래처 *</label>
              <select
                className="field-input"
                value={clientId}
                disabled={!!scheduleId}
                onChange={(e) => {
                  setClientId(e.target.value)
                  setErrors([])
                }}
              >
                <option value="">거래처를 선택하세요</option>
                {data.clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.type})
                  </option>
                ))}
              </select>
              {scheduleId && <p className="t-muted mt-1.5">선택한 일정에서 자동 지정됨</p>}
            </div>
            <div>
              <label className="field-label">폐기물 구분 *</label>
              <div className="grid grid-cols-2 gap-2">
                {(['의료폐기물', '일회용기저귀'] as WasteType[]).map((w) => (
                  <button
                    key={w}
                    disabled={!!scheduleId}
                    onClick={() => setWasteType(w)}
                    className={`rounded-2xl px-4 py-3.5 text-[1.08rem] font-bold transition active:scale-[0.97] disabled:opacity-60 ${
                      wasteType === w
                        ? w === '의료폐기물'
                          ? 'bg-rose-500 text-white shadow-sm'
                          : 'bg-teal-600 text-white shadow-sm'
                        : 'bg-navy-50 text-navy-500'
                    }`}
                  >
                    {w}
                  </button>
                ))}
              </div>
            </div>
            {client && (
              <>
                <div className="t-body rounded-2xl bg-navy-50 p-4 text-navy-500">
                  {client.address} · {client.manager} · {client.phone}
                </div>
              </>
            )}
          </div>
        </Section>

        {/* 3. 실제 수거 시간 · 수거량 */}
        <Section n={3} title="실제 수거 시간 · 수거량" tour="collect-form">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">실제 수거 시간</label>
              <input type="time" className="field-input" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
            <div>
              <label className="field-label">실제 수거량 (kg) *</label>
              <input
                type="number"
                inputMode="numeric"
                className="field-input"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value)
                  setErrors([])
                }}
                placeholder="예: 320"
              />
            </div>
          </div>
        </Section>

        {/* 4. 용기별 배출 수량 */}
        <Section n={4} title="용기별 배출 수량" desc="수거대장 초안에 그대로 반영됩니다">
          <div className="divide-y divide-navy-50">
            {CONTAINER_KEYS.map(({ key, label }) => (
              <QtyField
                key={key}
                row
                label={label}
                value={containers[key]}
                onChange={(v) => setContainers((c) => ({ ...c, [key]: v }))}
              />
            ))}
          </div>
          {containerSum > 0 && <p className="mt-2 text-[0.98rem] font-semibold text-navy-500">합계 {containerSum}개</p>}
        </Section>

        </div>

        {/* ── 우측: 현장 정보 · 자재 · 차량 · 저장 ── */}
        <div className="space-y-4">
        {/* 현장 메모 — 이 거래처에 기록해둔 특이사항 */}
        {client && notesFor(client.id).some((n) => !n.done) && (
          <div className="card p-5">
            <p className="t-label mb-1 text-navy-500">현장 메모 · 특이사항 <span className="font-medium text-navy-400">(거래처 상세에 기록해 둔 내용)</span></p>
            <NoteChips notes={notesFor(client.id)} max={4} />
          </div>
        )}

        {/* 5. 자재 동시공급 */}
        <Section n={5} title="자재 동시공급" desc="공급 시 사무실 재고에서 자동 차감됩니다 (선택)">
          {/* 규격별로 받습니다 — 63L 박스와 12L 박스는 단가가 다르고,
              그 차이가 그대로 거래처 정산·거래명세서로 갑니다. */}
          <div data-tour="collect-supply" className="divide-y divide-navy-50">
            {SUPPLY_ITEMS.map((it, si) => {
              const bucket = it.bucket!
              const over = supplied[bucket] > stock[bucket]
              const last = lastSupply[it.key] ?? 0
              const field = (
                <QtyField
                  key={it.key}
                  row
                  label={it.label}
                  value={suppliedItems[it.key] ?? 0}
                  danger={over}
                  hint={over ? `재고 ${stock[bucket]} 초과` : undefined}
                  badge={
                    <span className={`pill ${it.billable ? 'bg-teal-50 text-teal-700' : 'bg-navy-100 text-navy-500'}`}>
                      {it.billable ? '유상' : '무상'}
                    </span>
                  }
                  quick={last > 0 ? { label: '지난번', value: last } : undefined}
                  onChange={(v) =>
                    setSuppliedItems((cur) => {
                      const next = { ...cur }
                      if (v > 0) next[it.key as ItemKey] = v
                      else delete next[it.key as ItemKey]
                      return next
                    })
                  }
                />
              )
              // 폰에서는 이 목록 전체(10줄, 1000px 남짓)가 화면에 들어가지 않아
              // 투어가 강조할 수 없습니다. 첫 줄만 따로 대상으로 둡니다 —
              // 어차피 설명해야 할 것은 "규격마다 한 줄, ± 로 센다" 하나입니다.
              return si === 0 ? (
                <div key={it.key} data-tour="collect-supply-row">
                  {field}
                </div>
              ) : (
                field
              )
            })}
          </div>
          {/* 재고는 규격이 아니라 종류 단위로 관리하므로 여기서 함께 보여 줍니다 */}
          <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
            {SUPPLY_KEYS.map(({ key, label }) => (
              <span
                key={key}
                className={`t-muted tabular-nums ${supplied[key] > stock[key] ? 'font-bold text-rose-600' : ''}`}
              >
                {label} 재고 {stock[key] - supplied[key]}
                {supplied[key] > 0 && <span className="text-navy-400"> (-{supplied[key]})</span>}
              </span>
            ))}
          </div>
          {(suppliedSum > 0 || alreadyToday) && (
            <label className="mt-3 flex items-center gap-2 text-[1.08rem] font-semibold text-navy-600">
              <input
                type="checkbox"
                className="h-4 w-4 accent-teal-500"
                checked={isAdditional}
                onChange={(e) => setIsAdditional(e.target.checked)}
              />
              {alreadyToday ? '추가 수거 (오늘 이미 수거한 곳에 다시 방문)' : '추가요청 공급 (정기 외)'}
            </label>
          )}
          {overStock && (
            <p className="mt-2 flex items-center gap-1.5 text-[0.98rem] font-bold text-rose-500">
              <AlertTriangle size={13} /> 사무실 재고를 초과한 공급은 저장할 수 없습니다.
            </p>
          )}
        </Section>

        {/* 6. 차량 · 기사 */}
        <Section n={6} title="차량 · 기사">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">배차 차량 *</label>
              <select
                className="field-input"
                value={vehicleId}
                onChange={(e) => {
                  setVehicleId(e.target.value)
                  const v = data.vehicles.find((x) => x.id === e.target.value)
                  if (v) setDriverName(v.driver)
                }}
              >
                <option value="">차량 선택</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">수거 기사</label>
              <input
                className="field-input"
                value={driverName}
                onChange={(e) => setDriverName(e.target.value)}
                placeholder="기사명"
              />
            </div>
          </div>
          <p className="mt-1.5 text-[0.95rem] text-navy-400">
            {wasteType} 전용 차량만 배차할 수 있습니다 (구분 불일치 시 저장 차단).
          </p>
        </Section>

        {/* 7. 처리장 인계 상태 */}
        <Section n={7} title="처리장 인계 상태">
          <div className="grid grid-cols-3 gap-2">
            {HANDOVERS.map((h) => (
              <button
                key={h}
                onClick={() => setHandover(h)}
                className={`rounded-xl px-2 py-3 text-[1.03rem] font-bold transition active:scale-[0.97] ${
                  handover === h ? 'bg-navy-900 text-white' : 'bg-navy-50 text-navy-500'
                }`}
              >
                {h}
              </button>
            ))}
          </div>
        </Section>

        {/* 8. 특이사항 */}
        <Section n={8} title="특이사항">
          <textarea
            className="field-input"
            rows={2}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="현장 특이사항을 입력하세요 (선택)"
          />
        </Section>

        {/* 경고 (진행 가능) */}
        {warnings.length > 0 && (
          <div className="card border border-amber-200 bg-amber-50 p-4">
            {warnings.map((w) => (
              <p key={w} className="t-body flex items-start gap-1.5 font-semibold text-amber-700">
                <AlertTriangle size={15} className="mt-0.5 shrink-0" /> {w}
              </p>
            ))}
          </div>
        )}

        {/* 저장 전 요약 */}
        {canSubmit && (
          <div className="card border border-teal-100 bg-teal-50/50 p-4">
            <p className="t-label mb-2.5 flex items-center gap-1.5 text-teal-700">
              <ClipboardList size={14} /> 저장 전 확인
            </p>
            <div className="t-body grid grid-cols-2 gap-y-2 text-navy-700">
              <span className="text-navy-400">거래처</span>
              <span className="text-right font-bold">{client?.name}</span>
              <span className="text-navy-400">수거량</span>
              <span className="text-right font-bold">{weight(Number(amount) || 0)}</span>
              <span className="text-navy-400">용기 합계</span>
              <span className="text-right font-bold">{containerSum}개</span>
              <span className="text-navy-400">자재 동시공급</span>
              <span className="text-right font-bold">{suppliedSum > 0 ? `${suppliedSum}점` : '없음'}</span>
              <span className="text-navy-400">처리장 인계</span>
              <span className="text-right font-bold">{handover}</span>
            </div>
          </div>
        )}

        {/* 완료 버튼 (48px)
            저장 중에는 눌리지 않게 합니다 — 현장 모바일에서 응답이 느릴 때
            두 번 누르면 같은 수거가 두 번 올라갑니다. (DB 에서도 막지만,
            사용자가 오류 화면을 보는 것보다 아예 못 누르게 하는 편이 낫습니다) */}
        <button
          data-tour="collect-save"
          className="btn-primary w-full py-5 !text-[1.15rem] disabled:opacity-50"
          style={{ minHeight: 48 }}
          onClick={submit}
          disabled={!canSubmit || sync.saving}
        >
          {sync.saving ? (
            <>저장 중…</>
          ) : (
            <>
              <CheckCircle2 size={18} strokeWidth={2.4} /> 수거 완료 저장
            </>
          )}
        </button>
        <p className="t-muted text-center">
          작업 주체: 현장 담당자 (Demo) · 실제 적용 시 사용자별 계정·수정이력과 연동 예정
        </p>
        </div>
      </div>

      {/* 최근 입력 이력 (감사기록) */}
      {recentEvents.length > 0 && (
        <div className="mt-6">
          <p className="mb-2 px-1 text-[1.07rem] font-extrabold text-navy-800">최근 입력 이력</p>
          <div className="card divide-y divide-navy-50">
            {recentEvents.map((e) => (
              <div key={e.id} className="flex items-center gap-3 p-3.5">
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                    e.reverted ? 'bg-navy-100 text-navy-400' : 'bg-teal-50 text-teal-600'
                  }`}
                >
                  {e.materialIds.length ? <Package size={16} /> : <Truck size={16} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="break-keep text-[1.08rem] font-bold text-navy-900">
                    {e.clientName} · {weight(e.amountKg)}
                    {e.reverted && <span className="ml-1.5 text-[0.98rem] font-bold text-navy-400">취소됨</span>}
                  </p>
                  <p className="break-keep text-[0.95rem] text-navy-400">
                    {e.at.slice(5, 16).replace('T', ' ')} · {e.role} · {e.screen}
                    {e.requestUpdates.length > 0 && ` · 요청 ${e.requestUpdates.length}건 자동처리`}
                  </p>
                </div>
                {!e.reverted && (
                  <button
                    className="flex shrink-0 items-center gap-1 rounded-full bg-navy-50 px-2.5 py-1.5 text-[0.98rem] font-bold text-navy-500 transition active:scale-95"
                    onClick={() => setConfirmRevert(e.id)}
                  >
                    <RotateCcw size={12} /> 취소
                  </button>
                )}
              </div>
            ))}
          </div>
          <p className="mt-1.5 px-1 text-[0.95rem] text-navy-400">
            취소 시 일정·수거이력·자재·재고·요청 상태가 입력 전으로 되돌아갑니다.
          </p>
        </div>
      )}

      <p className="mt-6 text-center text-[0.98rem] text-navy-300">{prettyDate(today())} 기준</p>

      {/* 완료 취소 확인 모달 (시연 중 실수 방지) */}
      <Modal
        open={confirmRevert !== null}
        title="수거 완료 취소"
        onClose={() => setConfirmRevert(null)}
        footer={
          <>
            <button className="btn-ghost flex-1" onClick={() => setConfirmRevert(null)}>
              닫기
            </button>
            <button
              className="btn-primary flex-1"
              onClick={async () => {
                if (confirmRevert) {
                  const r = await revertCollection(confirmRevert)
                  if (!r.ok) setErrors(r.errors)
                }
                setConfirmRevert(null)
              }}
            >
              완료 취소
            </button>
          </>
        }
      >
        <p className="text-[1.08rem] leading-relaxed text-navy-700">
          이 수거 완료 입력을 취소하면 일정·수거이력·자재·재고·요청 상태가 입력 전으로 되돌아갑니다.
        </p>
      </Modal>
    </div>
  )
}
