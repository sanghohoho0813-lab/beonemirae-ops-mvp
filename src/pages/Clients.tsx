import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, ChevronRight, SearchX } from 'lucide-react'
import { useData } from '../context/DataContext'
import { PageHeader } from '../components/PageHeader'
import { Modal } from '../components/Modal'
import { FilterChip, EmptyState } from '../components/ui'
import { ClientForm, emptyClientForm } from '../components/ClientForm'
import { clientOutstanding } from '../lib/ops'
import { nextActionsFor } from '../lib/insights'
import { actionMeta } from '../components/Opportunities'
import { wonShort } from '../lib/format'
import { CLIENT_SETS, type ClientSetSize } from '../lib/storage'
import type { Client } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// 거래처 관리 — 데이터 세트 선택 + 실제/시연용 구분 + 필터
// ─────────────────────────────────────────────────────────────────────────────

type Filter = '전체' | '실제' | '시연용' | '병원' | '요양병원' | '의원' | '기타'
const FILTERS: Filter[] = ['전체', '실제', '시연용', '병원', '요양병원', '의원', '기타']

function matchFilter(c: Client, f: Filter): boolean {
  switch (f) {
    case '전체': return true
    case '실제': return !c.isDemoGenerated
    case '시연용': return c.isDemoGenerated
    case '병원': return c.type === '병원'
    case '요양병원': return c.type === '요양병원'
    case '의원': return c.type === '의원'
    case '기타': return !['병원', '요양병원', '의원'].includes(c.type)
  }
}

export function Clients() {
  const { data, addClient, clientSet, setClientSet, mode } = useData()
  const live = mode === 'live'
  const navigate = useNavigate()
  const [filter, setFilter] = useState<Filter>('전체')
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState<Omit<Client, 'id'>>(emptyClientForm)

  const filtered = useMemo(() => {
    return data.clients.filter((c) => {
      if (!matchFilter(c, filter)) return false
      if (query && !c.name.includes(query) && !c.address.includes(query)) return false
      return true
    })
  }, [data.clients, filter, query])

  const realCount = data.clients.filter((c) => !c.isDemoGenerated).length
  const demoCount = data.clients.length - realCount

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
        subtitle={live ? `총 ${data.clients.length}곳` : `총 ${data.clients.length}곳 · 실제 ${realCount} / 시연용 ${demoCount}`}
        action={
          <button className="btn-primary" onClick={() => { setForm(emptyClientForm); setAdding(true) }}>
            ＋ 추가
          </button>
        }
      />

      {/* 거래처 데이터 세트 — 시연 전용.
          실제 운영 DB 에서는 동작하지 않는 데다("시연용 데이터" 문구까지 보입니다)
          고객사 화면에 시연 흔적을 남기므로 아예 그리지 않습니다. */}
      {!live && (
      <div className="mb-4">
        <div className="mb-1.5 flex items-center justify-between px-1">
          <p className="text-[1.03rem] font-bold text-navy-700">거래처 데이터 세트</p>
          {clientSet > 0 && <span className="text-[0.95rem] font-medium text-navy-400">현재 시연 데이터 기준</span>}
        </div>
        <div className="flex gap-1 rounded-2xl bg-navy-50 p-1">
          {CLIENT_SETS.map((s) => {
            const active = clientSet === s.demoCount
            return (
              <button
                key={s.demoCount}
                onClick={() => setClientSet(s.demoCount as ClientSetSize)}
                className={`flex-1 rounded-xl py-2 text-center text-[1.08rem] font-extrabold transition active:scale-[0.98] ${
                  active ? 'bg-white text-teal-600 shadow-sm' : 'text-navy-500'
                }`}
              >
                {s.total}곳
              </button>
            )
          })}
        </div>
        <p className="mt-1.5 px-1 text-[0.95rem] leading-snug text-navy-400">
          기본 5곳은 실제 주요거래처, 확장(+10/20/30)은 서울·경기권 시연용 데이터입니다.
        </p>
      </div>
      )}

      <input className="field-input mb-3" placeholder="거래처명 · 주소 검색" value={query} onChange={(e) => setQuery(e.target.value)} />

      {/* 필터 칩 (가로 스크롤) */}
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {FILTERS.map((f) => (
          <FilterChip key={f} active={filter === f} onClick={() => setFilter(f)}>{f}</FilterChip>
        ))}
      </div>

      {/* 아직 한 곳도 없는 것(신규 고객사 1일차)과 필터에 안 걸린 것은 다른 상황입니다.
          전자는 "등록하세요", 후자는 "조건을 바꾸세요"가 맞는 안내입니다. */}
      {data.clients.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="아직 등록된 거래처가 없습니다"
          subtitle="거래처를 등록하면 수거 일정·이력·월간 리포트가 함께 만들어집니다."
          action={{ label: '첫 거래처 등록', onClick: () => { setForm(emptyClientForm); setAdding(true) } }}
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon={SearchX} title="조건에 맞는 거래처가 없어요" subtitle="검색어나 필터를 바꿔 보세요." />
      ) : (
        <ul className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
          {filtered.map((c) => {
            const unpaid = clientOutstanding(data, c.id) > 0
            // 이 거래처의 최우선 추천 (수거이력·자재·청구 데이터 기반)
            const topAction = nextActionsFor(data, c)[0]
            const meta = topAction ? actionMeta[topAction.kind] : null
            return (
              <li key={c.id}>
                <button onClick={() => navigate(`/clients/${c.id}`)} className="card pressable flex w-full items-center justify-between gap-3 p-4 text-left">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="break-keep text-[1.07rem] font-bold text-navy-900">{c.name}</span>
                      <span className="shrink-0 rounded-lg bg-navy-50 px-2 py-0.5 text-[0.95rem] font-bold text-navy-500">{c.type}</span>
                      {c.isDemoGenerated ? (
                        <span className="shrink-0 rounded-lg bg-navy-100 px-2 py-0.5 text-[0.9rem] font-bold text-navy-500">시연용</span>
                      ) : (
                        <span className="shrink-0 rounded-lg bg-teal-50 px-2 py-0.5 text-[0.9rem] font-bold text-teal-600">주요거래처</span>
                      )}
                    </div>
                    <p className="mt-1 break-keep t-caption">{c.manager} · {c.collectionCycle}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {c.collectsMedicalWaste && <span className="rounded-md bg-rose-50 px-1.5 py-0.5 text-[0.9rem] font-bold text-rose-500">의료</span>}
                      {c.collectsDiaper && <span className="rounded-md bg-teal-50 px-1.5 py-0.5 text-[0.9rem] font-bold text-teal-600">기저귀</span>}
                      {unpaid && <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[0.9rem] font-bold text-amber-600">미수금</span>}
                    </div>
                    {topAction && meta && topAction.kind !== '정기수거' && (
                      <p className={`mt-2 inline-flex max-w-full items-center gap-1 rounded-lg px-2 py-1 text-[0.95rem] font-bold ${meta.chip}`}>
                        <meta.icon size={12} strokeWidth={2.6} className="shrink-0" />
                        <span className="break-keep">{topAction.title}</span>
                        {topAction.estValue > 0 && <span className="shrink-0">· +{wonShort(topAction.estValue)}</span>}
                      </p>
                    )}
                  </div>
                  <ChevronRight size={16} className="shrink-0 text-navy-300" />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {/* 추가 폼 모달 */}
      <Modal
        open={adding}
        title="거래처 추가"
        onClose={() => setAdding(false)}
        footer={
          <>
            <button className="btn-ghost flex-1" onClick={() => setAdding(false)}>취소</button>
            <button className="btn-primary flex-1" onClick={save}>저장</button>
          </>
        }
      >
        <ClientForm form={form} setForm={setForm} />
      </Modal>
    </div>
  )
}
