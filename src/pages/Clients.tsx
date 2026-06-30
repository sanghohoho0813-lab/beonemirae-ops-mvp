import { useMemo, useState } from 'react'
import { useData } from '../context/DataContext'
import { PageHeader } from '../components/PageHeader'
import { Modal } from '../components/Modal'
import { FilterChip, EmptyState } from '../components/ui'
import type { Client, ClientType, StorageSize } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// 거래처 관리 — 목록 / 유형 필터 / 추가·수정·삭제 / 상세 보기
// ─────────────────────────────────────────────────────────────────────────────

const CLIENT_TYPES: ClientType[] = [
  '병원',
  '요양병원',
  '의원',
  '장례식장',
  '요양원',
  '치과',
  '한의원',
  '한방병원',
]
const STORAGE_SIZES: StorageSize[] = ['큼', '보통', '작음']

const emptyForm: Omit<Client, 'id'> = {
  name: '',
  type: '병원',
  address: '',
  manager: '',
  phone: '',
  collectionCycle: '주 1회',
  collectsMedicalWaste: true,
  collectsDiaper: false,
  storageSize: '보통',
  note: '',
}

export function Clients() {
  const { data, addClient, updateClient, removeClient } = useData()
  const [filter, setFilter] = useState<ClientType | '전체'>('전체')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Client | 'new' | null>(null)
  const [detail, setDetail] = useState<Client | null>(null)
  const [form, setForm] = useState<Omit<Client, 'id'>>(emptyForm)

  const filtered = useMemo(() => {
    return data.clients.filter((c) => {
      if (filter !== '전체' && c.type !== filter) return false
      if (query && !c.name.includes(query) && !c.address.includes(query)) return false
      return true
    })
  }, [data.clients, filter, query])

  const counts = useMemo(() => {
    const map: Record<string, number> = { 전체: data.clients.length }
    for (const c of data.clients) map[c.type] = (map[c.type] ?? 0) + 1
    return map
  }, [data.clients])

  function openNew() {
    setForm(emptyForm)
    setEditing('new')
  }
  function openEdit(c: Client) {
    const { id: _id, ...rest } = c
    setForm(rest)
    setEditing(c)
    setDetail(null)
  }
  function save() {
    if (!form.name.trim()) return
    if (editing === 'new') addClient(form)
    else if (editing) updateClient(editing.id, form)
    setEditing(null)
  }
  function confirmRemove(c: Client) {
    if (window.confirm(`'${c.name}' 거래처를 삭제할까요?`)) {
      removeClient(c.id)
      setDetail(null)
    }
  }

  return (
    <div>
      <PageHeader
        title="거래처 관리"
        subtitle={`총 ${data.clients.length}곳`}
        action={
          <button className="btn-primary" onClick={openNew}>
            ＋ 거래처 추가
          </button>
        }
      />

      <input
        className="field-input mb-3"
        placeholder="거래처명 · 주소 검색"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {/* 유형 필터 칩 (가로 스크롤) */}
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {(['전체', ...CLIENT_TYPES] as const).map((t) => (
          <FilterChip key={t} active={filter === t} onClick={() => setFilter(t)}>
            {t}
            {counts[t] ? ` ${counts[t]}` : ''}
          </FilterChip>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon="🏥" title="조건에 맞는 거래처가 없어요" subtitle="검색어나 필터를 바꿔 보세요." />
      ) : (
        <ul className="space-y-2.5">
          {filtered.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => setDetail(c)}
                className="card pressable flex w-full items-center justify-between gap-3 p-4 text-left"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[15px] font-bold text-navy-900">{c.name}</span>
                    <span className="shrink-0 rounded-lg bg-navy-50 px-2 py-0.5 text-[11px] font-bold text-navy-500">
                      {c.type}
                    </span>
                  </div>
                  <p className="mt-1 truncate t-caption">
                    {c.manager} · {c.phone} · {c.collectionCycle}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  {c.collectsMedicalWaste && (
                    <span className="rounded-lg bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-500">의료</span>
                  )}
                  {c.collectsDiaper && (
                    <span className="rounded-lg bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-600">기저귀</span>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* 상세 보기 모달 */}
      <Modal
        open={detail !== null}
        title="거래처 상세"
        onClose={() => setDetail(null)}
        footer={
          detail && (
            <>
              <button className="btn-danger" onClick={() => confirmRemove(detail)}>
                삭제
              </button>
              <button className="btn-navy flex-1" onClick={() => openEdit(detail)}>
                수정
              </button>
            </>
          )
        }
      >
        {detail && (
          <dl className="space-y-2.5 text-sm">
            <Row label="거래처명" value={detail.name} />
            <Row label="유형" value={detail.type} />
            <Row label="주소" value={detail.address} />
            <Row label="담당자" value={detail.manager} />
            <Row label="연락처" value={detail.phone} />
            <Row label="수거주기" value={detail.collectionCycle} />
            <Row
              label="수거 항목"
              value={[detail.collectsMedicalWaste && '의료폐기물', detail.collectsDiaper && '일회용기저귀']
                .filter(Boolean)
                .join(', ') || '없음'}
            />
            <Row label="창고 크기" value={detail.storageSize} />
            <Row label="특이사항" value={detail.note || '—'} />
          </dl>
        )}
      </Modal>

      {/* 추가/수정 폼 모달 */}
      <Modal
        open={editing !== null}
        title={editing === 'new' ? '거래처 추가' : '거래처 수정'}
        onClose={() => setEditing(null)}
        footer={
          <>
            <button className="btn-ghost flex-1" onClick={() => setEditing(null)}>
              취소
            </button>
            <button className="btn-primary flex-1" onClick={save}>
              저장
            </button>
          </>
        }
      >
        <ClientForm form={form} setForm={setForm} />
      </Modal>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-navy-50 pb-2">
      <dt className="shrink-0 text-navy-400">{label}</dt>
      <dd className="text-right font-medium text-navy-800">{value}</dd>
    </div>
  )
}

function ClientForm({
  form,
  setForm,
}: {
  form: Omit<Client, 'id'>
  setForm: (f: Omit<Client, 'id'>) => void
}) {
  const set = <K extends keyof Omit<Client, 'id'>>(key: K, value: Omit<Client, 'id'>[K]) =>
    setForm({ ...form, [key]: value })

  return (
    <>
      <div>
        <label className="field-label">거래처명 *</label>
        <input className="field-input" value={form.name} onChange={(e) => set('name', e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="field-label">유형</label>
          <select className="field-input" value={form.type} onChange={(e) => set('type', e.target.value as ClientType)}>
            {CLIENT_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label">창고 크기</label>
          <select
            className="field-input"
            value={form.storageSize}
            onChange={(e) => set('storageSize', e.target.value as StorageSize)}
          >
            {STORAGE_SIZES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="field-label">주소</label>
        <input className="field-input" value={form.address} onChange={(e) => set('address', e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="field-label">담당자</label>
          <input className="field-input" value={form.manager} onChange={(e) => set('manager', e.target.value)} />
        </div>
        <div>
          <label className="field-label">연락처</label>
          <input className="field-input" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
        </div>
      </div>
      <div>
        <label className="field-label">수거주기</label>
        <input
          className="field-input"
          value={form.collectionCycle}
          onChange={(e) => set('collectionCycle', e.target.value)}
          placeholder="예: 주 2회"
        />
      </div>
      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-sm font-medium text-navy-700">
          <input
            type="checkbox"
            className="h-4 w-4 accent-teal-600"
            checked={form.collectsMedicalWaste}
            onChange={(e) => set('collectsMedicalWaste', e.target.checked)}
          />
          의료폐기물 수거
        </label>
        <label className="flex items-center gap-2 text-sm font-medium text-navy-700">
          <input
            type="checkbox"
            className="h-4 w-4 accent-teal-600"
            checked={form.collectsDiaper}
            onChange={(e) => set('collectsDiaper', e.target.checked)}
          />
          일회용기저귀 수거
        </label>
      </div>
      <div>
        <label className="field-label">특이사항</label>
        <textarea
          className="field-input"
          rows={2}
          value={form.note}
          onChange={(e) => set('note', e.target.value)}
        />
      </div>
    </>
  )
}
