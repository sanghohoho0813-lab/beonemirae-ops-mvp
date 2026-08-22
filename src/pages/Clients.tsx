import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, ChevronRight, RotateCcw, SearchX } from 'lucide-react'
import { useData } from '../context/DataContext'
import { useAuth } from '../context/AuthContext'
import { canSeeMoney } from '../lib/access'
import { PageHeader } from '../components/PageHeader'
import { Modal } from '../components/Modal'
import { FilterChip, EmptyState } from '../components/ui'
import { LoadGate } from '../components/LoadState'
import { ClientForm, emptyClientForm } from '../components/ClientForm'
import { clientOutstanding } from '../lib/ops'
import { nextActionsFor } from '../lib/insights'
import { actionMeta } from '../components/Opportunities'
import { wonShort } from '../lib/format'
import { CLIENT_SETS, type ClientSetSize } from '../lib/storage'
import { findNameMatches, type NameMatch } from '../lib/clientName'
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
  const { data, addClient, restoreClient, clientSet, setClientSet, mode } = useData()
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
  //  이름이 부딪히는 거래처들 — null 이면 아직 안 물어본 상태입니다.
  const [dupOf, setDupOf] = useState<NameMatch<Client>[] | null>(null)
  const [saveError, setSaveError] = useState('')
  //  「이번 저장 시도」 표. 창을 열 때 하나 만들고 성공하면 버립니다.
  const [requestId, setRequestId] = useState('')

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

  //  거래를 종료한 곳 — 목록에는 없지만 되살릴 수 있어야 합니다.
  const retired = data.retiredClients ?? []

  const realCount = data.clients.filter((c) => !c.isDemoGenerated).length
  const demoCount = data.clients.length - realCount

  /**
   * 실제로 등록합니다.
   *
   *  `allowDuplicate` 를 켜는 것은 사람이 「정말 다른 병원입니다」를 누른
   *  경우뿐입니다. 서버도 같은 규칙으로 한 번 더 막습니다 — 두 사람이 같은
   *  순간에 누르면 화면이 먼저 확인한 것으로는 못 막습니다 (0045).
   */
  async function commit(allowDuplicate: boolean) {
    setSaveError('')
    //  같은 저장 시도는 한 번만 들어갑니다 — 통신이 끊긴 줄 알고 다시 눌러도
    //  두 곳이 되지 않습니다.
    const created = await addClient({ ...form, name: form.name.trim() }, { allowDuplicate, requestId })
    if (!created) {
      setSaveError('거래처를 만들지 못했습니다. 위쪽 안내를 확인해 주세요.')
      return
    }
    setDupOf(null)
    setAdding(false)
    navigate(`/clients/${created.id}`)
  }

  function save() {
    const name = form.name.trim()
    if (!name) return
    //  같은 이름으로 하나 더 만들면 수거도 정산도 둘로 갈립니다. 나중에
    //  어느 쪽이 진짜인지 알 수 없게 되고, 명세서가 두 장 나갑니다.
    //  막기만 하지는 않습니다 — 실제로 상호가 같은 다른 병원일 수 있고,
    //  그건 사람만 압니다. 어느 거래처와 부딪히는지 보여 주고 고르게 합니다.
    const hits = findNameMatches(name, [...data.clients, ...(data.retiredClients ?? [])])
    const same = hits.filter((h) => h.kind === 'same')
    if (same.length > 0 || hits.length > 0) {
      setDupOf(hits)
      return
    }
    void commit(false)
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
            <button
              className="btn-primary"
              onClick={() => {
                setForm(emptyClientForm)
                setSaveError('')
                setDupOf(null)
                setRequestId(crypto.randomUUID())
                setAdding(true)
              }}
            >
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
          {clientSet > 0 && <span className="text-[0.95rem] font-medium text-navy-500">현재 시연 데이터 기준</span>}
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
        <LoadGate
          loadingTitle="거래처를 불러오는 중입니다"
          empty={
            <EmptyState
              icon={Building2}
              title="아직 등록된 거래처가 없습니다"
              subtitle="거래처를 등록하면 수거 일정·이력·월간 리포트가 함께 만들어집니다."
              action={canAddClient ? { label: '첫 거래처 등록', onClick: () => { setForm(emptyClientForm); setAdding(true) } } : undefined}
            />
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon={SearchX} title="조건에 맞는 거래처가 없어요" subtitle="검색어나 필터를 바꿔 보세요." />
      ) : (
        <ul data-guide="guide-client-list" className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
          {filtered.map((c, ci) => {
            const unpaid = clientOutstanding(data, c.id) > 0
            // 이 거래처의 최우선 추천 (수거이력·자재·청구 데이터 기반)
            const topAction = nextActionsFor(data, c)[0]
            const meta = topAction ? actionMeta[topAction.kind] : null
            return (
              <li
                key={c.id}
                data-tour={ci === 0 ? 'client-list' : undefined}
                data-guide={ci === 0 ? 'guide-client-first' : undefined}
              >
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
                      {/*  ⚠ 0069 — rose-500/rose-50 은 대비 3.3:1, 글자도 16px 로 작았습니다.
                           거래처마다 하나씩 붙어 이 화면에서 가장 많이 보이는 글자입니다. */}
                      {c.collectsMedicalWaste && <span className="rounded-md bg-rose-50 px-1.5 py-0.5 text-[0.95rem] font-bold text-rose-700">의료</span>}
                      {c.collectsDiaper && <span className="rounded-md bg-teal-50 px-1.5 py-0.5 text-[0.9rem] font-bold text-teal-600">기저귀</span>}
                      {unpaid && showMoney && <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[0.9rem] font-bold text-amber-700">미수금</span>}
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

      {/*  거래 종료한 거래처 — 되돌리는 길.
           「거래 종료」는 목록에서 사라지기만 할 뿐 기록은 남습니다. 그런데
           되돌리는 길이 앱 안에 없어서, 실수로 눌렀거나 다시 거래를 시작하면
           새로 만드는 수밖에 없었습니다. 새로 만들면 지난 수거·미수금이
           이어지지 않고 둘로 갈립니다.

           거래처를 다시 살리는 것은 정산에 바로 영향을 주므로, 거래처를
           추가할 수 있는 분(사무실·관리자)에게만 보여 줍니다. */}
      {canAddClient && retired.length > 0 && (
        <details data-retired-clients className="mt-4 rounded-2xl bg-navy-50 px-4 py-3">
          <summary className="t-body cursor-pointer break-keep font-bold text-navy-600">
            거래 종료한 거래처 {retired.length}곳
          </summary>
          <p className="t-muted mt-1.5 break-keep">
            목록·오늘 일정·정산에서 빠져 있습니다. 다시 거래를 시작하면 「거래 재개」를 눌러 주세요 — 지난
            수거·미수금 기록이 그대로 이어집니다.
          </p>
          <div className="mt-2.5 space-y-2">
            {retired.map((c) => (
              <div key={c.id} data-retired-client={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-white px-4 py-3">
                <div className="min-w-0 flex-1 basis-[9rem]">
                  <p className="t-body break-keep font-bold text-navy-500">{c.name}</p>
                  <p className="t-muted break-keep">
                    {c.type}
                    {c.address ? ` · ${c.address}` : ''}
                  </p>
                </div>
                <button
                  onClick={() => {
                    if (window.confirm(`'${c.name}' 을(를) 다시 거래 중으로 되돌릴까요?`)) restoreClient(c.id)
                  }}
                  className="btn-ghost shrink-0"
                >
                  <RotateCcw size={16} strokeWidth={2.4} /> 거래 재개
                </button>
              </div>
            ))}
          </div>
        </details>
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
        {saveError && (
          <p data-client-save-error className="mb-2 rounded-xl bg-rose-50 px-3 py-2 text-rose-700">
            {saveError}
          </p>
        )}
        <ClientForm form={form} setForm={setForm} />
      </Modal>

      {/*
        이름이 부딪힐 때.
        예전에는 브라우저 확인 창이었습니다 — 「그래도 만들까요?」 한 줄이라
        어느 거래처와 부딪히는지, 그쪽에 수거·청구가 얼마나 쌓였는지 알 수
        없었습니다. 대부분은 **이미 있는 그 거래처를 찾던 것**이므로 그리로
        가는 길을 가장 크게 둡니다.
      */}
      <Modal
        open={dupOf != null}
        title="이미 있는 거래처와 이름이 같습니다"
        onClose={() => setDupOf(null)}
        footer={
          <>
            <button className="btn-ghost flex-1" onClick={() => setDupOf(null)}>
              돌아가기
            </button>
            <button
              data-dup-force
              className="btn-ghost flex-1 text-rose-600"
              onClick={() => void commit(true)}
            >
              다른 병원입니다
            </button>
          </>
        }
      >
        <p className="t-body break-keep text-navy-700">
          「{form.name.trim()}」 (으)로 등록하려고 하는데, 아래 거래처와 이름이 사실상 같습니다. 같은 곳을 두 번
          만들면 <b>수거·청구·미수금이 둘로 갈리고 되돌릴 수 없습니다.</b>
        </p>
        <div data-dup-list className="mt-3 flex flex-col gap-2">
          {(dupOf ?? []).map(({ client: c, kind }) => {
            const done = data.schedules.filter((s) => s.clientId === c.id && s.status === '완료').length
            const billed = data.payments.filter((p) => p.clientId === c.id && p.status !== '취소').length
            const retiredNow = (data.retiredClients ?? []).some((r) => r.id === c.id)
            return (
              <button
                key={c.id}
                data-dup-open={c.id}
                className="card flex items-center justify-between gap-2 p-3.5 text-left hover:border-navy-300"
                onClick={() => {
                  setDupOf(null)
                  setAdding(false)
                  navigate(`/clients/${c.id}`)
                }}
              >
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <b className="text-navy-900">{c.name}</b>
                    {kind === 'similar' && <span className="pill bg-navy-50 text-navy-500">비슷한 이름</span>}
                    {retiredNow && <span className="pill bg-amber-100 text-amber-700">거래 종료</span>}
                  </span>
                  <span className="t-muted mt-0.5 block">
                    수거 {done}건 · 청구 {billed}건{c.address ? ` · ${c.address}` : ''}
                  </span>
                </span>
                <ChevronRight size={18} className="shrink-0 text-navy-300" />
              </button>
            )
          })}
        </div>
        <p className="t-muted mt-3 break-keep">
          찾던 곳이 위에 있으면 눌러서 그 거래처로 가세요. 상호는 같지만 정말 다른 병원이라면 「다른 병원입니다」를
          눌러 주세요 — 그렇게 만든 것은 기록에 남습니다.
        </p>
      </Modal>
    </div>
  )
}
