import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
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
  CalendarPlus,
  ChevronDown,
} from 'lucide-react'
import { nowHm } from '../lib/format'
import { addDays } from '../lib/performance'
import { checkAmount, checkItemCounts, itemCheckMessage } from '../lib/amountCheck'
import { useData } from '../context/DataContext'
import { useAuth } from '../context/AuthContext'
import { canAccess } from '../lib/access'
import { NoteChips } from '../components/SiteNotes'
import { SUPPLY_ITEMS, stockDeltaOf, itemsOf, type ItemCounts, type ItemKey } from '../lib/billing'
import { PageHeader } from '../components/PageHeader'
import { Modal } from '../components/Modal'
import { BookVisitModal } from '../components/BookVisit'
import { QtyField } from '../components/ui'
import { TimeField } from '../components/TimeField'
import { WasteBadge } from '../components/Badge'
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
import { isPending } from '../lib/scheduleLive'

// ─────────────────────────────────────────────────────────────────────────────
// 수거 입력 (3단계) — 현장 담당자가 한 번 입력하면 일정·이력·자재·통계로 자동 연결
//   오늘 일정 선택 → 거래처·폐기물 자동 → 실제시간·수거량 → 용기별 배출 →
//   자재 동시공급(재고 차감) → 차량·기사 → 처리장 인계 → 특이사항 → 요약 → 완료
// ─────────────────────────────────────────────────────────────────────────────

//  저장되는 값이므로 기기 시각이 아니라 한국 시각을 씁니다 (lib/format).
const nowTime = nowHm

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

/**
 *  ── 폰에서 접는 칸 (0065) ──────────────────────────────────────────────────
 *
 *   기사님이 한 건을 넣을 때 실제로 **바꾸는 값은 수거량 하나**입니다.
 *   시간·용기·자재·인계·특이사항은 기본값 그대로 저장되는 날이 대부분인데,
 *   여덟 칸이 전부 펼쳐져 있어 저장 단추까지 네 번을 밀어야 했습니다.
 *
 *   그래서 **기본값 그대로인 칸만** 한 줄로 접습니다.
 *
 *   ⚠ 두 가지를 지킵니다.
 *     ① 접힌 칸도 **값은 그대로 저장됩니다.** 화면에서만 감춥니다(`hidden`).
 *        지우는 것이 아니라 안 보이게 하는 것입니다.
 *     ② 값이 기본과 다르면 **저절로 펼칩니다.** 넣어 둔 것이 접힌 채로
 *        숨는 일이 없어야 합니다 — 그러면 「분명히 적었는데」가 생깁니다.
 *
 *   넓은 화면(sm 이상)은 지금까지와 똑같이 전부 펼쳐 둡니다. 사무실은
 *   마우스로 보고, 접는 것이 오히려 손이 더 갑니다.
 */
type Fold = {
  /** 펼쳐져 있는가 — 부모가 「기본값과 다르면 true」로 계산해서 넘깁니다 */
  open: boolean
  onOpen: () => void
  /** 접힌 줄 오른쪽에 지금 값을 적습니다 — 열지 않아도 무엇으로 저장되는지 보이게 */
  summary: React.ReactNode
  id: string
}

function Section({
  n,
  title,
  desc,
  tour,
  guideAt,
  fold,
  children,
}: {
  n: number
  title: string
  desc?: string
  /** 제품 투어 대상 표시 */
  tour?: string
  /** 사용 안내(0069)가 짚는 자리 */
  guideAt?: string
  fold?: Fold
  children: React.ReactNode
}) {
  const folded = !!fold && !fold.open
  return (
    <div data-tour={tour} data-guide={guideAt} className="card">
      {folded && (
        <button
          type="button"
          data-fold={fold.id}
          onClick={fold.onOpen}
          className="flex min-h-[3.5rem] w-full items-center gap-2.5 px-4 py-3 text-left transition active:scale-[0.99] sm:hidden"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-[0.98rem] font-extrabold text-teal-600">
            {n}
          </span>
          <span className="min-w-0 break-keep text-[1.1rem] font-extrabold text-navy-900">{title}</span>
          <span
            data-fold-summary={fold.id}
            className="ml-auto flex shrink-0 items-center gap-1 text-[1.02rem] font-bold text-navy-500"
          >
            {fold.summary}
            <ChevronDown size={16} strokeWidth={2.4} />
          </span>
        </button>
      )}
      <div className={folded ? 'hidden p-5 sm:block' : 'p-5'}>
        <div className="mb-3 flex items-start gap-2.5">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-[0.98rem] font-extrabold text-teal-600">
            {n}
          </span>
          <div>
            <h2 className="text-[1.15rem] font-extrabold text-navy-900">{title}</h2>
            {/*  ⚠ 0069 — 설명 줄 색을 기준(4.5:1) 위로 올립니다 */}
            {desc && <p className="mt-0.5 text-[0.98rem] text-navy-500">{desc}</p>}
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}

export function CollectionInput() {
  const { data, completeCollection, revertCollection, notesFor, sync, setRetryHandler, clearSyncError } = useData()
  const { configured, role, profile } = useAuth()
  //  시연 모드(설정 없음)에서는 기존과 동일하게 전부 보입니다.
  const canGoHistory = !configured || canAccess(role, '/history')
  const [params] = useSearchParams()
  // 성과측정: 이 화면에 들어온 시각. 저장 시 경과시간을 '시스템 측정값'으로 남깁니다.
  const sessionStartRef = useRef<number>(Date.now())

  // 오늘 미완료 일정 (선택 대상)
  const todayPending = useMemo(
    () => schedulesOn(data, today()).filter(isPending),
    [data],
  )

  const [scheduleId, setScheduleId] = useState<string>('') // '' = 직접 입력
  //  일정을 고른 뒤 ①② 를 다시 펼쳤는지 — 「다른 일정 고르기」를 누르면 켜집니다.
  const [pickOpen, setPickOpen] = useState(false)
  const [clientId, setClientId] = useState('')
  //  방문 예약은 사무실·관리자만입니다 (서버도 같은 기준으로 막습니다).
  const canBook = role === 'admin' || role === 'office' || !configured
  const [bookOpen, setBookOpen] = useState(false)
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
  //  ── 다녀온 날 (0061) ────────────────────────────────────────────────────
  //   기본은 오늘입니다. 저녁이나 다음 날 아침에 넣을 때 실제로 간 날로
  //   바꿉니다 — 안 그러면 월말에 하루치가 다음 달 매출이 됩니다.
  const [visitDate, setVisitDate] = useState(today())
  const [handover, setHandover] = useState<HandoverStatus>('수거 완료')
  const [memo, setMemo] = useState('')

  const navigate = useNavigate()
  const [errors, setErrors] = useState<string[]>([])
  //  「이미 저장돼 있다」는 빨간 실패가 아니라 안심시켜야 할 안내입니다.
  const [dupNotice, setDupNotice] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [confirmRevert, setConfirmRevert] = useState<string | null>(null)
  const [success, setSuccess] = useState<null | { client: string; amount: number; supplied: number; created: boolean }>(
    null,
  )

  const client = data.clients.find((c) => c.id === clientId)
  //  지금 고른 예정 일정 — 「지금 이 병원」 카드가 이 값을 씁니다.
  const picked = scheduleId ? todayPending.find((s) => s.id === scheduleId) ?? null : null
  const vehicles = useMemo(() => data.vehicles.filter((v) => v.wasteType === wasteType), [data.vehicles, wasteType])

  // ── 내 차량 (0056) ─────────────────────────────────────────────────────────
  //
  //  대표님 말씀: "각각 그 수거 기사인지, 이름이 뭔지, 몇 호차인지 이거는 굳이
  //  입력할 필요는 없을 것 같고."
  //
  //  관리자가 계정에 차량을 묶어 두면 여기서 그 차량을 씁니다. 이름은 **로그인한
  //  본인**에서 옵니다 — 차량에 적힌 기본 기사가 아닙니다. 오늘 그 차로 나간
  //  사람이 대타일 수 있고, 그러면 기록에 안 간 사람 이름이 남습니다.
  const myVehicle = useMemo(
    () => (profile?.vehicleId ? (data.vehicles.find((v) => v.id === profile.vehicleId) ?? null) : null),
    [data.vehicles, profile?.vehicleId],
  )
  //  묶인 차량이 지금 고른 구분과 다르면(의료폐기물 차인데 기저귀 수거) 자동으로
  //  쓰지 않습니다. 구분이 안 맞는 차는 어차피 저장이 막힙니다.
  const boundVehicle = myVehicle && myVehicle.wasteType === wasteType ? myVehicle : null
  //  「오늘은 다른 차로 갔다」를 적을 길은 남겨 둡니다. 이 길이 없으면 대타로
  //  나간 날 기록이 통째로 틀립니다.
  const [showVehiclePick, setShowVehiclePick] = useState(false)

  //  ── 현장은 차량을 아예 고르지 않습니다 (0067) ───────────────────────────
  //
  //   대표님 말씀: 「기사님이 생각하거나 선택해야 할 항목을 최대한 없애는 것」.
  //
  //   기사님은 늘 같은 차로 나갑니다. 관리자가 계정에 차량을 묶어 두면
  //   (설정 → 사용자 → 담당 차량) 그 차로 저장됩니다. 이름은 **로그인한
  //   본인**입니다 — 차량에 적힌 기본 기사가 아닙니다. 오늘 그 차로 나간
  //   사람이 대타일 수 있고, 그러면 안 간 사람 이름이 기록에 남습니다.
  //
  //   ⚠ 사무실·관리자 화면은 그대로 고릅니다. 사무실은 여러 차를 대신
  //     입력하는 자리라, 고르는 칸을 없애면 일이 안 됩니다.
  const autoVehicle = role === 'field' && configured
  //  묶인 차가 없으면 저장 직전에 막습니다 (아래 canSubmit·submit).
  const noVehicleForField = autoVehicle && !myVehicle
  const vehicleHidden = !!boundVehicle && !showVehiclePick

  useEffect(() => {
    if (!vehicleHidden || !boundVehicle) return
    if (vehicleId !== boundVehicle.id) setVehicleId(boundVehicle.id)
    const mine = (profile?.name ?? '').trim()
    if (mine && driverName !== mine) setDriverName(mine)
  }, [vehicleHidden, boundVehicle, vehicleId, driverName, profile?.name])

  //  현장 계정 — 고르는 칸이 없으므로 여기서 값을 채웁니다.
  //  ⚠ 구분이 안 맞는 차(의료폐기물 차인데 기저귀 수거)는 서버가 저장을
  //    막습니다. 그때는 채우지 않고 비워 둬서, 아래 안내가 뜨게 합니다.
  useEffect(() => {
    if (!autoVehicle) return
    const use = myVehicle && myVehicle.wasteType === wasteType ? myVehicle : null
    const nextId = use ? use.id : ''
    if (vehicleId !== nextId) setVehicleId(nextId)
    const mine = (profile?.name ?? '').trim()
    if (mine && driverName !== mine) setDriverName(mine)
  }, [autoVehicle, myVehicle, wasteType, vehicleId, driverName, profile?.name])

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
    //  ⚠ 현장 계정은 차량을 **고르지 않습니다** — 위 자동 채움(0067)이 담당합니다.
    //
    //    여기서 일정에 적힌 차량으로 덮으면 안 됩니다. 예정 일정은 대개
    //    차량이 비어 있어서(null) 빈 값으로 덮이는데, 자동 채움은 이미
    //    같은 묶음에서 끝난 뒤입니다. 그러면 상태가 「빈 값 → 3호차 → 빈 값」
    //    으로 한 번에 처리돼 **바뀐 것이 없는 셈**이 되고, 자동 채움이 다시
    //    돌지 않아 차량이 영영 비어 있게 됩니다. 저장 단추가 계속 꺼져 있어
    //    기사님은 이유도 모른 채 저장을 못 합니다.
    //
    //    ⚠ 이 길은 「오늘 일정 → 병원 줄 → 수거 입력」입니다. 자료가 이미
    //      들어와 있을 때만 이렇게 되므로, 주소창에 직접 쳐서 들어가는
    //      시험에서는 드러나지 않습니다. 기사님의 실제 길이 그 길입니다.
    if (!autoVehicle) {
      setVehicleId(s.vehicleId)
      const v = data.vehicles.find((x) => x.id === s.vehicleId)
      setDriverName(v?.driver ?? '')
    }
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

    //  ?client= 로 들어오는 길 — 거래처 화면에서 「수거 입력」을 누른 경우입니다.
    //
    //   예전에는 이 길이 없어서, 거래처를 보다가 「이 병원 오늘 수거했다」를
    //   적으려면 왼쪽 메뉴로 나갔다가 목록에서 그 병원을 다시 찾아야 했습니다.
    //   거래처가 100곳 가까이 되면 그게 매번 일입니다.
    //
    //   그 병원의 **오늘 예정이 있으면** 그 일정을 그대로 씁니다(차량·시간까지
    //   따라옵니다). 없으면 거래처만 채우고 나머지는 사람이 고릅니다 —
    //   차량·시간을 짐작으로 채우면 그 값이 그대로 기록에 남습니다.
    const preClient = params.get('client')
    if (!pre && preClient) {
      if (data.clients.length === 0) return // 아직 안 받아왔습니다 — 기다립니다
      prefilledRef.current = true
      const mine = todayPending.find((s) => s.clientId === preClient)
      if (mine) {
        applySchedule(mine.id)
      } else if (data.clients.some((c) => c.id === preClient)) {
        setScheduleId('')
        setClientId(preClient)
      }
      return
    }

    if (!pre) {
      prefilledRef.current = true
      return
    }
    if (!data.schedules.some((s) => s.id === pre && isPending(s))) return
    prefilledRef.current = true
    applySchedule(pre)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.schedules, data.clients])

  // 폐기물 구분이 바뀌면 해당 구분 차량으로 기본 배차
  useEffect(() => {
    //  현장은 위 자동 채움이 담당합니다 — 여기서 아무 차나 잡으면 본인 차가
    //  아닌 차로 저장됩니다.
    if (autoVehicle) return
    if (vehicles.length && !vehicles.some((v) => v.id === vehicleId)) {
      setVehicleId(vehicles[0].id)
      setDriverName(vehicles[0].driver)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wasteType, autoVehicle])

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

  //  폰에서 자재 목록을 접습니다 — 지난번에 준 규격과 값이 들어간 줄만
  //  펼쳐 둡니다. 한 번 펼치면 그 입력이 끝날 때까지 그대로 둡니다.
  const [showAllItems, setShowAllItems] = useState(false)
  const hiddenItemCount = showAllItems
    ? 0
    : SUPPLY_ITEMS.filter((it) => (lastSupply[it.key] ?? 0) === 0 && (suppliedItems[it.key] ?? 0) === 0).length

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

  //  ── 접힘 상태 (0065) ────────────────────────────────────────────────────
  //   「기사님이 손대는 칸」만 펼쳐 둡니다. 기본값 그대로면 한 줄로 접습니다.
  //   ⚠ open 계산에 **값 조건**을 함께 넣습니다. 그래야 넣어 둔 값이 접힌 채로
  //     숨지 않습니다 — 접기는 보여 주기일 뿐, 저장은 그대로 됩니다.
  const [openTime, setOpenTime] = useState(false)
  const [openContainers, setOpenContainers] = useState(false)
  const [openSupply, setOpenSupply] = useState(false)
  const [openHandover, setOpenHandover] = useState(false)
  const [openMemo, setOpenMemo] = useState(false)
  const [openRecent, setOpenRecent] = useState(false)

  //  ── 단계 번호는 **그려진 순서대로** 매깁니다 (0067) ──────────────────────
  //   현장 화면에서는 「차량·기사」 칸이 통째로 빠집니다. 번호를 손으로 박아
  //   두면 5 다음에 7 이 나와서, 기사님은 **빠진 단계를 찾습니다.**
  //   JSX 는 위에서 아래로 평가되므로 여기서 하나씩 올려 주면 늘 이어집니다.
  let stepNo = 0
  const step = () => (stepNo += 1)

  function buildInput(): CollectionCompletionInput {
    return {
      scheduleId: scheduleId || null,
      clientId,
      wasteType,
      vehicleId,
      driverName,
      actualAmount: Number(amount) || 0,
      actualTime: time,
      //  다녀온 날 (0061). 예정을 눌러 완료할 때는 그 일정의 날짜를 쓰므로
      //  보내지 않습니다 — 여기서 보내면 서버가 일정 날짜를 덮어쓸 이유가 없습니다.
      date: scheduleId ? undefined : visitDate,
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

  //  ── 「이미 저장돼 있다」는 실패가 아닙니다 ────────────────────────────────
  //
  //   지하 보관실에서 저장을 누르면, 서버에는 들어갔는데 **응답이 오는 길에**
  //   끊기는 일이 있습니다. 화면에는 「저장하지 못했습니다」가 뜨고 기사님은
  //   당연히 다시 누릅니다. 그때 서버는 이렇게 답합니다.
  //
  //     「이미 완료 처리된 일정입니다. (중복 완료 방지)」
  //     「8월 19일 ○○병원의 의료폐기물 수거가 이미 저장되어 있습니다…」
  //
  //   **저장이 됐다는 뜻인데 빨간 글씨로 뜹니다.** 기사님은 안 된 줄 알고
  //   사무실에 전화합니다. 파일럿에서 제일 많이 걸려 올 전화입니다.
  //   서버가 막은 것은 그대로 두고(중복은 여전히 안 들어갑니다), **읽히는
  //   말만** 바꿉니다. 저장됐다고 지어내지도 않습니다 — 확인할 곳을 알려 줍니다.
  const alreadySaved = (msgs: string[]) =>
    msgs.some((m) => /이미 완료 처리된 일정|이미 저장되어 있습니다/.test(m))

  //  ── 「다시 시도」를 이 화면이 맡습니다 (0077) ──────────────────────────
  //
  //   통신 띠의 「다시 시도」는 실패한 요청을 그대로 다시 쐈습니다. 서버에는
  //   저장이 되는데 **화면은 그것을 몰라서**, 기사님은 저장이 끝났는데도
  //   빨간 띠와 입력칸을 그대로 보고 또 눌렀습니다.
  //   아래 submit() 은 성공 · 「이미 저장돼 있음」 · 진짜 실패를 모두 가려
  //   주므로, 이 화면이 떠 있는 동안에는 그 처리를 그대로 쓰게 합니다.
  //
  //   ⚠ submitRef 로 잡아 두는 이유 — submit 은 매 렌더마다 새로 만들어지는
  //     함수입니다. 그대로 맡기면 등록한 순간의 **낡은 값**(수거량 등)을
  //     들고 있는 함수가 불립니다.
  const submitRef = useRef<() => Promise<void>>(async () => {})
  useEffect(() => {
    setRetryHandler(() => submitRef.current())
    return () => setRetryHandler(null)
  }, [setRetryHandler])

  async function submit() {
    //  ── 차량이 안 묶인 계정은 여기서 멈춥니다 (0067) ──────────────────────
    //   현장에는 차량 고르는 칸이 없으므로, 안 막으면 서버가 거절하는
    //   화면을 기사님이 보게 됩니다. 단추도 잠기지만 여기서도 한 번 더
    //   봅니다 — 단추만 믿으면 나중에 조건이 바뀌었을 때 새어 나갑니다.
    if (noVehicleForField) {
      setErrors(['담당 차량이 지정되지 않았습니다. 사무실에 문의해 주세요.'])
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    //  평소와 크게 다른 수거량은 저장 **전에** 물어봅니다. 저장한 뒤에
    //  알려 주면 이미 그 금액으로 잡히고, 현장은 다음 화면으로 넘어간
    //  뒤라 고치러 돌아오지 않습니다.
    const amt = checkAmount(data, clientId, wasteType, Number(amount) || 0, scheduleId || null)
    if (amt.message && !window.confirm(`${amt.message}\n\n이대로 저장할까요?`)) return

    //  물품 개수도 같은 규칙으로 봅니다. 박스 개당으로 정산하는 거래처는
    //  개수가 곧 금액이라, 3개를 30개로 치면 청구액이 열 배가 됩니다.
    const itemMsg = itemCheckMessage(checkItemCounts(data, clientId, suppliedItems))
    if (itemMsg && !window.confirm(`${itemMsg}\n\n이대로 저장할까요?`)) return

    // 서버가 실제로 저장했는지 확인한 뒤에만 성공 화면으로 넘어갑니다.
    // (통신이 끊긴 채로 성공 화면을 보여 주면 그 수거는 사라집니다)
    const result = await completeCollection(buildInput())
    setWarnings(result.warnings)
    if (!result.ok) {
      if (alreadySaved(result.errors)) {
        //  이미 들어가 있습니다 — 다시 넣을 필요가 없다는 것만 알려 줍니다.
        setErrors([])
        //  ⚠ 0077 — 위쪽 빨간 통신 띠도 내립니다. 안 내리면 화면 위에서는
        //    「저장 실패 · 다시 시도」라고 하고 아래에서는 「이미 저장돼
        //    있습니다」라고 해서, **한 화면이 서로 반대되는 말**을 합니다.
        //    기사님은 위쪽 빨간 것을 믿고 또 누릅니다.
        //    이건 실패가 아니라 **이미 끝난 일**입니다.
        clearSyncError()
        setDupNotice(result.errors[0] ?? '')
        window.scrollTo({ top: 0, behavior: 'smooth' })
        return
      }
      setErrors(result.errors)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    setDupNotice(null)
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

  //  ⚠ 현장은 차량을 고르는 칸이 없으므로, 차량이 안 묶여 있으면 여기서
  //    막습니다. 막지 않으면 서버가 거절하는 화면을 기사님이 보게 됩니다.
  const canSubmit = !!clientId && Number(amount) > 0 && !!vehicleId && !overStock && !noVehicleForField

  //  ⚠ 매 렌더마다 최신 submit 을 넣어 둡니다 — 위 setRetryHandler 참고
  submitRef.current = submit

  //  값이 기본과 다르면 저절로 펼칩니다 (위 ⚠ ② 참고)
  const timeOpen = openTime || visitDate !== today()
  const containersOpen = openContainers || containerSum > 0
  const supplyOpen = openSupply || suppliedSum > 0 || overStock
  const handoverOpen = openHandover || handover !== '수거 완료'
  const memoOpen = openMemo || memo.trim().length > 0

  const recentEvents = data.events.slice(0, 4)

  //  ── 자주 가는 곳 바로 고르기 (0065) ─────────────────────────────────────
  //
  //   폰에서 거래처를 고르려면 목록을 열고 → 굴려서 찾고 → 누릅니다. 거래처가
  //   열 곳이 넘으면 한 번에 안 잡힙니다. 그런데 기사님이 다니는 곳은 거의
  //   정해져 있습니다.
  //
  //   ⚠ 새로 저장하는 것은 없습니다. **이미 읽어 둔 수거 이력**(data.events)
  //     에서 최근에 다녀온 순서를 셀 뿐입니다. 이력이 없으면 안 나옵니다 —
  //     없는 것을 지어내지 않습니다.
  const quickClients = useMemo(() => {
    const seen: string[] = []
    for (const e of data.events) {
      if (e.reverted) continue
      if (!data.clients.some((c) => c.id === e.clientId)) continue
      if (!seen.includes(e.clientId)) seen.push(e.clientId)
      if (seen.length >= 4) break
    }
    return seen
      .map((id) => data.clients.find((c) => c.id === id)!)
      .filter(Boolean)
  }, [data.events, data.clients])

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

          {/*  수거이력은 현장 담당자에게 막혀 있습니다(access.ts). 링크가 하나만
               남으면 두 칸 격자가 어색해지므로 칸 수도 함께 맞춥니다. */}
          <div className={`mt-2.5 grid gap-2.5 ${canGoHistory ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <Link to="/today" className="btn-ghost">
              오늘 일정
            </Link>
            {canGoHistory && (
              <Link to="/history" className="btn-ghost">
                수거이력
              </Link>
            )}
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
      {/*  ⚠ 0075 — 이 부제는 **시스템 자랑**이지 기사님이 지금 할 일이
           아닙니다. 매번 첫 줄에서 읽히면 정작 「어느 병원, 몇 kg」이
           밀립니다. 사무실·관리자에게는 이 화면이 무엇을 이어 주는지
           알려 줄 값이 있어 그대로 둡니다. */}
      <PageHeader
        title="수거 입력"
        subtitle={role === 'field' ? undefined : '한 번 입력하면 일정·이력·자재·통계에 자동 연결됩니다'}
      />

      {/*  이미 저장돼 있는 경우 — 빨강이 아니라 청록입니다.
           「안 됐다」가 아니라 「이미 됐다」이기 때문입니다. */}
      {dupNotice && (
        <div data-collect-dup className="card mb-4 border border-teal-200 bg-teal-50 p-4">
          <p className="t-body flex items-start gap-1.5 font-extrabold text-teal-800">
            <CheckCircle2 size={17} strokeWidth={2.4} className="mt-0.5 shrink-0" />
            이미 저장돼 있습니다 — 다시 넣지 않으셔도 됩니다.
          </p>
          <p className="t-muted mt-1.5 break-keep text-teal-700">{dupNotice}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              data-collect-dup-check
              onClick={() => navigate('/today')}
              className="rounded-full bg-teal-600 px-4 py-2.5 text-[1rem] font-extrabold text-white transition hover:bg-teal-700"
            >
              오늘 일정에서 확인
            </button>
            <button
              data-collect-dup-close
              onClick={() => setDupNotice(null)}
              className="rounded-full bg-white px-4 py-2.5 text-[1rem] font-bold text-teal-700 ring-1 ring-teal-200 transition hover:bg-teal-100"
            >
              닫기
            </button>
          </div>
        </div>
      )}

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
        <div className="min-w-0 space-y-4">
        {/*
          ── 일정에서 들어왔으면 ①② 를 접습니다 ─────────────────────────────
          기사님이 「오늘 일정」에서 병원을 눌러 들어오면 **어느 병원인지·무슨
          폐기물인지는 이미 정해져 있습니다.** 그런데도 두 단계가 그대로 펼쳐져
          있어, 폰에서 수거량 칸까지 두 화면을 밀어야 했습니다(전체 4화면).
          정해진 것은 한 줄로 보여 주고, 바꿔야 할 때만 펼칩니다.
          직접 입력(일정 없이)일 때는 예전 그대로입니다 — 고를 것이 있으니까요.
        */}
        {picked && !pickOpen ? (
          <section data-collect-here className="card p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="pill bg-teal-50 text-teal-700">지금 이 병원</span>
              {client && <WasteBadge type={wasteType} />}
              {/*  0071 — 예정 시간도 기사님이 눈으로 맞춰 보는 값입니다 (3.5:1 → 기준 미달) */}
              <span className="t-caption text-navy-500">{picked.scheduledTime || '시간 미정'}</span>
            </div>
            <p data-collect-here-name className="mt-1.5 break-keep text-[1.32rem] font-extrabold leading-snug text-navy-900">
              {client?.name ?? '거래처'}
            </p>
            {client?.address && (
              <p className="t-body mt-1 break-keep leading-snug text-navy-500">{client.address}</p>
            )}
            {(client?.manager || client?.phone) && (
              <p className="t-body mt-0.5 break-keep text-navy-500">
                {client?.manager}
                {client?.phone && (
                  <>
                    {' · '}
                    {/*  현장에서 바로 걸 수 있어야 합니다 — 번호를 옮겨 적지 않게. */}
                    {/*  0071 — 「지금 이 병원」 칸의 전화. 글자 높이(21px)면 손가락으로 빗나갑니다. */}
                    <a
                      href={`tel:${client.phone}`}
                      className="-my-2 inline-flex min-h-[2.75rem] items-center font-bold text-teal-700 underline-offset-2 hover:underline"
                    >
                      {client.phone}
                    </a>
                  </>
                )}
              </p>
            )}
            <button
              data-collect-repick
              onClick={() => setPickOpen(true)}
              //  0071 — navy-400 은 흰 바탕에서 3.5:1 이라 기준(4.5:1)에 못 미칩니다
              className="-mx-2 mt-1 flex min-h-[2.75rem] items-center gap-1 px-2 text-[1.02rem] font-bold text-navy-500"
            >
              다른 일정 고르기
            </button>
          </section>
        ) : null}

        {/* 1. 오늘 일정 선택 */}
        <div className={picked && !pickOpen ? 'hidden' : 'space-y-4'}>
        {/*
          ── 고를 것이 없으면 고르는 칸도 없습니다 ────────────────────────────
          오늘 예정이 0건이면 이 칸에 남는 것은 이미 켜져 있는 「직접 입력」
          단추와 안내문뿐입니다. 기사님은 아무것도 고를 수 없는 칸을 250px
          밀고 지나가야 했습니다. 0건일 때는 한 줄로 알리기만 합니다.
        */}
        <Section n={step()} title="오늘 일정 선택" desc="예정된 수거를 고르면 거래처·차량이 자동 입력됩니다">
          <div className="flex flex-wrap gap-2">
            {todayPending.length > 0 && (
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
            )}
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
              <p data-pick-mode className="text-[1.08rem] text-navy-500">
                오늘 예정된 수거가 없어 <b className="text-navy-600">직접 입력</b>으로 넣습니다.
              </p>
            )}
          </div>
          {/*
            ── 「직접 입력」을 눌러도 아무 일도 안 일어난다 ──────────────────
            대표님이 짚어 주신 자리입니다. 원인은 **이미 골라져 있는 것을 다시
            누른 것**이었습니다. 눌러도 상태가 그대로라 화면이 안 움직이고,
            누른 사람은 「고장」으로 읽습니다.
            지금 무엇이 골라져 있고 다음에 무엇을 하면 되는지 한 줄로 적습니다.
          */}
          {todayPending.length > 0 && (
            <p data-pick-mode className="mt-2.5 break-keep text-[1.05rem] text-navy-500">
              {scheduleId === '' ? (
                <>
                  지금은 <b className="text-navy-800">직접 입력</b>입니다 — 아래 <b>거래처</b>를 골라 주세요.
                </>
              ) : (
                <>
                  지금은 <b className="text-navy-800">예정 일정</b>으로 넣습니다 — 거래처·구분은 자동으로 채워집니다.
                </>
              )}
            </p>
          )}
        </Section>

        {/* 2. 거래처 · 폐기물 구분 */}
        <Section n={step()} title="거래처 · 폐기물 구분">
          <div className="space-y-3">
            <div>
              <label className="field-label" data-guide="guide-client">거래처 *</label>
              {/*  자주 가는 곳 — 목록을 열지 않고 한 번에 고릅니다.
                   일정에서 들어왔으면 이미 정해져 있으니 안 보여 줍니다. */}
              {!scheduleId && quickClients.length > 0 && (
                <div data-quick-clients className="mb-2 flex flex-wrap gap-2">
                  {quickClients.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      data-quick-client={c.id}
                      onClick={() => {
                        setClientId(c.id)
                        setErrors([])
                      }}
                      title={c.name}
                      className={`min-h-[2.75rem] max-w-full truncate rounded-xl px-3.5 py-2.5 text-left text-[1.05rem] font-bold transition active:scale-[0.97] ${
                        clientId === c.id ? 'bg-teal-500 text-white shadow-sm' : 'bg-navy-50 text-navy-700'
                      }`}
                    >
                      {/*  「서울인화스포츠마취통증의학과의원」처럼 긴 이름이 두 줄을
                           차지해 버려서, 알아볼 만큼만 자릅니다. 누르면 아래 목록에도
                           그대로 반영되니 무엇을 골랐는지 다시 확인됩니다. */}
                      {c.name.length > 11 ? `${c.name.slice(0, 10)}…` : c.name}
                    </button>
                  ))}
                </div>
              )}
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
                    className={`whitespace-nowrap rounded-2xl px-2 py-3.5 text-[1.08rem] font-bold transition active:scale-[0.97] disabled:opacity-60 ${
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
            {/*
              ── 빈 칸에는 가운뎃점을 찍지 않습니다 ──────────────────────────
              예전에는 `{주소} · {담당} · {전화}` 를 그대로 붙였습니다. 운영
              자료를 실제 현장 계정으로 열어 보니 **전화 12/12 · 주소 11/12 가
              비어 있어서**, 화면에는 「 · 관리팀 · 」처럼 점만 남았습니다.
              값이 있는 것만 잇고, 없으면 없다고 적습니다.
              전화는 **바로 걸리게** 합니다 — 현장에서 번호를 옮겨 적지 않게.
            */}
            {client && (
              <div data-collect-contact className="t-body rounded-2xl bg-navy-50 p-4 text-navy-500">
                {client.address && <p className="break-keep">{client.address}</p>}
                <p className="mt-0.5 break-keep">
                  {client.manager || '담당자 미등록'}
                  {client.phone ? (
                    <>
                      {' · '}
                      <a
                        data-collect-tel
                        href={`tel:${client.phone}`}
                        //  0071 — 전화는 기사님이 실제로 누르는 자리입니다.
                        //  글자 높이(21px)로 두면 손가락으로 빗나갑니다.
                        className="-my-2 inline-flex min-h-[2.75rem] items-center font-bold text-teal-700 underline-offset-2 hover:underline"
                      >
                        {client.phone}
                      </a>
                    </>
                  ) : (
                    <span className="text-navy-400"> · 전화번호 미등록</span>
                  )}
                </p>
                {!client.address && <p className="mt-0.5 text-navy-400">주소 미등록</p>}
              </div>
            )}
          </div>
        </Section>
        </div>

        {/* 3. 실제 수거 시간 · 수거량 */}
        {/*
          ── ③ 은 「수거량」만 늘 펼쳐 둡니다 ────────────────────────────────
          시간은 **방금 다녀와서 바로 넣는 것**이라 지금 시각이 곧 답입니다.
          그런데 오전/오후 + 시 + 분 세 줄이 300px 을 먹고 단추가 여섯 개라,
          정작 손대야 할 수거량 칸이 두 번째 화면으로 밀려 있었습니다.
          시간·날짜는 「지금으로 저장됩니다」 한 줄로 접고, 바꿀 때만 폅니다.
        */}
        <Section n={step()} title="실제 수거 시간 · 수거량" tour="collect-form">
          {/*  시간과 수거량을 반씩 나눠 놓으면, 폰에서 시간 칸이 손가락보다
               좁아집니다 (버튼 두 개 + 숫자 칸이 150px 안에 들어갑니다).
               시간은 한 줄을 통째로 씁니다 — 대표님이 「너무 조그맣게 있어서
               입력하기 되게 불편하다」고 하신 그 자리입니다. */}
          <div className="space-y-3">
            {/*  ── 다녀온 날 (0061) ────────────────────────────────────────
                 예정을 눌러 완료할 때는 그 일정의 날짜를 쓰므로 안 보여
                 줍니다. 예정에 없던 수거를 직접 넣을 때만 나옵니다.

                 ⚠ 이 칸이 없어서 저녁·다음 날 아침 입력이 전부 오늘로
                   저장됐습니다. 평소엔 기록만 어긋나지만 **월말에는 하루치가
                   다음 달 매출**이 됩니다. */}
            {/*  접힘 줄 — 폰에서만. 무엇으로 저장되는지 숫자를 그대로 적습니다. */}
            {!timeOpen && (
              <button
                type="button"
                data-fold="time"
                onClick={() => setOpenTime(true)}
                className="flex min-h-[3rem] w-full items-center gap-2 rounded-2xl bg-navy-50 px-4 py-3 text-left transition active:scale-[0.99] sm:hidden"
              >
                <span data-fold-summary="time" className="min-w-0 break-keep text-[1.05rem] font-bold text-navy-700">
                  {prettyDate(visitDate)} {time} 으로 저장
                </span>
                <span className="ml-auto flex shrink-0 items-center gap-1 text-[1.02rem] font-bold text-teal-700">
                  시간 바꾸기
                  <ChevronDown size={16} strokeWidth={2.4} />
                </span>
              </button>
            )}
            <div className={`space-y-3 ${timeOpen ? '' : 'hidden sm:block'}`}>
            {!scheduleId && (
              <div>
                <label className="field-label" htmlFor="collection-date">다녀온 날 *</label>
                <input
                  id="collection-date"
                  data-visit-date
                  type="date"
                  className="field-input"
                  value={visitDate}
                  max={today()}
                  min={addDays(today(), -45)}
                  onChange={(e) => setVisitDate(e.target.value || today())}
                />
                {visitDate !== today() && (
                  <p
                    data-visit-past
                    className="t-body mt-1.5 break-keep rounded-2xl bg-amber-50 px-3.5 py-2.5 font-bold text-amber-800"
                  >
                    오늘이 아닌 <b>{prettyDate(visitDate)}</b> 로 저장됩니다. 그 달 실적·청구에 그 날짜로
                    잡힙니다.
                  </p>
                )}
              </div>
            )}
            <TimeField value={time} onChange={setTime} />
            </div>
            <div>
              <label className="field-label" htmlFor="collection-amount" data-guide="guide-amount">
                실제 수거량 (kg) *
              </label>
              {/*  집을 수 있는 이름을 답니다. 시간 칸도 숫자 칸이라, 「첫 번째
                   숫자 칸」으로 집으면 수거량 대신 시(時)에 값이 들어갑니다. */}
              <input
                id="collection-amount"
                data-actual-amount
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


        </div>

        {/* ── 우측: 현장 정보 · 자재 · 차량 · 저장 ── */}
        <div className="min-w-0 space-y-4">
        {/* 현장 메모 — 이 거래처에 기록해둔 특이사항 */}
        {client && notesFor(client.id).some((n) => !n.done) && (
          <div className="card p-5">
            {/*  0075 — 「(거래처 상세에 기록해 둔 내용)」은 **어디서 왔는지**를
                 설명하는 말입니다. 기사님에게는 내용만 필요합니다. */}
            <p className="t-label mb-1 text-navy-500">현장 메모 · 특이사항</p>
            <NoteChips notes={notesFor(client.id)} max={4} />
          </div>
        )}

        {/*  자주 쓰는 칸 — 완료상태와 특이사항은 수거량 바로 다음입니다 (0071) */}
        <Section
          n={step()}
          title="처리장 인계 상태"
          fold={{
            open: handoverOpen,
            onOpen: () => setOpenHandover(true),
            summary: handover,
            id: 'handover',
          }}
        >
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
        <Section
          n={step()}
          title="특이사항"
          fold={{
            open: memoOpen,
            onOpen: () => setOpenMemo(true),
            summary: '없음',
            id: 'memo',
          }}
        >
          <textarea
            className="field-input"
            rows={2}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="현장 특이사항을 입력하세요 (선택)"
          />
        </Section>


        {/*
          ── 매번 쓰지 않는 칸은 아래로 (0071) ─────────────────────────────
          대표님이 정해 주신 순서: 병원 → 수거량 → 완료상태 → 특이사항 → 저장.
          용기와 자재는 **놓고 오는 날만** 씁니다. 둘 다 접힌 채로, 자주 쓰는
          칸 아래에 나란히 둡니다 — 위에 있으면 매일 지나쳐야 합니다.
        */}
        {/* 4. 용기별 배출 수량 */}
        <Section
          n={step()}
          title="용기별 배출 수량"
          desc="수거대장 초안에 그대로 반영됩니다"
          guideAt="guide-folds"
          fold={{
            open: containersOpen,
            onOpen: () => setOpenContainers(true),
            summary: '놓고 온 것 없음',
            id: 'containers',
          }}
        >
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

        {/* 자재 동시공급 */}
        <Section
          n={step()}
          title="자재 동시공급"
          desc="공급 시 사무실 재고에서 자동 차감됩니다 (선택)"
          fold={{
            open: supplyOpen,
            onOpen: () => setOpenSupply(true),
            summary: '공급 없음',
            id: 'supply',
          }}
        >
          {/* 규격별로 받습니다 — 63L 박스와 12L 박스는 단가가 다르고,
              그 차이가 그대로 거래처 정산·거래명세서로 갑니다. */}
          {/*
            폰에서는 이 목록 열 줄이 1,000px 남짓입니다 — 수거 입력 화면이
            다섯 화면이 되는 가장 큰 이유였습니다. 실제로는 거래처마다 쓰는
            규격이 두세 개뿐입니다.

            그래서 폰에서는 **지난번에 준 규격과 지금 값이 들어간 줄**만
            펼쳐 두고, 나머지는 「다른 규격」으로 접습니다. 넓은 화면은
            지금까지와 똑같이 전부 보여 줍니다. 줄을 없애지 않습니다 —
            한 번 펼치면 그대로 남습니다.
          */}
          <div data-tour="collect-supply" className="divide-y divide-navy-50">
            {SUPPLY_ITEMS.map((it, si) => {
              const used = (lastSupply[it.key] ?? 0) > 0 || (suppliedItems[it.key] ?? 0) > 0
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
              //  폰에서 접는 줄 — 값이 들어 있거나 지난번에 준 규격은 늘 보입니다
              const cls = used || showAllItems ? '' : 'hidden sm:block'
              return si === 0 ? (
                <div key={it.key} data-tour="collect-supply-row" className={cls}>
                  {field}
                </div>
              ) : (
                <div key={it.key} className={cls}>
                  {field}
                </div>
              )
            })}
          </div>
          {hiddenItemCount > 0 && (
            <button
              type="button"
              data-supply-more
              onClick={() => setShowAllItems(true)}
              className="mt-2 w-full rounded-2xl bg-navy-50 py-2.5 text-[1.02rem] font-bold text-navy-600 transition active:scale-[0.99] sm:hidden"
            >
              다른 규격 {hiddenItemCount}개 보기
            </button>
          )}
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
        {autoVehicle ? (
          //  ── 현장: 고르는 칸이 없습니다 ────────────────────────────────────
          //   무엇으로 저장되는지는 그대로 보여 줍니다. 안 보여 주면
          //   「내 차로 들어갔나」를 알 수 없습니다.
          <section data-auto-vehicle className="card p-4 sm:p-5">
            {noVehicleForField ? (
              <div className="flex items-start gap-2.5">
                <AlertCircle size={19} className="mt-0.5 shrink-0 text-amber-700" strokeWidth={2.2} />
                <p data-vehicle-unset className="t-body min-w-0 break-keep font-bold text-amber-800">
                  담당 차량이 지정되지 않았습니다. 사무실에 문의해 주세요.
                </p>
              </div>
            ) : myVehicle && myVehicle.wasteType !== wasteType ? (
              //  묶인 차가 이번 구분과 다른 경우 — 서버가 저장을 막으므로
              //  「왜 저장이 안 되는지」를 여기서 미리 말해 줍니다.
              <div className="flex items-start gap-2.5">
                <AlertCircle size={19} className="mt-0.5 shrink-0 text-amber-700" strokeWidth={2.2} />
                <p data-vehicle-mismatch className="t-body min-w-0 break-keep font-bold text-amber-800">
                  담당 차량 {myVehicle.name}는 {myVehicle.wasteType} 차량이라 {wasteType} 수거를 저장할 수
                  없습니다. 사무실에 문의해 주세요.
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-2.5">
                <Truck size={19} strokeWidth={2.3} className="shrink-0 text-navy-400" />
                <p data-vehicle-auto className="t-body min-w-0 break-keep text-navy-600">
                  <b className="text-navy-900">{myVehicle?.name}</b> · {profile?.name} 기사님으로 저장됩니다
                </p>
              </div>
            )}
          </section>
        ) : vehicleHidden && boundVehicle ? (
          //  관리자가 이 계정에 차량을 묶어 뒀습니다 — 매번 고르지 않습니다.
          //  대신 무엇으로 저장되는지는 그대로 보여 줍니다. 안 보여 주면
          //  틀린 차량으로 기록이 쌓여도 알 방법이 없습니다.
          <div data-my-vehicle={boundVehicle.id} className="card flex flex-wrap items-center gap-x-3 gap-y-2 p-4">
            <Truck size={20} strokeWidth={2.3} className="shrink-0 text-teal-600" />
            <p className="t-body min-w-0 break-keep font-extrabold text-navy-900">
              {boundVehicle.name}
              {(profile?.name ?? '').trim() && (
                <span className="ml-2 font-bold text-navy-500">· {profile?.name}</span>
              )}
            </p>
            {/*  ⚠ 이 버튼은 높이가 23px 이었습니다. 대차로 나간 날 기사님이
                 장갑 낀 손으로 눌러야 하는 자리인데, 안 눌리면 **틀린 차량으로
                 기록이 쌓입니다.** 글자는 그대로 두고 누를 자리만 44px 로
                 넓혔습니다 (여백은 음수 마진으로 되돌려 줄이 안 벌어지게). */}
            <button
              data-vehicle-other
              onClick={() => setShowVehiclePick(true)}
              className="t-muted -my-2.5 ml-auto shrink-0 rounded-xl px-3 py-2.5 font-bold text-navy-400 underline transition hover:bg-navy-50 hover:text-navy-700"
            >
              오늘은 다른 차로 갔어요
            </button>
          </div>
        ) : (
        <Section n={step()} title="차량 · 기사">
          {/*  차량이 한 대도 없으면 여기서 고를 것이 없고, 저장 버튼도
               끝까지 잠깁니다. 예전에는 그 이유를 아무 데도 적어 두지 않아
               현장에서는 "저장이 안 된다"만 알고 왜인지 몰랐습니다. */}
          {/*
            ── 「아직 안 읽었다」와 「정말 없다」는 다릅니다 ────────────────────
            예전에는 자료를 다 읽기 전에도 `vehicles.length === 0` 이 참이라,
            차가 6대 등록돼 있는데도 **「등록된 차량이 없어 저장할 수 없습니다.
            관리자에게 요청하세요」**가 떴습니다. 실제 현장 계정으로 열어서
            확인한 화면입니다. 기사님은 관리자에게 헛되이 전화하게 됩니다.
            읽는 중에는 읽는 중이라고만 적습니다.
          */}
          {!sync.ready ? (
            <div data-vehicle-loading className="mb-3 rounded-2xl bg-navy-50 px-4 py-3.5">
              <p className="t-body break-keep font-bold text-navy-500">차량 목록을 불러오는 중입니다…</p>
            </div>
          ) : (
            data.vehicles.length === 0 && (
              <div data-vehicle-none className="mb-3 flex items-start gap-2.5 rounded-2xl bg-amber-50 px-4 py-3.5">
                <AlertCircle size={19} className="mt-0.5 shrink-0 text-amber-700" strokeWidth={2.2} />
                <p className="t-body min-w-0 break-keep font-bold text-amber-800">
                  등록된 차량이 없어 저장할 수 없습니다. 관리자에게 「설정 → 운행 차량」에서 차량 등록을
                  요청해 주세요.
                </p>
              </div>
            )
          )}
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
            {myVehicle && !boundVehicle && (
              <>
                {' '}
                계정에 묶인 {myVehicle.name}는 {myVehicle.wasteType} 차량이라 이번에는 자동으로 쓰지 않습니다.
              </>
            )}
          </p>
        </Section>
        )}

        {/* 7. 처리장 인계 상태 */}
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
            {/*  ⚠ 0071 — 이 줄들은 **저장 직전에 마지막으로 읽는 곳**입니다.
                 navy-400 은 흰 바탕에서 3.3:1 이라 기준(4.5:1)에 못 미쳤습니다.
                 50~60대 기사님이 밝은 데서 폰을 보는 자리라 더 그렇습니다.
                 navy-500 으로 올립니다 — 굵기·크기는 그대로입니다. */}
            <div className="t-body grid grid-cols-2 gap-y-2 text-navy-700">
              <span className="text-navy-500">거래처</span>
              <span className="text-right font-bold">{client?.name}</span>
              <span className="text-navy-500">수거량</span>
              <span className="text-right font-bold">{weight(Number(amount) || 0)}</span>
              <span className="text-navy-500">용기 합계</span>
              <span className="text-right font-bold">{containerSum}개</span>
              <span className="text-navy-500">자재 동시공급</span>
              <span className="text-right font-bold">{suppliedSum > 0 ? `${suppliedSum}점` : '없음'}</span>
              <span className="text-navy-500">처리장 인계</span>
              <span className="text-right font-bold">{handover}</span>
            </div>
          </div>
        )}

        {/* 완료 버튼 (48px)
            저장 중에는 눌리지 않게 합니다 — 현장 모바일에서 응답이 느릴 때
            두 번 누르면 같은 수거가 두 번 올라갑니다. (DB 에서도 막지만,
            사용자가 오류 화면을 보는 것보다 아예 못 누르게 하는 편이 낫습니다) */}
        {/*
          ── 저장은 늘 손 닿는 곳에 (0071) ──────────────────────────────────
          긴 화면을 내려가다 보면 「어디서 끝내지?」가 됩니다. 폰에서는
          채울 것을 다 채우면 **아래에 붙여 둡니다** — 아래 메뉴 위에 얹혀
          늘 보입니다. 넓은 화면은 지금까지처럼 흐름 안에 둡니다.

          ⚠ 채우기 전에는 붙이지 않습니다. 아직 못 누르는 단추가 화면을
            계속 가리면 그게 더 답답합니다.
        */}
        <button
          data-tour="collect-save"
          data-guide="guide-save"
          data-collect-save
          className={`btn-primary w-full py-5 !text-[1.15rem] disabled:opacity-50 ${
            canSubmit && !sync.saving
              ? 'max-sm:fixed max-sm:inset-x-3 max-sm:bottom-[4.75rem] max-sm:z-30 max-sm:w-auto max-sm:shadow-xl'
              : ''
          }`}
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
        {/*  예전엔 여기에 「현장 담당자 (Demo) · 실제 적용 시 … 연동 예정」이
             적혀 있었습니다. 이제는 실제 계정으로 저장되므로, 지어낸 문구
             대신 **누구 이름으로 남는지**를 그대로 적습니다. */}
        {/*  붙어 있는 동안 원래 자리에 같은 높이를 남겨 둡니다 — 안 남기면
             아래 글이 위로 올라와 화면이 출렁입니다. */}
        {canSubmit && !sync.saving && <div aria-hidden className="h-[4.5rem] sm:hidden" />}
        {/*  ⚠ 0075 — 여기 「{이름} 이름으로 저장됩니다」가 있었는데, 저장
             단추 바로 위에 이미 「{차량} · {이름} 기사님으로 저장됩니다」가
             있습니다. **같은 말이 한 화면에 두 번**이라 한쪽을 뺍니다.
             차량까지 함께 말하는 위쪽을 남깁니다.
             ⚠ 차량이 안 묶여 있어 위 줄이 안 뜨는 경우에는 누구 이름으로
               남는지 알 길이 없어지므로, 그때는 이 줄을 그대로 띄웁니다. */}
        {profile?.name && !boundVehicle && (
          <p data-collect-actor className="t-muted text-center">
            {profile.name} 이름으로 저장됩니다
          </p>
        )}
        </div>
      </div>

      {/* 최근 입력 이력 (감사기록) */}
      {recentEvents.length > 0 && (
        <div className="mt-6">
          {/*  저장 단추 **아래**라 폰에서는 어차피 안 보이는데 문서만 700px
               길어집니다. 「취소」가 필요할 때만 폅니다. */}
          <button
            type="button"
            data-recent-toggle
            onClick={() => setOpenRecent((v) => !v)}
            className="mb-2 flex min-h-[2.75rem] w-full items-center gap-2 px-1 text-left sm:hidden"
          >
            <span className="text-[1.07rem] font-extrabold text-navy-800">최근 입력 이력 {recentEvents.length}건</span>
            <ChevronDown
              size={17}
              strokeWidth={2.4}
              className={`ml-auto shrink-0 text-navy-400 transition ${openRecent ? 'rotate-180' : ''}`}
            />
          </button>
          <p className="mb-2 hidden px-1 text-[1.07rem] font-extrabold text-navy-800 sm:block">최근 입력 이력</p>
          <div className={`card divide-y divide-navy-50 ${openRecent ? '' : 'hidden sm:block'}`}>
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
          <p className={`mt-1.5 px-1 text-[0.95rem] text-navy-400 ${openRecent ? '' : 'hidden sm:block'}`}>
            취소 시 일정·수거이력·자재·재고·요청 상태가 입력 전으로 되돌아갑니다.
          </p>
        </div>
      )}

      {/*  ── 다음 방문 예약 (대표님 요청) ────────────────────────────────────
           위쪽은 **오늘 다녀온 것을 적는 자리**입니다. 여기는 **앞으로 갈 날을
           잡는 자리**라 분명히 갈라 둡니다 — 섞이면 「입력했는데 왜 실적에
           안 잡히나」 / 「예약했는데 왜 수거가 됐나」가 생깁니다.

           수거를 넣다가 병원이 「다음엔 언제 오세요?」 물었을 때 화면을
           나가지 않고 그 자리에서 날짜를 잡습니다. 고른 거래처가 있으면
           그 병원으로 열립니다. */}
      {canBook && (
        <section data-book-section className="mt-6 card p-4 sm:p-5">
          <p className="t-card text-navy-900">다음 방문 예약</p>
          <p className="t-muted mt-1 break-keep text-navy-500">
            병원에서 받은 날짜를 그대로 넣으시면 그날 일정에 뜹니다.{' '}
            <b className="text-navy-600">위 수거 입력과는 별개입니다</b> — 여기서 잡은 것은 실적에 안 잡히고,
            현장에서 완료를 눌러야 실적이 됩니다.
          </p>
          <button
            data-book-open
            onClick={() => setBookOpen(true)}
            className="btn-ghost mt-3 w-full sm:w-auto sm:px-6"
          >
            <CalendarPlus size={17} strokeWidth={2.4} />
            {client ? `${client.name} 방문 잡기` : '날짜 정해 방문 잡기'}
          </button>
        </section>
      )}

      {canBook && (
        <BookVisitModal open={bookOpen} onClose={() => setBookOpen(false)} client={client} />
      )}

      {/*  ⚠ 0069 — navy-300 은 흰 바탕에서 대비 1.9:1 입니다. 거의 안 보이는
           글자를 화면에 두는 것은 자리만 차지합니다. 기준선(4.5:1)을 넘깁니다. */}
      <p className="mt-6 text-center text-[0.98rem] text-navy-500">{prettyDate(today())} 기준</p>

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
