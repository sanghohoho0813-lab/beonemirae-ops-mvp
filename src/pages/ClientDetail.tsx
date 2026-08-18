import { LastCollectionLine } from '../components/FieldTodayCard'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Phone,
  MapPin,
  RefreshCw,
  Recycle,
  FileText,
  Printer,
  Trash2,
  Pencil,
  Truck,
  ChevronRight,
  SearchX,
  Pin,
  ClipboardCheck,
  PlusCircle,
  CalendarPlus,
} from 'lucide-react'
import { useData } from '../context/DataContext'
import { useAuth } from '../context/AuthContext'
import { canAccess, canSeeDashboard } from '../lib/access'
import { WasteBadge } from '../components/Badge'
import { Modal } from '../components/Modal'
import { PageShell, SectionTitle, MetricCard, EmptyState } from '../components/ui'
import { ClientForm } from '../components/ClientForm'
import { BookVisitModal } from '../components/BookVisit'
import { UrgentRiskCard } from '../components/UrgentRisk'
import {
  lastCollection,
  nextSchedule,
  clientMonthlyAvg,
  clientMonthlyAvgDetail,
  clientOutstanding,
  collectionLog,
  clientInspection,
  requestsForClient,
  clientProfile,
  collectionHistory,
  collectionHistorySummary,
  clientMaterialSummary,
  clientPaymentRows,
  monthlyActualsFor,
  type RequestStatus,
  type UsageStatus,
  type BillStatus,
} from '../lib/ops'
import { prettyDate, thisMonth, today, weight, won, wonShort } from '../lib/format'
import { nextActionsFor, clientMonthlyReport } from '../lib/insights'
import { actionMeta } from '../components/Opportunities'
import { LeadStageControl } from '../components/LeadStage'
import { ClientLeadHistory } from '../components/LeadHistory'
import { MonthlyReportView } from '../components/MonthlyReport'
import { SettlementPanel } from '../components/Settlement'
import { InvoiceView } from '../components/InvoiceView'
import { invoiceForBilled, contractState, type Invoice } from '../lib/billing'
import { SiteNotesPanel, NoteChips } from '../components/SiteNotes'
import { MonthlyActuals } from '../components/MonthlyActuals'
import { ReceiptPanel } from '../components/Receipts'
import { ClientDrivers } from '../components/ClientDrivers'
import { REQUEST_KIND_LABEL, type Client } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// 거래처 상세 (/clients/:id) — 실제 거래처 운영관리 화면
//  헤더 + 핵심지표 + 인증·실사 관련(상시) + 탭(운영조건/수거이력/자재/요청·알림/결제·미수금)
// ─────────────────────────────────────────────────────────────────────────────

const reqStatusStyle: Record<RequestStatus, string> = {
  접수: 'bg-navy-100 text-navy-600',
  '확인 중': 'bg-amber-50 text-amber-600',
  '일정 반영': 'bg-teal-50 text-teal-700',
  '처리 완료': 'bg-emerald-50 text-emerald-600',
}
const usageStyle: Record<UsageStatus, string> = {
  정상: 'bg-emerald-50 text-emerald-600',
  '확인 필요': 'bg-amber-50 text-amber-600',
  '점검 필요': 'bg-rose-50 text-rose-500',
}
const billStyle: Record<BillStatus, string> = {
  정상: 'bg-emerald-50 text-emerald-600',
  부분입금: 'bg-sky-50 text-sky-600',
  '입금 예정': 'bg-navy-100 text-navy-600',
  '확인 필요': 'bg-amber-50 text-amber-600',
  '장기 미수': 'bg-rose-50 text-rose-500',
  취소: 'bg-navy-100 text-navy-400 line-through',
}

//  money: true 인 탭은 매출·원가·영업이익·청구가 보이는 자리입니다.
//  현장 담당자에게는 대시보드·통계·미수금을 이미 막아 두었는데, 거래처
//  상세의 이 탭들이 뒷문으로 열려 있었습니다 — 실제로 현장 계정에서
//  매출 511,250원 · 원가 210,858원 · 영업이익 300,392원이 그대로 보였고,
//  청구 확정 버튼까지 눌러졌습니다. 원가와 이익은 미수금보다 더 민감한
//  숫자입니다. 정산은 수거·자재로 계산되는 값이라 RLS 로는 막을 수 없어
//  화면에서 가려야 합니다.
/**
 * 인증·실사 관련 카드를 보일지.
 *
 *  지금은 꺼 둡니다 — 체크리스트가 시연용이고 알림 연동이 없어서,
 *  거래처 화면에서 자리만 차지했습니다. 실제로 쓰실 때 true 로 바꾸면
 *  그대로 다시 나옵니다(코드는 그대로 있습니다).
 */
const SHOW_INSPECTION = false

const TABS = [
  { id: 'ops', label: '운영조건', money: false },
  { id: 'settlement', label: '월 정산·명세서', money: true },
  //  ⚠ 0063 부터 월 실적(매출·원가·이익)은 **서버가** 현장에 안 줍니다.
  //    kg 도 같은 표에 있어 함께 막힙니다. 탭을 열어 두면 현장에서는
  //    빈 표가 뜨는데, 그건 「기록이 없다」로 읽혀 더 나쁩니다.
  //    이 리포트는 사무실이 병원에 드리는 자료라 원래 사무실 일입니다
  //    (/reports 도 이미 사무실·관리자 전용입니다).
  { id: 'report', label: '월간 리포트', money: true },
  { id: 'notes', label: '현장 메모', money: false },
  { id: 'history', label: '수거이력', money: false },
  { id: 'materials', label: '자재관리', money: false },
  { id: 'requests', label: '요청·알림', money: false },
  { id: 'billing', label: '결제·미수금', money: true },
] as const
type TabId = (typeof TABS)[number]['id']

export function ClientDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { data, clientById, updateClient, savePricing, removeClient, purgeClient, notesFor } = useData()
  const { role, mode } = useAuth()
  //  방문 예약 (0058) — 사무실·관리자만. 서버도 같은 기준으로 막습니다.
  const canBook = role === 'admin' || role === 'office' || !mode
  const [bookOpen, setBookOpen] = useState(false)
  const client = clientById(id)

  const [editing, setEditing] = useState(false)
  // 이 초기값은 첫 렌더에서 한 번만 계산됩니다. 서버에서 데이터를 받아오는
  // 실사용에서는 그 시점에 client 가 아직 없어 빈 폼으로 굳었습니다.
  // (브라우저 저장으로 도는 시연 모드에서는 첫 렌더에 이미 데이터가 있어
  //  드러나지 않던 문제입니다)
  // 그래서 폼은 '수정'을 누른 그 순간의 값으로 채웁니다 — 편집 중에 다른
  // 기기의 갱신이 들어와도 입력하던 내용이 밀리지 않는다는 이점도 있습니다.
  const [form, setForm] = useState<Omit<Client, 'id'>>({} as Omit<Client, 'id'>)

  function openEdit() {
    if (!client) return
    const { id: _id, ...rest } = client
    setForm(rest)
    setEditing(true)
  }
  const [logOpen, setLogOpen] = useState(false)
  //  폰에서 추천을 **한 건만** 펼칩니다.
  //   PC 는 오른쪽 절반이라 세 건이 다 들어가지만, 폰에서는 이 추천 묶음
  //   하나가 1,004px 을 차지해서 정작 매일 쓰는 운영조건·정산·청구 **탭이
  //   y=2,582px**(3화면 아래)까지 밀렸습니다. 추천을 없앤 것이 아니라
  //   나머지를 「더 보기」 뒤에 둡니다 — PC 에서는 지금처럼 다 보입니다.
  const [allActions, setAllActions] = useState(false)
  //  영업 진행상태는 폰에서만 접습니다 (PC 는 항상 보입니다).
  const [stageOpen, setStageOpen] = useState(false)
  const [tab, setTab] = useState<TabId>('ops')
  //  현장 담당자에게는 매출·원가·이익·청구가 보이는 탭을 열지 않습니다.
  //  주소를 직접 쳐서 들어와도 탭이 없으므로 그 내용은 그려지지 않습니다.
  //
  //  시연 모드에는 로그인이 없어 role 이 null 입니다. 역할만 보고 가리면
  //  시연에서 정산·명세서가 통째로 사라집니다 — 대표님께 보여 드리는
  //  핵심이 없어지는 것이라, 시연에서는 가리지 않습니다.
  const canSeeMoney = mode !== 'live' || canSeeDashboard(role)
  //  화면 안의 바로가기도 같은 규칙을 씁니다 — 못 여는 곳으로 보내지 않습니다.
  const canGoHistory = mode !== 'live' || canAccess(role, '/history')
  const canGoMaterials = mode !== 'live' || canAccess(role, '/materials')
  const canGoDispatch = mode !== 'live' || canAccess(role, '/dispatch')
  //  거래처 등록·수정·거래종료는 사무실·관리자만 (RLS: clients_update / clients_delete)
  const canEditClient = mode !== 'live' || canSeeDashboard(role)
  const visibleTabs = TABS.filter((t) => canSeeMoney || !t.money)
  const [settleMonth, setSettleMonth] = useState<string>(() => thisMonth())
  //  어떤 청구의 명세서를 열었는지 담아 둡니다. 청구가 여러 건이면
  //  (정기 + 추가) 명세서도 건마다 다르기 때문입니다. 값이 없으면 아직
  //  확정 전이라 지금 값으로 계산해서 보여 줍니다.
  const [shownInvoice, setShownInvoice] = useState<Invoice | null>(null)
  const [invoiceOpen, setInvoiceOpen] = useState(false)

  if (!client) {
    return (
      <PageShell>
        <EmptyState icon={SearchX} title="거래처를 찾을 수 없어요" subtitle="목록에서 다시 선택해 주세요." />
        <button className="btn-ghost mx-auto" onClick={() => navigate('/clients')}>
          거래처 목록으로
        </button>
      </PageShell>
    )
  }

  const last = lastCollection(data, id)
  const next = nextSchedule(data, id)
  const avg = clientMonthlyAvg(data, id)
  //  숫자의 근거를 화면에 함께 적습니다 — 「7.4톤」만 있으면 어디서 온
  //  값인지 알 수 없습니다.
  const avgDetail = clientMonthlyAvgDetail(data, id)
  //  엑셀에서 가져온 월 실적 (0025). 날짜별 기록이 없는 달의 수거량·매출입니다.
  const actuals = monthlyActualsFor(data, id)
  const outstanding = clientOutstanding(data, id)
  const logRows = collectionLog(data, id)
  const inspection = clientInspection(data, id)
  const requests = requestsForClient(data, id)
  const profile = clientProfile(client)
  const history = collectionHistory(data, id, 10)
  const histSummary = collectionHistorySummary(data, id)
  const matSummary = clientMaterialSummary(data, id)
  const bills = clientPaymentRows(data, id)
  // 축적된 운영 데이터 기반 다음 행동 AI 추천 + 월간 운영 리포트
  const actions = nextActionsFor(data, client)
  const report = clientMonthlyReport(data, client)

  function saveEdit() {
    // 폼이 비어 있으면 저장하지 않습니다. 예전에는 여기서 form.name 이
    // undefined 라 .trim() 이 터지면서 화면이 통째로 날아갔습니다.
    if (!form.name?.trim()) return
    updateClient(id, form)
    setEditing(false)
  }
  //  기록이 없는 거래처만 지웁니다. 기록이 있으면 서버가 무엇 때문인지
  //  숫자로 알려 주고, 그 문구를 그대로 화면에 띄웁니다.
  async function confirmPurge() {
    if (!client) return
    if (
      !window.confirm(
        `'${client.name}' 거래처를 완전히 삭제할까요?\n\n` +
          '되돌릴 수 없습니다. 수거·청구·자재·요청·메모 기록이 한 건이라도 있으면 ' +
          '삭제되지 않고 무엇이 남아 있는지 알려 드립니다.\n' +
          '실제로 거래하던 곳을 정리하는 것이라면 「거래 종료」를 쓰세요.',
      )
    ) {
      return
    }
    const reason = window.prompt('삭제 사유를 적어 주세요 (기록에 남습니다)', '') ?? ''
    const r = await purgeClient(id, reason.trim())
    if (r.ok) {
      navigate('/clients')
      return
    }
    window.alert(r.error ?? '삭제하지 못했습니다.')
  }

  function confirmRemove() {
    //  실제로는 지우지 않고 '그만둔 거래처' 로 돌립니다. 과거 수거·미수금·
    //  명세서가 그대로 남아야 하기 때문입니다. 그런데 "삭제할까요" 라고만
    //  물어서, 기록까지 없어지는 줄 알고 못 누르거나 반대로 정말 지워진 줄
    //  알게 됩니다. 무슨 일이 일어나는지 그대로 적습니다.
    if (
      window.confirm(
        `'${client?.name}' 거래처를 거래 종료 처리할까요?\n` +
          '목록에서는 빠지지만 지난 수거·미수금·명세서 기록은 그대로 남습니다.\n' +
          '거래처 목록 맨 아래 「거래 종료한 거래처」에서 언제든 되돌릴 수 있습니다.',
      )
    ) {
      removeClient(id)
      navigate('/clients')
    }
  }

  //  월평균이 무엇으로 나온 숫자인지 — 폰·PC 두 곳에서 같은 문장을 씁니다.
  const avgHint =
    avgDetail.months === 0
      ? '아직 기록이 없습니다'
      : `${avgDetail.months}개월 평균` +
        (avgDetail.fromExcel > 0 ? ` · 수거기록 ${avgDetail.fromRecords}달 + 엑셀 ${avgDetail.fromExcel}달` : '')

  return (
    <PageShell>
      {/*  「뒤로」는 폰에서 가장 자주 눌리는 버튼입니다. 글자 높이(29px)로
           두면 빗나갑니다 — 손가락 크기(44px)를 확보합니다. */}
      <button
        onClick={() => navigate('/clients')}
        className="-mx-2 flex min-h-[2.75rem] items-center gap-1.5 px-2 text-[1.08rem] font-bold text-navy-500"
      >
        <ArrowLeft size={16} /> 거래처 목록
      </button>

      {/*  헤더 카드 — PC 에서는 **가운데를 반으로 갈라** 왼쪽에 거래처 정보와
           핵심 지표를, 오른쪽에 「다음 행동 AI 추천」을 둡니다 (대표님 요청).
           지금까지는 추천이 정보 아래에 통째로 깔려서, 정작 매일 쓰는
           운영조건·정산·청구 탭이 화면 한참 아래로 밀려 있었습니다.
           나란히 놓으면 **탭이 그만큼 위로 올라옵니다** — 그게 이 배치의 목적입니다.
           폰에서는 세로 한 줄 그대로입니다(좁은 화면에서 반으로 가르면 둘 다 못 씁니다). */}
      <div className="card p-5">
      <div data-client-split className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-6">
      {/* ── 왼쪽 50% — 거래처 정보 + 월평균 수거량 ~ 다음 예정 수거 ── */}
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="min-w-0 break-keep text-[1.75rem] font-extrabold leading-tight text-navy-900">{client.name}</h1>
              <span className="shrink-0 rounded-lg bg-navy-50 px-2 py-0.5 text-[0.95rem] font-bold text-navy-500">{client.type}</span>
              <span className={`shrink-0 rounded-lg px-2 py-0.5 text-[0.9rem] font-bold ${client.isDemoGenerated ? 'bg-navy-100 text-navy-500' : 'bg-teal-50 text-teal-600'}`}>
                {client.isDemoGenerated ? '시연용' : '주요거래처'}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {client.collectsMedicalWaste && <WasteBadge type="의료폐기물" />}
              {client.collectsDiaper && <WasteBadge type="일회용기저귀" />}
            </div>
          </div>
        </div>
        <div className="mt-3 space-y-1.5 text-[1.08rem] text-navy-600">
          <p className="flex items-center gap-2"><MapPin size={15} className="shrink-0 text-navy-400" /> {client.address}</p>
          <p className="flex items-center gap-2"><Phone size={15} className="shrink-0 text-navy-400" /> {profile.roleManager} · {client.phone}</p>
          <p className="flex items-center gap-2"><RefreshCw size={15} className="shrink-0 text-navy-400" /> 수거주기 {client.collectionCycle}</p>
          <p className="flex items-center gap-2"><Recycle size={15} className="shrink-0 text-navy-400" /> 자재 보관창고 {client.storageSize}</p>
          {/*  마지막 수거 한 줄 — 언제 누가 얼마.
               잘했다/못했다를 매기지 않고 사실만 적습니다.
               현장 담당자에게도 보입니다(금액이 아니라 kg 입니다). */}
          <p className="flex items-center gap-2">
            <ClipboardCheck size={15} className="shrink-0 text-navy-400" />
            <LastCollectionLine clientId={id} className="!text-[1.08rem] !text-navy-600" />
          </p>
        </div>
        {client.note && (
          <p className="mt-3 flex items-start gap-2 rounded-2xl bg-amber-50 px-3.5 py-2.5 text-[1.08rem] font-medium text-amber-700">
            <Pin size={15} strokeWidth={2.4} className="mt-1 shrink-0" /> <span className="break-keep">{client.note}</span>
          </p>
        )}
        {/* 현장 메모 — 처리 전 항목을 헤더에서 바로 확인 */}
        <NoteChips notes={notesFor(id)} max={3} />

        {/*  PC 에서는 단추가 화면 끝까지 늘어날 이유가 없습니다 — 글자만큼만
             차지하고, 남은 자리에 핵심 지표를 놓습니다. 폰은 그대로
             (한 손으로 누르려면 넓은 편이 낫습니다). */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {/*  수거 입력 — 거래처를 보다가 바로 넣을 수 있어야 합니다.
               예전에는 왼쪽 메뉴로 나갔다가 목록에서 이 병원을 다시 찾아야
               했습니다. 거래처가 100곳 가까이 되면 그게 매번 일입니다.
               오늘 예정이 있으면 차량·시간까지 따라옵니다. */}
          <button
            data-go-collect={id}
            className="btn-primary flex-1 lg:flex-none lg:px-6"
            onClick={() => navigate(`/collection?client=${id}`)}
          >
            <PlusCircle size={17} strokeWidth={2.4} /> 수거 입력
          </button>
          <button className="btn-ghost flex-1 lg:flex-none lg:px-6" onClick={() => setLogOpen(true)}>
            <FileText size={17} strokeWidth={2.4} /> 수거대장 보기
          </button>
          {/* 배차 화면은 현장 담당자에게 막혀 있습니다 — 갈 수 없는 곳으로 보내지 않습니다 */}
          {canGoDispatch && (
            <button className="btn-ghost" onClick={() => navigate('/dispatch')}>
              <Truck size={16} /> 배차 반영
            </button>
          )}
        </div>

        {/*  ── 핵심 지표 (PC) ────────────────────────────────────────────────
             폰에서는 아래에 카드 넉 장으로 그대로 둡니다. PC 에서만 이 카드
             안으로 들여, 거래처 하나를 한 덩어리로 봅니다. */}
        <div
          data-key-metrics="pc"
          /*  반 칸에 넷을 가로로 늘어놓으면 한 칸이 150px 도 안 됩니다
              (실측) — 「월평균 수거량」이 두 줄로 접히고 숫자가 눌립니다.
              2×2 로 놓습니다. */
          className="mt-4 hidden border-t border-navy-100 pt-4 lg:grid lg:grid-cols-2 lg:gap-x-4 lg:gap-y-3.5"
        >
          <div className="">
            <p className="text-[1.03rem] font-semibold text-navy-400">월평균 수거량</p>
            <p className="mt-1 whitespace-nowrap text-[1.6rem] font-extrabold leading-none text-navy-900">
              {weight(avg)}
            </p>
            <p className="mt-1 text-[0.98rem] text-navy-400">{avgHint}</p>
          </div>
          {canSeeMoney ? (
            <button className="px-0 text-left" onClick={() => navigate('/receivables')}>
              <p className="text-[1.03rem] font-semibold text-navy-400">미수금</p>
              <p
                className={`mt-1 text-[1.6rem] font-extrabold leading-none ${
                  outstanding > 0 ? 'text-rose-500' : 'text-emerald-600'
                }`}
              >
                {outstanding > 0 ? won(outstanding) : '없음'}
              </p>
              <p className="mt-1 text-[0.98rem] text-navy-400">미수금 관리 →</p>
            </button>
          ) : (
            <span />
          )}
          <div className="">
            <p className="text-[1.03rem] font-semibold text-navy-400">최근 수거일</p>
            <p className="mt-1 text-[1.6rem] font-extrabold leading-none text-navy-900">
              {last ? prettyDate(last.date) : '—'}
            </p>
          </div>
          <div className="">
            <p className="text-[1.03rem] font-semibold text-navy-400">다음 예정 수거</p>
            <p className="mt-1 text-[1.6rem] font-extrabold leading-none text-navy-900">
              {next ? prettyDate(next.date) : '—'}
            </p>
          </div>
        </div>
        {/*  거래처 정보 수정과 거래 종료는 사무실·관리자 업무입니다.
             서버도 막고 있어(clients_update/clients_delete) 현장 담당자가
             눌러도 저장되지 않습니다. 눌리는데 안 되는 버튼은 두지 않습니다. */}
        {canEditClient && (
          <div className="mt-2 flex items-center justify-end gap-3">
            <button className="-mx-1 flex min-h-[2.75rem] items-center gap-1 px-1 text-[1.08rem] font-bold text-navy-400 transition hover:text-navy-600" onClick={openEdit}>
              <Pencil size={14} /> 수정
            </button>
            <button data-client-retire className="-mx-1 flex min-h-[2.75rem] items-center gap-1 px-1 text-[1.08rem] font-bold text-navy-300 transition hover:text-rose-500" onClick={confirmRemove}>
              <Trash2 size={14} /> 거래 종료
            </button>
            {/*
              완전 삭제 — 잘못 만든 거래처(오타로 두 번 등록, 시험용)를 지웁니다.
              기록이 한 건이라도 있으면 서버가 막습니다(0039). 「거래 종료」와
              뜻이 다르므로 버튼을 따로 둡니다.
            */}
            {role === 'admin' && (
              <button data-client-purge className="-mx-1 flex min-h-[2.75rem] items-center gap-1 px-1 text-[1.08rem] font-bold text-navy-300 transition hover:text-rose-500" onClick={() => void confirmPurge()}>
                <Trash2 size={14} /> 삭제
              </button>
            )}
          </div>
        )}

      </div>
      {/* ── 오른쪽 50% — 다음 행동 AI 추천 ─────────────────────────────────
           현장 담당자에게는 띄우지 않습니다 — 영업 판단이고, 병원에 가서 여는
           화면이라 금액이 상대방 눈에 들어갈 수도 있습니다.
           둘(추천 → 전환 이력)은 같은 이야기의 앞뒤라 위아래로 붙여 둡니다. */}
        <div
          className="mt-4 grid gap-3 border-t border-navy-100 pt-4 lg:mt-0 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0"
          data-client-insight-grid
        >
        {canSeeMoney && actions.length > 0 && (
          <section>
            <SectionTitle action={<span className="pill bg-teal-50 text-teal-700">데이터 기반 추천</span>}>
              다음 행동 AI 추천
            </SectionTitle>
            {/*  이미 카드 안입니다 — 여기서 또 card 를 쓰면 상자 속 상자가
                 됩니다. 옅은 바탕으로 「같은 카드의 한 칸」처럼 둡니다. */}
            <div className="divide-y divide-navy-100 rounded-2xl bg-navy-50/50 p-2">
              {actions.map((a, i) => {
                const meta = actionMeta[a.kind]
                const Icon = meta.icon
                return (
                  <div
                    key={`${a.kind}-${i}`}
                    className={`p-3 ${i > 0 && !allActions ? 'hidden lg:block' : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${meta.chip}`}>
                        <Icon size={17} strokeWidth={2.3} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="break-keep text-[1.22rem] font-extrabold leading-snug text-navy-900">{a.title}</p>
                          {a.estValue > 0 && (
                            <span className="pill bg-teal-50 text-teal-700">예상 +{wonShort(a.estValue)}</span>
                          )}
                        </div>
                        <p className="mt-1 break-keep text-[1.12rem] leading-snug text-navy-500">{a.reason}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {a.metrics.map((m) => (
                            <span key={m.label} className="break-keep rounded-lg bg-navy-50 px-2.5 py-1.5 text-[1rem] font-semibold text-navy-600">
                              {m.label} <span className="font-extrabold text-navy-800">{m.value}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="mt-2.5 flex flex-wrap gap-2 pl-12">
                      <button
                        className="pressable rounded-xl bg-navy-900 px-4 py-2.5 text-[1.07rem] font-bold text-white transition hover:bg-navy-800"
                        onClick={() =>
                          navigate(
                            a.kind === '소모품공급'
                              ? '/materials'
                              : a.kind === '관리필요'
                                ? '/receivables'
                                : '/collection',
                          )
                        }
                      >
                        {a.cta}
                      </button>
                      <button
                        className="rounded-xl bg-navy-50 px-4 py-2.5 text-[1.07rem] font-bold text-navy-600 transition hover:bg-navy-100"
                        onClick={() => setTab('report')}
                      >
                        리포트에 포함
                      </button>
                    </div>
                    {/*  영업 진행상태 — 추천 → 제안 → 수락 → 실제 매출.
                         ⚠ 폰에서는 이 한 덩어리가 239px 입니다(추천 카드 722px 의 3분의 1).
                           영업 담당이 가끔 누르는 것이지 거래처를 열 때마다 보는 것이
                           아니라, 폰에서만 눌러서 펼치게 합니다. PC 는 그대로 보입니다. */}
                    <div className={stageOpen ? '' : 'hidden lg:block'}>
                      <LeadStageControl action={a} />
                    </div>
                  </div>
                )
              })}
            </div>
            {!stageOpen && (
              <button
                data-stage-open
                onClick={() => setStageOpen(true)}
                className="mt-2 flex min-h-[2.75rem] w-full items-center justify-center rounded-2xl bg-navy-50 px-3.5 text-[1rem] font-bold text-navy-500 transition hover:bg-navy-100 lg:hidden"
              >
                영업 진행 상태 보기
              </button>
            )}
            {actions.length > 1 && (
              <button
                data-actions-more
                onClick={() => setAllActions((v) => !v)}
                className="mt-2 flex min-h-[2.75rem] w-full items-center justify-center gap-1.5 rounded-2xl bg-navy-50 px-3.5 text-[1rem] font-bold text-navy-600 transition hover:bg-navy-100 lg:hidden"
              >
                {allActions ? '추천 접기' : `추천 ${actions.length - 1}건 더 보기`}
              </button>
            )}
            <p className="mt-2 px-1 text-[0.98rem] leading-snug text-navy-400">
              이 거래처의 수거이력·자재공급·청구 데이터를 규칙에 대입해 도출한 추천입니다. 예상 금액은 실제 청구 단가
              기준의 참고 값입니다.
            </p>
          </section>
        )}

        {/* 영업 전환 이력 — 추천 → 제안 → 수락 → 실제 매출 (현장 담당자 제외) */}
        {/*  영업 전환 이력 — **작게만** 둡니다 (대표님 요청, 일단은).
             추천과 같은 칸에 있지만 오늘 할 일은 아니라, 제목을 한 급 낮추고
             접어 둡니다. 지운 것이 아니라 눌러서 펼칩니다. */}
        {canSeeMoney && (
          <details data-lead-history className="rounded-2xl bg-navy-50/60 px-3.5 py-2.5">
            <summary className="t-muted cursor-pointer list-none font-extrabold text-navy-500">
              영업 전환 이력 <span className="font-normal text-navy-300">· 담당자 기록 기준</span>
            </summary>
            <div className="mt-2">
              <ClientLeadHistory data={data} clientId={client.id} flat />
            </div>
          </details>
        )}
        </div>
      </div>

        {/*  담당 기사 (0056) — 관리자에게만 보입니다.
             거래처 정보 카드 안에 둡니다. 「이 병원은 누가 갑니까」는
             주소·담당자와 같은 줄의 정보이고, 여기서 고른 사람에게만
             이 거래처가 보입니다. */}
        <ClientDrivers clientId={client.id} />
      </div>

      {/*  핵심 지표 — 폰에서는 지금까지처럼 카드 넉 장으로 둡니다.
           PC 에서는 위 헤더 카드 안으로 들어갑니다(아래 KeyMetrics). */}
      <div data-key-metrics="phone" className="grid grid-cols-2 gap-3 lg:hidden">
        <MetricCard
          label="월평균 수거량"
          value={weight(avg)}
          tone="navy"
          nowrap
          hint={avgHint}
        />
        {/*
          미수금 칸도 현장 담당자에게는 열지 않습니다. 눌러도 미수금 화면은
          막혀 있어 "접근 권한이 없는 화면입니다" 만 나오고, 무엇보다 이
          숫자는 현장 업무에 필요하지 않습니다.
        */}
        {canSeeMoney && (
          <MetricCard
            label="미수금"
            value={outstanding > 0 ? won(outstanding) : '없음'}
            tone={outstanding > 0 ? 'rose' : 'emerald'}
            hint="미수금 관리 →"
            onClick={() => navigate('/receivables')}
          />
        )}
        <div className="card p-4">
          <p className="text-[1.03rem] font-semibold text-navy-400">최근 수거일</p>
          <p className="mt-1.5 text-base font-extrabold text-navy-900">{last ? prettyDate(last.date) : '—'}</p>
        </div>
        <div className="card p-4">
          <p className="text-[1.03rem] font-semibold text-navy-400">다음 예정 수거</p>
          <p className="mt-1.5 text-base font-extrabold text-navy-900">{next ? prettyDate(next.date) : '—'}</p>
          {/*  「—」만 있으면 「앞으로 갈 일이 없다」는 사실이 조용히 지나갑니다.
               잡을 자리를 바로 그 옆에 둡니다. */}
          {canBook && (
            <button
              data-book-open
              onClick={() => setBookOpen(true)}
              className="-mx-2 mt-1 flex min-h-[2.75rem] items-center gap-1 px-2 text-teal-700 t-btn font-extrabold hover:underline"
            >
              <CalendarPlus size={15} strokeWidth={2.5} /> {next ? '방문 더 잡기' : '방문 잡기'}
            </button>
          )}
        </div>
      </div>

      {/*  긴급이 반복되는 곳이면 그 사실을 여기서 알려 줍니다 — 아래 수거이력
           탭의 「긴급수거 3건」이라는 숫자만으로는 무엇을 해야 할지 모릅니다. */}
      <UrgentRiskCard clientId={client.id} />

      {canBook && (
        <BookVisitModal open={bookOpen} onClose={() => setBookOpen(false)} client={client} />
      )}

      {/*  인증·실사 관련 — **지금은 숨겨 둡니다** (대표님 요청).
           체크리스트가 아직 시연용이고(「체크리스트는 시연용이며」), 문자·카카오
           알림 연동도 안 돼 있어서 지금 상태로는 거래처 화면 위쪽을 차지할
           만큼의 값어치가 없습니다. 지우지 않고 이 스위치만 true 로 바꾸면
           그대로 돌아옵니다 — 실제 인증 일정을 넣어 쓰실 때가 오면 켭니다. */}
      {SHOW_INSPECTION && inspection && (
        <section>
          <SectionTitle action={<span className="pill bg-navy-50 text-navy-500">MVP 검증 중</span>}>인증·실사 관련</SectionTitle>
          <div className="card p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-navy-800 px-2.5 py-1 text-[0.98rem] font-bold text-white">{inspection.type}</span>
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[0.98rem] font-bold text-amber-600">인증 D-{inspection.dday}</span>
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[0.98rem] font-bold text-amber-600">{inspection.status}</span>
            </div>
            <p className="mt-3 text-[1.08rem] font-semibold text-navy-700">필요 자료 체크리스트</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {[...new Set(['올바로 자료', ...inspection.needs, '전용 용기', '표시라벨'])].map((n) => (
                <span key={n} className="break-keep rounded-lg bg-navy-50 px-2.5 py-1.5 text-[1rem] font-semibold text-navy-600">{n}</span>
              ))}
            </div>
            <p className="mt-3 rounded-xl bg-amber-50/70 px-3.5 py-2.5 text-[0.98rem] leading-snug text-amber-700">
              사전 확인 필요 · 전용 용기 재고와 최근 수거대장을 미리 준비합니다. 체크리스트는 시연용이며, 문자·카카오 알림
              연동은 향후 고도화 예정입니다.
            </p>
          </div>
        </section>
      )}

      {/*
        탭 — 돈이 보이는 탭은 현장 담당자에게 열지 않습니다.

         폰에서는 여덟 개가 가로로 한 줄이라 옆으로 밀어야 나머지가 보였고,
         밀 수 있다는 표시가 없었습니다. 화면에 처음 보이는 것은 「운영조건」
         하나뿐이라, 나머지 탭은 있는 줄도 모르고 지나가게 됩니다.
         폰에서는 두 칸 격자로 전부 펼쳐 놓고, 넓은 화면에서만 한 줄로 둡니다.
      */}
            {/*  ⚠ 폰에서는 탭 줄이 y=2,582px 에 있습니다 — 세 화면을 밀어야 나옵니다.
           위치를 옮기면 화면 구조가 바뀌므로, 대신 **화면 위에 붙여 둡니다**.
           한 번 지나가면 계속 손에 닿아, 탭을 옮길 때마다 위로 되돌아가지
           않아도 됩니다. PC 는 지금처럼 흐릅니다. */}
      <div
        data-client-tabs
        className="sticky top-0 z-20 -mx-4 grid grid-cols-2 gap-2 bg-[#f5f7fa]/95 px-4 py-2 backdrop-blur sm:static sm:mx-0 sm:flex sm:flex-wrap sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none lg:gap-1.5">
        {visibleTabs.map((t) => (
          <button
            key={t.id}
            data-client-tab={t.id}
            onClick={() => setTab(t.id)}
            //  PC 에서만 20% 키웁니다(1.12 → 1.34rem). 이 줄이 화면의 목차라
            //  본문보다 작으면 어디를 보고 있는지 매번 다시 찾게 됩니다.
            //  폰·태블릿은 그대로 — 좁은 화면에서 키우면 줄이 넘칩니다.
            className={`min-w-0 break-keep rounded-2xl px-3.5 py-2.5 text-[1.08rem] font-bold transition sm:shrink-0 sm:whitespace-nowrap sm:rounded-full sm:px-4 sm:text-[1.12rem] lg:px-3.5 lg:py-2.5 lg:text-[1.34rem] ${
              tab === t.id ? 'bg-teal-500 text-white shadow-sm' : 'bg-white text-navy-500 shadow-card'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── 월 정산 · 거래명세서 ──
          거래처별 엑셀에서 매달 하던 계산입니다.
          수량은 전부 현장 입력에서 오고, 여기서는 확인만 합니다. */}
      {tab === 'settlement' && canSeeMoney && (
        <SettlementPanel
          data={data}
          client={client}
          month={settleMonth}
          onMonthChange={setSettleMonth}
          onOpenInvoice={(inv) => {
            setShownInvoice(inv ?? null)
            setInvoiceOpen(true)
          }}
          onSavePricing={(pricing, from) => void savePricing(client.id, pricing, from)}
        />
      )}
      {tab === 'settlement' && canSeeMoney && <MonthlyActuals rows={actuals} purpose="settlement" />}

      {/* ── 월간 운영 리포트 ── */}
      {tab === 'report' && (
        <div className="space-y-4">
          <MonthlyReportView report={report} />
          {/*  날짜별 기록이 없어 리포트를 만들 수 없는 달도 실적은 있습니다.
               「엑셀에서 가져온 월 실적」으로 그대로 보여 줍니다. */}
          <MonthlyActuals rows={actuals} purpose="report" showMoney={canSeeMoney} />
        </div>
      )}

      {/* ── 현장 메모 / 특이사항 ── */}
      {tab === 'notes' && <SiteNotesPanel clientId={id} />}

      {/* ── 운영조건 ── */}
      {tab === 'ops' && (
        <div className="space-y-3">
          <div className="card flex flex-wrap gap-2 p-4">
            <Cond label={`수거주기 ${client.collectionCycle}`} />
            {client.collectsMedicalWaste && <Cond label="의료폐기물 차량" tone="rose" />}
            {client.collectsDiaper && <Cond label="일회용기저귀 차량" tone="teal" />}
            <Cond label={`보관창고 ${client.storageSize}`} />
            {client.storageSize === '작음' && <Cond label="자재 동시공급 권장" tone="amber" />}
            {(() => {
              // 계약 상태 — 만료가 가까우면 색으로 먼저 보입니다
              const cs = contractState(client, today())
              return cs ? <Cond label={`계약 ${cs.label}`} tone={cs.tone} /> : null
            })()}
            {client.paymentDueDay && <Cond label={`결제 익월 ${client.paymentDueDay}일`} />}
          </div>
          <div className="card p-4 sm:p-5">
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              {[
                ['거래 시작일', profile.startDate],
                ['계약 상태', profile.contractStatus],
                //  결제조건은 돈에 관한 계약 내용입니다. 현장 담당자에게는 빼고,
                //  나머지 운영조건(수거주기·가능시간·처리장)은 그대로 둡니다.
                ...(canSeeMoney ? [['결제조건', profile.paymentTerm]] : []),
                ['담당 역할', profile.roleManager],
                ['의료폐기물 수거주기', profile.medicalCycle],
                ['일회용기저귀 수거주기', profile.diaperCycle],
                ['수거 가능시간', profile.pickupWindow],
                ['평균 수거량', weight(avg)],
                ['처리장', profile.facility],
                ['보관창고', client.storageSize],
              ].map(([k, v]) => (
                <div key={k} className="flex items-start justify-between gap-3 border-b border-navy-50 pb-2.5">
                  <dt className="shrink-0 text-[1.08rem] font-semibold text-navy-400">{k}</dt>
                  <dd className="text-right text-[1.08rem] font-bold text-navy-800">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}

      {/* ── 수거이력 ── */}
      {tab === 'history' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard label="이번 달 수거횟수" value={histSummary.count} unit="회" tone="navy" nowrap />
            <MetricCard label="이번 달 총 수거량" value={weight(histSummary.totalKg)} tone="teal" nowrap />
            <MetricCard label="긴급수거" value={histSummary.urgent} unit="건" tone="rose" nowrap />
            <MetricCard label="자재 동시공급" value={histSummary.sameDayMaterial} unit="건" tone="amber" nowrap />
          </div>
          <div className="card overflow-x-auto p-1">
            <table className="w-full border-collapse text-left text-[0.98rem]">
              <thead>
                <tr className="bg-navy-50 text-navy-500">
                  {['날짜', '구분', '수거량', '용기', '기사', '차량', '인계', '유형', '대장'].map((h) => (
                    <th key={h} className="whitespace-nowrap px-2.5 py-2 font-bold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map((r) => (
                  <tr key={r.id} className="border-t border-navy-100 text-navy-700">
                    <td className="whitespace-nowrap px-2.5 py-2 font-semibold">{r.date.slice(5)} {r.scheduledTime}</td>
                    <td className="whitespace-nowrap px-2.5 py-2">{r.wasteType === '의료폐기물' ? '의료' : '기저귀'}</td>
                    <td className="whitespace-nowrap px-2.5 py-2 font-bold">{r.amountKg != null ? `${r.amountKg}kg` : '-'}</td>
                    {/*  용기는 현장에서 적은 것만 보여 줍니다 — 안 적었으면
                         비웁니다. 기본값을 채우면 「이만큼 받았다」가 됩니다. */}
                    <td className="whitespace-nowrap px-2.5 py-2">{r.containerType ?? '-'}</td>
                    <td className="whitespace-nowrap px-2.5 py-2">{r.driver}</td>
                    <td className="whitespace-nowrap px-2.5 py-2">{r.vehicleName}</td>
                    <td className="whitespace-nowrap px-2.5 py-2">
                      {r.handedOver ? `${r.handoverTime} 완료` : (r.handoverStatus ?? '예정')}
                    </td>
                    <td className="whitespace-nowrap px-2.5 py-2">{r.kind}</td>
                    <td className="whitespace-nowrap px-2.5 py-2">{r.inLedger ? '반영' : '-'}</td>
                  </tr>
                ))}
                {history.length === 0 && (
                  <tr><td colSpan={9} className="px-3 py-4 text-center text-navy-400">수거 이력이 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {/*  갈 수 없는 곳으로 보내는 버튼은 두지 않습니다. 현장 담당자에게는
               수거이력 화면이 막혀 있어(access.ts) 누르면 차단 안내만 뜹니다.
               이 탭 안에서 이 거래처의 이력은 이미 위 표에 다 나와 있습니다. */}
          {canGoHistory && (
            <button onClick={() => navigate('/history')} className="card pressable flex w-full items-center gap-3 p-4 text-left">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-600">
                <FileText size={19} strokeWidth={2.2} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-navy-900">전체 수거이력 보기</p>
                <p className="text-[0.98rem] text-navy-400">기간·차량·폐기물 구분 필터로 전체 이력을 확인합니다</p>
              </div>
              <ChevronRight size={18} className="shrink-0 text-navy-300" />
            </button>
          )}
        </div>
      )}

      {/* ── 자재관리 ── */}
      {tab === 'materials' && (
        <div className="space-y-3">
          <div className="card p-1">
            {matSummary.map((m) => (
              <div key={m.type} className="flex items-center justify-between gap-3 border-b border-navy-50 p-3.5 last:border-0">
                <div className="min-w-0">
                  <p className="break-keep font-bold text-navy-800">{m.type}</p>
                  <p className="mt-0.5 text-[0.98rem] font-medium text-navy-500">
                    이번 달 공급 {m.suppliedMonth} · 추정 잔량 {m.estRemain} · 최근 {m.lastDate ? prettyDate(m.lastDate) : '-'}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[0.98rem] font-bold ${usageStyle[m.status]}`}>{m.status}</span>
              </div>
            ))}
          </div>
          {canGoMaterials && (
            <>
              <p className="px-1 text-[0.98rem] leading-snug text-navy-400">
                자재 공급량과 실제 배출량 비교는 <b className="text-navy-500">자재 관리</b> 화면에서 확인합니다. 확정 판단이 아닌
                점검용 지표입니다.
              </p>
              <button onClick={() => navigate('/materials')} className="btn-ghost w-full">자재 관리에서 보기</button>
            </>
          )}
        </div>
      )}

      {/* ── 요청·알림 ── */}
      {tab === 'requests' && (
        <div className="space-y-3">
          {requests.length === 0 ? (
            <p className="card p-4 text-[1.08rem] text-navy-400">등록된 요청이 없습니다.</p>
          ) : (
            <div className="card divide-y divide-navy-100 p-1">
              {requests.map((r) => (
                <div key={r.id} className="p-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-lg bg-teal-50 px-2 py-0.5 text-[0.98rem] font-bold text-teal-700">{REQUEST_KIND_LABEL[r.type]}</span>
                    {r.urgent && <span className="rounded-lg bg-rose-50 px-2 py-0.5 text-[0.98rem] font-bold text-rose-500">긴급</span>}
                    <span className={`rounded-lg px-2 py-0.5 text-[0.98rem] font-bold ${reqStatusStyle[r.status]}`}>{r.status}</span>
                    <span className="ml-auto text-[0.98rem] text-navy-400">{r.when}</span>
                  </div>
                  <p className="mt-1.5 text-[1.08rem] leading-snug text-navy-700">{r.content}</p>
                  <p className="mt-1 text-[0.98rem] text-navy-400">
                    {r.source === 'portal' ? '병원 담당자 직접 등록' : '전화·카톡 접수'}
                    {r.requesterName && ` · ${r.requesterName}`}
                  </p>
                  {r.reply && (
                    <p className="mt-1.5 rounded-xl bg-teal-50/70 px-3 py-2 text-[1.02rem] leading-snug text-teal-800">
                      회신: {r.reply}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
          <Link to="/requests" className="btn-ghost inline-flex">
            병원 요청 화면에서 처리하기
          </Link>
        </div>
      )}

      {/* ── 결제·미수금 ── */}
      {tab === 'billing' && canSeeMoney && (
        <div className="space-y-3">
          <div className="card overflow-x-auto p-1">
            <table className="w-full border-collapse text-left text-[0.98rem]">
              <thead>
                <tr className="bg-navy-50 text-navy-500">
                  {['청구월', '청구금액', '입금', '미수금', '계산서', '상태'].map((h) => (
                    <th key={h} className="whitespace-nowrap px-2.5 py-2 font-bold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bills.map((b) => (
                  <tr key={b.id} className="border-t border-navy-100 text-navy-700">
                    <td className="whitespace-nowrap px-2.5 py-2 font-semibold">{b.month}</td>
                    <td className="whitespace-nowrap px-2.5 py-2">{b.amount.toLocaleString('ko-KR')}</td>
                    <td className="whitespace-nowrap px-2.5 py-2">{b.paid.toLocaleString('ko-KR')}</td>
                    <td className={`whitespace-nowrap px-2.5 py-2 font-bold ${b.outstanding > 0 ? 'text-rose-500' : 'text-navy-500'}`}>{b.outstanding.toLocaleString('ko-KR')}</td>
                    <td className="whitespace-nowrap px-2.5 py-2">{b.invoiceIssued ? '발행' : '-'}</td>
                    <td className="whitespace-nowrap px-2.5 py-2"><span className={`rounded-full px-2 py-0.5 text-[0.95rem] font-bold ${billStyle[b.status]}`}>{b.status}</span></td>
                  </tr>
                ))}
                {bills.length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-4 text-center text-navy-400">청구 내역이 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/*  청구별 입금 기록 (0026).
               100만원 청구에 30만원만 들어오는 일이 실제로 있습니다. 표의
               「입금·미수금」 칸은 결과만 보여 주므로, 언제 얼마가 어떻게
               들어왔는지는 여기서 넣고 확인합니다. */}
          {bills
            .filter((b) => b.status !== '취소')
            .map((b) => (
              <div key={`r-${b.id}`}>
                <p className="t-muted mb-1.5 break-keep px-1 font-bold text-navy-500">{b.month} 청구</p>
                <ReceiptPanel paymentId={b.id} billed={b.amount} paid={b.paid} canceled={false} />
              </div>
            ))}
          {/*  엑셀에서 가져온 달의 매출. 어느 달이 입금됐는지는 파일에 없어
               청구로 만들지 않았습니다 — 여기서 눈으로 확인하고 「미수금
               관리」에서 잡으시면 됩니다. 지어내서 미수금을 만들지 않습니다. */}
          <MonthlyActuals rows={actuals} purpose="billing" />
          <button onClick={() => navigate('/receivables')} className="btn-ghost w-full">미수금 관리에서 보기</button>
        </div>
      )}

      {/* 수정 모달 */}
      <Modal
        open={editing}
        title="거래처 수정"
        onClose={() => setEditing(false)}
        footer={
          <>
            <button className="btn-ghost flex-1" onClick={() => setEditing(false)}>취소</button>
            <button className="btn-primary flex-1" onClick={saveEdit}>저장</button>
          </>
        }
      >
        <ClientForm form={form} setForm={setForm} />
      </Modal>

      {/* 수거대장 미리보기 */}
      {invoiceOpen && (
        <InvoiceView
          /*
            청구를 확정했으면 그때 굳혀 둔 명세서를 그대로 엽니다. 지금 값으로
            다시 계산하면, 단가를 바꾼 뒤 다시 뽑았을 때 이미 병원에 보낸
            금액과 달라집니다.
          */
          invoice={shownInvoice ?? invoiceForBilled(data, client.id, settleMonth)}
          onClose={() => {
            setInvoiceOpen(false)
            setShownInvoice(null)
          }}
        />
      )}

      <Modal
        open={logOpen}
        title="수거대장 미리보기"
        printable
        onClose={() => setLogOpen(false)}
        footer={
          <>
            <span className="pill bg-navy-50 text-navy-500">PDF 출력 예정</span>
            <button className="btn-navy ml-auto" onClick={() => window.print()}>
              <Printer size={16} /> 인쇄용 화면
            </button>
          </>
        }
      >
        <div>
          <p className="text-[1.08rem] font-bold text-navy-800">{client.name}</p>
          <p className="t-caption">월간 수거대장 · 수거이력 + 자재공급 통합</p>
        </div>
        <div className="overflow-x-auto rounded-2xl ring-1 ring-navy-100">
          <table className="w-full border-collapse text-left text-[0.98rem]">
            <thead>
              <tr className="bg-navy-50 text-navy-500">
                <th className="whitespace-nowrap px-3 py-2 font-bold">수거일</th>
                <th className="whitespace-nowrap px-3 py-2 font-bold">구분</th>
                <th className="whitespace-nowrap px-3 py-2 font-bold">수거량</th>
                <th className="whitespace-nowrap px-3 py-2 font-bold">자재(박스/비닐/바늘통)</th>
                <th className="whitespace-nowrap px-3 py-2 font-bold">담당자</th>
                <th className="whitespace-nowrap px-3 py-2 font-bold">비고</th>
              </tr>
            </thead>
            <tbody>
              {logRows.map((r, i) => (
                <tr key={i} className="border-t border-navy-100 text-navy-700">
                  <td className="whitespace-nowrap px-3 py-2 font-semibold">{r.date}</td>
                  <td className="whitespace-nowrap px-3 py-2">{r.wasteType}</td>
                  <td className="whitespace-nowrap px-3 py-2">{r.amount != null ? `${r.amount}kg` : '-'}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {r.wasteType === '자재공급' ? `${r.box}/${r.vinyl}/${r.needle}` : '-'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">{r.manager}</td>
                  <td className="whitespace-nowrap px-3 py-2">{r.note}</td>
                </tr>
              ))}
              {logRows.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-4 text-center text-navy-400">이번 달 기록이 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-[0.98rem] leading-snug text-navy-400">
          병원 요청 시 별도 수거대장 제공을 위해 수거이력과 자재공급 이력을 통합하여 출력하는 구조로 고도화 예정입니다.
        </p>
      </Modal>
    </PageShell>
  )
}

function Cond({ label, tone = 'navy' }: { label: string; tone?: 'navy' | 'rose' | 'teal' | 'amber' }) {
  const styles = {
    navy: 'bg-navy-50 text-navy-600',
    rose: 'bg-rose-50 text-rose-500',
    teal: 'bg-teal-50 text-teal-600',
    amber: 'bg-amber-50 text-amber-600',
  }[tone]
  return <span className={`rounded-full px-3 py-1.5 text-[0.98rem] font-bold ${styles}`}>{label}</span>
}
