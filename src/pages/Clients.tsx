import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useData } from '../context/DataContext'
import { PageHeader } from '../components/PageHeader'
import { Modal } from '../components/Modal'
import { FilterChip, EmptyState } from '../components/ui'
import { ClientForm, CLIENT_TYPES, emptyClientForm } from '../components/ClientForm'
import type { Client, ClientType } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// 거래처 관리 — 목록 / 유형 필터 / 추가 / 상세 페이지 이동
// ─────────────────────────────────────────────────────────────────────────────

export function Clients() {
  const { data, addClient } = useData()
  const navigate = useNavigate()
  const [filter, setFilter] = useState<ClientType | '전체'>('전체')
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState<Omit<Client, 'id'>>(emptyClientForm)

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

  function save() {
    if (!form.name.trim()) return
    const created = addClient(form)
    setAdding(false)
    navigate(`/clients/${created.id}`)
  }

  return (
    <div>
      <PageHeader
        title="거래처 관리"
        subtitle={`총 ${data.clients.length}곳`}
        action={
          <button className="btn-primary" onClick={() => { setForm(emptyClientForm); setAdding(true) }}>
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
        <ul className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
          {filtered.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => navigate(`/clients/${c.id}`)}
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
                <div className="flex shrink-0 items-center gap-1">
                  {c.collectsMedicalWaste && (
                    <span className="rounded-lg bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-500">의료</span>
                  )}
                  {c.collectsDiaper && (
                    <span className="rounded-lg bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-600">기저귀</span>
                  )}
                  <ChevronRight size={16} className="text-navy-300" />
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* 추가 폼 모달 */}
      <Modal
        open={adding}
        title="거래처 추가"
        onClose={() => setAdding(false)}
        footer={
          <>
            <button className="btn-ghost flex-1" onClick={() => setAdding(false)}>
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
