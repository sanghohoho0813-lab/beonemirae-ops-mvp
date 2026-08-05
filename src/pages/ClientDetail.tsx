import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
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
} from 'lucide-react'
import { useData } from '../context/DataContext'
import { WasteBadge } from '../components/Badge'
import { Modal } from '../components/Modal'
import { PageShell, SectionTitle, MetricCard, EmptyState } from '../components/ui'
import { ClientForm } from '../components/ClientForm'
import {
  lastCollection,
  nextSchedule,
  clientMonthlyAvg,
  clientOutstanding,
  collectionLog,
  clientInspection,
  requestsForClient,
  clientProfile,
  collectionHistory,
  collectionHistorySummary,
  clientMaterialSummary,
  clientPaymentRows,
  type RequestStatus,
  type UsageStatus,
  type BillStatus,
} from '../lib/ops'
import { prettyDate, weight, won, wonShort } from '../lib/format'
import { nextActionsFor, clientMonthlyReport } from '../lib/insights'
import { actionMeta } from '../components/Opportunities'
import { LeadStageControl } from '../components/LeadStage'
import { ClientLeadHistory } from '../components/LeadHistory'
import { MonthlyReportView } from '../components/MonthlyReport'
import { SiteNotesPanel, NoteChips } from '../components/SiteNotes'
import type { Client } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// 거래처 상세 (/clients/:id) — 실제 거래처 운영관리 화면
//  헤더 + 핵심지표 + 인증·실사 대응(상시) + 탭(운영조건/수거이력/자재/요청·알림/결제·미수금)
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
  '입금 예정': 'bg-navy-100 text-navy-600',
  '확인 필요': 'bg-amber-50 text-amber-600',
  '장기 미수': 'bg-rose-50 text-rose-500',
}

const TABS = [
  { id: 'ops', label: '운영조건' },
  { id: 'report', label: '월간 리포트' },
  { id: 'notes', label: '현장 메모' },
  { id: 'history', label: '수거이력' },
  { id: 'materials', label: '자재관리' },
  { id: 'requests', label: '요청·알림' },
  { id: 'billing', label: '결제·미수금' },
] as const
type TabId = (typeof TABS)[number]['id']

export function ClientDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { data, clientById, updateClient, removeClient, notesFor } = useData()
  const client = clientById(id)

  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Omit<Client, 'id'>>(() => {
    if (!client) return {} as Omit<Client, 'id'>
    const { id: _id, ...rest } = client
    return rest
  })
  const [logOpen, setLogOpen] = useState(false)
  const [tab, setTab] = useState<TabId>('ops')

  if (!client) {
    return (
      <PageShell>
        <EmptyState icon="🔍" title="거래처를 찾을 수 없어요" subtitle="목록에서 다시 선택해 주세요." />
        <button className="btn-ghost mx-auto" onClick={() => navigate('/clients')}>
          거래처 목록으로
        </button>
      </PageShell>
    )
  }

  const last = lastCollection(data, id)
  const next = nextSchedule(data, id)
  const avg = clientMonthlyAvg(data, id)
  const outstanding = clientOutstanding(data, id)
  const logRows = collectionLog(data, id)
  const inspection = clientInspection(data, id)
  const requests = requestsForClient(data, id)
  const profile = clientProfile(client)
  const history = collectionHistory(data, id, 10)
  const histSummary = collectionHistorySummary(data, id)
  const matSummary = clientMaterialSummary(data, id)
  const bills = clientPaymentRows(data, id)
  // 축적된 운영 데이터 기반 다음 행동 추천 + 월간 운영 리포트
  const actions = nextActionsFor(data, client)
  const report = clientMonthlyReport(data, client)

  function saveEdit() {
    if (!form.name.trim()) return
    updateClient(id, form)
    setEditing(false)
  }
  function confirmRemove() {
    if (window.confirm(`'${client?.name}' 거래처를 삭제할까요?`)) {
      removeClient(id)
      navigate('/clients')
    }
  }

  return (
    <PageShell>
      <button onClick={() => navigate('/clients')} className="flex items-center gap-1.5 text-[0.95rem] font-bold text-navy-500">
        <ArrowLeft size={16} /> 거래처 목록
      </button>

      {/* 헤더 카드 */}
      <div className="card p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="min-w-0 break-keep text-[1.625rem] font-extrabold leading-tight text-navy-900">{client.name}</h1>
              <span className="shrink-0 rounded-lg bg-navy-50 px-2 py-0.5 text-[0.82rem] font-bold text-navy-500">{client.type}</span>
              <span className={`shrink-0 rounded-lg px-2 py-0.5 text-[0.78rem] font-bold ${client.isDemoGenerated ? 'bg-navy-100 text-navy-500' : 'bg-teal-50 text-teal-600'}`}>
                {client.isDemoGenerated ? '시연용' : '주요거래처'}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {client.collectsMedicalWaste && <WasteBadge type="의료폐기물" />}
              {client.collectsDiaper && <WasteBadge type="일회용기저귀" />}
            </div>
          </div>
        </div>
        <div className="mt-3 space-y-1.5 text-[0.95rem] text-navy-600">
          <p className="flex items-center gap-2"><MapPin size={15} className="shrink-0 text-navy-400" /> {client.address}</p>
          <p className="flex items-center gap-2"><Phone size={15} className="shrink-0 text-navy-400" /> {profile.roleManager} · {client.phone}</p>
          <p className="flex items-center gap-2"><RefreshCw size={15} className="shrink-0 text-navy-400" /> 수거주기 {client.collectionCycle}</p>
          <p className="flex items-center gap-2"><Recycle size={15} className="shrink-0 text-navy-400" /> 자재 보관창고 {client.storageSize}</p>
        </div>
        {client.note && <p className="mt-3 rounded-2xl bg-amber-50 px-3.5 py-2.5 text-[0.95rem] font-medium text-amber-700">📌 {client.note}</p>}
        {/* 현장 메모 — 처리 전 항목을 헤더에서 바로 확인 */}
        <NoteChips notes={notesFor(id)} max={3} />

        <div className="mt-4 flex items-center gap-2">
          <button className="btn-primary flex-1" onClick={() => setLogOpen(true)}>
            <FileText size={17} strokeWidth={2.4} /> 수거대장 보기
          </button>
          <button className="btn-ghost" onClick={() => navigate('/dispatch')}>
            <Truck size={16} /> 배차 반영
          </button>
        </div>
        <div className="mt-2 flex items-center justify-end gap-3">
          <button className="flex items-center gap-1 text-[0.95rem] font-bold text-navy-400 transition hover:text-navy-600" onClick={() => setEditing(true)}>
            <Pencil size={14} /> 수정
          </button>
          <button className="flex items-center gap-1 text-[0.95rem] font-bold text-navy-300 transition hover:text-rose-500" onClick={confirmRemove}>
            <Trash2 size={14} /> 삭제
          </button>
        </div>
      </div>

      {/* 핵심 지표 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="월평균 수거량" value={weight(avg)} tone="navy" nowrap />
        <MetricCard
          label="미수금"
          value={outstanding > 0 ? won(outstanding) : '없음'}
          tone={outstanding > 0 ? 'rose' : 'emerald'}
          hint="미수금 관리 →"
          onClick={() => navigate('/receivables')}
        />
        <div className="card p-4">
          <p className="text-[0.9rem] font-semibold text-navy-400">최근 수거일</p>
          <p className="mt-1.5 text-base font-extrabold text-navy-900">{last ? prettyDate(last.date) : '—'}</p>
        </div>
        <div className="card p-4">
          <p className="text-[0.9rem] font-semibold text-navy-400">다음 예정 수거</p>
          <p className="mt-1.5 text-base font-extrabold text-navy-900">{next ? prettyDate(next.date) : '—'}</p>
        </div>
      </div>

      {/* 다음 행동 추천 — 축적된 운영 데이터 기반 */}
      {actions.length > 0 && (
        <section>
          <SectionTitle action={<span className="pill bg-teal-50 text-teal-700">데이터 기반 추천</span>}>
            다음 행동 추천
          </SectionTitle>
          <div className="card divide-y divide-navy-50 p-2">
            {actions.map((a, i) => {
              const meta = actionMeta[a.kind]
              const Icon = meta.icon
              return (
                <div key={`${a.kind}-${i}`} className="p-3">
                  <div className="flex items-start gap-3">
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${meta.chip}`}>
                      <Icon size={17} strokeWidth={2.3} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="break-keep text-[1.125rem] font-extrabold leading-snug text-navy-900">{a.title}</p>
                        {a.estValue > 0 && (
                          <span className="pill bg-teal-50 text-teal-700">예상 +{wonShort(a.estValue)}</span>
                        )}
                      </div>
                      <p className="mt-1 break-keep text-[1rem] leading-snug text-navy-500">{a.reason}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {a.metrics.map((m) => (
                          <span key={m.label} className="break-keep rounded-lg bg-navy-50 px-2.5 py-1.5 text-[0.875rem] font-semibold text-navy-600">
                            {m.label} <span className="font-extrabold text-navy-800">{m.value}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-2 pl-12">
                    <button
                      className="pressable rounded-xl bg-navy-900 px-4 py-2.5 text-[0.9375rem] font-bold text-white transition hover:bg-navy-800"
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
                      className="rounded-xl bg-navy-50 px-4 py-2.5 text-[0.9375rem] font-bold text-navy-600 transition hover:bg-navy-100"
                      onClick={() => setTab('report')}
                    >
                      리포트에 포함
                    </button>
                  </div>
                  {/* 영업 진행상태 — 추천 → 제안 → 수락 → 실제 매출 */}
                  <LeadStageControl action={a} />
                </div>
              )
            })}
          </div>
          <p className="mt-2 px-1 text-[0.85rem] leading-snug text-navy-400">
            이 거래처의 수거이력·자재공급·청구 데이터를 규칙에 대입해 도출한 추천입니다. 예상 금액은 실제 청구 단가
            기준의 참고 값입니다.
          </p>
        </section>
      )}

      {/* 영업 전환 이력 — 추천 → 제안 → 수락 → 실제 매출 */}
      <section>
        <SectionTitle action={<span className="pill bg-navy-50 text-navy-500">담당자 기록 기준</span>}>
          영업 전환 이력
        </SectionTitle>
        <ClientLeadHistory data={data} clientId={client.id} />
      </section>

      {/* 인증·실사 대응 (상시 노출) */}
      {inspection && (
        <section>
          <SectionTitle action={<span className="pill bg-navy-50 text-navy-500">MVP 검증 중</span>}>인증·실사 대응</SectionTitle>
          <div className="card p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-navy-800 px-2.5 py-1 text-[0.85rem] font-bold text-white">{inspection.type}</span>
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[0.85rem] font-bold text-amber-600">인증 D-{inspection.dday}</span>
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[0.85rem] font-bold text-amber-600">{inspection.status}</span>
            </div>
            <p className="mt-3 text-[0.95rem] font-semibold text-navy-700">필요 자료 체크리스트</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {[...new Set(['올바로 자료', ...inspection.needs, '전용 용기', '표시라벨'])].map((n) => (
                <span key={n} className="break-keep rounded-lg bg-navy-50 px-2.5 py-1.5 text-[0.875rem] font-semibold text-navy-600">{n}</span>
              ))}
            </div>
            <p className="mt-3 rounded-xl bg-amber-50/70 px-3.5 py-2.5 text-[0.85rem] leading-snug text-amber-700">
              사전 확인 필요 · 전용 용기 재고와 최근 수거대장을 미리 준비합니다. 체크리스트는 시연용이며, 문자·카카오 알림
              연동은 향후 고도화 예정입니다.
            </p>
          </div>
        </section>
      )}

      {/* 탭 */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2.5 text-[1rem] font-bold transition ${
              tab === t.id ? 'bg-teal-500 text-white shadow-sm' : 'bg-white text-navy-500 shadow-card'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── 월간 운영 리포트 ── */}
      {tab === 'report' && <MonthlyReportView report={report} />}

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
          </div>
          <div className="card p-4 sm:p-5">
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              {[
                ['거래 시작일', profile.startDate],
                ['계약 상태', profile.contractStatus],
                ['결제조건', profile.paymentTerm],
                ['담당 역할', profile.roleManager],
                ['의료폐기물 수거주기', profile.medicalCycle],
                ['일회용기저귀 수거주기', profile.diaperCycle],
                ['수거 가능시간', profile.pickupWindow],
                ['평균 수거량', weight(avg)],
                ['처리장', profile.facility],
                ['보관창고', client.storageSize],
              ].map(([k, v]) => (
                <div key={k} className="flex items-start justify-between gap-3 border-b border-navy-50 pb-2.5">
                  <dt className="shrink-0 text-[0.95rem] font-semibold text-navy-400">{k}</dt>
                  <dd className="text-right text-[0.95rem] font-bold text-navy-800">{v}</dd>
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
            <table className="w-full border-collapse text-left text-[0.85rem]">
              <thead>
                <tr className="bg-navy-50 text-navy-500">
                  {['날짜', '구분', '성상', '수거량', '용기', '기사', '차량', '인계', '유형', '대장'].map((h) => (
                    <th key={h} className="whitespace-nowrap px-2.5 py-2 font-bold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map((r) => (
                  <tr key={r.id} className="border-t border-navy-100 text-navy-700">
                    <td className="whitespace-nowrap px-2.5 py-2 font-semibold">{r.date.slice(5)} {r.scheduledTime}</td>
                    <td className="whitespace-nowrap px-2.5 py-2">{r.wasteType === '의료폐기물' ? '의료' : '기저귀'}</td>
                    <td className="whitespace-nowrap px-2.5 py-2">{r.form}</td>
                    <td className="whitespace-nowrap px-2.5 py-2 font-bold">{r.amountKg != null ? `${r.amountKg}kg` : '-'}</td>
                    <td className="whitespace-nowrap px-2.5 py-2">{r.containerType} {r.containerCount}</td>
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
                  <tr><td colSpan={10} className="px-3 py-4 text-center text-navy-400">수거 이력이 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <button onClick={() => navigate('/history')} className="card pressable flex w-full items-center gap-3 p-4 text-left">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-600">
              <FileText size={19} strokeWidth={2.2} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-navy-900">전체 수거이력 보기</p>
              <p className="text-[0.85rem] text-navy-400">기간·차량·폐기물 구분 필터로 전체 이력을 확인합니다</p>
            </div>
            <ChevronRight size={18} className="shrink-0 text-navy-300" />
          </button>
        </div>
      )}

      {/* ── 자재관리 ── */}
      {tab === 'materials' && (
        <div className="space-y-3">
          <div className="card p-1">
            {matSummary.map((m) => (
              <div key={m.type} className="flex items-center justify-between gap-3 border-b border-navy-50 p-3.5 last:border-0">
                <div className="min-w-0">
                  <p className="truncate font-bold text-navy-800">{m.type}</p>
                  <p className="mt-0.5 text-[0.85rem] font-medium text-navy-500">
                    이번 달 공급 {m.suppliedMonth} · 추정 잔량 {m.estRemain} · 최근 {m.lastDate ? prettyDate(m.lastDate) : '-'}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[0.85rem] font-bold ${usageStyle[m.status]}`}>{m.status}</span>
              </div>
            ))}
          </div>
          <p className="px-1 text-[0.85rem] leading-snug text-navy-400">
            자재 공급량과 실제 배출량 비교는 <b className="text-navy-500">자재 관리</b> 화면에서 확인합니다. 확정 판단이 아닌
            점검용 지표입니다.
          </p>
          <button onClick={() => navigate('/materials')} className="btn-ghost w-full">자재 관리에서 보기</button>
        </div>
      )}

      {/* ── 요청·알림 ── */}
      {tab === 'requests' && (
        <div className="space-y-3">
          {requests.length === 0 ? (
            <p className="card p-4 text-[0.95rem] text-navy-400">등록된 요청이 없습니다.</p>
          ) : (
            <div className="card divide-y divide-navy-100 p-1">
              {requests.map((r) => (
                <div key={r.id} className="p-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-lg bg-teal-50 px-2 py-0.5 text-[0.85rem] font-bold text-teal-700">{r.type}</span>
                    {r.urgent && <span className="rounded-lg bg-rose-50 px-2 py-0.5 text-[0.85rem] font-bold text-rose-500">긴급</span>}
                    <span className={`rounded-lg px-2 py-0.5 text-[0.85rem] font-bold ${reqStatusStyle[r.status]}`}>{r.status}</span>
                    <span className="ml-auto text-[0.85rem] text-navy-400">{r.when}</span>
                  </div>
                  <p className="mt-1.5 text-[0.95rem] leading-snug text-navy-700">{r.content}</p>
                  <p className="mt-1 text-[0.85rem] text-navy-400">담당 {profile.roleManager} 접수 · 전화·카카오 기록</p>
                </div>
              ))}
            </div>
          )}
          <p className="px-1 text-[0.85rem] leading-snug text-navy-400">
            현재는 관리자·이사가 전화·카톡 요청을 기록하는 MVP이며, 병원 담당자 직접 요청 기능은 향후 고도화 예정입니다.
          </p>
        </div>
      )}

      {/* ── 결제·미수금 ── */}
      {tab === 'billing' && (
        <div className="space-y-3">
          <div className="card overflow-x-auto p-1">
            <table className="w-full border-collapse text-left text-[0.85rem]">
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
                    <td className="whitespace-nowrap px-2.5 py-2"><span className={`rounded-full px-2 py-0.5 text-[0.82rem] font-bold ${billStyle[b.status]}`}>{b.status}</span></td>
                  </tr>
                ))}
                {bills.length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-4 text-center text-navy-400">청구 내역이 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          </div>
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
      <Modal
        open={logOpen}
        title="수거대장 미리보기"
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
          <p className="text-[0.95rem] font-bold text-navy-800">{client.name}</p>
          <p className="t-caption">월간 수거대장 · 수거이력 + 자재공급 통합</p>
        </div>
        <div className="overflow-x-auto rounded-2xl ring-1 ring-navy-100">
          <table className="w-full border-collapse text-left text-[0.85rem]">
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
        <p className="text-[0.85rem] leading-snug text-navy-400">
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
  return <span className={`rounded-full px-3 py-1.5 text-[0.85rem] font-bold ${styles}`}>{label}</span>
}
