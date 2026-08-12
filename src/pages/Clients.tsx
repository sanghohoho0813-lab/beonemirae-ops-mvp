import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, ChevronRight, SearchX } from 'lucide-react'
import { useData } from '../context/DataContext'
import { useAuth } from '../context/AuthContext'
import { canSeeMoney } from '../lib/access'
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
  const { configured, role } = useAuth()
  //  시연 모드(설정 없음)에서는 기존과 동일하게 전부 보입니다.
  const showMoney = !configured || canSeeMoney(role)
  const canAddClient = !configured || canSeeMoney(role)
  const live = mode === 'live'
  const navigate = useNavigate()
  const [filter, setFilter] = useState<Filter>('전체')
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState<Omit<Client, 'id'>>(emptyClientForm)

  const filtered = useMemo(() => {
    //  폰 자판은 낱말 뒤에 공백을 붙여 주는 일이 잦습니다. 그대로 비교하면
    //  분명히 있는 거래처인데 "없어요" 가 나옵니다. 앞뒤 공백을 떼고,
    //  영문 대소문자도 가리지 않습니다.
    const q = query.trim().toLowerCase()
    return data.clients.filter((c) => {
      if (!matchFilter(c, filter)) return false
      if (q && !c.name.toLowerCase().includes(q) && !c.address.toLowerCase().includes(q)) return false
      return true
    })
  }, [data.clients, filter, query])

  const realCount = data.clients.filter((c) => !c.isDemoGenerated).length
  const demoCount = data.clients.length - realCount

  async function save() {
    const name = form.name.trim()
    if (!name) return
    //  같은 이름으로 하나 더 만들면 수거도 정산도 둘로 갈립니다. 나중에
    //  어느 쪽이 진짜인지 알 수 없게 되고, 명세서가 두 장 나갑니다.
    //  막지는 않습니다 — 실제로 상호가 같은 다른 병원일 수 있습니다.
    const dupActive = data.clients.find((c) => c.name.trim() === name)
    const dupRetired = data.retiredClients?.find((c) => c.name.trim() === name)
    if (dupActive || dupRetired) {
      const okToAdd = window.confirm(
        dupActive
          ? `'${name}' 은(는) 이미 거래처 목록에 있습니다.\n` +
              '같은 이름으로 하나 더 만들면 수거와 정산이 둘로 갈립니다. 그래도 만들까요?'
          : `'${name}' 은(는) 거래를 종료한 거래처로 남아 있습니다.\n` +
              '새로 만들면 지난 수거·미수금 기록과 이어지지 않고 따로 시작됩니다. 그래도 만들까요?',
      )
      if (!okToAdd) return
    }
    //  서버가 저장을 마치고 준 id 로 이동합니다. 저장이 실패하면 목록에
    //  남고, 화면 위쪽의 저장 오류 안내가 그대로 보입니다.
    const created = await addClient(form)
    setAdding(false)
    if (created) navigate(`/clients/${created.id}`)
  }

  return (
    <div>
      <PageHeader
        title="거래처 관리"
        subtitle={live ? `총 ${data.clients.length}곳` : `총 ${data.clients.length}곳 · 실제 ${realCount} / 시연용 ${demoCount}`}
        action={
          //  거래처 등록은 사무실·관리자 업무입니다. 서버도 막고 있어
          //  (RLS: clients_write) 현장 담당자가 눌러도 저장되지 않습니다.
          canAddClient ? (
            <button className="btn-primary" onClick={() => { setForm(emptyClientForm); setAdding(true) }}>
              ＋ 추가
            </button>
          ) : undefined
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
          action={canAddClient ? { label: '첫 거래처 등록', onClick: () => { setForm(emptyClientForm); setAdding(true) } } : undefined}
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon={SearchX} title="조건에 맞는 거래처가 없어요" subtitle="검색어나 필터를 바꿔 보세요." />
      ) : (
        <ul className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
          {filtered.map((c, ci) => {
            const unpaid = clientOutstanding(data, c.id) > 0
            // 이 거래처의 최우선 추천 (수거이력·자재·청구 데이터 기반)
            const topAction = nextActionsFor(data, c)[0]
            const meta = topAction ? actionMeta[topAction.kind] : null
            return (
              <li key={c.id} data-tour={ci === 0 ? 'client-list' : undefined}>
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
                      {unpaid && showMoney && <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[0.9rem] font-bold text-amber-600">미수금</span>}
                    </div>
                    {/*  추천은 영업 판단이고 금액이 함께 붙습니다(「추가 수거 제안 · +70만원」).
                        현장 담당자에게는 띄우지 않습니다 — 방문해서 수거하는 데
                        필요한 정보가 아니고, 병원 앞에서 열어 볼 수도 있는 화면입니다. */}
                    {showMoney && topAction && meta && topAction.kind !== '정기수거' && (
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
