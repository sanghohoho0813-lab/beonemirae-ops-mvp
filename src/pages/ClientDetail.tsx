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
} from 'lucide-react'
import { useData } from '../context/DataContext'
import { WasteBadge } from '../components/Badge'
import { Modal } from '../components/Modal'
import { PageShell, SectionTitle, MetricCard, EmptyState } from '../components/ui'
import { ClientForm } from '../components/ClientForm'
import {
  clientSchedules,
  clientMaterials,
  lastCollection,
  nextSchedule,
  clientMonthlyAvg,
  clientOutstanding,
  collectionLog,
} from '../lib/ops'
import { prettyDate, weight, won } from '../lib/format'
import type { Client } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// 거래처 상세 (/clients/:id) — 수거조건·이력·자재·미수금·수거대장 통합
// ─────────────────────────────────────────────────────────────────────────────

export function ClientDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { data, clientById, updateClient, removeClient } = useData()
  const client = clientById(id)

  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Omit<Client, 'id'>>(() => {
    if (!client) return {} as Omit<Client, 'id'>
    const { id: _id, ...rest } = client
    return rest
  })
  const [logOpen, setLogOpen] = useState(false)

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

  const schedules = clientSchedules(data, id)
  const materials = clientMaterials(data, id)
  const last = lastCollection(data, id)
  const next = nextSchedule(data, id)
  const avg = clientMonthlyAvg(data, id)
  const outstanding = clientOutstanding(data, id)
  const logRows = collectionLog(data, id)

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
      <button
        onClick={() => navigate('/clients')}
        className="flex items-center gap-1.5 text-sm font-bold text-navy-500"
      >
        <ArrowLeft size={16} /> 거래처 목록
      </button>

      {/* 헤더 카드 */}
      <div className="card p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-xl font-extrabold text-navy-900">{client.name}</h1>
              <span className="shrink-0 rounded-lg bg-navy-50 px-2 py-0.5 text-[0.6875rem] font-bold text-navy-500">{client.type}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {client.collectsMedicalWaste && <WasteBadge type="의료폐기물" />}
              {client.collectsDiaper && <WasteBadge type="일회용기저귀" />}
            </div>
          </div>
        </div>
        <div className="mt-3 space-y-1.5 text-sm text-navy-600">
          <p className="flex items-center gap-2"><MapPin size={15} className="shrink-0 text-navy-400" /> {client.address}</p>
          <p className="flex items-center gap-2"><Phone size={15} className="shrink-0 text-navy-400" /> {client.manager} · {client.phone}</p>
          <p className="flex items-center gap-2"><RefreshCw size={15} className="shrink-0 text-navy-400" /> 수거주기 {client.collectionCycle}</p>
          <p className="flex items-center gap-2"><Recycle size={15} className="shrink-0 text-navy-400" /> 자재 보관창고 {client.storageSize}</p>
        </div>
        {client.note && <p className="mt-3 rounded-2xl bg-amber-50 px-3.5 py-2.5 text-sm font-medium text-amber-700">📌 {client.note}</p>}

        <div className="mt-4 flex items-center gap-2">
          <button className="btn-primary flex-1" onClick={() => setLogOpen(true)}>
            <FileText size={17} strokeWidth={2.4} /> 수거대장 보기
          </button>
          <button className="btn-ghost" onClick={() => navigate('/dispatch')}>
            <Truck size={16} /> 배차 반영
          </button>
        </div>
        <div className="mt-2 flex items-center justify-end gap-3">
          <button className="flex items-center gap-1 text-sm font-bold text-navy-400 transition hover:text-navy-600" onClick={() => setEditing(true)}>
            <Pencil size={14} /> 수정
          </button>
          <button className="flex items-center gap-1 text-sm font-bold text-navy-300 transition hover:text-rose-500" onClick={confirmRemove}>
            <Trash2 size={14} /> 삭제
          </button>
        </div>
      </div>

      {/* 핵심 지표 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="월평균 수거량" value={weight(avg)} tone="navy" />
        <MetricCard
          label="미수금"
          value={outstanding > 0 ? won(outstanding) : '없음'}
          tone={outstanding > 0 ? 'rose' : 'emerald'}
          hint="미수금 관리 →"
          onClick={() => navigate('/receivables')}
        />
        <div className="card p-4">
          <p className="text-[0.8125rem] font-semibold text-navy-400">최근 수거일</p>
          <p className="mt-1.5 text-base font-extrabold text-navy-900">{last ? prettyDate(last.date) : '—'}</p>
        </div>
        <div className="card p-4">
          <p className="text-[0.8125rem] font-semibold text-navy-400">다음 예정 수거</p>
          <p className="mt-1.5 text-base font-extrabold text-navy-900">{next ? prettyDate(next.date) : '—'}</p>
        </div>
      </div>

      {/* 배차·경로 반영 수거조건 */}
      <section>
        <SectionTitle>배차·경로 추천 반영 수거조건</SectionTitle>
        <div className="card flex flex-wrap gap-2 p-4">
          <Cond label={`수거주기 ${client.collectionCycle}`} />
          {client.collectsMedicalWaste && <Cond label="의료폐기물 차량" tone="rose" />}
          {client.collectsDiaper && <Cond label="일회용기저귀 차량" tone="teal" />}
          <Cond label={`보관창고 ${client.storageSize}`} />
          {client.storageSize === '작음' && <Cond label="자재 동시공급 권장" tone="amber" />}
        </div>
      </section>

      {/* 이력 */}
      <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
        <section>
          <SectionTitle>최근 수거 이력</SectionTitle>
          <div className="card divide-y divide-navy-100 p-1">
            {schedules.slice(0, 3).map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-2 p-3.5">
                <div className="flex min-w-0 items-center gap-2">
                  <WasteBadge type={s.wasteType} />
                  <span className="truncate text-sm font-semibold text-navy-700">{prettyDate(s.date)} {s.scheduledTime}</span>
                </div>
                <span className="shrink-0 text-sm font-bold text-navy-800">
                  {s.actualAmount != null ? weight(s.actualAmount) : s.status}
                </span>
              </div>
            ))}
            {schedules.length === 0 && <p className="p-4 text-sm text-navy-400">수거 이력이 없습니다.</p>}
          </div>
        </section>

        <section>
          <SectionTitle>최근 자재 공급 이력</SectionTitle>
          <div className="card divide-y divide-navy-100 p-1">
            {materials.slice(0, 3).map((m) => (
              <div key={m.id} className="p-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-navy-700">{prettyDate(m.date)}</span>
                  {m.isAdditionalRequest && <span className="pill bg-amber-50 text-amber-600">추가요청</span>}
                </div>
                <p className="mt-1 text-xs font-medium text-navy-500">
                  박스 {m.boxCount} · 비닐 {m.vinylCount} · 바늘통 {m.needleBoxCount}
                </p>
              </div>
            ))}
            {materials.length === 0 && <p className="p-4 text-sm text-navy-400">자재 공급 이력이 없습니다.</p>}
          </div>
        </section>
      </div>

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
          <p className="text-sm font-bold text-navy-800">{client.name}</p>
          <p className="t-caption">월간 수거대장 · 수거이력 + 자재공급 통합</p>
        </div>
        <div className="overflow-x-auto rounded-2xl ring-1 ring-navy-100">
          <table className="w-full border-collapse text-left text-xs">
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
        <p className="text-xs leading-snug text-navy-400">
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
  return <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${styles}`}>{label}</span>
}
